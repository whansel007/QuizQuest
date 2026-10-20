import { HEROES } from './hero-list.js';
import { EnemyProjectile } from './projectiles/enemy-projectile.js';
import { Projectile } from './bases/projectile.js';
import { GAME_CONFIG, HERO_FX_COLORS } from './game-config.js';
import { playSound, setAudioOptions, setHeartbeat } from './arena-audio.js';

const canvas = document.querySelector('#world');
const ARENA_WIDTH = GAME_CONFIG.arena.width;
const ARENA_HEIGHT = GAME_CONFIG.arena.height;
// Rasterize close to the displayed viewport while keeping world coordinates fixed.
const renderScale = Math.min(1, Math.max(0.4, Math.min(innerWidth / ARENA_WIDTH, innerHeight / ARENA_HEIGHT)));
canvas.width = Math.round(ARENA_WIDTH * renderScale);
canvas.height = Math.round(ARENA_HEIGHT * renderScale);
const particleBudget = Math.max(100, Math.floor(GAME_CONFIG.arenaTuning.performance.maxParticles * renderScale * renderScale));
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
const numbersSetting = document.querySelector('#numbers-setting');
const muteSetting = document.querySelector('#mute-setting');
const volumeSetting = document.querySelector('#volume-setting');
const killStreakHud = document.querySelector('#kill-streak');
let token = null;
try { token = sessionStorage.getItem('qq-token'); } catch { /* standalone Hero Lab has no app session */ }
const socket = window.io('/hero-lab', { auth: token ? { token } : {} });
const heroId = new URLSearchParams(location.search).get('heroId');
const selectedHero = HEROES.find((hero) => hero.id === heroId);
if (!selectedHero) location.replace('/hero-lab');

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
const leavingPlayers = [];
const areaEffects = [];
const muzzleFlashes = new Map();
const lastMuzzleAt = new Map();
const healParticleAt = new Map();
const previousPositions = new Map();
const momentumVisualAlpha = new Map();
const momentumPositions = new Map();
const momentumReadyLabels = [];
let lastLocalPosition = null;
let localIdleSince = performance.now();
let momentumNudge = null;
let sessionNudgeCount = 0;
try { sessionNudgeCount = Number(sessionStorage.getItem('hero-lab-momentum-nudges') || 0) || 0; } catch { /* session storage is optional */ }
const ARENA_TUNING = GAME_CONFIG.arenaTuning;
const hasCard = (id) => (state.activeBuffs || []).some((buff) => buff.id === id);
const settings = { screenShake: true, damageNumbers: true, masterVolume: ARENA_TUNING.sound.defaultMasterVolume, muted: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem('hero-lab-settings') || '{}')); } catch { /* use defaults */ }
setAudioOptions({ volume: settings.masterVolume, mute: settings.muted });
let lastTime = performance.now();
let lastBuffRender = '';
let cameraShake = { until: 0, intensity: 0, durationMs: 0 };
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

function addParticle(particle) {
  if (particles.length >= particleBudget) return;
  particles.push(particle);
}

function returnToKingdom() {
  if (new URLSearchParams(location.search).has('embedded') && window.parent !== window) {
    window.parent.postMessage({ type: 'hero-lab-game-over' }, location.origin);
  } else location.replace('/hero-lab');
}

function showRunResult(result) {
  latestRunResult = result;
  milestoneDawn.hidden = true;
  runResultPanel.hidden = false;
  const bestKey = `hero-lab-best:${result.heroId || selectedHero.id}`;
  let personalBest = Number(result.wavesReached) || 0;
  try {
    personalBest = Math.max(personalBest, Number(localStorage.getItem(bestKey)) || 0);
    localStorage.setItem(bestKey, String(personalBest));
  } catch { /* storage may be unavailable */ }
  document.querySelector('#run-result-title').textContent = result.victory ? 'Victory!' : 'Campfire extinguished';
  document.querySelector('#run-result-message').textContent = `${result.wavesCleared || 0} waves cleared · ${result.rewardCoins || 0} placeholder coins${result.victory ? ' claimed' : ' earned'}.`;
  runResultStats.replaceChildren();
  for (const line of [
    `Waves reached: ${result.wavesReached || 0}`,
    `Kills: ${result.kills || 0}`,
    `Damage dealt: ${result.damageDealt || 0}`,
    `Personal best with this hero: ${personalBest} waves`,
    `Your upgrades dealt ${result.bonusDamage || 0} extra damage`,
  ]) {
    const item = document.createElement('span'); item.textContent = line; runResultStats.append(item);
  }
  document.querySelector('#run-result-teaser').textContent = `Brute King awaits at wave ${result.nextBossWave || ARENA_TUNING.run.bossTeaserWave}.`;
  runAgainHero.replaceChildren(...HEROES.map((hero) => {
    const option = document.createElement('option'); option.value = hero.id; option.textContent = `${hero.emoji} ${hero.name}`;
    option.selected = hero.id === (result.heroId || selectedHero.id); return option;
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
  const nextHeroId = runAgainHero.value || selectedHero.id;
  if (new URLSearchParams(location.search).has('embedded') && window.parent !== window) {
    window.parent.postMessage({ type: 'hero-lab-run-again', heroId: nextHeroId }, location.origin);
  } else location.replace(`/hero-lab/world?heroId=${encodeURIComponent(nextHeroId)}`);
});
document.querySelector('#return-kingdom').addEventListener('click', returnToKingdom);
document.querySelector('#session-stop').addEventListener('click', returnToKingdom);
document.querySelector('#session-keep-going').addEventListener('click', () => { sessionSummary.hidden = true; });
shakeSetting.checked = settings.screenShake;
numbersSetting.checked = settings.damageNumbers;
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
numbersSetting.addEventListener('change', () => { settings.damageNumbers = numbersSetting.checked; saveSettings(); });
muteSetting.addEventListener('change', () => { settings.muted = muteSetting.checked; saveSettings(); });
volumeSetting.addEventListener('input', () => { settings.masterVolume = Number(volumeSetting.value); saveSettings(); });

function shakeCamera(intensity, durationMs) {
  if (!settings.screenShake) return;
  cameraShake = { until: performance.now() + durationMs, intensity: Math.max(cameraShake.intensity, intensity), durationMs };
}

function showAreaEffect({ x, y, radius, kind = 'player', telegraphMs = 0, sourceAbility = 'weapon' }) {
  const now = performance.now();
  areaEffects.push({ x, y, radius, kind, sourceAbility, phase: telegraphMs > 0 ? 'telegraph' : 'detonation', startedAt: now,
    durationMs: telegraphMs > 0 ? telegraphMs : ARENA_TUNING.areaEffects.detonationMs });
  if (areaEffects.length > 24) areaEffects.shift();
  if (telegraphMs <= 0) {
    const factor = Math.min(1, radius / ARENA_TUNING.enemies.bruteKing.slamRadius);
    const intensity = ARENA_TUNING.screenShake.majorMinPx + factor * (ARENA_TUNING.screenShake.majorMaxPx - ARENA_TUNING.screenShake.majorMinPx);
    shakeCamera(intensity, ARENA_TUNING.screenShake.majorMs);
  }
}

function addDamageNumber({ x, y, damage, sourceId, targetId, bonus = false, color = null }) {
  if (!settings.damageNumbers) return;
  const now = performance.now();
  const existing = damageTexts.find((entry) => entry.targetId === targetId && entry.sourceId === sourceId && now - entry.lastHitAt <= ARENA_TUNING.damageNumbers.mergeMs);
  if (existing) {
    existing.value += damage;
    existing.text = `-${Math.round(existing.value)}`;
    existing.lastHitAt = now;
    existing.color = bonus ? '#ffe34f' : (color || '#fff');
    existing.bonus ||= bonus;
    existing.startedAt = now;
    existing.startY = y - 12;
    return;
  }
  damageTexts.push({ x, y, startY: y, value: damage, text: `-${Math.round(damage)}`, startedAt: now, lastHitAt: now,
    sourceId, targetId, bonus, alpha: 1, color: bonus ? '#ffe34f' : (color || '#fff'), scale: bonus ? ARENA_TUNING.damageNumbers.bonusScale : 1 });
  while (damageTexts.length > ARENA_TUNING.damageNumbers.maxVisible) damageTexts.shift();
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

function updateKillStreak(sourceId) {
  if (sourceId !== me) return;
  const now = performance.now();
  combo.count = now - combo.lastKillAt <= ARENA_TUNING.killStreak.windowMs ? combo.count + 1 : 1;
  combo.lastKillAt = now;
  killStreakHud.hidden = false;
  killStreakHud.textContent = `x${combo.count}`;
  killStreakHud.style.setProperty('--streak-scale-peak', String(ARENA_TUNING.killStreak.scalePeak));
  killStreakHud.classList.remove('pop');
  void killStreakHud.offsetWidth;
  killStreakHud.classList.add('pop');
  const semitone = Math.min(combo.count - 1, ARENA_TUNING.sound.maxKillPitchSteps) * ARENA_TUNING.sound.killSemitonePerStep;
  playSound('kill', { semitones: semitone });
}

function showMuzzleFlash(player) {
  const now = performance.now();
  if (now - (lastMuzzleAt.get(player.id) || 0) < ARENA_TUNING.muzzleFlash.durationMs) return;
  lastMuzzleAt.set(player.id, now);
  muzzleFlashes.set(player.id, { startedAt: now, aim: { ...player.aim }, heroId: player.heroId,
    recoil: ARENA_TUNING.muzzleFlash.recoilMinPx + Math.random() * (ARENA_TUNING.muzzleFlash.recoilMaxPx - ARENA_TUNING.muzzleFlash.recoilMinPx) });
}

socket.on('connect', () => {
  connectionStatus.textContent = 'Joining the field…';
  if (selectedHero) socket.emit('join', { heroId: selectedHero.id });
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
  connectionStatus.textContent = 'Connected';
  openBriefing();
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
    shakeCamera(ARENA_TUNING.screenShake.majorMinPx, ARENA_TUNING.screenShake.majorMs);
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
  if (event.id === me) shakeCamera(ARENA_TUNING.screenShake.majorMinPx, ARENA_TUNING.screenShake.heroHitMs);
});
socket.on('player_hit', (hit) => {
  if (hit.id !== me) return;
  addDamageNumber({ x: hit.x, y: hit.y - 24, damage: hit.damage, sourceId: hit.sourceId, targetId: hit.id, color: '#ff6161' });
  shakeCamera(ARENA_TUNING.screenShake.heroHitMinPx + Math.random() * (ARENA_TUNING.screenShake.heroHitMaxPx - ARENA_TUNING.screenShake.heroHitMinPx), ARENA_TUNING.screenShake.heroHitMs);
  playSound('hit');
});
socket.on('campfire_hit', () => {
  shakeCamera(ARENA_TUNING.screenShake.majorMinPx, ARENA_TUNING.screenShake.majorMs);
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
  if (event.playerId === me) shakeCamera(ARENA_TUNING.screenShake.majorMinPx, ARENA_TUNING.screenShake.majorMs);
});
socket.on('momentum_ready', (event) => {
  if (event.playerId === me) momentumReadyLabels.push({ startedAt: performance.now(), bonus: event.bonus });
});
socket.on('game_over', (result = {}) => {
  if (runResultPanel.hidden) showRunResult({ victory: false, reason: result.reason, wavesReached: state.wave?.number || 0,
    wavesCleared: 0, kills: 0, damageDealt: 0, bonusDamage: 0, rewardCoins: 0, nextBossWave: ARENA_TUNING.run.bossTeaserWave, heroId: selectedHero.id });
});
socket.on('hit', (hit) => {
  const fx = HERO_FX_COLORS[hit.heroId] || {};
  addDamageNumber({ x: hit.x + (Math.random() - 0.5) * 10, y: hit.y - 12, damage: hit.damage,
    sourceId: hit.sourceId, targetId: hit.id, bonus: hit.bonus, color: '#fff' });
  if (hit.id) {
    enemyHitFlashUntil.set(hit.id, performance.now() + ARENA_TUNING.hitFlashMs);
    const direction = Math.atan2(hit.y - (hit.sourceY ?? hit.y), hit.x - (hit.sourceX ?? hit.x));
    const maxDamage = GAME_CONFIG.arenaTuning.damageNumbers.knockbackScaleDamage || 10;
    let amount = ARENA_TUNING.knockback.normalMinPx + (ARENA_TUNING.knockback.normalMaxPx - ARENA_TUNING.knockback.normalMinPx) * Math.min(1, hit.damage / maxDamage);
    if (hit.enemyType === 'brute') amount *= ARENA_TUNING.knockback.bruteMultiplier;
    if (hit.enemyType === 'brute-king') amount *= ARENA_TUNING.knockback.kingMultiplier;
    enemyHitFx.set(hit.id, { x: Math.cos(direction) * amount, y: Math.sin(direction) * amount, startedAt: performance.now(), durationMs: ARENA_TUNING.knockback.visualMs });
  }
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
  playSound('hit');
});
socket.on('monster_killed', (data) => {
  const fx = HERO_FX_COLORS[data.heroId] || {};
  updateKillStreak(data.sourceId);
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
      startedAt: performance.now(),
      durationMs: lifeMs,
      expiresAt: performance.now() + lifeMs,
    });
  }
  if (data.sourceId !== me) playSound('kill', { volume: 0.5 });
});
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
socket.on('second_wind', () => { showBanner('SECOND WIND'); playSound('explosion'); shakeCamera(ARENA_TUNING.screenShake.majorMinPx, ARENA_TUNING.screenShake.majorMs); });
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
  if (selectedHero.id === 'sheriff' && socket.connected) socket.emit('primary_hold', Boolean(held));
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

function updateHud(timestamp = performance.now()) {
  const player = state.players?.find((candidate) => candidate.id === me);
  if (state.wave && waveNumber && waveDetails) {
    waveNumber.textContent = `Wave ${state.wave.number || 1}`;
    if (state.buffVote) {
      waveDetails.textContent = 'Choose a team buff';
    } else if (state.wave.nextWaveInMs > 0) {
      const remaining = Math.max(0, state.wave.nextWaveInMs - (timestamp - stateReceivedAt));
      waveDetails.textContent = remaining > 300
        ? `Wave cleared · Next wave in ${Math.ceil(remaining / 1000)}s`
        : 'Next wave starting…';
    } else {
      waveDetails.textContent = `${state.wave.twist ? `${state.wave.twist.label} · ` : ''}Enemies left: ${state.wave.enemiesRemaining}`;
    }
  }
  const fire = state.campfire;
  if (fire) {
    const ratio = Math.max(0, Math.min(1, fire.hp / Math.max(1, fire.maxHp)));
    campfireFill.style.width = `${ratio * 100}%`;
    campfireFill.style.backgroundColor = ratio > 0.5 ? '#55ce69' : ratio > 0.25 ? '#ffc34d' : '#f04b54';
    campfireValue.textContent = `${fire.hp} / ${fire.maxHp}`;
    setHeartbeat(ratio < ARENA_TUNING.lowHp.threshold);
  }
  const boss = state.boss;
  bossHud.hidden = !boss;
  if (boss) {
    const ratio = Math.max(0, Math.min(1, boss.hp / Math.max(1, boss.maxHp)));
    bossHealthFill.style.width = `${ratio * 100}%`;
    bossHealthValue.textContent = `${boss.name} · ${boss.hp} / ${boss.maxHp}`;
  }
  if (!player) return;

  heroName.textContent = `${player.emoji} ${player.name}`;
  const hpRatio = player.maxHp > 0 ? Math.max(0, Math.min(1, player.hp / player.maxHp)) : 0;
  healthFill.style.width = `${hpRatio * 100}%`;
  healthFill.style.background = hpRatio <= .25 ? '#ef5350' : hpRatio <= .55 ? '#ffb74d' : '#64d985';
  healthTrack.setAttribute('aria-valuemax', String(player.maxHp));
  healthTrack.setAttribute('aria-valuenow', String(player.hp));
  healthValue.textContent = `${player.hp} / ${player.maxHp}`;
  lowHpVignette.hidden = hpRatio >= ARENA_TUNING.lowHp.threshold;
  lowHpVignette.style.setProperty('--low-hp-pulse-duration', `${1000 / ARENA_TUNING.lowHp.pulseHz}ms`);
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
    killStreakHud.hidden = true;
  }

  const teammates = (state.players || []).filter((candidate) => candidate.id !== me);
  teamHealth.hidden = teammates.length === 0;
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
  const downedPlayers = (state.players || []).filter((candidate) => candidate.downed);
  downedList.hidden = downedPlayers.length === 0;
  downedList.replaceChildren(...downedPlayers.map((candidate) => {
    const item = document.createElement('div');
    const seconds = Math.ceil(candidate.respawnRemainingMs / 1000);
    item.textContent = `${candidate.emoji || '👻'} ${candidate.name}: ${seconds}s${candidate.respawnSpeedMultiplier > 1 ? ` · x${candidate.respawnSpeedMultiplier}` : ''}`;
    return item;
  }));
  const buffEmoji = { maxHp: '❤️', attack: '⚔️', defense: '🛡️', speed: '🏃', campfire: '🔥', thorns: '🔥', scavenger: '💚', overcharge: '⚡', rally: '📣', 'glass-cannon': '💥', 'second-wind': '🕊️', 'life-steal': '🩸', ricochet: '↗️', volatile: '☄️', 'powder-keg': '🧨' };
  buffIcons.replaceChildren(...(state.activeBuffs || []).map((buff) => {
    const icon = document.createElement('span');
    icon.className = 'buff-icon';
    icon.textContent = buffEmoji[buff.id] || '✨';
    icon.title = `${buff.label}: ${buff.description}`;
    icon.setAttribute('aria-label', icon.title);
    return icon;
  }));

  const color = GAME_CONFIG.hud[player.type] || GAME_CONFIG.hud.physical;
  document.querySelectorAll('.ability[data-ability]').forEach((element) => {
    const id = element.dataset.ability;
    const data = player.abilities?.[id];
    const circle = element.querySelector('.ability-circle');
    const name = element.querySelector('.ability-name');
    if (!data) return;
    name.textContent = data.name || id;
    element.dataset.type = player.type || 'physical';
    circle.style.setProperty('--fill-color', color);
    const elapsedMs = Math.max(0, timestamp - stateReceivedAt);
    const remaining = Math.max(0, data.remainingMs - elapsedMs);
    const fill = data.durationMs > 0 ? Math.max(0, Math.min(100, (1 - remaining / data.durationMs) * 100)) : 100;
    circle.style.setProperty('--fill', `${fill}%`);
    circle.classList.toggle('ready', remaining <= 0);
    const key = `${me}:${id}`;
    const previous = abilityReadyAt.get(key);
    if (previous !== undefined && previous > 0 && remaining <= 0) {
      circle.classList.remove('ready-pulse');
      void circle.offsetWidth;
      circle.classList.add('ready-pulse');
      playSound(id === 'ultimate' ? 'ultimateReady' : 'abilityReady');
      setTimeout(() => circle.classList.remove('ready-pulse'), ARENA_TUNING.waveMoments.abilityReadyPulseMs);
    }
    abilityReadyAt.set(key, remaining);
  });

  document.querySelector('#stat-health').textContent = `${player.hp} / ${player.maxHp}`;
  document.querySelector('#stat-attack').textContent = String(player.attack);
  document.querySelector('#stat-defense').textContent = String(player.defense);
  document.querySelector('#stat-speed').textContent = String(player.speed);
  const buildingBonus = player.buildingBonuses || {};
  const buildingRows = [];
  if (buildingBonus.attackPercent > 0) buildingRows.push(`${player.type === 'magic' ? '📚 Library' : '🛠️ Workshop'} +${Math.round(buildingBonus.attackPercent * 100)}% damage`);
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
    if (selectedHero.id === 'bubbles') {
      stopPrimaryFire();
      primaryFireTimer = setInterval(() => fireWeapon('primary'), GAME_CONFIG.heroes.bubbles.weaponCooldownMs);
    }
  }
}

function draw(timestamp) {
  requestAnimationFrame(draw);
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
  if (currentTime < cameraShake.until) {
    const remaining = Math.max(0, (cameraShake.until - currentTime) / Math.max(1, cameraShake.durationMs));
    const offset = cameraShake.intensity * remaining;
    context.translate((Math.random() * 2 - 1) * offset, (Math.random() * 2 - 1) * offset);
  } else cameraShake.intensity = 0;
  if (currentTime < cameraZoom.until) {
    const centerX = ARENA_WIDTH / 2, centerY = ARENA_HEIGHT / 2;
    const progress = (currentTime - cameraZoom.startedAt) / (cameraZoom.until - cameraZoom.startedAt);
    const pulse = 1 - Math.abs(progress * 2 - 1);
    const scale = 1 + (cameraZoom.scale - 1) * pulse;
    context.translate(centerX, centerY); context.scale(scale, scale); context.translate(-centerX, -centerY);
  } else cameraZoom.scale = 1;

  context.drawImage(backgroundCanvas, 0, 0, ARENA_WIDTH, ARENA_HEIGHT);

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
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      const pulse = monster.type === 'exploder' ? 1 + Math.sin(currentTime * 0.012) * 0.09 : 1;
      const scale = (monster.scale || 1) * pulse;
      const visualRadius = 20 * scale;
      const tint = monster.type === 'brute-king' ? '#7e222c' : monster.type === 'brute' ? '#514638'
        : monster.type === 'exploder' ? '#b86b28' : '#426b36';
      context.beginPath();
      context.arc(mx, my, visualRadius, 0, Math.PI * 2);
      context.fillStyle = hitFlash ? '#fff' : tint;
      context.fill();
      context.strokeStyle = monster.isBoss ? '#ff5f69' : monster.type === 'exploder' ? '#ffb34f' : '#294a24';
      context.lineWidth = monster.isBoss ? 4 : 2;
      context.stroke();
      context.font = `${32 * scale}px sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.filter = hitFlash ? 'brightness(0) invert(1)' : 'none';
      context.fillText(monster.emoji || '🧟', mx, my);
      if (monster.isBoss) { context.filter = 'none'; context.font = '24px sans-serif'; context.fillText('👑', mx, my - visualRadius - 9); }
      context.filter = 'none';
      context.restore();

      // Monster health bar
      const mBarW = monster.isBoss ? 70 : 28 * scale;
      const mBarH = 4;
      const mBarX = mx - mBarW / 2;
      const mBarY = my - visualRadius;
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      context.fillRect(mBarX - 1, mBarY - 1, mBarW + 2, mBarH + 2);
      const mHpRatio = Math.max(0, monster.hp / monster.maxHp);
      context.fillStyle = mHpRatio > 0.4 ? '#4caf50' : '#e53935';
      context.fillRect(mBarX, mBarY, mBarW * mHpRatio, mBarH);
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
    if (currentTime < death.startedAt) {
      context.font = '32px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
      context.fillText(death.emoji, death.x, death.y);
      continue;
    }
    const progress = Math.min(1, (currentTime - death.startedAt) / death.durationMs);
    if (progress >= 1) { deathSprites.splice(i, 1); continue; }
    const scale = progress < 0.25
      ? ARENA_TUNING.deathBurst.scaleStart + (death.scalePeak - ARENA_TUNING.deathBurst.scaleStart) * (progress / 0.25)
      : death.scalePeak * (1 - (progress - 0.25) / 0.75);
    context.save(); context.globalAlpha = 1 - progress; context.translate(death.x, death.y); context.scale(scale, scale);
    context.font = '32px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(death.emoji, 0, 0); context.restore();
  }

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
    const danger = effect.kind === 'enemy';
    const fill = danger ? '#ef4654' : '#ffb347';
    const edge = danger ? '#ff4d59' : '#ffe08a';
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
    if (player.invulnerable && Math.floor(currentTime / ARENA_TUNING.respawn.flashIntervalMs) % 2 === 0) {
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
    context.strokeStyle=arc.color;context.lineWidth=4;context.shadowColor=HERO_FX_COLORS.electromancer.primary;context.shadowBlur=14;
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
      const glow = context.createRadialGradient(p.x, p.y, p.radius * 0.3, p.x, p.y, p.radius * 2.1);
      glow.addColorStop(0, '#f4fdff'); glow.addColorStop(0.3, HERO_FX_COLORS.electromancer.highlight);
      glow.addColorStop(0.62, `${HERO_FX_COLORS.electromancer.primary}aa`); glow.addColorStop(1, 'transparent');
      context.save(); context.globalAlpha = 0.82; context.fillStyle = glow;
      context.beginPath(); context.arc(p.x, p.y, p.radius * 2.1, 0, Math.PI * 2); context.fill(); context.restore();
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
      continue;
    }
    context.save();
    context.globalAlpha = Math.max(0, part.alpha);
    context.fillStyle = part.color;
    if (part.emoji || part.text) {
      context.font = `bold ${Math.max(10, part.radius * (part.emoji ? 2 : 1.4))}px sans-serif`;
      context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(part.emoji || part.text, part.x, part.y);
    } else {
      context.beginPath();
      context.arc(part.x, part.y, part.radius * Math.max(0.2, part.alpha), 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  // 6. Update and draw floating damage numbers
  for (let i = damageTexts.length - 1; i >= 0; i--) {
    const dtObj = damageTexts[i];
    if (dtObj.startedAt !== undefined) {
      const progress = Math.min(1, (currentTime - dtObj.startedAt) / ARENA_TUNING.damageNumbers.durationMs);
      dtObj.y = dtObj.startY - ARENA_TUNING.damageNumbers.risePx * progress;
      dtObj.alpha = 1 - progress;
    } else {
      dtObj.y += dtObj.vy * dt;
      dtObj.alpha -= 1.6 * dt;
    }
    if (dtObj.alpha <= 0) {
      damageTexts.splice(i, 1);
      continue;
    }
    context.save();
    context.globalAlpha = Math.max(0, dtObj.alpha * (dtObj.sourceId && dtObj.sourceId !== me ? ARENA_TUNING.damageNumbers.teammateOpacity : 1));
    context.font = `bold ${13 * (dtObj.scale || 1)}px sans-serif`;
    context.fillStyle = dtObj.color || '#ffea00';
    context.textAlign = 'center';
    context.fillText(dtObj.text, dtObj.x, dtObj.y);
    context.restore();
  }
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
  for(let i=0;i<spec.count;i++) addParticle({x:prior.x+(Math.random()-.5)*16,y:prior.y+(Math.random()-.5)*16,
    vx:(Math.random()-.5)*35,vy:(Math.random()-.5)*35,radius:spec.radius+Math.random()*2,color:HERO_FX_COLORS[player.heroId]?.highlight || '#d8dfc7',alpha:.8,decay:spec.decay});
}

canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
addEventListener('keydown', onKeyDown);
addEventListener('keyup', onKeyUp);
addEventListener('blur', () => { releaseKeys(); stopPrimaryFire(); setPrimaryHeld(false); });
addEventListener('pointerup', () => { stopPrimaryFire(); setPrimaryHeld(false); });
addEventListener('pointercancel', () => { stopPrimaryFire(); setPrimaryHeld(false); });
requestAnimationFrame(draw);
