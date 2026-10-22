// ============================================================
// Marxel's Task 1 & 2 Test Suite: Auth, Class Management & Content Enhancements
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
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

    // 6. Forgot password endpoint
    const fp = await call(null, 'POST', '/api/auth/forgot-password', { email: 'alice@example.com', redirectTo: 'http://localhost:5173' });
    assert.equal(fp.status, 200);
    assert.ok(fp.body.ok);

    // 7. Reset password updates password and issues session token
    const reset = await call(null, 'POST', '/api/auth/reset-password', { email: 'alice@example.com', newPassword: 'brandNewPassword456' });
    assert.equal(reset.status, 200);
    assert.ok(reset.body.token);

    // Old password no longer works
    const oldLogin = await call(null, 'POST', '/api/login', { email: 'alice@example.com', password: 'securePassword123' });
    assert.equal(oldLogin.status, 401);

    // New password works
    const newLogin = await call(null, 'POST', '/api/login', { email: 'alice@example.com', password: 'brandNewPassword456' });
    assert.equal(newLogin.status, 200);
    assert.ok(newLogin.body.token);
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

    // 3. Professor lists join codes
    const codesList = await call(tToken, 'GET', `/api/classes/${classId}/join-codes`);
    assert.equal(codesList.status, 200);
    assert.equal(codesList.body.length, 1);
    assert.equal(codesList.body[0].usageLimit, 5);

    // 4. Student redeems join code
    const joinRes = await call(sToken, 'POST', '/api/classes/join', { code: rawCode });
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

    // 7. Professor removes student from class
    const removeRes = await call(tToken, 'DELETE', `/api/classes/${classId}/members/${sId}`);
    assert.equal(removeRes.status, 200);
    const rosterAfter = await call(tToken, 'GET', `/api/classes/${classId}/members`);
    assert.ok(!rosterAfter.body.some((m) => m.id === sId));

    // 8. Revoking join code
    const revokeRes = await call(tToken, 'DELETE', `/api/classes/${classId}/join-codes/${codeId}`);
    assert.equal(revokeRes.status, 200);

    // 9. Revoked code cannot be redeemed
    const s2Reg = await call(null, 'POST', '/api/auth/register', { name: 'Charlie', email: 'charlie@example.com', password: 'password123' });
    const joinRevoked = await call(s2Reg.body.token, 'POST', '/api/classes/join', { code: rawCode });
    assert.equal(joinRevoked.status, 404);
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
