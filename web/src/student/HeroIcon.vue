<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

const props = defineProps({
  hero: { type: Object, required: true },
  size: { type: [Number, String], default: 32 },
  label: { type: String, default: '' },
  animated: { type: Boolean, default: false },
});

const visualStore = globalThis.__qqHeroVisualStore || (globalThis.__qqHeroVisualStore = {});
const renderedFrames = globalThis.__qqHeroRenderedFrames || (globalThis.__qqHeroRenderedFrames = new Map());
const warnedFiles = visualStore.warnedFiles || (visualStore.warnedFiles = new Set());
function loadImages() {
  if (!visualStore.configPromise) visualStore.configPromise = fetch('/hero-lab/hero-visuals.json').then((response) => {
    if (!response.ok) throw new Error('Hero visuals unavailable');
    return response.json();
  });
  if (!visualStore.imagesPromise) visualStore.imagesPromise = visualStore.configPromise.then(async (config) => {
    const images = new Map();
    await Promise.all(Object.entries(config.HERO_VISUALS).flatMap(([heroId, spec]) => Object.entries(spec.frames).map(async ([frame, filename]) => {
      const image = new Image();
      image.src = encodeURI(`${config.assetBase}${filename}`);
      try { await image.decode(); } catch (error) {
        if (!warnedFiles.has(filename)) { warnedFiles.add(filename); console.warn(`[Hero sprites] Could not load ${filename}; using emoji fallback.`, error); }
        return;
      }
      if (!images.has(heroId)) images.set(heroId, new Map());
      images.get(heroId).set(frame, image);
    })));
    return { config, images };
  });
  return visualStore.imagesPromise;
}
function getRenderedFrame(config, images, heroId, frameName, size, dpr) {
  const key = `${heroId}:${frameName}:${size}:${dpr}`;
  if (renderedFrames.has(key)) return renderedFrames.get(key);
  const spec = config.HERO_VISUALS[heroId];
  const image = images.get(heroId)?.get(frameName) || images.get(heroId)?.get('open');
  if (!spec || !image) return null;
  const bounds = spec.crop?.[frameName] || spec.crop?.open;
  const ratio = bounds?.[3] ? bounds[2] / bounds[3] : image.naturalWidth / image.naturalHeight;
  const width = Math.max(1, Math.round(size * ratio * dpr));
  const height = Math.max(1, Math.round(size * dpr));
  const frame = document.createElement('canvas');
  frame.width = width; frame.height = height;
  const context = frame.getContext('2d');
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  if (bounds) context.drawImage(image, ...bounds, 0, 0, width, height);
  else context.drawImage(image, 0, 0, width, height);
  const cached = { canvas: frame, width, height };
  renderedFrames.set(key, cached);
  return cached;
}

const canvas = ref(null);
const ready = ref(false);
const visuals = ref(null);
const px = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size));
const sizeNumber = computed(() => typeof props.size === 'number' ? props.size : Number.parseFloat(props.size) || 32);
const artRatio = computed(() => {
  const bounds = visuals.value?.config?.HERO_VISUALS?.[props.hero.id]?.crop?.open;
  return bounds?.[3] ? bounds[2] / bounds[3] : 1;
});
const canvasWidth = computed(() => Math.max(1, Math.round(sizeNumber.value * artRatio.value)));
const canvasHeight = computed(() => Math.max(1, Math.round(sizeNumber.value)));
let observer;
let animationFrame = 0;
let visible = false;
let heroOffset = 0;
let lastDrawnKey = '';

function drawFrame() {
  const target = canvas.value;
  if (!target) return;
  const context = target.getContext('2d');
  const record = visuals.value;
  if (record) {
    const { config, images } = record;
    const frames = images.get(props.hero.id);
    if (!frames) { ready.value = false; return; }
    const dpr = Math.max(config.SPRITE_DPR_MIN, window.devicePixelRatio || config.SPRITE_DPR_MIN);
    const size = sizeNumber.value;
    const clip = config.IDLE_CLIP;
    const index = Math.floor(((performance.now() + heroOffset) / config.TIME_MS_PER_SECOND) * config.IDLE_FPS) % clip.length;
    const frameName = props.animated ? clip[index] : 'open';
    const frame = getRenderedFrame(config, images, props.hero.id, frameName, size, dpr);
    if (!frame) { ready.value = false; return; }
    if (target.width !== frame.width || target.height !== frame.height) {
      target.width = frame.width; target.height = frame.height;
    }
    const drawKey = `${props.hero.id}:${frameName}:${target.width}:${target.height}`;
    if (drawKey === lastDrawnKey) return;
    lastDrawnKey = drawKey;
    context.drawImage(frame.canvas, 0, 0, target.width, target.height);
    ready.value = true;
  }
}

function tick() {
  if (!visible || !props.animated || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { animationFrame = 0; return; }
  drawFrame();
  animationFrame = requestAnimationFrame(tick);
}
function start() {
  if (!visible || !props.animated || animationFrame || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  animationFrame = requestAnimationFrame(tick);
}
function stop() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = 0;
}
watch(() => [props.hero.id, props.size, props.animated], () => {
  heroOffset = Math.random() * (visuals.value?.config?.TIME_MS_PER_SECOND || 1);
  lastDrawnKey = '';
  ready.value = Boolean(visuals.value?.images.get(props.hero.id)?.has('open'));
  void nextTick(() => {
    if (canvas.value && observer) { observer.disconnect(); observer.observe(canvas.value); }
    drawFrame(); if (props.animated) start(); else stop();
  });
});

onMounted(async () => {
  visible = true;
  try { visuals.value = await loadImages(); ready.value = Boolean(visuals.value.images.get(props.hero.id)?.has('open')); } catch { ready.value = false; }
  heroOffset = Math.random() * (visuals.value?.config?.TIME_MS_PER_SECOND || 1);
  await nextTick();
  drawFrame();
  observer = new IntersectionObserver((entries) => {
    visible = Boolean(entries[0]?.isIntersecting);
    if (visible) { drawFrame(); start(); } else stop();
  });
  if (canvas.value) observer.observe(canvas.value);
  document.addEventListener('visibilitychange', onVisibility);
  if (props.animated) start();
});
function onVisibility() { if (document.hidden) stop(); else start(); }
onUnmounted(() => { stop(); observer?.disconnect(); document.removeEventListener('visibilitychange', onVisibility); });
</script>

<template>
  <canvas
    v-if="ready"
    ref="canvas"
    class="hero-icon"
    :style="{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }"
    :width="canvasWidth"
    :height="canvasHeight"
    :role="label ? 'img' : null"
    :aria-label="label || null"
    :aria-hidden="label ? null : 'true'"
  />
  <span v-else class="hero-icon hero-emoji" :style="{ fontSize: px }" :role="label ? 'img' : null" :aria-label="label || null" :aria-hidden="label ? null : 'true'">{{ hero.emoji }}</span>
</template>

<style scoped>
.hero-icon { display: inline-block; flex: none; object-fit: contain; line-height: 1; user-select: none; vertical-align: middle; }
.hero-emoji { overflow: visible; }
</style>
