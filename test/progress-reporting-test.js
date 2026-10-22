// Exercise the same reporting workflow in memory and in the real Postgres
// schema. No live Supabase project or credentials are needed for these checks.
const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../server');
const { studentProgress } = require('../src/quiz/progress');
const { studentReports } = require('../src/quiz/reporting');

test('progress counts distinct confirmed questions, isolates classes and updates later marks', () => {
  const cls = { id: 'class', courseId: 'course' };
  const db = {
    topics: [{ id: 'topic', courseId: 'course', name: 'Topic' }, { id: 'empty', courseId: 'course', name: 'New topic' }],
    questions: [{ id: 'q', courseId: 'course', topicId: 'topic', status: 'published' }],
    attempts: Array.from({ length: 12 }, (_, i) => ({
      id: `a${i}`, questionId: `q${i}`, topicId: 'topic', classId: cls.id, studentId: 'student',
      at: i, correct: false, needsReview: false, sessionId: 'session',
    })),
    sessions: [{ id: 'session', studentId: 'student', classId: cls.id, completedAt: 20 }],
  };
  db.attempts.push(
    { ...db.attempts[11], id: 'retry', at: 13, correct: true },
    { ...db.attempts[11], id: 'pending', at: 14, correct: false, needsReview: true },
    { ...db.attempts[11], id: 'other-class', at: 15, classId: 'other', correct: true },
    { ...db.attempts[11], id: 'other-student', at: 16, studentId: 'other', correct: true },
  );
  let progress = studentProgress(db, 'student', cls);
  assert.equal(progress.topics[0].n, 10);
  assert.equal(progress.topics[0].correct, 1);
  assert.equal(progress.topics[0].status, 'focus');
  assert.equal(progress.topics[1].accuracy, null);
  assert.equal(progress.topics[1].status, 'building');
  assert.equal(progress.awaitingMarking, 1);
  assert.equal(progress.sessions[0].total, 14);
  assert.equal(progress.sessions[0].marked, 13);
  // A confirmed professor correction replaces the prior question result.
  db.attempts.find((a) => a.id === 'pending').needsReview = false;
  progress = studentProgress(db, 'student', cls);
  assert.equal(progress.topics[0].correct, 0);
  assert.equal(progress.awaitingMarking, 0);
  assert.equal(progress.sessions[0].marked, 14);
  // Equally timed answers still use the later-created confirmed result.
  db.attempts.push({ ...db.attempts.find((a) => a.id === 'pending'), id: 'same-time', correct: true });
  assert.equal(studentProgress(db, 'student', cls).topics[0].correct, 1);
});

for (const storage of ['memory', 'postgres']) {
  test(`progress and reports: ownership, versions, resolution and persistence (${storage})`, async (t) => {
    let pg, store;
    if (storage === 'postgres') {
      const { openPglite, pgliteAdapter, quiet } = require('./support/pglite');
      const { createSyncedStore } = require('../src/db/supabase-store');
      pg = await openPglite();
      store = await createSyncedStore({ adapter: pgliteAdapter(pg), logger: quiet(), saveDelay: 10 });
    }
    const srv = start(0, store ? { store } : { dataFile: null });
    t.after(async () => {
      await new Promise((resolve) => srv.io.close(resolve));
      if (store) await store.flush();
      if (pg) await pg.close();
    });
    await new Promise((resolve) => srv.httpServer.once('listening', resolve));
    const base = `http://localhost:${srv.httpServer.address().port}`;
    async function call(token, method, path, body) {
      const res = await fetch(base + path, {
        method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json() };
    }
    const login = async (userId) => (await call(null, 'POST', '/api/login', { userId })).body.token;
    const student = await login('s-01'), otherStudent = await login('s-02');
    const teacher = await login('t-a'), otherTeacher = await login('t-b');
    const db = srv.quiz.db;
    const path = '/api/student/classes/cl-a';
    assert.equal((await call(null, 'GET', `${path}/progress`)).status, 401);
    assert.equal((await call(student, 'GET', '/api/student/classes/cl-b/progress')).status, 404);
    assert.equal((await call(student, 'GET', '/api/student/classes/cl-b/reports')).status, 404);
    assert.equal((await call(teacher, 'GET', `${path}/reports`)).status, 403);
    const empty = (await call(await login('s-12'), 'GET', '/api/student/classes/cl-c/progress')).body;
    assert.equal(empty.indicator.accuracy, null);
    assert.deepEqual(empty.sessions, []);

    const question = (await call(teacher, 'POST', '/api/teacher/courses/c-comp/questions', {
      type: 'tf', stem: 'A report workflow example about network messages.', answerIndex: 0,
      explanation: 'Only server-side grading decides correctness.', difficulty: 'easy',
      topicId: 'tp-net', outcomeId: 'lo-net-1', sourceIds: [],
    })).body;
    assert.ok(question.id);
    await call(teacher, 'POST', `/api/teacher/questions/${question.id}/status`, { action: 'approve' });
    const reportPath = `/api/student/questions/${question.id}/report`;
    assert.equal((await call(student, 'POST', reportPath, { reason: 'Not answered yet' })).status, 404);

    const session = (await call(student, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 })).body;
    // A one-question fixture keeps the HTTP grading path deterministic.
    db.sessions.find((s) => s.id === session.id).items = [{ qid: question.id, v: 1, servedAt: null, instance: null, result: null }];
    await call(student, 'GET', `/api/student/sessions/${session.id}`);
    const answer = (await call(student, 'POST', `/api/student/sessions/${session.id}/answer`, { index: 0, choice: 0 })).body;
    assert.ok(answer.attemptId);
    const payload = { attemptId: answer.attemptId, reason: 'The wording disagrees with our notes.', category: 'ambiguous' };
    assert.equal((await call(otherStudent, 'POST', reportPath, payload)).status, 404);
    assert.equal((await call(student, 'POST', reportPath, { ...payload, attemptId: 'invented' })).status, 404);
    assert.equal((await call(student, 'POST', reportPath, { ...payload, attemptId: '' })).status, 400);
    assert.equal((await call(student, 'POST', reportPath, { ...payload, category: 'invalid' })).status, 400);
    assert.equal((await call(student, 'POST', reportPath, { ...payload, reason: '   ' })).status, 400);
    assert.equal((await call(student, 'POST', reportPath, { ...payload, reason: 'x'.repeat(301) })).status, 400);
    assert.equal((await call(student, 'POST', reportPath, payload)).body.ok, true);
    assert.equal((await call(student, 'POST', reportPath, payload)).body.already, true);
    let reports = (await call(student, 'GET', `${path}/reports`)).body;
    const report = reports.find((r) => r.questionId === question.id);
    assert.equal(reports.filter((r) => r.questionId === question.id).length, 1);
    assert.equal(report.version, 1);
    assert.equal(report.category, 'ambiguous');
    assert.equal(report.stem, question.latest.stem);
    assert.equal((await call(otherStudent, 'GET', `${path}/reports`)).body.some((r) => r.id === report.id), false);

    // Editing the question must not rewrite the reported version's wording.
    await call(teacher, 'PUT', `/api/teacher/questions/${question.id}`, { ...question.latest, stem: 'An edited network example with different wording.' });
    assert.equal((await call(student, 'GET', `${path}/reports`)).body.find((r) => r.id === report.id).stem, question.latest.stem);
    const resolvePath = `/api/teacher/questions/${question.id}/reports/${report.id}/resolve`;
    assert.equal((await call(otherTeacher, 'POST', resolvePath, {})).status, 404);
    assert.equal((await call(student, 'POST', resolvePath, {})).status, 403);
    assert.equal((await call(teacher, 'POST', resolvePath, { resolutionNote: 'x'.repeat(501) })).status, 400);
    assert.equal((await call(student, 'GET', `${path}/reports`)).body.find((r) => r.id === report.id).resolved, false);
    const rewardCount = db.ledger.length;
    const resolved = await call(teacher, 'POST', resolvePath, { resolutionNote: 'Thanks. I clarified the wording.' });
    assert.equal(resolved.status, 200);
    assert.equal(JSON.stringify(resolved.body.reports).includes('s-01'), false, 'reporter identity is hidden from professors');
    await call(teacher, 'POST', resolvePath, { resolutionNote: 'A retry must not overwrite the original reply.' });
    reports = (await call(student, 'GET', `${path}/reports`)).body;
    const finished = reports.find((r) => r.id === report.id);
    assert.equal(finished.resolved, true);
    assert.equal(finished.resolutionNote, 'Thanks. I clarified the wording.');
    assert.ok(finished.resolvedAt);
    assert.equal(db.ledger.length, rewardCount);
    assert.equal(db.attempts.find((a) => a.id === answer.attemptId).correct, true);
    for (const secret of ['answerIndex', 'modelAnswer', 'resolvedBy', 'studentId', 'instance']) {
      assert.equal(JSON.stringify(reports).includes(secret), false, `${secret} must not leak in report history`);
    }

    // Old clients can omit category and attemptId, and old stored reports
    // without new fields remain visible using their historical attempt.
    await call(student, 'POST', reportPath, { reason: 'Follow-up on the old version.' });
    const legacy = db.questions.find((q) => q.id === question.id).reports.at(-1);
    delete legacy.category; delete legacy.classId; delete legacy.version; delete legacy.stem;
    assert.equal((await call(student, 'GET', `${path}/reports`)).body.find((r) => r.id === legacy.id).version, 1);
    if (store) {
      await store.flush();
      const { createSyncedStore } = require('../src/db/supabase-store');
      const { pgliteAdapter, quiet } = require('./support/pglite');
      const reloaded = await createSyncedStore({ adapter: pgliteAdapter(pg), logger: quiet() });
      assert.deepEqual(studentReports(reloaded.db, 's-01', 'cl-a'), studentReports(db, 's-01', 'cl-a'));
      assert.equal(reloaded.db.questions.find((q) => q.id === question.id).reports.find((r) => r.id === report.id).attemptId, answer.attemptId);
    }
  });
}
