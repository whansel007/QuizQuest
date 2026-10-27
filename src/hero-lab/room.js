const { HERO_CLASSES } = require('../../public/hero-lab/hero-list.js');
const { GAME_CONFIG } = require('../../public/hero-lab/game-config.js');
const {
  RESPAWN_RING_MIN, RESPAWN_RING_MAX, RESPAWN_MIN_SEPARATION, RESPAWN_CANDIDATE_ATTEMPTS,
  ROOM_MAX_PLAYERS, RECONNECT_GRACE_S, LOBBY_LATE_JOIN, LATE_JOIN_MAX_WAVE, LATE_JOIN_INVULNERABILITY_S,
  COUNTDOWN_S, DUMMY_TOTAL, DUMMY_CLUSTER_MIN, DUMMY_CLUSTER_MAX, DUMMY_SPACING_MIN, DUMMY_SPACING_MAX,
  DUMMY_CLUSTER_DIAMETER_MAX,
  DUMMY_MIN_HERO_DISTANCE, DUMMY_EMOJI, DUMMY_SCALE, DUMMY_HP, DUMMY_RADIUS, DUMMY_KNOCKBACK_MULT, DUMMY_FRICTION,
  DUMMY_RESPAWN_S, DUMMY_FADE_MS, PERF_TICK_HISTORY, LOG_DEBUG,
} = require('../../config/tuning.js');
const { Projectile } = require('../../public/hero-lab/bases/projectile.js');
const { Zombie } = require('../../public/hero-lab/enemies/zombie.js');
const { Devil } = require('../../public/hero-lab/enemies/devil.js');
const { Skeleton } = require('../../public/hero-lab/enemies/skeleton.js');
const { EnemyProjectile } = require('../../public/hero-lab/projectiles/enemy-projectile.js');
const { Brute, Exploder, BruteKing } = require('../../public/hero-lab/enemies/special.js');

const ARENA_CONFIG = {
  width: GAME_CONFIG.arena.width,
  height: GAME_CONFIG.arena.height,
  radius: GAME_CONFIG.arena.playerRadius,
  tickHz: GAME_CONFIG.arena.tickHz,
};
const MOVEMENT_KEYS = ['up', 'down', 'left', 'right'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function createRoom({ io, services = null, id, code = null, isDefault = false, log = console.log }) {
  // Every broadcast below goes through a room-scoped operator, so an event can
  // never reach a socket that belongs to another room. Private messages use
  // `direct.to(socketId)`, which is safe because a socket lives in one room.
  const nsp = io.of('/hero-lab').to(id);
  const heroLabNamespace = io.of('/hero-lab');
  const direct = io.of('/hero-lab');
  const createdAt = Date.now();

  const players = new Map();
  const projectiles = new Map();
  const monsters = new Map();
  const pickups = new Map();
  const traps = new Map();
  const timedEffects = [];
  const spawnTelegraphs = [];
  const pendingChains = [];
  const pendingChainCasts = new Map();
  const buffVotes = new Map();
  const campfireBonuses = new Map();
  let lastCampfireFeedbackAt = Number.NEGATIVE_INFINITY;
  let pendingCampfireDamage = 0;
  const runBuffs = [];
  let spawnQueue = [];
  let activeTwist = null;
  let partyKillCount = 0;
  let secondWindUsed = false;
  // Maintained incrementally (see spawnDummies/damageDummy) so enemyCount()
  // never re-scans the monster map.
  let liveDummyCount = 0;

  let projectileCounter = 0;
  let monsterSeq = 0;
  let chainCastCounter = 0;

  // Per-tick event batching: hit and kill events are collected during the tick
  // and flushed once at the end, so a 40-kill explosion costs two messages
  // instead of eighty. Arrays are reused (length = 0) to avoid per-tick allocs.
  let pendingHits = [];
  let pendingKills = [];
  let inTick = false;
  function queueHit(payload) {
    pendingHits.push(payload);
    if (!inTick) flushKillEvents();
  }
  function queueKill(payload) {
    pendingKills.push(payload);
    if (!inTick) flushKillEvents();
  }
  function flushKillEvents() {
    // Kills are flushed before hits so the client's mass-kill window (opened by
    // the kill batch) is already active when the matching hit batch arrives -
    // that lets the client skip per-hit sparks for the whole burst.
    if (pendingKills.length > 0) {
      nsp.emit('monster_killed', pendingKills.length === 1 ? pendingKills[0] : pendingKills);
      pendingKills = [];
    }
    if (pendingHits.length > 0) {
      nsp.emit('hit', pendingHits.length === 1 ? pendingHits[0] : pendingHits);
      pendingHits = [];
    }
  }

  let waveNumber = 0;
  let enemiesLeftToSpawn = 0;
  let enemiesSpawnedThisWave = 0;
  let nextEnemyAt = 0;
  let nextWaveAt = 0;
  // Between-wave break phase: 'rest' | 'vote' | 'ready' | 'dawn' | null.
  // Each phase has its own deadline so voting never eats into the rest.
  let breakPhase = null;
  let breakPhaseEndsAt = 0;
  let gameEnded = false;
  let buffVote = null;
  let lastBuff = null;
  let dawnWave = 0;
  let dawnPending = new Set();
  // Players who joined after the run started wait here until the next break.
  const waiting = new Map();
  let hostId = null;
  // 'lobby' -> 'countdown' -> 'running' -> back to 'lobby' when the run ends.
  let phase = 'lobby';
  let countdownEndsAt = 0;
  let nextDummySpawnAt = 0;
  let wavesCleared = 0;
  const { enemySpawnIntervalMs: ENEMY_SPAWN_INTERVAL_MS } = GAME_CONFIG.waves;
  const BREAK = GAME_CONFIG.breakPhases;

  const campfire = {
    x: ARENA_CONFIG.width / 2,
    y: ARENA_CONFIG.height / 2,
    radius: GAME_CONFIG.campfire.radius,
    hp: GAME_CONFIG.campfire.hp,
    maxHp: GAME_CONFIG.campfire.hp,
  };

  function resetGame() {
    projectiles.clear();
    monsters.clear(); liveDummyCount = 0;
    pickups.clear();
    traps.clear();
    timedEffects.length = 0;
    spawnTelegraphs.length = 0;
    pendingChains.length = 0;
    pendingChainCasts.clear();
    buffVotes.clear();
    buffVote = null;
    lastBuff = null;
    dawnWave = 0;
    dawnPending.clear();
    breakPhase = null;
    breakPhaseEndsAt = 0;
    wavesCleared = 0;
    runBuffs.length = 0;
    spawnQueue = [];
    activeTwist = null;
    partyKillCount = 0;
    secondWindUsed = false;
    lastCampfireFeedbackAt = Number.NEGATIVE_INFINITY;
    pendingCampfireDamage = 0;
    gameEnded = false;
    setPhase('lobby');
    campfireBonuses.clear();
    campfire.maxHp = GAME_CONFIG.campfire.hp;
    campfire.hp = campfire.maxHp;
    // A reset with heroes still in the room (Stage 3 lobby) keeps their Garden
    // bonuses; an empty room falls back to the base campfire.
    if (players.size > 0) recomputeCampfire();
    waveNumber = 0;
    enemiesLeftToSpawn = 0;
    enemiesSpawnedThisWave = 0;
    nextEnemyAt = 0;
    nextWaveAt = 0;
    breakPhase = null;
    breakPhaseEndsAt = 0;
    countdownEndsAt = 0;
    nextDummySpawnAt = 0;
  }

  // --- Lobby / countdown / run ---------------------------------------------
  // `phase` is the only thing that decides what the tick simulates:
  //   lobby      heroes walk, shoot the dummy, swap heroes; nothing can die
  //   countdown  dummy fades, START is locked, 3-2-1 runs
  //   running    the wave loop below
  function beginCountdown(now) {
    if (phase !== 'lobby' || players.size === 0) return false;
    setPhase('countdown');
    countdownEndsAt = now + COUNTDOWN_S * 1000;
    // The dummy is a lobby toy; it fades out as the countdown starts.
    for (const monster of monsters.values()) {
      if (monster.isDummy) monster.fadeStartedAt = now;
    }
    for (const player of players.values()) {
      player.keys = {};
      player.primaryHeld = false;
      player.dawnWaiting = false;
    }
    nsp.emit('countdown', { seconds: COUNTDOWN_S, endsAt: countdownEndsAt });
    broadcastState(now);
    return true;
  }

  function startRun(now) {
    setPhase('running');
    countdownEndsAt = 0;
    monsters.clear(); liveDummyCount = 0;
    for (const player of players.values()) {
      player.hero.hp = player.hero.maxHp;
      player.hero.invulnerableUntil = 0;
      for (const cooldown of Object.values(player.hero.cooldowns)) cooldown.readyAt = now;
      player.downed = false;
      player.dawnWaiting = false;
      player.respawnRemainingMs = 0;
      player.keys = {};
      player.primaryHeld = false;
      player.bubbleRush = null;
      player.dashState = null;
      player.controlledBurst = null;
    }
    campfire.hp = campfire.maxHp;
    waveNumber = 0;
    nsp.emit('run_started', { wave: 1 });
    startWave(now);
    broadcastState(now);
  }

  // Ends a run without kicking anyone out: every hero is rebuilt at full
  // health on the ring and the room returns to its lobby.
  function resetRunToLobby(now) {
    resetGame();
    for (const player of players.values()) {
      player.hero = buildHero(player.heroId, player.user);
      player.name = player.hero.name;
      player.emoji = player.hero.emoji;
      player.kills = 0;
      player.damageDealt = 0;
      player.bonusDamage = 0;
      player.wavesParticipated = 0;
      player.wavesReached = 0;
      player.overchargeShots = 0;
      player.sheriffDynamiteReady = true;
      player.pilotMechReady = true;
      player.sheriffBlastRefunds.clear();
      player.momentumSamples.length = 0;
      player.momentumActive = false;
      player.momentumReadySent = false;
      player.respawnSolo = false;
      player.downed = false;
      player.dawnWaiting = false;
      player.respawnRemainingMs = 0;
      player.respawnSpeedMultiplier = 1;
      player.bubbleRush = null;
      player.dashState = null;
      player.controlledBurst = null;
      player.keys = {};
      player.primaryHeld = false;
      player.hero.hp = player.hero.maxHp;
      for (const cooldown of Object.values(player.hero.cooldowns)) cooldown.readyAt = now;
      const point = chooseRespawnPoint(player.id);
      player.x = point.x;
      player.y = point.y;
      player.hero.position = { ...point };
    }
    recomputeCampfire();
    campfire.hp = campfire.maxHp;
    nextDummySpawnAt = 0;
    spawnDummies(now);
    log(`[Hero Lab] ${id} returned to lobby`);
    broadcastState(now);
  }

  // --- Training dummies -----------------------------------------------------
  // liveDummyCount is maintained incrementally so enemyCount() stays O(1)
  // instead of re-scanning the monster map every tick (spec 2F).
  function spawnDummies(now) {
    if (phase !== 'lobby') return;
    const existing = liveDummyCount;
    const needed = Math.max(0, DUMMY_TOTAL - existing);
    if (needed === 0) return;

    // Build a set of valid points for the missing dummies. We generate the
    // whole cluster together so we can enforce spacing between dummies (≥
    // DUMMY_SPACING_MIN, ≤ DUMMY_SPACING_MAX from at least one neighbour) and
    // keep every dummy inside the cluster ring around the campfire.
    const living = [...players.values()].filter((player) => !player.downed && !player.disconnected);
    const current = [...monsters.values()].filter((m) => m.isDummy && !m.dead && !m.fadeStartedAt);
    const newPoints = [];

    for (let n = 0; n < needed; n++) {
      let point = null;
      for (let attempt = 0; attempt < RESPAWN_CANDIDATE_ATTEMPTS; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = DUMMY_CLUSTER_MIN + Math.random() * (DUMMY_CLUSTER_MAX - DUMMY_CLUSTER_MIN);
        const candidate = { x: campfire.x + Math.cos(angle) * radius, y: campfire.y + Math.sin(angle) * radius };
        if (candidate.x < DUMMY_RADIUS || candidate.x > ARENA_CONFIG.width - DUMMY_RADIUS
          || candidate.y < DUMMY_RADIUS || candidate.y > ARENA_CONFIG.height - DUMMY_RADIUS) continue;

        // Keep away from heroes.
        const nearestHero = living.length
          ? Math.min(...living.map((player) => Math.hypot(player.x - candidate.x, player.y - candidate.y)))
          : Number.POSITIVE_INFINITY;
        if (nearestHero < DUMMY_MIN_HERO_DISTANCE) continue;

        // Keep away from existing and already-chosen dummies.
        const allOthers = [...current, ...newPoints];
        const nearestDummy = allOthers.length
          ? Math.min(...allOthers.map((other) => Math.hypot(other.x - candidate.x, other.y - candidate.y)))
          : Number.POSITIVE_INFINITY;
        if (nearestDummy < DUMMY_SPACING_MIN) continue;

        // For cluster cohesion AND chain-lightning reachability: every dummy
        // must be within DUMMY_CLUSTER_DIAMETER_MAX of ALL other dummies. The
        // Electromancer chain hops at most 220 px between targets, so a cluster
        // diameter ≤ 200 guarantees the chain reaches all 4 dummies regardless
        // of the order nearest-neighbour selects them.
        if (allOthers.length > 0) {
          const tooFar = allOthers.some((other) => Math.hypot(other.x - candidate.x, other.y - candidate.y) > DUMMY_CLUSTER_DIAMETER_MAX);
          if (tooFar) continue;
          const hasCloseNeighbour = allOthers.some((other) => Math.hypot(other.x - candidate.x, other.y - candidate.y) <= DUMMY_SPACING_MAX);
          if (!hasCloseNeighbour) continue;
        }

        point = candidate;
        break;
      }
      if (!point && newPoints.length > 0) {
        // Fallback: pick a random direction from an existing dummy, clamped to
        // the campfire ring and arena bounds, and within the cluster diameter.
        const anchor = newPoints[Math.floor(Math.random() * newPoints.length)];
        const angle = Math.random() * Math.PI * 2;
        const stepDist = DUMMY_SPACING_MIN + 10 + Math.random() * (DUMMY_CLUSTER_DIAMETER_MAX - DUMMY_SPACING_MIN - 10);
        const fx = clamp(anchor.x + Math.cos(angle) * stepDist, DUMMY_RADIUS, ARENA_CONFIG.width - DUMMY_RADIUS);
        const fy = clamp(anchor.y + Math.sin(angle) * stepDist, DUMMY_RADIUS, ARENA_CONFIG.height - DUMMY_RADIUS);
        // Verify diameter constraint against all existing dummies.
        const allOthers = [...current, ...newPoints];
        const diameterOk = allOthers.every((other) => Math.hypot(other.x - fx, other.y - fy) <= DUMMY_CLUSTER_DIAMETER_MAX);
        const dist = Math.hypot(fx - campfire.x, fy - campfire.y);
        if (diameterOk && dist >= DUMMY_CLUSTER_MIN && dist <= DUMMY_CLUSTER_MAX) {
          point = { x: fx, y: fy };
        } else {
          // Project onto the ring at the same angle, tight to the anchor.
          const a = Math.atan2(fy - campfire.y, fx - campfire.x);
          const r = Math.max(DUMMY_CLUSTER_MIN, Math.min(DUMMY_CLUSTER_MAX, dist));
          const px = clamp(campfire.x + Math.cos(a) * r, DUMMY_RADIUS, ARENA_CONFIG.width - DUMMY_RADIUS);
          const py = clamp(campfire.y + Math.sin(a) * r, DUMMY_RADIUS, ARENA_CONFIG.height - DUMMY_RADIUS);
          const diameterOk2 = allOthers.every((other) => Math.hypot(other.x - px, other.y - py) <= DUMMY_CLUSTER_DIAMETER_MAX);
          if (diameterOk2) {
            point = { x: px, y: py };
          }
        }
      }
      if (!point) {
        // Last-resort: place deterministically near the first dummy so the
        // cluster diameter stays under DUMMY_CLUSTER_DIAMETER_MAX. If there is
        // no existing dummy (first one), drop it on the campfire ring; otherwise
        // spread around the first placed dummy on a small circle.
        const anchor = newPoints.length > 0 ? newPoints[0]
          : { x: campfire.x + Math.cos(Math.random() * Math.PI * 2) * (DUMMY_CLUSTER_MIN + DUMMY_CLUSTER_MAX) / 2,
              y: campfire.y + Math.sin(Math.random() * Math.PI * 2) * (DUMMY_CLUSTER_MIN + DUMMY_CLUSTER_MAX) / 2 };
        const spread = DUMMY_SPACING_MIN + 20;
        const a = (n) * (Math.PI * 2 / Math.max(1, needed));
        point = {
          x: clamp(anchor.x + Math.cos(a) * spread, DUMMY_RADIUS, ARENA_CONFIG.width - DUMMY_RADIUS),
          y: clamp(anchor.y + Math.sin(a) * spread, DUMMY_RADIUS, ARENA_CONFIG.height - DUMMY_RADIUS),
        };
      }
      newPoints.push(point);
    }

    for (const point of newPoints) {
      const dummy = {
        id: `dummy_${++monsterSeq}`,
        x: point.x,
        y: point.y,
        radius: DUMMY_RADIUS,
        hp: DUMMY_HP,
        maxHp: DUMMY_HP,
        emoji: DUMMY_EMOJI,
        type: 'dummy',
        scale: DUMMY_SCALE,
        damage: 0,
        speed: 0,
        dead: false,
        isDummy: true,
        isBoss: false,
        isElite: false,
        knockbackX: 0,
        knockbackY: 0,
        stunnedUntil: 0,
        trappedBy: null,
        takeDamage(amount) {
          if (!Number.isFinite(amount) || amount <= 0 || this.dead) return 0;
          const before = this.hp;
          this.hp = Math.max(0, this.hp - amount);
          if (this.hp <= 0) this.dead = true;
          return before - this.hp;
        },
      };
      monsters.set(dummy.id, dummy);
      liveDummyCount += 1;
    }
  }

  // Obsolete: spawnDummies now generates the full cluster internally.
  function chooseDummySpawnPoint() { return null; }

  // Dummy damage: same hit feedback as an enemy, no kills, no combo, no stats.
  function damageDummy(dummy, amount, source) {
    const damage = dummy.takeDamage(amount);
    const owner = players.get(source.ownerId);
    if (damage > 0) {
      nsp.emit('hit', { type: 'dummy', id: dummy.id, x: dummy.x, y: dummy.y, damage,
        sourceId: source.ownerId, heroId: owner?.heroId || null, sourceAbility: source.sourceAbility || 'weapon',
        bonus: false, sourceX: owner?.x, sourceY: owner?.y, enemyType: 'dummy', boss: false, elite: false });
    }
    if (dummy.dead) {
      monsters.delete(dummy.id);
      liveDummyCount -= 1;
      // A broken dummy counts as a kill for kill-triggered TALENTS only: no
      // kill count, combo, reward or wave progress.
      applyKillTalents(owner, source);
      nsp.emit('dummy_broken', { id: dummy.id, x: dummy.x, y: dummy.y, emoji: DUMMY_EMOJI });
      nextDummySpawnAt = Date.now() + DUMMY_RESPAWN_S * 1000;
    }
    return damage;
  }

  // Physics for the lobby target: knockback with its own friction, body shoves
  // from heroes, and a hard clamp to the arena.
  function updateDummies(dt, now) {
    for (const dummy of [...monsters.values()]) {
      if (!dummy.isDummy) continue;
      if (dummy.fadeStartedAt && now - dummy.fadeStartedAt >= DUMMY_FADE_MS) { monsters.delete(dummy.id); liveDummyCount -= 1; continue; }
      for (const player of players.values()) {
        if (player.downed || player.disconnected) continue;
        const dx = dummy.x - player.x, dy = dummy.y - player.y;
        const distance = Math.hypot(dx, dy);
        const minimum = dummy.radius + ARENA_CONFIG.radius;
        if (distance <= 0 || distance >= minimum) continue;
        const push = (minimum - distance) * 0.5;
        dummy.x += (dx / distance) * push;
        dummy.y += (dy / distance) * push;
        dummy.knockbackX += (dx / distance) * push * 8;
        dummy.knockbackY += (dy / distance) * push * 8;
      }
      if (dummy.knockbackX || dummy.knockbackY) {
        dummy.x += dummy.knockbackX * dt;
        dummy.y += dummy.knockbackY * dt;
        dummy.knockbackX *= DUMMY_FRICTION;
        dummy.knockbackY *= DUMMY_FRICTION;
        if (Math.abs(dummy.knockbackX) < 1) dummy.knockbackX = 0;
        if (Math.abs(dummy.knockbackY) < 1) dummy.knockbackY = 0;
      }
      dummy.x = clamp(dummy.x, dummy.radius, ARENA_CONFIG.width - dummy.radius);
      dummy.y = clamp(dummy.y, dummy.radius, ARENA_CONFIG.height - dummy.radius);
    }
  }

  function dummyCount() {
    return liveDummyCount;
  }

  function enemyCount() {
    return monsters.size - dummyCount();
  }

  function startWave(now) {
    if (gameEnded) return;
    waveNumber += 1;
    setPhase('running');
    for (const player of players.values()) player.wavesReached = waveNumber;
    const tuning = GAME_CONFIG.arenaTuning.enemies;
    const bossWave = waveNumber % tuning.bruteKing.everyWaves === 0;
    activeTwist = !bossWave && waveNumber % GAME_CONFIG.arenaTuning.waveTwists.everyWaves === 0
      ? [{ id: 'horde', label: 'HORDE' }, { id: 'fast-night', label: 'FAST NIGHT' }, { id: 'supply-drop', label: 'SUPPLY DROP' }][Math.floor(Math.random() * 3)]
      : null;
    nsp.emit('wave_start', { wave: waveNumber, bossWave });
    if (activeTwist) nsp.emit('wave_twist', activeTwist);
    let count = Math.round((tuning.wave.baseCount + tuning.wave.countPerWave * waveNumber)
      * (1 + tuning.wave.countPerAdditionalPlayer * Math.max(0, players.size - 1)));
    if (activeTwist?.id === 'horde') count *= GAME_CONFIG.arenaTuning.waveTwists.hordeCountMultiplier;
    spawnQueue = [];
    for (let i = 1; i <= count; i++) {
      let type = 'zombie';
      if (waveNumber >= tuning.exploder.firstWave && i % 11 === 0) type = 'exploder';
      else if (waveNumber >= tuning.brute.firstWave && i % 4 === 0) type = 'brute';
      else if (i % GAME_CONFIG.waves.skeletonEveryEnemies === 0) type = 'skeleton';
      else if (i % GAME_CONFIG.waves.devilEveryEnemies === 0) type = 'devil';
      spawnQueue.push(type);
    }
    if (bossWave) spawnQueue.push('brute-king', ...Array(tuning.bruteKing.escorts).fill('zombie'));
    enemiesLeftToSpawn = spawnQueue.length;
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
    const cap = Math.round(GAME_CONFIG.arenaTuning.enemies.wave.soloCap
      + (GAME_CONFIG.arenaTuning.enemies.wave.fourPlayerCap - GAME_CONFIG.arenaTuning.enemies.wave.soloCap)
      * Math.max(0, players.size - 1) / 3);
    if (!spawnQueue.length || monsters.size + spawnTelegraphs.length >= cap) return;
    monsterSeq += 1;
    const type = spawnQueue.shift();
    enemiesSpawnedThisWave += 1;
    const point = chooseSpawnLocation();
    const spawnAt = now + GAME_CONFIG.arenaTuning.briefing.spawnTelegraphMs;
    const marker = { id: `spawn_${monsterSeq}`, ...point, startedAt: now, spawnAt, typeIndex: enemiesSpawnedThisWave, type };
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

    const classes = { zombie: Zombie, skeleton: Skeleton, devil: Devil, brute: Brute, exploder: Exploder, 'brute-king': BruteKing };
    const EnemyClass = classes[marker.type] || Zombie;
    const nowAtSpawn = now;
    let monster = new EnemyClass({ id: `enemy_${monsterSeq}`, x: marker.x, y: marker.y, now: nowAtSpawn });
    const hpScale = (1 + GAME_CONFIG.arenaTuning.enemies.wave.hpPerWave * waveNumber)
      * (activeTwist?.id === 'horde' ? GAME_CONFIG.arenaTuning.waveTwists.hordeHpMultiplier : 1);
    if (marker.type === 'brute-king') {
      const bossIndex = waveNumber / GAME_CONFIG.arenaTuning.enemies.bruteKing.everyWaves - 1;
      monster.maxHp = GAME_CONFIG.arenaTuning.enemies.bruteKing.firstHp
        * (1 + GAME_CONFIG.arenaTuning.enemies.bruteKing.laterHpMultiplier) ** bossIndex;
      monster.hp = monster.maxHp;
      nsp.emit('boss_spawn', { id: monster.id, hp: monster.maxHp });
    } else {
      monster.maxHp = Math.round(monster.maxHp * hpScale);
      monster.hp = monster.maxHp;
    }
    monster.damage *= 1 + GAME_CONFIG.arenaTuning.enemies.wave.damagePerWave * waveNumber;
    monster.damageScale = 1 + GAME_CONFIG.arenaTuning.enemies.wave.damagePerWave * waveNumber;
    if (activeTwist?.id === 'fast-night') monster.speed *= 1 + GAME_CONFIG.arenaTuning.waveTwists.fastNightEnemySpeed;
    monster.isBoss = marker.type === 'brute-king';
    monster.isElite = monster.isBoss;

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
    const statCards = [
      { id: 'maxHp', label: 'Vitality', value: GAME_CONFIG.arenaTuning.cards.stat.maxHp, description: `Every hero gains ${GAME_CONFIG.arenaTuning.cards.stat.maxHp * 100}% max HP.` },
      { id: 'attack', label: 'Attack', value: GAME_CONFIG.arenaTuning.cards.stat.attack, description: `Every hero gains ${GAME_CONFIG.arenaTuning.cards.stat.attack * 100}% attack.` },
      { id: 'defense', label: 'Defense', value: GAME_CONFIG.arenaTuning.cards.stat.defense * 100, description: `Every hero gains ${GAME_CONFIG.arenaTuning.cards.stat.defense * 100} percentage points of damage reduction.` },
      { id: 'speed', label: 'Fleet Footed', value: GAME_CONFIG.arenaTuning.cards.stat.speed, description: `Every hero gains ${GAME_CONFIG.arenaTuning.cards.stat.speed * 100}% speed.` },
      { id: 'campfire', label: 'Campfire Heart', value: GAME_CONFIG.arenaTuning.cards.stat.campfireHp, description: `Campfire max HP +${GAME_CONFIG.arenaTuning.cards.stat.campfireHp * 100}%, and its HP rises by the same amount.` },
    ];
    const effectCards = [
      ['thorns', 'Thorns Fire', `Campfire deals ${GAME_CONFIG.arenaTuning.cards.effects.thornsDamagePerSecond} damage/s within ${GAME_CONFIG.arenaTuning.cards.effects.thornsRadius} px.`],
      ['scavenger', 'Scavenger', `${GAME_CONFIG.arenaTuning.cards.effects.scavengerDropChance * 100}% of kills drop a heart that heals ${GAME_CONFIG.arenaTuning.cards.effects.scavengerHeal} HP.`],
      ['overcharge', 'Overcharge', `Every ${GAME_CONFIG.arenaTuning.cards.effects.overchargeEveryShots}th primary shot deals x${GAME_CONFIG.arenaTuning.cards.effects.overchargeMultiplier} damage.`],
      ['rally', 'Rally', `Ultimate cooldowns are reduced by ${GAME_CONFIG.arenaTuning.cards.effects.rallyCooldownReduction * 100}%.`],
      ['glass-cannon', 'Glass Cannon', `Attack +${GAME_CONFIG.arenaTuning.cards.effects.glassCannonAttack * 100}%; max HP ${GAME_CONFIG.arenaTuning.cards.effects.glassCannonMaxHp * 100}%.`],
      ['second-wind', 'Second Wind', `Once this run, campfire revives at ${GAME_CONFIG.arenaTuning.cards.effects.secondWindHp * 100}% HP.`],
      ['life-steal', 'Life Steal', `Heal ${GAME_CONFIG.arenaTuning.cards.effects.lifeStealFraction * 100}% of damage dealt, up to ${GAME_CONFIG.arenaTuning.cards.effects.lifeStealCap} HP per hit.`],
      ['ricochet', 'Ricochet', `Primary shots bounce once within ${GAME_CONFIG.arenaTuning.cards.effects.ricochetRange} px for ${GAME_CONFIG.arenaTuning.cards.effects.ricochetDamageFraction * 100}% damage.`],
      ['volatile', 'Volatile Heroes', `Downed heroes explode for ${GAME_CONFIG.arenaTuning.cards.effects.volatileDamage} damage in ${GAME_CONFIG.arenaTuning.cards.effects.volatileRadius} px.`],
      ['powder-keg', 'Powder Keg', `Enemies explode on death for ${GAME_CONFIG.arenaTuning.cards.effects.powderKegMaxHpFraction * 100}% max HP damage.`],
    ].map(([id, label, description]) => ({ id, label, description, rare: true }));
    const activeEffects = new Set(runBuffs.filter((buff) => buff.rare).map((buff) => buff.id));
    const availableEffects = effectCards.filter((card) => !activeEffects.has(card.id));
    const shouldOfferEffect = waveNumber >= GAME_CONFIG.arenaTuning.cards.firstEffectWave && availableEffects.length > 0;
    const shuffle = (pool) => {
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      return pool;
    };
    const chosenEffects = shouldOfferEffect ? shuffle([...availableEffects]).slice(0, 1) : [];
    const cards = [...chosenEffects, ...shuffle([...statCards]).slice(0, GAME_CONFIG.waveBuffs.cardCount - chosenEffects.length)];
    buffVotes.clear();
    buffVote = { wave: waveNumber, cards, endsAt: players.size === 1 ? 0 : now + GAME_CONFIG.arenaTuning.cards.voteMs };
  }

  function makeRunResult(player, victory, reason) {
    const multiplier = victory ? GAME_CONFIG.arenaTuning.run.victoryRewardMultiplier : GAME_CONFIG.arenaTuning.run.defeatRewardMultiplier;
    // Per-player counters: a late joiner is rewarded for the waves they were
    // actually present for, not for the room's total.
    const participated = player?.wavesParticipated || 0;
    const reached = player?.wavesReached || 0;
    return {
      victory, reason, wavesReached: reached, wavesCleared: participated,
      kills: player?.kills || 0, damageDealt: Math.round(player?.damageDealt || 0),
      bonusDamage: Math.round(player?.bonusDamage || 0),
      attackBonusPercent: Math.round((player?.hero.buildingBonuses?.attackPercent || 0) * 100),
      attackBonusBuilding: player?.hero.type === 'magic' ? 'Library' : 'Workshop',
      campfireBonusPercent: Math.round((player?.hero.buildingBonuses?.campfireMaxHpPercent || 0) * 100),
      towerLevel: player?.hero?.towerLevel || 0,
      towerBonusPercent: Math.round((player?.hero?.towerLevel || 0) * GAME_CONFIG.arenaTuning.tower.bonusPerLevel * 100),
      rewardCoins: Math.round(participated * GAME_CONFIG.arenaTuning.run.coinsPerWave * multiplier),
      nextBossWave: (Math.floor(waveNumber / GAME_CONFIG.arenaTuning.run.bossTeaserWave) + 1) * GAME_CONFIG.arenaTuning.run.bossTeaserWave,
      heroId: player?.heroId || 'sheriff',
    };
  }

  function hasRunEffect(id) { return runBuffs.some((buff) => buff.id === id); }

  function dropPickup(x, y, heal, lifetimeMs, type = 'heart', healFraction = 0) {
    const id = `pickup_${monsterSeq}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    pickups.set(id, { id, x, y, heal, healFraction, type, expiresAt: Date.now() + lifetimeMs });
  }

  function applyRunEffect(card, onlyPlayer = null) {
    const effects = GAME_CONFIG.arenaTuning.cards.effects;
    const targets = onlyPlayer ? [onlyPlayer] : [...players.values()];
    if (card.id === 'rally') for (const { hero } of targets) {
      const cd = hero.cooldowns.ultimate, reduction = effects.rallyCooldownReduction;
      const now = Date.now();
      cd.readyAt = Math.max(now, now + (cd.readyAt - now) * (1 - reduction));
      cd.durationMs *= 1 - reduction;
    }
    // Glass Cannon's stat change is DERIVED: computeHeroStats() reads the active
    // effect card from the run list, so it must not be mutated here as well.
  }

  // Diagnostics helper: empties the current wave so the break can run without
  // waiting for every enemy to spawn. Used by tests and the debug menu.
  function clearWave() {
    monsters.clear(); liveDummyCount = 0;
    spawnTelegraphs.length = 0;
    spawnQueue = [];
    enemiesLeftToSpawn = 0;
    nextEnemyAt = 0;
  }

  function completeWave(now) {
    wavesCleared += 1;
    for (const player of players.values()) player.wavesParticipated = (player.wavesParticipated || 0) + 1;
    const missing = Math.max(0, campfire.maxHp - campfire.hp);
    campfire.hp = Math.min(campfire.maxHp, campfire.hp + missing * GAME_CONFIG.arenaTuning.waveMoments.clearedHealFraction);
    nsp.emit('wave_end', { wave: waveNumber, boss: waveNumber > 0 && waveNumber % GAME_CONFIG.arenaTuning.enemies.bruteKing.everyWaves === 0 });
    // Late joiners enter at the START of the rest phase, so they can vote when
    // it opens and are ready for the next wave.
    spawnWaitingPlayers(now);
    activeTwist = null;
    // The break now runs REST -> VOTE -> READY; the vote opens only after the
    // rest is over, so card picking never eats into the players' downtime.
    startRestPhase(now);
  }

  // Dawn milestone: every surviving hero decides whether to continue or leave.
  // Split out so the debug handle can open one without clearing a whole wave.
  function beginMilestone(wave) {
    dawnWave = wave;
    dawnPending = new Set(players.keys());
    for (const player of players.values()) { player.dawnWaiting = true; player.keys = {}; player.primaryHeld = false; }
    nsp.emit('milestone_dawn', { wave, nextWave: wave + 1 });
  }

  // --- Between-wave break: REST -> VOTE -> READY ----------------------------
  // Each phase carries its own deadline, so the vote timer never includes the
  // rest. The tick advances them in order through advanceBreakPhase().
  function setBreakPhase(next, endsAt) {
    breakPhase = next;
    breakPhaseEndsAt = endsAt;
  }

  function startRestPhase(now) {
    const clearedBoss = waveNumber > 0 && waveNumber % GAME_CONFIG.arenaTuning.enemies.bruteKing.everyWaves === 0;
    setBreakPhase('rest', now + (clearedBoss ? BREAK.bossRestMs : BREAK.restMs));
    nextWaveAt = 0;
  }

  // Short pre-wave beat: the next wave banner lands at the end of it.
  function enterReadyPhase(now) {
    setBreakPhase('ready', now + BREAK.readyMs);
    nextWaveAt = now + BREAK.readyMs;
  }

  // Heroes still downed when the vote opens get up immediately: no campfire
  // cost, half HP and the usual 2 s respawn shield.
  function reviveDownedForVote(now) {
    for (const player of players.values()) {
      if (!player.downed) continue;
      respawnPlayer(player, now);
    }
  }

  // Scavenger hearts and Supply Drop orbs left on the ground do not survive
  // the rest phase.
  function clearGroundLoot() { pickups.clear(); }

  function openVote(now) {
    reviveDownedForVote(now);
    beginBuffVote(now);
    setBreakPhase('vote', buffVote && buffVote.endsAt > 0 ? buffVote.endsAt : 0);
  }

  // Everyone who had not decided at the dawn deadline continues by default.
  function autoContinueDawn() {
    for (const player of players.values()) {
      if (!dawnPending.has(player.id)) continue;
      dawnPending.delete(player.id);
      player.dawnWaiting = false;
    }
    dawnWave = 0;
  }

  function advanceBreakPhase(now) {
    if (!breakPhase) return;
    if (breakPhase === 'rest') {
      if (now < breakPhaseEndsAt) return;
      clearGroundLoot();
      if (waveNumber % GAME_CONFIG.arenaTuning.run.milestoneEvery === 0) {
        beginMilestone(waveNumber);
        setBreakPhase('dawn', now + BREAK.dawnDecisionTimeoutMs);
        return;
      }
      openVote(now);
      return;
    }
    if (breakPhase === 'vote') {
      // A solo room has no vote timer (endsAt === 0); it ends as soon as the
      // hero votes, handled by finishBuffVote.
      if (buffVote && buffVote.endsAt > 0 && now >= buffVote.endsAt) finishBuffVote(now);
      return;
    }
    if (breakPhase === 'dawn') {
      if (now < breakPhaseEndsAt) return;
      autoContinueDawn();
      if (players.size > 0) enterReadyPhase(now);
      return;
    }
    if (breakPhase === 'ready' && now >= breakPhaseEndsAt) {
      // Do NOT start the wave here: the existing nextWaveAt gate earlier in the
      // tick already owns that, and calling startWave twice would skip a wave.
      setBreakPhase(null, 0);
    }
  }

  // LOG_DEBUG-only table: per player, the cards taken, Tower multiplier and the
  // final derived stats, printed once per card pick.
  function debugStatsTable() {
    if (!LOG_DEBUG) return;
    const rows = [];
    for (const player of players.values()) {
      const hero = player.hero;
      rows.push({
        player: player.name,
        hero: player.heroId,
        cards: runBuffs.filter((buff) => GAME_CONFIG.towerScaledCards.includes(buff.id)).map((buff) => buff.id).join('+') || '—',
        towerLevel: hero.towerLevel ?? 0,
        towerMult: hero.towerMultiplier ?? 1,
        maxHp: Math.round(hero.maxHp), attack: Math.round(hero.attack * 10) / 10,
        defense: Math.round(hero.defense * 10) / 10, speed: Math.round(hero.speed * 10) / 10,
      });
    }
    console.table(rows);
  }

  function finishBuffVote(now) {
    if (!buffVote) return;
    const counts = new Map(buffVote.cards.map((card) => [card.id, 0]));
    for (const [voterId, vote] of buffVotes) {
      // Votes left behind by a hero who left mid-vote must not decide the card.
      if (!players.has(voterId)) continue;
      if (counts.has(vote)) counts.set(vote, counts.get(vote) + 1);
    }
    const high = Math.max(0, ...counts.values());
    const tied = buffVote.cards.filter((card) => counts.get(card.id) === high);
    const chosen = tied[Math.floor(Math.random() * tied.length)] || buffVote.cards[0];
    if (chosen.id === 'campfire') {
      const addedMax = campfire.maxHp * chosen.value;
      campfire.maxHp += addedMax;
      // The card grants real HP too, not just headroom: the campfire heals by
      // exactly the amount its maximum grew.
      campfire.hp = Math.min(campfire.maxHp, campfire.hp + addedMax);
    }
    lastBuff = { ...chosen };
    // Record the card first, then DERIVE every hero's stats from the list. Each
    // hero scales the four stat cards by its OWN Tower level.
    runBuffs.push({ ...chosen });
    if (chosen.rare) applyRunEffect(chosen); // cooldown effects only; stat effects are derived
    recomputeAllHeroStats(now);
    // Per-card-pick log stays behind the config flag (spec 2F); hot paths
    // (per-kill, per-hit, per-tick) contain no logging at all.
    if (LOG_DEBUG) { console.log(`[Hero Lab] Card picked: ${chosen.label} (${chosen.id})`); debugStatsTable(); }
    buffVote = null; buffVotes.clear();
    enterReadyPhase(now);
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
      if (player.hero.hp <= 0 || player.disconnected) continue;
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
    if (hasRunEffect('volatile')) explode({ x: player.x, y: player.y, radius: GAME_CONFIG.arenaTuning.cards.effects.volatileRadius,
      damage: GAME_CONFIG.arenaTuning.cards.effects.volatileDamage, knockback: GAME_CONFIG.arenaTuning.cards.effects.secondWindKnockback,
      ownerId: player.id, sourceAbility: 'volatile' }, now);
    player.downed = true;
    player.keys = {};
    player.primaryHeld = false;
    if (player.heroId === 'sheriff') {
      player.hero.barrageUntil = now;
      player.hero.ultimateFlashUntil = now;
    } else if (player.heroId === 'guardian') {
      player.hero.chargeUntil = now;
      player.hero.dashingUntil = now;
      player.hero.chargeDamageBonus = 0;
    } else if (player.heroId === 'pilot') {
      player.hero.mechUntil = now;
      player.hero.refreshForm(now);
    }
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

  // Picks a point on the respawn ring around the campfire, keeping distance
  // from living heroes. Shared by respawns and late joins.
  function chooseRespawnPoint(excludeId = null) {
    const livingHeroes = [...players.values()].filter((other) => other.id !== excludeId
      && !other.downed && !other.disconnected && other.hero.hp > 0);
    let selected = null;
    let selectedSeparation = Number.NEGATIVE_INFINITY;
    for (let attempt = 0; attempt < RESPAWN_CANDIDATE_ATTEMPTS; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = RESPAWN_RING_MIN + Math.random() * (RESPAWN_RING_MAX - RESPAWN_RING_MIN);
      const candidate = { x: campfire.x + Math.cos(angle) * radius, y: campfire.y + Math.sin(angle) * radius };
      if (candidate.x < ARENA_CONFIG.radius || candidate.x > ARENA_CONFIG.width - ARENA_CONFIG.radius
        || candidate.y < ARENA_CONFIG.radius || candidate.y > ARENA_CONFIG.height - ARENA_CONFIG.radius) continue;
      const separation = livingHeroes.length
        ? Math.min(...livingHeroes.map((other) => Math.hypot(other.x - candidate.x, other.y - candidate.y)))
        : Number.POSITIVE_INFINITY;
      if (separation > selectedSeparation) {
        selected = candidate;
        selectedSeparation = separation;
      }
      if (separation >= RESPAWN_MIN_SEPARATION) break;
    }
    // There are currently no arena obstacles; all accepted candidates lie on
    // the unobstructed ring and within the fixed arena bounds.
    return selected ?? { x: campfire.x + RESPAWN_RING_MIN, y: campfire.y };
  }

  function respawnPlayer(player, now) {
    player.downed = false;
    player.keys = {};
    const selected = chooseRespawnPoint(player.id);
    player.x = selected.x;
    player.y = selected.y;
    // Re-derive first so the respawn HP fraction uses the current max HP.
    recomputeHeroStats(player, now);
    player.hero.hp = Math.max(1, player.hero.maxHp * GAME_CONFIG.arenaTuning.respawn.respawnHpFraction);
    player.hero.makeInvulnerable(GAME_CONFIG.arenaTuning.respawn.invulnerabilityMs, now);
    player.respawnRemainingMs = 0;
    player.respawnSpeedMultiplier = 1;
    nsp.emit('hero_respawn', { playerId: player.id, x: player.x, y: player.y });
  }

  // Rebuilds campfire max HP from the heroes currently in the room, so a
  // Garden bonus never lingers after its owner leaves.
  function recomputeCampfire() {
    let maxHp = GAME_CONFIG.campfire.hp;
    campfireBonuses.clear();
    for (const player of players.values()) {
      const percent = player.hero.buildingBonuses?.campfireMaxHpPercent || 0;
      if (percent <= 0) continue;
      const bonus = GAME_CONFIG.campfire.hp * percent;
      maxHp += bonus;
      if (player.accountId) campfireBonuses.set(player.accountId, bonus);
    }
    const ratio = campfire.maxHp > 0 ? Math.max(0, Math.min(1, campfire.hp / campfire.maxHp)) : 1;
    campfire.maxHp = maxHp;
    campfire.hp = maxHp * ratio;
  }

  function roomInfo() {
    return { code, phase, hostId, maxPlayers: ROOM_MAX_PLAYERS };
  }

  // Every phase change is logged once, so a session can be replayed from the
  // server log: created -> joined -> waiting -> spawned -> left -> destroyed.
  function setPhase(next) {
    if (phase === next) return;
    const from = phase;
    phase = next;
    log(`[Hero Lab] ${id} phase ${from} -> ${next}`);
  }

  function welcomePayload(socket, isWaiting) {
    return {
      you: socket.id,
      arena: { width: ARENA_CONFIG.width, height: ARENA_CONFIG.height },
      room: roomInfo(),
      waiting: isWaiting,
    };
  }

  // Builds a fresh hero of the given class with the owner's kingdom bonuses.
  // Every entry point (join, hero swap, return to lobby) goes through this so a
  // hero never carries stats from a previous run.
  function buildHero(heroId, user) {
    const HeroClass = HERO_CLASSES[heroId];
    const hero = new HeroClass();
    hero.buildingBonuses = { attackPercent: 0, attackMultiplier: 1, campfireMaxHpPercent: 0 };
    // Raw kingdom levels are kept so computeHeroStats can read the Tower level.
    hero.buildingLevels = { library: 0, workshop: 0, garden: 0, tower: 0 };
    hero.braceUntil = 0;
    hero.chargeDamageBonus = 0;
    hero.ultimateLockoutUntil = 0;
    if (user) {
      const levels = services.kingdomBuildings(user.id);
      for (const [building, buff] of Object.entries(GAME_CONFIG.buildingBuffs)) {
        const level = Math.min(GAME_CONFIG.arenaTuning.buildingBonuses.levelCap, Math.max(0, Math.floor(Number(levels[building]) || 0)));
        hero.buildingLevels[building] = level;
        if (!buff.stat || (buff.type && buff.type !== hero.type)) continue;
        const amount = level * GAME_CONFIG.arenaTuning.buildingBonuses.perLevel;
        if (buff.stat === 'campfireMaxHp') hero.buildingBonuses.campfireMaxHpPercent = amount;
        else hero.buildingBonuses.attackPercent = amount;
      }
    }
    hero.buildingBonuses.attackMultiplier = 1 + hero.buildingBonuses.attackPercent;
    // Do NOT pre-multiply attack here: computeHeroStats() owns the final stat
    // calculation, and base stats stay pristine for every later recompute.
    return hero;
  }

  // --- Derived hero stats ----------------------------------------------------
  // The single source of truth for a hero's final stats. It reads the run's
  // card list (never pre-scaled numbers), the hero's own building levels and the
  // active effect cards, and returns the final values plus the per-stat bonus
  // factors (so Pilot's per-tick refreshForm can re-apply them to its mech form).
  // Order of operations and caps are documented in game-config.js (arenaTuning.tower).
  function computeHeroStats(hero, cardsTaken = runBuffs, buildingLevels = hero.buildingLevels, activeEffects = null) {
    const stat = GAME_CONFIG.arenaTuning.cards.stat;
    const towerCfg = GAME_CONFIG.arenaTuning.tower;
    const scaled = towerCfg.scaledCards;
    const towerLevel = clamp(Math.floor(Number(buildingLevels?.tower) || 0), 0, towerCfg.maxLevel);
    const towerMult = 1 + towerCfg.bonusPerLevel * towerLevel;
    let sumMaxHp = 0, sumAttack = 0, sumDefense = 0, sumSpeed = 0;
    for (const card of cardsTaken) {
      if (!card || !scaled.includes(card.id)) continue;
      if (card.id === 'maxHp') sumMaxHp += card.value;
      else if (card.id === 'attack') sumAttack += card.value;
      else if (card.id === 'defense') sumDefense += card.value;
      else if (card.id === 'speed') sumSpeed += card.value;
    }
    const effects = GAME_CONFIG.arenaTuning.cards.effects;
    const hasGlassCannon = Boolean(activeEffects && activeEffects.has && activeEffects.has('glass-cannon'));
    const gcAttack = hasGlassCannon ? 1 + effects.glassCannonAttack : 1;
    const gcHp = hasGlassCannon ? 1 + effects.glassCannonMaxHp : 1;
    const libWk = 1 + (hero.buildingBonuses?.attackPercent || 0);
    const base = hero.baseStats;
    const maxHpMult = (1 + sumMaxHp * towerMult) * gcHp;
    const attackMult = libWk * (1 + sumAttack * towerMult) * gcAttack;
    const speedMult = 1 + Math.min(stat.speedCap, sumSpeed * towerMult);
    const defenseAdd = sumDefense * towerMult;
    return {
      maxHp: base.maxHp * maxHpMult,
      attack: base.attack * attackMult,
      defense: Math.min(stat.defenseCap * 100, base.defense + defenseAdd),
      speed: base.speed * speedMult,
      towerLevel, towerMult,
      bonus: { maxHpMult, attackMult, speedMult, defenseAdd },
    };
  }

  // Writes computed stats onto a hero, adjusting current HP by the max-HP delta
  // (raise by the same amount on an increase, clamp on a decrease). Pilot keeps
  // its own per-tick form math, so it is handed the bonus factors and refreshed.
  function applyComputedStats(hero, computed, now = Date.now()) {
    const previousMaxHp = hero.maxHp;
    hero.maxHp = computed.maxHp;
    if (hero.maxHp > previousMaxHp) hero.hp += hero.maxHp - previousMaxHp;
    else if (hero.hp > hero.maxHp) hero.hp = hero.maxHp;
    hero.attack = computed.attack;
    hero.defense = computed.defense;
    hero.speed = computed.speed;
    hero.statBonus = computed.bonus;
    hero.towerLevel = computed.towerLevel;
    hero.towerMultiplier = computed.towerMult;
    if (hero.id === 'pilot' && typeof hero.refreshForm === 'function') hero.refreshForm(now);
  }

  function recomputeHeroStats(player, now = Date.now()) {
    if (!player?.hero) return;
    const activeEffects = new Set(runBuffs.filter((buff) => buff.rare).map((buff) => buff.id));
    applyComputedStats(player.hero, computeHeroStats(player.hero, runBuffs, player.hero.buildingLevels, activeEffects), now);
  }

  function recomputeAllHeroStats(now = Date.now()) {
    for (const player of players.values()) recomputeHeroStats(player, now);
  }

  function createPlayer(id, heroId, user, now, spawn) {
    const hero = buildHero(heroId, user);
    hero.position = { ...spawn };
    return {
      id,
      heroId,
      hero,
      user,
      name: hero.name,
      emoji: hero.emoji,
      x: spawn.x,
      y: spawn.y,
      radius: ARENA_CONFIG.radius,
      aim: { x: 1, y: 0 },
      keys: {},
      primaryHeld: false,
      kills: 0,
      damageDealt: 0,
      bonusDamage: 0,
      accountId: user?.id || null,
      bubbleRush: null,
      sheriffDynamiteReady: true,
      pilotMechReady: true,
      sheriffBlastRefunds: new Map(),
      dawnWaiting: false,
      downed: false,
      disconnected: false,
      disconnectAt: 0,
      joinedAt: now,
      wavesParticipated: 0,
      wavesReached: waveNumber,
      momentumSamples: [],
      momentumReadySent: false,
    };
  }

  function spawnPlayer(socketId, heroId, user, now, { lateJoin = false } = {}) {
    // Everyone enters on the respawn ring, which keeps a joining hero away from
    // the campfire and from the heroes already standing there.
    const spawn = chooseRespawnPoint();
    const player = createPlayer(socketId, heroId, user, now, spawn);
    players.set(socketId, player);
    recomputeCampfire();
    // Derive this hero's stats from the shared card list at its OWN Tower level,
    // so a late joiner automatically receives every earlier card (no replay loop).
    recomputeHeroStats(player, now);
    // Cooldown effects (Rally) are not stat-derived, so re-apply them for a late
    // joiner; every other effect is either derived or read live via runBuffs.
    if (lateJoin) for (const buff of runBuffs) if (buff.rare) applyRunEffect(buff, player);
    if (lateJoin) {
      player.hero.hp = player.hero.maxHp;
      player.hero.makeInvulnerable(LATE_JOIN_INVULNERABILITY_S * 1000, now);
      player.wavesParticipated = 0;
      player.wavesReached = waveNumber;
    }
    return player;
  }

  function spawnWaitingPlayers(now) {
    if (!waiting.size) return;
    for (const entry of [...waiting.values()]) {
      waiting.delete(entry.id);
      const player = spawnPlayer(entry.id, entry.heroId, entry.user, now, { lateJoin: true });
      nsp.emit('player_joined', { playerId: player.id, heroId: player.heroId, name: player.name, emoji: player.emoji });
      log(`[Hero Lab] ${player.name} spawned in ${id} at wave ${waveNumber}`);
    }
  }

  // The same account returning inside the grace window takes its hero back
  // instead of entering the waiting list.
  function resumePlayer(socket, player, now) {
    const oldId = player.id;
    players.delete(oldId);
    player.id = socket.id;
    player.disconnected = false;
    player.disconnectAt = 0;
    player.hero.makeInvulnerable(LATE_JOIN_INVULNERABILITY_S * 1000, now);
    players.set(socket.id, player);
    const trap = traps.get(oldId);
    if (trap) { traps.delete(oldId); trap.ownerId = socket.id; traps.set(socket.id, trap); }
    if (buffVotes.has(oldId)) { const vote = buffVotes.get(oldId); buffVotes.delete(oldId); buffVotes.set(socket.id, vote); }
    if (dawnPending.has(oldId)) { dawnPending.delete(oldId); dawnPending.add(socket.id); }
    if (hostId === oldId) hostId = socket.id;
    // Re-derive from the shared card list (idempotent; keeps a reconnect in sync
    // with the player's own Tower level).
    recomputeHeroStats(player, now);
    log(`[Hero Lab] ${player.name} reconnected to ${id}`);
  }

  function migrateHost() {
    // Prefer a hero who is actually connected, then any hero still holding a
    // slot, then a waiting player. Never leave the room without a host while
    // somebody is in it.
    const next = [...players.values()].filter((player) => !player.disconnected)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0]
      || [...players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0]
      || [...waiting.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0]
      || null;
    hostId = next ? next.id : null;
    if (next) nsp.emit('host_changed', { hostId, heroId: next.heroId, name: next.name, emoji: next.emoji });
    log(`[Hero Lab] host is now ${next ? next.name : 'nobody'} in ${id}`);
  }

  function removePlayer(player, now) {
    const wasHost = hostId === player.id;
    players.delete(player.id);
    dawnPending.delete(player.id);
    buffVotes.delete(player.id);
    traps.delete(player.id);
    recomputeCampfire();
    nsp.emit('player_leave', { playerId: player.id, x: player.x, y: player.y, emoji: player.emoji });
    log(`[Hero Lab] ${player.name} left ${id}`);
    if (wasHost) migrateHost();
    if (players.size === 0) {
      // Nobody is left to defend: end the run for anyone still waiting.
      for (const entry of waiting.values()) {
        direct.to(entry.id).emit('run_result', makeRunResult(null, false, 'campfire'));
        direct.to(entry.id).emit('game_over', { reason: 'campfire' });
      }
      waiting.clear();
      gameEnded = false;
      resetGame();
      broadcastState(now);
      stop();
      return;
    }
    if (dawnWave && dawnPending.size === 0) { dawnWave = 0; enterReadyPhase(now); }
    else if (buffVote && [...players.keys()].every((key) => buffVotes.has(key))) finishBuffVote(now);
    broadcastState(now);
  }

  function join(socket, payload) {
    const now = Date.now();
    const heroId = payload?.heroId;
    if (!Object.hasOwn(HERO_CLASSES, heroId)) return { ok: false, code: 'invalid_hero', message: 'Choose a valid hero to join the field.' };
    if (gameEnded) return { ok: false, code: 'ended', message: 'The campfire has gone out. The run is over.' };

    const user = socket.data.user;
    if (user && !services.authenticate(socket.data.token)) {
      socket.disconnect(true);
      return { ok: false, code: 'auth', message: 'Please sign in again.' };
    }

    // Already in this room on this connection: nothing to do.
    if (players.has(socket.id)) {
      socket.emit('welcome', welcomePayload(socket, false));
      return { ok: true, waiting: false };
    }
    if (waiting.has(socket.id)) {
      socket.emit('welcome', welcomePayload(socket, true));
      return { ok: true, waiting: true };
    }

    if (user) {
      const returning = [...players.values()].find((entry) => entry.disconnected && entry.accountId === user.id);
      if (returning) {
        resumePlayer(socket, returning, now);
        socket.emit('welcome', welcomePayload(socket, false));
        nsp.emit('player_reconnected', { playerId: socket.id, heroId: returning.heroId, name: returning.name, emoji: returning.emoji });
        broadcastState(now);
        return { ok: true, waiting: false, resumed: true };
      }
    }

    const full = { ok: false, code: 'full', message: `Room is full (${ROOM_MAX_PLAYERS}/${ROOM_MAX_PLAYERS}).` };
    // Only a running wave makes a newcomer wait; the lobby and the countdown
    // both let them walk straight in.
    const started = phase === 'running' || waveNumber > 0;
    if (started) {
      if (!LOBBY_LATE_JOIN) return { ok: false, code: 'started', message: 'This run has already started.' };
      if (LATE_JOIN_MAX_WAVE > 0 && waveNumber > LATE_JOIN_MAX_WAVE) {
        return { ok: false, code: 'too_late', message: 'This run is too far along to join.' };
      }
      if (players.size + waiting.size >= ROOM_MAX_PLAYERS) return full;
      const WaitingHeroClass = HERO_CLASSES[heroId];
      const hero = new WaitingHeroClass();
      waiting.set(socket.id, {
        id: socket.id, heroId, name: hero.name, emoji: hero.emoji,
        accountId: user?.id || null, user, joinedAt: now,
      });
      socket.emit('welcome', welcomePayload(socket, true));
      nsp.emit('player_waiting', { playerId: socket.id, heroId, name: hero.name, emoji: hero.emoji });
      log(`[Hero Lab] ${hero.name} waiting in ${id} (wave ${waveNumber})`);
      broadcastState(now);
      return { ok: true, waiting: true };
    }

    if (players.size + waiting.size >= ROOM_MAX_PLAYERS) return full;
    if (!hostId) hostId = socket.id;
    const player = spawnPlayer(socket.id, heroId, user, now);
    start();
    log(`[Hero Lab] ${player.name} joined ${id}`);
    if (phase === 'lobby') spawnDummies(now);
    socket.emit('welcome', welcomePayload(socket, false));
    broadcastState(now);
    return { ok: true, waiting: false };
  }

  // The host starts the run from the lobby. Non-hosts are ignored, so a stray
  // or spoofed event can never start somebody else's game.
  function startRunBy(socket) {
    if (socket.id !== hostId) return { ok: false, code: 'not_host' };
    if (phase !== 'lobby') return { ok: false, code: 'wrong_phase' };
    if (players.size === 0) return { ok: false, code: 'empty' };
    return beginCountdown(Date.now()) ? { ok: true } : { ok: false, code: 'wrong_phase' };
  }

  // Lobby-only hero swap. The hero object is rebuilt from scratch, so no stat
  // card or ability state leaks between heroes.
  function swapHero(socket, heroId) {
    if (phase !== 'lobby') return { ok: false, code: 'locked' };
    if (!Object.hasOwn(HERO_CLASSES, heroId)) return { ok: false, code: 'invalid_hero' };
    const now = Date.now();
    const entry = waiting.get(socket.id);
    if (entry) {
      const preview = new HERO_CLASSES[heroId]();
      entry.heroId = heroId;
      entry.name = preview.name;
      entry.emoji = preview.emoji;
      broadcastState(now);
      return { ok: true, waiting: true };
    }
    const player = players.get(socket.id);
    if (!player) return { ok: false, code: 'not_in_room' };
    if (player.heroId === heroId) return { ok: true };
    const hero = buildHero(heroId, player.user);
    hero.position = { x: player.x, y: player.y };
    player.hero = hero;
    player.heroId = heroId;
    player.name = hero.name;
    player.emoji = hero.emoji;
    // Derive the new hero's stats from the run's card list at its own Tower
    // level (a lobby swap normally has an empty list, so this is just base stats).
    recomputeHeroStats(player, now);
    player.hero.hp = player.hero.maxHp;
    for (const cooldown of Object.values(player.hero.cooldowns)) cooldown.readyAt = now;
    player.bubbleRush = null;
    player.dashState = null;
    player.controlledBurst = null;
    player.sheriffDynamiteReady = true;
    player.pilotMechReady = true;
    player.sheriffBlastRefunds.clear();
    recomputeCampfire();
    nsp.emit('hero_swapped', { playerId: player.id, heroId, name: hero.name, emoji: hero.emoji });
    broadcastState(now);
    return { ok: true };
  }

  // Detaches a socket from this room without disconnecting it.
  function releaseSocket(socket) {
    try { socket.leave(id); } catch { /* the socket may already be gone */ }
    socket.data.heroLabRoom = null;
    socket.emit('left_room', { roomId: id });
  }

  function input(socket, input) {
    const player = players.get(socket.id);
    if (!player || player.downed || player.dawnWaiting || !input || typeof input !== 'object') return;
    player.keys = Object.fromEntries(MOVEMENT_KEYS.map((key) => [key, input[key] === true]));
  }

  function primaryHold(socket, held) {
    const player = players.get(socket.id);
    if (player) player.primaryHeld = held === true;
  }

  function milestoneChoice(socket, choice) {
    const player = players.get(socket.id);
    if (!player || !dawnWave || !dawnPending.has(socket.id)) return;
    dawnPending.delete(socket.id);
    player.dawnWaiting = false;
    if (choice === 'leave') {
      nsp.emit('player_leave', { playerId: player.id, x: player.x, y: player.y, emoji: player.emoji });
      socket.emit('run_result', makeRunResult(player, true, 'milestone'));
      players.delete(socket.id);
      buffVotes.delete(socket.id);
      if (hostId === player.id) migrateHost();
      // Leaving at dawn frees the slot straight away: the socket stops
      // receiving this room's state and the app returns to the hero picker.
      releaseSocket(socket);
    }
    if (dawnPending.size === 0) {
      dawnWave = 0;
      if (players.size > 0) enterReadyPhase(Date.now());
      else { gameEnded = true; resetGame(); }
    }
    broadcastState();
    if (players.size === 0) stop();
  }

  function aim(socket, aim) {
    const player = players.get(socket.id);
    if (!player || player.downed || player.dawnWaiting || !Number.isFinite(aim?.x) || !Number.isFinite(aim?.y)) return;
    const length = Math.hypot(aim.x, aim.y);
    if (length > 0) {
      player.aim = { x: aim.x / length, y: aim.y / length };
      player.hero.aim = { ...player.aim };
    }
  }

  function fire(socket, mode, target) {
    const player = players.get(socket.id);
    if (!player || player.downed || player.dawnWaiting || gameEnded) return;

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
    if (player.bubbleRush) endBubbleRush(player, now);
    if (!player.hero.canUseAbility('weapon', now)) return;
    const result = player.hero.fire(mode, now);
    if (!result) return;
    if (mode === 'primary' && hasRunEffect('overcharge')) {
      player.overchargeShots = (player.overchargeShots || 0) + 1;
      if (player.overchargeShots % GAME_CONFIG.arenaTuning.cards.effects.overchargeEveryShots === 0) {
        for (const projectile of Array.isArray(result) ? result : [result]) projectile.damage *= GAME_CONFIG.arenaTuning.cards.effects.overchargeMultiplier;
        nsp.emit('overcharge', { playerId: player.id, count: player.overchargeShots });
      }
    }
    player.hero.useAbility('weapon', now);
    nsp.emit('weapon_fired', { playerId: player.id, heroId: player.heroId });
    for (const projectile of Array.isArray(result) ? result : [result]) addProjectile(player, projectile);
  }

  function skill(socket) {
    const player = players.get(socket.id);
    if (!player || player.downed || player.dawnWaiting || gameEnded) return;

    syncHeroAimAndPosition(player);
    const now = Date.now();
    if (player.bubbleRush) endBubbleRush(player, now);
    if (!player.hero.canUseAbility('skill', now)) return;
    const skill = player.hero.skill(now);
    if (!skill) return;

    player.hero.useAbility('skill', now);
    if (player.heroId === 'sheriff') player.sheriffDynamiteReady = false;
    nsp.emit('ability_used', { playerId: player.id, heroId: player.heroId, ability: 'skill' });
    if (skill.type === 'dash') {
      if (skill.invulnerableMs > 0) player.hero.makeInvulnerable(skill.invulnerableMs, now);
      if (skill.durationMs) player.dashState = { ...skill, guardianDash: player.heroId === 'guardian', until: now + skill.durationMs, startedAt: now, startX: player.x, startY: player.y, hit: new Set() };
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
  }

  function ultimate(socket) {
    const player = players.get(socket.id);
    if (!player || player.downed || player.dawnWaiting || gameEnded) return;
    syncHeroAimAndPosition(player);
    const now = Date.now();
    if (player.heroId === 'guardian' && GAME_CONFIG.arenaTuning.heroTweaks.guardianUltimateEarlyEnd
      && player.hero.chargeUntil > now) {
      endGuardianCharge(player, now);
      broadcastState(now);
      return;
    }
    if (!player.hero.canUseAbility('ultimate', now)) return;
    const result = player.hero.ultimate(now);
    if (!result || (typeof result !== 'object' && result !== true)) return;
    if (result.type === 'targeting') { broadcastState(now); return; }
    player.hero.useAbility('ultimate', now);
    if (player.heroId === 'electromancer') player.hero.ultimateLockoutUntil = now + GAME_CONFIG.arenaTuning.heroTweaks.electroUltimateMinLockoutMs;
    if (player.heroId === 'guardian') player.hero.chargeDamageBonus = 0;
    if (player.heroId === 'pilot') player.pilotMechReady = false;
    nsp.emit('ability_used', { playerId: player.id, heroId: player.heroId, ability: 'ultimate' });
    if (result instanceof Projectile) addProjectile(player, result);
    else if (result.type === 'bubble_rush') {
      player.bubbleRush = { endsAt: now + result.durationMs, durationMs: result.durationMs,
        speedMultiplier: result.speedMultiplier, radius: result.popRadius, damage: result.damage };
    }
    else if (result.type === 'chain') chainAttack(player, result, now);
  }

  function cancelTargeting(socket) {
    const player = players.get(socket.id);
    if (player?.heroId === 'bombardier') player.hero.targetingUntil = 0;
  }

  function castBuffVote(socket, cardId) {
    // Only heroes on the field vote. A late joiner who is still waiting for the
    // next break joins the vote after they spawn, not before.
    if (!players.has(socket.id)) return;
    if (gameEnded || !buffVote || !buffVote.cards.some((card) => card.id === cardId) || buffVotes.has(socket.id)) return;
    buffVotes.set(socket.id, cardId);
    if ([...players.keys()].every((id) => buffVotes.has(id))) finishBuffVote(Date.now());
    broadcastState();
  }

  function leave(socket) {
    const now = Date.now();
    const player = players.get(socket.id);
    if (player) {
      // In a running room the hero stays behind, idle and invulnerable, so the
      // same account can resume it. In the lobby the hero leaves at once.
      if (player.accountId && phase === 'running') {
        player.disconnected = true;
        player.disconnectAt = now;
        player.keys = {};
        player.primaryHeld = false;
        player.bubbleRush = null;
        player.hero.makeInvulnerable(RECONNECT_GRACE_S * 1000, now);
        if (hostId === socket.id) migrateHost();
        log(`[Hero Lab] ${player.name} disconnected from ${id} (grace ${RECONNECT_GRACE_S}s)`);
        broadcastState(now);
        return;
      }
      removePlayer(player, now);
      return;
    }
    const waitingEntry = waiting.get(socket.id);
    if (waitingEntry) {
      waiting.delete(socket.id);
      log(`[Hero Lab] ${waitingEntry.name} stopped waiting in ${id}`);
      // A waiting player can hold the host role when everyone who spawned has
      // gone; losing them must hand the role on rather than leave it dangling.
      if (hostId === socket.id) migrateHost();
      broadcastState(now);
    }
  }

  // Kill-triggered talents, shared by real monster kills and the lobby training
  // dummies so a talent can be practised on a dummy exactly as it behaves on a
  // monster. Dummies still never count toward kills, combo, rewards or the
  // wave counter - only the talent fires.
  function applyKillTalents(killer, source) {
    if (!killer) return;
    if (killer.heroId === 'sheriff' && (source.sourceAbility !== 'skill' || killer.hero.spec.kills.countDynamiteKills)) {
      const cd = killer.hero.cooldowns.skill;
      const now = Date.now();
      const remainingMs = Math.max(0, cd.readyAt - now);
      let cutMs = Math.min(remainingMs, GAME_CONFIG.arenaTuning.heroTweaks.sheriffTalentCooldownCutSec * 1000);
      if (source.sourceAbility === 'skill' && source.refundGroupId) {
        const refunded = killer.sheriffBlastRefunds.get(source.refundGroupId) || { amountMs: 0, lastAt: now };
        const capRemainingMs = Math.max(0, GAME_CONFIG.arenaTuning.heroTweaks.sheriffBlastRefundCapMs - refunded.amountMs);
        cutMs = Math.min(cutMs, capRemainingMs);
        refunded.amountMs += cutMs;
        refunded.lastAt = now;
        killer.sheriffBlastRefunds.set(source.refundGroupId, refunded);
      }
      if (cutMs > 0) {
        cd.readyAt = Math.max(now, cd.readyAt - cutMs);
        nsp.emit('sheriff_cooldown_refund', { playerId: killer.id, x: killer.x, y: killer.y,
          refundMs: cutMs, sourceAbility: source.sourceAbility });
      }
    }
    if (killer.heroId === 'pilot') {
      const cd = killer.hero.cooldowns.ultimate;
      const now = Date.now();
      const maxCut = cd.durationMs * GAME_CONFIG.arenaTuning.heroTweaks.pilotTalentCycleReductionCap;
      const perKillCut = GAME_CONFIG.arenaTuning.heroTweaks.pilotTalentCooldownCutSec * 1000;
      const cut = Math.max(0, Math.min(perKillCut, maxCut - (cd.cutThisCycleMs || 0), cd.readyAt - now));
      if (cut > 0) {
        cd.readyAt -= cut;
        cd.cutThisCycleMs = (cd.cutThisCycleMs || 0) + cut;
        // Same clock popup as Quick Draw, above the hero and on the Q button.
        nsp.emit('pilot_cooldown_refund', { playerId: killer.id, x: killer.x, y: killer.y, refundMs: cut });
      }
    }
    if (killer.heroId === 'bubbles' && source.sourceAbility === 'skill') {
      const cooldown = killer.hero.cooldowns.skill;
      const now = Date.now();
      const refund = killer.hero.spec.bubbleTrap.killCooldownRefundFraction || 0;
      // A fixed slice of the TOTAL cooldown, not of whatever is left.
      const cut = cooldown.durationMs * refund;
      if (cut > 0 && cooldown.readyAt > now) cooldown.readyAt = Math.max(now, cooldown.readyAt - cut);
    }
    // Unstoppable now applies ONLY to Unbreakable Charge (the ultimate). The
    // Shield Rush rework no longer extends from kills, so the skill's dashState
    // is left untouched here.
    if (killer.heroId === 'guardian' && killer.hero.chargeUntil > Date.now()) {
      const cut = GAME_CONFIG.arenaTuning.heroTweaks.guardianKillExtensionSec * 1000;
      killer.hero.dashingUntil = Math.min(killer.hero.dashCapUntil, killer.hero.dashingUntil + cut);
      killer.hero.makeInvulnerable(cut, Date.now());
      killer.hero.chargeUntil = killer.hero.dashingUntil;
      nsp.emit('dash_extended', { id: killer.id, x: killer.x, y: killer.y, ms: cut });
    }
  }

  function damageMonster(monster, amount, sourceId) {
    const source = typeof sourceId === 'object' ? sourceId : { ownerId: sourceId, sourceAbility: 'weapon' };
    if (monster.isDummy) {
      const dummyOwner = players.get(source.ownerId);
      const dummyMomentum = dummyOwner?.momentumActive ? 1 + GAME_CONFIG.arenaTuning.momentum.bonus : 1;
      return damageDummy(monster, amount * dummyMomentum, source);
    }
    const killer = players.get(source.ownerId);
    const momentumMultiplier = killer?.momentumActive ? 1 + GAME_CONFIG.arenaTuning.momentum.bonus : 1;
    const appliedAmount = amount * momentumMultiplier;
    const hpBefore = monster.hp;
    const damage = monster.takeDamage(appliedAmount);
    if (killer && damage > 0) {
      killer.damageDealt = (killer.damageDealt || 0) + damage;
      const buildingMultiplier = killer.hero.buildingBonuses?.attackMultiplier || 1;
      if (buildingMultiplier > 1) {
        const withoutBuilding = appliedAmount / buildingMultiplier;
        killer.bonusDamage = (killer.bonusDamage || 0) + Math.max(0, Math.min(hpBefore, appliedAmount) - Math.min(hpBefore, withoutBuilding));
      }
      if (hasRunEffect('life-steal')) {
        const recovered = killer.hero.heal(Math.min(GAME_CONFIG.arenaTuning.cards.effects.lifeStealCap,
          damage * GAME_CONFIG.arenaTuning.cards.effects.lifeStealFraction));
        if (recovered > 0) nsp.emit('life_steal', { playerId: killer.id, x: killer.x, y: killer.y, amount: recovered });
      }
    }
    if (damage > 0) queueHit({ type: 'monster', id: monster.id, x: monster.x, y: monster.y, damage,
      sourceId: source.ownerId, heroId: killer?.heroId || null, sourceAbility: source.sourceAbility || 'weapon', bonus: false,
      sourceX: killer?.x, sourceY: killer?.y,
      enemyType: monster.type, boss: Boolean(monster.isBoss), elite: Boolean(monster.isElite) });
    if (monster.dead) {
      monsters.delete(monster.id);
      partyKillCount += 1;
      if (killer) killer.kills = (killer.kills || 0) + 1;
      queueKill({ id: monster.id, x: monster.x, y: monster.y, sourceId: source.ownerId,
        heroId: killer?.heroId || null, sourceX: killer?.x, sourceY: killer?.y, emoji: monster.emoji, sourceAbility: source.sourceAbility || 'weapon',
        enemyType: monster.type, boss: Boolean(monster.isBoss), elite: Boolean(monster.isElite), finisher: Boolean(source.finisher) });
      if (hasRunEffect('scavenger') && Math.random() < GAME_CONFIG.arenaTuning.cards.effects.scavengerDropChance)
        dropPickup(monster.x, monster.y, GAME_CONFIG.arenaTuning.cards.effects.scavengerHeal, GAME_CONFIG.arenaTuning.cards.effects.scavengerLifetimeMs);
      if (activeTwist?.id === 'supply-drop' && partyKillCount % GAME_CONFIG.arenaTuning.waveTwists.supplyDropEveryKills === 0) {
        dropPickup(monster.x, monster.y, 0, GAME_CONFIG.arenaTuning.cards.effects.scavengerLifetimeMs, 'supply',
          GAME_CONFIG.arenaTuning.waveTwists.supplyDropHealFraction);
      }
      applyKillTalents(killer, source);
      if (monster.type === 'exploder') {
        const spec = GAME_CONFIG.arenaTuning.enemies.exploder;
        resolveEnemyBlast({ x: monster.x, y: monster.y, radius: spec.deathRadius,
          damage: monster.damage * spec.deathDamageFraction, sourceId: monster.id }, Date.now());
      }
      if (hasRunEffect('powder-keg')) {
        const spec = GAME_CONFIG.arenaTuning.cards.effects;
        resolveEnemyBlast({ x: monster.x, y: monster.y, radius: spec.powderKegRadius,
          damage: monster.maxHp * spec.powderKegMaxHpFraction, sourceId: monster.id,
          heroDamageFraction: spec.powderKegHeroDamageFraction, damageCampfire: false }, Date.now());
      }
    }
    return damage;
  }

  function endGuardianCharge(player, now) {
    const hero = player.hero;
    if (player.heroId !== 'guardian' || !(hero.chargeUntil > 0)) return false;
    const charge = hero.spec.charge;
    const ramp = Math.min(charge.rampCap, hero.chargeDamageBonus || 0);
    hero.chargeUntil = 0;
    hero.dashingUntil = now;
    hero.chargeDamageBonus = 0;
    explode({ x: player.x, y: player.y, radius: charge.slamRadius,
      damage: hero.attack * charge.slamDamageMultiplier * (1 + ramp),
      knockback: charge.slamKnockback, ownerId: player.id, kind: 'player', sourceAbility: 'ultimate' }, now);
    nsp.emit('guardian_charge_slam', { playerId: player.id, x: player.x, y: player.y,
      radius: charge.slamRadius, damageMultiplier: charge.slamDamageMultiplier * (1 + ramp) });
    return true;
  }

  function pushFromDash(monster, player, now) {
    const dx = monster.x - player.x, dy = monster.y - player.y, length = Math.hypot(dx, dy) || 1;
    const multiplier = monster.type === 'brute-king' || monster.isBoss ? GAME_CONFIG.arenaTuning.knockback.kingMultiplier
      : monster.isDummy ? DUMMY_KNOCKBACK_MULT
      : monster.type === 'brute' ? GAME_CONFIG.arenaTuning.knockback.bruteMultiplier : 1;
    if (!multiplier) return;
    monster.dashPush = { x: dx / length * GAME_CONFIG.arenaTuning.heroTweaks.guardianDashPushPx * multiplier,
      y: dy / length * GAME_CONFIG.arenaTuning.heroTweaks.guardianDashPushPx * multiplier,
      startedAt: now, durationMs: GAME_CONFIG.arenaTuning.heroTweaks.guardianDashPushMs, lastProgress: 0 };
    nsp.emit('dash_hit', { id: player.id, heroId: player.heroId, x: player.x, y: player.y, monsterId: monster.id });
  }

  // Guardian Shield Rush rework: a short dash whose landing triggers a
  // fan-shaped shockwave. The cone is centered on the locked dash direction;
  // every enemy inside (radius measured from the landing point) is damaged for
  // 1.0x attack and pushed radially away from the Guardian. Brutes take half the
  // push, bosses and Kings take none (but are still damaged), and training
  // dummies are pushed using their 1.5x knockback rule. Each enemy is hit at
  // most once because the fan is a single instantaneous event.
  function applyGuardianFan(player, dir, fan, now) {
    const angleRad = Math.atan2(dir.y, dir.x);
    const half = (fan.angleDeg * Math.PI / 180) / 2;
    const radius = fan.radius;
    const startX = player.x, startY = player.y;
    const hits = [];
    for (const monster of monsters.values()) {
      if (monster.dead) continue;
      const dx = monster.x - startX, dy = monster.y - startY;
      const dist = Math.hypot(dx, dy);
      if (dist > radius + monster.radius) continue;
      if (dist < 1e-3) continue;
      const monAngle = Math.atan2(dy, dx);
      let diff = monAngle - angleRad;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      if (Math.abs(diff) > half) continue;
      const kx = dx / dist, ky = dy / dist;
      const isBoss = monster.isBoss || monster.type === 'brute-king';
      const pushMult = monster.isDummy ? DUMMY_KNOCKBACK_MULT
        : isBoss ? 0
        : monster.type === 'brute' ? 0.5 : 1;
      const push = fan.knockback * pushMult;
      if (!monster.isDummy) {
        damageMonster(monster, player.hero.attack * fan.damageMult, { ownerId: player.id, sourceAbility: 'skill' });
      }
      if (monster.isDummy) {
        monster.knockbackX += kx * push;
        monster.knockbackY += ky * push;
      } else if (push > 0) {
        monster.dashPush = { x: kx * push, y: ky * push, startedAt: now, durationMs: fan.knockbackMs, lastProgress: 0 };
      }
      hits.push({ id: monster.id, x: monster.x, y: monster.y });
    }
    nsp.emit('area_effect', { x: startX, y: startY, radius, sourceAbility: 'skill', sourceHeroId: 'guardian',
      angleRad, angleDeg: fan.angleDeg, color: GAME_CONFIG.heroFxColors.guardian.primary, hits,
      durationMs: GAME_CONFIG.arenaTuning.heroTweaks.guardianFanFadeMs });
  }

  function damageNearby(player, spec, now) {
    for (const monster of monsters.values()) {
      if (Math.hypot(monster.x-player.x, monster.y-player.y) > spec.distance + monster.radius) continue;
      damageMonster(monster, player.hero.attack * spec.damageMultiplier, { ownerId: player.id, sourceAbility: 'skill' });
      if (!monster.isBoss) {
        const dx=monster.x-player.x, dy=monster.y-player.y, length=Math.hypot(dx,dy)||1;
        const knockback = (spec.knockback||0) * (monster.isDummy ? DUMMY_KNOCKBACK_MULT : 1);
        monster.x += dx/length*knockback*0.08; monster.y += dy/length*knockback*0.08;
      }
    }
  }

  function explode(effect, now) {
    for (const monster of monsters.values()) {
      if (effect.excludeId === monster.id) continue;
      if (Math.hypot(monster.x-effect.x, monster.y-effect.y) <= effect.radius + monster.radius) {
        damageMonster(monster, effect.damage, { ownerId: effect.ownerId, sourceAbility: effect.sourceAbility || 'ultimate',
          finisher: effect.finisher, refundGroupId: effect.refundGroupId });
        if (effect.stunMs && !monster.isBoss) monster.stunnedUntil = now + effect.stunMs;
        const dx=monster.x-effect.x, dy=monster.y-effect.y, length=Math.hypot(dx,dy)||1;
        if (!monster.isBoss) {
          const knockback = (effect.knockback||0) * (monster.isDummy ? DUMMY_KNOCKBACK_MULT : 1);
          monster.knockbackX=(dx/length)*knockback; monster.knockbackY=(dy/length)*knockback;
        }
      }
    }
    if (effect.heal) for (const player of players.values()) {
      if (Math.hypot(player.x-effect.x, player.y-effect.y) <= effect.radius) player.hero.heal(effect.heal);
    }
    const owner = players.get(effect.ownerId);
    nsp.emit('area_effect', { x: effect.x, y: effect.y, radius: effect.radius, kind: effect.kind || 'player', telegraphMs: 0,
      color: effect.color || GAME_CONFIG.heroFxColors[owner?.heroId]?.primary || '#ff9c45',
      sourceHeroId: owner?.heroId,
      sourceAbility: effect.sourceAbility || 'ultimate', finisher: Boolean(effect.finisher) });
  }

  function resolveEnemyBlast(effect, now) {
    for (const monster of monsters.values()) {
      if (monster.id === effect.sourceId || Math.hypot(monster.x - effect.x, monster.y - effect.y) > effect.radius + monster.radius) continue;
      damageMonster(monster, effect.damage, { ownerId: null, sourceAbility: 'enemy-explosion' });
    }
    for (const player of players.values()) {
      if (Math.hypot(player.x - effect.x, player.y - effect.y) > effect.radius + ARENA_CONFIG.radius) continue;
      const incoming = effect.heroDamageFraction ? player.hero.maxHp * effect.heroDamageFraction : effect.damage;
      const damage = player.hero.damage(incoming, now);
      if (damage > 0) nsp.emit('player_hit', { id: player.id, x: player.x, y: player.y, damage, sourceAbility: 'enemy-explosion' });
    }
    if (effect.damageCampfire !== false && Math.hypot(campfire.x - effect.x, campfire.y - effect.y) <= effect.radius + campfire.radius) {
      const before = campfire.hp;
      campfire.hp = Math.max(0, campfire.hp - effect.damage);
      pendingCampfireDamage += before - campfire.hp;
    }
    nsp.emit('area_effect', { x: effect.x, y: effect.y, radius: effect.radius, kind: 'enemy', telegraphMs: 0,
      color: '#ff7b35', sourceAbility: 'enemy-explosion' });
  }

  function resolveEnemySlam(effect, now) {
    for (const player of players.values()) {
      if (Math.hypot(player.x - effect.x, player.y - effect.y) > effect.radius + ARENA_CONFIG.radius) continue;
      const damage = player.hero.damage(effect.damage, now);
      if (damage > 0) nsp.emit('player_hit', { id: player.id, x: player.x, y: player.y, damage, sourceAbility: 'boss-slam' });
    }
    if (Math.hypot(campfire.x - effect.x, campfire.y - effect.y) <= effect.radius + campfire.radius) {
      const before = campfire.hp;
      campfire.hp = Math.max(0, campfire.hp - effect.damage);
      pendingCampfireDamage += before - campfire.hp;
    }
    nsp.emit('area_effect', { x: effect.x, y: effect.y, radius: effect.radius, kind: 'enemy', telegraphMs: 0,
      color: '#e74242', sourceAbility: 'boss-slam' });
  }

  function endBubbleRush(player, now) {
    const rush = player.bubbleRush;
    if (!rush) return;
    player.bubbleRush = null;
    explode({ type: 'explosion', ownerId: player.id, x: player.x, y: player.y,
      damage: rush.damage, radius: rush.radius, color: GAME_CONFIG.heroFxColors.bubbles.primary,
      sourceAbility: 'ultimate' }, now);
  }

  function chainAttack(player, effect, now) {
    let x = player.x, y = player.y;
    const hit = new Set();
    const targets = [];
    const rangeSquared = effect.range * effect.range;
    for (let i = 0; i < monsters.size; i++) {
      let target = null;
      let nearestSquared = rangeSquared;
      for (const monster of monsters.values()) {
        if (hit.has(monster.id)) continue;
        const dx = monster.x - x, dy = monster.y - y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared <= rangeSquared && (!target || distanceSquared < nearestSquared)) {
          nearestSquared = distanceSquared;
          target = monster;
        }
      }
      if(!target) break;
      hit.add(target.id);
      targets.push({ targetId: target.id, x1: x, y1: y, at: now + i * effect.jumpDelayMs });
      x=target.x;y=target.y;
    }
    const castId = ++chainCastCounter;
    const cast = { castId, ownerId: player.id, planned: targets.length, processed: 0, hitCount: 0, stunnedHitCount: 0, refundedMs: 0 };
    if (targets.length === 0) {
      if (LOG_DEBUG) console.info('[Hero Lab] Electromancer Chain Lightning', { castId, enemiesHit: 0, stunnedEnemiesHit: 0, secondsRefunded: 0 });
      return;
    }
    pendingChainCasts.set(castId, cast);
    for (const target of targets) pendingChains.push({ ...target, castId, ownerId: player.id, damage: effect.damage });
  }

  function snapshot(now = Date.now()) {
    return {
      wave: {
        number: waveNumber,
        enemiesRemaining: enemyCount() + enemiesLeftToSpawn,
        nextWaveInMs: nextWaveAt ? Math.max(0, nextWaveAt - now) : 0,
        twist: activeTwist,
      },
      // Between-wave break: which phase is running and when it ends, so the
      // HUD can show the "Rest Ns" pill without guessing.
      break: breakPhase ? {
        phase: breakPhase,
        endsAt: breakPhaseEndsAt,
        wave: waveNumber,
        remainingMs: breakPhaseEndsAt ? Math.max(0, breakPhaseEndsAt - now) : 0,
      } : null,
      boss: (() => { const boss = [...monsters.values()].find((monster) => monster.isBoss); return boss ? { hp: Math.max(0, Math.round(boss.hp)), maxHp: boss.maxHp, name: 'Brute King' } : null; })(),
      gameEnded,
      dawn: dawnWave ? { wave: dawnWave, decisionsRemaining: dawnPending.size } : null,
      serverTime: now,
      buffVote: buffVote ? { wave: buffVote.wave, cards: buffVote.cards, endsAt: buffVote.endsAt,
        voteCount: buffVotes.size, votes: Object.fromEntries(buffVotes) } : null,
      lastBuff,
      activeBuffs: runBuffs.map((buff) => ({ ...buff })),
      room: {
        code,
        phase,
        hostId,
        maxPlayers: ROOM_MAX_PLAYERS,
        countdownEndsAt: phase === 'countdown' ? countdownEndsAt : 0,
        players: [...players.values()].map((player) => ({
          id: player.id, name: player.name, emoji: player.emoji, heroId: player.heroId,
          waiting: false, disconnected: Boolean(player.disconnected), host: player.id === hostId,
        })),
        waiting: [...waiting.values()].map((entry) => ({
          id: entry.id, name: entry.name, emoji: entry.emoji, heroId: entry.heroId,
          waiting: true, host: entry.id === hostId,
        })),
      },
      spawnTelegraphs: spawnTelegraphs.map(({ id, x, y, spawnAt }) => ({ id, x, y, remainingMs: Math.max(0, spawnAt - now) })),
      traps: [...traps.values()],
      pickups: [...pickups.values()].map(({ id, x, y, type }) => ({ id, x, y, type })),
      effects: timedEffects.map(({ type, x, y, radius, at, startAt }) => ({ type, x, y, radius, at, startAt })),
      campfire: {
        x: campfire.x,
        y: campfire.y,
        radius: campfire.radius,
        hp: Math.max(0, Math.round(campfire.hp)),
        maxHp: campfire.maxHp,
      },
      monsters: [...monsters.values()].map((monster) => ({
        id: monster.id,
        x: Math.round(monster.x * 10) / 10,
        y: Math.round(monster.y * 10) / 10,
        hp: Math.max(0, Math.round(monster.hp)),
        maxHp: monster.maxHp,
        radius: monster.radius,
        emoji: monster.emoji,
        type: monster.type,
        isDummy: Boolean(monster.isDummy),
        fadeRemainingMs: monster.fadeStartedAt ? Math.max(0, DUMMY_FADE_MS - (now - monster.fadeStartedAt)) : 0,
        isBoss: Boolean(monster.isBoss), isElite: Boolean(monster.isElite),
        scale: monster.scale || 1,
        fuseRemainingMs: Math.max(0, (monster.fuseUntil || 0) - now),
        stunned: monster.stunnedUntil > now,
        trapped: Boolean(monster.trappedBy),
        skeletonWindupMs: Math.max(0, (monster.windupUntil || 0) - now),
      })),
      players: [...players.values()].map(({ id, heroId, hero, name, emoji, x, y, aim, downed, disconnected, respawnRemainingMs, respawnDurationMs, respawnSpeedMultiplier, momentumActive, dawnWaiting, bubbleRush, wavesReached, wavesParticipated }) => ({
        id, heroId, name, emoji: hero.visual || emoji, type: hero.type, x: Math.round(x), y: Math.round(y), aim: { ...aim },
        disconnected: Boolean(disconnected),
        wavesReached: wavesReached || 0, wavesParticipated: wavesParticipated || 0,
        ultimateFlash: hero.ultimateFlashUntil > now,
        talent: hero.talent, targeting: hero.targetingUntil > now,
        guardianCharging: heroId === 'guardian' && hero.chargeUntil > now,
        // Pilot Mech Suit state, so the client can swap the M1/E icons and
        // move the weapon slot onto the highlight colour family.
        mech: heroId === 'pilot' && hero.mechUntil > now,
        guardianDamageRamp: heroId === 'guardian' ? hero.chargeDamageBonus || 0 : 0,
        guardianBrace: heroId === 'guardian' && hero.braceUntil > now,
        dashing: heroId === 'guardian'
          ? (hero.dashingUntil > now || Boolean(players.get(id)?.dashState && players.get(id).dashState.until > now))
          : Boolean(players.get(id)?.dashState && players.get(id).dashState.until > now),
        downed: Boolean(downed), respawnRemainingMs: respawnRemainingMs || 0, respawnDurationMs: respawnDurationMs || 0,
        respawnSpeedMultiplier: respawnSpeedMultiplier || 1, momentumActive: Boolean(momentumActive), dawnWaiting: Boolean(dawnWaiting),
        bubbleRush: bubbleRush ? { remainingMs: Math.max(0, bubbleRush.endsAt - now), durationMs: bubbleRush.durationMs } : null,
        buildingBonuses: { ...hero.buildingBonuses },
        towerLevel: hero.towerLevel ?? 0,
        towerMultiplier: hero.towerMultiplier ?? 1,
        overchargeShots: players.get(id)?.overchargeShots || 0,
        hp: Math.max(0, Math.round(hero.hp)), maxHp: hero.maxHp,
        attack: hero.attack, defense: hero.defense, speed: hero.speed,
        abilities: Object.fromEntries(Object.entries(hero.cooldowns).map(([key, cooldown]) => [key, {
          name: key === 'weapon' ? hero.weaponName : key === 'skill' ? hero.skillName : hero.ultimateName,
          durationMs: cooldown.durationMs,
          readyAt: cooldown.readyAt,
          remainingMs: Math.max(0, cooldown.readyAt - now),
          lockoutRemainingMs: key === 'ultimate' && heroId === 'electromancer' ? Math.max(0, hero.ultimateLockoutUntil - now) : 0,
        }])),
        invulnerable: hero.invulnerableUntil > now,
        hitFlash: Boolean(hero.hitFlashUntil > now),
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

  function tick() {
    const dt = 1 / ARENA_CONFIG.tickHz;
    const now = Date.now();
    if (gameEnded) { broadcastState(now); return; }

    // 0. Drop heroes whose reconnect window expired.
    for (const player of [...players.values()]) {
      if (player.disconnected && now - player.disconnectAt >= RECONNECT_GRACE_S * 1000) {
        log(`[Hero Lab] ${player.name} did not return to ${id}`);
        removePlayer(player, now);
      }
    }
    if (players.size === 0) return;

    // 0b. Lobby flow: the countdown turns into a run, a broken dummy respawns,
    // and the dummy's own physics (shoves, knockback, bounds) always runs.
    if (phase === 'countdown' && now >= countdownEndsAt) startRun(now);
    if (phase === 'lobby' && nextDummySpawnAt && now >= nextDummySpawnAt) { nextDummySpawnAt = 0; spawnDummies(now); }
    updateDummies(dt, now);

    // 1. Move players
    for (const player of players.values()) if (player.bubbleRush && now >= player.bubbleRush.endsAt) endBubbleRush(player, now);
    for (const player of players.values()) {
      if (player.downed || player.dawnWaiting || player.disconnected) continue;
      const dx = Number(player.keys.right) - Number(player.keys.left);
      const dy = Number(player.keys.down) - Number(player.keys.up);
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        const burst = Math.max(player.bubbleRush?.speedMultiplier || 1,
          activeTwist?.id === 'fast-night' ? 1 + GAME_CONFIG.arenaTuning.waveTwists.fastNightHeroSpeed : 1);
        const step = player.hero.speed * burst / ARENA_CONFIG.tickHz;
        const oldX = player.x, oldY = player.y;
        const moveX = dx / length;
        const moveY = dy / length;
        player.x = clamp(player.x + moveX * step, ARENA_CONFIG.radius, ARENA_CONFIG.width - ARENA_CONFIG.radius);
        player.y = clamp(player.y + moveY * step, ARENA_CONFIG.radius, ARENA_CONFIG.height - ARENA_CONFIG.radius);
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

    // 2. Start the next wave after its break and spawn its enemies. Only a
    // running room does this; the lobby and the countdown never spawn enemies.
    if (phase === 'running') {
      if (players.size > 0 && !gameEnded && nextWaveAt && now >= nextWaveAt) startWave(now);
      if (players.size > 0 && !gameEnded && enemiesLeftToSpawn > 0 && now >= nextEnemyAt) scheduleSpawn(now);
    }
    for (let i = spawnTelegraphs.length - 1; i >= 0; i--) {
      if (now < spawnTelegraphs[i].spawnAt) continue;
      if (spawnEnemy(spawnTelegraphs[i], now)) spawnTelegraphs.splice(i, 1);
    }

    // 3. Zombies chase the campfire; devils chase the closest living player.
    for (const player of players.values()) {
      if (player.downed || player.dawnWaiting) continue;
      syncHeroAimAndPosition(player);
      if(player.heroId==='guardian' && player.hero.dashingUntil>now) player.hero.makeInvulnerable(player.hero.dashingUntil-now,now);
      if (player.dashState) {
        const dash=player.dashState;
        if(now>=dash.until){
          // Snap to the exact landing point so the dash always covers its full
          // distance regardless of how the tick grid lines up with the duration.
          player.x=clamp(dash.startX+dash.direction.x*dash.distance,ARENA_CONFIG.radius,ARENA_CONFIG.width-ARENA_CONFIG.radius);
          player.y=clamp(dash.startY+dash.direction.y*dash.distance,ARENA_CONFIG.radius,ARENA_CONFIG.height-ARENA_CONFIG.radius);
          const fan=dash.fan, fanDirection=dash.fanDirection;
          player.dashState=null;
          if(fan && fanDirection) applyGuardianFan(player, fanDirection, fan, now);
        }
        else {
          const frac=Math.min(1,(now-dash.startedAt)/dash.durationMs);
          player.x=clamp(dash.startX+dash.direction.x*dash.distance*frac,ARENA_CONFIG.radius,ARENA_CONFIG.width-ARENA_CONFIG.radius);
          player.y=clamp(dash.startY+dash.direction.y*dash.distance*frac,ARENA_CONFIG.radius,ARENA_CONFIG.height-ARENA_CONFIG.radius);
          if(dash.damageMultiplier) for(const monster of monsters.values()) {
            if(dash.hit.has(monster.id)||Math.hypot(monster.x-player.x,monster.y-player.y)>monster.radius+ARENA_CONFIG.radius+8)continue;
            dash.hit.add(monster.id);damageMonster(monster,player.hero.attack*dash.damageMultiplier,{ownerId:player.id,sourceAbility:'skill'});
            pushFromDash(monster, player, now);
          }
        }
      }
      const effect=player.hero.update(now, player.primaryHeld);
      if (effect instanceof Projectile) addProjectile(player,effect);
      if (player.hero.chargeUntil > now) {
        const step=player.hero.spec.charge.speed/ARENA_CONFIG.tickHz;
        player.x=clamp(player.x+player.aim.x*step,ARENA_CONFIG.radius,ARENA_CONFIG.width-ARENA_CONFIG.radius);
        player.y=clamp(player.y+player.aim.y*step,ARENA_CONFIG.radius,ARENA_CONFIG.height-ARENA_CONFIG.radius);
        for (const monster of monsters.values()) {
          if (Math.hypot(monster.x-player.x,monster.y-player.y) > monster.radius+ARENA_CONFIG.radius+8) continue;
          const lastHitAt = player.hero.lastChargeHit.get(monster.id) ?? Number.NEGATIVE_INFINITY;
          if (now - lastHitAt < GAME_CONFIG.arenaTuning.heroTweaks.guardianRepeatHitCooldownMs) continue;
          player.hero.lastChargeHit.set(monster.id,now);
          const charge = player.hero.spec.charge;
          const currentRamp = Math.min(charge.rampCap, player.hero.chargeDamageBonus || 0);
          const dealt = damageMonster(monster, player.hero.attack * charge.damageMultiplier * (1 + currentRamp),
            { ownerId: player.id, sourceAbility: 'ultimate' });
          if (dealt > 0) player.hero.chargeDamageBonus = Math.min(charge.rampCap, currentRamp + charge.rampPerHit);
          pushFromDash(monster, player, now);
        }
      }
    }

    for (const player of players.values()) {
      if (player.heroId === 'guardian' && player.hero.chargeUntil > 0 && now >= player.hero.chargeUntil) endGuardianCharge(player, now);
    }

    for (let i=pendingChains.length-1;i>=0;i--) {
      const chain=pendingChains[i]; if(now<chain.at) continue;
      const target=monsters.get(chain.targetId);
      const cast = pendingChainCasts.get(chain.castId);
      if(target) {
        const owner = players.get(chain.ownerId);
        const stunned = target.stunnedUntil > now;
        let refundMs = 0;
        let cooldownRefilled = false;
        let remainingMs = 0;
        if (owner?.heroId === 'electromancer' && cast) {
          cast.hitCount += 1;
          if (stunned) cast.stunnedHitCount += 1;
          const cooldown = owner.hero.cooldowns.ultimate;
          const beforeRemainingMs = Math.max(0, cooldown.readyAt - now);
          const stunMultiplier = stunned ? GAME_CONFIG.arenaTuning.heroTweaks.electroStunRefundMultiplier : 1;
          const wantedRefundMs = owner.hero.spec.ultimateCooldownMs
            * GAME_CONFIG.arenaTuning.heroTweaks.electroChainRefundPct * stunMultiplier;
          refundMs = Math.min(beforeRemainingMs, wantedRefundMs);
          if (refundMs > 0) cooldown.readyAt = Math.max(now, cooldown.readyAt - refundMs);
          remainingMs = Math.max(0, cooldown.readyAt - now);
          cooldownRefilled = beforeRemainingMs > 0 && remainingMs <= 0;
          cast.refundedMs += refundMs;
        }
        damageMonster(target,chain.damage,{ownerId:chain.ownerId,sourceAbility:'ultimate'});
        nsp.emit('lightning_chain',{x1:chain.x1,y1:chain.y1,x2:target.x,y2:target.y,sourceId:chain.ownerId,targetId:target.id});
        nsp.emit('lightning_flash',{id:target.id,x:target.x,y:target.y});
        if (owner?.heroId === 'electromancer' && cast) nsp.emit('electro_chain_refund', {
          playerId: owner.id, x: target.x, y: target.y, heroX: owner.x, heroY: owner.y,
          targetId: target.id, stunned, hitCount: cast.hitCount, stunnedHitCount: cast.stunnedHitCount,
          refundMs, totalRefundedMs: cast.refundedMs, remainingMs, lockoutRemainingMs: Math.max(0, owner.hero.ultimateLockoutUntil - now),
          cooldownRefilled, castId: chain.castId,
        });
      }
      if (cast) {
        cast.processed += 1;
        if (cast.processed >= cast.planned) {
          if (LOG_DEBUG) console.info('[Hero Lab] Electromancer Chain Lightning', {
            castId: cast.castId, enemiesHit: cast.hitCount, stunnedEnemiesHit: cast.stunnedHitCount,
            secondsRefunded: Number((cast.refundedMs / 1000).toFixed(3)),
          });
          pendingChainCasts.delete(cast.castId);
        }
      }
      pendingChains.splice(i,1);
    }
    for (const monster of monsters.values()) {
      if (monster.isDummy) continue;
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
      if (monster instanceof BruteKing && now >= monster.nextSlamAt) {
        const spec = GAME_CONFIG.arenaTuning.enemies.bruteKing;
        monster.nextSlamAt = now + spec.slamIntervalMs;
        const slam = { type: 'enemy-slam', ownerId: monster.id, x: monster.x, y: monster.y, radius: spec.slamRadius,
          damage: spec.slamDamage * (1 + GAME_CONFIG.arenaTuning.enemies.wave.damagePerWave * waveNumber),
          at: now, explodeAt: now + spec.slamTelegraphMs, telegraphMs: spec.slamTelegraphMs };
        timedEffects.push(slam);
        nsp.emit('area_telegraph', { x: slam.x, y: slam.y, radius: slam.radius, kind: 'enemy', telegraphMs: slam.telegraphMs, sourceAbility: 'boss-slam' });
      }
      if (monster instanceof Exploder) {
        const result = monster.update(dt, campfire, now);
        if (result === 'telegraph') nsp.emit('area_telegraph', { x: campfire.x, y: campfire.y,
          radius: GAME_CONFIG.arenaTuning.enemies.exploder.campfireRadius, kind: 'enemy',
          telegraphMs: GAME_CONFIG.arenaTuning.enemies.exploder.fuseMs, sourceAbility: 'exploder' });
        if (result === 'explode') {
          monsters.delete(monster.id);
          resolveEnemyBlast({ x: campfire.x, y: campfire.y, radius: GAME_CONFIG.arenaTuning.enemies.exploder.campfireRadius,
            damage: monster.damage, sourceId: monster.id }, now);
        }
      } else if (monster instanceof Devil) {
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

    if (hasRunEffect('thorns')) for (const monster of monsters.values()) {
      if (Math.hypot(monster.x - campfire.x, monster.y - campfire.y) <= GAME_CONFIG.arenaTuning.cards.effects.thornsRadius + monster.radius)
        damageMonster(monster, GAME_CONFIG.arenaTuning.cards.effects.thornsDamagePerSecond * dt, { ownerId: null, sourceAbility: 'thorns' });
    }

    for (const player of players.values()) {
      if (Math.hypot(player.x-campfire.x,player.y-campfire.y) <= GAME_CONFIG.campfire.healingRadius) {
        player.hero.heal(player.hero.maxHp * GAME_CONFIG.campfire.healingPerSecondPercent * dt);
      }
    }

    // 4. Move projectiles
    for (const [id, proj] of projectiles.entries()) {
      proj.update(dt, ARENA_CONFIG);
      // Stun balls detonate on body contact only: the blast radius must not
      // set them off while the ball is still in flight. On contact the ball
      // applies its damage and stun to everything inside the radius, emits
      // the field visual once, and is spent.
      if (proj.stunMs > 0 && proj.explosionRadius > 0) {
        const contact = [...monsters.values()].find((monster) => proj.collidesWith(monster));
        if (contact) {
          for (const monster of monsters.values()) {
            if (Math.hypot(monster.x-proj.x,monster.y-proj.y) > proj.explosionRadius+monster.radius) continue;
            damageMonster(monster,proj.damage,{ownerId:proj.ownerId,sourceAbility:'skill'});
            monster.stunnedUntil=now+proj.stunMs;
          }
          nsp.emit('area_effect',{x:proj.x,y:proj.y,radius:proj.explosionRadius,kind:'player',telegraphMs:0,
            color:GAME_CONFIG.heroFxColors.electromancer.primary,sourceHeroId:'electromancer',sourceAbility:'skill'});
          projectiles.delete(id);
          continue;
        }
      }
      if (proj.trapTargetId) {
        const target = monsters.get(proj.trapTargetId);
        if (target) { target.x = proj.x; target.y = proj.y; }
        const travel = Math.hypot(proj.x - proj.trapOrigin.x, proj.y - proj.trapOrigin.y);
        if (target && (travel >= proj.trap.travelDistance || proj.dead)) {
          const finisher = target.hp <= proj.trap.finisherDamage;
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
        if (proj.detonateOnExpire || (proj.explosionRadius > 0 && !proj.trap && !proj.stunMs)) explode({x:proj.x,y:proj.y,radius:proj.explosionRadius||proj.radius,damage:proj.damage,knockback:proj.knockback,stunMs:proj.stunMs,ownerId:proj.ownerId,sourceAbility:proj.sourceAbility,refundGroupId:proj.id,color:proj.color},now);
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
          const damage = damageMonster(monster,proj.damage,{ownerId:proj.ownerId,sourceAbility:proj.sourceAbility||'weapon',refundGroupId:proj.id});
          proj.hitTargets.add(mId);
          if (!proj.ricocheted && proj.sourceAbility === 'weapon' && hasRunEffect('ricochet')) {
            const ricochet = GAME_CONFIG.arenaTuning.cards.effects;
            let target = null;
            let nearestSquared = ricochet.ricochetRange * ricochet.ricochetRange;
            for (const candidate of monsters.values()) {
              if (candidate.id === mId || proj.hitTargets.has(candidate.id)) continue;
              const dx = candidate.x - monster.x, dy = candidate.y - monster.y;
              const distanceSquared = dx * dx + dy * dy;
              if (distanceSquared <= nearestSquared && (!target || distanceSquared < nearestSquared)) {
                nearestSquared = distanceSquared;
                target = candidate;
              }
            }
            if (target) {
              proj.ricocheted = true;
              damageMonster(target, proj.damage * ricochet.ricochetDamageFraction, { ownerId: proj.ownerId, sourceAbility: 'weapon' });
              nsp.emit('ricochet_line', { x1: monster.x, y1: monster.y, x2: target.x, y2: target.y, heroId: proj.heroId });
            }
          }
          if (proj.explosionRadius > 0) explode({x:proj.x,y:proj.y,radius:proj.explosionRadius,damage:proj.damage,knockback:proj.knockback,stunMs:proj.stunMs,ownerId:proj.ownerId,sourceAbility:proj.sourceAbility,refundGroupId:proj.id,excludeId:mId,color:proj.color},now);
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
      if (effect.type === 'enemy-slam' && !monsters.has(effect.ownerId)) timedEffects.splice(i, 1);
      else if (effect.type === 'enemy-slam' && now >= effect.explodeAt) { resolveEnemySlam(effect, now); timedEffects.splice(i, 1); }
      else if(effect.type==='bomb-marker' && now>=effect.explodeAt){explode({...effect,type:'explosion',sourceAbility:'ultimate'},now);timedEffects.splice(i,1);}
      else if(effect.type !== 'bomb-marker' && effect.type !== 'enemy-slam' && now>=effect.at){explode(effect,now);timedEffects.splice(i,1);}
    }

    for (const [id, pickup] of pickups) {
      if (now >= pickup.expiresAt) { pickups.delete(id); continue; }
      const collector = [...players.values()].find((player) => !player.downed && Math.hypot(player.x - pickup.x, player.y - pickup.y) <= ARENA_CONFIG.radius + 14);
      if (!collector) continue;
      const healed = collector.hero.heal(pickup.healFraction ? collector.hero.maxHp * pickup.healFraction : pickup.heal);
      pickups.delete(id);
      if (healed > 0) nsp.emit('pickup_collected', { playerId: collector.id, x: collector.x, y: collector.y, amount: healed });
    }

    // Break phases own the vote timer (see advanceBreakPhase).

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

    if (!gameEnded && campfire.hp <= 0 && hasRunEffect('second-wind') && !secondWindUsed) {
      secondWindUsed = true;
      campfire.hp = campfire.maxHp * GAME_CONFIG.arenaTuning.cards.effects.secondWindHp;
      explode({ x: campfire.x, y: campfire.y, radius: GAME_CONFIG.arenaTuning.cards.effects.secondWindRadius,
        damage: GAME_CONFIG.arenaTuning.cards.effects.secondWindDamage, knockback: GAME_CONFIG.arenaTuning.cards.effects.secondWindKnockback,
        ownerId: null, kind: 'player', sourceAbility: 'second-wind' }, now);
      nsp.emit('second_wind', { x: campfire.x, y: campfire.y, hp: campfire.hp, maxHp: campfire.maxHp });
    }
    if (!gameEnded && campfire.hp <= 0) {
      gameEnded=true; campfire.hp=0; nextWaveAt=0; enemiesLeftToSpawn=0; spawnTelegraphs.length = 0;
      breakPhase = null; breakPhaseEndsAt = 0; buffVote = null; buffVotes.clear();
      if (pendingCampfireDamage > 0) {
        nsp.emit('campfire_hit', { x: campfire.x, y: campfire.y, damage: pendingCampfireDamage });
        pendingCampfireDamage = 0;
      }
      for (const player of players.values()) {
        direct.to(player.id).emit('run_result', makeRunResult(player, false, 'campfire'));
        direct.to(player.id).emit('game_over', { reason: 'campfire' });
      }
      // Anyone still waiting never got to spawn: end the run for them too.
      for (const entry of waiting.values()) {
        direct.to(entry.id).emit('run_result', makeRunResult(null, false, 'campfire'));
        direct.to(entry.id).emit('game_over', { reason: 'campfire' });
      }
      waiting.clear();
      // The run is over, not the room: everyone drops back into the lobby with
      // a fresh hero and can start again (or leave).
      resetRunToLobby(now);
    }
    if (buffVote && players.size > 0 && [...players.keys()].every((id) => buffVotes.has(id))) finishBuffVote(now);
    if (players.size === 0 && waveNumber > 0) resetGame();

    // 8. Run the break sequence (REST -> VOTE -> READY), then start the wave.
    advanceBreakPhase(now);

    // 9. A wave is only complete once every enemy is gone AND no break is
    // already running (the break itself spans several ticks).
    if (
      phase === 'running' && players.size > 0 && !gameEnded && !buffVote && !dawnWave && !breakPhase && waveNumber > 0
      && enemiesLeftToSpawn === 0 && spawnTelegraphs.length === 0 && enemyCount() === 0 && nextWaveAt === 0
    ) {
      completeWave(now);
    }

    for (const player of players.values()) {
      if (player.heroId === 'sheriff') {
        for (const [groupId, refund] of player.sheriffBlastRefunds) {
          if (now - refund.lastAt > GAME_CONFIG.arenaTuning.heroTweaks.sheriffRefundGroupTtlMs) player.sheriffBlastRefunds.delete(groupId);
        }
        if (!player.sheriffDynamiteReady && now >= player.hero.cooldowns.skill.readyAt) {
          player.sheriffDynamiteReady = true;
          nsp.emit('dynamite_ready', { playerId: player.id, x: player.x, y: player.y });
        }
      }
      // Pilot's Mech Suit gets the same "it's back" moment (robot bounce above
      // the hero). Never while the mech is still up.
      if (player.heroId === 'pilot' && !player.pilotMechReady
        && !(player.hero.mechUntil > now) && now >= player.hero.cooldowns.ultimate.readyAt) {
        player.pilotMechReady = true;
        nsp.emit('mech_ready', { playerId: player.id, x: player.x, y: player.y });
      }
    }

    broadcastState(now);
    if (players.size === 0) stop();
  }

  // --- Room lifecycle -------------------------------------------------------
  // The loop only runs while the room has players. `emptySince` lets the
  // RoomManager destroy abandoned rooms after ROOM_EMPTY_TTL_S.
  let loop = null;
  let emptySince = Date.now();
  let destroyed = false;
  let lastTickMs = 0;
  let lastTickAt = 0;
  // Rolling window of tick costs, used by the profiler for average and worst
  // tick time. Fixed-size typed array: no allocation per tick.
  const tickHistory = new Float64Array(PERF_TICK_HISTORY);
  let tickHistoryIndex = 0;
  let tickHistoryCount = 0;

  // The loop body is timed so the debug menu can show what a room costs per
  // tick without instrumenting the game code itself.
  function runTick() {
    const startedAt = performance.now();
    inTick = true;
    try {
      tick();
    } finally {
      inTick = false;
      // One batched hit event and one batched kill event per tick.
      flushKillEvents();
      lastTickMs = performance.now() - startedAt;
      lastTickAt = Date.now();
      tickHistory[tickHistoryIndex] = lastTickMs;
      tickHistoryIndex = (tickHistoryIndex + 1) % PERF_TICK_HISTORY;
      if (tickHistoryCount < PERF_TICK_HISTORY) tickHistoryCount += 1;
    }
  }

  // Average and worst tick cost over the last PERF_TICK_HISTORY ticks (~1 s at
  // 30 Hz). Read by the profiler overlay only; O(32) per call.
  function tickStats() {
    if (tickHistoryCount === 0) return { avgMs: 0, worstMs: 0, samples: 0 };
    let sum = 0;
    let worst = 0;
    for (let i = 0; i < tickHistoryCount; i += 1) {
      const value = tickHistory[i];
      sum += value;
      if (value > worst) worst = value;
    }
    return { avgMs: sum / tickHistoryCount, worstMs: worst, samples: tickHistoryCount };
  }

  // Cumulative bytes written to this room's sockets. The profiler diffs this
  // over time; engine.io hides the raw counter, so read it off the net socket.
  // Best-effort and defensive: never let a missing counter crash debugInfo().
  function bytesSent() {
    try {
      const members = heroLabNamespace.adapter.rooms.get(id);
      if (!members) return 0;
      let total = 0;
      for (const socketId of members) {
        const socket = heroLabNamespace.sockets.get(socketId);
        const bytes = socket?.conn?.transport?.socket?._socket?.bytesWritten;
        if (typeof bytes === 'number') total += bytes;
      }
      return total;
    } catch {
      return 0;
    }
  }

  function start() {
    if (loop || destroyed) return;
    emptySince = 0;
    loop = setInterval(runTick, 1000 / ARENA_CONFIG.tickHz);
  }

  function stop() {
    if (!loop) return;
    clearInterval(loop);
    loop = null;
    if (players.size === 0) emptySince = Date.now();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    players.clear();
    waiting.clear();
    monsters.clear(); liveDummyCount = 0;
    projectiles.clear();
    buffVotes.clear();
    dawnPending.clear();
    timedEffects.length = 0;
    spawnTelegraphs.length = 0;
    pendingChains.length = 0;
    pendingChainCasts.clear();
  }

  // Everything the debug menu shows for one room.
  function debugInfo() {
    const ticks = tickStats();
    return {
      id,
      code,
      phase,
      hostId,
      hostName: players.get(hostId)?.name || waiting.get(hostId)?.name || null,
      players: players.size,
      waiting: waiting.size,
      wave: waveNumber,
      tickMs: Math.round(lastTickMs * 100) / 100,
      tickAvgMs: Math.round(ticks.avgMs * 100) / 100,
      tickWorstMs: Math.round(ticks.worstMs * 100) / 100,
      tickSamples: ticks.samples,
      bytesSent: bytesSent(),
      lastTickAt,
      uptimeS: Math.round((Date.now() - createdAt) / 1000),
      campfire: { hp: Math.round(campfire.hp), maxHp: campfire.maxHp },
    };
  }

  // Profiler harness: drop a ring of enemies around the campfire so the
  // measurement pass can reproduce a crowded fight on demand. Debug-gated at
  // the HTTP layer; never reachable from a game client.
  function debugSpawnEnemies(count = 40, hp = 0, radius = 120) {
    if (phase !== 'running') return 0;
    const now = Date.now();
    let spawned = 0;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2;
      const ring = radius + (i % 5) * 12;
      monsterSeq += 1;
      const monster = new Zombie({ id: `enemy_${monsterSeq}`, x: campfire.x + Math.cos(angle) * ring,
        y: campfire.y + Math.sin(angle) * ring, now });
      if (hp > 0 && hp < monster.maxHp) monster.maxHp = hp;
      monster.hp = monster.maxHp;
      monsters.set(monster.id, monster);
      spawned += 1;
    }
    broadcastState(now);
    return spawned;
  }

  // Profiler harness: kill every enemy in one tick, which is the burst the
  // client sees after a Bombardier ultimate or an Electromancer chain.
  function debugKillAll() {
    let killed = 0;
    for (const monster of [...monsters.values()]) {
      if (monster.isDummy) continue;
      damageMonster(monster, monster.hp + 1, { ownerId: hostId, sourceAbility: 'debug' });
      if (monster.dead) killed += 1;
    }
    return killed;
  }

  // Test/debug shortcut: break every lobby training dummy in one tick, so a probe
  // can confirm that a dummy kill fires the same kill talents a real kill does.
  function debugKillDummies() {
    let killed = 0;
    for (const monster of [...monsters.values()]) {
      if (!monster.isDummy || monster.dead) continue;
      damageDummy(monster, monster.hp + 1, { ownerId: hostId, sourceAbility: 'debug' });
      if (monster.dead) killed += 1;
    }
    return killed;
  }

  return {
    id,
    code,
    isDefault,
    join, input, primaryHold, milestoneChoice, aim, fire, skill, ultimate,
    cancelTargeting, castBuffVote, leave,
    startRun: startRunBy,
    swapHero,
    start, stop, destroy,
    clearWave,
    // Break-phase introspection and a test/debug shortcut that ends the current
    // break phase immediately (so tests do not have to wait out REST/PRE_WAVE).
    breakInfo: () => (breakPhase ? { phase: breakPhase, endsAt: breakPhaseEndsAt } : null),
    skipBreakPhase: () => {
      if (!breakPhase) return false;
      breakPhaseEndsAt = Date.now() - 1;
      return true;
    },
    spawnWaitingPlayers: () => spawnWaitingPlayers(Date.now()),
    startCountdown: () => beginCountdown(Date.now()),
    // Skips the 3-2-1 wait; used by tests and the debug menu.
    startRunNow: () => {
      if (phase !== 'lobby' || players.size === 0) return false;
      beginCountdown(Date.now());
      startRun(Date.now());
      return true;
    },
    spawnDummies: () => spawnDummies(Date.now()),
    debugSpawnEnemies,
    debugKillAll,
    debugKillDummies,
    // Debug menu: set a player's Tower level (0..max) and re-derive their stats.
    debugSetTower: (level, playerId = hostId) => {
      const player = players.get(playerId);
      if (!player) return false;
      player.hero.buildingLevels.tower = clamp(Math.floor(Number(level) || 0), 0, GAME_CONFIG.arenaTuning.tower.maxLevel);
      recomputeHeroStats(player, Date.now());
      broadcastState(Date.now());
      return true;
    },
    // Debug menu: force a stat card onto the run as if it had been voted, then
    // re-derive every hero (so a Lv0 vs Lv3 comparison can be done live).
    debugAddStatCard: (cardId, playerId = hostId) => {
      const player = players.get(playerId);
      if (!player) return false;
      if (cardId === 'glass-cannon') {
        // Test-only: Glass Cannon is an effect card, but forcing it makes the
        // max-HP-clamp rule easy to verify.
        runBuffs.push({ id: 'glass-cannon', label: 'Glass Cannon', description: '', rare: true });
      } else if (GAME_CONFIG.towerScaledCards.includes(cardId)) {
        const stat = GAME_CONFIG.arenaTuning.cards.stat;
        const value = cardId === 'defense' ? stat.defense * 100 : stat[cardId];
        runBuffs.push({ id: cardId, label: cardId, value, description: '', rare: false });
      } else return false;
      recomputeAllHeroStats(Date.now());
      broadcastState(Date.now());
      return true;
    },
    // Live readout of every hero's derived stats (used by the debug menu).
    debugStats: () => [...players.values()].map((player) => ({
      id: player.id, heroId: player.heroId, name: player.name,
      towerLevel: player.hero.towerLevel ?? 0, towerMultiplier: player.hero.towerMultiplier ?? 1,
      maxHp: player.hero.maxHp, hp: player.hero.hp, attack: player.hero.attack,
      defense: player.hero.defense, speed: player.hero.speed,
    })),
    tickStats,
    // Test/debug shortcut: open the dawn milestone without clearing a wave.
    openMilestone: () => {
      if (phase !== 'running' || players.size === 0) return false;
      beginMilestone(waveNumber);
      broadcastState();
      return true;
    },
    dummyCount,
    snapshot,
    isDestroyed: () => destroyed,
    isEmpty: () => players.size + waiting.size === 0,
    emptySince: () => emptySince,
    playerCount: () => players.size,
    waitingCount: () => waiting.size,
    occupancy: () => players.size + waiting.size,
    hostId: () => hostId,
    phase: () => phase,
    countdownEndsAt: () => countdownEndsAt,
    debugInfo,
    info: () => ({ id, code, phase, hostId, players: players.size, waiting: waiting.size }),
    get players() { return players; },
    get projectiles() { return projectiles; },
    get monsters() { return monsters; },
    get campfire() { return campfire; },
  };
}

module.exports = { createRoom };
