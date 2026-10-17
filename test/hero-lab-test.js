const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { start } = require('../server');

let server;
let base;

test.before(async () => {
  server = start(0, { dataFile: null });
  await new Promise((resolve) => server.httpServer.once('listening', resolve));
  base = `http://localhost:${server.httpServer.address().port}`;
});

test.after(async () => {
  server?.io.close();
});

function connectClient() {
  return new Promise((resolve, reject) => {
    const socket = connect(`${base}/hero-lab`, { transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function nextState(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('state', onState);
      reject(new Error('Timed out waiting for Hero Lab state'));
    }, 1500);
    function onState(state) {
      if (!predicate(state)) return;
      clearTimeout(timeout);
      socket.off('state', onState);
      resolve(state);
    }
    socket.on('state', onState);
  });
}

test('Hero Lab server broadcasts authoritative movement to every client', async (t) => {
  const first = await connectClient();
  const second = await connectClient();
  t.after(() => {
    first.disconnect();
    second.disconnect();
  });

  const firstWelcome = new Promise((resolve) => first.once('welcome', resolve));
  first.emit('join', { heroId: 'ranger' });
  const { you: firstId } = await firstWelcome;
  const initial = await nextState(first, (state) => state.players.some((player) => player.id === firstId));
  const startingX = initial.players.find((player) => player.id === firstId).x;

  const secondWelcome = new Promise((resolve) => second.once('welcome', resolve));
  second.emit('join', { heroId: 'guardian' });
  const { you: secondId } = await secondWelcome;
  const shared = await nextState(second, (state) => state.players.length === 2);
  assert.deepEqual(new Set(shared.players.map((player) => player.id)), new Set([firstId, secondId]));

  const moved = nextState(first, (state) => state.players.find((player) => player.id === firstId)?.x > startingX);
  first.emit('input', { right: true });
  const updated = await moved;
  first.emit('input', { right: false });
  assert.ok(updated.players.find((player) => player.id === firstId).x > startingX);
  assert.equal(updated.players.find((player) => player.id === secondId).name, 'Guardian');
});

test('Hero Lab server fires and broadcasts a red projectile in the aimed direction for Flamekeeper primary fire', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());

  const welcomePromise = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'flamekeeper' });
  const { you: clientId } = await welcomePromise;
  await nextState(client, (state) => state.players.some((p) => p.id === clientId));

  // Aim towards (0, 1) - downwards
  client.emit('aim', { x: 0, y: 1 });

  const firedPromise = new Promise((resolve) => client.once('fired', resolve));
  const spawnPromise = new Promise((resolve) => client.once('projectile_spawn', resolve));
  const stateWithProj = nextState(client, (state) => Array.isArray(state.projectiles) && state.projectiles.length > 0);

  client.emit('fire', 'primary');

  const fired = await firedPromise;
  assert.equal(fired.mode, 'primary');
  assert.equal(fired.hero, 'Flamekeeper');

  const spawned = await spawnPromise;
  assert.equal(spawned.ownerId, clientId);
  assert.equal(spawned.heroId, 'flamekeeper');
  assert.equal(spawned.color, '#ff2d20');
  assert.equal(spawned.radius, 10);
  assert.ok(spawned.vy > 0, 'projectile moves in the aimed y direction');

  const snapshot = await stateWithProj;
  const proj = snapshot.projectiles.find((p) => p.id === spawned.id);
  assert.ok(proj, 'projectile appears in broadcast state');
  assert.equal(proj.color, '#ff2d20');
});

test('Hero Lab server maintains campfire in the middle and spawns zombie monsters', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());

  client.emit('join', { heroId: 'ranger' });

  // Verify campfire state is in the center
  const stateWithCampfire = await nextState(client, (state) => state.campfire && state.campfire.x === 400 && state.campfire.y === 250);
  assert.equal(stateWithCampfire.campfire.x, 400);
  assert.equal(stateWithCampfire.campfire.y, 250);
  assert.equal(stateWithCampfire.campfire.hp, 100);
  assert.equal(stateWithCampfire.campfire.maxHp, 100);

  // Wait for zombie monster to spawn from outside
  const stateWithMonster = await nextState(client, (state) => Array.isArray(state.monsters) && state.monsters.length > 0);
  const zombie = stateWithMonster.monsters[0];
  assert.equal(zombie.emoji, '🧟');
  assert.equal(zombie.hp, 20);
});

