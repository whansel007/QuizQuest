// ============================================================
// Guard rails for class management and content upload
// ------------------------------------------------------------
// Each of these was a way for the app to do something it says
// it does not do:
//
//   1. a student removed from a class kept answering that
//      class's questions through a session id they still held
//   2. a join code that was not a string answered 500 instead
//      of 400
//   3. a join-code expiry far in the future produced an invalid
//      date, which breaks the store it is written to
//   4. hard-deleting a passage a question cited left that
//      question impossible to publish
//   5. the sign-in page slid into the "enter your code" form
//      even when the server said no code could be delivered
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { start } = require('../server');

async function testServer(opts = {}) {
  const srv = start(0, { dataFile: null, ...opts });
  const port = srv.httpServer.address().port;
  const base = `http://localhost:${port}`;
  const call = async (token, method, path, body = null) => {
    const opts = { method, headers: {} };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(base + path, opts);
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, body: data };
  };
  return { srv, call, close: () => new Promise((r) => srv.httpServer.close(r)) };
}

test('a student removed from a class cannot keep using that class\'s session', async () => {
  const { call, close } = await testServer();
  try {
    const teacher = (await call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;
    const student = (await call(null, 'POST', '/api/login', { userId: 's-01' })).body.token;

    // The seeded student is enrolled in cl-a and can start a session.
    const before = await call(student, 'GET', '/api/student/classes/cl-a/progress');
    assert.equal(before.status, 200);
    const session = await call(student, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 });
    assert.equal(session.status, 201);
    const sid = session.body.id;
    assert.equal((await call(student, 'GET', `/api/student/sessions/${sid}`)).status, 200);

    // The professor takes them off the roster.
    const removed = await call(teacher, 'DELETE', '/api/classes/cl-a/members/s-01');
    assert.equal(removed.status, 200);
    assert.equal((await call(student, 'GET', '/api/student/classes/cl-a/progress')).status, 404, 'the class is out of reach');

    // ...and the session they were holding goes with it.
    const stillThere = await call(student, 'GET', `/api/student/sessions/${sid}`);
    assert.equal(stillThere.status, 404, 'the session is not reachable any more');
    const answered = await call(student, 'POST', `/api/student/sessions/${sid}/answer`, { index: 0, choice: 0 });
    assert.equal(answered.status, 404, 'and it cannot be answered');
  } finally {
    await close();
  }
});

test('a join code that is not a string is refused with 400, not 500', async () => {
  const { call, close } = await testServer();
  try {
    const student = (await call(null, 'POST', '/api/login', { userId: 's-02' })).body.token;
    for (const code of [12345, true, { text: 'QQ-ABC' }, ['QQ-ABC'], null]) {
      const res = await call(student, 'POST', '/api/classes/join', { code });
      assert.equal(res.status, 400, `a code of ${JSON.stringify(code)} is a bad request`);
    }
    // No body at all is the same answer.
    assert.equal((await call(student, 'POST', '/api/classes/join', {})).status, 400);
    assert.equal((await call(student, 'POST', '/api/classes/join')).status, 400);
  } finally {
    await close();
  }
});

test('a join-code expiry outside the allowed range is refused', async () => {
  const { call, close } = await testServer();
  try {
    const teacher = (await call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;
    // A number this large overflows the date range: the expiry would be an
    // invalid Date, and writing that out breaks the store.
    for (const expiresInDays of [1e9, 1e12, 4000, 0, -5, 1.5, 'soon']) {
      const res = await call(teacher, 'POST', '/api/classes/cl-a/join-codes', { expiresInDays });
      assert.equal(res.status, 400, `an expiry of ${expiresInDays} is refused`);
    }
    // A normal expiry still works, and so does no expiry at all.
    const ok = await call(teacher, 'POST', '/api/classes/cl-a/join-codes', { expiresInDays: 30 });
    assert.equal(ok.status, 201);
    const never = await call(teacher, 'POST', '/api/classes/cl-a/join-codes', { expiresInDays: null });
    assert.equal(never.status, 201);
    const none = await call(teacher, 'POST', '/api/classes/cl-a/join-codes', {});
    assert.equal(none.status, 201);
  } finally {
    await close();
  }
});

test('a question can still be published after the material it cites is deleted', async () => {
  const { call, close } = await testServer();
  try {
    const teacher = (await call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;
    const path = '/api/teacher/courses/c-comp';

    const passage = await call(teacher, 'POST', `${path}/passages`, {
      topicId: 'tp-net',
      outcomeId: 'lo-net-1',
      title: 'Guard rail notes',
      text: 'A session is bound to the class it was planned for.',
      origin: 'paste',
      confirmNoPersonalData: true,
    });
    assert.equal(passage.status, 201);
    const pid = passage.body.id;

    // A question that cites the passage.
    const question = await call(teacher, 'POST', `${path}/questions`, {
      type: 'mcq',
      stem: 'What is a session bound to?',
      options: ['The class it was planned for', 'The student only', 'Nothing', 'The timer'],
      answerIndex: 0,
      explanation: 'The cited material says so.',
      difficulty: 'medium',
      topicId: 'tp-net',
      outcomeId: 'lo-net-1',
      sourceIds: [pid],
    });
    assert.equal(question.status, 201);

    // The professor deletes the source. The question's source list shows a
    // tombstone rather than hiding it - that is the team's design, and it
    // is covered by test/regression-test.js.
    const deleted = await call(teacher, 'DELETE', `/api/teacher/passages/${pid}`);
    assert.equal(deleted.status, 200);
    const listed = await call(teacher, 'GET', `${path}/questions`);
    const source = listed.body.find((x) => x.id === question.body.id).sources.find((s) => s.id === pid);
    assert.deepEqual(source, { id: pid, title: 'Source removed', removed: true });

    // The trap this used to be: the draft could not be approved, because
    // the check asked whether the source still exists. It does not have to:
    // the question cites the source it has always cited.
    const publish = await call(teacher, 'POST', `/api/teacher/questions/${question.body.id}/status`, { action: 'approve' });
    assert.equal(publish.status, 200, 'the question can still go live');
    assert.equal(publish.body.status, 'published');
  } finally {
    await close();
  }
});

test('the password reset says outright when email recovery is unavailable', async () => {
  const { call, close } = await testServer(); // no mail service configured
  try {
    const res = await call(null, 'POST', '/api/auth/forgot-password', { email: 'nobody@example.com' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.canReset, false, 'the sign-in page must not slide into the code form');
    assert.match(res.body.message, /not available/i);
  } finally {
    await close();
  }
});

test('an archived class starts no new practice session', async () => {
  const { call, close } = await testServer();
  try {
    const teacher = (await call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;
    const student = (await call(null, 'POST', '/api/login', { userId: 's-01' })).body.token;

    // The seeded student is enrolled in cl-a and can start a session.
    const before = await call(student, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 });
    assert.equal(before.status, 201);

    // The professor archives the class. Archiving is not deleting: the
    // attempts and the history stay.
    const archived = await call(teacher, 'POST', '/api/classes/cl-a/archive');
    assert.equal(archived.status, 200);
    assert.equal(archived.body.archived, true);

    // An archived class is closed. It takes no new students, so it must
    // start no new practice either - otherwise a student who kept the app
    // open on a stale tab can keep making attempts in a closed class.
    const after = await call(student, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 });
    assert.equal(after.status, 404);

    // The session the student already had carries on: that work was
    // legitimate when it was started.
    const resumed = await call(student, 'GET', '/api/student/classes/cl-a/progress');
    assert.equal(resumed.status, 200);

    // Restoring the class opens it again.
    const restored = await call(teacher, 'POST', '/api/classes/cl-a/archive');
    assert.equal(restored.body.archived, false);
    const reopened = await call(student, 'POST', '/api/student/sessions', { classId: 'cl-a', length: 5, timerSec: 0 });
    assert.equal(reopened.status, 201);
  } finally {
    await close();
  }
});

test('a join code cannot be generated for an archived class', async () => {
  const { call, close } = await testServer();
  try {
    const teacher = (await call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;

    const live = await call(teacher, 'POST', '/api/classes/cl-a/join-codes', { usageLimit: 10, expiresInDays: 7 });
    assert.equal(live.status, 201);

    const archived = await call(teacher, 'POST', '/api/classes/cl-a/archive');
    assert.equal(archived.body.archived, true);

    // An archived class takes no new students, so a code for one could never
    // be redeemed. Handing it out anyway is the bug: the professor would
    // show a code in the demo and the student who tried it would get
    // nothing.
    const dead = await call(teacher, 'POST', '/api/classes/cl-a/join-codes', { usageLimit: 10, expiresInDays: 7 });
    assert.equal(dead.status, 409);
    assert.match(dead.body.error, /archived/i);
  } finally {
    await close();
  }
});

test('a class can be renamed, and its description cleared', async () => {
  const { call, close } = await testServer();
  try {
    const teacher = (await call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;

    // The name is the one a student joins the class by.
    const renamed = await call(teacher, 'PATCH', '/api/classes/cl-a', { name: 'Computing - Tutorial A (evening)' });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.name, 'Computing - Tutorial A (evening)');

    // The list the professor sees holds the new name too.
    const list = await call(teacher, 'GET', '/api/classes');
    assert.equal(list.body.find((c) => c.id === 'cl-a').name, 'Computing - Tutorial A (evening)');

    // A description is optional, so an empty one is how it is cleared. It
    // used to come back as 400 "Description is required." instead.
    const cleared = await call(teacher, 'PATCH', '/api/classes/cl-a', { description: '' });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.description, '');

    // And one can be set.
    const described = await call(teacher, 'PATCH', '/api/classes/cl-a', { description: 'Thursday 2pm lab' });
    assert.equal(described.status, 200);
    assert.equal(described.body.description, 'Thursday 2pm lab');
  } finally {
    await close();
  }
});

test('a class cannot take the name of another of the professor\'s classes', async () => {
  const { call, close } = await testServer();
  try {
    const teacher = (await call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;

    // A student is enrolled into a class by its name, so two classes of the
    // same name cannot be told apart. The enrol route refuses that and says
    // "Rename one first" - so the rename has to refuse it as well, or it
    // would put the professor back in the same dead end.
    const clash = await call(teacher, 'PATCH', '/api/classes/cl-a', { name: 'Computing - Tutorial Group C' });
    assert.equal(clash.status, 409);
    assert.match(clash.body.error, /already have a class named/i);

    // The name it had is untouched.
    const list = await call(teacher, 'GET', '/api/classes');
    assert.equal(list.body.find((c) => c.id === 'cl-a').name, 'Computing - Tutorial Group A');

    // A name of its own is fine.
    const ok = await call(teacher, 'PATCH', '/api/classes/cl-a', { name: 'Computing - Tutorial Group A2' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.name, 'Computing - Tutorial Group A2');

    // An empty name is not a name.
    const empty = await call(teacher, 'PATCH', '/api/classes/cl-a', { name: '   ' });
    assert.equal(empty.status, 400);
  } finally {
    await close();
  }
});

test('a professor cannot rename a class of another professor', async () => {
  const { call, close } = await testServer();
  try {
    const other = (await call(null, 'POST', '/api/login', { userId: 't-b' })).body.token;

    // cl-a belongs to t-a. t-b must not be able to rename it - and must not
    // be able to learn that it exists either, so it is a 404.
    const denied = await call(other, 'PATCH', '/api/classes/cl-a', { name: 'Mine now' });
    assert.equal(denied.status, 404);

    const list = await call(other, 'GET', '/api/classes');
    assert.equal(list.body.find((c) => c.id === 'cl-a'), undefined);
  } finally {
    await close();
  }
});
