<script setup>
// ============================================================
// Sign-in page: a showcase of a fully upgraded sample Kingdom,
// drawn flat from the same town art the students walk around.
// A party of heroes strolls the roads while the camera pans in
// slow horizontal and diagonal passes, always inside the town.
// Purely decorative: hidden from assistive tech, never takes
// clicks or focus, makes no API calls (it is shown before sign-in)
// and holds one still framing when reduced motion is requested.
// ============================================================
import { onMounted, onUnmounted, ref } from 'vue';
import { loadOwnedHeroVisuals } from '../student/avatar.js';
import { PALETTE, WORLD_TOP, buildTownObjects, createForestPattern, createGroundLayer } from '../student/kingdom/town-scene.js';
import { BUILDING_LEVEL_CAP, TOWN_HERO_AVATAR_RADIUS } from '../../../config/tuning.js';

const ROSTER = ['guardian', 'sheriff', 'pilot', 'bubbles', 'fairy', 'engineer', 'samurai', 'ranger'];
// What the camera may show: the town from just above the north tree line to
// just above the south one. Every frame stays inside these bounds.
const SCENE = { x: 0, y: -56, w: 1280, h: 786 };
// The camera glides between these points (world centres), alternating
// across-the-town and diagonal passes, then loops back to the start.
const PASSES = [[240, 340], [1040, 340], [380, 590], [1000, 590], [560, 150], [1060, 150]];
const PAN_SPEED = 34; // world px per second
const PAN_REST_MS = 1600;
const STILL_CENTRE = [640, 330];
const FRAME_MS = 1000 / 30; // a calm 30 fps is plenty for a backdrop

// Heroes walk a small road graph (plaza edges, roads to each door, and the
// start of the trail north), so they never cross a building or leave town.
const NODES = {
  libDoor: [190, 372], libBend: [190, 392], plazaW: [520, 392], trailJ: [520, 330], plazaNW: [522, 246],
  gardenJ: [585, 246], gardenDoor: [585, 194], plazaNE: [758, 246], plazaE: [760, 392], wsBend: [1090, 392],
  wsDoor: [1090, 372], plazaSW: [545, 442], plazaSE: [735, 442], towerSW: [545, 662], towerDoor: [640, 662],
  towerSE: [735, 662], trailCorner: [410, 330], trailTop: [410, 104],
};
const EDGES = [
  ['libDoor', 'libBend'], ['libBend', 'plazaW'], ['plazaW', 'trailJ'], ['trailJ', 'plazaNW'], ['plazaNW', 'gardenJ'],
  ['gardenJ', 'gardenDoor'], ['gardenJ', 'plazaNE'], ['plazaNE', 'plazaE'], ['plazaE', 'wsBend'], ['wsBend', 'wsDoor'],
  ['plazaW', 'plazaSW'], ['plazaSW', 'plazaSE'], ['plazaSE', 'plazaE'], ['plazaSW', 'towerSW'], ['towerSW', 'towerDoor'],
  ['towerDoor', 'towerSE'], ['towerSE', 'plazaSE'], ['trailJ', 'trailCorner'], ['trailCorner', 'trailTop'],
];
const LINKS = {};
for (const [a, b] of EDGES) { (LINKS[a] ||= []).push(b); (LINKS[b] ||= []).push(a); }
const RESTING_NODES = new Set(['libDoor', 'gardenDoor', 'wsDoor', 'towerDoor', 'trailTop']);

const frame = ref(null);
const canvas = ref(null);
let ctx;
let raf = 0;
let observer;
let reduced = false;
let last = 0;
let lastDrawn = 0;
let width = 0;
let height = 0;
let dpr = 1;
let scale = 1;
let ground;
let forest;
let objects = [];
let clip = ['open'];
let fps = 5;
const walkers = [];
const pan = { index: 0, start: 0 };

const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => t * t * (3 - 2 * t);

function nextNode(w) {
  const options = LINKS[w.to].filter((id) => id !== w.from);
  const list = options.length ? options : LINKS[w.to];
  return list[Math.floor(Math.random() * list.length)];
}

function update(dt, time) {
  for (const w of walkers) {
    if (time < w.pauseUntil) { w.moving = false; continue; }
    const [tx, ty] = NODES[w.to];
    const dx = tx - w.x; const dy = ty - w.y;
    const d = Math.hypot(dx, dy);
    if (d < 1.5) {
      if (RESTING_NODES.has(w.to) || Math.random() < 0.18) w.pauseUntil = time + rand(1400, 4200);
      const next = nextNode(w);
      w.from = w.to; w.to = next;
      w.moving = false;
      continue;
    }
    const step = Math.min(d, w.speed * dt);
    w.x += (dx / d) * step; w.y += (dy / d) * step;
    w.moving = true;
    if (Math.abs(dx) > 0.5) w.facing = dx < 0 ? -1 : 1;
  }
}

// The view in world pixels, and the camera clamped so it never shows past
// the scene bounds.
function viewSize() { return { w: width / scale, h: height / scale }; }
function clampCentre(cx, cy) {
  const v = viewSize();
  const x = v.w >= SCENE.w ? SCENE.x + SCENE.w / 2 : Math.max(SCENE.x + v.w / 2, Math.min(SCENE.x + SCENE.w - v.w / 2, cx));
  const y = v.h >= SCENE.h ? SCENE.y + SCENE.h / 2 : Math.max(SCENE.y + v.h / 2, Math.min(SCENE.y + SCENE.h - v.h / 2, cy));
  return [x, y];
}

function cameraCentre(time) {
  if (reduced) return clampCentre(...STILL_CENTRE);
  // Clamp each pass's ends first, so a wide view whose clamp flattens a
  // pass doesn't stall for its whole length.
  for (let guard = 0; guard < PASSES.length; guard += 1) {
    const a = clampCentre(...PASSES[pan.index]);
    const b = clampCentre(...PASSES[(pan.index + 1) % PASSES.length]);
    const duration = (Math.hypot(b[0] - a[0], b[1] - a[1]) / PAN_SPEED) * 1000;
    const elapsed = time - pan.start;
    if (elapsed < PAN_REST_MS + duration) {
      const k = ease(Math.max(0, Math.min(1, (elapsed - PAN_REST_MS) / Math.max(duration, 1))));
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    }
    pan.start += PAN_REST_MS + duration;
    pan.index = (pan.index + 1) % PASSES.length;
  }
  return clampCentre(...PASSES[pan.index]);
}

function drawHero(w, time) {
  const radius = TOWN_HERO_AVATAR_RADIUS;
  const hop = w.moving && !reduced ? Math.abs(Math.sin((time + w.offset) / 150)) * 5 : 0;
  ctx.fillStyle = 'rgba(35,56,47,.22)';
  ctx.beginPath(); ctx.ellipse(w.x, w.y + 2, radius * 1.15, radius * 0.38, 0, 0, Math.PI * 2); ctx.fill();
  const name = w.moving ? 'open' : clip[Math.floor(((time + w.offset) / 1000) * fps) % clip.length];
  const sprite = w.frames[name] || w.frames.open;
  if (!sprite) return;
  const crop = w.visual.crop.open;
  const h = radius * 3.15;
  const sw = h * crop[2] / crop[3];
  ctx.save();
  ctx.translate(w.x, w.y - hop);
  if (w.facing < 0) ctx.scale(-1, 1);
  ctx.drawImage(sprite, ...crop, -sw / 2, -h, sw, h);
  ctx.restore();
}

function draw(time) {
  if (!ctx) return;
  const [cx, cy] = cameraCentre(time);
  const v = viewSize();
  const left = cx - v.w / 2; const top = cy - v.h / 2;
  const s = scale * dpr;
  ctx.setTransform(s, 0, 0, s, -left * s, -top * s);
  ctx.fillStyle = forest || PALETTE.forest;
  ctx.fillRect(left - 2, top - 2, v.w + 4, v.h + 4);
  if (ground) ctx.drawImage(ground, 0, WORLD_TOP);
  const drawables = [...objects, ...walkers.map((w) => ({ sortY: w.y, walker: w }))];
  drawables.sort((a, b) => a.sortY - b.sortY);
  const margin = 40;
  for (const item of drawables) {
    if (item.walker) drawHero(item.walker, time);
    else if (item.x + item.w > left - margin && item.x < left + v.w + margin && item.y + item.h > top - margin && item.y < top + v.h + margin) {
      ctx.drawImage(item.canvas, item.x, item.y, item.w, item.h);
    }
  }
}

function tick(time) {
  raf = requestAnimationFrame(tick);
  if (document.hidden || time - lastDrawn < FRAME_MS) return;
  const dt = last ? Math.min((time - last) / 1000, 0.1) : 0;
  last = time;
  lastDrawn = time;
  update(dt, time);
  draw(time);
}

function resize() {
  if (!frame.value || !canvas.value) return;
  dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const rect = frame.value.getBoundingClientRect();
  width = rect.width; height = rect.height;
  canvas.value.width = Math.round(width * dpr);
  canvas.value.height = Math.round(height * dpr);
  ctx = canvas.value.getContext('2d', { alpha: false });
  ctx.imageSmoothingQuality = 'high';
  forest = createForestPattern(ctx);
  // Close enough to see the heroes, never so far out that the view could
  // run past the town's edges.
  scale = Math.max(Math.max(width, height) / 700, width / SCENE.w, height / SCENE.h);
  draw(performance.now());
}

onMounted(async () => {
  reduced = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  ground = createGroundLayer();
  objects = buildTownObjects(() => BUILDING_LEVEL_CAP);
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
    console.warn('[Sign-in showcase] Hero sprites unavailable; showing the town only.', error);
  }
  if (!frame.value) return; // left the page while the sprites loaded
  // Spread the party over the road graph, each part-way along its own road.
  const edges = [...EDGES].sort(() => Math.random() - 0.5);
  ROSTER.forEach((id, i) => {
    const record = records.get(id);
    if (!record) return;
    const [from, to] = edges[i % edges.length];
    const t = reduced ? 0.5 : rand(0.1, 0.9);
    const [ax, ay] = NODES[from]; const [bx, by] = NODES[to];
    walkers.push({
      id, visual: record.visual, frames: record.frames, from, to,
      x: ax + (bx - ax) * t, y: ay + (by - ay) * t, facing: bx < ax ? -1 : 1,
      moving: false, speed: rand(30, 44), offset: rand(0, 3000), pauseUntil: rand(0, 2500),
    });
  });
  pan.start = performance.now();
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
.login-preview { position: absolute; inset: 0; overflow: hidden; background: #2f5e3e; pointer-events: none; }
.login-preview canvas { display: block; width: 100%; height: 100%; }
</style>
