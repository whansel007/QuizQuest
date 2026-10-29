<script setup>
import { onMounted, ref, watch } from 'vue';
import { loadPlayerVisuals, tintedPlayerFrames } from './avatar.js';

const props = defineProps({ color: { type: String, required: true } });
const canvas = ref(null);
let visuals = null;

function draw() {
  if (!visuals || !canvas.value) return;
  const frame = tintedPlayerFrames(visuals, props.color).open;
  const context = canvas.value.getContext('2d');
  const height = canvas.value.height - 4;
  const width = height * frame.width / frame.height;
  context.clearRect(0, 0, canvas.value.width, canvas.value.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(frame, (canvas.value.width - width) / 2, 2, width, height);
}

watch(() => props.color, draw);
onMounted(async () => {
  try { visuals = await loadPlayerVisuals(); draw(); }
  catch (error) { console.warn('[Avatar preview] Could not load player visuals.', error); }
});
</script>

<template>
  <canvas ref="canvas" class="avatar-preview" width="144" height="144" role="img" aria-label="Preview of your cat avatar" />
</template>

<style scoped>
.avatar-preview { display: block; width: 132px; height: 132px; margin: 0 auto; }
</style>
