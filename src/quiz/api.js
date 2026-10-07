// ============================================================
// QuizQuest JSON API
// ------------------------------------------------------------
// Plain node:http routing, same spirit as server.js. Every route
// declares which role may call it, and every handler re-checks that
// the user actually belongs to the class/course they are touching:
//   - teachers only see courses/classes they are assigned to
//   - students only see classes they are enrolled in
//   - students never receive answer keys before answering, nor drafts
//   - grading and coins are computed here, never trusted from clients
//
// DEMO AUTH: /api/login lets you pick a synthetic user with no
// password. That is for the prototype only - the real build would use
// Supabase Auth, with teacher status assigned by an admin.
// ============================================================

const crypto = require('crypto');
const { createStore } = require('./store');
const { validateQuestion } = require('./validate');
const { generate, GEN } = require('./generator');
const { ADAPTIVE, topicStats, planSession } = require('./adaptive');
const { classAnalytics } = require('./analytics');
const R = require('./rewards');

const BODY_LIMIT = 100 * 1024;   // bytes
const PASSAGE_LIMIT = 20000;     // characters per pasted passage
const TOKEN_TTL = 8 * 3600 * 1000;
const SESSION_LENGTHS = [5, 8, 10, 15];
const TIMERS = [0, 30, 60, 90];  // seconds per question; 0 = untimed
const ACCOMMODATION = [1, 1.5, 2];
const TIMER_GRACE_MS = 3000;     // network slack before the server calls time

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

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new HttpError(413, 'Request too large.'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(body && typeof body === 'object' && !Array.isArray(body) ? body : {});
      } catch {
        reject(new HttpError(400, 'Invalid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

const str = (v, max, name) => {
  if (typeof v !== 'string' || !v.trim()) fail(400, `${name} is required.`);
  if (v.length > max) fail(400, `${name} is too long (max ${max} characters).`);
  return v.trim();
};

function createQuizApi({ dataFile = null, now = () => Date.now(), drafter = null } = {}) {
  const { db, save } = createStore(dataFile);
  const tokens = new Map(); // token -> { userId, expires }

  // ---------- lookups that double as access checks ----------
  // 404 (not 403) when the user isn't allowed, so ids of other classes
  // can't be probed for existence.
  const teacherCourse = (user, courseId) => db.courses.find((c) => c.id === courseId && c.teacherIds.includes(user.id)) || fail(404, 'Not found.');
  const teacherClass = (user, classId) => db.classes.find((c) => c.id === classId && c.teacherIds.includes(user.id)) || fail(404, 'Not found.');
  const teacherQuestion = (user, qid) => {
    const q = db.questions.find((x) => x.id === qid) || fail(404, 'Not found.');
    teacherCourse(user, q.courseId);
    return q;
  };
  const studentClass = (user, classId) => {
    if (!db.enrolments.some((e) => e.classId === classId && e.studentId === user.id)) fail(404, 'Not found.');
    return db.classes.find((c) => c.id === classId);
  };
  const studentSession = (user, sid) => db.sessions.find((s) => s.id === sid && s.studentId === user.id) || fail(404, 'Not found.');

  const topicsOf = (courseId) => db.topics.filter((t) => t.courseId === courseId);
  const publishedVersion = (q) => q.versions.find((v) => v.v === q.publishedVersion);
  const passageRefs = (ids) => ids.map((id) => db.passages.find((p) => p.id === id)).filter(Boolean).map((p) => ({ id: p.id, title: p.title }));

  // Shape a question for the teacher UI (full detail incl. answers)
  function teacherView(q) {
    const latest = q.versions.at(-1);
    const attempts = db.attempts.filter((a) => a.questionId === q.id);
    return {
      id: q.id, topicId: q.topicId, outcomeId: q.outcomeId, status: q.status, origin: q.origin,
      generationId: q.generationId, publishedVersion: q.publishedVersion, latest,
      versions: q.versions.map((v) => ({ v: v.v, editedAt: v.editedAt, publishedAt: v.publishedAt || null, attempts: attempts.filter((a) => a.version === v.v).length })),
      sources: passageRefs(latest.sourceIds),
      // reports are shown without the reporter's identity
      reports: q.reports.map((r) => ({ id: r.id, reason: r.reason, at: r.at, resolved: r.resolved })),
    };
  }

  function checkQuestion(course, body, ignoreId) {
    const allowed = new Set(db.passages.filter((p) => p.courseId === course.id).map((p) => p.id));
    const existingStems = db.questions.filter((q) => q.courseId === course.id && q.status !== 'rejected').map((q) => ({ id: q.id, stem: q.versions.at(-1).stem }));
    const r = validateQuestion(body, { allowedSourceIds: allowed, requireSource: false, existingStems, ignoreId });
    if (r.errors.length) throw Object.assign(new HttpError(400, r.errors.join(' ')), { details: r.errors });
    return r;
  }

  function topicAndOutcome(course, topicId, outcomeId) {
    const topic = topicsOf(course.id).find((t) => t.id === topicId) || fail(400, 'Unknown topic.');
    const outcome = topic.outcomes.find((o) => o.id === outcomeId) || fail(400, 'Unknown learning outcome.');
    return { topic, outcome };
  }

  function wallet(studentId) {
    return { balance: R.balance(db, studentId), earnedToday: R.earnedOnDay(db, studentId, now()), dailyCap: R.REWARDS.dailyCap };
  }

  // ============================================================
  // ROUTES: [method, path pattern, role ('any'|'teacher'|'student'|null=public), handler]
  // ============================================================
  const routes = [];
  const route = (method, pattern, role, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([\\w-]+)')) + '$');
    routes.push({ method, re, keys, role, handler });
  };

  // ---------------- auth (demo) ----------------
  route('GET', '/api/demo-users', null, () => {
    const label = (u) => {
      if (u.role === 'teacher') return db.classes.filter((c) => c.teacherIds.includes(u.id)).map((c) => c.name).join(', ');
      const cls = db.enrolments.filter((e) => e.studentId === u.id).map((e) => db.classes.find((c) => c.id === e.classId).name);
      const hist = db.attempts.some((a) => a.studentId === u.id);
      return cls.join(', ') + (hist ? '' : ' - no history yet');
    };
    return db.users.map((u) => ({ id: u.id, name: u.name, role: u.role, note: label(u) }));
  });

  route('POST', '/api/login', null, ({ body }) => {
    const user = db.users.find((u) => u.id === body.userId) || fail(400, 'Unknown demo user.');
    const token = crypto.randomBytes(24).toString('hex');
    tokens.set(token, { userId: user.id, expires: now() + TOKEN_TTL });
    return { token, user };
  });

  route('POST', '/api/logout', 'any', ({ token }) => {
    tokens.delete(token);
    return { ok: true };
  });

  route('GET', '/api/me', 'any', ({ user }) => user);

  // ---------------- teacher: content ----------------
  route('GET', '/api/teacher/courses', 'teacher', ({ user }) =>
    db.courses.filter((c) => c.teacherIds.includes(user.id)).map((c) => ({
      id: c.id, title: c.title, coverageTarget: c.coverageTarget,
      drafter: drafter ? 'Custom drafter' : process.env.GEMINI_API_KEY ? `Gemini (${process.env.GEMINI_MODEL || 'gemini-2.5-flash'})` : 'Offline template drafter (stand-in for Gemini)',
      topics: topicsOf(c.id),
      classes: db.classes.filter((cl) => cl.courseId === c.id && cl.teacherIds.includes(user.id)).map((cl) => ({ id: cl.id, name: cl.name })),
      drafts: db.questions.filter((q) => q.courseId === c.id && q.status === 'draft').length,
      openReports: db.questions.filter((q) => q.courseId === c.id).reduce((n, q) => n + q.reports.filter((r) => !r.resolved).length, 0),
    })));

  route('GET', '/api/teacher/courses/:cid/passages', 'teacher', ({ user, params }) => {
    const c = teacherCourse(user, params.cid);
    return db.passages.filter((p) => p.courseId === c.id).map((p) => ({ ...p, usedBy: db.questions.filter((q) => q.versions.at(-1).sourceIds.includes(p.id)).length }));
  });

  route('POST', '/api/teacher/courses/:cid/passages', 'teacher', ({ user, params, body }) => {
    const c = teacherCourse(user, params.cid);
    const { topic, outcome } = topicAndOutcome(c, body.topicId, body.outcomeId);
    const p = { id: newId('p'), courseId: c.id, topicId: topic.id, outcomeId: outcome.id, title: str(body.title, 120, 'Title'), text: str(body.text, PASSAGE_LIMIT, 'Passage text'), createdBy: user.id, createdAt: now() };
    db.passages.push(p);
    save();
    return [201, p];
  });

  // Deletion supports the "material retention" policy the team will set.
  // Questions keep their sourceIds; the UI then shows "source removed".
  route('DELETE', '/api/teacher/passages/:pid', 'teacher', ({ user, params }) => {
    const p = db.passages.find((x) => x.id === params.pid) || fail(404, 'Not found.');
    teacherCourse(user, p.courseId);
    db.passages.splice(db.passages.indexOf(p), 1);
    save();
    return { ok: true };
  });

  // ---------------- teacher: question bank ----------------
  route('GET', '/api/teacher/courses/:cid/questions', 'teacher', ({ user, params }) => {
    const c = teacherCourse(user, params.cid);
    return db.questions.filter((q) => q.courseId === c.id).map(teacherView);
  });

  route('POST', '/api/teacher/courses/:cid/questions', 'teacher', ({ user, params, body }) => {
    const c = teacherCourse(user, params.cid);
    const { topic, outcome } = topicAndOutcome(c, body.topicId, body.outcomeId);
    const { q, warnings } = checkQuestion(c, body, null);
    const t = now();
    const publish = body.publish === true;
    const question = {
      id: newId('q'), courseId: c.id, topicId: topic.id, outcomeId: outcome.id, status: publish ? 'published' : 'draft', origin: 'manual', generationId: null,
      createdAt: t, createdBy: user.id, publishedVersion: publish ? 1 : null, reports: [],
      versions: [{ v: 1, ...q, warnings, editedAt: t, editedBy: user.id, publishedAt: publish ? t : null }],
    };
    db.questions.push(question);
    save();
    return [201, teacherView(question)];
  });

  // Edit. Once a version has been published (students may have answered
  // it) it is frozen, and edits create a NEW version - so old attempts
  // stay interpretable against the text the student actually saw.
  route('PUT', '/api/teacher/questions/:qid', 'teacher', ({ user, params, body }) => {
    const q = teacherQuestion(user, params.qid);
    const c = db.courses.find((x) => x.id === q.courseId);
    const { q: clean, warnings } = checkQuestion(c, body, q.id);
    const latest = q.versions.at(-1);
    const t = now();
    const answered = db.attempts.some((a) => a.questionId === q.id && a.version === latest.v);
    if (latest.publishedAt || answered) {
      const v = { v: latest.v + 1, ...clean, warnings, editedAt: t, editedBy: user.id, publishedAt: q.status === 'published' ? t : null };
      q.versions.push(v);
      if (q.status === 'published') q.publishedVersion = v.v;
    } else {
      Object.assign(latest, clean, { warnings, editedAt: t, editedBy: user.id });
    }
    save();
    return teacherView(q);
  });

  route('POST', '/api/teacher/questions/:qid/status', 'teacher', ({ user, params, body }) => {
    const q = teacherQuestion(user, params.qid);
    const latest = q.versions.at(-1);
    const t = now();
    const allowed = { approve: ['draft', 'rejected'], reject: ['draft'], withdraw: ['published'], republish: ['withdrawn'] };
    if (!allowed[body.action]) fail(400, 'Unknown action.');
    if (!allowed[body.action].includes(q.status)) fail(409, `Cannot ${body.action} a ${q.status} question.`);
    if (body.action === 'approve' || body.action === 'republish') {
      // re-run the structural checks on what is about to go live
      checkQuestion(db.courses.find((x) => x.id === q.courseId), latest, q.id);
      latest.publishedAt = latest.publishedAt || t;
      q.publishedVersion = latest.v;
      q.status = 'published';
    } else if (body.action === 'reject') {
      q.status = 'rejected';
    } else {
      q.status = 'withdrawn';
    }
    q.reviewedBy = user.id;
    q.reviewedAt = t;
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

  // ---------------- teacher: generation ----------------
  route('GET', '/api/teacher/courses/:cid/coverage', 'teacher', ({ user, params }) => {
    const c = teacherCourse(user, params.cid);
    const qs = db.questions.filter((q) => q.courseId === c.id);
    return topicsOf(c.id).flatMap((t) => t.outcomes.map((o) => {
      const mine = qs.filter((q) => q.outcomeId === o.id);
      const published = mine.filter((q) => q.status === 'published').length;
      return {
        topicId: t.id, topic: t.name, outcomeId: o.id, outcome: o.text,
        published, drafts: mine.filter((q) => q.status === 'draft').length,
        passages: db.passages.filter((p) => p.outcomeId === o.id).length,
        target: c.coverageTarget, gap: Math.max(0, c.coverageTarget - published),
      };
    }));
  });

  route('POST', '/api/teacher/courses/:cid/generate', 'teacher', async ({ user, params, body }) => {
    const c = teacherCourse(user, params.cid);
    const { topic, outcome } = topicAndOutcome(c, body.topicId, body.outcomeId);
    const r = await generate({ db, course: c, topic, outcome, count: body.count, force: body.force === true, userId: user.id, now: now(), drafter });
    save();
    return [r.status, r.body];
  });

  route('GET', '/api/teacher/courses/:cid/generations', 'teacher', ({ user, params }) => {
    const c = teacherCourse(user, params.cid);
    return db.generationLog.filter((g) => g.courseId === c.id).slice(-15).reverse()
      .map(({ rawOutput, hash, ...g }) => g); // eslint-disable-line no-unused-vars
  });

  route('GET', '/api/teacher/classes/:classId/analytics', 'teacher', ({ user, params }) => {
    teacherClass(user, params.classId);
    return classAnalytics(db, params.classId, now());
  });

  // ---------------- student: home & progress ----------------
  route('GET', '/api/student/home', 'student', ({ user }) => ({
    classes: db.enrolments.filter((e) => e.studentId === user.id).map((e) => {
      const cl = db.classes.find((c) => c.id === e.classId);
      return { id: cl.id, name: cl.name, course: db.courses.find((c) => c.id === cl.courseId).title };
    }),
    wallet: wallet(user.id),
    inventory: R.inventory(db, user.id),
    catalog: { pets: R.PETS, items: R.ITEMS, eggCost: R.REWARDS.eggCost, eggOdds: R.EGG_ODDS, duplicateRefund: R.REWARDS.duplicateRefund },
    rules: R.REWARDS,
    options: { lengths: SESSION_LENGTHS, timers: TIMERS, accommodation: ACCOMMODATION },
  }));

  route('GET', '/api/student/classes/:classId/progress', 'student', ({ user, params }) => {
    const cl = studentClass(user, params.classId);
    const topics = topicsOf(cl.courseId);
    const mine = db.attempts.filter((a) => a.studentId === user.id && a.classId === cl.id);
    const bank = db.questions.filter((q) => q.courseId === cl.courseId && q.status === 'published');
    const sessions = db.sessions.filter((s) => s.studentId === user.id && s.classId === cl.id && s.completedAt).slice(-5).reverse()
      .map((s) => ({ id: s.id, at: s.completedAt, total: s.items.length, correct: s.items.filter((i) => i.result?.correct).length }));
    return {
      topics: topicStats(mine, topics).map((s) => ({ ...s, bank: bank.filter((q) => q.topicId === s.topicId).length })),
      window: ADAPTIVE.recentWindow,
      sessions,
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
      id: newId('ses'), studentId: user.id, classId: cl.id, courseId: cl.courseId, createdAt: now(),
      timerSec: Math.round(body.timerSec * mult), mode: plan.mode,
      plan: { weakTopicIds: plan.weakTopicIds, notes: plan.notes },
      items: plan.questionIds.map((qid) => ({ qid, v: db.questions.find((q) => q.id === qid).publishedVersion, servedAt: null, result: null })),
      cursor: 0, npc: { name: 'Fog of Confusion', emoji: '👾', maxHp: npcHp, hp: npcHp }, coins: 0, completedAt: null,
    };
    db.sessions.push(session);
    save();
    return [201, { id: session.id }];
  });

  // Current state + the next question WITHOUT its answer
  route('GET', '/api/student/sessions/:sid', 'student', ({ user, params }) => {
    const s = studentSession(user, params.sid);
    const out = { id: s.id, total: s.items.length, cursor: s.cursor, npc: s.npc, timerSec: s.timerSec, mode: s.mode, notes: s.plan.notes, done: !!s.completedAt, coins: s.coins };
    if (s.completedAt) return out;
    const item = s.items[s.cursor];
    if (!item.servedAt) {
      item.servedAt = now(); // response time is measured on the server
      save();
    }
    const q = db.questions.find((x) => x.id === item.qid);
    const v = q.versions.find((x) => x.v === item.v);
    out.question = {
      index: s.cursor, questionId: q.id, stem: v.stem, options: v.options, difficulty: v.difficulty,
      topic: db.topics.find((t) => t.id === q.topicId).name,
      remainingMs: s.timerSec ? Math.max(0, s.timerSec * 1000 - (now() - item.servedAt)) : null,
    };
    return out;
  });

  route('POST', '/api/student/sessions/:sid/answer', 'student', ({ user, params, body }) => {
    const s = studentSession(user, params.sid);
    const index = body.index;
    if (!Number.isInteger(index) || index < 0 || index >= s.items.length) fail(400, 'Bad question index.');
    const item = s.items[index];
    // Duplicate submit (double click, retry after a network blip): return
    // the stored outcome and pay nothing new.
    if (item.result) return { ...item.result, duplicate: true };
    if (index !== s.cursor || !item.servedAt) fail(409, 'That question is not the current one.');

    const q = db.questions.find((x) => x.id === item.qid);
    const v = q.versions.find((x) => x.v === item.v);
    const t = now();
    const ms = t - item.servedAt;
    let choice = Number.isInteger(body.choice) && body.choice >= 0 && body.choice < v.options.length ? body.choice : null;
    if (s.timerSec && ms > s.timerSec * 1000 + TIMER_GRACE_MS) choice = null; // server calls time
    const timedOut = choice === null;
    const correct = choice === v.answerIndex;
    const first = !db.attempts.some((a) => a.studentId === user.id && a.questionId === q.id);
    db.attempts.push({ id: newId('at'), sessionId: s.id, studentId: user.id, classId: s.classId, courseId: s.courseId, questionId: q.id, version: v.v, topicId: q.topicId, choice, correct, ms, timedOut, first, at: t });

    const rewards = [];
    const pay = (amount, reason, refKey) => {
      const r = R.award(db, user.id, amount, reason, refKey, t);
      if (!r.duplicate) rewards.push({ reason, granted: r.granted, capped: r.capped });
      s.coins += r.granted;
    };
    if (correct) {
      // keyed per question (not per version or session) => no farming
      pay(R.REWARDS.firstCorrect, 'Correct on a new question', `correct:${user.id}:${q.id}`);
      s.npc.hp = Math.max(0, s.npc.hp - 10);
      // milestone: topic practice indicator reaches the target
      const topic = db.topics.find((x) => x.id === q.topicId);
      const st = topicStats(db.attempts.filter((a) => a.studentId === user.id && a.classId === s.classId), [topic])[0];
      if (st.n >= R.REWARDS.milestoneMinN && st.accuracy >= R.REWARDS.milestoneAccuracy) {
        pay(R.REWARDS.milestone, `Practice milestone: ${topic.name}`, `milestone:${user.id}:${s.classId}:${topic.id}`);
      }
    }
    s.cursor++;
    if (s.cursor >= s.items.length) {
      s.completedAt = t;
      if (s.items.length >= R.REWARDS.minSessionForBonus) pay(R.REWARDS.sessionComplete, 'Completed a practice session', `session:${s.id}`);
    }

    const inv = R.inventory(db, user.id);
    const pet = R.PETS.find((p) => p.id === inv.equippedPet);
    item.result = {
      index, correct, choice, timedOut, answerIndex: v.answerIndex, explanation: v.explanation,
      sources: passageRefs(v.sourceIds), rewards, npc: { ...s.npc },
      attack: correct ? { pet: pet.emoji, move: pet.move, damage: 10 } : null,
      done: !!s.completedAt,
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
    return { total: s.items.length, correct: s.items.filter((i) => i.result.correct).length, coins: s.coins, npc: s.npc, byTopic, notes: s.plan.notes, wallet: wallet(user.id) };
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
    if (prev) return { pet: R.PETS.find((p) => p.id === prev.meta.petId), duplicatePet: prev.meta.dupe, inventory: R.inventory(db, user.id), wallet: wallet(user.id), repeat: true };
    const r = R.spend(db, user.id, R.REWARDS.eggCost, 'Opened an egg', refKey, now());
    if (!r.ok) fail(400, r.error);
    const pet = R.drawPet();
    const inv = R.inventory(db, user.id);
    const owned = inv.pets.find((p) => p.id === pet.id);
    if (owned) {
      owned.dupes++;
      db.ledger.push({ id: newId('tx'), studentId: user.id, kind: 'refund', amount: R.REWARDS.duplicateRefund, reason: `Duplicate ${pet.name} refund`, refKey: refKey + ':refund', at: now() });
    } else {
      inv.pets.push({ id: pet.id, dupes: 0 });
    }
    db.ledger.find((t) => t.refKey === refKey).meta = { petId: pet.id, dupe: !!owned };
    save();
    return { pet, duplicatePet: !!owned, inventory: inv, wallet: wallet(user.id) };
  });

  route('POST', '/api/student/equip', 'student', ({ user, body }) => {
    const inv = R.inventory(db, user.id);
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

  route('GET', '/api/student/ledger', 'student', ({ user }) =>
    db.ledger.filter((t) => t.studentId === user.id).slice(-30).reverse().map(({ refKey, meta, ...t }) => t)); // eslint-disable-line no-unused-vars

  // ============================================================
  // Dispatcher. Returns true if it handled the request.
  // ============================================================
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith('/api/')) return false;
    try {
      const match = routes.map((r) => ({ r, m: r.method === req.method && url.pathname.match(r.re) })).find((x) => x.m);
      if (!match) fail(404, 'Not found.');
      const { r, m } = match;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, m[i + 1]]));

      let user = null;
      let token = null;
      if (r.role) {
        token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const sess = tokens.get(token);
        if (!sess || sess.expires < now()) fail(401, 'Please sign in.');
        user = db.users.find((u) => u.id === sess.userId);
        if (r.role !== 'any' && user.role !== r.role) fail(403, 'Not allowed.');
      }
      const body = ['POST', 'PUT'].includes(req.method) ? await readJson(req) : {};
      const out = await r.handler({ req, params, body, user, token, query: url.searchParams });
      if (Array.isArray(out) && typeof out[0] === 'number') send(res, out[0], out[1]);
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

  return { handle, db, GEN };
}

module.exports = { createQuizApi };
