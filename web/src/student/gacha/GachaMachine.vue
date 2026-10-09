<script setup>
// ============================================================
// The egg machine: a glass dome of eggs, a crank and a chute.
// The server has already picked the pet by the time the egg drops;
// this is only the show. The handle keeps turning while the request is
// in flight, so a slow network just means a longer crank.
// ============================================================
import { ref } from 'vue';
import AsyncButton from '../../components/AsyncButton.vue';
import { PASTELS, eggColour } from './rarity.js';

const props = defineProps({
  cost: { type: Number, required: true },
  disabled: Boolean,
  open: { type: Function, required: true }, // () => Promise<server result>
});
const emit = defineEmits(['prize']);

// eggs resting in the dome: left %, top %, tilt, colour
const EGGS = [
  [4, 70, -12], [21, 73, 8], [38, 71, -4], [55, 74, 14], [72, 69, -10],
  [12, 54, 18], [29, 56, -16], [46, 54, 6], [63, 55, -8], [80, 52, 20],
  [20, 39, -6], [38, 38, 12], [56, 40, -18], [72, 36, 4],
].map(([x, y, r], i) => ({ x, y, r, c: PASTELS[i % PASTELS.length] }));

const phase = ref('idle'); // idle -> crank -> drop -> idle
const dropColour = ref(PASTELS[0]);
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));

async function turn() {
  phase.value = 'crank';
  let r;
  try {
    [r] = await Promise.all([props.open(), wait(1000)]);
  } catch (err) {
    phase.value = 'idle';
    throw err; // AsyncButton shows it
  }
  dropColour.value = eggColour(r.pet.rarity);
  phase.value = 'drop';
  await wait(1100);
  phase.value = 'idle';
  emit('prize', { ...r, eggColour: dropColour.value });
}
</script>

<template>
  <div class="gm-wrap">
    <div class="gm" :class="phase" aria-hidden="true">
      <div class="gm-callout"><span v-for="(ch, i) in 'Turn the handle!'" :key="i" :style="{ '--i': i }">{{ ch }}</span></div>
      <div class="gm-cap"></div>
      <div class="gm-dome">
        <span v-for="(e, i) in EGGS" :key="i" class="egg gm-egg" :style="{ left: e.x + '%', top: e.y + '%', '--r': e.r + 'deg', '--c': e.c, '--i': i }"></span>
        <span class="gm-glare"></span>
      </div>
      <div class="gm-body">
        <div class="gm-plate">EGGS · {{ cost }} 🪙</div>
        <div class="gm-slot"></div>
        <div class="gm-handle"><span></span></div>
        <div class="gm-chute"><span v-if="phase === 'drop'" class="egg gm-out" :style="{ '--c': dropColour }"></span></div>
      </div>
      <div class="gm-feet"></div>
    </div>
    <AsyncButton class="btn primary gm-btn" :disabled="disabled || phase !== 'idle'" :run="turn">{{ phase === 'idle' ? `Open an egg · ${cost} 🪙` : 'Cranking…' }}</AsyncButton>
  </div>
</template>
