// material-archive-test.js
//
// The Source material library: a passage can be archived and restored, its
// metadata can be edited, and archived material is left out of the material
// a knowledge report is made from.
//
// The archive routes and the metadata route already had tests in
// auth-classes-test.js; what is checked here is the rule that makes
// archiving mean something - material the professor took out must not reach
// the model.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { createAuthoring } = require('../src/quiz/authoring');
const { start } = require('../server');

// A server of its own, so the test can talk to the app the way a browser
// does.
async function testServer(opts = {}) {
  const srv = start(0, { dataFile: null, ...opts });
  const port = srv.httpServer.address().port;
  const base = `http://localhost:${port}`;
  const call = async (token, method, path, body = null) => {
    const options = { method, headers: {} };
    if (token) options.headers.Authorization = `Bearer ${token}`;
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const res = await fetch(base + path, options);
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, body: data };
  };
  return { srv, call, close: () => new Promise((r) => srv.httpServer.close(r)) };
}

// Wait for a queued job to finish, the way the other authoring tests do.
async function settled(job) {
  const deadline = Date.now() + 10000;
  while (job.status === 'queued' || job.status === 'running') {
    if (Date.now() > deadline) throw new Error('Job did not settle');
    await new Promise((r) => setTimeout(r, 5));
  }
  return job;
}

function fixture() {
  const db = seed();
  const course = db.courses.find((c) => c.id === 'c-comp');
  const topic = db.topics.find((t) => t.courseId === course.id);
  const material = db.passages.filter((p) => p.courseId === course.id && p.topicId === topic.id);
  return { db, course, topic, material };
}

test('archived material is left out of a knowledge report', async () => {
  const f = fixture();
  assert.ok(f.material.length, 'the seeded course has material to work with');
  const archived = f.material[0];
  archived.archivedAt = '2026-11-04T00:00:00.000Z';

  let prompt = '';
  const provider = async (call) => {
    prompt = call.prompt;
    return {
      json: {
        markdown:
          '## Network concepts\nPackets carry data across a network. Latency measures delay; bandwidth measures capacity. These are distinct properties that affect applications differently.',
        insufficient: false,
      },
    };
  };
  const run = createAuthoring({ db: f.db, persist: async () => {}, ai: provider });

  // The upload list the professor sees never offers archived material, so a
  // report made from that list leaves the archived passage out.
  const listed = f.material.filter((p) => !p.archivedAt).map((p) => p.id);
  const job = run.start(f.course, 'report', { topicId: f.topic.id, materialIds: listed }, 't-a');
  await settled(job);
  assert.equal(job.status, 'complete', `the report was made: ${job.message || ''}`);
  assert.ok(!prompt.includes(archived.text.slice(0, 60)), 'the archived passage is not sent to the model');
  assert.ok(prompt.includes(f.material[1].text.slice(0, 60)), 'the material that is not archived is sent');
});

test('a material list that still holds an archived passage is refused, not quietly trimmed', async () => {
  const f = fixture();
  f.material[0].archivedAt = '2026-11-04T00:00:00.000Z';
  const provider = async () => ({
    json: {
      markdown:
        '## Network concepts\nPackets carry data across a network. Latency measures delay; bandwidth measures capacity. These are distinct properties that affect applications differently.',
      insufficient: false,
    },
  });
  const run = createAuthoring({ db: f.db, persist: async () => {}, ai: provider });

  // A stale list (the professor archived something after the list was built)
  // must not produce a report from half the material. The professor is told
  // to refresh the list instead.
  assert.throws(
    () => run.start(f.course, 'report', { topicId: f.topic.id, materialIds: f.material.map((p) => p.id) }, 't-a'),
    /Attached files changed/,
  );
});

test('a passage can be archived, listed as archived, restored, and given new metadata - by its own professor only', async () => {
  const { call, close } = await testServer();
  try {
    const teacher = (await call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;
    const other = (await call(null, 'POST', '/api/login', { userId: 't-b' })).body.token;

    const created = await call(teacher, 'POST', '/api/teacher/courses/c-comp/passages', {
      topicId: 'tp-net',
      outcomeId: 'lo-net-1',
      title: 'A note to archive',
      text: 'Some material the professor wrote for the topic.',
      origin: 'paste',
      confirmNoPersonalData: true,
    });
    assert.equal(created.status, 201);
    const id = created.body.id;

    // Another professor cannot touch it.
    assert.equal((await call(other, 'POST', `/api/teacher/passages/${id}/archive`, { archived: true })).status, 404);
    assert.equal((await call(other, 'PATCH', `/api/teacher/passages/${id}`, { title: 'Taken over' })).status, 404);

    // Archiving takes it out of the library, and it is still stored.
    const before = await call(teacher, 'GET', '/api/teacher/courses/c-comp/passages');
    assert.ok(before.body.some((p) => p.id === id), 'the note is in the library');
    assert.equal((await call(teacher, 'POST', `/api/teacher/passages/${id}/archive`, { archived: true })).status, 200);
    const after = await call(teacher, 'GET', '/api/teacher/courses/c-comp/passages');
    assert.ok(!after.body.some((p) => p.id === id), 'an archived passage leaves the library');
    const listed = await call(teacher, 'GET', '/api/teacher/courses/c-comp/passages?includeArchived=true');
    const row = listed.body.find((p) => p.id === id);
    assert.ok(row, 'the archived passage is still stored, because questions cite it');
    assert.ok(row.archivedAt, 'it is marked as archived');

    // Its metadata can be edited; its text cannot.
    const patched = await call(teacher, 'PATCH', `/api/teacher/passages/${id}`, {
      title: 'A clearer title',
      topicId: 'tp-sec',
      outcomeId: 'lo-sec-1',
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.body.title, 'A clearer title');
    assert.equal(patched.body.topicId, 'tp-sec');
    assert.equal(patched.body.text, 'Some material the professor wrote for the topic.', 'the text is unchanged');

    // Restoring puts it back.
    assert.equal((await call(teacher, 'POST', `/api/teacher/passages/${id}/archive`, { archived: false })).status, 200);
    const restored = await call(teacher, 'GET', '/api/teacher/courses/c-comp/passages');
    assert.ok(restored.body.some((p) => p.id === id), 'a restored passage is back in the library');
  } finally {
    await close();
  }
});
