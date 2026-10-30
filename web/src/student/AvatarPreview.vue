<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { drawAvatarCosmetics, loadPlayerVisuals, tintedPlayerFrames } from './avatar.js';

const props = defineProps({
  color: { type: String, required: true },
  hatId: { type: String, default: null },
  accessoryId: { type: String, default: null },
});
const canvas = ref(null);
let visuals = null;
let resizeObserver = null;
let blinkTimer = null;
let lastFrameName = '';
let lastColor = '';

function draw(time = performance.now(), force = false) {
  if (!visuals || !canvas.value) return;
  const clip = visuals.config.IDLE_CLIP?.length ? visuals.config.IDLE_CLIP : ['open'];
  const fps = Math.max(1, Number(visuals.config.IDLE_FPS) || 5);
  const frameName = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'open'
    : (clip[Math.floor((time / 1000) * fps) % clip.length] || 'open');
  const rect = canvas.value.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const backingWidth = Math.max(1, Math.round(rect.width * dpr));
  const backingHeight = Math.max(1, Math.round(rect.height * dpr));
  const resized = canvas.value.width !== backingWidth || canvas.value.height !== backingHeight;
  if (!force && !resized && frameName === lastFrameName && props.color === lastColor) return;
  if (resized) {
    canvas.value.width = backingWidth;
    canvas.value.height = backingHeight;
  }
  const frame = tintedPlayerFrames(visuals, props.color)[frameName]
    || tintedPlayerFrames(visuals, props.color).open;
  const context = canvas.value.getContext('2d');
  const height = canvas.value.height - 4 * dpr;
  const width = height * frame.width / frame.height;
  const left = (canvas.value.width - width) / 2;
  const top = 2 * dpr;
  context.clearRect(0, 0, canvas.value.width, canvas.value.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(frame, left, top, width, height);
  drawAvatarCosmetics(context, {
    left, top, width, height,
    hatId: props.hatId,
    accessoryId: props.accessoryId,
  });
  lastFrameName = frameName;
  lastColor = props.color;
}

function tick() {
  draw();
  if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    const fps = Math.max(1, Number(visuals?.config.IDLE_FPS) || 5);
    blinkTimer = setTimeout(tick, 1000 / fps);
  }
}

watch(() => [props.color, props.hatId, props.accessoryId], () => draw(performance.now(), true));
onMounted(async () => {
  try {
    visuals = await loadPlayerVisuals();
    // The view can be left while the avatar is still loading, and then the
    // canvas is gone: there is nothing left to observe or animate.
    if (!canvas.value) return;
    resizeObserver = new ResizeObserver(() => draw(performance.now(), true));
    resizeObserver.observe(canvas.value);
    tick();
  }
  catch (error) { console.warn('[Avatar preview] Could not load player visuals.', error); }
});
onUnmounted(() => {
  clearTimeout(blinkTimer);
  resizeObserver?.disconnect();
});
</script>

<template>
  <canvas ref="canvas" class="avatar-preview" width="144" height="144" role="img" aria-label="Preview of your cat avatar" />
</template>

<style scoped>
.avatar-preview { display: block; width: 132px; height: 132px; margin: 0 auto; }
</style>
