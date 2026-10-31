// ============================================================
// Shared sound preference and a few short, restrained UI cues.
// ------------------------------------------------------------
// The preference lives in the World game's existing settings key
// (`hero-lab-settings`: { muted, masterVolume, ...other game settings }), so
// the World, the Kingdom and the rest of the student app stay in sync. Only
// `muted` and `masterVolume` are ever written; every other field is kept.
//
// Cues are synthesized with WebAudio (no audio files). The AudioContext is
// created lazily, on the first user gesture or the first cue. Nothing here
// ever throws: sound is optional and never carries information on its own.
// ============================================================
import { reactive } from 'vue';
import { GAME_CONFIG } from '../../public/hero-lab/game-config.js';
import { setAudioOptions } from '../../public/hero-lab/arena-audio.js';

const SETTINGS_KEY = 'hero-lab-settings';
const DEFAULT_VOLUME = GAME_CONFIG.arenaTuning.sound.defaultMasterVolume;
// Repeats of the same cue closer together than this are dropped.
const SAME_CUE_GAP_MS = 80;
// At most this many cues sound at once; extra cues are skipped, not stacked.
const MAX_ACTIVE_CUES = 3;
// Cues are mixed well below the game's own effects.
const CUE_LEVEL = 0.55;

const clampVolume = (v) => Math.max(0, Math.min(1, Number(v)));

function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
    const volume = saved.masterVolume == null || saved.masterVolume === '' ? NaN : Number(saved.masterVolume);
    return { muted: Boolean(saved.muted), volume: Number.isFinite(volume) ? clampVolume(volume) : DEFAULT_VOLUME };
  } catch {
    return { muted: false, volume: DEFAULT_VOLUME };
  }
}

function writeSettings(changes) {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, ...changes }));
  } catch { /* storage blocked: the choice lasts for this visit */ }
}

/** Reactive preference for UI binding: `soundState.muted`, `soundState.volume` (0-1). */
export const soundState = reactive(readSettings());

// Keep the in-app game audio (Kingdom town sounds, Summon) on the same setting.
function syncEngine() {
  try { setAudioOptions({ volume: soundState.volume, mute: soundState.muted }); } catch { /* optional audio */ }
}
syncEngine();

export function isMuted() {
  return soundState.muted || soundState.volume <= 0;
}

export function setMuted(muted) {
  soundState.muted = Boolean(muted);
  writeSettings({ muted: soundState.muted });
  syncEngine();
  if (soundState.muted) silenceAll();
  return soundState.muted;
}

/** Flips mute, saves it, and returns the new muted state. */
export function toggleMuted() {
  return setMuted(!soundState.muted);
}

export function setVolume(volume) {
  const v = clampVolume(volume);
  if (!Number.isFinite(v)) return soundState.volume;
  soundState.volume = v;
  writeSettings({ masterVolume: v });
  syncEngine();
  return v;
}

// Another tab (or the World game frame) changed the setting.
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('storage', (event) => {
      if (event.key !== null && event.key !== SETTINGS_KEY) return;
      Object.assign(soundState, readSettings());
      syncEngine();
      if (soundState.muted) silenceAll();
    });
  } catch { /* no storage events */ }
}

// ---- audio context -------------------------------------------------------
let ctx = null;
let noise = null;
const lastPlayed = Object.create(null);
const active = []; // { end, out } of sounding cues

function getContext(create = true) {
  try {
    if (!ctx && create) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      ctx = new AudioContextClass();
    }
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

// Create (or resume) the context on the first real gesture so the first cue
// does not stall. Muted students never get an AudioContext at all.
if (typeof window !== 'undefined') {
  const prime = () => {
    if (!isMuted()) getContext();
    if (ctx && ctx.state === 'running') {
      window.removeEventListener('pointerdown', prime, true);
      window.removeEventListener('keydown', prime, true);
    }
  };
  try {
    window.addEventListener('pointerdown', prime, true);
    window.addEventListener('keydown', prime, true);
  } catch { /* no gesture priming */ }
}

function noiseBuffer(c) {
  if (noise && noise.sampleRate === c.sampleRate) return noise;
  noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.8), c.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

function silenceAll() {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const cue of active.splice(0)) {
    try { cue.out.gain.cancelScheduledValues(now); cue.out.gain.setTargetAtTime(0, now, 0.01); } catch { /* already gone */ }
  }
}

// --- tiny synth helpers (all times in seconds from `t0`) ---
function envelope(c, out, t0, { attack = 0.006, peak, dur }) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(out);
  return g;
}
function tone(c, out, t0, { type = 'sine', freq, to, dur, peak, attack }) {
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  osc.connect(envelope(c, out, t0, { attack, peak, dur }));
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}
function hiss(c, out, t0, { dur, peak, filter = 'bandpass', freq, to, q = 1, attack }) {
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  src.connect(f);
  f.connect(envelope(c, out, t0, { attack, peak, dur }));
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// Each cue returns its length in seconds.
const CUES = {
  // soft page sweep for screen wipes
  whoosh(c, out, t) {
    hiss(c, out, t, { dur: 0.34, peak: 0.07, freq: 380, to: 1500, q: 0.8, attack: 0.12 });
    return 0.36;
  },
  // the hero's strike on a correct answer: a bright, quick tap
  quizHit(c, out, t) {
    tone(c, out, t, { type: 'triangle', freq: 660, to: 330, dur: 0.11, peak: 0.12 });
    hiss(c, out, t, { dur: 0.05, peak: 0.05, filter: 'highpass', freq: 2400 });
    return 0.13;
  },
  // the enemy's hit on a wrong answer: a low, muffled thump
  enemyHit(c, out, t) {
    tone(c, out, t, { type: 'sine', freq: 150, to: 70, dur: 0.18, peak: 0.16 });
    hiss(c, out, t, { dur: 0.1, peak: 0.05, filter: 'lowpass', freq: 700 });
    return 0.2;
  },
  // arriving at the Summon sky: a gentle rising twinkle
  summonArrive(c, out, t) {
    [659, 831, 988].forEach((freq, i) => tone(c, out, t + i * 0.07, { freq, dur: 0.32, peak: 0.045, attack: 0.02 }));
    return 0.5;
  },
  // a star lands and its card is revealed: a bell chime, richer for rarer prizes
  summonReveal(c, out, t, { rarity } = {}) {
    tone(c, out, t, { freq: 880, dur: 0.7, peak: 0.07, attack: 0.008 });
    tone(c, out, t, { freq: 1320, dur: 0.5, peak: 0.035, attack: 0.008 });
    if (rarity === 'rare' || rarity === 'epic') tone(c, out, t + 0.08, { freq: 1760, dur: 0.45, peak: 0.03 });
    if (rarity === 'epic') tone(c, out, t + 0.16, { freq: 2217, dur: 0.5, peak: 0.025 });
    return 0.75;
  },
  // a small pop as results appear
  summonPop(c, out, t) {
    tone(c, out, t, { freq: 320, to: 900, dur: 0.07, peak: 0.08, attack: 0.003 });
    return 0.09;
  },
  // the Tower radio finding the class channel: a short, quiet static sweep
  radioTune(c, out, t) {
    hiss(c, out, t, { dur: 0.36, peak: 0.035, freq: 900, to: 2600, q: 4, attack: 0.03 });
    tone(c, out, t + 0.05, { freq: 520, to: 780, dur: 0.28, peak: 0.018, attack: 0.04 });
    return 0.4;
  },
  // a small confirmation blip when the radio answers
  radioResponse(c, out, t) {
    tone(c, out, t, { type: 'triangle', freq: 660, dur: 0.07, peak: 0.06 });
    tone(c, out, t + 0.08, { type: 'triangle', freq: 990, dur: 0.09, peak: 0.06 });
    return 0.19;
  },
};

/** The names playCue() accepts. */
export const CUE_NAMES = Object.freeze(Object.keys(CUES));

/**
 * Plays a short cue unless sound is muted. Never throws.
 * @param {'whoosh'|'quizHit'|'enemyHit'|'summonArrive'|'summonReveal'|'summonPop'|'radioTune'|'radioResponse'} name
 * @param {{ rarity?: 'common'|'rare'|'epic' }} [options] summonReveal only
 * @returns {boolean} whether the cue was started
 */
export function playCue(name, options = {}) {
  try {
    if (isMuted() || !CUES[name] || typeof window === 'undefined') return false;
    if (document.visibilityState === 'hidden') return false;
    const nowMs = performance.now();
    if (nowMs - (lastPlayed[name] ?? -Infinity) < SAME_CUE_GAP_MS) return false;
    const c = getContext();
    if (!c || c.state === 'closed') return false;
    const t = c.currentTime + 0.005;
    for (let i = active.length - 1; i >= 0; i--) if (active[i].end <= t) active.splice(i, 1);
    if (active.length >= MAX_ACTIVE_CUES) return false;
    lastPlayed[name] = nowMs;
    const out = c.createGain();
    out.gain.value = CUE_LEVEL * soundState.volume;
    out.connect(c.destination);
    const length = CUES[name](c, out, t, options);
    active.push({ end: t + length, out });
    setTimeout(() => { try { out.disconnect(); } catch { /* already gone */ } }, (length + 0.2) * 1000);
    return true;
  } catch {
    return false;
  }
}
