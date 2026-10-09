<script setup>
// ============================================================
// Time vs accuracy, one dot per question.
// x = average time, y = accuracy (0-100%). Two reference lines mark the
// "slow" threshold and 50% accuracy; dots in the slow + mostly-wrong
// corner are flagged "possibly confusing" (second colour + legend + the
// flag in the table, never colour alone). Dots from few answers are
// hollow. Every dot has a 24px hover/focus target and opens the question.
// ============================================================
import { ref, computed } from 'vue';
import { useWidth } from './useWidth.js';
import { pct, secs } from '../../ui.js';

const props = defineProps({
  // [{ id, label, x (ms), y (0..1), n, flagged }]
  points: { type: Array, required: true },
  slowMs: { type: Number, default: null },
  maxAccuracy: { type: Number, default: 0.5 },
  lowN: { type: Number, default: 5 },
  height: { type: Number, default: 260 },
  label: { type: String, required: true },
});
const emit = defineEmits(['open']);

const el = ref(null);
const width = useWidth(el);
const M = { top: 12, right: 18, bottom: 34, left: 42 };
const plotW = computed(() => Math.max(60, width.value - M.left - M.right));
const plotH = computed(() => props.height - M.top - M.bottom);
// x axis in whole seconds: ticks every 1/2/5/10/15/30/60s, up past the slowest
const xStep = computed(() => {
  const top = Math.max(10000, ...props.points.map((p) => p.x)) / 1000;
  return [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => top / s <= 6) || 600;
});
const xMax = computed(() => Math.ceil(Math.max(10000, ...props.points.map((p) => p.x)) / 1000 / xStep.value) * xStep.value * 1000);
const xTicks = computed(() => Array.from({ length: xMax.value / 1000 / xStep.value + 1 }, (_, i) => i * xStep.value * 1000));
const yTicks = [0, 0.25, 0.5, 0.75, 1];
const x = (ms) => M.left + plotW.value * (ms / xMax.value);
const y = (v) => M.top + plotH.value * (1 - v);
const shown = computed(() => props.points.filter((p) => p.y !== null));
const color = (p) => (p.flagged ? 'var(--series-2)' : 'var(--series-1)');

const active = ref(null);
const tip = computed(() => {
  const p = active.value;
  if (!p) return null;
  const left = x(p.x) > width.value / 2 ? Math.max(0, x(p.x) - 262) : x(p.x) + 14;
  return { p, left, top: Math.max(0, y(p.y) - 20) };
});
const describe = (p) => `${p.label}. Average ${secs(p.x)}, accuracy ${pct(p.y)} of ${p.n} answers${p.flagged ? ', possibly confusing' : ''}. Press Enter for details.`;
</script>

<template>
  <div ref="el" class="viz" @pointerleave="active = null">
    <ul class="viz-legend">
      <li><span class="k dot" style="background: var(--series-1)"></span>Question</li>
      <li><span class="k dot" style="background: var(--series-2)"></span>Possibly confusing (slow and mostly wrong)</li>
      <li><span class="k hollow"></span>fewer than {{ lowN }} answers</li>
    </ul>
    <div class="viz-plot">
      <svg :height="height" role="img" :aria-label="label">
        <template v-for="t in yTicks" :key="'y' + t">
          <line class="gridline" :x1="M.left" :x2="M.left + plotW" :y1="y(t)" :y2="y(t)" />
          <text class="tick" :x="M.left - 6" :y="y(t) + 4" text-anchor="end">{{ pct(t) }}</text>
        </template>
        <template v-for="t in xTicks" :key="'x' + t">
          <text class="tick" :x="x(t)" :y="M.top + plotH + 16" text-anchor="middle">{{ `${Math.round(t / 1000)}s` }}</text>
        </template>
        <text class="tick" :x="M.left + plotW" :y="height - 2" text-anchor="end">average time per question →</text>
        <line class="baseline" :x1="M.left" :x2="M.left + plotW" :y1="y(0)" :y2="y(0)" />
        <line class="baseline" :x1="M.left" :x2="M.left" :y1="M.top" :y2="y(0)" />
        <!-- reference lines: solid hairlines, labelled -->
        <template v-if="slowMs !== null">
          <line class="refline" :x1="x(slowMs)" :x2="x(slowMs)" :y1="M.top" :y2="y(0)" />
          <text class="tick" :x="x(slowMs) + 4" :y="M.top + 10">slow</text>
        </template>
        <line class="refline" :x1="M.left" :x2="M.left + plotW" :y1="y(maxAccuracy)" :y2="y(maxAccuracy)" />
        <circle v-for="(p, i) in shown" :key="p.id" class="dot" :style="{ '--d': Math.min(i, 30) }" :cx="x(p.x)" :cy="y(p.y)" r="4.5"
          :fill="p.n < lowN ? 'var(--panel)' : color(p)" :stroke="p.n < lowN ? color(p) : 'var(--panel)'" stroke-width="2"
          :class="{ lifted: active === p }" />
        <circle v-for="p in shown" :key="'h' + p.id" class="hit" :cx="x(p.x)" :cy="y(p.y)" r="12" tabindex="0" role="button" :aria-label="describe(p)"
          @pointerenter="active = p" @focus="active = p" @blur="active = null" @click="emit('open', p.id)" @keydown.enter.prevent="emit('open', p.id)" @keydown.space.prevent="emit('open', p.id)" />
      </svg>
      <Transition name="tip">
        <div v-if="tip" class="viz-tip" :style="{ left: tip.left + 'px', top: tip.top + 'px' }">
          <div class="t">{{ tip.p.label }}</div>
          <div class="r"><b>{{ secs(tip.p.x) }}</b><span>average time</span></div>
          <div class="r"><b>{{ pct(tip.p.y) }}</b><span>correct</span><span class="muted">(n={{ tip.p.n }})</span></div>
          <div v-if="tip.p.flagged" class="r"><span>⚠ possibly confusing</span></div>
          <div class="muted">Click for details</div>
        </div>
      </Transition>
    </div>
  </div>
</template>
