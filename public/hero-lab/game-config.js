// One place for values that shape combat and game feel. Hero definitions may
// override the defaults, while the server remains the authority for timing.
// The primary colors are also the hue family for every client-side weapon
// effect. Keep all projectile, trail, flash, spark and bounce colors sourced here.
import { ELECTRO_STUN_PROJECTILE_SCALE, ELECTRO_STUN_RADIUS_SCALE, PARTICLE_CAP,
  KILL_SOUND_MIN_INTERVAL_MS, HIT_SOUND_MIN_INTERVAL_MS,
  SHERIFF_KILL_REFUND_S, GUARDIAN_ULT_RAMP_PER_HIT, GUARDIAN_ULT_RAMP_CAP,
  GUARDIAN_SLAM_RADIUS, GUARDIAN_SLAM_DAMAGE_MULT, GUARDIAN_SLAM_KNOCKBACK,
  GUARDIAN_ULT_EARLY_END, GUARDIAN_BRACE_ENABLED, GUARDIAN_BRACE_REDUCTION,
  GUARDIAN_BRACE_DURATION_S, BUILDING_BONUS_PER_LEVEL, BUILDING_LEVEL_CAP,
  TOWER_BONUS_PER_LEVEL, TOWER_MAX_LEVEL,
  ELECTRO_CHAIN_REFUND_PCT, ELECTRO_STUN_REFUND_MULT, ELECTRO_ULT_MIN_LOCKOUT_S,
  ELECTRO_CHAIN_COUNTER_SCALE, ELECTRO_CHAIN_COUNTER_MS, ELECTRO_CHAIN_COUNTER_POP_MS, ELECTRO_OVERLOAD_FLASH_MS,
  ELECTRO_OVERLOAD_FEEDBACK_MS, SHERIFF_BLAST_REFUND_CAP_S, SHERIFF_READY_RING_MS,
  SHERIFF_READY_BOUNCE_MS, SHERIFF_REFUND_LABEL_MS, SHERIFF_REFUND_MERGE_MS,
  SHERIFF_REFUND_PULSE_MS, SHERIFF_REFUND_POPUP_MS, READY_GLOW_PERIOD_MS, SHERIFF_REFUND_GROUP_TTL_MS, SHERIFF_READY_SOUND,
  COOLDOWN_RING_TRANSITION_MS,
  REST_DURATION_S, BOSS_REST_DURATION_S, VOTE_DURATION_S, PRE_WAVE_S, DAWN_DECISION_TIMEOUT_S,
  CONFETTI_COUNT, CONFETTI_DURATION_S,
  CONFETTI_BANNER_MS, CONFETTI_BURST_INSET_PX, CONFETTI_BURST_SPREAD_PX,
  CONFETTI_BURST_SPEED_MIN, CONFETTI_BURST_SPEED_MAX,
  CONFETTI_PIECE_MIN_PX, CONFETTI_PIECE_MAX_PX, CONFETTI_FALL_GRAVITY, CONFETTI_DRAG,
  CONFETTI_SWAY_PX, CONFETTI_SPIN_TURNS_MAX, CONFETTI_QUALITY_FACTOR, CONFETTI_COLORS,
  GUARDIAN_DASH_KILL_EXTENSION_S, GUARDIAN_RUSH_DISTANCE, GUARDIAN_RUSH_DURATION_S, GUARDIAN_RUSH_IFRAME_AFTER_S,
  GUARDIAN_FAN_ANGLE_DEG, GUARDIAN_FAN_RADIUS, GUARDIAN_FAN_DAMAGE_MULT, GUARDIAN_FAN_KNOCKBACK, GUARDIAN_FAN_KNOCKBACK_MS, GUARDIAN_FAN_FADE_MS,
  PILOT_MECH_COOLDOWN_CUT_S, PILOT_MECH_CYCLE_CAP_PCT,
  BUBBLES_TRAP_KILL_REFUND,
  BASE_CAMPFIRE_HP, SUMMON_BANNER_TITLE, SUMMON_BANNER_SUBTITLE, SUMMON_BANNER_ORDER,
  SUMMON_MULTI_DISCOUNT, SUMMON_SHOW_DETAILS } from '../../config/tuning.js';

// Shared crowd-control tuning. These named values are used by server-side
// monster effects and by the client renderer for their matching indicators.
export const HOLD_REHOLD_IMMUNITY_MS = 1500;
export const HELD_ENEMY_TINT = '#b9a8d8';
export const SLOWED_ENEMY_TINT = '#74d9d0';
export const PUSH_DEFAULT_DURATION_MS = 150;
export const DUMMY_PUSH_MULTIPLIER = 1.5;
export const DEBUG_PUSH_DISTANCE_PX = 120;
export const DEBUG_PUSH_DURATION_MS = 300;
export const DEBUG_STATUS_DURATION_MS = 2000;
export const DEBUG_SLOW_PCT = 0.3;
export const HOLD_SWIRL_RADIUS_PX = 7;
export const HOLD_SWIRL_Y_OFFSET_PX = 34;
export const HOLD_SWIRL_LINE_WIDTH = 2;
export const HOLD_SWIRL_SPRITE_SIZE = 32;

// Fairy combat tuning. These values are shared by server hitboxes and effects.
export const FAIRY_FX_PRIMARY = '#FF8AD8';
export const FAIRY_FX_SECONDARY = '#FFB3E0';
export const VORTEX_EYE_COLOR = '#D94A9B';
export const VORTEX_CORE_COLOR = '#05030F';
export const FAIRY_WEAPON_COOLDOWN_MS = 350;
export const FAIRY_SKILL_COOLDOWN_MS = 12000;
export const FAIRY_ULTIMATE_COOLDOWN_MS = 40000;
export const WIND_ARROW_SPEED = 650;
export const WIND_ARROW_RANGE = 380;
export const WIND_ARROW_DAMAGE_MULT = 0.7;
export const WIND_ARROW_PIERCE_COUNT = 1;
export const WIND_ARROW_PUSH_PX = 50;
export const WIND_ARROW_PUSH_MS = 150;
export const GALE_SPEED = 520;
export const GALE_RANGE = 360;
export const GALE_RADIUS = 150;
export const GALE_DAMAGE_MULT = 0.4;
export const GALE_PUSH_PX = 220;
export const GALE_PUSH_MS = 300;
export const CAMPFIRE_PUSH_ZONE_RADIUS = 250;
export const VORTEX_SPEED = 450;
export const VORTEX_RANGE = 420;
export const VORTEX_RADIUS = 180;
export const VORTEX_DURATION_S = 4;
export const VORTEX_PULL_S = 0.4;
export const VORTEX_LATE_PULL_MS = 120;
export const VORTEX_DPS_MULT = 0.35;
export const VORTEX_DAMAGE_TICK_MS = 250;
export const VORTEX_PULL_SPEED_PX_S = 600;
export const VORTEX_END_PUSH_PX = 18;
export const VORTEX_END_PUSH_MS = 140;
export const VORTEX_END_DAMAGE_MULT = 0;
export const FAIRY_SLOW_PCT = 0.3;
export const FAIRY_SLOW_DURATION_S = 2;
export const VORTEX_CORE_RADIUS_PX = 34;
export const VORTEX_DISK_TILT = 0.55;
export const VORTEX_ZOOM_PULSE = true;
export const VORTEX_POP_STILL_MS = 100;
export const VORTEX_DEBRIS_POOL_SIZE = 16;
export const VORTEX_DEBRIS_SPAWN_MS = 100;
export const VORTEX_RIPPLE_INTERVAL_MS = 500;
export const VORTEX_RIPPLE_DURATION_MS = 700;
export const FAIRY_GALE_SHAKE_MULT = 0.3;
export const VORTEX_GROUND_FILL = '#1A0B2E';
export const VORTEX_FORMATION_FLASH_MS = 80;
export const VORTEX_CORE_GROW_MS = 150;
export const VORTEX_SHOCKWAVE_MS = 250;
export const VORTEX_CORE_PULSE_HZ = 2;
export const VORTEX_DISK_ROTATION_HZ = 0.6;
export const VORTEX_DISK_OUTER_RADIUS_PX = 75;
export const VORTEX_LENS_ARC_DEG = 120;
export const VORTEX_COLLAPSE_MS = 400;
export const VORTEX_FLASH_POP_MS = 120;
export const VORTEX_POP_RING_MS = 180;
export const VORTEX_POP_SPARK_COUNT = 10;
export const VORTEX_ZOOM_SCALE = 1.03;
export const VORTEX_ZOOM_DURATION_MS = 250;
export const FAIRY_GALE_WIND_LINES = 4;
export const FAIRY_ARROW_IMPACT_LINES = 3;
export const FAIRY_ARROW_TRAIL_COUNT = 3;
export const FAIRY_MUZZLE_PUFF_RADIUS_PX = 7;
export const FAIRY_GALE_VFX_DURATION_MS = 420;
export const FAIRY_WIND_IMPACT_MS = 260;

// Engineer turret targeting and durability (Stage 1 systems).
export const TURRET_HP = 150;
export const TURRET_AMMO_MAX = 40;
export const TURRET_AMMO_INITIAL = Math.floor(TURRET_AMMO_MAX / 2);
export const TURRET_FIRE_RATE = 2.5;
export const TURRET_TARGET_REEVAL_MS = 100;
export const TURRET_TARGET_REEVAL_STAGGER_MS = 100;
export const TURRET_PROJECTILE_POOL_MAX = 64;
export const TURRET_BULLET_RADIUS_PX = 4;
export const TURRET_MUZZLE_OFFSET_PX = 24;
export const TURRET_DAMAGE_MULT = 0.5;
export const TURRET_RANGE = 260;
export const TURRET_BULLET_SPEED = 600;
export const TURRET_TURN_RATE_DEG_S = 540;
export const TURRET_FIRE_CONE_DEG = 8;
export const TURRET_DEPLOY_S = 0.4;
export const TURRET_RADIUS = 22;
export const ENGINEER_TURRETS_TAUNT = true;
export const TURRET_AGGRO_RADIUS = 220;
export const TARGET_REEVAL_MS = 500;
export const TARGET_LOCK_MS = 1500;
// Engineer kit tuning; shared by the authoritative room and matching client visuals.
export const ENGINEER_WRENCH_SPEED = 1200;
export const ENGINEER_WRENCH_RANGE = 300;
export const ENGINEER_WRENCH_DAMAGE_MULT = 0.9;
export const ENGINEER_WRENCH_PUSH = 30;
export const ENGINEER_WRENCH_MAX_S = 2;
export const ENGINEER_WRENCH_COOLDOWN_S = 0.35;
export const ENGINEER_WRENCH_SPIN_RAD_S = Math.PI * 12;
export const ENGINEER_WRENCH_CATCH_RADIUS = 24;
export const ENGINEER_WRENCH_RADIUS = 13;
export const ENGINEER_PLACE_RANGE = 140;
export const ENGINEER_SKILL_COOLDOWN_S = 18;
export const ENGINEER_ULTIMATE_COOLDOWN_S = 40;
export const ENGINEER_MAX_TURRETS = 2;
export const TURRET_MIN_CAMPFIRE_DIST = 50;
export const TURRET_MIN_SPACING = 60;
export const ENGINEER_TURRET_SNAP_RADIUS = 60;
export const ENGINEER_TURRET_SNAP_STEP = 10;
export const ENGINEER_TURRET_SNAP_SLICES = 24;
export const ENGINEER_LASER_CHARGE_S = 0.4;
export const ENGINEER_LASER_LOCK_LAST_S = 0.1;
export const ENGINEER_LASER_MOVE_FACTOR = 0.3;
export const ENGINEER_LASER_LENGTH = 900;
export const ENGINEER_LASER_WIDTH = 70;
export const ENGINEER_LASER_DURATION_S = 0.25;
export const ENGINEER_LASER_DAMAGE_MULT = 6;
export const ENGINEER_KILL_AMMO = 3;
export const ENGINEER_KILL_HEAL_PCT = 0.05;
export const ENGINEER_SALVAGE_FLIGHT_MS = 250;
export const ENGINEER_SALVAGE_PULSE_MS = 100;
export const ENGINEER_SALVAGE_POPUP_MERGE_MS = 300;
export const ENGINEER_SALVAGE_POPUP_MS = 500;
export const TURRET_VISUALS = Object.freeze({ body: null, barrel: null, bodySize: { w: 44, h: 32 }, barrelPivot: { x: 22, y: 14 },
  barrelLength: 26, recoilPx: 3, recoilMs: 80, muzzleFlashMs: 60, muzzleFlashRadiusPx: 5, barWidth: 40,
  hpBarHeight: 5, ammoSegments: 10, ammoPerSegment: 4, barOffsetY: 22,
  idleSwayAmplitudeRad: 0.035, idleSwaySpeed: 0.002, deployDustCount: 5, destroyDebrisCount: 6 });
export const VORTEX_GROUND_RING_WIDTH_PX = 4;
export const VORTEX_GROUND_DASH_ON_PX = 14;
export const VORTEX_GROUND_DASH_OFF_PX = 10;
export const VORTEX_GROUND_FILL_ALPHA = 0.28;
export const VORTEX_SUSTAIN_FADE_MS = 200;
export const VORTEX_DEBRIS_LIFETIME_MS = 900;
export const VORTEX_POP_STILL_CORE_PX = 12;

// The only buff cards the Tower scales. Extend this list (one line) to make the
// Tower scale another stat card later. The campfire card and all rare effect
// cards are deliberately excluded.
export const TOWER_SCALED_CARDS = Object.freeze(['maxHp', 'attack', 'defense', 'speed']);

export const HERO_FX_COLORS = Object.freeze({
  sheriff: { primary: '#f5c84c', highlight: '#fff1b8' },
  guardian: { primary: '#4aaeff', highlight: '#c8eaff' },
  pilot: { primary: '#ff9e45', highlight: '#ffe0a8' },
  bombardier: { primary: '#ff7838', highlight: '#ffd0a8' },
  bubbles: { primary: '#55dfff', highlight: '#c6f8ff' },
  // `core` is the white-hot centre of the orb's glow sprite. It is tinted
  // toward the primary hue so the orb reads as one colour instead of a
  // purple halo around a cool white dot.
  electromancer: { primary: '#b17cff', highlight: '#e4d2ff', core: '#f7f2ff' },
  fairy: { primary: FAIRY_FX_PRIMARY, highlight: '#fff0fa' },
  engineer: { primary: '#FF9F1C', highlight: '#FFD27A' },
});
export const HERO_FX_SECONDARY = Object.freeze({ fairy: FAIRY_FX_SECONDARY, engineer: '#9AA7B8' });

// Ability button icons: the single source of truth for the HUD ability
// clusters, the World-page hero preview and the Settings icon-credits entry.
// Paths are relative to hero-lab/. Every file is a CC BY 3.0 icon from
// game-icons.net with the library background rect removed and the silhouette
// fill switched to currentColor; per-icon provenance lives in
// assets/icons/CREDITS.json.
export const ABILITY_ICONS = Object.freeze({
  sheriff: Object.freeze({
    primary: 'assets/icons/sheriff-primary.svg',
    skill: 'assets/icons/sheriff-skill.svg',
    ultimate: 'assets/icons/sheriff-ultimate.svg',
    talent: 'assets/icons/sheriff-talent.svg',
  }),
  pilot: Object.freeze({
    primary: 'assets/icons/pilot-primary.svg',
    skill: 'assets/icons/pilot-skill.svg',
    ultimate: 'assets/icons/pilot-ultimate.svg',
    talent: 'assets/icons/pilot-talent.svg',
    // Swapped in while the Mech Suit is up (MECH_ICON_SWAP).
    mechPrimary: 'assets/icons/pilot-mechPrimary.svg',
    mechSkill: 'assets/icons/pilot-mechSkill.svg',
  }),
  guardian: Object.freeze({
    primary: 'assets/icons/guardian-primary.svg',
    skill: 'assets/icons/guardian-skill.svg',
    ultimate: 'assets/icons/guardian-ultimate.svg',
    talent: 'assets/icons/guardian-talent.svg',
  }),
  bombardier: Object.freeze({
    primary: 'assets/icons/bombardier-primary.svg',
    skill: 'assets/icons/bombardier-skill.svg',
    ultimate: 'assets/icons/bombardier-ultimate.svg',
    talent: 'assets/icons/bombardier-talent.svg',
  }),
  bubbles: Object.freeze({
    primary: 'assets/icons/bubbles-primary.svg',
    skill: 'assets/icons/bubbles-skill.svg',
    ultimate: 'assets/icons/bubbles-ultimate.svg',
    talent: 'assets/icons/bubbles-talent.svg',
  }),
  electromancer: Object.freeze({
    primary: 'assets/icons/electromancer-primary.svg',
    skill: 'assets/icons/electromancer-skill.svg',
    ultimate: 'assets/icons/electromancer-ultimate.svg',
    talent: 'assets/icons/electromancer-talent.svg',
  }),
  fairy: Object.freeze({
    primary: 'assets/icons/fairy-primary.svg',
    skill: 'assets/icons/fairy-skill.svg',
    ultimate: 'assets/icons/fairy-ultimate.svg',
    talent: 'assets/icons/fairy-talent.svg',
  }),
  engineer: Object.freeze({
    primary: 'assets/icons/engineer-primary.svg',
    skill: 'assets/icons/engineer-skill.svg',
    ultimate: 'assets/icons/engineer-ultimate.svg',
    talent: 'assets/icons/engineer-talent.svg',
  }),
});

// Slots that sit on the amber highlight colour family instead of the hero's
// own type family. Stage 2 reads this next to the button colours above.
export const ABILITY_BTN_HIGHLIGHT = Object.freeze({
  sheriff: Object.freeze(['skill']),
  pilot: Object.freeze(['ultimate']),
  guardian: Object.freeze(['ultimate']),
  bombardier: Object.freeze(['primary']),
  bubbles: Object.freeze(['skill']),
  electromancer: Object.freeze(['ultimate']),
  fairy: Object.freeze([]),
});

// While Pilot's Mech Suit is up the weapon slot shows the mech punch and moves
// onto the highlight family; the ultimate keeps its normal type colour.
export const ABILITY_BTN_HIGHLIGHT_MECH = Object.freeze({ pilot: Object.freeze(['primary']) });

// Values from the arena update brief live together here so effects and later
// workstreams can be tuned without scattering constants through the logic.
export const ARENA_TUNING = Object.freeze({
  hitFlashMs: 80,
  knockback: { normalMinPx: 6, normalMaxPx: 12, killPx: 20, bruteMultiplier: 0.5, kingMultiplier: 0, visualMs: 150 },
  deathBurst: { particlesMin: 4, particlesMax: 6, durationMinMs: 300, durationMaxMs: 400, scaleStart: 1, scalePeak: 1.25, scaleEnd: 0 },
  damageNumbers: { risePx: 40, durationMs: 600, mergeMs: 150, maxVisible: 20, teammateOpacity: 0.5, bonusScale: 1.25, knockbackScaleDamage: 10 },
  muzzleFlash: { frames: 2, durationMs: 60, recoilMinPx: 2, recoilMaxPx: 4 },
  impactSparks: { particlesMin: 3, particlesMax: 4, durationMs: 150 },
  screenShake: { heroHitMinPx: 2, heroHitMaxPx: 3, heroHitMs: 100, majorMinPx: 6, majorMaxPx: 10, majorMs: 200 },
  killStreak: { windowMs: 2000, scaleStart: 1, scalePeak: 1.3, scaleEnd: 1 },
  lowHp: { threshold: 0.3, pulseHz: 1 },
  areaEffects: { enemyTelegraphMs: 800, targetedTelegraphMs: 600, detonationMs: 200, ringStartScale: 0.6 },
  campfire: { healRadius: 150, healPerSecondPercent: 0.015, healParticleIntervalMs: 400, contactDamageCooldownMs: 1500, alertCooldownMs: 1000 },
  sound: {
    shotPitchVariance: 0.08, maxVoices: 6, killSemitonePerStep: 1, maxKillPitchSteps: 8, heartbeatIntervalMs: 650, defaultMasterVolume: 0.55,
    profiles: {
      shoot: { frequency: 500, durationMs: 55, gain: 0.08, type: 'square' }, hit: { frequency: 180, durationMs: 70, gain: 0.09, type: 'triangle', minIntervalMs: HIT_SOUND_MIN_INTERVAL_MS },
      turretDeploy: { frequency: 420, slideTo: 680, durationMs: 130, gain: 0.09, type: 'triangle' },
      turretDestroy: { frequency: 180, slideTo: 65, durationMs: 280, gain: 0.16, type: 'triangle' },
      engineerWrenchCatch: { frequency: 980, slideTo: 360, durationMs: 110, gain: 0.12, type: 'triangle' },
      engineerCharge: { frequency: 360, durationMs: 1, gain: 0.028, type: 'sine' },
      engineerLaser: { frequency: 210, slideTo: 58, durationMs: 420, gain: 0.2, type: 'sawtooth' },
      kill: { frequency: 580, durationMs: 150, gain: 0.12, type: 'sine', minIntervalMs: KILL_SOUND_MIN_INTERVAL_MS }, pickup: { frequency: 900, durationMs: 180, gain: 0.1, type: 'sine' },
      abilityReady: { frequency: 760, durationMs: 110, gain: 0.08, type: 'sine' }, ultimateReady: { frequency: 990, durationMs: 220, gain: 0.1, type: 'sine' },
      dynamiteReady: SHERIFF_READY_SOUND,
      ultimateCast: { frequency: 360, durationMs: 300, gain: 0.12, type: 'sawtooth' }, explosion: { frequency: 95, durationMs: 260, gain: 0.18, type: 'triangle' },
      fairyWhoosh: { frequency: 720, slideTo: 260, durationMs: 360, gain: 0.07, type: 'sine', minIntervalMs: 100 },
      fairyTravel: { frequency: 240, durationMs: 1, gain: 0.018, type: 'sine' },
      fairyHum: { frequency: 54, durationMs: 1, gain: 0.035, type: 'sine' },
      fairyPoof: { frequency: 420, slideTo: 110, durationMs: 320, gain: 0.1, type: 'triangle', minIntervalMs: 160 },
      campfireDamaged: { frequency: 125, durationMs: 220, gain: 0.14, type: 'sawtooth' }, heroDowned: { frequency: 110, durationMs: 420, gain: 0.16, type: 'sawtooth' },
      heroRespawn: { frequency: 520, durationMs: 340, gain: 0.12, type: 'sine' }, waveStart: { frequency: 660, durationMs: 320, gain: 0.12, type: 'sine' },
      waveEnd: { frequency: 880, durationMs: 480, gain: 0.12, type: 'sine' }, cardPick: { frequency: 740, durationMs: 170, gain: 0.1, type: 'triangle' },
      bossSpawn: { frequency: 65, durationMs: 600, gain: 0.22, type: 'sawtooth' }, uiClick: { frequency: 600, durationMs: 45, gain: 0.06, type: 'square' },
      heartbeat: { frequency: 55, durationMs: 100, gain: 0.1, type: 'sine' },
      // Kingdom town: quiet, soft cues (the hop is rate-limited so walking never chatters).
      townHop: { frequency: 260, slideTo: 420, durationMs: 90, gain: 0.03, type: 'sine', minIntervalMs: 340 },
      townGreet: { frequency: 620, slideTo: 760, durationMs: 140, gain: 0.045, type: 'sine' },
      townEmote: { frequency: 700, slideTo: 980, durationMs: 120, gain: 0.04, type: 'triangle' },
      townOpen: { frequency: 520, durationMs: 80, gain: 0.035, type: 'sine' },
    },
  },
  waveMoments: { bannerMs: 1500, bannerMaxMs: 2000, bannerScaleStart: 1, bannerScalePeak: 1.3, bannerScaleEnd: 1, clearedBannerMs: 1000, clearedHealFraction: 0.1, bossZoom: 1.05, bossZoomMs: 300, abilityReadyPulseMs: 300 },
  briefing: { durationMs: 8000, fadeMs: 300, spawnTelegraphMs: 500, skeletonWindupMs: 400 },
  momentum: { bonus: 0.2, distancePx: 30, windowMs: 500, glowAlpha: 0.35, fadeMs: 150, streakCount: 3, streakLifeMs: 120, readyRisePx: 30, readyMs: 700, idleNudgeMs: 4000, nudgeDurationMs: 2500, nudgeMaxPerSession: 2 },
  performance: { hudUpdateMs: 100, aimUpdateMs: 40, projectileTrailIntervalMs: 50, maxParticles: PARTICLE_CAP },
  respawn: { baseMs: 12000, teammateSpeedMultiplier: 2.5, soloMs: 6000, soloCampfireCost: 0.1, respawnHpFraction: 0.5, invulnerabilityMs: 2000, flashIntervalMs: 120 },
  run: { milestoneEvery: 10, coinsPerWave: 5, victoryRewardMultiplier: 1.5, defeatRewardMultiplier: 0.5, sessionRuns: 3, bossTeaserWave: 5, leaveFadeMs: 400 },
  buildingBonuses: { perLevel: BUILDING_BONUS_PER_LEVEL, levelCap: BUILDING_LEVEL_CAP },
  // Tower: a per-player multiplier on the four stat cards, applied to that
  // player's OWN hero. towerMultiplier = 1 + bonusPerLevel * level.
  // Final stats are DERIVED (see computeHeroStats in room.js), in this order:
  //   attack  = baseAttack * (1 + libraryOrWorkshopBonus) * (1 + sumAttackCards  * towerMult) * glassCannonAttack
  //   maxHp   = baseHP     * (1 + sumMaxHpCards * towerMult) * glassCannonMaxHp
  //   defense = min(DEFENSE_CAP, baseDefense + sumDefenseCards * towerMult)   (points, base kept)
  //   speed   = baseSpeed  * (1 + min(SPEED_CARD_CAP, sumSpeedCards * towerMult))
  // Same-stat cards add together, then the Tower multiplier scales that sum;
  // caps apply AFTER the multiplier.
  tower: { bonusPerLevel: TOWER_BONUS_PER_LEVEL, maxLevel: TOWER_MAX_LEVEL, scaledCards: TOWER_SCALED_CARDS },
  gachaReveal: { buildUpMs: 1500, rarityStars: { common: 3, rare: 4, epic: 5 }, flashColors: { common: '#ffffff', rare: '#4f8df7', epic: '#f5c84c' } },
  progression: { newPlayerHeroes: ['sheriff', 'electromancer'], alternativeMagicStarter: 'bubbles', heroRarityStars: 4,
    buildingEffectExamples: { library: { level: 3, bonusPercent: 0.12 }, workshop: { level: 2, bonusPercent: 0.08 }, garden: { level: 4, bonusPercent: 0.2 } } },
  examples: { sheriffBulletRange: { arenaWidth: 1280, arenaHeight: 720, pixels: 550 }, cardOfferCount: 3, rareEffectCardCount: 1, effectCardPoolCount: 10 },
  acceptance: { simulatedEnemies: 40, simulatedPlayers: 4 },
  enemies: {
    base: { zombieHp: 20, skeletonHp: 20, devilHp: 30 },
    brute: { firstWave: 4, hp: 120, speedFraction: 0.25, scale: 1.6, knockbackMultiplier: 0.5 },
    exploder: { firstWave: 7, hp: 15, speedFraction: 0.8, damage: 30, campfireRadius: 100, fuseMs: 800, deathRadius: 60, deathDamageFraction: 0.5 },
    bruteKing: { everyWaves: 5, scale: 2, firstHp: 1500, laterHpMultiplier: 0.6, slamIntervalMs: 6000, slamTelegraphMs: 800, slamRadius: 140, slamDamage: 45, escorts: 6 },
    wave: { baseCount: 10, countPerWave: 4, hpPerWave: 0.08, damagePerWave: 0.06, soloCap: 40, fourPlayerCap: 70, countPerAdditionalPlayer: 0.5, defenseReductionCap: 0.5 },
    spawnAvoidHeroRadius: 150,
    spawnPositionAttempts: 40,
  },
  waveTwists: { everyWaves: 3, hordeCountMultiplier: 2, hordeHpMultiplier: 0.5, fastNightEnemySpeed: 0.2, fastNightHeroSpeed: 0.2, supplyDropEveryKills: 10, supplyDropHealFraction: 0.15 },
  cards: {
    voteMs: VOTE_DURATION_S * 1000,
    firstEffectWave: 3,
    stat: { maxHp: 0.2, attack: 0.15, defense: 0.1, defenseCap: 0.5, speed: 0.08, speedCap: 0.4, campfireHp: 0.25 },
    effects: {
      thornsDamagePerSecond: 10, thornsRadius: 80,
      scavengerDropChance: 0.05, scavengerHeal: 10, scavengerLifetimeMs: 8000,
      overchargeEveryShots: 10, overchargeMultiplier: 3,
      rallyCooldownReduction: 0.2,
      glassCannonAttack: 0.4, glassCannonMaxHp: -0.25,
      secondWindHp: 0.3, secondWindDamage: 80, secondWindRadius: 180, secondWindKnockback: 220,
      lifeStealFraction: 0.03, lifeStealCap: 5,
      ricochetRange: 250, ricochetDamageFraction: 0.6, ricochetLineMs: 100,
      volatileDamage: 80, volatileRadius: 120,
      powderKegMaxHpFraction: 0.25, powderKegRadius: 60, powderKegHeroDamageFraction: 0.05,
    },
  },
  heroTweaks: {
    sheriffBulletRangeArenaDiagonalFraction: 0.75, sheriffBulletFadeFraction: 0.15,
    guardianDashPushPx: 220, guardianDashPushMs: 300, guardianKillExtensionSec: GUARDIAN_DASH_KILL_EXTENSION_S, guardianDashMaxBaseMultiplier: 1.2,
    guardianRushDistance: GUARDIAN_RUSH_DISTANCE, guardianRushDurationMs: GUARDIAN_RUSH_DURATION_S * 1000,
    guardianRushIframeMs: (GUARDIAN_RUSH_DURATION_S + GUARDIAN_RUSH_IFRAME_AFTER_S) * 1000,
    guardianFanAngleDeg: GUARDIAN_FAN_ANGLE_DEG, guardianFanRadius: GUARDIAN_FAN_RADIUS,
    guardianFanDamageMult: GUARDIAN_FAN_DAMAGE_MULT, guardianFanKnockback: GUARDIAN_FAN_KNOCKBACK,
    guardianFanKnockbackMs: GUARDIAN_FAN_KNOCKBACK_MS, guardianFanFadeMs: GUARDIAN_FAN_FADE_MS,
    guardianRepeatHitCooldownMs: 350,
    sheriffTalentCooldownCutSec: SHERIFF_KILL_REFUND_S,
    sheriffRefundGroupTtlMs: SHERIFF_REFUND_GROUP_TTL_MS,
    pilotTalentCooldownCutSec: PILOT_MECH_COOLDOWN_CUT_S, pilotTalentCycleReductionCap: PILOT_MECH_CYCLE_CAP_PCT / 100,
    guardianUltimateRampPerHit: GUARDIAN_ULT_RAMP_PER_HIT, guardianUltimateRampCap: GUARDIAN_ULT_RAMP_CAP,
    guardianSlamRadius: GUARDIAN_SLAM_RADIUS, guardianSlamDamageMultiplier: GUARDIAN_SLAM_DAMAGE_MULT,
    guardianSlamKnockback: GUARDIAN_SLAM_KNOCKBACK, guardianUltimateEarlyEnd: GUARDIAN_ULT_EARLY_END,
    guardianBraceEnabled: GUARDIAN_BRACE_ENABLED, guardianBraceReduction: GUARDIAN_BRACE_REDUCTION,
    guardianBraceDurationMs: GUARDIAN_BRACE_DURATION_S * 1000,
    electroChainRefundPct: ELECTRO_CHAIN_REFUND_PCT, electroStunRefundMultiplier: ELECTRO_STUN_REFUND_MULT,
    electroUltimateMinLockoutMs: ELECTRO_ULT_MIN_LOCKOUT_S * 1000,
    sheriffBlastRefundCapMs: SHERIFF_BLAST_REFUND_CAP_S * 1000,
    electroChainCounterScale: ELECTRO_CHAIN_COUNTER_SCALE, electroChainCounterMs: ELECTRO_CHAIN_COUNTER_MS,
    electroChainCounterPopMs: ELECTRO_CHAIN_COUNTER_POP_MS,
    electroOverloadFlashMs: ELECTRO_OVERLOAD_FLASH_MS, electroOverloadFeedbackMs: ELECTRO_OVERLOAD_FEEDBACK_MS,
    sheriffReadyRingMs: SHERIFF_READY_RING_MS, sheriffReadyBounceMs: SHERIFF_READY_BOUNCE_MS,
    sheriffRefundLabelMs: SHERIFF_REFUND_LABEL_MS, sheriffRefundMergeMs: SHERIFF_REFUND_MERGE_MS,
    sheriffRefundPopupMs: SHERIFF_REFUND_POPUP_MS,
    sheriffRefundPulseMs: SHERIFF_REFUND_PULSE_MS, readyGlowPeriodMs: READY_GLOW_PERIOD_MS,
    cooldownRingTransitionMs: COOLDOWN_RING_TRANSITION_MS,
  },
});

export const GAME_CONFIG = Object.freeze({
  turret: Object.freeze({ hp: TURRET_HP, ammoMax: TURRET_AMMO_MAX, initialAmmo: TURRET_AMMO_INITIAL, fireRate: TURRET_FIRE_RATE,
    damageMultiplier: TURRET_DAMAGE_MULT, range: TURRET_RANGE, bulletSpeed: TURRET_BULLET_SPEED,
    turnRateDegS: TURRET_TURN_RATE_DEG_S, fireConeDeg: TURRET_FIRE_CONE_DEG, deployMs: TURRET_DEPLOY_S * 1000,
    radius: TURRET_RADIUS, taunt: ENGINEER_TURRETS_TAUNT, aggroRadius: TURRET_AGGRO_RADIUS,
    targetReevalMs: TARGET_REEVAL_MS, targetReevalStaggerMs: TURRET_TARGET_REEVAL_STAGGER_MS,
    targetLockMs: TARGET_LOCK_MS, fireTargetReevalMs: TURRET_TARGET_REEVAL_MS,
    projectilePoolMax: TURRET_PROJECTILE_POOL_MAX, bulletRadius: TURRET_BULLET_RADIUS_PX, muzzleOffset: TURRET_MUZZLE_OFFSET_PX,
    visuals: TURRET_VISUALS }),
  heroFxColors: HERO_FX_COLORS,
  heroFxSecondary: HERO_FX_SECONDARY,
  vortexColors: Object.freeze({ eye: VORTEX_EYE_COLOR, core: VORTEX_CORE_COLOR }),
  effects: { holdReholdImmunityMs: HOLD_REHOLD_IMMUNITY_MS,
    heldEnemyTint: HELD_ENEMY_TINT, slowedEnemyTint: SLOWED_ENEMY_TINT,
    pushDefaultDurationMs: PUSH_DEFAULT_DURATION_MS, dummyPushMultiplier: DUMMY_PUSH_MULTIPLIER,
    debugPushDistancePx: DEBUG_PUSH_DISTANCE_PX, debugPushDurationMs: DEBUG_PUSH_DURATION_MS,
    debugStatusDurationMs: DEBUG_STATUS_DURATION_MS, debugSlowPct: DEBUG_SLOW_PCT,
    holdSwirlRadiusPx: HOLD_SWIRL_RADIUS_PX, holdSwirlYOffsetPx: HOLD_SWIRL_Y_OFFSET_PX,
    holdSwirlLineWidth: HOLD_SWIRL_LINE_WIDTH, holdSwirlSpriteSize: HOLD_SWIRL_SPRITE_SIZE },
  arenaTuning: ARENA_TUNING,
  arena: { width: 1920, height: 1080, playerRadius: 24, tickHz: 30 },
  heroDefaults: { hp: 100, attack: 10, defense: 5, speed: 220 },
  combat: {
    minimumDamage: 1,
    damageIFrameMs: 1000,
    weaponCooldownMs: 500,
    skillCooldownMs: 5000,
    ultimateCooldownMs: 30000,
    projectileMaxAgeMs: 3500,
  },
  campfire: { hp: BASE_CAMPFIRE_HP, radius: 28, healingRadius: ARENA_TUNING.campfire.healRadius, healingPerSecondPercent: ARENA_TUNING.campfire.healPerSecondPercent },
  waves: { enemySpawnIntervalMs: 700, breakMs: 5000, baseEnemies: 5, linearGrowth: 2, quadraticGrowth: 1, devilEveryEnemies: 5, skeletonEveryEnemies: 4 },
  // Between-wave break: REST (no vote) -> VOTE -> READY. All in milliseconds so
  // the server can compare them against Date.now() directly.
  breakPhases: {
    restMs: REST_DURATION_S * 1000,
    bossRestMs: BOSS_REST_DURATION_S * 1000,
    voteMs: VOTE_DURATION_S * 1000,
    readyMs: PRE_WAVE_S * 1000,
    dawnDecisionTimeoutMs: DAWN_DECISION_TIMEOUT_S * 1000,
  },
  confetti: {
    count: CONFETTI_COUNT,
    durationMs: CONFETTI_DURATION_S * 1000,
    bannerMs: CONFETTI_BANNER_MS,
    burstInsetPx: CONFETTI_BURST_INSET_PX,
    burstSpreadPx: CONFETTI_BURST_SPREAD_PX,
    burstSpeedMin: CONFETTI_BURST_SPEED_MIN,
    burstSpeedMax: CONFETTI_BURST_SPEED_MAX,
    pieceMinPx: CONFETTI_PIECE_MIN_PX,
    pieceMaxPx: CONFETTI_PIECE_MAX_PX,
    fallGravity: CONFETTI_FALL_GRAVITY,
    drag: CONFETTI_DRAG,
    swayPx: CONFETTI_SWAY_PX,
    spinTurnsMax: CONFETTI_SPIN_TURNS_MAX,
    qualityFactor: CONFETTI_QUALITY_FACTOR,
    colors: CONFETTI_COLORS,
  },
  waveBuffs: { voteDurationMs: 15000, cardCount: 3, flatMin: 5, flatMax: 25, campfireMaxHp: 100 },
  buildingBuffs: {
    library: { stat: 'attack', type: 'magic' },
    workshop: { stat: 'attack', type: 'physical' },
    garden: { stat: 'campfireMaxHp' },
    // Tower has no flat stat of its own; it scales the four stat cards instead.
    tower: { stat: null, perLevel: TOWER_BONUS_PER_LEVEL },
  },
  towerScaledCards: TOWER_SCALED_CARDS,
  heroSummon: {
    pullCost: 50,
    duplicateRefundFraction: 1,
    commonResourceAmount: 5,
    odds: { common: 600, rare: 300, epic: 100 },
    heroPityPulls: 10,
    epicPityPulls: 50,
    starterHero: 'sheriff',
    rarities: { sheriff: 'rare', guardian: 'rare', bubbles: 'rare', electromancer: 'rare', pilot: 'epic', bombardier: 'epic', fairy: 'epic', engineer: 'epic' },
    bannerTitle: SUMMON_BANNER_TITLE,
    bannerSubtitle: SUMMON_BANNER_SUBTITLE,
    bannerOrder: SUMMON_BANNER_ORDER,
    multiDiscount: SUMMON_MULTI_DISCOUNT,
    showDetails: SUMMON_SHOW_DETAILS,
  },
  spawns: [
    { x: 480, y: 540 },
    { x: 1440, y: 540 },
    { x: 960, y: 270 },
    { x: 960, y: 810 },
  ],
  enemySpawnMargin: 35,
  weaponMuzzleOffset: 24,
  enemies: {
    zombie: { hp: 20, speed: 55, radius: 16, damage: 6 },
    devil: { hp: 35, speed: 95, radius: 18, damage: 12, attackCooldownMs: 1000 },
    skeleton: { hp: 26, speed: 58, radius: 16, damage: 7, shootIntervalMs: 2600, pauseMs: 500, bulletSpeed: 320, bulletDamage: 8 },
  },
  projectiles: {
    enemyBullet: { radius: 8, color: '#ed3d4d', speed: 260, damage: 8 },
  },
  heroes: {
    sheriff: {
      type: 'physical', hp: 105, attack: 12, defense: 5, speed: 225,
      weaponCooldownMs: 270, skillCooldownMs: 8000, ultimateCooldownMs: 30000,
      talent: {
        name: 'Quick Draw',
        icon: ABILITY_ICONS.sheriff.talent,
        description: `Kills cut Dynamite's cooldown by ${SHERIFF_KILL_REFUND_S}s (max ${SHERIFF_BLAST_REFUND_CAP_S}s per blast).`,
        linkedSlot: ['skill'],
      },
      kills: { countDynamiteKills: true },
      bullet: { speed: 980, radius: 5, lifetimeMs: 4000, shape: 'circle' },
      dynamite: { speed: 1050, radius: 14, lifetimeMs: 1500, explosionRadius: 115, damageMultiplier: 1.6, emoji: '🧨', rotateToAim: true },
      barrage: { durationMs: 5000, intervalMs: 180, bulletRadius: 8 },
    },
    guardian: {
      type: 'physical', hp: 155, attack: 18, defense: 12, speed: 190,
      weaponCooldownMs: 488, skillCooldownMs: 6500, ultimateCooldownMs: 45000,
      talent: {
        name: 'Unstoppable',
        icon: ABILITY_ICONS.guardian.talent,
        description: `Kills during Unbreakable Charge extend the dash by ${GUARDIAN_DASH_KILL_EXTENSION_S}s.`,
        linkedSlot: ['ultimate'],
      },
      unstoppable: {},
      shield: { speed: 720, radius: 19, lifetimeMs: 240, damageMultiplier: 0.8, emoji: '🛡️', rotateToAim: true },
      // Shield Rush rework: a short dash toward the aim that ends in a fan
      // shockwave. Direction is locked at cast; no damage during the dash itself.
      skillDash: {
        distance: GUARDIAN_RUSH_DISTANCE,
        durationMs: GUARDIAN_RUSH_DURATION_S * 1000,
        invulnerableMs: (GUARDIAN_RUSH_DURATION_S + GUARDIAN_RUSH_IFRAME_AFTER_S) * 1000,
        fan: {
          angleDeg: GUARDIAN_FAN_ANGLE_DEG,
          radius: GUARDIAN_FAN_RADIUS,
          damageMult: GUARDIAN_FAN_DAMAGE_MULT,
          knockback: GUARDIAN_FAN_KNOCKBACK,
          knockbackMs: GUARDIAN_FAN_KNOCKBACK_MS,
        },
      },
      charge: { durationMs: 6000, speed: 440, invulnerabilityMs: 6200, hitCooldownMs: 350, damageMultiplier: 0.9, knockback: 340,
        rampPerHit: GUARDIAN_ULT_RAMP_PER_HIT, rampCap: GUARDIAN_ULT_RAMP_CAP, slamRadius: GUARDIAN_SLAM_RADIUS,
        slamDamageMultiplier: GUARDIAN_SLAM_DAMAGE_MULT, slamKnockback: GUARDIAN_SLAM_KNOCKBACK },
    },
    pilot: {
      type: 'physical', hp: 78, attack: 10, defense: 2, speed: 245,
      weaponCooldownMs: 280, skillCooldownMs: 7000, ultimateCooldownMs: 40000,
      talent: {
        name: 'Adrenaline',
        icon: ABILITY_ICONS.pilot.talent,
        description: `Kills cut Mech Suit's cooldown by ${PILOT_MECH_COOLDOWN_CUT_S}s (max ${PILOT_MECH_CYCLE_CAP_PCT}% per cycle).`,
        linkedSlot: ['ultimate'],
      },
      kills: {},
      shotgun: { pellets: 7, spreadRadians: 0.32, range: 390, pelletDamageMultiplier: 0.4, radius: 5 },
      retreatDash: { distance: 250, durationMs: 400 },
      mech: {
        durationMs: 12000, hp: 170, attack: 24, defense: 12, speed: 210,
        weaponName: 'Mech Punch', skillName: 'Impact Dash',
        weaponCooldownMs: 638, skillCooldownMs: 8000,
        punch: { speed: 720, radius: 21, lifetimeMs: 160, damageMultiplier: 2.8, explosionRadius: 115, emoji: '🤜', rotateToAim: true },
        dash: { distance: 260, durationMs: 420, damageMultiplier: 1.5, knockback: 420 },
      },
    },
    bombardier: {
      type: 'magic', hp: 95, attack: 22, defense: 3, speed: 210,
      weaponCooldownMs: 1050, skillCooldownMs: 14000, ultimateCooldownMs: 40000,
      bomb: { speed: 410, radius: 9, lifetimeMs: 850, explosionRadius: 100, damageMultiplier: 1.2 },
      talent: {
        name: 'Demolitionist',
        icon: ABILITY_ICONS.bombardier.talent,
        description: 'Bombs explode on impact.',
        linkedSlot: ['primary'],
      },
      trap: { radius: 14, triggerRadius: 125, explosionRadius: 130, damageMultiplier: 2.2 },
      airstrike: { circleRadius: 280, bombIntervalMs: 1000, bombCount: 5, targetTimeoutMs: 5000, explosionRadius: 135, damageMultiplier: 1.7 },
    },
    bubbles: {
      type: 'magic', hp: 110, attack: 12, defense: 4, speed: 220,
      weaponCooldownMs: 105, skillCooldownMs: 14000, ultimateCooldownMs: 35000,
      talent: {
        name: 'Finisher',
        icon: ABILITY_ICONS.bubbles.talent,
        description: `Bubble Trap kills explode bigger and cut its cooldown by ${BUBBLES_TRAP_KILL_REFUND * 100}%.`,
        linkedSlot: ['skill'],
      },
      spray: { speed: 370, radius: 7, lifetimeMs: 850, range: 315, damageMultiplier: 0.14, spreadRadians: 0.075 },
      bubbleTrap: { speed: 880, radius: 18, travelDistance: 390, damage: 9, explosionRadius: 110, finisherDamage: 44, finisherRadius: 235, killCooldownRefundFraction: BUBBLES_TRAP_KILL_REFUND, missRefundFraction: 0 },
      ultimate: { durationMs: 6000, speedMultiplier: 2.6, popRadius: 145, damageMultiplier: 2.2 },
    },
    electromancer: {
      type: 'magic', hp: 100, attack: 16, defense: 4, speed: 225,
      weaponCooldownMs: 525, skillCooldownMs: 10000, ultimateCooldownMs: 35000,
      talent: {
        name: 'Overload',
        icon: ABILITY_ICONS.electromancer.talent,
        description: `Chain hits refund ${ELECTRO_CHAIN_REFUND_PCT * 100}% of its cooldown (stunned ${ELECTRO_STUN_REFUND_MULT}x).`,
        linkedSlot: ['ultimate'],
      },
      overload: { chainRefundPct: ELECTRO_CHAIN_REFUND_PCT, stunnedRefundMultiplier: ELECTRO_STUN_REFUND_MULT,
        minUltimateLockoutMs: ELECTRO_ULT_MIN_LOCKOUT_S * 1000 },
      ball: { speed: 570, radius: 18, lifetimeMs: 2400, pierces: 2, shape: 'orb' },
      stunBall: { speed: 440, radius: 10 * ELECTRO_STUN_PROJECTILE_SCALE, lifetimeMs: 2300, areaRadius: 80 * ELECTRO_STUN_RADIUS_SCALE, damageMultiplier: 0.7, stunMs: 1900, emoji: '⚡' },
      chain: { damageMultiplier: 1.4, range: 220, jumpDelayMs: 260 },
    },
    fairy: {
      type: 'magic', hp: 85, attack: 14, defense: 2, speed: 235,
      weaponCooldownMs: FAIRY_WEAPON_COOLDOWN_MS,
      skillCooldownMs: FAIRY_SKILL_COOLDOWN_MS,
      ultimateCooldownMs: FAIRY_ULTIMATE_COOLDOWN_MS,
      talent: {
        name: 'Windswept',
        icon: ABILITY_ICONS.fairy.talent,
        description: `Enemies you push or pull are slowed ${Math.round(FAIRY_SLOW_PCT * 100)}% for ${FAIRY_SLOW_DURATION_S} s.`,
        linkedSlot: ['skill', 'ultimate'],
      },
      campfirePushZoneRadius: CAMPFIRE_PUSH_ZONE_RADIUS,
      windArrow: { speed: WIND_ARROW_SPEED, range: WIND_ARROW_RANGE, damageMultiplier: WIND_ARROW_DAMAGE_MULT, pierces: WIND_ARROW_PIERCE_COUNT, pushPx: WIND_ARROW_PUSH_PX, pushMs: WIND_ARROW_PUSH_MS },
      gale: { speed: GALE_SPEED, range: GALE_RANGE, radius: GALE_RADIUS, damageMultiplier: GALE_DAMAGE_MULT, pushPx: GALE_PUSH_PX, pushMs: GALE_PUSH_MS, visualDurationMs: FAIRY_GALE_VFX_DURATION_MS },
      vortex: { speed: VORTEX_SPEED, range: VORTEX_RANGE, radius: VORTEX_RADIUS, durationMs: VORTEX_DURATION_S * 1000, pullMs: VORTEX_PULL_S * 1000, latePullMs: VORTEX_LATE_PULL_MS, pullSpeedPxPerSecond: VORTEX_PULL_SPEED_PX_S, damageTickMs: VORTEX_DAMAGE_TICK_MS, dpsMultiplier: VORTEX_DPS_MULT, endPushPx: VORTEX_END_PUSH_PX, endPushMs: VORTEX_END_PUSH_MS, endDamageMultiplier: VORTEX_END_DAMAGE_MULT },
      windswept: { slowPct: FAIRY_SLOW_PCT, durationMs: FAIRY_SLOW_DURATION_S * 1000 },
    },
    engineer: {
      type: 'physical', hp: 120, attack: 14, defense: 6, speed: 210,
      weaponCooldownMs: ENGINEER_WRENCH_COOLDOWN_S * 1000,
      skillCooldownMs: ENGINEER_SKILL_COOLDOWN_S * 1000, ultimateCooldownMs: ENGINEER_ULTIMATE_COOLDOWN_S * 1000,
      talent: {
        name: 'Salvage', icon: ABILITY_ICONS.engineer.talent,
        description: `Your kills refill each living turret by ${ENGINEER_KILL_AMMO} rounds and heal it for ${ENGINEER_KILL_HEAL_PCT * 100}% of its max HP.`,
        linkedSlot: ['skill'],
      },
      wrench: { speed: ENGINEER_WRENCH_SPEED, range: ENGINEER_WRENCH_RANGE, damageMultiplier: ENGINEER_WRENCH_DAMAGE_MULT,
        push: ENGINEER_WRENCH_PUSH, maxMs: ENGINEER_WRENCH_MAX_S * 1000, catchRadius: ENGINEER_WRENCH_CATCH_RADIUS,
        radius: ENGINEER_WRENCH_RADIUS, spinRadPerSecond: ENGINEER_WRENCH_SPIN_RAD_S },
      turretSkill: { placeRange: ENGINEER_PLACE_RANGE, maxTurrets: ENGINEER_MAX_TURRETS,
        minCampfireDist: TURRET_MIN_CAMPFIRE_DIST, minSpacing: TURRET_MIN_SPACING, snapRadius: ENGINEER_TURRET_SNAP_RADIUS,
        snapStep: ENGINEER_TURRET_SNAP_STEP, snapSlices: ENGINEER_TURRET_SNAP_SLICES },
      laser: { chargeMs: ENGINEER_LASER_CHARGE_S * 1000, length: ENGINEER_LASER_LENGTH, width: ENGINEER_LASER_WIDTH,
        durationMs: ENGINEER_LASER_DURATION_S * 1000, damageMultiplier: ENGINEER_LASER_DAMAGE_MULT,
        lockLastMs: ENGINEER_LASER_LOCK_LAST_S * 1000, moveFactor: ENGINEER_LASER_MOVE_FACTOR },
      salvage: { ammo: ENGINEER_KILL_AMMO, healPct: ENGINEER_KILL_HEAL_PCT,
        flightMs: ENGINEER_SALVAGE_FLIGHT_MS, pulseMs: ENGINEER_SALVAGE_PULSE_MS,
        popupMergeMs: ENGINEER_SALVAGE_POPUP_MERGE_MS, popupMs: ENGINEER_SALVAGE_POPUP_MS },
    },
  },
  hud: { physical: '#48a8ff', magic: '#b17cff' },
  visuals: { dashTrail: { count: 3, radius: 3, decay: 0.09 }, lightningArcMs: 220, enemyFlashMs: 220 },
});
