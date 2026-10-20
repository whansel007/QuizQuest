const { HERO_CLASSES } = require('../../public/hero-lab/hero-list.js');
const { GAME_CONFIG } = require('../../public/hero-lab/game-config.js');
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
  const pickups = new Map();
  const traps = new Map();
  const timedEffects = [];
  const spawnTelegraphs = [];
  const pendingChains = [];
  const buffVotes = new Map();
  const campfireBonuses = new Map();
  let lastCampfireFeedbackAt = Number.NEGATIVE_INFINITY;
  let pendingCampfireDamage = 0;
  const runBuffs = [];
  let spawnQueue = [];
  let activeTwist = null;
  let partyKillCount = 0;
  let secondWindUsed = false;

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
  let dawnWave = 0;
  let dawnPending = new Set();
  let wavesCleared = 0;
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
    pickups.clear();
    traps.clear();
    timedEffects.length = 0;
    spawnTelegraphs.length = 0;
    pendingChains.length = 0;
    buffVotes.clear();
    buffVote = null;
    lastBuff = null;
    dawnWave = 0;
    dawnPending.clear();
    wavesCleared = 0;
    runBuffs.length = 0;
    spawnQueue = [];
    activeTwist = null;
    partyKillCount = 0;
    secondWindUsed = false;
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
      { id: 'campfire', label: 'Campfire Heart', value: GAME_CONFIG.arenaTuning.cards.stat.campfireHp, description: `Campfire max HP +${GAME_CONFIG.arenaTuning.cards.stat.campfireHp * 100}%; heals ${GAME_CONFIG.arenaTuning.cards.stat.campfireHealMissing * 100}% of missing HP.` },
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
    return {
      victory, reason, wavesReached: waveNumber, wavesCleared,
      kills: player?.kills || 0, damageDealt: Math.round(player?.damageDealt || 0),
      bonusDamage: Math.round(player?.bonusDamage || 0),
      rewardCoins: Math.round(wavesCleared * GAME_CONFIG.arenaTuning.run.coinsPerWave * multiplier),
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
    if (card.id === 'glass-cannon') for (const { hero } of targets) {
      hero.attack *= 1 + effects.glassCannonAttack;
      hero.maxHp *= 1 + effects.glassCannonMaxHp;
      hero.hp = Math.min(hero.hp, hero.maxHp);
    }
  }

  function completeWave(now) {
    wavesCleared += 1;
    const missing = Math.max(0, campfire.maxHp - campfire.hp);
    campfire.hp = Math.min(campfire.maxHp, campfire.hp + missing * GAME_CONFIG.arenaTuning.waveMoments.clearedHealFraction);
    nsp.emit('wave_end', { wave: waveNumber });
    activeTwist = null;
    if (waveNumber % GAME_CONFIG.arenaTuning.run.milestoneEvery === 0) {
      dawnWave = waveNumber;
      dawnPending = new Set(players.keys());
      for (const player of players.values()) { player.dawnWaiting = true; player.keys = {}; player.primaryHeld = false; }
      nsp.emit('milestone_dawn', { wave: waveNumber, nextWave: waveNumber + 1 });
      return;
    }
    beginBuffVote(now);
  }

  function finishBuffVote(now) {
    if (!buffVote) return;
    const counts = new Map(buffVote.cards.map((card) => [card.id, 0]));
    for (const vote of buffVotes.values()) if (counts.has(vote)) counts.set(vote, counts.get(vote) + 1);
    const high = Math.max(0, ...counts.values());
    const tied = buffVote.cards.filter((card) => counts.get(card.id) === high);
    const chosen = tied[Math.floor(Math.random() * tied.length)] || buffVote.cards[0];
    if (chosen.rare) applyRunEffect(chosen);
    else for (const { hero } of players.values()) {
      if (chosen.id === 'maxHp') { const amount = hero.maxHp * chosen.value; hero.maxHp += amount; hero.hp += amount; }
      else if (chosen.id === 'attack') hero.attack *= 1 + chosen.value;
      else if (chosen.id === 'defense') hero.defense = Math.min(GAME_CONFIG.arenaTuning.cards.stat.defenseCap * 100, hero.defense + chosen.value);
      else if (chosen.id === 'speed') {
        hero.runBonuses ||= { speedBase: hero.speed, speedAdded: 0 };
        hero.runBonuses.speedBase ||= hero.speed;
        hero.runBonuses.speedAdded = Math.min(hero.runBonuses.speedBase * GAME_CONFIG.arenaTuning.cards.stat.speedCap,
          hero.runBonuses.speedAdded + hero.runBonuses.speedBase * chosen.value);
        hero.speed = hero.runBonuses.speedBase + hero.runBonuses.speedAdded;
      }
    }
    if (chosen.id === 'campfire') {
      const addedMax = campfire.maxHp * chosen.value;
      campfire.maxHp += addedMax;
      campfire.hp += (campfire.maxHp - campfire.hp) * GAME_CONFIG.arenaTuning.cards.stat.campfireHealMissing;
    }
    lastBuff = { ...chosen };
    runBuffs.push({ ...chosen });
    console.log(`[Hero Lab] Card picked: ${chosen.label} (${chosen.id})`);
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
    if (hasRunEffect('volatile')) explode({ x: player.x, y: player.y, radius: GAME_CONFIG.arenaTuning.cards.effects.volatileRadius,
      damage: GAME_CONFIG.arenaTuning.cards.effects.volatileDamage, knockback: GAME_CONFIG.arenaTuning.cards.effects.secondWindKnockback,
      ownerId: player.id, sourceAbility: 'volatile' }, now);
    player.downed = true;
    player.keys = {};
    player.primaryHeld = false;
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
    const safe = (event, handler) => (...args) => {
      try {
        return handler(...args);
      } catch (error) {
        console.error(`[Hero Lab] ${event} failed:`, error && error.stack || error);
        socket.emit('notice', 'The game could not complete that action. Please rejoin the World.');
      }
    };

    socket.on('join', safe('join', (payload) => {
      const heroId = payload?.heroId;
      const HeroClass = Object.hasOwn(HERO_CLASSES, heroId) ? HERO_CLASSES[heroId] : null;
      if (!HeroClass) return socket.emit('notice', 'Choose a valid hero to join the field.');
      if (gameEnded) return socket.emit('notice', 'The campfire has gone out. The run is over.');

      const existing = players.get(socket.id);
      const index = existing
        ? [...players.keys()].indexOf(socket.id) % SPAWNS.length
        : players.size % SPAWNS.length;
      const spawn = SPAWNS[index];
      const hero = new HeroClass();
      const user = socket.data.user;
      hero.buildingBonuses = { attackPercent: 0, attackMultiplier: 1, campfireMaxHpPercent: 0 };
      if (user) {
        if (!services.authenticate(socket.data.token)) return socket.disconnect(true);
        const levels = services.kingdomBuildings(user.id);
        for (const [building, buff] of Object.entries(GAME_CONFIG.buildingBuffs)) {
          const level = Math.max(0, Number(levels[building]) || 0);
          if (!buff.stat || (buff.type && buff.type !== hero.type)) continue;
          const amount = Math.min(GAME_CONFIG.arenaTuning.buildingBonuses.cap, level * GAME_CONFIG.arenaTuning.buildingBonuses.perLevel);
          if (buff.stat === 'campfireMaxHp') {
            if (!campfireBonuses.has(user.id)) {
              const hpBonus = GAME_CONFIG.campfire.hp * amount;
              campfire.maxHp += hpBonus;
              campfire.hp += hpBonus;
              campfireBonuses.set(user.id, hpBonus);
            }
            hero.buildingBonuses.campfireMaxHpPercent = amount;
          } else hero.buildingBonuses.attackPercent = amount;
        }
      }
      hero.buildingBonuses.attackMultiplier = 1 + hero.buildingBonuses.attackPercent;
      hero.attack *= hero.buildingBonuses.attackMultiplier;
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
        primaryHeld: false,
        kills: 0,
        damageDealt: 0,
        bonusDamage: 0,
        accountId: user?.id || null,
        bubbleRush: null,
        dawnWaiting: false,
        downed: false,
        momentumSamples: [],
        momentumReadySent: false,
      });
      const joinedPlayer = players.get(socket.id);
      for (const buff of runBuffs) applyRunEffect(buff, joinedPlayer);
      if (waveNumber === 0) startWave(Date.now());
      socket.emit('welcome', {
        you: socket.id,
        arena: { width: ARENA_CONFIG.width, height: ARENA_CONFIG.height },
      });
      broadcastState();
    }));

    socket.on('input', (input) => {
      const player = players.get(socket.id);
      if (!player || player.downed || player.dawnWaiting || !input || typeof input !== 'object') return;
      player.keys = Object.fromEntries(MOVEMENT_KEYS.map((key) => [key, input[key] === true]));
    });

    socket.on('primary_hold', (held) => {
      const player = players.get(socket.id);
      if (player) player.primaryHeld = held === true;
    });

    socket.on('milestone_choice', (choice) => {
      const player = players.get(socket.id);
      if (!player || !dawnWave || !dawnPending.has(socket.id)) return;
      dawnPending.delete(socket.id);
      player.dawnWaiting = false;
      if (choice === 'leave') {
        nsp.emit('player_leave', { playerId: player.id, x: player.x, y: player.y, emoji: player.emoji });
        socket.emit('run_result', makeRunResult(player, true, 'milestone'));
        players.delete(socket.id);
        buffVotes.delete(socket.id);
      }
      if (dawnPending.size === 0) {
        dawnWave = 0;
        if (players.size > 0) nextWaveAt = Date.now() + WAVE_BREAK_MS;
        else { gameEnded = true; resetGame(); }
      }
      broadcastState();
    });

    socket.on('aim', (aim) => {
      const player = players.get(socket.id);
      if (!player || player.downed || player.dawnWaiting || !Number.isFinite(aim?.x) || !Number.isFinite(aim?.y)) return;
      const length = Math.hypot(aim.x, aim.y);
      if (length > 0) {
        player.aim = { x: aim.x / length, y: aim.y / length };
        player.hero.aim = { ...player.aim };
      }
    });

    socket.on('fire', (mode, target) => {
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
    });

    socket.on('skill', () => {
      const player = players.get(socket.id);
      if (!player || player.downed || player.dawnWaiting || gameEnded) return;

      syncHeroAimAndPosition(player);
      const now = Date.now();
      if (player.bubbleRush) endBubbleRush(player, now);
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
      if (!player || player.downed || player.dawnWaiting || gameEnded) return;
      syncHeroAimAndPosition(player);
      const now = Date.now();
      if (!player.hero.canUseAbility('ultimate', now)) return;
      const result = player.hero.ultimate(now);
      if (!result || (typeof result !== 'object' && result !== true)) return;
      if (result.type === 'targeting') { broadcastState(now); return; }
      player.hero.useAbility('ultimate', now);
      nsp.emit('ability_used', { playerId: player.id, heroId: player.heroId, ability: 'ultimate' });
      if (result instanceof Projectile) addProjectile(player, result);
      else if (result.type === 'bubble_rush') {
        player.bubbleRush = { endsAt: now + result.durationMs, durationMs: result.durationMs,
          speedMultiplier: result.speedMultiplier, radius: result.popRadius, damage: result.damage };
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
        dawnPending.delete(socket.id);
        buffVotes.delete(socket.id);
        if (players.size === 0) resetGame();
        else if (dawnWave && dawnPending.size === 0) { dawnWave = 0; nextWaveAt = Date.now() + WAVE_BREAK_MS; }
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
    if (damage > 0) nsp.emit('hit', { type: 'monster', id: monster.id, x: monster.x, y: monster.y, damage,
      sourceId: source.ownerId, heroId: killer?.heroId || null, sourceAbility: source.sourceAbility || 'weapon', bonus: overloadActive,
      sourceX: killer?.x, sourceY: killer?.y,
      enemyType: monster.type, boss: Boolean(monster.isBoss), elite: Boolean(monster.isElite) });
    if (monster.dead) {
      monsters.delete(monster.id);
      partyKillCount += 1;
      if (killer) killer.kills = (killer.kills || 0) + 1;
      nsp.emit('monster_killed', { id: monster.id, x: monster.x, y: monster.y, sourceId: source.ownerId,
        heroId: killer?.heroId || null, sourceX: killer?.x, sourceY: killer?.y, emoji: monster.emoji, sourceAbility: source.sourceAbility || 'weapon',
        enemyType: monster.type, boss: Boolean(monster.isBoss), elite: Boolean(monster.isElite), finisher: Boolean(source.finisher) });
      if (hasRunEffect('scavenger') && Math.random() < GAME_CONFIG.arenaTuning.cards.effects.scavengerDropChance)
        dropPickup(monster.x, monster.y, GAME_CONFIG.arenaTuning.cards.effects.scavengerHeal, GAME_CONFIG.arenaTuning.cards.effects.scavengerLifetimeMs);
      if (activeTwist?.id === 'supply-drop' && partyKillCount % GAME_CONFIG.arenaTuning.waveTwists.supplyDropEveryKills === 0) {
        dropPickup(monster.x, monster.y, 0, GAME_CONFIG.arenaTuning.cards.effects.scavengerLifetimeMs, 'supply',
          GAME_CONFIG.arenaTuning.waveTwists.supplyDropHealFraction);
      }
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
    for (const monster of monsters.values()) {
      if (Math.hypot(monster.x-player.x, monster.y-player.y) > spec.distance + monster.radius) continue;
      damageMonster(monster, player.hero.attack * spec.damageMultiplier, { ownerId: player.id, sourceAbility: 'skill' });
      if (!monster.isBoss) {
        const dx=monster.x-player.x, dy=monster.y-player.y, length=Math.hypot(dx,dy)||1;
        monster.x += dx/length*(spec.knockback||0)*0.08; monster.y += dy/length*(spec.knockback||0)*0.08;
      }
    }
  }

  function explode(effect, now) {
    for (const monster of monsters.values()) {
      if (effect.excludeId === monster.id) continue;
      if (Math.hypot(monster.x-effect.x, monster.y-effect.y) <= effect.radius + monster.radius) {
        damageMonster(monster, effect.damage, { ownerId: effect.ownerId, sourceAbility: effect.sourceAbility || 'ultimate', finisher: effect.finisher });
        if (effect.stunMs && !monster.isBoss) monster.stunnedUntil = now + effect.stunMs;
        const dx=monster.x-effect.x, dy=monster.y-effect.y, length=Math.hypot(dx,dy)||1;
        if (!monster.isBoss) { monster.knockbackX=(dx/length)*(effect.knockback||0); monster.knockbackY=(dy/length)*(effect.knockback||0); }
      }
    }
    if (effect.heal) for (const player of players.values()) {
      if (Math.hypot(player.x-effect.x, player.y-effect.y) <= effect.radius) player.hero.heal(effect.heal);
    }
    const owner = players.get(effect.ownerId);
    nsp.emit('area_effect', { x: effect.x, y: effect.y, radius: effect.radius, kind: effect.kind || 'player', telegraphMs: 0,
      color: effect.color || GAME_CONFIG.heroFxColors[owner?.heroId]?.primary || '#ff9c45',
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
        twist: activeTwist,
      },
      boss: (() => { const boss = [...monsters.values()].find((monster) => monster.isBoss); return boss ? { hp: Math.max(0, Math.round(boss.hp)), maxHp: boss.maxHp, name: 'Brute King' } : null; })(),
      gameEnded,
      dawn: dawnWave ? { wave: dawnWave, decisionsRemaining: dawnPending.size } : null,
      serverTime: now,
      buffVote: buffVote ? { wave: buffVote.wave, cards: buffVote.cards, endsAt: buffVote.endsAt,
        voteCount: buffVotes.size, votes: Object.fromEntries(buffVotes) } : null,
      lastBuff,
      activeBuffs: runBuffs.map((buff) => ({ ...buff })),
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
        isBoss: Boolean(monster.isBoss), isElite: Boolean(monster.isElite),
        scale: monster.scale || 1,
        fuseRemainingMs: Math.max(0, (monster.fuseUntil || 0) - now),
        stunned: monster.stunnedUntil > now,
        trapped: Boolean(monster.trappedBy),
        skeletonWindupMs: Math.max(0, (monster.windupUntil || 0) - now),
      })),
      players: [...players.values()].map(({ id, heroId, hero, name, emoji, x, y, aim, downed, respawnRemainingMs, respawnDurationMs, respawnSpeedMultiplier, momentumActive, dawnWaiting, bubbleRush }) => ({
        id, heroId, name, emoji: hero.visual || emoji, type: hero.type, x: Math.round(x), y: Math.round(y), aim: { ...aim },
        talent: hero.talent, targeting: hero.targetingUntil > now,
        dashing: heroId === 'guardian' ? hero.dashingUntil > now || Boolean(players.get(id)?.controlledBurst && players.get(id).controlledBurst.until > now) : Boolean(players.get(id)?.dashState && players.get(id).dashState.until > now),
        downed: Boolean(downed), respawnRemainingMs: respawnRemainingMs || 0, respawnDurationMs: respawnDurationMs || 0,
        respawnSpeedMultiplier: respawnSpeedMultiplier || 1, momentumActive: Boolean(momentumActive), dawnWaiting: Boolean(dawnWaiting),
        bubbleRush: bubbleRush ? { remainingMs: Math.max(0, bubbleRush.endsAt - now), durationMs: bubbleRush.durationMs } : null,
        buildingBonuses: { ...hero.buildingBonuses },
        overchargeShots: players.get(id)?.overchargeShots || 0,
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
    for (const player of players.values()) if (player.bubbleRush && now >= player.bubbleRush.endsAt) endBubbleRush(player, now);
    for (const player of players.values()) {
      if (player.downed || player.dawnWaiting) continue;
      const dx = Number(player.keys.right) - Number(player.keys.left);
      const dy = Number(player.keys.down) - Number(player.keys.up);
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        const burst = Math.max(player.controlledBurst && player.controlledBurst.until > now ? player.controlledBurst.speedMultiplier : 1,
          player.bubbleRush?.speedMultiplier || 1,
          activeTwist?.id === 'fast-night' ? 1 + GAME_CONFIG.arenaTuning.waveTwists.fastNightHeroSpeed : 1);
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
      if (player.downed || player.dawnWaiting) continue;
      syncHeroAimAndPosition(player);
      if(player.heroId==='guardian' && player.hero.dashingUntil>now) player.hero.makeInvulnerable(player.hero.dashingUntil-now,now);
      if (player.controlledBurst) {
        if (now >= player.controlledBurst.until) player.controlledBurst = null;
        else {
          player.hero.makeInvulnerable(player.controlledBurst.until - now, now);
          const dash = player.controlledBurst;
          for (const monster of monsters.values()) {
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
      if (proj.stunMs > 0 && proj.explosionRadius > 0) {
        for (const monster of monsters.values()) {
          if (proj.hitTargets.has(monster.id) || Math.hypot(monster.x-proj.x,monster.y-proj.y) > proj.explosionRadius+monster.radius) continue;
          proj.hitTargets.add(monster.id);
          damageMonster(monster,proj.damage,{ownerId:proj.ownerId,sourceAbility:'skill'});
          if (!monster.isBoss) monster.stunnedUntil=now+proj.stunMs;
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

    if (buffVote && buffVote.endsAt > 0 && now >= buffVote.endsAt) finishBuffVote(now);

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
      if (pendingCampfireDamage > 0) {
        nsp.emit('campfire_hit', { x: campfire.x, y: campfire.y, damage: pendingCampfireDamage });
        pendingCampfireDamage = 0;
      }
      for (const player of players.values()) {
        nsp.to(player.id).emit('run_result', makeRunResult(player, false, 'campfire'));
        nsp.to(player.id).emit('game_over', { reason: 'campfire' });
      }
      players.clear();
      resetGame();
    }
    if (buffVote && players.size > 0 && [...players.keys()].every((id) => buffVotes.has(id))) finishBuffVote(now);
    if (players.size === 0 && waveNumber > 0) resetGame();

    // 8. Start a five-second break only after every enemy in the wave is gone.
    if (
      players.size > 0 && !gameEnded && !buffVote && !dawnWave && waveNumber > 0 && enemiesLeftToSpawn === 0 && spawnTelegraphs.length === 0
      && monsters.size === 0 && nextWaveAt === 0
    ) {
      completeWave(now);
    }

    broadcastState(now);
  }, 1000 / ARENA_CONFIG.tickHz);

  return { stop: () => clearInterval(loop), players, projectiles, monsters, campfire };
}

module.exports = { attachHeroLab, ARENA_CONFIG, W: ARENA_CONFIG };
