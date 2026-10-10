// ============================================================
// Quiz API tests: the security + integrity promises in the proposal
// ------------------------------------------------------------
// Boots the real server on a random port with an in-memory DB, then
// talks to it over HTTP like the browser would. Covers:
//   - answer keys / drafts never reach students (every format)
//   - cross-class isolation (teachers and students)
//   - duplicate submissions don't pay twice; no coin farming
//   - versioning, validation, maths templates, retrieval, generation
//   - free-response marking, trading escrow, kingdom, participation,
//     evaluation metrics
// Run with:  npm test
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../server');
const { planSession, topicStats } = require('../src/quiz/adaptive');
const { validateQuestion } = require('../src/quiz/validate');
const M = require('../src/quiz/mathexpr');
const { gradeSync } = require('../src/quiz/formats');
const { keywordGrade } = require('../src/quiz/grading');
const { retrieve } = require('../src/quiz/retrieval');

let srv;
let base;
const db = () => srv.quiz.db;

async function call(token, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers };
}
const login = async (userId) => (await call(null, 'POST', '/api/login', { userId })).body.token;

// The right answer for a served session item, looked up server-side
function correctSubmission(item) {
  const q = db().questions.find((x) => x.id === item.qid);
  const v = q.versions.find((x) => x.v === item.v);
  switch (v.type) {
    case 'param': return { choice: item.instance.answerIndex };
    case 'multi': return { choices: v.answerIndexes };
    case 'numeric': return { value: v.answer };
    case 'short': return { text: v.modelAnswer };
    default: return { choice: v.answerIndex };
  }
}

// Play a whole session; pick(item) returns the submission
async function playSession(token, classId, length, pick) {
  const s = await call(token, 'POST', '/api/student/sessions', { classId, length, timerSec: 0 });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  const results = [];
  for (;;) {
    const st = (await call(token, 'GET', `/api/student/sessions/${s.body.id}`)).body;
    if (st.done) break;
    const item = db().sessions.find((x) => x.id === s.body.id).items[st.question.index];
    const r = await call(token, 'POST', `/api/student/sessions/${s.body.id}/answer`, { index: st.question.index, ...pick(item, st.question) });
    results.push(r.body);
  }
  return { id: s.body.id, results };
}

// QQ_STORE=pglite runs this whole suite against the Supabase schema
// (supabase/migrations applied to PGlite, an in-process Postgres) through
// the Supabase store. quiz-pglite-test.js does that as part of `npm test`.
const PGLITE = process.env.QQ_STORE === 'pglite';
let pg = null;
let pgLog = null;
test.before(async () => {
  let opts = { dataFile: null };
  if (PGLITE) {
    const { openPglite, pgliteAdapter, quiet } = require('./support/pglite');
    const { createSyncedStore } = require('../src/db/supabase-store');
    pg = await openPglite();
    pgLog = quiet();
    opts = { store: await createSyncedStore({ adapter: pgliteAdapter(pg), logger: pgLog, saveDelay: 20 }) };
  }
  srv = start(0, opts);
  await new Promise((r) => srv.httpServer.once('listening', r));
  base = 'http://localhost:' + srv.httpServer.address().port;
});
test.after(() => {
  srv.io.close();
});

// ---------------- access & leakage ----------------
test('API requires sign-in and the right role', async () => {
  assert.equal((await call(null, 'GET', '/api/student/home')).status, 401);
  const student = await login('s-01');
  assert.equal((await call(student, 'GET', '/api/teacher/courses')).status, 403);
});

test('students never receive answer keys before answering, in any format', async () => {
  const t = await login('s-01');
  const leaks = ['answerIndex', 'answerIndexes', '"answer"', 'explanation', 'sourceIds', 'versions', 'modelAnswer', 'keyPoints', 'answerExpr', 'distractorExprs', 'tolerance'];
  const seenTypes = new Set();
  for (let round = 0; round < 4; round++) {
    const s = await call(t, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 15, timerSec: 0 });
    for (;;) {
      const st = await call(t, 'GET', `/api/student/sessions/${s.body.id}`);
      if (st.body.done) break;
      const raw = JSON.stringify(st.body);
      for (const key of leaks) assert.ok(!raw.includes(key), `leaked ${key} in ${raw.slice(0, 200)}`);
      const item = db().sessions.find((x) => x.id === s.body.id).items[st.body.question.index];
      seenTypes.add(db().questions.find((q) => q.id === item.qid).versions[0].type);
      await call(t, 'POST', `/api/student/sessions/${s.body.id}/answer`, { index: st.body.question.index, choice: 0 });
    }
  }
  assert.ok(seenTypes.size >= 3, 'several formats were exercised: ' + [...seenTypes]);
});

test('drafts are never served to students', async () => {
  const t = await login('s-02');
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    const { id } = await playSession(t, 'cl-a', 15, () => ({ choice: 0 }));
    for (const it of db().sessions.find((x) => x.id === id).items) seen.add(it.qid);
  }
  assert.ok(!seen.has('q-draft1'));
});

test('teachers cannot see other classes; students cannot join other classes', async () => {
  const profB = await login('t-b');
  assert.equal((await call(profB, 'GET', '/api/teacher/classes/cl-a/analytics')).status, 404);
  assert.equal((await call(profB, 'GET', '/api/teacher/classes/cl-a/marking')).status, 404);
  assert.equal((await call(profB, 'GET', '/api/teacher/courses/c-comp/evaluation')).status, 404);
  assert.equal((await call(profB, 'PUT', '/api/teacher/classes/cl-a/settings', { tradingEnabled: false })).status, 404);
  assert.equal((await call(profB, 'PUT', '/api/teacher/questions/q-d1', { stem: 'hijack this question please', options: ['a', 'b', 'c'], answerIndex: 0, explanation: 'x', difficulty: 'easy' })).status, 404);
  const studentB = await login('s-07');
  assert.equal((await call(studentB, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 })).status, 404);
  assert.equal((await call(studentB, 'GET', '/api/student/classes/cl-a/trades')).status, 404);
  const a = await login('s-01');
  const s = await call(a, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 });
  assert.equal((await call(studentB, 'GET', `/api/student/sessions/${s.body.id}`)).status, 404);
});

// ---------------- integrity ----------------
test('a duplicate answer submission returns the same result and pays nothing extra', async () => {
  const t = await login('s-04');
  const s = await call(t, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 });
  await call(t, 'GET', `/api/student/sessions/${s.body.id}`);
  const before = (await call(t, 'GET', '/api/student/home')).body.wallet.balance;
  const first = await call(t, 'POST', `/api/student/sessions/${s.body.id}/answer`, { index: 0, choice: 1 });
  const again = await call(t, 'POST', `/api/student/sessions/${s.body.id}/answer`, { index: 0, choice: 2 });
  const after = (await call(t, 'GET', '/api/student/home')).body.wallet.balance;
  assert.equal(again.body.duplicate, true);
  assert.deepEqual(again.body.reveal, first.body.reveal, 'second submit must not change the answer');
  assert.equal(after - before, first.body.rewards.reduce((n, r) => n + r.granted, 0));
});

test('repeating questions cannot farm coins (all formats, incl. maths variations)', async () => {
  const t = await login('s-08'); // stats class: 5 questions incl. param + numeric
  const one = await playSession(t, 'cl-b', 5, correctSubmission);
  assert.equal(one.results.length, 5);
  assert.ok(one.results.every((r) => r.correct), JSON.stringify(one.results.map((r) => r.reveal)));
  const two = await playSession(t, 'cl-b', 5, correctSubmission);
  assert.ok(two.results.every((r) => r.correct));
  const perAnswer = two.results.flatMap((r) => r.rewards).filter((r) => r.reason.startsWith('Correct')).length;
  assert.equal(perAnswer, 0, 'second time through the same questions earns no per-answer coins');
});

test('short bank is disclosed, not padded with unreviewed questions', async () => {
  const t = await login('s-07');
  const s = await call(t, 'POST', '/api/student/sessions', { classId: 'cl-b', length: 10, timerSec: 0 });
  const st = (await call(t, 'GET', `/api/student/sessions/${s.body.id}`)).body;
  assert.equal(st.total, 5);
  assert.ok(st.notes.some((n) => n.includes('No unreviewed questions')));
});

test('editing a published question creates a new version; old attempts keep theirs', async () => {
  const prof = await login('t-a');
  const q = db().questions.find((x) => x.id === 'q-n2');
  const before = q.versions.length;
  const v = q.versions.at(-1);
  const r = await call(prof, 'PUT', '/api/teacher/questions/q-n2', { ...v, stem: 'A video call has a clear picture but every reply arrives late. Which property of the connection is most likely the problem?' });
  assert.equal(r.status, 200);
  assert.equal(q.versions.length, before + 1);
  assert.equal(q.publishedVersion, before + 1);
  assert.ok(db().attempts.some((a) => a.questionId === 'q-n2' && a.version === 1));
});

test('withdrawn questions leave practice', async () => {
  const prof = await login('t-b');
  assert.equal((await call(prof, 'POST', '/api/teacher/questions/q-st3/status', { action: 'withdraw' })).status, 200);
  const t = await login('s-07');
  const s = await call(t, 'POST', '/api/student/sessions', { classId: 'cl-b', length: 5, timerSec: 0 });
  const ids = db().sessions.find((x) => x.id === s.body.id).items.map((i) => i.qid);
  assert.ok(!ids.includes('q-st3'));
  await call(prof, 'POST', '/api/teacher/questions/q-st3/status', { action: 'republish' });
});

test('a question withdrawn mid-session is skipped, and the session still finishes', async () => {
  const t = await login('s-08');
  const prof = await login('t-b');
  const s = await call(t, 'POST', '/api/student/sessions', { classId: 'cl-b', length: 5, timerSec: 0 });
  await call(t, 'GET', `/api/student/sessions/${s.body.id}`); // serves item 0
  const session = db().sessions.find((x) => x.id === s.body.id);
  const later = session.items[3].qid;
  await call(prof, 'POST', `/api/teacher/questions/${later}/status`, { action: 'withdraw' });
  const served = [];
  for (;;) {
    const st = (await call(t, 'GET', `/api/student/sessions/${s.body.id}`)).body;
    if (st.done) {
      assert.equal(st.total, 4);
      assert.ok(st.notes.some((n) => n.includes('withdrawn')));
      break;
    }
    served.push(st.question.questionId);
    await call(t, 'POST', `/api/student/sessions/${s.body.id}/answer`, { index: st.question.index, choice: 0 });
  }
  assert.ok(!served.includes(later));
  assert.equal((await call(t, 'GET', `/api/student/sessions/${s.body.id}/summary`)).status, 200);
  await call(prof, 'POST', `/api/teacher/questions/${later}/status`, { action: 'republish' });
});

test('saves are batched but still reach disk', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { createStore } = require('../src/quiz/store');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'qq-')), 'db.json');
  const store = createStore(file);
  store.db.users[0].name = 'Changed once';
  store.save();
  store.db.users[0].name = 'Changed twice';
  store.save(); // coalesced with the first
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).users[0].name, 'Changed twice');
  fs.rmSync(path.dirname(file), { recursive: true, force: true });
});

// ---------------- maths, formats, validation ----------------
test('maths expressions: correct results, and anything unsafe is a syntax error', () => {
  const ev = (s, scope = {}) => M.evaluate(M.parse(s), scope);
  assert.equal(ev('2^3^2'), 512); // right associative
  assert.equal(ev('-(a + b) * 2', { a: 1, b: 2 }), -6);
  assert.equal(ev('round(sqrt(2), 2)'), 1.41);
  assert.equal(ev('max(a, b, 7)', { a: 1, b: 9 }), 9);
  assert.equal(ev('a != b && a < 10', { a: 3, b: 4 }), true);
  for (const bad of ['process.exit()', 'constructor', 'a; b', 'eval("1")', 'this', '[1]', 'a = 2', 'x.y', 'require("fs")']) {
    assert.throws(() => M.evaluate(M.parse(bad), {}), (e) => e instanceof SyntaxError || e instanceof ReferenceError, bad);
  }
  assert.throws(() => ev('a + 1'), ReferenceError);
  // long-but-flat formulas are fine; only real nesting is limited
  assert.equal(ev(Array(40).fill('a').join(' + '), { a: 1 }), 40);
  assert.throws(() => M.parse('('.repeat(30) + '1' + ')'.repeat(30)), /nested too deeply/);
  assert.throws(() => ev('__proto__', Object.create(null)), ReferenceError);
});

test('maths templates: valid ones produce samples; broken ones are rejected', () => {
  const base = { type: 'param', stem: 'What is {a} + {b}?', explanation: '{a} + {b} = {answer}', difficulty: 'easy', sourceIds: ['p1'], decimals: 0, answerExpr: 'a + b', distractorExprs: ['a - b', 'a * b'], variables: [{ name: 'a', min: 2, max: 20, step: 1 }, { name: 'b', min: 2, max: 20, step: 1 }] };
  const opts = { allowedSourceIds: new Set(['p1']) };
  const ok = validateQuestion(base, opts);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.samples.length, 3);
  for (const s of ok.samples) assert.equal(Number(s.options[s.answerIndex]), s.values.a + s.values.b);
  assert.ok(validateQuestion({ ...base, answerExpr: 'a + c' }, opts).errors.some((e) => e.includes('"c"')));
  assert.ok(validateQuestion({ ...base, answerExpr: 'a +' }, opts).errors.some((e) => e.includes('Formula error')));
  // distractors always equal the answer -> unusable
  assert.ok(validateQuestion({ ...base, distractorExprs: ['b + a', 'a + b'] }, opts).errors.some((e) => e.includes('usable question')));
});

test('grading: multi needs the exact set, numeric uses tolerance, tf is binary', () => {
  const multi = { type: 'multi', options: ['a', 'b', 'c', 'd'], answerIndexes: [0, 2] };
  assert.equal(gradeSync(multi, null, { choices: [2, 0] }).correct, true);
  const partial = gradeSync(multi, null, { choices: [0] });
  assert.equal(partial.correct, false);
  assert.equal(partial.reveal.partial, 0.5);
  assert.equal(gradeSync(multi, null, { choices: [0, 1, 2] }).correct, false);
  const num = { type: 'numeric', answer: 3.14, tolerance: 0.01, unit: '' };
  assert.equal(gradeSync(num, null, { value: '3.145' }).correct, true);
  assert.equal(gradeSync(num, null, { value: '3.2' }).correct, false);
  assert.equal(gradeSync(num, null, { value: 'pi' }).correct, false);
  assert.equal(gradeSync({ type: 'tf', options: ['True', 'False'], answerIndex: 1 }, null, { choice: 1 }).correct, true);
});

test('short answers: keyword fallback scores key-point coverage', () => {
  const v = { keyPoints: ['UDP does not guarantee delivery', 'less delay or lower latency', 'fresh data matters more than late packets'] };
  const good = keywordGrade(v, "Because UDP doesn't guarantee delivery it has lower latency, and fresh data matters more than late packets.");
  assert.equal(good.score, 1);
  const weak = keywordGrade(v, 'Games are fun.');
  assert.equal(weak.score, 0);
});

test('validation catches structural problems', () => {
  const allowed = new Set(['p1']);
  const bad = validateQuestion({ type: 'mcq', stem: 'Which one?', options: ['A', 'a', ''], answerIndex: 5, explanation: '', difficulty: 'impossible', sourceIds: ['nope'] }, { allowedSourceIds: allowed });
  const text = bad.errors.join(' ');
  for (const frag of ['Duplicate option', 'Every option', 'Correct answer', 'explanation', 'Difficulty', 'does not exist']) assert.ok(text.includes(frag), frag);
  assert.ok(validateQuestion({ type: 'multi', stem: 'Pick all the right ones', options: ['a', 'b', 'c'], answerIndexes: [0, 1, 2], explanation: 'x', difficulty: 'easy', sourceIds: ['p1'] }, { allowedSourceIds: allowed }).errors.some((e) => e.includes('must be wrong')));
  assert.ok(validateQuestion({ type: 'numeric', stem: 'How many is it really?', answer: 'lots', explanation: 'x', difficulty: 'easy', sourceIds: ['p1'] }, { allowedSourceIds: allowed }).errors.some((e) => e.includes('number')));
});

// ---------------- retrieval & generation ----------------
test('retrieval: long material is chunked and the relevant chunk ranks first', () => {
  const filler = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(30);
  const passages = [
    { id: 'p1', title: 'Big chapter', topicId: 't1', outcomeId: 'o1', text: `${filler} Latency is the time it takes for data to travel from source to destination. ${filler}` },
    { id: 'p2', title: 'Other topic', topicId: 't2', outcomeId: 'o2', text: 'Latency appears here too but this is another topic entirely.' },
  ];
  const r = retrieve(passages, { topicId: 't1', outcomeId: 'o1', outcomeText: 'Explain latency', topicName: 'Networks' }, { maxChunks: 2 });
  assert.ok(r.length >= 1 && r.length <= 2);
  assert.ok(r[0].text.includes('Latency is the time'));
  assert.ok(r.every((c) => c.passageId === 'p1'), 'untagged passages are not used without focus keywords');
  const withFocus = retrieve(passages, { topicId: 't1', outcomeId: 'o1', outcomeText: 'Explain latency', topicName: 'Networks', focus: 'another topic' }, { maxChunks: 4, maxChars: 10000 });
  assert.ok(withFocus.some((c) => c.passageId === 'p2'));
});

test('generation: drafts only, structure-checked, cached; formats limited offline', async () => {
  const prof = await login('t-a');
  const body = { topicId: 'tp-sec', outcomeId: 'lo-sec-2', count: 3, format: 'mcq' };
  const r1 = await call(prof, 'POST', '/api/teacher/courses/c-comp/generate', body);
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.ok(r1.body.created.length > 0);
  assert.ok(r1.body.retrieved.length > 0);
  for (const id of r1.body.created) assert.equal(db().questions.find((q) => q.id === id).status, 'draft');
  assert.equal((await call(prof, 'POST', '/api/teacher/courses/c-comp/generate', body)).body.cached, true);
  const tf = await call(prof, 'POST', '/api/teacher/courses/c-comp/generate', { ...body, format: 'tf', count: 2 });
  assert.equal(tf.status, 200);
  for (const id of tf.body.created) assert.equal(db().questions.find((q) => q.id === id).versions[0].type, 'tf');
  const short = await call(prof, 'POST', '/api/teacher/courses/c-comp/generate', { ...body, format: 'short' });
  assert.equal(short.status, 400, 'offline drafter refuses formats it cannot write');
});

test('adaptive mix: ~70% weaker-topic questions once there is history', () => {
  const topics = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }, { id: 'C', name: 'C' }];
  const bank = topics.flatMap((t) => Array.from({ length: 10 }, (_, i) => ({ id: `${t.id}${i}`, topicId: t.id })));
  const attempts = [];
  let at = 0;
  for (const t of topics) for (let i = 0; i < 5; i++) attempts.push({ questionId: `${t.id}${i}`, topicId: t.id, correct: t.id !== 'B' || i === 0, at: at++, ms: 1000 });
  const plan = planSession({ bank, topics, stats: topicStats(attempts, topics), recentIds: [], length: 10 });
  assert.equal(plan.mode, 'adaptive');
  assert.deepEqual(plan.weakTopicIds, ['B']);
  assert.equal(plan.questionIds.filter((id) => id.startsWith('B')).length, 7);
  const fresh = planSession({ bank, topics, stats: topicStats([], topics), recentIds: [], length: 9 });
  assert.equal(fresh.mode, 'broad');
  for (const t of topics) assert.equal(fresh.questionIds.filter((id) => id.startsWith(t.id)).length, 3);
});

// ---------------- free response marking ----------------
test('short answers are provisional; the professor\'s mark wins and pays once', async () => {
  const t = await login('s-06');
  // play until the short-answer question comes up (it is in the Networking topic)
  let attempt = null;
  for (let i = 0; i < 8 && !attempt; i++) {
    await playSession(t, 'cl-a', 15, (item) => (db().questions.find((q) => q.id === item.qid).versions[0].type === 'short' ? { text: 'Games are fun.' } : { choice: 0 }));
    attempt = db().attempts.find((a) => a.studentId === 's-06' && a.questionId === 'q-x3');
  }
  assert.ok(attempt, 'short-answer question was served');
  assert.equal(attempt.needsReview, true);
  assert.equal(attempt.correct, false);
  const prof = await login('t-a');
  // the queue: every pending answer from current class members, with a total
  db().attempts.push({ ...attempt, id: 'at-left-class', studentId: 's-left' });
  const queue = (await call(prof, 'GET', '/api/teacher/classes/cl-a/marking')).body;
  assert.equal(queue.total, db().attempts.filter((a) => a.classId === 'cl-a' && a.needsReview && a.studentId !== 's-left').length);
  assert.equal(queue.items.length, Math.min(50, queue.total));
  assert.ok(!queue.items.some((m) => m.attemptId === 'at-left-class'), 'not from students who left the class');
  db().attempts.splice(db().attempts.findIndex((a) => a.id === 'at-left-class'), 1);
  const entry = queue.items.find((m) => m.attemptId === attempt.id);
  assert.ok(entry);
  assert.ok(!JSON.stringify(entry).includes('s-06'), 'marking queue is anonymous');
  const w = (await call(t, 'GET', '/api/student/home')).body.wallet;
  const m1 = await call(prof, 'POST', `/api/teacher/attempts/${attempt.id}/mark`, { correct: true });
  assert.equal(m1.body.paid, Math.min(10, Math.max(0, w.dailyCap - w.earnedToday)), 'pays first-correct coins (within the daily cap)');
  const m2 = await call(prof, 'POST', `/api/teacher/attempts/${attempt.id}/mark`, { correct: true });
  assert.equal(m2.body.paid, 0, 'marking twice does not pay twice');
  assert.equal(attempt.needsReview, false);
  // from the queue (expectPending), an answer someone already marked is refused
  const m3 = await call(prof, 'POST', `/api/teacher/attempts/${attempt.id}/mark`, { correct: false, expectPending: true });
  assert.equal(m3.status, 409);
  assert.equal(attempt.correct, true, 'the first mark stands');
});

// ---------------- economy ----------------
test('shop: double-clicked purchase charges once; egg odds disclosed', async () => {
  const t = await login('s-05');
  const home = (await call(t, 'GET', '/api/student/home')).body;
  assert.deepEqual(home.catalog.eggOdds, { common: 600, rare: 300, epic: 100 });
  const requestId = 'test-purchase-0001';
  const a = await call(t, 'POST', '/api/student/shop/buy', { itemId: 'tophat', requestId });
  const b = await call(t, 'POST', '/api/student/shop/buy', { itemId: 'tophat', requestId });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(home.wallet.balance - b.body.wallet.balance, 40);
});

test('kingdom: builds cost resources, repeat requests are idempotent', async () => {
  const t = await login('s-02');
  const k0 = (await call(t, 'GET', '/api/student/kingdom')).body;
  const wood = k0.resources.wood;
  assert.ok(wood >= 5, 'seeded sessions gave wood');
  const rid = 'build-request-001';
  const a = await call(t, 'POST', '/api/student/kingdom/build', { building: 'library', requestId: rid });
  const b = await call(t, 'POST', '/api/student/kingdom/build', { building: 'library', requestId: rid });
  assert.equal(a.body.buildings.library, 1);
  assert.equal(b.body.buildings.library, 1);
  assert.equal(b.body.resources.wood, wood - 5);
  assert.equal((await call(t, 'POST', '/api/student/kingdom/build', { building: 'tower', requestId: 'build-request-002' })).status, 400, 'no crystals yet');
});

test('trading: escrow, swap, limits, class isolation, and the professor off switch', async () => {
  const s4 = await login('s-04');
  const s5 = await login('s-05');
  const s7 = await login('s-07');
  const res = (id) => db().inventory.find((i) => i.studentId === id).resources;
  const before4 = { ...res('s-04') };
  const before5 = { ...res('s-05') };
  const offer = await call(s4, 'POST', '/api/student/classes/cl-a/trades', { give: { wood: 2 }, want: { herb: 1 } });
  assert.equal(offer.status, 201);
  assert.equal(res('s-04').wood, before4.wood - 2, 'offered wood is held in escrow');
  assert.equal((await call(s4, 'POST', `/api/student/trades/${offer.body.id}/accept`)).status, 409, 'cannot accept own offer');
  assert.equal((await call(s7, 'POST', `/api/student/trades/${offer.body.id}/accept`)).status, 404, 'other class cannot see it');
  const ok = await call(s5, 'POST', `/api/student/trades/${offer.body.id}/accept`);
  assert.equal(ok.status, 200);
  assert.equal(res('s-05').wood, before5.wood + 2);
  assert.equal(res('s-05').herb, before5.herb - 1);
  assert.equal(res('s-04').herb, before4.herb + 1);
  assert.equal((await call(s5, 'POST', `/api/student/trades/${offer.body.id}/accept`)).status, 409, 'cannot accept twice');
  assert.equal((await call(s4, 'POST', '/api/student/classes/cl-a/trades', { give: { wood: 999 }, want: { herb: 1 } })).status, 400);
  assert.equal((await call(s4, 'POST', '/api/student/classes/cl-a/trades', { give: { gold: 1 }, want: { herb: 1 } })).status, 400);
  // professor turns trading off -> open offers are refunded
  const open = await call(s4, 'POST', '/api/student/classes/cl-a/trades', { give: { wood: 1 }, want: { herb: 1 } });
  const woodBefore = res('s-04').wood;
  const prof = await login('t-a');
  await call(prof, 'PUT', '/api/teacher/classes/cl-a/settings', { tradingEnabled: false });
  assert.equal(db().trades.find((t) => t.id === open.body.id).status, 'cancelled');
  assert.equal(res('s-04').wood, woodBefore + 1);
  assert.equal((await call(s4, 'POST', '/api/student/classes/cl-a/trades', { give: { wood: 1 }, want: { herb: 1 } })).status, 400);
  await call(prof, 'PUT', '/api/teacher/classes/cl-a/settings', { tradingEnabled: true });
});

test('participation points: off by default, opt-in, capped, CSV-safe export', async () => {
  const prof = await login('t-b');
  assert.equal((await call(prof, 'GET', '/api/teacher/classes/cl-b/participation.csv')).status, 409);
  const t = await login('s-07');
  await playSession(t, 'cl-b', 5, () => ({ choice: 0 }));
  assert.equal(db().participation.length, 0, 'nothing recorded while disabled');
  await call(prof, 'PUT', '/api/teacher/classes/cl-b/settings', { participationEnabled: true });
  for (let i = 0; i < 4; i++) await playSession(t, 'cl-b', 5, () => ({ choice: 0 }));
  assert.equal(db().participation.filter((p) => p.studentId === 's-07').length, 3, 'weekly cap of 3');
  db().users.find((u) => u.id === 's-07').name = '=HYPERLINK("x")'; // formula injection attempt
  const csv = await call(prof, 'GET', '/api/teacher/classes/cl-b/participation.csv');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.ok(csv.body.includes(`"'=HYPERLINK(""x"")"`), 'formula cells are neutralised');
  db().users.find((u) => u.id === 's-07').name = 'Student 07';
  assert.equal((await call(await login('t-a'), 'GET', '/api/teacher/classes/cl-b/participation.csv')).status, 404);
});

test('evaluation: prep time accumulates and metrics are reported', async () => {
  const prof = await login('t-a');
  const created = await call(prof, 'POST', '/api/teacher/courses/c-comp/questions', { type: 'tf', topicId: 'tp-sec', outcomeId: 'lo-sec-1', stem: 'True or false: phishing uses deceptive messages.', answerIndex: 0, explanation: 'True.', difficulty: 'easy', sourceIds: ['p-sec-1'], prepSeconds: 95 });
  assert.equal(created.status, 201);
  await call(prof, 'PUT', `/api/teacher/questions/${created.body.id}`, { ...created.body.latest, prepSeconds: 99999 });
  const q = db().questions.find((x) => x.id === created.body.id);
  assert.equal(q.prepSeconds, 95 + 3600, 'editor time is capped per save');
  assert.equal(q.editCount, 1);
  const ev = (await call(prof, 'GET', '/api/teacher/courses/c-comp/evaluation')).body;
  assert.ok(ev.drafting.find((d) => d.origin === 'manual').total > 0);
  assert.ok(ev.prep.find((p) => p.origin === 'manual').questionsTimed > 0);
  assert.ok(ev.recommendation.sessions > 0);
  // usability survey
  const t = await login('s-03');
  const { id } = await playSession(t, 'cl-a', 5, () => ({ choice: 0 }));
  assert.equal((await call(t, 'POST', `/api/student/sessions/${id}/feedback`, { rating: 3, comment: 'nice' })).status, 200);
  assert.equal((await call(t, 'POST', `/api/student/sessions/${id}/feedback`, { rating: 1 })).body.already, true);
  const ev2 = (await call(prof, 'GET', '/api/teacher/courses/c-comp/evaluation')).body;
  assert.ok(ev2.usability.ratings[3] >= 1);
});

test('students can only report questions they have answered', async () => {
  const t = await login('s-01');
  assert.equal((await call(t, 'POST', '/api/student/questions/q-st1/report', { reason: 'not my class' })).status, 404);
});

test('passages require the no-personal-data confirmation', async () => {
  const prof = await login('t-a');
  const body = { title: 'Notes', topicId: 'tp-net', outcomeId: 'lo-net-1', text: 'A hub is a device that repeats signals to every port.' };
  assert.equal((await call(prof, 'POST', '/api/teacher/courses/c-comp/passages', body)).status, 400);
  assert.equal((await call(prof, 'POST', '/api/teacher/courses/c-comp/passages', { ...body, confirmNoPersonalData: true })).status, 201);
  // transcription without a Gemini key explains itself instead of failing silently
  const tr = await call(prof, 'POST', '/api/teacher/courses/c-comp/transcribe', { imageBase64: 'AAAA', mimeType: 'image/png', mode: 'text' });
  assert.equal(tr.status, process.env.GEMINI_API_KEY ? 400 : 501);
});

// ---------------- regression tests from the code review ----------------
test('malformed request URLs get an error response instead of crashing the server', async () => {
  const net = require('net');
  const port = srv.httpServer.address().port;
  for (const p of ['//', '//x:99999/a', '/api//x:99999']) {
    const line = await new Promise((resolve, reject) => {
      const s = net.connect(port, '127.0.0.1', () => s.write(`GET ${p} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
      s.once('data', (d) => {
        resolve(String(d).split('\r\n')[0]);
        s.destroy();
      });
      s.once('error', reject);
    });
    assert.match(line, /^HTTP\/1\.1 [45]\d\d/, p);
  }
  assert.equal((await call(null, 'GET', '/api/demo-users')).status, 200, 'still serving');
});

test('inherited object keys are rejected (__proto__, constructor)', async () => {
  const t = await login('s-05');
  for (const give of [{ __proto__: null, ['__proto__']: 20 }, { constructor: 5 }]) {
    const raw = JSON.stringify({ give, want: { herb: 1 } }).replace('"give":{}', '"give":{"__proto__":20}');
    const res = await fetch(base + '/api/student/classes/cl-a/trades', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t }, body: raw });
    assert.equal(res.status, 400, raw);
  }
  assert.equal((await call(t, 'POST', '/api/student/kingdom/build', { building: 'constructor', requestId: 'build-proto-0001' })).status, 400);
  const prof = await login('t-a');
  assert.equal((await call(prof, 'POST', '/api/teacher/questions/q-d1/status', { action: 'constructor' })).status, 400);
});

test('parallel drafting requests cannot exceed the daily cap', async () => {
  // A slow drafter (like a real model call) is where the race was: the cap
  // was checked before the call but the call was logged only afterwards.
  const { generate } = require('../src/quiz/generator');
  const d = db();
  const course = d.courses.find((c) => c.id === 'c-stats');
  const topic = d.topics.find((t) => t.id === 'tp-stats');
  let calls = 0;
  const slow = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 50));
    throw new Error('model unavailable'); // forces the retries
  };
  const results = await Promise.all(Array.from({ length: 10 }, () =>
    generate({ db: d, course, topic, outcome: topic.outcomes[0], count: 1, format: 'mcq', force: true, userId: 't-b', drafter: slow })));
  assert.equal(results.filter((r) => r.status === 409).length, 9, 'only one drafting job per course at a time');
  assert.equal(calls, 3, 'the one job that ran used its retries, and each counts');
  assert.equal(d.generationLog.filter((g) => g.courseId === 'c-stats').at(-1).calls, 3);
});

test('a maths template that fails to generate is skipped, not a stuck session', async () => {
  const t = await login('s-07');
  const s = await call(t, 'POST', '/api/student/sessions', { classId: 'cl-b', length: 5, timerSec: 0 });
  const session = db().sessions.find((x) => x.id === s.body.id);
  // break the maths question in this session so it can never produce numbers
  const paramItem = session.items.find((it) => db().questions.find((q) => q.id === it.qid).versions[0].type === 'param');
  const q = db().questions.find((x) => x.id === paramItem.qid);
  const saved = q.versions[0].constraint;
  q.versions[0].constraint = 'a > 1000';
  for (;;) {
    const st = await call(t, 'GET', `/api/student/sessions/${s.body.id}`);
    assert.equal(st.status, 200);
    if (st.body.done) {
      assert.equal(st.body.total, 4);
      assert.ok(st.body.notes.some((n) => n.includes('skipped')));
      break;
    }
    await call(t, 'POST', `/api/student/sessions/${s.body.id}/answer`, { index: st.body.question.index, choice: 0 });
  }
  q.versions[0].constraint = saved;
});

// ---------------- Supabase schema (QQ_STORE=pglite only) ----------------
test('Supabase: everything the suite wrote survives a reload from Postgres', { skip: !PGLITE && 'runs in quiz-pglite-test.js' }, async () => {
  const { pgliteAdapter, normalize, quiet } = require('./support/pglite');
  const { createSyncedStore } = require('../src/db/supabase-store');
  await srv.quiz.store.flush();
  assert.deepEqual(pgLog.errors, [], 'no failed writes');
  const calls = [];
  const reloaded = await createSyncedStore({ adapter: pgliteAdapter(pg, { calls }), logger: quiet() });
  assert.deepEqual(normalize(reloaded.db), normalize(db()));
  await reloaded.flush();
  assert.deepEqual(calls, [], 'a freshly loaded store has nothing to write');
});
