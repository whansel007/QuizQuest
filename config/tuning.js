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

// Camera-shake calibration. The offset is trauma^2 * SHAKE_MAX_OFFSET, so the
// quadratic curve keeps small events subtle and big events punchy. The px
// ladder below is what the NEUTRAL 50% slider setting produces (the old
// slider's 100%); the player can scale the whole ladder 0-200% live:
//   player hit 1.4 | own weak hit 2.0 | own strong hit 3.2 | kill blow 5.4
//   boss slam 7.3 | ultimate 9.0 | mass kill (cap) 13.0
// The earlier MAX_OFFSET of 8 made every source sub-pixel (0.16-2.88px), which
// read as "no screen shake at all"; 20 was still too soft in playtest. The
// player can still scale everything with the in-game shake-intensity slider.
export const SHAKE_PLAYER_HIT_TRAUMA = 0.2;
export const SHAKE_ULTIMATE_TRAUMA = 0.5;
export const SHAKE_BOSS_SLAM_TRAUMA = 0.45;
// Camera kick when the player's OWN hit connects. Weapon hits used to produce
// no shake at all, which made attacks feel weak. Scaled by damage and
// rate-limited so fast weapons don't chatter; skipped during a mass-kill
// window (that window already plays its single shake).
export const SHAKE_HIT_TRAUMA = 0.3;
export const SHAKE_HIT_DAMAGE_REFERENCE = 25;
export const SHAKE_HIT_MIN_INTERVAL_MS = 110;
// Extra kick on the killing blow (hit + kill together land near a boss slam).
export const SHAKE_KILL_TRAUMA = 0.15;
export const SHAKE_EXPLOSION_BASE_TRAUMA = 0.04;
export const SHAKE_EXPLOSION_RADIUS_SCALE = 1_000;
export const SHAKE_MAX_TRAUMA = 0.6;
export const SHAKE_DECAY = 1.8;
export const SHAKE_MAX_OFFSET = 36;
export const SHAKE_EXPLOSION_COOLDOWN_MS = 120;
export const SHAKE_NOISE_HZ = 25;
export const SHAKE_NOISE_PRIMARY_PHASE = 0;
export const SHAKE_NOISE_PRIMARY_FREQUENCY = 0.41;
export const SHAKE_NOISE_SECONDARY_FREQUENCY = 0.73;
export const SHAKE_NOISE_SECONDARY_PHASE = 1.7;
// The slider runs 0-200% with a neutral default of 50%: 50% reproduces exactly
// what the old 0-100 slider produced at 100% (offset = trauma^2 *
// SHAKE_MAX_OFFSET * slider / SHAKE_SLIDER_REFERENCE). Saved settings from the
// old scale migrate v -> v / 2 (see SETTINGS_VERSION in world.js).
export const SHAKE_DEFAULT_INTENSITY = 50;
export const SHAKE_SLIDER_REFERENCE = 50;
export const SHAKE_MIN_INTENSITY = 0;
export const SHAKE_MAX_INTENSITY = 200;
export const SHAKE_INTENSITY_STEP = 1;
// Hard ceiling on the camera translate so the top of the slider cannot turn
// the arena into a slideshow.
export const SHAKE_ABSOLUTE_CAP_PX = 40;

// --- Hit-flash feedback (aura damage must not strobe) -----------------------
// A flash request that arrives inside the cooldown is ignored: it must not
// extend or restart a flash already in progress. Thorns Fire damages at 30Hz,
// so without its own longer cooldown enemies standing in the ring strobe
// white continuously instead of pulsing about twice per second.
export const HIT_FLASH_MIN_INTERVAL_MS = 120;
export const THORNS_FLASH_INTERVAL_MS = 500;
// Thorns damage numbers merge into one running total per enemy (muted orange),
// so a 10 damage/s aura does not spam a number per tick.
export const THORNS_NUMBER_MERGE_MS = 1_000;
export const THORNS_NUMBER_COLOR = '#e8a05a';

// --- Area rings and telegraphs (visibility pass) ----------------------------
// Every ring and area marker is drawn as a dark under-stroke plus a bright
// dashed main stroke (plain strokes and alpha fills only - no shadowBlur, no
// filters). The arena floor is a #70a94f/#79b456 checkerboard, so ring colors
// are chosen to contrast with that green.
export const AREA_RING_WIDTH = 4;
export const AREA_TELEGRAPH_WIDTH = 5;
export const AREA_DASH_ON = 14;
export const AREA_DASH_OFF = 10;
export const AREA_UNDERSTROKE_EXTRA_PX = 3;
export const AREA_UNDERSTROKE_ALPHA = 0.45;
export const AREA_RING_STROKE_ALPHA = 0.8;
export const AREA_TELEGRAPH_STROKE_ALPHA = 0.9;
export const AREA_RING_FILL_ALPHA = 0.12;
export const AREA_TELEGRAPH_FILL_START_ALPHA = 0.2;
export const AREA_TELEGRAPH_FILL_END_ALPHA = 0.45;
// Danger zones get a slightly stronger fill so enemy telegraphs stand out.
export const AREA_ENEMY_FILL_END_ALPHA = 0.55;
// Enemy telegraphs wider than this radius get a centre marker so the danger
// zone centre is unambiguous.
export const AREA_ENEMY_MARKER_MIN_RADIUS = 100;
export const AREA_COLORS = Object.freeze({
  understroke: '#000000',
  healStroke: '#B8FFE0',
  healFill: '#3CFF8A',
  thornsStroke: '#FF8A1F',
  thornsFill: '#FF8A1F',
  playerStroke: '#FFC93C',
  playerFill: '#FFC93C',
  enemyStroke: '#FF3B3B',
  enemyFill: '#FF3B3B',
});
export const FRAME_TIME_TARGET_MS = 20;
// Render frame cap. On a machine that can't hold 60fps an uncapped loop
// alternates 16.7ms and 33ms frames (visible judder, and burst frames blow the
// 16.7ms budget). A fixed schedule gives every frame a guaranteed
// 1000/FRAME_CAP_FPS budget and an even cadence, which reads as smoother than
// erratic 30-60fps. Input is event/timer driven, so this costs no input
// latency. 0 disables the cap (render every vsync).
export const FRAME_CAP_FPS = 24;
// Hard ceiling on live particles. Binds only above ~200 live particles, i.e.
// mass kills and sustained explosions; normal combat never reaches it.
export const PARTICLE_CAP = 200;
export const HITSTOP_ENABLED = false;

// Kill-path visual budget. These are the levers called out in the lag-fix spec;
// they are named constants so the values live in one place, not scattered.
// MAX_BURSTS_PER_FRAME bounds how many enemies in one tick get the full
// burst+sprite treatment (the rest collapse to the shared puff); normal play
// with 1-2 kills per frame never reaches it.
export const DEATH_BURST_COUNT_MIN = 4;
export const DEATH_BURST_COUNT_MAX = 6;
export const MAX_BURSTS_PER_FRAME = 3;
export const KILL_MASS_PUFF_PARTICLES = 8;
export const DAMAGE_NUMBER_CAP = 20;
export const KILL_SOUND_MIN_INTERVAL_MS = 45;
export const HIT_SOUND_MIN_INTERVAL_MS = 40;
export const KILL_BURST_THRESHOLD = 8;
export const KILL_BURST_WINDOW_MS = 200;
export const KILL_MASS_SHAKE_TRAUMA = 0.6;
export const LOG_DEBUG = false;

// Adaptive effects quality. Auto steps the particle budget down when the frame
// average exceeds FRAME_TIME_TARGET_MS, and back up after a calm window.
export const ADAPTIVE_RESTORE_MS = 5_000;
export const ADAPTIVE_SAMPLE_FRAMES = 60;
export const QUALITY_PARTICLE_FACTOR = Object.freeze({ high: 1, medium: 0.6, low: 0.35 });

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

// Performance profiler. Debug builds only (same gate as the debug menu): the
// overlay samples once a second and keeps a short trace for kill bursts.
export const PERF_SAMPLE_WINDOW_MS = 1_000;
export const PERF_OVERLAY_UPDATE_MS = 500;
export const PERF_TICK_HISTORY = 32;
export const PERF_FRAME_HISTORY = 240;
export const PERF_SLOW_FRAME_MS = 25;
export const PERF_STATS_POLL_MS = 1_000;

