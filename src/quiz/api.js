// ============================================================
// QuizQuest JSON API
// ------------------------------------------------------------
// Plain node:http routing, same spirit as server.js. Every route
// declares which role may call it, and every handler re-checks that
// the user actually belongs to the class/course they are touching:
//   - teachers only see courses/classes they are assigned to
//   - students only see classes they are enrolled in
//   - students never receive answer keys before answering, nor drafts
//   - grading, coins and resources are computed here, never trusted
//     from clients
//
// The same "services" (grading, rewards, access checks) are handed to
// the multiplayer world (src/world/world.js), so there is exactly one
// code path that decides whether an answer is right and what it earns.
//
// DEMO AUTH: /api/login lets you pick a synthetic user with no
// password. That is for the prototype only - the real build would use
// Supabase Auth, with teacher status assigned by an admin.
// ============================================================

const crypto = require('crypto');
const { createStore } = require('./store');
const { validateQuestion } = require('./validate');
const { generate, GEN } = require('./generator');
const { ADAPTIVE, topicStats, planSession, similarToMissed } = require('./adaptive');
const { classAnalytics, courseComparison, questionInsights, parsePeriod, isValidTimeZone } = require('./analytics');
const { localIso, APP_TZ } = require('./time');
const { courseEvaluation } = require('./evaluation');
const { TYPES, TYPE_LABELS, studentView, newInstance, instantiate, gradeSync, isEmpty } = require('./formats');
const { grade } = require('./grading');
const { transcribe } = require('./vision');
const gemini = require('./gemini');
const { createAuthoring } = require('./authoring');
const { resolveTags, AI_DRAFT_FORMATS } = require('./assessment');
const T = require('./topics');
const R = require('./rewards');
const E = require('./economy');
const { SESSION_RESOURCES } = require('./seed');
const P = require('./passwords');

const BODY_LIMIT = 100 * 1024;     // bytes, default per request
const PASSAGE_LIMIT = 100000;      // characters per passage (PDF chapters)
const TOKEN_TTL = 8 * 3600 * 1000;
const SESSION_LENGTHS = [5, 8, 10, 15];
const TIMERS = [0, 30, 60, 90];    // seconds per question; 0 = untimed
const LOGIN_MAX_FAILS = 5;         // wrong passwords per email...
const LOGIN_LOCK_MS = 15 * 60 * 1000; // ...before it is locked for this long
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX = 60;               // longest display name a user may register
const ACCOMMODATION = [1, 1.5, 2];
const TIMER_GRACE_MS = 3000;       // network slack before the server calls time

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fail = (status, msg) => {
  throw new HttpError(status, msg);
};
const newId = (prefix) => prefix + '-' + crypto.randomUUID().slice(0, 8);
const str = (v, max, name) => {
  if (typeof v !== 'string' || !v.trim()) fail(400, `${name} is required.`);
  if (v.length > max) fail(400, `${name} is too long (max ${max} characters).`);
  return v.trim();
};

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'Request too large.'));
        chunks.length = 0; // drain the request so the client receives the JSON 413 response
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || typeof body !== 'object' || Array.isArray(body)) return reject(new HttpError(400, 'JSON body must be an object.'));
        resolve(body);
      } catch {
        reject(new HttpError(400, 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

// Seconds the professor spent in the editor, as reported by the browser.
// Clamped so a forgotten open tab can't distort the preparation-time metric.
const prepSeconds = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(3600, Math.round(v))) : 0);

// Spreadsheet apps execute cells that start with = + - @ ; neutralise them
const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// store: an already-loaded { db, save } (e.g. src/db/supabase-store.js);
// otherwise the JSON file store (dataFile = null keeps it in memory).
function createQuizApi({ dataFile = null, store = null, now = () => Date.now(), drafter = null, demoLogin = process.env.NODE_ENV !== 'production', authoringAI = null, authoringDrafter = null } = {}) {
  store = store || createStore(dataFile);
  const { db } = store;
  if (P.ensureDemoCredentials(db.users)) store.save();
  // Every change goes through save(), so counting saves tells us whether
  // the data has changed (used to cache dashboard numbers).
  let dataVersion = 0;
  const save = () => {
    dataVersion++;
    store.save();
  };
  const persist = async () => {
    save();
    await store.flush?.();
    if (store.pending?.()) fail(503, 'Your progress could not be saved. Check server storage and retry.');
  };
  const authoring = createAuthoring({ db, ai: authoringAI || undefined, drafter: authoringDrafter || undefined, persist });
  const tokens = new Map(); // token -> { userId, expires }
  const loginFails = new Map(); // email -> { count, until }
  const grading = new Set(); // "sessionId:index" answers currently being graded

  // ---------- lookups that double as access checks ----------
  // 404 (not 403) when the user isn't allowed, so ids of other classes
  // can't be probed for existence.
  const teacherCourse = (user, courseId) =>
    db.courses.find((c) => c.id === courseId && c.teacherIds.includes(user.id)) || fail(404, 'Not found.');
  const teacherClass = (user, classId) =>
    db.classes.find((c) => c.id === classId && c.teacherIds.includes(user.id)) || fail(404, 'Not found.');
  const teacherQuestion = (user, qid) => {
    const q = db.questions.find((x) => x.id === qid) || fail(404, 'Not found.');
    teacherCourse(user, q.courseId);
    return q;
  };
  const isEnrolled = (userId, classId) => db.enrolments.some((e) => e.classId === classId && e.studentId === userId);
  const studentClass = (user, classId) => {
    if (!isEnrolled(user.id, classId)) fail(404, 'Not found.');
    return db.classes.find((c) => c.id === classId);
  };
  const studentSession = (user, sid) => db.sessions.find((s) => s.id === sid && s.studentId === user.id) || fail(404, 'Not found.');

  // in week order, so every list and chart shows the course as it is taught
  const topicsOf = (courseId) => T.sortTopics(db.topics.filter((t) => t.courseId === courseId));
  const versionOf = (q, v) => q.versions.find((x) => x.v === v);
  // ?topic=<id> narrows dashboard data to one weekly topic of the course
  const topicFilter = (query, courseId) => {
    const id = query.get('topic');
    if (!id) return null;
    return topicsOf(courseId).some((t) => t.id === id) ? id : fail(400, 'Unknown topic.');
  };
  const passageRefs = (ids) =>
    ids.map((id) => {
      const p = db.passages.find((p) => p.id === id);
      return p ? { id, title: p.title } : { id, title: 'Source removed', removed: true };
    });
  const userName = (id) => db.users.find((u) => u.id === id)?.name || 'Unknown';

  function authenticate(token) {
    const sess = typeof token === 'string' && tokens.get(token);
    if (!sess || sess.expires < now()) return null;
    return db.users.find((u) => u.id === sess.userId) || null;
  }
  // What the browser may see of a user: never the password hash
  const publicUser = (u) => ({ id: u.id, name: u.name, role: u.role, email: u.email });

  // Shape a question for the teacher UI (full detail incl. answers)
  function teacherView(q) {
    const latest = q.versions.at(-1);
    const attempts = db.attempts.filter((a) => a.questionId === q.id);
    return {
      id: q.id,
      topicId: q.topicId,
      outcomeId: q.outcomeId,
      status: q.status,
      origin: q.origin,
      generationId: q.generationId,
      publishedVersion: q.publishedVersion,
      createdAt: q.createdAt,
      latest,
      typeLabel: TYPE_LABELS[latest.type || 'mcq'],
      sample: latest.type === 'param' ? instantiate(latest) : null,
      versions: q.versions.map((v) => ({
        v: v.v,
        editedAt: v.editedAt,
        publishedAt: v.publishedAt || null,
        attempts: attempts.filter((a) => a.version === v.v).length,
      })),
      sources: passageRefs(latest.sourceIds),
      // reports are shown without the reporter's identity
      reports: q.reports.map((r) => ({ id: r.id, reason: r.reason, at: r.at, resolved: r.resolved })),
    };
  }

  function checkQuestion(course, body, ignoreId) {
    const allowed = new Set(db.passages.filter((p) => p.courseId === course.id).map((p) => p.id));
    const existingStems = db.questions
      .filter((q) => q.courseId === course.id && q.status !== 'rejected')
      .map((q) => ({ id: q.id, stem: q.versions.at(-1).stem }));
    const original = ignoreId && db.questions.find((q) => q.id === ignoreId);
    const result = validateQuestion(body, { allowedSourceIds: allowed, requireSource: original?.origin === 'ai', existingStems, ignoreId });
    if (original?.origin === 'ai' && result.q.type === 'mcq' && result.q.options.length !== 4)
      result.errors.push('AI MCQs require exactly four options.');
    if (result.q.type === 'multi' && result.q.answerIndexes.length < 2 && (!original || original.versions.at(-1).type !== 'multi'))
      result.errors.push('Multi-select requires at least two correct options.');
    return result;
  }
  function checkOrFail(course, body, ignoreId) {
    const r = checkQuestion(course, body, ignoreId);
    if (r.errors.length) throw Object.assign(new HttpError(400, r.errors.join(' ')), { details: r.errors });
    return r;
  }

  function topicAndOutcome(course, topicId, outcomeId) {
    const topic = topicsOf(course.id).find((t) => t.id === topicId) || fail(400, 'Unknown topic.');
    const outcome = topic.outcomes.find((o) => o.id === outcomeId) || fail(400, 'Unknown learning outcome.');
    return { topic, outcome };
  }

  function questionTags(course, body) {
    try { return resolveTags(db, course, body); }
    catch (e) { if (e.status) fail(e.status, e.message); throw e; }
  }

  function wallet(studentId) {
    return { balance: R.balance(db, studentId), earnedToday: R.earnedOnDay(db, studentId, now()), dailyCap: R.REWARDS.dailyCap };
  }

  // ============================================================
  // SERVICES shared by HTTP routes and the multiplayer world
  // ============================================================

  // Grade one submission, record the attempt, pay first-correct coins
  // and milestones. The single source of truth for "was that right?".
  async function answerQuestion({ user, cls, q, v, instance, submission, servedAt, timerSec = 0, sessionId = null, context = 'practice' }) {
    const t = now();
    const ms = t - servedAt;
    const late = timerSec && ms > timerSec * 1000 + TIMER_GRACE_MS; // server calls time
    const blank = isEmpty(v, submission);
    // an empty submission is a timeout only when there IS a timer;
    // otherwise it is simply "no answer given"
    const timedOut = Boolean(late || (blank && timerSec));
    let g;
    if (late || blank) {
      g =
        v.type === 'short'
          ? {
              correct: false,
              score: 0,
              provisional: false,
              record: { text: '' },
              reveal: { modelAnswer: v.modelAnswer, keyPoints: v.keyPoints, coveredPoints: [] },
            }
          : { ...gradeSync(v, instance, {}), provisional: false };
    } else {
      g = await grade(v, instance, submission);
    }
    const first = !db.attempts.some((a) => a.studentId === user.id && a.questionId === q.id);
    const attempt = {
      id: newId('at'),
      sessionId,
      studentId: user.id,
      classId: cls.id,
      courseId: cls.courseId,
      questionId: q.id,
      version: v.v,
      topicId: q.topicId,
      type: v.type || 'mcq',
      ...g.record,
      correct: g.correct,
      score: g.score,
      ms,
      timedOut,
      first,
      context,
      at: t,
      needsReview: g.provisional,
      instance: instance ? { values: instance.values, options: instance.options, answerIndex: instance.answerIndex } : undefined,
    };
    db.attempts.push(attempt);

    const rewards = [];
    const pay = (amount, reason, refKey) => {
      const r = R.award(db, user.id, amount, reason, refKey, t);
      if (!r.duplicate) rewards.push({ reason, granted: r.granted, capped: r.capped });
      return r.granted;
    };
    let coins = 0;
    if (g.correct && !g.provisional) {
      // keyed per question (not per version or session) => no farming
      coins += pay(R.REWARDS.firstCorrect, 'Correct on a new question', `correct:${user.id}:${q.id}`);
      const topic = db.topics.find((x) => x.id === q.topicId);
      const st = topicStats(
        db.attempts.filter((a) => a.studentId === user.id && a.classId === cls.id),
        [topic],
      )[0];
      if (st.n >= R.REWARDS.milestoneMinN && st.accuracy >= R.REWARDS.milestoneAccuracy) {
        coins += pay(R.REWARDS.milestone, `Practice milestone: ${topic.name}`, `milestone:${user.id}:${cls.id}:${topic.id}`);
      }
    }
    const result = {
      correct: g.correct,
      score: g.score,
      provisional: g.provisional,
      timedOut,
      blank: blank && !timedOut,
      reveal: g.reveal,
      explanation: instance ? instance.explanation : v.explanation,
      sources: passageRefs(v.sourceIds),
      rewards,
    };
    return { attempt, result, coins };
  }

  // Close a practice session: completion coins, kingdom supplies and
  // (if the class opted in) a participation point - each paid once.
  function finishSession(s, user) {
    s.completedAt = now();
    const end = {};
    if (s.items.length >= R.REWARDS.minSessionForBonus) {
      const cls = db.classes.find((c) => c.id === s.classId);
      const r = R.award(db, user.id, R.REWARDS.sessionComplete, 'Completed a practice session', `session:${s.id}`, s.completedAt);
      s.coins += r.granted;
      if (!r.duplicate) end.bonus = { reason: 'Completed a practice session', granted: r.granted, capped: r.capped };
      end.resources = E.grantResources(
        db,
        user.id,
        SESSION_RESOURCES,
        'Completed a practice session',
        `sessionres:${s.id}`,
        s.completedAt,
      ).granted;
      end.participation = E.awardParticipation(db, { cls, studentId: user.id, session: s, now: s.completedAt });
    }
    s.endRewards = { resources: end.resources || null, participation: end.participation || null };
    return end;
  }

  // Pick a question for a world challenge: published, auto-gradable,
  // ~30% from the student's weaker topics (preferring questions similar
  // to ones they got wrong), the rest general, avoiding recent repeats.
  function pickChallenge(user, cls, rand = Math.random) {
    const topics = topicsOf(cls.courseId);
    const bank = db.questions.filter(
      (q) => q.courseId === cls.courseId && q.status === 'published' && versionOf(q, q.publishedVersion).type !== 'short',
    );
    if (!bank.length) return null;
    const mine = db.attempts.filter((a) => a.studentId === user.id && a.classId === cls.id);
    const recent = new Set(
      [...mine]
        .sort((a, b) => b.at - a.at)
        .slice(0, 10)
        .map((a) => a.questionId),
    );
    const allStats = topicStats(mine, topics);
    const stats = allStats
      .filter((s) => s.n >= ADAPTIVE.minPerTopic && s.accuracy < ADAPTIVE.weakBelow)
      .map((s) => s.topicId);
    let pool = bank.filter((q) => !recent.has(q.id));
    if (!pool.length) pool = bank;
    const weak = pool.filter((q) => stats.includes(q.topicId));
    if (weak.length && rand() < ADAPTIVE.weakShare) {
      const similar = similarToMissed(pool, allStats, stats);
      pool = similar.length ? similar : weak;
    }
    // a maths template can occasionally fail to make numbers: try another question
    for (let tries = 0; tries < 5; tries++) {
      const q = pool[Math.floor(rand() * pool.length)];
      const v = versionOf(q, q.publishedVersion);
      const instance = newInstance(v);
      if (v.type === 'param' && !instance) continue;
      return {
        q,
        v,
        instance,
        view: { ...studentView(v, instance), topic: db.topics.find((t) => t.id === q.topicId).name, questionId: q.id },
      };
    }
    return null;
  }

  const services = {
    db,
    save,
    now,
    authenticate,
    isEnrolled,
    answerQuestion,
    pickChallenge,
    classOf: (id) => db.classes.find((c) => c.id === id),
    grantResources: (studentId, bundle, reason, refKey) => E.grantResources(db, studentId, bundle, reason, refKey, now()),
    award: (studentId, amount, reason, refKey) => R.award(db, studentId, amount, reason, refKey, now()),
    look: (studentId) => {
      const inv = R.inventory(db, studentId);
      return { pet: R.PETS.find((p) => p.id === inv.equippedPet), item: R.ITEMS.find((i) => i.id === inv.equippedItem) || null };
    },
    userName,
    // current totals, so live views (the World) can refresh their badges
    balances: (studentId) => ({ wallet: wallet(studentId), resources: { ...E.resources(db, studentId) } }),
  };

  // ============================================================
  // ROUTES: [method, path, role ('any'|'teacher'|'student'|null=public), handler, {limit}]
  // ============================================================
  const routes = [];
  const route = (method, pattern, role, handler, opts = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([\\w.-]+)')) + '$');
    routes.push({ method, re, keys, role, handler, limit: opts.limit || BODY_LIMIT });
  };

  // ---------------- auth (demo) ----------------
  route('GET', '/api/demo-users', null, () => {
    if (!demoLogin) fail(404, 'Not found.');
    const label = (u) => {
      if (u.role === 'teacher') return db.classes.filter((c) => c.teacherIds.includes(u.id)).map((c) => c.name).join(', ');
      const cls = db.enrolments.filter((e) => e.studentId === u.id).map((e) => db.classes.find((c) => c.id === e.classId).name);
      const hist = db.attempts.some((a) => a.studentId === u.id);
      return cls.join(', ') + (hist ? '' : ' - no history yet');
    };
    return db.users.map((u) => ({ id: u.id, name: u.name, role: u.role, email: u.email, note: label(u) }));
  });

  // One error for a wrong email or a wrong password, so the form can't be
  // used to find out which emails have accounts
  function checkPassword(body) {
    const email = P.normEmail(body.email);
    if (!email || typeof body.password !== 'string' || !body.password) fail(400, 'Enter your email and password.');
    if (email.length > 254 || body.password.length > P.PASSWORD_MAX) fail(401, 'Email or password is incorrect.');
    const lock = loginFails.get(email);
    if (lock && lock.count >= LOGIN_MAX_FAILS && lock.until > now()) fail(429, 'Too many failed attempts. Try again in 15 minutes.');
    const user = db.users.find((u) => u.email === email);
    if (!P.verifyPassword(body.password, user ? user.passwordHash : P.dummyHash()) || !user) {
      const prev = lock && lock.until > now() ? lock.count : 0;
      loginFails.set(email, { count: prev + 1, until: now() + LOGIN_LOCK_MS });
      fail(401, 'Email or password is incorrect.');
    }
    loginFails.delete(email);
    return user;
  }

  function startSession(user) {
    for (const [t, s] of tokens) if (s.expires < now()) tokens.delete(t); // forget expired sessions
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, { userId: user.id, expires: now() + TOKEN_TTL });
    return { token, user: publicUser(user) };
  }

  route('POST', '/api/login', null, ({ body }) => {
    let user;
    if (body.userId !== undefined && demoLogin) user = db.users.find((u) => u.id === body.userId) || fail(400, 'Unknown demo user.');
    else user = checkPassword(body);
    return startSession(user);
  });

  // Self sign-up always makes a student. Teacher accounts are created by
  // the team (seed data / database), so nobody can promote themselves.
  route('POST', '/api/register', null, ({ body }) => {
    const name = str(body.name, NAME_MAX, 'Name');
    const email = P.normEmail(body.email);
    if (!EMAIL_RE.test(email) || email.length > 254) fail(400, 'Enter a valid email address.');
    if (typeof body.password !== 'string' || body.password.length < P.PASSWORD_MIN) fail(400, `Use a password of at least ${P.PASSWORD_MIN} characters.`);
    if (body.password.length > P.PASSWORD_MAX) fail(400, `Use a password of at most ${P.PASSWORD_MAX} characters.`);
    if (db.users.some((u) => u.email === email)) fail(409, 'An account with this email already exists. Sign in instead.');
    const user = { id: newId('s'), name, role: 'student', email, passwordHash: P.hashPassword(body.password), createdAt: now() };
    db.users.push(user);
    save({ analytics: false });
    return startSession(user);
  });

  route('POST', '/api/logout', 'any', ({ token }) => {
    tokens.delete(token);
    return { ok: true };
  });

  // ---------------- hero-lab AI test (shared Gemini client) ----------------
  route('POST', '/api/hero-lab/test-ai', 'teacher', async ({ body }) => {
    try {
      const r = await gemini.generateJson({
        prompt: String(body.prompt || 'Make one MCQ about AI. Return {"answer":"question with four options and explanation"}.').slice(
          0,
          4000,
        ),
        maxTokens: 2000,
      });
      return { ok: true, model: r.model, answer: JSON.stringify(r.json) };
    } catch {
      fail(502, 'The AI service could not finish. Try again later.');
    }
  });

  route('GET', '/api/me', 'any', ({ user }) => publicUser(user));

  // ---------------- teacher: courses & settings ----------------
  route('GET', '/api/teacher/courses', 'teacher', ({ user }) =>
    db.courses
      .filter((c) => c.teacherIds.includes(user.id))
      .map((c) => ({
        id: c.id,
        title: c.title,
        coverageTarget: c.coverageTarget,
        promptConfig: c.promptConfig || '',
        drafter: drafter
          ? 'Custom drafter'
          : gemini.enabled()
              ? `Gemini (${gemini.model()})`
              : 'Offline template drafter',
        authoringEnabled: gemini.enabled() || Boolean(authoringAI),
        geminiEnabled: gemini.enabled(),
        formats: {
          authoring: AI_DRAFT_FORMATS,
          all: TYPES,
          labels: TYPE_LABELS,
          drafter: drafter || gemini.enabled() ? GEN.aiFormats : GEN.templateFormats,
        },
        topics: topicsOf(c.id),
        classes: db.classes
          .filter((cl) => cl.courseId === c.id && cl.teacherIds.includes(user.id))
          .map((cl) => ({ id: cl.id, name: cl.name, settings: cl.settings })),
        drafts: db.questions.filter((q) => q.courseId === c.id && q.status === 'draft').length,
        openReports: db.questions.filter((q) => q.courseId === c.id).reduce((n, q) => n + q.reports.filter((r) => !r.resolved).length, 0),
      })),
  );

  route('PUT', '/api/teacher/courses/:cid/settings', 'teacher', ({ user, params, body }) => {
    const c = teacherCourse(user, params.cid);
    if (
      body.coverageTarget !== undefined &&
      (!Number.isInteger(body.coverageTarget) || body.coverageTarget < 1 || body.coverageTarget > 50)
    )
      fail(400, 'Coverage target must be 1-50.');
    if (body.promptConfig !== undefined) {
      if (typeof body.promptConfig !== 'string' || body.promptConfig.length > 1000)
        fail(400, 'Subject guidance must be under 1000 characters.');
      c.promptConfig = body.promptConfig.trim();
    }
    if (body.coverageTarget !== undefined) {
      if (!Number.isInteger(body.coverageTarget) || body.coverageTarget < 1 || body.coverageTarget > 50)
        fail(400, 'Coverage target must be 1-50.');
      c.coverageTarget = body.coverageTarget;
    }
    save();
    return { ok: true };
  });

  route('PUT', '/api/teacher/classes/:classId/settings', 'teacher', ({ user, params, body }) => {
    const cls = teacherClass(user, params.classId);
    // validate everything before changing anything
    if (body.timezone !== undefined && !isValidTimeZone(body.timezone)) fail(400, 'Unknown time zone.');
    if (typeof body.tradingEnabled === 'boolean') {
      cls.settings.tradingEnabled = body.tradingEnabled;
      if (!body.tradingEnabled) {
        // close the market: return everything held in escrow
        for (const t of db.trades.filter((x) => x.classId === cls.id && x.status === 'open'))
          E.cancelTrade(db, { trade: t, reason: 'Trading turned off by professor - refunded', now: now() });
      }
    }
    if (typeof body.participationEnabled === 'boolean') cls.settings.participation = { enabled: body.participationEnabled };
    // the time zone the dashboard uses for "today", days and weeks
    if (body.timezone !== undefined) cls.settings.timezone = body.timezone;
    save();
    return cls.settings;
  });

  route('GET', '/api/teacher/classes/:classId/trades', 'teacher', ({ user, params }) => {
    const cls = teacherClass(user, params.classId);
    return db.trades
      .filter((t) => t.classId === cls.id)
      .slice(-40)
      .reverse()
      .map((t) => ({ ...t, from: userName(t.fromId), acceptedByName: t.acceptedBy ? userName(t.acceptedBy) : null }));
  });

  // ---------------- teacher: content ----------------
  // Domain modules (authoring, topics) throw errors carrying an HTTP status.
  const statusReply = (fn) => async (ctx) => {
    try {
      return await fn(ctx);
    } catch (e) {
      if (e.status) fail(e.status, e.message);
      throw e;
    }
  };

  // ---------------- teacher: weekly topics ----------------
  // Topics belong to the course, so every class of the course shares them.
  const teacherTopic = (user, tid) => {
    const t = db.topics.find((x) => x.id === tid) || fail(404, 'Not found.');
    teacherCourse(user, t.courseId);
    return t;
  };
  route('GET', '/api/teacher/courses/:cid/topics', 'teacher', ({ user, params }) => T.topicSummary(db, teacherCourse(user, params.cid)));
  route(
    'POST',
    '/api/teacher/courses/:cid/topics',
    'teacher',
    statusReply(({ user, params, body }) => {
      const c = teacherCourse(user, params.cid);
      const name = T.parseName(body.name, topicsOf(c.id));
      const week = T.parseWeek(body.week) ?? null;
      const topic = { id: newId('tp'), courseId: c.id, name, outcomes: [], ...(week && { week }) };
      if (body.outcome !== undefined && body.outcome !== '') topic.outcomes.push({ id: newId('lo'), text: T.parseOutcome(body.outcome, topic) });
      db.topics.push(topic);
      save();
      return [201, topic];
    }),
  );
  route(
    'PUT',
    '/api/teacher/topics/:tid',
    'teacher',
    statusReply(({ user, params, body }) => {
      const t = teacherTopic(user, params.tid);
      // validate everything before changing anything
      const name = body.name === undefined ? t.name : T.parseName(body.name, topicsOf(t.courseId), t);
      const week = T.parseWeek(body.week);
      const outcome = body.addOutcome === undefined ? null : T.parseOutcome(body.addOutcome, t);
      t.name = name;
      if (week === null) delete t.week;
      else if (week !== undefined) t.week = week;
      if (outcome) t.outcomes.push({ id: newId('lo'), text: outcome });
      save();
      return t;
    }),
  );
  // Only a topic nothing refers to yet (no material, questions or answers)
  route('DELETE', '/api/teacher/topics/:tid', 'teacher', ({ user, params }) => {
    const t = teacherTopic(user, params.tid);
    const course = db.courses.find((c) => c.id === t.courseId);
    if (!T.topicSummary(db, course).topics.find((x) => x.topicId === t.id).empty)
      fail(409, 'This topic has material, questions or answers. Move or remove them first.');
    db.topics.splice(db.topics.indexOf(t), 1);
    save();
    return { ok: true };
  });

  route('GET', '/api/teacher/courses/:cid/authoring', 'teacher', ({ user, params }) =>
    authoring.jobs(teacherCourse(user, params.cid)).map(({ metrics, key, sourceDigest, _recovery, _validation, reportSnapshot, pendingBatch, _diagnostics, ...j }) => {
      const { parts, synthesis, ...result } = j.result;
      return { ...j, result: { ...result, partCount: parts?.length } };
    }),
  );
  route('GET', '/api/teacher/courses/:cid/authoring/:jid', 'teacher', ({ user, params }) => {
    const j = authoring.jobs(teacherCourse(user, params.cid)).find((j) => j.id === params.jid) || fail(404, 'Not found.');
    return { id: j.id, parts: j.result.parts || [] };
  });
  route(
    'POST',
    '/api/teacher/courses/:cid/authoring',
    'teacher',
    statusReply(async ({ user, params, body }) => {
      const j = authoring.start(teacherCourse(user, params.cid), body.kind, body, user.id);
      await persist();
      return [202, j];
    }),
  );
  route(
    'POST',
    '/api/teacher/courses/:cid/authoring/:jid/resume',
    'teacher',
    statusReply(async ({ user, params }) => {
      const j = authoring.resume(teacherCourse(user, params.cid), params.jid);
      await persist();
      return [202, j];
    }),
  );
  route(
    'PUT',
    '/api/teacher/courses/:cid/authoring/:jid/review',
    'teacher',
    statusReply(({ user, params, body }) => authoring.review(teacherCourse(user, params.cid), params.jid, body.markdown, body.reportRevision)),
    { limit: 300 * 1024 },
  );
  route(
    'POST',
    '/api/teacher/questions/:qid/regenerate',
    'teacher',
    statusReply(async ({ user, params }) => {
      const q = teacherQuestion(user, params.qid),
        c = teacherCourse(user, q.courseId);
      const j = authoring.regenerate(c, q, user.id);
      await persist();
      return [202, { id: j.id }];
    }),
  );

  // Sequential page uploads are bounded and idempotent after response loss.
  route(
    'POST',
    '/api/teacher/courses/:cid/import',
    'teacher',
    async ({ user, params, body }) => {
      const c = teacherCourse(user, params.cid);
      // Uploaded lecture files belong to a weekly topic (older uploads may
      // have none); a learning outcome is optional.
      const topic = body.topicId == null ? null : topicsOf(c.id).find((t) => t.id === body.topicId) || fail(400, 'Unknown topic.');
      const outcome = body.outcomeId == null ? null : topic?.outcomes.find((o) => o.id === body.outcomeId) || fail(400, 'Unknown learning outcome.');
      if (body.confirmNoPersonalData !== true) fail(400, 'Confirm that this is authorised course material without student personal data.');
      if (authoring.jobs(c).some((j) => ['queued', 'running'].includes(j.status))) fail(409, 'Wait for the current authoring job before changing files.');
      const title = str(body.title, 120, 'Title'),
        content = str(body.text, PASSAGE_LIMIT, 'Extracted text');
      const key = crypto
        .createHash('sha256')
        .update(JSON.stringify([topic?.id ?? null, outcome?.id ?? null, title, content]))
        .digest('hex');
      const fileName = typeof body.fileName === 'string' && body.fileName.trim() ? body.fileName.trim().slice(0, 255) : null;
      const documentId = typeof body.documentId === 'string' && /^[a-f0-9]{64}$/.test(body.documentId) ? body.documentId : null;
      const existing = db.passages.find((p) => p.courseId === c.id && p.importHash === key);
      if (existing) {
        // An unchanged excerpt re-uploaded as part of a new version of a file
        // joins that version, so the file is listed once.
        Object.assign(existing, { attached: true }, documentId && { documentId }, fileName && { fileName });
        await persist();
        return existing;
      }
      const p = {
        id: newId('p'),
        courseId: c.id,
        topicId: topic?.id ?? null,
        outcomeId: outcome?.id ?? null,
        title,
        text: content,
        origin: ['pdf', 'pptx', 'docx', 'text'].includes(body.origin) ? body.origin : 'text',
        importHash: key,
        attached: true,
        ...(fileName && { fileName }),
        ...(documentId && { documentId }),
        createdBy: user.id,
        createdAt: now(),
      };
      db.passages.push(p);
      await persist();
      return [201, p];
    },
    { limit: 500 * 1024 },
  );
  route('GET', '/api/teacher/courses/:cid/passages', 'teacher', ({ user, params }) => {
    const c = teacherCourse(user, params.cid);
    // One pass over the questions instead of one per passage.
    const usedBy = new Map();
    for (const q of db.questions) for (const id of new Set(q.versions.at(-1).sourceIds)) usedBy.set(id, (usedBy.get(id) || 0) + 1);
    return db.passages.filter((p) => p.courseId === c.id).map((p) => ({ ...p, usedBy: usedBy.get(p.id) || 0 }));
  });

  // Detach uploads without destroying sources referenced by reports/questions,
  // or move an uploaded file to another weekly topic ({ topicId }).
  route('PUT', '/api/teacher/courses/:cid/imports', 'teacher', async ({ user, params, body }) => {
    const c = teacherCourse(user, params.cid);
    if (authoring.jobs(c).some((j) => ['queued', 'running'].includes(j.status))) fail(409, 'Wait for the current authoring job before changing files.');
    const moving = body.topicId !== undefined;
    if (!Array.isArray(body.passageIds) || !body.passageIds.length || body.passageIds.length > 1000 || (!moving && body.attached !== false))
      fail(400, 'Choose uploaded file excerpts to remove or move.');
    const parts = body.passageIds.map((id) => db.passages.find((p) => p.id === id && p.courseId === c.id && p.importHash && p.origin !== 'report'));
    if (parts.some((p) => !p)) fail(404, 'Uploaded file not found.');
    if (!moving) {
      for (const p of parts) p.attached = false;
    } else {
      const topic = body.topicId === null ? null : topicsOf(c.id).find((t) => t.id === body.topicId) || fail(400, 'Unknown topic.');
      // the import key includes the topic, so re-uploading the file there stays idempotent
      const keyOf = (p) => crypto.createHash('sha256').update(JSON.stringify([topic?.id ?? null, null, p.title, p.text])).digest('hex');
      const ids = new Set(parts.map((p) => p.id));
      if (parts.some((p) => db.passages.some((x) => x.courseId === c.id && !ids.has(x.id) && x.importHash === keyOf(p))))
        fail(409, 'This file is already uploaded to that topic.');
      for (const p of parts) Object.assign(p, { topicId: topic?.id ?? null, outcomeId: null, importHash: keyOf(p) });
    }
    await persist();
    return { ok: true };
  });

  route(
    'POST',
    '/api/teacher/courses/:cid/passages',
    'teacher',
    ({ user, params, body }) => {
      const c = teacherCourse(user, params.cid);
      const { topic, outcome } = topicAndOutcome(c, body.topicId, body.outcomeId);
      if (body.confirmNoPersonalData !== true) fail(400, 'Please confirm the material contains no student personal data.');
      const origin = ['paste', 'pdf', 'scan', 'diagram'].includes(body.origin) ? body.origin : 'paste';
      const p = {
        id: newId('p'),
        courseId: c.id,
        topicId: topic.id,
        outcomeId: outcome.id,
        title: str(body.title, 120, 'Title'),
        text: str(body.text, PASSAGE_LIMIT, 'Passage text'),
        origin,
        createdBy: user.id,
        createdAt: now(),
      };
      db.passages.push(p);
      save();
      return [201, p];
    },
    { limit: 400 * 1024 },
  );

  // Scanned page / diagram -> suggested text (not saved until the professor confirms)
  route(
    'POST',
    '/api/teacher/courses/:cid/transcribe',
    'teacher',
    async ({ user, params, body }) => {
      teacherCourse(user, params.cid);
      const r = await transcribe({ imageBase64: body.imageBase64, mimeType: body.mimeType, mode: body.mode });
      return [r.status, r.body];
    },
    { limit: 6 * 1024 * 1024 },
  );

  // Deletion supports the "material retention" policy the team will set.
  // Questions keep their sourceIds; the UI then shows "source removed".
  route('DELETE', '/api/teacher/passages/:pid', 'teacher', ({ user, params }) => {
    const p = db.passages.find((x) => x.id === params.pid) || fail(404, 'Not found.');
    teacherCourse(user, p.courseId);
    if (p.origin === 'report') fail(409, 'Saved report versions are retained for question history. Edit the report in AI drafting.');
    db.passages.splice(db.passages.indexOf(p), 1);
    save();
    return { ok: true };
  });

  // ---------------- teacher: question bank ----------------
  route('GET', '/api/teacher/courses/:cid/questions', 'teacher', ({ user, params }) => {
    const c = teacherCourse(user, params.cid);
    return db.questions.filter((q) => q.courseId === c.id).map(teacherView);
  });

  // Dry run: validate without saving (editor "Check" button, maths previews)
  route('POST', '/api/teacher/courses/:cid/questions/check', 'teacher', ({ user, params, body }) => {
    const c = teacherCourse(user, params.cid);
    const r = checkQuestion(c, body, body.id || null);
    return { errors: r.errors, warnings: r.warnings, samples: r.samples };
  });

  route('POST', '/api/teacher/courses/:cid/questions', 'teacher', ({ user, params, body }) => {
    const c = teacherCourse(user, params.cid);
    if (!AI_DRAFT_FORMATS.includes(body.type || 'mcq')) fail(400, 'New questions support MCQ, True/False, Short Answer and Multi-select.');
    const tags = questionTags(c, body);
    const { topic, outcome } = tags;
    const { q, warnings } = checkOrFail(c, body, null);
    const t = now();
    const publish = body.publish === true;
    const question = {
      id: newId('q'),
      courseId: c.id,
      topicId: topic.id,
      outcomeId: outcome.id,
      status: publish ? 'published' : 'draft',
      origin: 'manual',
      generationId: null,
      createdAt: t,
      createdBy: user.id,
      publishedVersion: publish ? 1 : null,
      reports: [],
      editCount: 0,
      prepSeconds: prepSeconds(body.prepSeconds),
      reviewedAt: publish ? t : null,
      reviewedBy: publish ? user.id : null,
      versions: [{ v: 1, ...q, warnings, editedAt: t, editedBy: user.id, publishedAt: publish ? t : null }],
    };
    tags.commit();
    db.questions.push(question);
    save();
    return [201, teacherView(question)];
  });

  // Edit. Once a version has been published or answered it is frozen,
  // and edits create a NEW version - so old attempts stay interpretable
  // against the text the student actually saw.
  route('PUT', '/api/teacher/questions/:qid', 'teacher', ({ user, params, body }) => {
    const q = teacherQuestion(user, params.qid);
    const c = db.courses.find((x) => x.id === q.courseId);
    if (!AI_DRAFT_FORMATS.includes(body.type) && body.type !== q.versions.at(-1).type) fail(400, 'Choose a supported question type.');
    const tags = questionTags(c, {...body, topicId:body.topicId ?? q.topicId, outcomeId:body.outcomeId ?? q.outcomeId});
    const { topic, outcome } = tags;
    const frozenTags = q.versions.some((v) => v.publishedAt != null) || db.attempts.some((a) => a.questionId === q.id);
    if (frozenTags && (topic.id !== q.topicId || outcome.id !== q.outcomeId))
      fail(409, 'Published question tags are fixed to preserve history. Create a new question for a different learning outcome.');
    const { q: clean, warnings } = checkOrFail(c, body, q.id);
    tags.commit();
    q.topicId = topic.id;
    q.outcomeId = outcome.id;
    if (q.assessment) q.assessment = {...q.assessment, topic:topic.name, learningOutcome:outcome.text};
    const latest = q.versions.at(-1);
    const t = now();
    const answered = db.attempts.some((a) => a.questionId === q.id && a.version === latest.v);
    if (latest.publishedAt || answered) {
      const v = { v: latest.v + 1, ...clean, warnings, editedAt: t, editedBy: user.id, publishedAt: q.status === 'published' ? t : null };
      q.versions.push(v);
      if (q.status === 'published') q.publishedVersion = v.v;
    } else {
      // replace the unpublished draft in place (drop old type-specific fields)
      q.versions[q.versions.length - 1] = { v: latest.v, ...clean, warnings, editedAt: t, editedBy: user.id };
    }
    if (q.status === 'draft') q.editCount = (q.editCount || 0) + 1; // "edited before approval" metric
    q.prepSeconds = (q.prepSeconds || 0) + prepSeconds(body.prepSeconds);
    save();
    return teacherView(q);
  });

  route('POST', '/api/teacher/questions/:qid/status', 'teacher', ({ user, params, body }) => {
    const q = teacherQuestion(user, params.qid);
    const latest = q.versions.at(-1);
    const t = now();
    const allowed = { approve: ['draft', 'rejected'], reject: ['draft'], withdraw: ['published'], republish: ['withdrawn'] };
    if (typeof body.action !== 'string' || !Object.hasOwn(allowed, body.action)) fail(400, 'Unknown action.');
    if (!allowed[body.action].includes(q.status)) fail(409, `Cannot ${body.action} a ${q.status} question.`);
    if (body.action === 'approve' || body.action === 'republish') {
      // re-run the structural checks on what is about to go live
      checkOrFail(
        db.courses.find((x) => x.id === q.courseId),
        latest,
        q.id,
      );
      latest.publishedAt = latest.publishedAt || t;
      q.publishedVersion = latest.v;
      q.status = 'published';
    } else if (body.action === 'reject') {
      q.status = 'rejected';
    } else {
      q.status = 'withdrawn';
    }
    if (body.action === 'approve' || body.action === 'reject') {
      q.reviewedBy = user.id;
      q.reviewedAt = t;
    }
    q.prepSeconds = (q.prepSeconds || 0) + prepSeconds(body.prepSeconds);
    save();
    return teacherView(q);
  });

  route('POST', '/api/teacher/questions/:qid/reports/:rid/resolve', 'teacher', ({ user, params }) => {
    const q = teacherQuestion(user, params.qid);
    const r = q.reports.find((x) => x.id === params.rid) || fail(404, 'Not found.');
    r.resolved = true;
    r.resolvedAt = now();
    save();
    return teacherView(q);
  });

  // ---------------- teacher: marking free-response answers ----------------
  // ?topic=<id>: only answers to that weekly topic's questions (dashboard filter)
  route('GET', '/api/teacher/classes/:classId/marking', 'teacher', ({ user, params, query }) => {
    const cls = teacherClass(user, params.classId);
    const topicId = topicFilter(query, cls.courseId);
    return db.attempts
      .filter((a) => a.classId === cls.id && a.needsReview && (!topicId || a.topicId === topicId))
      .slice(-50)
      .reverse()
      .map((a) => {
        const q = db.questions.find((x) => x.id === a.questionId);
        const v = versionOf(q, a.version);
        // the answer text is shown without the student's identity
        return {
          attemptId: a.id,
          at: a.at,
          topicId: a.topicId,
          stem: v.stem,
          modelAnswer: v.modelAnswer,
          keyPoints: v.keyPoints,
          text: a.text,
          coveredPoints: a.coveredPoints || [],
          method: a.method,
          autoCorrect: a.correct,
          score: a.score,
        };
      });
  });

  route('POST', '/api/teacher/attempts/:aid/mark', 'teacher', ({ user, params, body }) => {
    const a = db.attempts.find((x) => x.id === params.aid) || fail(404, 'Not found.');
    teacherClass(user, a.classId);
    if (typeof body.correct !== 'boolean') fail(400, 'Choose correct or not correct.');
    if (a.type !== 'short') fail(400, 'Only short answers can be manually marked.');
    a.correct = body.correct;
    a.score = body.correct ? 1 : 0;
    a.needsReview = false;
    a.markedBy = user.id;
    a.markedAt = now();
    let paid = 0;
    if (a.correct)
      paid = R.award(
        db,
        a.studentId,
        R.REWARDS.firstCorrect,
        'Correct on a new question (marked by professor)',
        `correct:${a.studentId}:${a.questionId}`,
        now(),
      ).granted;
    const session = db.sessions.find((s) => s.id === a.sessionId);
    const item = session?.items.find((it) => it.qid === a.questionId && it.v === a.version && it.result);
    if (item) {
      Object.assign(item.result, { correct: a.correct, score: a.score, provisional: false, markedAt: a.markedAt });
      item.result.attack = null; // a later mark is not another live attack
      session.coins += paid;
      session.npc.hp = Math.max(0, session.npc.maxHp - 10 * session.items.filter((it) => it.result?.correct).length);
      item.result.npc = { ...session.npc };
      if (paid) item.result.rewards.push({ reason: 'Confirmed by professor', granted: paid, capped: false });
    }
    save();
    return { ok: true, paid };
  });

  // ---------------- teacher: generation ----------------
  route('GET', '/api/teacher/courses/:cid/coverage', 'teacher', ({ user, params }) => {
    const c = teacherCourse(user, params.cid);
    const qs = db.questions.filter((q) => q.courseId === c.id);
    return topicsOf(c.id).flatMap((t) =>
      t.outcomes.map((o) => {
        const mine = qs.filter((q) => q.outcomeId === o.id);
        const published = mine.filter((q) => q.status === 'published').length;
        return {
          topicId: t.id,
          topic: t.name,
          outcomeId: o.id,
          outcome: o.text,
          published,
          drafts: mine.filter((q) => q.status === 'draft').length,
          passages: db.passages.filter((p) => p.outcomeId === o.id).length,
          target: c.coverageTarget,
          gap: Math.max(0, c.coverageTarget - published),
        };
      }),
    );
  });

  route('POST', '/api/teacher/courses/:cid/generate', 'teacher', async ({ user, params, body }) => {
    const c = teacherCourse(user, params.cid);
    let tags;
    try { tags=resolveTags(db,c,body); } catch(e) { if(e.status) fail(e.status,e.message); throw e; }
    const {topic,outcome}=tags;
    tags.commit();
    const r = await generate({
      db,
      course: c,
      topic,
      outcome,
      count: body.count,
      format: body.format,
      focus: body.focus,
      force: body.force === true,
      userId: user.id,
      now: now(),
      drafter,
      checkpoint: persist,
    });
    save();
    return [r.status, r.body];
  });

  route('GET', '/api/teacher/courses/:cid/generations', 'teacher', ({ user, params }) => {
    const c = teacherCourse(user, params.cid);
    return db.generationLog
      .filter((g) => g.courseId === c.id)
      .slice(-15)
      .reverse()
      .map(({ rawOutput, hash, ...g }) => g); // eslint-disable-line no-unused-vars
  });

  // ---------------- teacher: analytics & evaluation ----------------
  // Dashboard numbers are cached briefly per class + period: with
  // auto-refresh every 30 s, an unchanged class costs nothing to re-serve.
  // Any save() (new answer, mark, edit...) or 60 s passing refreshes it.
  const ANALYTICS_TTL = 60000;
  const analyticsCache = new Map();
  const period = (query) => {
    const p = parsePeriod((k) => query.get(k));
    if (p.error) fail(400, p.error);
    return p;
  };
  route('GET', '/api/teacher/classes/:classId/analytics', 'teacher', ({ user, params, query }) => {
    const cls = teacherClass(user, params.classId);
    const p = { ...period(query), topicId: topicFilter(query, cls.courseId) };
    const key = `${params.classId}|${p.range}|${p.from || ''}|${p.to || ''}|${p.topicId || ''}`;
    const hit = analyticsCache.get(key);
    if (hit && hit.version === dataVersion && now() - hit.at < ANALYTICS_TTL) return hit.value;
    const value = classAnalytics(db, params.classId, now(), p);
    if (analyticsCache.size > 200) analyticsCache.clear(); // bounded: a few entries per class
    analyticsCache.set(key, { version: dataVersion, at: now(), value });
    return value;
  });

  // One question in detail (dashboard drill-down), for this class's answers
  route('GET', '/api/teacher/classes/:classId/questions/:qid/insights', 'teacher', ({ user, params, query }) => {
    teacherClass(user, params.classId);
    return questionInsights(db, params.classId, params.qid, now(), period(query)) || fail(404, 'Not found.');
  });

  // The professor's classes of one course side by side (no student names)
  route('GET', '/api/teacher/courses/:cid/compare', 'teacher', ({ user, params, query }) => {
    const c = teacherCourse(user, params.cid);
    const ids = db.classes.filter((cl) => cl.courseId === c.id && cl.teacherIds.includes(user.id)).map((cl) => cl.id);
    return courseComparison(db, ids, now(), { ...period(query), topicId: topicFilter(query, c.id) });
  });

  route('GET', '/api/teacher/classes/:classId/participation.csv', 'teacher', ({ user, params }) => {
    const cls = teacherClass(user, params.classId);
    if (!cls.settings.participation?.enabled) fail(409, 'Participation points are not enabled for this class.');
    const rows = [['student', 'points', 'week', 'awarded_at']];
    for (const p of db.participation.filter((x) => x.classId === cls.id))
      rows.push([userName(p.studentId), 1, p.week, localIso(p.at, isValidTimeZone(cls.settings.timezone) ? cls.settings.timezone : APP_TZ)]);
    return {
      __raw: rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n',
      contentType: 'text/csv; charset=utf-8',
      filename: `participation-${cls.id}.csv`,
    };
  });

  route('GET', '/api/teacher/courses/:cid/evaluation', 'teacher', ({ user, params }) => {
    const c = teacherCourse(user, params.cid);
    return courseEvaluation(db, c.id);
  });

  // ---------------- student: home & progress ----------------
  route('GET', '/api/student/home', 'student', ({ user }) => {
    const classes = db.enrolments
      .filter((e) => e.studentId === user.id)
      .map((e) => {
        const cl = db.classes.find((c) => c.id === e.classId);
        return {
          id: cl.id,
          name: cl.name,
          course: db.courses.find((c) => c.id === cl.courseId).title,
          tradingEnabled: cl.settings.tradingEnabled,
          participation: cl.settings.participation?.enabled
            ? {
                points: db.participation.filter((p) => p.classId === cl.id && p.studentId === user.id).length,
                weeklyCap: E.PARTICIPATION.weeklyCap,
              }
            : null,
        };
      });
    return {
      classes,
      resumable: classes
        .map((cl) => {
          const s = db.sessions.findLast((s) => s.studentId === user.id && s.classId === cl.id && !s.completedAt);
          return s ? { id: s.id, classId: cl.id, answered: s.cursor, total: s.items.length } : null;
        })
        .filter(Boolean),
      wallet: wallet(user.id),
      inventory: R.inventory(db, user.id),
      catalog: {
        pets: R.PETS,
        items: R.ITEMS,
        eggCost: R.REWARDS.eggCost,
        eggOdds: R.EGG_ODDS,
        duplicateRefund: R.REWARDS.duplicateRefund,
        resources: E.RESOURCES,
      },
      rules: R.REWARDS,
      options: { lengths: SESSION_LENGTHS, timers: TIMERS, accommodation: ACCOMMODATION },
    };
  });

  route('GET', '/api/student/classes/:classId/progress', 'student', ({ user, params }) => {
    const cl = studentClass(user, params.classId);
    const topics = topicsOf(cl.courseId);
    const mine = db.attempts.filter((a) => a.studentId === user.id && a.classId === cl.id);
    const bank = db.questions.filter((q) => q.courseId === cl.courseId && q.status === 'published');
    const sessions = db.sessions
      .filter((s) => s.studentId === user.id && s.classId === cl.id && s.completedAt)
      .slice(-5)
      .reverse()
      .map((s) => ({ id: s.id, at: s.completedAt, total: s.items.length, correct: s.items.filter((i) => i.result?.correct).length }));
    return {
      topics: topicStats(mine, topics).map((s) => ({ ...s, bank: bank.filter((q) => q.topicId === s.topicId).length })),
      window: ADAPTIVE.recentWindow,
      sessions,
      awaitingMarking: mine.filter((a) => a.needsReview).length,
    };
  });

  // ---------------- student: practice sessions ----------------
  route('POST', '/api/student/sessions', 'student', ({ user, body }) => {
    const cl = studentClass(user, body.classId);
    if (!SESSION_LENGTHS.includes(body.length)) fail(400, 'Pick a session length from the list.');
    if (!TIMERS.includes(body.timerSec)) fail(400, 'Pick a timer from the list.');
    const mult = ACCOMMODATION.includes(body.accommodation) ? body.accommodation : 1;
    const topics = topicsOf(cl.courseId);
    const bank = db.questions.filter((q) => q.courseId === cl.courseId && q.status === 'published');
    if (!bank.length) fail(409, 'There are no published questions for this class yet.');
    const mine = db.attempts.filter((a) => a.studentId === user.id && a.classId === cl.id);
    const recentIds = [...mine].sort((a, b) => b.at - a.at).map((a) => a.questionId);
    const plan = planSession({ bank, topics, stats: topicStats(mine, topics), recentIds, length: body.length });
    const npcHp = Math.max(1, Math.ceil(plan.questionIds.length * 0.6)) * 10;
    const session = {
      id: newId('ses'),
      studentId: user.id,
      classId: cl.id,
      courseId: cl.courseId,
      createdAt: now(),
      timerSec: Math.round(body.timerSec * mult),
      mode: plan.mode,
      plan: { weakTopicIds: plan.weakTopicIds, notes: plan.notes },
      items: plan.questionIds.map((qid) => ({
        qid,
        v: db.questions.find((q) => q.id === qid).publishedVersion,
        servedAt: null,
        instance: null,
        result: null,
      })),
      cursor: 0,
      npc: { name: 'Fog of Confusion', emoji: '👾', maxHp: npcHp, hp: npcHp },
      coins: 0,
      completedAt: null,
    };
    db.sessions.push(session);
    save();
    return [201, { id: session.id }];
  });

  // Current state + the next question WITHOUT its answer
  route('GET', '/api/student/sessions/:sid', 'student', ({ user, params }) => {
    const s = studentSession(user, params.sid);
    if (!s.completedAt) {
      // A professor may withdraw a question after this session was planned:
      // drop it (only if not yet shown) rather than serve it.
      const before = s.items.length;
      s.items = s.items.filter((it, i) => i < s.cursor || it.servedAt || db.questions.find((q) => q.id === it.qid)?.status === 'published');
      if (s.items.length !== before) {
        if (!s.plan.notes.some((n) => n.includes('withdrawn')))
          s.plan.notes.push('A question was withdrawn by your professor during this session, so it was skipped.');
        if (s.cursor >= s.items.length) finishSession(s, user);
        save();
      }
    }
    // Prepare the current item (first view only). A maths template may
    // fail to produce usable numbers; skip it rather than leave the
    // session stuck on a broken question.
    if (!s.completedAt && s.cursor >= s.items.length) finishSession(s, user); // defensive: nothing left
    while (!s.completedAt && !s.items[s.cursor].servedAt) {
      const it = s.items[s.cursor];
      const iv = versionOf(
        db.questions.find((x) => x.id === it.qid),
        it.v,
      );
      it.instance = newInstance(iv); // maths variations get fresh numbers
      if (iv.type === 'param' && !it.instance) {
        s.items.splice(s.cursor, 1);
        s.plan.notes.push('A maths question could not be generated and was skipped.');
        if (s.cursor >= s.items.length) finishSession(s, user);
      } else {
        it.servedAt = now(); // response time is measured on the server
      }
      save();
    }
    const out = {
      id: s.id,
      total: s.items.length,
      cursor: s.cursor,
      npc: s.npc,
      timerSec: s.timerSec,
      mode: s.mode,
      notes: s.plan.notes,
      done: !!s.completedAt,
      coins: s.coins,
    };
    if (s.completedAt) return out;
    const item = s.items[s.cursor];
    const q = db.questions.find((x) => x.id === item.qid);
    const v = versionOf(q, item.v);
    out.question = {
      ...studentView(v, item.instance),
      index: s.cursor,
      questionId: q.id,
      topic: db.topics.find((t) => t.id === q.topicId).name,
      remainingMs: s.timerSec ? Math.max(0, s.timerSec * 1000 - (now() - item.servedAt)) : null,
    };
    return out;
  });

  route('POST', '/api/student/sessions/:sid/answer', 'student', async ({ user, params, body }) => {
    const s = studentSession(user, params.sid);
    const index = body.index;
    if (!Number.isInteger(index) || index < 0 || index >= s.items.length) fail(400, 'Bad question index.');
    const item = s.items[index];
    // Duplicate submit (double click, retry after a network blip): return
    // the stored outcome and pay nothing new.
    if (item.result) return { ...item.result, duplicate: true };
    // Guard against a second submit while an AI grade is in flight. Kept in
    // memory (not on the saved session) so a restart can't leave it stuck.
    const lock = `${s.id}:${index}`;
    if (index !== s.cursor || !item.servedAt || grading.has(lock)) fail(409, 'That question is not the current one.');
    grading.add(lock);
    const q = db.questions.find((x) => x.id === item.qid);
    const v = versionOf(q, item.v);
    const cls = db.classes.find((c) => c.id === s.classId);
    let out;
    try {
      out = await answerQuestion({
        user,
        cls,
        q,
        v,
        instance: item.instance,
        submission: body,
        servedAt: item.servedAt,
        timerSec: s.timerSec,
        sessionId: s.id,
        context: 'practice',
      });
    } finally {
      grading.delete(lock);
    }
    s.coins += out.coins;
    if (out.result.correct) s.npc.hp = Math.max(0, s.npc.hp - 10);
    s.cursor++;
    let extras = {};
    if (s.cursor >= s.items.length) {
      extras = finishSession(s, user);
      if (extras.bonus) out.result.rewards.push(extras.bonus);
    }
    const inv = R.inventory(db, user.id);
    const pet = R.PETS.find((p) => p.id === inv.equippedPet);
    item.result = {
      index,
      ...out.result,
      npc: { ...s.npc },
      attack: out.result.correct ? { pet: pet.emoji, move: pet.move, damage: 10 } : null,
      done: !!s.completedAt,
      resources: extras.resources,
      participation: extras.participation,
    };
    save();
    return item.result;
  });

  route('GET', '/api/student/sessions/:sid/summary', 'student', ({ user, params }) => {
    const s = studentSession(user, params.sid);
    if (!s.completedAt) fail(409, 'Session not finished yet.');
    const byTopic = {};
    for (const it of s.items) {
      const q = db.questions.find((x) => x.id === it.qid);
      const name = db.topics.find((t) => t.id === q.topicId).name;
      byTopic[name] = byTopic[name] || { n: 0, correct: 0 };
      byTopic[name].n++;
      if (it.result.correct) byTopic[name].correct++;
    }
    const end = s.endRewards || {};
    return {
      total: s.items.length,
      correct: s.items.filter((i) => i.result.correct).length,
      coins: s.coins,
      npc: s.npc,
      byTopic,
      notes: s.plan.notes,
      wallet: wallet(user.id),
      resources: end.resources || null,
      participation: end.participation || null,
      provisional: s.items.filter((i) => i.result.provisional).length,
      feedbackGiven: !!s.feedback,
    };
  });

  // Usability survey: one 3-point rating (+ optional comment) per session
  route('POST', '/api/student/sessions/:sid/feedback', 'student', ({ user, params, body }) => {
    const s = studentSession(user, params.sid);
    if (!s.completedAt) fail(409, 'Finish the session first.');
    if (s.feedback) return { ok: true, already: true };
    if (![1, 2, 3].includes(body.rating)) fail(400, 'Pick a rating.');
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 300) : '';
    s.feedback = { rating: body.rating, comment, at: now() };
    save();
    return { ok: true };
  });

  route('POST', '/api/student/questions/:qid/report', 'student', ({ user, params, body }) => {
    const q = db.questions.find((x) => x.id === params.qid) || fail(404, 'Not found.');
    // only questions this student has actually answered can be reported
    if (!db.attempts.some((a) => a.studentId === user.id && a.questionId === q.id)) fail(404, 'Not found.');
    if (q.reports.some((r) => r.studentId === user.id && !r.resolved)) return { ok: true, already: true };
    q.reports.push({ id: newId('r'), studentId: user.id, reason: str(body.reason, 300, 'Reason'), at: now(), resolved: false });
    save();
    return { ok: true };
  });

  // ---------------- student: pets & shop ----------------
  const requestId = (v) => (typeof v === 'string' && /^[\w-]{8,64}$/.test(v) ? v : fail(400, 'Missing request id.'));

  route('POST', '/api/student/shop/buy', 'student', ({ user, body }) => {
    const rid = requestId(body.requestId);
    const inv = R.inventory(db, user.id);
    const pet = R.PETS.find((p) => p.id === body.itemId && p.price);
    const item = R.ITEMS.find((i) => i.id === body.itemId);
    const thing = pet || item || fail(400, 'That item is not for sale.');
    const refKey = `buy:${user.id}:${rid}`;
    const owned = pet ? inv.pets.some((p) => p.id === pet.id) : inv.items.includes(item.id);
    if (owned && !db.ledger.some((t) => t.refKey === refKey)) fail(409, 'You already own that.');
    const r = R.spend(db, user.id, thing.price, `Bought ${thing.name}`, refKey, now());
    if (!r.ok) fail(400, r.error);
    if (!r.duplicate) {
      if (pet) inv.pets.push({ id: pet.id, dupes: 0 });
      else inv.items.push(item.id);
    }
    save();
    return { inventory: inv, wallet: wallet(user.id) };
  });

  route('POST', '/api/student/shop/egg', 'student', ({ user, body }) => {
    const rid = requestId(body.requestId);
    const refKey = `egg:${user.id}:${rid}`;
    const prev = db.ledger.find((t) => t.refKey === refKey);
    if (prev)
      return {
        pet: R.PETS.find((p) => p.id === prev.meta.petId),
        duplicatePet: prev.meta.dupe,
        inventory: R.inventory(db, user.id),
        wallet: wallet(user.id),
        repeat: true,
      };
    const r = R.spend(db, user.id, R.REWARDS.eggCost, 'Opened an egg', refKey, now());
    if (!r.ok) fail(400, r.error);
    const pet = R.drawPet();
    const inv = R.inventory(db, user.id);
    const owned = inv.pets.find((p) => p.id === pet.id);
    if (owned) {
      owned.dupes++;
      db.ledger.push({
        id: newId('tx'),
        studentId: user.id,
        kind: 'refund',
        amount: R.REWARDS.duplicateRefund,
        reason: `Duplicate ${pet.name} refund`,
        refKey: refKey + ':refund',
        at: now(),
      });
    } else {
      inv.pets.push({ id: pet.id, dupes: 0 });
    }
    db.ledger.find((t) => t.refKey === refKey).meta = { petId: pet.id, dupe: !!owned };
    save();
    return { pet, duplicatePet: !!owned, inventory: inv, wallet: wallet(user.id) };
  });

  route('POST', '/api/student/equip', 'student', ({ user, body }) => {
    const inv = R.inventory(db, user.id);
    if (body.itemId !== undefined && body.itemId !== null && !inv.items.includes(body.itemId)) fail(400, 'You do not own that item.');
    if (body.petId !== undefined) {
      if (!inv.pets.some((p) => p.id === body.petId)) fail(400, 'You do not own that pet.');
      inv.equippedPet = body.petId;
    }
    if (body.itemId !== undefined) {
      if (body.itemId !== null && !inv.items.includes(body.itemId)) fail(400, 'You do not own that item.');
      inv.equippedItem = body.itemId;
    }
    save();
    return inv;
  });

  route('GET', '/api/student/ledger', 'student', ({ user }) => ({
    coins: db.ledger
      .filter((t) => t.studentId === user.id)
      .slice(-30)
      .reverse()
      .map(({ refKey, meta, ...t }) => t), // eslint-disable-line no-unused-vars
    resources: db.resourceLog
      .filter((t) => t.studentId === user.id)
      .slice(-30)
      .reverse()
      .map(({ refKey, ...t }) => t), // eslint-disable-line no-unused-vars
  }));

  // ---------------- student: kingdom ----------------
  route('GET', '/api/student/kingdom', 'student', ({ user }) => {
    const k = E.kingdom(db, user.id);
    return {
      buildings: k.buildings,
      castleLevel: E.castleLevel(k),
      resources: E.resources(db, user.id),
      earnedToday: E.earnedToday(db, user.id, now()),
      dailyCap: E.RESOURCE_DAILY_CAP,
      catalog: { buildings: E.BUILDINGS, resources: E.RESOURCES },
    };
  });

  route('POST', '/api/student/kingdom/build', 'student', ({ user, body }) => {
    const r = E.build(db, user.id, body.building, requestId(body.requestId), now());
    if (!r.ok) fail(400, r.error);
    save();
    return { buildings: r.kingdom.buildings, castleLevel: E.castleLevel(r.kingdom), resources: E.resources(db, user.id) };
  });

  // ---------------- student: trading ----------------
  route('GET', '/api/student/classes/:classId/trades', 'student', ({ user, params }) => {
    const cls = studentClass(user, params.classId);
    const list = db.trades.filter((t) => t.classId === cls.id);
    const view = (t) => ({
      id: t.id,
      give: t.give,
      want: t.want,
      status: t.status,
      createdAt: t.createdAt,
      acceptedAt: t.acceptedAt || null,
      from: t.fromId === user.id ? 'You' : userName(t.fromId),
      mine: t.fromId === user.id,
      iAccepted: t.acceptedBy === user.id,
    });
    return {
      enabled: cls.settings.tradingEnabled,
      limits: E.TRADE,
      resources: E.resources(db, user.id),
      market: list.filter((t) => t.status === 'open' && t.fromId !== user.id).map(view),
      mine: list.filter((t) => t.status === 'open' && t.fromId === user.id).map(view),
      history: list
        .filter((t) => t.status !== 'open' && (t.fromId === user.id || t.acceptedBy === user.id))
        .slice(-10)
        .reverse()
        .map(view),
    };
  });

  route('POST', '/api/student/classes/:classId/trades', 'student', ({ user, params, body }) => {
    const cls = studentClass(user, params.classId);
    const r = E.createTrade(db, { cls, studentId: user.id, give: body.give, want: body.want, now: now() });
    if (!r.ok) fail(400, r.error);
    save();
    return [201, { id: r.trade.id }];
  });

  route('POST', '/api/student/trades/:tid/accept', 'student', ({ user, params }) => {
    const t = db.trades.find((x) => x.id === params.tid) || fail(404, 'Not found.');
    const cls = studentClass(user, t.classId); // must be in the same class
    const r = E.acceptTrade(db, { cls, trade: t, studentId: user.id, now: now() });
    if (!r.ok) fail(409, r.error);
    save();
    return { ok: true, resources: E.resources(db, user.id) };
  });

  route('POST', '/api/student/trades/:tid/cancel', 'student', ({ user, params }) => {
    const t = db.trades.find((x) => x.id === params.tid && x.fromId === user.id) || fail(404, 'Not found.');
    const r = E.cancelTrade(db, { trade: t, now: now() });
    if (!r.ok) fail(409, r.error);
    save();
    return { ok: true, resources: E.resources(db, user.id) };
  });

  // ============================================================
  // Dispatcher. Returns true if it handled the request.
  // ============================================================
  async function handle(req, res) {
    if (!req.url.startsWith('/api/')) return false;
    let url;
    try {
      url = new URL(req.url, 'http://x'); // can throw on junk like "//" - must be inside the try
    } catch {
      send(res, 400, { error: 'Bad request.' });
      return true;
    }
    try {
      const match = routes.map((r) => ({ r, m: r.method === req.method && url.pathname.match(r.re) })).find((x) => x.m);
      if (!match) fail(404, 'Not found.');
      const { r, m } = match;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));

      let user = null;
      let token = null;
      if (r.role) {
        token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        user = authenticate(token);
        if (!user) fail(401, 'Please sign in.');
        if (r.role !== 'any' && user.role !== r.role) fail(403, 'Not allowed.');
      }
      const body = ['POST', 'PUT'].includes(req.method) ? await readJson(req, r.limit) : {};
      const out = await r.handler({ req, params, body, user, token, query: url.searchParams });
      if (out && out.__raw !== undefined) {
        res.writeHead(200, {
          'Content-Type': out.contentType,
          'Content-Disposition': `attachment; filename="${out.filename}"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        });
        res.end(out.__raw);
      } else if (Array.isArray(out) && typeof out[0] === 'number') send(res, out[0], out[1]);
      else send(res, 200, out);
    } catch (err) {
      if (err instanceof HttpError) {
        send(res, err.status, { error: err.message, details: err.details });
      } else {
        // Log server-side; never send stack traces or internals to the browser
        console.error('[api] unexpected error on', req.method, url.pathname, '-', err && err.stack);
        send(res, 500, { error: 'Something went wrong. Please try again.' });
      }
    }
    return true;
  }

  return { handle, db, store, services, GEN };
}

module.exports = { createQuizApi };
