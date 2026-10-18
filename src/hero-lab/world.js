const { HERO_CLASSES } = require('../../public/hero-lab/hero-list.js');
const { GAME_CONFIG } = require('../../public/hero-lab/game-config.js');
const { Projectile } = require('../../public/hero-lab/bases/projectile.js');
const { Zombie } = require('../../public/hero-lab/enemies/zombie.js');
const { Devil } = require('../../public/hero-lab/enemies/devil.js');
const { Skeleton } = require('../../public/hero-lab/enemies/skeleton.js');
const { EnemyProjectile } = require('../../public/hero-lab/projectiles/enemy-projectile.js');

const ARENA_CONFIG = {
  width: GAME_CONFIG.arena.width,
  height: GAME_CONFIG.arena.height,
  radius: GAME_CONFIG.arena.playerRadius,
  tickHz: GAME_CONFIG.arena.tickHz,
};
const SPAWNS = GAME_CONFIG.spawns;
const MOVEMENT_KEYS = ['up', 'down', 'left', 'right'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function attachHeroLab(io, services = null) {
  const nsp = io.of('/hero-lab');

  // Standalone Hero Lab remains available without a QuizQuest session. The
  // signed-in app supplies its token so saved kingdom levels can be applied.
  nsp.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next();
    const user = services?.authenticate(token);
    if (!user || user.role !== 'student') return next(new Error('Please sign in as a student.'));
    socket.data.user = user;
    socket.data.token = token;
    next();
  });

  const players = new Map();
  const projectiles = new Map();
  const monsters = new Map();
  const traps = new Map();
  const timedEffects = [];
  const pendingChains = [];
  const buffVotes = new Map();
  const campfireBonuses = new Map();

  let projectileCounter = 0;
  let monsterSeq = 0;

  let waveNumber = 0;
  let enemiesLeftToSpawn = 0;
  let enemiesSpawnedThisWave = 0;
  let nextEnemyAt = 0;
  let nextWaveAt = 0;
  let gameEnded = false;
  let buffVote = null;
  let lastBuff = null;
  const { enemySpawnIntervalMs: ENEMY_SPAWN_INTERVAL_MS, breakMs: WAVE_BREAK_MS } = GAME_CONFIG.waves;

  const campfire = {
    x: ARENA_CONFIG.width / 2,
    y: ARENA_CONFIG.height / 2,
    radius: GAME_CONFIG.campfire.radius,
    hp: GAME_CONFIG.campfire.hp,
    maxHp: GAME_CONFIG.campfire.hp,
  };

  function resetGame() {
    projectiles.clear();
    monsters.clear();
    traps.clear();
    timedEffects.length = 0;
    pendingChains.length = 0;
    buffVotes.clear();
    buffVote = null;
    lastBuff = null;
    gameEnded = false;
    campfire.maxHp = GAME_CONFIG.campfire.hp;
    campfire.hp = campfire.maxHp;
    campfireBonuses.clear();
    waveNumber = 0;
    enemiesLeftToSpawn = 0;
    enemiesSpawnedThisWave = 0;
    nextEnemyAt = 0;
    nextWaveAt = 0;
  }

  function startWave(now) {
    if (gameEnded) return;
    waveNumber += 1;
    // Wave 1 has 8 enemies: 5 + waveNumber * (2 + waveNumber).
    enemiesLeftToSpawn = GAME_CONFIG.waves.baseEnemies
      + waveNumber * (GAME_CONFIG.waves.linearGrowth + GAME_CONFIG.waves.quadraticGrowth * waveNumber);
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

    const margin = GAME_CONFIG.enemySpawnMargin;
    if (side === 0) {
      x = Math.random() * ARENA_CONFIG.width;
      y = -margin;
    } else if (side === 1) {
      x = Math.random() * ARENA_CONFIG.width;
      y = ARENA_CONFIG.height + margin;
    } else if (side === 2) {
      x = -margin;
      y = Math.random() * ARENA_CONFIG.height;
    } else {
      x = ARENA_CONFIG.width + margin;
      y = Math.random() * ARENA_CONFIG.height;
    }

    const EnemyClass = enemiesSpawnedThisWave % GAME_CONFIG.waves.devilEveryEnemies === 0
      ? Devil
      : enemiesSpawnedThisWave % GAME_CONFIG.waves.skeletonEveryEnemies === 0 ? Skeleton : Zombie;
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

  function beginBuffVote(now) {
    const pool = [
      { id: 'maxHp', label: 'Vitality', description: (v) => `Every hero gains ${v} max HP.` },
      { id: 'attack', label: 'Attack', description: (v) => `Every hero gains ${v} attack.` },
      { id: 'defense', label: 'Defense', description: (v) => `Every hero gains ${v} defense.` },
      { id: 'speed', label: 'Fleet Footed', description: (v) => `Every hero gains ${v} speed.` },
      { id: 'campfire', label: 'Campfire Heart', description: (v) => `Campfire gains ${v} max HP.` },
    ];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const cards = pool.slice(0, GAME_CONFIG.waveBuffs.cardCount).map((item) => {
      const value = GAME_CONFIG.waveBuffs.flatMin + Math.floor(Math.random() * (GAME_CONFIG.waveBuffs.flatMax - GAME_CONFIG.waveBuffs.flatMin + 1));
      return { id: item.id, label: item.label, description: item.description(value), value };
    });
    buffVotes.clear();
    buffVote = { wave: waveNumber, cards, endsAt: now + GAME_CONFIG.waveBuffs.voteDurationMs };
  }

  function finishBuffVote(now) {
    if (!buffVote) return;
    const counts = new Map(buffVote.cards.map((card) => [card.id, 0]));
    for (const vote of buffVotes.values()) if (counts.has(vote)) counts.set(vote, counts.get(vote) + 1);
    const high = Math.max(0, ...counts.values());
    const tied = buffVote.cards.filter((card) => counts.get(card.id) === high);
    const chosen = tied[Math.floor(Math.random() * tied.length)] || buffVote.cards[0];
    for (const { hero } of players.values()) {
      if (chosen.id === 'maxHp') { hero.maxHp += chosen.value; hero.hp += chosen.value; }
      else if (chosen.id === 'attack') hero.attack += chosen.value;
      else if (chosen.id === 'defense') hero.defense += chosen.value;
      else if (chosen.id === 'speed') hero.speed += chosen.value;
      if (['maxHp', 'attack', 'defense', 'speed'].includes(chosen.id)) {
        hero.runBonuses ||= {};
        hero.runBonuses[chosen.id] = (hero.runBonuses[chosen.id] || 0) + chosen.value;
      }
    }
    if (chosen.id === 'campfire') { campfire.maxHp += chosen.value; campfire.hp = Math.min(campfire.maxHp, campfire.hp + chosen.value); }
    lastBuff = { ...chosen };
    buffVote = null; buffVotes.clear(); nextWaveAt = now + WAVE_BREAK_MS;
    nsp.emit('buff_applied', lastBuff);
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
      if (socket.data.user && !services.ownsHero(socket.data.user.id, heroId)) return socket.emit('notice', 'Summon this hero before choosing them.');
      if (gameEnded) return socket.emit('notice', 'The campfire has gone out. The run is over.');

      const existing = players.get(socket.id);
      const index = existing
        ? [...players.keys()].indexOf(socket.id) % SPAWNS.length
        : players.size % SPAWNS.length;
      const spawn = SPAWNS[index];
      const hero = new HeroClass();
      const user = socket.data.user;
      hero.buildingBonuses = { attack: 0 };
      if (user) {
        if (!services.authenticate(socket.data.token)) return socket.disconnect(true);
        const levels = services.kingdomBuildings(user.id);
        for (const [building, buff] of Object.entries(GAME_CONFIG.buildingBuffs)) {
          const level = Math.max(0, Math.min(3, Number(levels[building]) || 0));
          if (!buff.stat || (buff.type && buff.type !== hero.type)) continue;
          const amount = level * buff.perLevel;
          if (buff.stat === 'campfireMaxHp') {
            if (!campfireBonuses.has(user.id)) {
              campfire.maxHp += amount;
              campfireBonuses.set(user.id, amount);
            }
          } else hero.buildingBonuses[buff.stat] += amount;
        }
      }
      hero.attack += hero.buildingBonuses.attack;
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

    socket.on('fire', (mode, target) => {
      const player = players.get(socket.id);
      if (!player || gameEnded) return;

      syncHeroAimAndPosition(player);
      const now = Date.now();
      if (mode === 'secondary') {
        if (player.heroId !== 'bombardier' || player.hero.targetingUntil <= now
          || !Number.isFinite(target?.x) || !Number.isFinite(target?.y)) return;
        const spec = player.hero.spec.airstrike;
        const x = clamp(target.x, 0, ARENA_CONFIG.width), y = clamp(target.y, 0, ARENA_CONFIG.height);
        player.hero.targetingUntil = 0;
        player.hero.useAbility('ultimate', now);
        for (let i = 0; i < spec.bombCount; i++) {
          const angle = Math.random() * Math.PI * 2, distance = Math.sqrt(Math.random()) * spec.circleRadius;
          timedEffects.push({ type: 'bomb-marker', ownerId: player.id, x: clamp(x + Math.cos(angle) * distance, 0, ARENA_CONFIG.width),
            y: clamp(y + Math.sin(angle) * distance, 0, ARENA_CONFIG.height), radius: spec.explosionRadius, damage: player.hero.attack * spec.damageMultiplier,
            at: now + i * spec.bombIntervalMs, explodeAt: now + i * spec.bombIntervalMs + spec.markerDelayMs });
        }
        broadcastState(now);
        return;
      }
      if (mode !== 'primary') return;
      if (!player.hero.canUseAbility('weapon', now)) return;
      const result = player.hero.fire(mode, now);
      if (!result) return;
      player.hero.useAbility('weapon', now);
      for (const projectile of Array.isArray(result) ? result : [result]) addProjectile(player, projectile);
    });

    socket.on('skill', () => {
      const player = players.get(socket.id);
      if (!player || gameEnded) return;

      syncHeroAimAndPosition(player);
      const now = Date.now();
      if (!player.hero.canUseAbility('skill', now)) return;
      const skill = player.hero.skill(now);
      if (!skill) return;

      player.hero.useAbility('skill', now);
      if (skill.type === 'dash') {
        if (skill.invulnerableMs > 0) player.hero.makeInvulnerable(skill.invulnerableMs, now);
        if (skill.durationMs) player.dashState = { ...skill, guardianDash: player.heroId === 'guardian', until: now + skill.durationMs, hit: new Set() };
        else {
          player.x = clamp(player.x + skill.direction.x * skill.distance, ARENA_CONFIG.radius, ARENA_CONFIG.width - ARENA_CONFIG.radius);
          player.y = clamp(player.y + skill.direction.y * skill.distance, ARENA_CONFIG.radius, ARENA_CONFIG.height - ARENA_CONFIG.radius);
          if (skill.damageMultiplier) damageNearby(player, skill, now);
        }
      } else if (skill.type === 'projectile' && skill.projectile) addProjectile(player, skill.projectile);
      else if (skill instanceof Projectile) addProjectile(player, skill);
      else if (skill.type === 'trap') {
        traps.set(player.id, { ownerId: player.id, x: player.x, y: player.y, radius: skill.triggerRadius, explosionRadius: skill.explosionRadius, damage: skill.damage, color: '#ff8c32' });
      } else if (skill.type === 'activate') { /* timed mode is held on the hero */ }
      syncHeroAimAndPosition(player);
    });

    socket.on('ultimate', () => {
      const player = players.get(socket.id);
      if (!player || gameEnded) return;
      syncHeroAimAndPosition(player);
      const now = Date.now();
      if (!player.hero.canUseAbility('ultimate', now)) return;
      const result = player.hero.ultimate(now);
      if (!result || (typeof result !== 'object' && result !== true)) return;
      if (result.type === 'targeting') { broadcastState(now); return; }
      player.hero.useAbility('ultimate', now);
      if (result instanceof Projectile) addProjectile(player, result);
      else if (result.type === 'bubble') timedEffects.push({ type: 'bubble', ownerId: player.id,
        x: result.x, y: result.y, damage: result.damage, heal: result.heal, radius: result.maxRadius, startAt: now, at: now + result.growthMs });
      else if (result.type === 'chain') chainAttack(player, result, now);
    });

    socket.on('cancel_targeting', () => {
      const player = players.get(socket.id);
      if (player?.heroId === 'bombardier') player.hero.targetingUntil = 0;
    });

    socket.on('buff_vote', (cardId) => {
      if (gameEnded || !buffVote || !buffVote.cards.some((card) => card.id === cardId) || buffVotes.has(socket.id)) return;
      buffVotes.set(socket.id, cardId);
      if ([...players.keys()].every((id) => buffVotes.has(id))) finishBuffVote(Date.now());
      broadcastState();
    });

    socket.on('disconnect', () => {
      if (players.delete(socket.id)) {
        buffVotes.delete(socket.id);
        if (players.size === 0) resetGame();
        else if (buffVote && [...players.keys()].every((id) => buffVotes.has(id))) finishBuffVote(Date.now());
        broadcastState();
      }
    });
  });

  function damageMonster(monster, amount, sourceId) {
    const source = typeof sourceId === 'object' ? sourceId : { ownerId: sourceId, sourceAbility: 'weapon' };
    const killer = players.get(source.ownerId);
    const electro = killer?.heroId === 'electromancer';
    const overloadActive = electro && monster.stunnedUntil > Date.now()
      && (source.sourceAbility !== 'ultimate' || killer.hero.spec.overload.chainGetsBonus);
    const appliedAmount = overloadActive ? amount * (1 + killer.hero.spec.overload.damageBonus) : amount;
    const damage = monster.takeDamage(appliedAmount);
    if (damage > 0) nsp.emit('hit', { type: 'monster', id: monster.id, x: monster.x, y: monster.y, damage });
    if (monster.dead) {
      monsters.delete(monster.id);
      nsp.emit('monster_killed', { id: monster.id, x: monster.x, y: monster.y, sourceId: source.ownerId });
      if (killer?.heroId === 'sheriff' && (source.sourceAbility !== 'skill' || killer.hero.spec.kills.countDynamiteKills)) {
        const cd = killer.hero.cooldowns.skill; cd.readyAt = Math.max(Date.now(), cd.readyAt - killer.hero.spec.kills.dynamiteCooldownCutMs);
      }
      if (killer?.heroId === 'pilot') {
        const cd = killer.hero.cooldowns.ultimate; cd.readyAt = Math.max(Date.now(), cd.readyAt - killer.hero.spec.kills.ultimateCooldownCutMs);
      }
      if (killer?.heroId === 'guardian' && killer.hero.dashingUntil > Date.now()) {
        const cut = killer.hero.spec.unstoppable.killExtensionMs;
        killer.hero.dashingUntil = Math.min(killer.hero.dashCapUntil, killer.hero.dashingUntil + cut);
        killer.hero.makeInvulnerable(cut, Date.now());
        if (killer.hero.chargeUntil > Date.now()) killer.hero.chargeUntil = killer.hero.dashingUntil;
        for (const member of players.values()) if (member.dashState?.guardianDash) member.dashState.until = killer.hero.dashingUntil;
        nsp.emit('dash_extended', { id: killer.id, x: killer.x, y: killer.y, ms: cut });
      }
    }
    return damage;
  }

  function damageNearby(player, spec, now) {
    for (const monster of [...monsters.values()]) {
      if (Math.hypot(monster.x-player.x, monster.y-player.y) > spec.distance + monster.radius) continue;
      damageMonster(monster, player.hero.attack * spec.damageMultiplier, { ownerId: player.id, sourceAbility: 'skill' });
      const dx=monster.x-player.x, dy=monster.y-player.y, length=Math.hypot(dx,dy)||1;
      monster.x += dx/length*(spec.knockback||0)*0.08; monster.y += dy/length*(spec.knockback||0)*0.08;
    }
  }

  function explode(effect, now) {
    for (const monster of [...monsters.values()]) {
      if (effect.excludeId === monster.id) continue;
      if (Math.hypot(monster.x-effect.x, monster.y-effect.y) <= effect.radius + monster.radius) {
        damageMonster(monster, effect.damage, { ownerId: effect.ownerId, sourceAbility: effect.sourceAbility || 'ultimate' });
        if (effect.stunMs) monster.stunnedUntil = now + effect.stunMs;
        const dx=monster.x-effect.x, dy=monster.y-effect.y, length=Math.hypot(dx,dy)||1;
        monster.knockbackX=(dx/length)*(effect.knockback||0); monster.knockbackY=(dy/length)*(effect.knockback||0);
      }
    }
    if (effect.heal) for (const player of players.values()) {
      if (Math.hypot(player.x-effect.x, player.y-effect.y) <= effect.radius) player.hero.heal(effect.heal);
    }
    nsp.emit('area_effect', { x: effect.x, y: effect.y, radius: effect.radius, color: effect.color || '#ff9c45' });
  }

  function chainAttack(player, effect, now) {
    let x=player.x, y=player.y; const hit=new Set();
    for(let i=0;i<effect.jumps;i++) {
      const target=[...monsters.values()].filter(m=>!hit.has(m.id)&&Math.hypot(m.x-x,m.y-y)<=effect.range)
        .sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
      if(!target) break;
      hit.add(target.id); pendingChains.push({ at: now + i * effect.jumpDelayMs, ownerId: player.id, targetId: target.id,
        x1: x, y1: y, damage: effect.damage }); x=target.x;y=target.y;
    }
  }

  function snapshot(now = Date.now()) {
    return {
      wave: {
        number: waveNumber,
        enemiesRemaining: monsters.size + enemiesLeftToSpawn,
        nextWaveInMs: nextWaveAt ? Math.max(0, nextWaveAt - now) : 0,
      },
      gameEnded,
      serverTime: now,
      buffVote: buffVote ? { wave: buffVote.wave, cards: buffVote.cards, endsAt: buffVote.endsAt,
        voteCount: buffVotes.size, votes: Object.fromEntries(buffVotes) } : null,
      lastBuff,
      traps: [...traps.values()],
      effects: timedEffects.map(({ type, x, y, radius, at, startAt }) => ({ type, x, y, radius, at, startAt })),
      campfire: {
        x: campfire.x,
        y: campfire.y,
        radius: campfire.radius,
        hp: Math.max(0, Math.round(campfire.hp)),
        maxHp: campfire.maxHp,
      },
      monsters: [...monsters.values()].map(({ id, x, y, hp, maxHp, radius, emoji, stunnedUntil, trappedBy }) => ({
        id,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        hp: Math.max(0, Math.round(hp)),
        maxHp,
        radius,
        emoji,
        stunned: stunnedUntil > now,
        trapped: Boolean(trappedBy),
      })),
      players: [...players.values()].map(({ id, heroId, hero, name, emoji, x, y, aim }) => ({
        id, heroId, name, emoji: hero.visual || emoji, type: hero.type, x: Math.round(x), y: Math.round(y), aim: { ...aim },
        talent: hero.talent, targeting: hero.targetingUntil > now,
        dashing: heroId === 'guardian' ? hero.dashingUntil > now : Boolean(players.get(id)?.dashState && players.get(id).dashState.until > now),
        hp: Math.max(0, Math.round(hero.hp)), maxHp: hero.maxHp,
        attack: hero.attack, defense: hero.defense, speed: hero.speed,
        abilities: Object.fromEntries(Object.entries(hero.cooldowns).map(([key, cooldown]) => [key, {
          name: key === 'weapon' ? hero.weaponName : key === 'skill' ? hero.skillName : hero.ultimateName,
          durationMs: cooldown.durationMs,
          readyAt: cooldown.readyAt,
          remainingMs: Math.max(0, cooldown.readyAt - now),
        }])),
        invulnerable: hero.invulnerableUntil > now,
      })),
      projectiles: [...projectiles.values()].map(({ id, ownerId, heroId, x, y, vx, vy, radius, color, kind, type, emoji, rotateToAim, flashColors, flashIntervalMs, shape }) => ({
        id,
        ownerId,
        heroId,
        kind,
        type, emoji, rotateToAim, flashColors, flashIntervalMs, shape,
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
    if (gameEnded) { broadcastState(now); return; }

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
    if (players.size > 0 && !gameEnded && waveNumber === 0) startWave(now);
    if (players.size > 0 && !gameEnded && nextWaveAt && now >= nextWaveAt) startWave(now);
    if (players.size > 0 && !gameEnded && enemiesLeftToSpawn > 0 && now >= nextEnemyAt) {
      spawnEnemy();
    }

    // 3. Zombies chase the campfire; devils chase the closest living player.
    for (const player of players.values()) {
      syncHeroAimAndPosition(player);
      if(player.heroId==='guardian' && player.hero.dashingUntil>now) player.hero.makeInvulnerable(player.hero.dashingUntil-now,now);
      if (player.dashState) {
        const dash=player.dashState;
        if(now>=dash.until){player.dashState=null;}
        else {
          const step=dash.distance/Math.max(1,dash.durationMs)*1000/ARENA_CONFIG.tickHz;
          player.x=clamp(player.x+dash.direction.x*step,ARENA_CONFIG.radius,ARENA_CONFIG.width-ARENA_CONFIG.radius);
          player.y=clamp(player.y+dash.direction.y*step,ARENA_CONFIG.radius,ARENA_CONFIG.height-ARENA_CONFIG.radius);
          if(dash.damageMultiplier) for(const monster of [...monsters.values()]) {
            if(dash.hit.has(monster.id)||Math.hypot(monster.x-player.x,monster.y-player.y)>monster.radius+ARENA_CONFIG.radius+8)continue;
            dash.hit.add(monster.id);damageMonster(monster,player.hero.attack*dash.damageMultiplier,{ownerId:player.id,sourceAbility:'skill'});
            monster.x+=dash.direction.x*(dash.knockback||0)*.08;monster.y+=dash.direction.y*(dash.knockback||0)*.08;
          }
        }
      }
      const effect=player.hero.update(now);
      if (effect instanceof Projectile) addProjectile(player,effect);
      if (player.hero.chargeUntil > now) {
        const step=player.hero.spec.charge.speed/ARENA_CONFIG.tickHz;
        player.x=clamp(player.x+player.aim.x*step,ARENA_CONFIG.radius,ARENA_CONFIG.width-ARENA_CONFIG.radius);
        player.y=clamp(player.y+player.aim.y*step,ARENA_CONFIG.radius,ARENA_CONFIG.height-ARENA_CONFIG.radius);
        for (const monster of [...monsters.values()]) {
          if (Math.hypot(monster.x-player.x,monster.y-player.y) > monster.radius+ARENA_CONFIG.radius+8) continue;
          if ((player.hero.lastChargeHit.get(monster.id)||0)+player.hero.spec.charge.hitCooldownMs > now) continue;
          player.hero.lastChargeHit.set(monster.id,now);
          damageMonster(monster,player.hero.attack*player.hero.spec.charge.damageMultiplier,{ownerId:player.id,sourceAbility:'ultimate'});
          monster.x += player.aim.x*player.hero.spec.charge.knockback*.08;
          monster.y += player.aim.y*player.hero.spec.charge.knockback*.08;
        }
      }
    }

    for (let i=pendingChains.length-1;i>=0;i--) {
      const chain=pendingChains[i]; if(now<chain.at) continue;
      const target=monsters.get(chain.targetId);
      if(target) {
        damageMonster(target,chain.damage,{ownerId:chain.ownerId,sourceAbility:'ultimate'});
        nsp.emit('lightning_chain',{x1:chain.x1,y1:chain.y1,x2:target.x,y2:target.y});
        nsp.emit('lightning_flash',{id:target.id,x:target.x,y:target.y});
      }
      pendingChains.splice(i,1);
    }
    for (const monster of monsters.values()) {
      if (monster.stunnedUntil > now || monster.trappedBy) continue;
      if (monster.knockbackX || monster.knockbackY) {
        monster.x += monster.knockbackX*dt; monster.y += monster.knockbackY*dt;
        monster.knockbackX *= 0.88; monster.knockbackY *= 0.88;
      }
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
      } else if (monster instanceof Skeleton) {
        const target=closestPlayer(monster);
        const projectile=monster.update(dt,campfire,target,now);
        if(projectile) addProjectile({id:monster.id,heroId:'skeleton'},projectile);
      } else {
        monster.update(dt, campfire);
      }
    }

    for (const player of players.values()) {
      if (Math.hypot(player.x-campfire.x,player.y-campfire.y) <= GAME_CONFIG.campfire.healingRadius) {
        player.hero.heal(GAME_CONFIG.campfire.healingPerSecond*dt);
      }
    }

    // 4. Move projectiles
    for (const [id, proj] of projectiles.entries()) {
      proj.update(dt, ARENA_CONFIG);
      if (proj.stunMs > 0 && proj.explosionRadius > 0) {
        for (const monster of [...monsters.values()]) {
          if (proj.hitTargets.has(monster.id) || Math.hypot(monster.x-proj.x,monster.y-proj.y) > proj.explosionRadius+monster.radius) continue;
          proj.hitTargets.add(monster.id);
          damageMonster(monster,proj.damage,{ownerId:proj.ownerId,sourceAbility:'skill'});
          monster.stunnedUntil=now+proj.stunMs;
          nsp.emit('area_effect',{x:proj.x,y:proj.y,radius:proj.explosionRadius,color:'#65d9ff'});
        }
      }
      if (proj.trapTargetId) {
        const target = monsters.get(proj.trapTargetId);
        if (target) { target.x = proj.x; target.y = proj.y; }
        const travel = Math.hypot(proj.x - proj.trapOrigin.x, proj.y - proj.trapOrigin.y);
        if (target && (travel >= proj.trap.travelDistance || proj.dead)) {
          const finisher = target.hp <= proj.trap.damage;
          target.trappedBy = null;
          explode({ x: proj.x, y: proj.y, radius: finisher ? proj.trap.finisherRadius : proj.trap.explosionRadius,
            damage: finisher ? proj.trap.finisherDamage : proj.trap.damage, ownerId: proj.ownerId, sourceAbility: 'skill', color: '#54dcff' }, now);
          projectiles.delete(id); continue;
        }
      }
      if (proj.dead) {
        if (proj.trap) {
          if (!proj.trapTargetId && proj.trap.missRefundFraction > 0) {
            const owner=players.get(proj.ownerId); if(owner) owner.hero.cooldowns.skill.readyAt -= owner.hero.cooldowns.skill.durationMs*proj.trap.missRefundFraction;
          }
          if (proj.trapTargetId) { const target=monsters.get(proj.trapTargetId); if(target) target.trappedBy=null; }
        }
        if (proj.detonateOnExpire || (proj.explosionRadius > 0 && !proj.trap && !proj.stunMs)) explode({x:proj.x,y:proj.y,radius:proj.explosionRadius||proj.radius,damage:proj.damage,knockback:proj.knockback,stunMs:proj.stunMs,ownerId:proj.ownerId,sourceAbility:proj.sourceAbility,color:proj.color},now);
        projectiles.delete(id);
      }
    }

    // 5. Projectiles have an explicit team. Player shots hit monsters;
    // enemy shots hit heroes and still pass through the normal defense rules.
    for (const [pId, proj] of projectiles.entries()) {
      if (proj.kind === 'enemy') {
        for (const player of players.values()) {
          if (!proj.collidesWith({ x: player.x, y: player.y, radius: ARENA_CONFIG.radius }) || proj.hitTargets.has(player.id)) continue;
          proj.hitTargets.add(player.id);
          const damage = player.hero.damage(proj.damage, now);
          projectiles.delete(pId);
          if (damage > 0) nsp.emit('player_hit', { id: player.id, x: player.x, y: player.y, damage });
          break;
        }
        continue;
      }
      if (proj.targetTeam === 'players') {
        for (const player of players.values()) {
          if (player.id === proj.ownerId || proj.hitTargets.has(player.id) || !proj.collidesWith({x:player.x,y:player.y,radius:ARENA_CONFIG.radius})) continue;
          proj.hitTargets.add(player.id);
          if (proj.heal) player.hero.heal(proj.heal);
          if (proj.onHit(player)) projectiles.delete(pId);
          break;
        }
        continue;
      }
      for (const [mId, monster] of monsters.entries()) {
        if (proj.collidesWith(monster) && !proj.hitTargets.has(mId)) {
          if (proj.trap) {
            proj.trapTargetId=mId; proj.trapOrigin={x:proj.x,y:proj.y}; monster.trappedBy=proj.id; monster.x=proj.x; monster.y=proj.y;
            break;
          }
          const damage = damageMonster(monster,proj.damage,{ownerId:proj.ownerId,sourceAbility:proj.sourceAbility||'weapon'});
          proj.hitTargets.add(mId);
          if (proj.explosionRadius > 0) explode({x:proj.x,y:proj.y,radius:proj.explosionRadius,damage:proj.damage,knockback:proj.knockback,stunMs:proj.stunMs,ownerId:proj.ownerId,sourceAbility:proj.sourceAbility,excludeId:mId,color:proj.color},now);
          if (proj.onHit(monster) || proj.explosionRadius > 0) projectiles.delete(pId);
          break;
        }
      }
    }

    for (const [ownerId, trap] of traps) {
      const target=[...monsters.values()].find(m=>Math.hypot(m.x-trap.x,m.y-trap.y)<=m.radius+trap.radius);
      if(target){explode({...trap,ownerId},now);traps.delete(ownerId);}
    }
    for(let i=timedEffects.length-1;i>=0;i--) {
      const effect=timedEffects[i];
      if(effect.type==='bomb-marker' && now>=effect.explodeAt){explode({...effect,type:'explosion',sourceAbility:'ultimate'},now);timedEffects.splice(i,1);}
      else if(effect.type!=='bomb-marker' && now>=effect.at){explode(effect,now);timedEffects.splice(i,1);}
    }

    if (buffVote && now >= buffVote.endsAt) finishBuffVote(now);

    if (!gameEnded && campfire.hp <= 0) {
      gameEnded=true; campfire.hp=0; nextWaveAt=0; enemiesLeftToSpawn=0;
      for(const player of players.values()) nsp.to(player.id).emit('game_over',{reason:'campfire'});
    }

    // 6. A dead hero is out of the shared game and returns to hero selection.
    for (const player of gameEnded ? [] : [...players.values()]) {
      if (player.hero.hp > 0) continue;
      nsp.to(player.id).emit('game_over', { reason: 'hero' });
      players.delete(player.id);
      buffVotes.delete(player.id);
    }
    if (buffVote && players.size > 0 && [...players.keys()].every((id) => buffVotes.has(id))) finishBuffVote(now);
    if (players.size === 0 && waveNumber > 0) resetGame();

    // 8. Start a five-second break only after every enemy in the wave is gone.
    if (
      players.size > 0 && !gameEnded && !buffVote && waveNumber > 0 && enemiesLeftToSpawn === 0
      && monsters.size === 0 && nextWaveAt === 0
    ) {
      beginBuffVote(now);
    }

    broadcastState(now);
  }, 1000 / ARENA_CONFIG.tickHz);

  return { stop: () => clearInterval(loop), players, projectiles, monsters, campfire };
}

module.exports = { attachHeroLab, ARENA_CONFIG, W: ARENA_CONFIG };
