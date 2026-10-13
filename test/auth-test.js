// ============================================================
// Email + password sign-in
// ------------------------------------------------------------
// Runs the quiz API on its own HTTP server with an in-memory DB and a
// fake clock, so lockout expiry can be tested without waiting.
// Run with:  npm test
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { createQuizApi } = require('../src/quiz/api');
const { seed } = require('../src/quiz/seed');
const P = require('../src/quiz/passwords');

async function boot(t, opts = {}) {
  const clock = { t: Date.now() };
  const quiz = createQuizApi({ now: () => clock.t, ...opts });
  const server = http.createServer(async (req, res) => {
    if (!(await quiz.handle(req, res))) res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}`;
  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  return { quiz, clock, call };
}

test('seeded users can sign in with their demo email and password', async (t) => {
  const { call } = await boot(t);
  const r = await call('POST', '/api/login', { email: 'Student01@QuizQuest.demo ', password: P.DEMO_PASSWORD });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.id, 's-01');
  assert.equal(r.body.user.email, 'student01@quizquest.demo');
  assert.equal(r.body.user.passwordHash, undefined, 'the hash never leaves the server');
  const me = await call('GET', '/api/me', null, r.body.token);
  assert.equal(me.body.role, 'student');
  assert.equal(me.body.passwordHash, undefined);
  const prof = await call('POST', '/api/login', { email: 'prof.a@quizquest.demo', password: P.DEMO_PASSWORD });
  assert.equal(prof.body.user.role, 'teacher');
});

test('a wrong password and an unknown email get the same answer', async (t) => {
  const { call } = await boot(t);
  const wrong = await call('POST', '/api/login', { email: 'student01@quizquest.demo', password: 'nope-nope' });
  const unknown = await call('POST', '/api/login', { email: 'nobody@quizquest.demo', password: 'nope-nope' });
  assert.equal(wrong.status, 401);
  assert.deepEqual(unknown, wrong);
  assert.equal((await call('POST', '/api/login', { email: 'student01@quizquest.demo' })).status, 400);
  assert.equal((await call('POST', '/api/login', { email: 'student01@quizquest.demo', password: 'x'.repeat(5000) })).status, 401);
});

test('repeated wrong passwords lock the email for 15 minutes', async (t) => {
  const { call, clock } = await boot(t);
  const email = 'student02@quizquest.demo';
  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/login', { email, password: 'wrong-' + i })).status, 401);
  const locked = await call('POST', '/api/login', { email, password: P.DEMO_PASSWORD });
  assert.equal(locked.status, 429, 'even the right password is refused while locked');
  assert.equal((await call('POST', '/api/login', { email: 'student03@quizquest.demo', password: P.DEMO_PASSWORD })).status, 200, 'other accounts unaffected');
  clock.t += 15 * 60 * 1000 + 1;
  assert.equal((await call('POST', '/api/login', { email, password: P.DEMO_PASSWORD })).status, 200);
});

test('with demo login off, the passwordless picker is gone', async (t) => {
  const { call } = await boot(t, { demoLogin: false });
  assert.equal((await call('GET', '/api/demo-users')).status, 404);
  assert.equal((await call('POST', '/api/login', { userId: 't-a' })).status, 400);
  assert.equal((await call('POST', '/api/login', { email: 'prof.a@quizquest.demo', password: P.DEMO_PASSWORD })).status, 200);
});

test('users saved before passwords existed get demo credentials', () => {
  const db = seed();
  db.users[0].email = 'kept@example.com';
  let saves = 0;
  createQuizApi({ store: { db, save: () => saves++ } });
  assert.ok(db.users.every((u) => u.email && u.passwordHash));
  assert.equal(db.users[0].email, 'kept@example.com', 'an existing email is not overwritten');
  assert.ok(P.verifyPassword(P.DEMO_PASSWORD, db.users[1].passwordHash));
  assert.ok(saves > 0);
});

test('hashes are salted and verify only the right password', () => {
  const a = P.hashPassword('correct horse');
  assert.notEqual(a, P.hashPassword('correct horse'));
  assert.ok(P.verifyPassword('correct horse', a));
  assert.ok(!P.verifyPassword('Correct horse', a));
  assert.ok(!P.verifyPassword('correct horse', 'garbage'));
});
