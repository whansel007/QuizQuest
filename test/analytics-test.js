// ============================================================
// Analytics dashboard tests (src/quiz/analytics.js + its route)
// ------------------------------------------------------------
// Works on the synthetic seed with a few hand-made attempts added, at a
// fixed "now", so every number below can be worked out by hand.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { classAnalytics, questionInsights } = require('../src/quiz/analytics');
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
  const time = (r, id) => r.time.questions.find((q) => q.questionId === id).meanMs;
  assert.ok(time(all, 'q-d1') > time(month, 'q-d1'));
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
  const q = classAnalytics(db, 'cl-a', NOW, { range: 'all' }).time.questions.find((x) => x.questionId === 'q-d1');
  assert.equal(q.n, 3);
  assert.equal(q.students, 2);
  assert.equal(q.meanMs, (15000 + 40000) / 2, 'average of each student average');
  assert.equal(q.medianMs, 20000);
  const json = JSON.stringify(q);
  assert.ok(!/Student|s-0\d/.test(json), 'no student names or ids are sent');
});

test('days follow the class time zone (Singapore by default, UTC+8)', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  // Fri 9 Oct, 01:00 in Singapore = Thu 8 Oct, 17:00 UTC
  add({ at: Date.UTC(2026, 9, 8, 17) });
  const sg = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  assert.equal(sg.timezone, 'Asia/Singapore');
  const day = (r) => r.trend.points.findIndex((p) => p.answers === 1);
  assert.equal(day(sg), 6, 'counted on Friday (today), not Thursday');
  assert.equal(sg.trend.points[0].start, Date.UTC(2026, 9, 2, 16), 'the first day starts at midnight Singapore time');
  db.classes.find((c) => c.id === 'cl-a').settings.timezone = 'UTC';
  const utc = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  assert.equal(day(utc), 5, 'in UTC the same answer is on Thursday');
  db.classes.find((c) => c.id === 'cl-a').settings.timezone = 'Not/AZone';
  assert.equal(classAnalytics(db, 'cl-a', NOW).timezone, 'Asia/Singapore', 'an invalid zone falls back to Singapore');
});

test('tiles compare with the previous period of the same length', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  add({ at: NOW - 1 * DAY, studentId: 's-01' });
  add({ at: NOW - 2 * DAY, studentId: 's-02' });
  add({ at: NOW - 9 * DAY, studentId: 's-03' }); // previous 7 days
  add({ at: NOW - 20 * DAY, studentId: 's-04' }); // neither
  const week = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  assert.equal(week.participation.attempts, 2);
  assert.deepEqual({ attempts: week.previous.attempts, activeEver: week.previous.activeEver }, { attempts: 1, activeEver: 1 });
  assert.equal(classAnalytics(db, 'cl-a', NOW, { range: 'all' }).previous, null, 'no comparison for all time');
});

test('topics break down into learning outcomes with question coverage', () => {
  const { db } = setup();
  const data = topic(classAnalytics(db, 'cl-a', NOW, { range: 'all' }), 'tp-data');
  assert.deepEqual(data.outcomes.map((o) => o.outcomeId), ['lo-data-1', 'lo-data-2']);
  // outcome first attempts add up to the topic's
  assert.equal(data.outcomes.reduce((n, o) => n + o.first.n, 0), data.first.n);
  const published = (id) => db.questions.filter((q) => q.outcomeId === id && q.status === 'published').length;
  assert.equal(data.outcomes[0].published, published('lo-data-1'));
  assert.equal(data.outcomes[1].published, published('lo-data-2'));
});

test('slow and mostly-wrong questions are flagged as possibly confusing', () => {
  const { db } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  let n = 0;
  const answer = (questionId, ms, correct) => db.attempts.push({ id: `c${++n}`, sessionId: null, studentId: `s-0${(n % 5) + 1}`, classId: 'cl-a', courseId: 'c-comp', questionId, version: 1, topicId: 'tp-data', type: 'mcq', choice: 0, correct, score: correct ? 1 : 0, ms, timedOut: false, first: true, context: 'practice', at: NOW - n * 1000 });
  for (let i = 0; i < 5; i++) answer('q-d1', 60000, i === 0); // slow, 20% right
  for (let i = 0; i < 5; i++) answer('q-d2', 60000, true); // slow but fine
  for (let i = 0; i < 5; i++) answer('q-d3', 5000, false); // wrong but quick
  for (let i = 0; i < 5; i++) answer('q-d4', 5000, true);
  for (let i = 0; i < 2; i++) answer('q-d5', 90000, false); // too few answers to judge
  const { questions } = classAnalytics(db, 'cl-a', NOW, { range: 'all' }).time;
  const flagged = questions.filter((q) => q.confusing).map((q) => q.questionId);
  assert.deepEqual(flagged, ['q-d1']);
  assert.equal(questions.find((q) => q.questionId === 'q-d1').accuracy.accuracy, 0.2);
});

test('question detail: option counts on the current version, no student names', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.questionId !== 'q-n2');
  for (const choice of [0, 0, 0, 1, 2]) add({ questionId: 'q-n2', topicId: 'tp-net', choice, correct: choice === 1 });
  add({ questionId: 'q-n2', topicId: 'tp-net', choice: 3, correct: false, version: 0 }); // an older version
  const d = questionInsights(db, 'cl-a', 'q-n2', NOW, { range: 'all' });
  assert.equal(d.answers.kind, 'options');
  assert.deepEqual(d.answers.options.map((o) => o.count), [3, 1, 1, 0]);
  assert.deepEqual(d.answers.options.map((o) => o.correct), [false, true, false, false]);
  assert.equal(d.olderVersionAnswers, 1);
  assert.ok(d.reports.length >= 1 && !('studentId' in d.reports[0]), 'reports without the reporter');
  assert.ok(!/Student \d|s-0\d/.test(JSON.stringify(d)), 'no student names or ids');
  // multi-select counts every pick; numeric lists common wrong values
  add({ questionId: 'q-x1', topicId: 'tp-net', type: 'multi', choices: [0, 2], correct: true });
  add({ questionId: 'q-x1', topicId: 'tp-net', type: 'multi', choices: [0, 1], correct: false });
  assert.deepEqual(questionInsights(db, 'cl-a', 'q-x1', NOW).answers.options.map((o) => o.count), [2, 1, 1, 0]);
  add({ questionId: 'q-x4', type: 'numeric', value: 11, correct: false });
  add({ questionId: 'q-x4', type: 'numeric', value: 11, correct: false });
  add({ questionId: 'q-x4', type: 'numeric', value: 13, correct: true });
  assert.deepEqual(questionInsights(db, 'cl-a', 'q-x4', NOW).answers.commonWrong, [{ value: 11, count: 2 }]);
  // another course's question is not found
  assert.equal(questionInsights(db, 'cl-a', 'q-st1', NOW), null);
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
    // question detail: own class only, own course's questions only
    assert.equal((await call(prof, '/api/teacher/classes/cl-a/questions/q-n2/insights?range=30d')).status, 200);
    assert.equal((await call(prof, '/api/teacher/classes/cl-a/questions/q-st1/insights')).status, 404);
    assert.equal((await call(await login('t-b'), '/api/teacher/classes/cl-a/questions/q-n2/insights')).status, 404);
    // time zone setting: validated before anything changes
    const put = (body) => fetch(base + '/api/teacher/classes/cl-a/settings', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + prof }, body: JSON.stringify(body) });
    assert.equal((await put({ timezone: 'Mars/Olympus', tradingEnabled: false })).status, 400);
    assert.equal(srv.quiz.db.classes.find((c) => c.id === 'cl-a').settings.tradingEnabled, true, 'nothing changed');
    assert.equal((await put({ timezone: 'Europe/London' })).status, 200);
    assert.equal((await call(prof, '/api/teacher/classes/cl-a/analytics')).body.timezone, 'Europe/London');
  } finally {
    srv.io.close();
  }
});
