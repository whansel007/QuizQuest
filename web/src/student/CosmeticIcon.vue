<script setup>
// The shared storybook art for one hat or pin, for wardrobe buttons and lists.
// Draws through the same module as the avatar views, so the icon matches what
// the cat wears. Decorative: give the surrounding control its accessible name.
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { drawCosmeticIcon } from './avatar.js';

const props = defineProps({
  id: { type: String, default: null },
  size: { type: Number, default: 40 },
});
const canvas = ref(null);
let dprQuery = null;

function draw() {
  if (!canvas.value) return;
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const backing = Math.max(1, Math.round(props.size * dpr));
  if (canvas.value.width !== backing) canvas.value.width = backing;
  if (canvas.value.height !== backing) canvas.value.height = backing;
  const context = canvas.value.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, backing, backing);
  if (props.id) drawCosmeticIcon(context, props.id, { x: backing / 2, y: backing / 2, size: backing });
}

// Redraw crisply when the page zoom or screen density changes.
function watchDensity() {
  dprQuery?.removeEventListener('change', onDensityChange);
  dprQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`) || null;
  dprQuery?.addEventListener('change', onDensityChange);
}
function onDensityChange() { draw(); watchDensity(); }

watch(() => [props.id, props.size], draw);
onMounted(() => { draw(); watchDensity(); });
onUnmounted(() => dprQuery?.removeEventListener('change', onDensityChange));
</script>

<template>
  <canvas ref="canvas" class="cosmetic-icon" :style="{ width: size + 'px', height: size + 'px' }" aria-hidden="true" />
</template>

<style scoped>
.cosmetic-icon { display: inline-block; flex: none; vertical-align: middle; }
</style>
