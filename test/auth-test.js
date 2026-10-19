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

test('with demo login off, the account helper lists only seeded users and passwordless login is blocked', async (t) => {
  const { call } = await boot(t, { demoLogin: false });
  const listed = await call('GET', '/api/demo-users');
  assert.equal(listed.status, 200);
  assert.ok(listed.body.length > 0);
  assert.ok(listed.body.every((user) => user.email.endsWith('@quizquest.demo')));
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

test('sign-up creates a student account that can sign in', async (t) => {
  const { quiz, call } = await boot(t);
  const r = await call('POST', '/api/register', { name: ' New Student ', email: 'New@School.edu ', password: 'longenough', role: 'teacher' });
  assert.equal(r.status, 200);
  assert.ok(r.body.token);
  assert.deepEqual({ ...r.body.user, id: undefined }, { id: undefined, name: 'New Student', role: 'student', email: 'new@school.edu' });
  const stored = quiz.services.db.users.find((u) => u.email === 'new@school.edu');
  assert.ok(stored.passwordHash.startsWith('scrypt$'));
  assert.notEqual(stored.passwordHash, 'longenough');
  const me = await call('GET', '/api/me', null, r.body.token);
  assert.equal(me.body.role, 'student');
  const login = await call('POST', '/api/login', { email: 'new@school.edu', password: 'longenough' });
  assert.equal(login.status, 200);
});

test('sign-up rejects taken emails and bad input', async (t) => {
  const { call } = await boot(t);
  const taken = await call('POST', '/api/register', { name: 'Copy', email: 'STUDENT01@quizquest.demo', password: 'longenough' });
  assert.equal(taken.status, 409);
  for (const body of [
    { email: 'a@b.co', password: 'longenough' },
    { name: 'X', email: 'not-an-email', password: 'longenough' },
    { name: 'X', email: 'a@b.co', password: 'short' },
    { name: 'X', email: 'a@b.co', password: 'x'.repeat(P.PASSWORD_MAX + 1) },
    { name: 'x'.repeat(61), email: 'a@b.co', password: 'longenough' },
  ]) assert.equal((await call('POST', '/api/register', body)).status, 400, JSON.stringify(body).slice(0, 80));
});
