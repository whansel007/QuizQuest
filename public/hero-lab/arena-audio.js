import { GAME_CONFIG } from './game-config.js';

const profiles = GAME_CONFIG.arenaTuning.sound.profiles;
const voices = [];
const loops = new Map();
const lastPlayedAt = Object.create(null);
let audio = null;
let masterVolume = 0.55;
let muted = false;
let disabled = false;
let heartbeat = null;

function getContext() {
  if (!audio) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audio = new AudioContextClass();
  }
  if (audio.state === 'suspended') audio.resume();
  return audio;
}

// Pre-warm on the first user input so the first kill/hit has no context-resume
// hitch. Safe to call repeatedly; it only creates the context once.
export function warmUpAudio() {
  getContext();
}

export function setAudioOptions({ volume = masterVolume, mute = muted } = {}) {
  masterVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  muted = Boolean(mute);
  const now = audio?.currentTime || 0;
  for (const loop of loops.values()) {
    const level = disabled || muted ? 0 : loop.profile.gain * masterVolume * loop.volume;
    loop.gain.gain.cancelScheduledValues(now);
    loop.gain.gain.setTargetAtTime(level, now, 0.025);
  }
}

export function startSoundLoop(name, { volume = 0.45 } = {}) {
  if (disabled || muted || masterVolume <= 0 || loops.has(name)) return () => {};
  const profile = profiles[name];
  const context = profile && getContext();
  if (!context) return () => {};
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = profile.type;
  osc.frequency.value = profile.frequency;
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(profile.gain * masterVolume * volume, context.currentTime + 0.08);
  osc.connect(gain); gain.connect(context.destination); osc.start();
  const loop = { osc, gain, profile, volume };
  loops.set(name, loop);
  return () => {
    if (loops.get(name) !== loop) return;
    loops.delete(name);
    try {
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(0, now, 0.025);
      osc.stop(now + 0.12);
    } catch { /* already stopped */ }
  };
}

export function playSound(name, { semitones = 0, volume = 1, pitchVariance = 0 } = {}) {
  if (disabled || muted || masterVolume <= 0) return;
  const context = getContext();
  const profile = profiles[name];
  if (!context || !profile) return;
  // Rate-limit hot sounds (hit/kill) so a mass-kill burst cannot stack dozens
  // of overlapping voices in the same instant.
  const now = performance.now();
  const minInterval = profile.minIntervalMs || 0;
  if (minInterval > 0) {
    const last = lastPlayedAt[name] || -Infinity;
    if (now - last < minInterval) return;
    lastPlayedAt[name] = now;
  }
  const audioNow = context.currentTime;
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= audioNow) voices.splice(i, 1);
  if (voices.length >= GAME_CONFIG.arenaTuning.sound.maxVoices) {
    const quietest = voices.reduce((a, b) => a.level <= b.level ? a : b);
    try { quietest.gain.gain.cancelScheduledValues(audioNow); quietest.gain.gain.setTargetAtTime(0, audioNow, 0.008); quietest.osc.stop(audioNow + 0.03); } catch { /* already stopped */ }
    voices.splice(voices.indexOf(quietest), 1);
  }
  const osc = context.createOscillator();
  const gain = context.createGain();
  const jitter = pitchVariance ? 1 + (Math.random() * 2 - 1) * pitchVariance : 1;
  osc.type = profile.type;
  osc.frequency.value = profile.frequency * jitter * (2 ** (semitones / 12));
  // Optional pitch slide (e.g. the town hop's soft 'boing').
  if (profile.slideTo) osc.frequency.exponentialRampToValueAtTime(profile.slideTo * jitter * (2 ** (semitones / 12)), audioNow + profile.durationMs / 1000);
  gain.gain.setValueAtTime(0, audioNow);
  gain.gain.linearRampToValueAtTime(profile.gain * masterVolume * volume, audioNow + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, audioNow + profile.durationMs / 1000);
  osc.connect(gain); gain.connect(context.destination);
  osc.start(audioNow); osc.stop(audioNow + profile.durationMs / 1000 + 0.01);
  voices.push({ osc, gain, level: profile.gain * volume, end: audioNow + profile.durationMs / 1000 + 0.02 });
}

// Profiler hook: how many voices are currently sounding, and whether the
// context exists at all.
export function audioStats() {
  return { voices: voices.length, contextState: audio ? audio.state : 'none' };
}

// Profiler hook: mute the whole engine without touching the user's settings.
export function setAudioEnabled(enabled) {
  disabled = !enabled;
  const now = audio?.currentTime || 0;
  for (const loop of loops.values()) {
    const level = disabled || muted ? 0 : loop.profile.gain * masterVolume * loop.volume;
    loop.gain.gain.cancelScheduledValues(now);
    loop.gain.gain.setTargetAtTime(level, now, 0.025);
  }
}

export function setHeartbeat(active) {
  if (active && heartbeat === null) {
    playSound('heartbeat');
    heartbeat = window.setInterval(() => playSound('heartbeat'), GAME_CONFIG.arenaTuning.sound.heartbeatIntervalMs);
  } else if (!active && heartbeat !== null) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
}
