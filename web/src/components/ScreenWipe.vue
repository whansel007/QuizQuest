<script setup>
// The one screen-wipe overlay (mounted once in App.vue); driven by
// transitions.js. It blocks clicks only while covering, never during the
// reveal, and transitions.js always returns it to idle.
import { computed } from 'vue';
import { notifyCoverEnd, wipeState } from '../transitions.js';

const classes = computed(() => [
  `v-${wipeState.variant}`,
  `p-${wipeState.phase}`,
  { reduced: wipeState.reduced },
]);
// Only the cover animations count (sheet-in, iris-close, or the reduced fade).
function onAnimationEnd(event) {
  if (wipeState.phase === 'cover' && /^(sheet-in|iris-close|wipe-fade-in)/.test(event.animationName)) notifyCoverEnd(wipeState.run);
}
const style = computed(() => ({ '--cover-ms': `${wipeState.coverMs}ms`, '--reveal-ms': `${wipeState.revealMs}ms` }));
</script>

<template>
  <div v-if="wipeState.phase !== 'idle'" :key="wipeState.run" class="screen-wipe" :class="classes" :style="style" aria-hidden="true" @animationend="onAnimationEnd">
    <div v-if="wipeState.variant === 'telescope'" class="iris"></div>
    <div v-else class="sheet">
      <svg class="sheet-mark" viewBox="0 0 64 64">
        <path d="M32 8c9 9 13 17 13 24S39 48 32 56C25 48 19 39 19 32S23 17 32 8Z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" />
        <path d="M32 16v36M32 28l-6-5m6 13 7-6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.screen-wipe { position: fixed; z-index: 3000; inset: 0; overflow: hidden; pointer-events: auto; contain: strict; }
.screen-wipe.p-reveal { pointer-events: none; }

/* ---- page: a forest-green storybook sheet with gold-trimmed paper edges sweeps across ---- */
.sheet {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: #f2ba55;
  background-color: #254937;
  background-image: linear-gradient(135deg, rgb(255 248 228 / 6%), rgb(17 34 26 / 16%)), url('/hero-lab/assets/storybook-paper.svg');
  background-size: auto, 144px 144px;
  background-blend-mode: normal, soft-light;
  will-change: transform;
}
/* paper edges on both sides, so the sheet has a finished edge coming and going */
.sheet::before, .sheet::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 34px;
  background-image: linear-gradient(90deg, #f2ba55 0 5px, transparent 5px), url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(#fbf2d8, #f1e6c7);
  background-size: auto, 144px 144px, auto;
}
.sheet::after { right: -34px; box-shadow: 6px 0 18px rgb(17 34 26 / 28%); }
.sheet::before { left: -34px; transform: scaleX(-1); box-shadow: 6px 0 18px rgb(17 34 26 / 28%); }
.sheet-mark { width: clamp(52px, 7vw, 76px); height: auto; opacity: .7; }

.v-page.p-cover .sheet { animation: sheet-in var(--cover-ms) cubic-bezier(.65, 0, .35, 1) both; }
.v-page.p-covered .sheet { transform: translateX(0); }
.v-page.p-reveal .sheet { animation: sheet-out var(--reveal-ms) cubic-bezier(.65, 0, .35, 1) both; }
@keyframes sheet-in { from { transform: translateX(calc(-100% - 40px)); } to { transform: translateX(0); } }
@keyframes sheet-out { from { transform: translateX(0); } to { transform: translateX(calc(100% + 40px)); } }

/* ---- telescope: the lens closes to a point over the town, then opens on the sky ---- */
.v-telescope { background: transparent; }
.iris {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  border: 12px solid #c8963e;
  border-radius: 50%;
  box-shadow: 0 0 0 4px #23382f, inset 0 0 0 5px #f2ba55, 0 0 0 200vmax #101d42;
  transform: translate(-50%, -50%);
}
.v-telescope.p-cover .iris { animation: iris-close var(--cover-ms) cubic-bezier(.65, 0, .4, 1) both; }
.v-telescope.p-covered { background: #101d42; }
.v-telescope.p-covered .iris { opacity: 0; }
.v-telescope.p-reveal .iris { animation: iris-open var(--reveal-ms) cubic-bezier(.35, 0, .3, 1) both; }
@keyframes iris-close {
  0% { width: 160vmax; height: 160vmax; }
  88% { width: 0; height: 0; border-width: 12px; }
  100% { width: 0; height: 0; border-width: 0; }
}
@keyframes iris-open {
  0% { width: 0; height: 0; border-width: 0; opacity: 1; }
  12% { border-width: 12px; }
  80% { opacity: 1; }
  100% { width: 160vmax; height: 160vmax; opacity: 0; }
}

/* ---- reduced motion: a short, plain fade; nothing sweeps or scales ---- */
.screen-wipe.reduced .sheet, .screen-wipe.reduced .iris { animation: none !important; transform: none; }
.screen-wipe.reduced .sheet::before, .screen-wipe.reduced .sheet::after { display: none; }
.screen-wipe.reduced.v-telescope { background: #101d42; }
.screen-wipe.reduced .iris { display: none; }
.screen-wipe.reduced.p-cover { animation: wipe-fade-in var(--cover-ms) linear both; }
.screen-wipe.reduced.p-reveal { animation: wipe-fade-out var(--reveal-ms) linear both; }
@keyframes wipe-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes wipe-fade-out { from { opacity: 1; } to { opacity: 0; } }
</style>
