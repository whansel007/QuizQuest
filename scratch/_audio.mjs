import { GAME_CONFIG } from '../public/hero-lab/game-config.js';

const profiles = GAME_CONFIG.arenaTuning.sound.profiles;
const voices = [];
let audio = null;
let masterVolume = 0.55;
let muted = false;
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

export function setAudioOptions({ volume = masterVolume, mute = muted } = {}) {
  masterVolume = Math.max(0, Math.min(1, Number(volume) || 0));
  muted = Boolean(mute);
}

export function playSound(name, { semitones = 0, volume = 1, pitchVariance = 0 } = {}) {
  if (muted || masterVolume <= 0) return;
  const context = getContext();
  const profile = profiles[name];
  if (!context || !profile) return;
  const now = context.currentTime;
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end <= now) voices.splice(i, 1);
  if (voices.length >= GAME_CONFIG.arenaTuning.sound.maxVoices) {
    const quietest = voices.reduce((a, b) => a.level <= b.level ? a : b);
    try { quietest.gain.gain.cancelScheduledValues(now); quietest.gain.gain.setTargetAtTime(0, now, 0.008); quietest.osc.stop(now + 0.03); } catch { /* already stopped */ }
    voices.splice(voices.indexOf(quietest), 1);
  }
  const osc = context.createOscillator();
  const gain = context.createGain();
  const jitter = pitchVariance ? 1 + (Math.random() * 2 - 1) * pitchVariance : 1;
  osc.type = profile.type;
  osc.frequency.value = profile.frequency * jitter * (2 ** (semitones / 12));
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(profile.gain * masterVolume * volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, now + profile.durationMs / 1000);
  osc.connect(gain); gain.connect(context.destination);
  osc.start(now); osc.stop(now + profile.durationMs / 1000 + 0.01);
  voices.push({ osc, gain, level: profile.gain * volume, end: now + profile.durationMs / 1000 + 0.02 });
}

// Profiler hook: how many voices are currently sounding, and whether the
// context exists at all.
export function audioStats() {
  return { voices: voices.length, contextState: audio ? audio.state : 'none' };
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
