<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import {
  SUMMON_METEOR_DURATION_MS, SUMMON_METEOR_INTERVAL_MAX_S, SUMMON_METEOR_INTERVAL_MIN_S,
  SUMMON_METEOR_LENGTH_MAX_PX, SUMMON_METEOR_LENGTH_MIN_PX, SUMMON_METEOR_MAX_ALPHA,
  SUMMON_METEOR_SHOWER_CHANCE, SUMMON_METEOR_SHOWER_COUNT_MAX, SUMMON_METEOR_SHOWER_COUNT_MIN,
  SUMMON_METEOR_SHOWER_SPACING_MS, SUMMON_SKY_FRAME_CAP_FPS, SUMMON_STAR_COUNT,
  SUMMON_TWINKLE_COUNT, SUMMON_TWINKLE_DURATION_MAX_S, SUMMON_TWINKLE_DURATION_MIN_S,
} from '../../../config/tuning.js';

const host = ref(null);
const canvas = ref(null);
let ctx;
let starsLayer;
let skyGradient;
let stars = [];
let twinkles = [];
let meteors = [];
let meteorQueue = [];
let raf = 0;
let observer;
let resizeObserver;
let visible = true;
let reducedMotion = false;
let pauseStartedAt = 0;
let lastFrame = 0;
let nextMeteorAt = 0;
let frameCostTotal = 0;
let frameCostCount = 0;
let frameCostReported = false;

function random(min, max) { return min + Math.random() * (max - min); }

function makeStars(width, height) {
  stars = Array.from({ length: SUMMON_STAR_COUNT }, () => ({
    x: Math.random() * width,
    y: Math.random() * height,
    r: random(1, 2.5),
    color: ['#FBF2D8', '#D8E9DB', '#F3CFD1'][Math.floor(Math.random() * 3)],
  }));
  twinkles = Array.from({ length: Math.min(SUMMON_TWINKLE_COUNT, stars.length) }, (_, i) => ({
    star: stars[Math.floor(i * stars.length / Math.min(SUMMON_TWINKLE_COUNT, stars.length))],
    period: random(SUMMON_TWINKLE_DURATION_MIN_S, SUMMON_TWINKLE_DURATION_MAX_S) * 1000,
    phase: Math.random() * Math.PI * 2,
  }));
  starsLayer = document.createElement('canvas');
  starsLayer.width = Math.max(1, Math.ceil(width));
  starsLayer.height = Math.max(1, Math.ceil(height));
  const g = starsLayer.getContext('2d');
  for (const star of stars) {
    g.globalAlpha = random(0.28, 0.74);
    g.fillStyle = star.color;
    g.beginPath(); g.arc(star.x, star.y, star.r, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

function resize() {
  if (!host.value || !canvas.value) return;
  const rect = host.value.getBoundingClientRect();
  const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  canvas.value.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.value.height = Math.max(1, Math.round(rect.height * dpr));
  canvas.value.style.width = `${rect.width}px`;
  canvas.value.style.height = `${rect.height}px`;
  ctx = canvas.value.getContext('2d', { alpha: false });
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  skyGradient = ctx.createLinearGradient(0, 0, 0, rect.height);
  skyGradient.addColorStop(0, '#1B3154');
  skyGradient.addColorStop(0.53, '#2C4D7C');
  skyGradient.addColorStop(1, '#4D6E9E');
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, rect.width, rect.height);
  makeStars(rect.width, rect.height);
  ctx.drawImage(starsLayer, 0, 0);
  lastFrame = 0;
}

function scheduleMeteor(now) {
  if (reducedMotion) return;
  if (!nextMeteorAt) {
    nextMeteorAt = now + random(SUMMON_METEOR_INTERVAL_MIN_S, SUMMON_METEOR_INTERVAL_MAX_S) * 1000;
    return;
  }
  if (now < nextMeteorAt) return;
  const count = Math.random() < SUMMON_METEOR_SHOWER_CHANCE
    ? Math.floor(random(SUMMON_METEOR_SHOWER_COUNT_MIN, SUMMON_METEOR_SHOWER_COUNT_MAX + 1)) : 1;
  meteorQueue = Array.from({ length: count }, (_, i) => now + i * SUMMON_METEOR_SHOWER_SPACING_MS);
  nextMeteorAt = now + random(SUMMON_METEOR_INTERVAL_MIN_S, SUMMON_METEOR_INTERVAL_MAX_S) * 1000;
}

function drawMeteor(meteor, now) {
  const elapsed = now - meteor.start;
  const t = Math.max(0, Math.min(1, elapsed / SUMMON_METEOR_DURATION_MS));
  const headX = meteor.x - t * meteor.travel;
  const headY = meteor.y + t * meteor.travel * 0.7;
  const tailX = headX + meteor.length * 0.819;
  const tailY = headY - meteor.length * 0.574;
  const fade = Math.sin(Math.PI * t) * SUMMON_METEOR_MAX_ALPHA;
  const gradient = ctx.createLinearGradient(tailX, tailY, headX, headY);
  gradient.addColorStop(0, 'rgba(251,242,216,0)');
  gradient.addColorStop(1, `rgba(251,242,216,${fade})`);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(headX, headY); ctx.stroke();
  return elapsed < SUMMON_METEOR_DURATION_MS;
}

function tick(now) {
  raf = 0;
  if (!ctx || !canvas.value || !visible || document.hidden) return;
  const interval = 1000 / SUMMON_SKY_FRAME_CAP_FPS;
  if (lastFrame && now - lastFrame < interval) { raf = requestAnimationFrame(tick); return; }
  lastFrame = now;
  const started = performance.now();
  const width = host.value.clientWidth;
  const height = host.value.clientHeight;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(starsLayer, 0, 0);
  if (!reducedMotion) {
    for (const twinkle of twinkles) {
      const alpha = 0.5 + (Math.sin((now / twinkle.period) * Math.PI * 2 + twinkle.phase) + 1) * 0.25;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = twinkle.star.color;
      ctx.beginPath(); ctx.arc(twinkle.star.x, twinkle.star.y, twinkle.star.r + 0.25, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    scheduleMeteor(now);
    if (meteorQueue.length && now >= meteorQueue[0]) {
      meteorQueue.shift();
      meteors.push({ start: now, x: random(width * 0.58, width * 1.03), y: random(-20, height * 0.27), travel: random(width * 0.26, width * 0.42), length: random(SUMMON_METEOR_LENGTH_MIN_PX, SUMMON_METEOR_LENGTH_MAX_PX) });
    }
    meteors = meteors.filter((meteor) => drawMeteor(meteor, now));
  }
  const cost = performance.now() - started;
  frameCostTotal += cost; frameCostCount += 1;
  if (!frameCostReported && now > 5000 && frameCostCount > 0) {
    frameCostReported = true;
    console.info(`[Summon sky] Average draw cost: ${(frameCostTotal / frameCostCount).toFixed(3)} ms/frame over ${frameCostCount} frames (30 fps cap).`);
  }
  raf = requestAnimationFrame(tick);
}

function start() { if (!reducedMotion && visible && !document.hidden && !raf) raf = requestAnimationFrame(tick); }
function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
function pause() {
  if (!pauseStartedAt) pauseStartedAt = performance.now();
  stop();
}
function resume() {
  if (document.hidden || !visible) return;
  if (pauseStartedAt) {
    const pausedFor = performance.now() - pauseStartedAt;
    if (nextMeteorAt) nextMeteorAt += pausedFor;
    meteors = meteors.map((meteor) => ({ ...meteor, start: meteor.start + pausedFor }));
    meteorQueue = meteorQueue.map((scheduled) => scheduled + pausedFor);
    pauseStartedAt = 0;
  }
  start();
}
function onVisibilityChange() { document.hidden ? pause() : resume(); }

onMounted(() => {
  reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  resize();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host.value);
  observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) resume(); else pause(); });
  observer.observe(host.value);
  document.addEventListener('visibilitychange', onVisibilityChange);
  start();
});

onUnmounted(() => {
  stop(); resizeObserver?.disconnect(); observer?.disconnect();
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<template>
  <div ref="host" class="summon-sky" aria-hidden="true"><canvas ref="canvas" /></div>
</template>

<style scoped>
.summon-sky { position: absolute; inset: 0; overflow: hidden; background: linear-gradient(180deg, #1b3154, #2c4d7c 53%, #4d6e9e); pointer-events: none; }
.summon-sky canvas { display: block; width: 100%; height: 100%; }
</style>
