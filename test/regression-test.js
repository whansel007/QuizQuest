const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../server');
const { retrieve, chunkPassage } = require('../src/quiz/retrieval');
const { topicStats, planSession } = require('../src/quiz/adaptive');
const { validateQuestion } = require('../src/quiz/validate');
const { generate, GEN } = require('../src/quiz/generator');
const { seed } = require('../src/quiz/seed');
const { courseEvaluation } = require('../src/quiz/evaluation');
let srv, base, student, teacher;
async function call(token, method, path, body) {
  const res = await fetch(base + path, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
test.before(async () => {
  srv = start(0, { dataFile: null });
  await new Promise((r) => srv.httpServer.once('listening', r));
  base = `http://localhost:${srv.httpServer.address().port}`;
  student = (await call(null, 'POST', '/api/login', { userId: 's-01' })).body.token;
  teacher = (await call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;
});
test.after(() => srv.io.close());

test('oversized requests return JSON 413 and leave the server usable', async () => {
  const r = await call(null, 'POST', '/api/login', { userId: 's-01', junk: 'a'.repeat(105000) });
  assert.equal(r.status, 413);
  assert.match(r.body.error, /large/);
  assert.equal((await call(student, 'GET', '/api/me')).status, 200);
});
test('JSON scalar, null and array request bodies are rejected', async () => {
  for (const body of [null, [], true, 12, 'test']) assert.equal((await call(teacher, 'PUT', '/api/teacher/courses/c-comp/settings', body)).status, 400);
});
test('failed settings/equipment updates do not partially mutate state', async () => {
  const c = srv.quiz.db.courses.find((c) => c.id === 'c-comp');
  const before = c.promptConfig;
  assert.equal((await call(teacher, 'PUT', '/api/teacher/courses/c-comp/settings', { promptConfig: 'must not persist', coverageTarget: 999 })).status, 400);
  assert.equal(c.promptConfig, before);
  const inv = srv.quiz.services.look('s-01');
  const inventory = srv.quiz.db.inventory.find((i) => i.studentId === 's-01');
  inventory.pets.push({ id: 'fox', dupes: 0 });
  assert.equal((await call(student, 'POST', '/api/student/equip', { petId: 'fox', itemId: 'unowned' })).status, 400);
  assert.equal(srv.quiz.services.look('s-01').pet.id, inv.pet.id);
});
test('professor marks update summary, score, progress and replay without duplicate rewards', async () => {
  const db = srv.quiz.db;
  const q = db.questions.find((q) => q.id === 'q-x3');
  const v = q.versions.find((v) => v.v === q.publishedVersion);
  const sid = (await call(student, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 })).body.id;
  const s = db.sessions.find((s) => s.id === sid);
  s.items = [{ qid: q.id, v: v.v, servedAt: null, instance: null, result: null }];
  await call(student, 'GET', `/api/student/sessions/${sid}`);
  const answer = (await call(student, 'POST', `/api/student/sessions/${sid}/answer`, { index: 0, text: v.keyPoints.join(' ') })).body;
  assert.equal(answer.provisional, true);
  assert.deepEqual(answer.rewards, [], 'unconfirmed marks must not pay first-correct or milestone coins');
  const a = db.attempts.find((a) => a.sessionId === sid);
  assert.equal((await call(teacher, 'POST', `/api/teacher/attempts/${a.id}/mark`, { correct: false })).status, 200);
  let summary = (await call(student, 'GET', `/api/student/sessions/${sid}/summary`)).body;
  assert.equal(summary.correct, 0);
  assert.equal(summary.provisional, 0);
  assert.equal(a.score, 0);
  const paid = (await call(teacher, 'POST', `/api/teacher/attempts/${a.id}/mark`, { correct: true })).body.paid;
  assert.equal(paid, 10);
  summary = (await call(student, 'GET', `/api/student/sessions/${sid}/summary`)).body;
  assert.equal(summary.correct, 1);
  assert.equal(summary.coins, 10);
  assert.equal(a.score, 1);
  const replay = (await call(student, 'POST', `/api/student/sessions/${sid}/answer`, { index: 0 })).body;
  assert.equal(replay.provisional, false);
  assert.equal(replay.correct, true);
  assert.equal((await call(teacher, 'POST', `/api/teacher/attempts/${a.id}/mark`, { correct: true })).body.paid, 0);
});
test('manual marking cannot override an objective question', async () => {
  const a = srv.quiz.db.attempts.find((a) => a.classId === 'cl-a' && a.type !== 'short');
  const before = { ...a };
  assert.equal((await call(teacher, 'POST', `/api/teacher/attempts/${a.id}/mark`, { correct: !a.correct })).status, 400);
  assert.deepEqual(a, before);
});
test('provisional answers do not distort the practice indicator', () => {
  const stats = topicStats([
    { questionId: 'q', topicId: 't', correct: true, needsReview: true, at: 3 },
    { questionId: 'q', topicId: 't', correct: false, at: 2 },
  ], [{ id: 't', name: 'Topic' }]);
  assert.equal(stats[0].n, 1);
  assert.equal(stats[0].accuracy, 0);
});
test('recent-question avoidance counts distinct IDs', () => {
  const plan = planSession({ bank: [{ id: 'old', topicId: 't' }, { id: 'fresh', topicId: 't' }], topics: [{ id: 't' }], stats: [], recentIds: [...Array(20).fill('repeated'), 'old'], length: 1, rand: () => 0.99 });
  assert.deepEqual(plan.questionIds, ['fresh']);
});

test('missing topic coverage is disclosed even when the bank fills the session', () => {
  const plan = planSession({ bank: [{ id: 'q', topicId: 'a' }], topics: [{ id: 'a', name: 'Available' }, { id: 'b', name: 'Missing topic' }], stats: [], recentIds: [], length: 1 });
  assert.equal(plan.questionIds.length, 1);
  assert.ok(plan.notes.some((n) => n.includes('Missing topic')));
});

test('expired quiz deadlines cannot be reset by refreshing or bypassed by correct answers', async () => {
  const db = srv.quiz.db;
  const q = db.questions.find((q) => q.status === 'published' && q.courseId === 'c-comp' && q.versions.at(-1).type === 'mcq');
  const v = q.versions.find((v) => v.v === q.publishedVersion);
  const sid = (await call(student, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 30 })).body.id;
  const s = db.sessions.find((s) => s.id === sid);
  s.items = [{ qid: q.id, v: v.v, servedAt: Date.now() - 40000, instance: null, result: null }];
  assert.equal((await call(student, 'GET', `/api/student/sessions/${sid}`)).body.question.remainingMs, 0);
  const r = (await call(student, 'POST', `/api/student/sessions/${sid}/answer`, { index: 0, choice: v.answerIndex })).body;
  assert.equal(r.timedOut, true);
  assert.equal(r.correct, false);
  assert.deepEqual(r.rewards, []);
});
test('long unpunctuated source material stays retrievable within the context budget', () => {
  const p = { id: 'p', title: 'Notes', topicId: 't', outcomeId: 'o', text: 'network packets '.repeat(1000) };
  const chunks = chunkPassage(p);
  assert.ok(chunks.every((c) => c.text.length <= 700));
  const found = retrieve([p], { topicId: 't', outcomeId: 'o', topicName: 'Network', outcomeText: 'Packets' });
  assert.ok(found.length);
  assert.ok(found.reduce((n, c) => n + c.text.length, 0) <= 3500);
});
test('option validation preserves meaningful mathematical symbols and Unicode', () => {
  const common = { type: 'mcq', stem: 'Which expression has the requested meaning?', options: ['x+y', 'x-y', 'x*y'], answerIndex: 0, explanation: 'Addition combines the values.', difficulty: 'easy', sourceIds: [] };
  assert.deepEqual(validateQuestion(common, { requireSource: false }).errors, []);
  assert.ok(validateQuestion({ ...common, options: ['相同', '相同', '不同'] }, { requireSource: false }).errors.some((e) => /Duplicate/.test(e)));
  assert.ok(validateQuestion({ ...common, type: 'unknown' }, { requireSource: false }).errors.some((e) => /format/.test(e)));
});
test('reserved answer variable cannot leak an answer into a parameterised stem', () => {
  const r = validateQuestion({ type: 'param', stem: 'Calculate using {answer}', explanation: '{answer}', difficulty: 'easy', variables: [{ name: 'answer', min: 1, max: 4, step: 1 }], answerExpr: 'answer+2', distractorExprs: ['answer-1', 'answer+1'] }, { requireSource: false });
  assert.ok(r.errors.some((e) => /reserved/.test(e)));
});
test('generation validates malformed provider payloads, caps retries and respects batch size', async () => {
  const db = seed();
  const course = db.courses[0], topic = db.topics.find((t) => t.courseId === course.id), outcome = topic.outcomes[0];
  const args = { db, course, topic, outcome, userId: 't-a', count: 1, format: 'tf' };
  assert.equal((await generate({ ...args, count: 1.5 })).status, 400);
  let calls = 0;
  const r = await generate({ ...args, drafter: async () => { calls++; return { items: null }; } });
  assert.equal(r.status, 502);
  assert.equal(calls, GEN.retries + 1);
  const ok = await generate({ ...args, drafter: async ({ chunks }) => ({ items: [0, 1, 2].map((i) => ({ type: 'tf', stem: ['A brand-new statement about a quiet network.', 'Another completely different concept about teaching.', 'Third unrelated observation about data.'][i], answerIndex: 0, explanation: 'See the cited notes.', difficulty: 'easy', sourceIds: [chunks[0].passageId] })) }) });
  assert.equal(ok.body.created.length, 1);
});
test('deleted sources are disclosed instead of silently disappearing', async () => {
  const db = srv.quiz.db;
  const q = db.questions.find((q) => q.courseId === 'c-comp' && q.versions.at(-1).sourceIds.length);
  const pid = q.versions.at(-1).sourceIds[0];
  await call(teacher, 'DELETE', `/api/teacher/passages/${pid}`);
  const questions = (await call(teacher, 'GET', '/api/teacher/courses/c-comp/questions')).body;
  assert.deepEqual(questions.find((x) => x.id === q.id).sources.find((s) => s.id === pid), { id: pid, title: 'Source removed', removed: true });
});
test('empty adaptive sessions do not produce NaN evaluation metrics', () => {
  const db = seed();
  db.sessions = [{ id: 'empty', classId: 'cl-a', mode: 'adaptive', items: [], plan: { weakTopicIds: [], notes: [] } }];
  assert.equal(courseEvaluation(db, 'c-comp').recommendation.meanWeakShare, null);
});

test('maths validation rejects templates with mostly unusable single draws', () => {
  const r = validateQuestion({ type: 'param', stem: 'Calculate the value of {a} plus two.', explanation: 'The result is {answer}.', difficulty: 'easy', variables: [{ name: 'a', min: 1, max: 100, step: 1 }], answerExpr: 'a+2', distractorExprs: ['a-1', 'a+1'], constraint: 'a > 90' }, { requireSource: false });
  assert.ok(r.errors.some((e) => /sampled values/.test(e)));
});

test('draft tag edits are saved; published tags remain fixed to preserve history', async () => {
  const db = srv.quiz.db;
  const topics = db.topics.filter((t) => t.courseId === 'c-comp');
  const q = (await call(teacher, 'POST', '/api/teacher/courses/c-comp/questions', {
    type: 'tf', stem: 'A unique tagging regression example for the class.', answerIndex: 0, explanation: 'Instructor example.', difficulty: 'easy', sourceIds: [], topicId: topics[0].id, outcomeId: topics[0].outcomes[0].id,
  })).body;
  assert.ok(q.id);
  const payload = { ...q.latest, topicId: topics[1].id, outcomeId: topics[1].outcomes[0].id };
  assert.equal((await call(teacher, 'PUT', `/api/teacher/questions/${q.id}`, payload)).body.topicId, topics[1].id);
  assert.equal((await call(teacher, 'POST', `/api/teacher/questions/${q.id}/status`, { action: 'approve' })).status, 200);
  assert.equal((await call(teacher, 'PUT', `/api/teacher/questions/${q.id}`, { ...payload, topicId: topics[0].id, outcomeId: topics[0].outcomes[0].id })).status, 409);
});
