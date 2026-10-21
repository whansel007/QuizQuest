<script setup>
// Summon reveal: the egg wobbles, cracks open in a burst of confetti,
// and the hero or resource appears in a slowly turning 3D collector's box.
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { RARITY } from './rarity.js';
import { formatHeroType } from '../hero-type.js';

const props = defineProps({
  result: { type: Object, required: true }, // server summon result plus eggColour
  resources: { type: Object, required: true },
});
const emit = defineEmits(['close']);

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = ref(reduced ? 'open' : 'egg');
const isHero = computed(() => props.result.prize.kind === 'hero');
const item = computed(() => isHero.value ? props.result.prize.hero : props.resources[props.result.prize.resource]);
const itemName = computed(() => item.value.name);
const itemEmoji = computed(() => item.value.emoji);
const rarity = computed(() => isHero.value ? props.result.prize.rarity : 'common');
const rarityStars = computed(() => rarity.value === 'epic' ? '5★ Epic' : rarity.value === 'rare' ? '4★ Rare' : '3★ Common');
const duplicate = computed(() => isHero.value && props.result.duplicateHero);
const colors = {
  common: ['#ffffff', '#c9d3e0', '#86efac', '#7dd3fc'],
  rare: ['#8cc4ff', '#4f8df7', '#ffffff', '#c4b5fd'],
  epic: ['#f5c84c', '#fff1b8', '#c77dff', '#ff8fab', '#ffffff'],
};
const announcement = computed(() => {
  if (stage.value !== 'open') return '';
  if (!isHero.value) return `You got ${props.result.prize.amount} ${itemName.value} for your kingdom.`;
  return `You got ${itemName.value}, ${rarity.value}. ${duplicate.value ? `Duplicate: ${props.result.refund} coins back.` : 'New hero!'}`;
});

const pieces = computed(() => {
  const n = RARITY[rarity.value]?.confetti || 40;
  const cs = colors[rarity.value] || colors.common;
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
    <div ref="root" class="prize" :class="['is-' + stage, rarity]" role="dialog" aria-modal="true" aria-labelledby="prize-title" tabindex="-1" @click="crack" @keydown="onKey">
      <div class="prize-rays" aria-hidden="true"></div>
      <div class="prize-stage">
        <div class="prize-egg" :class="{ cracked: stage === 'open' }" :style="{ '--c': result.eggColour || '#c4b5fd' }" aria-hidden="true">
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
                  <div class="pb-head"><span>QUIZQUEST</span><span>{{ rarity }}</span></div>
                  <div class="pb-window"><span class="pb-pet">{{ itemEmoji }}</span></div>
                  <div class="pb-name">{{ itemName }}</div>
                </div>
                <div class="face back"><span>QUIZQUEST</span></div>
                <div class="face side right"><span>QUIZQUEST · {{ rarity }}</span></div>
                <div class="face side left"><span>QUIZQUEST · {{ rarity }}</span></div>
                <div class="face cap top"></div>
                <div class="face cap bottom"></div>
              </div>
            </div>
          </div>
        </template>
      </div>
      <div class="prize-info">
        <template v-if="stage === 'open'">
          <h2 id="prize-title">{{ itemEmoji }} {{ itemName }}</h2>
          <div class="prize-tags">
            <span class="prize-tag rarity-tag">{{ rarityStars }}</span>
            <span v-if="duplicate" class="prize-tag">Duplicate · +{{ result.refund }} 🪙 back</span>
            <span v-else-if="isHero" class="prize-tag new">New hero!</span>
            <span v-else class="prize-tag new">+{{ result.prize.amount }} {{ itemName }}</span>
          </div>
          <p v-if="isHero" class="prize-move">{{ formatHeroType(item.type) }} hero · {{ item.weapon }}</p>
          <p v-else class="prize-move">Added to your kingdom resources</p>
          <p class="prize-move pity-line">{{ result.pity.totalPulls }} total pulls · pity {{ result.pity.sinceHero }} / {{ result.pity.sinceEpic }}</p>
          <div class="prize-actions" @click.stop>
            <button ref="collectBtn" type="button" class="btn primary" @click="emit('close')">Continue</button>
          </div>
        </template>
        <template v-else>
          <h2 id="prize-title">A summon is on its way…</h2>
          <p class="prize-move">Click or press any key to open the egg now</p>
        </template>
      </div>
      <p class="sr-only" aria-live="assertive">{{ announcement }}</p>
    </div>
  </Teleport>
</template>
