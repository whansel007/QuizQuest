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
  const { you: firstId, arena } = await firstWelcome;
  assert.deepEqual(arena, { width: 1920, height: 1080 });
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

  client.emit('fire', 'primary');

  const snapshot = await nextState(client, (state) => Array.isArray(state.projectiles) && state.projectiles.length > 0);
  const spawned = snapshot.projectiles.find((projectile) => projectile.ownerId === clientId);
  assert.ok(spawned);
  assert.equal(spawned.heroId, 'flamekeeper');
  assert.equal(spawned.color, '#ff2d20');
  assert.equal(spawned.radius, 10);
  assert.ok(spawned.vy > 0, 'projectile moves in the aimed y direction');

  const proj = snapshot.projectiles.find((p) => p.id === spawned.id);
  assert.ok(proj, 'projectile appears in broadcast state');
  assert.equal(proj.color, '#ff2d20');
});

test('projectile onHit return value controls removal and a piercing projectile can hit another target', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());

  const welcomePromise = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'flamekeeper' });
  const { you: clientId } = await welcomePromise;
  await nextState(client, (state) => state.players.some((player) => player.id === clientId));

  const player = server.heroLab.players.get(clientId);
  player.x = 300;
  player.y = 300;
  player.aim = { x: 1, y: 0 };
  let hitCount = 0;
  const { Projectile } = await import('../public/hero-lab/bases/projectile.js');
  player.hero.fire = () => {
    const projectile = new Projectile({
      x: 324,
      y: 300,
      radius: 10,
      color: '#ffffff',
      damage: 7,
      speed: 0,
    });
    projectile.onHit = () => {
      hitCount += 1;
      return false;
    };
    return projectile;
  };

  const { Zombie } = await import('../public/hero-lab/enemies/zombie.js');
  const firstTarget = new Zombie({ id: 'piercing-target-1', x: 324, y: 300 });
  server.heroLab.monsters.set(firstTarget.id, firstTarget);
  client.emit('fire', 'primary');

  const stateAfterFirstHit = await nextState(client, (state) =>
    state.monsters.some((monster) => monster.id === firstTarget.id && monster.hp === 13)
    && state.projectiles.some((projectile) => projectile.ownerId === clientId));
  const projectile = stateAfterFirstHit.projectiles.find((item) => item.ownerId === clientId);
  assert.equal(hitCount, 1);
  assert.ok(projectile);

  const serverProjectile = server.heroLab.projectiles.get(projectile.id);
  serverProjectile.onHit = () => true;
  const secondTarget = new Zombie({
    id: 'piercing-target-2',
    x: serverProjectile.x,
    y: serverProjectile.y,
  });
  server.heroLab.monsters.set(secondTarget.id, secondTarget);

  const stateAfterSecondHit = await nextState(client, (state) =>
    !state.projectiles.some((item) => item.id === projectile.id));
  assert.ok(stateAfterSecondHit.monsters.some((monster) => monster.id === firstTarget.id));
  assert.ok(!stateAfterSecondHit.projectiles.some((item) => item.id === projectile.id));
});

test('hero defense has a minimum damage floor, timed invulnerability, and ability cooldowns', async () => {
  const { Hero } = await import('../public/hero-lab/bases/hero.js');
  const hero = new Hero({ id: 'test', defense: 9 });
  assert.equal(hero.damage(20, 10_000), 11);
  assert.equal(hero.damage(20, 10_500), 0, 'damage cooldown prevents rapid repeated hits');
  assert.equal(hero.damage(2, 11_001), 1, 'defense cannot reduce damage below the configured floor');

  const protectedHero = new Hero({ id: 'protected' });
  protectedHero.makeInvulnerable(1000, 20_000);
  assert.equal(protectedHero.damage(20, 20_500), 0);
  assert.equal(protectedHero.damage(20, 21_001), 15);
  assert.equal(protectedHero.canUseAbility('skill', 30_000), true);
  assert.equal(protectedHero.useAbility('skill', 30_000), true);
  assert.equal(protectedHero.canUseAbility('skill', 34_999), false);
  assert.equal(protectedHero.canUseAbility('skill', 35_000), true);
});

test('projectiles disappear on one hit by default and piercing is opt-in', async () => {
  const { Projectile } = await import('../public/hero-lab/bases/projectile.js');
  assert.equal(new Projectile().onHit(), true);
  assert.equal(new Projectile({ piercing: true }).onHit(), false);
});

test('enemy projectiles use server-side defense when they hit a hero', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());
  const welcomePromise = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'flamekeeper' });
  const { you: clientId } = await welcomePromise;
  await nextState(client, (state) => state.players.some((player) => player.id === clientId));

  const player = server.heroLab.players.get(clientId);
  const before = player.hero.hp;
  const { EnemyProjectile } = await import('../public/hero-lab/projectiles/enemy-projectile.js');
  const bullet = new EnemyProjectile({ x: player.x, y: player.y, speed: 0, damage: 10 });
  server.heroLab.projectiles.set('test-enemy-projectile', bullet);
  const after = await nextState(client, (state) => state.players.find((candidate) => candidate.id === clientId)?.hp < before);
  assert.equal(after.players.find((candidate) => candidate.id === clientId).hp, before - 5);
  assert.ok(!after.projectiles.some((projectile) => projectile.id === 'test-enemy-projectile'));
});

test('Hero Lab server maintains campfire in the middle and spawns zombie monsters', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());

  client.emit('join', { heroId: 'ranger' });

  // Verify campfire state is in the center
  const stateWithCampfire = await nextState(client, (state) => state.campfire && state.campfire.x === 960 && state.campfire.y === 540);
  assert.equal(stateWithCampfire.campfire.x, 960);
  assert.equal(stateWithCampfire.campfire.y, 540);
  assert.equal(stateWithCampfire.campfire.hp, 100);
  assert.equal(stateWithCampfire.campfire.maxHp, 100);

  // Wait for zombie monster to spawn from outside
  const stateWithMonster = await nextState(client, (state) => Array.isArray(state.monsters) && state.monsters.length > 0);
  const zombie = stateWithMonster.monsters[0];
  assert.equal(zombie.emoji, '🧟');
  assert.equal(zombie.hp, 20);
  const { Zombie } = await import('../public/hero-lab/enemies/zombie.js');
  const serverZombie = [...server.heroLab.monsters.values()].find((monster) => monster.id === zombie.id);
  assert.ok(serverZombie instanceof Zombie);
  assert.equal(serverZombie.maxHp, 20);
});
