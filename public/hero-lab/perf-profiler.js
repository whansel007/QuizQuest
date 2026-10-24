// Debug-only performance overlay (same gate as the debug menu: seeded demo
// accounts). It samples frame cost, server tick cost and entity counts once a
// second, keeps a short frame trace for kill bursts, and exposes live effect
// toggles so each visual can be measured on its own.
//
// The overlay must stay cheap: fixed-size typed arrays, no allocation per
// frame, DOM writes only when the displayed numbers change.
import {
  PERF_SAMPLE_WINDOW_MS, PERF_OVERLAY_UPDATE_MS, PERF_FRAME_HISTORY, PERF_SLOW_FRAME_MS, PERF_STATS_POLL_MS,
} from '../../config/tuning.js';

// Read by the game loop. Everything defaults to on; the overlay flips them.
export const effectToggles = {
  burst: true,
  numbers: true,
  sound: true,
  combo: true,
  sparks: true,
  knockback: true,
  shake: true,
  flash: true,
};

const TOGGLE_LABELS = {
  burst: 'burst',
  numbers: 'numbers',
  sound: 'sound',
  combo: 'combo',
  sparks: 'sparks',
  knockback: 'knock',
  shake: 'shake',
  flash: 'flash',
};

export function createProfiler({ getStats, getRoomCode, getToken }) {
  const frameDeltas = new Float64Array(PERF_FRAME_HISTORY);
  const drawTimes = new Float64Array(PERF_FRAME_HISTORY);
  const frameStamps = new Float64Array(PERF_FRAME_HISTORY);
  let frameIndex = 0;
  let frameCount = 0;

  const samples = [];
  let windowStart = 0;
  let windowFrames = 0;
  let windowDeltaSum = 0;
  let windowDeltaWorst = 0;
  let windowDrawSum = 0;
  let windowDrawWorst = 0;
  let lastFrameAt = 0;

  let server = { tickAvgMs: 0, tickWorstMs: 0, bytesPerSecond: 0, wave: 0, phase: null };
  let lastBytes = 0;
  let lastBytesAt = 0;
  let lastDomUpdate = 0;
  let overlay = null;
  let rows = null;
  let chips = null;
  // The overlay is a Settings-panel-only tool: while hidden it does zero DOM
  // work and the server poll is paused; only the cheap per-frame counters
  // (typed arrays + window sums) keep running.
  let visible = false;

  function recordFrame(now, drawMs) {
    if (lastFrameAt) {
      const delta = now - lastFrameAt;
      if (delta > 0 && delta < 1000) {
        frameDeltas[frameIndex] = delta;
        frameStamps[frameIndex] = now;
        drawTimes[frameIndex] = drawMs;
        frameIndex = (frameIndex + 1) % PERF_FRAME_HISTORY;
        if (frameCount < PERF_FRAME_HISTORY) frameCount += 1;
        windowFrames += 1;
        windowDeltaSum += delta;
        windowDrawSum += drawMs;
        if (delta > windowDeltaWorst) windowDeltaWorst = delta;
        if (drawMs > windowDrawWorst) windowDrawWorst = drawMs;
      }
    }
    lastFrameAt = now;
    if (!windowStart) windowStart = now;
    if (now - windowStart >= PERF_SAMPLE_WINDOW_MS) flushWindow(now);
  }

  function flushWindow(now) {
    if (windowFrames > 0) {
      const stats = getStats();
      samples.push({
        at: Math.round(now),
        fps: Math.round((windowFrames * 1000) / Math.max(1, now - windowStart)),
        frameAvgMs: round(windowDeltaSum / windowFrames),
        frameWorstMs: round(windowDeltaWorst),
        drawAvgMs: round(windowDrawSum / windowFrames),
        drawWorstMs: round(windowDrawWorst),
        particles: stats.particles,
        damageTexts: stats.damageTexts,
        audioVoices: stats.audioVoices,
        monsters: stats.monsters,
        projectiles: stats.projectiles,
        heapMb: stats.heapMb,
        serverTickAvgMs: server.tickAvgMs,
        serverTickWorstMs: server.tickWorstMs,
        bytesPerSecond: server.bytesPerSecond,
      });
      if (samples.length > 600) samples.shift();
    }
    windowStart = now;
    windowFrames = 0;
    windowDeltaSum = 0;
    windowDeltaWorst = 0;
    windowDrawSum = 0;
    windowDrawWorst = 0;
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  // ---- server side: tick cost and bytes sent, polled once a second ---------
  async function pollServer() {
    const code = getRoomCode();
    if (!code) return;
    const token = getToken();
    try {
      const response = await fetch('/api/student/hero-lab/rooms', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) return;
      const body = await response.json();
      const room = (body.rooms || []).find((entry) => entry.code === code);
      if (!room) return;
      const now = performance.now();
      if (lastBytesAt && typeof room.bytesSent === 'number' && room.bytesSent >= lastBytes) {
        server.bytesPerSecond = Math.round((room.bytesSent - lastBytes) / ((now - lastBytesAt) / 1000));
      }
      if (typeof room.bytesSent === 'number') { lastBytes = room.bytesSent; lastBytesAt = now; }
      server.tickAvgMs = room.tickAvgMs ?? room.tickMs ?? 0;
      server.tickWorstMs = room.tickWorstMs ?? room.tickMs ?? 0;
      server.wave = room.wave;
      server.phase = room.phase;
    } catch { /* the poll is best-effort */ }
  }

  // ---- overlay ------------------------------------------------------------
  function build() {
    overlay = document.createElement('div');
    overlay.id = 'perf-overlay';
    // Mounted inside the Settings panel when that mount point exists, so the
    // overlay can never appear during normal play. Without the mount point it
    // falls back to a floating panel (standalone/debug use).
    const mount = typeof document !== 'undefined' ? document.getElementById('perf-mount') : null;
    overlay.style.cssText = (mount
      ? [
        'position:static', 'width:100%', 'min-width:0', 'margin:2px 0 0',
        'display:grid', 'gap:4px', 'padding:8px 10px',
        'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
        'color:#dff5e3', 'background:rgba(10,20,14,.82)', 'border:1px solid rgba(140,220,160,.35)',
        'border-radius:8px', 'pointer-events:auto', 'user-select:text',
      ]
      : [
        'position:fixed', 'right:8px', 'top:50%', 'transform:translateY(-50%)',
        'z-index:30', 'display:grid', 'gap:4px', 'padding:8px 10px', 'min-width:196px',
        'font:11px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace',
        'color:#dff5e3', 'background:rgba(10,20,14,.82)', 'border:1px solid rgba(140,220,160,.35)',
        'border-radius:8px', 'pointer-events:auto', 'user-select:text',
      ]).join(';');
    const title = document.createElement('strong');
    title.textContent = 'PERF';
    title.style.cssText = 'font-size:10px;letter-spacing:.12em;color:#9fe3b0';
    overlay.append(title);

    rows = {};
    for (const key of ['frame', 'draw', 'server', 'bytes', 'entities', 'heap']) {
      const row = document.createElement('div');
      row.style.cssText = 'white-space:pre;color:#cfe9d6';
      rows[key] = row;
      overlay.append(row);
    }

    const chipRow = document.createElement('div');
    chipRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:3px;margin-top:2px';
    chips = {};
    for (const [key, label] of Object.entries(TOGGLE_LABELS)) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = label;
      chip.style.cssText = chipStyle(true);
      chip.addEventListener('click', () => toggle(key));
      chips[key] = chip;
      chipRow.append(chip);
    }
    overlay.append(chipRow);
    (mount || document.body).append(overlay);
    overlay.style.display = 'none';
  }

  function chipStyle(on) {
    return [
      'font:10px ui-monospace,monospace', 'padding:1px 5px', 'border-radius:4px', 'cursor:pointer',
      `border:1px solid ${on ? 'rgba(150,240,170,.55)' : 'rgba(200,120,120,.5)'}`,
      `background:${on ? 'rgba(70,160,100,.35)' : 'rgba(120,40,40,.35)'}`,
      `color:${on ? '#d6ffe0' : '#f0c9c9'}`,
    ].join(';');
  }

  function toggle(key, value) {
    if (!(key in effectToggles)) return;
    effectToggles[key] = value === undefined ? !effectToggles[key] : Boolean(value);
    if (chips && chips[key]) chips[key].style.cssText = chipStyle(effectToggles[key]);
    if (key === 'sound' && typeof api.onSoundToggle === 'function') api.onSoundToggle(effectToggles.sound);
    render(true);
  }

  function render(force = false) {
    // Hidden = no formatting, no DOM writes at all.
    if (!visible || !overlay || !rows) return;
    const now = performance.now();
    if (!force && now - lastDomUpdate < PERF_OVERLAY_UPDATE_MS) return;
    lastDomUpdate = now;
    const last = samples[samples.length - 1];
    if (!last) return;
    rows.frame.textContent = `frame  ${last.frameAvgMs.toFixed(1)} avg  ${last.frameWorstMs.toFixed(1)} max  ${last.fps} fps`;
    rows.frame.style.color = last.frameWorstMs > PERF_SLOW_FRAME_MS ? '#ffb4b4' : '#cfe9d6';
    rows.draw.textContent = `draw   ${last.drawAvgMs.toFixed(1)} avg  ${last.drawWorstMs.toFixed(1)} max`;
    rows.server.textContent = `tick   ${last.serverTickAvgMs.toFixed(2)} avg  ${last.serverTickWorstMs.toFixed(2)} max`;
    rows.bytes.textContent = `net    ${(last.bytesPerSecond / 1024).toFixed(1)} KB/s`;
    rows.entities.textContent = `part ${last.particles}  num ${last.damageTexts}  snd ${last.audioVoices}\n` +
      `enem ${last.monsters}  proj ${last.projectiles}`;
    rows.heap.textContent = last.heapMb ? `heap   ${last.heapMb.toFixed(1)} MB` : 'heap   n/a';
  }

  const api = {
    recordFrame,
    render,
    toggle,
    onSoundToggle: null,
    samples,
    isVisible: () => visible,
    setVisible(next) {
      visible = Boolean(next);
      if (overlay) overlay.style.display = visible ? 'grid' : 'none';
      if (visible) render(true);
    },
    exportTrace() {
      const frames = [];
      const start = frameCount < PERF_FRAME_HISTORY ? 0 : frameIndex;
      for (let i = 0; i < frameCount; i += 1) {
        const index = (start + i) % PERF_FRAME_HISTORY;
        frames.push({ at: Math.round(frameStamps[index]), ms: round(frameDeltas[index]), draw: round(drawTimes[index]) });
      }
      return { frames, samples: samples.slice() };
    },
    reset() {
      samples.length = 0;
      frameCount = 0;
      frameIndex = 0;
      windowFrames = 0;
      windowDeltaSum = 0;
      windowDeltaWorst = 0;
      windowDrawSum = 0;
      windowDrawWorst = 0;
      windowStart = 0;
      lastFrameAt = 0;
      lastBytes = 0;
      lastBytesAt = 0;
    },
    server: () => ({ ...server }),
  };

  async function start() {
    let enabled = false;
    try {
      const token = getToken();
      const response = await fetch('/api/student/debug-mode', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      enabled = response.ok && (await response.json()).enabled === true;
    } catch { enabled = false; }
    // The visible overlay is the debug-menu-gated tool, but the measurement data
    // is always exposed so the lag investigation can read frame stats without
    // forcing the overlay open. ?profiler=1 also passes the gate (builds the
    // overlay), but visibility is still controlled by the Settings panel, so
    // the pop-up can never appear during normal play.
    window.__heroLabPerf = api;
    const forced = typeof location !== 'undefined' && new URLSearchParams(location.search).has('profiler');
    if (!enabled && !forced) return false;
    build();
    // Both timers no-op while the overlay is hidden (no DOM work, no polling);
    // recordFrame keeps the minimal counters running regardless.
    window.setInterval(() => { if (visible) { void pollServer(); } }, PERF_STATS_POLL_MS);
    window.setInterval(() => { if (visible) render(true); }, PERF_OVERLAY_UPDATE_MS);
    return true;
  }

  return { start, ...api };
}
