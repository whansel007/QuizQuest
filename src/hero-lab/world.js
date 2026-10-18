const { HERO_CLASSES } = require('../../public/hero-lab/hero-list.js');
const { Zombie } = require('../../public/hero-lab/enemies/zombie.js');
const { Devil } = require('../../public/hero-lab/enemies/devil.js');

const ARENA_CONFIG = { width: 1920, height: 1080, radius: 24, tickHz: 30 };
const SPAWNS = [
  { x: 480, y: 540 },
  { x: 1440, y: 540 },
  { x: 960, y: 270 },
  { x: 960, y: 810 },
];
const MOVEMENT_KEYS = ['up', 'down', 'left', 'right'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function attachHeroLab(io) {
  const nsp = io.of('/hero-lab');

  const players = new Map();
  const projectiles = new Map();
  const monsters = new Map();

  let projectileCounter = 0;
  let monsterSeq = 0;

  let waveNumber = 0;
  let enemiesLeftToSpawn = 0;
  let enemiesSpawnedThisWave = 0;
  let nextEnemyAt = 0;
  let nextWaveAt = 0;
  const ENEMY_SPAWN_INTERVAL_MS = 700;
  const WAVE_BREAK_MS = 5000;

  const campfire = {
    x: ARENA_CONFIG.width / 2,
    y: ARENA_CONFIG.height / 2,
    radius: 28,
    hp: 100,
    maxHp: 100,
  };

  function resetGame() {
    projectiles.clear();
    monsters.clear();
    campfire.hp = campfire.maxHp;
    waveNumber = 0;
    enemiesLeftToSpawn = 0;
    enemiesSpawnedThisWave = 0;
    nextEnemyAt = 0;
    nextWaveAt = 0;
  }

  function startWave(now) {
    waveNumber += 1;
    // Wave 1 has 8 enemies: 5 + waveNumber * (2 + waveNumber).
    enemiesLeftToSpawn = 5 + waveNumber * (2 + waveNumber);
    enemiesSpawnedThisWave = 0;
    nextEnemyAt = now;
    nextWaveAt = 0;
  }

  function spawnEnemy() {
    monsterSeq += 1;
    enemiesSpawnedThisWave += 1;

    const side = Math.floor(Math.random() * 4);

    let x = 0;
    let y = 0;

    if (side === 0) {
      x = Math.random() * ARENA_CONFIG.width;
      y = -35;
    } else if (side === 1) {
      x = Math.random() * ARENA_CONFIG.width;
      y = ARENA_CONFIG.height + 35;
    } else if (side === 2) {
      x = -35;
      y = Math.random() * ARENA_CONFIG.height;
    } else {
      x = ARENA_CONFIG.width + 35;
      y = Math.random() * ARENA_CONFIG.height;
    }

    const EnemyClass = enemiesSpawnedThisWave % 5 === 0 ? Devil : Zombie;
    const monster = new EnemyClass({
      id: `enemy_${monsterSeq}`,
      x,
      y,
    });

    monsters.set(monster.id, monster);
    enemiesLeftToSpawn -= 1;
    nextEnemyAt = Date.now() + ENEMY_SPAWN_INTERVAL_MS;
  }

  function addProjectile(player, projectile) {
    if (!projectile) return;
    projectileCounter += 1;
    projectile.id = `proj_${player.id}_${projectileCounter}_${Date.now()}`;
    projectile.ownerId = player.id;
    projectile.heroId = player.heroId;
    projectiles.set(projectile.id, projectile);
  }

  function syncHeroAimAndPosition(player) {
    player.hero.position = { x: player.x, y: player.y };
    player.hero.aim = { ...player.aim };
  }

  function closestPlayer(monster) {
    let closest = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const player of players.values()) {
      if (player.hero.hp <= 0) continue;
      const distance = Math.hypot(player.x - monster.x, player.y - monster.y);
      if (distance < closestDistance) {
        closest = player;
        closestDistance = distance;
      }
    }
    return closest;
  }

  nsp.on('connection', (socket) => {
    socket.on('join', (payload) => {
      const heroId = payload?.heroId;
      const HeroClass = Object.hasOwn(HERO_CLASSES, heroId) ? HERO_CLASSES[heroId] : null;
      if (!HeroClass) return socket.emit('notice', 'Choose a valid hero to join the field.');

      const existing = players.get(socket.id);
      const index = existing
        ? [...players.keys()].indexOf(socket.id) % SPAWNS.length
        : players.size % SPAWNS.length;
      const spawn = SPAWNS[index];
      const hero = new HeroClass();
      hero.position = { ...spawn };
      players.set(socket.id, {
        id: socket.id,
        heroId,
        hero,
        name: hero.name,
        emoji: hero.emoji,
        x: spawn.x,
        y: spawn.y,
        radius: ARENA_CONFIG.radius,
        aim: { x: 1, y: 0 },
        keys: {},
      });
      if (waveNumber === 0) startWave(Date.now());
      socket.emit('welcome', {
        you: socket.id,
        arena: { width: ARENA_CONFIG.width, height: ARENA_CONFIG.height },
      });
      broadcastState();
    });

    socket.on('input', (input) => {
      const player = players.get(socket.id);
      if (!player || !input || typeof input !== 'object') return;
      player.keys = Object.fromEntries(MOVEMENT_KEYS.map((key) => [key, input[key] === true]));
    });

    socket.on('aim', (aim) => {
      const player = players.get(socket.id);
      if (!player || !Number.isFinite(aim?.x) || !Number.isFinite(aim?.y)) return;
      const length = Math.hypot(aim.x, aim.y);
      if (length > 0) {
        player.aim = { x: aim.x / length, y: aim.y / length };
        player.hero.aim = { ...player.aim };
      }
    });

    socket.on('fire', (mode) => {
      const player = players.get(socket.id);
      if (!player || !['primary', 'secondary'].includes(mode)) return;

      syncHeroAimAndPosition(player);
      addProjectile(player, player.hero.fire(mode));
    });

    socket.on('skill', () => {
      const player = players.get(socket.id);
      if (!player) return;

      syncHeroAimAndPosition(player);
      const skill = player.hero.skill();
      if (skill?.type !== 'dash') return;

      player.x = clamp(
        player.x + skill.direction.x * skill.distance,
        ARENA_CONFIG.radius,
        ARENA_CONFIG.width - ARENA_CONFIG.radius,
      );
      player.y = clamp(
        player.y + skill.direction.y * skill.distance,
        ARENA_CONFIG.radius,
        ARENA_CONFIG.height - ARENA_CONFIG.radius,
      );
      syncHeroAimAndPosition(player);
    });

    socket.on('ultimate', () => {
      const player = players.get(socket.id);
      if (!player) return;
      syncHeroAimAndPosition(player);
      player.hero.ultimate(Date.now());
    });

    socket.on('disconnect', () => {
      if (players.delete(socket.id)) {
        if (players.size === 0) resetGame();
        broadcastState();
      }
    });
  });

  function snapshot(now = Date.now()) {
    return {
      wave: {
        number: waveNumber,
        enemiesRemaining: monsters.size + enemiesLeftToSpawn,
        nextWaveInMs: nextWaveAt ? Math.max(0, nextWaveAt - now) : 0,
      },
      campfire: {
        x: campfire.x,
        y: campfire.y,
        radius: campfire.radius,
        hp: Math.max(0, Math.round(campfire.hp)),
        maxHp: campfire.maxHp,
      },
      monsters: [...monsters.values()].map(({ id, x, y, hp, maxHp, radius, emoji }) => ({
        id,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        hp: Math.max(0, Math.round(hp)),
        maxHp,
        radius,
        emoji,
      })),
      players: [...players.values()].map(({ id, heroId, hero, name, emoji, x, y, aim }) => ({
        id, heroId, name, emoji, x: Math.round(x), y: Math.round(y), aim: { ...aim },
        hp: Math.max(0, Math.round(hero.hp)), maxHp: hero.maxHp, speed: hero.speed,
        ultimateActive: hero.ultimateEndsAt > now,
      })),
      projectiles: [...projectiles.values()].map(({ id, ownerId, heroId, x, y, vx, vy, radius, color }) => ({
        id,
        ownerId,
        heroId,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        vx,
        vy,
        radius,
        color,
      })),
    };
  }

  function broadcastState(now = Date.now()) {
    nsp.emit('state', snapshot(now));
  }

  const loop = setInterval(() => {
    const dt = 1 / ARENA_CONFIG.tickHz;
    const now = Date.now();

    // 1. Move players
    for (const player of players.values()) {
      const dx = Number(player.keys.right) - Number(player.keys.left);
      const dy = Number(player.keys.down) - Number(player.keys.up);
      if (!dx && !dy) continue;
      const length = Math.hypot(dx, dy);
      const step = player.hero.speed / ARENA_CONFIG.tickHz;
      player.x = clamp(
        player.x + (dx / length) * step,
        ARENA_CONFIG.radius,
        ARENA_CONFIG.width - ARENA_CONFIG.radius,
      );
      player.y = clamp(
        player.y + (dy / length) * step,
        ARENA_CONFIG.radius,
        ARENA_CONFIG.height - ARENA_CONFIG.radius,
      );
    }

    // 2. Start the next wave after its five-second break and spawn its enemies.
    if (players.size > 0 && waveNumber === 0) startWave(now);
    if (players.size > 0 && nextWaveAt && now >= nextWaveAt) startWave(now);
    if (players.size > 0 && enemiesLeftToSpawn > 0 && now >= nextEnemyAt) {
      spawnEnemy();
    }

    // 3. Zombies chase the campfire; devils chase the closest living player.
    for (const monster of monsters.values()) {
      if (monster instanceof Devil) {
        const target = closestPlayer(monster);
        const damage = monster.update(dt, target, now);
        if (damage > 0) {
          nsp.emit('player_hit', {
            id: target.id,
            x: target.x,
            y: target.y,
            damage,
          });
        }
      } else {
        monster.update(dt, campfire);
      }
    }

    // 4. Move projectiles
    for (const [id, proj] of projectiles.entries()) {
      proj.update(dt, ARENA_CONFIG);
      if (proj.dead) {
        projectiles.delete(id);
      }
    }

    // 5. Collision: Projectiles vs Monsters
    for (const [pId, proj] of projectiles.entries()) {
      for (const [mId, monster] of monsters.entries()) {
        if (proj.collidesWith(monster) && !proj.hitTargets.has(mId)) {
          const damage = monster.takeDamage(proj.damage);
          proj.hitTargets.add(mId);
          nsp.emit('hit', {
            type: 'monster',
            id: mId,
            x: monster.x,
            y: monster.y,
            damage,
          });
          if (monster.dead) {
            monsters.delete(mId);
            nsp.emit('monster_killed', {
              id: mId,
              x: monster.x,
              y: monster.y,
            });
          }
          if (proj.onHit(monster)) projectiles.delete(pId);
          break;
        }
      }
    }

    // 6. Let heroes run timed effects, such as Flamekeeper's ultimate barrage.
    for (const player of players.values()) {
      syncHeroAimAndPosition(player);
      addProjectile(player, player.hero.update(now));
    }

    // 7. A dead hero is out of the shared game and returns to hero selection.
    for (const player of [...players.values()]) {
      if (player.hero.hp > 0) continue;
      nsp.to(player.id).emit('game_over');
      players.delete(player.id);
    }
    if (players.size === 0 && waveNumber > 0) resetGame();

    // 8. Start a five-second break only after every enemy in the wave is gone.
    if (
      players.size > 0 && waveNumber > 0 && enemiesLeftToSpawn === 0
      && monsters.size === 0 && nextWaveAt === 0
    ) {
      nextWaveAt = now + WAVE_BREAK_MS;
    }

    broadcastState(now);
  }, 1000 / ARENA_CONFIG.tickHz);

  return { stop: () => clearInterval(loop), players, projectiles, monsters, campfire };
}

module.exports = { attachHeroLab, ARENA_CONFIG, W: ARENA_CONFIG };
