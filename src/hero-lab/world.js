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
  const spawnTelegraphs = [];
  const pendingChains = [];
  const buffVotes = new Map();
  const campfireBonuses = new Map();
  let lastCampfireFeedbackAt = Number.NEGATIVE_INFINITY;
  let pendingCampfireDamage = 0;
  const runBuffs = [];

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
    spawnTelegraphs.length = 0;
    pendingChains.length = 0;
    buffVotes.clear();
    buffVote = null;
    lastBuff = null;
    runBuffs.length = 0;
    lastCampfireFeedbackAt = Number.NEGATIVE_INFINITY;
    pendingCampfireDamage = 0;
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
    nsp.emit('wave_start', { wave: waveNumber, bossWave: false });
    // Wave 1 has 8 enemies: 5 + waveNumber * (2 + waveNumber).
    enemiesLeftToSpawn = GAME_CONFIG.waves.baseEnemies
      + waveNumber * (GAME_CONFIG.waves.linearGrowth + GAME_CONFIG.waves.quadraticGrowth * waveNumber);
    enemiesSpawnedThisWave = 0;
    nextEnemyAt = now;
    nextWaveAt = 0;
  }

  function chooseSpawnLocation() {
    const margin = GAME_CONFIG.enemySpawnMargin;
    const candidate = () => {
      const side = Math.floor(Math.random() * 4);
      if (side === 0) return { x: Math.random() * ARENA_CONFIG.width, y: -margin };
      if (side === 1) return { x: Math.random() * ARENA_CONFIG.width, y: ARENA_CONFIG.height + margin };
      if (side === 2) return { x: -margin, y: Math.random() * ARENA_CONFIG.height };
      return { x: ARENA_CONFIG.width + margin, y: Math.random() * ARENA_CONFIG.height };
    };
    let best = candidate();
    let bestDistance = -1;
    for (let attempt = 0; attempt < GAME_CONFIG.arenaTuning.enemies.spawnPositionAttempts; attempt++) {
      const point = candidate();
      const distance = Math.min(Number.POSITIVE_INFINITY, ...[...players.values()].filter((player) => player.hero.hp > 0)
        .map((player) => Math.hypot(player.x - point.x, player.y - point.y)));
      if (distance >= GAME_CONFIG.arenaTuning.enemies.spawnAvoidHeroRadius) return point;
      if (distance > bestDistance) { best = point; bestDistance = distance; }
    }
    return best;
  }

  function scheduleSpawn(now) {
    monsterSeq += 1;
    enemiesSpawnedThisWave += 1;
    const point = chooseSpawnLocation();
    const spawnAt = now + GAME_CONFIG.arenaTuning.briefing.spawnTelegraphMs;
    const marker = { id: `spawn_${monsterSeq}`, ...point, startedAt: now, spawnAt, typeIndex: enemiesSpawnedThisWave };
    spawnTelegraphs.push(marker);
    enemiesLeftToSpawn -= 1;
    nextEnemyAt = now + ENEMY_SPAWN_INTERVAL_MS;
  }

  function spawnEnemy(marker, now) {
    const spawnTooClose = [...players.values()].some((player) => !player.downed && player.hero.hp > 0
      && Math.hypot(player.x - marker.x, player.y - marker.y) < GAME_CONFIG.arenaTuning.enemies.spawnAvoidHeroRadius);
    if (spawnTooClose) {
      Object.assign(marker, chooseSpawnLocation(), { startedAt: now, spawnAt: now + GAME_CONFIG.arenaTuning.briefing.spawnTelegraphMs });
      return false;
    }

    const EnemyClass = marker.typeIndex % GAME_CONFIG.waves.devilEveryEnemies === 0
      ? Devil
      : marker.typeIndex % GAME_CONFIG.waves.skeletonEveryEnemies === 0 ? Skeleton : Zombie;
    const monster = new EnemyClass({ id: `enemy_${monsterSeq}`, x: marker.x, y: marker.y });

    monsters.set(monster.id, monster);
    return true;
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
    const missing = Math.max(0, campfire.maxHp - campfire.hp);
    campfire.hp = Math.min(campfire.maxHp, campfire.hp + missing * GAME_CONFIG.arenaTuning.waveMoments.clearedHealFraction);
    nsp.emit('wave_end', { wave: waveNumber });
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
    runBuffs.push({ ...chosen });
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

  function downPlayer(player, now) {
    if (player.downed || player.hero.hp > 0) return;
    player.downed = true;
    player.keys = {};
    player.respawnSolo = players.size === 1;
    player.respawnDurationMs = player.respawnSolo ? GAME_CONFIG.arenaTuning.respawn.soloMs : GAME_CONFIG.arenaTuning.respawn.baseMs;
    player.respawnRemainingMs = player.respawnDurationMs;
    player.respawnSpeedMultiplier = 1;
    player.respawnStartedAt = now;
    player.x = campfire.x;
    player.y = campfire.y;
    if (player.respawnSolo) {
      const hpBefore = campfire.hp;
      campfire.hp = Math.max(0, campfire.hp - campfire.maxHp * GAME_CONFIG.arenaTuning.respawn.soloCampfireCost);
      pendingCampfireDamage += hpBefore - campfire.hp;
    }
    nsp.emit('hero_downed', { playerId: player.id, durationMs: player.respawnDurationMs, solo: player.respawnSolo });
  }

  function respawnPlayer(player, now) {
    player.downed = false;
    player.keys = {};
    player.x = campfire.x;
    player.y = campfire.y;
    player.hero.hp = Math.max(1, player.hero.maxHp * GAME_CONFIG.arenaTuning.respawn.respawnHpFraction);
    player.hero.makeInvulnerable(GAME_CONFIG.arenaTuning.respawn.invulnerabilityMs, now);
    player.respawnRemainingMs = 0;
    player.respawnSpeedMultiplier = 1;
    nsp.emit('hero_respawn', { playerId: player.id, x: player.x, y: player.y });
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
        downed: false,
        momentumSamples: [],
        momentumReadySent: false,
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
      if (!player || player.downed || !input || typeof input !== 'object') return;
      player.keys = Object.fromEntries(MOVEMENT_KEYS.map((key) => [key, input[key] === true]));
    });

    socket.on('aim', (aim) => {
      const player = players.get(socket.id);
      if (!player || player.downed || !Number.isFinite(aim?.x) || !Number.isFinite(aim?.y)) return;
      const length = Math.hypot(aim.x, aim.y);
      if (length > 0) {
        player.aim = { x: aim.x / length, y: aim.y / length };
        player.hero.aim = { ...player.aim };
      }
    });

    socket.on('fire', (mode, target) => {
      const player = players.get(socket.id);
      if (!player || player.downed || gameEnded) return;

      syncHeroAimAndPosition(player);
      const now = Date.now();
      if (mode === 'secondary') {
        if (player.heroId !== 'bombardier' || player.hero.targetingUntil <= now
          || !Number.isFinite(target?.x) || !Number.isFinite(target?.y)) return;
        const spec = player.hero.spec.airstrike;
        const x = clamp(target.x, 0, ARENA_CONFIG.width), y = clamp(target.y, 0, ARENA_CONFIG.height);
        player.hero.targetingUntil = 0;
        player.hero.useAbility('ultimate', now);
        const telegraphMs = GAME_CONFIG.arenaTuning.areaEffects.targetedTelegraphMs;
        timedEffects.push({ type: 'bomb-marker', ownerId: player.id, x, y, radius: spec.circleRadius,
          damage: player.hero.attack * spec.damageMultiplier, color: GAME_CONFIG.heroFxColors[player.heroId].primary,
          sourceAbility: 'ultimate', telegraphMs, at: now, explodeAt: now + telegraphMs, telegraphSent: true });
        nsp.emit('area_telegraph', { x, y, radius: spec.circleRadius, kind: 'player', telegraphMs, sourceAbility: 'ultimate' });
        nsp.emit('ability_used', { playerId: player.id, heroId: player.heroId, ability: 'ultimate' });
        broadcastState(now);
        return;
      }
      if (mode !== 'primary') return;
      if (!player.hero.canUseAbility('weapon', now)) return;
      const result = player.hero.fire(mode, now);
      if (!result) return;
      player.hero.useAbility('weapon', now);
      nsp.emit('weapon_fired', { playerId: player.id, heroId: player.heroId });
      for (const projectile of Array.isArray(result) ? result : [result]) addProjectile(player, projectile);
    });

    socket.on('skill', () => {
      const player = players.get(socket.id);
      if (!player || player.downed || gameEnded) return;

      syncHeroAimAndPosition(player);
      const now = Date.now();
      if (!player.hero.canUseAbility('skill', now)) return;
      const skill = player.hero.skill(now);
      if (!skill) return;

      player.hero.useAbility('skill', now);
      nsp.emit('ability_used', { playerId: player.id, heroId: player.heroId, ability: 'skill' });
      if (skill.type === 'controlled_burst') {
        player.controlledBurst = { until: now + skill.durationMs, speedMultiplier: skill.speedMultiplier,
          capUntil: now + skill.durationMs * GAME_CONFIG.arenaTuning.heroTweaks.guardianDashMaxBaseMultiplier,
          damageMultiplier: skill.damageMultiplier, lastHitAt: new Map() };
        player.hero.dashingUntil = player.controlledBurst.until;
        if (skill.invulnerableMs > 0) player.hero.makeInvulnerable(skill.invulnerableMs, now);
      } else if (skill.type === 'dash') {
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
        traps.set(player.id, { ownerId: player.id, x: player.x, y: player.y, radius: skill.triggerRadius, explosionRadius: skill.explosionRadius, damage: skill.damage,
          color: GAME_CONFIG.heroFxColors[player.heroId].primary });
      } else if (skill.type === 'activate') { /* timed mode is held on the hero */ }
      syncHeroAimAndPosition(player);
    });

    socket.on('ultimate', () => {
      const player = players.get(socket.id);
      if (!player || player.downed || gameEnded) return;
      syncHeroAimAndPosition(player);
      const now = Date.now();
      if (!player.hero.canUseAbility('ultimate', now)) return;
      const result = player.hero.ultimate(now);
      if (!result || (typeof result !== 'object' && result !== true)) return;
      if (result.type === 'targeting') { broadcastState(now); return; }
      player.hero.useAbility('ultimate', now);
      nsp.emit('ability_used', { playerId: player.id, heroId: player.heroId, ability: 'ultimate' });
      if (result instanceof Projectile) addProjectile(player, result);
      else if (result.type === 'bubble') {
        timedEffects.push({ type: 'bubble', ownerId: player.id,
          x: result.x, y: result.y, damage: result.damage, heal: result.heal, radius: result.maxRadius, startAt: now, at: now + result.growthMs,
          color: GAME_CONFIG.heroFxColors[player.heroId].primary, sourceAbility: 'ultimate' });
        nsp.emit('area_telegraph', { x: result.x, y: result.y, radius: result.maxRadius, kind: 'player', telegraphMs: result.growthMs, sourceAbility: 'ultimate' });
      }
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
    const momentumMultiplier = killer?.momentumActive ? 1 + GAME_CONFIG.arenaTuning.momentum.bonus : 1;
    const appliedAmount = amount * momentumMultiplier * (overloadActive ? 1 + killer.hero.spec.overload.damageBonus : 1);
    const damage = monster.takeDamage(appliedAmount);
    if (damage > 0) nsp.emit('hit', { type: 'monster', id: monster.id, x: monster.x, y: monster.y, damage,
      sourceId: source.ownerId, heroId: killer?.heroId || null, sourceAbility: source.sourceAbility || 'weapon', bonus: overloadActive,
      sourceX: killer?.x, sourceY: killer?.y,
      enemyType: monster.type, boss: Boolean(monster.isBoss), elite: Boolean(monster.isElite) });
    if (monster.dead) {
      monsters.delete(monster.id);
      nsp.emit('monster_killed', { id: monster.id, x: monster.x, y: monster.y, sourceId: source.ownerId,
        heroId: killer?.heroId || null, sourceX: killer?.x, sourceY: killer?.y, emoji: monster.emoji, sourceAbility: source.sourceAbility || 'weapon',
        enemyType: monster.type, boss: Boolean(monster.isBoss), elite: Boolean(monster.isElite), finisher: Boolean(source.finisher) });
      if (killer?.heroId === 'sheriff' && (source.sourceAbility !== 'skill' || killer.hero.spec.kills.countDynamiteKills)) {
        const cd = killer.hero.cooldowns.skill;
        const now = Date.now();
        const cut = GAME_CONFIG.arenaTuning.heroTweaks.sheriffTalentCooldownCutSec * 1000;
        if (cd.readyAt > now) {
          cd.readyAt = Math.max(now, cd.readyAt - cut);
        }
      }
      if (killer?.heroId === 'pilot') {
        const cd = killer.hero.cooldowns.ultimate;
        const now = Date.now();
        const maxCut = cd.durationMs * GAME_CONFIG.arenaTuning.heroTweaks.pilotTalentCycleReductionCap;
        const perKillCut = GAME_CONFIG.arenaTuning.heroTweaks.pilotTalentCooldownCutSec * 1000;
        const cut = Math.max(0, Math.min(perKillCut, maxCut - (cd.cutThisCycleMs || 0), cd.readyAt - now));
        if (cut > 0) { cd.readyAt -= cut; cd.cutThisCycleMs = (cd.cutThisCycleMs || 0) + cut; }
      }
      if (killer?.heroId === 'guardian' && (killer.hero.dashingUntil > Date.now() || killer.hero.chargeUntil > Date.now())) {
        const cut = GAME_CONFIG.arenaTuning.heroTweaks.guardianKillExtensionSec * 1000;
        if (killer.controlledBurst?.until > Date.now()) {
          killer.controlledBurst.until = Math.min(killer.controlledBurst.capUntil, killer.controlledBurst.until + cut);
          killer.hero.dashingUntil = killer.controlledBurst.until;
        } else killer.hero.dashingUntil = Math.min(killer.hero.dashCapUntil, killer.hero.dashingUntil + cut);
        killer.hero.makeInvulnerable(cut, Date.now());
        if (killer.hero.chargeUntil > Date.now()) killer.hero.chargeUntil = killer.hero.dashingUntil;
        for (const member of players.values()) if (member.dashState?.guardianDash) member.dashState.until = killer.hero.dashingUntil;
        nsp.emit('dash_extended', { id: killer.id, x: killer.x, y: killer.y, ms: cut });
      }
    }
    return damage;
  }

  function pushFromDash(monster, player, now) {
    const dx = monster.x - player.x, dy = monster.y - player.y, length = Math.hypot(dx, dy) || 1;
    const multiplier = monster.type === 'brute-king' || monster.isBoss ? GAME_CONFIG.arenaTuning.knockback.kingMultiplier
      : monster.type === 'brute' ? GAME_CONFIG.arenaTuning.knockback.bruteMultiplier : 1;
    if (!multiplier) return;
    monster.dashPush = { x: dx / length * GAME_CONFIG.arenaTuning.heroTweaks.guardianDashPushPx * multiplier,
      y: dy / length * GAME_CONFIG.arenaTuning.heroTweaks.guardianDashPushPx * multiplier,
      startedAt: now, durationMs: GAME_CONFIG.arenaTuning.heroTweaks.guardianDashPushMs, lastProgress: 0 };
    nsp.emit('dash_hit', { id: player.id, heroId: player.heroId, x: player.x, y: player.y, monsterId: monster.id });
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
        damageMonster(monster, effect.damage, { ownerId: effect.ownerId, sourceAbility: effect.sourceAbility || 'ultimate', finisher: effect.finisher });
        if (effect.stunMs) monster.stunnedUntil = now + effect.stunMs;
        const dx=monster.x-effect.x, dy=monster.y-effect.y, length=Math.hypot(dx,dy)||1;
        monster.knockbackX=(dx/length)*(effect.knockback||0); monster.knockbackY=(dy/length)*(effect.knockback||0);
      }
    }
    if (effect.heal) for (const player of players.values()) {
      if (Math.hypot(player.x-effect.x, player.y-effect.y) <= effect.radius) player.hero.heal(effect.heal);
    }
    const owner = players.get(effect.ownerId);
    nsp.emit('area_effect', { x: effect.x, y: effect.y, radius: effect.radius, kind: 'player', telegraphMs: 0,
      color: effect.color || GAME_CONFIG.heroFxColors[owner?.heroId]?.primary || '#ff9c45',
      sourceAbility: effect.sourceAbility || 'ultimate', finisher: Boolean(effect.finisher) });
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
      activeBuffs: runBuffs.map((buff) => ({ ...buff })),
      spawnTelegraphs: spawnTelegraphs.map(({ id, x, y, spawnAt }) => ({ id, x, y, remainingMs: Math.max(0, spawnAt - now) })),
      traps: [...traps.values()],
      effects: timedEffects.map(({ type, x, y, radius, at, startAt }) => ({ type, x, y, radius, at, startAt })),
      campfire: {
        x: campfire.x,
        y: campfire.y,
        radius: campfire.radius,
        hp: Math.max(0, Math.round(campfire.hp)),
        maxHp: campfire.maxHp,
      },
      monsters: [...monsters.values()].map(({ id, x, y, hp, maxHp, radius, emoji, type, stunnedUntil, trappedBy, windupUntil }) => ({
        id,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        hp: Math.max(0, Math.round(hp)),
        maxHp,
        radius,
        emoji,
        type,
        stunned: stunnedUntil > now,
        trapped: Boolean(trappedBy),
        skeletonWindupMs: Math.max(0, (windupUntil || 0) - now),
      })),
      players: [...players.values()].map(({ id, heroId, hero, name, emoji, x, y, aim, downed, respawnRemainingMs, respawnDurationMs, respawnSpeedMultiplier, momentumActive }) => ({
        id, heroId, name, emoji: hero.visual || emoji, type: hero.type, x: Math.round(x), y: Math.round(y), aim: { ...aim },
        talent: hero.talent, targeting: hero.targetingUntil > now,
        dashing: heroId === 'guardian' ? hero.dashingUntil > now || Boolean(players.get(id)?.controlledBurst && players.get(id).controlledBurst.until > now) : Boolean(players.get(id)?.dashState && players.get(id).dashState.until > now),
        downed: Boolean(downed), respawnRemainingMs: respawnRemainingMs || 0, respawnDurationMs: respawnDurationMs || 0,
        respawnSpeedMultiplier: respawnSpeedMultiplier || 1, momentumActive: Boolean(momentumActive),
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
      projectiles: [...projectiles.values()].map(({ id, ownerId, heroId, x, y, vx, vy, radius, color, kind, type, emoji, rotateToAim, flashColors, flashIntervalMs, shape, sourceAbility, createdAt, lifetimeMs, fadeLastFraction }) => ({
        id,
        ownerId,
        heroId,
        kind,
        type, emoji, rotateToAim, flashColors, flashIntervalMs, shape, sourceAbility, createdAt, lifetimeMs, fadeLastFraction,
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
      if (player.downed) continue;
      const dx = Number(player.keys.right) - Number(player.keys.left);
      const dy = Number(player.keys.down) - Number(player.keys.up);
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        const burst = player.controlledBurst && player.controlledBurst.until > now ? player.controlledBurst.speedMultiplier : 1;
        const step = player.hero.speed * burst / ARENA_CONFIG.tickHz;
        const oldX = player.x, oldY = player.y;
        player.x = clamp(player.x + (dx / length) * step, ARENA_CONFIG.radius, ARENA_CONFIG.width - ARENA_CONFIG.radius);
        player.y = clamp(player.y + (dy / length) * step, ARENA_CONFIG.radius, ARENA_CONFIG.height - ARENA_CONFIG.radius);
        const distance = Math.hypot(player.x - oldX, player.y - oldY);
        if (distance > 0) player.momentumSamples.push({ at: now, distance });
      }
      const cutoff = now - GAME_CONFIG.arenaTuning.momentum.windowMs;
      while (player.momentumSamples.length && player.momentumSamples[0].at < cutoff) player.momentumSamples.shift();
      const distanceInWindow = player.momentumSamples.reduce((total, sample) => total + sample.distance, 0);
      player.momentumActive = distanceInWindow >= GAME_CONFIG.arenaTuning.momentum.distancePx;
      if (player.momentumActive && !player.momentumReadySent) {
        player.momentumReadySent = true;
        nsp.emit('momentum_ready', { playerId: player.id, bonus: GAME_CONFIG.arenaTuning.momentum.bonus });
      }
    }

    // 2. Start the next wave after its five-second break and spawn its enemies.
    if (players.size > 0 && !gameEnded && waveNumber === 0) startWave(now);
    if (players.size > 0 && !gameEnded && nextWaveAt && now >= nextWaveAt) startWave(now);
    if (players.size > 0 && !gameEnded && enemiesLeftToSpawn > 0 && now >= nextEnemyAt) scheduleSpawn(now);
    for (let i = spawnTelegraphs.length - 1; i >= 0; i--) {
      if (now < spawnTelegraphs[i].spawnAt) continue;
      if (spawnEnemy(spawnTelegraphs[i], now)) spawnTelegraphs.splice(i, 1);
    }

    // 3. Zombies chase the campfire; devils chase the closest living player.
    for (const player of players.values()) {
      if (player.downed) continue;
      syncHeroAimAndPosition(player);
      if(player.heroId==='guardian' && player.hero.dashingUntil>now) player.hero.makeInvulnerable(player.hero.dashingUntil-now,now);
      if (player.controlledBurst) {
        if (now >= player.controlledBurst.until) player.controlledBurst = null;
        else {
          player.hero.makeInvulnerable(player.controlledBurst.until - now, now);
          const dash = player.controlledBurst;
          for (const monster of [...monsters.values()]) {
            const lastHit = dash.lastHitAt.get(monster.id) ?? Number.NEGATIVE_INFINITY;
            if (now - lastHit < GAME_CONFIG.arenaTuning.heroTweaks.guardianRepeatHitCooldownMs
              || Math.hypot(monster.x - player.x, monster.y - player.y) > monster.radius + ARENA_CONFIG.radius + 8) continue;
            dash.lastHitAt.set(monster.id, now);
            damageMonster(monster, player.hero.attack * dash.damageMultiplier, { ownerId: player.id, sourceAbility: 'skill' });
            pushFromDash(monster, player, now);
          }
        }
      }
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
            pushFromDash(monster, player, now);
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
          const lastHitAt = player.hero.lastChargeHit.get(monster.id) ?? Number.NEGATIVE_INFINITY;
          if (now - lastHitAt < GAME_CONFIG.arenaTuning.heroTweaks.guardianRepeatHitCooldownMs) continue;
          player.hero.lastChargeHit.set(monster.id,now);
          damageMonster(monster,player.hero.attack*player.hero.spec.charge.damageMultiplier,{ownerId:player.id,sourceAbility:'ultimate'});
          pushFromDash(monster, player, now);
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
      if (monster.dashPush) {
        const progress = Math.min(1, (now - monster.dashPush.startedAt) / monster.dashPush.durationMs);
        const eased = 1 - (1 - progress) * (1 - progress);
        const step = eased - monster.dashPush.lastProgress;
        monster.x += monster.dashPush.x * step;
        monster.y += monster.dashPush.y * step;
        monster.dashPush.lastProgress = eased;
        if (progress >= 1) monster.dashPush = null;
      }
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
        const hpBefore = campfire.hp;
        monster.update(dt, campfire, now);
        if (campfire.hp < hpBefore) pendingCampfireDamage += hpBefore - campfire.hp;
      }
    }

    if (pendingCampfireDamage > 0 && now - lastCampfireFeedbackAt >= GAME_CONFIG.arenaTuning.campfire.alertCooldownMs) {
      nsp.emit('campfire_hit', { x: campfire.x, y: campfire.y, damage: pendingCampfireDamage });
      pendingCampfireDamage = 0;
      lastCampfireFeedbackAt = now;
    }

    for (const player of players.values()) {
      if (Math.hypot(player.x-campfire.x,player.y-campfire.y) <= GAME_CONFIG.campfire.healingRadius) {
        player.hero.heal(player.hero.maxHp * GAME_CONFIG.campfire.healingPerSecondPercent * dt);
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
          if (!proj.areaVisualSent) {
            proj.areaVisualSent = true;
            nsp.emit('area_effect',{x:proj.x,y:proj.y,radius:proj.explosionRadius,kind:'player',telegraphMs:0,
              color:GAME_CONFIG.heroFxColors[proj.heroId]?.primary,sourceAbility:'skill'});
          }
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
            damage: finisher ? proj.trap.finisherDamage : proj.trap.damage, ownerId: proj.ownerId, sourceAbility: 'skill',
            color: GAME_CONFIG.heroFxColors.bubbles.primary, finisher }, now);
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
      if(effect.type==='bomb-marker' && now>=effect.at && !effect.telegraphSent) {
        effect.telegraphSent = true;
        nsp.emit('area_telegraph', { x: effect.x, y: effect.y, radius: effect.radius, kind: 'player', telegraphMs: effect.telegraphMs, sourceAbility: effect.sourceAbility });
      }
      if(effect.type==='bomb-marker' && now>=effect.explodeAt){explode({...effect,type:'explosion',sourceAbility:'ultimate'},now);timedEffects.splice(i,1);}
      else if(effect.type!=='bomb-marker' && now>=effect.at){explode(effect,now);timedEffects.splice(i,1);}
    }

    if (buffVote && now >= buffVote.endsAt) finishBuffVote(now);

    if (!gameEnded) for (const player of players.values()) {
      if (!player.downed && player.hero.hp <= 0) downPlayer(player, now);
      if (!player.downed) continue;
      const teammateHelping = !player.respawnSolo && [...players.values()].some((teammate) => teammate.id !== player.id
        && !teammate.downed && teammate.hero.hp > 0
        && Math.hypot(teammate.x - campfire.x, teammate.y - campfire.y) <= GAME_CONFIG.arenaTuning.campfire.healRadius);
      player.respawnSpeedMultiplier = teammateHelping ? GAME_CONFIG.arenaTuning.respawn.teammateSpeedMultiplier : 1;
      player.respawnRemainingMs = Math.max(0, player.respawnRemainingMs - dt * 1000 * player.respawnSpeedMultiplier);
      if (player.respawnRemainingMs <= 0) respawnPlayer(player, now);
    }

    if (!gameEnded && campfire.hp <= 0) {
      gameEnded=true; campfire.hp=0; nextWaveAt=0; enemiesLeftToSpawn=0; spawnTelegraphs.length = 0;
      if (pendingCampfireDamage > 0) {
        nsp.emit('campfire_hit', { x: campfire.x, y: campfire.y, damage: pendingCampfireDamage });
        pendingCampfireDamage = 0;
      }
      for(const player of players.values()) nsp.to(player.id).emit('game_over',{reason:'campfire'});
    }
    if (buffVote && players.size > 0 && [...players.keys()].every((id) => buffVotes.has(id))) finishBuffVote(now);
    if (players.size === 0 && waveNumber > 0) resetGame();

    // 8. Start a five-second break only after every enemy in the wave is gone.
    if (
      players.size > 0 && !gameEnded && !buffVote && waveNumber > 0 && enemiesLeftToSpawn === 0 && spawnTelegraphs.length === 0
      && monsters.size === 0 && nextWaveAt === 0
    ) {
      beginBuffVote(now);
    }

    broadcastState(now);
  }, 1000 / ARENA_CONFIG.tickHz);

  return { stop: () => clearInterval(loop), players, projectiles, monsters, campfire };
}

module.exports = { attachHeroLab, ARENA_CONFIG, W: ARENA_CONFIG };
