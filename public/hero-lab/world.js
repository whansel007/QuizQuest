import { HEROES } from './hero-list.js';
import { EnemyProjectile } from './projectiles/enemy-projectile.js';
import { Projectile } from './bases/projectile.js';
import { GAME_CONFIG, HERO_FX_COLORS, HERO_FX_SECONDARY, ABILITY_ICONS, ABILITY_BTN_HIGHLIGHT, ABILITY_BTN_HIGHLIGHT_MECH,
  VORTEX_CORE_RADIUS_PX, VORTEX_DISK_TILT, VORTEX_ZOOM_PULSE, VORTEX_POP_STILL_MS, VORTEX_DEBRIS_POOL_SIZE,
  VORTEX_DEBRIS_SPAWN_MS, VORTEX_RIPPLE_INTERVAL_MS, VORTEX_RIPPLE_DURATION_MS, FAIRY_GALE_SHAKE_MULT,
  VORTEX_GROUND_FILL, VORTEX_FORMATION_FLASH_MS, VORTEX_CORE_GROW_MS, VORTEX_SHOCKWAVE_MS,
  VORTEX_CORE_PULSE_HZ, VORTEX_DISK_ROTATION_HZ, VORTEX_DISK_OUTER_RADIUS_PX, VORTEX_LENS_ARC_DEG,
  VORTEX_COLLAPSE_MS, VORTEX_FLASH_POP_MS, VORTEX_POP_RING_MS, VORTEX_POP_SPARK_COUNT,
  VORTEX_ZOOM_SCALE, VORTEX_ZOOM_DURATION_MS, FAIRY_GALE_WIND_LINES, FAIRY_ARROW_IMPACT_LINES,
  FAIRY_ARROW_TRAIL_COUNT, FAIRY_MUZZLE_PUFF_RADIUS_PX, FAIRY_GALE_VFX_DURATION_MS, FAIRY_WIND_IMPACT_MS,
  VORTEX_GROUND_RING_WIDTH_PX, VORTEX_GROUND_DASH_ON_PX, VORTEX_GROUND_DASH_OFF_PX,
  VORTEX_GROUND_FILL_ALPHA, VORTEX_SUSTAIN_FADE_MS, VORTEX_DEBRIS_LIFETIME_MS,
  SAMURAI_DASH_AFTERIMAGE_MS, SAMURAI_HIT_MARK_MS, SAMURAI_SLASH_GROW_MS,
  SAMURAI_SLASH_FADE_MS, SAMURAI_EXECUTE_LABEL_MS, SAMURAI_CUT_OVERLAY_MS,
  VORTEX_POP_STILL_CORE_PX } from './game-config.js';
import { SHAKE_PLAYER_HIT_TRAUMA, SHAKE_ULTIMATE_TRAUMA, SHAKE_BOSS_SLAM_TRAUMA, SHAKE_EXPLOSION_BASE_TRAUMA,
  SHAKE_EXPLOSION_RADIUS_SCALE, SHAKE_MAX_TRAUMA, SHAKE_DECAY, SHAKE_MAX_OFFSET, SHAKE_EXPLOSION_COOLDOWN_MS,
  SHAKE_NOISE_HZ, SHAKE_NOISE_PRIMARY_PHASE, SHAKE_NOISE_PRIMARY_FREQUENCY, SHAKE_NOISE_SECONDARY_FREQUENCY, SHAKE_NOISE_SECONDARY_PHASE, SHAKE_DEFAULT_INTENSITY,
  SHAKE_MIN_INTENSITY, SHAKE_MAX_INTENSITY, SHAKE_INTENSITY_STEP, SHAKE_SLIDER_REFERENCE, SHAKE_ABSOLUTE_CAP_PX,
  SHAKE_HIT_TRAUMA, SHAKE_HIT_DAMAGE_REFERENCE, SHAKE_HIT_MIN_INTERVAL_MS, SHAKE_KILL_TRAUMA,
  HIT_FLASH_MIN_INTERVAL_MS, THORNS_FLASH_INTERVAL_MS, THORNS_NUMBER_MERGE_MS, THORNS_NUMBER_COLOR,
  AREA_RING_WIDTH, AREA_TELEGRAPH_WIDTH, AREA_DASH_ON, AREA_DASH_OFF,
  AREA_RING_STROKE_ALPHA, AREA_TELEGRAPH_STROKE_ALPHA, AREA_RING_FILL_ALPHA,
  AREA_TELEGRAPH_FILL_START_ALPHA, AREA_TELEGRAPH_FILL_END_ALPHA, AREA_ENEMY_FILL_END_ALPHA,
  AREA_TELEGRAPH_SWEEP_BASE_ALPHA, AREA_TELEGRAPH_SWEEP_FILL_ALPHA,
  AREA_TELEGRAPH_SWEEP_HAND_ALPHA, AREA_TELEGRAPH_SWEEP_HAND_WIDTH,
  AREA_ENEMY_MARKER_MIN_RADIUS, AREA_COLORS,
  MAX_BURSTS_PER_FRAME, KILL_BURST_THRESHOLD, KILL_BURST_WINDOW_MS, KILL_MASS_SHAKE_TRAUMA, KILL_MASS_PUFF_PARTICLES,
  FRAME_TIME_TARGET_MS, ADAPTIVE_RESTORE_MS, ADAPTIVE_SAMPLE_FRAMES, QUALITY_PARTICLE_FACTOR, FRAME_CAP_FPS,
  BTN_SIZE_PRIMARY, BTN_SIZE_SKILL, BTN_SIZE_ULT, BTN_OUTLINE_WIDTH, BTN_OUTLINE_COLOR,
  BTN_GAP_X, BTN_LABEL_GAP, BTN_LABEL_HEIGHT, BTN_LABEL_SIZE, BTN_LABEL_CLEARANCE,
  BTN_ICON_SCALE, MECH_ICON_SWAP, BTN_COLORS, BTN_HIGHLIGHT_READY_COLOR, PARTICLE_CAP,
  CONFETTI_QUALITY_FACTOR } from '../../config/tuning.js';
import { playSound, setAudioOptions, setHeartbeat, audioStats, setAudioEnabled, warmUpAudio, startSoundLoop } from './arena-audio.js';
import { createProfiler, effectToggles } from './perf-profiler.js';
import { createTalentBadge, talentKeyLabel, talentKeyTooltip } from './talent-badge.js';
import { preloadHeroSprites, drawCachedHero, getHeroSpriteUrl } from './hero-visuals.js';
import { cosmeticArt, drawCosmeticIcon } from './avatar-cosmetic-art.js';

const canvas = document.querySelector('#world');
const ARENA_WIDTH = GAME_CONFIG.arena.width;
const ARENA_HEIGHT = GAME_CONFIG.arena.height;
const touchViewport = matchMedia('(pointer: coarse)');
const MOBILE_ZOOM_MAX = 2.8;
let mobileZoom = 1.8;
let pinchStart = null;
const pinchPointers = new Map();
// Rasterize close to the displayed viewport while keeping world coordinates fixed.
function arenaRenderScale() {
  const fit = touchViewport.matches
    ? Math.max(innerWidth / ARENA_WIDTH, innerHeight / ARENA_HEIGHT)
    : Math.min(innerWidth / ARENA_WIDTH, innerHeight / ARENA_HEIGHT);
  return Math.min(1, Math.max(0.4, fit));
}
let renderScale = arenaRenderScale();
function resizeCanvasBacking() {
  if (touchViewport.matches) {
    canvas.width = Math.round(innerWidth * renderScale);
    canvas.height = Math.round(innerHeight * renderScale);
  } else {
    canvas.width = Math.round(ARENA_WIDTH * renderScale);
    canvas.height = Math.round(ARENA_HEIGHT * renderScale);
  }
}
resizeCanvasBacking();
let particleBudget = Math.max(100, Math.floor(GAME_CONFIG.arenaTuning.performance.maxParticles * renderScale * renderScale));
const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
let heroSpriteCache = null;
let heroSpriteConfig = null;
let heroSpritesDisabled = false;
const heroOffsets = new Map();
const heroFacing = new Map();
const heroUltimateLook = new Map();
const heroTransformStarts = new Map();
const heroPreviousPositions = new Map();
const heroHitFlashStarts = new Map();
const heroHitFlashLast = new Map();
void preloadHeroSprites().then((cache) => {
  heroSpriteCache = cache; heroSpriteConfig = cache.config;
  syncHeroMenus();
  updateHud();
}).catch((error) => console.warn('[Hero sprites] Config failed; using emoji.', error));
const backgroundCanvas = document.createElement('canvas');
backgroundCanvas.width = Math.round(ARENA_WIDTH * renderScale);
backgroundCanvas.height = Math.round(ARENA_HEIGHT * renderScale);
const backgroundContext = backgroundCanvas.getContext('2d');
backgroundContext.scale(renderScale, renderScale);
paintForestClearing(backgroundContext);

function resizeArenaRaster() {
  const nextScale = arenaRenderScale();
  const scaleChanged = Math.abs(nextScale - renderScale) >= 0.001;
  renderScale = nextScale;
  const canvasWidth = touchViewport.matches ? Math.round(innerWidth * renderScale) : Math.round(ARENA_WIDTH * renderScale);
  const canvasHeight = touchViewport.matches ? Math.round(innerHeight * renderScale) : Math.round(ARENA_HEIGHT * renderScale);
  const canvasChanged = canvas.width !== canvasWidth || canvas.height !== canvasHeight;
  if (canvasChanged) resizeCanvasBacking();
  if (scaleChanged) {
    backgroundCanvas.width = Math.round(ARENA_WIDTH * renderScale);
    backgroundCanvas.height = Math.round(ARENA_HEIGHT * renderScale);
    backgroundContext.scale(renderScale, renderScale);
    paintForestClearing(backgroundContext);
  }
  particleBudget = Math.max(100, Math.floor(GAME_CONFIG.arenaTuning.performance.maxParticles * renderScale * renderScale));
}

function mobileMinimumZoom() {
  const fitScale = Math.min(innerWidth / ARENA_WIDTH, innerHeight / ARENA_HEIGHT);
  const coverScale = Math.max(innerWidth / ARENA_WIDTH, innerHeight / ARENA_HEIGHT);
  return fitScale / coverScale;
}

function mobileCameraView() {
  if (!touchViewport.matches) return null;
  const player = state.players?.find((candidate) => candidate.id === me);
  const coverScale = Math.max(innerWidth / ARENA_WIDTH, innerHeight / ARENA_HEIGHT);
  mobileZoom = Math.max(mobileMinimumZoom(), Math.min(MOBILE_ZOOM_MAX, mobileZoom));
  return {
    scale: coverScale * mobileZoom,
    x: player?.x ?? ARENA_WIDTH / 2,
    y: player?.y ?? ARENA_HEIGHT / 2,
  };
}

function pinchDistance() {
  const [a, b] = [...pinchPointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function beginTouchZoom(event) {
  if (!touchViewport.matches || event.pointerType !== 'touch') return;
  pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinchPointers.size === 2) {
    pinchStart = { distance: Math.max(1, pinchDistance()), zoom: mobileZoom };
    if (primaryPointerId !== null) {
      primaryPointerId = null;
      setPrimaryHeld(false);
    }
  }
}

function moveTouchZoom(event) {
  if (!pinchPointers.has(event.pointerId)) return;
  pinchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinchStart && pinchPointers.size >= 2) {
    mobileZoom = Math.max(mobileMinimumZoom(), Math.min(MOBILE_ZOOM_MAX,
      pinchStart.zoom * pinchDistance() / pinchStart.distance));
    event.preventDefault();
  }
}

function endTouchZoom(event) {
  pinchPointers.delete(event.pointerId);
  if (pinchPointers.size < 2) pinchStart = null;
}

// The arena floor: a calm woodland clearing. Everything here is low contrast
// on purpose, so enemies, projectiles, rings and the campfire stay the
// clearest things on screen, and nothing reads as a wall or a hitbox. A fixed
// seed keeps the floor identical between visits.
function paintForestClearing(g) {
  const W = ARENA_WIDTH; const H = ARENA_HEIGHT;
  const cx = W / 2; const cy = H / 2;
  let seed = 0x5eed;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  const base = g.createRadialGradient(cx, cy, 80, cx, cy, Math.hypot(cx, cy));
  base.addColorStop(0, '#8CBB66');
  base.addColorStop(0.55, '#7DAF5A');
  base.addColorStop(1, '#5F9448');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  // soft mottling, like light through leaves
  for (let i = 0; i < 46; i += 1) {
    g.globalAlpha = 0.06 + rand() * 0.05;
    g.fillStyle = rand() < 0.5 ? '#9CC873' : '#6A9E4E';
    g.beginPath();
    g.ellipse(rand() * W, rand() * H, 90 + rand() * 170, 50 + rand() * 90, rand() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // worn earth around the campfire, where the party gathers
  g.globalAlpha = 1;
  const worn = g.createRadialGradient(cx, cy, 30, cx, cy, 230);
  worn.addColorStop(0, 'rgba(178,160,104,.42)');
  worn.addColorStop(0.6, 'rgba(160,160,96,.16)');
  worn.addColorStop(1, 'rgba(160,160,96,0)');
  g.fillStyle = worn;
  g.beginPath(); g.ellipse(cx, cy, 250, 220, 0, 0, Math.PI * 2); g.fill();
  // faint footpaths wandering in from the forest toward the fire
  const paths = [
    [[cx - 40, -20], [cx - 120, cy * 0.45], [cx - 30, cy - 175]],
    [[cx + 60, H + 20], [cx + 170, cy * 1.55], [cx + 40, cy + 175]],
    [[-20, cy + 60], [cx * 0.42, cy + 140], [cx - 180, cy + 30]],
    [[W + 20, cy - 80], [cx * 1.6, cy - 150], [cx + 180, cy - 30]],
  ];
  g.lineCap = 'round';
  for (const [width, alpha] of [[78, 0.1], [50, 0.16]]) {
    g.strokeStyle = `rgba(176,150,96,${alpha})`;
    g.lineWidth = width;
    for (const [a, b, c] of paths) {
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(b[0], b[1], c[0], c[1]); g.stroke();
    }
  }
  // grass tufts and a few tiny flowers, kept out of the campfire ring
  const blades = ['#5F984C', '#6EA451', '#A2C66B'];
  for (let tuft = 0; tuft < 420; tuft += 1) {
    const x = rand() * W; const y = rand() * H;
    if (Math.hypot(x - cx, y - cy) < 190) continue;
    g.globalAlpha = 0.22 + rand() * 0.2;
    const count = 2 + Math.floor(rand() * 3);
    for (let b = 0; b < count; b += 1) {
      const bx = x + (b - (count - 1) / 2) * 3.4;
      const h = 4 + rand() * 5;
      g.fillStyle = blades[Math.floor(rand() * blades.length)];
      g.beginPath(); g.moveTo(bx - 1.8, y + 1.5); g.lineTo(bx + (rand() - 0.5) * 4, y - h); g.lineTo(bx + 1.8, y + 1.5); g.closePath(); g.fill();
    }
  }
  const petals = ['#FFF4C9', '#F2BA55', '#D86F6B', '#BBA6E6'];
  for (let i = 0; i < 70; i += 1) {
    const x = rand() * W; const y = rand() * H;
    if (Math.hypot(x - cx, y - cy) < 260) continue;
    g.globalAlpha = 0.5;
    g.fillStyle = petals[i % petals.length];
    g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill();
  }
  // the forest edge frames the clearing (the arena bounds are the real limit)
  g.globalAlpha = 1;
  const edge = (x0, y0, x1, y1) => {
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, 'rgba(37,73,55,.62)');
    grad.addColorStop(1, 'rgba(37,73,55,0)');
    return grad;
  };
  g.fillStyle = edge(0, 0, 0, 110); g.fillRect(0, 0, W, 110);
  g.fillStyle = edge(0, H, 0, H - 110); g.fillRect(0, H - 110, W, 110);
  g.fillStyle = edge(0, 0, 110, 0); g.fillRect(0, 0, 110, H);
  g.fillStyle = edge(W, 0, W - 110, 0); g.fillRect(W - 110, 0, 110, H);
  const bushes = ['#2F5E3E', '#3B7048', '#467747'];
  const bush = (x, y) => {
    const r = 24 + rand() * 18;
    g.fillStyle = bushes[Math.floor(rand() * bushes.length)];
    g.strokeStyle = 'rgba(35,56,47,.55)'; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
  };
  for (let x = -10; x <= W + 10; x += 34) { bush(x + rand() * 10, -8 + rand() * 10); bush(x + rand() * 10, H + 8 - rand() * 10); }
  for (let y = -10; y <= H + 10; y += 34) { bush(-8 + rand() * 10, y + rand() * 10); bush(W + 8 - rand() * 10, y + rand() * 10); }
  g.globalAlpha = 1;
}

// Storybook campfire: a stone ring, crossed logs and a layered flame (or a
// charred heap with smoke once it has gone out). Replaces the old emoji.
function drawCampfire(g, cf, time) {
  const lit = cf.hp > 0;
  const r = cf.radius;
  g.save();
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.fillStyle = 'rgba(35,56,47,.28)';
  g.beginPath(); g.ellipse(cf.x, cf.y + r * 0.35, r * 1.35, r * 0.6, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = lit ? '#4A3424' : '#3A3A36';
  g.beginPath(); g.ellipse(cf.x, cf.y + 4, r * 0.92, r * 0.5, 0, 0, Math.PI * 2); g.fill();
  const log = (x1, y1, x2, y2, color) => {
    g.strokeStyle = '#23382F'; g.lineWidth = 11; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = color; g.lineWidth = 7; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  };
  log(cf.x - r * 0.75, cf.y + 10, cf.x + r * 0.6, cf.y - 4, lit ? '#9E6238' : '#4C4640');
  log(cf.x + r * 0.75, cf.y + 10, cf.x - r * 0.6, cf.y - 4, lit ? '#7A4A2E' : '#3F3A35');
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const sx = cf.x + Math.cos(a) * r; const sy = cf.y + 4 + Math.sin(a) * r * 0.55;
    g.fillStyle = i % 2 ? '#AAB6A0' : '#98A58F';
    g.strokeStyle = '#23382F'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(sx, sy, 7.5, 5.5, a, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  if (lit) {
    const t = time / 150;
    const layers = [['#EF7137', 17, 46], ['#F2BA55', 11, 33], ['#FFF1B8', 5.5, 18]];
    for (const [color, w, h] of layers) {
      const sway = Math.sin(t + w) * 3;
      const lift = Math.sin(t * 1.6 + h) * 3;
      const baseY = cf.y + 2;
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(cf.x - w, baseY);
      g.quadraticCurveTo(cf.x - w * 1.1, baseY - h * 0.55, cf.x + sway, baseY - h - lift);
      g.quadraticCurveTo(cf.x + w * 1.1, baseY - h * 0.55, cf.x + w, baseY);
      g.closePath();
      g.fill();
      if (color === '#EF7137') { g.strokeStyle = '#23382F'; g.lineWidth = 2.5; g.stroke(); }
    }
  } else {
    for (let i = 0; i < 3; i += 1) {
      const phase = ((time / 1800) + i / 3) % 1;
      g.globalAlpha = 0.45 * (1 - phase);
      g.fillStyle = '#C9CFC4';
      g.beginPath(); g.arc(cf.x + Math.sin(phase * 6 + i) * 6, cf.y - 8 - phase * 46, 8 + phase * 10, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}

// Lobby training dummy: a straw target on a post instead of an emoji disk.
function drawTrainingDummy(g, x, y, scale, flash) {
  g.save();
  g.lineJoin = 'round';
  g.fillStyle = 'rgba(35,56,47,.22)';
  g.beginPath(); g.ellipse(x, y + 20 * scale, 16 * scale, 5 * scale, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#23382F'; g.lineWidth = 7 * scale;
  g.beginPath(); g.moveTo(x, y + 20 * scale); g.lineTo(x, y - 4 * scale); g.stroke();
  g.strokeStyle = '#7A4A2E'; g.lineWidth = 4 * scale;
  g.beginPath(); g.moveTo(x, y + 20 * scale); g.lineTo(x, y - 4 * scale); g.stroke();
  const rings = [[19, flash ? '#FFFFFF' : '#E8CB7A'], [12.5, flash ? '#FFFFFF' : '#FFF8E4'], [6, flash ? '#FFFFFF' : '#D86F6B']];
  for (const [radius, fill] of rings) {
    g.fillStyle = fill; g.strokeStyle = '#23382F'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y - 10 * scale, radius * scale, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  g.restore();
}
const connectionStatus = document.querySelector('#connection-status');
const enemyCount = document.querySelector('#enemy-count');
const waveNumber = document.querySelector('#wave-number');
const waveDetails = document.querySelector('#wave-details');
const breakPill = document.querySelector('#break-pill');
// I-card talent row: the badge is shared with the World page (talent-badge.js).
const talentBadgeHost = document.querySelector('#stat-talent-badge');
const talentKeyChip = document.querySelector('#stat-talent-key');
const heroName = document.querySelector('#hero-name');
const healthFill = document.querySelector('#health-fill');
const healthTrack = document.querySelector('.health-track');
const healthValue = document.querySelector('#health-value');
const teamHealth = null; // (removed — merged into #player-roster)
const roomCodeCorner = document.querySelector('#room-code-corner');
const roomCodeButton = document.querySelector('#room-code');
const roomCodeValue = document.querySelector('#room-code-value');
const roomCodeCopied = document.querySelector('#room-code-copied');
const waitingBanner = document.querySelector('#waiting-banner');
const waitingDetail = document.querySelector('#waiting-detail');
const abilityHud = document.querySelector('#ability-hud');
const toastStack = document.querySelector('#toast-stack');
const playerRoster = document.querySelector('#player-roster');
const partyCount = document.querySelector('#party-count');
const enemyCountLabel = document.querySelector('.enemy-count-label');
const lobbyBar = document.querySelector('#lobby-bar');
const lobbyHero = document.querySelector('#lobby-hero');
const startRunButton = document.querySelector('#start-run');
const lobbyHint = document.querySelector('#lobby-hint');
const countdownOverlay = document.querySelector('#countdown');
const countdownValue = document.querySelector('#countdown-value');
const buffIcons = document.querySelector('#buff-icons');
const downedList = null; // (removed — merged into #player-roster)
const joinBriefing = document.querySelector('#join-briefing');
const infoButton = document.querySelector('#info-button');
const statsPanel = document.querySelector('#stats-panel');
const infoCloseButton = document.querySelector('#info-close');
const buffVote = document.querySelector('#buff-vote');
const buffCards = document.querySelector('#buff-cards');
const targetingHint = document.querySelector('#targeting-hint');
const targetingCancel = document.querySelector('#targeting-cancel');
const targetingReticle = document.querySelector('#targeting-reticle');
const targetingHintText = targetingHint.firstChild;
const defaultTargetingHintText = targetingHintText?.textContent || '';
const movementStick = document.querySelector('#move-stick');
const touchHelp = document.querySelector('#touch-help');
const runResultPanel = document.querySelector('#run-result');
const milestoneDawn = document.querySelector('#milestone-dawn');
const sessionSummary = document.querySelector('#session-summary');
const campfireFill = document.querySelector('#campfire-fill');
const campfireValue = document.querySelector('#campfire-value');
const campfireHud = document.querySelector('#campfire-hud');
const bossHud = document.querySelector('#boss-hud');
const bossHealthFill = document.querySelector('#boss-health-fill');
const bossHealthValue = document.querySelector('#boss-health-value');
const momentBanner = document.querySelector('#moment-banner');
const lowHpVignette = document.querySelector('#low-hp-vignette');
const settingsButton = document.querySelector('#settings-button');
const settingsPanel = document.querySelector('#settings-panel');
const shakeSetting = document.querySelector('#shake-setting');
const shakeIntensitySetting = document.querySelector('#shake-intensity-setting');
const shakeIntensityValue = document.querySelector('#shake-intensity-value');
const numbersSetting = document.querySelector('#numbers-setting');
const qualitySetting = document.querySelector('#quality-setting');
const perfSetting = document.querySelector('#perf-setting');
const muteSetting = document.querySelector('#mute-setting');
const volumeSetting = document.querySelector('#volume-setting');
const killStreakHud = document.querySelector('#kill-streak');
const overloadFlash = document.querySelector('#overload-flash');
const sheriffSkillAbility = document.querySelector('.ability[data-ability="skill"]');
const ultimateAbility = document.querySelector('.ability[data-ability="ultimate"]');
// The ability tiles are static markup; cache the list so the 10Hz HUD refresh
// does not re-query the document every tick.
const abilityElements = document.querySelectorAll('.ability[data-ability]');
const engineerTurretPips = document.createElement('span');
engineerTurretPips.className = 'engineer-turret-pips';
const engineerTurretPipLabels = Array.from({ length: 2 }, () => {
  const pip = document.createElement('span'); pip.className = 'engineer-turret-pip'; pip.textContent = '○';
  engineerTurretPips.append(pip); return pip;
});
document.querySelector('.ability[data-ability="skill"]')?.append(engineerTurretPips);
const samuraiMultiplierPill = document.createElement('span');
samuraiMultiplierPill.className = 'samurai-multiplier-pill';
samuraiMultiplierPill.hidden = true;
const samuraiMultiplierValue = document.createElement('b');
const samuraiThresholdTick = document.createElement('i');
samuraiThresholdTick.className = 'samurai-threshold-tick';
samuraiThresholdTick.setAttribute('aria-hidden', 'true');
samuraiMultiplierPill.append(samuraiMultiplierValue, samuraiThresholdTick);
document.querySelector('.ability[data-ability="ultimate"]')?.append(samuraiMultiplierPill);
const rangerDeadAimPill = document.createElement('span');
rangerDeadAimPill.className = 'ranger-ability-pill ranger-dead-aim-pill';
rangerDeadAimPill.hidden = true;
ultimateAbility?.append(rangerDeadAimPill);
const rangerWolfPill = document.createElement('span');
rangerWolfPill.className = 'ranger-ability-pill ranger-wolf-pill';
rangerWolfPill.hidden = true;
sheriffSkillAbility?.append(rangerWolfPill);
const rangerDeadAimRing = document.createElement('span');
rangerDeadAimRing.className = 'ranger-window-ring';
rangerDeadAimRing.setAttribute('aria-hidden', 'true');
ultimateAbility?.querySelector('.ability-circle')?.append(rangerDeadAimRing);
const rangerWolfTimerRing = document.createElement('span');
rangerWolfTimerRing.className = 'ranger-window-ring';
rangerWolfTimerRing.setAttribute('aria-hidden', 'true');
sheriffSkillAbility?.querySelector('.ability-circle')?.append(rangerWolfTimerRing);
let token = null;
const query = new URLSearchParams(location.search);
const embedded = query.has('embedded') && window.parent !== window;
try { if (embedded) token = sessionStorage.getItem('qq-token'); } catch { /* standalone Hero Lab has no app session */ }
const socket = window.io('/hero-lab', { auth: { ...(token ? { token } : {}), debug: !embedded } });
const heroId = query.get('heroId');
const requestedRoomCode = (query.get('room') || '').trim().toUpperCase();
const createRequested = query.get('create') === '1';
const trialTicket = query.get('trialTicket') || '';
const workshopTrial = Boolean(trialTicket);
if (workshopTrial) document.body.dataset.mode = 'workshop-trial';
const selectedHero = HEROES.find((hero) => hero.id === heroId);
if (!selectedHero) location.replace('/hero-lab');
// The hero this client is playing. Lobby swaps change it without a reload.
let activeHeroId = selectedHero.id;

// The room this client is attached to. Set from the URL, then kept from the
// server's welcome so a socket reconnect rejoins the same room instead of
// creating a second one.
let activeRoomCode = requestedRoomCode;
let joinFailed = false;
// Set when the server detaches this socket from the room (leaving at dawn).
let leftRoom = false;

const keys = { up: false, down: false, left: false, right: false };
const stickKeys = { up: false, down: false, left: false, right: false };
let movementPointerId = null;
let abilityGesture = null;
let engineerPlacementTargeting = false;
let rangerMeatTargeting = false;
let primaryPointerId = null;
let lastSentMovement = { up: false, down: false, left: false, right: false };
let abilityAimTimer = null;
let pendingAbilityAim = null;
const codeToKey = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
let me = null;
let state = { players: [], projectiles: [], monsters: [], campfire: null, wave: null };
let debugTurretRanges = false;
const turretVisualState = new Map();
const rangerMeatThrows = new Map();
const rangerMeatLandings = [];
const rangerChargeVisuals = new Map();
const rangerDeadAimStreaks = [];
const rangerDeadAimMuzzleUntil = new Map();
const rangerUltimateFlashAt = new Map();
const rangerWolfBiteFx = [];
const turretHitFlashes = new Map();
const turretHitFlashLast = new Map();
const engineerLaserBeams = [];
const engineerLaserWhineStops = new Map();
const engineerSalvagePopups = new Map();
const turretBodyCanvas = document.createElement('canvas');
turretBodyCanvas.width = 44; turretBodyCanvas.height = 32;
{
  const g = turretBodyCanvas.getContext('2d');
  const body = () => {
    g.beginPath(); g.moveTo(2, 29); g.lineTo(42, 29); g.lineTo(42, 22); g.arc(22, 22, 20, 0, Math.PI, true); g.closePath();
  };
  const wood = g.createLinearGradient(0, 5, 0, 30);
  wood.addColorStop(0, '#D2A06A'); wood.addColorStop(0.48, '#A87547'); wood.addColorStop(1, '#70472F');
  g.fillStyle = wood; g.strokeStyle = '#2A1A13'; g.lineWidth = 3;
  body(); g.fill(); g.save(); body(); g.clip();
  g.strokeStyle = 'rgba(74, 42, 25, 0.48)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(7, 15); g.quadraticCurveTo(22, 12, 37, 15); g.moveTo(4, 20); g.quadraticCurveTo(22, 17, 40, 20); g.moveTo(5, 24); g.quadraticCurveTo(22, 22, 39, 24); g.stroke();
  g.strokeStyle = 'rgba(239, 190, 127, 0.55)'; g.beginPath(); g.moveTo(10, 17); g.quadraticCurveTo(22, 14, 34, 17); g.stroke();
  g.restore(); body(); g.stroke();
  g.fillStyle = '#EBA91F'; g.fillRect(4, 25, 36, 3);
  g.fillStyle = '#3A2418';
  for (const x of [8, 36]) { g.beginPath(); g.arc(x, 26.5, 1.4, 0, Math.PI * 2); g.fill(); }
}
const turretBarrelCanvas = document.createElement('canvas');
turretBarrelCanvas.width = 34; turretBarrelCanvas.height = 16;
{
  const g = turretBarrelCanvas.getContext('2d');
  const wood = g.createLinearGradient(0, 4, 0, 13);
  wood.addColorStop(0, '#BD8957'); wood.addColorStop(0.5, '#8D5D3C'); wood.addColorStop(1, '#573721');
  g.fillStyle = wood; g.strokeStyle = '#2A1A13'; g.lineWidth = 3;
  g.fillRect(1, 4, 30, 9); g.strokeRect(1.5, 4.5, 30, 9);
  g.strokeStyle = 'rgba(237, 187, 123, 0.62)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(4, 7); g.lineTo(27, 7); g.moveTo(5, 10); g.lineTo(24, 10); g.stroke();
  g.fillStyle = '#EBA91F'; g.fillRect(24, 4.5, 3, 8);
}
const turretSpriteImages = { body: null, barrel: null };
for (const part of ['body', 'barrel']) {
  const path = GAME_CONFIG.turret.visuals[part];
  if (!path) continue;
  const sprite = new Image();
  sprite.onload = () => { turretSpriteImages[part] = sprite; };
  sprite.onerror = () => console.warn(`[hero-lab] turret ${part} sprite failed to load (${path}); using placeholder shapes.`);
  sprite.src = new URL(path, `${location.origin}/hero-lab/`).href;
}
let stateReceivedAt = performance.now();
const clientProjectiles = new Map();
const fairyVortexVisuals = new Map();
const fairyVortexPops = [];
const fairyTravelSoundStops = new Map();
const fairyWindImpacts = [];
const fairyMuzzlePuffs = [];
const fairyPushStreaks = [];
const particles = [];
const damageTexts = [];
const lightningArcs = [];
const enemyFlashes = new Map();
const enemyHitFlashUntil = new Map();
// Last time each enemy was ALLOWED to start a hit flash. Aura/repeating
// damage (Thorns Fire) must not restart a flash that is already playing.
const lastEnemyFlashAt = new Map();
const enemyHitFx = new Map();
const deathSprites = [];
const damageNumberMerge = new Map();
// Merge key for the single running-total damage number shown during a
// mass-kill window instead of one number per enemy.
const MASS_NUMBER_KEY = '__mass__';
const leavingPlayers = [];
const areaEffects = [];
const muzzleFlashes = new Map();
const lastMuzzleAt = new Map();
const healParticleAt = new Map();
const previousPositions = new Map();
const momentumVisualAlpha = new Map();
const momentumPositions = new Map();
const momentumReadyLabels = [];
const chainCounters = new Map();
// Emoji bounce above a hero whose ability just came back: Sheriff's 🧨
// Dynamite and Pilot's 🤖 Mech Suit. playerId -> { at, emoji }.
const readyBounces = new Map();
// Talent refund popups: playerId -> { totalMs, startedAt }. Rendered above the
// hero as a clock emoji plus the merged refund amount, replacing the old
// "-0.4s" label that used to sit inside the skill button. Used by Sheriff's
// Quick Draw and Pilot's Adrenaline.
const refundPopups = new Map();
// Guardian Shield Rush: a momentary directional squash of the hero sprite at the
// instant the dash fires. playerId -> { dir: {x,y}, startedAt }. Drawn while the
// dash trail is also live, but the squash is purely cosmetic and decays fast.
const guardianDashSquash = new Map();
const samuraiDashTrails = new Map();
const samuraiSlashEffects = [];
const samuraiHitMarks = [];
const samuraiExecuteLabels = [];
const samuraiCutNumberLabels = [];
const samuraiStackFeedback = new Map();
let samuraiScreenFlash = null;
let refundPopupState = null;
let lastLocalPosition = null;
let localIdleSince = performance.now();
let momentumNudge = null;
let sessionNudgeCount = 0;

// Debug-only profiler. It stays dormant unless the account passes the debug
// gate or the user opened the explicit anonymous debug entry.
const profiler = createProfiler({
  getStats: () => ({
    particles: particles.length + dustPuffs.length,
    damageTexts: damageTexts.length,
    audioVoices: audioStats().voices,
    monsters: state.monsters?.length || 0,
    projectiles: clientProjectiles.size,
    heapMb: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0,
  }),
  getRoomCode: () => activeRoomCode,
  getToken: () => token,
});
profiler.onSoundToggle = (on) => setAudioEnabled(on);
void profiler.start().then((debugEnabled) => {
  if (!debugEnabled) return;
  const debugMenu = document.createElement('div');
  debugMenu.className = 'debug-menu';
  debugMenu.innerHTML = '<strong class="debug-menu-title">Debug tools</strong>';
  const makeDebugSection = (title, className = '') => {
    const section = document.createElement('details');
    section.className = `debug-section ${className}`.trim();
    const summary = document.createElement('summary');
    summary.textContent = title;
    const body = document.createElement('div');
    body.className = 'debug-section-body';
    section.append(summary, body);
    debugMenu.append(section);
    return body;
  };
  const controls = makeDebugSection('Hero visuals', 'sprite-debug-tools');
  controls.innerHTML = '<label><input type="checkbox" data-sprite-debug="hitboxes"> Show hitboxes</label><label><input type="checkbox" data-sprite-debug="disable"> Disable sprites</label><button type="button" data-sprite-debug="ultimate">Force ultimate look</button><button type="button" data-sprite-debug="downed">Force downed</button>';
  settingsPanel.append(debugMenu);
  controls.querySelector('[data-sprite-debug="disable"]').addEventListener('change', (event) => {
    heroSpritesDisabled = event.target.checked;
    syncHeroMenus(); updateHud();
  });
  controls.querySelector('[data-sprite-debug="ultimate"]').addEventListener('click', () => { heroDebugUltimate = !heroDebugUltimate; });
  controls.querySelector('[data-sprite-debug="downed"]').addEventListener('click', () => { heroDebugDowned = !heroDebugDowned; });
  controls.querySelector('[data-sprite-debug="hitboxes"]').addEventListener('change', (event) => { heroDebugHitboxes = event.target.checked; });
  const turretTools = makeDebugSection('Turret testing', 'tower-debug-tools');
  turretTools.innerHTML = '<button type="button" data-turret-place>Place turret at last arena cursor</button><button type="button" data-turret-action="expire">Expire turret in 1 second</button><button type="button" data-turret-action="damage">Damage 50%</button><label><input type="checkbox" data-turret-ranges> Show turret ranges</label><div class="debug-effect-buttons"><button type="button" data-spawn-at="zombie">Spawn zombie at cursor</button><button type="button" data-spawn-at="skeleton">Spawn skeleton at cursor</button><button type="button" data-spawn-at="brute">Spawn Brute at cursor</button></div>';
  turretTools.querySelector('[data-turret-place]').addEventListener('click', () => {
    const point = window.lastPointerWorld || { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
    socket.emit('debug_turret', { action: 'place', ...point });
  });
  turretTools.querySelector('[data-turret-ranges]').addEventListener('change', (event) => { debugTurretRanges = event.target.checked; });
  turretTools.querySelectorAll('[data-turret-action]').forEach((button) => button.addEventListener('click', () => socket.emit('debug_turret', { action: button.dataset.turretAction })));
  turretTools.querySelectorAll('[data-spawn-at]').forEach((button) => button.addEventListener('click', () => {
    const point = window.lastPointerWorld || { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
    socket.emit('debug_spawn_at', { type: button.dataset.spawnAt, ...point });
  }));

  const heroUnlockTools = makeDebugSection('Hero testing');
  heroUnlockTools.innerHTML = '<label>Unlock hero <select data-debug-unlock-hero></select></label><button type="button" data-debug-unlock>Unlock for this browser</button><button type="button" data-debug-preview-vortex>Preview vortex</button><label>Samurai Kill Count <input data-debug-samurai-stacks type="number" min="0" max="20" step="1" value="0"></label><button type="button" data-debug-set-samurai-stacks>Set Kill Count</button><button type="button" data-debug-preview-samurai-cut>Preview Afterimage Cut at cursor</button>';
  const heroUnlockSelect = heroUnlockTools.querySelector('[data-debug-unlock-hero]');
  heroUnlockSelect.replaceChildren(...HEROES.map((hero) => {
    const stars = GAME_CONFIG.arenaTuning.gachaReveal.rarityStars[hero.rarity] || 0;
    const option = document.createElement('option'); option.value = hero.id; option.textContent = `${hero.name} · ${stars}-star`; return option;
  }));
  heroUnlockTools.querySelector('[data-debug-unlock]').addEventListener('click', () => {
    const heroId = heroUnlockSelect.value;
    try {
      const key = 'hero-lab-debug-unlocked-heroes';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      if (!existing.includes(heroId)) localStorage.setItem(key, JSON.stringify([...existing, heroId]));
    } catch { /* the parent picker still receives the unlock message */ }
    window.parent?.postMessage({ type: 'hero-lab-debug-unlock', heroId }, window.location.origin);
    socket.emit('swap_hero', heroId);
    connectionStatus.textContent = `${HEROES.find((hero) => hero.id === heroId)?.name || 'Hero'} unlocked for browser testing.`;
  });
  heroUnlockTools.querySelector('[data-debug-preview-vortex]').addEventListener('click', () => {
    const cursor = window.lastPointerWorld || { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
    previewFairyVortex(cursor.x, cursor.y);
  });
  heroUnlockTools.querySelector('[data-debug-set-samurai-stacks]').addEventListener('click', () => {
    const input = heroUnlockTools.querySelector('[data-debug-samurai-stacks]');
    socket.emit('debug_set_samurai_stacks', Math.max(0, Math.min(20, Math.floor(Number(input.value) || 0))));
  });
  heroUnlockTools.querySelector('[data-debug-preview-samurai-cut]').addEventListener('click', () => previewSamuraiCut());
  const rangerTools = makeDebugSection('Ranger testing');
  rangerTools.innerHTML = '<button type="button" data-ranger-debug="force-full-charge">Force full charge (release M1)</button><button type="button" data-ranger-debug="spawn-wolf">Throw meat and spawn pup at cursor</button><button type="button" data-ranger-debug="grant-dead-aim">Grant Dead Aim (3 arrows)</button>';
  rangerTools.querySelectorAll('[data-ranger-debug]').forEach((button) => button.addEventListener('click', () => {
    const cursor = window.lastPointerWorld || { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
    socket.emit('debug_ranger', { action: button.dataset.rangerDebug, ...cursor });
  }));

  // Tower debug: set this player's Tower level 0..max and force-add a stat card,
  // with a live readout of the derived stats. Same debug gate as above.
  const towerTools = makeDebugSection('Tower & stat cards', 'tower-debug-tools');
  const maxTowerLevel = GAME_CONFIG.arenaTuning.tower.maxLevel;
  const levelOptions = Array.from({ length: maxTowerLevel + 1 }, (_, i) => `<option value="${i}">${i}</option>`).join('');
  towerTools.innerHTML = `<label>Tower Lv <select data-tower-level>${levelOptions}</select></label>`
    + '<label>Add card <select data-tower-card><option value="">—</option><option value="maxHp">maxHp</option><option value="attack">attack</option><option value="defense">defense</option><option value="speed">speed</option></select></label>'
    + '<button type="button" data-tower-add>Add</button><span data-tower-readout></span>';
  towerTools.querySelector('[data-tower-level]').addEventListener('change', (event) => socket.emit('debug_set_tower', Number(event.target.value)));
  towerTools.querySelector('[data-tower-add]').addEventListener('click', () => {
    const cardId = towerTools.querySelector('[data-tower-card]').value;
    if (cardId) socket.emit('debug_add_stat_card', cardId);
  });
  const crowdControlTools = makeDebugSection('Monster effects', 'tower-debug-tools');
  crowdControlTools.innerHTML = '<div class="debug-effect-buttons">'
    + '<button type="button" data-monster-effect="push:enemy">Push enemy</button>'
    + '<button type="button" data-monster-effect="hold:enemy">Hold enemy</button>'
    + '<button type="button" data-monster-effect="slow:enemy">Slow enemy</button>'
    + '<button type="button" data-monster-effect="push:dummy">Push dummy</button>'
    + '<button type="button" data-monster-effect="hold:dummy">Hold dummy</button>'
    + '<button type="button" data-monster-effect="slow:dummy">Slow dummy</button></div>';
  crowdControlTools.querySelectorAll('[data-monster-effect]').forEach((button) => button.addEventListener('click', () => {
    const [effect, target] = button.dataset.monsterEffect.split(':');
    socket.emit('debug_monster_effect', { effect, target });
  }));
  window.setInterval(() => {
    const local = state.players.find((candidate) => candidate.id === me);
    const out = towerTools.querySelector('[data-tower-readout]');
    if (!local) { out.textContent = ''; return; }
    out.textContent = `Lv${local.towerLevel ?? 0} ×${Number(local.towerMultiplier ?? 1).toFixed(2)} · HP ${Math.round(local.maxHp)} · ATK ${Number(local.attack).toFixed(1)} · DEF ${Number(local.defense).toFixed(1)} · SPD ${Number(local.speed).toFixed(1)}`;
  }, 500);
});
let heroDebugUltimate = false;
let heroDebugDowned = false;
let heroDebugHitboxes = false;
try { sessionNudgeCount = Number(sessionStorage.getItem('hero-lab-momentum-nudges') || 0) || 0; } catch { /* session storage is optional */ }
const ARENA_TUNING = GAME_CONFIG.arenaTuning;
document.documentElement.style.setProperty('--cooldown-ring-transition', `${ARENA_TUNING.heroTweaks.cooldownRingTransitionMs}ms`);
document.documentElement.style.setProperty('--ready-glow-period', `${ARENA_TUNING.heroTweaks.readyGlowPeriodMs}ms`);
document.documentElement.style.setProperty('--sheriff-ready-ring-duration', `${ARENA_TUNING.heroTweaks.sheriffReadyRingMs}ms`);
document.documentElement.style.setProperty('--sheriff-refund-pulse-duration', `${ARENA_TUNING.heroTweaks.sheriffRefundPulseMs}ms`);
document.documentElement.style.setProperty('--overload-flash-duration', `${ARENA_TUNING.heroTweaks.electroOverloadFlashMs}ms`);
document.documentElement.style.setProperty('--overload-feedback-duration', `${ARENA_TUNING.heroTweaks.electroOverloadFeedbackMs}ms`);

// --- Ability button cluster: geometry, icons, colours ----------------------
// The three HUD buttons are static markup; this section owns the inline-SVG
// icons (fetched once, cached, pure white via currentColor), the per-slot
// colours and the Pilot mech swap. Geometry constants live in config/tuning.js
// and are pushed to CSS custom properties here so hud.css stays a consumer.
const ABILITY_CLUSTER_HEIGHT_PX = BTN_SIZE_SKILL + BTN_LABEL_GAP + BTN_LABEL_HEIGHT
  + BTN_LABEL_CLEARANCE + BTN_SIZE_ULT + BTN_LABEL_GAP + BTN_LABEL_HEIGHT;
const setBtnVar = (name, value) => document.documentElement.style.setProperty(name, value);
setBtnVar('--btn-size-primary', `${BTN_SIZE_PRIMARY}px`);
setBtnVar('--btn-size-skill', `${BTN_SIZE_SKILL}px`);
setBtnVar('--btn-size-ult', `${BTN_SIZE_ULT}px`);
setBtnVar('--btn-outline-width', `${BTN_OUTLINE_WIDTH}px`);
setBtnVar('--btn-outline-color', BTN_OUTLINE_COLOR);
setBtnVar('--btn-gap-x', `${BTN_GAP_X}px`);
setBtnVar('--btn-label-gap', `${BTN_LABEL_GAP}px`);
setBtnVar('--btn-label-height', `${BTN_LABEL_HEIGHT}px`);
setBtnVar('--btn-label-size', `${BTN_LABEL_SIZE}px`);
setBtnVar('--btn-label-clearance', `${BTN_LABEL_CLEARANCE}px`);
setBtnVar('--btn-icon-scale', String(BTN_ICON_SCALE));
setBtnVar('--ability-cluster-height', `${touchViewport.matches ? 168 : ABILITY_CLUSTER_HEIGHT_PX}px`);
setBtnVar('--ready-highlight-color', BTN_HIGHLIGHT_READY_COLOR);

// data-ability ("weapon") -> config slot ("primary").
const ABILITY_SLOT = { weapon: 'primary', skill: 'skill', ultimate: 'ultimate' };

// Slots that sit on the amber highlight colour family instead of the hero's
// own type family (Pilot's mech form swaps the set).
function heroHighlightSlots(heroId, mechActive) {
  if (mechActive && ABILITY_BTN_HIGHLIGHT_MECH[heroId]) return ABILITY_BTN_HIGHLIGHT_MECH[heroId];
  return ABILITY_BTN_HIGHLIGHT[heroId] || [];
}

// Button colour for one slot: the amber highlight family replaces the type
// family for the hero's listed slots (Pilot's mech form swaps the set).
function heroButtonColor(heroId, heroType, slot, mechActive) {
  if (heroHighlightSlots(heroId, mechActive).includes(slot)) return BTN_COLORS.highlight[slot];
  return (BTN_COLORS[heroType] || BTN_COLORS.physical)[slot];
}

// Inline-SVG icon cache: path -> <svg>. Icons load once and are cloned per
// button, so the 10Hz HUD refresh never touches the network. A failed load
// shows a neutral white ring and warns once per path; the HUD never crashes.
const iconSvgCache = new Map();
const iconLoadFailed = new Set();
const FALLBACK_ICON_SVG = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" stroke-width="9"/></svg>';

function fallbackIconSvg() {
  const host = document.createElement('div');
  host.innerHTML = FALLBACK_ICON_SVG;
  return host.firstElementChild;
}

async function loadAbilityIcon(path) {
  if (iconSvgCache.has(path)) return iconSvgCache.get(path);
  if (iconLoadFailed.has(path)) return null;
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const svg = parsed.querySelector('svg');
    if (!svg || parsed.querySelector('parsererror')) throw new Error('not a usable SVG');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    iconSvgCache.set(path, svg);
    return svg;
  } catch (error) {
    iconLoadFailed.add(path);
    console.warn(`[hero-lab] ability icon failed to load (${path}): ${error.message}. Showing the fallback circle.`);
    return null;
  }
}

const FAIRY_ABILITY_FALLBACK = Object.freeze({ primary: '🏹', skill: '💨', ultimate: '🌪️' });
const ENGINEER_ABILITY_FALLBACK = Object.freeze({ primary: '🔧', skill: '🛠️', ultimate: '⚡' });
const SAMURAI_ABILITY_FALLBACK = Object.freeze({ primary: '🌟', skill: '🗡️', ultimate: '🌙' });
const RANGER_ABILITY_FALLBACK = Object.freeze({ primary: '🏹', skill: '🍖', ultimate: '🎯', talent: '🐾' });
function setAbilityIcon(host, path, fallbackEmoji = '') {
  const cached = iconSvgCache.get(path);
  if (cached) {
    host.replaceChildren(cached.cloneNode(true));
    return;
  }
  if (iconLoadFailed.has(path)) {
    host.replaceChildren(fallbackEmoji ? document.createTextNode(fallbackEmoji) : fallbackIconSvg());
    return;
  }
  // Interim ring so the button never sits empty while the file loads.
  host.replaceChildren(fallbackIconSvg());
  if (iconLoadFailed.has(path)) return;
  loadAbilityIcon(path).then((svg) => {
    if (svg && host.isConnected) host.replaceChildren(svg.cloneNode(true));
    else if (!svg && host.isConnected && fallbackEmoji) host.replaceChildren(document.createTextNode(fallbackEmoji));
  });
}

function applyClusterIcons(heroId, mechActive, elements) {
  const map = ABILITY_ICONS[heroId];
  for (const element of elements) {
    const slot = ABILITY_SLOT[element.dataset.ability];
    const host = element.querySelector('.ability-icon');
    if (!slot || !host) continue;
    let path = map?.[slot];
    if (MECH_ICON_SWAP && mechActive) {
      if (slot === 'primary' && map.mechPrimary) path = map.mechPrimary;
      if (slot === 'skill' && map.mechSkill) path = map.mechSkill;
    }
    if (path) setAbilityIcon(host, path, heroId === 'ranger' ? RANGER_ABILITY_FALLBACK[slot]
      : heroId === 'fairy' ? FAIRY_ABILITY_FALLBACK[slot]
      : heroId === 'engineer' ? ENGINEER_ABILITY_FALLBACK[slot]
        : heroId === 'samurai' ? SAMURAI_ABILITY_FALLBACK[slot] : '');
    else if (heroId === 'engineer') host.replaceChildren(document.createTextNode(ENGINEER_ABILITY_FALLBACK[slot] || ''));
  }
}

// Applied on hero change and whenever the Pilot's mech form toggles.
let hudIconHeroId = null;
let hudIconMech = false;
function applyAbilityIcons(heroId, mechActive) {
  applyClusterIcons(heroId, mechActive, abilityElements);
  hudIconHeroId = heroId;
  hudIconMech = mechActive;
}

// Settings -> "Icon credits": the license line is static markup, the author
// list is generated from CREDITS.json so swapping an icon stays correct.
async function renderIconCredits() {
  const list = document.querySelector('#icon-credits-list');
  if (!list) return;
  try {
    const response = await fetch('assets/icons/CREDITS.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const credits = await response.json();
    const byAuthor = new Map();
    for (const entry of Object.values(credits.icons || {})) {
      if (!byAuthor.has(entry.author)) byAuthor.set(entry.author, []);
      byAuthor.get(entry.author).push(`${entry.hero} ${entry.slot} (${entry.originalFile})`);
    }
    list.replaceChildren(...[...byAuthor.entries()].map(([author, items]) => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = author;
      item.append(name, ` — ${items.join(', ')}`);
      return item;
    }));
  } catch {
    // Best-effort: the license sentence above stands on its own.
  }
}
void renderIconCredits();
const hasCard = (id) => (state.activeBuffs || []).some((buff) => buff.id === id);
const settings = { screenShake: true, shakeIntensity: SHAKE_DEFAULT_INTENSITY, damageNumbers: true, masterVolume: ARENA_TUNING.sound.defaultMasterVolume, muted: false, effectsQuality: 'auto' };
// Settings schema version. v1 -> v2 re-scaled the shake slider from 0-100
// (default 100) to 0-200 (default 50), so an old stored value v migrates to
// v / 2 and old 100 lands exactly on the new neutral 50.
const SETTINGS_VERSION = 2;
let storedSettings = {};
try { storedSettings = JSON.parse(localStorage.getItem('hero-lab-settings') || '{}'); } catch { /* use defaults */ }
if (storedSettings && storedSettings.settingsVersion !== SETTINGS_VERSION) {
  if (Number.isFinite(Number(storedSettings.shakeIntensity))) {
    storedSettings.shakeIntensity = Number(storedSettings.shakeIntensity) / 2;
  }
  storedSettings.settingsVersion = SETTINGS_VERSION;
}
Object.assign(settings, storedSettings);
settings.settingsVersion = SETTINGS_VERSION;
if (!['auto', 'high', 'medium', 'low'].includes(settings.effectsQuality)) settings.effectsQuality = 'auto';
const storedShakeIntensity = Number(settings.shakeIntensity);
settings.shakeIntensity = Number.isFinite(storedShakeIntensity)
  ? Math.max(SHAKE_MIN_INTENSITY, Math.min(SHAKE_MAX_INTENSITY, storedShakeIntensity)) : SHAKE_DEFAULT_INTENSITY;
setAudioOptions({ volume: settings.masterVolume, mute: settings.muted });
let lastTime = performance.now();
let lastBuffRender = '';
let trauma = 0;
let lastTraumaUpdateAt = performance.now();
let lastExplosionTraumaAt = Number.NEGATIVE_INFINITY;
// Rate limit for the per-hit camera kick, so a fast weapon (or a chain of
// ticks landing in one frame) cannot machine-gun the camera.
let lastHitShakeAt = 0;
let cameraZoom = { until: 0, scale: 1 };
let combo = { count: 0, lastKillAt: 0 };
let bannerTimer = null;
let lastHudUpdateAt = 0;
let lastAimSentAt = 0;
let aimSendTimer = null;
let briefingTimer = null;
let briefingFadeTimer = null;
const BRIEFING_SESSION_KEY = 'hero-lab-briefing-shown';
const abilityReadyAt = new Map();
const runAgainHero = document.querySelector('#run-again-hero');
const runResultStats = document.querySelector('#run-result-stats');
const runResultUpgrades = document.querySelector('#run-result-upgrades');
let latestRunResult = null;

function saveSettings() {
  try { localStorage.setItem('hero-lab-settings', JSON.stringify(settings)); } catch { /* browser storage may be unavailable */ }
  setAudioOptions({ volume: settings.masterVolume, mute: settings.muted });
}

// Pre-rendered glyph cache. Every kill-effect used to call ctx.fillText (and
// rebuild a font string) per particle/number/sprite every frame. We render each
// distinct glyph once to a small offscreen canvas and blit it with drawImage,
// which is far cheaper and removes the per-frame string + font allocation.
// The cache is capped: glyph keys include free-form text (damage values), so
// an uncapped map would grow for the whole session. Rare labels simply
// re-render after a clear.
const GLYPH_CACHE_CAP = 256;
const particlePool = [];
const _glyphCache = new Map();
function _makeGlyph(key, size, draw) {
  let entry = _glyphCache.get(key);
  if (entry) return entry;
  if (_glyphCache.size >= GLYPH_CACHE_CAP) _glyphCache.clear();
  const pad = 6;
  const w = Math.ceil(size) + pad * 2;
  const h = Math.ceil(size) + pad * 2;
  const dpr = 2;
  const canvas = document.createElement('canvas');
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const c = canvas.getContext('2d');
  c.scale(dpr, dpr);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  draw(c, w, h);
  entry = { canvas, w, h };
  _glyphCache.set(key, entry);
  return entry;
}
function emojiGlyph(emoji, size) {
  return _makeGlyph(`e:${emoji}:${Math.round(size)}`, size, (c, w, h) => {
    c.font = `${Math.round(size)}px sans-serif`;
    c.fillText(emoji, w / 2, h / 2);
  });
}
function textGlyph(text, color, size) {
  return _makeGlyph(`t:${text}:${color}:${Math.round(size)}`, size, (c, w, h) => {
    c.font = `bold ${Math.round(size)}px sans-serif`;
    c.fillStyle = color;
    c.fillText(text, w / 2, h / 2);
  });
}
function whiteGlyph(emoji, size) {
  return _makeGlyph(`w:${emoji}:${Math.round(size)}`, size, (c, w, h) => {
    c.font = `${Math.round(size)}px sans-serif`;
    c.fillText(emoji, w / 2, h / 2);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#fff';
    c.fillRect(0, 0, w, h);
  });
}

// Emoji sizes in the kill path are continuous (radius * 2, 32 * scale), so a
// per-frame glyph key would rebuild a string for every particle. Instead each
// emoji is pre-rendered once per size bucket and the draw loop picks the
// nearest bucket by index - no string work per particle per frame.
const GLYPH_SIZE_BUCKETS = [12, 16, 20, 24, 28, 32, 40, 48];
const _emojiGlyphBuckets = new Map();
const _whiteGlyphBuckets = new Map();
function _nearestBucket(size) {
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < GLYPH_SIZE_BUCKETS.length; i += 1) {
    const diff = Math.abs(GLYPH_SIZE_BUCKETS[i] - size);
    if (diff < bestDiff) { bestDiff = diff; best = i; }
  }
  return best;
}
function particleEmojiGlyph(emoji, size) {
  let buckets = _emojiGlyphBuckets.get(emoji);
  if (!buckets) {
    buckets = GLYPH_SIZE_BUCKETS.map((bucketSize) => emojiGlyph(emoji, bucketSize));
    _emojiGlyphBuckets.set(emoji, buckets);
  }
  return buckets[_nearestBucket(size)];
}
function particleWhiteGlyph(emoji, size) {
  let buckets = _whiteGlyphBuckets.get(emoji);
  if (!buckets) {
    buckets = GLYPH_SIZE_BUCKETS.map((bucketSize) => whiteGlyph(emoji, bucketSize));
    _whiteGlyphBuckets.set(emoji, buckets);
  }
  return buckets[_nearestBucket(size)];
}

// One cached radial-glow sprite per color, blitted with drawImage. Replaces a
// per-projectile createRadialGradient every frame.
const _glowSprites = new Map();
function glowSprite(color, inner, outer) {
  const key = `${color}|${inner}|${outer}`;
  let sprite = _glowSprites.get(key);
  if (sprite) return sprite;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  const gradient = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.3, outer);
  gradient.addColorStop(0.62, `${color}aa`);
  gradient.addColorStop(1, 'transparent');
  c.fillStyle = gradient;
  c.fillRect(0, 0, size, size);
  sprite = { canvas, size };
  _glowSprites.set(key, sprite);
  return sprite;
}

// Pre-rendered permanent area rings (heal ring, Thorns ring). Each sprite is
// the full ring treatment - dashed colored stroke and translucent inner fill
// - rasterized once per radius and blitted with
// drawImage, so the two permanent rings cost one blit each per frame instead
// of ~6 stroked arcs. Transient telegraphs still draw live: their radius and
// fill alpha change every frame.
const _ringSprites = new Map();
function ringSprite(key, radius, strokeColor, fillColor, width, strokeAlpha) {
  let sprite = _ringSprites.get(key);
  if (sprite) return sprite;
  const pad = Math.ceil(width / 2 + 2);
  const size = Math.ceil((radius + pad) * 2);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');
  const center = size / 2;
  // Inner fill first so the strokes stay crisp on top of it.
  c.beginPath(); c.arc(center, center, radius, 0, Math.PI * 2);
  c.globalAlpha = AREA_RING_FILL_ALPHA; c.fillStyle = fillColor; c.fill();
  // Dashed colored main stroke.
  c.globalAlpha = strokeAlpha;
  c.strokeStyle = strokeColor;
  c.lineWidth = width;
  c.setLineDash([AREA_DASH_ON, AREA_DASH_OFF]);
  c.beginPath(); c.arc(center, center, radius, 0, Math.PI * 2); c.stroke();
  sprite = { canvas, size };
  _ringSprites.set(key, sprite);
  return sprite;
}

// Pre-render the kill-path emoji once at load (spec 2A). Without this, the
// first mass kill of a session builds every glyph's offscreen canvas inside a
// single frame - measured at 100-270 ms in headless software rendering.
// Deferred one tick so the first paint is never blocked; lazy rendering stays
// as the fallback for anything not in this list.
const KILL_PATH_EMOJIS = ['🧟', '😈', '💀', '💣', '👑', '🔴', '✨'];
const PREWARM_GLYPH_SIZES = [12, 32, 40];
function prewarmKillGlyphs() {
  try {
    for (const emoji of KILL_PATH_EMOJIS) {
      for (const size of PREWARM_GLYPH_SIZES) {
        particleEmojiGlyph(emoji, size);
        particleWhiteGlyph(emoji, size);
      }
    }
  } catch { /* best-effort: unknown emoji still renders lazily */ }
}
if (typeof window !== 'undefined') setTimeout(prewarmKillGlyphs, 0);

function addParticle(particle) {
  // Hard cap: when full, recycle the OLDEST particle so a new kill effect is
  // never silently skipped (the kill sound and flash still play regardless).
  if (particles.length >= particleBudget) {
    const oldest = particles.shift();
    if (oldest) particlePool.push(oldest);
  }
  const p = particlePool.pop() || {};
  // Normalize the two draw-path discriminators explicitly instead of deleting
  // stale keys: delete forces pooled objects into dictionary mode, which makes
  // every later property access slower. Shape stays stable across reuse.
  p.emoji = particle.emoji;
  p.text = particle.text;
  p.travelTargetX = particle.travelTargetX ?? null;
  p.travelTargetY = particle.travelTargetY ?? null;
  p.travelStartX = particle.travelStartX ?? null;
  p.travelStartY = particle.travelStartY ?? null;
  p.travelStartedAt = particle.travelStartedAt ?? null;
  p.travelDurationMs = particle.travelDurationMs ?? null;
  Object.assign(p, particle);
  particles.push(p);
}

// Dash / roll dust: soft earth-tone puffs at the feet that swell as they fade
// (the shared sparks shrink instead). Own pool and hard cap so dust never
// evicts combat sparks; off under reduced motion, the 'burst' toggle and low
// quality, thinned on medium. Drawn on the ground layer, below area rings,
// telegraphs, characters and health bars, so it can never hide them.
const DUST_COLORS = ['#C4AE84', '#A8916A', '#D6C49E'];
const DUST_CAP = { high: 36, medium: 18 };
const DUST_EMIT_MS = { high: 45, medium: 85 };
const dustPuffs = [], dustPool = [], dustEmitAt = new Map(), wolfDustChecks = new Map();
function dustAllowed() { return !prefersReducedMotion && effectToggles.burst && effectiveQuality() !== 'low'; }
function spawnDust(x, y, dirX = 0, dirY = 0, count = 1, now = performance.now()) {
  if (!dustAllowed()) return;
  const quality = effectiveQuality(), cap = DUST_CAP[quality] ?? DUST_CAP.medium;
  if (quality !== 'high') count = Math.ceil(count / 2);
  for (let i = 0; i < count; i++) {
    if (dustPuffs.length >= cap) dustPool.push(dustPuffs.shift());
    const p = dustPool.pop() || {}, side = Math.random() - 0.5, speed = 10 + Math.random() * 22;
    p.x = x + (Math.random() - 0.5) * 12 - dirX * 6; p.y = y + (Math.random() - 0.5) * 4 - dirY * 4;
    p.vx = -dirX * speed - dirY * side * 26; p.vy = (-dirY * speed + dirX * side * 26) * 0.55 - 5;
    p.r0 = 3 + Math.random() * 2.5; p.grow = 5 + Math.random() * 5; p.alpha = 0.36 + Math.random() * 0.14;
    p.color = DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0]; p.startedAt = now; p.lifeMs = 300 + Math.random() * 160;
    dustPuffs.push(p);
  }
}
// Throttled trail emitter for anything moving fast along the ground.
function emitDashDust(key, x, y, dirX, dirY, now = performance.now()) {
  if (!dustAllowed() || now - (dustEmitAt.get(key) || 0) < (DUST_EMIT_MS[effectiveQuality()] ?? DUST_EMIT_MS.medium)) return;
  if (dustEmitAt.size > 64) dustEmitAt.clear();
  dustEmitAt.set(key, now); spawnDust(x, y, dirX, dirY, 1, now);
}
function drawDustPuffs(now, dt) {
  if (!dustPuffs.length) return;
  const damp = Math.max(0, 1 - 4.5 * dt);
  context.save();
  for (let i = dustPuffs.length - 1; i >= 0; i--) {
    const p = dustPuffs[i], t = (now - p.startedAt) / p.lifeMs;
    if (t >= 1 || t < 0) { dustPuffs.splice(i, 1); dustPool.push(p); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= damp; p.vy *= damp;
    const r = p.r0 + p.grow * Math.sqrt(t);
    context.globalAlpha = p.alpha * (t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88); context.fillStyle = p.color;
    context.beginPath(); context.ellipse(p.x, p.y, r, r * 0.62, 0, 0, Math.PI * 2); context.fill();
  }
  context.restore();
}

// --- Kill-path visual budget (STEP 2A / 2G / 2H) ---------------------------
// A mass kill used to spawn one full burst per enemy, which blew the frame
// budget. Now: at most MAX_BURSTS_PER_FRAME full bursts per rendered frame
// (the rest get a single cheap puff), and once kills arrive faster than
// KILL_BURST_THRESHOLD per KILL_BURST_WINDOW_MS the window collapses to one
// big puff, one merged damage number and one louder sound. Adaptive quality
// steps the particle budget down when frames run long.
const recentKillTimes = [];
let massKillUntil = 0;
let massKillAnnounced = false;
let burstsThisFrame = 0;
let autoQualityLevel = 'high';
let adaptiveGoodMs = 0;
const adaptiveFrameTimes = [];

// Registers a kill and returns true when this kill is the one that crosses the
// mass-kill threshold (it becomes the window's single big puff + sound + shake).
function registerKill(now) {
  recentKillTimes.push(now);
  while (recentKillTimes.length > 0 && now - recentKillTimes[0] > KILL_BURST_WINDOW_MS) recentKillTimes.shift();
  if (recentKillTimes.length > KILL_BURST_THRESHOLD && now >= massKillUntil) {
    massKillUntil = now + KILL_BURST_WINDOW_MS;
    massKillAnnounced = false;
    return true;
  }
  return false;
}
function isMassKillWindow(now) { return now < massKillUntil; }

function effectiveQuality() {
  return settings.effectsQuality === 'auto' ? autoQualityLevel : settings.effectsQuality;
}
applyEffectsQuality();
function applyEffectsQuality() {
  const factor = QUALITY_PARTICLE_FACTOR[effectiveQuality()] ?? 1;
  particleBudget = Math.max(40, Math.floor(GAME_CONFIG.arenaTuning.performance.maxParticles * renderScale * renderScale * factor));
}

// One shared puff for a whole mass-kill window: plain arc particles, no glyphs.
function spawnMassKillPuff(x, y, fx) {
  const now = performance.now();
  for (let i = 0; i < KILL_MASS_PUFF_PARTICLES; i += 1) {
    const angle = (i / KILL_MASS_PUFF_PARTICLES) * Math.PI * 2;
    addParticle({
      x, y,
      vx: Math.cos(angle) * (30 + Math.random() * 50),
      vy: Math.sin(angle) * (30 + Math.random() * 50),
      radius: 3 + Math.random() * 3,
      color: i % 2 ? (fx.primary || '#81c784') : (fx.highlight || '#4caf50'),
      alpha: 1,
      startedAt: now,
      durationMs: 320,
      expiresAt: now + 320,
    });
  }
  shakeCamera(KILL_MASS_SHAKE_TRAUMA, 'major');
}

// --- Boss-defeated confetti -----------------------------------------------
// Only a boss kill earns confetti. Pieces live in their own array because they
// are drawn in SCREEN space (never shaken, never camera-zoomed) and must not be
// recycled by the world-space particle pool while they fall. Pure fillRect, no
// glyph rasterisation and no shadowBlur, so the cost is one rect per piece.
const confetti = [];

function spawnBossConfetti() {
  const cfg = GAME_CONFIG.confetti;
  const factor = CONFETTI_QUALITY_FACTOR[effectiveQuality()] ?? 1;
  // Hard cap: confetti may never push the total live effects past PARTICLE_CAP.
  const room = Math.max(0, PARTICLE_CAP - particles.length - confetti.length);
  const total = Math.min(Math.round(cfg.count * factor), room);
  if (total <= 0) return;
  const now = performance.now();
  // Two bursts, one per top corner, aimed down and toward the middle.
  const corners = [
    { x: cfg.burstInsetPx, y: cfg.burstInsetPx, dirX: 1 },
    { x: ARENA_WIDTH - cfg.burstInsetPx, y: cfg.burstInsetPx, dirX: -1 },
  ];
  for (let i = 0; i < total; i += 1) {
    const corner = corners[i % 2];
    const angle = Math.PI * (0.15 + Math.random() * 0.35);
    const speed = cfg.burstSpeedMin + Math.random() * (cfg.burstSpeedMax - cfg.burstSpeedMin);
    confetti.push({
      x: corner.x + (Math.random() - 0.5) * cfg.burstSpreadPx,
      y: corner.y + (Math.random() - 0.5) * cfg.burstSpreadPx * 0.4,
      vx: Math.cos(angle) * speed * corner.dirX,
      vy: Math.sin(angle) * speed,
      size: cfg.pieceMinPx + Math.random() * (cfg.pieceMaxPx - cfg.pieceMinPx),
      color: cfg.colors[i % cfg.colors.length],
      rotation: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 2 * cfg.spinTurnsMax * Math.PI,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 2 + Math.random() * 2,
      bornAt: now,
    });
  }
}

// One boss kill = gold banner + the wave-end fanfare + the confetti burst.
function celebrateBossDefeat() {
  showBanner('BOSS DEFEATED!', false, GAME_CONFIG.confetti.bannerMs, 'gold');
  playSound('waveEnd');
  spawnBossConfetti();
}

function updateConfetti(currentTime, dt) {
  if (confetti.length === 0) return;
  const cfg = GAME_CONFIG.confetti;
  const drag = Math.max(0, 1 - cfg.drag * dt);
  for (let i = confetti.length - 1; i >= 0; i -= 1) {
    const piece = confetti[i];
    const age = currentTime - piece.bornAt;
    if (age >= cfg.durationMs) { confetti.splice(i, 1); continue; }
    piece.vy += cfg.fallGravity * dt;
    piece.vx *= drag;
    piece.vy *= drag;
    piece.x += (piece.vx + Math.sin((age / 1000) * piece.swaySpeed + piece.swayPhase) * cfg.swayPx) * dt;
    piece.y += piece.vy * dt;
    piece.rotation += piece.spin * dt;
  }
}

// Drawn AFTER the camera transform is reset, so shake and the boss zoom can
// never move it. Caller has already set the identity transform.
function drawConfetti(currentTime) {
  if (confetti.length === 0) return;
  const cfg = GAME_CONFIG.confetti;
  const fadeWindow = cfg.durationMs * 0.35;
  context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  for (let i = 0; i < confetti.length; i += 1) {
    const piece = confetti[i];
    const remaining = cfg.durationMs - (currentTime - piece.bornAt);
    context.globalAlpha = remaining >= fadeWindow ? 1 : Math.max(0, remaining / fadeWindow);
    context.fillStyle = piece.color;
    context.save();
    context.translate(piece.x, piece.y);
    context.rotate(piece.rotation);
    context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
    context.restore();
  }
  context.globalAlpha = 1;
}


function returnToKingdom() {
  if (embedded) {
    window.parent.postMessage({ type: 'hero-lab-game-over' }, location.origin);
  } else location.replace('/hero-lab');
}

// Drawn emblems for the result card: a gold star over a glowing fire for a
// finished run, cold logs with a wisp of smoke for a campfire that went out.
const RESULT_EMBLEMS = {
  victory: '<svg viewBox="0 0 64 64"><path d="M14 52 50 40M14 40l36 12" stroke="#23382F" stroke-width="7" stroke-linecap="round"/><path d="M14 52 50 40M14 40l36 12" stroke="#9E6238" stroke-width="4" stroke-linecap="round"/><path d="M32 44c-9 0-13-6-11-13 2-5 6-7 6-13 5 3 7 7 6 11 2-2 3-4 3-7 5 4 7 9 6 13-1 6-5 9-10 9Z" fill="#EF7137" stroke="#23382F" stroke-width="2.5" stroke-linejoin="round"/><path d="M32 41c-4 0-6-3-5-6 1-2 3-3 3-6 3 2 5 5 4 8 2 0 2-2 2-3 2 2 2 4 1 6-1 1-3 1-5 1Z" fill="#F2BA55"/><path d="m32 4 3.2 6.5 7.2 1-5.2 5 1.2 7.1L32 20.3l-6.4 3.3 1.2-7.1-5.2-5 7.2-1Z" fill="#F2BA55" stroke="#23382F" stroke-width="2" stroke-linejoin="round"/></svg>',
  defeat: '<svg viewBox="0 0 64 64"><path d="M14 52 50 40M14 40l36 12" stroke="#23382F" stroke-width="7" stroke-linecap="round"/><path d="M14 52 50 40M14 40l36 12" stroke="#5B5550" stroke-width="4" stroke-linecap="round"/><path d="M30 36c-4-4 4-7 0-12s5-8 1-13M38 34c-3-3 3-5 0-9" fill="none" stroke="#C9CFC4" stroke-width="3" stroke-linecap="round"/></svg>',
};

// The party panel shows everyone who was in the room for this run: their own
// name first, the hero they played underneath. Only real roster data is used.
let resultPartyAnimationTimer = 0;
function stopResultPartyAnimation() {
  if (resultPartyAnimationTimer) clearInterval(resultPartyAnimationTimer);
  resultPartyAnimationTimer = 0;
}

function animateResultParty(host) {
  stopResultPartyAnimation();
  if (prefersReducedMotion || !heroSpriteCache || !host.querySelector('.hero-ui-sprite')) return;
  const clip = heroSpriteCache.config.IDLE_CLIP || ['open'];
  const fps = heroSpriteCache.config.IDLE_FPS || 5;
  const startedAt = performance.now();
  resultPartyAnimationTimer = window.setInterval(() => {
    if (runResultPanel.hidden || document.hidden) { stopResultPartyAnimation(); return; }
    const frameName = clip[Math.floor(((performance.now() - startedAt) / 1000) * fps) % clip.length] || 'open';
    for (const image of host.querySelectorAll('.hero-ui-sprite')) {
      if (image.dataset.frameName === frameName) continue;
      const src = getHeroSpriteUrl(heroSpriteCache, image.dataset.heroId, frameName);
      if (!src) continue;
      image.dataset.frameName = frameName;
      image.src = src;
    }
  }, 1000 / fps);
}

function renderResultParty() {
  const host = document.querySelector('#run-result-party');
  if (!host) return;
  stopResultPartyAnimation();
  const roster = state.room?.players?.length ? state.room.players : (state.players || []);
  const members = roster.length ? roster : [{ id: me, name: 'You', heroId: activeHeroId }];
  const ordered = [...members].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0));
  host.dataset.size = String(Math.min(ordered.length, 4));
  host.replaceChildren(...ordered.map((member) => {
    const figure = document.createElement('figure');
    figure.className = `party-member${member.id === me ? ' me' : ''}`;
    const stage = document.createElement('span'); stage.className = 'party-stage';
    const hero = HEROES.find((candidate) => candidate.id === member.heroId);
    const sprite = createHeroImage(member.heroId, member.emoji || hero?.emoji, 140);
    if (sprite) {
      sprite.dataset.heroId = member.heroId;
      sprite.dataset.frameName = 'open';
      const offsetX = heroSpriteConfig?.HERO_VISUALS?.[member.heroId]?.partyOffsetX ?? 0;
      sprite.style.setProperty('--party-offset-x', `${offsetX}%`);
      stage.append(sprite);
    }
    else stage.textContent = member.emoji || hero?.emoji || '';
    const caption = document.createElement('figcaption');
    const name = document.createElement('strong'); name.textContent = truncateName(member.name);
    name.title = member.name || '';
    const heroLine = document.createElement('span'); heroLine.textContent = `${hero?.name || 'Hero'}${member.id === me ? ' · you' : ''}`;
    caption.append(name, heroLine);
    figure.append(stage, caption);
    return figure;
  }));
  animateResultParty(host);
}

function showRunResult(result) {
  latestRunResult = result;
  milestoneDawn.hidden = true;
  runResultPanel.hidden = false;
  // The final victory screen earns the same celebration as a boss kill.
  if (result.victory) spawnBossConfetti();
  const bestKey = `hero-lab-best:${result.heroId || activeHeroId}`;
  let personalBest = Number(result.wavesReached) || 0;
  try {
    personalBest = Math.max(personalBest, Number(localStorage.getItem(bestKey)) || 0);
    localStorage.setItem(bestKey, String(personalBest));
  } catch { /* storage may be unavailable */ }
  // Victory and defeat share one layout; heading, emblem and accent tell them apart.
  runResultPanel.classList.toggle('victory', Boolean(result.victory));
  runResultPanel.classList.toggle('defeat', !result.victory);
  document.querySelector('#run-result-emblem').innerHTML = result.victory ? RESULT_EMBLEMS.victory : RESULT_EMBLEMS.defeat;
  renderResultParty();
  document.querySelector('#run-result-title').textContent = result.victory ? 'Victory!' : 'Campfire extinguished';
  document.querySelector('#run-result-message').textContent = `${result.wavesCleared || 0} waves cleared · ${result.rewardCoins || 0} placeholder coins${result.victory ? ' claimed' : ' earned'}.`;
  runResultStats.replaceChildren();
  const upgradeLines = result.attackBonusPercent > 0
    ? [`Your ${result.attackBonusBuilding || 'Kingdom'} +${result.attackBonusPercent}% base attack bonus dealt ${result.bonusDamage || 0} extra damage`]
    : [`Kingdom attack bonus: 0% · Extra damage: ${result.bonusDamage || 0}`];
  if (result.campfireBonusPercent > 0) upgradeLines.push(`Garden +${result.campfireBonusPercent}% base campfire HP per player`);
  if (result.towerBonusPercent > 0) upgradeLines.push(`Tower Lv${result.towerLevel}: buffs +${result.towerBonusPercent}% on your hero`);
  const statTiles = [
    ['Waves reached', result.wavesReached || 0, 'waves'],
    ['Enemies defeated', result.kills || 0, 'kills'],
    ['Damage dealt', result.damageDealt || 0, 'damage'],
    ['Personal best', `${personalBest} waves`, 'best'],
  ];
  for (const [label, value, kind] of statTiles) {
    const tile = document.createElement('div'); tile.className = 'run-result-stat'; tile.dataset.kind = kind;
    const number = document.createElement('strong'); number.textContent = value;
    const caption = document.createElement('span'); caption.textContent = label;
    tile.append(number, caption); runResultStats.append(tile);
  }
  runResultUpgrades.replaceChildren(...upgradeLines.map((line) => {
    const item = document.createElement('li');
    const marker = document.createElement('span'); marker.setAttribute('aria-hidden', 'true'); marker.textContent = '✦';
    const text = document.createElement('span'); text.textContent = line;
    item.append(marker, text); return item;
  }));
  document.querySelector('#run-result-teaser-text').textContent = `The Brute King awaits at wave ${result.nextBossWave || ARENA_TUNING.run.bossTeaserWave}.`;
  runAgainHero.replaceChildren(...HEROES.map((hero) => {
    const option = document.createElement('option'); option.value = hero.id; option.textContent = heroOptionText(hero);
    option.selected = hero.id === (result.heroId || activeHeroId); return option;
  }));
  syncHeroMenuIcons();

  let runCount = 0;
  try {
    runCount = Number(sessionStorage.getItem('hero-lab-run-count') || 0) + 1;
    sessionStorage.setItem('hero-lab-run-count', String(runCount));
    sessionStorage.setItem('hero-lab-session-kills', String((Number(sessionStorage.getItem('hero-lab-session-kills') || 0) || 0) + (result.kills || 0)));
  } catch { /* storage may be unavailable */ }
  let alreadyShown = false;
  try { alreadyShown = sessionStorage.getItem('hero-lab-session-summary-shown') === '1'; } catch { /* storage may be unavailable */ }
  if (runCount >= ARENA_TUNING.run.sessionRuns && !alreadyShown) {
    sessionSummary.hidden = false;
    const kills = Number(sessionStorage.getItem('hero-lab-session-kills') || 0) || 0;
    document.querySelector('#session-summary-text').textContent = `${runCount} runs played · ${kills} total kills.`;
    try { sessionStorage.setItem('hero-lab-session-summary-shown', '1'); } catch { /* storage may be unavailable */ }
  }
}

document.querySelector('#dawn-leave').addEventListener('click', () => socket.emit('milestone_choice', 'leave'));
document.querySelector('#dawn-continue').addEventListener('click', () => {
  milestoneDawn.hidden = true;
  socket.emit('milestone_choice', 'continue');
});
document.querySelector('#run-again').addEventListener('click', () => {
  const nextHeroId = runAgainHero.value || activeHeroId;
  // Leaving at dawn detaches the socket from the room: there is no lobby left
  // to return to, so RUN AGAIN sends the player back to the hero picker.
  if (leftRoom) { returnToKingdom(); return; }
  // A finished run leaves the room in its lobby, so RUN AGAIN can simply swap
  // the hero and drop the overlay — no reconnect, no reload.
  if (state.room?.phase === 'lobby' && socket.connected && !joinFailed) {
    if (nextHeroId !== activeHeroId) {
      pendingHeroSwap = nextHeroId;
      pendingHeroSwapAt = performance.now();
      socket.emit('swap_hero', nextHeroId);
    }
    runResultPanel.hidden = true;
    latestRunResult = null;
    return;
  }
  if (embedded) {
    window.parent.postMessage({ type: 'hero-lab-run-again', heroId: nextHeroId }, location.origin);
  } else location.replace(`/hero-lab/world?heroId=${encodeURIComponent(nextHeroId)}`);
});
document.querySelector('#return-kingdom').addEventListener('click', returnToKingdom);
document.querySelector('#session-stop').addEventListener('click', returnToKingdom);
document.querySelector('#session-keep-going').addEventListener('click', () => { sessionSummary.hidden = true; });
shakeSetting.checked = settings.screenShake;
shakeIntensitySetting.value = String(settings.shakeIntensity);
shakeIntensitySetting.min = String(SHAKE_MIN_INTENSITY);
shakeIntensitySetting.max = String(SHAKE_MAX_INTENSITY);
shakeIntensitySetting.step = String(SHAKE_INTENSITY_STEP);
shakeIntensityValue.textContent = `${settings.shakeIntensity}%`;
numbersSetting.checked = settings.damageNumbers;
qualitySetting.value = settings.effectsQuality;
muteSetting.checked = settings.muted;
volumeSetting.value = String(settings.masterVolume);
settingsButton.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsButton.setAttribute('aria-expanded', String(!settingsPanel.hidden));
  playSound('uiClick');
  updatePerfVisibility();
});
// The performance overlay lives inside the Settings panel: it is visible only
// while the panel is open AND its own toggle is checked, and closing Settings
// hides it no matter what.
function updatePerfVisibility() {
  profiler.setVisible(!settingsPanel.hidden && Boolean(perfSetting?.checked));
}
perfSetting?.addEventListener('change', () => { updatePerfVisibility(); playSound('uiClick'); });
document.addEventListener('click', (event) => {
  const button = event.target.closest?.('button');
  if (button && button !== settingsButton && !button.disabled) playSound('uiClick');
});
shakeSetting.addEventListener('change', () => { settings.screenShake = shakeSetting.checked; saveSettings(); });
shakeIntensitySetting.addEventListener('input', () => {
  settings.shakeIntensity = Number(shakeIntensitySetting.value);
  shakeIntensityValue.textContent = `${settings.shakeIntensity}%`;
  saveSettings();
});
numbersSetting.addEventListener('change', () => { settings.damageNumbers = numbersSetting.checked; saveSettings(); });
qualitySetting.addEventListener('change', () => {
  settings.effectsQuality = qualitySetting.value;
  applyEffectsQuality();
  saveSettings();
});
muteSetting.addEventListener('change', () => { settings.muted = muteSetting.checked; saveSettings(); });
volumeSetting.addEventListener('input', () => { settings.masterVolume = Number(volumeSetting.value); saveSettings(); });

lobbyHero.replaceChildren(...HEROES.map((hero) => {
  const option = document.createElement('option');
  option.value = hero.id;
  option.textContent = heroOptionText(hero);
  return option;
}));
lobbyHero.value = activeHeroId;
syncHeroMenuIcons();
lobbyHero.addEventListener('change', () => {
  syncHeroMenuIcons();
  if (!socket.connected) return;
  pendingHeroSwap = lobbyHero.value;
  pendingHeroSwapAt = performance.now();
  socket.emit('swap_hero', lobbyHero.value);
});
startRunButton.addEventListener('click', () => {
  if (socket.connected) socket.emit('start_run');
});

function shakeCamera(amount, source = 'event') {
  if (!effectToggles.shake) return;
  if (!settings.screenShake || settings.shakeIntensity <= SHAKE_MIN_INTENSITY) return;
  const now = performance.now();
  if (source === 'explosion') {
    if (now - lastExplosionTraumaAt < SHAKE_EXPLOSION_COOLDOWN_MS) return;
    lastExplosionTraumaAt = now;
  }
  trauma = Math.min(SHAKE_MAX_TRAUMA, trauma + amount);
}

function smoothShakeNoise(timestamp, phase = SHAKE_NOISE_PRIMARY_PHASE) {
  const samplePosition = timestamp * SHAKE_NOISE_HZ / 1000;
  const sample = Math.floor(samplePosition);
  const fraction = samplePosition - sample;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const valueAt = (index) => (Math.sin(index * SHAKE_NOISE_PRIMARY_FREQUENCY + phase)
    + Math.sin(index * SHAKE_NOISE_SECONDARY_FREQUENCY + phase + SHAKE_NOISE_SECONDARY_PHASE)) / 2;
  return valueAt(sample) + (valueAt(sample + 1) - valueAt(sample)) * eased;
}

function showAreaEffect({ x, y, radius, kind = 'player', telegraphMs = 0, sourceAbility = 'weapon', color = null, sourceHeroId = null, angleRad = null, angleDeg = null, durationMs = null, hits = null }) {
  const cone = angleRad != null && angleDeg != null;
  const now = performance.now();
  areaEffects.push({ x, y, radius, kind, sourceAbility, color, sourceHeroId, angleRad, angleDeg, cone, hits, phase: telegraphMs > 0 ? 'telegraph' : 'detonation', startedAt: now,
    durationMs: durationMs != null ? durationMs : (sourceHeroId === 'fairy' && sourceAbility === 'skill' ? FAIRY_GALE_VFX_DURATION_MS : telegraphMs > 0 ? telegraphMs : ARENA_TUNING.areaEffects.detonationMs) });
  if (areaEffects.length > 24) areaEffects.shift();
  if (telegraphMs <= 0) {
    if (sourceAbility === 'boss-slam') shakeCamera(SHAKE_BOSS_SLAM_TRAUMA, 'major');
    else if (sourceHeroId === 'guardian' && sourceAbility === 'ultimate') shakeCamera(SHAKE_ULTIMATE_TRAUMA, 'major');
    else if (sourceHeroId === 'fairy' && sourceAbility === 'skill') shakeCamera((SHAKE_EXPLOSION_BASE_TRAUMA + radius / SHAKE_EXPLOSION_RADIUS_SCALE) * FAIRY_GALE_SHAKE_MULT, 'explosion');
    else if (sourceHeroId === 'fairy' && sourceAbility === 'ultimate') shakeCamera(SHAKE_ULTIMATE_TRAUMA * 0.6, 'major');
    else if (sourceHeroId === 'ranger' && sourceAbility === 'ultimate') shakeCamera(SHAKE_ULTIMATE_TRAUMA * 0.5, 'major');
    else shakeCamera(SHAKE_EXPLOSION_BASE_TRAUMA + radius / SHAKE_EXPLOSION_RADIUS_SCALE, 'explosion');
  }
}

const reducedMotionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
let prefersReducedMotion = Boolean(reducedMotionQuery?.matches);
reducedMotionQuery?.addEventListener?.('change', (event) => { prefersReducedMotion = event.matches; });
let fairyVortexHumStop = null;

function makeFairyVortexVisual({ id, x, y, remainingMs = GAME_CONFIG.heroes.fairy.vortex.durationMs,
  pullRemainingMs = GAME_CONFIG.heroes.fairy.vortex.pullMs, preview = false }) {
  const now = performance.now();
  const durationMs = GAME_CONFIG.heroes.fairy.vortex.durationMs;
  const age = Math.max(0, durationMs - remainingMs);
  return {
    id, x, y, preview, startedAt: now - age, endsAt: now + remainingMs,
    pullEndsAt: now + pullRemainingMs, nextDebrisAt: now + VORTEX_DEBRIS_SPAWN_MS,
    debrisCursor: 0, debris: Array.from({ length: VORTEX_DEBRIS_POOL_SIZE }, () => ({ at: -Infinity, angle: 0, durationMs: VORTEX_DEBRIS_LIFETIME_MS })),
    ripples: [], nextRippleAt: now + VORTEX_RIPPLE_INTERVAL_MS, humStop: null,
  };
}

function startFairyVortexVisual(vortex) {
  const visual = makeFairyVortexVisual(vortex);
  fairyVortexVisuals.set(visual.id, visual);
  if (effectToggles.sound) {
    playSound('fairyWhoosh');
    if (!fairyVortexHumStop) fairyVortexHumStop = startSoundLoop('fairyHum');
  }
  shakeCamera(SHAKE_ULTIMATE_TRAUMA, 'major');
  if (VORTEX_ZOOM_PULSE && effectiveQuality() !== 'low' && !prefersReducedMotion) {
    cameraZoom = { startedAt: performance.now(), until: performance.now() + VORTEX_ZOOM_DURATION_MS, scale: VORTEX_ZOOM_SCALE };
  }
}

function finishFairyVortexVisual(id, x, y) {
  const visual = fairyVortexVisuals.get(id);
  if (visual) {
    x = visual.x; y = visual.y;
    fairyVortexVisuals.delete(id);
    if (fairyVortexVisuals.size === 0 && fairyVortexHumStop) {
      fairyVortexHumStop(); fairyVortexHumStop = null;
    }
  }
  if (effectToggles.sound) playSound('fairyPoof');
  showAreaEffect({ x, y, radius: GAME_CONFIG.heroes.fairy.vortex.radius, kind: 'player', sourceAbility: 'ultimate', sourceHeroId: 'fairy',
    color: HERO_FX_COLORS.fairy.primary, durationMs: VORTEX_POP_RING_MS });
  fairyVortexPops.push({ x, y, startedAt: performance.now() });
  if (!prefersReducedMotion && effectiveQuality() !== 'low') {
    for (let i = 0; i < VORTEX_POP_SPARK_COUNT; i++) {
      const angle = Math.PI * 2 * i / VORTEX_POP_SPARK_COUNT;
      const speed = 95 + (i % 3) * 25;
      addParticle({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: 2.5, color: i % 2 ? HERO_FX_COLORS.fairy.primary : HERO_FX_SECONDARY.fairy,
        alpha: 1, startedAt: performance.now(), durationMs: VORTEX_FLASH_POP_MS, expiresAt: performance.now() + VORTEX_FLASH_POP_MS });
    }
  }
}

function drawFairyWindFeedback(now) {
  for (let i = fairyMuzzlePuffs.length - 1; i >= 0; i--) {
    const puff = fairyMuzzlePuffs[i], age = now - puff.startedAt;
    if (age >= FAIRY_WIND_IMPACT_MS) { fairyMuzzlePuffs.splice(i, 1); continue; }
    context.save(); context.translate(puff.x, puff.y); context.rotate(puff.angle);
    context.globalAlpha = 1 - age / FAIRY_WIND_IMPACT_MS;
    for (let n = 0; n < FAIRY_ARROW_TRAIL_COUNT; n++) {
      context.strokeStyle = n === 1 ? '#fff0fa' : HERO_FX_SECONDARY.fairy; context.lineWidth = 1.6;
      context.beginPath(); context.moveTo(-n * 3, n * 2 - 3); context.quadraticCurveTo(3, -6 + n * 4, 8 + n * 2, 0); context.stroke();
    }
    context.restore();
  }
  for (let i = fairyWindImpacts.length - 1; i >= 0; i--) {
    const impact = fairyWindImpacts[i], age = now - impact.startedAt;
    if (age >= FAIRY_WIND_IMPACT_MS) { fairyWindImpacts.splice(i, 1); continue; }
    const fade = 1 - age / FAIRY_WIND_IMPACT_MS;
    context.save(); context.translate(impact.x, impact.y); context.rotate(impact.angle); context.globalAlpha = fade;
    for (let n = 0; n < FAIRY_ARROW_IMPACT_LINES; n++) {
      context.strokeStyle = n % 2 ? HERO_FX_SECONDARY.fairy : '#fff0fa'; context.lineWidth = 2;
      const y = (n - 1) * 5;
      context.beginPath(); context.moveTo(-4, y + 3); context.quadraticCurveTo(0, y - 5, 7, y); context.stroke();
    }
    context.restore();
  }
  for (let i = fairyPushStreaks.length - 1; i >= 0; i--) {
    const streak = fairyPushStreaks[i], age = now - streak.startedAt;
    if (age >= FAIRY_WIND_IMPACT_MS) { fairyPushStreaks.splice(i, 1); continue; }
    const target = state.monsters?.find((monster) => monster.id === streak.id);
    const x = target?.x ?? streak.x, y = target?.y ?? streak.y;
    context.save(); context.globalAlpha = (1 - age / FAIRY_WIND_IMPACT_MS) * 0.72; context.lineCap = 'round';
    for (let n = 0; n < 3; n++) {
      context.strokeStyle = n === 1 ? '#fff0fa' : HERO_FX_SECONDARY.fairy; context.lineWidth = 1.7;
      const offset = (n - 1) * 4;
      context.beginPath(); context.moveTo(x - streak.dirX * (10 + n * 3) - streak.dirY * offset, y - streak.dirY * (10 + n * 3) + streak.dirX * offset);
      context.quadraticCurveTo(x - streak.dirX * 6, y - streak.dirY * 6, x, y); context.stroke();
    }
    context.restore();
  }
}

function syncFairyVortices(snapshot) {
  const active = new Set();
  for (const vortex of snapshot.fairyVortices || []) {
    active.add(vortex.id);
    const visual = fairyVortexVisuals.get(vortex.id);
    if (!visual) startFairyVortexVisual(vortex);
    else { visual.x = vortex.x; visual.y = vortex.y; visual.endsAt = performance.now() + vortex.remainingMs; visual.pullEndsAt = performance.now() + vortex.pullRemainingMs; }
  }
  for (const [id, visual] of fairyVortexVisuals) if (!active.has(id) && !visual.preview) finishFairyVortexVisual(id, visual.x, visual.y);
}

function previewFairyVortex(x, y) {
  const id = `debug-fairy-vortex-${performance.now()}`;
  const visual = makeFairyVortexVisual({ id, x, y, preview: true });
  visual.endsAt = performance.now() + GAME_CONFIG.heroes.fairy.vortex.durationMs;
  if (effectToggles.sound) {
    if (!fairyVortexHumStop) fairyVortexHumStop = startSoundLoop('fairyHum');
    playSound('fairyWhoosh');
  }
  fairyVortexVisuals.set(id, visual);
  shakeCamera(SHAKE_ULTIMATE_TRAUMA, 'major');
  if (VORTEX_ZOOM_PULSE && effectiveQuality() !== 'low' && !prefersReducedMotion) cameraZoom = { startedAt: performance.now(), until: performance.now() + VORTEX_ZOOM_DURATION_MS, scale: VORTEX_ZOOM_SCALE };
}

function previewSamuraiCut() {
  const player = state.players?.find((candidate) => candidate.id === me);
  const cursor = window.lastPointerWorld || { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
  const origin = player || cursor;
  const dx = cursor.x - origin.x, dy = cursor.y - origin.y;
  const distance = Math.hypot(dx, dy);
  const direction = distance > 1 ? { x: dx / distance, y: dy / distance } : (player?.aim || { x: 1, y: 0 });
  const spec = GAME_CONFIG.heroes.samurai.afterimageCut;
  const startAlong = -spec.pad;
  const endAlong = spec.distance + spec.pad;
  samuraiSlashEffects.push({
    startX: origin.x + direction.x * startAlong, startY: origin.y + direction.y * startAlong,
    endX: origin.x + direction.x * endAlong, endY: origin.y + direction.y * endAlong,
    width: spec.width, startedAt: performance.now(),
  });
  if (samuraiSlashEffects.length > 16) samuraiSlashEffects.shift();
}

function updateVortexDecorations(visual, now) {
  const quality = effectiveQuality();
  const debrisCount = quality === 'high' ? VORTEX_DEBRIS_POOL_SIZE : quality === 'medium' ? 8 : 0;
  if (!prefersReducedMotion && debrisCount > 0 && now >= visual.nextDebrisAt) {
    const births = Math.min(4, Math.floor((now - visual.nextDebrisAt) / VORTEX_DEBRIS_SPAWN_MS) + 1);
    for (let i = 0; i < births; i++) {
      const streak = visual.debris[visual.debrisCursor++ % debrisCount];
      streak.at = now; streak.angle = Math.random() * Math.PI * 2; streak.color = visual.debrisCursor % 2 ? HERO_FX_COLORS.fairy.primary : HERO_FX_SECONDARY.fairy;
    }
    visual.nextDebrisAt = now + VORTEX_DEBRIS_SPAWN_MS;
  }
  if (!prefersReducedMotion && quality === 'high' && now >= visual.nextRippleAt) {
    visual.ripples.push({ at: now }); visual.nextRippleAt = now + VORTEX_RIPPLE_INTERVAL_MS;
    while (visual.ripples.length > 2) visual.ripples.shift();
  }
}

function drawFairyVortexGround(now) {
  for (const visual of fairyVortexVisuals.values()) {
    const elapsed = Math.max(0, now - visual.startedAt);
    const radius = GAME_CONFIG.heroes.fairy.vortex.radius;
    const fadeIn = Math.max(0, Math.min(1, (elapsed - VORTEX_FORMATION_FLASH_MS) / VORTEX_SUSTAIN_FADE_MS));
    const collapse = Math.max(0, Math.min(1, (visual.endsAt - now) / VORTEX_COLLAPSE_MS));
    context.save(); context.globalAlpha = fadeIn * (prefersReducedMotion ? VORTEX_GROUND_FILL_ALPHA : VORTEX_GROUND_FILL_ALPHA + 0.05 * Math.sin(now * 0.005));
    context.fillStyle = VORTEX_GROUND_FILL;
    context.beginPath(); context.arc(visual.x, visual.y, radius * (0.9 - 0.06 * (1 - collapse)), 0, Math.PI * 2); context.fill();
    context.globalAlpha *= fadeIn;
    context.setLineDash([VORTEX_GROUND_DASH_ON_PX, VORTEX_GROUND_DASH_OFF_PX]);
    context.strokeStyle = HERO_FX_COLORS.fairy.primary; context.lineWidth = VORTEX_GROUND_RING_WIDTH_PX;
    context.beginPath(); context.arc(visual.x, visual.y, radius, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
    for (const ripple of (effectiveQuality() === 'high' && !prefersReducedMotion ? visual.ripples : [])) {
      const progress = (now - ripple.at) / VORTEX_RIPPLE_DURATION_MS;
      if (progress >= 1) continue;
      context.globalAlpha = (1 - progress) * 0.7;
      context.strokeStyle = HERO_FX_COLORS.fairy.primary; context.lineWidth = 2;
      context.beginPath(); context.arc(visual.x, visual.y,
        radius * (1 - progress) + VORTEX_CORE_RADIUS_PX * progress, 0, Math.PI * 2); context.stroke();
    }
    context.restore();
  }
}

function drawFairyVortexStructures(now) {
  for (const [id, visual] of fairyVortexVisuals) {
    const elapsed = Math.max(0, now - visual.startedAt);
    const remaining = visual.endsAt - now;
    if (remaining <= 0) { if (visual.preview) finishFairyVortexVisual(id, visual.x, visual.y); continue; }
    updateVortexDecorations(visual, now);
    const formation = Math.max(0, Math.min(1, elapsed / VORTEX_FORMATION_FLASH_MS));
    const sustain = Math.max(0, Math.min(1, (elapsed - VORTEX_FORMATION_FLASH_MS) / VORTEX_SUSTAIN_FADE_MS));
    const collapse = prefersReducedMotion ? 0 : Math.max(0, Math.min(1, (VORTEX_COLLAPSE_MS - remaining) / VORTEX_COLLAPSE_MS));
    const still = remaining <= VORTEX_POP_STILL_MS;
    const coreRadius = prefersReducedMotion ? VORTEX_CORE_RADIUS_PX : remaining <= VORTEX_POP_STILL_MS
      ? VORTEX_POP_STILL_CORE_PX : VORTEX_CORE_RADIUS_PX * Math.max(0.35, 1 - 0.55 * collapse);
    const diskScale = prefersReducedMotion ? 1 : Math.max(0.45, 1 - 0.5 * collapse);
    let diskRotation = now / 1000 * Math.PI * 2 * VORTEX_DISK_ROTATION_HZ;
    if (prefersReducedMotion) diskRotation = now / 1000 * Math.PI * 2 * 0.08;
    else if (remaining < VORTEX_COLLAPSE_MS) diskRotation += collapse * Math.PI * 2 * VORTEX_DISK_ROTATION_HZ * 2;
    if (still) diskRotation = Math.round(diskRotation / (Math.PI / 8)) * (Math.PI / 8);
    const pulse = prefersReducedMotion || still ? 1 : 1 + 0.03 * Math.sin(now / 1000 * Math.PI * 2 * VORTEX_CORE_PULSE_HZ);

    if (!prefersReducedMotion && effectiveQuality() !== 'low' && elapsed < VORTEX_SHOCKWAVE_MS) {
      const progress = elapsed / VORTEX_SHOCKWAVE_MS;
      context.save(); context.globalAlpha = 1 - progress;
      context.strokeStyle = HERO_FX_COLORS.fairy.primary; context.lineWidth = 5;
      context.beginPath(); context.arc(visual.x, visual.y, VORTEX_CORE_RADIUS_PX + (GAME_CONFIG.heroes.fairy.vortex.radius - VORTEX_CORE_RADIUS_PX) * progress, 0, Math.PI * 2); context.stroke(); context.restore();
    }
    if (!prefersReducedMotion && effectiveQuality() !== 'low' && elapsed < VORTEX_FORMATION_FLASH_MS) {
      context.save(); context.globalAlpha = 1 - elapsed / VORTEX_FORMATION_FLASH_MS;
      context.fillStyle = '#fff0fa'; context.beginPath(); context.arc(visual.x, visual.y, VORTEX_CORE_RADIUS_PX * 1.6, 0, Math.PI * 2); context.fill(); context.restore();
    }

    // Draw the accretion disk directly on the arena canvas. Offscreen bitmap
    // sprites were being composited as opaque rectangles in some browsers.
    // Vector ellipses keep every edge transparent and smooth at any scale.
    const diskScaleX = diskScale;
    const diskScaleY = VORTEX_DISK_TILT * diskScale;
    context.save(); context.translate(visual.x, visual.y); context.rotate(diskRotation); context.scale(diskScaleX, diskScaleY);
    context.globalAlpha = sustain * 0.28; context.strokeStyle = HERO_FX_COLORS.fairy.primary; context.lineWidth = 24;
    context.beginPath(); context.arc(0, 0, VORTEX_DISK_OUTER_RADIUS_PX * 0.78, 0, Math.PI * 2); context.stroke();
    context.globalAlpha = sustain * 0.78; context.strokeStyle = '#fff6fc'; context.lineWidth = 3;
    context.beginPath(); context.ellipse(0, 0, VORTEX_DISK_OUTER_RADIUS_PX * 0.78, VORTEX_DISK_OUTER_RADIUS_PX * 0.78, 0, -0.16, 1.62); context.stroke();
    context.globalAlpha = sustain * 0.72; context.strokeStyle = HERO_FX_SECONDARY.fairy; context.lineWidth = 2;
    context.beginPath(); context.ellipse(0, 0, VORTEX_DISK_OUTER_RADIUS_PX * 0.9, VORTEX_DISK_OUTER_RADIUS_PX * 0.9, 0, Math.PI - 0.12, Math.PI * 2 - 0.7); context.stroke();
    context.globalAlpha = sustain * 0.52; context.strokeStyle = '#fff0fa'; context.lineWidth = 1.5;
    context.beginPath(); context.ellipse(0, 0, VORTEX_DISK_OUTER_RADIUS_PX, VORTEX_DISK_OUTER_RADIUS_PX, 0, 0.15, Math.PI * 1.18); context.stroke();
    context.restore();
    if (effectiveQuality() === 'high' && !prefersReducedMotion) {
      const arcHalf = VORTEX_LENS_ARC_DEG * Math.PI / 360;
      context.save(); context.translate(visual.x, visual.y); context.rotate(-diskRotation * 0.7);
      context.globalAlpha = sustain * 0.9; context.lineWidth = 2; context.lineCap = 'round';
      context.strokeStyle = '#fff0fa'; context.beginPath(); context.arc(0, 0, VORTEX_CORE_RADIUS_PX + 7, -Math.PI / 2 - arcHalf, -Math.PI / 2 + arcHalf); context.stroke();
      context.strokeStyle = HERO_FX_SECONDARY.fairy; context.beginPath(); context.arc(0, 0, VORTEX_CORE_RADIUS_PX + 11, Math.PI / 2 - arcHalf, Math.PI / 2 + arcHalf); context.stroke();
      context.restore();
    }
    if (!prefersReducedMotion && !still && effectiveQuality() !== 'low') {
      const count = effectiveQuality() === 'high' ? VORTEX_DEBRIS_POOL_SIZE : 8;
      for (let i = 0; i < count; i++) {
        const streak = visual.debris[i]; const age = now - streak.at;
        if (age < 0 || age >= streak.durationMs) continue;
        const t = age / streak.durationMs;
        const angle = streak.angle + t * 1.2;
        const r = GAME_CONFIG.heroes.fairy.vortex.radius * (1 - t) + VORTEX_CORE_RADIUS_PX * t;
        const x = visual.x + Math.cos(angle) * r, y = visual.y + Math.sin(angle) * r;
        const length = 12 + t * 24, inward = 10 + t * 9;
        context.save(); context.globalAlpha = sustain * (1 - t); context.strokeStyle = streak.color; context.lineWidth = 2.4 - t * 1.4; context.lineCap = 'round';
        context.beginPath(); context.moveTo(x + Math.cos(angle) * length * 0.5, y + Math.sin(angle) * length * 0.5);
        context.quadraticCurveTo(x, y, x - Math.cos(angle) * inward, y - Math.sin(angle) * inward); context.stroke(); context.restore();
      }
    }
    context.save(); context.globalAlpha = prefersReducedMotion || effectiveQuality() === 'low' ? 1 : Math.max(formation, sustain) * (elapsed < VORTEX_CORE_GROW_MS ? elapsed / VORTEX_CORE_GROW_MS : 1);
    context.translate(visual.x, visual.y); context.scale(pulse, pulse);
    const coreGlow = context.createRadialGradient(0, 0, coreRadius * 0.72, 0, 0, coreRadius + 9);
    coreGlow.addColorStop(0, `${GAME_CONFIG.vortexColors.core}00`);
    coreGlow.addColorStop(0.72, `${GAME_CONFIG.vortexColors.core}00`);
    coreGlow.addColorStop(0.88, `${GAME_CONFIG.vortexColors.eye}dd`);
    coreGlow.addColorStop(1, `${HERO_FX_SECONDARY.fairy}00`);
    context.fillStyle = coreGlow; context.beginPath(); context.arc(0, 0, coreRadius + 9, 0, Math.PI * 2); context.fill();
    const hole = context.createRadialGradient(-coreRadius * 0.28, -coreRadius * 0.32, 0, 0, 0, coreRadius);
    hole.addColorStop(0, '#160d20'); hole.addColorStop(0.42, GAME_CONFIG.vortexColors.core); hole.addColorStop(1, '#000000');
    context.fillStyle = hole; context.beginPath(); context.arc(0, 0, coreRadius, 0, Math.PI * 2); context.fill();
    context.strokeStyle = GAME_CONFIG.vortexColors.eye; context.lineWidth = 2.5;
    context.beginPath(); context.arc(0, 0, coreRadius - 1, 0, Math.PI * 2); context.stroke();
    context.restore();
    if (!prefersReducedMotion && effectiveQuality() !== 'low' && elapsed < VORTEX_FORMATION_FLASH_MS) {
      context.save(); context.globalAlpha = 0.8 * (1 - elapsed / VORTEX_FORMATION_FLASH_MS);
      context.fillStyle = '#fff'; context.beginPath(); context.arc(visual.x, visual.y, VORTEX_CORE_RADIUS_PX, 0, Math.PI * 2); context.fill(); context.restore();
    }
  }
  for (let i = fairyVortexPops.length - 1; i >= 0; i--) {
    const pop = fairyVortexPops[i]; const age = now - pop.startedAt;
    if (age >= VORTEX_FLASH_POP_MS) { fairyVortexPops.splice(i, 1); continue; }
    context.save(); context.globalAlpha = 1 - age / VORTEX_FLASH_POP_MS; context.fillStyle = '#fff0fa';
    context.beginPath(); context.arc(pop.x, pop.y, VORTEX_CORE_RADIUS_PX * (1 + age / VORTEX_FLASH_POP_MS), 0, Math.PI * 2); context.fill(); context.restore();
  }
}

function addDamageNumber({ x, y, damage, sourceId, targetId, bonus = false, color = null, mergeWindowMs = null }) {
  if (!settings.damageNumbers || !effectToggles.numbers) return;
  const now = performance.now();
  // Aura damage merges over a much longer window (THORNS_NUMBER_MERGE_MS) so a
  // damage-over-time tick shows one running total per enemy, not a number per
  // server tick.
  const mergeWindow = mergeWindowMs ?? ARENA_TUNING.damageNumbers.mergeMs;
  // Mass-kill window: collapse every hit into one running total instead of a
  // number per enemy.
  if (isMassKillWindow(now)) {
    let entry = damageNumberMerge.get(MASS_NUMBER_KEY);
    if (!entry) {
      entry = { x, y, startY: y - 12, value: 0, text: '', startedAt: now, lastHitAt: now,
        sourceId: null, targetId: MASS_NUMBER_KEY, mergeKey: MASS_NUMBER_KEY, bonus: false, alpha: 1, color: '#ffea00', scale: 1, glyph: null };
      damageTexts.push(entry);
      damageNumberMerge.set(MASS_NUMBER_KEY, entry);
    }
    entry.value += damage;
    entry.text = `-${Math.round(entry.value)}`;
    entry.glyph = textGlyph(entry.text, entry.color, 13 * entry.scale);
    entry.lastHitAt = now;
    entry.startedAt = now;
    entry.x = x;
    entry.startY = y - 12;
    return;
  }
  const mergeKey = `${sourceId}|${targetId}`;
  const existing = damageNumberMerge.get(mergeKey);
  if (existing && now - existing.lastHitAt <= mergeWindow) {
    existing.value += damage;
    existing.text = `-${Math.round(existing.value)}`;
    existing.glyph = textGlyph(existing.text, existing.color, 13 * existing.scale);
    existing.lastHitAt = now;
    existing.color = bonus ? '#ffe34f' : (color || '#fff');
    existing.bonus ||= bonus;
    existing.startedAt = now;
    existing.startY = y - 12;
    return;
  }
  const entryColor = bonus ? '#ffe34f' : (color || '#fff');
  const entry = { x, y, startY: y, value: damage, text: `-${Math.round(damage)}`, startedAt: now, lastHitAt: now,
    sourceId, targetId, mergeKey, bonus, alpha: 1, color: entryColor, scale: bonus ? ARENA_TUNING.damageNumbers.bonusScale : 1, glyph: null };
  entry.glyph = textGlyph(entry.text, entryColor, 13 * entry.scale);
  damageTexts.push(entry);
  damageNumberMerge.set(mergeKey, entry);
  while (damageTexts.length > ARENA_TUNING.damageNumbers.maxVisible) {
    let dropIdx = -1;
    for (let j = 0; j < damageTexts.length; j++) { if (!damageTexts[j].bonus) { dropIdx = j; break; } }
    if (dropIdx === -1) dropIdx = 0;
    const removed = damageTexts[dropIdx];
    damageNumberMerge.delete(removed.mergeKey);
    damageTexts.splice(dropIdx, 1);
  }
}

function showElectroOverload(event) {
  damageTexts.push({ x: event.heroX, y: event.heroY - 64, text: 'OVERLOAD!', alpha: 1, vy: -18,
    color: HERO_FX_COLORS.electromancer.highlight, scale: 1.35 });
  overloadFlash.classList.remove('show');
  void overloadFlash.offsetWidth;
  overloadFlash.classList.add('show');
  setTimeout(() => overloadFlash.classList.remove('show'), ARENA_TUNING.heroTweaks.electroOverloadFlashMs);
  const circle = document.querySelector('.ability[data-ability="ultimate"] .ability-circle');
  circle.classList.remove('overload-pulse');
  void circle.offsetWidth;
  circle.classList.add('overload-pulse');
  setTimeout(() => circle.classList.remove('overload-pulse'), ARENA_TUNING.heroTweaks.electroOverloadFeedbackMs);
}

function showBanner(text, boss = false, durationMs = ARENA_TUNING.waveMoments.bannerMs, extraClass = '') {
  if (!momentBanner) return;
  clearTimeout(bannerTimer);
  momentBanner.hidden = false;
  momentBanner.classList.toggle('boss', boss);
  momentBanner.classList.toggle('gold', extraClass === 'gold');
  momentBanner.classList.remove('show');
  momentBanner.textContent = text;
  momentBanner.style.setProperty('--banner-scale-start', String(ARENA_TUNING.waveMoments.bannerScaleStart));
  momentBanner.style.setProperty('--banner-scale-peak', String(ARENA_TUNING.waveMoments.bannerScalePeak));
  momentBanner.style.setProperty('--banner-scale-end', String(ARENA_TUNING.waveMoments.bannerScaleEnd));
  void momentBanner.offsetWidth;
  momentBanner.style.animationDuration = `${Math.min(durationMs, ARENA_TUNING.waveMoments.bannerMaxMs)}ms`;
  momentBanner.classList.add('show');
  bannerTimer = setTimeout(() => { momentBanner.hidden = true; }, Math.min(durationMs, ARENA_TUNING.waveMoments.bannerMaxMs));
}

function closeBriefing() {
  if (joinBriefing.hidden) return;
  window.removeEventListener('keydown', closeBriefing);
  document.removeEventListener('click', closeBriefing);
  clearTimeout(briefingTimer);
  joinBriefing.classList.add('fade-out');
  clearTimeout(briefingFadeTimer);
  briefingFadeTimer = setTimeout(() => { joinBriefing.hidden = true; }, ARENA_TUNING.briefing.fadeMs);
}

function openBriefing(force = false) {
  let alreadyShown = false;
  try { alreadyShown = sessionStorage.getItem(BRIEFING_SESSION_KEY) === '1'; } catch { /* session storage is optional */ }
  if (!force && alreadyShown) return;
  try { sessionStorage.setItem(BRIEFING_SESSION_KEY, '1'); } catch { /* session storage is optional */ }
  clearTimeout(briefingTimer);
  clearTimeout(briefingFadeTimer);
  joinBriefing.hidden = false;
  joinBriefing.classList.remove('fade-out');
  window.addEventListener('keydown', closeBriefing, { once: true });
  document.addEventListener('click', closeBriefing, { once: true });
  briefingTimer = setTimeout(closeBriefing, ARENA_TUNING.briefing.durationMs);
}

// The "?" button was fused into the I-key hero info card; the one-time
// onboarding overlay still auto-shows via openBriefing().
function updateKillStreak(sourceId, announceMass = false) {
  if (sourceId !== me) return;
  const now = performance.now();
  combo.count = now - combo.lastKillAt <= ARENA_TUNING.killStreak.windowMs ? combo.count + 1 : 1;
  combo.lastKillAt = now;
  const semitone = Math.min(combo.count - 1, ARENA_TUNING.sound.maxKillPitchSteps) * ARENA_TUNING.sound.killSemitonePerStep;
  if (effectToggles.sound) {
    // Mass-kill window: the announcing kill plays one louder sound; the rest
    // are silent (the audio layer's 45 ms throttle also caps the steady rate).
    if (announceMass) playSound('kill', { semitones: semitone, volume: 0.9 });
    else if (!isMassKillWindow(now)) playSound('kill', { semitones: semitone });
  }
  if (!effectToggles.combo) return;
  killStreakHud.hidden = false;
  killStreakHud.textContent = `x${combo.count}`;
  killStreakHud.style.setProperty('--streak-scale-peak', String(ARENA_TUNING.killStreak.scalePeak));
  killStreakHud.classList.remove('pop');
  void killStreakHud.offsetWidth;
  killStreakHud.classList.add('pop');
}

function showMuzzleFlash(player) {
  const now = performance.now();
  if (now - (lastMuzzleAt.get(player.id) || 0) < ARENA_TUNING.muzzleFlash.durationMs) return;
  lastMuzzleAt.set(player.id, now);
  muzzleFlashes.set(player.id, { startedAt: now, aim: { ...player.aim }, heroId: player.heroId,
    recoil: ARENA_TUNING.muzzleFlash.recoilMinPx + Math.random() * (ARENA_TUNING.muzzleFlash.recoilMaxPx - ARENA_TUNING.muzzleFlash.recoilMinPx) });
  if (player.heroId === 'fairy') fairyMuzzlePuffs.push({
    x: player.x + player.aim.x * (GAME_CONFIG.weaponMuzzleOffset + FAIRY_MUZZLE_PUFF_RADIUS_PX),
    y: player.y + player.aim.y * (GAME_CONFIG.weaponMuzzleOffset + FAIRY_MUZZLE_PUFF_RADIUS_PX),
    angle: Math.atan2(player.aim.y, player.aim.x), startedAt: now,
  });
}

function joinPayload() {
  const payload = { heroId: activeHeroId };
  if (trialTicket) payload.trialTicket = trialTicket;
  if (activeRoomCode) payload.roomCode = activeRoomCode;
  else if (createRequested) payload.create = true;
  return payload;
}

socket.on('connect', () => {
  connectionStatus.textContent = 'Joining the field…';
  if (selectedHero && !joinFailed) socket.emit('join', joinPayload());
});
socket.on('connect_error', (error) => {
  connectionStatus.textContent = `Could not connect to the server: ${error.message}`;
});
socket.on('disconnect', () => {
  me = null;
  engineerPlacementTargeting = false;
  rangerMeatTargeting = false;
  targetingHint.hidden = true;
  targetingReticle.hidden = true;
  state = { players: [], projectiles: [], monsters: [], campfire: null, wave: null };
  clientProjectiles.clear();
  for (const stop of fairyTravelSoundStops.values()) stop();
  fairyTravelSoundStops.clear();
  fairyVortexHumStop?.(); fairyVortexHumStop = null;
  fairyVortexVisuals.clear();
  releaseKeys();
  connectionStatus.textContent = 'Disconnected from the server. Reconnecting…';
});
socket.on('welcome', (welcome) => {
  me = welcome.you;
  joinFailed = false;
  if (welcome.room?.code) activeRoomCode = welcome.room.code;
  if (workshopTrial) {
    if (welcome.room?.mode !== 'workshop_trial') { exitWorkshopTrial(); return; }
    const controls = document.querySelector('#trial-tools');
    if (controls) controls.hidden = false;
    const expiry = document.querySelector('#trial-expiry');
    if (expiry && welcome.room.expiresAt) expiry.textContent = `Private practice · ends ${new Date(welcome.room.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  connectionStatus.textContent = 'Connected';
  if (embedded && welcome.room?.code) window.parent.postMessage({ type: 'hero-lab-room', code: welcome.room.code }, location.origin);
  openBriefing();
});
socket.on('join_error', ({ code, message } = {}) => {
  joinFailed = true;
  engineerPlacementTargeting = false;
  releaseKeys();
  connectionStatus.textContent = message || 'Could not join the room';
  if (embedded) window.parent.postMessage({ type: 'hero-lab-join-error', code, message }, location.origin);
  else showBanner(message || 'Could not join the room');
  if (workshopTrial && code === 'trial_expired') setTimeout(exitWorkshopTrial, 900);
});
socket.on('trial_expired', () => {
  const expiry = document.querySelector('#trial-expiry');
  if (expiry) expiry.textContent = 'This practice session has expired. Returning to the Workshop…';
  setTimeout(exitWorkshopTrial, 700);
});
socket.on('trial_spawn_rejected', ({ code } = {}) => {
  const messages = { rate_limited: 'Give the arena a moment before spawning again.', entity_cap: 'Clear a few targets before adding more.', invalid_enemy: 'That target is not available.' };
  const expiry = document.querySelector('#trial-expiry');
  if (expiry) expiry.textContent = messages[code] || 'That practice action could not be completed.';
});
function exitWorkshopTrial() {
  if (!workshopTrial) return;
  if (window.history.length > 1) window.history.back();
  else window.location.assign('/');
}
document.querySelector('#trial-exit')?.addEventListener('click', exitWorkshopTrial);
document.querySelector('#trial-spawn')?.addEventListener('click', () => socket.emit('spawn_trial_enemy', document.querySelector('#trial-enemy')?.value));
document.querySelector('#trial-wave')?.addEventListener('click', () => socket.emit('summon_trial_wave'));
socket.on('state', (snapshot) => {
  state = snapshot;
  stateReceivedAt = performance.now();
  const activeTurrets = new Set();
  for (const turret of snapshot.turrets || []) {
    activeTurrets.add(turret.id);
    const visual = turretVisualState.get(turret.id);
    if (!visual) turretVisualState.set(turret.id, { bornAt: performance.now(), shotsFired: turret.shotsFired, angle: turret.angle,
      angleChangedAt: performance.now(), recoilUntil: 0, flashUntil: 0 });
    else {
      if (turret.shotsFired > visual.shotsFired) {
        visual.recoilUntil = performance.now() + GAME_CONFIG.turret.visuals.recoilMs;
        visual.flashUntil = performance.now() + GAME_CONFIG.turret.visuals.muzzleFlashMs;
      }
      if (Math.abs(turret.angle - visual.angle) > 0.001) visual.angleChangedAt = performance.now();
      visual.angle = turret.angle;
      visual.shotsFired = turret.shotsFired;
    }
  }
  for (const id of turretVisualState.keys()) if (!activeTurrets.has(id)) turretVisualState.delete(id);
  syncFairyVortices(snapshot);
  if (Array.isArray(snapshot.projectiles)) {
    const active = new Set(snapshot.projectiles.map((projectile) => projectile.id));
    for (const id of clientProjectiles.keys()) {
      if (!active.has(id)) clientProjectiles.delete(id);
    }
    for (const proj of snapshot.projectiles) {
      addOrUpdateProjectile(proj);
    }
  }
});

socket.on('ranger_meat_thrown', ({ ownerId, fromX, fromY, x, y, durationMs }) => {
  rangerMeatThrows.set(ownerId, { fromX, fromY, x, y, startedAt: performance.now(), durationMs: Math.max(1, durationMs || 400) });
});
socket.on('ranger_wolf_arrived', ({ x, y }) => {
  const now = performance.now();
  if (effectToggles.sound) playSound('rangerWolfHowl', { volume: 0.45 });
  if (!prefersReducedMotion && effectiveQuality() !== 'low' && effectToggles.burst) {
    for (let i = 0; i < engineerFeedbackParticleCount(8); i++) {
      const angle = Math.PI * 2 * i / 8;
      const speed = 24 + Math.random() * 46;
      addParticle({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 24,
        radius: 7, emoji: '🍃', color: HERO_FX_SECONDARY.ranger, alpha: 0.9, expiresAt: now + 420 });
    }
  }
});
socket.on('ranger_wolf_bite', ({ x, y }) => {
  const now = performance.now();
  rangerWolfBiteFx.push({ x, y, startedAt: now });
  if (effectToggles.sound) playSound('rangerWolfBite', { volume: 0.5 });
});
socket.on('ranger_wolf_removed', ({ x, y }) => {
  const now = performance.now();
  if (effectToggles.sound) playSound('rangerWolfLeave', { volume: 0.4 });
  if (!prefersReducedMotion && effectiveQuality() !== 'low' && effectToggles.burst) {
    for (let i = 0; i < engineerFeedbackParticleCount(7); i++) {
      const angle = Math.PI * 2 * i / 7;
      const speed = 18 + Math.random() * 40;
      addParticle({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 14,
        radius: 6, emoji: i % 2 ? '🍃' : '💨', color: HERO_FX_SECONDARY.ranger, alpha: 0.75, expiresAt: now + 360 });
    }
  }
});

function engineerFeedbackParticleCount(count) {
  if (prefersReducedMotion || count <= 0) return 0;
  const factor = QUALITY_PARTICLE_FACTOR[effectiveQuality()] ?? 1;
  return Math.min(count, Math.max(1, Math.floor(count * factor)));
}

function recordEngineerRefuel(turretId, x, y, now) {
  engineerSalvagePopups.set(turretId, { startedAt: now, x, y });
}

socket.on('turret_deployed', ({ id, x, y }) => {
  turretVisualState.set(id, { bornAt: performance.now(), shotsFired: 0, angle: 0,
    angleChangedAt: performance.now(), recoilUntil: 0, flashUntil: 0 });
  const dustCount = engineerFeedbackParticleCount(GAME_CONFIG.turret.visuals.deployDustCount);
  for (let i = 0; i < dustCount; i++) { const a = Math.PI * 2 * i / dustCount; addParticle({ x, y: y + 8, vx: Math.cos(a) * 35, vy: Math.sin(a) * 20 - 12, radius: 2 + Math.random() * 2, color: '#c8b99a', alpha: 0.75, decay: 0.04 }); }
  playSound('turretDeploy');
});
socket.on('turret_hit', ({ id, x, y, damage }) => {
  const now = performance.now();
  if (now - (turretHitFlashLast.get(id) ?? -Infinity) >= HIT_FLASH_MIN_INTERVAL_MS) {
    turretHitFlashLast.set(id, now);
    turretHitFlashes.set(id, now + ARENA_TUNING.hitFlashMs);
  }
  addDamageNumber({ x, y: y - 22, damage, sourceId: null, targetId: id, color: '#ff6161' });
});
socket.on('turret_destroyed', ({ id, x, y }) => {
  turretVisualState.delete(id);
  turretHitFlashes.delete(id); turretHitFlashLast.delete(id);
  if (engineerFeedbackParticleCount(1)) addParticle({ x, y, vx: 0, vy: -18, radius: 7, color: '#646b72', alpha: 0.9, decay: 0.02 });
  const debrisCount = engineerFeedbackParticleCount(GAME_CONFIG.turret.visuals.destroyDebrisCount);
  for (let i = 0; i < debrisCount; i++) { const a = Math.PI * 2 * i / debrisCount; addParticle({ x, y, vx: Math.cos(a) * (55 + Math.random() * 30), vy: Math.sin(a) * (55 + Math.random() * 30), radius: 2 + Math.random() * 2, color: i % 2 ? '#A87547' : '#EBA91F', alpha: 1, decay: 0.035 }); }
  playSound('turretDestroy');
});
socket.on('turret_expired', ({ id, x, y } = {}) => {
  turretVisualState.delete(id);
  turretHitFlashes.delete(id); turretHitFlashLast.delete(id);
  playSound('turretDestroy');
  const debrisCount = engineerFeedbackParticleCount(GAME_CONFIG.turret.visuals.destroyDebrisCount);
  for (let i = 0; i < debrisCount; i++) {
    const angle = Math.PI * 2 * i / debrisCount;
    addParticle({ x, y, vx: Math.cos(angle) * 70, vy: Math.sin(angle) * 70, radius: 3,
      color: i % 2 ? '#ff8738' : '#FFD27A', alpha: 1, decay: 0.045 });
  }
});
socket.on('turret_removed', ({ id }) => { turretVisualState.delete(id); turretHitFlashes.delete(id); turretHitFlashLast.delete(id); });
socket.on('engineer_place_failed', () => { playSound('hit'); showToast("Can't place turret here", 'engineer', '🔧'); });
socket.on('ranger_skill_failed', () => playSound('rangerFail'));
socket.on('engineer_wrench_caught', ({ playerId, x, y } = {}) => {
  if (playerId !== me) return;
  playSound('engineerWrenchCatch');
  const sparkCount = engineerFeedbackParticleCount(4);
  for (let i = 0; i < sparkCount; i++) {
    const angle = Math.PI * 2 * i / sparkCount;
    addParticle({ x, y, vx: Math.cos(angle) * 42, vy: Math.sin(angle) * 42, radius: 2.5, color: '#FFD27A', alpha: 1, decay: 0.08 });
  }
});
socket.on('engineer_laser_charge', ({ playerId } = {}) => {
  engineerLaserWhineStops.get(playerId)?.();
  engineerLaserWhineStops.set(playerId, startSoundLoop('engineerCharge', { volume: playerId === me ? 1 : 0.5 }));
});
socket.on('engineer_laser_cancelled', ({ playerId } = {}) => {
  engineerLaserWhineStops.get(playerId)?.(); engineerLaserWhineStops.delete(playerId);
});
socket.on('engineer_laser_fired', (beam) => {
  engineerLaserWhineStops.get(beam.playerId)?.(); engineerLaserWhineStops.delete(beam.playerId);
  engineerLaserBeams.push({ ...beam, startedAt: performance.now() });
  playSound('engineerLaser', { volume: beam.playerId === me ? 1 : 0.55 });
  const sparkCount = engineerFeedbackParticleCount(4);
  if (sparkCount) {
    for (const hit of beam.hits || []) for (let i = 0; i < sparkCount; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 25 + Math.random() * 40;
      addParticle({ x: hit.x, y: hit.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 1.5, color: i % 2 ? '#FFD27A' : '#fff', alpha: 1, decay: 0.08 });
    }
    // A few sparks spraying back off the beam's end point.
    const dirLen = Math.hypot(beam.dx || 0, beam.dy || 0) || 1, bx = (beam.dx || 0) / dirLen, by = (beam.dy || 0) / dirLen;
    const endX = beam.x + bx * (beam.length || 0), endY = beam.y + by * (beam.length || 0);
    for (let i = 0; i < sparkCount; i++) {
      const angle = Math.atan2(-by, -bx) + (Math.random() - 0.5) * 2.2, speed = 50 + Math.random() * 70;
      addParticle({ x: endX, y: endY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 1.5, color: i % 2 ? '#FF9F1C' : '#FFF6D0', alpha: 1, decay: 0.07 });
    }
  }
});
socket.on('engineer_salvage', (event) => {
  const startedAt = performance.now();
  for (const turret of event.turrets || []) {
    recordEngineerRefuel(turret.id, turret.x, turret.y, startedAt);
  }
});
socket.on('fairy_vortex_start', (vortex) => {
  for (const stop of fairyTravelSoundStops.values()) stop();
  fairyTravelSoundStops.clear();
  if (!fairyVortexVisuals.has(vortex.id)) startFairyVortexVisual(vortex);
});
socket.on('fairy_vortex_end', ({ id, x, y } = {}) => finishFairyVortexVisual(id, x, y));
socket.on('notice', (message) => {
  connectionStatus.textContent = message;
});
socket.on('host_changed', ({ name, heroId, emoji } = {}) => { if (name) showToast(`${name} is now the host`, heroId, emoji); });
socket.on('player_waiting', ({ name, heroId, emoji } = {}) => { if (name) showToast(`${name} is joining after this wave`, heroId, emoji); });
socket.on('player_joined', ({ name, heroId, emoji } = {}) => { if (name) showToast(`${name} joined`, heroId, emoji); });
socket.on('player_reconnected', ({ name, heroId, emoji } = {}) => { if (name) showToast(`${name} reconnected`, heroId, emoji); });
socket.on('countdown', () => { playSound('waveStart'); });
socket.on('run_started', () => {
  countdownOverlay.hidden = true;
  countdownLabel = '';
  if (!runResultPanel.hidden) runResultPanel.hidden = true;
});
socket.on('hero_swapped', ({ playerId, heroId } = {}) => {
  if (playerId === me && heroId) activeHeroId = heroId;
});
socket.on('start_rejected', ({ code } = {}) => {
  if (code === 'not_host') showToast('Only the host can start the run');
});
socket.on('dummy_broken', ({ x, y } = {}) => {
  if (effectToggles.burst) {
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 120;
      addParticle({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 2.5, color: Math.random() > 0.5 ? '#f5d76e' : '#fff3bd',
        alpha: 1, startedAt: performance.now(), expiresAt: performance.now() + 520 });
    }
  }
  playSound('hit');
});
socket.on('left_room', () => {
  leftRoom = true;
  if (runResultPanel.hidden) returnToKingdom();
});
socket.on('wave_start', (event) => {
  showBanner(event.bossWave ? 'BOSS WAVE' : `WAVE ${event.wave}`, Boolean(event.bossWave));
  playSound(event.bossWave ? 'bossSpawn' : 'waveStart');
  if (event.bossWave) cameraZoom = { startedAt: performance.now(), until: performance.now() + ARENA_TUNING.waveMoments.bossZoomMs, scale: ARENA_TUNING.waveMoments.bossZoom };
});
socket.on('wave_twist', (twist) => showBanner(twist.label));
socket.on('wave_end', (event) => {
  // On a boss wave the gold "BOSS DEFEATED!" banner and the fanfare already
  // played from the kill event; re-bannering here would cut them to ~0 ms.
  if (event?.boss) return;
  showBanner('WAVE CLEARED', false, ARENA_TUNING.waveMoments.clearedBannerMs);
  playSound('waveEnd');
});
socket.on('milestone_dawn', ({ wave, nextWave }) => {
  document.querySelector('#dawn-message').textContent = `Wave ${wave} is clear. Leave with rewards or continue to wave ${nextWave}.`;
  milestoneDawn.hidden = false;
});
socket.on('player_leave', (player) => leavingPlayers.push({ ...player, startedAt: performance.now() }));
socket.on('run_result', showRunResult);
socket.on('ability_used', (event) => {
  if (event.ability === 'ultimate') {
    if (event.heroId === 'ranger') {
      rangerUltimateFlashAt.set(event.playerId, performance.now());
      if (effectToggles.sound) playSound('rangerChunk', { volume: event.playerId === me ? 1 : 0.65 });
      return;
    }
    if (event.heroId === 'fairy') {
      if (effectToggles.sound) {
        playSound('fairyWhoosh', { volume: event.playerId === me ? 1 : 0.65 });
        fairyTravelSoundStops.set(event.playerId, startSoundLoop('fairyTravel', { volume: 0.35 }));
      }
      return;
    }
    playSound('ultimateCast', { volume: event.playerId === me ? 1 : 0.65 });
    shakeCamera(SHAKE_ULTIMATE_TRAUMA, 'major');
    return;
  }
  if (event.ability === 'skill' && event.heroId === 'fairy') {
    if (effectToggles.sound) playSound('fairyWhoosh', { volume: event.playerId === me ? 1 : 0.65 });
    return;
  }
  if (event.ability === 'skill' && event.heroId === 'guardian') {
    // Dash start: a dust puff kicked up behind the launch point plus a short
    // directional squash of the sprite (applied in the player draw pass).
    const player = state.players.find((candidate) => candidate.id === event.playerId);
    const dir = event.direction || (player ? player.aim : { x: 1, y: 0 });
    const length = Math.hypot(dir.x, dir.y) || 1;
    const dx = dir.x / length, dy = dir.y / length;
    const px = player ? player.x : 0, py = player ? player.y : 0;
    if (player) guardianDashSquash.set(player.id, { dir: { x: dx, y: dy }, startedAt: performance.now() });
    const fx = HERO_FX_COLORS.guardian.primary;
    if (player) spawnDust(px - dx * 8, py + GAME_CONFIG.arena.playerRadius * 0.7, dx, dy, 4);
    for (let i = 0; i < 10; i++) {
      const spread = (Math.random() - 0.5) * 1.4;
      const back = -0.4 - Math.random() * 0.5;
      const ang = Math.atan2(dy, dx) + spread;
      const speed = 40 + Math.random() * 90;
      addParticle({ x: px - dx * 14, y: py - dy * 14, vx: Math.cos(ang) * speed * 0.6 + dx * back * 60,
        vy: Math.sin(ang) * speed * 0.6 + dy * back * 60 - 20, radius: 2 + Math.random() * 3, color: fx, alpha: 0.9, decay: 0.06, expiresAt: performance.now() + 360 });
    }
  }
});
socket.on('samurai_dash_started', (event = {}) => {
  const startedAt = performance.now();
  const trail = { ...event, startedAt };
  samuraiDashTrails.set(event.playerId, trail);
  const kickLen = Math.hypot((event.endX ?? event.startX) - event.startX, (event.endY ?? event.startY) - event.startY) || 1;
  spawnDust(event.startX, event.startY + GAME_CONFIG.arena.playerRadius * 0.7,
    ((event.endX ?? event.startX) - event.startX) / kickLen, ((event.endY ?? event.startY) - event.startY) / kickLen, 3, startedAt);
  if (effectToggles.sound) playSound(event.kind === 'afterimage-cut' ? 'ultimateCast' : 'fairyWhoosh',
    { volume: event.playerId === me ? 0.9 : 0.55 });
  if (!prefersReducedMotion && effectiveQuality() !== 'low') {
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 24 + Math.random() * 46;
      addParticle({ x: event.startX, y: event.startY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 2, color: i % 2 ? HERO_FX_COLORS.samurai.primary : '#fff',
        alpha: 0.9, expiresAt: startedAt + 300 });
    }
  }
  if (event.kind === 'afterimage-cut') {
    setTimeout(() => { if (effectToggles.sound) playSound('uiClick', { volume: event.playerId === me ? 0.75 : 0.4 }); }, event.durationMs || 250);
  }
});
socket.on('samurai_dash_hit', (event = {}) => {
  const trail = samuraiDashTrails.get(event.playerId);
  const angle = trail ? Math.atan2(trail.endY - trail.startY, trail.endX - trail.startX) - Math.PI / 4 : -Math.PI / 4;
  if (samuraiHitMarks.length >= 80) samuraiHitMarks.shift();
  samuraiHitMarks.push({ x: event.x, y: event.y, angle, execute: Boolean(event.execute), startedAt: performance.now() });
  if (event.execute) {
    if (samuraiExecuteLabels.length >= 32) samuraiExecuteLabels.shift();
    samuraiExecuteLabels.push({ x: event.x, y: event.y, startedAt: performance.now() });
    if (effectToggles.sound) playSound('hit', { semitones: 5, volume: event.playerId === me ? 0.9 : 0.6 });
    if (!prefersReducedMotion && effectiveQuality() !== 'low') {
      for (let i = 0; i < 3; i++) {
        const a = angle + (Math.random() - 0.5) * 1.5, speed = 35 + Math.random() * 45;
        addParticle({ x: event.x, y: event.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          radius: 2, color: i === 0 ? '#FFD27A' : '#fff', alpha: 1, expiresAt: performance.now() + 260 });
      }
    }
  }
});
socket.on('samurai_cut_resolved', (event = {}) => {
  const now = performance.now();
  samuraiSlashEffects.push({ startX: event.startX, startY: event.startY, endX: event.endX, endY: event.endY,
    width: event.width || GAME_CONFIG.heroes.samurai.afterimageCut.width, startedAt: now });
  if (samuraiSlashEffects.length > 16) samuraiSlashEffects.shift();
  for (const hit of event.hits || []) {
    if (samuraiHitMarks.length >= 80) samuraiHitMarks.shift();
    samuraiHitMarks.push({ x: hit.x, y: hit.y, angle: Math.atan2(event.endY - event.startY, event.endX - event.startX) - Math.PI / 4,
      execute: false, startedAt: now });
    if (samuraiCutNumberLabels.length >= 48) samuraiCutNumberLabels.shift();
    samuraiCutNumberLabels.push({ x: hit.x, y: hit.y, multiplier: event.stackMultiplier || 0.5, startedAt: now });
    if (!prefersReducedMotion && effectiveQuality() !== 'low' && effectToggles.sparks) {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2, speed = 28 + Math.random() * 48;
        addParticle({ x: hit.x, y: hit.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
          radius: 2, color: i === 0 ? '#FFD27A' : '#fff', alpha: 1, expiresAt: now + 280 });
      }
    }
  }
  if (!prefersReducedMotion && effectiveQuality() !== 'low') samuraiScreenFlash = { startedAt: now };
  if (effectToggles.sound) playSound('ultimateCast', { volume: event.playerId === me ? 1 : 0.6 });
  shakeCamera(SHAKE_ULTIMATE_TRAUMA, 'major');
});
socket.on('weapon_fired', (event) => {
  if (event.heroId === 'ranger') {
    const shooter = state.players.find((candidate) => candidate.id === event.playerId);
    const deadAim = event.source === 'dead-aim';
    const charge = Math.max(0, Math.min(1, ((event.charge || 0) - 0.15 / 0.9) / (1 - 0.15 / 0.9)));
    if (effectToggles.sound) playSound(deadAim ? 'rangerThock' : 'rangerTwang', {
      semitones: deadAim ? 0 : Math.round(charge * 7), volume: event.playerId === me ? 1 : 0.65,
    });
    if (shooter) {
      showMuzzleFlash(shooter);
      const now = performance.now();
      const muzzleX = shooter.x + shooter.aim.x * (GAME_CONFIG.weaponMuzzleOffset + 18);
      const muzzleY = shooter.y + shooter.aim.y * (GAME_CONFIG.weaponMuzzleOffset + 18);
      if (deadAim) {
        rangerDeadAimMuzzleUntil.set(event.playerId, now + GAME_CONFIG.heroes.ranger.ranger.feedback.deadAimMuzzleMs);
        rangerDeadAimStreaks.push({ x: muzzleX, y: muzzleY, dx: shooter.aim.x, dy: shooter.aim.y,
          range: GAME_CONFIG.heroes.ranger.ranger.ultRange, startedAt: now,
          durationMs: GAME_CONFIG.heroes.ranger.ranger.feedback.deadAimStreakMs });
      }
      if (!prefersReducedMotion && effectiveQuality() !== 'low' && effectToggles.burst) {
        const count = engineerFeedbackParticleCount(deadAim ? 10 : 5);
        for (let i = 0; i < count; i++) {
          const angle = Math.atan2(shooter.aim.y, shooter.aim.x) + (Math.random() - 0.5) * 1.1;
          const speed = (deadAim ? 100 : 34) + Math.random() * (deadAim ? 120 : 45);
          addParticle({ x: muzzleX, y: muzzleY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            radius: deadAim ? 3.5 : 2.5,
            color: deadAim ? (i % 2 ? '#FFF2CC' : '#F0DDA0') : '#F0DDA0', alpha: 0.9,
            expiresAt: now + (deadAim ? 190 : 130) });
        }
      }
    }
    return;
  }
  if (event.playerId !== me) {
    playSound(event.heroId === 'fairy' || event.heroId === 'engineer' ? 'fairyWhoosh' : 'shoot', { pitchVariance: ARENA_TUNING.sound.shotPitchVariance, volume: 0.6 });
    return;
  }
  // Own shots are repeated by the server while primary fire is held, so their
  // muzzle flash and sound have to come from the event. A 'click' shot already
  // played both locally, before the round trip.
  if (event.source !== 'hold') return;
  const shooter = state.players.find((candidate) => candidate.id === me);
  if (!shooter) return;
  showMuzzleFlash(shooter);
  playSound(shooter.heroId === 'fairy' || shooter.heroId === 'engineer' ? 'fairyWhoosh' : 'shoot', { pitchVariance: ARENA_TUNING.sound.shotPitchVariance });
});
socket.on('buff_applied', () => playSound('cardPick'));
socket.on('dash_hit', (event) => {
  const player = state.players.find((candidate) => candidate.id === event.id);
  if (!player) return;
  for (let i = 0; i < ARENA_TUNING.momentum.streakCount; i++) {
    addParticle({ x: player.x - player.aim.x * 20, y: player.y - player.aim.y * 20, vx: -player.aim.x * 90, vy: -player.aim.y * 90,
      radius: 2, color: HERO_FX_COLORS[event.heroId]?.highlight || '#fff', alpha: 0.9, decay: 0.08 });
  }
  if (event.id === me) shakeCamera(SHAKE_PLAYER_HIT_TRAUMA);
});
socket.on('player_hit', (hit) => {
  if (hit.id !== me) return;
  addDamageNumber({ x: hit.x, y: hit.y - 24, damage: hit.damage, sourceId: hit.sourceId, targetId: hit.id, color: '#ff6161' });
  if (hit.sourceAbility !== 'boss-slam') shakeCamera(SHAKE_PLAYER_HIT_TRAUMA);
  playSound('hit');
});
socket.on('campfire_hit', () => {
  shakeCamera(SHAKE_PLAYER_HIT_TRAUMA);
  playSound('campfireDamaged');
  campfireHud.classList.remove('campfire-hit');
  void campfireHud.offsetWidth;
  campfireHud.classList.add('campfire-hit');
  setTimeout(() => campfireHud.classList.remove('campfire-hit'), ARENA_TUNING.campfire.alertCooldownMs);
});
socket.on('hero_downed', (event) => {
  playSound('heroDowned', { volume: event.playerId === me ? 1 : 0.7 });
});
socket.on('hero_respawn', (event) => {
  playSound('heroRespawn', { volume: event.playerId === me ? 1 : 0.7 });
  if (event.playerId === me) shakeCamera(SHAKE_PLAYER_HIT_TRAUMA);
});
socket.on('momentum_ready', (event) => {
  if (event.playerId === me) momentumReadyLabels.push({ startedAt: performance.now(), bonus: event.bonus });
});
socket.on('game_over', (result = {}) => {
  if (runResultPanel.hidden) showRunResult({ victory: false, reason: result.reason, wavesReached: state.wave?.number || 0,
    wavesCleared: 0, kills: 0, damageDealt: 0, bonusDamage: 0, rewardCoins: 0, nextBossWave: ARENA_TUNING.run.bossTeaserWave, heroId: activeHeroId });
});
// The hit and kill handlers are extracted into named functions so the lag
// investigation can replay the exact client-side kill path with each visual
// effect toggled (see window.__heroLabKillTest below).
function handleHit(hit) {
  const fx = HERO_FX_COLORS[hit.heroId] || {};
  const now = performance.now();
  const rangerArrowHit = hit.heroId === 'ranger' && (hit.rangerDeadAim || Number(hit.rangerChargeT) > 0);
  const rangerImpactCount = hit.rangerDeadAim ? GAME_CONFIG.heroes.ranger.ranger.feedback.deadAimImpactLeaves : 4;
  if (hit.heroId === 'fairy' && hit.sourceAbility === 'weapon') {
    const angle = Math.atan2(hit.y - (hit.sourceY ?? hit.y), hit.x - (hit.sourceX ?? hit.x));
    fairyWindImpacts.push({ x: hit.x, y: hit.y, angle, startedAt: now });
    if (effectToggles.sparks && effectiveQuality() !== 'low') {
      for (let i = 0; i < 2; i++) addParticle({ x: hit.x, y: hit.y, vx: Math.cos(angle + (i ? 1 : -1)) * 32,
        vy: Math.sin(angle + (i ? 1 : -1)) * 32, radius: 2, color: i ? HERO_FX_SECONDARY.fairy : HERO_FX_COLORS.fairy.primary,
        alpha: 1, startedAt: now, durationMs: FAIRY_WIND_IMPACT_MS, expiresAt: now + FAIRY_WIND_IMPACT_MS });
    }
  }
  // Thorns Fire (and any future aura/repeating source) is pure damage-over-
  // time: it gets a slower flash cadence, no knockback, no sparks and no
  // sound, so an enemy standing in the ring pulses instead of strobing.
  const auraHit = hit.sourceAbility === 'thorns';
  const rangerGoldHit = hit.heroId === 'ranger' && (hit.rangerDeadAim || Number(hit.rangerChargeT) >= 1);
  addDamageNumber({ x: hit.x + (Math.random() - 0.5) * 10, y: hit.y - 12, damage: hit.damage,
    sourceId: hit.sourceId, targetId: hit.id, bonus: hit.bonus || rangerGoldHit,
    color: auraHit ? THORNS_NUMBER_COLOR : rangerGoldHit ? '#FFD75E' : '#fff',
    mergeWindowMs: auraHit ? THORNS_NUMBER_MERGE_MS : null });
  if (rangerArrowHit && effectToggles.sparks && !prefersReducedMotion && effectiveQuality() !== 'low'
    && !isMassKillWindow(now)) {
    const count = engineerFeedbackParticleCount(rangerImpactCount);
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 2 * i / count + Math.random() * 0.25;
      const speed = hit.rangerDeadAim ? 58 + Math.random() * 72 : 30 + Math.random() * 42;
      addParticle({ x: hit.x, y: hit.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 16,
        radius: hit.rangerDeadAim ? 7 : 5, emoji: '🍃', color: HERO_FX_SECONDARY.ranger,
        alpha: 0.95, expiresAt: now + (hit.rangerDeadAim ? 420 : 320) });
    }
  }
  if (hit.id) {
    if (effectToggles.flash) {
      // Per-enemy cooldown: a request inside the window is ignored entirely,
      // so a running flash is never extended or restarted.
      const lastFlashAt = lastEnemyFlashAt.get(hit.id) || 0;
      const flashInterval = auraHit ? THORNS_FLASH_INTERVAL_MS : HIT_FLASH_MIN_INTERVAL_MS;
      if (now - lastFlashAt >= flashInterval) {
        lastEnemyFlashAt.set(hit.id, now);
        enemyHitFlashUntil.set(hit.id, now + ARENA_TUNING.hitFlashMs);
      }
    }
    if (effectToggles.knockback && !auraHit) {
      const direction = Math.atan2(hit.y - (hit.sourceY ?? hit.y), hit.x - (hit.sourceX ?? hit.x));
      const maxDamage = GAME_CONFIG.arenaTuning.damageNumbers.knockbackScaleDamage || 10;
      let amount = ARENA_TUNING.knockback.normalMinPx + (ARENA_TUNING.knockback.normalMaxPx - ARENA_TUNING.knockback.normalMinPx) * Math.min(1, hit.damage / maxDamage);
      if (hit.enemyType === 'brute') amount *= ARENA_TUNING.knockback.bruteMultiplier;
      if (hit.enemyType === 'brute-king') amount *= ARENA_TUNING.knockback.kingMultiplier;
      enemyHitFx.set(hit.id, { x: Math.cos(direction) * amount, y: Math.sin(direction) * amount, startedAt: now, durationMs: ARENA_TUNING.knockback.visualMs });
    }
  }
  // Camera kick when YOUR hit connects - attacks used to feel weak because
  // weapon hits produced no shake at all. Damage-scaled, rate-limited, and
  // silent during a mass-kill window (that window plays its single shake).
  if (hit.sourceId === me && !isMassKillWindow(now) && now - lastHitShakeAt >= SHAKE_HIT_MIN_INTERVAL_MS) {
    lastHitShakeAt = now;
    const scale = 0.6 + 0.4 * Math.min(1, (Number(hit.damage) || 0) / SHAKE_HIT_DAMAGE_REFERENCE);
    shakeCamera(SHAKE_HIT_TRAUMA * scale);
  }
  // Impact sparks are the first thing adaptive quality drops; they are pure
  // decoration and never affect gameplay. During a mass-kill window they are
  // skipped entirely: 40+ simultaneous hits would each spawn ~3 sparks, and
  // the window's single big puff already carries the feedback. Aura damage
  // (Thorns) never spawns sparks at all.
  if (effectToggles.sparks && !auraHit && effectiveQuality() === 'high' && !isMassKillWindow(performance.now())) {
    for (let i = 0; i < ARENA_TUNING.impactSparks.particlesMin + Math.floor(Math.random() * (ARENA_TUNING.impactSparks.particlesMax - ARENA_TUNING.impactSparks.particlesMin + 1)); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 60;
      addParticle({
        x: hit.x,
        y: hit.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 2,
        color: Math.random() > 0.4 ? (fx.primary || '#fff') : (fx.highlight || '#fff'),
        alpha: 1,
        startedAt: performance.now(),
        expiresAt: performance.now() + ARENA_TUNING.impactSparks.durationMs,
      });
    }
  }
  if (effectToggles.sound && !auraHit) playSound('hit');
}
function handleMonsterKilled(data) {
  const fx = HERO_FX_COLORS[data.heroId] || {};
  const now = performance.now();
  const turretKill = data.sourceAbility === 'turret';
  const wolfKill = data.sourceAbility === 'wolf';
  // Kill-path budget: crossing KILL_BURST_THRESHOLD within the window makes
  // this kill the window's single big puff + sound + shake.
  const noCombo = turretKill || wolfKill;
  const announceMass = noCombo ? false : registerKill(now);
  const massWindow = noCombo ? false : isMassKillWindow(now);
  if (!noCombo) updateKillStreak(data.sourceId, announceMass);
  // A boss kill is the one moment that earns the banner + fanfare + confetti.
  if (data.boss) celebrateBossDefeat();
  if (effectToggles.burst) {
    if (announceMass) {
      spawnMassKillPuff(data.x, data.y, fx);
    } else if (massWindow) {
      // Reduced mode: no per-kill sprite, burst or number.
    } else if (burstsThisFrame < MAX_BURSTS_PER_FRAME) {
      burstsThisFrame += 1;
      const direction = Math.atan2(data.y - (data.sourceY ?? data.y), data.x - (data.sourceX ?? data.x));
    const killPush = ARENA_TUNING.knockback.killPx * (data.enemyType === 'brute' ? ARENA_TUNING.knockback.bruteMultiplier : data.enemyType === 'brute-king' ? ARENA_TUNING.knockback.kingMultiplier : 1);
    deathSprites.push({ x: data.x + Math.cos(direction) * killPush, y: data.y + Math.sin(direction) * killPush, emoji: data.emoji || '💀', startedAt: performance.now(),
      durationMs: ARENA_TUNING.deathBurst.durationMinMs + Math.floor(Math.random() * (ARENA_TUNING.deathBurst.durationMaxMs - ARENA_TUNING.deathBurst.durationMinMs + 1)),
      scalePeak: ARENA_TUNING.deathBurst.scalePeak });
    const fragmentCount = ARENA_TUNING.deathBurst.particlesMin + Math.floor(Math.random() * (ARENA_TUNING.deathBurst.particlesMax - ARENA_TUNING.deathBurst.particlesMin + 1));
    for (let i = 0; i < fragmentCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 90;
      const lifeMs = ARENA_TUNING.deathBurst.durationMinMs + Math.floor(Math.random() * (ARENA_TUNING.deathBurst.durationMaxMs - ARENA_TUNING.deathBurst.durationMinMs + 1));
      addParticle({
        x: data.x,
        y: data.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 2.5,
        color: Math.random() > 0.5 ? (fx.primary || '#81c784') : (fx.highlight || '#4caf50'),
        emoji: data.emoji || '✨',
        alpha: 1,
        startedAt: now,
        durationMs: lifeMs,
        expiresAt: now + lifeMs,
      });
    }
    } else {
      // Over the per-frame burst budget: a single cheap puff, no glyph sprite.
      addParticle({ x: data.x, y: data.y, vx: 0, vy: -18, radius: 3, color: fx.primary || '#81c784',
        alpha: 1, startedAt: now, durationMs: 240, expiresAt: now + 240 });
    }
  }
  if ((wolfKill || !turretKill) && effectToggles.sound && (data.sourceId !== me || wolfKill)) {
    if (wolfKill) { playSound('kill', { volume: 0.5 }); }
    else
    // One louder sound for the whole mass-kill window, normal sound otherwise.
    if (announceMass) playSound('kill', { volume: 0.9 });
    else if (!massWindow) playSound('kill', { volume: 0.5 });
  }
  // Extra camera kick on YOUR killing blow (stacks with the hit kick toward a
  // boss-slam-sized moment). The mass window already plays its single shake.
  if (!turretKill && data.sourceId === me && !massWindow) shakeCamera(SHAKE_KILL_TRAUMA);
}
// The server batches hit and kill events into one message per tick; a payload
// is either a single event (low volume, e.g. the training dummy) or an array
// (mass kills). Both shapes run through the same handlers.
socket.on('hit', (payload) => {
  if (Array.isArray(payload)) { for (let i = 0; i < payload.length; i += 1) handleHit(payload[i]); }
  else handleHit(payload);
});
socket.on('monster_killed', (payload) => {
  if (Array.isArray(payload)) { for (let i = 0; i < payload.length; i += 1) handleMonsterKilled(payload[i]); }
  else handleMonsterKilled(payload);
});

// Debug-only measurement hook (only present with ?profiler=1). Replays the
// client kill path so each effect's frame cost can be isolated. It never runs
// in normal play and does not change game state beyond the effect arrays.
if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('profiler')) {
  // Measurement harness only: make damage numbers spawn so their draw cost is
  // observable. Normal play keeps the user's saved setting.
  try { settings.damageNumbers = true; } catch { /* settings may be read-only */ }
  window.__heroLabKillTest = {
    simulateKills(n = 40) {
      for (let i = 0; i < n; i += 1) {
        const angle = (i / n) * Math.PI * 2;
        const x = 400 + Math.cos(angle) * 110;
        const y = 300 + Math.sin(angle) * 110;
        handleHit({ x, y, damage: 12, sourceId: me, id: `sim_${i}`, enemyType: 'zombie', heroId: activeHeroId, sourceX: 400, sourceY: 300, bonus: false });
        handleMonsterKilled({ x, y, sourceId: me, emoji: '👹', enemyType: 'zombie', heroId: activeHeroId, sourceX: 400, sourceY: 300 });
      }
    },
    simulateHits(n = 1, damage = 12, sourceId = me, options = {}) {
      const targetId = options.targetId || null;
      const sourceAbility = options.sourceAbility || 'weapon';
      for (let i = 0; i < n; i += 1) {
        const angle = (i / Math.max(1, n)) * Math.PI * 2;
        const x = 400 + Math.cos(angle) * 110;
        const y = 300 + Math.sin(angle) * 110;
        handleHit({ x, y, damage, sourceId, id: targetId || `simhit_${i}_${performance.now()}`, enemyType: 'zombie', heroId: activeHeroId, sourceX: 400, sourceY: 300, bonus: false, sourceAbility });
      }
    },
    // Read-only: the timestamp until which an enemy's hit flash is active (0 =
    // none). Lets a test observe whether a flash request was suppressed by the
    // per-enemy cooldown.
    flashUntil(id) {
      return enemyHitFlashUntil.get(id) || 0;
    },
    // Replays the real telegraph/detonation path so ring rendering cost can be
    // measured with several markers on screen.
    simulateAreaEffects(n = 4, radius = 130, kind = 'enemy', telegraphMs = 600) {
      for (let i = 0; i < n; i += 1) {
        const angle = (i / Math.max(1, n)) * Math.PI * 2;
        showAreaEffect({ x: 500 + Math.cos(angle) * 150, y: 400 + Math.sin(angle) * 150, radius, kind, telegraphMs, sourceAbility: 'enemy-slam' });
      }
    },
    clearEffects() {
      particles.length = 0; dustPuffs.length = 0;
      damageTexts.length = 0;
      deathSprites.length = 0;
      damageNumberMerge.clear();
      enemyHitFlashUntil.clear();
      lastEnemyFlashAt.clear();
      enemyHitFx.clear();
    },
    // Times the render pass directly (bypassing requestAnimationFrame, which
    // headless Chromium throttles) so each scenario's draw cost is measured
    // consistently. Returns the average milliseconds per drawScene call.
    measureRender(iterations = 60) {
      let sum = 0;
      for (let i = 0; i < iterations; i += 1) {
        const startedAt = performance.now();
        drawScene(performance.now());
        sum += performance.now() - startedAt;
      }
      return sum / iterations;
    },
    counts() {
      return { particles: particles.length, numbers: damageTexts.length, sprites: deathSprites.length, budget: particleBudget };
    },
    // Boss celebration probe: runs the real kill path with boss=true so the
    // gold banner, the fanfare and the screen-space confetti can be inspected.
    simulateBossKill(x = ARENA_WIDTH / 2, y = ARENA_HEIGHT / 2) {
      handleMonsterKilled({ id: 'sim_boss', x, y, sourceId: me, emoji: '👑', enemyType: 'brute-king',
        heroId: activeHeroId, sourceX: x, sourceY: y, boss: true });
    },
    confetti() {
      return {
        count: confetti.length,
        banner: momentBanner ? momentBanner.textContent : null,
        bannerBoss: momentBanner ? momentBanner.classList.contains('boss') : false,
        bannerGold: momentBanner ? momentBanner.classList.contains('gold') : false,
        bannerHidden: momentBanner ? momentBanner.hidden : true,
      };
    },
    // Read-only view of the canvas-drawn feedback above a hero: the "it's back"
    // bounce (🧨 Dynamite, 🤖 Mech Suit) and the cooldown-refund popup. Both are
    // painted, not DOM, so this is how they are verified.
    aboveHero() {
      const now = performance.now();
      return {
        ready: [...readyBounces.entries()].map(([playerId, value]) => ({
          playerId, emoji: value.emoji, ageMs: Math.round(now - value.at),
        })),
        refunds: [...refundPopups.entries()].map(([playerId, value]) => ({
          playerId, totalMs: value.totalMs, ageMs: Math.round(now - value.startedAt),
        })),
      };
    },
    // Test-only quality switch, so the confetti scaling can be measured.
    setQuality(value) {
      settings.effectsQuality = value;
      applyEffectsQuality();
      return effectiveQuality();
    },
    // Read-only view of the adaptive-quality state (Auto level + live budget).
    quality() {
      return { setting: settings.effectsQuality, effective: effectiveQuality(), budget: particleBudget, massKillWindow: isMassKillWindow(performance.now()) };
    },
    // Read-only view of the camera-shake state, so the hit/kill kick can be
    // verified without eyeballing pixels. offsetPx mirrors the live formula
    // (trauma^2 * SHAKE_MAX_OFFSET * slider / 50, hard-capped in px).
    shake() {
      const now = performance.now();
      return {
        trauma: Math.round(trauma * 1000) / 1000,
        offsetPx: Math.round(Math.min(SHAKE_ABSOLUTE_CAP_PX,
          trauma * trauma * SHAKE_MAX_OFFSET * settings.shakeIntensity / SHAKE_SLIDER_REFERENCE) * 100) / 100,
        screenShake: settings.screenShake,
        intensity: settings.shakeIntensity,
        toggle: effectToggles.shake,
        massWindow: isMassKillWindow(now),
      };
    },
    // Test-only: move the shake slider so the re-scaled ladder (50% = old
    // 100%) can be verified end to end.
    setShakeIntensity(value) {
      settings.shakeIntensity = Math.max(SHAKE_MIN_INTENSITY, Math.min(SHAKE_MAX_INTENSITY, Number(value)));
      return settings.shakeIntensity;
    },
    // Fill a fixed number of each effect entity so the render cost of each type
    // can be calibrated independently of the kill burst's randomness. When
    // `plain` is true the particles use a solid arc (like impact sparks)
    // instead of an emoji glyph (like death-burst fragments).
    fillParticles(n, plain = false) {
      particles.length = 0;
      const now = performance.now();
      for (let i = 0; i < n; i += 1) {
        const p = { x: 120, y: 120, vx: 0, vy: 0, radius: 3, color: '#fff', alpha: 1, startedAt: now, durationMs: 5e5, expiresAt: now + 5e5 };
        if (!plain) p.emoji = '✨';
        particles.push(p);
      }
    },
    fillNumbers(n) {
      damageTexts.length = 0;
      const now = performance.now();
      for (let i = 0; i < n; i += 1) damageTexts.push({ text: '12', x: 120, y: 120, bonus: false, sourceId: me, targetId: `t${i}`, color: '#fff', startedAt: now, durationMs: 5e5, expiresAt: now + 5e5 });
    },
    fillSprites(n) {
      deathSprites.length = 0;
      const now = performance.now();
      for (let i = 0; i < n; i += 1) deathSprites.push({ x: 120, y: 120, emoji: '💀', startedAt: now, durationMs: 5e5, scalePeak: 1.6 });
    },
    // Keep any freshly spawned effect entities alive through the measurement so
    // drawScene neither culls nor animates them away while we time it.
    freezeLife() {
      const now = performance.now();
      for (const part of particles) { part.startedAt = now; part.durationMs = 5e5; part.expiresAt = now + 5e5; part.alpha = 1; }
      for (const dtObj of damageTexts) { dtObj.startedAt = now; dtObj.durationMs = 5e5; dtObj.expiresAt = now + 5e5; }
      for (const sprite of deathSprites) { sprite.startedAt = now; sprite.durationMs = 5e5; }
    },
    // Median of several warmup+timed runs, to damp GC/JIT noise. Median (not
    // best) keeps an inverted outlier from masking a real effect-cost delta.
    measureRenderMedian(iterations = 60, runs = 5) {
      const samples = [];
      for (let r = 0; r < runs; r += 1) {
        // Warmup pass (discard) to settle font caches / JIT.
        for (let i = 0; i < 10; i += 1) drawScene(performance.now());
        const startedAt = performance.now();
        for (let i = 0; i < iterations; i += 1) drawScene(performance.now());
        samples.push((performance.now() - startedAt) / iterations);
      }
      samples.sort((a, b) => a - b);
      return samples[Math.floor(samples.length / 2)];
    },
  };

  // Debug-only: all six heroes' button clusters in a row with the real
  // colours, so every type family and highlight slot is checkable at a
  // glance. The toggle lives in the Settings panel and only exists here.
  const hudDebugRow = document.querySelector('#hud-debug-clusters');
  const hudDebugLabel = document.createElement('label');
  hudDebugLabel.innerHTML = '<input id="hud-debug-setting" type="checkbox"> Show all hero HUD clusters';
  const hudDebugTools = document.createElement('details');
  hudDebugTools.className = 'debug-section hud-debug-tools';
  hudDebugTools.innerHTML = '<summary>HUD preview</summary><div class="debug-section-body"></div>';
  (settingsPanel.querySelector('.debug-menu') || settingsPanel).append(hudDebugTools);
  const hudDebugBody = hudDebugTools.querySelector('.debug-section-body');
  hudDebugBody.append(hudDebugLabel);
  const hudDebugInput = hudDebugLabel.querySelector('input');
  const hudDebugHeroes = HEROES.map((hero) => {
    const column = document.createElement('div');
    column.className = 'hud-debug-hero';
    const title = document.createElement('strong');
    title.textContent = hero.name;
    const cluster = document.createElement('div');
    cluster.className = 'hud-debug-cluster';
    const buttons = [['weapon', 'M1'], ['skill', 'E'], ['ultimate', 'Q']].map(([ability, key]) => {
      const button = document.createElement('div');
      button.className = 'ability';
      button.dataset.ability = ability;
      const circle = document.createElement('span');
      circle.className = 'ability-circle';
      circle.append(Object.assign(document.createElement('span'), { className: 'ability-icon' }));
      const label = document.createElement('span');
      label.className = 'ability-key';
      label.textContent = key;
      button.append(circle, label);
      cluster.append(button);
      return { ability, circle, button };
    });
    column.append(title, cluster);
    hudDebugRow.append(column);
    return { hero, buttons };
  });
  for (const { hero, buttons } of hudDebugHeroes) {
    applyClusterIcons(hero.id, false, buttons.map((entry) => entry.button));
    for (const { ability, circle } of buttons) {
      circle.style.setProperty('--fill-color', heroButtonColor(hero.id, hero.type, ABILITY_SLOT[ability], false));
      circle.style.setProperty('--fill', '100%');
    }
  }
  const setHudDebugVisible = (visible) => {
    hudDebugRow.hidden = !visible;
    hudDebugInput.checked = visible;
  };
  hudDebugInput.addEventListener('change', () => setHudDebugVisible(hudDebugInput.checked));
  window.__heroLabHudDebug = {
    show: () => setHudDebugVisible(true),
    hide: () => setHudDebugVisible(false),
    toggle: () => setHudDebugVisible(hudDebugRow.hidden),
  };
}
socket.on('area_telegraph', (effect) => showAreaEffect({ ...effect, telegraphMs: effect.telegraphMs || ARENA_TUNING.areaEffects.targetedTelegraphMs }));
socket.on('area_telegraph_cancel', ({ sourceAbility } = {}) => {
  const index = areaEffects.findLastIndex((effect) => effect.phase === 'telegraph' && effect.sourceAbility === sourceAbility);
  if (index >= 0) areaEffects.splice(index, 1);
});
socket.on('area_effect', (effect) => {
  showAreaEffect(effect);
  if (effect.sourceHeroId === 'fairy' && effect.sourceAbility === 'skill') {
    if (effectToggles.sound) playSound('fairyWhoosh');
    for (const hit of effect.hits || []) fairyPushStreaks.push({ ...hit, startedAt: performance.now() });
    return;
  }
  const rangerDeadAimBlast = effect.sourceHeroId === 'ranger' && effect.sourceAbility === 'ultimate';
  if (effectToggles.sound) playSound(rangerDeadAimBlast ? 'explosion' : effect.sourceAbility === 'ultimate' ? 'ultimateCast' : 'explosion');
  const burstColors = rangerDeadAimBlast ? ['#FFF8D8', '#FFD75E', '#F0DDA0', '#8BE04E'] : null;
  const rangerBurstCount = !rangerDeadAimBlast || prefersReducedMotion || !effectToggles.burst ? 0
    : effectiveQuality() === 'low' ? 6 : effectiveQuality() === 'medium' ? 16 : 32;
  for (let i = 0; i < (rangerDeadAimBlast ? rangerBurstCount : 20); i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rangerDeadAimBlast ? 70 + Math.random() * 190 : 30 + Math.random() * 130;
    addParticle({ x: effect.x, y: effect.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius: rangerDeadAimBlast ? 3 + Math.random() * 4 : 2 + Math.random() * 3,
      color: burstColors?.[Math.floor(Math.random() * burstColors.length)] || effect.color || '#ff9c45', alpha: 1,
      expiresAt: performance.now() + ARENA_TUNING.areaEffects.detonationMs });
  }
  // Guardian fan: a small push-impact spark at each enemy the shockwave shoved.
  if (Array.isArray(effect.hits)) {
    const dur = effect.durationMs || ARENA_TUNING.areaEffects.detonationMs;
    for (const hit of effect.hits) {
      for (let i = 0; i < 6; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 20 + Math.random() * 60;
        addParticle({ x: hit.x, y: hit.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          radius: 2, color: effect.color || '#ff9c45', alpha: 0.95, decay: 0.08, expiresAt: performance.now() + dur });
      }
    }
  }
});
socket.on('lightning_chain', (arc) => lightningArcs.push({ ...arc, expires: performance.now() + GAME_CONFIG.visuals.lightningArcMs,
  color: HERO_FX_COLORS.electromancer.highlight }));
socket.on('electro_chain_refund', (event) => {
  const now = performance.now();
  chainCounters.set(event.playerId, { count: event.hitCount, startedAt: now });
  addParticle({ x: event.x, y: event.y, vx: 0, vy: -16, radius: 4,
    color: HERO_FX_COLORS.electromancer.highlight, alpha: 1, decay: 0.08, expiresAt: now + 300 });
  if (event.playerId === me && event.cooldownRefilled) showElectroOverload(event);
});
socket.on('dynamite_ready', ({ playerId }) => {
  readyBounces.set(playerId, { at: performance.now(), emoji: '🧨' });
  if (playerId === me) {
    playSound('dynamiteReady');
    const circle = sheriffSkillAbility.querySelector('.ability-circle');
    circle.classList.add('dynamite-ready-pulse');
    setTimeout(() => circle.classList.remove('dynamite-ready-pulse'), ARENA_TUNING.heroTweaks.sheriffReadyRingMs);
  }
});
// Pilot's Mech Suit coming back: the same emoji bounce, with a robot instead of
// dynamite. The generic ready ring/sound already fires from the HUD cooldown
// sweep, so this only adds the bounce (no second sound).
socket.on('mech_ready', ({ playerId }) => {
  readyBounces.set(playerId, { at: performance.now(), emoji: '🤖' });
});
// Talent refund popup, shared by Sheriff's Quick Draw and Pilot's Adrenaline.
function showRefundPopup(playerId, refundMs) {
  if (playerId !== me) return;
  const now = performance.now();
  // Merge rapid refunds (one blast / one chain can refund several kills) into
  // one running total, exactly as the old HUD label did.
  if (!refundPopupState || now > refundPopupState.mergeUntil) {
    refundPopupState = { totalMs: 0, startedAt: now };
  }
  refundPopupState.totalMs += refundMs;
  refundPopupState.mergeUntil = now + ARENA_TUNING.heroTweaks.sheriffRefundMergeMs;
  refundPopups.set(playerId, {
    totalMs: refundPopupState.totalMs,
    startedAt: refundPopupState.startedAt,
  });
}
socket.on('sheriff_cooldown_refund', (event) => {
  showRefundPopup(event.playerId, event.refundMs);
  if (event.playerId !== me) return;
  // The button ring still pulses so the player links the popup to Dynamite.
  const circle = sheriffSkillAbility.querySelector('.ability-circle');
  circle.classList.remove('cooldown-refund-pulse');
  void circle.offsetWidth;
  circle.classList.add('cooldown-refund-pulse');
});
socket.on('pilot_cooldown_refund', (event) => {
  showRefundPopup(event.playerId, event.refundMs);
  if (event.playerId !== me) return;
  // Same linkage on the Mech Suit button.
  const circle = ultimateAbility.querySelector('.ability-circle');
  if (!circle) return;
  circle.classList.remove('cooldown-refund-pulse');
  void circle.offsetWidth;
  circle.classList.add('cooldown-refund-pulse');
});
socket.on('ranger_cooldown_refund', (event) => {
  showRefundPopup(event.playerId, event.refundMs);
  readyBounces.set(event.playerId, { at: performance.now(), emoji: '🐺' });
  if (event.playerId !== me) return;
  const circle = sheriffSkillAbility?.querySelector('.ability-circle');
  if (!circle) return;
  circle.classList.remove('cooldown-refund-pulse');
  void circle.offsetWidth;
  circle.classList.add('cooldown-refund-pulse');
});
socket.on('lightning_flash', (flash) => enemyFlashes.set(flash.id, performance.now() + GAME_CONFIG.visuals.enemyFlashMs));
socket.on('ricochet_line', (arc) => lightningArcs.push({ ...arc, expires: performance.now() + GAME_CONFIG.arenaTuning.cards.effects.ricochetLineMs,
  color: HERO_FX_COLORS[arc.heroId]?.primary || '#fff' }));
socket.on('overcharge', ({ playerId, count }) => {
  if (playerId === me) damageTexts.push({ x: window.lastPointerWorld?.x || 0, y: (window.lastPointerWorld?.y || 0) - 26,
    text: `OVERCHARGE ${count}`, alpha: 1, vy: -20, color: '#ffe34f', scale: 1.3 });
  playSound('shoot', { volume: playerId === me ? 0.9 : 0.55, semitones: 3 });
});
socket.on('pickup_collected', (pickup) => {
  addParticle({ x: pickup.x, y: pickup.y - 14, vx: 0, vy: -30, radius: 10, color: '#7af29a', text: `+${Math.round(pickup.amount)}`, alpha: 1, decay: 0.03 });
  playSound('pickup');
});
socket.on('life_steal', (heal) => addParticle({ x: heal.x, y: heal.y - 22, vx: 0, vy: -25, radius: 10,
  color: '#88ff9c', text: `+${Math.round(heal.amount)}`, alpha: 1, decay: 0.03 }));
socket.on('second_wind', () => { showBanner('SECOND WIND'); playSound('explosion'); shakeCamera(SHAKE_ULTIMATE_TRAUMA, 'major'); });
socket.on('dash_extended', (popup) => {
  if (popup.id === me) damageTexts.push({ x: popup.x, y: popup.y - 36, text: `+${(popup.ms / 1000).toFixed(1)}s`, alpha: 1, vy: -28, color: '#a6ffb4' });
});

function addOrUpdateProjectile(data) {
  if (clientProjectiles.has(data.id)) {
    const existing = clientProjectiles.get(data.id);
    existing.x += (data.x - existing.x) * 0.4;
    existing.y += (data.y - existing.y) * 0.4;
    existing.vx = data.vx;
    existing.vy = data.vy;
    if (Number.isFinite(data.distanceTravelled)) existing.distanceTravelled = Math.max(existing.distanceTravelled, data.distanceTravelled);
    return;
  }
  const ProjectileClass = data.kind === 'enemy' ? EnemyProjectile : Projectile;
  const projectile = new ProjectileClass({
    id: data.id,
    x: data.x,
    y: data.y,
    vx: data.vx,
    vy: data.vy,
    radius: data.radius || 10,
    color: data.color || '#ff2d20',
    emoji: data.emoji,
    rotateToAim: data.rotateToAim,
    flashColors: data.flashColors,
    flashIntervalMs: data.flashIntervalMs,
    rangerDeadAim: data.rangerDeadAim,
    rangerChargeT: data.rangerChargeT,
    maxDistance: data.maxDistance,
    distanceTravelled: data.distanceTravelled,
    shape: data.shape,
    sourceAbility: data.sourceAbility,
    lifetimeMs: data.lifetimeMs,
    fadeLastFraction: data.fadeLastFraction,
    type: data.type,
    createdAt: data.createdAt || Date.now(),
  });
  clientProjectiles.set(data.id, projectile);
  if (data.sourceAbility === 'weapon') {
    const owner = state.players.find((player) => player.id === data.ownerId);
    if (owner) showMuzzleFlash(owner);
  }
  // Muzzle spark flash
  for (let i = 0; i < 6; i++) {
    const angle = Math.atan2(data.vy, data.vx) + (Math.random() - 0.5) * 0.9;
    const speed = 40 + Math.random() * 80;
    addParticle({
      x: data.x,
      y: data.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1.5 + Math.random() * 2,
      color: data.flashColors?.[Math.floor(Math.random() * data.flashColors.length)] || data.color || '#ffea00',
      alpha: 1,
      decay: 0.05 + Math.random() * 0.04,
    });
  }
}

function sendMovement() {
  const next = Object.fromEntries(Object.keys(keys).map((key) => [key, Boolean(keys[key] || stickKeys[key])]));
  if (!socket.connected || (lastSentMovement && Object.keys(next).every((key) => next[key] === lastSentMovement[key]))) return;
  lastSentMovement = next;
  socket.emit('input', next);
}

function releaseKeys() {
  for (const key of Object.keys(keys)) { keys[key] = false; stickKeys[key] = false; }
  movementPointerId = null;
  movementStick?.style.setProperty('--stick-x', '0px');
  movementStick?.style.setProperty('--stick-y', '0px');
  sendMovement();
  if (primaryPointerId !== null) {
    primaryPointerId = null;
    setPrimaryHeld(false);
  }
}

function onMovementPointerDown(event) {
  if (movementPointerId !== null || !me) return;
  event.preventDefault();
  movementPointerId = event.pointerId;
  movementStick.setPointerCapture?.(event.pointerId);
  updateMovementStick(event);
}

function updateMovementStick(event) {
  if (event.pointerId !== movementPointerId) return;
  const base = movementStick.querySelector('.virtual-stick-base');
  const knob = movementStick.querySelector('.virtual-stick-knob');
  if (!base || !knob) return;
  const rect = base.getBoundingClientRect();
  const max = rect.width * .34;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let dx = event.clientX - cx;
  let dy = event.clientY - cy;
  const length = Math.hypot(dx, dy);
  if (length > max) { dx *= max / length; dy *= max / length; }
  const nx = dx / max;
  const ny = dy / max;
  movementStick.style.setProperty('--stick-x', `${dx}px`);
  movementStick.style.setProperty('--stick-y', `${dy}px`);
  stickKeys.up = ny < -.22;
  stickKeys.down = ny > .22;
  stickKeys.left = nx < -.22;
  stickKeys.right = nx > .22;
  sendMovement();
}

function onMovementPointerEnd(event) {
  if (event.pointerId !== movementPointerId) return;
  movementPointerId = null;
  for (const key of Object.keys(stickKeys)) stickKeys[key] = false;
  movementStick.style.setProperty('--stick-x', '0px');
  movementStick.style.setProperty('--stick-y', '0px');
  sendMovement();
}

function getPointerCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  const camera = mobileCameraView();
  if (camera) {
    return {
      x: camera.x + (event.clientX - rect.left - rect.width / 2) / camera.scale,
      y: camera.y + (event.clientY - rect.top - rect.height / 2) / camera.scale,
    };
  }
  return {
    x: ((event.clientX - rect.left) / rect.width) * ARENA_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * ARENA_HEIGHT,
  };
}

function fireWeapon(mode, target = window.lastPointerWorld) {
  if (!me || !socket.connected) return;
  const player = state.players.find((candidate) => candidate.id === me);
  if (mode === 'primary' && player?.heroId === 'engineer' && engineerPlacementTargeting) {
    confirmEngineerPlacement(target);
    return;
  }
  if (mode === 'primary' && player?.heroId === 'ranger' && rangerMeatTargeting) {
    confirmRangerMeatPlacement(target);
    return;
  }
  if (mode === 'secondary') {
    if (target) socket.emit('fire', mode, target);
    return;
  }
  // Shield Rush: M1 cancels the dash into the fan instead of firing Shield
  // Bash, so that click gets no muzzle flash and no shot sound.
  if (player && !player.rushDashing) {
    showMuzzleFlash(player);
    playSound(player.heroId === 'fairy' || player.heroId === 'engineer' ? 'fairyWhoosh' : 'shoot', { pitchVariance: ARENA_TUNING.sound.shotPitchVariance });
  }
  socket.emit('fire', mode);
}

function sendAimVector(x, y, immediate = false) {
  if (!socket.connected || !me || Math.hypot(x, y) < 0.001) return;
  pendingAbilityAim = { x, y };
  const send = () => {
    if (!pendingAbilityAim || !socket.connected || !me) return;
    const aim = pendingAbilityAim;
    pendingAbilityAim = null;
    socket.emit('aim', aim);
    lastAimSentAt = performance.now();
  };
  if (immediate) {
    clearTimeout(abilityAimTimer);
    abilityAimTimer = null;
    send();
    return;
  }
  if (abilityAimTimer !== null) return;
  const delay = Math.max(0, ARENA_TUNING.performance.aimUpdateMs - (performance.now() - lastAimSentAt));
  if (delay === 0) { send(); return; }
  abilityAimTimer = setTimeout(() => { abilityAimTimer = null; send(); }, delay);
}

function sendCurrentAim() {
  const player = state.players?.find((candidate) => candidate.id === me);
  const aim = player?.aim;
  if (aim && Number.isFinite(aim.x) && Number.isFinite(aim.y)) sendAimVector(aim.x, aim.y, true);
}

function activateAbility(slot) {
  const local = state.players?.find((player) => player.id === me);
  if (slot === 'skill' && local?.heroId === 'engineer') {
    toggleEngineerPlacementTargeting();
    return;
  }
  if (slot === 'skill' && local?.heroId === 'ranger') {
    toggleRangerMeatTargeting();
    return;
  }
  sendCurrentAim();
  if (slot === 'skill') socket.emit('skill', ['engineer', 'ranger'].includes(local?.heroId) ? window.lastPointerWorld : undefined);
  else socket.emit('ultimate');
}

function toggleEngineerPlacementTargeting() {
  const player = state.players?.find((candidate) => candidate.id === me);
  if (!player || player.heroId !== 'engineer' || player.downed) return;
  if (engineerPlacementTargeting) {
    engineerPlacementTargeting = false;
    targetingReticle.hidden = true;
    return;
  }
  const skill = player.abilities?.skill;
  if (Math.max(0, (skill?.remainingMs || 0) - (performance.now() - stateReceivedAt)) > 0) return;
  engineerPlacementTargeting = true;
}

function confirmEngineerPlacement(target = window.lastPointerWorld) {
  if (!engineerPlacementTargeting) return false;
  engineerPlacementTargeting = false;
  targetingReticle.hidden = true;
  socket.emit('skill', target || null);
  return true;
}

function toggleRangerMeatTargeting() {
  const player = state.players?.find((candidate) => candidate.id === me);
  if (!player || player.heroId !== 'ranger' || player.downed) return;
  if (rangerMeatTargeting) {
    rangerMeatTargeting = false;
    return;
  }
  const skill = player.abilities?.skill;
  if (Math.max(0, (skill?.remainingMs || 0) - (performance.now() - stateReceivedAt)) > 0) return;
  rangerMeatTargeting = true;
}

function confirmRangerMeatPlacement(target = window.lastPointerWorld) {
  if (!rangerMeatTargeting) return false;
  rangerMeatTargeting = false;
  socket.emit('skill', target || null);
  return true;
}

// The server repeats the shot for as long as this flag is true, so every hero
// fires continuously while the button is held. The first shot is still sent
// immediately as a normal 'fire' event so it does not wait for a tick.
function setPrimaryHeld(held) {
  if (socket.connected) socket.emit('primary_hold', Boolean(held));
}

function onPointerMove(event) {
  if (pinchStart) return;
  const pointer = getPointerCoordinates(event);
  window.lastPointerWorld = pointer;
  if (!socket.connected || !me || aimSendTimer !== null) return;
  const delay = Math.max(0, ARENA_TUNING.performance.aimUpdateMs - (performance.now() - lastAimSentAt));
  aimSendTimer = setTimeout(() => {
    aimSendTimer = null;
    const player = state.players.find((candidate) => candidate.id === me);
    if (!socket.connected || !player || !window.lastPointerWorld) return;
    socket.emit('aim', { x: window.lastPointerWorld.x - player.x, y: window.lastPointerWorld.y - player.y });
    lastAimSentAt = performance.now();
  }, delay);
}

function onKeyDown(event) {
  if (!me || event.target.closest?.('input, textarea, select')) return;
  const key = codeToKey[event.code];
  if (key) {
    if (!keys[key]) {
      keys[key] = true;
      sendMovement();
    }
    event.preventDefault();
  } else if (event.code === 'KeyE' && !event.repeat) {
    activateAbility('skill');
  } else if (event.code === 'KeyQ' && !event.repeat) {
    activateAbility('ultimate');
  } else if (event.code === 'KeyI' && !event.repeat) {
    toggleStats();
  } else if (event.code === 'Escape' && !event.repeat) {
    // Esc closes the info panel first, then cancels any Bombardier targeting.
    if (!statsPanel.hidden) closeStats();
    else cancelTargeting();
  }
}

function toggleStats() {
  if (statsPanel.hidden) openStats(); else closeStats();
}

function openStats() {
  statsPanel.hidden = false;
  infoButton.setAttribute('aria-expanded', 'true');
}

function closeStats() {
  statsPanel.hidden = true;
  infoButton.setAttribute('aria-expanded', 'false');
}

infoButton.addEventListener('click', toggleStats);
infoCloseButton.addEventListener('click', (event) => { event.stopPropagation(); closeStats(); });

let roomCodeCopiedTimer = null;

function showToast(message, heroId = null, emoji = '') {
  if (!toastStack || !message) return;
  while (toastStack.children.length >= 4) toastStack.firstElementChild.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  const icon = createHeroImage(heroId, emoji, 24);
  if (icon) toast.append(icon, document.createTextNode(message));
  else toast.textContent = message;
  toastStack.append(toast);
  setTimeout(() => toast.classList.add('fade'), 2600);
  setTimeout(() => toast.remove(), 3000);
}

roomCodeButton?.addEventListener('click', async () => {
  const code = state.room?.code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    // Clipboard access can be blocked inside the embedded frame.
    const area = document.createElement('textarea');
    area.value = code;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try { document.execCommand('copy'); } catch { /* clipboard unavailable */ }
    area.remove();
  }
  roomCodeCopied.hidden = false;
  clearTimeout(roomCodeCopiedTimer);
  roomCodeCopiedTimer = setTimeout(() => { roomCodeCopied.hidden = true; }, 1500);
});

// Unified player roster inside #hero-hud (top-left). Every player in the
// room — local player first, then others — with display name + HP bar.
// Downed rows are greyed with a respawn timer; WAITING players show a
// "joining" tag instead of an HP bar. The roster combines:
//   room.players  — roster entries (id, name, host, waiting, disconnected)
//   room.waiting  — joining entries (no gameplay data yet)
//   state.players — gameplay data (hp, maxHp, downed, respawn)
// The label is the account display name, NOT the hero/class name.
// The roster mark shows the player's pin (or hat) with the same shared art the
// Kingdom, World, Duel and Castle mirror use. IDs without shared art are ignored.
const AVATAR_MARK_PX = 13;
function avatarMarkLabel(id) {
  return id.replace(/^(hat|accessory)_/, '').replace(/_/g, ' ');
}
function fillAvatarMark(mark, visual) {
  const hat = cosmeticArt(visual.hat, 'hat') ? visual.hat : null;
  const accessory = cosmeticArt(visual.accessory, 'accessory') ? visual.accessory : null;
  const shown = accessory || hat;
  mark.title = [hat, accessory].filter(Boolean).map(avatarMarkLabel).join(', ') || 'Player avatar';
  if (!shown) { mark.textContent = '•'; return; }
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const icon = document.createElement('canvas');
  icon.width = icon.height = Math.round(AVATAR_MARK_PX * dpr);
  icon.style.width = icon.style.height = `${AVATAR_MARK_PX}px`;
  icon.style.display = 'block';
  drawCosmeticIcon(icon.getContext('2d'), shown, { x: icon.width / 2, y: icon.height / 2, size: icon.width });
  mark.append(icon);
}

let playerListSignature = '';
let pendingHeroSwap = null;
let pendingHeroSwapAt = 0;

const MAX_NAME_DISPLAY_LEN = 12;
function truncateName(name) {
  if (!name) return 'Hero';
  return name.length > MAX_NAME_DISPLAY_LEN ? name.slice(0, MAX_NAME_DISPLAY_LEN - 1) + '…' : name;
}

function renderPlayerList(room) {
  // Build a unified list: local player first, then everyone else.
  // Merge roster (host flag, waiting flag, disconnected) with gameplay (hp, downed).
  const rosterPlayers = (room.players || []).map((entry) => {
    const gp = (state.players || []).find((p) => p.id === entry.id) || {};
    return { ...entry, ...gp, waiting: false };
  });
  const rosterWaiting = (room.waiting || []).map((entry) => ({ ...entry, waiting: true }));
  const all = [...rosterPlayers, ...rosterWaiting].sort((a, b) => {
    if (a.id === me) return -1;
    if (b.id === me) return 1;
    return 0; // keep server order for non-local
  });

  playerRoster.hidden = all.length === 0;
  setHudText(partyCount, `${all.length}/${room.maxPlayers || 4}`);
  if (!all.length) return;

  // Detect duplicate names so we can suffix " (2)".
  const nameCounts = {};
  for (const e of all) { const n = e.name || 'Hero'; nameCounts[n] = (nameCounts[n] || 0) + 1; }
  const nameSeen = {};

  const signature = all.map((e) => {
    const downedSecs = e.downed ? Math.ceil((e.respawnRemainingMs || 0) / 1000) : 0;
    return `${e.id}:${e.name}:${e.heroId}:${e.emoji}:${e.host}:${e.waiting}:${e.disconnected}:${e.downed}:${downedSecs}:${e.hp || 0}:${e.maxHp || 0}:${e.avatarVisual?.color}:${e.avatarVisual?.hat}:${e.avatarVisual?.accessory}`;
  }).join('|');
  if (signature === playerListSignature) return;
  playerListSignature = signature;

  // Each row: hero portrait, the player's own name (primary), their hero
  // (secondary), and that player's health exactly once.
  playerRoster.replaceChildren(...all.map((entry) => {
    const row = document.createElement('div');
    row.className = `roster-row${entry.id === me ? ' me' : ''}${entry.downed ? ' downed' : ''}`;

    const portrait = document.createElement('span');
    portrait.className = 'roster-portrait';
    const heroImage = createHeroImage(entry.heroId, entry.emoji, 30);
    if (heroImage) portrait.append(heroImage);
    else portrait.textContent = entry.emoji || '';
    const visual = entry.avatarVisual;
    if (visual && /^#[0-9A-F]{6}$/i.test(visual.color)) {
      const mark = document.createElement('span');
      mark.className = 'roster-avatar-mark';
      mark.style.setProperty('--avatar-color', visual.color);
      fillAvatarMark(mark, visual);
      mark.setAttribute('aria-hidden', 'true');
      portrait.append(mark);
    }
    row.append(portrait);

    // Display name (NOT hero/class), truncated + duplicate suffix.
    let displayName = truncateName(entry.name);
    if ((nameCounts[entry.name] || 0) > 1) {
      nameSeen[entry.name] = (nameSeen[entry.name] || 0) + 1;
      if (nameSeen[entry.name] > 1) displayName = truncateName(`${entry.name} (${nameSeen[entry.name]})`);
    }
    const who = document.createElement('span');
    who.className = 'roster-who';
    const name = document.createElement('span');
    name.className = 'roster-name';
    name.textContent = displayName;
    name.title = entry.name || 'Hero';
    const hero = document.createElement('span');
    hero.className = 'roster-hero';
    hero.textContent = HEROES.find((candidate) => candidate.id === entry.heroId)?.name || 'Hero';
    if (entry.id === me) hero.textContent += ' · you';
    who.append(name, hero);
    row.append(who);

    const status = document.createElement('span');
    status.className = 'roster-status';
    if (entry.host) {
      const host = document.createElement('span');
      host.className = 'roster-tag host';
      host.textContent = 'host';
      status.append(host);
    }
    if (entry.waiting || entry.disconnected) {
      const tag = document.createElement('span');
      tag.className = 'roster-tag';
      tag.textContent = entry.waiting ? 'joining' : 'away';
      status.append(tag);
    } else if (entry.downed) {
      const timer = document.createElement('span');
      timer.className = 'roster-hp-value';
      timer.textContent = `Back in ${Math.ceil((entry.respawnRemainingMs || 0) / 1000)}s`;
      status.append(timer);
    } else {
      const value = document.createElement('span');
      value.className = 'roster-hp-value';
      value.textContent = `${entry.hp || 0}/${entry.maxHp || 0}`;
      status.append(value);
    }
    row.append(status);

    if (!entry.waiting && !entry.disconnected) {
      const hp = entry.downed ? 0 : (entry.hp || 0);
      const pct = Math.max(0, Math.min(100, hp / Math.max(1, entry.maxHp || 1) * 100));
      const track = document.createElement('span');
      track.className = 'roster-hp-track';
      track.setAttribute('role', 'meter');
      track.setAttribute('aria-label', `${displayName} health`);
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', String(entry.maxHp || 0));
      track.setAttribute('aria-valuenow', String(hp));
      const fill = document.createElement('span');
      fill.className = `roster-hp-fill${pct <= 25 ? ' low' : pct <= 55 ? ' mid' : ''}`;
      fill.style.width = `${pct}%`;
      track.append(fill);
      row.append(track);
    }
    return row;
  }));
}

function renderLobbyBar(room) {
  const inLobby = room.phase === 'lobby';
  lobbyBar.hidden = !inLobby;
  if (!inLobby) return;
  const isHost = room.hostId === me;
  startRunButton.hidden = !isHost;
  lobbyHint.hidden = isHost;
  const total = (room.players?.length || 0) + (room.waiting?.length || 0);
  setHudText(startRunButton, `START RUN (${total}/${room.maxPlayers || 4} players)`);
  const mine = [...(room.players || []), ...(room.waiting || [])].find((entry) => entry.id === me);
  if (!mine) return;
  if (pendingHeroSwap) {
    if (mine.heroId === pendingHeroSwap || performance.now() - pendingHeroSwapAt > 2000) pendingHeroSwap = null;
    else return;
  }
  if (lobbyHero.value !== mine.heroId) { lobbyHero.value = mine.heroId; syncHeroMenuIcons(); }
}

let countdownLabel = '';
let buffIconsSignature = null;
function renderCountdown(room, timestamp) {
  const endsAt = room?.countdownEndsAt || 0;
  if (!endsAt) {
    countdownOverlay.hidden = true;
    countdownLabel = '';
    return;
  }
  const remaining = Math.max(0, endsAt - (state.serverTime + (timestamp - stateReceivedAt)));
  countdownOverlay.hidden = remaining <= 0;
  if (remaining <= 0) return;
  const label = String(Math.max(1, Math.ceil(remaining / 1000)));
  if (label === countdownLabel) return;
  countdownLabel = label;
  countdownValue.textContent = label;
  // Replay the pop animation for every new number.
  countdownValue.classList.remove('tick');
  void countdownValue.offsetWidth;
  countdownValue.classList.add('tick');
}

// ---- HUD dirty-checking -----------------------------------------------------
// The HUD refreshes 10x/second. Writing a textContent/style value that is
// already correct still forces style recalc + layout on that frame, and on a
// loaded machine that is enough to miss a vsync (a 16.7ms frame becomes 33ms).
// Every write below is skipped when the value is unchanged, so a steady-state
// HUD update costs almost nothing and only real changes touch the DOM.
const hudTextCache = new Map();
function createHeroImage(heroId, emoji, sizePx = 24) {
  if (!heroSpriteConfig?.HERO_VISUALS?.[heroId] || heroSpritesDisabled) return null;
  const img = document.createElement('img');
  img.src = getHeroSpriteUrl(heroSpriteCache, heroId, 'open');
  img.alt = '';
  img.width = sizePx;
  img.height = sizePx;
  img.className = 'hero-ui-sprite';
  img.setAttribute('aria-hidden', 'true');
  img.onerror = () => { img.replaceWith(document.createTextNode(`${emoji || ''} `)); };
  return img;
}
function heroOptionText(hero) {
  return heroSpriteConfig?.HERO_VISUALS?.[hero.id] && !heroSpritesDisabled ? hero.name : `${hero.emoji} ${hero.name}`;
}
function syncHeroMenus() {
  const selectedLobbyHero = lobbyHero.value || activeHeroId;
  lobbyHero.replaceChildren(...HEROES.map((hero) => {
    const option = document.createElement('option'); option.value = hero.id; option.textContent = heroOptionText(hero); return option;
  }));
  lobbyHero.value = HEROES.some((hero) => hero.id === selectedLobbyHero) ? selectedLobbyHero : activeHeroId;
  syncHeroMenuIcons();
  if (runAgainHero.options.length) {
    const selected = runAgainHero.value;
    for (const option of runAgainHero.options) {
      const hero = HEROES.find((candidate) => candidate.id === option.value);
      if (hero) option.textContent = heroOptionText(hero);
    }
    runAgainHero.value = selected;
  }
}
function syncHeroMenuIcons() {
  const selectedLobbyHero = HEROES.find((hero) => hero.id === lobbyHero.value);
  document.querySelector('#lobby-hero-icon')?.replaceChildren(...[createHeroImage(selectedLobbyHero?.id, selectedLobbyHero?.emoji, 28)].filter(Boolean));
  const selectedRunHero = HEROES.find((hero) => hero.id === runAgainHero.value);
  document.querySelector('#run-again-hero-icon')?.replaceChildren(...[createHeroImage(selectedRunHero?.id, selectedRunHero?.emoji, 48)].filter(Boolean));
}
runAgainHero.addEventListener('change', syncHeroMenuIcons);
function setHudText(element, value) {
  if (hudTextCache.get(element) === value) return;
  hudTextCache.set(element, value);
  element.textContent = value;
}
function setHeroLabel(element, heroId, emoji, text) {
  const signature = `${heroId}:${emoji}:${text}:${Boolean(heroSpritesDisabled)}:${Boolean(heroSpriteConfig?.HERO_VISUALS?.[heroId])}`;
  if (element.dataset.heroLabel === signature) return;
  element.dataset.heroLabel = signature;
  element.replaceChildren();
  const image = createHeroImage(heroId, emoji, 24);
  if (image) element.append(image, document.createTextNode(` ${text}`));
  else element.textContent = `${emoji || ''} ${text}`.trim();
}
const hudStyleCache = new Map();
function setHudStyle(element, prop, value) {
  let entry = hudStyleCache.get(element);
  if (!entry) { entry = new Map(); hudStyleCache.set(element, entry); }
  if (entry.get(prop) === value) return;
  entry.set(prop, value);
  element.style[prop] = value;
}
function setHudHidden(element, value) {
  if (element.hidden === value) return;
  element.hidden = value;
}

function updateRoomHud(timestamp = performance.now()) {
  const room = state.room;
  if (!room) return;
  // Room code in the top-right corner.
  if (roomCodeCorner) setHudHidden(roomCodeCorner, !room.code);
  setHudHidden(roomCodeButton, !room.code);
  if (room.code) setHudText(roomCodeValue, room.code);
  renderPlayerList(room);
  renderLobbyBar(room);
  renderCountdown(room, timestamp);
  const isWaiting = Boolean(room.waiting?.some((entry) => entry.id === me));
  setHudHidden(waitingBanner, !isWaiting);
  setHudHidden(abilityHud, isWaiting);
  if (!isWaiting) return;
  const total = (room.players?.length || 0) + (room.waiting?.length || 0);
  setHudText(waitingDetail, `Spawning in the next break · ${total}/${room.maxPlayers || 4} players`);
  setHudText(heroName, 'Spectating');
  setHudText(healthValue, '-- / --');
  setHudStyle(healthFill, 'width', '0%');
}

// Rest pill: a small non-blocking countdown under the wave counter. It only
// appears during the REST phase, so it can never overlap the vote cards.
function updateBreakPill(current, breakPhase, timestamp) {
  if (!breakPill) return;
  if (breakPhase !== 'rest' || !current.break) {
    setHudHidden(breakPill, true);
    setHudText(breakPill, '');
    return;
  }
  const remaining = Math.max(0, current.break.remainingMs - (timestamp - stateReceivedAt));
  setHudHidden(breakPill, false);
  setHudText(breakPill, `Rest ${Math.ceil(remaining / 1000)}s`);
}

// Stats arrive as floats once a building bonus multiplies them (12 * 1.1 =
// 13.200000000000001), so trim to one decimal and drop a trailing ".0".
function formatStat(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  return String(Math.round(number * 10) / 10);
}

// Kingdom upgrades render as a list, one bonus per line, so a hero with both a
// Library and a Garden bonus does not turn into one wrapped sentence.
let lastBuildingBonusRender = null;
function renderStatList(rows) {
  const list = document.querySelector('#building-bonus-list');
  if (!list) return;
  const signature = rows.join('|');
  if (signature === lastBuildingBonusRender) return;
  lastBuildingBonusRender = signature;
  list.replaceChildren(...(rows.length > 0 ? rows : ['None']).map((text) => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
}

// I-card talent row. Rebuilt only when the hero (or its type) changes, so the
// 10 Hz HUD refresh never touches the badge; the key chip is cheap to sync.
let talentBadgeSignature = '';
function updateTalentBadge(player) {
  if (!talentBadgeHost || !talentKeyChip) return;
  const linked = player.talent?.linkedSlot;
  setHudText(talentKeyChip, talentKeyLabel(linked) || '--');
  const signature = `${player.heroId}:${player.type}:${player.talent?.name || ''}`;
  if (signature === talentBadgeSignature) return;
  talentBadgeSignature = signature;
  talentKeyChip.title = talentKeyTooltip(linked);
  talentBadgeHost.replaceChildren(createTalentBadge({
    heroId: player.heroId, type: player.type, talent: player.talent,
  }));
}

// One illustrated icon per team buff, shared by the vote cards and the small
// active-buff badges (game-icons.net, credited in Settings).
const BUFF_ICON_ASSETS = {
  maxHp: 'zeromancer/heart-plus.svg', attack: 'lorc/crossed-swords.svg', defense: 'sbed/shield.svg',
  speed: 'darkzaitzev/running-ninja.svg', campfire: 'lorc/campfire.svg', thorns: 'lorc/thorny-vine.svg',
  scavenger: 'zeromancer/heart-plus.svg', overcharge: 'willdabeast/chain-lightning.svg', rally: 'caro-asercion/french-horn.svg',
  'glass-cannon': 'lorc/cannon.svg', 'second-wind': 'lorc/whirlwind.svg', 'life-steal': 'lorc/marrow-drain.svg',
  ricochet: 'lorc/return-arrow.svg', volatile: 'lorc/bright-explosion.svg', 'powder-keg': 'darkzaitzev/smoke-bomb.svg',
};
const buffIconUrl = (id) => `/hero-lab/game-icons.net.svg/icons/ffffff/000000/1x1/${BUFF_ICON_ASSETS[id] || 'lorc/campfire.svg'}`;

// The enemy count only moves once the server's number has held for a moment,
// so a one-snapshot wobble can never make it flicker between nearby values.
// A new wave shows its full count at once.
const ENEMY_COUNT_SETTLE_MS = 180;
let shownEnemyCount = null;
let shownEnemyWave = null;
let pendingEnemyCount = null;
let pendingEnemySince = 0;
function steadyEnemyCount(value, wave, now) {
  if (shownEnemyCount === null || wave !== shownEnemyWave) {
    shownEnemyCount = value; shownEnemyWave = wave; pendingEnemyCount = null;
    return value;
  }
  if (value === shownEnemyCount) { pendingEnemyCount = null; return value; }
  if (value !== pendingEnemyCount) { pendingEnemyCount = value; pendingEnemySince = now; }
  if (now - pendingEnemySince >= ENEMY_COUNT_SETTLE_MS) { shownEnemyCount = value; pendingEnemyCount = null; }
  return shownEnemyCount;
}

function updateHud(timestamp = performance.now()) {
  const player = state.players?.find((candidate) => candidate.id === me);
  if (!player || player.heroId !== 'engineer' || player.downed) engineerPlacementTargeting = false;
  if (!player || player.heroId !== 'ranger' || player.downed) rangerMeatTargeting = false;
  const phase = state.room?.phase;
  // Lobby and countdown movement is supported by the room simulation, so keep
  // the stick available before the first wave as well as during combat.
  setHudHidden(movementStick, !player || player.downed || player.dawnWaiting);
  setHudHidden(touchHelp, !player || player.downed || player.dawnWaiting || (phase && phase !== 'running'));
  updateRoomHud();
  if (state.room && phase === 'lobby') {
    // The same status panel doubles as the lobby card: party size on the left.
    const total = (state.room.players?.length || 0) + (state.room.waiting?.length || 0);
    setHudText(enemyCountLabel, 'IN THE PARTY');
    setHudText(enemyCount, `${total}/${state.room.maxPlayers || 4}`);
    setHudText(waveNumber, 'Lobby');
    setHudText(waveDetails, state.room.hostId === me ? 'Start the run when ready' : 'Waiting for the host…');
  } else if (state.room && phase === 'countdown') {
    setHudText(enemyCountLabel, 'ENEMIES LEFT');
    setHudText(enemyCount, '0');
    setHudText(waveNumber, 'Get ready');
    setHudText(waveDetails, 'The first wave is coming');
  } else if (state.wave && waveNumber && waveDetails) {
    setHudText(enemyCountLabel, 'ENEMIES LEFT');
    setHudText(enemyCount, String(steadyEnemyCount(Math.max(0, state.wave.enemiesRemaining ?? 0), state.wave.number, timestamp)));
    setHudText(waveNumber, `Wave ${state.wave.number || 1}`);
    const breakPhase = state.break?.phase || null;
    if (state.buffVote) {
      setHudText(waveDetails, 'Choose a team buff');
    } else if (breakPhase === 'rest') {
      setHudText(waveDetails, 'Wave cleared');
    } else if (breakPhase === 'ready') {
      setHudText(waveDetails, 'Next wave starting…');
    } else if (state.wave.nextWaveInMs > 0) {
      const remaining = Math.max(0, state.wave.nextWaveInMs - (timestamp - stateReceivedAt));
      setHudText(waveDetails, remaining > 300
        ? `Next wave in ${Math.ceil(remaining / 1000)}s`
        : 'Next wave starting…');
    } else {
      setHudText(waveDetails, state.wave.twist?.label || 'Keep the campfire safe');
    }
    updateBreakPill(state, breakPhase, timestamp);
  } else {
    setHudText(enemyCount, '—');
    updateBreakPill(state, null, timestamp);
  }
  const fire = state.campfire;
  if (fire) {
    const ratio = Math.max(0, Math.min(1, fire.hp / Math.max(1, fire.maxHp)));
    setHudStyle(campfireFill, 'width', `${ratio * 100}%`);
    setHudStyle(campfireFill, 'backgroundColor', ratio > 0.5 ? '#8DB872' : ratio > 0.25 ? '#F2BA55' : '#E0807B');
    setHudText(campfireValue, `${fire.hp} / ${fire.maxHp}`);
    setHeartbeat(ratio < ARENA_TUNING.lowHp.threshold);
  }
  const boss = state.boss;
  setHudHidden(bossHud, !boss);
  if (boss) {
    const ratio = Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.maxHp)));
    setHudStyle(bossHealthFill, 'width', `${ratio * 100}%`);
    setHudText(bossHealthValue, `${boss.name} · ${boss.hp} / ${boss.maxHp}`);
  }
  if (!player) return;

  setHeroLabel(heroName, player.heroId, player.emoji, player.name);
  const hpRatio = player.maxHp > 0 ? Math.max(0, Math.min(1, player.hp / player.maxHp)) : 0;
  setHudStyle(healthFill, 'width', `${hpRatio * 100}%`);
  setHudStyle(healthFill, 'background', hpRatio <= .25 ? '#ef5350' : hpRatio <= .55 ? '#ffb74d' : '#64d985');
  const maxHpAttr = String(player.maxHp);
  const hpAttr = String(player.hp);
  if (healthTrack.getAttribute('aria-valuemax') !== maxHpAttr || healthTrack.getAttribute('aria-valuenow') !== hpAttr) {
    healthTrack.setAttribute('aria-valuemax', maxHpAttr);
    healthTrack.setAttribute('aria-valuenow', hpAttr);
  }
  setHudText(healthValue, `${player.hp} / ${player.maxHp}`);
  setHudHidden(lowHpVignette, hpRatio >= ARENA_TUNING.lowHp.threshold);
  const pulseDuration = `${1000 / ARENA_TUNING.lowHp.pulseHz}ms`;
  if (lowHpVignette.style.getPropertyValue('--low-hp-pulse-duration') !== pulseDuration) {
    lowHpVignette.style.setProperty('--low-hp-pulse-duration', pulseDuration);
  }
  if (player.downed) {
    lastLocalPosition = null;
    localIdleSince = timestamp;
  } else if (lastLocalPosition) {
    const moved = Math.hypot(player.x - lastLocalPosition.x, player.y - lastLocalPosition.y);
    if (moved > 1) localIdleSince = timestamp;
  } else localIdleSince = timestamp;
  lastLocalPosition = { x: player.x, y: player.y };
  const campfirePosition = state.campfire;
  const insideHealRing = campfirePosition && Math.hypot(player.x - campfirePosition.x, player.y - campfirePosition.y) <= ARENA_TUNING.campfire.healRadius;
  if (!player.downed && !player.momentumActive && insideHealRing
    && timestamp - localIdleSince >= ARENA_TUNING.momentum.idleNudgeMs
    && sessionNudgeCount < ARENA_TUNING.momentum.nudgeMaxPerSession) {
    momentumNudge = { startedAt: timestamp };
    sessionNudgeCount += 1;
    localIdleSince = timestamp;
    try { sessionStorage.setItem('hero-lab-momentum-nudges', String(sessionNudgeCount)); } catch { /* session storage is optional */ }
  }
  if (timestamp - combo.lastKillAt > ARENA_TUNING.killStreak.windowMs) {
    combo.count = 0;
    setHudHidden(killStreakHud, true);
  }

  // (The old team-health and downed-list blocks were merged into the unified
  // #player-roster via renderPlayerList in updateRoomHud.)
  // Tower scaling for the four stat cards (display only; the server owns the
  // actual values). Everything here uses the LOCAL player's own Tower level.
  const scaledCards = GAME_CONFIG.towerScaledCards;
  const towerLevel = Math.max(0, Math.min(GAME_CONFIG.arenaTuning.tower.maxLevel, Number(player.towerLevel) || 0));
  const towerMult = 1 + GAME_CONFIG.arenaTuning.tower.bonusPerLevel * towerLevel;
  const towerPercent = Math.round(GAME_CONFIG.arenaTuning.tower.bonusPerLevel * 100) * towerLevel;
  const scaledCardText = (card) => {
    if (!scaledCards.includes(card.id)) return card.description;
    const v = card.value;
    if (card.id === 'maxHp') return `Max HP +${(v * towerMult * 100).toFixed(1)}%`;
    if (card.id === 'attack') return `Attack +${(v * towerMult * 100).toFixed(1)}%`;
    if (card.id === 'defense') return `Defense +${(v * towerMult).toFixed(1)}%`;
    if (card.id === 'speed') return `Speed +${(v * towerMult * 100).toFixed(1)}%`;
    return card.description;
  };

  const buffSignature = `${(state.activeBuffs || []).map((buff) => buff.id).join('|')}@${towerLevel}`;
  if (buffSignature !== buffIconsSignature) {
    buffIconsSignature = buffSignature;
    buffIcons.replaceChildren(...(state.activeBuffs || []).map((buff) => {
      const icon = document.createElement('span');
      icon.className = 'buff-icon';
      icon.title = `${buff.label}: ${scaledCardText(buff)}`;
      icon.setAttribute('role', 'img');
      icon.setAttribute('aria-label', icon.title);
      const glyph = document.createElement('img');
      glyph.src = buffIconUrl(buff.id); glyph.alt = ''; glyph.setAttribute('aria-hidden', 'true');
      icon.append(glyph);
      return icon;
    }));
  }

  const mechActive = MECH_ICON_SWAP && Boolean(player.mech);
  const samuraiStacks = player.heroId === 'samurai' ? Math.max(0, player.samuraiStacks || 0) : 0;
  const stackSpec = GAME_CONFIG.heroes.samurai.killCount;
  const samuraiMult = Math.max(stackSpec.minMultiplier, Math.min(stackSpec.maxMultiplier, samuraiStacks / stackSpec.divisor));
  const samuraiTier = samuraiStacks >= stackSpec.cap ? 'max' : samuraiStacks >= 10 ? 'gold' : samuraiStacks >= 5 ? 'violet' : 'muted';
  const serverNow = (state.serverTime || Date.now()) + (timestamp - stateReceivedAt);
  const deadAimRemaining = player.heroId === 'ranger' ? Math.max(0, (player.deadAimUntil || serverNow) - serverNow) : 0;
  rangerDeadAimPill.hidden = player.heroId !== 'ranger' || !(player.deadAimArrows > 0);
  rangerDeadAimPill.textContent = `➡️ ×${player.deadAimArrows || 0}`;
  const deadAimRatio = deadAimRemaining / (GAME_CONFIG.heroes.ranger.ranger.ultWindowS * 1000);
  rangerDeadAimRing.style.setProperty('--window-degrees', `${Math.max(0, Math.min(360, deadAimRatio * 360))}deg`);
  ultimateAbility?.classList.toggle('ranger-window-active', !rangerDeadAimPill.hidden);
  const localWolf = (state.wolves || []).find((wolf) => wolf.ownerId === me);
  rangerWolfPill.hidden = player.heroId !== 'ranger' || !localWolf;
  rangerWolfPill.textContent = '🐺';
  const wolfDurationMs = GAME_CONFIG.heroes.ranger.ranger.wolfDurationS * 1000;
  const wolfRemaining = localWolf?.expiresAt ? Math.max(0, localWolf.expiresAt - serverNow) : wolfDurationMs;
  rangerWolfTimerRing.style.setProperty('--window-degrees', `${Math.max(0, Math.min(360, wolfRemaining / wolfDurationMs * 360))}deg`);
  sheriffSkillAbility?.classList.toggle('ranger-window-active', !rangerWolfPill.hidden);
  samuraiMultiplierPill.hidden = player.heroId !== 'samurai';
  samuraiMultiplierPill.dataset.tier = samuraiTier;
  samuraiMultiplierValue.textContent = samuraiStacks >= stackSpec.cap
    ? `${samuraiStacks} stacks · MAX`
    : `${samuraiStacks} stacks · x${samuraiMult.toFixed(1)}`;
  samuraiThresholdTick.classList.toggle('active', samuraiStacks >= 5);
  const previousSamuraiStacks = samuraiStackFeedback.get(player.id);
  if (previousSamuraiStacks && previousSamuraiStacks.count !== samuraiStacks) {
    samuraiStackFeedback.set(player.id, { count: samuraiStacks,
      kind: samuraiStacks > previousSamuraiStacks.count ? 'gain' : 'decay', at: timestamp });
  } else if (!previousSamuraiStacks) samuraiStackFeedback.set(player.id, { count: samuraiStacks, kind: '', at: timestamp });
  const engineerTurrets = (state.turrets || []).filter((turret) => turret.ownerId === me);
  setHudHidden(engineerTurretPips, player.heroId !== 'engineer');
  engineerTurretPipLabels.forEach((pip, index) => {
    const turret = engineerTurrets[index];
    pip.textContent = turret ? (turret.hp < GAME_CONFIG.turret.hp * 0.3 ? '!' : '●') : '○';
    pip.classList.toggle('active', Boolean(turret));
    pip.classList.toggle('low', Boolean(turret && turret.hp < GAME_CONFIG.turret.hp * 0.3));
  });
  if (player.heroId !== hudIconHeroId || mechActive !== hudIconMech) applyAbilityIcons(player.heroId, mechActive);
  const highlightSlots = heroHighlightSlots(player.heroId, mechActive);
  abilityElements.forEach((element) => {
    const id = element.dataset.ability;
    const data = player.abilities?.[id];
    const circle = element.querySelector('.ability-circle');
    if (!data) return;
    const controlName = data.name || (id === 'weapon' ? 'Primary fire' : id === 'skill' ? 'Skill' : 'Ultimate');
    const label = player.heroId === 'engineer' && id === 'skill'
      ? (engineerPlacementTargeting ? 'Cancel turret placement' : 'Choose a turret placement location')
      : player.heroId === 'ranger' && id === 'skill'
        ? (rangerMeatTargeting ? 'Cancel meat placement' : 'Choose a meat placement location')
      : id === 'weapon' ? `Hold and drag to aim and fire ${controlName}`
        : `Hold and drag to aim ${controlName}; tap to activate`;
    if (element.getAttribute('aria-label') !== label) element.setAttribute('aria-label', label);
    if (element.title !== label) element.title = label;
    const heroType = player.type || 'physical';
    const slot = ABILITY_SLOT[id];
    if (element.dataset.type !== heroType) element.dataset.type = heroType;
    const slotColor = heroButtonColor(player.heroId, heroType, slot, mechActive);
    if (circle.style.getPropertyValue('--fill-color') !== slotColor) circle.style.setProperty('--fill-color', slotColor);
    const elapsedMs = Math.max(0, timestamp - stateReceivedAt);
    const remaining = Math.max(0, data.remainingMs - elapsedMs);
    const lockoutRemaining = Math.max(0, (data.lockoutRemainingMs || 0) - elapsedMs);
    const fill = data.durationMs > 0 ? Math.max(0, Math.min(100, (1 - remaining / data.durationMs) * 100)) : 100;
    const fillValue = `${fill}%`;
    if (circle.style.getPropertyValue('--fill') !== fillValue) circle.style.setProperty('--fill', fillValue);
    circle.classList.toggle('ready', remaining <= 0 && lockoutRemaining <= 0);
    circle.classList.toggle('locked', lockoutRemaining > 0);
    const lockoutLabel = circle.querySelector('.ability-lockout');
    if (lockoutLabel) setHudText(lockoutLabel, lockoutRemaining > 0 ? String(Math.ceil(lockoutRemaining / 1000)) : '');
    // Amber highlight buttons turn bright gold while READY (generalized from
    // the Sheriff Dynamite), and every skill/ultimate button breathes the
    // ready glow (hud.css). The weapon slot keeps its amber highlight: it
    // re-arms between shots, so a ready colour change there would strobe on
    // every shot.
    const isHighlightSlot = id !== 'weapon' && highlightSlots.includes(slot);
    const ready = remaining <= 0 && lockoutRemaining <= 0;
    element.classList.toggle('highlight-ready', isHighlightSlot && ready);
    if (isHighlightSlot && ready && circle.style.getPropertyValue('--fill-color') !== BTN_HIGHLIGHT_READY_COLOR) {
      circle.style.setProperty('--fill-color', BTN_HIGHLIGHT_READY_COLOR);
    }
    const key = `${me}:${id}`;
    const previous = abilityReadyAt.get(key);
    if (previous !== undefined && previous > 0 && remaining <= 0) {
      // The Sheriff dynamite announces ready through its own server event
      // (ring pulse + sound), so it skips the shared one-shot pulse.
      if (!(player.heroId === 'sheriff' && id === 'skill')) {
        circle.classList.remove('ready-pulse');
        void circle.offsetWidth;
        circle.classList.add('ready-pulse');
        playSound(id === 'ultimate' ? 'ultimateReady' : 'abilityReady');
        setTimeout(() => circle.classList.remove('ready-pulse'), ARENA_TUNING.waveMoments.abilityReadyPulseMs);
      }
    }
    abilityReadyAt.set(key, remaining);
  });

  document.querySelector('#stat-health').textContent = `${formatStat(player.hp)} / ${formatStat(player.maxHp)}`;
  document.querySelector('#stat-attack').textContent = formatStat(player.attack);
  document.querySelector('#stat-defense').textContent = formatStat(player.defense);
  document.querySelector('#stat-speed').textContent = formatStat(player.speed);
  const buildingBonus = player.buildingBonuses || {};
  const buildingRows = [];
  if (buildingBonus.attackPercent > 0) buildingRows.push(`${player.type === 'magic' ? '📚 Library' : '🛠️ Workshop'} +${Math.round(buildingBonus.attackPercent * 100)}% ${player.type === 'magic' ? 'magic' : 'physical'} attack`);
  if (buildingBonus.campfireMaxHpPercent > 0) buildingRows.push(`🌷 Garden +${Math.round(buildingBonus.campfireMaxHpPercent * 100)}% campfire max HP`);
  if (towerLevel > 0) buildingRows.push(`🗼 Tower Lv${towerLevel}: buffs +${towerPercent}%`);
  // One bonus per line: joining them with " · " wrapped into an unreadable blob.
  renderStatList(buildingRows);
  document.querySelector('#building-bonus-stat').title = buildingRows.join(' · ') || 'No kingdom building bonuses apply to this hero';
  const momentumStatus = document.querySelector('#momentum-status');
  momentumStatus.textContent = player.momentumActive ? 'Active' : 'Inactive';
  document.querySelector('#momentum-stat').style.opacity = player.momentumActive ? '1' : '0.55';
  document.querySelector('#momentum-stat').title = `Moving: +${Math.round(ARENA_TUNING.momentum.bonus * 100)}% damage`;
  document.querySelector('#stat-talent-name').textContent = player.talent?.name || 'Talent';
  document.querySelector('#stat-talent-description').textContent = player.talent?.description || 'No special passive.';
  updateTalentBadge(player);

  const vote = state.buffVote;
  buffVote.hidden = !vote;
  if (vote) {
    const voted = vote.votes?.[me] || '';
    document.querySelector('#buff-vote-title').textContent = `Wave ${vote.wave} cleared · Vote for a team buff`;
    const voteRemaining = Math.max(0, Math.ceil((vote.endsAt - state.serverTime - (timestamp - stateReceivedAt)) / 1000));
    document.querySelector('#buff-vote-status').textContent = vote.endsAt > 0
      ? `${vote.voteCount}/${state.players.length} votes · ${voteRemaining}s left${voted ? ' · Your vote is recorded' : ''}`
      : `${voted ? 'Your vote is recorded' : 'Choose when ready'} · no timer in solo`;
    const signature = `${vote.wave}:${voted}:${JSON.stringify(vote.votes)}:${vote.cards.map((card) => card.id).join(',')}:${towerLevel}`;
    if (signature !== lastBuffRender) {
      lastBuffRender = signature;
      buffCards.replaceChildren(...vote.cards.map((card) => {
        const button = document.createElement('button'); button.className = `buff-card${card.rare ? ' rare' : ''}${voted === card.id ? ' selected' : ''}`;
        button.type = 'button'; button.disabled = Boolean(voted);
        const icon = document.createElement('img'); icon.className = 'buff-card-icon'; icon.src = buffIconUrl(card.id); icon.alt = ''; icon.setAttribute('aria-hidden', 'true');
        const title = document.createElement('strong'); title.textContent = `${card.rare ? '✨ ' : ''}${card.label}`;
        // The four scaled cards show the LOCAL player's own resulting value.
        const description = document.createElement('span'); description.textContent = scaledCardText(card);
        const nodes = [title, description];
        if (scaledCards.includes(card.id) && towerLevel > 0) {
          const towerLine = document.createElement('small');
          towerLine.className = 'buff-tower-line';
          towerLine.textContent = `(Tower +${towerPercent}%)`;
          towerLine.style.color = '#c9962f'; towerLine.style.fontWeight = '600';
          nodes.push(towerLine);
        }
        const tally = document.createElement('small'); tally.textContent = `${Object.values(vote.votes || {}).filter((id) => id === card.id).length} votes`;
        nodes.push(tally);
        button.append(icon, ...nodes); button.addEventListener('click', () => socket.emit('buff_vote', card.id)); return button;
      }));
    }
  } else lastBuffRender = '';
  const engineerTargeting = player.heroId === 'engineer' && engineerPlacementTargeting;
  const rangerTargeting = player.heroId === 'ranger' && rangerMeatTargeting;
  targetingHint.hidden = !player.targeting && !engineerTargeting && !rangerTargeting;
  if (targetingHintText) targetingHintText.textContent = rangerTargeting
    ? 'Move to a spot · Primary fire to throw meat · E to cancel'
    : engineerTargeting ? 'Move to a spot · Primary fire to place · E to cancel '
      : defaultTargetingHintText;
  if (!player.targeting && !engineerTargeting) targetingReticle.hidden = true;
}

function onKeyUp(event) {
  const key = codeToKey[event.code];
  if (key && keys[key]) {
    keys[key] = false;
    sendMovement();
  }
}

function onPointerDown(event) {
  if (!me || pinchStart) return;
  const pointer = getPointerCoordinates(event);
  window.lastPointerWorld = pointer;
  const player = state.players.find((candidate) => candidate.id === me);
  if (player) {
    const dx = pointer.x - player.x;
    const dy = pointer.y - player.y;
    if (socket.connected) { socket.emit('aim', { x: dx, y: dy }); lastAimSentAt = performance.now(); }
    if (aimSendTimer !== null) { clearTimeout(aimSendTimer); aimSendTimer = null; }
  }
  if (event.button === 2) { fireWeapon('secondary'); return; }
  if (event.button === 0) {
    if (player?.heroId === 'engineer' && engineerPlacementTargeting) {
      confirmEngineerPlacement(pointer);
      return;
    }
    if (player?.heroId === 'ranger' && rangerMeatTargeting) {
      confirmRangerMeatPlacement(pointer);
      return;
    }
    // While the Bombardier ultimate is targeting, primary fire confirms the
    // strike location (same emit as the right-click confirm) instead of
    // firing the weapon.
    if (player?.targeting) { fireWeapon('secondary'); return; }
    // Send the first shot before the hold flag: if the server tick lands
    // between the two events it fires from the hold, and the explicit shot
    // that follows would be refused by the cooldown - one shot, one sound.
    fireWeapon('primary');
    setPrimaryHeld(true);
    primaryPointerId = event.pointerId;
  }
}

function paintTargetReticle(event, gesture = abilityGesture) {
  const rect = canvas.getBoundingClientRect();
  const inside = event.clientX >= rect.left && event.clientX <= rect.right
    && event.clientY >= rect.top && event.clientY <= rect.bottom;
  if (!inside) {
    targetingReticle.hidden = true;
    if (gesture) gesture.targetPoint = null;
    return;
  }
  const point = getPointerCoordinates(event);
  if (gesture) gesture.targetPoint = { x: Math.max(0, Math.min(ARENA_WIDTH, point.x)), y: Math.max(0, Math.min(ARENA_HEIGHT, point.y)) };
  const radius = GAME_CONFIG.heroes.bombardier.airstrike.circleRadius;
  targetingReticle.style.left = `${event.clientX}px`;
  targetingReticle.style.top = `${event.clientY}px`;
  const camera = mobileCameraView();
  targetingReticle.style.setProperty('--target-size', `${radius * 2 * (camera?.scale ?? rect.width / ARENA_WIDTH)}px`);
  targetingReticle.hidden = false;
}

function beginAbilityGesture(event) {
  const button = event.target.closest?.('.ability[data-ability]');
  if (!button || !me || abilityGesture) return;
  event.preventDefault();
  const slot = button.dataset.ability;
  const player = state.players.find((candidate) => candidate.id === me);
  if (!player) return;
  if (slot === 'weapon' && player.targeting) return;
  if (slot === 'weapon' && player.heroId === 'engineer' && engineerPlacementTargeting) {
    confirmEngineerPlacement();
    return;
  }
  if (slot === 'weapon' && player.heroId === 'ranger' && rangerMeatTargeting) {
    confirmRangerMeatPlacement();
    return;
  }
  const targetedBombing = slot === 'ultimate' && player.heroId === 'bombardier';
  abilityGesture = { pointerId: event.pointerId, button, slot, startX: event.clientX, startY: event.clientY,
    dragged: false, targetedBombing, targetPoint: null, cancelled: false };
  button.classList.add('aiming');
  try { button.setPointerCapture(event.pointerId); } catch { /* window listeners still handle uncaptured pointers */ }
  if (slot === 'weapon') {
    fireWeapon('primary');
    setPrimaryHeld(true);
    primaryPointerId = event.pointerId;
  } else if (targetedBombing) {
    socket.emit('ultimate');
  }
}

function moveAbilityGesture(event) {
  const gesture = abilityGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  const distance = Math.hypot(dx, dy);
  if (distance > 10) gesture.dragged = true;
  if (gesture.targetedBombing) {
    if (gesture.dragged) paintTargetReticle(event, gesture);
    return;
  }
  if (gesture.dragged) {
    sendAimVector(dx, dy);
    const scale = Math.min(1, 48 / Math.max(1, distance));
    gesture.button.style.setProperty('--aim-x', `${dx * scale}px`);
    gesture.button.style.setProperty('--aim-y', `${dy * scale}px`);
  }
}

function finishAbilityGesture(event, cancelled = false) {
  const gesture = abilityGesture;
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  abilityGesture = null;
  gesture.button.classList.remove('aiming');
  gesture.button.style.removeProperty('--aim-x');
  gesture.button.style.removeProperty('--aim-y');
  if (gesture.slot === 'weapon') {
    if (primaryPointerId === event.pointerId) {
      const ranger = state.players?.find((player) => player.id === me && player.heroId === 'ranger');
      if (ranger && gesture.dragged) sendAimVector(event.clientX - gesture.startX, event.clientY - gesture.startY, true);
      primaryPointerId = null;
      setPrimaryHeld(false);
    }
    return;
  }
  if (gesture.targetedBombing) {
    if (cancelled) {
      socket.emit('cancel_targeting');
      targetingReticle.hidden = true;
      return;
    }
    if (gesture.dragged) paintTargetReticle(event, gesture);
    if (gesture.dragged && gesture.targetPoint) {
      window.lastPointerWorld = gesture.targetPoint;
      fireWeapon('secondary', gesture.targetPoint);
      targetingReticle.hidden = true;
    }
    return;
  }
  if (cancelled) return;
  if (gesture.dragged) sendAimVector(event.clientX - gesture.startX, event.clientY - gesture.startY, true);
  else sendCurrentAim();
  const local = state.players?.find((player) => player.id === me);
  if (gesture.slot === 'skill' && local?.heroId === 'engineer') toggleEngineerPlacementTargeting();
  else if (gesture.slot === 'skill' && local?.heroId === 'ranger') toggleRangerMeatTargeting();
  else if (gesture.slot === 'skill') socket.emit('skill', local?.heroId === 'engineer' ? window.lastPointerWorld : undefined);
  else socket.emit('ultimate');
}

function onAbilityKeyboardClick(event) {
  if (event.detail !== 0) return;
  const slot = event.currentTarget.dataset.ability;
  if (slot === 'weapon') fireWeapon('primary');
  else activateAbility(slot);
}

function cancelTargeting() {
  socket.emit('cancel_targeting');
  engineerPlacementTargeting = false;
  targetingReticle.hidden = true;
  if (abilityGesture?.targetedBombing) {
    abilityGesture.button.classList.remove('aiming');
    abilityGesture = null;
  }
}

function releasePointerControls(event) {
  finishAbilityGesture(event, event.type === 'pointercancel');
  onMovementPointerEnd(event);
  if (primaryPointerId === event.pointerId) {
    const ranger = state.players?.find((player) => player.id === me && player.heroId === 'ranger');
    if (ranger && window.lastPointerWorld) {
      sendAimVector(window.lastPointerWorld.x - ranger.x, window.lastPointerWorld.y - ranger.y, true);
    }
    primaryPointerId = null;
    setPrimaryHeld(false);
  }
}

// Timed wrapper: the profiler records the frame delta and the JS cost of one
// draw pass, so a slow frame can be separated from a slow draw.
// Frame pacing: rAF still fires every vsync, but we only render on a fixed
// schedule (FRAME_CAP_FPS). Skipped vsyncs return before any work, so each
// presented frame gets a guaranteed 1000/FRAME_CAP_FPS budget. The schedule
// advances exactly one interval per drawn frame and never falls behind the
// clock, so a long stall (GC, tab restore) resyncs instead of bursting.
let nextFrameAt = -1;
function draw(timestamp) {
  requestAnimationFrame(draw);
  if (FRAME_CAP_FPS > 0) {
    const frameIntervalMs = 1000 / FRAME_CAP_FPS;
    if (nextFrameAt < 0) nextFrameAt = timestamp;
    else if (timestamp < nextFrameAt) return;
    nextFrameAt = Math.max(nextFrameAt + frameIntervalMs, timestamp);
  }
  burstsThisFrame = 0;
  const startedAt = performance.now();
  drawScene(timestamp);
  const drawMs = performance.now() - startedAt;
  profiler.recordFrame(timestamp || performance.now(), drawMs);
  sampleAdaptiveQuality(drawMs);
}

// Adaptive quality (STEP 2H). When the average draw time over the last
// ADAPTIVE_SAMPLE_FRAMES frames exceeds the target, step effects quality down
// one level; restore one level after ADAPTIVE_RESTORE_MS of good frames. Only
// active while the user leaves Effects quality on Auto. Gameplay is identical
// at every level - only particle budget, sparks and teammate numbers change.
function sampleAdaptiveQuality(drawMs) {
  adaptiveFrameTimes.push(drawMs);
  if (adaptiveFrameTimes.length < ADAPTIVE_SAMPLE_FRAMES) return;
  let total = 0;
  for (let i = 0; i < adaptiveFrameTimes.length; i += 1) total += adaptiveFrameTimes[i];
  const avg = total / adaptiveFrameTimes.length;
  adaptiveFrameTimes.length = 0;
  if (settings.effectsQuality !== 'auto') return;
  if (avg > FRAME_TIME_TARGET_MS) {
    if (autoQualityLevel === 'high') { autoQualityLevel = 'medium'; adaptiveGoodMs = 0; applyEffectsQuality(); }
    else if (autoQualityLevel === 'medium') { autoQualityLevel = 'low'; adaptiveGoodMs = 0; applyEffectsQuality(); }
  } else if (autoQualityLevel !== 'high') {
    adaptiveGoodMs += ADAPTIVE_SAMPLE_FRAMES * avg;
    if (adaptiveGoodMs >= ADAPTIVE_RESTORE_MS) {
      autoQualityLevel = autoQualityLevel === 'low' ? 'medium' : 'high';
      adaptiveGoodMs = 0;
      applyEffectsQuality();
    }
  }
}

function getHeroVisualState(player, now) {
  const heroId = player.heroId;
  if (!heroOffsets.has(player.id)) heroOffsets.set(player.id, Math.random() * 1000);
  const downed = Boolean(player.downed || (heroDebugDowned && player.id === me));
  const runEnded = !runResultPanel.hidden || Boolean(state.gameEnded) || state.room?.phase === 'ended';
  const ultActive = Boolean(!downed && !runEnded && (heroDebugUltimate && player.id === me
    || (heroId === 'sheriff' && player.ultimateFlash)
    || (heroId === 'guardian' && player.guardianCharging)
    || (heroId === 'pilot' && player.mech)));
  const priorUltimate = heroUltimateLook.get(player.id) || false;
  if (priorUltimate !== ultActive) {
    heroTransformStarts.set(player.id, now);
    heroUltimateLook.set(player.id, ultActive);
  }

  let facingLeft = heroFacing.get(player.id) || false;
  const aimX = Number(player.aim?.x) || 0;
  const facingThreshold = heroSpriteCache?.config
    ? heroSpriteCache.config.SPRITE_FLIP_DEADZONE_PX / heroSpriteCache.config.FACING_AIM_DISTANCE_PX : Infinity;
  if (aimX < -facingThreshold) facingLeft = true;
  else if (aimX > facingThreshold) facingLeft = false;
  heroFacing.set(player.id, facingLeft);

  const previous = heroPreviousPositions.get(player.id);
  const moving = Boolean(heroSpriteCache?.config && previous
    && Math.hypot(player.x - previous.x, player.y - previous.y) > heroSpriteCache.config.MOVEMENT_EPSILON_PX);
  heroPreviousPositions.set(player.id, { x: player.x, y: player.y });
  if (player.hitFlash && now - (heroHitFlashLast.get(player.id) ?? Number.NEGATIVE_INFINITY) >= HIT_FLASH_MIN_INTERVAL_MS) {
    heroHitFlashStarts.set(player.id, now);
    heroHitFlashLast.set(player.id, now);
  }
  const hitFlash = now - (heroHitFlashStarts.get(player.id) ?? Number.NEGATIVE_INFINITY) < ARENA_TUNING.hitFlashMs;
  const squash = guardianDashSquash.get(player.id);
  let scaleX = 1, scaleY = 1;
  if (squash) {
    const age = now - squash.startedAt;
    const progress = heroSpriteCache?.config ? 1 - age / heroSpriteCache.config.GUARDIAN_DASH_SQUASH_MS : 0;
    if (progress <= 0) guardianDashSquash.delete(player.id);
    else { scaleX = 1 + 0.45 * progress; scaleY = 1 - 0.3 * progress; }
  }
  return {
    moving, facingLeft, ultActive, downed,
    invulnerable: Boolean(player.invulnerable), hitFlash,
    guardianCharging: Boolean(heroId === 'guardian' && ultActive),
    chargeDirection: player.aim,
    ultimateStartedAt: heroTransformStarts.get(player.id) || now,
    transformStartedAt: heroTransformStarts.get(player.id),
    heroOffset: heroOffsets.get(player.id), time: now, scaleX, scaleY,
    disableSprites: heroSpritesDisabled,
  };
}

function drawRangerMeatThrows(now) {
  for (const [ownerId, meat] of rangerMeatThrows) {
    const progress = Math.max(0, Math.min(1, (now - meat.startedAt) / meat.durationMs));
    if (progress >= 1) {
      rangerMeatThrows.delete(ownerId);
      rangerMeatLandings.push({ x: meat.x, y: meat.y, startedAt: now,
        expiresAt: now + GAME_CONFIG.heroes.ranger.ranger.feedback.meatGroundMs });
      if (effectToggles.sound) playSound('rangerMeatLand', { volume: 0.55 });
      if (!prefersReducedMotion && effectiveQuality() !== 'low' && effectToggles.burst) {
        for (let i = 0; i < engineerFeedbackParticleCount(5); i++) {
          const angle = Math.PI * 2 * i / 5;
          addParticle({ x: meat.x, y: meat.y, vx: Math.cos(angle) * 30, vy: Math.sin(angle) * 24 - 10,
            radius: 3, color: '#B07A4A', alpha: 0.7, expiresAt: now + 260 });
        }
      }
      continue;
    }
    const x = meat.fromX + (meat.x - meat.fromX) * progress;
    const groundY = meat.fromY + (meat.y - meat.fromY) * progress;
    const arc = Math.sin(Math.PI * progress) * GAME_CONFIG.heroes.ranger.ranger.feedback.meatArcHeightPx;
    const y = groundY - arc;
    context.save();
    context.globalAlpha = 0.72 + 0.28 * Math.sin(Math.PI * progress);
    context.beginPath();
    context.ellipse(x, groundY + 8, 8 + progress * 5, 3, 0, 0, Math.PI * 2);
    context.fillStyle = 'rgba(29, 28, 20, 0.35)';
    context.fill();
    context.translate(x, y);
    context.rotate(progress * Math.PI * 3);
    context.font = '27px "Segoe UI Emoji", sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('🍖', 0, 0);
    context.restore();
  }
  for (let i = rangerMeatLandings.length - 1; i >= 0; i--) {
    const landing = rangerMeatLandings[i];
    const remaining = landing.expiresAt - now;
    if (remaining <= 0) { rangerMeatLandings.splice(i, 1); continue; }
    const pulse = 0.5 + 0.5 * Math.sin(now * 0.018);
    context.save();
    context.globalAlpha = Math.min(0.7, remaining / 180) * (0.55 + pulse * 0.25);
    context.strokeStyle = '#303728'; context.lineWidth = 4;
    context.beginPath(); context.arc(landing.x, landing.y, 18 + pulse * 4, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = '#B07A4A'; context.lineWidth = 2;
    context.beginPath(); context.arc(landing.x, landing.y, 18 + pulse * 4, 0, Math.PI * 2); context.stroke();
    context.font = '18px "Segoe UI Emoji", sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText('🍖', landing.x, landing.y);
    context.restore();
  }
}

function drawRangerWolves(now) {
  for (const wolf of state.wolves || []) {
    if (wolf.waitingForMeat) continue;
    const arriving = Boolean(wolf.arriving);
    // Loyal rush: paw dust while the wolf is running flat out (sampled every
    // ~90 ms because wolf positions arrive with snapshots, not every frame).
    if (!arriving && dustAllowed()) {
      const check = wolfDustChecks.get(wolf.id);
      if (!check || now - check.at >= 90) {
        if (wolfDustChecks.size > 32) wolfDustChecks.clear();
        wolfDustChecks.set(wolf.id, { x: wolf.x, y: wolf.y, at: now });
        const moved = check ? Math.hypot(wolf.x - check.x, wolf.y - check.y) : 0;
        if (check && now - check.at < 250 && moved / (now - check.at) * 1000 > GAME_CONFIG.heroes.ranger.ranger.wolfSpeed * 0.6)
          spawnDust(wolf.x, wolf.y + 12, (wolf.x - check.x) / moved, (wolf.y - check.y) / moved, 1, now);
      }
    }
    const fade = arriving ? Math.max(0, Math.min(1, wolf.arrivalProgress || 0)) : 1;
    const pulse = 1 + Math.sin(now * 0.008) * 0.045;
    context.save();
    context.globalAlpha = arriving ? 0.08 + fade * 0.92 : 1;
    context.translate(wolf.x, wolf.y);
    context.scale(pulse * (arriving ? 0.72 + fade * 0.28 : 1), pulse * (arriving ? 0.72 + fade * 0.28 : 1));

    context.beginPath();
    context.ellipse(0, 13, 16, 6, 0, 0, Math.PI * 2);
    context.fillStyle = 'rgba(10, 22, 15, 0.48)';
    context.fill();
    context.beginPath();
    context.arc(0, 0, 17, 0, Math.PI * 2);
    context.fillStyle = '#263b2b';
    context.fill();
    context.strokeStyle = arriving ? '#fff2cc' : '#8be04e';
    context.lineWidth = 2;
    context.stroke();
    context.font = '25px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('🐺', 0, 0);

    context.font = '900 10px system-ui, sans-serif';
    context.fillStyle = '#fff';
    context.textAlign = 'center';
    if (arriving) context.fillText('ARRIVING', 0, -25);
    const feedback = GAME_CONFIG.heroes.ranger.ranger.feedback;
    if (!arriving && wolf.expiresAt > 0) {
      const serverNow = (state.serverTime || Date.now()) + (now - stateReceivedAt);
      const timer = Math.max(0, Math.min(1, (wolf.expiresAt - serverNow)
        / (GAME_CONFIG.heroes.ranger.ranger.wolfDurationS * 1000)));
      const barWidth = feedback.wolfTimerBarWidthPx, barHeight = feedback.wolfTimerBarHeightPx;
      context.fillStyle = '#20271f'; context.fillRect(-barWidth / 2, 22, barWidth, barHeight);
      context.fillStyle = '#B07A4A'; context.fillRect(-barWidth / 2 + 1, 23, (barWidth - 2) * timer, barHeight - 2);
      context.globalAlpha = 0.5;
      context.strokeStyle = '#303728'; context.lineWidth = 4; context.setLineDash([8, 7]);
      context.beginPath(); context.arc(0, 0, GAME_CONFIG.heroes.ranger.ranger.wolfTauntRadius, 0, Math.PI * 2); context.stroke();
      context.strokeStyle = 'rgba(176, 122, 74, 0.5)'; context.lineWidth = 2;
      context.beginPath(); context.arc(0, 0, GAME_CONFIG.heroes.ranger.ranger.wolfTauntRadius, 0, Math.PI * 2); context.stroke();
      context.setLineDash([]);
    }
    context.restore();
  }
}

function drawRangerWolfBiteFx(now) {
  for (let i = rangerWolfBiteFx.length - 1; i >= 0; i--) {
    const fx = rangerWolfBiteFx[i];
    const progress = (now - fx.startedAt) / 230;
    if (progress >= 1) { rangerWolfBiteFx.splice(i, 1); continue; }
    // Three curved, tapered claw rakes (dark body, pale edge) in place of the
    // old straight capsules; same footprint and timing.
    context.save(); context.translate(fx.x, fx.y - 12 - progress * 8); context.globalAlpha = 1 - progress;
    for (let claw = 0; claw < 3; claw++) {
      context.save(); context.translate(-10 + claw * 8, -9); context.rotate(1.82);
      context.fillStyle = '#303728'; crescentPath(19, 6.5, 2.2, 0.45); context.fill();
      context.fillStyle = '#FFF2CC'; crescentPath(19, 2.4, 2.2, 0.45); context.fill(); context.restore();
    }
    context.restore();
  }
}

function drawRangerDeadAimStreaks(now) {
  for (let i = rangerDeadAimStreaks.length - 1; i >= 0; i--) {
    const streak = rangerDeadAimStreaks[i];
    const progress = (now - streak.startedAt) / streak.durationMs;
    if (progress >= 1) { rangerDeadAimStreaks.splice(i, 1); continue; }
    const length = streak.range * Math.min(1, progress * 3 + 0.08);
    // Tapered arrow wake: needle-thin at the bow, fullest just behind the
    // arrowhead, so it reads as speed rather than a solid bar.
    if (length < 1) continue;
    context.save(); context.translate(streak.x, streak.y); context.rotate(Math.atan2(streak.dy, streak.dx));
    context.globalAlpha = (1 - progress) * (prefersReducedMotion ? 0.55 : 0.9);
    context.fillStyle = '#5A3E0C'; crescentPath(length, 18, 0, 0.82); context.fill();
    context.fillStyle = '#FFF2CC'; crescentPath(length, 10, 0, 0.82); context.fill();
    context.fillStyle = '#F0DDA0'; crescentPath(length, 3, 0, 0.82); context.fill();
    context.restore();
  }
}

function rangerAimEndpoint(player, range, target = window.lastPointerWorld) {
  const center = { x: player.x, y: player.y };
  const pointer = target || { x: center.x + (player.aim?.x || 1) * range, y: center.y + (player.aim?.y || 0) * range };
  const dx = pointer.x - center.x, dy = pointer.y - center.y;
  const distance = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1, range / distance);
  return { x: center.x + dx * scale, y: center.y + dy * scale };
}

function drawRangerAimGuides() {
  const player = state.players?.find((candidate) => candidate.id === me);
  if (!player || player.heroId !== 'ranger' || player.downed || !window.lastPointerWorld) return;
  const config = GAME_CONFIG.heroes.ranger.ranger;
  const progress = Math.max(0, Math.min(1, player.rangerChargeT || 0));
  let range, width, color;
  if (player.rangerCharging) {
    range = config.rangeMin + (config.rangeMax - config.rangeMin) * progress;
    width = config.feedback.aimLineWidthMinPx + progress * config.feedback.aimLineWidthMaxPx;
    color = HERO_FX_COLORS.ranger.primary;
  } else if (player.deadAimArrows > 0) {
    range = config.ultRange;
    width = 1.5;
    color = HERO_FX_COLORS.ranger.primary;
  } else return;
  const end = rangerAimEndpoint(player, range);
  context.save(); context.globalAlpha = player.deadAimArrows > 0 ? 0.5 : 0.48; context.lineCap = 'round';
  context.strokeStyle = '#303728'; context.lineWidth = width + 3;
  context.beginPath(); context.moveTo(player.x, player.y); context.lineTo(end.x, end.y); context.stroke();
  context.strokeStyle = color; context.lineWidth = width;
  context.beginPath(); context.moveTo(player.x, player.y); context.lineTo(end.x, end.y); context.stroke();
  context.restore();
}

function drawRangerCombatFeedback(player, now) {
  if (player.heroId !== 'ranger' || player.downed) return;
  const config = GAME_CONFIG.heroes.ranger.ranger;
  const feedback = config.feedback;
  const center = { x: player.x, y: player.y };
  const muzzleUntil = rangerDeadAimMuzzleUntil.get(player.id) || 0;
  if (muzzleUntil > now) {
    const progress = 1 - (muzzleUntil - now) / feedback.deadAimMuzzleMs;
    const aim = player.aim || { x: 1, y: 0 };
    const x = center.x + aim.x * 31, y = center.y + aim.y * 31;
    context.save(); context.globalAlpha = 1 - progress; context.translate(x, y);
    const rotation = Math.atan2(aim.y, aim.x);
    context.rotate(rotation);
    context.strokeStyle = '#5A3E0C'; context.lineWidth = 5; context.lineCap = 'round';
    context.beginPath(); context.arc(0, 0, 14 + progress * 13, -0.8, 0.8); context.stroke();
    context.strokeStyle = '#FFF2CC'; context.lineWidth = 2;
    context.beginPath(); context.arc(0, 0, 14 + progress * 13, -0.8, 0.8); context.stroke();
    if (!prefersReducedMotion && effectiveQuality() !== 'low') {
      for (let ray = 0; ray < 5; ray++) {
        const angle = -0.7 + ray * 0.35;
        context.beginPath(); context.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
        context.lineTo(Math.cos(angle) * 22, Math.sin(angle) * 22); context.stroke();
      }
    }
    context.restore();
  } else if (muzzleUntil) rangerDeadAimMuzzleUntil.delete(player.id);
  const progress = Math.max(0, Math.min(1, player.rangerChargeT || 0));
  if (player.rangerCharging) {
    const visual = rangerChargeVisuals.get(player.id) || { full: false, lastCreakAt: -Infinity, fullAt: 0 };
    if (progress >= 1 && !visual.full) {
      visual.full = true;
      visual.fullAt = now;
      if (player.id === me && effectToggles.sound) playSound('rangerFullCharge');
      if (player.id === me && !prefersReducedMotion && effectiveQuality() !== 'low') {
        addParticle({ x: center.x, y: center.y - 28, vx: 0, vy: -20, radius: 3,
          color: '#FFF2CC', alpha: 1, expiresAt: now + feedback.chargeFullFlashMs });
      }
    }
    if (progress < 1) visual.full = false;
    if (player.id === me && effectToggles.sound && now - visual.lastCreakAt >= feedback.creakIntervalMs) {
      visual.lastCreakAt = now;
      playSound('rangerCreak', { semitones: Math.round(progress * 7), volume: 0.42 });
    }
    rangerChargeVisuals.set(player.id, visual);

    const aim = player.aim || { x: 1, y: 0 };
    const angle = Math.atan2(aim.y, aim.x);
    context.save();
    context.translate(center.x + aim.x * 14, center.y + aim.y * 14);
    context.rotate(angle);
    const bend = feedback.drawBowBasePx + feedback.drawBowBendPx * progress;
    context.lineCap = 'round'; context.lineJoin = 'round';
    context.strokeStyle = '#303728'; context.lineWidth = 6;
    context.beginPath(); context.moveTo(0, -feedback.drawBowHalfHeightPx);
    context.quadraticCurveTo(bend, 0, 0, feedback.drawBowHalfHeightPx); context.stroke();
    context.strokeStyle = HERO_FX_COLORS.ranger.primary; context.lineWidth = 3;
    context.beginPath(); context.moveTo(0, -feedback.drawBowHalfHeightPx);
    context.quadraticCurveTo(bend, 0, 0, feedback.drawBowHalfHeightPx); context.stroke();
    context.strokeStyle = '#fff2cc'; context.lineWidth = 1.5;
    context.beginPath(); context.moveTo(0, -feedback.drawBowHalfHeightPx); context.lineTo(0, feedback.drawBowHalfHeightPx); context.stroke();
    context.restore();

    if (player.id === me && window.lastPointerWorld) {
      const end = rangerAimEndpoint(player, config.rangeMin + (config.rangeMax - config.rangeMin) * progress);
      context.save();
      const pulse = visual.full && !prefersReducedMotion ? 1 + Math.sin(now * 0.025) * 0.1 : 1;
      const flash = visual.fullAt && now - visual.fullAt < feedback.chargeFullFlashMs ? 1 : 0;
      context.translate(end.x, end.y); context.scale(pulse, pulse);
      const ringRadius = feedback.chargeRingRadiusPx + 8;
      context.lineWidth = 8; context.strokeStyle = '#17251b';
      context.beginPath(); context.arc(0, 0, ringRadius, 0, Math.PI * 2); context.stroke();
      context.lineWidth = 5; context.strokeStyle = '#FFF2CC';
      context.beginPath(); context.arc(0, 0, ringRadius, 0, Math.PI * 2); context.stroke();
      context.lineWidth = flash ? 7 : 5; context.strokeStyle = flash ? '#fff' : HERO_FX_COLORS.ranger.primary;
      context.beginPath(); context.arc(0, 0, ringRadius, -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * progress); context.stroke();
      context.font = '900 11px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.lineWidth = 3; context.strokeStyle = '#17251b'; context.fillStyle = '#fff7dc';
      context.strokeText(`${Math.round(progress * 100)}%`, 0, 0); context.fillText(`${Math.round(progress * 100)}%`, 0, 0);
      context.restore();
    }
  } else {
    rangerChargeVisuals.delete(player.id);
  }

  if (player.deadAimArrows > 0) {
    const serverNow = (state.serverTime || Date.now()) + (now - stateReceivedAt);
    const remaining = Math.max(0, (player.deadAimUntil || serverNow) - serverNow);
    const pipAlpha = remaining < 1000 ? Math.max(0.2, remaining / 1000) : 1;
    context.save(); context.globalAlpha = pipAlpha;
    for (let pip = 0; pip < player.deadAimArrows; pip++) {
      const angle = now * 0.004 + Math.PI * 2 * pip / Math.max(1, player.deadAimArrows);
      context.beginPath(); context.arc(center.x + Math.cos(angle) * 22, center.y - 101 + Math.sin(angle) * 6, 4, 0, Math.PI * 2);
      context.fillStyle = '#303728'; context.fill();
      context.beginPath(); context.arc(center.x + Math.cos(angle) * 22, center.y - 101 + Math.sin(angle) * 6, 2.5, 0, Math.PI * 2);
      context.fillStyle = HERO_FX_COLORS.ranger.primary; context.fill();
    }
    context.restore();
    if (player.id === me && window.lastPointerWorld) {
      const end = rangerAimEndpoint(player, config.ultRange);
      context.save(); context.globalAlpha = 1; context.fillStyle = '#17202bf2'; context.strokeStyle = '#303728'; context.lineWidth = 6;
      context.beginPath(); context.arc(end.x, end.y, 21, 0, Math.PI * 2); context.fill(); context.stroke();
      context.strokeStyle = '#ffd75e'; context.lineWidth = 3;
      context.beginPath(); context.arc(end.x, end.y, 21, 0, Math.PI * 2); context.stroke();
      context.font = '900 11px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.lineWidth = 3; context.strokeStyle = '#17202b'; context.fillStyle = '#fff2cc';
      context.strokeText(`×${player.deadAimArrows}`, end.x, end.y); context.fillText(`×${player.deadAimArrows}`, end.x, end.y);
      context.restore();
    }
  }
  const castAt = rangerUltimateFlashAt.get(player.id);
  if (castAt) {
    const age = now - castAt;
    if (age >= 50) rangerUltimateFlashAt.delete(player.id);
    else {
      context.save(); context.globalAlpha = 1 - age / 50; context.strokeStyle = '#fff2cc'; context.lineWidth = 4;
      context.beginPath(); context.arc(center.x, center.y, 24 + age * 0.25, 0, Math.PI * 2); context.stroke(); context.restore();
    }
  }
}

function drawTurrets(now) {
  for (const turret of state.turrets || []) {
    const visual = turretVisualState.get(turret.id) || { bornAt: now, shotsFired: turret.shotsFired, angleChangedAt: now, recoilUntil: 0, flashUntil: 0 };
    const pop = prefersReducedMotion || effectiveQuality() === 'low'
      ? 1 : Math.min(1, Math.max(0, (now - visual.bornAt) / GAME_CONFIG.turret.deployMs));
    const scale = turret.deploying ? Math.max(0.05, pop) : 1;
    if (debugTurretRanges) {
      context.save(); context.strokeStyle = 'rgba(255,255,255,.28)'; context.lineWidth = 1; context.setLineDash([6, 5]);
      for (const radius of [GAME_CONFIG.turret.radius, GAME_CONFIG.turret.range, GAME_CONFIG.turret.aggroRadius]) {
        context.beginPath(); context.arc(turret.x, turret.y, radius, 0, Math.PI * 2); context.stroke();
      }
      context.restore();
    }
    context.save(); context.translate(turret.x, turret.y); context.scale(scale, scale);
    const bodySprite = turretSpriteImages.body;
    const bodySize = GAME_CONFIG.turret.visuals.bodySize;
    context.drawImage(bodySprite || turretBodyCanvas, -bodySize.w / 2, -bodySize.h / 2, bodySize.w, bodySize.h);
    let angle = turret.angle;
    const visualSpec = GAME_CONFIG.turret.visuals;
    if (now - visual.angleChangedAt > 200) angle += Math.sin(now * visualSpec.idleSwaySpeed + turret.x) * visualSpec.idleSwayAmplitudeRad;
    let recoil = visual.recoilUntil > now ? visualSpec.recoilPx * (visual.recoilUntil - now) / visualSpec.recoilMs : 0;
    const barrelX = -4 - recoil;
    context.save();
    const pivot = GAME_CONFIG.turret.visuals.barrelPivot;
    context.translate(pivot.x - bodySize.w / 2, pivot.y - bodySize.h / 2);
    context.rotate(angle);
    const barrelSprite = turretSpriteImages.barrel;
    context.drawImage(barrelSprite || turretBarrelCanvas, barrelX, barrelSprite ? -barrelSprite.height / 2 : -8,
      barrelSprite ? barrelSprite.width : 34, barrelSprite ? barrelSprite.height : 16);
    if (visual.flashUntil > now) {
      context.fillStyle = '#fff4cf'; context.beginPath(); context.arc(27 - recoil, 0, visualSpec.muzzleFlashRadiusPx * (visual.flashUntil - now) / visualSpec.muzzleFlashMs, 0, Math.PI * 2); context.fill();
    }
    context.restore();
    if (turretHitFlashes.get(turret.id) > now) { context.fillStyle = 'rgba(255,255,255,.68)'; context.beginPath(); context.arc(0, 0, 19, 0, Math.PI * 2); context.fill(); }
    const ratio = Math.max(0, Math.min(1, turret.hp / GAME_CONFIG.turret.hp));
    const barX = -visualSpec.barWidth / 2, barY = visualSpec.barOffsetY;
    context.fillStyle = '#101018'; context.fillRect(barX - 1, barY - 1, visualSpec.barWidth + 2, visualSpec.hpBarHeight + 2);
    const hpGradient = context.createLinearGradient(barX, 0, barX + visualSpec.barWidth, 0);
    hpGradient.addColorStop(0, '#58cc64'); hpGradient.addColorStop(.5, '#f0d84a'); hpGradient.addColorStop(1, '#e64545');
    context.fillStyle = hpGradient; context.fillRect(barX, barY, visualSpec.barWidth * ratio, visualSpec.hpBarHeight);
    if (ratio < .3 && Math.sin(now * Math.PI / 1000) > 0) { context.strokeStyle = '#ff3030'; context.lineWidth = 2; context.strokeRect(barX - 2, barY - 2, visualSpec.barWidth + 4, visualSpec.hpBarHeight + 4); }
    const remainingMs = Math.max(0, turret.remainingMs - Math.max(0, now - stateReceivedAt));
    if (remainingMs <= GAME_CONFIG.turret.expiryWarningMs) {
      context.globalAlpha = 0.45 + 0.45 * Math.sin(now * Math.PI / 180);
      context.strokeStyle = '#ff593f'; context.lineWidth = 2;
      context.beginPath(); context.arc(0, 0, 27, 0, Math.PI * 2); context.stroke();
    }
    context.restore();
  }
}

function engineerPlacementPoint(player, target = window.lastPointerWorld) {
  const spec = GAME_CONFIG.heroes.engineer.turretSkill;
  const aim = player.aim || { x: 1, y: 0 };
  const wanted = target || { x: player.x + aim.x * spec.placeRange, y: player.y + aim.y * spec.placeRange };
  const dx = wanted.x - player.x, dy = wanted.y - player.y, distance = Math.hypot(dx, dy);
  const scale = distance > spec.placeRange ? spec.placeRange / distance : 1;
  const x = Math.max(GAME_CONFIG.turret.radius, Math.min(ARENA_WIDTH - GAME_CONFIG.turret.radius, player.x + dx * scale));
  const y = Math.max(GAME_CONFIG.turret.radius, Math.min(ARENA_HEIGHT - GAME_CONFIG.turret.radius, player.y + dy * scale));
  const valid = (px, py) => {
    const campfire = state.campfire || { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
    if (Math.hypot(px - campfire.x, py - campfire.y) < spec.minCampfireDist) return false;
    return !(state.turrets || []).some((turret) => Math.hypot(px - turret.x, py - turret.y) < spec.minSpacing);
  };
  if (valid(x, y)) return { x, y, valid: true };
  for (let radius = spec.snapStep; radius <= spec.snapRadius; radius += spec.snapStep) {
    let bestSpot = null;
    let bestDistance = spec.snapRadius + 1;
    for (let step = 0; step < spec.snapSlices; step += 1) {
      const angle = step * Math.PI * 2 / spec.snapSlices;
      const px = Math.max(GAME_CONFIG.turret.radius, Math.min(ARENA_WIDTH - GAME_CONFIG.turret.radius, x + Math.cos(angle) * radius));
      const py = Math.max(GAME_CONFIG.turret.radius, Math.min(ARENA_HEIGHT - GAME_CONFIG.turret.radius, y + Math.sin(angle) * radius));
      const actualDistance = Math.hypot(px - x, py - y);
      if (actualDistance < bestDistance && valid(px, py)) {
        bestDistance = actualDistance;
        bestSpot = { x: px, y: py, valid: true };
      }
    }
    if (bestSpot) return bestSpot;
  }
  return { x, y, valid: false };
}

function rangerMeatPlacementPoint(player, target = window.lastPointerWorld) {
  const spec = GAME_CONFIG.heroes.ranger.ranger;
  const aim = player.aim || { x: 1, y: 0 };
  const wanted = target || { x: player.x + aim.x * spec.meatRange, y: player.y + aim.y * spec.meatRange };
  const dx = wanted.x - player.x, dy = wanted.y - player.y;
  const distance = Math.hypot(dx, dy);
  const scale = distance > spec.meatRange ? spec.meatRange / distance : 1;
  const x = Math.max(0, Math.min(ARENA_WIDTH, player.x + dx * scale));
  const y = Math.max(0, Math.min(ARENA_HEIGHT, player.y + dy * scale));
  const valid = (px, py) => {
    const campfire = state.campfire || { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, radius: GAME_CONFIG.campfire.radius };
    return px >= 0 && py >= 0 && px <= ARENA_WIDTH && py <= ARENA_HEIGHT
      && Math.hypot(px - campfire.x, py - campfire.y) >= campfire.radius;
  };
  if (valid(x, y)) return { x, y, valid: true };
  for (let radius = spec.meatSnapStep; radius <= spec.meatSnapRadius; radius += spec.meatSnapStep) {
    let best = null, bestDistance = spec.meatSnapRadius + 1;
    for (let step = 0; step < spec.meatSnapSlices; step += 1) {
      const angle = step * Math.PI * 2 / spec.meatSnapSlices;
      const px = Math.max(0, Math.min(ARENA_WIDTH, x + Math.cos(angle) * radius));
      const py = Math.max(0, Math.min(ARENA_HEIGHT, y + Math.sin(angle) * radius));
      const actual = Math.hypot(px - x, py - y);
      if (actual < bestDistance && valid(px, py)) { best = { x: px, y: py, valid: true }; bestDistance = actual; }
    }
    if (best) return best;
  }
  return { x, y, valid: false };
}

function drawRangerMeatPlacementGhost() {
  const player = state.players?.find((candidate) => candidate.id === me);
  if (!player || player.heroId !== 'ranger' || player.downed || !rangerMeatTargeting) return;
  const spec = GAME_CONFIG.heroes.ranger.ranger;
  const spot = rangerMeatPlacementPoint(player);
  const accent = spot.valid ? '#B07A4A' : '#ff5151';
  context.save(); context.globalAlpha = 0.36; context.setLineDash([7, 6]);
  context.strokeStyle = '#fff2cc'; context.lineWidth = 2;
  context.beginPath(); context.arc(player.x, player.y, spec.meatRange, 0, Math.PI * 2); context.stroke();
  context.setLineDash([]); context.globalAlpha = 0.72; context.strokeStyle = '#303728'; context.lineWidth = 4;
  context.beginPath(); context.arc(spot.x, spot.y, 22, 0, Math.PI * 2); context.stroke();
  context.globalAlpha = 0.84; context.strokeStyle = accent; context.lineWidth = 2;
  context.beginPath(); context.arc(spot.x, spot.y, 22, 0, Math.PI * 2); context.stroke();
  context.globalAlpha = 0.58; context.font = '28px "Segoe UI Emoji", sans-serif';
  context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('🍖', spot.x, spot.y);
  context.restore();
}

function drawEngineerEffects(now) {
  for (const player of state.players || []) {
    if (player.heroId !== 'engineer') continue;
    const charge = player.engineerLaserCharge;
    if (charge) {
      const spec = GAME_CONFIG.heroes.engineer.laser;
      const chargeProgress = Math.max(0, Math.min(1, 1 - (charge.endsAt - Date.now()) / spec.chargeMs));
      const direction = Date.now() < charge.lockAt ? player.aim : charge.aim;
      const angle = Math.atan2(direction.y, direction.x);
      let length = spec.length;
      if (direction.x > 0) length = Math.min(length, (ARENA_WIDTH - player.x) / direction.x);
      else if (direction.x < 0) length = Math.min(length, -player.x / direction.x);
      if (direction.y > 0) length = Math.min(length, (ARENA_HEIGHT - player.y) / direction.y);
      else if (direction.y < 0) length = Math.min(length, -player.y / direction.y);
      context.save(); context.translate(player.x, player.y); context.rotate(angle);
      context.globalAlpha = player.id === me ? 1 : 0.5;
      context.fillStyle = `rgba(255,201,60,${0.15 + 0.2 * chargeProgress})`; context.fillRect(0, -spec.width / 2, length, spec.width);
      context.setLineDash([14, 10]); context.lineCap = 'butt';
      context.strokeStyle = 'rgba(12,12,18,.8)'; context.lineWidth = 7; context.strokeRect(0, -spec.width / 2, length, spec.width);
      context.strokeStyle = '#FFC93C'; context.lineWidth = 4; context.strokeRect(0, -spec.width / 2, length, spec.width);
      context.restore();
    }
  }
  const local = state.players?.find((player) => player.id === me);
  if (local?.heroId === 'engineer' && !local.downed && engineerPlacementTargeting) {
    const spec = GAME_CONFIG.heroes.engineer.turretSkill;
    const spot = engineerPlacementPoint(local);
    context.save(); context.globalAlpha = 0.22; context.strokeStyle = '#fff'; context.lineWidth = 1.5;
    context.beginPath(); context.arc(local.x, local.y, spec.placeRange, 0, Math.PI * 2); context.stroke();
    context.globalAlpha = 0.24; context.strokeStyle = '#ff593f'; context.lineWidth = 1.5; context.setLineDash([7, 5]);
    context.beginPath(); context.arc(spot.x, spot.y, GAME_CONFIG.turret.expiry.radius, 0, Math.PI * 2); context.stroke();
    context.setLineDash([]);
    const fire = state.campfire;
    if (fire && Math.hypot(fire.x - spot.x, fire.y - spot.y) <= GAME_CONFIG.turret.expiry.radius + fire.radius) {
      context.globalAlpha = 0.35; context.strokeStyle = '#ff593f';
      context.beginPath(); context.arc(fire.x, fire.y, fire.radius + 6, 0, Math.PI * 2); context.stroke();
    }
    context.globalAlpha = 0.4; context.fillStyle = spot.valid ? '#fff' : '#ff5151';
    context.beginPath(); context.arc(spot.x, spot.y, GAME_CONFIG.turret.radius, 0, Math.PI * 2); context.fill();
    context.globalAlpha = 0.28; context.drawImage(turretBodyCanvas, spot.x - 22, spot.y - 16);
    context.restore();
  }
  for (let i = engineerLaserBeams.length - 1; i >= 0; i -= 1) {
    const beam = engineerLaserBeams[i], progress = (now - beam.startedAt) / beam.durationMs;
    if (progress >= 1) { engineerLaserBeams.splice(i, 1); continue; }
    const fade = Math.max(0, progress > 0.68 ? (1 - progress) / 0.32 : 1);
    const reduced = prefersReducedMotion || effectiveQuality() === 'low';
    // Overclock beam: one soft-edged, tapered capsule (narrow at the muzzle,
    // rounded nose at the hit-line end) filled with a cross-beam gradient, a
    // hot core, and a slight flicker. Full hit width stays readable while it
    // is live; it only thins as it dissipates.
    const flicker = reduced ? 1 : 1 + 0.05 * Math.sin(now * 0.09 + i) + 0.03 * Math.sin(now * 0.23);
    const len = beam.length, half = beam.width / 2 * flicker * (0.55 + 0.45 * fade);
    const capsule = (h, startTaper, nose) => {
      context.beginPath(); context.moveTo(0, -h * 0.3); context.quadraticCurveTo(startTaper * 0.35, -h, startTaper, -h);
      context.lineTo(len - nose, -h); context.quadraticCurveTo(len, -h, len, 0); context.quadraticCurveTo(len, h, len - nose, h);
      context.lineTo(startTaper, h); context.quadraticCurveTo(startTaper * 0.35, h, 0, h * 0.3); context.closePath();
    };
    const startTaper = Math.min(70, len * 0.15), nose = Math.min(half * 1.1, len * 0.2);
    context.save(); context.translate(beam.x, beam.y); context.rotate(Math.atan2(beam.dy, beam.dx));
    const glow = context.createLinearGradient(0, -half, 0, half);
    glow.addColorStop(0, 'rgba(255,138,31,0.12)'); glow.addColorStop(0.16, 'rgba(255,138,31,0.6)'); glow.addColorStop(0.34, 'rgba(255,210,122,0.92)');
    glow.addColorStop(0.5, 'rgba(255,253,240,1)'); glow.addColorStop(0.66, 'rgba(255,210,122,0.92)'); glow.addColorStop(0.84, 'rgba(255,138,31,0.6)'); glow.addColorStop(1, 'rgba(255,138,31,0.12)');
    context.globalAlpha = fade; context.fillStyle = glow; capsule(half, startTaper, nose); context.fill();
    const coreJitter = reduced ? 0 : (Math.random() - 0.5) * beam.width * 0.03;
    context.translate(0, coreJitter); context.fillStyle = '#fff'; context.globalAlpha = fade * 0.95;
    capsule(Math.max(2, half * 0.2), startTaper * 0.8, Math.min(half * 0.4, len * 0.1)); context.fill(); context.translate(0, -coreJitter);
    if (!reduced) {
      // Energy pulses racing down the core.
      context.globalAlpha = fade * 0.55; context.strokeStyle = '#FFF6D0'; context.lineCap = 'round'; context.lineWidth = Math.max(2, half * 0.5);
      context.setLineDash([26, 54]); context.lineDashOffset = -now * 1.4;
      context.beginPath(); context.moveTo(startTaper, 0); context.lineTo(len - nose, 0); context.stroke(); context.setLineDash([]);
    }
    // Muzzle flare and a small impact bloom where the beam ends.
    const muzzle = context.createRadialGradient(0, 0, 0, 0, 0, 26);
    muzzle.addColorStop(0, 'rgba(255,246,208,1)'); muzzle.addColorStop(0.5, 'rgba(255,210,122,0.7)'); muzzle.addColorStop(1, 'rgba(255,159,28,0)');
    context.globalAlpha = fade; context.fillStyle = muzzle; context.beginPath(); context.arc(0, 0, 26 * (0.6 + 0.4 * fade), 0, Math.PI * 2); context.fill();
    context.translate(len, 0);
    const bloom = context.createRadialGradient(0, 0, 0, 0, 0, half * 0.9);
    bloom.addColorStop(0, 'rgba(255,246,208,0.9)'); bloom.addColorStop(1, 'rgba(255,159,28,0)');
    context.globalAlpha = fade * 0.7; context.fillStyle = bloom; context.beginPath(); context.arc(0, 0, half * 0.9, 0, Math.PI * 2); context.fill();
    context.restore();
  }
  for (const [id, popup] of engineerSalvagePopups) {
    const progress = (now - popup.startedAt) / GAME_CONFIG.heroes.engineer.salvage.popupMs;
    if (progress >= 1) { engineerSalvagePopups.delete(id); continue; }
    context.save(); context.globalAlpha = Math.max(0, 1 - progress); context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = '900 18px system-ui, sans-serif'; context.textLineJoin = 'round';
    context.lineWidth = 5; context.strokeStyle = '#18202B'; context.fillStyle = '#FFD27A';
    const y = popup.y - 28 - progress * 18;
    context.strokeText('REFUELLED!', popup.x, y); context.fillText('REFUELLED!', popup.x, y);
    context.restore();
  }
}

// Filled crescent along +x from 0 to len with pointed, tapered tips. The outer
// edge bows by bow + thickness/2 and the inner by bow - thickness/2, so the
// blade is `thickness` thick near `peak` (0-1 along it) and thins to a point.
function crescentPath(len, thickness, bow = 0, peak = 0.5) {
  context.beginPath(); context.moveTo(0, 0);
  context.quadraticCurveTo(len * peak, -2 * (bow + thickness / 2), len, 0);
  context.quadraticCurveTo(len * peak, -2 * (bow - thickness / 2), 0, 0); context.closePath();
}
const SAMURAI_MARK_LEN = Math.hypot(40, 32), SAMURAI_MARK_TILT = Math.atan2(-32, 40);

function drawSamuraiWorldEffects(now) {
  const fx = HERO_FX_COLORS.samurai.primary;
  const slashMs = SAMURAI_SLASH_FADE_MS;
  // Dash streak: a crescent wisp that is thin at the launch point and fullest
  // just behind the hero, with a white edge riding inside it.
  const drawBlade = (startX, startY, endX, endY, width, alpha, accent = true) => {
    const dx = endX - startX, dy = endY - startY, len = Math.hypot(dx, dy);
    if (len < 1) return;
    context.save(); context.translate(startX, startY); context.rotate(Math.atan2(dy, dx));
    context.globalAlpha = Math.max(0, alpha); context.fillStyle = fx; crescentPath(len, width * 1.5, width * 0.35, 0.72); context.fill();
    context.globalAlpha *= 0.95; context.fillStyle = accent ? '#fff' : '#E6DFFF'; crescentPath(len, Math.max(2, width * 0.45), width * 0.35, 0.72); context.fill();
    context.restore();
  };
  for (const [playerId, trail] of samuraiDashTrails) {
    const age = now - trail.startedAt;
    const progress = Math.max(0, Math.min(1, age / Math.max(1, trail.durationMs)));
    const fromX = trail.startX, fromY = trail.startY;
    const toX = trail.startX + (trail.endX - trail.startX) * progress;
    const toY = trail.startY + (trail.endY - trail.startY) * progress;
    const fade = age <= trail.durationMs ? 0.95 : Math.max(0, 1 - (age - trail.durationMs) / SAMURAI_DASH_AFTERIMAGE_MS);
    if (fade > 0) drawBlade(fromX, fromY, toX, toY, trail.kind === 'afterimage-cut' ? 11 : 8, fade, true);
    if (age > trail.durationMs + SAMURAI_DASH_AFTERIMAGE_MS) samuraiDashTrails.delete(playerId);
  }
  const serverNow = (state.serverTime || Date.now()) + (now - stateReceivedAt);
  for (const player of state.players || []) {
    const action = player.samuraiAction;
    if (player.heroId !== 'samurai' || action?.phase !== 'sheathe') continue;
    const delayStart = action.startedAt + action.durationMs;
    const progress = Math.max(0, Math.min(1, (serverNow - delayStart) / Math.max(1, action.cutAt - delayStart)));
    const begin = -action.cutPad;
    const finish = action.distance + action.cutPad;
    const sx = action.startX + action.direction.x * begin;
    const sy = action.startY + action.direction.y * begin;
    const ex = action.startX + action.direction.x * finish;
    const ey = action.startY + action.direction.y * finish;
    const alpha = (0.15 + 0.25 * progress) * (player.id === me ? 1 : 0.5);
    context.save(); context.setLineDash([12, 9]); context.lineCap = 'butt';
    context.globalAlpha = alpha; context.strokeStyle = '#17202B'; context.lineWidth = action.width + 5;
    context.beginPath(); context.moveTo(sx, sy); context.lineTo(ex, ey); context.stroke();
    context.globalAlpha = alpha; context.strokeStyle = fx; context.lineWidth = action.width;
    context.beginPath(); context.moveTo(sx, sy); context.lineTo(ex, ey); context.stroke();
    context.setLineDash([]); context.globalAlpha = alpha * 0.9; context.strokeStyle = '#E6DFFF'; context.lineWidth = 2;
    context.beginPath(); context.moveTo(sx, sy); context.lineTo(ex, ey); context.stroke(); context.restore();
  }
  for (let i = samuraiSlashEffects.length - 1; i >= 0; i--) {
    const slash = samuraiSlashEffects[i], age = now - slash.startedAt;
    if (age >= slashMs) { samuraiSlashEffects.splice(i, 1); continue; }
    const grow = Math.min(1, age / SAMURAI_SLASH_GROW_MS);
    const fade = age <= SAMURAI_SLASH_GROW_MS ? 1 : 1 - (age - SAMURAI_SLASH_GROW_MS) / (slashMs - SAMURAI_SLASH_GROW_MS);
    const width = 2 + (slash.width - 2) * grow;
    const dx = slash.endX - slash.startX, dy = slash.endY - slash.startY, len = Math.hypot(dx, dy);
    if (len < 1) continue;
    // Afterimage Cut: one sweeping crescent (violet body, lavender edge, white
    // core) bowed inside the cut band, over a faint band showing the true
    // cut width, plus a thin counter-arc for a second, quicker stroke.
    const bow = width * 0.1, reach = len * (0.4 + 0.6 * grow);
    context.save(); context.translate(slash.startX, slash.startY); context.rotate(Math.atan2(dy, dx));
    context.globalAlpha = 0.16 * fade; context.fillStyle = fx; context.beginPath(); context.roundRect(0, -width / 2, len, width, width / 2); context.fill();
    context.globalAlpha = 0.6 * fade; crescentPath(reach, width * 0.8, bow, 0.56); context.fill();
    context.globalAlpha = 0.7 * fade; context.fillStyle = '#DCD5FF'; crescentPath(reach, width * 0.45, bow, 0.56); context.fill();
    context.globalAlpha = 0.95 * fade; context.fillStyle = '#fff'; crescentPath(reach, Math.max(2, width * 0.16), bow, 0.56); context.fill();
    context.globalAlpha = 0.45 * fade * grow; crescentPath(len, Math.max(2, width * 0.1), -width * 0.22, 0.44); context.fill();
    context.restore();
  }
  for (let i = samuraiHitMarks.length - 1; i >= 0; i--) {
    const mark = samuraiHitMarks[i], progress = (now - mark.startedAt) / SAMURAI_HIT_MARK_MS;
    if (progress >= 1) { samuraiHitMarks.splice(i, 1); continue; }
    // Same diagonal as before, now a tapered crescent nick instead of a capsule.
    const thick = mark.execute ? 12 : 9;
    context.save(); context.translate(mark.x, mark.y); context.rotate(mark.angle + SAMURAI_MARK_TILT); context.translate(-SAMURAI_MARK_LEN / 2, 0);
    context.globalAlpha = 1 - progress; context.fillStyle = fx; crescentPath(SAMURAI_MARK_LEN, thick, 4, 0.55); context.fill();
    context.fillStyle = '#fff'; crescentPath(SAMURAI_MARK_LEN, thick * 0.38, 4, 0.55); context.fill(); context.restore();
  }
  for (let i = samuraiExecuteLabels.length - 1; i >= 0; i--) {
    const label = samuraiExecuteLabels[i], progress = (now - label.startedAt) / SAMURAI_EXECUTE_LABEL_MS;
    if (progress >= 1) { samuraiExecuteLabels.splice(i, 1); continue; }
    context.save(); context.globalAlpha = Math.max(0, 1 - progress); context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = '900 18px system-ui, sans-serif'; context.lineJoin = 'round';
    context.lineWidth = 5; context.strokeStyle = '#18202B'; context.fillStyle = '#FFD27A';
    const y = label.y - 28 - progress * 18;
    context.strokeText('EXECUTED!', label.x, y); context.fillText('EXECUTED!', label.x, y); context.restore();
  }
  for (let i = samuraiCutNumberLabels.length - 1; i >= 0; i--) {
    const label = samuraiCutNumberLabels[i], progress = (now - label.startedAt) / 600;
    if (progress >= 1) { samuraiCutNumberLabels.splice(i, 1); continue; }
    context.save(); context.globalAlpha = 1 - progress; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.font = 'bold 14px system-ui, sans-serif'; context.lineJoin = 'round';
    context.lineWidth = 4; context.strokeStyle = '#18202B'; context.fillStyle = '#E6DFFF';
    context.strokeText(`x${label.multiplier.toFixed(1)}`, label.x, label.y - 30 - progress * 18);
    context.fillText(`x${label.multiplier.toFixed(1)}`, label.x, label.y - 30 - progress * 18);
    context.restore();
  }
}

function drawScene(timestamp) {
  const currentTime = timestamp || performance.now();
  if (currentTime - lastHudUpdateAt >= ARENA_TUNING.performance.hudUpdateMs) {
    updateHud(currentTime);
    lastHudUpdateAt = currentTime;
  }
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
  lastTime = currentTime;
  context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';
  context.shadowBlur = 0;
  context.setLineDash([]);
  if (touchViewport.matches) {
    context.fillStyle = '#2F5E3E';
    context.fillRect(0, 0, innerWidth, innerHeight);
  }
  context.save();
  const traumaElapsed = Math.max(0, (currentTime - lastTraumaUpdateAt) / 1000);
  trauma = Math.max(0, trauma - SHAKE_DECAY * traumaElapsed);
  lastTraumaUpdateAt = currentTime;
  if (settings.screenShake && settings.shakeIntensity > SHAKE_MIN_INTENSITY && trauma > 0) {
    // Slider re-scale: 50% is the neutral point and reproduces exactly what the
    // old 0-100 slider produced at 100% (trauma^2 * SHAKE_MAX_OFFSET *
    // slider / 50), with a hard px cap so 200% cannot become a slideshow.
    const offset = Math.min(SHAKE_ABSOLUTE_CAP_PX,
      trauma * trauma * SHAKE_MAX_OFFSET * settings.shakeIntensity / SHAKE_SLIDER_REFERENCE);
    const noiseX = smoothShakeNoise(currentTime);
    const noiseY = smoothShakeNoise(currentTime, SHAKE_NOISE_SECONDARY_PHASE);
    context.translate(noiseX * offset, noiseY * offset);
  }
  const mobileCamera = mobileCameraView();
  if (mobileCamera) {
    context.translate(innerWidth / (2 * mobileCamera.scale) - mobileCamera.x,
      innerHeight / (2 * mobileCamera.scale) - mobileCamera.y);
    context.scale(mobileCamera.scale, mobileCamera.scale);
  }
  if (currentTime < cameraZoom.until) {
    const centerX = ARENA_WIDTH / 2, centerY = ARENA_HEIGHT / 2;
    const progress = (currentTime - cameraZoom.startedAt) / (cameraZoom.until - cameraZoom.startedAt);
    const pulse = 1 - Math.abs(progress * 2 - 1);
    const scale = 1 + (cameraZoom.scale - 1) * pulse;
    context.translate(centerX, centerY); context.scale(scale, scale); context.translate(-centerX, -centerY);
  } else cameraZoom.scale = 1;

  // Overscan the background by the maximum shake offset so the camera
  // translate can never expose an unpainted strip at the arena edge (the
  // canvas is opaque and never cleared, so a strip would show stale pixels).
  const shakeOverscan = SHAKE_MAX_OFFSET;
  context.drawImage(backgroundCanvas, -shakeOverscan, -shakeOverscan,
    ARENA_WIDTH + shakeOverscan * 2, ARENA_HEIGHT + shakeOverscan * 2);
  drawFairyVortexGround(currentTime);
  drawDustPuffs(currentTime, dt);

  // 1. Draw Campfire in the middle
  const cf = state.campfire || {
    x: GAME_CONFIG.arena.width / 2,
    y: GAME_CONFIG.arena.height / 2,
    radius: GAME_CONFIG.campfire.radius,
    hp: GAME_CONFIG.campfire.hp,
    maxHp: GAME_CONFIG.campfire.hp,
  };
  if (cf) {
    // Permanent rings: pre-rendered sprites (dashed colored stroke
    // + fill), blitted once each. The sprite stroke is baked at full alpha so
    // the heal ring's gentle pulse keeps the stroke at or above the
    // AREA_RING_STROKE_ALPHA floor; the Thorns ring stays steady.
    context.save();
    const pulse = AREA_RING_STROKE_ALPHA + (1 - AREA_RING_STROKE_ALPHA) * (0.5 + 0.5 * Math.sin(currentTime * 0.0015));
    const healRing = ringSprite('heal', ARENA_TUNING.campfire.healRadius,
      AREA_COLORS.healStroke, AREA_COLORS.healFill, AREA_RING_WIDTH, 1);
    context.globalAlpha = pulse;
    context.drawImage(healRing.canvas, cf.x - healRing.size / 2, cf.y - healRing.size / 2);
    if ((state.activeBuffs || []).some((buff) => buff.id === 'thorns')) {
      const thornsRing = ringSprite('thorns', ARENA_TUNING.cards.effects.thornsRadius,
        AREA_COLORS.thornsStroke, AREA_COLORS.thornsFill, AREA_RING_WIDTH, 1);
      context.globalAlpha = 1;
      context.drawImage(thornsRing.canvas, cf.x - thornsRing.size / 2, cf.y - thornsRing.size / 2);
    }
    context.restore();

    for (const player of state.players || []) {
      const inside = Math.hypot(player.x - cf.x, player.y - cf.y) <= ARENA_TUNING.campfire.healRadius;
      const now = performance.now();
      if (inside && player.hp < player.maxHp && now - (healParticleAt.get(player.id) || 0) >= ARENA_TUNING.campfire.healParticleIntervalMs) {
        healParticleAt.set(player.id, now);
        addParticle({ x: player.x, y: player.y - 18, vx: 0, vy: -28, radius: 10, color: '#7af29a', alpha: 1, text: '+', decay: 0.03 });
      }
    }
    if (cf.hp > 0) {
      const glowRadius = 90 + Math.sin(currentTime * 0.005) * 8;
      const fireGlow = context.createRadialGradient(cf.x, cf.y, 10, cf.x, cf.y, glowRadius);
      fireGlow.addColorStop(0, 'rgba(255, 120, 20, 0.22)');
      fireGlow.addColorStop(0.5, 'rgba(255, 70, 0, 0.08)');
      fireGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = fireGlow;
      context.beginPath();
      context.arc(cf.x, cf.y, glowRadius, 0, Math.PI * 2);
      context.fill();

      // Ambient rising fire embers
      if (Math.random() < 0.25) {
        addParticle({
          x: cf.x + (Math.random() - 0.5) * 24,
          y: cf.y + (Math.random() - 0.5) * 12,
          vx: (Math.random() - 0.5) * 15,
          vy: -25 - Math.random() * 25,
          radius: 1.5 + Math.random() * 1.5,
          color: Math.random() > 0.4 ? '#ffea00' : '#ff4500',
          alpha: 0.9,
          decay: 0.03 + Math.random() * 0.03,
        });
      }
    }

    drawCampfire(context, cf, currentTime);
  }

  drawFairyVortexStructures(currentTime);
  drawRangerAimGuides();

  // 2. Draw Zombie Monsters
  if (Array.isArray(state.monsters)) {
    for (const monster of state.monsters) {
      const hitFx = enemyHitFx.get(monster.id);
      const hitProgress = hitFx ? Math.min(1, (currentTime - hitFx.startedAt) / hitFx.durationMs) : 1;
      if (hitFx && hitProgress >= 1) enemyHitFx.delete(monster.id);
      const mx = monster.x + (hitFx ? hitFx.x * (1 - hitProgress) : 0);
      const my = monster.y + (hitFx ? hitFx.y * (1 - hitProgress) : 0);
      const hitFlash = (enemyHitFlashUntil.get(monster.id) || 0) > currentTime;
      // Monster shadow
      context.beginPath();
      context.ellipse(mx, my + 16, 12, 5, 0, 0, Math.PI * 2);
      context.fillStyle = 'rgba(0, 0, 0, 0.2)';
      context.fill();

      // Give the pale zombie emoji an opaque backdrop so it reads clearly on grass.
      context.save();
      const fading = monster.isDummy && monster.fadeRemainingMs > 0;
      context.globalAlpha = fading ? Math.max(0, monster.fadeRemainingMs / 400) : 1;
      context.globalCompositeOperation = 'source-over';
      const pulse = monster.type === 'exploder' ? 1 + Math.sin(currentTime * 0.012) * 0.09 : 1;
      const scale = (monster.scale || 1) * pulse * (monster.held ? 0.85 : 1);
      const visualRadius = 20 * scale;
      if (monster.type === 'dummy') {
        drawTrainingDummy(context, mx, my, scale, hitFlash);
        context.restore();
        if (!fading) {
          const barW = 28 * scale;
          context.fillStyle = 'rgba(35, 56, 47, 0.75)';
          context.fillRect(mx - barW / 2 - 1, my - 34 * scale - 1, barW + 2, 6);
          context.fillStyle = '#7FAE58';
          context.fillRect(mx - barW / 2, my - 34 * scale, barW * Math.max(0, monster.hp / monster.maxHp), 4);
        }
        continue;
      }
      const tint = monster.type === 'brute-king' ? '#7e222c' : monster.type === 'brute' ? '#514638'
        : monster.type === 'exploder' ? '#b86b28' : '#4B3D58';
      context.beginPath();
      context.arc(mx, my, visualRadius, 0, Math.PI * 2);
      context.fillStyle = hitFlash ? '#fff' : tint;
      context.fill();
      // Dusk-purple bodies with an ink rim stand apart from the green floor.
      context.strokeStyle = monster.isBoss ? '#ff5f69' : monster.type === 'exploder' ? '#ffb34f' : '#1D2A22';
      context.lineWidth = monster.isBoss ? 4 : 3;
      context.stroke();
      context.font = `${32 * scale}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      if (hitFlash) {
        const g = particleWhiteGlyph(monster.emoji || '🧟', 32 * scale);
        context.drawImage(g.canvas, mx - g.w / 2, my - g.h / 2, g.w, g.h);
      } else {
        context.fillText(monster.emoji || '🧟', mx, my);
      }
      if (monster.isBoss) { context.font = '24px sans-serif'; context.fillText('👑', mx, my - visualRadius - 9); }
      context.restore();

      // Monster health bar
      const mBarW = monster.isBoss ? 70 : 28 * scale;
      const mBarH = 4;
      const mBarX = mx - mBarW / 2;
      const mBarY = my - visualRadius;
      if (!fading) {
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(mBarX - 1, mBarY - 1, mBarW + 2, mBarH + 2);
        const mHpRatio = Math.max(0, monster.hp / monster.maxHp);
        context.fillStyle = mHpRatio > 0.4 ? '#4caf50' : '#e53935';
        context.fillRect(mBarX, mBarY, mBarW * mHpRatio, mBarH);
      }
      if (monster.type === 'skeleton' && monster.skeletonWindupMs > 0) {
        context.save(); context.globalAlpha = 0.55 + Math.sin(currentTime * 0.025) * 0.2;
        context.fillStyle = '#ff6868'; context.beginPath(); context.arc(mx, my, 24, 0, Math.PI * 2); context.fill();
        context.globalAlpha = 1; context.font = 'bold 18px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillStyle = '#fff'; context.fillText('!', mx, my - 32); context.restore();
      }
    }
  }

  for (const monster of state.monsters || []) {
    const mark = (monster.rangerMarks || []).find((entry) => entry.ownerId === me);
    if (!mark) continue;
    context.save(); context.globalAlpha = mark.remainingMs < 1000 ? Math.max(0.25, mark.remainingMs / 1000) : 1;
    context.font = '19px "Segoe UI Emoji", sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.lineWidth = 3; context.strokeStyle = '#303728';
    context.strokeText('🐾', monster.x, monster.y - (monster.radius || 18) - 16);
    context.fillText('🐾', monster.x, monster.y - (monster.radius || 18) - 16);
    context.restore();
  }
  drawRangerMeatThrows(currentTime);
  drawRangerWolves(currentTime);
  drawRangerWolfBiteFx(currentTime);
  drawRangerDeadAimStreaks(currentTime);
  drawRangerMeatPlacementGhost();
  drawTurrets(currentTime);
  drawEngineerEffects(currentTime);
  drawFairyWindFeedback(currentTime);

  for (const pickup of state.pickups || []) {
    context.save(); context.globalAlpha = 0.85 + Math.sin(currentTime * 0.01) * 0.15;
    context.font = '24px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(pickup.type === 'supply' ? '💚' : '❤️', pickup.x, pickup.y); context.restore();
  }

  for (let i = deathSprites.length - 1; i >= 0; i--) {
    const death = deathSprites[i];
    const g = particleEmojiGlyph(death.emoji, 32 * death.scalePeak);
    if (currentTime < death.startedAt) {
      context.drawImage(g.canvas, death.x - g.w / 2, death.y - g.h / 2, g.w, g.h);
      continue;
    }
    const progress = Math.min(1, (currentTime - death.startedAt) / death.durationMs);
    if (progress >= 1) { deathSprites.splice(i, 1); continue; }
    const scale = progress < 0.25
      ? ARENA_TUNING.deathBurst.scaleStart + (death.scalePeak - ARENA_TUNING.deathBurst.scaleStart) * (progress / 0.25)
      : death.scalePeak * (1 - (progress - 0.25) / 0.75);
    context.save(); context.globalAlpha = 1 - progress; context.translate(death.x, death.y); context.scale(scale, scale);
    context.drawImage(g.canvas, -g.w / 2, -g.h / 2, g.w, g.h); context.restore();
  }
  context.globalAlpha = 1;

  for (const spawn of state.spawnTelegraphs || []) {
    const elapsed = Math.max(0, currentTime - stateReceivedAt);
    const remaining = Math.max(0, spawn.remainingMs - elapsed);
    const progress = Math.max(0, Math.min(1, 1 - remaining / ARENA_TUNING.briefing.spawnTelegraphMs));
    const radius = 10 + progress * 18;
    context.save(); context.globalAlpha = 0.25 + progress * 0.5;
    context.strokeStyle = '#d4c69c'; context.lineWidth = 3;
    context.beginPath(); context.ellipse(spawn.x, spawn.y, radius, radius * 0.45, 0, 0, Math.PI * 2); context.stroke();
    context.fillStyle = 'rgba(218, 206, 168, .18)';
    context.beginPath(); context.arc(spawn.x, spawn.y, radius * progress, 0, Math.PI * 2); context.fill();
    context.restore();
  }

  for (const trap of state.traps || []) {
    context.beginPath(); context.arc(trap.x, trap.y, trap.radius || 14, 0, Math.PI * 2);
    context.fillStyle = 'rgba(255, 130, 45, .45)'; context.fill();
    context.strokeStyle = '#ff8c32'; context.lineWidth = 2; context.stroke();
    context.font = '16px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText('💣', trap.x, trap.y);
  }
  for (let i = areaEffects.length - 1; i >= 0; i--) {
    const effect = areaEffects[i];
    const progress = Math.min(1, (currentTime - effect.startedAt) / Math.max(1, effect.durationMs));
    if (progress >= 1) { areaEffects.splice(i, 1); continue; }
    // Color rules (config AREA_COLORS): enemy danger zones are strong red,
    // player area effects are bright yellow-orange, and the Electromancer's
    // stun burst keeps its own purple FX color so its identity survives.
    const electroStun = effect.sourceHeroId === 'electromancer' && effect.sourceAbility === 'skill';
    const fairyFx = effect.sourceHeroId === 'fairy';
    const fairyGale = effect.sourceHeroId === 'fairy' && effect.sourceAbility === 'skill';
    const rangerDeadAimFx = effect.sourceHeroId === 'ranger' && effect.sourceAbility === 'ultimate';
    const danger = effect.kind === 'enemy';
    const stroke = rangerDeadAimFx ? '#FFF2CC' : fairyFx ? HERO_FX_COLORS.fairy.primary : electroStun ? HERO_FX_COLORS.electromancer.primary : danger ? AREA_COLORS.enemyStroke : AREA_COLORS.playerStroke;
    const fillColor = rangerDeadAimFx ? '#F0DDA0' : fairyFx ? HERO_FX_COLORS.fairy.primary : electroStun ? HERO_FX_COLORS.electromancer.primary : danger ? AREA_COLORS.enemyFill : AREA_COLORS.playerFill;
    context.save();
    if (effect.phase === 'telegraph') {
      // The Bombardier's ultimate marker fills like a clock hand sweeping
      // clockwise from 12 o'clock (the same read as the ability cooldown
      // ring) instead of ramping opacity, so the time left before impact is
      // visible at a glance. Every other telegraph keeps the alpha ramp.
      const sweepMarker = effect.sourceHeroId === 'bombardier' && effect.sourceAbility === 'ultimate';
      if (sweepMarker) {
        // Faint base disc: the danger area reads immediately, and the wedge
        // fills the inner circle on top of it.
        context.globalAlpha = AREA_TELEGRAPH_SWEEP_BASE_ALPHA;
        context.fillStyle = fillColor;
        context.beginPath(); context.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); context.fill();
        const sweepStart = -Math.PI / 2;
        const sweepEnd = sweepStart + Math.PI * 2 * progress;
        context.globalAlpha = AREA_TELEGRAPH_SWEEP_FILL_ALPHA;
        context.beginPath();
        context.moveTo(effect.x, effect.y);
        context.arc(effect.x, effect.y, effect.radius, sweepStart, sweepEnd);
        context.closePath(); context.fill();
        // Solid leading edge, otherwise the wedge boundary is hard to read
        // against the base disc on the bright green floor.
        context.globalAlpha = AREA_TELEGRAPH_SWEEP_HAND_ALPHA;
        context.strokeStyle = stroke;
        context.lineWidth = AREA_TELEGRAPH_SWEEP_HAND_WIDTH;
        context.beginPath();
        context.moveTo(effect.x, effect.y);
        context.lineTo(effect.x + Math.cos(sweepEnd) * effect.radius, effect.y + Math.sin(sweepEnd) * effect.radius);
        context.stroke();
      } else {
        // Inner fill rises 20% -> 45% (danger zones slightly stronger) while
        // the OUTLINE stays at full brightness for the whole telegraph.
        const endAlpha = danger ? AREA_ENEMY_FILL_END_ALPHA : AREA_TELEGRAPH_FILL_END_ALPHA;
        const fillAlpha = AREA_TELEGRAPH_FILL_START_ALPHA + (endAlpha - AREA_TELEGRAPH_FILL_START_ALPHA) * progress;
        context.globalAlpha = fillAlpha;
        context.fillStyle = fillColor;
        context.beginPath(); context.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); context.fill();
      }
      // Dashed colored main stroke (never fades).
      context.globalAlpha = AREA_TELEGRAPH_STROKE_ALPHA;
      context.strokeStyle = stroke;
      context.lineWidth = AREA_TELEGRAPH_WIDTH;
      context.setLineDash([AREA_DASH_ON, AREA_DASH_OFF]);
      context.beginPath(); context.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); context.stroke();
      context.setLineDash([]);
      // Large enemy telegraphs get a centre marker so the danger zone centre
      // is unambiguous even at a glance.
      if (danger && effect.radius >= AREA_ENEMY_MARKER_MIN_RADIUS) {
        const marker = emojiGlyph('💀', 26);
        context.globalAlpha = 0.9;
        context.drawImage(marker.canvas, effect.x - marker.w / 2, effect.y - marker.h / 2, marker.w, marker.h);
      }
    } else if (rangerDeadAimFx) {
      const ringRadius = effect.radius * (0.2 + progress * 1.15);
      context.globalAlpha = 0.22 * (1 - progress);
      context.fillStyle = '#FFD75E';
      context.beginPath(); context.arc(effect.x, effect.y, effect.radius * (1 - progress * 0.45), 0, Math.PI * 2); context.fill();
      context.globalAlpha = 1 - progress;
      context.strokeStyle = '#FFF8D8'; context.lineWidth = 5;
      context.beginPath(); context.arc(effect.x, effect.y, ringRadius, 0, Math.PI * 2); context.stroke();
      context.globalAlpha = (1 - progress) * 0.85;
      context.strokeStyle = '#8BE04E'; context.lineWidth = 2;
      context.beginPath(); context.arc(effect.x, effect.y, ringRadius * 0.72, 0, Math.PI * 2); context.stroke();
      const burst = emojiGlyph('💥', 48 * (1 - progress * 0.45));
      context.globalAlpha = 1 - progress;
      context.drawImage(burst.canvas, effect.x - burst.w / 2, effect.y - burst.h / 2, burst.w, burst.h);
    } else if (fairyGale) {
      context.globalAlpha = 0.16 * (1 - progress * 0.6); context.fillStyle = fillColor;
      context.beginPath(); context.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); context.fill();
      context.globalAlpha = 1 - progress * 0.35; context.strokeStyle = fillColor; context.lineWidth = AREA_TELEGRAPH_WIDTH;
      context.setLineDash([AREA_DASH_ON, AREA_DASH_OFF]);
      context.beginPath(); context.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
      const wave = progress * FAIRY_GALE_WIND_LINES;
      for (let k = 0; k < FAIRY_GALE_WIND_LINES; k++) {
        const t = wave - k;
        if (t <= 0 || t > 1) continue;
        const r = effect.radius * t;
      context.globalAlpha = (1 - t) * (1 - progress * 0.25); context.strokeStyle = k % 2 ? HERO_FX_SECONDARY.fairy : '#fff0fa';
      context.lineWidth = 2;
        context.beginPath(); context.arc(effect.x, effect.y, r, -Math.PI * 0.82 + k * 0.45, Math.PI * 0.78 + k * 0.45); context.stroke();
      }
    } else if (fairyFx && effect.sourceAbility === 'ultimate') {
      const radius = effect.radius * (0.4 + 0.6 * progress);
      context.globalAlpha = 0.12 * (1 - progress); context.fillStyle = fillColor;
      context.beginPath(); context.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); context.fill();
      context.globalAlpha = 1 - progress; context.strokeStyle = fillColor; context.lineWidth = AREA_TELEGRAPH_WIDTH;
      context.beginPath(); context.arc(effect.x, effect.y, radius, 0, Math.PI * 2); context.stroke();
    } else if (effect.cone) {
      // Guardian Shield Rush fan: a bright wedge at the TRUE radius and angle,
      // with a colored stroke on the two edges and the arc (no shadowBlur /
      // filters, matching the other markers),
      // and a few arcs sweeping outward across the wedge as it fades.
      const half = (effect.angleDeg * Math.PI / 180) / 2;
      const a0 = effect.angleRad - half, a1 = effect.angleRad + half;
      const fx = HERO_FX_COLORS.guardian.primary;
      const trace = () => {
        context.beginPath();
        context.moveTo(effect.x, effect.y);
        context.lineTo(effect.x + Math.cos(a0) * effect.radius, effect.y + Math.sin(a0) * effect.radius);
        context.arc(effect.x, effect.y, effect.radius, a0, a1);
        context.lineTo(effect.x, effect.y);
        context.closePath();
      };
      // Fill
      context.globalAlpha = AREA_TELEGRAPH_FILL_END_ALPHA * (1 - progress * 0.6);
      context.fillStyle = fx;
      trace(); context.fill();
      // Bright main stroke
      context.globalAlpha = 1 - progress * 0.5;
      context.strokeStyle = fx;
      context.lineWidth = AREA_TELEGRAPH_WIDTH;
      context.setLineDash([]);
      trace(); context.stroke();
      // 3-4 expanding arc lines moving outward across the wedge
      const arcs = 4;
      for (let k = 1; k <= arcs; k += 1) {
        const t = progress * arcs - (k - 1);
        if (t <= 0 || t > 1) continue;
        context.globalAlpha = (1 - t) * 0.55;
        context.strokeStyle = fx;
        context.lineWidth = 2;
        context.beginPath(); context.arc(effect.x, effect.y, effect.radius * t, a0, a1); context.stroke();
      }
    } else {
      // Detonation: the flash stays bright, then the ring expands and fades.
      const endAlpha = danger ? AREA_ENEMY_FILL_END_ALPHA : AREA_TELEGRAPH_FILL_END_ALPHA;
      const ringRadius = effect.radius * (ARENA_TUNING.areaEffects.ringStartScale + (1 - ARENA_TUNING.areaEffects.ringStartScale) * progress);
      context.globalAlpha = endAlpha * (1 - progress * 0.6);
      context.fillStyle = fillColor;
      context.beginPath(); context.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); context.fill();
      context.globalAlpha = 1 - progress * 0.5;
      context.strokeStyle = stroke;
      context.lineWidth = AREA_TELEGRAPH_WIDTH;
      context.setLineDash([]);
      context.beginPath(); context.arc(effect.x, effect.y, ringRadius, 0, Math.PI * 2); context.stroke();
    }
    context.restore();
  }

  // 3. Draw players
  for (const player of state.players) {
    const visualState = getHeroVisualState(player, currentTime);
    if (visualState.downed) {
      const remainingRatio = Math.max(0, Math.min(1, player.respawnRemainingMs / Math.max(1, player.respawnDurationMs)));
      context.save(); context.globalAlpha = 1;
      if (!drawCachedHero(context, heroSpriteCache, player, player.x, player.y, visualState)) {
        context.globalAlpha = 0.42;
        context.font = '32px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText('👻', player.x, player.y);
      }
      context.globalAlpha = 0.9; context.strokeStyle = '#b9f5ff'; context.lineWidth = 4;
      context.beginPath(); context.arc(player.x, player.y, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - remainingRatio)); context.stroke();
      context.fillStyle = '#fff'; context.font = 'bold 12px sans-serif';
      context.fillText(`${Math.ceil(player.respawnRemainingMs / 1000)}s${player.respawnSpeedMultiplier > 1 ? ` · x${player.respawnSpeedMultiplier}` : ''}`, player.x, player.y + 40);
      context.restore();
      continue;
    }
    const targetMomentumAlpha = player.momentumActive ? 1 : 0;
    const currentMomentumAlpha = momentumVisualAlpha.get(player.id) || 0;
    const nextMomentumAlpha = Math.max(0, Math.min(1, currentMomentumAlpha + Math.sign(targetMomentumAlpha - currentMomentumAlpha) * Math.min(1, dt * 1000 / ARENA_TUNING.momentum.fadeMs)));
    momentumVisualAlpha.set(player.id, nextMomentumAlpha);
    const priorMomentumPosition = momentumPositions.get(player.id);
    momentumPositions.set(player.id, { x: player.x, y: player.y });
    if (nextMomentumAlpha > 0.01) {
      let dx = priorMomentumPosition ? player.x - priorMomentumPosition.x : 0;
      let dy = priorMomentumPosition ? player.y - priorMomentumPosition.y : 0;
      const distance = Math.hypot(dx, dy) || 1;
      dx /= distance; dy /= distance;
      context.save(); context.globalAlpha = nextMomentumAlpha * ARENA_TUNING.momentum.glowAlpha;
      context.strokeStyle = '#ffcc68'; context.lineWidth = 3;
      context.beginPath(); context.arc(player.x, player.y, 26, 0, Math.PI * 2); context.stroke();
      for (let streak = 0; streak < ARENA_TUNING.momentum.streakCount; streak++) {
        const side = streak - (ARENA_TUNING.momentum.streakCount - 1) / 2;
        const startX = player.x - dx * 30 + -dy * side * 7, startY = player.y - dy * 30 + dx * side * 7;
        context.beginPath(); context.moveTo(startX, startY); context.lineTo(startX - dx * 12, startY - dy * 12);
        context.stroke();
      }
      context.restore();
    }
    if (player.dashing) spawnDashTrail(player);
    const center = { x: player.x, y: player.y };
    if (player.guardianBrace) {
      context.save();
      context.globalAlpha = 0.55 + Math.sin(currentTime * 0.008) * 0.15;
      context.strokeStyle = HERO_FX_COLORS.guardian.highlight; context.lineWidth = 4;
      context.beginPath(); context.arc(center.x, center.y, 31, 0, Math.PI * 2); context.stroke();
      context.restore();
    }
    if (player.heroId !== 'ranger') {
      const tip = { x: center.x + player.aim.x * 48, y: center.y + player.aim.y * 48 };
      context.strokeStyle = player.id === me ? '#222' : '#777';
      context.fillStyle = context.strokeStyle;
      const angle = Math.atan2(player.aim.y, player.aim.x);
      context.beginPath();
      context.moveTo(tip.x, tip.y);
      context.lineTo(tip.x - 12 * Math.cos(angle - Math.PI / 6), tip.y - 12 * Math.sin(angle - Math.PI / 6));
      context.lineTo(tip.x - 12 * Math.cos(angle + Math.PI / 6), tip.y - 12 * Math.sin(angle + Math.PI / 6));
      context.closePath();
      context.fill();
    }

    if (player.id === me) {
      context.strokeStyle = '#1683ff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(center.x, center.y, 23, 0, Math.PI * 2);
      context.stroke();
    }
    if (heroDebugHitboxes) {
      context.save(); context.strokeStyle = '#ff2d55'; context.lineWidth = 2; context.setLineDash([5, 4]);
      context.beginPath(); context.arc(player.x, player.y, GAME_CONFIG.arena.playerRadius, 0, Math.PI * 2); context.stroke(); context.restore();
    }
    if (player.bubbleRush) {
      const pulse = 0.5 + Math.sin(currentTime * 0.018) * 0.08;
      context.save();
      context.globalAlpha = pulse * 0.35;
      context.fillStyle = '#7cecff'; context.strokeStyle = '#d7fbff'; context.lineWidth = 3;
      context.beginPath(); context.arc(center.x, center.y, 34 + Math.sin(currentTime * 0.012) * 2, 0, Math.PI * 2); context.fill();
      context.globalAlpha = 0.95; context.stroke();
      context.globalAlpha = 1;
      context.font = '18px sans-serif'; context.textAlign = 'center'; context.fillText('🫧', center.x, center.y - 37);
      context.restore();
    }
    const muzzle = muzzleFlashes.get(player.id);
    const muzzleAge = muzzle ? currentTime - muzzle.startedAt : ARENA_TUNING.muzzleFlash.durationMs;
    if (muzzle && muzzleAge >= ARENA_TUNING.muzzleFlash.durationMs) muzzleFlashes.delete(player.id);
    const recoil = muzzle && muzzleAge < ARENA_TUNING.muzzleFlash.durationMs
      ? muzzle.recoil * (1 - muzzleAge / ARENA_TUNING.muzzleFlash.durationMs) : 0;
    context.font = '32px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#222';
    // Shield Rush's i-frames hold the sprite solid with no blink and no halo.
    // The respawn strobe is tuned for a 2 s shield; across a 0.25 s hop the hero
    // already reads as invulnerable from the movement, and the strobe just made
    // the sprite flicker on and off.
    const rushInvuln = Boolean(player.rushIFrames);
    const invulnBlink = !rushInvuln && Math.floor(currentTime / ARENA_TUNING.respawn.flashIntervalMs) % 2 === 0;
    const samuraiTrail = samuraiDashTrails.get(player.id);
    if (player.heroId === 'samurai' && samuraiTrail && !prefersReducedMotion && effectiveQuality() !== 'low') {
      const trailAge = currentTime - samuraiTrail.startedAt;
      if (trailAge < samuraiTrail.durationMs) {
        const tdx = samuraiTrail.endX - samuraiTrail.startX, tdy = samuraiTrail.endY - samuraiTrail.startY, tLen = Math.hypot(tdx, tdy) || 1;
        emitDashDust(player.id, player.x, player.y + GAME_CONFIG.arena.playerRadius * 0.7, tdx / tLen, tdy / tLen, currentTime);
      }
      for (let echo = 0; echo < 3; echo++) {
        const fraction = [0.28, 0.54, 0.8][echo];
        const echoAge = trailAge - samuraiTrail.durationMs * fraction;
        if (echoAge < 0 || echoAge >= SAMURAI_DASH_AFTERIMAGE_MS) continue;
        const x = samuraiTrail.startX + (samuraiTrail.endX - samuraiTrail.startX) * fraction;
        const y = samuraiTrail.startY + (samuraiTrail.endY - samuraiTrail.startY) * fraction;
        context.save(); context.globalAlpha = [0.4, 0.25, 0.12][echo] * (1 - echoAge / SAMURAI_DASH_AFTERIMAGE_MS);
        drawCachedHero(context, heroSpriteCache, player, x, y, { ...visualState, hitFlash: false });
        context.restore();
      }
    }
    context.save();
    if (player.invulnerable && invulnBlink) context.globalAlpha = 0.35;
    if (!drawCachedHero(context, heroSpriteCache, player, center.x - player.aim.x * recoil, center.y - player.aim.y * recoil, visualState)) {
      context.fillText(player.emoji, center.x - player.aim.x * recoil, center.y - player.aim.y * recoil);
    }
    context.restore();
    drawRangerCombatFeedback(player, currentTime);
    if (player.id === me && player.heroId === 'samurai') {
      const stacks = Math.max(0, player.samuraiStacks || 0);
      const spec = GAME_CONFIG.heroes.samurai.killCount;
      const multiplier = Math.max(spec.minMultiplier, Math.min(spec.maxMultiplier, stacks / spec.divisor));
      const tier = stacks >= spec.cap ? 'max' : stacks >= 10 ? 'gold' : stacks >= 5 ? 'violet' : 'muted';
      const feedback = samuraiStackFeedback.get(player.id);
      const age = feedback ? currentTime - feedback.at : Infinity;
      const pulse = feedback?.kind === 'gain' && age < 220 && !prefersReducedMotion
        ? 1 + 0.2 * Math.sin(Math.PI * age / 220) : 1;
      const fade = feedback?.kind === 'decay' && age < 280 ? Math.max(0.4, age / 280) : 1;
      const label = stacks >= spec.cap ? `${stacks}  x${multiplier.toFixed(1)}  MAX` : `${stacks}  x${multiplier.toFixed(1)}`;
      context.save(); context.translate(center.x, center.y - 58); context.scale(pulse, pulse); context.globalAlpha = fade;
      context.font = '900 15px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      const width = context.measureText(label).width + 20;
      context.fillStyle = '#17202B'; context.strokeStyle = tier === 'muted' ? '#7B8795' : tier === 'violet' ? '#8F7CFF' : '#FFD27A'; context.lineWidth = 2;
      context.beginPath(); context.roundRect(-width / 2, -13, width, 26, 13); context.fill(); context.stroke();
      context.fillStyle = tier === 'muted' ? '#C5CBD3' : tier === 'violet' ? '#DCD5FF' : '#FFD27A';
      context.fillText(label, 0, 0); context.restore();
    }
    if (player.heroId === 'ranger' && player.deadAimArrows > 0 && !player.downed) {
      context.save();
      context.translate(center.x, center.y - 76);
      context.fillStyle = 'rgba(44, 31, 13, 0.94)';
      context.strokeStyle = '#ffd75e';
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(-62, -13, 124, 26, 13);
      context.fill();
      context.stroke();
      context.font = '900 12px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillStyle = '#fff4c7';
      context.fillText(`➡️ DEAD AIM ×${player.deadAimArrows}`, 0, 0);
      context.restore();
    }
    if (player.guardianCharging && player.guardianDamageRamp > 0) {
      const label = `+${Math.round(player.guardianDamageRamp * 100)}%`;
      context.save();
      context.font = 'bold 13px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      const width = context.measureText(label).width + 16;
      context.fillStyle = '#10243be8'; context.strokeStyle = HERO_FX_COLORS.guardian.highlight; context.lineWidth = 1.5;
      context.beginPath(); context.roundRect(center.x - width / 2, center.y - 65, width, 22, 11); context.fill(); context.stroke();
      context.fillStyle = '#fff'; context.fillText(label, center.x, center.y - 54); context.restore();
    }
    const chainCounter = chainCounters.get(player.id);
    if (chainCounter) {
      const age = currentTime - chainCounter.startedAt;
      if (age >= ARENA_TUNING.heroTweaks.electroChainCounterMs) chainCounters.delete(player.id);
      else {
        const progress = Math.min(1, age / ARENA_TUNING.heroTweaks.electroChainCounterPopMs);
        const scale = 1 + (ARENA_TUNING.heroTweaks.electroChainCounterScale - 1) * Math.sin(Math.PI * progress);
        context.save(); context.translate(center.x, center.y - 68); context.scale(scale, scale);
        context.font = 'bold 16px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.lineWidth = 4; context.strokeStyle = '#10283b'; context.fillStyle = HERO_FX_COLORS.electromancer.highlight;
        context.strokeText(`CHAIN x${chainCounter.count}`, 0, 0); context.fillText(`CHAIN x${chainCounter.count}`, 0, 0); context.restore();
      }
    }
    const readyBounce = readyBounces.get(player.id);
    if (readyBounce !== undefined) {
      const age = currentTime - readyBounce.at;
      if (age >= ARENA_TUNING.heroTweaks.sheriffReadyBounceMs) readyBounces.delete(player.id);
      else {
        const bounce = Math.sin(Math.PI * age / ARENA_TUNING.heroTweaks.sheriffReadyBounceMs) * 18;
        context.save(); context.font = '20px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText(readyBounce.emoji, center.x, center.y - 49 - bounce); context.restore();
      }
    }
    // Talent refund popup (Quick Draw / Adrenaline): clock emoji + merged
    // refund, drifting up and fading out above the hero.
    const refundPopup = refundPopups.get(player.id);
    if (refundPopup) {
      const popupMs = ARENA_TUNING.heroTweaks.sheriffRefundPopupMs;
      const age = currentTime - refundPopup.startedAt;
      if (age >= popupMs) refundPopups.delete(player.id);
      else {
        const progress = age / popupMs;
        const rise = progress * 26;
        const fade = progress < 0.6 ? 1 : 1 - (progress - 0.6) / 0.4;
        const label = `-${(refundPopup.totalMs / 1000).toFixed(1)}s`;
        context.save();
        context.globalAlpha = Math.max(0, fade);
        context.textAlign = 'center'; context.textBaseline = 'middle';
        const y = center.y - 70 - rise;
        // Sized to match the 🧨 Dynamite-ready bounce so both popups read at
        // the same visual weight (the arena is authored at 1920×1080 and shown
        // scaled down, so small fonts become illegible).
        context.font = '19px sans-serif';
        context.fillText('⏰', center.x - 30, y);
        context.font = 'bold 18px sans-serif';
        context.lineWidth = 4; context.strokeStyle = '#10283b';
        context.fillStyle = (HERO_FX_COLORS[player.heroId] || HERO_FX_COLORS.sheriff).highlight;
        context.strokeText(label, center.x + 12, y); context.fillText(label, center.x + 12, y);
        context.restore();
      }
    }
    if (muzzle && muzzleAge < ARENA_TUNING.muzzleFlash.durationMs) {
      const fx = HERO_FX_COLORS[player.heroId] || {};
      const x = center.x + player.aim.x * 38, y = center.y + player.aim.y * 38;
      const gradient = context.createRadialGradient(x, y, 1, x, y, 20);
      gradient.addColorStop(0, '#fff'); gradient.addColorStop(0.25, fx.highlight || '#fff');
      gradient.addColorStop(1, 'transparent');
      context.save(); context.globalAlpha = 1 - muzzleAge / ARENA_TUNING.muzzleFlash.durationMs;
      context.fillStyle = gradient; context.beginPath(); context.arc(x, y, 20, 0, Math.PI * 2); context.fill(); context.restore();
    }
    context.font = '12px sans-serif';
    context.fillText(player.name, center.x, center.y + 30);
    // No i-frame halo during Shield Rush either: the hop itself is the cue, and
    // `invulnBlink` is already false for it. Every other source still blinks.
    if ((player.invulnerable || player.ultimateFlash) && invulnBlink) {
      context.save(); context.globalAlpha = 0.25; context.fillStyle = '#fff';
      context.beginPath(); context.arc(center.x, center.y, 25, 0, Math.PI * 2); context.fill(); context.restore();
    }
    if (player.id === me && momentumNudge) {
      const nudgeProgress = Math.max(0, Math.min(1, (currentTime - momentumNudge.startedAt) / ARENA_TUNING.momentum.nudgeDurationMs));
      if (nudgeProgress >= 1) momentumNudge = null;
      else {
        context.save(); context.globalAlpha = 1 - nudgeProgress; context.fillStyle = '#fff3bd'; context.font = 'bold 16px sans-serif';
        context.textAlign = 'center'; context.fillText(`Move to deal +${Math.round(ARENA_TUNING.momentum.bonus * 100)}% damage`, center.x, center.y - 38); context.restore();
      }
    }
    if (player.id === me) {
      for (let i = momentumReadyLabels.length - 1; i >= 0; i--) {
        const label = momentumReadyLabels[i];
        const progress = (currentTime - label.startedAt) / ARENA_TUNING.momentum.readyMs;
        if (progress >= 1) { momentumReadyLabels.splice(i, 1); continue; }
        context.save(); context.globalAlpha = 1 - progress; context.fillStyle = '#ffe08a'; context.font = 'bold 18px sans-serif';
        context.textAlign = 'center'; context.fillText(`+${Math.round(label.bonus * 100)}%`, center.x, center.y - 42 - ARENA_TUNING.momentum.readyRisePx * progress); context.restore();
      }
    }
  }

  for (const monster of state.monsters || []) {
    if (heroDebugHitboxes) {
      context.save(); context.strokeStyle = '#ff2d55'; context.lineWidth = 2; context.setLineDash([5, 4]);
      context.beginPath(); context.arc(monster.x, monster.y, monster.radius || 20, 0, Math.PI * 2); context.stroke(); context.restore();
    }
    if (monster.stunned || monster.vortexed || monster.slowed || monster.engineerWrenchMarked) {
      const statusMarks = [
        ...(monster.stunned ? ['⚡'] : []),
        ...(monster.vortexed ? ['🌀'] : []),
        ...(monster.slowed ? ['🐌'] : []),
        ...(monster.engineerWrenchMarked ? ['🔧'] : []),
      ];
      context.save(); context.font = '16px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      statusMarks.forEach((mark, index) => context.fillText(mark,
        monster.x + (index - (statusMarks.length - 1) / 2) * 18,
        monster.y - (monster.isDummy || monster.type === 'dummy' ? 50 : 30)));
      context.restore();
    }
    if ((enemyFlashes.get(monster.id) || 0) > currentTime) {
      context.beginPath(); context.arc(monster.x, monster.y, 25, 0, Math.PI * 2); context.strokeStyle = HERO_FX_COLORS.electromancer.highlight; context.lineWidth = 4; context.stroke();
    }
  }

  for (let i = leavingPlayers.length - 1; i >= 0; i--) {
    const leaving = leavingPlayers[i];
    const progress = Math.min(1, (currentTime - leaving.startedAt) / ARENA_TUNING.run.leaveFadeMs);
    if (progress >= 1) { leavingPlayers.splice(i, 1); continue; }
    context.save(); context.globalAlpha = 1 - progress; context.font = `${32 * (1 - progress * 0.2)}px sans-serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(leaving.emoji || '👻', leaving.x, leaving.y - 24 * progress); context.restore();
  }

  for (let i=lightningArcs.length-1;i>=0;i--) {
    const arc=lightningArcs[i], remaining=arc.expires-currentTime;
    if(remaining<=0){lightningArcs.splice(i,1);continue;}
    context.save(); context.globalAlpha=Math.min(1,remaining/GAME_CONFIG.visuals.lightningArcMs);
    context.strokeStyle=arc.color;context.lineWidth=4;context.shadowBlur=0;
    context.beginPath();context.moveTo(arc.x1,arc.y1);context.lineTo(arc.x2,arc.y2);context.stroke();context.restore();
  }

  const local = state.players.find((candidate) => candidate.id === me);
  if (local && hasCard('overcharge') && local.overchargeShots > 0) {
    const mouse = window.lastPointerWorld;
    if (mouse) {
      const remaining = ARENA_TUNING.cards.effects.overchargeEveryShots - (local.overchargeShots % ARENA_TUNING.cards.effects.overchargeEveryShots);
      context.save(); context.strokeStyle = '#ffe34f'; context.lineWidth = 2; context.beginPath(); context.arc(mouse.x, mouse.y, 15, 0, Math.PI * 2); context.stroke();
      context.font = 'bold 12px sans-serif'; context.textAlign = 'center'; context.fillStyle = '#fff2a0'; context.fillText(String(remaining), mouse.x, mouse.y - 21); context.restore();
    }
  }
  if (local?.targeting && window.lastPointerWorld) {
    const spec=GAME_CONFIG.heroes.bombardier.airstrike, p=window.lastPointerWorld;
    context.save();context.setLineDash([12,8]);context.strokeStyle='#ffbd58';context.lineWidth=4;
    context.beginPath();context.arc(p.x,p.y,spec.circleRadius,0,Math.PI*2);context.stroke();
    context.setLineDash([]);context.fillStyle='rgba(255,189,88,.12)';context.fill();context.restore();
  }

  // 4. Update and draw active projectiles.
  for (const [id, p] of clientProjectiles.entries()) {
    p.update(dt, GAME_CONFIG.arena);

    if (currentTime - (p.lastTrailAt || 0) >= ARENA_TUNING.performance.projectileTrailIntervalMs
      && particles.length < particleBudget) {
      p.lastTrailAt = currentTime;
      addParticle({
        x: p.x + (Math.random() - 0.5) * 6,
        y: p.y + (Math.random() - 0.5) * 6,
        vx: -p.vx * 0.08 + (Math.random() - 0.5) * 20,
        vy: -p.vy * 0.08 + (Math.random() - 0.5) * 20,
      radius: 1.5 + Math.random() * 2,
      color: p.color || HERO_FX_COLORS[p.heroId]?.primary || '#fff',
        alpha: 0.9,
        decay: 0.04 + Math.random() * 0.03,
      });
    }

    if (p.dead) {
      const edgeX = Math.max(0, Math.min(ARENA_WIDTH, p.x));
      const edgeY = Math.max(0, Math.min(ARENA_HEIGHT, p.y));
      for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 70;
        addParticle({
          x: edgeX,
          y: edgeY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2 + Math.random() * 2,
          color: Math.random() > 0.5 ? (p.color || HERO_FX_COLORS[p.heroId]?.primary || '#fff') : (HERO_FX_COLORS[p.heroId]?.highlight || p.color || '#fff'),
          alpha: 1,
          decay: 0.05 + Math.random() * 0.05,
        });
      }
      clientProjectiles.delete(id);
      continue;
    }

    if (p.heroId === 'electromancer' && p.shape === 'orb') {
      // Cached glow sprite (rendered once per color) blitted with drawImage,
      // instead of building a radial gradient per orb per frame.
      const sprite = glowSprite(HERO_FX_COLORS.electromancer.primary, HERO_FX_COLORS.electromancer.core || '#f4fdff', HERO_FX_COLORS.electromancer.highlight);
      const glowRadius = p.radius * 2.1;
      context.save(); context.globalAlpha = 0.82;
      context.drawImage(sprite.canvas, p.x - glowRadius, p.y - glowRadius, glowRadius * 2, glowRadius * 2);
      context.restore();
    }
    p.draw(context);
  }

  // 5. Update and draw embers/sparks
  for (let i = particles.length - 1; i >= 0; i--) {
    const part = particles[i];
    if (part.startedAt && currentTime < part.startedAt) continue;
    if (part.travelStartedAt !== null && part.travelTargetX !== null && part.travelTargetY !== null) {
      const progress = Math.max(0, Math.min(1, (currentTime - part.travelStartedAt) / Math.max(1, part.travelDurationMs || 1)));
      const eased = progress * progress * (3 - 2 * progress);
      part.x = part.travelStartX + (part.travelTargetX - part.travelStartX) * eased;
      part.y = part.travelStartY + (part.travelTargetY - part.travelStartY) * eased;
      if (progress >= 1) {
        particles.splice(i, 1); particlePool.push(part);
        continue;
      }
    } else {
      part.x += part.vx * dt;
      part.y += part.vy * dt;
    }
    if (part.expiresAt) {
      const duration = part.durationMs || ARENA_TUNING.impactSparks.durationMs;
      part.alpha = Math.max(0, (part.expiresAt - currentTime) / duration);
    } else if (part.travelStartedAt == null) part.alpha -= part.decay || 0.04;
    if (part.alpha <= 0) {
      particles.splice(i, 1);
      particlePool.push(part);
      continue;
    }
    const r = part.radius * 2.4 + 4;
    if (part.x < -r || part.x > ARENA_WIDTH + r || part.y < -r || part.y > ARENA_HEIGHT + r) continue;
    context.globalAlpha = Math.max(0, part.alpha);
    if (part.emoji) {
      const g = particleEmojiGlyph(part.emoji, part.radius * 2);
      context.drawImage(g.canvas, part.x - g.w / 2, part.y - g.h / 2, g.w, g.h);
    } else if (part.text) {
      const g = textGlyph(part.text, part.color || '#fff', 14);
      context.drawImage(g.canvas, part.x - g.w / 2, part.y - g.h / 2, g.w, g.h);
    } else {
      context.fillStyle = part.color || '#fff';
      context.beginPath();
      context.arc(part.x, part.y, part.radius * Math.max(0.2, part.alpha), 0, Math.PI * 2);
      context.fill();
    }
  }
  context.globalAlpha = 1;

  // 6. Update and draw floating damage numbers
  const hideTeammateNumbers = effectiveQuality() !== 'high';
  for (let i = damageTexts.length - 1; i >= 0; i--) {
    const dtObj = damageTexts[i];
    if (dtObj.startedAt !== undefined) {
      const progress = Math.min(1, (currentTime - dtObj.startedAt) / (dtObj.durationMs || ARENA_TUNING.damageNumbers.durationMs));
      dtObj.y = dtObj.startY - ARENA_TUNING.damageNumbers.risePx * progress;
      dtObj.alpha = 1 - progress;
    } else {
      dtObj.y += dtObj.vy * dt;
      dtObj.alpha -= 1.6 * dt;
    }
    if (dtObj.alpha <= 0) {
      if (dtObj.mergeKey) damageNumberMerge.delete(dtObj.mergeKey);
      damageTexts.splice(i, 1);
      continue;
    }
    if (dtObj.x < -30 || dtObj.x > ARENA_WIDTH + 30 || dtObj.y < -30 || dtObj.y > ARENA_HEIGHT + 30) continue;
    // Reduced quality hides teammates' numbers; your own stay (gameplay feel).
    if (hideTeammateNumbers && dtObj.sourceId && dtObj.sourceId !== me) continue;
    const g = dtObj.glyph || textGlyph(dtObj.text, dtObj.color || '#ffea00', 13 * (dtObj.scale || 1));
    context.globalAlpha = Math.max(0, dtObj.alpha * (dtObj.sourceId && dtObj.sourceId !== me ? ARENA_TUNING.damageNumbers.teammateOpacity : 1));
    context.drawImage(g.canvas, dtObj.x - g.w / 2, dtObj.y - g.h / 2, g.w, g.h);
  }
  drawSamuraiWorldEffects(currentTime);
  context.globalAlpha = 1;
  context.restore();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';
  context.shadowBlur = 0;
  context.setLineDash([]);
  if (samuraiScreenFlash) {
    const age = currentTime - samuraiScreenFlash.startedAt;
    if (age >= SAMURAI_CUT_OVERLAY_MS) samuraiScreenFlash = null;
    else {
      context.save();
      context.globalAlpha = 0.18 * (1 - age / SAMURAI_CUT_OVERLAY_MS);
      context.fillStyle = '#101018';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.restore();
    }
  }
  // Screen-space celebration: unaffected by shake and the boss zoom.
  updateConfetti(currentTime, dt);
  drawConfetti(currentTime);
}

function spawnDashTrail(player) {
  const prior=previousPositions.get(player.id);
  previousPositions.set(player.id,{x:player.x,y:player.y});
  const step=prior ? Math.hypot(player.x-prior.x,player.y-prior.y) : 0;
  if(!prior || step<2)return;
  emitDashDust(player.id, player.x, player.y + GAME_CONFIG.arena.playerRadius * 0.7, (player.x-prior.x)/step, (player.y-prior.y)/step);
  const spec=GAME_CONFIG.visuals.dashTrail;
  const ramp = player.guardianCharging ? Math.min(1, player.guardianDamageRamp / GAME_CONFIG.arenaTuning.heroTweaks.guardianUltimateRampCap) : 0;
  for(let i=0;i<spec.count;i++) addParticle({x:prior.x+(Math.random()-.5)*16,y:prior.y+(Math.random()-.5)*16,
    vx:(Math.random()-.5)*35,vy:(Math.random()-.5)*35,radius:spec.radius+Math.random()*2+ramp*2,color:ramp > 0.4 ? HERO_FX_COLORS[player.heroId]?.highlight : HERO_FX_COLORS[player.heroId]?.primary || '#d8dfc7',alpha:.65+ramp*.35,decay:spec.decay});
}

canvas.addEventListener('pointerdown', beginTouchZoom, { passive: true });
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerdown', onPointerDown);
movementStick.addEventListener('pointerdown', onMovementPointerDown);
movementStick.addEventListener('pointermove', updateMovementStick);
movementStick.addEventListener('pointerup', onMovementPointerEnd);
movementStick.addEventListener('pointercancel', onMovementPointerEnd);
abilityElements.forEach((button) => {
  button.addEventListener('pointerdown', beginAbilityGesture);
  button.addEventListener('click', onAbilityKeyboardClick);
});
targetingCancel.addEventListener('click', cancelTargeting);
window.addEventListener('pointermove', moveAbilityGesture, { passive: false });
window.addEventListener('pointermove', moveTouchZoom, { passive: false });
window.addEventListener('pointerup', endTouchZoom);
window.addEventListener('pointercancel', endTouchZoom);
window.addEventListener('pointerup', releasePointerControls);
window.addEventListener('pointercancel', releasePointerControls);
window.addEventListener('resize', resizeArenaRaster, { passive: true });
touchViewport.addEventListener?.('change', resizeArenaRaster);
socket.on('connect', () => {
  lastSentMovement = null;
  sendMovement();
});
// Pre-warm the audio context on the first user input so the first kill/hit
// sound has no context-resume hitch.
const warmAudioOnFirstInput = () => {
  warmUpAudio();
  window.removeEventListener('pointerdown', warmAudioOnFirstInput);
  window.removeEventListener('keydown', warmAudioOnFirstInput);
};
window.addEventListener('pointerdown', warmAudioOnFirstInput);
window.addEventListener('keydown', warmAudioOnFirstInput);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
addEventListener('keydown', onKeyDown);
addEventListener('keyup', onKeyUp);
addEventListener('blur', () => {
  if (abilityGesture) finishAbilityGesture({ pointerId: abilityGesture.pointerId }, true);
  engineerPlacementTargeting = false;
  releaseKeys();
  targetingHint.hidden = true;
  targetingReticle.hidden = true;
});
requestAnimationFrame(draw);
