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
  // Defense is a percentage reduction capped by the wave tuning, so a 9 defense
  // hero takes 20 * 0.91 = 18.2, rounded through hp to 18.200000000000003.
  assert.equal(hero.damage(20, 10_000), 18.200000000000003);
  assert.equal(hero.damage(20, 10_500), 0, 'damage cooldown prevents rapid repeated hits');
  // 1 * 0.91 = 0.91 sits under the configured floor of 1, so the floor is what lands.
  assert.equal(hero.damage(1, 11_001), 1, 'defense cannot reduce damage below the configured floor');

  const protectedHero = new Hero({ id: 'protected' });
  protectedHero.makeInvulnerable(1000, 20_000);
  assert.equal(protectedHero.damage(20, 20_500), 0);
  // The default 5 defense is a 5% reduction, so 20 * 0.95 = 19.
  assert.equal(protectedHero.damage(20, 21_001), 19);
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
  // Hero.damage() treats defense as a percentage (capped by the wave's defenseReductionCap),
  // so a 10-damage enemy bullet against Sheriff's defense 5 applies max(1, 10 * 0.95) = 9.5.
  const { GAME_CONFIG } = await import('../public/hero-lab/game-config.js');
  const reduction = Math.min(GAME_CONFIG.arenaTuning.enemies.wave.defenseReductionCap, Math.max(0, player.hero.defense / 100));
  const applied = Math.max(GAME_CONFIG.combat.minimumDamage, bullet.damage * (1 - reduction));
  assert.equal(after.players.find((candidate) => candidate.id === clientId).hp, Math.round(before - applied));
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
  const { GAME_CONFIG } = await import('../public/hero-lab/game-config.js');
  // The arena resets whenever nobody is connected, so the first zombie of this run is always a
  // wave 1 spawn, and the server scales enemy max hp by the per-wave hp tuning.
  const wave1ZombieHp = Math.round(GAME_CONFIG.enemies.zombie.hp * (1 + GAME_CONFIG.arenaTuning.enemies.wave.hpPerWave));
  assert.equal(zombie.hp, wave1ZombieHp);
  const { Zombie } = await import('../public/hero-lab/enemies/zombie.js');
  const serverZombie = [...server.heroLab.monsters.values()].find((monster) => monster.id === zombie.id);
  assert.ok(serverZombie instanceof Zombie);
  assert.equal(serverZombie.maxHp, wave1ZombieHp);
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
  const ended = await nextState(first, (state) => state.players.length === 0);
  assert.deepEqual(ended.players, [], 'the ended run drops every connected player from the shared arena');
  assert.equal(ended.campfire.hp, ended.campfire.maxHp, 'the ended run tears the arena down so the next run starts from a fresh campfire');
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
  // Waves are now sized from arenaTuning.enemies.wave (10 + 4 * wave = 14 on wave 1)
  // instead of the old "5 + wave * (2 + wave)" = 8, so the old `monsters.length === 8`
  // checkpoint fires while ~6 enemies are still queued. Clearing `monsters` only ends
  // the wave once the spawn queue has drained (completeWave also requires
  // enemiesLeftToSpawn === 0 and no spawn telegraphs), so wait for that first.
  // `wave.enemiesRemaining` is `monsters.size + enemiesLeftToSpawn`, and a telegraph
  // in flight is counted by neither, hence the extra telegraph check.
  await nextState(first, (state) => state.monsters.length > 0
    && state.spawnTelegraphs.length === 0
    && state.wave.enemiesRemaining === state.monsters.length, 20000);
  server.heroLab.monsters.clear();
  const voteState = await nextState(first, (state) => state.buffVote?.cards?.length === 3);
  assert.equal(new Set(voteState.buffVote.cards.map((card) => card.id)).size, 3);
  const choice = voteState.buffVote.cards[0];
  // Stat cards no longer roll a flat 5-25: each carries its configured
  // arenaTuning.cards.stat value (defense is scaled to percentage points).
  const { GAME_CONFIG } = await import('../public/hero-lab/game-config.js');
  const { stat } = GAME_CONFIG.arenaTuning.cards;
  const configuredCardValues = {
    maxHp: stat.maxHp, attack: stat.attack, defense: stat.defense * 100,
    speed: stat.speed, campfire: stat.campfireHp,
  };
  assert.equal(choice.value, configuredCardValues[choice.id],
    'an offered card carries exactly its configured arenaTuning value');
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
