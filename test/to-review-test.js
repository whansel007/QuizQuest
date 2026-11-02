// ============================================================
// To review page: open student reports (src/quiz/reporting.js openReports
// + GET /api/teacher/classes/:classId/reports). Answers to mark use the
// existing marking route, covered in the browser tests.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { openReports } = require('../src/quiz/reporting');
const { classAnalytics } = require('../src/quiz/analytics');
const { start } = require('../server');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 9, 12);

test('open student reports are listed newest first, without the reporter', () => {
  const db = seed(NOW);
  const cls = (id) => db.classes.find((c) => c.id === id);
  const q = db.questions.find((x) => x.id === 'q-n2');
  // a newer report from the course's other class, on a reported version
  q.reports.push({ id: 'r-test-c', studentId: 's-09', classId: 'cl-c', version: 1, stem: 'Reported wording', category: 'typo', reason: 'Missing word', at: NOW - DAY, resolved: false });
  q.reports.push({ id: 'r-test-done', studentId: 's-02', classId: 'cl-a', version: 1, category: 'answer', reason: 'Already handled', at: NOW - 3 * DAY, resolved: true });

  const list = openReports(db, cls('cl-a'));
  assert.deepEqual(list.map((r) => r.id), ['r-test-c', 'r-seed1'], 'newest first, resolved ones left out');
  assert.equal(list.length, classAnalytics(db, 'cl-a', NOW, { range: 'all' }).openReports, 'matches the count the dashboard links from');

  const [other, seeded] = list;
  assert.equal(other.thisClass, false);
  assert.equal(other.className, 'Computing - Tutorial Group C');
  assert.equal(other.stem, 'Reported wording', 'the wording the student saw, not a later edit');
  assert.equal(other.category, 'typo');
  // the seeded report predates stored context: its class comes from the student's answer
  assert.equal(seeded.thisClass, true);
  assert.equal(seeded.category, 'other');
  assert.equal(seeded.topic, 'Networking basics');
  assert.equal(seeded.questionId, 'q-n2');
  for (const r of list) {
    assert.equal(r.studentId, undefined, 'never who sent it');
    assert.ok(!JSON.stringify(r).includes('s-0'), 'no student id anywhere in the row');
  }

  // from the other class of the same course, the same reports with "this class" flipped
  assert.deepEqual(openReports(db, cls('cl-c')).map((r) => [r.id, r.thisClass]), [['r-test-c', true], ['r-seed1', false]]);
  // another course's class sees none of them
  assert.deepEqual(openReports(db, cls('cl-b')), []);

  // a resolved report leaves the list
  q.reports.find((r) => r.id === 'r-seed1').resolved = true;
  assert.deepEqual(openReports(db, cls('cl-a')).map((r) => r.id), ['r-test-c']);
});

test('the reports route is for the class\'s own professors only', async () => {
  const srv = start(0, { dataFile: null });
  await new Promise((r) => srv.httpServer.once('listening', r));
  const base = 'http://localhost:' + srv.httpServer.address().port;
  const login = async (userId) => (await (await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) })).json()).token;
  const call = async (token, path) => {
    const res = await fetch(base + path, { headers: token ? { authorization: 'Bearer ' + token } : {} });
    return { status: res.status, body: await res.json() };
  };
  try {
    const ok = await call(await login('t-a'), '/api/teacher/classes/cl-a/reports');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.items.map((r) => r.id), ['r-seed1']);
    assert.equal((await call(await login('t-b'), '/api/teacher/classes/cl-a/reports')).status, 404, 'another course\'s professor');
    assert.equal((await call(await login('s-01'), '/api/teacher/classes/cl-a/reports')).status, 403, 'a student');
    assert.equal((await call(null, '/api/teacher/classes/cl-a/reports')).status, 401, 'signed out');
  } finally {
    srv.io.close();
    await new Promise((r) => srv.httpServer.close(r));
  }
});
