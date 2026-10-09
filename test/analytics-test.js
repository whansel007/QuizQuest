// ============================================================
// Analytics dashboard tests (src/quiz/analytics.js + its route)
// ------------------------------------------------------------
// Works on the synthetic seed with a few hand-made attempts added, at a
// fixed "now", so every number below can be worked out by hand.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { classAnalytics } = require('../src/quiz/analytics');
const { start } = require('../server');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 9, 12); // Fri 9 Oct 2026, 12:00 UTC

// A fresh seed (its history is dated relative to NOW) plus helpers
function setup() {
  const db = seed(NOW);
  let n = 0;
  const add = (fields) => {
    const a = { id: `at-test-${++n}`, sessionId: null, studentId: 's-01', classId: 'cl-a', courseId: 'c-comp', questionId: 'q-d1', version: 1, topicId: 'tp-data', type: 'mcq', choice: 1, correct: true, score: 1, ms: 10000, timedOut: false, first: true, context: 'practice', at: NOW - 3600000, ...fields };
    db.attempts.push(a);
    return a;
  };
  return { db, add };
}
const topic = (a, id) => a.byTopic.find((t) => t.topicId === id);

test('answers awaiting marking are left out of accuracy and counted separately', () => {
  const { db } = setup();
  const before = classAnalytics(db, 'cl-a', NOW, { range: 'all' });
  db.attempts.push({ id: 'at-short', sessionId: null, studentId: 's-01', classId: 'cl-a', courseId: 'c-comp', questionId: 'q-x3', version: 1, topicId: 'tp-net', type: 'short', text: 'x', correct: true, score: 1, ms: 20000, timedOut: false, first: true, context: 'practice', at: NOW - 1000, needsReview: true });
  const after = classAnalytics(db, 'cl-a', NOW, { range: 'all' });
  assert.deepEqual(topic(after, 'tp-net').first, topic(before, 'tp-net').first, 'provisional answer did not change accuracy');
  assert.equal(topic(after, 'tp-net').awaitingMarking, 1);
  assert.equal(after.participation.awaitingMarking, 1);
  assert.equal(after.participation.attempts, before.participation.attempts + 1, 'still counted as an answer submitted');
  // once marked, it counts
  db.attempts.at(-1).needsReview = false;
  assert.equal(topic(classAnalytics(db, 'cl-a', NOW, { range: 'all' }), 'tp-net').first.n, topic(before, 'tp-net').first.n + 1);
});

test('the period filter scopes tiles, tables and response times', () => {
  const { db, add } = setup();
  add({ at: NOW - 40 * DAY, ms: 999000 }); // outside 30 days
  const all = classAnalytics(db, 'cl-a', NOW, { range: 'all' });
  const month = classAnalytics(db, 'cl-a', NOW, { range: '30d' });
  const week = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  assert.equal(all.participation.attempts, month.participation.attempts + 1);
  assert.ok(week.participation.attempts < month.participation.attempts, 'the 9-days-ago seed sessions fall outside 7 days');
  assert.ok(all.timeByQuestion.find((q) => q.questionId === 'q-d1').meanMs > month.timeByQuestion.find((q) => q.questionId === 'q-d1').meanMs);
  // trend buckets: exactly 7 days, and they add up to the tile
  assert.equal(week.trend.bucket, 'day');
  assert.equal(week.trend.points.length, 7);
  assert.equal(week.trend.points.reduce((n, p) => n + p.answers, 0), week.participation.attempts);
  assert.equal(month.trend.bucket, 'week');
  assert.equal(month.trend.points.reduce((n, p) => n + p.answers, 0), month.participation.attempts);
});

test('trend points carry their sample size; empty buckets have no accuracy', () => {
  const { db } = setup();
  const week = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  for (const p of week.trend.points) {
    for (const r of Object.values(p.topics)) {
      assert.ok(Number.isInteger(r.n));
      if (r.n === 0) assert.equal(r.accuracy, null);
    }
  }
  assert.ok(week.trend.points.some((p) => p.answers === 0), 'a quiet day is shown as zero, not skipped');
});

test('every seeded question is fully tagged; missing or invalid tags are listed', () => {
  const { db } = setup();
  const ok = classAnalytics(db, 'cl-a', NOW).tags;
  assert.equal(ok.issues.length, 0);
  assert.equal(ok.complete, ok.total);
  const q = (id) => db.questions.find((x) => x.id === id);
  q('q-d1').outcomeId = 'lo-net-1'; // an outcome from a different topic
  q('q-d2').versions.at(-1).difficulty = '';
  q('q-d3').topicId = 'tp-missing';
  q('q-d4').status = 'rejected';
  q('q-d4').outcomeId = null; // rejected questions are ignored
  const bad = classAnalytics(db, 'cl-a', NOW).tags;
  const missing = Object.fromEntries(bad.issues.map((i) => [i.questionId, i.missing]));
  assert.deepEqual(missing, { 'q-d1': ['learning outcome'], 'q-d2': ['difficulty'], 'q-d3': ['topic', 'learning outcome'] });
  assert.equal(bad.total, ok.total - 1);
});

test('average time per question: each student counts once, timed-out answers left out, no names', () => {
  const { db } = setup();
  db.attempts = db.attempts.filter((a) => a.questionId !== 'q-d1');
  let n = 0;
  const at = (studentId, ms, extra = {}) => db.attempts.push({ id: `t${++n}`, sessionId: null, studentId, classId: 'cl-a', courseId: 'c-comp', questionId: 'q-d1', version: 1, topicId: 'tp-data', type: 'mcq', choice: 1, correct: true, score: 1, ms, timedOut: false, first: n === 1, context: 'practice', at: NOW - 1000 * n, ...extra });
  at('s-02', 10000);
  at('s-02', 20000); // s-02 averages 15s
  at('s-03', 40000);
  at('s-03', 90000, { timedOut: true }); // no answering time
  const q = classAnalytics(db, 'cl-a', NOW, { range: 'all' }).timeByQuestion.find((x) => x.questionId === 'q-d1');
  assert.equal(q.n, 3);
  assert.equal(q.students, 2);
  assert.equal(q.meanMs, (15000 + 40000) / 2, 'average of each student average');
  assert.equal(q.medianMs, 20000);
  const json = JSON.stringify(q);
  assert.ok(!/Student|s-0\d/.test(json), 'no student names or ids are sent');
});

test('the analytics route checks the period and the professor', async () => {
  const srv = start(0, { dataFile: null });
  await new Promise((r) => srv.httpServer.once('listening', r));
  const base = 'http://localhost:' + srv.httpServer.address().port;
  const call = async (token, path) => {
    const res = await fetch(base + path, { headers: token ? { authorization: 'Bearer ' + token } : {} });
    return { status: res.status, body: await res.json() };
  };
  const login = async (userId) => (await (await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) })).json()).token;
  try {
    const prof = await login('t-a');
    const ok = await call(prof, '/api/teacher/classes/cl-a/analytics?range=7d');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.range, '7d');
    assert.equal((await call(prof, '/api/teacher/classes/cl-a/analytics?range=1y')).status, 400);
    assert.equal((await call(await login('t-b'), '/api/teacher/classes/cl-a/analytics?range=7d')).status, 404);
    assert.equal((await call(await login('s-01'), '/api/teacher/classes/cl-a/analytics')).status, 403);
  } finally {
    srv.io.close();
  }
});
