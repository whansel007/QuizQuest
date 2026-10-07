// ============================================================
// Quiz API tests: the security + integrity promises in the proposal
// ------------------------------------------------------------
// Boots the real server on a random port with an in-memory DB, then
// talks to it over HTTP like the browser would. Covers:
//   - answer keys / drafts never reach students
//   - cross-class isolation (teachers and students)
//   - duplicate submissions don't pay twice; no coin farming
//   - versioning, validation, generation caching, adaptive mix
// Run with:  npm test
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../server');
const { planSession, topicStats } = require('../src/quiz/adaptive');
const { validateQuestion } = require('../src/quiz/validate');

let srv;
let base;

async function call(token, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
const login = async (userId) => (await call(null, 'POST', '/api/login', { userId })).body.token;

// Play a whole session, always picking `pick(question)`; returns answers
async function playSession(token, classId, length, pick) {
  const s = await call(token, 'POST', '/api/student/sessions', { classId, length, timerSec: 0 });
  assert.equal(s.status, 201);
  const results = [];
  for (;;) {
    const st = (await call(token, 'GET', `/api/student/sessions/${s.body.id}`)).body;
    if (st.done) break;
    const r = await call(token, 'POST', `/api/student/sessions/${s.body.id}/answer`, { index: st.question.index, choice: pick(st.question) });
    results.push(r.body);
  }
  return { id: s.body.id, results };
}

test.before(async () => {
  srv = start(0, { dataFile: null });
  await new Promise((r) => srv.httpServer.once('listening', r));
  base = 'http://localhost:' + srv.httpServer.address().port;
});
test.after(() => {
  srv.io.close();
});

test('API requires sign-in and the right role', async () => {
  assert.equal((await call(null, 'GET', '/api/student/home')).status, 401);
  const student = await login('s-01');
  assert.equal((await call(student, 'GET', '/api/teacher/courses')).status, 403);
});

test('students never receive the answer key before answering', async () => {
  const t = await login('s-01');
  const s = await call(t, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 });
  const st = await call(t, 'GET', `/api/student/sessions/${s.body.id}`);
  const raw = JSON.stringify(st.body);
  assert.ok(st.body.question.stem);
  for (const key of ['answerIndex', 'explanation', 'sourceIds', 'versions']) assert.ok(!raw.includes(key), `leaked ${key}`);
});

test('drafts are never served to students', async () => {
  const t = await login('s-02');
  const seen = new Set();
  for (let i = 0; i < 3; i++) {
    const { id } = await playSession(t, 'cl-a', 15, () => 0);
    const db = srv.quiz.db;
    for (const it of db.sessions.find((x) => x.id === id).items) seen.add(it.qid);
  }
  assert.ok(!seen.has('q-draft1'));
});

test('teachers cannot see other classes; students cannot join other classes', async () => {
  const profB = await login('t-b');
  assert.equal((await call(profB, 'GET', '/api/teacher/classes/cl-a/analytics')).status, 404);
  assert.equal((await call(profB, 'GET', '/api/teacher/courses/c-comp/questions')).status, 404);
  assert.equal((await call(profB, 'PUT', '/api/teacher/questions/q-d1', { stem: 'hijack this question please', options: ['a', 'b', 'c'], answerIndex: 0, explanation: 'x', difficulty: 'easy' })).status, 404);
  const studentB = await login('s-07');
  assert.equal((await call(studentB, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 })).status, 404);
  assert.equal((await call(studentB, 'GET', '/api/student/classes/cl-a/progress')).status, 404);
  // and can't read another student's session
  const a = await login('s-01');
  const s = await call(a, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 });
  assert.equal((await call(studentB, 'GET', `/api/student/sessions/${s.body.id}`)).status, 404);
});

test('a duplicate answer submission returns the same result and pays nothing extra', async () => {
  const t = await login('s-04');
  const s = await call(t, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 });
  const st = (await call(t, 'GET', `/api/student/sessions/${s.body.id}`)).body;
  const before = (await call(t, 'GET', '/api/student/home')).body.wallet.balance;
  const first = await call(t, 'POST', `/api/student/sessions/${s.body.id}/answer`, { index: 0, choice: 1 });
  const again = await call(t, 'POST', `/api/student/sessions/${s.body.id}/answer`, { index: 0, choice: 2 });
  const after = (await call(t, 'GET', '/api/student/home')).body.wallet.balance;
  assert.equal(again.body.duplicate, true);
  assert.equal(again.body.choice, first.body.choice, 'second submit must not change the answer');
  const paid = first.body.rewards.reduce((n, r) => n + r.granted, 0);
  assert.equal(after - before, paid);
  assert.ok(st.question);
});

test('repeating questions cannot farm coins', async () => {
  const t = await login('s-08'); // stats class: only 3 questions in the bank
  const answers = { 'What is the median of 3, 7, 9, 12, 20?': 1, 'What is the mean of 2, 4, 6, 8?': 1, 'Which measure of centre is least affected by an extreme outlier?': 1 };
  const one = await playSession(t, 'cl-b', 5, (q) => answers[q.stem]); // bank is 3 -> session shortened
  assert.equal(one.results.length, 3);
  assert.ok(one.results.every((r) => r.correct));
  const two = await playSession(t, 'cl-b', 5, (q) => answers[q.stem]);
  const correctCoins = two.results.flatMap((r) => r.rewards).filter((r) => r.reason.startsWith('Correct')).length;
  assert.equal(correctCoins, 0, 'second time through the same questions earns no per-answer coins');
});

test('short bank is disclosed, not padded with unreviewed questions', async () => {
  const t = await login('s-07');
  const s = await call(t, 'POST', '/api/student/sessions', { classId: 'cl-b', length: 10, timerSec: 0 });
  const st = (await call(t, 'GET', `/api/student/sessions/${s.body.id}`)).body;
  assert.equal(st.total, 3);
  assert.ok(st.notes.some((n) => n.includes('No unreviewed questions')));
});

test('editing a published question creates a new version; old attempts keep theirs', async () => {
  const prof = await login('t-a');
  const q = srv.quiz.db.questions.find((x) => x.id === 'q-n2');
  const before = q.versions.length;
  const v = q.versions.at(-1);
  const r = await call(prof, 'PUT', '/api/teacher/questions/q-n2', { ...v, stem: 'A video call has a clear picture but every reply arrives late. Which property of the connection is most likely the problem?' });
  assert.equal(r.status, 200);
  assert.equal(q.versions.length, before + 1);
  assert.equal(q.publishedVersion, before + 1);
  assert.ok(srv.quiz.db.attempts.some((a) => a.questionId === 'q-n2' && a.version === 1));
});

test('withdrawn questions leave practice', async () => {
  const prof = await login('t-b');
  assert.equal((await call(prof, 'POST', '/api/teacher/questions/q-st3/status', { action: 'withdraw' })).status, 200);
  const t = await login('s-07');
  const s = await call(t, 'POST', '/api/student/sessions', { classId: 'cl-b', length: 5, timerSec: 0 });
  const ids = srv.quiz.db.sessions.find((x) => x.id === s.body.id).items.map((i) => i.qid);
  assert.ok(!ids.includes('q-st3'));
  await call(prof, 'POST', '/api/teacher/questions/q-st3/status', { action: 'republish' });
});

test('generation: drafts only, structure-checked, cached on identical input', async () => {
  const prof = await login('t-a');
  const body = { topicId: 'tp-sec', outcomeId: 'lo-sec-2', count: 3 };
  const r1 = await call(prof, 'POST', '/api/teacher/courses/c-comp/generate', body);
  assert.equal(r1.status, 200);
  assert.ok(r1.body.created.length > 0);
  for (const id of r1.body.created) assert.equal(srv.quiz.db.questions.find((q) => q.id === id).status, 'draft');
  const r2 = await call(prof, 'POST', '/api/teacher/courses/c-comp/generate', body);
  assert.equal(r2.body.cached, true);
  // forced regeneration: duplicates of existing questions get discarded
  const r3 = await call(prof, 'POST', '/api/teacher/courses/c-comp/generate', { ...body, force: true });
  assert.equal(r3.body.cached, false);
  assert.ok(r3.body.rejected.every((x) => x.errors.length));
});

test('validation catches structural problems', () => {
  const allowed = new Set(['p1']);
  const bad = validateQuestion({ stem: 'Which one?', options: ['A', 'a', ''], answerIndex: 5, explanation: '', difficulty: 'impossible', sourceIds: ['nope'] }, { allowedSourceIds: allowed });
  const text = bad.errors.join(' ');
  for (const frag of ['Duplicate option', 'Every option', 'Correct answer', 'explanation', 'Difficulty', 'does not exist']) assert.ok(text.includes(frag), frag);
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
  // fresh student: broad
  const fresh = planSession({ bank, topics, stats: topicStats([], topics), recentIds: [], length: 9 });
  assert.equal(fresh.mode, 'broad');
  for (const t of topics) assert.equal(fresh.questionIds.filter((id) => id.startsWith(t.id)).length, 3);
});

test('shop: double-clicked purchase charges once; egg odds disclosed', async () => {
  const t = await login('s-05'); // has seeded coins
  const home = (await call(t, 'GET', '/api/student/home')).body;
  assert.deepEqual(home.catalog.eggOdds, { common: 600, rare: 300, epic: 100 });
  const requestId = 'test-purchase-0001';
  const a = await call(t, 'POST', '/api/student/shop/buy', { itemId: 'tophat', requestId });
  const b = await call(t, 'POST', '/api/student/shop/buy', { itemId: 'tophat', requestId });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(home.wallet.balance - b.body.wallet.balance, 40);
});

test('students can only report questions they have answered', async () => {
  const t = await login('s-01');
  assert.equal((await call(t, 'POST', '/api/student/questions/q-st1/report', { reason: 'not my class' })).status, 404);
});
