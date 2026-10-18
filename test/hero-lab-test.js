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

function nextState(socket, predicate = () => true, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('state', onState);
      reject(new Error('Timed out waiting for Hero Lab state'));
    }, timeoutMs);
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
  first.emit('join', { heroId: 'pilot' });
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

test('Hero Lab server fires and broadcasts the selected hero projectile in the aimed direction', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());

  const welcomePromise = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'sheriff' });
  const { you: clientId } = await welcomePromise;
  await nextState(client, (state) => state.players.some((p) => p.id === clientId));

  // Aim towards (0, 1) - downwards
  client.emit('aim', { x: 0, y: 1 });

  client.emit('fire', 'primary');

  const snapshot = await nextState(client, (state) => Array.isArray(state.projectiles) && state.projectiles.length > 0);
  const spawned = snapshot.projectiles.find((projectile) => projectile.ownerId === clientId);
  assert.ok(spawned);
  assert.equal(spawned.heroId, 'sheriff');
  assert.equal(spawned.color, '#f5c84c');
  assert.equal(spawned.radius, 5);
  assert.ok(spawned.vy > 0, 'projectile moves in the aimed y direction');

  const proj = snapshot.projectiles.find((p) => p.id === spawned.id);
  assert.ok(proj, 'projectile appears in broadcast state');
  assert.equal(proj.color, '#f5c84c');
});

test('projectile onHit return value controls removal and a piercing projectile can hit another target', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());

  const welcomePromise = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'sheriff' });
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

test('enemies damage the campfire on a contact cooldown instead of every server tick', async () => {
  const { Zombie } = await import('../public/hero-lab/enemies/zombie.js');
  const zombie = new Zombie({ x: 0, y: 0, speed: 0, damage: 6 });
  const campfire = { x: 0, y: 0, radius: 28, hp: 100 };
  zombie.update(1 / 30, campfire, 1000);
  assert.equal(campfire.hp, 94);
  zombie.update(1 / 30, campfire, 1033);
  assert.equal(campfire.hp, 94);
  zombie.update(1 / 30, campfire, 2500);
  assert.equal(campfire.hp, 88);
});

test('Sheriff Deadeye only emits its bullet stream while primary fire is held', async () => {
  const { Sheriff } = await import('../public/hero-lab/heroes/roster.js');
  const { GAME_CONFIG } = await import('../public/hero-lab/game-config.js');
  const sheriff = new Sheriff();
  const startedAt = 10_000;
  sheriff.ultimate(startedAt);
  assert.equal(sheriff.update(startedAt + 100, false), null);
  const shot = sheriff.update(startedAt + GAME_CONFIG.heroes.sheriff.barrage.intervalMs, true);
  assert.ok(shot);
  assert.equal(shot.sourceAbility, 'ultimate');
});

test('enemy projectiles use server-side defense when they hit a hero', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());
  const welcomePromise = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'sheriff' });
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

  client.emit('join', { heroId: 'pilot' });

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

test('campfire loss ends the shared run for every connected player', async (t) => {
  const first = await connectClient();
  const second = await connectClient();
  t.after(() => { first.disconnect(); second.disconnect(); });
  const firstWelcome = new Promise((resolve) => first.once('welcome', resolve));
  first.emit('join', { heroId: 'sheriff' });
  const { you: firstId } = await firstWelcome;
  const secondWelcome = new Promise((resolve) => second.once('welcome', resolve));
  second.emit('join', { heroId: 'bubbles' });
  const { you: secondId } = await secondWelcome;
  const shared = await nextState(first, (state) => state.players.length === 2);
  assert.equal(shared.players.find((p) => p.id === firstId).name, 'Sheriff');
  assert.equal(shared.players.find((p) => p.id === secondId).name, 'Bubbles');
  const endFirst = new Promise((resolve) => first.once('game_over', resolve));
  const endSecond = new Promise((resolve) => second.once('game_over', resolve));
  server.heroLab.campfire.hp = 0;
  assert.deepEqual(await endFirst, { reason: 'campfire' });
  assert.deepEqual(await endSecond, { reason: 'campfire' });
  const ended = await nextState(first, (state) => state.gameEnded);
  assert.equal(ended.campfire.hp, 0);
});

test('Bombardier chooses the targeted bombing point with secondary fire', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());
  const welcome = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'bombardier' });
  const { you } = await welcome;
  await nextState(client, (state) => state.players.some((p) => p.id === you));
  client.emit('ultimate');
  await nextState(client, (state) => state.players.find((p) => p.id === you)?.targeting);
  client.emit('fire', 'secondary', { x: 900, y: 400 });
  const targeted = await nextState(client, (state) => state.effects?.length === 1);
  assert.equal(targeted.players.find((p) => p.id === you).targeting, false);
  assert.equal(targeted.players.find((p) => p.id === you).abilities.ultimate.remainingMs > 0, true);
  assert.equal(targeted.effects[0].x, 900);
  assert.equal(targeted.effects[0].y, 400);
  assert.equal(targeted.effects[0].radius, 280);
});

test('heroes standing by the campfire slowly recover health', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());
  const welcome = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'sheriff' });
  const { you } = await welcome;
  await nextState(client, (state) => state.players.some((p) => p.id === you));
  const player = server.heroLab.players.get(you);
  player.x = server.heroLab.campfire.x;
  player.y = server.heroLab.campfire.y;
  player.hero.hp = 50;
  const healed = await nextState(client, (state) => state.players.find((p) => p.id === you)?.hp > 50);
  assert.ok(healed.players.find((p) => p.id === you).hp > 50);
});

test('wave buffs appear for a shared vote and a disconnected vote is removed', async (t) => {
  const first = await connectClient();
  const second = await connectClient();
  t.after(() => { first.disconnect(); second.disconnect(); });
  const firstWelcome = new Promise((resolve) => first.once('welcome', resolve));
  first.emit('join', { heroId: 'sheriff' });
  const { you: firstId } = await firstWelcome;
  const secondWelcome = new Promise((resolve) => second.once('welcome', resolve));
  second.emit('join', { heroId: 'guardian' });
  await secondWelcome;
  await nextState(first, (state) => state.monsters.length === 8, 9000);
  server.heroLab.monsters.clear();
  const voteState = await nextState(first, (state) => state.buffVote?.cards?.length === 3);
  assert.equal(new Set(voteState.buffVote.cards.map((card) => card.id)).size, 3);
  const choice = voteState.buffVote.cards[0];
  assert.ok(choice.value >= 5 && choice.value <= 25);
  first.emit('buff_vote', choice.id);
  await nextState(first, (state) => state.buffVote?.voteCount === 1);
  second.disconnect();
  const applied = await nextState(first, (state) => !state.buffVote && state.lastBuff);
  assert.equal(applied.lastBuff.id, choice.id);
  const updated = applied.players.find((player) => player.id === firstId);
  if (choice.id === 'attack') assert.ok(updated.attack >= 12 + choice.value);
  if (choice.id === 'defense') assert.ok(updated.defense >= 5 + choice.value);
  if (choice.id === 'speed') assert.ok(updated.speed >= 225 + choice.value);
});
