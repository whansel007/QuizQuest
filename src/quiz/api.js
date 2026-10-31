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
const { HERO_CLASSES } = require('../../public/hero-lab/hero-list.js');
const {
  DEBUG_TUNING, ROOM_MAX_ACTIVE, TOWN_AVATAR_COLOR_MAX_LIGHTNESS,
  TOWN_AVATAR_COLOR_MIN_LIGHTNESS, TOWN_AVATAR_DEFAULT_COLOR,
  TOWN_AVATAR_MIN_GRASS_DISTANCE, TOWN_GRASS_COLOR, SUMMON_HISTORY_PAGE_SIZE,
} = require('../../config/tuning.js');
const { createStore } = require('./store');
const { validateQuestion } = require('./validate');
const { generate, GEN } = require('./generator');
const { ADAPTIVE, topicStats, planSession, similarToMissed } = require('./adaptive');
const { studentProgress } = require('./progress');
const { reportContext, studentReports } = require('./reporting');
const reportCategories = require('./report-categories.json');
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
const { AVATAR_COSMETIC_BY_ID, AVATAR_COSMETIC_CATALOG } = require('../../config/avatar-cosmetics');
const { avatarVisual, wardrobeState, wardrobeView, legacyColorItem } = require('./avatar');
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
const SEEDED_DEMO_USER_IDS = new Set(['t-a', 't-b', ...Array.from({ length: 12 }, (_, i) => `s-${String(i + 1).padStart(2, '0')}`)]);
const isSeededDemoUser = (user) => SEEDED_DEMO_USER_IDS.has(user.id) && user.email?.endsWith('@quizquest.demo');

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
// YYYY-MM-DD of an instant in a time zone (en-CA formats dates that way)
const dayIn = (at, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(at));
const SEMESTER_MAX_DAYS = 366;
// { start, end? } as YYYY-MM-DD; null (or an empty start) clears it
function parseSemester(value) {
  if (value === null || value?.start === '' || value?.start === null) return null;
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const valid = (d) => typeof d === 'string' && day.test(d) && !Number.isNaN(Date.parse(d)) && new Date(d + 'T00:00:00Z').toISOString().slice(0, 10) === d;
  if (!valid(value?.start)) fail(400, 'Pick the date the semester starts.');
  const end = value.end || null;
  if (end !== null && !valid(end)) fail(400, 'Pick a valid end date, or leave it empty.');
  if (end && end < value.start) fail(400, 'The semester must end after it starts.');
  if (end && (Date.parse(end) - Date.parse(value.start)) / 86400000 + 1 > SEMESTER_MAX_DAYS) fail(400, `A semester can be at most ${SEMESTER_MAX_DAYS} days.`);
  return { start: value.start, ...(end && { end }) };
}
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
function createQuizApi({ dataFile = null, store = null, now = () => Date.now(), drafter = null, devMode = process.env.QUIZQUEST_DEV === '1', authoringAI = null, authoringDrafter = null } = {}) {
  store = store || createStore(dataFile);
  const { db } = store;
  if (P.ensureDemoCredentials(db.users)) store.save();
  // Every change goes through save(), so counting saves tells us whether
  // the data has changed (used to cache dashboard numbers). A save can say
  // what it touched, so one class practising doesn't keep throwing away
  // every other class's numbers:
  //   save()                      anything: every class's numbers refresh
  //   save({ classId })           one class's answers, sessions or marks
  //   save({ analytics: false })  nothing the dashboard shows (shop, pets, trades)
  let dataVersion = 0;
  const classVersions = new Map();
  const save = ({ classId = null, analytics = true } = {}) => {
    if (classId) classVersions.set(classId, (classVersions.get(classId) || 0) + 1);
    else if (analytics) dataVersion++;
    store.save();
  };
  const versionOfClass = (classId) => `${dataVersion}.${classVersions.get(classId) || 0}`;
  const persist = async () => {
    save();
    await store.flush?.();
    if (store.pending?.()) fail(503, 'Your progress could not be saved. Check server storage and retry.');
  };
  const authoring = createAuthoring({ db, ai: authoringAI || undefined, drafter: authoringDrafter || undefined, persist });
  const tokens = new Map(); // token -> { userId, expires }
  const loginFails = new Map(); // email -> { count, until }
  const grading = new Set(); // "sessionId:index" answers currently being graded
  const forcedSummons = new Map(); // seeded-demo-only visual fixtures; never persisted

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
  function avatarLightness(hex) {
    const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
    return ((Math.max(...channels) + Math.min(...channels)) / 2) * 100;
  }
  function avatarGrassDistance(hex) {
    const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
    const grass = [1, 3, 5].map((i) => Number.parseInt(TOWN_GRASS_COLOR.slice(i, i + 2), 16));
    return Math.hypot(...channels.map((value, i) => value - grass[i]));
  }
  function validatedAvatarColor(value) {
    const color = typeof value === 'string' ? value.toUpperCase() : '';
    if (!/^#[0-9A-F]{6}$/.test(color)) fail(400, 'Choose a valid six-digit avatar color.');
    const lightness = avatarLightness(color);
    if (lightness < TOWN_AVATAR_COLOR_MIN_LIGHTNESS || lightness > TOWN_AVATAR_COLOR_MAX_LIGHTNESS)
      fail(400, 'Choose a brighter color that stays visible in the grass.');
    if (avatarGrassDistance(color) < TOWN_AVATAR_MIN_GRASS_DISTANCE)
      fail(400, 'Choose a color that stands apart from the grass.');
    return color;
  }
  // New wardrobe state is loaded with the inventory row so resource-priced
  // purchases, owned IDs, loadout and retry receipts share one database write.
  const avatarInventory = (u) => db.inventory.find((item) => item.studentId === u.id) || null;
  const avatarAppearance = (u) => avatarVisual(u, avatarInventory(u));

  function wardrobeInventory(user) {
    const existing = avatarInventory(user);
    const inventory = existing || R.inventory(db, user.id);
    let changed = !existing;
    if (!inventory.avatarWardrobe && user.avatarWardrobe && typeof user.avatarWardrobe === 'object') {
      inventory.avatarWardrobe = user.avatarWardrobe;
      changed = true;
    }
    if (changed) save({ analytics: false });
    return inventory;
  }

  // What the browser may see of a user: never the password hash
  const publicUser = (u) => ({
    id: u.id, name: u.name, role: u.role, email: u.email,
    ...(u.role === 'student' ? { avatarColor: avatarAppearance(u).color, avatarVisual: avatarAppearance(u) } : {}),
  });

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
      // What the drafter judged this draft to assess: the professor needs it
      // to see what a rewrite would change.
      cognitiveStyle: q.assessment?.cognitiveStyle || null,
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
      reports: q.reports.map((r) => {
        const context = reportContext(db, q, r);
        return {
          id: r.id, reason: r.reason, category: r.category || 'other', at: r.at,
          resolved: r.resolved, resolvedAt: r.resolvedAt || null, resolutionNote: r.resolutionNote || '',
          version: context.version, stem: context.stem,
        };
      }),
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

  // "Add material": an existing topic or `newTopic: { name, week }`, and an
  // existing outcome or a typed `outcomeText`. Nothing is stored here; the
  // caller adds the new topic/outcome once the rest of the request is valid.
  function materialTags(course, body) {
    if (body.newTopic == null && body.outcomeText == null) return topicAndOutcome(course, body.topicId, body.outcomeId);
    try {
      const topics = topicsOf(course.id);
      let topic, isNewTopic = false;
      if (body.newTopic != null) {
        const name = T.parseName(body.newTopic.name, topics);
        const week = T.parseWeek(body.newTopic.week) ?? null;
        topic = { id: newId('tp'), courseId: course.id, name, outcomes: [], ...(week && { week }) };
        isNewTopic = true;
      } else topic = topics.find((t) => t.id === body.topicId) || fail(400, 'Unknown topic.');
      if (body.outcomeText == null) {
        if (isNewTopic) fail(400, 'Enter a learning outcome for the new topic.');
        const outcome = topic.outcomes.find((o) => o.id === body.outcomeId) || fail(400, 'Unknown learning outcome.');
        return { topic, outcome, isNewTopic, isNewOutcome: false };
      }
      // re-typing an existing outcome reuses it instead of failing as a duplicate
      const typed = typeof body.outcomeText === 'string' ? body.outcomeText.trim() : '';
      const existing = topic.outcomes.find((o) => o.text.toLowerCase() === typed.toLowerCase());
      if (existing) return { topic, outcome: existing, isNewTopic, isNewOutcome: false };
      return { topic, outcome: { id: newId('lo'), text: T.parseOutcome(body.outcomeText, topic) }, isNewTopic, isNewOutcome: true };
    } catch (e) {
      if (e.status) fail(e.status, e.message);
      throw e;
    }
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
attemptId: attempt.id,
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
    kingdomBuildings: (studentId) => E.kingdom(db, studentId).buildings,
    avatarVisual: avatarAppearance,
    // Same gate the debug menu uses: only seeded synthetic demo accounts.
    isDebugUser: isSeededDemoUser,
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
  if (devMode) {
    route('GET', '/api/dev-ready', null, () => ({
      ready: true,
      demoAccounts: db.users.filter(isSeededDemoUser).length,
      heroLabHeroes: Object.keys(HERO_CLASSES),
    }));
  }

  route('GET', '/api/demo-users', null, () => {
    const label = (u) => {
      if (u.role === 'teacher') return db.classes.filter((c) => c.teacherIds.includes(u.id)).map((c) => c.name).join(', ');
      const cls = db.enrolments.filter((e) => e.studentId === u.id).map((e) => db.classes.find((c) => c.id === e.classId).name);
      const hist = db.attempts.some((a) => a.studentId === u.id);
      return cls.join(', ') + (hist ? '' : ' - no history yet');
    };
    // The test-account helper may list synthetic seeded accounts in production,
    // but never disclose registered users. Production userId login is limited
    // to this same seeded synthetic allowlist.
    return db.users.filter(isSeededDemoUser)
      .map((u) => ({ id: u.id, name: u.name, role: u.role, email: u.email, note: label(u) }));
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
    if (body.userId !== undefined) user = db.users.find((u) => u.id === body.userId && isSeededDemoUser(u)) || fail(400, 'Unknown demo user.');
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

  // Same behaviour under the /api/auth/* prefix, so Task 1A's documented
  // contract keeps working alongside the shorter route above. This one answers
  // 201 because Task 1A's API documentation specifies "created".
  route('POST', '/api/auth/register', null, ({ body }) => {
    const name = str(body.name, NAME_MAX, 'Name');
    const email = P.normEmail(body.email);
    if (!EMAIL_RE.test(email) || email.length > 254) fail(400, 'Enter a valid email address.');
    if (typeof body.password !== 'string' || body.password.length < P.PASSWORD_MIN) fail(400, `Use a password of at least ${P.PASSWORD_MIN} characters.`);
    if (body.password.length > P.PASSWORD_MAX) fail(400, `Use a password of at most ${P.PASSWORD_MAX} characters.`);
    if (db.users.some((u) => u.email === email)) fail(409, 'An account with this email already exists. Sign in instead.');
    const user = { id: newId('s'), name, role: 'student', email, passwordHash: P.hashPassword(body.password), createdAt: now() };
    db.users.push(user);
    save({ analytics: false });
    return [201, startSession(user)];
  });

  route('POST', '/api/auth/forgot-password', null, ({ body }) => {
    const email = P.normEmail(body.email);
    if (!email || !EMAIL_RE.test(email)) fail(400, 'Enter a valid email address.');
    // Always the same answer, so this cannot be used to discover who has an account.
    return {
      ok: true,
      message: 'If an account exists for that address, password reset instructions have been sent.',
    };
  });

  // Completes a reset started by /api/auth/forgot-password. The recovery
  // link proves control of the mailbox; this call exchanges it for a session.
  const handleResetPassword = ({ req, body }) => {
    const newPassword = body?.newPassword || body?.password || '';
    const email = P.normEmail(body?.email);
    if (!newPassword || newPassword.length < P.PASSWORD_MIN) fail(400, `Use a password of at least ${P.PASSWORD_MIN} characters.`);
    if (newPassword.length > P.PASSWORD_MAX) fail(400, `Use a password of at most ${P.PASSWORD_MAX} characters.`);

    // A signed-in caller may change their own password without a recovery link.
    const currentToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let target = currentToken ? authenticate(currentToken) : null;
    if (!target && email) target = db.users.find((u) => u.email === email || `${u.id}@quizquest.edu` === email);
    if (!target) fail(400, 'Could not identify the account. Please request a new reset link.');

    target.passwordHash = P.hashPassword(newPassword);
    // Changing a password ends every other session for that account.
    for (const [t, s] of tokens) if (s.userId === target.id) tokens.delete(t);
    save();
    return startSession(target);
  };

  route('POST', '/api/auth/reset-password', null, handleResetPassword);
  route('POST', '/api/auth/update-password', null, handleResetPassword);

  route('POST', '/api/logout', 'any', ({ token }) => {
    tokens.delete(token);
    return { ok: true };
  });

  // ---------------- class management (Task 1B) ----------------
  // Join codes are unpredictable and stored hashed, so the database never
  // holds a usable code and probing cannot enumerate valid ones.
  const hashJoinCode = (rawCode) =>
    crypto.createHash('sha256').update(String(rawCode).trim().toUpperCase()).digest('hex');

  function generateJoinCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I
    let code = 'QQ-';
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
  }

  route('GET', '/api/classes', 'any', ({ user }) => {
    if (user.role === 'teacher') {
      return db.classes
        .filter((c) => c.teacherIds.includes(user.id))
        .map((c) => ({
          id: c.id,
          name: c.name,
          courseId: c.courseId,
          courseTitle: db.courses.find((x) => x.id === c.courseId)?.title || '',
          description: c.description || '',
          archivedAt: c.archivedAt || null,
          settings: c.settings,
          memberCount: db.enrolments.filter((e) => e.classId === c.id).length,
          activeCodesCount: (db.classJoinCodes || []).filter(
            (cd) => cd.classId === c.id && !cd.revoked && (!cd.expiresAt || cd.expiresAt > now()),
          ).length,
        }));
    }
    return db.enrolments
      .filter((e) => e.studentId === user.id)
      .map((e) => {
        const c = db.classes.find((cl) => cl.id === e.classId);
        if (!c) return null;
        return {
          id: c.id,
          name: c.name,
          courseId: c.courseId,
          courseTitle: db.courses.find((x) => x.id === c.courseId)?.title || '',
          description: c.description || '',
          settings: c.settings,
        };
      })
      .filter(Boolean);
  });

  route('POST', '/api/classes', 'teacher', ({ user, body }) => {
    const course = teacherCourse(user, body.courseId);
    const name = str(body.name, 80, 'Class name');
    const description = body.description ? str(body.description, 300, 'Description') : '';
    const newClass = {
      id: newId('cl'),
      courseId: course.id,
      name,
      description,
      teacherIds: [user.id],
      settings: { tradingEnabled: true, participation: { enabled: false }, timezone: 'Asia/Singapore' },
      archivedAt: null,
      createdBy: user.id,
      createdAt: now(),
    };
    db.classes.push(newClass);
    save();
    return [201, newClass];
  });

  route('PATCH', '/api/classes/:classId', 'teacher', ({ user, params, body }) => {
    const cls = teacherClass(user, params.classId);
    if (body.name !== undefined) cls.name = str(body.name, 80, 'Class name');
    if (body.description !== undefined)
      cls.description = typeof body.description === 'string' ? str(body.description, 300, 'Description') : '';
    save();
    return cls;
  });

  // Classes are archived, never deleted: quiz attempts and history stay intact.
  route('POST', '/api/classes/:classId/archive', 'teacher', ({ user, params }) => {
    const cls = teacherClass(user, params.classId);
    cls.archivedAt = cls.archivedAt ? null : now();
    save();
    return { ok: true, archived: Boolean(cls.archivedAt), archivedAt: cls.archivedAt };
  });

  route('GET', '/api/classes/:classId/members', 'teacher', ({ user, params }) => {
    const cls = teacherClass(user, params.classId);
    const studentIds = db.enrolments.filter((e) => e.classId === cls.id).map((e) => e.studentId);
    // classIds: which of this professor's classes the student is in (never
    // another professor's), for the roster's "Add to class" dropdown
    const mine = new Set(db.classes.filter((c) => c.teacherIds.includes(user.id)).map((c) => c.id));
    return studentIds.map((sid) => {
      const u = db.users.find((x) => x.id === sid);
      const attempts = db.attempts.filter((a) => a.studentId === sid && a.classId === cls.id);
      return {
        id: sid,
        name: u?.name || 'Unknown',
        email: u?.email || `${sid}@quizquest.edu`,
        attemptsCount: attempts.length,
        lastActive: attempts.length ? Math.max(...attempts.map((a) => a.at)) : null,
        classIds: db.enrolments.filter((e) => e.studentId === sid && mine.has(e.classId)).map((e) => e.classId),
      };
    });
  });

  route('DELETE', '/api/classes/:classId/members/:userId', 'teacher', ({ user, params }) => {
    const cls = teacherClass(user, params.classId);
    const idx = db.enrolments.findIndex((e) => e.classId === cls.id && e.studentId === params.userId);
    if (idx === -1) fail(404, 'Student is not enrolled in this class.');
    db.enrolments.splice(idx, 1);
    save();
    return { ok: true, removedUserId: params.userId };
  });

  // A professor enrols one existing student account, by email, into one of
  // their own active classes, named as it appears in Classes & Roster. Adding
  // never removes the student from their other classes.
  route('POST', '/api/classes/enrol', 'teacher', ({ user, body }) => {
    const email = P.normEmail(body?.email);
    if (!email || !EMAIL_RE.test(email)) fail(400, 'Enter a valid email address.');
    const className = String(body?.className || '').trim().toLowerCase();
    if (!className) fail(400, 'Enter the class name.');
    const matches = db.classes.filter((c) => c.teacherIds.includes(user.id) && !c.archivedAt && c.name.trim().toLowerCase() === className);
    if (!matches.length) fail(404, `None of your active classes is named "${String(body.className).trim()}".`);
    if (matches.length > 1) fail(409, `More than one of your classes is named "${matches[0].name}". Rename one first.`);
    const cls = matches[0];
    const student = db.users.find((u) => u.email === email) || fail(404, 'No account uses this email. The student needs to sign up first.');
    if (student.role !== 'student') fail(400, 'Only student accounts can be enrolled in a class.');
    if (isEnrolled(student.id, cls.id)) fail(409, `${student.name} is already in ${cls.name}.`);
    db.enrolments.push({ classId: cls.id, studentId: student.id });
    save();
    return [201, { ok: true, class: { id: cls.id, name: cls.name }, student: { id: student.id, name: student.name, email: student.email } }];
  });

  route('POST', '/api/classes/:classId/join-codes', 'teacher', ({ user, params, body }) => {
    const cls = teacherClass(user, params.classId);
    const rawCode = generateJoinCode();
    const codeHash = hashJoinCode(rawCode);
    const expiresInDays = Number(body?.expiresInDays);
    const expiresAt = Number.isInteger(expiresInDays) && expiresInDays > 0 ? now() + expiresInDays * 86400000 : null;
    const usageLimit = Number.isInteger(body?.usageLimit) && body.usageLimit > 0 ? body.usageLimit : null;
    db.classJoinCodes = db.classJoinCodes || [];
    const rec = {
      id: crypto.randomUUID(),
      classId: cls.id,
      code: rawCode,
      codeHash,
      expiresAt,
      usageLimit,
      usageCount: 0,
      revoked: false,
      createdBy: user.id,
      createdAt: now(),
    };
    db.classJoinCodes.push(rec);
    save();
    return [201, { id: rec.id, code: rawCode, expiresAt, usageLimit, usageCount: 0, revoked: false }];
  });

  route('GET', '/api/classes/:classId/join-codes', 'teacher', ({ user, params }) => {
    const cls = teacherClass(user, params.classId);
    db.classJoinCodes = db.classJoinCodes || [];
    return db.classJoinCodes
      .filter((c) => c.classId === cls.id)
      .map((c) => ({
        id: c.id,
        code: c.code || null,
        expiresAt: c.expiresAt,
        usageLimit: c.usageLimit,
        usageCount: c.usageCount,
        revoked: c.revoked,
        createdAt: c.createdAt,
        isExpired: c.expiresAt ? c.expiresAt < now() : false,
      }));
  });

  route('DELETE', '/api/classes/:classId/join-codes/:codeId', 'teacher', ({ user, params }) => {
    const cls = teacherClass(user, params.classId);
    const rec =
      (db.classJoinCodes || []).find((c) => c.id === params.codeId && c.classId === cls.id) || fail(404, 'Join code not found.');
    rec.revoked = true;
    save();
    return { ok: true };
  });

  // Redemption is checked and applied in one pass: an unknown, revoked,
  // expired or exhausted code never creates an enrolment.
  // Supports QQ-XXXXX, prefix-less XXXXX, and fallback by code ID.
  route('POST', '/api/classes/join', 'student', ({ user, body }) => {
    const raw = (body?.code || '').trim();
    if (!raw) fail(400, 'Please enter a join code.');
    db.classJoinCodes = db.classJoinCodes || [];

    const norm = raw.toUpperCase();
    const withPrefix = norm.startsWith('QQ-') ? norm : `QQ-${norm}`;
    const rawHashed = hashJoinCode(norm);
    const prefixedHashed = hashJoinCode(withPrefix);

    const codeRecord = db.classJoinCodes.find((c) => {
      if (c.revoked) return false;
      if (c.codeHash === rawHashed || c.codeHash === prefixedHashed) return true;
      if (c.code && (c.code.toUpperCase() === norm || c.code.toUpperCase() === withPrefix)) return true;
      if (c.id) {
        const idUpper = c.id.toUpperCase();
        if (
          idUpper === norm ||
          idUpper === `CODE-${norm.replace(/^CODE-?/i, '')}` ||
          idUpper.replace(/^CODE-?/i, '') === norm.replace(/^CODE-?/i, '')
        )
          return true;
      }
      return false;
    });

    if (!codeRecord) fail(404, 'Invalid or revoked join code.');
    if (codeRecord.expiresAt && codeRecord.expiresAt < now()) fail(400, 'This join code has expired.');
    if (codeRecord.usageLimit && codeRecord.usageCount >= codeRecord.usageLimit)
      fail(400, 'This join code has reached its usage limit.');

    const cls = db.classes.find((c) => c.id === codeRecord.classId && !c.archivedAt) || fail(404, 'Class not found or archived.');
    if (isEnrolled(user.id, cls.id)) fail(400, 'You are already enrolled in this class.');

    db.enrolments.push({ classId: cls.id, studentId: user.id });
    codeRecord.usageCount++;
    save();
    return { ok: true, class: { id: cls.id, name: cls.name, courseTitle: db.courses.find((c) => c.id === cls.courseId)?.title } };
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
        semester: c.semester || null,
        promptConfig: c.promptConfig || '',
        drafter: drafter
          ? 'Custom drafter'
          : gemini.enabled()
              ? `Gemini (${gemini.model()})`
              : 'Unavailable: Gemini is not configured',
        authoringEnabled: gemini.enabled() || Boolean(authoringAI),
        geminiEnabled: gemini.enabled(),
        formats: {
          authoring: AI_DRAFT_FORMATS,
          all: TYPES,
          labels: TYPE_LABELS,
          drafter: drafter || gemini.enabled() ? GEN.aiFormats : [],
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
    // validate before changing anything
    const semester = body.semester === undefined ? undefined : parseSemester(body.semester);
    if (body.coverageTarget !== undefined) {
      if (!Number.isInteger(body.coverageTarget) || body.coverageTarget < 1 || body.coverageTarget > 50)
        fail(400, 'Coverage target must be 1-50.');
      c.coverageTarget = body.coverageTarget;
    }
    if (semester === null) delete c.semester;
    else if (semester) c.semester = semester;
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
  // Rewrite several drafts in one go, in the style the professor asks for.
  route(
    'POST',
    '/api/teacher/questions/regenerate',
    'teacher',
    statusReply(async ({ user, body }) => {
      const ids = Array.isArray(body?.ids) ? body.ids.filter((id) => typeof id === 'string') : [];
      if (!ids.length) fail(400, 'Select at least one question to regenerate.');
      if (ids.length > 10) fail(400, 'Regenerate up to 10 questions at a time.');
      const qs = ids.map((id) => teacherQuestion(user, id)),
        c = teacherCourse(user, qs[0].courseId);
      const j = authoring.regenerateMany(c, qs, user.id, body?.assessmentStyle);
      await persist();
      return [202, { id: j.id, count: qs.length }];
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
  route('GET', '/api/teacher/courses/:cid/passages', 'teacher', ({ user, params, query }) => {
    const c = teacherCourse(user, params.cid);
    const includeArchived = query?.get?.('includeArchived') === 'true';
    // One pass over the questions instead of one per passage.
    const usedBy = new Map();
    for (const q of db.questions) for (const id of new Set(q.versions.at(-1).sourceIds)) usedBy.set(id, (usedBy.get(id) || 0) + 1);
    return db.passages
      .filter((p) => p.courseId === c.id && (includeArchived || !p.archivedAt))
      .map((p) => ({ ...p, usedBy: usedBy.get(p.id) || 0 }));
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
      const { topic, outcome, isNewTopic, isNewOutcome } = materialTags(c, body);
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
      // everything is validated: only now add the new topic / outcome
      if (isNewTopic) db.topics.push(topic);
      if (isNewOutcome) topic.outcomes.push(outcome);
      db.passages.push(p);
      save();
      return [201, { ...p, topic }];
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

  // Soft archive: the passage row stays so questions keep pointing at a real
  // source id. Restore is the same call with the flag cleared.
  route('POST', '/api/teacher/passages/:pid/archive', 'teacher', ({ user, params, body }) => {
    const p = db.passages.find((x) => x.id === params.pid) || fail(404, 'Not found.');
    teacherCourse(user, p.courseId);
    const archived = body?.archived === undefined ? !p.archivedAt : body.archived === true;
    p.archivedAt = archived ? now() : null;
    save();
    return { ok: true, archived, archivedAt: p.archivedAt };
  });

  // Metadata only. The passage text is immutable once saved so AI drafts
  // already referencing it keep matching the material they were written from.
  route('PATCH', '/api/teacher/passages/:pid', 'teacher', ({ user, params, body }) => {
    const p = db.passages.find((x) => x.id === params.pid) || fail(404, 'Not found.');
    const c = teacherCourse(user, p.courseId);
    if (body.title !== undefined) p.title = str(body.title, 120, 'Title');
    if (body.topicId !== undefined || body.outcomeId !== undefined) {
      const { topic, outcome } = topicAndOutcome(c, body.topicId ?? p.topicId, body.outcomeId ?? p.outcomeId);
      p.topicId = topic.id;
      p.outcomeId = outcome.id;
    }
    save();
    return p;
  });

  // Hard delete stays available for passages that were never referenced.
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

  route('POST', '/api/teacher/questions/:qid/reports/:rid/resolve', 'teacher', ({ user, params, body }) => {
    const q = teacherQuestion(user, params.qid);
    const r = q.reports.find((x) => x.id === params.rid) || fail(404, 'Not found.');
    if (r.resolved) return teacherView(q); // a retried request must not replace the response
    const note = body.resolutionNote === undefined ? '' : str(body.resolutionNote, 500, 'Professor response');
    r.resolved = true;
    r.resolvedAt = now();
    r.resolvedBy = user.id;
    r.resolutionNote = note;
    save();
    return teacherView(q);
  });

  // ---------------- teacher: marking free-response answers ----------------
  // ?topic=<id>: only answers to that weekly topic's questions (dashboard filter)
  // Every answer still waiting for a mark, any period (it's a to-do list):
  // the total, and the newest 50.
  route('GET', '/api/teacher/classes/:classId/marking', 'teacher', ({ user, params, query }) => {
    const cls = teacherClass(user, params.classId);
    const topicId = topicFilter(query, cls.courseId);
    // Only students currently in the class: someone who left keeps their old
    // attempts, but the professor should not mark answers for a class they
    // are no longer enrolled in.
    const pending = db.attempts.filter(
      (a) =>
        a.classId === cls.id &&
        a.needsReview &&
        (!topicId || a.topicId === topicId) &&
        isEnrolled(a.studentId, cls.id),
    );
    return {
      total: pending.length,
      items: pending
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
        }),
    };
  });

  route('POST', '/api/teacher/attempts/:aid/mark', 'teacher', ({ user, params, body }) => {
    const a = db.attempts.find((x) => x.id === params.aid) || fail(404, 'Not found.');
    teacherClass(user, a.classId);
    if (typeof body.correct !== 'boolean') fail(400, 'Choose correct or not correct.');
    if (a.type !== 'short') fail(400, 'Only short answers can be manually marked.');
    // Marking from the queue: if the answer stopped being pending after the
    // professor's screen loaded, someone already marked it. Refuse instead of
    // overwriting their mark.
    if (body.expectPending === true && !a.needsReview)
      fail(409, 'This answer has already been marked.');
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
    save({ classId: a.classId });
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
  // Dashboard numbers are cached briefly (per class or course, period and
  // topic): with auto-refresh every 30 s, an unchanged class costs nothing
  // to re-serve. A save touching the class (or everything), or 60 s
  // passing, refreshes it. Each of these reads every answer, so this matters.
  const ANALYTICS_TTL = 60000;
  const analyticsCache = new Map();
  function cached(key, version, compute) {
    const hit = analyticsCache.get(key);
    if (hit && hit.version === version && now() - hit.at < ANALYTICS_TTL) return hit.value;
    const value = compute();
    if (analyticsCache.size > 500) analyticsCache.clear(); // bounded: a few entries per class
    analyticsCache.set(key, { version, at: now(), value });
    return value;
  }
  const periodKey = (p) => `${p.range}|${p.from || ''}|${p.to || ''}|${p.topicId || ''}`;
  // "This semester" takes its dates from the course: from the start to the
  // end, or to today while it is still running (no `to`)
  const period = (query, course, tz = APP_TZ) => {
    const p = parsePeriod((k) => query.get(k));
    if (p.error) fail(400, p.error);
    if (p.range !== 'semester') return p;
    const start = course.semester?.start || fail(409, 'Set when this semester starts in Settings to use "This semester".');
    const today = dayIn(now(), tz);
    if (start > today) fail(400, `This semester starts on ${start}. Pick another period until then.`);
    const end = course.semester.end;
    return { range: 'semester', from: start, ...(end && end < today && { to: end }) };
  };
  const classTz = (cls) => (isValidTimeZone(cls.settings.timezone) ? cls.settings.timezone : APP_TZ);
  route('GET', '/api/teacher/classes/:classId/analytics', 'teacher', ({ user, params, query }) => {
    const cls = teacherClass(user, params.classId);
    const p = { ...period(query, db.courses.find((c) => c.id === cls.courseId), classTz(cls)), topicId: topicFilter(query, cls.courseId) };
    return cached(`class|${params.classId}|${periodKey(p)}`, versionOfClass(params.classId), () => classAnalytics(db, params.classId, now(), p));
  });

  // One question in detail (dashboard drill-down), for this class's answers
  route('GET', '/api/teacher/classes/:classId/questions/:qid/insights', 'teacher', ({ user, params, query }) => {
    const cls = teacherClass(user, params.classId);
    const p = period(query, db.courses.find((c) => c.id === cls.courseId), classTz(cls));
    const key = `question|${params.classId}|${params.qid}|${periodKey(p)}`;
    return cached(key, versionOfClass(params.classId), () => questionInsights(db, params.classId, params.qid, now(), p)) || fail(404, 'Not found.');
  });

  // The professor's classes of one course side by side (no student names)
  route('GET', '/api/teacher/courses/:cid/compare', 'teacher', ({ user, params, query }) => {
    const c = teacherCourse(user, params.cid);
    const ids = db.classes.filter((cl) => cl.courseId === c.id && cl.teacherIds.includes(user.id)).map((cl) => cl.id);
    const p = { ...period(query, c), topicId: topicFilter(query, c.id) };
    // fresh while none of these classes has changed
    return cached(`compare|${ids.join(',')}|${periodKey(p)}`, ids.map(versionOfClass).join('/'), () => courseComparison(db, ids, now(), p));
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
  route('GET', '/api/student/debug-mode', 'student', ({ user }) => ({ enabled: isSeededDemoUser(user) }));
  // Live Hero Lab rooms for the debug menu. Same gate as the rest of the menu:
  // only synthetic demo accounts can see the whole list. Any other student may
  // look up one room by its code (the profiler asks for it that way).
  // The route keeps the 'student' role: the dispatcher only resolves the
  // session user for a route that declares one, so a null role would leave
  // `user` empty and every caller would be treated as a stranger.
  route('GET', '/api/student/hero-lab/rooms', 'student', ({ user, query }) => {
    const rooms = services.heroLab?.rooms?.list?.() || [];
    const isDebugUser = isSeededDemoUser(user);
    if (!isDebugUser) {
      const code = String(query.get('code') || '').trim().toUpperCase();
      if (!code) fail(400, 'Room code is required.');
      return { rooms: rooms.filter((room) => room.code === code).map((room) => room.debugInfo()) };
    }
    return {
      maxRooms: ROOM_MAX_ACTIVE,
      rooms: rooms.map((room) => room.debugInfo()),
    };
  });
  // Profiler harness for the lag investigation: fill a live room with a ring of
  // enemies on demand. Same gate as the rest of the debug menu.
  route('POST', '/api/student/hero-lab/stress', 'student', ({ user, body }) => {
    if (!isSeededDemoUser(user)) fail(403, 'Debug tools are only available for synthetic demo accounts.');
    const room = services.heroLab?.rooms?.findByCode?.(String(body?.roomCode || '').trim().toUpperCase());
    if (!room) fail(404, 'Room not found');
    const spawned = room.debugSpawnEnemies(Number(body?.count) || 40, Number(body?.hp) || 0);
    return { spawned, wave: room.debugInfo().wave };
  });
  // Profiler harness: kill every enemy in one tick - the burst a client sees
  // after a Bombardier ultimate or an Electromancer chain. Same debug gate.
  route('POST', '/api/student/hero-lab/mass-kill', 'student', ({ user, body }) => {
    if (!isSeededDemoUser(user)) fail(403, 'Debug tools are only available for synthetic demo accounts.');
    const room = services.heroLab?.rooms?.findByCode?.(String(body?.roomCode || '').trim().toUpperCase());
    if (!room) fail(404, 'Room not found');
    const killed = room.debugKillAll();
    return { killed, wave: room.debugInfo().wave };
  });
  route('POST', '/api/student/debug/wallet', 'student', ({ user, body }) => {
    if (!isSeededDemoUser(user)) fail(403, 'Debug tools are only available for synthetic demo accounts.');
    const balance = Number(body.balance);
    if (!Number.isInteger(balance) || balance < DEBUG_TUNING.minimumBalance || balance > DEBUG_TUNING.maximumBalance) fail(400, `Balance must be a whole number from ${DEBUG_TUNING.minimumBalance.toLocaleString()} to ${DEBUG_TUNING.maximumBalance.toLocaleString()}.`);
    const adjustment = balance - R.balance(db, user.id);
    db.ledger.push({
      id: newId('tx'), studentId: user.id, kind: 'debug', amount: adjustment,
      reason: 'Debug wallet adjustment', refKey: `debug-wallet:${user.id}:${newId('debug')}`, at: now(),
    });
    save();
    return wallet(user.id);
  });
  route('POST', '/api/student/debug/resources', 'student', ({ user, body }) => {
    if (!isSeededDemoUser(user)) fail(403, 'Debug tools are only available for synthetic demo accounts.');
    const { resource, balance: requestedBalance } = body || {};
    const balance = Number(requestedBalance);
    if (typeof resource !== 'string' || !Object.hasOwn(E.RESOURCES, resource)) fail(400, 'Choose a valid kingdom resource.');
    if (!Number.isInteger(balance) || balance < DEBUG_TUNING.minimumBalance || balance > DEBUG_TUNING.maximumBalance) {
      fail(400, `Balance must be a whole number from ${DEBUG_TUNING.minimumBalance.toLocaleString()} to ${DEBUG_TUNING.maximumBalance.toLocaleString()}.`);
    }
    const current = E.resources(db, user.id);
    const delta = balance - (current[resource] || 0);
    current[resource] = balance;
    db.resourceLog.push({ id: newId('rl'), studentId: user.id, kind: 'debug', delta: { [resource]: delta },
      reason: `Debug ${E.RESOURCES[resource].name} adjustment`, refKey: `debug-resource:${user.id}:${newId('debug')}`, at: now() });
    save();
    return { resources: { ...current } };
  });
  route('POST', '/api/student/debug/force-next-summon', 'student', ({ user, body }) => {
    if (!isSeededDemoUser(user)) fail(403, 'Debug tools are only available for synthetic demo accounts.');
    const scenarios = ['epic-and-duplicates', 'all-resources', 'three-new-heroes'];
    if (!scenarios.includes(body?.scenario)) fail(400, 'Choose a valid summon preview.');
    forcedSummons.set(user.id, body.scenario);
    return { queued: true, scenario: body.scenario };
  });

  route('GET', '/api/student/home', 'student', ({ user }) => {
    const welcomeRef = `hero-summon-welcome:${user.id}`;
    if (!db.ledger.some((entry) => entry.refKey === welcomeRef)) {
      db.ledger.push({ id: newId('tx'), studentId: user.id, kind: 'gift', amount: R.HERO_SUMMON.welcomeGiftCoins,
        reason: 'Welcome gift for Hero Summon', refKey: welcomeRef, at: now() });
      save({ analytics: false });
    }
    const classes = db.enrolments
      .filter((e) => e.studentId === user.id)
      .map((e) => {
        const cl = db.classes.find((c) => c.id === e.classId && !c.archivedAt);
        if (!cl) return null;
        return {
          id: cl.id,
          name: cl.name,
          course: db.courses.find((c) => c.id === cl.courseId)?.title || 'Course',
          tradingEnabled: cl.settings.tradingEnabled,
          participation: cl.settings.participation?.enabled
            ? {
                points: db.participation.filter((p) => p.classId === cl.id && p.studentId === user.id).length,
                weeklyCap: E.PARTICIPATION.weeklyCap,
              }
            : null,
        };
      })
      .filter(Boolean);
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
        heroSummon: R.HERO_SUMMON,
        heroes: R.HERO_CATALOG,
      },
      rules: R.REWARDS,
      options: { lengths: SESSION_LENGTHS, timers: TIMERS, accommodation: ACCOMMODATION },
    };
  });

  route('GET', '/api/student/classes/:classId/progress', 'student', ({ user, params }) => {
    const cl = studentClass(user, params.classId);
return studentProgress(db, user.id, cl);
  });

  route('GET', '/api/student/classes/:classId/reports', 'student', ({ user, params }) => {
    studentClass(user, params.classId);
    return studentReports(db, user.id, params.classId);
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
    if (body.attemptId !== undefined && (typeof body.attemptId !== 'string' || !body.attemptId)) fail(400, 'Invalid attempt id.');
    // Trust only a server-recorded attempt owned by this student. Old clients
    // without an attempt ID fall back to their latest answer to this question.
    const attempt = db.attempts.filter((a) => a.studentId === user.id && a.questionId === q.id && (!body.attemptId || a.id === body.attemptId))
      .reverse().sort((a, b) => b.at - a.at)[0] || fail(404, 'Not found.');
    studentClass(user, attempt.classId);
    const existing = q.reports.find((r) => {
      const context = reportContext(db, q, r);
      return r.studentId === user.id && !r.resolved && context.classId === attempt.classId && context.version === attempt.version;
    });
    if (existing) return { ok: true, already: true };
    const category = body.category === undefined ? 'other' : body.category;
    if (!reportCategories.some((c) => c.value === category)) fail(400, 'Pick a report category.');
    const v = versionOf(q, attempt.version);
    // Maths questions keep the student's sampled values, rather than a new draw.
    const stem = v.stem.replace(/\{(\w+)\}/g, (match, key) => String(attempt.instance?.values?.[key] ?? match));
    q.reports.push({
      id: newId('r'), studentId: user.id, classId: attempt.classId, version: attempt.version,
      attemptId: attempt.id, stem, category, reason: str(body.reason, 300, 'Reason'), at: now(), resolved: false,
    });
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
    save({ analytics: false });
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
    save({ analytics: false });
    return { pet, duplicatePet: !!owned, inventory: inv, wallet: wallet(user.id) };
  });

  route('POST', '/api/student/workshop/trial', 'student', ({ user, body }) => {
    const heroId = str(body.heroId, 40, 'Hero');
    if (!R.HERO_CATALOG.some((hero) => hero.id === heroId)) fail(400, 'Choose a hero from the catalog.');
    const trial = services.heroLab?.rooms?.createTrial?.(user.id, heroId);
    if (!trial) fail(503, 'The training ground is full. Try again shortly.');
    return { url: `/hero-lab/world?heroId=${encodeURIComponent(heroId)}&trialTicket=${encodeURIComponent(trial.ticket)}`, expiresAt: trial.expiresAt };
  });

  route('POST', '/api/student/hero-summon', 'student', ({ user, body }) => {
    const rid = requestId(body.requestId);
    const count = body.count === undefined ? 1 : Number(body.count);
    if (![1, 10].includes(count)) fail(400, 'Summon count must be 1 or 10.');
    const refKey = `hero-summon:${user.id}:${rid}`;
    const cost = R.HERO_SUMMON.pullCost;
    const totalCost = Math.floor(cost * count * (1 - (count === 10 ? (R.HERO_SUMMON.multiDiscount || 0) : 0)));
    const inv = R.inventory(db, user.id);
    // Idempotent retry: the same requestId returns the same prize so a
    // double-click (or retryablePost replay) can't double-charge or roll
    // a different result.
    const prev = db.ledger.find((t) => t.refKey === refKey);
    if (prev) {
      const meta = prev.meta || {};
      if (meta.results) {
        if (meta.count !== count) fail(409, 'This summon request was already used for a different pull count.');
        if (count === 1) {
          const cached = meta.results[0];
          const hero = cached.type === 'hero' ? R.HERO_CATALOG.find((item) => item.id === cached.heroId) || { id: cached.heroId, name: cached.heroId, emoji: '✨', type: 'hero', rarity: cached.rarity, weapon: '', skill: '', ultimate: '' } : null;
          const prize = cached.type === 'hero' ? { kind: 'hero', rarity: cached.rarity, hero } : { kind: 'resource', rarity: cached.rarity, resource: cached.resource, amount: cached.amount };
          return { prize, pity: inv.heroPity, duplicateHero: Boolean(cached.type === 'hero' && !cached.isNew), refund: cached.refundCoins || 0, batchId: meta.batchId, inventory: inv, wallet: wallet(user.id), repeat: true, results: meta.results };
        }
        return { results: meta.results, count, batchId: meta.batchId, pity: inv.heroPity, inventory: inv, wallet: wallet(user.id), repeat: true };
      }
      if (count !== 1) fail(409, 'This summon request was already used for a single pull.');
      let prize;
      if (meta.kind === 'hero') {
        const hero = R.HERO_CATALOG.find((h) => h.id === meta.heroId) || { id: meta.heroId, name: meta.heroId, emoji: '✨', type: 'hero', rarity: meta.rarity, weapon: '', skill: '', ultimate: '' };
        prize = { kind: 'hero', rarity: meta.rarity, hero };
      } else {
        prize = { kind: 'resource', rarity: meta.rarity, resource: meta.resource, amount: meta.amount };
      }
      return {
        prize,
        pity: inv.heroPity,
        duplicateHero: !!meta.dupe,
        refund: meta.dupe ? Math.floor(cost * (R.HERO_SUMMON.duplicateRefundFraction[meta.rarity] || 0)) : 0,
        batchId: meta.batchId || null,
        inventory: inv,
        wallet: wallet(user.id),
        repeat: true,
      };
    }
    if (count === 10 && forcedSummons.has(user.id)) {
      const scenario = forcedSummons.get(user.id);
      forcedSummons.delete(user.id);
      const batchId = newId('preview');
      const heroes = R.HERO_CATALOG;
      const owned = new Set(inv.heroes);
      const refundFor = (rarity) => Math.floor(cost * (R.HERO_SUMMON.duplicateRefundFraction[rarity] || 0));
      const fixtureHero = (hero, rarity, isNew) => ({ type: 'hero', heroId: hero.id, hero, rarity, amount: null, isNew, refundCoins: isNew ? 0 : refundFor(rarity) });
      const fixtureResource = (resource, amount) => ({ type: 'resource', resource, amount, rarity: 'common', isNew: false, refundCoins: 0 });
      let results;
      if (scenario === 'all-resources') {
        const keys = Object.keys(E.RESOURCES);
        results = Array.from({ length: 10 }, (_, i) => fixtureResource(keys[i % keys.length], R.HERO_SUMMON.commonResourceAmount));
      } else if (scenario === 'three-new-heroes') {
        const fresh = heroes.slice(0, 3); // fixture only; previews never alter ownership
        results = Array.from({ length: 10 }, (_, i) => i < fresh.length ? fixtureHero(fresh[i], i === 0 ? 'epic' : 'rare', true) : fixtureResource(Object.keys(E.RESOURCES)[i % Object.keys(E.RESOURCES).length], R.HERO_SUMMON.commonResourceAmount));
      } else {
        const hero = heroes.find((item) => owned.has(item.id)) || heroes[0];
        results = Array.from({ length: 10 }, (_, i) => i === 0 ? fixtureHero(hero, 'epic', false) : i === 1 ? fixtureHero(hero, 'rare', false) : fixtureResource(Object.keys(E.RESOURCES)[i % Object.keys(E.RESOURCES).length], R.HERO_SUMMON.commonResourceAmount));
      }
      return { results: results.map((item, index) => ({ ...item, rollIndex: index + 1, batchId })), count: 10, batchId, pity: inv.heroPity, inventory: inv, wallet: wallet(user.id), debugPreview: true };
    }
    const pay = R.spend(db, user.id, totalCost, `Hero Summon ×${count}`, refKey, now());
    if (!pay.ok) fail(400, pay.error);
    const batchId = newId('batch');
    const results = [];
    let legacyRoll = null;
    for (let index = 0; index < count; index++) {
      const roll = R.drawHeroSummon(inv.heroPity, undefined, inv.heroes);
      legacyRoll = roll;
      inv.heroPity = roll.pity;
      const item = { type: roll.prize.kind, rarity: roll.prize.rarity, batchId, rollIndex: index + 1, pity: roll.pity, amount: null, refundCoins: 0, isNew: false };
      if (roll.prize.kind === 'hero') {
        item.heroId = roll.prize.hero.id;
        item.hero = roll.prize.hero;
        if (inv.heroes.includes(roll.prize.hero.id)) {
          inv.heroDupes[roll.prize.hero.id] = (inv.heroDupes[roll.prize.hero.id] || 0) + 1;
          item.refundCoins = Math.floor(cost * (R.HERO_SUMMON.duplicateRefundFraction[item.rarity] || 0));
          if (item.refundCoins > 0) db.ledger.push({ id: newId('tx'), studentId: user.id, kind: 'refund', amount: item.refundCoins, reason: `Duplicate ${roll.prize.hero.name} refund`, refKey: `${refKey}:refund:${index + 1}`, at: now() });
        } else { inv.heroes.push(roll.prize.hero.id); item.isNew = true; }
      } else {
        item.resource = roll.prize.resource;
        item.amount = roll.prize.amount;
        inv.resources[roll.prize.resource] = (inv.resources[roll.prize.resource] || 0) + roll.prize.amount;
      }
      results.push(item);
    }
    const spendMeta = { count, batchId, results: results.map(({ hero, ...item }) => item) };
    // Preserve the original single-pull shape for older callers and the existing machine.
    if (count === 1) Object.assign(spendMeta, { kind: results[0].type, rarity: results[0].rarity, heroId: results[0].heroId, resource: results[0].resource, amount: results[0].amount, dupe: results[0].type === 'hero' && !results[0].isNew });
    db.ledger.find((t) => t.refKey === refKey).meta = spendMeta;
    save({ analytics: false });
    if (count === 1) return { prize: legacyRoll.prize, pity: legacyRoll.pity, duplicateHero: !results[0].isNew && results[0].type === 'hero', refund: results[0].refundCoins, batchId, inventory: inv, wallet: wallet(user.id), results };
    return { results, count, batchId, pity: legacyRoll.pity, inventory: inv, wallet: wallet(user.id) };
  });

  route('GET', '/api/student/hero-summon/history', 'student', ({ user, query }) => {
    const pageValue = Number.parseInt(query.get('page') || '1', 10);
    const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
    const pulls = db.ledger
      .filter((entry) => entry.studentId === user.id && entry.refKey?.startsWith(`hero-summon:${user.id}:`) && !entry.refKey.includes(':refund'))
      .slice()
      .reverse();
    const flattened = pulls.flatMap((entry) => {
      const meta = entry.meta || {};
      if (Array.isArray(meta.results)) return meta.results.map((result, index) => ({ entry, meta: result, batchId: meta.batchId || result.batchId || null, id: `${entry.id}:${index}`, rollIndex: result.rollIndex || index + 1 }));
      return [{ entry, meta, batchId: meta.batchId || null, id: entry.id, rollIndex: 1 }];
    });
    const total = flattened.length;
    const totalPages = Math.max(1, Math.ceil(total / SUMMON_HISTORY_PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const items = flattened.slice((safePage - 1) * SUMMON_HISTORY_PAGE_SIZE, safePage * SUMMON_HISTORY_PAGE_SIZE).map(({ entry, meta, batchId, id, rollIndex }) => {
      const kind = meta.kind || meta.type;
      const hero = kind === 'hero' ? R.HERO_CATALOG.find((item) => item.id === meta.heroId) || null : null;
      return {
        id,
        at: entry.at,
        rollIndex,
        batchId,
        type: kind || 'legacy',
        heroId: meta.heroId || null,
        hero,
        resource: meta.resource || null,
        amount: meta.amount || null,
        rarity: meta.rarity || null,
        isNew: kind === 'hero' && (meta.isNew ?? !meta.dupe),
        duplicate: kind === 'hero' && !(meta.isNew ?? !meta.dupe),
        refundCoins: meta.refundCoins ?? (meta.dupe ? Math.floor(R.HERO_SUMMON.pullCost * (R.HERO_SUMMON.duplicateRefundFraction[meta.rarity] || 0)) : 0),
      };
    });
    const summary = { totalPulls: total, common: 0, rare: 0, epic: 0 };
    for (const { meta } of flattened) {
      const rarity = meta.rarity;
      if (Object.hasOwn(summary, rarity)) summary[rarity] += 1;
    }
    return { items, page: safePage, pageSize: SUMMON_HISTORY_PAGE_SIZE, total, totalPages, summary };
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
    save({ analytics: false });
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

  // ---------------- student: avatar customization ----------------
  route('POST', '/api/student/avatar/color', 'student', ({ user, body }) => {
    user.avatarColor = validatedAvatarColor(body.color);
    save({ analytics: false });
    return { avatarColor: user.avatarColor, avatarVisual: avatarAppearance(user) };
  });

  route('GET', '/api/student/castle/wardrobe', 'student', ({ user }) => {
    const inventory = wardrobeInventory(user);
    return { ...wardrobeView(user, inventory), resources: { ...E.resources(db, user.id) } };
  });

  // Wardrobe ownership, loadout, request receipts, and resource balances share
  // the existing inventory row (including its JSONB `extra` field). The snapshot
  // store remains the sole database writer for these entities.
  route('POST', '/api/student/castle/wardrobe/purchase', 'student', ({ user, body }) => {
    const cosmeticId = str(body.cosmeticId, 64, 'Cosmetic');
    const item = AVATAR_COSMETIC_BY_ID[cosmeticId];
    if (!item || !['hat', 'accessory'].includes(item.slot) || !item.active) fail(400, 'That cosmetic is unavailable.');
    const rid = requestId(body.requestId);
    const inventory = wardrobeInventory(user);
    const state = wardrobeState(user, inventory);
    const prior = Object.hasOwn(state.requests, rid) ? state.requests[rid] : null;
    if (prior) {
      if (prior.cosmeticId !== cosmeticId) fail(409, 'This wardrobe request was already used for another item.');
      let repairedLog = false;
      if (prior.refKey && Object.hasOwn(E.RESOURCES, prior.currency) && Number.isSafeInteger(prior.cost) && prior.cost > 0 && !db.resourceLog.some((entry) => entry.refKey === prior.refKey)) {
        db.resourceLog.push({ id: newId('rl'), studentId: user.id, kind: 'cosmetic', delta: { [prior.currency]: -prior.cost }, reason: `Wardrobe: ${item.name}`, refKey: prior.refKey, at: now(), cosmeticId });
        repairedLog = true;
      }
      if (repairedLog) save({ analytics: false });
      return { ok: true, cosmeticId, owned: true, alreadyOwned: Boolean(prior.alreadyOwned), repeated: true, ...wardrobeView(user, inventory), resources: { ...E.resources(db, user.id) } };
    }
    const alreadyOwned = state.ownedCosmetics.includes(cosmeticId);
    const refKey = `wardrobe:${user.id}:${rid}`;
    const priorSpend = db.resourceLog.find((entry) => entry.refKey === refKey);
    if (priorSpend && (priorSpend.studentId !== user.id || priorSpend.kind !== 'cosmetic' || priorSpend.cosmeticId !== cosmeticId))
      fail(409, 'This wardrobe request was already used for another purchase.');
    if (alreadyOwned && !priorSpend) return { ok: true, cosmeticId, owned: true, alreadyOwned: true, ...wardrobeView(user, inventory), resources: { ...E.resources(db, user.id) } };

    let chargeCurrency = item.currency;
    let chargeAmount = item.cost;
    if (priorSpend) {
      const loggedCost = Object.entries(priorSpend.delta || {}).filter(([, amount]) => Number.isSafeInteger(amount) && amount !== 0);
      if (loggedCost.length !== 1 || loggedCost[0][1] >= 0) fail(409, 'This wardrobe purchase receipt is invalid.');
      chargeCurrency = loggedCost[0][0];
      chargeAmount = -loggedCost[0][1];
    }

    if (chargeAmount > 0) {
      if (!Object.hasOwn(E.RESOURCES, chargeCurrency) || !Number.isSafeInteger(chargeAmount) || chargeAmount < 0) fail(400, 'That cosmetic has an invalid price.');
      const resources = E.resources(db, user.id);
      if ((resources[chargeCurrency] || 0) < chargeAmount) fail(400, `You need ${chargeAmount} ${E.RESOURCES[chargeCurrency].name.toLowerCase()} to add this cosmetic.`);
      resources[chargeCurrency] = (resources[chargeCurrency] || 0) - chargeAmount;
      if (!priorSpend) db.resourceLog.push({ id: newId('rl'), studentId: user.id, kind: 'cosmetic', delta: { [chargeCurrency]: -chargeAmount }, reason: `Wardrobe: ${item.name}`, refKey, at: now(), cosmeticId });
    }

    const ownedIds = alreadyOwned ? state.ownedCosmetics : [...state.ownedCosmetics, cosmeticId];
    inventory.avatarWardrobe = {
      ownedIds, hatId: state.hatId, accessoryId: state.accessoryId,
      requests: { ...state.requests, [rid]: { cosmeticId, alreadyOwned, refKey: chargeAmount > 0 ? refKey : null, currency: chargeCurrency, cost: chargeAmount } },
    };
    save({ analytics: false });
    return { ok: true, cosmeticId, owned: true, alreadyOwned, ...wardrobeView(user, inventory), resources: { ...E.resources(db, user.id) } };
  });

  route('PUT', '/api/student/castle/wardrobe/loadout', 'student', ({ user, body }) => {
    const inventory = wardrobeInventory(user);
    const state = wardrobeState(user, inventory);
    const hatId = body.hatId === undefined ? state.hatId : body.hatId;
    if (hatId !== null && (!AVATAR_COSMETIC_BY_ID[hatId] || AVATAR_COSMETIC_BY_ID[hatId].slot !== 'hat' || !state.ownedHats.includes(hatId)))
      fail(400, 'You do not own that hat.');
    const accessoryId = body.accessoryId === undefined ? state.accessoryId : body.accessoryId;
    if (accessoryId !== null && (!AVATAR_COSMETIC_BY_ID[accessoryId] || AVATAR_COSMETIC_BY_ID[accessoryId].slot !== 'accessory' || !state.ownedAccessories.includes(accessoryId)))
      fail(400, 'You do not own that accessory.');
    const colorId = body.colorId === undefined ? wardrobeView(user, inventory).equipped.colorId : body.colorId;
    const defaultColorId = AVATAR_COSMETIC_CATALOG.find((item) => item.slot === 'color' && item.renderValue === TOWN_AVATAR_DEFAULT_COLOR)?.id;
    const color = AVATAR_COSMETIC_BY_ID[colorId || defaultColorId];
    const legacyColor = legacyColorItem(user);
    const keepLegacyColor = !!legacyColor && legacyColor.id === colorId;
    if (keepLegacyColor) {
      // Preserve a valid color saved by the older custom-color picker.
    } else {
      if (!color || color.slot !== 'color' || !color.active || !state.ownedIds.includes(color.id)) fail(400, 'Choose an available avatar color.');
      user.avatarColor = validatedAvatarColor(color.renderValue);
    }
    inventory.avatarWardrobe = { ownedIds: state.ownedCosmetics, hatId, accessoryId, requests: state.requests };
    save({ analytics: false });
    return { ...wardrobeView(user, inventory), avatarColor: user.avatarColor, resources: { ...E.resources(db, user.id) } };
  });

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
    save({ analytics: false });
    return { buildings: r.kingdom.buildings, castleLevel: E.castleLevel(r.kingdom), resources: E.resources(db, user.id) };
  });

  // ---------------- student: trading ----------------
  route('GET', '/api/student/classes/:classId/trades', 'student', ({ user, params }) => {
    const cls = studentClass(user, params.classId);
    if (E.kingdom(db, user.id).buildings.tower < 1) fail(403, 'Build the Tower to level 1 to unlock class trading.');
    const list = db.trades.filter((t) => t.classId === cls.id);
    if (!cls.settings.tradingEnabled) return { enabled: false, unlocked: true, limits: E.TRADE, resources: E.resources(db, user.id), market: [], mine: [], history: [] };
    const openNotes = list.filter((t) => t.status === 'open').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
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
      unlocked: true,
      limits: E.TRADE,
      resources: E.resources(db, user.id),
      market: openNotes.filter((t) => t.fromId !== user.id && isEnrolled(t.fromId, cls.id) && E.kingdom(db, t.fromId).buildings.tower >= 1).map(view),
      mine: openNotes.filter((t) => t.fromId === user.id).map(view),
      history: list
        .filter((t) => t.status !== 'open' && (t.fromId === user.id || t.acceptedBy === user.id))
        .slice(-10)
        .reverse()
        .map(view),
    };
  });

  route('POST', '/api/student/classes/:classId/trades', 'student', ({ user, params, body }) => {
    const cls = studentClass(user, params.classId);
    if (E.kingdom(db, user.id).buildings.tower < 1) fail(403, 'Build the Tower to level 1 to unlock class trading.');
    const r = E.createTrade(db, { cls, studentId: user.id, give: body.give, want: body.want, requestId: requestId(body.requestId), now: now() });
    if (!r.ok) fail(400, r.error);
    save({ analytics: false });
    return [201, { id: r.trade.id }];
  });

  route('POST', '/api/student/trades/:tid/accept', 'student', ({ user, params, body }) => {
    const t = db.trades.find((x) => x.id === params.tid) || fail(404, 'Not found.');
    const rid = requestId(body.requestId);
    const replay = t.status === 'accepted' && t.acceptedBy === user.id && t.acceptRequestId === rid;
    const cls = replay ? db.classes.find((x) => x.id === t.classId) || fail(404, 'Not found.') : studentClass(user, t.classId);
    if (!replay) {
      if (E.kingdom(db, user.id).buildings.tower < 1) fail(403, 'Build the Tower to level 1 to unlock class trading.');
      if (!isEnrolled(t.fromId, cls.id)) fail(409, 'This offer is no longer available because its creator left the class.');
      if (E.kingdom(db, t.fromId).buildings.tower < 1) fail(409, 'This offer is no longer available because its creator no longer has an active Tower.');
    }
    const r = E.acceptTrade(db, { cls, trade: t, studentId: user.id, requestId: rid, now: now() });
    if (!r.ok) fail(409, r.error);
    save({ analytics: false });
    return { ok: true, resources: E.resources(db, user.id) };
  });

  route('POST', '/api/student/trades/:tid/cancel', 'student', ({ user, params, body }) => {
    const t = db.trades.find((x) => x.id === params.tid && x.fromId === user.id) || fail(404, 'Not found.');
    const rid = requestId(body.requestId);
    const replay = t.status === 'cancelled' && t.cancelRequestId === rid;
    const cls = replay ? db.classes.find((x) => x.id === t.classId) || fail(404, 'Not found.') : studentClass(user, t.classId);
    if (!replay && E.kingdom(db, user.id).buildings.tower < 1) fail(403, 'Build the Tower to level 1 to manage class trades.');
    const r = E.cancelTrade(db, { cls, trade: t, requestId: rid, now: now() });
    if (!r.ok) fail(409, r.error);
    save({ analytics: false });
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
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req, r.limit) : {};
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
