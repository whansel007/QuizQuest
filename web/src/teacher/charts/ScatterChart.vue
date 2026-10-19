<script setup>
// ============================================================
// Time vs accuracy, one dot per question.
// x = average time, y = accuracy (0-100%). Two reference lines mark the
// "slow" threshold and 50% accuracy; dots in the slow + mostly-wrong
// corner are flagged "possibly confusing" (second colour + legend + the
// flag in the table, never colour alone). Dots from few answers are
// hollow. Every dot has a 24px hover target and opens the question. One
// tab stop: arrow keys step through the dots fastest to slowest, Enter
// opens the one shown (keys.js). Dots pop in when the chart mounts.
// ============================================================
import { ref, computed } from 'vue';
import { useWidth } from './useWidth.js';
import { stepKey } from './keys.js';
import { pct, secs } from '../../ui.js';
import { ZONES, shortLabel } from './time-zones.mjs';

const props = defineProps({
  // [{ id, label, x (ms), y (0..1), n, flagged, zone }]
  points: { type: Array, required: true },
  slowMs: { type: Number, default: null },
  maxAccuracy: { type: Number, default: 0.5 },
  lowN: { type: Number, default: 5 },
  highlight: { type: String, default: '' },
  height: { type: Number, default: 300 },
  label: { type: String, required: true },
});
const emit = defineEmits(['open']);

const el = ref(null);
const width = useWidth(el);
const M = { top: 26, right: 18, bottom: 36, left: 54 };
const plotW = computed(() => Math.max(60, width.value - M.left - M.right));
const plotH = computed(() => props.height - M.top - M.bottom);
const narrow = computed(() => width.value < 460);
// x axis in whole seconds: ticks every 1/2/5/10/15/30/60s, up past the slowest
const slowest = computed(() => Math.max(10000, props.slowMs || 0, ...props.points.map((p) => p.x)));
const xStep = computed(() => [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => slowest.value / 1000 / s <= (narrow.value ? 4 : 6)) || 600);
const xMax = computed(() => Math.ceil(slowest.value / 1000 / xStep.value) * xStep.value * 1000);
// the "slow" line is marked on the axis itself; ticks it would overlap are skipped
const xTicks = computed(() => Array.from({ length: xMax.value / 1000 / xStep.value + 1 }, (_, i) => i * xStep.value * 1000)
  .filter((t) => props.slowMs === null || Math.abs(x(t) - x(props.slowMs)) > 46));
const yTicks = [0, 0.25, 0.5, 0.75, 1];
const x = (ms) => M.left + plotW.value * (ms / xMax.value);
const y = (v) => M.top + plotH.value * (1 - v);
const shown = computed(() => props.points.filter((p) => p.y !== null));
const color = (p) => (p.flagged ? 'var(--series-2)' : 'var(--series-1)');
const faded = (p) => props.highlight && p.zone !== props.highlight;

// corner captions in muted ink: the top two sit just above the plot (dots
// at 100% would cover them inside), the bottom two inside the corners
const corners = computed(() => {
  const left = M.left, right = M.left + plotW.value, top = M.top - 9, bottom = y(0) - 7;
  if (props.slowMs === null) return [
    { text: 'Mostly right', x: left, y: top, anchor: 'start' },
    { text: 'Mostly wrong', x: left + 6, y: bottom, anchor: 'start' },
  ];
  const quick = narrow.value ? 'Quick' : 'Quick and';
  const slow = narrow.value ? 'Slow' : 'Slow but';
  return [
    { text: `${quick} mostly right`, x: left, y: top, anchor: 'start' },
    { text: `${slow} mostly right`, x: right, y: top, anchor: 'end' },
    { text: `${narrow.value ? 'Quick' : 'Quick but'} mostly wrong`, x: left + 6, y: bottom, anchor: 'start' },
    { text: '⚠ Worth rereading', x: right - 6, y: bottom, anchor: 'end', warn: true },
  ];
});

// Name the flagged questions on the plot (at most three, worst first),
// nudged apart vertically so labels never sit on top of each other.
const LABEL_GAP = 14;
const named = computed(() => {
  const list = shown.value.filter((p) => p.flagged).sort((a, b) => a.y - b.y || b.x - a.x).slice(0, 3);
  const placed = list
    .map((p) => {
      const onLeft = x(p.x) > M.left + plotW.value * 0.45; // label on the side with room
      return { p, ly: y(p.y) + 4, lx: onLeft ? x(p.x) - 10 : x(p.x) + 10, anchor: onLeft ? 'end' : 'start', text: shortLabel(p.label, narrow.value ? 20 : 34) };
    })
    .sort((a, b) => a.ly - b.ly);
  for (let i = 1; i < placed.length; i++) placed[i].ly = Math.max(placed[i].ly, placed[i - 1].ly + LABEL_GAP);
  const overflow = placed.length ? placed.at(-1).ly - (y(0) - 4) : 0;
  if (overflow > 0) for (const l of placed) l.ly -= overflow; // keep them inside the plot
  return placed;
});

// the shown question's id (a ref would wrap a point object in a proxy, and
// then it would never equal the plain point it came from)
const activeId = ref(null);
const active = computed(() => shown.value.find((p) => p.id === activeId.value) || null);
const tip = computed(() => {
  const p = active.value;
  if (!p) return null;
  const left = x(p.x) > width.value / 2 ? Math.max(0, x(p.x) - 262) : x(p.x) + 14;
  return { p, left, top: Math.max(0, y(p.y) - 20) };
});
const describe = (p) => `${p.label}. Average ${secs(p.x)}, accuracy ${pct(p.y)} of ${p.n} answers${p.flagged ? ', possibly confusing' : ''}. Press Enter for details.`;
// keyboard order: left to right (fastest first)
const order = computed(() => [...shown.value].sort((a, b) => a.x - b.x));
function onFocus() {
  if (!active.value) activeId.value = order.value[0]?.id ?? null;
}
function onKey(e) {
  if ((e.key === 'Enter' || e.key === ' ') && active.value) {
    e.preventDefault();
    return emit('open', active.value.id);
  }
  const next = stepKey(e, active.value ? order.value.indexOf(active.value) : null, order.value.length);
  if (next !== null) activeId.value = order.value[next].id;
}
</script>

<template>
  <div ref="el" class="viz" @pointerleave="activeId = null">
    <ul class="viz-legend">
      <li><span class="k dot" style="background: var(--series-1)"></span>A question</li>
      <li><span class="k dot" style="background: var(--series-2)"></span>⚠ Worth rereading (slow and mostly wrong)</li>
      <li><span class="k hollow"></span>Fewer than {{ lowN }} answers: wait for more</li>
    </ul>
    <div class="viz-plot">
      <svg :height="height" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="`${label}. Arrow keys move between ${shown.length} questions; Enter opens one.`" tabindex="0"
        @focus="onFocus" @blur="activeId = null" @keydown="onKey">
        <template v-for="t in yTicks" :key="'y' + t">
          <line class="gridline" :x1="M.left" :x2="M.left + plotW" :y1="y(t)" :y2="y(t)" />
          <text class="tick" :x="M.left - 6" :y="y(t) + 4" text-anchor="end">{{ pct(t) }}</text>
        </template>
        <template v-for="t in xTicks" :key="'x' + t">
          <text class="tick" :x="x(t)" :y="M.top + plotH + 16" text-anchor="middle">{{ `${Math.round(t / 1000)}s` }}</text>
        </template>
        <text class="tick axis-title" :x="M.left + plotW" :y="height - 2" text-anchor="end">average time per question →</text>
        <line class="baseline" :x1="M.left" :x2="M.left + plotW" :y1="y(0)" :y2="y(0)" />
        <line class="baseline" :x1="M.left" :x2="M.left" :y1="M.top" :y2="y(0)" />
        <!-- the two dividing lines, labelled -->
        <line class="refline" :x1="M.left" :x2="M.left + plotW" :y1="y(maxAccuracy)" :y2="y(maxAccuracy)" />
        <template v-if="slowMs !== null">
          <line class="refline" :x1="x(slowMs)" :x2="x(slowMs)" :y1="M.top" :y2="y(0)" />
          <text class="tick axis-title" :x="x(slowMs)" :y="M.top + plotH + 16" text-anchor="middle">slow ≥ {{ secs(slowMs) }}</text>
        </template>
        <line class="refline" :x1="M.left" :x2="M.left + plotW" :y1="y(maxAccuracy)" :y2="y(maxAccuracy)" />
        <circle v-for="p in shown" :key="p.id" class="pop" :cx="x(p.x)" :cy="y(p.y)" r="4.5"
          :fill="p.n < lowN ? 'var(--panel)' : color(p)" :stroke="p.n < lowN ? color(p) : 'var(--panel)'" stroke-width="2"
          :class="{ lifted: activeId === p.id }" />
        <circle v-for="p in shown" :key="'h' + p.id" class="hit" :cx="x(p.x)" :cy="y(p.y)" r="12" @pointerenter="activeId = p.id" @click="emit('open', p.id)" />
      </svg>
      <p class="sr-only" aria-live="polite">{{ active ? describe(active) : '' }}</p>
      <div v-if="tip" class="viz-tip" :style="{ left: tip.left + 'px', top: tip.top + 'px' }">
        <div class="t">{{ tip.p.label }}</div>
        <div class="r"><b>{{ secs(tip.p.x) }}</b><span>average time</span></div>
        <div class="r"><b>{{ pct(tip.p.y) }}</b><span>correct</span><span class="muted">({{ tip.p.n }} answers)</span></div>
        <div class="r"><span>{{ tip.p.flagged ? '⚠ ' : '' }}{{ ZONES[tip.p.zone]?.label }}</span></div>
        <div class="muted">Click for details</div>
      </div>
    </div>
  </div>
</template>
