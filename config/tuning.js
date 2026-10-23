export const DEBUG_TUNING = Object.freeze({
  minimumBalance: 0,
  maximumBalance: 1_000_000,
  inputStep: 1,
  smallAdjustment: 100,
  largeAdjustment: 1_000,
});

export const ELECTRO_STUN_PROJECTILE_SCALE = 1.6;
export const ELECTRO_STUN_RADIUS_SCALE = 1.5;

export const RESPAWN_RING_MIN = 60;
export const RESPAWN_RING_MAX = 110;
export const RESPAWN_MIN_SEPARATION = 40;
export const RESPAWN_CANDIDATE_ATTEMPTS = 10;

export const SHAKE_PLAYER_HIT_TRAUMA = 0.15;
export const SHAKE_ULTIMATE_TRAUMA = 0.35;
export const SHAKE_BOSS_SLAM_TRAUMA = 0.4;
export const SHAKE_EXPLOSION_BASE_TRAUMA = 0.04;
export const SHAKE_EXPLOSION_RADIUS_SCALE = 1_000;
export const SHAKE_MAX_TRAUMA = 0.6;
export const SHAKE_DECAY = 1.8;
export const SHAKE_MAX_OFFSET = 8;
export const SHAKE_EXPLOSION_COOLDOWN_MS = 120;
export const SHAKE_NOISE_HZ = 25;
export const SHAKE_NOISE_PRIMARY_PHASE = 0;
export const SHAKE_NOISE_PRIMARY_FREQUENCY = 0.41;
export const SHAKE_NOISE_SECONDARY_FREQUENCY = 0.73;
export const SHAKE_NOISE_SECONDARY_PHASE = 1.7;
export const SHAKE_DEFAULT_INTENSITY = 100;
export const SHAKE_MIN_INTENSITY = 0;
export const SHAKE_MAX_INTENSITY = 100;
export const SHAKE_INTENSITY_STEP = 1;
export const FRAME_TIME_TARGET_MS = 20;
export const PARTICLE_LIMIT = 300;
export const HITSTOP_ENABLED = false;

export const ELECTRO_CHAIN_REFUND_PCT = 0.04;
export const ELECTRO_STUN_REFUND_MULT = 2;
export const ELECTRO_ULT_MIN_LOCKOUT_S = 5;
export const ELECTRO_CHAIN_COUNTER_SCALE = 1.3;
export const ELECTRO_CHAIN_COUNTER_MS = 700;
export const ELECTRO_CHAIN_COUNTER_POP_MS = 240;
export const ELECTRO_OVERLOAD_FLASH_MS = 150;
export const ELECTRO_OVERLOAD_FEEDBACK_MS = 900;

export const SHERIFF_KILL_REFUND_S = 0.4;
export const SHERIFF_BLAST_REFUND_CAP_S = 2;
export const SHERIFF_READY_RING_MS = 300;
export const SHERIFF_READY_BOUNCE_MS = 800;
export const SHERIFF_REFUND_LABEL_MS = 500;
export const SHERIFF_REFUND_MERGE_MS = 300;
export const SHERIFF_REFUND_PULSE_MS = 100;
export const SHERIFF_READY_GLOW_PERIOD_MS = 1_000;
export const COOLDOWN_RING_TRANSITION_MS = 100;
export const SHERIFF_REFUND_GROUP_TTL_MS = 9_000;
export const SHERIFF_READY_SOUND = Object.freeze({ frequency: 1_175, durationMs: 260, gain: 0.12, type: 'sine' });

export const GUARDIAN_ULT_RAMP_PER_HIT = 0.1;
export const GUARDIAN_ULT_RAMP_CAP = 1;
export const GUARDIAN_SLAM_RADIUS = 150;
export const GUARDIAN_SLAM_DAMAGE_MULT = 2;
export const GUARDIAN_SLAM_KNOCKBACK = 340;
export const GUARDIAN_ULT_EARLY_END = true;
export const GUARDIAN_BRACE_ENABLED = false;
export const GUARDIAN_BRACE_REDUCTION = 0.4;
export const GUARDIAN_BRACE_DURATION_S = 1.5;

export const BUILDING_BONUS_PER_LEVEL = 0.1;
export const BUILDING_LEVEL_CAP = 3;
export const BASE_CAMPFIRE_HP = 100;

// Rooms. Each room owns an independent run; a room stops ticking when its last
// player leaves and is destroyed once it has been empty for ROOM_EMPTY_TTL_S.
export const ROOM_EMPTY_TTL_S = 30;
export const ROOM_MAX_ACTIVE = 50;
export const ROOM_SWEEP_INTERVAL_MS = 1_000;

// Room codes use consonants only so a code can never spell a word, and never Y.
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = 'BCDFGHJKLMNPQRSTVWXZ';
export const ROOM_MAX_PLAYERS = 4;

// A disconnected hero waits this long for the same account to come back.
export const RECONNECT_GRACE_S = 30;

// Late joining: players who arrive after the run started wait for the next
// wave break. LATE_JOIN_MAX_WAVE = 0 means "no limit".
export const LOBBY_LATE_JOIN = true;
export const LATE_JOIN_MAX_WAVE = 0;
export const LATE_JOIN_INVULNERABILITY_S = 2;

// Failed join attempts allowed per connection inside the window.
export const JOIN_FAILURE_LIMIT = 5;
export const JOIN_FAILURE_WINDOW_S = 60;

// Lobby flow. The host starts a run; everyone sees a short countdown, then the
// first wave begins. Heroes can swap freely until the countdown starts.
export const COUNTDOWN_S = 3;

// Training dummy: a lobby-only target that takes damage, shows numbers and
// triggers on-hit talents, but never counts toward kills, combo or rewards.
export const DUMMY_COUNT = 1;
export const DUMMY_SPAWN_MIN = 150;
export const DUMMY_SPAWN_MAX = 250;
export const DUMMY_MIN_HERO_DISTANCE = 80;
export const DUMMY_EMOJI = '🎯';
export const DUMMY_SCALE = 1.2;
export const DUMMY_HP = 300;
export const DUMMY_RADIUS = 18;
export const DUMMY_KNOCKBACK_MULT = 1.5;
export const DUMMY_FRICTION = 0.88;
export const DUMMY_RESPAWN_S = 3;
export const DUMMY_FADE_MS = 400;

