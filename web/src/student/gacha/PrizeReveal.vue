<script setup>
// Summon reveal: a shooting star falls from the sky (gold for 5-star,
// purple for 4-star, a fainter silver for the rest), lands in a burst of
// starlight and becomes a slowly turning constellation card.
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { RARITY } from './rarity.js';
import { formatHeroType } from '../hero-type.js';
import HeroIcon from '../HeroIcon.vue';
import { playCue } from '../../sound.js';

const props = defineProps({
  result: { type: Object, required: true }, // server summon result plus eggColour
  resources: { type: Object, required: true },
  skipToSummary: Boolean,
  clickToContinue: Boolean,
});
const emit = defineEmits(['close', 'skip']);

const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const stage = ref(reduced ? 'open' : 'star');
const isHero = computed(() => props.result.prize.kind === 'hero');
const item = computed(() => isHero.value ? props.result.prize.hero : props.resources[props.result.prize.resource]);
const itemName = computed(() => item.value.name);
const itemEmoji = computed(() => item.value.emoji);
const rarity = computed(() => isHero.value ? props.result.prize.rarity : 'common');
const rarityLabel = computed(() => rarity.value === 'epic' ? '5★' : rarity.value === 'rare' ? '4★' : 'Resources');
const rarityStars = computed(() => rarityLabel.value);
const duplicate = computed(() => isHero.value && props.result.duplicateHero);
const colors = {
  common: ['#ffffff', '#dfe7f1', '#bcd2ea', '#fff4c9'],
  rare: ['#c9a8ff', '#a77bf3', '#ffffff', '#e6d6ff'],
  epic: ['#f5c84c', '#fff1b8', '#ffd98a', '#ffffff', '#f2ba55'],
};
// in a ten-pull, which star this is
const counter = computed(() => (props.result.batchSize ? `Star ${props.result.batchIndex + 1} of ${props.result.batchSize}` : ''));
const announcement = computed(() => {
  if (stage.value !== 'open') return '';
  if (!isHero.value) return `You got ${props.result.prize.amount} ${itemName.value} for your kingdom.`;
  return `You got ${itemName.value}, ${rarityLabel.value}. ${duplicate.value ? `Duplicate: ${props.result.refund} coins back.` : 'New hero!'}`;
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

const STAR_FALL_MS = 1500; // the star lands, then the card appears
const root = ref(null);
const collectBtn = ref(null);
const revealKey = ref(0);
let timer = null;
let returnFocus = null;
// a short chime as the card appears (richer for 4- and 5-star heroes)
const chime = () => playCue('summonReveal', { rarity: rarity.value });
function crack() {
  if (stage.value !== 'star') return;
  clearTimeout(timer);
  stage.value = 'open';
  chime();
  nextTick(() => collectBtn.value?.focus());
}
function onSurfaceClick() {
  if (props.skipToSummary) { emit('skip'); return; }
  if (stage.value === 'star') { crack(); return; }
  if (props.clickToContinue) emit('close');
}
function onKey(e) {
  if (stage.value === 'star') {
    if (props.skipToSummary && e.key === 'Escape') { e.preventDefault(); emit('skip'); return; }
    if (e.key !== 'Tab') crack();
    e.preventDefault();
    return;
  }
  if (e.key === 'Escape') { if (props.skipToSummary) emit('skip'); else emit('close'); }
  if (e.key === 'Tab') {
    const els = [...root.value.querySelectorAll('button')];
    const i = els.indexOf(document.activeElement);
    const next = els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length];
    next?.focus();
    e.preventDefault();
  }
}
watch(() => props.result, () => {
  clearTimeout(timer);
  revealKey.value += 1;
  stage.value = reduced ? 'open' : 'star';
  if (stage.value === 'star') {
    timer = setTimeout(crack, STAR_FALL_MS);
    nextTick(() => root.value?.focus());
  }
  else { chime(); nextTick(() => collectBtn.value?.focus()); }
}, { flush: 'sync' });
onMounted(() => {
  returnFocus = document.activeElement;
  document.body.style.overflow = 'hidden';
  if (stage.value === 'star') {
    root.value.focus();
    timer = setTimeout(crack, STAR_FALL_MS);
  } else { chime(); nextTick(() => collectBtn.value?.focus()); }
});
onUnmounted(() => {
  clearTimeout(timer);
  document.body.style.overflow = '';
  returnFocus?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="prize" :class="['is-' + stage, rarity]" role="dialog" aria-modal="true" aria-labelledby="prize-title" tabindex="-1" @click="onSurfaceClick" @keydown="onKey">
      <div class="prize-rays" aria-hidden="true"></div>
      <div :key="revealKey" class="prize-stage">
        <div v-if="stage === 'star'" class="prize-falling-star" aria-hidden="true">
          <span class="star-trail"></span>
          <svg class="star-head" viewBox="0 0 40 40"><path d="M20 2l4.6 12.4L38 20l-13.4 5.6L20 38l-4.6-12.4L2 20l13.4-5.6Z" /></svg>
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
                  <svg class="pb-constellation" viewBox="0 0 100 140" aria-hidden="true"><path d="M12 22 34 12 52 28 78 16 88 40M18 118 40 104 62 122 86 108" /><g><circle cx="12" cy="22" r="2" /><circle cx="34" cy="12" r="2.4" /><circle cx="52" cy="28" r="1.8" /><circle cx="78" cy="16" r="2.6" /><circle cx="88" cy="40" r="2" /><circle cx="18" cy="118" r="2" /><circle cx="40" cy="104" r="2.4" /><circle cx="62" cy="122" r="1.8" /><circle cx="86" cy="108" r="2.2" /></g></svg>
                  <div class="pb-head"><span>QUIZQUEST</span><span>{{ rarityLabel }}</span></div>
                  <div class="pb-window"><HeroIcon v-if="isHero" :hero="item" :size="64" animated /><span v-else class="pb-pet">{{ itemEmoji }}</span></div>
                  <div class="pb-name">{{ itemName }}</div>
                </div>
                <div class="face back"><span>QUIZQUEST</span></div>
                <div class="face side right"><span>QUIZQUEST · {{ rarityLabel }}</span></div>
                <div class="face side left"><span>QUIZQUEST · {{ rarityLabel }}</span></div>
                <div class="face cap top"></div>
                <div class="face cap bottom"></div>
              </div>
            </div>
          </div>
        </template>
      </div>
      <div :key="revealKey" class="prize-info">
        <template v-if="stage === 'open'">
          <p v-if="counter" class="prize-counter">{{ counter }}</p>
          <h2 id="prize-title"><HeroIcon v-if="isHero" :hero="item" :size="28" />{{ isHero ? '' : `${itemEmoji} ` }}{{ itemName }}</h2>
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
            <button ref="collectBtn" type="button" class="btn primary" @click="emit('close')">{{ skipToSummary ? 'View all results' : 'Continue' }}</button>
          </div>
        </template>
        <template v-else>
          <p v-if="counter" class="prize-counter">{{ counter }}</p>
          <h2 id="prize-title">A star is falling…</h2>
          <p class="prize-move">Click or press any key to catch it now</p>
          <button v-if="skipToSummary" type="button" class="btn" @click.stop="emit('skip')">Skip to results</button>
        </template>
      </div>
      <p class="sr-only" aria-live="assertive">{{ announcement }}</p>
    </div>
  </Teleport>
</template>
