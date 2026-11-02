// ============================================================
// Marxel's Task 1 & 2 Test Suite: Auth, Class Management & Content Enhancements
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { start } = require('../server');

async function testServer() {
  const srv = start(0, { dataFile: null });
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

test('Task 1A: Student registration and email login', async () => {
  const { call, close } = await testServer();
  try {
    // 1. Invalid registration inputs rejected
    const shortPass = await call(null, 'POST', '/api/auth/register', { name: 'Alice', email: 'alice@example.com', password: '123' });
    assert.equal(shortPass.status, 400);

    const badEmail = await call(null, 'POST', '/api/auth/register', { name: 'Alice', email: 'not-an-email', password: 'password123' });
    assert.equal(badEmail.status, 400);

    // 2. Successful student registration
    const reg = await call(null, 'POST', '/api/auth/register', { name: 'Alice Walker', email: 'alice@example.com', password: 'securePassword123' });
    assert.equal(reg.status, 201);
    assert.ok(reg.body.token);
    assert.equal(reg.body.user.role, 'student');
    assert.equal(reg.body.user.name, 'Alice Walker');

    // 3. Duplicate email registration rejected
    const dup = await call(null, 'POST', '/api/auth/register', { name: 'Alice Two', email: 'alice@example.com', password: 'anotherPassword' });
    assert.equal(dup.status, 409);

    // 4. Login with email and password
    const login = await call(null, 'POST', '/api/login', { email: 'alice@example.com', password: 'securePassword123' });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);
    assert.equal(login.body.user.email, 'alice@example.com');

    // 5. Wrong password rejected
    const wrong = await call(null, 'POST', '/api/login', { email: 'alice@example.com', password: 'wrongPassword' });
    assert.equal(wrong.status, 401);

    // 6. Forgot password answers, but never claims an email was sent
    const fp = await call(null, 'POST', '/api/auth/forgot-password', { email: 'alice@example.com', redirectTo: 'http://localhost:5173' });
    assert.equal(fp.status, 200);
    assert.ok(fp.body.ok);
    assert.ok(!/sent/i.test(fp.body.message), `must not claim an email was sent, got: ${fp.body.message}`);

    // 7. An unauthenticated reset must NOT change any password. Naming an
    //    address is not proof of ownership, so this used to let anyone take
    //    over anyone else's account.
    const takeover = await call(null, 'POST', '/api/auth/reset-password', { email: 'alice@example.com', newPassword: 'attackerPassword999' });
    assert.equal(takeover.status, 401);
    assert.equal(takeover.body.token, undefined);

    // The account still has its old password, so the takeover changed nothing.
    const stillMine = await call(null, 'POST', '/api/login', { email: 'alice@example.com', password: 'securePassword123' });
    assert.equal(stillMine.status, 200);

    // The attacker's password never worked on this account.
    const attacker = await call(null, 'POST', '/api/login', { email: 'alice@example.com', password: 'attackerPassword999' });
    assert.equal(attacker.status, 401);

    // 8. A signed-in caller changes their own password
    const update = await call(stillMine.body.token, 'POST', '/api/auth/update-password', { newPassword: 'brandNewPassword456' });
    assert.equal(update.status, 200);
    assert.ok(update.body.token);

    // Old password no longer works
    const oldLogin = await call(null, 'POST', '/api/login', { email: 'alice@example.com', password: 'securePassword123' });
    assert.equal(oldLogin.status, 401);

    // New password works
    const newLogin = await call(null, 'POST', '/api/login', { email: 'alice@example.com', password: 'brandNewPassword456' });
    assert.equal(newLogin.status, 200);
    assert.ok(newLogin.body.token);

    // 9. A signed-in caller still cannot touch another account, even by
    //    naming that account's address in the body.
    const bob = await call(null, 'POST', '/api/auth/register', { name: 'Bob Walker', email: 'bob@example.com', password: 'bobsOwnPassword1' });
    assert.equal(bob.status, 201);
    const crossAccount = await call(newLogin.body.token, 'POST', '/api/auth/update-password', { email: 'bob@example.com', newPassword: 'stolenPassword999' });
    assert.equal(crossAccount.status, 200);
    const bobStillHim = await call(null, 'POST', '/api/login', { email: 'bob@example.com', password: 'bobsOwnPassword1' });
    assert.equal(bobStillHim.status, 200);
    const bobNotStolen = await call(null, 'POST', '/api/login', { email: 'bob@example.com', password: 'stolenPassword999' });
    assert.equal(bobNotStolen.status, 401);
  } finally {
    await close();
  }
});

test('Task 1B: Class creation, join codes, student redemption and roster', async () => {
  const { call, close } = await testServer();
  try {
    // Professor login
    const tLogin = await call(null, 'POST', '/api/login', { userId: 't-a' });
    const tToken = tLogin.body.token;

    // Student registration
    const sReg = await call(null, 'POST', '/api/auth/register', { name: 'Bob Smith', email: 'bob@example.com', password: 'password123' });
    const sToken = sReg.body.token;
    const sId = sReg.body.user.id;

    // 1. Professor creates a class
    const createRes = await call(tToken, 'POST', '/api/classes', {
      courseId: 'c-comp',
      name: 'Cybersecurity Lab 101',
      description: 'Hands-on network defense',
    });
    assert.equal(createRes.status, 201);
    const classId = createRes.body.id;
    assert.equal(createRes.body.name, 'Cybersecurity Lab 101');

    // 2. Professor generates a join code
    const codeRes = await call(tToken, 'POST', `/api/classes/${classId}/join-codes`, {
      usageLimit: 5,
      expiresInDays: 7,
    });
    assert.equal(codeRes.status, 201);
    const rawCode = codeRes.body.code;
    const codeId = codeRes.body.id;
    assert.ok(rawCode.startsWith('QQ-'));
    // 12 characters from a 32-character alphabet: the code has to be long
    // enough that a hash of it cannot be searched backwards.
    assert.match(rawCode, /^QQ-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/, 'the join code is 12 characters long');
    assert.match(codeId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'join code id is a valid UUID');

    // 3. Professor lists join codes
    // The readable code is not in the list and never was stored: only a
    // hash of it is kept, and the code is long enough (32^12) and random
    // enough that a database dump holds no code that anybody could redeem.
    // The id identifies the code, and is what Revoke uses.
    const codesList = await call(tToken, 'GET', `/api/classes/${classId}/join-codes`);
    assert.equal(codesList.status, 200);
    assert.equal(codesList.body.length, 1);
    assert.equal(codesList.body[0].code, undefined, 'the listing does not carry the readable join code');
    assert.equal(codesList.body[0].id, codeId);
    assert.equal(codesList.body[0].usageLimit, 5);

    // 4. Student redeems join code (can omit QQ- prefix or use lowercase)
    const codeWithoutPrefix = rawCode.replace(/^QQ-/, '').toLowerCase();
    const joinRes = await call(sToken, 'POST', '/api/classes/join', { code: codeWithoutPrefix });
    assert.equal(joinRes.status, 200);
    assert.ok(joinRes.body.ok);
    assert.equal(joinRes.body.class.id, classId);

    // 5. Duplicate join attempt rejected
    const dupJoin = await call(sToken, 'POST', '/api/classes/join', { code: rawCode });
    assert.equal(dupJoin.status, 400);

    // 6. Roster shows Bob
    const roster = await call(tToken, 'GET', `/api/classes/${classId}/members`);
    assert.equal(roster.status, 200);
    assert.ok(roster.body.some((m) => m.id === sId));

    // 7. The code's id is an identifier, not a credential
    // The id is stored in the clear as the row's primary key, so accepting
    // it would hand anybody who reads the database a working enrolment
    // code - which is the whole reason only the hash is kept.
    const s2Reg = await call(null, 'POST', '/api/auth/register', { name: 'Charlie', email: 'charlie@example.com', password: 'password123' });
    const joinViaId = await call(s2Reg.body.token, 'POST', '/api/classes/join', { code: codeId });
    assert.equal(joinViaId.status, 404, 'the id alone does not enrol anybody');
    assert.equal(joinViaId.body.ok, undefined);

    // ...but the real code still does.
    const joinWithCode = await call(s2Reg.body.token, 'POST', '/api/classes/join', { code: rawCode });
    assert.equal(joinWithCode.status, 200);
    assert.ok(joinWithCode.body.ok);

    // 8. Professor removes student from class
    const removeRes = await call(tToken, 'DELETE', `/api/classes/${classId}/members/${sId}`);
    assert.equal(removeRes.status, 200);
    const rosterAfter = await call(tToken, 'GET', `/api/classes/${classId}/members`);
    assert.ok(!rosterAfter.body.some((m) => m.id === sId));

    // 9. Revoking join code
    const revokeRes = await call(tToken, 'DELETE', `/api/classes/${classId}/join-codes/${codeId}`);
    assert.equal(revokeRes.status, 200);

    // 10. Revoked code cannot be redeemed
    const s3Reg = await call(null, 'POST', '/api/auth/register', { name: 'Dan', email: 'dan@example.com', password: 'password123' });
    const joinRevoked = await call(s3Reg.body.token, 'POST', '/api/classes/join', { code: rawCode });
    assert.equal(joinRevoked.status, 404);
  } finally {
    await close();
  }
});

test('Professors enrol an existing student into one of their classes by class name', async () => {
  const { call, close } = await testServer();
  try {
    const tToken = (await call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;
    const enrol = (body, token = tToken) => call(token, 'POST', '/api/classes/enrol', body);

    // Student 07 is in Prof. B's Statistics class; Prof. A adds them to Group A.
    // The class name is matched ignoring case and surrounding spaces.
    const added = await enrol({ email: 'Student07@quizquest.demo', className: '  computing - tutorial group a ' });
    assert.equal(added.status, 201);
    assert.equal(added.body.class.id, 'cl-a');
    assert.equal(added.body.student.id, 's-07');
    const roster = await call(tToken, 'GET', '/api/classes/cl-a/members');
    assert.ok(roster.body.some((m) => m.id === 's-07'));

    // They keep their other class
    const sToken = (await call(null, 'POST', '/api/login', { userId: 's-07' })).body.token;
    const theirs = await call(sToken, 'GET', '/api/classes');
    assert.deepEqual(theirs.body.map((c) => c.id).sort(), ['cl-a', 'cl-b']);

    assert.equal((await enrol({ email: 'student07@quizquest.demo', className: 'Computing - Tutorial Group A' })).status, 409, 'already enrolled');
    assert.equal((await enrol({ email: 'nobody@example.com', className: 'Computing - Tutorial Group A' })).status, 404, 'no such account');
    assert.equal((await enrol({ email: 'prof.b@quizquest.demo', className: 'Computing - Tutorial Group A' })).status, 400, 'not a student');
    assert.equal((await enrol({ email: 'not-an-email', className: 'Computing - Tutorial Group A' })).status, 400);
    assert.equal((await enrol({ email: 'student08@quizquest.demo', className: '' })).status, 400);
    // Another professor's class is not found, same as a class that does not exist
    assert.equal((await enrol({ email: 'student08@quizquest.demo', className: 'Statistics - Tutorial Group B' })).status, 404);
    // Students cannot enrol anyone, themselves included
    assert.equal((await enrol({ email: 'student07@quizquest.demo', className: 'Computing - Tutorial Group C' }, sToken)).status, 403);

    // An archived class takes no new students
    await call(tToken, 'POST', '/api/classes/cl-c/archive');
    assert.equal((await enrol({ email: 'student08@quizquest.demo', className: 'Computing - Tutorial Group C' })).status, 404);

    // Two active classes with the same name: ask the professor to rename one
    await call(tToken, 'POST', '/api/classes', { courseId: 'c-comp', name: 'Computing - Tutorial Group A' });
    assert.equal((await enrol({ email: 'student08@quizquest.demo', className: 'Computing - Tutorial Group A' })).status, 409);
  } finally {
    await close();
  }
});

test('Task 2: Passage soft-archival and metadata editing', async () => {
  const { call, close } = await testServer();
  try {
    const tLogin = await call(null, 'POST', '/api/login', { userId: 't-a' });
    const tToken = tLogin.body.token;

    // List active passages
    const listRes = await call(tToken, 'GET', '/api/teacher/courses/c-comp/passages');
    assert.equal(listRes.status, 200);
    const pid = listRes.body[0].id;
    const initialCount = listRes.body.length;

    // 1. Edit passage metadata (PATCH)
    const patchRes = await call(tToken, 'PATCH', `/api/teacher/passages/${pid}`, {
      title: 'Updated Passage Title (Task 2)',
    });
    assert.equal(patchRes.status, 200);
    assert.equal(patchRes.body.title, 'Updated Passage Title (Task 2)');

    // 2. Soft archive passage
    const archRes = await call(tToken, 'POST', `/api/teacher/passages/${pid}/archive`);
    assert.equal(archRes.status, 200);
    assert.equal(archRes.body.archived, true);

    // 3. Excluded from default list
    const afterList = await call(tToken, 'GET', '/api/teacher/courses/c-comp/passages');
    assert.equal(afterList.body.length, initialCount - 1);
    assert.ok(!afterList.body.some((p) => p.id === pid));

    // 4. Included when includeArchived=true
    const incList = await call(tToken, 'GET', '/api/teacher/courses/c-comp/passages?includeArchived=true');
    assert.equal(incList.body.length, initialCount);
    assert.ok(incList.body.some((p) => p.id === pid && p.archivedAt));

    // 5. Un-archive passage
    const unarchRes = await call(tToken, 'POST', `/api/teacher/passages/${pid}/archive`);
    assert.equal(unarchRes.status, 200);
    assert.equal(unarchRes.body.archived, false);

    const restoredList = await call(tToken, 'GET', '/api/teacher/courses/c-comp/passages');
    assert.equal(restoredList.body.length, initialCount);
  } finally {
    await close();
  }
});

test('A join code is never written to the database file', async () => {
  // The JSON-file store writes the whole database out, so a readable join
  // code kept in a record would land on the disk. This is the test that
  // fails on the old code, where the record held the code next to its
  // hash.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-joincodes-'));
  const dataFile = path.join(dir, 'db.json');
  const srv = start(0, { dataFile });
  const port = srv.httpServer.address().port;
  const base = `http://localhost:${port}`;
  const call = async (token, method, p, body = null) => {
    const opts = { method, headers: {} };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (body) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(base + p, opts);
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, body: data };
  };
  try {
    const tToken = (await call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;
    const cls = (await call(tToken, 'POST', '/api/classes', { courseId: 'c-comp', name: 'File Store Class' })).body;
    const codeRes = await call(tToken, 'POST', `/api/classes/${cls.id}/join-codes`, { usageLimit: 5, expiresInDays: 7 });
    assert.equal(codeRes.status, 201);
    const rawCode = codeRes.body.code;
    assert.ok(rawCode.startsWith('QQ-'));

    // The store writes a little after the change, so give it a moment.
    await new Promise((r) => setTimeout(r, 800));

    const written = fs.readFileSync(dataFile, 'utf8');
    assert.ok(!written.includes(rawCode), 'the readable join code is not in the database file');
    assert.ok(!written.includes(rawCode.replace(/^QQ-/, '').toLowerCase()), 'the readable join code is not in the database file in any casing');

    const stored = JSON.parse(written);
    const rec = (stored.classJoinCodes || []).find((c) => c.id === codeRes.body.id);
    assert.ok(rec, 'the join code record was written to the file');
    assert.equal(rec.code, undefined, 'the stored record holds no readable code');
    assert.ok(rec.codeHash, 'the stored record holds the hash of the code');

    // No record anywhere in the file holds a readable code.
    for (const c of stored.classJoinCodes || []) {
      assert.equal(c.code, undefined, 'no join code record holds a readable code');
    }
  } finally {
    await new Promise((r) => srv.httpServer.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('A data file written by an older build has its readable join codes dropped on load', async () => {
  // The fix promises that a database file written before it has its stored
  // readable codes dropped the first time the server starts. Nothing else
  // holds that promise in place: without this test the whole cleanup could
  // be deleted and the rest of the suite would stay green.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-stalecode-'));
  const dataFile = path.join(dir, 'db.json');
  const boot = async () => {
    const srv = start(0, { dataFile });
    const port = srv.httpServer.address().port;
    const base = `http://localhost:${port}`;
    const call = async (token, method, p, body = null) => {
      const opts = { method, headers: {} };
      if (token) opts.headers.Authorization = `Bearer ${token}`;
      if (body) {
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      const res = await fetch(base + p, opts);
      let data;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      return { status: res.status, body: data };
    };
    return { srv, call, close: () => new Promise((r) => srv.httpServer.close(r)) };
  };

  let codeId;
  let rawCode;
  try {
    // A server writes the file, and a code is generated through the API.
    const first = await boot();
    try {
      const tToken = (await first.call(null, 'POST', '/api/login', { userId: 't-a' })).body.token;
      const cls = (await first.call(tToken, 'POST', '/api/classes', { courseId: 'c-comp', name: 'Stale Code Class' })).body;
      const codeRes = await first.call(tToken, 'POST', `/api/classes/${cls.id}/join-codes`, { usageLimit: 5 });
      assert.equal(codeRes.status, 201);
      codeId = codeRes.body.id;
      rawCode = codeRes.body.code;
      await new Promise((r) => setTimeout(r, 800));
    } finally {
      await first.close();
    }

    // Now write the file the way an older build wrote it: the record holds
    // the readable code next to its hash.
    const stored = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    const rec = (stored.classJoinCodes || []).find((c) => c.id === codeId);
    assert.ok(rec, 'the join code record is in the file');
    rec.code = rawCode;
    fs.writeFileSync(dataFile, JSON.stringify(stored));
    assert.ok(fs.readFileSync(dataFile, 'utf8').includes(rawCode), 'the file holds the readable code, as an older build wrote it');

    // The next server start drops it, in memory and on the disk.
    const second = await boot();
    try {
      const inMemory = second.srv.quiz.db.classJoinCodes.find((c) => c.id === codeId);
      assert.ok(inMemory, 'the join code record survives the reload');
      assert.equal(inMemory.code, undefined, 'the server drops the stale readable code on load');
      assert.ok(inMemory.codeHash, 'the hash of the code is still there');
      await new Promise((r) => setTimeout(r, 800));
      assert.ok(!fs.readFileSync(dataFile, 'utf8').includes(rawCode), 'the stale readable code is gone from the file too');
    } finally {
      await second.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
