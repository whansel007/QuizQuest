// ============================================================
// To review page: open student reports, per class (src/quiz/reporting.js
// openReports + GET /api/teacher/classes/:classId/reports). Answers to mark
// use the existing marking route, covered in the browser tests.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { openReports } = require('../src/quiz/reporting');
const { classAnalytics } = require('../src/quiz/analytics');
const { start } = require('../server');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 9, 12);

// Computing has Group A (cl-a) and Group C (cl-c), both Prof. A's (t-a).
// The seed's one report (r-seed1, on q-n2) predates stored context: its
// class is worked out from the reporting student's answers, which are in A.
function setup() {
  const db = seed(NOW);
  const q = db.questions.find((x) => x.id === 'q-n2');
  q.reports.push(
    { id: 'r-c', studentId: 's-09', classId: 'cl-c', version: 1, stem: 'Reported wording', category: 'typo', reason: 'Missing word', at: NOW - DAY, resolved: false },
    { id: 'r-a-done', studentId: 's-02', classId: 'cl-a', version: 1, category: 'answer', reason: 'Already handled', at: NOW - 3 * DAY, resolved: true },
    // from a student with no answers at all: its class can't be worked out
    { id: 'r-unknown', studentId: 's-nobody', reason: 'Old report', at: NOW - 4 * DAY, resolved: false },
  );
  return { db, q, cls: (id) => db.classes.find((c) => c.id === id) };
}

test('each class lists its own open reports, newest first, without the reporter', () => {
  const { db, q, cls } = setup();

  const a = openReports(db, cls('cl-a'), 't-a');
  assert.deepEqual(a.items.map((r) => r.id), ['r-seed1', 'r-unknown'], "A's report and the unplaced one; not C's, not resolved ones");
  assert.deepEqual(a.otherClasses, [{ id: 'cl-c', name: 'Computing - Tutorial Group C', count: 1 }], 'points to C, which has one');
  const c = openReports(db, cls('cl-c'), 't-a');
  assert.deepEqual(c.items.map((r) => r.id), ['r-c', 'r-unknown']);
  assert.deepEqual(c.otherClasses.map((x) => [x.id, x.count]), [['cl-a', 1]], 'the unplaced report is not counted twice');

  const [seeded, unknown] = a.items;
  assert.equal(seeded.classKnown, true);
  assert.equal(seeded.category, 'other');
  assert.equal(seeded.topic, 'Networking basics');
  assert.equal(seeded.questionId, 'q-n2');
  assert.equal(unknown.classKnown, false);
  assert.equal(c.items[0].stem, 'Reported wording', 'the wording the student saw, not a later edit');
  for (const r of [...a.items, ...c.items]) {
    assert.equal(r.studentId, undefined, 'never who sent it');
    assert.ok(!/s-0|s-nobody/.test(JSON.stringify(r)), 'no student id anywhere in the row');
  }

  // the dashboard's counts are the same per-class ones
  assert.equal(classAnalytics(db, 'cl-a', NOW, { range: 'all' }).openReports, a.items.length);
  assert.equal(classAnalytics(db, 'cl-c', NOW, { range: 'all' }).openReports, c.items.length);
  // another course's class sees none of them
  assert.deepEqual(openReports(db, cls('cl-b'), 't-b'), { items: [], otherClasses: [] });

  // a resolved report leaves its class's list and the other class's pointer
  q.reports.find((r) => r.id === 'r-c').resolved = true;
  assert.deepEqual(openReports(db, cls('cl-c'), 't-a').items.map((r) => r.id), ['r-unknown']);
  assert.deepEqual(openReports(db, cls('cl-a'), 't-a').otherClasses, []);
});

test("the pointer leaves out other professors' and archived classes", () => {
  const { db, cls } = setup();
  db.classes.push(
    { id: 'cl-other', courseId: 'c-comp', name: 'Computing - Group D', teacherIds: ['t-b'], settings: {} },
    { id: 'cl-old', courseId: 'c-comp', name: 'Computing - Old group', teacherIds: ['t-a'], settings: {}, archivedAt: NOW - DAY },
  );
  const q = db.questions.find((x) => x.id === 'q-n1');
  q.reports.push(
    { id: 'r-d', studentId: 's-10', classId: 'cl-other', version: 1, reason: 'x', at: NOW, resolved: false },
    { id: 'r-old', studentId: 's-11', classId: 'cl-old', version: 1, reason: 'y', at: NOW, resolved: false },
  );
  assert.deepEqual(openReports(db, cls('cl-a'), 't-a').otherClasses.map((c) => c.id), ['cl-c']);
});

test("the reports route is for the class's own professors only", async () => {
  const srv = start(0, { dataFile: null });
  await new Promise((r) => srv.httpServer.once('listening', r));
  const base = 'http://localhost:' + srv.httpServer.address().port;
  const login = async (userId) => (await (await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) })).json()).token;
  const call = async (token, path) => {
    const res = await fetch(base + path, { headers: token ? { authorization: 'Bearer ' + token } : {} });
    return { status: res.status, body: await res.json() };
  };
  try {
    const prof = await login('t-a');
    const a = await call(prof, '/api/teacher/classes/cl-a/reports');
    assert.equal(a.status, 200);
    assert.deepEqual(a.body.items.map((r) => r.id), ['r-seed1']);
    assert.deepEqual(a.body.otherClasses, []);
    const c = await call(prof, '/api/teacher/classes/cl-c/reports');
    assert.deepEqual(c.body.items, []);
    assert.deepEqual(c.body.otherClasses.map((x) => [x.id, x.count]), [['cl-a', 1]]);
    assert.equal((await call(await login('t-b'), '/api/teacher/classes/cl-a/reports')).status, 404, "another course's professor");
    assert.equal((await call(await login('s-01'), '/api/teacher/classes/cl-a/reports')).status, 403, 'a student');
    assert.equal((await call(null, '/api/teacher/classes/cl-a/reports')).status, 401, 'signed out');
  } finally {
    srv.io.close();
    await new Promise((r) => srv.httpServer.close(r));
  }
});
