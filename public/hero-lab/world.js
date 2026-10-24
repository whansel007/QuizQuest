import { HEROES } from './hero-list.js';
import { EnemyProjectile } from './projectiles/enemy-projectile.js';
import { Projectile } from './bases/projectile.js';
import { GAME_CONFIG, HERO_FX_COLORS } from './game-config.js';
import { SHAKE_PLAYER_HIT_TRAUMA, SHAKE_ULTIMATE_TRAUMA, SHAKE_BOSS_SLAM_TRAUMA, SHAKE_EXPLOSION_BASE_TRAUMA,
  SHAKE_EXPLOSION_RADIUS_SCALE, SHAKE_MAX_TRAUMA, SHAKE_DECAY, SHAKE_MAX_OFFSET, SHAKE_EXPLOSION_COOLDOWN_MS,
  SHAKE_NOISE_HZ, SHAKE_NOISE_PRIMARY_PHASE, SHAKE_NOISE_PRIMARY_FREQUENCY, SHAKE_NOISE_SECONDARY_FREQUENCY, SHAKE_NOISE_SECONDARY_PHASE, SHAKE_DEFAULT_INTENSITY,
  SHAKE_MIN_INTENSITY, SHAKE_MAX_INTENSITY, SHAKE_INTENSITY_STEP,
  SHAKE_HIT_TRAUMA, SHAKE_HIT_DAMAGE_REFERENCE, SHAKE_HIT_MIN_INTERVAL_MS, SHAKE_KILL_TRAUMA,
  MAX_BURSTS_PER_FRAME, KILL_BURST_THRESHOLD, KILL_BURST_WINDOW_MS, KILL_MASS_SHAKE_TRAUMA, KILL_MASS_PUFF_PARTICLES,
  FRAME_TIME_TARGET_MS, ADAPTIVE_RESTORE_MS, ADAPTIVE_SAMPLE_FRAMES, QUALITY_PARTICLE_FACTOR, FRAME_CAP_FPS } from '../../config/tuning.js';
import { playSound, setAudioOptions, setHeartbeat, audioStats, setAudioEnabled, warmUpAudio } from './arena-audio.js';
import { createProfiler, effectToggles } from './perf-profiler.js';

const canvas = document.querySelector('#world');
const ARENA_WIDTH = GAME_CONFIG.arena.width;
const ARENA_HEIGHT = GAME_CONFIG.arena.height;
// Rasterize close to the displayed viewport while keeping world coordinates fixed.
const renderScale = Math.min(1, Math.max(0.4, Math.min(innerWidth / ARENA_WIDTH, innerHeight / ARENA_HEIGHT)));
canvas.width = Math.round(ARENA_WIDTH * renderScale);
canvas.height = Math.round(ARENA_HEIGHT * renderScale);
let particleBudget = Math.max(100, Math.floor(GAME_CONFIG.arenaTuning.performance.maxParticles * renderScale * renderScale));
const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
const backgroundCanvas = document.createElement('canvas');
backgroundCanvas.width = canvas.width;
backgroundCanvas.height = canvas.height;
const backgroundContext = backgroundCanvas.getContext('2d');
backgroundContext.scale(renderScale, renderScale);
for (let y = 0; y < ARENA_HEIGHT; y += 80) {
  for (let x = 0; x < ARENA_WIDTH; x += 80) {
    backgroundContext.fillStyle = (Math.floor(x / 80) + Math.floor(y / 80)) % 2 ? '#79b456' : '#70a94f';
    backgroundContext.fillRect(x, y, 80, 80);
  }
}
backgroundContext.strokeStyle = '#456f35';
backgroundContext.lineWidth = 1;
backgroundContext.strokeRect(0.5, 0.5, ARENA_WIDTH - 1, ARENA_HEIGHT - 1);
const connectionStatus = document.querySelector('#connection-status');
const waveNumber = document.querySelector('#wave-number');
const waveDetails = document.querySelector('#wave-details');
const heroName = document.querySelector('#hero-name');
const healthFill = document.querySelector('#health-fill');
const healthTrack = document.querySelector('.health-track');
const healthValue = document.querySelector('#health-value');
const teamHealth = document.querySelector('#team-health');
const roomRow = document.querySelector('#room-row');
const roomCodeButton = document.querySelector('#room-code');
const roomCodeValue = document.querySelector('#room-code-value');
const roomCodeCopied = document.querySelector('#room-code-copied');
const waitingBanner = document.querySelector('#waiting-banner');
const waitingDetail = document.querySelector('#waiting-detail');
const abilityHud = document.querySelector('#ability-hud');
const toastStack = document.querySelector('#toast-stack');
const playerList = document.querySelector('#player-list');
const playerListRows = document.querySelector('#player-list-rows');
const lobbyBar = document.querySelector('#lobby-bar');
const lobbyHero = document.querySelector('#lobby-hero');
const startRunButton = document.querySelector('#start-run');
const lobbyHint = document.querySelector('#lobby-hint');
const countdownOverlay = document.querySelector('#countdown');
const countdownValue = document.querySelector('#countdown-value');
const buffIcons = document.querySelector('#buff-icons');
const downedList = document.querySelector('#downed-list');
const briefingButton = document.querySelector('#briefing-button');
const joinBriefing = document.querySelector('#join-briefing');
const infoButton = document.querySelector('#info-button');
const statsPanel = document.querySelector('#stats-panel');
const buffVote = document.querySelector('#buff-vote');
const buffCards = document.querySelector('#buff-cards');
const targetingHint = document.querySelector('#targeting-hint');
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
const muteSetting = document.querySelector('#mute-setting');
const volumeSetting = document.querySelector('#volume-setting');
const killStreakHud = document.querySelector('#kill-streak');
const overloadFlash = document.querySelector('#overload-flash');
const sheriffSkillAbility = document.querySelector('.ability[data-ability="skill"]');
const sheriffRefundLabel = sheriffSkillAbility.querySelector('.cooldown-refund-label');
// The ability tiles are static markup; cache the list so the 10Hz HUD refresh
// does not re-query the document every tick.
const abilityElements = document.querySelectorAll('.ability[data-ability]');
let token = null;
try { token = sessionStorage.getItem('qq-token'); } catch { /* standalone Hero Lab has no app session */ }
const socket = window.io('/hero-lab', { auth: token ? { token } : {} });
const query = new URLSearchParams(location.search);
const heroId = query.get('heroId');
const embedded = query.has('embedded') && window.parent !== window;
const requestedRoomCode = (query.get('room') || '').trim().toUpperCase();
const createRequested = query.get('create') === '1';
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
const codeToKey = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
let me = null;
let state = { players: [], projectiles: [], monsters: [], campfire: null, wave: null };
let stateReceivedAt = performance.now();
const clientProjectiles = new Map();
const particles = [];
const damageTexts = [];
const lightningArcs = [];
const enemyFlashes = new Map();
const enemyHitFlashUntil = new Map();
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
const dynamiteReadyBounces = new Map();
let sheriffRefundLabelState = null;
let sheriffRefundLabelTimer = null;
let lastLocalPosition = null;
let localIdleSince = performance.now();
let momentumNudge = null;
let sessionNudgeCount = 0;

// Debug-only profiler. It stays dormant unless the account passes the debug
// gate; the effect toggles stay readable either way (all true by default).
const profiler = createProfiler({
  getStats: () => ({
    particles: particles.length,
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
void profiler.start();
try { sessionNudgeCount = Number(sessionStorage.getItem('hero-lab-momentum-nudges') || 0) || 0; } catch { /* session storage is optional */ }
const ARENA_TUNING = GAME_CONFIG.arenaTuning;
document.documentElement.style.setProperty('--cooldown-ring-transition', `${ARENA_TUNING.heroTweaks.cooldownRingTransitionMs}ms`);
document.documentElement.style.setProperty('--sheriff-ready-glow-period', `${ARENA_TUNING.heroTweaks.sheriffReadyGlowPeriodMs}ms`);
document.documentElement.style.setProperty('--sheriff-ready-ring-duration', `${ARENA_TUNING.heroTweaks.sheriffReadyRingMs}ms`);
document.documentElement.style.setProperty('--sheriff-refund-pulse-duration', `${ARENA_TUNING.heroTweaks.sheriffRefundPulseMs}ms`);
document.documentElement.style.setProperty('--sheriff-refund-label-duration', `${ARENA_TUNING.heroTweaks.sheriffRefundLabelMs}ms`);
document.documentElement.style.setProperty('--overload-flash-duration', `${ARENA_TUNING.heroTweaks.electroOverloadFlashMs}ms`);
document.documentElement.style.setProperty('--overload-feedback-duration', `${ARENA_TUNING.heroTweaks.electroOverloadFeedbackMs}ms`);
const hasCard = (id) => (state.activeBuffs || []).some((buff) => buff.id === id);
const settings = { screenShake: true, shakeIntensity: SHAKE_DEFAULT_INTENSITY, damageNumbers: true, masterVolume: ARENA_TUNING.sound.defaultMasterVolume, muted: false, effectsQuality: 'auto' };
try { Object.assign(settings, JSON.parse(localStorage.getItem('hero-lab-settings') || '{}')); } catch { /* use defaults */ }
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
let primaryFireTimer = null;
let lastHudUpdateAt = 0;
let lastAimSentAt = 0;
let aimSendTimer = null;
let briefingTimer = null;
let briefingFadeTimer = null;
const BRIEFING_SESSION_KEY = 'hero-lab-briefing-shown';
const abilityReadyAt = new Map();
const runAgainHero = document.querySelector('#run-again-hero');
const runResultStats = document.querySelector('#run-result-stats');
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
  Object.assign(p, particle);
  particles.push(p);
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


function returnToKingdom() {
  if (embedded) {
    window.parent.postMessage({ type: 'hero-lab-game-over' }, location.origin);
  } else location.replace('/hero-lab');
}

function showRunResult(result) {
  latestRunResult = result;
  milestoneDawn.hidden = true;
  runResultPanel.hidden = false;
  const bestKey = `hero-lab-best:${result.heroId || activeHeroId}`;
  let personalBest = Number(result.wavesReached) || 0;
  try {
    personalBest = Math.max(personalBest, Number(localStorage.getItem(bestKey)) || 0);
    localStorage.setItem(bestKey, String(personalBest));
  } catch { /* storage may be unavailable */ }
  document.querySelector('#run-result-title').textContent = result.victory ? 'Victory!' : 'Campfire extinguished';
  document.querySelector('#run-result-message').textContent = `${result.wavesCleared || 0} waves cleared · ${result.rewardCoins || 0} placeholder coins${result.victory ? ' claimed' : ' earned'}.`;
  runResultStats.replaceChildren();
  const upgradeLines = result.attackBonusPercent > 0
    ? [`Your ${result.attackBonusBuilding || 'Kingdom'} +${result.attackBonusPercent}% base attack bonus dealt ${result.bonusDamage || 0} extra damage`]
    : [`Kingdom attack bonus: 0% · Extra damage: ${result.bonusDamage || 0}`];
  if (result.campfireBonusPercent > 0) upgradeLines.push(`Garden +${result.campfireBonusPercent}% base campfire HP per player`);
  for (const line of [
    `Waves reached: ${result.wavesReached || 0}`,
    `Kills: ${result.kills || 0}`,
    `Damage dealt: ${result.damageDealt || 0}`,
    `Personal best with this hero: ${personalBest} waves`,
    ...upgradeLines,
  ]) {
    const item = document.createElement('span'); item.textContent = line; runResultStats.append(item);
  }
  document.querySelector('#run-result-teaser').textContent = `Brute King awaits at wave ${result.nextBossWave || ARENA_TUNING.run.bossTeaserWave}.`;
  runAgainHero.replaceChildren(...HEROES.map((hero) => {
    const option = document.createElement('option'); option.value = hero.id; option.textContent = `${hero.emoji} ${hero.name}`;
    option.selected = hero.id === (result.heroId || activeHeroId); return option;
  }));

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
});
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
  option.textContent = `${hero.emoji} ${hero.name}`;
  return option;
}));
lobbyHero.value = activeHeroId;
lobbyHero.addEventListener('change', () => {
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

function showAreaEffect({ x, y, radius, kind = 'player', telegraphMs = 0, sourceAbility = 'weapon', color = null, sourceHeroId = null }) {
  const now = performance.now();
  areaEffects.push({ x, y, radius, kind, sourceAbility, color, sourceHeroId, phase: telegraphMs > 0 ? 'telegraph' : 'detonation', startedAt: now,
    durationMs: telegraphMs > 0 ? telegraphMs : ARENA_TUNING.areaEffects.detonationMs });
  if (areaEffects.length > 24) areaEffects.shift();
  if (telegraphMs <= 0) {
    if (sourceAbility === 'boss-slam') shakeCamera(SHAKE_BOSS_SLAM_TRAUMA, 'major');
    else if (sourceHeroId === 'guardian' && sourceAbility === 'ultimate') shakeCamera(SHAKE_ULTIMATE_TRAUMA, 'major');
    else shakeCamera(SHAKE_EXPLOSION_BASE_TRAUMA + radius / SHAKE_EXPLOSION_RADIUS_SCALE, 'explosion');
  }
}

function addDamageNumber({ x, y, damage, sourceId, targetId, bonus = false, color = null }) {
  if (!settings.damageNumbers || !effectToggles.numbers) return;
  const now = performance.now();
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
  if (existing && now - existing.lastHitAt <= ARENA_TUNING.damageNumbers.mergeMs) {
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

function showBanner(text, boss = false, durationMs = ARENA_TUNING.waveMoments.bannerMs) {
  if (!momentBanner) return;
  clearTimeout(bannerTimer);
  momentBanner.hidden = false;
  momentBanner.classList.toggle('boss', boss);
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

briefingButton.addEventListener('click', (event) => { event.stopPropagation(); openBriefing(true); });

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
}

function joinPayload() {
  const payload = { heroId: activeHeroId };
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
  state = { players: [], projectiles: [], monsters: [], campfire: null, wave: null };
  clientProjectiles.clear();
  releaseKeys();
  connectionStatus.textContent = 'Disconnected from the server. Reconnecting…';
});
socket.on('welcome', (welcome) => {
  me = welcome.you;
  joinFailed = false;
  if (welcome.room?.code) activeRoomCode = welcome.room.code;
  connectionStatus.textContent = 'Connected';
  if (embedded && welcome.room?.code) window.parent.postMessage({ type: 'hero-lab-room', code: welcome.room.code }, location.origin);
  openBriefing();
});
socket.on('join_error', ({ code, message } = {}) => {
  joinFailed = true;
  releaseKeys();
  connectionStatus.textContent = message || 'Could not join the room';
  if (embedded) window.parent.postMessage({ type: 'hero-lab-join-error', code, message }, location.origin);
  else showBanner(message || 'Could not join the room');
});
socket.on('state', (snapshot) => {
  state = snapshot;
  stateReceivedAt = performance.now();
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
socket.on('notice', (message) => {
  connectionStatus.textContent = message;
});
socket.on('host_changed', ({ name } = {}) => { if (name) showToast(`${name} is now the host`); });
socket.on('player_waiting', ({ name } = {}) => { if (name) showToast(`${name} is joining after this wave`); });
socket.on('player_joined', ({ name } = {}) => { if (name) showToast(`${name} joined`); });
socket.on('player_reconnected', ({ name } = {}) => { if (name) showToast(`${name} reconnected`); });
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
    playSound('ultimateCast', { volume: event.playerId === me ? 1 : 0.65 });
    shakeCamera(SHAKE_ULTIMATE_TRAUMA, 'major');
  }
});
socket.on('weapon_fired', (event) => {
  if (event.playerId !== me) playSound('shoot', { pitchVariance: ARENA_TUNING.sound.shotPitchVariance, volume: 0.6 });
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
  addDamageNumber({ x: hit.x + (Math.random() - 0.5) * 10, y: hit.y - 12, damage: hit.damage,
    sourceId: hit.sourceId, targetId: hit.id, bonus: hit.bonus, color: '#fff' });
  if (hit.id) {
    if (effectToggles.flash) enemyHitFlashUntil.set(hit.id, now + ARENA_TUNING.hitFlashMs);
    if (effectToggles.knockback) {
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
  // the window's single big puff already carries the feedback.
  if (effectToggles.sparks && effectiveQuality() === 'high' && !isMassKillWindow(performance.now())) {
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
  if (effectToggles.sound) playSound('hit');
}
function handleMonsterKilled(data) {
  const fx = HERO_FX_COLORS[data.heroId] || {};
  const now = performance.now();
  // Kill-path budget: crossing KILL_BURST_THRESHOLD within the window makes
  // this kill the window's single big puff + sound + shake.
  const announceMass = registerKill(now);
  const massWindow = isMassKillWindow(now);
  updateKillStreak(data.sourceId, announceMass);
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
  if (effectToggles.sound && data.sourceId !== me) {
    // One louder sound for the whole mass-kill window, normal sound otherwise.
    if (announceMass) playSound('kill', { volume: 0.9 });
    else if (!massWindow) playSound('kill', { volume: 0.5 });
  }
  // Extra camera kick on YOUR killing blow (stacks with the hit kick toward a
  // boss-slam-sized moment). The mass window already plays its single shake.
  if (data.sourceId === me && !massWindow) shakeCamera(SHAKE_KILL_TRAUMA);
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
    simulateHits(n = 1, damage = 12, sourceId = me) {
      for (let i = 0; i < n; i += 1) {
        const angle = (i / Math.max(1, n)) * Math.PI * 2;
        const x = 400 + Math.cos(angle) * 110;
        const y = 300 + Math.sin(angle) * 110;
        handleHit({ x, y, damage, sourceId, id: `simhit_${i}_${performance.now()}`, enemyType: 'zombie', heroId: activeHeroId, sourceX: 400, sourceY: 300, bonus: false });
      }
    },
    clearEffects() {
      particles.length = 0;
      damageTexts.length = 0;
      deathSprites.length = 0;
      damageNumberMerge.clear();
      enemyHitFlashUntil.clear();
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
    // Read-only view of the adaptive-quality state (Auto level + live budget).
    quality() {
      return { setting: settings.effectsQuality, effective: effectiveQuality(), budget: particleBudget, massKillWindow: isMassKillWindow(performance.now()) };
    },
    // Read-only view of the camera-shake state, so the hit/kill kick can be
    // verified without eyeballing pixels.
    shake() {
      const now = performance.now();
      return {
        trauma: Math.round(trauma * 1000) / 1000,
        offsetPx: Math.round(trauma * trauma * SHAKE_MAX_OFFSET * settings.shakeIntensity / SHAKE_MAX_INTENSITY * 100) / 100,
        screenShake: settings.screenShake,
        intensity: settings.shakeIntensity,
        toggle: effectToggles.shake,
        massWindow: isMassKillWindow(now),
      };
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
}
socket.on('area_telegraph', (effect) => showAreaEffect({ ...effect, telegraphMs: effect.telegraphMs || ARENA_TUNING.areaEffects.targetedTelegraphMs }));
socket.on('area_effect', (effect) => {
  showAreaEffect(effect);
  playSound(effect.sourceAbility === 'ultimate' ? 'ultimateCast' : 'explosion');
  for (let i = 0; i < 20; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 130;
    addParticle({ x: effect.x, y: effect.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 3, color: effect.color || '#ff9c45', alpha: 1, expiresAt: performance.now() + ARENA_TUNING.areaEffects.detonationMs });
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
  dynamiteReadyBounces.set(playerId, performance.now());
  if (playerId === me) {
    playSound('dynamiteReady');
    const circle = sheriffSkillAbility.querySelector('.ability-circle');
    circle.classList.add('dynamite-ready-pulse');
    setTimeout(() => circle.classList.remove('dynamite-ready-pulse'), ARENA_TUNING.heroTweaks.sheriffReadyRingMs);
  }
});
socket.on('sheriff_cooldown_refund', (event) => {
  if (event.playerId !== me) return;
  const now = performance.now();
  if (!sheriffRefundLabelState || now > sheriffRefundLabelState.mergeUntil) sheriffRefundLabelState = { totalMs: 0 };
  sheriffRefundLabelState.totalMs += event.refundMs;
  sheriffRefundLabelState.mergeUntil = now + ARENA_TUNING.heroTweaks.sheriffRefundMergeMs;
  sheriffRefundLabel.textContent = `-${(sheriffRefundLabelState.totalMs / 1000).toFixed(1)}s`;
  sheriffRefundLabel.hidden = false;
  sheriffRefundLabel.classList.remove('show');
  void sheriffRefundLabel.offsetWidth;
  sheriffRefundLabel.classList.add('show');
  const circle = sheriffSkillAbility.querySelector('.ability-circle');
  circle.classList.remove('cooldown-refund-pulse');
  void circle.offsetWidth;
  circle.classList.add('cooldown-refund-pulse');
  clearTimeout(sheriffRefundLabelTimer);
  sheriffRefundLabelTimer = setTimeout(() => {
    sheriffRefundLabel.hidden = true;
    sheriffRefundLabel.classList.remove('show');
  }, ARENA_TUNING.heroTweaks.sheriffRefundLabelMs);
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

function releaseKeys() {
  let changed = false;
  for (const key of Object.keys(keys)) {
    if (keys[key]) changed = true;
    keys[key] = false;
  }
  if (changed && socket.connected) socket.emit('input', keys);
}

function getPointerCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * ARENA_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * ARENA_HEIGHT,
  };
}

function fireWeapon(mode) {
  if (!me || !socket.connected) return;
  if (mode === 'secondary') {
    if (window.lastPointerWorld) socket.emit('fire', mode, window.lastPointerWorld);
    return;
  }
  const player = state.players.find((candidate) => candidate.id === me);
  if (player) showMuzzleFlash(player);
  playSound('shoot', { pitchVariance: ARENA_TUNING.sound.shotPitchVariance });
  socket.emit('fire', mode);
}

function stopPrimaryFire() {
  if (primaryFireTimer !== null) clearInterval(primaryFireTimer);
  primaryFireTimer = null;
}

function setPrimaryHeld(held) {
  if (activeHeroId === 'sheriff' && socket.connected) socket.emit('primary_hold', Boolean(held));
}

function onPointerMove(event) {
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
      if (socket.connected) socket.emit('input', keys);
    }
    event.preventDefault();
  } else if (event.code === 'KeyE' && !event.repeat) {
    socket.emit('skill');
  } else if (event.code === 'KeyQ' && !event.repeat) {
    socket.emit('ultimate');
  } else if (event.code === 'KeyI' && !event.repeat) {
    toggleStats();
  } else if (event.code === 'Escape' && !event.repeat) {
    socket.emit('cancel_targeting');
  }
}

function toggleStats() {
  const open = statsPanel.hidden;
  statsPanel.hidden = !open;
  infoButton.setAttribute('aria-expanded', String(open));
}

infoButton.addEventListener('click', toggleStats);

let roomCodeCopiedTimer = null;

function showToast(message) {
  if (!toastStack || !message) return;
  while (toastStack.children.length >= 4) toastStack.firstElementChild.remove();
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
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
  roomCodeCopiedTimer = setTimeout(() => { roomCodeCopied.hidden = true; }, 1200);
});

// Room code under the hero health bar, plus the spectate banner for players
// who joined after the run started.
let playerListSignature = '';
let pendingHeroSwap = null;
let pendingHeroSwapAt = 0;

function renderPlayerList(room) {
  const entries = [...(room.players || []), ...(room.waiting || [])];
  playerList.hidden = entries.length === 0;
  if (!entries.length) return;
  const signature = entries.map((entry) => `${entry.id}:${entry.heroId}:${entry.host}:${entry.waiting}:${entry.disconnected}`).join('|');
  if (signature === playerListSignature) return;
  playerListSignature = signature;
  playerListRows.replaceChildren(...entries.map((entry) => {
    const row = document.createElement('div');
    row.className = `player-row${entry.id === me ? ' me' : ''}${entry.waiting ? ' waiting' : ''}`;
    const emoji = document.createElement('span'); emoji.className = 'player-emoji'; emoji.textContent = entry.emoji || '🙂';
    const name = document.createElement('span'); name.className = 'player-name'; name.textContent = entry.name || 'Hero';
    row.append(emoji, name);
    if (entry.host) {
      const crown = document.createElement('span'); crown.className = 'player-crown'; crown.textContent = '👑';
      crown.title = 'Host'; crown.setAttribute('aria-label', 'Host'); row.append(crown);
    }
    if (entry.waiting) {
      const tag = document.createElement('span'); tag.className = 'player-tag'; tag.textContent = 'joining'; row.append(tag);
    } else if (entry.disconnected) {
      const tag = document.createElement('span'); tag.className = 'player-tag'; tag.textContent = 'away'; row.append(tag);
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
  if (lobbyHero.value !== mine.heroId) lobbyHero.value = mine.heroId;
}

let countdownLabel = '';
let teamHealthSignature = null;
let downedListSignature = null;
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
function setHudText(element, value) {
  if (hudTextCache.get(element) === value) return;
  hudTextCache.set(element, value);
  element.textContent = value;
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
  // The dev sandbox has no shareable code; hide the whole row so no divider is left behind.
  if (roomRow) setHudHidden(roomRow, !room.code);
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

function updateHud(timestamp = performance.now()) {
  const player = state.players?.find((candidate) => candidate.id === me);
  updateRoomHud();
  const phase = state.room?.phase;
  if (state.room && phase === 'lobby') {
    setHudText(waveNumber, 'Lobby');
    setHudText(waveDetails, state.room.hostId === me ? 'Press START RUN when everyone is in' : 'Waiting for the host to start…');
  } else if (state.room && phase === 'countdown') {
    setHudText(waveNumber, 'Get ready');
    setHudText(waveDetails, 'The first wave is coming');
  } else if (state.wave && waveNumber && waveDetails) {
    setHudText(waveNumber, `Wave ${state.wave.number || 1}`);
    if (state.buffVote) {
      setHudText(waveDetails, 'Choose a team buff');
    } else if (state.wave.nextWaveInMs > 0) {
      const remaining = Math.max(0, state.wave.nextWaveInMs - (timestamp - stateReceivedAt));
      setHudText(waveDetails, remaining > 300
        ? `Wave cleared · Next wave in ${Math.ceil(remaining / 1000)}s`
        : 'Next wave starting…');
    } else {
      setHudText(waveDetails, `${state.wave.twist ? `${state.wave.twist.label} · ` : ''}Enemies left: ${state.wave.enemiesRemaining}`);
    }
  }
  const fire = state.campfire;
  if (fire) {
    const ratio = Math.max(0, Math.min(1, fire.hp / Math.max(1, fire.maxHp)));
    setHudStyle(campfireFill, 'width', `${ratio * 100}%`);
    setHudStyle(campfireFill, 'backgroundColor', ratio > 0.5 ? '#55ce69' : ratio > 0.25 ? '#ffc34d' : '#f04b54');
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

  setHudText(heroName, `${player.emoji} ${player.name}`);
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

  const teammates = (state.players || []).filter((candidate) => candidate.id !== me);
  setHudHidden(teamHealth, teammates.length === 0);
  // Rebuild the rows only when the roster or a teammate's hp actually changes;
  // replaceChildren() ten times a second is pure churn otherwise.
  const teamSignature = teammates
    .map((teammate) => `${teammate.id}:${teammate.hp}:${teammate.maxHp}:${teammate.emoji || ''}:${teammate.name || ''}`)
    .join('|');
  if (teamSignature !== teamHealthSignature) {
    teamHealthSignature = teamSignature;
    teamHealth.replaceChildren(...teammates.map((teammate) => {
      const row = document.createElement('div'); row.className = 'teammate-health';
      const label = document.createElement('span'); label.className = 'teammate-health-label';
      label.textContent = `${teammate.emoji || ''} ${teammate.name}`;
      const value = document.createElement('span'); value.className = 'teammate-health-value';
      value.textContent = `${teammate.hp}/${teammate.maxHp}`;
      const track = document.createElement('span'); track.className = 'teammate-health-track';
      const fill = document.createElement('span'); fill.className = 'teammate-health-fill';
      fill.style.width = `${Math.max(0, Math.min(100, teammate.hp / Math.max(1, teammate.maxHp) * 100))}%`;
      track.append(fill); row.append(label, value, track); return row;
    }));
  }
  const downedPlayers = (state.players || []).filter((candidate) => candidate.downed);
  setHudHidden(downedList, downedPlayers.length === 0);
  // The respawn countdown re-renders once per second (the seconds value is part
  // of the signature), not ten times a second.
  const downedSignature = downedPlayers
    .map((candidate) => `${candidate.id}:${Math.ceil(candidate.respawnRemainingMs / 1000)}:${candidate.respawnSpeedMultiplier > 1 ? candidate.respawnSpeedMultiplier : ''}`)
    .join('|');
  if (downedSignature !== downedListSignature) {
    downedListSignature = downedSignature;
    downedList.replaceChildren(...downedPlayers.map((candidate) => {
      const item = document.createElement('div');
      const seconds = Math.ceil(candidate.respawnRemainingMs / 1000);
      item.textContent = `${candidate.emoji || '👻'} ${candidate.name}: ${seconds}s${candidate.respawnSpeedMultiplier > 1 ? ` · x${candidate.respawnSpeedMultiplier}` : ''}`;
      return item;
    }));
  }
  const buffEmoji = { maxHp: '❤️', attack: '⚔️', defense: '🛡️', speed: '🏃', campfire: '🔥', thorns: '🔥', scavenger: '💚', overcharge: '⚡', rally: '📣', 'glass-cannon': '💥', 'second-wind': '🕊️', 'life-steal': '🩸', ricochet: '↗️', volatile: '☄️', 'powder-keg': '🧨' };
  const buffSignature = (state.activeBuffs || []).map((buff) => buff.id).join('|');
  if (buffSignature !== buffIconsSignature) {
    buffIconsSignature = buffSignature;
    buffIcons.replaceChildren(...(state.activeBuffs || []).map((buff) => {
      const icon = document.createElement('span');
      icon.className = 'buff-icon';
      icon.textContent = buffEmoji[buff.id] || '✨';
      icon.title = `${buff.label}: ${buff.description}`;
      icon.setAttribute('aria-label', icon.title);
      return icon;
    }));
  }

  const color = GAME_CONFIG.hud[player.type] || GAME_CONFIG.hud.physical;
  abilityElements.forEach((element) => {
    const id = element.dataset.ability;
    const data = player.abilities?.[id];
    const circle = element.querySelector('.ability-circle');
    const name = element.querySelector('.ability-name');
    if (!data) return;
    setHudText(name, data.name || id);
    const heroType = player.type || 'physical';
    if (element.dataset.type !== heroType) element.dataset.type = heroType;
    if (circle.style.getPropertyValue('--fill-color') !== color) circle.style.setProperty('--fill-color', color);
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
    const isSheriffDynamite = player.heroId === 'sheriff' && id === 'skill';
    element.classList.toggle('sheriff-skill-ready', isSheriffDynamite && remaining <= 0 && lockoutRemaining <= 0);
    if (isSheriffDynamite) {
      const glowPeriod = `${ARENA_TUNING.heroTweaks.sheriffReadyGlowPeriodMs}ms`;
      if (element.style.getPropertyValue('--sheriff-ready-glow-period') !== glowPeriod) {
        element.style.setProperty('--sheriff-ready-glow-period', glowPeriod);
      }
      if (circle.style.getPropertyValue('--fill-color') !== '#ffd34f') circle.style.setProperty('--fill-color', '#ffd34f');
    }
    const key = `${me}:${id}`;
    const previous = abilityReadyAt.get(key);
    if (previous !== undefined && previous > 0 && remaining <= 0) {
      if (!isSheriffDynamite) {
        circle.classList.remove('ready-pulse');
        void circle.offsetWidth;
        circle.classList.add('ready-pulse');
        playSound(id === 'ultimate' ? 'ultimateReady' : 'abilityReady');
        setTimeout(() => circle.classList.remove('ready-pulse'), ARENA_TUNING.waveMoments.abilityReadyPulseMs);
      }
    }
    abilityReadyAt.set(key, remaining);
  });

  document.querySelector('#stat-health').textContent = `${player.hp} / ${player.maxHp}`;
  document.querySelector('#stat-attack').textContent = String(player.attack);
  document.querySelector('#stat-defense').textContent = String(player.defense);
  document.querySelector('#stat-speed').textContent = String(player.speed);
  const buildingBonus = player.buildingBonuses || {};
  const buildingRows = [];
  if (buildingBonus.attackPercent > 0) buildingRows.push(`${player.type === 'magic' ? '📚 Library' : '🛠️ Workshop'} +${Math.round(buildingBonus.attackPercent * 100)}% ${player.type === 'magic' ? 'magic' : 'physical'} attack`);
  if (buildingBonus.campfireMaxHpPercent > 0) buildingRows.push(`🌷 Garden +${Math.round(buildingBonus.campfireMaxHpPercent * 100)}% campfire max HP`);
  document.querySelector('#building-bonus-value').textContent = buildingRows.join(' · ') || 'None';
  document.querySelector('#building-bonus-stat').title = buildingRows.join(' · ') || 'No kingdom building bonuses apply to this hero';
  const momentumStatus = document.querySelector('#momentum-status');
  momentumStatus.textContent = player.momentumActive ? 'Active' : 'Inactive';
  document.querySelector('#momentum-stat').style.opacity = player.momentumActive ? '1' : '0.55';
  document.querySelector('#momentum-stat').title = `Moving: +${Math.round(ARENA_TUNING.momentum.bonus * 100)}% damage`;
  document.querySelector('#stat-talent-name').textContent = player.talent?.name || 'Talent';
  document.querySelector('#stat-talent-description').textContent = player.talent?.description || 'No special passive.';

  const vote = state.buffVote;
  buffVote.hidden = !vote;
  if (vote) {
    const voted = vote.votes?.[me] || '';
    document.querySelector('#buff-vote-title').textContent = `Wave ${vote.wave} cleared · Vote for a team buff`;
    const voteRemaining = Math.max(0, Math.ceil((vote.endsAt - state.serverTime - (timestamp - stateReceivedAt)) / 1000));
    document.querySelector('#buff-vote-status').textContent = vote.endsAt > 0
      ? `${vote.voteCount}/${state.players.length} votes · ${voteRemaining}s left${voted ? ' · Your vote is recorded' : ''}`
      : `${voted ? 'Your vote is recorded' : 'Choose when ready'} · no timer in solo`;
    const signature = `${vote.wave}:${voted}:${JSON.stringify(vote.votes)}:${vote.cards.map((card) => card.id).join(',')}`;
    if (signature !== lastBuffRender) {
      lastBuffRender = signature;
      buffCards.replaceChildren(...vote.cards.map((card) => {
        const button = document.createElement('button'); button.className = `buff-card${card.rare ? ' rare' : ''}${voted === card.id ? ' selected' : ''}`;
        button.type = 'button'; button.disabled = Boolean(voted);
        const title = document.createElement('strong'); title.textContent = `${card.rare ? '✨ ' : ''}${card.label}`;
        const description = document.createElement('span'); description.textContent = card.description;
        const tally = document.createElement('small'); tally.textContent = `${Object.values(vote.votes || {}).filter((id) => id === card.id).length} votes`;
        button.append(title, description, tally); button.addEventListener('click', () => socket.emit('buff_vote', card.id)); return button;
      }));
    }
  } else lastBuffRender = '';
  targetingHint.hidden = !player.targeting;
}

function onKeyUp(event) {
  const key = codeToKey[event.code];
  if (key && keys[key]) {
    keys[key] = false;
    if (socket.connected) socket.emit('input', keys);
  }
}

function onPointerDown(event) {
  if (!me) return;
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
    setPrimaryHeld(true);
    fireWeapon('primary');
    if (activeHeroId === 'bubbles') {
      stopPrimaryFire();
      primaryFireTimer = setInterval(() => fireWeapon('primary'), GAME_CONFIG.heroes.bubbles.weaponCooldownMs);
    }
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
  context.save();
  const traumaElapsed = Math.max(0, (currentTime - lastTraumaUpdateAt) / 1000);
  trauma = Math.max(0, trauma - SHAKE_DECAY * traumaElapsed);
  lastTraumaUpdateAt = currentTime;
  if (settings.screenShake && settings.shakeIntensity > SHAKE_MIN_INTENSITY && trauma > 0) {
    const offset = trauma * trauma * SHAKE_MAX_OFFSET * settings.shakeIntensity / SHAKE_MAX_INTENSITY;
    const noiseX = smoothShakeNoise(currentTime);
    const noiseY = smoothShakeNoise(currentTime, SHAKE_NOISE_SECONDARY_PHASE);
    context.translate(noiseX * offset, noiseY * offset);
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

  // 1. Draw Campfire in the middle
  const cf = state.campfire || {
    x: GAME_CONFIG.arena.width / 2,
    y: GAME_CONFIG.arena.height / 2,
    radius: GAME_CONFIG.campfire.radius,
    hp: GAME_CONFIG.campfire.hp,
    maxHp: GAME_CONFIG.campfire.hp,
  };
  if (cf) {
    context.save();
    context.globalAlpha = 0.42 + Math.sin(currentTime * 0.0015) * 0.08;
    context.setLineDash([2, 9]);
    context.strokeStyle = '#86f09b'; context.lineWidth = 3;
    context.beginPath(); context.arc(cf.x, cf.y, ARENA_TUNING.campfire.healRadius, 0, Math.PI * 2); context.stroke();
    if ((state.activeBuffs || []).some((buff) => buff.id === 'thorns')) {
      context.setLineDash([3, 7]); context.strokeStyle = '#ff9b43'; context.lineWidth = 2;
      context.beginPath(); context.arc(cf.x, cf.y, ARENA_TUNING.cards.effects.thornsRadius, 0, Math.PI * 2); context.stroke(); context.setLineDash([]);
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

    // Base ring of stones
    context.beginPath();
    context.arc(cf.x, cf.y, cf.radius, 0, Math.PI * 2);
    context.fillStyle = cf.hp > 0 ? '#3e2723' : '#2b2b2b';
    context.fill();
    context.strokeStyle = cf.hp > 0 ? '#ff7043' : '#555';
    context.lineWidth = 2;
    context.stroke();

    // Campfire flame or smoke
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if (cf.hp > 0) {
      const flameSize = 36 + Math.sin(currentTime * 0.009) * 3;
      context.font = `${flameSize}px sans-serif`;
      context.fillText('🔥', cf.x, cf.y - 2);
    } else {
      context.font = '32px sans-serif';
      context.fillText('💨', cf.x, cf.y - 2);
    }

  }

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
      const scale = (monster.scale || 1) * pulse;
      const visualRadius = 20 * scale;
      const tint = monster.type === 'brute-king' ? '#7e222c' : monster.type === 'brute' ? '#514638'
        : monster.type === 'exploder' ? '#b86b28' : monster.type === 'dummy' ? '#b39058' : '#426b36';
      context.beginPath();
      context.arc(mx, my, visualRadius, 0, Math.PI * 2);
      context.fillStyle = hitFlash ? '#fff' : tint;
      context.fill();
      context.strokeStyle = monster.isBoss ? '#ff5f69' : monster.type === 'exploder' ? '#ffb34f'
        : monster.type === 'dummy' ? '#8a6a35' : '#294a24';
      context.lineWidth = monster.isBoss ? 4 : 2;
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
    const electroStun = effect.sourceHeroId === 'electromancer' && effect.sourceAbility === 'skill';
    const guardianSlam = effect.sourceHeroId === 'guardian' && effect.sourceAbility === 'ultimate' && effect.kind === 'player';
    const danger = effect.kind === 'enemy';
    const fill = electroStun ? effect.color || HERO_FX_COLORS.electromancer.primary
      : guardianSlam ? HERO_FX_COLORS.guardian.primary : danger ? '#ef4654' : '#ffb347';
    const edge = electroStun ? HERO_FX_COLORS.electromancer.highlight
      : guardianSlam ? HERO_FX_COLORS.guardian.highlight : danger ? '#ff4d59' : '#ffe08a';
    context.save(); context.beginPath(); context.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2);
    if (effect.phase === 'telegraph') {
      context.globalAlpha = 0.12; context.fillStyle = fill;
      context.beginPath(); context.moveTo(effect.x, effect.y);
      context.arc(effect.x, effect.y, effect.radius * progress, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      context.closePath(); context.fill();
      context.globalAlpha = 0.9; context.strokeStyle = edge; context.lineWidth = 3; context.setLineDash([8, 8]);
      context.beginPath(); context.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2); context.stroke();
    } else {
      context.globalAlpha = (1 - progress) * 0.32; context.fillStyle = fill; context.fill();
      context.globalAlpha = 1 - progress; context.strokeStyle = edge; context.lineWidth = 4; context.setLineDash([]);
      context.beginPath(); context.arc(effect.x, effect.y, effect.radius * (ARENA_TUNING.areaEffects.ringStartScale + (1 - ARENA_TUNING.areaEffects.ringStartScale) * progress), 0, Math.PI * 2); context.stroke();
    }
    context.restore();
  }

  // 3. Draw players
  for (const player of state.players) {
    if (player.downed) {
      const remainingRatio = Math.max(0, Math.min(1, player.respawnRemainingMs / Math.max(1, player.respawnDurationMs)));
      context.save(); context.globalAlpha = 0.42;
      context.font = '32px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText('👻', player.x, player.y);
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

    if (player.id === me) {
      context.strokeStyle = '#1683ff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(center.x, center.y, 23, 0, Math.PI * 2);
      context.stroke();
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
    context.fillText(player.emoji, center.x - player.aim.x * recoil, center.y - player.aim.y * recoil);
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
    const readyBounceAt = dynamiteReadyBounces.get(player.id);
    if (readyBounceAt !== undefined) {
      const age = currentTime - readyBounceAt;
      if (age >= ARENA_TUNING.heroTweaks.sheriffReadyBounceMs) dynamiteReadyBounces.delete(player.id);
      else {
        const bounce = Math.sin(Math.PI * age / ARENA_TUNING.heroTweaks.sheriffReadyBounceMs) * 18;
        context.save(); context.font = '20px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
        context.fillText('🧨', center.x, center.y - 49 - bounce); context.restore();
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
    if ((player.invulnerable || player.ultimateFlash) && Math.floor(currentTime / ARENA_TUNING.respawn.flashIntervalMs) % 2 === 0) {
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
    if (monster.stunned) {
      context.font = '16px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText('⚡', monster.x, monster.y - 30);
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
      const sprite = glowSprite(HERO_FX_COLORS.electromancer.primary, '#f4fdff', HERO_FX_COLORS.electromancer.highlight);
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
    part.x += part.vx * dt;
    part.y += part.vy * dt;
    if (part.expiresAt) {
      const duration = part.durationMs || ARENA_TUNING.impactSparks.durationMs;
      part.alpha = Math.max(0, (part.expiresAt - currentTime) / duration);
    } else part.alpha -= part.decay || 0.04;
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
  context.globalAlpha = 1;
  context.restore();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';
  context.shadowBlur = 0;
  context.setLineDash([]);
}

function spawnDashTrail(player) {
  const prior=previousPositions.get(player.id);
  previousPositions.set(player.id,{x:player.x,y:player.y});
  if(!prior || Math.hypot(player.x-prior.x,player.y-prior.y)<2)return;
  const spec=GAME_CONFIG.visuals.dashTrail;
  const ramp = player.guardianCharging ? Math.min(1, player.guardianDamageRamp / GAME_CONFIG.arenaTuning.heroTweaks.guardianUltimateRampCap) : 0;
  for(let i=0;i<spec.count;i++) addParticle({x:prior.x+(Math.random()-.5)*16,y:prior.y+(Math.random()-.5)*16,
    vx:(Math.random()-.5)*35,vy:(Math.random()-.5)*35,radius:spec.radius+Math.random()*2+ramp*2,color:ramp > 0.4 ? HERO_FX_COLORS[player.heroId]?.highlight : HERO_FX_COLORS[player.heroId]?.primary || '#d8dfc7',alpha:.65+ramp*.35,decay:spec.decay});
}

canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerdown', onPointerDown);
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
addEventListener('blur', () => { releaseKeys(); stopPrimaryFire(); setPrimaryHeld(false); });
addEventListener('pointerup', () => { stopPrimaryFire(); setPrimaryHeld(false); });
addEventListener('pointercancel', () => { stopPrimaryFire(); setPrimaryHeld(false); });
requestAnimationFrame(draw);
