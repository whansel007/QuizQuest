// Weekly topics: material, reports and questions grouped per topic, and
// the dashboard narrowed to one topic.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { seed } = require('../src/quiz/seed');
const { createQuizApi } = require('../src/quiz/api');
const { classAnalytics, courseComparison } = require('../src/quiz/analytics');

const markdown = '# Weekly report\nPackets carry data. Latency measures delay and bandwidth describes capacity.';
const settled = async (job) => {
  while (['queued', 'running'].includes(job.status)) await new Promise((r) => setTimeout(r, 5));
};

async function serve(t, db, opts = {}) {
  const api = createQuizApi({ store: { db, save() {}, flush: async () => {}, pending: () => false }, ...opts });
  const server = http.createServer((req, res) => api.handle(req, res));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const req = async (method, url, body, token) => {
    const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() };
  };
  const login = async (userId) => (await req('POST', '/api/login', { userId })).body.token;
  return { req, login };
}

test('topics: create, order by week, edit, add outcomes, delete only when empty', async (t) => {
  const db = seed();
  const { req, login } = await serve(t, db);
  const prof = await login('t-a');
  const other = await login('t-b');
  const path = '/api/teacher/courses/c-comp/topics';

  const made = await req('POST', path, { name: 'Operating systems', week: 5, outcome: 'Explain what an operating system manages' }, prof);
  assert.equal(made.status, 201);
  assert.equal(made.body.week, 5);
  assert.equal(made.body.outcomes.length, 1);
  const early = (await req('POST', path, { name: 'Course intro', week: 1 }, prof)).body;
  const unweeked = (await req('POST', path, { name: 'Revision' }, prof)).body;
  assert.equal(unweeked.week, undefined);

  assert.equal((await req('POST', path, { name: 'networking BASICS' }, prof)).status, 400, 'names are unique per course, any case');
  assert.equal((await req('POST', path, { name: 'Week zero', week: 0 }, prof)).status, 400);
  assert.equal((await req('POST', path, { name: 'Half week', week: 2.5 }, prof)).status, 400);
  assert.equal((await req('POST', path, { name: '' }, prof)).status, 400);
  assert.equal((await req('POST', path, { name: 'Not mine' }, other)).status, 404);

  // the course list and the summary follow the teaching order; equal weeks keep creation order
  const course = (await req('GET', '/api/teacher/courses', null, prof)).body.find((c) => c.id === 'c-comp');
  assert.deepEqual(course.topics.map((x) => x.name), ['Data representation', 'Course intro', 'Networking basics', 'Cyber hygiene', 'Operating systems', 'Revision']);
  const summary = (await req('GET', path, null, prof)).body;
  assert.deepEqual(summary.topics.map((x) => x.week), [1, 1, 2, 3, 5, null]);
  assert.deepEqual(summary.topics.find((x) => x.topicId === 'tp-net').questions, { draft: 1, published: 8, withdrawn: 0, rejected: 0 });

  const edited = await req('PUT', `/api/teacher/topics/${made.body.id}`, { name: 'Operating systems basics', week: 4, addOutcome: 'Compare processes and threads' }, prof);
  assert.equal(edited.status, 200);
  assert.equal(edited.body.week, 4);
  assert.deepEqual(edited.body.outcomes.map((o) => o.text), ['Explain what an operating system manages', 'Compare processes and threads']);
  assert.equal((await req('PUT', `/api/teacher/topics/${made.body.id}`, { addOutcome: 'compare processes and threads' }, prof)).status, 400);
  assert.equal((await req('PUT', `/api/teacher/topics/${made.body.id}`, { name: 'Cyber hygiene' }, prof)).status, 400);
  assert.equal((await req('PUT', `/api/teacher/topics/${made.body.id}`, { week: 99, name: 'Changed' }, prof)).status, 400);
  assert.equal(db.topics.find((x) => x.id === made.body.id).name, 'Operating systems basics', 'a rejected edit changes nothing');
  assert.equal((await req('PUT', `/api/teacher/topics/${early.id}`, { week: null }, prof)).body.week, undefined);
  assert.equal((await req('PUT', `/api/teacher/topics/${made.body.id}`, { week: 1 }, other)).status, 404);

  assert.equal((await req('DELETE', '/api/teacher/topics/tp-net', null, prof)).status, 409, 'questions and answers keep a topic');
  assert.equal((await req('DELETE', `/api/teacher/topics/${unweeked.id}`, null, other)).status, 404);
  assert.equal((await req('DELETE', `/api/teacher/topics/${unweeked.id}`, null, prof)).status, 200);
  assert.ok(!db.topics.some((x) => x.id === unweeked.id));
});

test('uploads, knowledge reports and drafted questions stay inside their weekly topic', async (t) => {
  const db = seed();
  const course = db.courses.find((c) => c.id === 'c-comp');
  let calls = 0;
  const { req, login } = await serve(t, db, { authoringAI: async () => (calls++, { json: { markdown, insufficient: false } }) });
  const prof = await login('t-a');
  const path = '/api/teacher/courses/c-comp';
  const file = (name, topicId, extra = {}) => ({ topicId, confirmNoPersonalData: true, origin: 'pdf', documentId: name[0].repeat(64), fileName: name, title: `${name} · Page 1`, text: `Lecture text of ${name}. ${markdown}`, ...extra });

  const net = (await req('POST', path + '/import', file('a-net.pdf', 'tp-net'), prof)).body;
  const sec = (await req('POST', path + '/import', file('b-sec.pdf', 'tp-sec'), prof)).body;
  const loose = (await req('POST', path + '/import', file('c-loose.pdf', undefined), prof)).body;
  assert.equal(net.topicId, 'tp-net');
  assert.equal(net.outcomeId, null, 'an outcome is optional for uploads');
  assert.equal(loose.topicId, null, 'older course-wide uploads are still accepted');
  assert.equal((await req('POST', path + '/import', file('d.pdf', 'nope'), prof)).status, 400);

  const summary = (await req('GET', path + '/topics', null, prof)).body;
  assert.equal(summary.topics.find((x) => x.topicId === 'tp-net').files, 1);
  assert.equal(summary.unsortedFiles, 1);

  // a topic report reads only that topic's files
  const start = await req('POST', path + '/authoring', { kind: 'report', topicId: 'tp-net', materialIds: [net.id] }, prof);
  assert.equal(start.status, 202);
  const report = course.authoringJobs.find((j) => j.id === start.body.id);
  await settled(report);
  assert.equal(report.status, 'complete');
  assert.deepEqual(report.input.passageIds, [net.id]);
  assert.equal(report.input.topicId, 'tp-net');
  assert.equal((await req('POST', path + '/authoring', { kind: 'report', topicId: 'tp-net', materialIds: [net.id, sec.id] }, prof)).status, 409, 'another topic\'s file is not attached here');
  assert.equal((await req('POST', path + '/authoring', { kind: 'report', topicId: 'tp-zzz', materialIds: [net.id] }, prof)).status, 400);
  assert.equal((await req('POST', path + '/authoring', { kind: 'report', topicId: 'tp-data', materialIds: [] }, prof)).status, 400, 'no files in that topic');

  // a complete report in Week 2 does not make Week 3's first report a "material change"
  const secStart = await req('POST', path + '/authoring', { kind: 'report', topicId: 'tp-sec', materialIds: [sec.id] }, prof);
  assert.equal(secStart.status, 202);
  await settled(course.authoringJobs.find((j) => j.id === secStart.body.id));

  assert.equal((await req('PUT', path + `/authoring/${report.id}/review`, { reportRevision: 0, markdown }, prof)).status, 200);
  const ask = (topicId) => ({ kind: 'generation', attemptId: 'attempt-' + topicId + '-0001', analysisId: report.id, reportRevision: 1, topicId, learningOutcome: 'Diagnose delay versus capacity problems', assessmentStyle: 'both', quantities: { mcq: 1 } });
  const wrong = await req('POST', path + '/authoring', ask('tp-sec'), prof);
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /another topic/);
  const before = db.topics.find((x) => x.id === 'tp-net').outcomes.length;
  const gen = await req('POST', path + '/authoring', ask('tp-net'), prof);
  assert.equal(gen.status, 202);
  assert.equal(gen.body.input.topicId, 'tp-net');
  assert.equal(gen.body.input.topicText, 'Networking basics');
  assert.equal(db.topics.find((x) => x.id === 'tp-net').outcomes.length, before + 1, 'a new learning outcome joins the existing topic');
  await settled(course.authoringJobs.find((j) => j.id === gen.body.id));
});

test('an uploaded file can be moved into a weekly topic', async (t) => {
  const db = seed();
  const { req, login } = await serve(t, db);
  const prof = await login('t-a');
  const path = '/api/teacher/courses/c-comp';
  const upload = { confirmNoPersonalData: true, origin: 'pptx', documentId: 'e'.repeat(64), fileName: 'week2.pptx', title: 'week2.pptx · Slide 1', text: 'Routers forward packets between networks.' };
  const part = (await req('POST', path + '/import', upload, prof)).body;

  assert.equal((await req('PUT', path + '/imports', { passageIds: [part.id], topicId: 'nope' }, prof)).status, 400);
  assert.equal((await req('PUT', '/api/teacher/courses/c-stats/imports', { passageIds: [part.id], topicId: 'tp-net' }, prof)).status, 404);
  assert.equal((await req('PUT', path + '/imports', { passageIds: [part.id], topicId: 'tp-net' }, prof)).status, 200);
  const moved = db.passages.find((p) => p.id === part.id);
  assert.equal(moved.topicId, 'tp-net');
  assert.equal(moved.attached, true, 'moving keeps the file in use');

  // uploading the same file to that topic again finds the moved copy
  const again = await req('POST', path + '/import', { ...upload, topicId: 'tp-net' }, prof);
  assert.equal(again.status, 200);
  assert.equal(again.body.id, part.id);

  // the same file uploaded separately to Week 3 cannot be moved on top of Week 2's copy
  const copy = (await req('POST', path + '/import', { ...upload, topicId: 'tp-sec' }, prof)).body;
  assert.notEqual(copy.id, part.id);
  assert.equal((await req('PUT', path + '/imports', { passageIds: [copy.id], topicId: 'tp-net' }, prof)).status, 409);
});

test('dashboard: one weekly topic narrows every figure; the overview lists all topics', () => {
  const now = Date.now();
  const db = seed(now);
  const all = classAnalytics(db, 'cl-a', now, { range: 'all' });
  const net = classAnalytics(db, 'cl-a', now, { range: 'all', topicId: 'tp-net' });
  const netAnswers = db.attempts.filter((a) => a.classId === 'cl-a' && a.topicId === 'tp-net');

  assert.equal(all.topicId, null);
  assert.equal(net.topicId, 'tp-net');
  assert.deepEqual(net.byTopic.map((x) => x.topicId), ['tp-net']);
  assert.deepEqual(net.trend.topics.map((x) => x.id), ['tp-net']);
  assert.equal(net.participation.attempts, netAnswers.length);
  assert.ok(net.participation.attempts < all.participation.attempts);
  assert.ok(net.commonlyMissed.every((q) => q.topic === 'Networking basics'));
  assert.ok(net.time.questions.every((q) => q.topic === 'Networking basics'));
  assert.equal(net.tags.total, db.questions.filter((q) => q.courseId === 'c-comp' && q.topicId === 'tp-net' && q.status !== 'rejected').length);
  assert.equal(net.openReports, 1, 'the seeded report is on a Networking question');
  assert.equal(classAnalytics(db, 'cl-a', now, { range: 'all', topicId: 'tp-data' }).openReports, 0);
  // a session counts for the topic only when it included the topic's questions
  const netSessions = new Set(netAnswers.map((a) => a.sessionId));
  assert.equal(net.participation.sessionsCompleted, db.sessions.filter((s) => s.classId === 'cl-a' && s.completedAt && netSessions.has(s.id)).length);

  // the overview is the same with or without the filter: every topic, in week order
  for (const a of [all, net]) {
    assert.deepEqual(a.overview.topics.map((x) => [x.week, x.name]), [[1, 'Data representation'], [2, 'Networking basics'], [3, 'Cyber hygiene']]);
  }
  const row = all.overview.topics.find((x) => x.topicId === 'tp-net');
  assert.equal(row.answers, netAnswers.length);
  assert.equal(row.first.n, netAnswers.filter((a) => a.first && !a.needsReview).length);
  assert.equal(row.questions.draft, 1);
  assert.ok(row.passages >= 2);

  const compare = courseComparison(db, ['cl-a', 'cl-c'], now, { range: 'all', topicId: 'tp-sec' });
  for (const c of compare) {
    assert.deepEqual(c.topics.map((x) => x.topicId), ['tp-sec']);
    assert.equal(c.attempts, db.attempts.filter((a) => a.classId === c.classId && a.topicId === 'tp-sec').length);
  }
});

test('dashboard API: the topic filter is checked against the class\'s course', async (t) => {
  const db = seed();
  const { req, login } = await serve(t, db);
  const prof = await login('t-a');
  const ok = await req('GET', '/api/teacher/classes/cl-a/analytics?range=all&topic=tp-sec', null, prof);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.topicId, 'tp-sec');
  assert.equal((await req('GET', '/api/teacher/classes/cl-a/analytics?range=all&topic=tp-stats', null, prof)).status, 400, 'another course\'s topic');
  const unfiltered = await req('GET', '/api/teacher/classes/cl-a/analytics?range=all', null, prof);
  assert.equal(unfiltered.body.topicId, null, 'a cached filtered result is not served for the unfiltered view');
  assert.equal((await req('GET', '/api/teacher/courses/c-comp/compare?range=all&topic=tp-net', null, prof)).body[0].topics.length, 1);

  // the marking queue follows the same filter
  const base = { classId: 'cl-a', courseId: 'c-comp', studentId: 's-01', questionId: 'q-x3', version: 1, type: 'short', text: 'Less delay.', correct: false, score: 0.3, needsReview: true, at: Date.now() };
  db.attempts.push({ ...base, id: 'at-mark-net', topicId: 'tp-net' }, { ...base, id: 'at-mark-sec', topicId: 'tp-sec' });
  const queue = async (q) => (await req('GET', '/api/teacher/classes/cl-a/marking' + q, null, prof)).body.items.map((m) => m.attemptId).sort();
  assert.deepEqual(await queue(''), ['at-mark-net', 'at-mark-sec']);
  assert.deepEqual(await queue('?topic=tp-net'), ['at-mark-net']);
  assert.equal((await req('GET', '/api/teacher/classes/cl-a/marking?topic=tp-stats', null, prof)).status, 400);
});

test('"Add material" can create a new topic and a typed learning outcome with the passage', async (t) => {
  const db = seed();
  const { req, login } = await serve(t, db);
  const prof = await login('t-a');
  const path = '/api/teacher/courses/c-comp/passages';
  const base = { title: 'Notes', text: 'Packets carry data across a network.', confirmNoPersonalData: true };
  const topicCount = db.topics.length;

  // a rejected request creates nothing
  assert.equal((await req('POST', path, { ...base, newTopic: { name: 'Cloud basics', week: 6 } }, prof)).status, 400, 'a new topic needs a typed outcome');
  assert.equal((await req('POST', path, { ...base, newTopic: { name: 'networking basics' }, outcomeText: 'Explain clouds' }, prof)).status, 400, 'duplicate topic name');
  assert.equal((await req('POST', path, { ...base, newTopic: { name: 'Cloud basics', week: 99 }, outcomeText: 'Explain clouds' }, prof)).status, 400);
  assert.equal((await req('POST', path, { ...base, title: '', newTopic: { name: 'Cloud basics' }, outcomeText: 'Explain clouds' }, prof)).status, 400);
  assert.equal((await req('POST', path, { ...base, confirmNoPersonalData: false, topicId: 'tp-net', outcomeText: 'Explain clouds' }, prof)).status, 400);
  assert.equal(db.topics.length, topicCount);
  assert.ok(!db.topics.find((x) => x.id === 'tp-net').outcomes.some((o) => o.text === 'Explain clouds'));

  const made = await req('POST', path, { ...base, newTopic: { name: 'Cloud basics', week: 6 }, outcomeText: '  Explain what the cloud is  ' }, prof);
  assert.equal(made.status, 201);
  const topic = db.topics.find((x) => x.id === made.body.topicId);
  assert.equal(topic.name, 'Cloud basics');
  assert.equal(topic.week, 6);
  assert.deepEqual(topic.outcomes, [{ id: made.body.outcomeId, text: 'Explain what the cloud is' }]);
  assert.equal(made.body.topic.id, topic.id);

  // a typed outcome on an existing topic is added to it; re-typing it reuses it
  const net = db.topics.find((x) => x.id === 'tp-net');
  const before = net.outcomes.length;
  const typed = await req('POST', path, { ...base, topicId: 'tp-net', outcomeText: 'Compare latency and bandwidth' }, prof);
  assert.equal(typed.status, 201);
  assert.equal(net.outcomes.length, before + 1);
  const again = await req('POST', path, { ...base, topicId: 'tp-net', outcomeText: 'compare LATENCY and bandwidth' }, prof);
  assert.equal(again.body.outcomeId, typed.body.outcomeId);
  assert.equal(net.outcomes.length, before + 1);

  // the course list shows the new topic and outcome
  const course = (await req('GET', '/api/teacher/courses', null, prof)).body.find((c) => c.id === 'c-comp');
  assert.ok(course.topics.some((x) => x.id === topic.id));
  // picking existing ones still works, and still requires them
  assert.equal((await req('POST', path, { ...base, topicId: 'tp-net', outcomeId: typed.body.outcomeId }, prof)).status, 201);
  assert.equal((await req('POST', path, { ...base, topicId: 'tp-net' }, prof)).status, 400);
});
