const { HERO_CLASSES } = require('../../public/hero-lab/hero-list.js');

const ARENA_CONFIG = { width: 800, height: 500, radius: 24, speed: 220, tickHz: 30 };
const SPAWNS = [
  { x: 200, y: 250 },
  { x: 600, y: 250 },
  { x: 400, y: 150 },
  { x: 400, y: 350 },
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
  let lastMonsterSpawn = 0;
  const SPAWN_INTERVAL_MS = 2500;
  const MAX_MONSTERS = 12;

  const campfire = {
    x: 400,
    y: 250,
    radius: 28,
    hp: 100,
    maxHp: 100,
  };

  function spawnMonster() {
    monsterSeq += 1;
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

    const monster = {
      id: `zombie_${monsterSeq}`,
      x,
      y,
      radius: 16,
      speed: 55,
      hp: 20,
      maxHp: 20,
      emoji: '🧟',
      damage: 6,
    };
    monsters.set(monster.id, monster);
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
        aim: { x: 1, y: 0 },
        keys: {},
      });
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

      player.hero.position = { x: player.x, y: player.y };
      player.hero.aim = { ...player.aim };
      const projectileConfig = player.hero.fire(mode);
      if (projectileConfig) {
        projectileCounter += 1;
        const proj = {
          id: `proj_${socket.id}_${projectileCounter}_${Date.now()}`,
          ownerId: socket.id,
          heroId: player.heroId,
          x: player.x + player.aim.x * 24,
          y: player.y + player.aim.y * 24,
          vx: player.aim.x * projectileConfig.speed,
          vy: player.aim.y * projectileConfig.speed,
          radius: projectileConfig.radius,
          color: projectileConfig.color,
          createdAt: Date.now(),
        };
        projectiles.set(proj.id, proj);
        nsp.emit('projectile_spawn', proj);
      }
    });

    socket.on('disconnect', () => {
      if (players.delete(socket.id)) {
        if (players.size === 0) {
          campfire.hp = campfire.maxHp;
          monsters.clear();
        }
        broadcastState();
      }
    });
  });

  function snapshot() {
    return {
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
      players: [...players.values()].map(({ id, heroId, name, emoji, x, y, aim }) => ({
        id, heroId, name, emoji, x: Math.round(x), y: Math.round(y), aim: { ...aim },
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

  function broadcastState() {
    nsp.emit('state', snapshot());
  }

  const loop = setInterval(() => {
    const dt = 1 / ARENA_CONFIG.tickHz;
    const now = Date.now();

    // 1. Move players
    const step = ARENA_CONFIG.speed / ARENA_CONFIG.tickHz;
    for (const player of players.values()) {
      const dx = Number(player.keys.right) - Number(player.keys.left);
      const dy = Number(player.keys.down) - Number(player.keys.up);
      if (!dx && !dy) continue;
      const length = Math.hypot(dx, dy);
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

    // 2. Spawn zombie monsters periodically (spawn first immediately when players join)
    const shouldSpawn = (monsters.size === 0) || (now - lastMonsterSpawn >= SPAWN_INTERVAL_MS);
    if (players.size > 0 && campfire.hp > 0 && shouldSpawn && monsters.size < MAX_MONSTERS) {
      lastMonsterSpawn = now;
      spawnMonster();
    }

    // 3. Move monsters towards campfire
    for (const monster of monsters.values()) {
      const dx = campfire.x - monster.x;
      const dy = campfire.y - monster.y;
      const dist = Math.hypot(dx, dy);
      const minContactDist = campfire.radius + monster.radius;

      if (dist > minContactDist) {
        monster.x += (dx / dist) * monster.speed * dt;
        monster.y += (dy / dist) * monster.speed * dt;
      } else {
        if (campfire.hp > 0) {
          campfire.hp = Math.max(0, campfire.hp - monster.damage * dt);
        }
        if (dist > 0) {
          monster.x = campfire.x - (dx / dist) * minContactDist;
          monster.y = campfire.y - (dy / dist) * minContactDist;
        }
      }
    }

    // 4. Move projectiles
    for (const [id, proj] of projectiles.entries()) {
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      if (
        proj.x < -40 ||
        proj.x > ARENA_CONFIG.width + 40 ||
        proj.y < -40 ||
        proj.y > ARENA_CONFIG.height + 40 ||
        now - proj.createdAt > 4000
      ) {
        projectiles.delete(id);
      }
    }

    // 5. Collision: Projectiles vs Monsters
    for (const [pId, proj] of projectiles.entries()) {
      for (const [mId, monster] of monsters.entries()) {
        const dx = monster.x - proj.x;
        const dy = monster.y - proj.y;
        const hitDist = proj.radius + monster.radius;
        if (dx * dx + dy * dy <= hitDist * hitDist) {
          monster.hp -= 10;
          projectiles.delete(pId);
          nsp.emit('hit', {
            type: 'monster',
            id: mId,
            x: monster.x,
            y: monster.y,
            damage: 10,
          });
          if (monster.hp <= 0) {
            monsters.delete(mId);
            nsp.emit('monster_killed', {
              id: mId,
              x: monster.x,
              y: monster.y,
            });
          }
          break;
        }
      }
    }

    broadcastState();
  }, 1000 / ARENA_CONFIG.tickHz);

  return { stop: () => clearInterval(loop), players, projectiles, monsters, campfire };
}

module.exports = { attachHeroLab, ARENA_CONFIG, W: ARENA_CONFIG };
