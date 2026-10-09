<script setup>
// ============================================================
// Prize reveal: the egg wobbles, cracks open in a burst of confetti,
// and the pet appears in a slowly turning 3D collector's box. Click or
// press a key to skip the wobble. A modal dialog: focus stays inside,
// Escape closes, and the result is announced to screen readers.
// ============================================================
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { RARITY } from './rarity.js';

const props = defineProps({
  result: { type: Object, required: true }, // { pet, duplicatePet, eggColour }
  refund: { type: Number, required: true },
  equipped: Boolean, // the prize pet is already the equipped one
});
const emit = defineEmits(['close', 'equip']);

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = ref(reduced ? 'open' : 'egg');
const pet = computed(() => props.result.pet);
const announcement = computed(() =>
  stage.value === 'open' ? `You got ${pet.value.name}, ${pet.value.rarity}. ${props.result.duplicatePet ? `Duplicate: ${props.refund} coins back.` : 'New pet!'}` : '',
);

// confetti pieces, scattered once when the egg cracks
const COLOURS = { common: ['#ffffff', '#c9d3e0', '#86efac', '#7dd3fc'], starter: ['#ffffff', '#c9d3e0'], rare: ['#8cc4ff', '#4f8df7', '#ffffff', '#c4b5fd'], epic: ['#f5c84c', '#fff1b8', '#c77dff', '#ff8fab', '#ffffff'] };
const pieces = computed(() => {
  const n = RARITY[pet.value.rarity]?.confetti || 40;
  const cs = COLOURS[pet.value.rarity] || COLOURS.common;
  return Array.from({ length: n }, (_, i) => {
    const a = Math.random() * Math.PI * 2;
    const v = 120 + Math.random() * 220;
    return { i, x: Math.cos(a) * v * 1.4, y: -Math.abs(Math.sin(a) * v) - 40, r: Math.random() * 900 - 450, c: cs[i % cs.length], d: Math.random() * 120, s: 6 + Math.random() * 7 };
  });
});

const root = ref(null);
const collectBtn = ref(null);
let timer = null;
let returnFocus = null;
function crack() {
  if (stage.value !== 'egg') return;
  clearTimeout(timer);
  stage.value = 'open';
  nextTick(() => collectBtn.value?.focus());
}
function onKey(e) {
  if (stage.value === 'egg') {
    if (e.key !== 'Tab') crack();
    e.preventDefault();
    return;
  }
  if (e.key === 'Escape') emit('close');
  if (e.key === 'Tab') {
    // keep focus inside the dialog
    const els = [...root.value.querySelectorAll('button')];
    const i = els.indexOf(document.activeElement);
    const next = els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length];
    next?.focus();
    e.preventDefault();
  }
}
onMounted(() => {
  returnFocus = document.activeElement;
  document.body.style.overflow = 'hidden';
  if (stage.value === 'egg') {
    root.value.focus();
    timer = setTimeout(crack, 1700);
  } else nextTick(() => collectBtn.value?.focus());
});
onUnmounted(() => {
  clearTimeout(timer);
  document.body.style.overflow = '';
  returnFocus?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="prize" :class="['is-' + stage, pet.rarity]" role="dialog" aria-modal="true" aria-labelledby="prize-title" tabindex="-1" @click="crack" @keydown="onKey">
      <div class="prize-rays" aria-hidden="true"></div>
      <div class="prize-stage">
        <div class="prize-egg" :class="{ cracked: stage === 'open' }" :style="{ '--c': result.eggColour }" aria-hidden="true">
          <span class="egg shell top"></span>
          <span class="egg shell bottom"></span>
        </div>
        <template v-if="stage === 'open'">
          <div class="prize-flash" aria-hidden="true"></div>
          <div class="confetti" aria-hidden="true">
            <i v-for="p in pieces" :key="p.i" :style="{ '--x': p.x + 'px', '--y': p.y + 'px', '--r': p.r + 'deg', '--c': p.c, '--s': p.s + 'px', animationDelay: p.d + 'ms' }"><b :style="{ animationDelay: p.d + 'ms' }"></b></i>
          </div>
          <div class="prize-scene" aria-hidden="true">
            <div class="prize-spin">
              <div class="prize-box">
                <div class="face front">
                  <div class="pb-head"><span>QUIZQUEST</span><span>{{ pet.rarity }}</span></div>
                  <div class="pb-window"><span class="pb-pet">{{ pet.emoji }}</span></div>
                  <div class="pb-name">{{ pet.name }}</div>
                </div>
                <div class="face back"><span>QUIZQUEST</span></div>
                <div class="face side right"><span>QUIZQUEST · {{ pet.rarity }}</span></div>
                <div class="face side left"><span>QUIZQUEST · {{ pet.rarity }}</span></div>
                <div class="face cap top"></div>
                <div class="face cap bottom"></div>
              </div>
            </div>
          </div>
        </template>
      </div>
      <div class="prize-info">
        <template v-if="stage === 'open'">
          <h2 id="prize-title">{{ pet.emoji }} {{ pet.name }}</h2>
          <div class="prize-tags">
            <span class="prize-tag rarity-tag">{{ pet.rarity }}</span>
            <span v-if="result.duplicatePet" class="prize-tag">Duplicate · +{{ refund }} 🪙 back</span>
            <span v-else class="prize-tag new">New!</span>
          </div>
          <p class="prize-move">Move: {{ pet.move }}</p>
          <div class="prize-actions" @click.stop>
            <button v-if="!equipped" type="button" class="btn" @click="emit('equip')">Equip {{ pet.name }}</button>
            <button ref="collectBtn" type="button" class="btn primary" @click="emit('close')">{{ result.duplicatePet ? 'OK' : 'Add to collection' }}</button>
          </div>
        </template>
        <template v-else>
          <h2 id="prize-title">Opening your egg…</h2>
          <p class="prize-move">Click or press any key to open it now</p>
        </template>
      </div>
      <p class="sr-only" aria-live="assertive">{{ announcement }}</p>
    </div>
  </Teleport>
</template>
