export const DEBUG_TUNING = Object.freeze({
  minimumBalance: 0,
  maximumBalance: 1_000_000,
  inputStep: 1,
  smallAdjustment: 100,
  largeAdjustment: 1_000,
});

export const ELECTRO_STUN_PROJECTILE_SCALE = 1.6;
export const ELECTRO_STUN_RADIUS_SCALE = 1.5;

// Respawns land on a ring well clear of the campfire (radius 28 plus the hero
// sprite's height), so a reviving hero never covers the fire, while still
// inside the 150 px heal ring.
export const RESPAWN_RING_MIN = 105;
export const RESPAWN_RING_MAX = 145;
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
// The Bombardier's ultimate marker fills like a clock hand sweeping clockwise
// from 12 o'clock - the same read as the ability cooldown ring - instead of a
// fill that only ramps opacity, so the time left before impact is visible.
// The whole disc keeps BASE_ALPHA so the danger area reads immediately; the
// wedge grows over the telegraph at FILL_ALPHA and its leading edge gets a
// solid HAND line.
export const AREA_TELEGRAPH_SWEEP_BASE_ALPHA = 0.14;
export const AREA_TELEGRAPH_SWEEP_FILL_ALPHA = 0.5;
export const AREA_TELEGRAPH_SWEEP_HAND_ALPHA = 0.9;
export const AREA_TELEGRAPH_SWEEP_HAND_WIDTH = 3;
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
// How long the clock-emoji Quick Draw refund popup floats above the hero.
// Matches the Dynamite-ready bounce so both read as one feedback language.
export const SHERIFF_REFUND_POPUP_MS = 800;
// Ready-glow period shared by every skill/ultimate button (generalized from
// the Sheriff dynamite's gold glow).
export const READY_GLOW_PERIOD_MS = 1_000;
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
// Unstoppable: a kill during Unbreakable Charge adds this much dash time.
export const GUARDIAN_DASH_KILL_EXTENSION_S = 0.15;

// Guardian Shield Rush rework: a short dash that ends in a fan-shaped shockwave.
// These replace the old dash-through-enemies Shield Rush. The ultimate
// (Unbreakable Charge) is untouched.
export const GUARDIAN_RUSH_DISTANCE = 300;
export const GUARDIAN_RUSH_DURATION_S = 0.25;
export const GUARDIAN_RUSH_IFRAME_AFTER_S = 0.3;
export const GUARDIAN_FAN_ANGLE_DEG = 130;
export const GUARDIAN_FAN_RADIUS = 210;
export const GUARDIAN_FAN_DAMAGE_MULT = 1.0;
export const GUARDIAN_FAN_KNOCKBACK = 260;
export const GUARDIAN_FAN_KNOCKBACK_MS = 300;
// Purely-visual: how long the fan wedge lingers and fades on the floor.
export const GUARDIAN_FAN_FADE_MS = 220;

// Adrenaline: each kill cuts this much Mech Suit cooldown, up to the cycle cap.
export const PILOT_MECH_COOLDOWN_CUT_S = 1;
export const PILOT_MECH_CYCLE_CAP_PCT = 50;

// Finisher: a Bubble Trap kill refunds this fraction of the REMAINING cooldown.
export const BUBBLES_TRAP_KILL_REFUND = 0.5;

export const BUILDING_BONUS_PER_LEVEL = 0.1;
export const BUILDING_LEVEL_CAP = 3;

// Hero Summon presentation and ambient sky. These affect only the student UI;
// pull odds, costs and pity remain in game-config.js.
export const SUMMON_STAR_COUNT = 140;
export const SUMMON_TWINKLE_COUNT = 12;
export const SUMMON_TWINKLE_DURATION_MIN_S = 2;
export const SUMMON_TWINKLE_DURATION_MAX_S = 4;
export const SUMMON_METEOR_INTERVAL_MIN_S = 7;
export const SUMMON_METEOR_INTERVAL_MAX_S = 16;
export const SUMMON_METEOR_DURATION_MS = 700;
export const SUMMON_METEOR_LENGTH_MIN_PX = 120;
export const SUMMON_METEOR_LENGTH_MAX_PX = 180;
export const SUMMON_METEOR_MAX_ALPHA = 0.35;
export const SUMMON_METEOR_SHOWER_CHANCE = 0.25;
export const SUMMON_METEOR_SHOWER_COUNT_MIN = 3;
export const SUMMON_METEOR_SHOWER_COUNT_MAX = 5;
export const SUMMON_METEOR_SHOWER_SPACING_MS = 120;
export const SUMMON_SKY_FRAME_CAP_FPS = 30;
export const SUMMON_HISTORY_PAGE_SIZE = 20;
export const SUMMON_BANNER_TITLE = 'Hero Summon';
export const SUMMON_BANNER_SUBTITLE = 'Meet the heroes whose stories are waiting to be written.';
export const SUMMON_BANNER_ORDER = Object.freeze(['bombardier', 'pilot', 'guardian', 'sheriff', 'electromancer', 'bubbles']);
export const SUMMON_MULTI_DISCOUNT = 0;
export const SUMMON_SHOW_DETAILS = true;
export const SUMMON_SUMMARY_COLUMNS = 5;
export const SUMMON_SUMMARY_SLANT_DEG = 0;
export const SUMMON_SUMMARY_SOUND_INTERVAL_MS = 90;

// Walkable kingdom town. The canvas keeps a fixed logical size and scales to
// fill the immersive student viewport; building coordinates are world pixels.
export const TOWN_WIDTH = 1280;
export const TOWN_HEIGHT = 720;
export const TOWN_TILE_SIZE = 32;
export const TOWN_WALK_SPEED = 180;
export const TOWN_DOOR_RADIUS = 44;
export const TOWN_AVATAR_RADIUS = 17;
export const TOWN_AVATAR_DEFAULT_COLOR = '#F2BA55';
export const TOWN_AVATAR_ORIGINAL_COLOR = '#BDBDBD';
export const TOWN_AVATAR_COLOR_MIN_LIGHTNESS = 35;
export const TOWN_AVATAR_COLOR_MAX_LIGHTNESS = 85;
export const TOWN_AVATAR_MIN_GRASS_DISTANCE = 60;
export const TOWN_GRASS_COLOR = '#7FAE58';
export const TOWN_MAX_HEROES = 8;
export const TOWN_HERO_WANDER_RADIUS = 300;
export const TOWN_HERO_WALK_SPEED = 72;
export const TOWN_HERO_AVATAR_RADIUS = 16;
export const TOWN_HERO_MIN_PLAYER_DISTANCE = 40;
export const TOWN_HERO_HOP_HEIGHT = 10;
export const TOWN_HERO_HOPS_PER_SECOND = 3;
export const TOWN_HERO_WANDER_PAUSE_MIN_MS = 1_000;
export const TOWN_HERO_WANDER_PAUSE_MAX_MS = 3_000;
export const TOWN_HERO_REDUCED_MOTION_HOP_HEIGHT = 3;
export const TOWN_HERO_REDUCED_MOTION_PAUSE_MIN_MS = 2_500;
export const TOWN_HERO_REDUCED_MOTION_PAUSE_MAX_MS = 5_000;
export const TOWN_AVATAR_PRESET_COLORS = Object.freeze([
  '#F2BA55', '#EF7137', '#3D78A0', '#6DB8CF', '#8062A9', '#D86F6B',
  '#548CB0', '#B96448', '#C08A54', '#BAA1D0', '#E49B35', '#4F9B83',
  TOWN_AVATAR_ORIGINAL_COLOR,
]);
// Town map. The castle sits on a stone plaza in the centre with one building
// at each compass point: Garden north, Tower south, Library west, Workshop
// east. x/y/w/h is the solid footprint (art rises above it); `art` is the
// drawing's canvas size; `door` is where the player stands to interact, on
// the road in front of the entrance. North of the town (negative y) is the
// forest clearing with the Duel and Campfire Run camps.
export const TOWN_PATH_WIDTH = 52;
export const TOWN_TRAIL_WIDTH = 46;
export const TOWN_NORTH_HEIGHT = 720;
export const TOWN_GREET_RADIUS = 62;
export const TOWN_PLAZA = { x: 500, y: 215, w: 280, h: 240 };
export const BUILDING_LAYOUT = {
  castle: { x: 545, y: 290, w: 190, h: 120, art: { w: 230, h: 250 }, door: { x: 640, y: 434 } },
  garden: { x: 500, y: 70, w: 170, h: 95, art: { w: 190, h: 170 }, door: { x: 585, y: 190 } },
  library: { x: 95, y: 250, w: 190, h: 95, art: { w: 230, h: 200 }, door: { x: 190, y: 370 } },
  workshop: { x: 990, y: 250, w: 200, h: 95, art: { w: 260, h: 190 }, door: { x: 1090, y: 370 } },
  tower: { x: 585, y: 545, w: 110, h: 80, art: { w: 150, h: 180 }, door: { x: 640, y: 652 } },
};
// Stone roads, as centre-line polylines that start under each entrance and
// end inside the plaza. The tower's road loops round its base to the front.
export const TOWN_ROADS = [
  [[585, 160], [585, 232]],
  [[190, 340], [190, 392], [512, 392]],
  [[1090, 340], [1090, 392], [768, 392]],
  [[545, 445], [545, 662], [735, 662], [735, 445]],
  [[640, 620], [640, 662]],
];
// Packed-earth trail from the plaza north out of town to the camp fork.
export const TOWN_TRAILS = [
  [[745, 228], [745, -230]],
  [[745, -230], [610, -276], [430, -292]],
  [[745, -230], [880, -276], [1010, -292]],
];
// Walkable zones: the town, the gap in the northern tree line, the clearing.
export const TOWN_WALK_ZONES = [
  { x: 28, y: 40, w: 1224, h: 662 },
  { x: 720, y: -70, w: 50, h: 120 },
  { x: 150, y: -600, w: 980, h: 560 },
];
export const TOWN_DESTINATIONS = {
  duel: { x: 300, y: -362, w: 240, h: 34, art: { w: 270, h: 150 }, door: { x: 430, y: -300 } },
  campfire: { x: 880, y: -362, w: 250, h: 34, art: { w: 270, h: 150 }, door: { x: 1010, y: -300 }, flame: { x: 1070, y: -354 } },
};
export const TOWN_PROP_LAYOUT = [
  { type: 'house', variant: 0, x: 100, y: 80, w: 64, h: 40 },
  { type: 'house', variant: 1, x: 200, y: 62, w: 64, h: 40 },
  { type: 'house', variant: 2, x: 300, y: 86, w: 64, h: 40 },
  { type: 'house', variant: 3, x: 900, y: 86, w: 64, h: 40 },
  { type: 'house', variant: 4, x: 1000, y: 62, w: 64, h: 40 },
  { type: 'house', variant: 0, x: 1100, y: 80, w: 64, h: 40 },
  { type: 'house', variant: 2, x: 90, y: 560, w: 64, h: 40 },
  { type: 'house', variant: 1, x: 190, y: 540, w: 64, h: 40 },
  { type: 'house', variant: 4, x: 290, y: 565, w: 64, h: 40 },
  { type: 'house', variant: 3, x: 880, y: 545, w: 64, h: 40 },
  { type: 'house', variant: 0, x: 980, y: 565, w: 64, h: 40 },
  { type: 'house', variant: 2, x: 1080, y: 545, w: 64, h: 40 },
  { type: 'well', x: 382, y: 600, w: 50, h: 22 },
  { type: 'barter', x: 772, y: 600, w: 70, h: 22 },
  { type: 'sign', x: 776, y: 96, w: 64, h: 14 },
  { type: 'tree', x: 432, y: 140, w: 64, h: 102 },
  { type: 'tree', x: 830, y: 150, w: 64, h: 102 },
  { type: 'tree', x: 444, y: 468, w: 60, h: 95 },
  { type: 'tree', x: 796, y: 452, w: 60, h: 95 },
  { type: 'rock', x: 36, y: 652, w: 42, h: 30 },
  { type: 'rock', x: 1200, y: 652, w: 42, h: 30 },
  { type: 'rock', x: 168, y: -580, w: 42, h: 30 },
  { type: 'rock', x: 1072, y: -580, w: 42, h: 30 },
  { type: 'flowers', x: 466, y: 236, w: 30, h: 28 },
  { type: 'flowers', x: 790, y: 236, w: 30, h: 28 },
  { type: 'flowers', x: 150, y: 470, w: 30, h: 28 },
  { type: 'flowers', x: 1110, y: 470, w: 30, h: 28 },
  { type: 'flowers', x: 300, y: 200, w: 30, h: 28 },
  { type: 'flowers', x: 960, y: 200, w: 30, h: 28 },
  { type: 'flowers', x: 560, y: -150, w: 30, h: 28 },
  { type: 'flowers', x: 900, y: -160, w: 30, h: 28 },
];

// Tower: scales the four stat buff cards (maxHp / attack / defense / speed) on
// the OWNER'S OWN hero only. towerMultiplier = 1 + perLevel * level, so Lv0 is
// 1.0 and Lv3 is 1.3. It never scales the campfire card or the rare effect cards.
// Reuses the existing building level cap so all kingdom buildings level together.
export const TOWER_BONUS_PER_LEVEL = 0.1;
export const TOWER_MAX_LEVEL = BUILDING_LEVEL_CAP;

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

// Between-wave break, in three separate phases so voting never eats the rest:
//   REST  -> no vote, heroes can move/fight/heal, pill counts down
//   VOTE  -> the three buff cards, ends early once everyone has voted
//   READY -> short pre-wave beat before the next wave banner
// BOSS_REST_DURATION_S applies to the rest after a boss wave.
export const REST_DURATION_S = 8;
export const BOSS_REST_DURATION_S = 12;
export const VOTE_DURATION_S = 10;
export const PRE_WAVE_S = 2;
// The dawn milestone holds the break until every hero has chosen; undecided
// heroes auto-CONTINUE after this long.
export const DAWN_DECISION_TIMEOUT_S = 30;

// Boss-defeated confetti (client-side only, never changes game state).
export const CONFETTI_COUNT = 120;
export const CONFETTI_DURATION_S = 3;
// "BOSS DEFEATED!" banner above the confetti.
export const CONFETTI_BANNER_MS = 2000;
// Two bursts, one from each top corner, aimed down and inward.
export const CONFETTI_BURST_INSET_PX = 60;
export const CONFETTI_BURST_SPREAD_PX = 140;
export const CONFETTI_BURST_SPEED_MIN = 220;
export const CONFETTI_BURST_SPEED_MAX = 620;
// Per-piece look and motion. Pieces are rotated rects, never glyphs.
export const CONFETTI_PIECE_MIN_PX = 5;
export const CONFETTI_PIECE_MAX_PX = 11;
export const CONFETTI_FALL_GRAVITY = 260;
export const CONFETTI_DRAG = 0.6;
export const CONFETTI_SWAY_PX = 26;
export const CONFETTI_SPIN_TURNS_MAX = 2.4;
// Quality scaling for the burst: Medium keeps half the pieces, Low a quarter.
export const CONFETTI_QUALITY_FACTOR = Object.freeze({ high: 1, medium: 0.5, low: 0.25 });
export const CONFETTI_COLORS = Object.freeze(['#ffd34f', '#ff6b6b', '#4dd0e1', '#81c784', '#b388ff', '#ffffff']);

// World page (pre-lobby) two-side layout. The left column holds room entry and
// the kingdom upgrade tiles; the right column holds the hero preview and the
// two-row hero selector. Below WORLD_STACK_BREAKPOINT_PX the sides stack.
export const WORLD_LEFT_COLUMN_PCT = 42;
export const WORLD_RIGHT_COLUMN_PCT = 58;
export const WORLD_STACK_BREAKPOINT_PX = 900;
export const HERO_PREVIEW_EMOJI_PX = 160;
// Emoji glyphs sit off-centre inside their line box (asymmetric side and bottom
// bearings), so the preview icon is nudged up and left to line up with the
// platform shadow and the name block beside it. Measured: the ink sat ~7 px
// right and ~4 px low of the art box centre.
export const HERO_PREVIEW_EMOJI_OFFSET_X_PX = -7;
export const HERO_PREVIEW_EMOJI_OFFSET_Y_PX = -5;
// One row of four equal tiles, never stacked; each tile keeps at least this
// width before the page switches to the stacked layout.
export const BUILDING_TILE_MIN_PX = 100;
// Building emoji live here so a future art pass swaps them in one place.
export const BUILDING_ICONS = Object.freeze({
  library: '📚',
  workshop: '🔨',
  garden: '🌱',
  tower: '🗼',
});

// Training dummy: a lobby-only target that takes damage, shows numbers and
// triggers on-hit talents, but never counts toward kills, combo or rewards.
export const DUMMY_TOTAL = 4;
export const DUMMY_CLUSTER_MIN = 180;
export const DUMMY_CLUSTER_MAX = 320;
export const DUMMY_SPACING_MIN = 60;
export const DUMMY_SPACING_MAX = 100;
// Max pairwise distance between ANY two dummies in the cluster. Must be ≤ the
// Electromancer chain hop range (220 px) so the chain can reach all 4 dummies
// regardless of which order nearest-neighbour picks them.
export const DUMMY_CLUSTER_DIAMETER_MAX = 200;
export const DUMMY_MIN_HERO_DISTANCE = 80;
export const DUMMY_EMOJI = '🎯';
export const DUMMY_SCALE = 1.2;
export const DUMMY_HP = 300;
export const DUMMY_RADIUS = 18;
export const DUMMY_KNOCKBACK_MULT = 1.5;
export const DUMMY_FRICTION = 0.88;
export const DUMMY_RESPAWN_S = 3;
export const DUMMY_FADE_MS = 400;
// Kept for backward compatibility until code is updated:
export const DUMMY_COUNT = 1;
export const DUMMY_SPAWN_MIN = 150;
export const DUMMY_SPAWN_MAX = 250;

// --- Ability HUD button cluster (bottom-right restyle) ---------------------
// Three round buttons: M1 smallest on the bottom row left of Q, E medium
// directly above Q (centred over it), Q biggest bottom-right. M1 and Q share
// a bottom baseline because both carry the key-label strip. Every button has
// a thick near-black outline and a pure-white icon; the key label sits below
// the circle, outside it.
export const BTN_SIZE_PRIMARY = 56;
export const BTN_SIZE_SKILL = 70;
export const BTN_SIZE_ULT = 88;
export const BTN_OUTLINE_WIDTH = 4;
export const BTN_OUTLINE_COLOR = '#101018';
// Horizontal gap between the circles (spec: about 10-14 px).
export const BTN_GAP_X = 12;
// Circle bottom -> key label top, and the height of the label strip.
export const BTN_LABEL_GAP = 4;
export const BTN_LABEL_HEIGHT = 22;
export const BTN_LABEL_SIZE = 13;
// The E key label sits in the gap between the E and Q circles, so its strip
// must clear the Q circle by at least this much (spec: >= 22 px).
export const BTN_LABEL_CLEARANCE = 22;
// White icon diameter as a fraction of the button diameter (spec: ~55%).
export const BTN_ICON_SCALE = 0.55;
// Pilot Mech Suit swaps the M1/E icons to the mech pair while it is up.
export const MECH_ICON_SWAP = true;
// Button colours per hero TYPE family, stepping lightest (primary) to medium
// (skill) to darkest (ultimate) so size and shade both tell the hierarchy.
// The WHITE icon must keep >= 3:1 contrast against every value (WCAG 1.4.11
// non-text contrast). The highlight family started at #D99A00/#C48400/#A86E00
// and failed on primary (2.45:1), so it was darkened just enough to pass
// while keeping the step order; verify with scratch/_stage2_contrast.js.
export const BTN_COLORS = Object.freeze({
  physical: Object.freeze({ primary: '#2F96D4', skill: '#1E78C8', ultimate: '#2F3AB8' }),
  magic: Object.freeze({ primary: '#9B7BE8', skill: '#7B4FD8', ultimate: '#4B2AA8' }),
  highlight: Object.freeze({ primary: '#C08400', skill: '#A86E00', ultimate: '#8A5800' }),
});
// Amber highlight buttons turn bright gold while READY (generalized from the
// Sheriff Dynamite's ready colour).
export const BTN_HIGHLIGHT_READY_COLOR = '#ffd34f';

// Talent badge, shared by the World-page hero preview and the in-game I card so
// the two places can never disagree. It uses the hero's MEDIUM type colour (the
// skill shade of BTN_COLORS) with the same thick near-black outline as the
// ability buttons, and the white talent icon at TALENT_BADGE_ICON_SCALE.
export const TALENT_BADGE_SIZE = 44;
export const TALENT_BADGE_ICON_SCALE = 0.55;
// Shown instead of the icon if a talent icon is missing or fails to load.
export const TALENT_FALLBACK_EMOJI = Object.freeze({
  sheriff: '⏱️',
  guardian: '♾️',
  pilot: '💉',
  bombardier: '💥',
  bubbles: '🫧',
  electromancer: '⚡',
});

// Performance profiler. Debug builds only (same gate as the debug menu): the
// overlay samples once a second and keeps a short trace for kill bursts.
export const PERF_SAMPLE_WINDOW_MS = 1_000;
export const PERF_OVERLAY_UPDATE_MS = 500;
export const PERF_TICK_HISTORY = 32;
export const PERF_FRAME_HISTORY = 240;
export const PERF_SLOW_FRAME_MS = 25;
export const PERF_STATS_POLL_MS = 1_000;

