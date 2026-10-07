// ============================================================
// World tests: the multiplayer layer keeps the same promises
// ------------------------------------------------------------
// Real server, real socket.io-client connections (like tag-test.js):
//   - no token / teacher token -> refused at the handshake
//   - joining another class's world is refused
//   - challenges never carry answer keys
//   - gathering and raid damage only happen on correct answers
// Movement is server-authoritative, so to stand next to a node the
// test places the player directly in the server's world state.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const ioClient = require('socket.io-client');
const { start } = require('../server');

let srv;
let base;
const db = () => srv.quiz.db;

async function login(userId) {
  const r = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) });
  return (await r.json()).token;
}
const once = (s, ev, ms = 3000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout waiting for ' + ev)), ms);
  s.once(ev, (x) => {
    clearTimeout(t);
    resolve(x);
  });
});
function connect(token) {
  return ioClient(base + '/world', { transports: ['websocket'], auth: { token }, reconnection: false });
}
function rightAnswer(ch) {
  const q = db().questions.find((x) => x.id === ch.q.id);
  const v = ch.v;
  if (v.type === 'param') return { choice: ch.instance.answerIndex };
  if (v.type === 'multi') return { choices: v.answerIndexes };
  if (v.type === 'numeric') return { value: v.answer };
  return { choice: q && v.answerIndex };
}
const wrongAnswer = (ch) => {
  const v = ch.v;
  if (v.type === 'numeric') return { value: v.answer + 1000 };
  if (v.type === 'multi') return { choices: [] };
  const right = v.type === 'param' ? ch.instance.answerIndex : v.answerIndex;
  return { choice: right === 0 ? 1 : 0 };
};

test.before(async () => {
  srv = start(0, { dataFile: null });
  await new Promise((r) => srv.httpServer.once('listening', r));
  base = 'http://localhost:' + srv.httpServer.address().port;
});
test.after(() => srv.io.close());

test('handshake requires a student token', async () => {
  const anon = connect('nope');
  assert.match((await once(anon, 'connect_error')).message, /sign in/i);
  anon.close();
  const prof = connect(await login('t-a'));
  assert.match((await once(prof, 'connect_error')).message, /student/i);
  prof.close();
});

test('cannot join another class\'s world', async () => {
  const s = connect(await login('s-07')); // class B
  await once(s, 'connect');
  s.emit('join', { classId: 'cl-a' });
  assert.match(await once(s, 'notice'), /not in that class/);
  s.close();
});

test('gathering: question has no answer key; wrong = nothing, right = resources', async () => {
  const s = connect(await login('s-02'));
  await once(s, 'connect');
  s.emit('join', { classId: 'cl-a' });
  const welcome = await once(s, 'welcome');
  const world = srv.world.worlds.get('cl-a');
  const me = world.players.get(welcome.you);
  const res = () => db().inventory.find((i) => i.studentId === 's-02').resources;

  // stand on a node, ask, answer WRONG
  let node = world.nodes[0];
  Object.assign(me, { x: node.x, y: node.y });
  s.emit('interact');
  let ch = await once(s, 'challenge');
  const raw = JSON.stringify(ch);
  for (const key of ['answerIndex', 'answerIndexes', 'explanation', 'answerExpr', 'modelAnswer', 'tolerance']) assert.ok(!raw.includes(key), 'leaked ' + key);
  assert.equal(ch.kind, 'gather');
  const before = { ...res() };
  s.emit('answer', { id: ch.id, submission: wrongAnswer(me.challenge) });
  let r = await once(s, 'result');
  assert.equal(r.correct, false);
  assert.deepEqual(res(), before);
  assert.ok(world.nodes.includes(node), 'node still there');

  // cooldown after a wrong answer, then answer RIGHT
  srv.world.cooldowns.clear();
  me.lastInteract = 0;
  node = world.nodes[0];
  Object.assign(me, { x: node.x, y: node.y });
  s.emit('interact');
  ch = await once(s, 'challenge');
  s.emit('answer', { id: ch.id, submission: rightAnswer(me.challenge) });
  r = await once(s, 'result');
  assert.equal(r.correct, true, JSON.stringify(r.reveal));
  assert.equal(r.effect.resources[node.type], 3);
  assert.equal(res()[node.type], before[node.type] + 3);
  assert.deepEqual(r.balances.resources, res(), 'result carries live totals for the header badges');
  assert.equal(r.balances.wallet.balance, db().ledger.filter((t) => t.studentId === 's-02').reduce((n, t) => n + t.amount, 0));
  assert.ok(!world.nodes.includes(node), 'node depleted');
  assert.ok(db().attempts.some((a) => a.studentId === 's-02' && a.context === 'world'), 'counted in analytics');

  // answering the same challenge again does nothing
  s.emit('answer', { id: ch.id, submission: { choice: 0 } });
  await assert.rejects(once(s, 'result', 400));
  s.close();
});

test('raid: correct answers damage the shared boss; victory pays every contributor once', async () => {
  const a = connect(await login('s-03'));
  const b = connect(await login('s-04'));
  await Promise.all([once(a, 'connect'), once(b, 'connect')]);
  a.emit('join', { classId: 'cl-a' });
  b.emit('join', { classId: 'cl-a' });
  const [wa, wb] = await Promise.all([once(a, 'welcome'), once(b, 'welcome')]);
  const world = srv.world.worlds.get('cl-a');
  const boss = world.boss;
  boss.hp = 20; // two hits from victory
  boss.maxHp = 20;
  const coins = (id) => db().ledger.filter((t) => t.studentId === id).reduce((n, t) => n + t.amount, 0);
  const c3 = coins('s-03');
  const c4 = coins('s-04');

  for (const [sock, w] of [[a, wa], [b, wb]]) {
    const p = world.players.get(w.you);
    Object.assign(p, { x: boss.x + 80, y: boss.y, lastInteract: 0 });
    srv.world.cooldowns.clear();
    world.nodes.length = 0; // make sure the boss is the nearest target
    sock.emit('interact');
    const ch = await once(sock, 'challenge');
    assert.equal(ch.kind, 'attack');
    const won = sock === b ? once(a, 'raidWon') : null;
    const pushed = sock === b ? once(a, 'balances') : null; // a's badges update even though b landed the final hit
    sock.emit('answer', { id: ch.id, submission: rightAnswer(p.challenge) });
    const r = await once(sock, 'result');
    assert.equal(r.correct, true);
    if (won) {
      const msg = await won;
      assert.deepEqual(msg.heroes.sort(), ['Student 03', 'Student 04']);
      const bal = await pushed;
      assert.equal(bal.resources.crystal, db().inventory.find((i) => i.studentId === 's-03').resources.crystal);
    }
  }
  assert.equal(boss.alive, false);
  // each got the raid reward (25) on top of any first-correct coins
  assert.ok(db().ledger.some((t) => t.studentId === 's-03' && t.refKey === `raid:${boss.raidId}:s-03`));
  assert.ok(db().ledger.some((t) => t.studentId === 's-04' && t.refKey === `raid:${boss.raidId}:s-04`));
  assert.ok(coins('s-03') >= c3 + 25 || db().ledger.find((t) => t.refKey === `raid:${boss.raidId}:s-03`).reason.includes('cap'));
  assert.ok(coins('s-04') >= c4);
  a.close();
  b.close();
});

test('a second tab takes over cleanly, even when alone in the world', async () => {
  const token = await login('s-05');
  const tab1 = connect(token);
  await once(tab1, 'connect');
  tab1.emit('join', { classId: 'cl-a' });
  await once(tab1, 'welcome');
  // make sure s-05 is the only player in a fresh class world
  const tab2 = connect(token);
  await once(tab2, 'connect');
  const kicked = once(tab1, 'kicked');
  tab2.emit('join', { classId: 'cl-a' });
  await kicked;
  const w = await once(tab2, 'welcome');
  const state = await once(tab2, 'state');
  assert.ok(state.players.some((p) => p.id === w.you), 'new tab is in the live world');
  assert.ok(srv.world.worlds.get('cl-a')?.players.has(w.you));
  tab1.close();
  tab2.close();
});

test('leaving with an open question keeps the cooldown (no re-rolling)', async () => {
  const token = await login('s-06');
  let s = connect(token);
  await once(s, 'connect');
  s.emit('join', { classId: 'cl-a' });
  const w = await once(s, 'welcome');
  const world = srv.world.worlds.get('cl-a');
  const p = world.players.get(w.you);
  srv.world.cooldowns.clear();
  Object.assign(p, { x: world.boss.x + 80, y: world.boss.y });
  world.nodes.length = 0;
  s.emit('interact');
  await once(s, 'challenge');
  s.close(); // walk away without answering
  await new Promise((r) => setTimeout(r, 100));
  s = connect(token);
  await once(s, 'connect');
  s.emit('join', { classId: 'cl-a' });
  const w2 = await once(s, 'welcome');
  const world2 = srv.world.worlds.get('cl-a');
  Object.assign(world2.players.get(w2.you), { x: world2.boss.x + 80, y: world2.boss.y });
  world2.nodes.length = 0;
  s.emit('interact');
  assert.match(await once(s, 'notice'), /breath/);
  s.close();
});

test('signing out ends World access on the open socket', async () => {
  const token = await login('s-04');
  const s = connect(token);
  await once(s, 'connect');
  s.emit('join', { classId: 'cl-a' });
  await once(s, 'welcome');
  await fetch(base + '/api/logout', { method: 'POST', headers: { authorization: 'Bearer ' + token } });
  const kicked = once(s, 'kicked');
  s.emit('interact');
  assert.match(await kicked, /signed out/);
  s.close();
});
