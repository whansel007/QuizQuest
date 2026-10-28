<script setup>
// ============================================================
// Sign-in page: a living preview of the forest. The real hero
// sprites wander and idle in the clearing, with a few fireflies.
// Purely decorative: hidden from assistive tech, never takes
// clicks or focus, and still when reduced motion is requested.
// ============================================================
import { onMounted, onUnmounted, ref } from 'vue';
import { loadOwnedHeroVisuals } from '../student/avatar.js';

const ROSTER = ['guardian', 'sheriff', 'pilot', 'bombardier', 'bubbles', 'electromancer'];
const frame = ref(null);
const canvas = ref(null);
let ctx;
let raf = 0;
let observer;
let last = 0;
let reduced = false;
let width = 0;
let height = 0;
let background;
let clip = ['open'];
let fps = 5;
const walkers = [];
const flies = [];

const rand = (a, b) => a + Math.random() * (b - a);
// heroes keep to the clearing's ground band
const ground = () => ({ minX: width * 0.08, maxX: width * 0.92, minY: height * 0.62, maxY: height * 0.9 });

function pickTarget(w) {
  const g = ground();
  w.tx = rand(g.minX, g.maxX);
  w.ty = rand(g.minY, g.maxY);
}

function resize() {
  if (!frame.value || !canvas.value) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = frame.value.getBoundingClientRect();
  const oldW = width || rect.width;
  const oldH = height || rect.height;
  width = rect.width;
  height = rect.height;
  canvas.value.width = Math.round(width * dpr);
  canvas.value.height = Math.round(height * dpr);
  ctx = canvas.value.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const w of walkers) { w.x *= width / oldW; w.y *= height / oldH; pickTarget(w); }
  for (const f of flies) { f.x *= width / oldW; f.y *= height / oldH; }
  if (reduced) draw(performance.now());
}

function drawBackground() {
  if (!background?.complete) { ctx.fillStyle = '#32533E'; ctx.fillRect(0, 0, width, height); return; }
  // cover the panel, anchored to the bottom so the clearing floor stays in view
  const scale = Math.max(width / background.width, height / background.height);
  const w = background.width * scale;
  const h = background.height * scale;
  ctx.drawImage(background, (width - w) / 2, height - h, w, h);
}

function update(dt, time) {
  for (const w of walkers) {
    if (time < w.pauseUntil) { w.moving = false; continue; }
    const dx = w.tx - w.x;
    const dy = w.ty - w.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) { w.moving = false; w.pauseUntil = time + rand(1200, 3600); pickTarget(w); continue; }
    const step = Math.min(d, w.speed * dt);
    w.x += (dx / d) * step;
    w.y += (dy / d) * step;
    w.moving = true;
    if (Math.abs(dx) > 1) w.facing = dx < 0 ? -1 : 1;
  }
  for (const f of flies) {
    f.phase += dt * f.speed;
    f.x += Math.cos(f.phase) * 8 * dt;
    f.y += Math.sin(f.phase * 1.3) * 6 * dt;
  }
}

function draw(time) {
  drawBackground();
  const size = Math.max(54, height * 0.13);
  for (const w of [...walkers].sort((a, b) => a.y - b.y)) {
    const depth = 0.8 + 0.25 * ((w.y - height * 0.62) / (height * 0.28));
    const h = size * depth;
    const hop = w.moving && !reduced ? Math.abs(Math.sin((time + w.offset) / 160)) * h * 0.08 : 0;
    ctx.fillStyle = 'rgba(20, 36, 26, .32)';
    ctx.beginPath(); ctx.ellipse(w.x, w.y, h * 0.32, h * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    const name = w.moving ? 'open' : clip[Math.floor(((time + w.offset) / 1000) * fps) % clip.length];
    const sprite = w.frames[name] || w.frames.open;
    if (!sprite) continue;
    const crop = w.visual.crop.open;
    const sw = h * crop[2] / crop[3];
    ctx.save();
    ctx.translate(w.x, w.y - hop);
    if (w.facing < 0) ctx.scale(-1, 1);
    ctx.drawImage(sprite, ...crop, -sw / 2, -h, sw, h);
    ctx.restore();
  }
  for (const f of flies) {
    const glow = 0.45 + 0.4 * Math.sin(time / 500 + f.phase * 3);
    ctx.fillStyle = `rgba(255, 233, 160, ${reduced ? 0.6 : glow})`;
    ctx.beginPath(); ctx.arc(f.x, f.y, 2.2, 0, Math.PI * 2); ctx.fill();
  }
}

function tick(time) {
  const dt = last ? Math.min((time - last) / 1000, 0.05) : 0;
  last = time;
  if (!document.hidden) {
    update(dt, time);
    draw(time);
  }
  raf = requestAnimationFrame(tick);
}

onMounted(async () => {
  reduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  background = new Image();
  background.src = '/hero-lab/assets/forest-clearing.svg';
  background.onload = () => reduced && draw(performance.now());
  resize();
  observer = new ResizeObserver(resize);
  observer.observe(frame.value);
  let records = new Map();
  try {
    const loaded = await loadOwnedHeroVisuals(ROSTER);
    records = loaded.heroes;
    clip = loaded.config.IDLE_CLIP || clip;
    fps = loaded.config.IDLE_FPS || fps;
  } catch (error) {
    console.warn('[Sign-in preview] Hero sprites unavailable; showing the forest only.', error);
  }
  const g = ground();
  ROSTER.forEach((id, i) => {
    const record = records.get(id);
    if (!record) return;
    const w = {
      id, visual: record.visual, frames: record.frames,
      x: g.minX + ((i + 0.5) / ROSTER.length) * (g.maxX - g.minX), y: rand(g.minY, g.maxY),
      facing: i % 2 ? -1 : 1, moving: false, speed: rand(26, 42), offset: rand(0, 3000), pauseUntil: rand(0, 2500),
    };
    pickTarget(w);
    walkers.push(w);
  });
  for (let i = 0; i < 9; i += 1) flies.push({ x: rand(0.1, 0.9) * width, y: rand(0.3, 0.7) * height, phase: rand(0, 6), speed: rand(0.4, 0.9) });
  if (reduced) draw(performance.now());
  else raf = requestAnimationFrame(tick);
});
onUnmounted(() => {
  cancelAnimationFrame(raf);
  observer?.disconnect();
});
</script>

<template>
  <div ref="frame" class="login-preview" aria-hidden="true">
    <canvas ref="canvas"></canvas>
  </div>
</template>

<style scoped>
.login-preview { position: absolute; inset: 0; overflow: hidden; background: #32533e; pointer-events: none; }
.login-preview canvas { display: block; width: 100%; height: 100%; }
</style>
