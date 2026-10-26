const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { start } = require('../server');
const { RESPAWN_RING_MIN, RESPAWN_RING_MAX, RESPAWN_MIN_SEPARATION,
  ELECTRO_CHAIN_REFUND_PCT, ELECTRO_STUN_REFUND_MULT, ELECTRO_ULT_MIN_LOCKOUT_S,
  SHERIFF_KILL_REFUND_S, SHERIFF_BLAST_REFUND_CAP_S,
  GUARDIAN_ULT_RAMP_PER_HIT, GUARDIAN_ULT_RAMP_CAP, GUARDIAN_SLAM_RADIUS,
  GUARDIAN_SLAM_DAMAGE_MULT, GUARDIAN_ULT_EARLY_END, GUARDIAN_BRACE_ENABLED,
  BUILDING_BONUS_PER_LEVEL, BUILDING_LEVEL_CAP, BASE_CAMPFIRE_HP } = require('../config/tuning.js');

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

test.afterEach(() => {
  // A disconnected signed-in hero is kept for RECONNECT_GRACE_S, so each test
  // starts from a clean room instead of inheriting the previous ghost.
  const room = server.heroLab.rooms.peekDefaultRoom();
  if (room) server.heroLab.rooms.destroy(room);
});

test('server exposes shared gameplay tuning to the Hero Lab client', async () => {
  const response = await fetch(`${base}/config/tuning.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.match(await response.text(), /SHAKE_MAX_TRAUMA/);
});

test('hero tuning uses the requested refunds, Guardian ramp, and percentage building values', () => {
  const { GAME_CONFIG } = require('../public/hero-lab/game-config.js');
  assert.equal(ELECTRO_CHAIN_REFUND_PCT, 0.04);
  assert.equal(ELECTRO_STUN_REFUND_MULT, 2);
  assert.equal(ELECTRO_ULT_MIN_LOCKOUT_S, 5);
  assert.equal(SHERIFF_KILL_REFUND_S, 0.4);
  assert.equal(SHERIFF_BLAST_REFUND_CAP_S, 2);
  assert.equal(GUARDIAN_ULT_RAMP_PER_HIT, 0.1);
  assert.equal(GUARDIAN_ULT_RAMP_CAP, 1);
  assert.equal(GUARDIAN_SLAM_RADIUS, 150);
  assert.equal(GUARDIAN_SLAM_DAMAGE_MULT, 2);
  assert.equal(GUARDIAN_ULT_EARLY_END, true);
  assert.equal(GUARDIAN_BRACE_ENABLED, false);
  assert.equal(BUILDING_BONUS_PER_LEVEL, 0.1);
  assert.equal(BUILDING_LEVEL_CAP, 3);
  assert.equal(GAME_CONFIG.arenaTuning.buildingBonuses.cap, undefined);
  assert.equal(GAME_CONFIG.heroes.electromancer.overload.damageBonus, undefined);
  assert.equal(GAME_CONFIG.heroes.electromancer.overload.chainRefundPct, ELECTRO_CHAIN_REFUND_PCT);
  assert.equal(BASE_CAMPFIRE_HP, 100);
});

function connectClient() {
  return new Promise((resolve, reject) => {
    const socket = connect(`${base}/hero-lab`, { transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

// Joins a client. The room starts in its lobby, so the first joinClient also
// starts the run unless the test asks for `start: false`. Once a run is going,
// a second client is a late joiner; spawn it straight away instead of waiting
// for a wave break.
async function joinClient(client, heroId, { start = true } = {}) {
  const welcome = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId });
  const info = await welcome;
  const room = server.heroLab.rooms.peekDefaultRoom();
  if (info.waiting) room.spawnWaitingPlayers();
  if (start && room.phase() === 'lobby') room.startRunNow();
  return info;
}

test('Hero Lab lets signed-in players select heroes they have not summoned', async (t) => {
  const services = server.quiz.services;
  assert.deepEqual(services.kingdomBuildings('s-01'), {
    library: 0, workshop: 0, garden: 0, tower: 0,
  }, 'the socket join can load kingdom bonuses for a signed-in student');
  const login = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 's-01' }),
  });
  assert.equal(login.status, 200);
  const { token } = await login.json();

  const client = await new Promise((resolve, reject) => {
    const socket = connect(`${base}/hero-lab`, {
      transports: ['websocket'],
      auth: { token },
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
  t.after(() => client.disconnect());

  const welcomePromise = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'electromancer' });
  const { you: clientId } = await welcomePromise;
  const state = await nextState(client, (snapshot) => snapshot.players.some((player) => player.id === clientId));
  assert.equal(state.players.find((player) => player.id === clientId).heroId, 'electromancer');
  const accountList = await fetch(base + '/api/demo-users');
  assert.equal(accountList.status, 200, 'joining the game must not terminate the API process');
});

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

  const secondWelcome = await joinClient(second, 'guardian');
  const secondId = secondWelcome.you;
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

test('Guardian Shield Rush follows the mouse aim with no movement keys held', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());
  const welcomePromise = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'guardian' });
  const { you: clientId } = await welcomePromise;
  await nextState(client, (state) => state.players.some((player) => player.id === clientId));

  const player = server.heroLab.players.get(clientId);
  const before = { x: player.x, y: player.y };
  client.emit('aim', { x: 1, y: 0 });
  client.emit('skill');
  const state = await nextState(client, (snapshot) => snapshot.players.find((entry) => entry.id === clientId)?.x > before.x + 1);
  const after = state.players.find((entry) => entry.id === clientId);
  assert.ok(after.x > before.x);
  assert.ok(Math.abs(after.y - before.y) < 1);
});

test('respawn selects a separated point on the campfire ring', async (t) => {
  const first = await connectClient();
  const second = await connectClient();
  t.after(() => { first.disconnect(); second.disconnect(); });
  const firstWelcome = joinClient(first, 'sheriff');
  const secondWelcome = joinClient(second, 'pilot');
  const [{ you: firstId }, { you: secondId }] = await Promise.all([firstWelcome, secondWelcome]);
  await nextState(first, (state) => state.players.some((player) => player.id === firstId)
    && state.players.some((player) => player.id === secondId));

  const player = server.heroLab.players.get(firstId);
  player.hero.hp = 0;
  await nextState(first, (state) => state.players.find((candidate) => candidate.id === firstId)?.downed);
  player.respawnRemainingMs = 0;
  const respawn = await nextState(first, (state) => {
    const candidate = state.players.find((entry) => entry.id === firstId);
    return candidate && !candidate.downed;
  });
  const revived = respawn.players.find((candidate) => candidate.id === firstId);
  const teammate = respawn.players.find((candidate) => candidate.id === secondId);
  const radius = Math.hypot(revived.x - respawn.campfire.x, revived.y - respawn.campfire.y);
  assert.ok(radius >= RESPAWN_RING_MIN && radius <= RESPAWN_RING_MAX);
  assert.ok(Math.hypot(revived.x - teammate.x, revived.y - teammate.y) >= RESPAWN_MIN_SEPARATION);
});

test('Electromancer Chain Lightning refunds stunned hits and enforces the five-second lockout', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());
  const welcome = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'electromancer' });
  const { you } = await welcome;
  await nextState(client, (state) => state.players.some((player) => player.id === you));

  const { Zombie } = await import('../public/hero-lab/enemies/zombie.js');
  const player = server.heroLab.players.get(you);
  server.heroLab.monsters.clear();
  for (let index = 0; index < 13; index += 1) {
    const monster = new Zombie({ id: `electro-refund-${you}-${index}`, x: player.x + 24 + index * 8,
      y: player.y, hp: 1_000, maxHp: 1_000, speed: 0 });
    monster.stunnedUntil = Date.now() + 30_000;
    server.heroLab.monsters.set(monster.id, monster);
  }

  const hits = [];
  const allHits = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for all Chain Lightning jumps')), 6_000);
    client.on('electro_chain_refund', (event) => {
      if (event.playerId !== you) return;
      hits.push(event);
      if (hits.length === 13) { clearTimeout(timeout); resolve(); }
    });
  });
  client.emit('ultimate');
  await allHits;

  assert.equal(hits.length, 13, 'each selected enemy gets one jump per cast');
  assert.ok(hits.every((event) => event.stunned));
  assert.ok(hits.some((event) => event.cooldownRefilled), '13 stunned hits fully refund the 35-second base cooldown');
  assert.ok(hits.reduce((total, event) => total + event.refundMs, 0) > 30_000);
  assert.equal(player.hero.spec.overload.damageBonus, undefined, 'Overload no longer increases damage');
  assert.equal(player.hero.canUseAbility('ultimate', Date.now()), false, 'Q remains locked after its cooldown refills');

  const lockoutRemaining = player.hero.ultimateLockoutUntil - Date.now();
  assert.ok(lockoutRemaining > 0 && lockoutRemaining <= ELECTRO_ULT_MIN_LOCKOUT_S * 1_000);
  await new Promise((resolve) => setTimeout(resolve, lockoutRemaining + 80));
  assert.equal(player.hero.canUseAbility('ultimate', Date.now()), true, 'Q is usable after the minimum lockout expires');
});

test('Electromancer Stun Field detonates on contact, not while the ball is still in flight', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());
  const welcome = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'electromancer' });
  const { you } = await welcome;
  await nextState(client, (state) => state.players.some((player) => player.id === you));

  const { Zombie } = await import('../public/hero-lab/enemies/zombie.js');
  const { Projectile } = await import('../public/hero-lab/bases/projectile.js');
  server.heroLab.monsters.clear();

  // Park a live stun ball 100 px short of a monster: inside the 120 px blast
  // radius, but far outside the ball's own body-contact distance.
  const ball = new Projectile({ id: 'stun-ball', ownerId: you, heroId: 'electromancer',
    x: 400, y: 300, vx: 0, vy: 0, radius: 16, speed: 0, damage: 11,
    explosionRadius: 120, stunMs: 1900, sourceAbility: 'skill', lifetimeMs: 60_000 });
  server.heroLab.projectiles.set(ball.id, ball);
  const bystander = new Zombie({ id: 'stun-bystander', x: 500, y: 300, hp: 200, maxHp: 200, speed: 0 });
  server.heroLab.monsters.set(bystander.id, bystander);

  const areaEffects = [];
  client.on('area_effect', (event) => { if (event.sourceHeroId === 'electromancer') areaEffects.push(event); });

  // In flight: standing in the blast radius must not set the ball off.
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(bystander.hp, 200, 'the blast radius alone must not damage a monster');
  assert.equal(bystander.stunnedUntil, undefined, 'the blast radius alone must not stun a monster');
  assert.equal(areaEffects.length, 0, 'no field visual while the ball is still flying');
  assert.ok(server.heroLab.projectiles.has(ball.id), 'the ball keeps flying');

  // Contact: slide the monster onto the ball and let it detonate.
  bystander.x = ball.x;
  bystander.y = ball.y;
  await nextState(client, (state) => !state.projectiles.some((item) => item.id === ball.id));
  assert.equal(bystander.hp, 189, 'contact applies the ball damage exactly once');
  assert.ok(bystander.stunnedUntil > Date.now(), 'contact stuns the monster');
  assert.equal(areaEffects.length, 1, 'the field visual is emitted once, on detonation');
  assert.ok(!server.heroLab.projectiles.has(ball.id), 'the ball is spent');
});

test('Sheriff Quick Draw caps one Dynamite blast at two seconds and signals readiness once', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());
  const welcome = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'sheriff' });
  const { you } = await welcome;
  await nextState(client, (state) => state.players.some((player) => player.id === you));

  const { Zombie } = await import('../public/hero-lab/enemies/zombie.js');
  const player = server.heroLab.players.get(you);
  server.heroLab.monsters.clear();
  for (let index = 0; index < 10; index += 1) {
    const monster = new Zombie({ id: `sheriff-refund-${you}-${index}`, x: player.x + 95 + index % 2 * 5,
      y: player.y + index % 3 * 4, hp: 1, maxHp: 1, speed: 0 });
    server.heroLab.monsters.set(monster.id, monster);
  }

  const refunds = [];
  const fullBlastRefund = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for the Dynamite blast refunds')), 2_500);
    client.on('sheriff_cooldown_refund', (event) => {
      if (event.playerId !== you) return;
      refunds.push(event.refundMs);
      if (refunds.reduce((sum, value) => sum + value, 0) >= SHERIFF_BLAST_REFUND_CAP_S * 1_000) {
        clearTimeout(timeout); resolve();
      }
    });
  });
  client.emit('aim', { x: 1, y: 0 });
  client.emit('skill');
  await fullBlastRefund;
  assert.equal(refunds.length, 5);
  assert.equal(refunds.reduce((sum, value) => sum + value, 0), SHERIFF_BLAST_REFUND_CAP_S * 1_000);
  assert.equal(SHERIFF_KILL_REFUND_S * 1_000, 400);

  let readyCount = 0;
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for Dynamite readiness')), 1_000);
    client.on('dynamite_ready', (event) => {
      if (event.playerId !== you) return;
      readyCount += 1;
      clearTimeout(timeout);
      resolve();
    });
  });
  player.hero.cooldowns.skill.readyAt = Date.now() + 120;
  await ready;
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(readyCount, 1, 'the server emits one readiness transition');
});

test('Guardian charge ramps into a mouse-triggered slam with the configured radius', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());
  const welcome = new Promise((resolve) => client.once('welcome', resolve));
  client.emit('join', { heroId: 'guardian' });
  const { you } = await welcome;
  await nextState(client, (state) => state.players.some((player) => player.id === you));

  const { Zombie } = await import('../public/hero-lab/enemies/zombie.js');
  const player = server.heroLab.players.get(you);
  server.heroLab.monsters.clear();
  const monster = new Zombie({ id: `guardian-ramp-${you}`, x: player.x + 42, y: player.y,
    hp: 10_000, maxHp: 10_000, speed: 0 });
  server.heroLab.monsters.set(monster.id, monster);

  const ramped = nextState(client, (state) => state.players.find((entry) => entry.id === you)?.guardianDamageRamp >= GUARDIAN_ULT_RAMP_PER_HIT);
  client.emit('aim', { x: 1, y: 0 });
  client.emit('ultimate');
  const state = await ramped;
  assert.equal(state.players.find((entry) => entry.id === you).guardianCharging, true);
  assert.ok(state.players.find((entry) => entry.id === you).guardianDamageRamp <= GUARDIAN_ULT_RAMP_CAP);

  const slam = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for Guardian ground slam')), 1_000);
    client.once('guardian_charge_slam', (event) => { clearTimeout(timeout); resolve(event); });
  });
  client.emit('ultimate');
  const event = await slam;
  assert.equal(event.radius, GUARDIAN_SLAM_RADIUS);
  assert.ok(event.damageMultiplier >= GUARDIAN_SLAM_DAMAGE_MULT * (1 + GUARDIAN_ULT_RAMP_PER_HIT));
  assert.equal(player.hero.chargeUntil, 0);
  assert.equal(player.hero.canUseAbility('ultimate', Date.now()), false, 'a slam cannot immediately restart the charge');
  assert.equal(GUARDIAN_ULT_EARLY_END, true);
  assert.equal(GUARDIAN_BRACE_ENABLED, false);
});

test('signed-in kingdom bonuses are capped at three levels and sum Garden HP per player', async (t) => {
  const db = server.quiz.services.db;
  const originalKingdoms = db.kingdoms;
  const userIds = ['s-01', 's-02', 's-03', 's-04'];
  db.kingdoms = originalKingdoms.filter((kingdom) => !userIds.includes(kingdom.studentId));
  for (const studentId of userIds) db.kingdoms.push({ studentId,
    buildings: { library: 9, workshop: 9, garden: 9, tower: 9 } });
  const clients = [];
  t.after(() => { clients.forEach((client) => client.disconnect()); db.kingdoms = originalKingdoms; });

  for (const userId of userIds) {
    const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId }) });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    const client = await new Promise((resolve, reject) => {
      const socket = connect(`${base}/hero-lab`, { transports: ['websocket'], auth: { token } });
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
    clients.push(client);
  }
  const heroIds = ['electromancer', 'sheriff', 'bubbles', 'guardian'];
  const welcomes = clients.map((client, index) => joinClient(client, heroIds[index]));
  const playerIds = (await Promise.all(welcomes)).map((welcome) => welcome.you);
  const shared = await nextState(clients[0], (state) => state.players.length === 4 && state.campfire.maxHp === 220);
  assert.equal(shared.campfire.maxHp, BASE_CAMPFIRE_HP + BASE_CAMPFIRE_HP * BUILDING_BONUS_PER_LEVEL * BUILDING_LEVEL_CAP * 4);
  for (let index = 0; index < clients.length; index += 1) {
    const player = shared.players.find((entry) => entry.id === playerIds[index]);
    assert.equal(player.buildingBonuses.attackPercent, BUILDING_BONUS_PER_LEVEL * BUILDING_LEVEL_CAP);
    assert.equal(player.buildingBonuses.campfireMaxHpPercent, BUILDING_BONUS_PER_LEVEL * BUILDING_LEVEL_CAP);
  }
  assert.equal(shared.players.find((entry) => entry.id === playerIds[0]).attack, 16 * 1.3);
  assert.equal(shared.players.find((entry) => entry.id === playerIds[1]).attack, 12 * 1.3);
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

test('hero defense reduces damage by a percentage, with a floor and timed invulnerability', async () => {
  const { Hero } = await import('../public/hero-lab/bases/hero.js');
  const { GAME_CONFIG } = await import('../public/hero-lab/game-config.js');
  const hero = new Hero({ id: 'test', defense: 9 });
  const rounded = (value) => Number(value.toFixed(2));
  assert.equal(rounded(hero.damage(20, 10_000)), rounded(20 * (1 - 9 / 100)), 'defense is a percentage reduction');
  assert.equal(hero.damage(20, 10_500), 0, 'damage cooldown prevents rapid repeated hits');
  assert.equal(rounded(hero.damage(0.2, 11_001)), GAME_CONFIG.combat.minimumDamage, 'defense cannot reduce damage below the configured floor');

  const protectedHero = new Hero({ id: 'protected' });
  protectedHero.makeInvulnerable(1000, 20_000);
  assert.equal(protectedHero.damage(20, 20_500), 0);
  assert.equal(rounded(protectedHero.damage(20, 21_001)), rounded(20 * (1 - GAME_CONFIG.heroDefaults.defense / 100)));
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

test('Sheriff Bullet Rush only emits its bullet stream while primary fire is held', async () => {
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
  const expected = Math.round(before - 10 * (1 - player.hero.defense / 100));
  assert.equal(after.players.find((candidate) => candidate.id === clientId).hp, expected,
    'the server applies percentage defense before broadcasting the new health');
  assert.ok(!after.projectiles.some((projectile) => projectile.id === 'test-enemy-projectile'));
});

test('Hero Lab server maintains campfire in the middle and spawns zombie monsters', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());

  await joinClient(client, 'pilot');

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
  const { Zombie } = await import('../public/hero-lab/enemies/zombie.js');
  const { GAME_CONFIG } = await import('../public/hero-lab/game-config.js');
  const expectedHp = Math.round(new Zombie().maxHp
    * (1 + GAME_CONFIG.arenaTuning.enemies.wave.hpPerWave * stateWithMonster.wave.number));
  assert.equal(zombie.hp, expectedHp, 'wave scaling applies to spawned enemy health');
  const serverZombie = [...server.heroLab.monsters.values()].find((monster) => monster.id === zombie.id);
  assert.ok(serverZombie instanceof Zombie);
  assert.equal(serverZombie.maxHp, expectedHp);
});

test('campfire loss ends the run and returns everyone to the lobby', async (t) => {
  const first = await connectClient();
  const second = await connectClient();
  t.after(() => { first.disconnect(); second.disconnect(); });
  const { you: firstId } = await joinClient(first, 'sheriff');
  const { you: secondId } = await joinClient(second, 'bubbles');
  const shared = await nextState(first, (state) => state.players.length === 2);
  assert.equal(shared.players.find((p) => p.id === firstId).name, 'Sheriff');
  assert.equal(shared.players.find((p) => p.id === secondId).name, 'Bubbles');
  const endFirst = new Promise((resolve) => first.once('game_over', resolve));
  const endSecond = new Promise((resolve) => second.once('game_over', resolve));
  const resultFirst = new Promise((resolve) => first.once('run_result', resolve));
  // The room resets on the same tick it ends, so subscribe before triggering it.
  const lobbyState = nextState(first, (state) => state.room?.phase === 'lobby' && state.wave.number === 0);
  server.heroLab.campfire.hp = 0;
  assert.deepEqual(await endFirst, { reason: 'campfire' });
  assert.deepEqual(await endSecond, { reason: 'campfire' });
  assert.equal((await resultFirst).reason, 'campfire');
  const lobby = await lobbyState;
  assert.equal(lobby.gameEnded, false);
  assert.equal(lobby.campfire.hp, lobby.campfire.maxHp);
  // Stage 3: the run ends, the room does not. Both heroes are back in the lobby.
  assert.equal(lobby.players.length, 2, 'players stay in the room after a wipe');
  assert.ok(lobby.players.every((player) => player.hp === player.maxHp), 'heroes are restored');
  assert.ok(lobby.players.every((player) => !player.downed));
  assert.equal(lobby.room.phase, 'lobby');
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
  server.heroLab.rooms.peekDefaultRoom().startRunNow();
  await nextState(first, (state) => state.monsters.length > 0, 9000);
  // Clear the rest of the wave so the break (and its vote) can start without
  // waiting for every queued spawn.
  server.heroLab.rooms.peekDefaultRoom().clearWave();
  const voteState = await nextState(first, (state) => state.buffVote?.cards?.length === 3);
  const cards = voteState.buffVote.cards;
  assert.equal(new Set(cards.map((card) => card.id)).size, 3);
  assert.ok(cards.every((card) => card.id && card.label && card.description));
  assert.ok(cards.filter((card) => !card.rare).every((card) => Number.isFinite(card.value) && card.value > 0),
    'stat cards carry a positive multiplier or percentage');
  const choice = cards[0];
  first.emit('buff_vote', choice.id);
  await nextState(first, (state) => state.buffVote?.voteCount === 1);
  second.disconnect();
  const applied = await nextState(first, (state) => !state.buffVote && state.lastBuff);
  assert.equal(applied.lastBuff.id, choice.id);
  const updated = applied.players.find((player) => player.id === firstId);
  if (choice.id === 'attack') assert.ok(updated.attack >= 12 * (1 + choice.value) - 1e-6);
  if (choice.id === 'defense') assert.ok(updated.defense >= 5 + choice.value);
  if (choice.id === 'speed') assert.ok(updated.speed >= 225 * (1 + choice.value) - 1e-6);
  if (choice.id === 'maxHp') assert.ok(updated.maxHp >= 105 * (1 + choice.value) - 1e-6);
});
