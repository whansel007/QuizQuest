<script setup>
// ============================================================
// Time vs accuracy, one dot per question.
// x = average time, y = % correct. The "slow" line (slowest quarter of
// questions) and the "often wrong" line split the plot into four plainly
// labelled corners; the slow + mostly-wrong corner is shaded and its
// questions ("worth rereading") are red, larger and marked ⚠ in the legend,
// table and tooltip (never colour alone; names are not drawn on the plot). Everything else is one blue. Dots from few
// answers are hollow. `highlight` (a zone id from time-zones.mjs) fades
// every other dot. Every dot has a 24px hover target and opens the
// question. One tab stop: arrow keys step through the dots fastest to
// slowest, Enter opens the one shown (keys.js). Dots pop in on mount.
// ============================================================
import { ref, computed } from 'vue';
import { useWidth } from './useWidth.js';
import { stepKey } from './keys.js';
import { pct, secs } from '../../ui.js';
import { ZONES } from './time-zones.mjs';

const props = defineProps({
  // [{ id, label, x (ms), y (0..1), n, flagged, zone }]
  points: { type: Array, required: true },
  slowMs: { type: Number, default: null },
  maxAccuracy: { type: Number, default: 0.6 },
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
// flagged dots are red and larger; their names stay in the table and tooltip,
// so the plot never fills up with labels
const color = (p) => (p.flagged ? 'var(--bad)' : 'var(--series-1)');
const faded = (p) => props.highlight && p.zone !== props.highlight;

// corner captions in muted ink: the top two sit just above the plot (dots
// at 100% would cover them inside), the bottom two inside the corners
const corners = computed(() => {
  const left = M.left, right = M.left + plotW.value, top = M.top - 9, bottom = y(0) - 7;
  if (props.slowMs === null) return [
    { text: 'Mostly right', x: left, y: top, anchor: 'start' },
    { text: 'Often wrong', x: left + 6, y: bottom, anchor: 'start' },
  ];
  const quick = narrow.value ? 'Quick' : 'Quick and';
  const slow = narrow.value ? 'Slow' : 'Slow but';
  return [
    { text: `${quick} mostly right`, x: left, y: top, anchor: 'start' },
    { text: `${slow} mostly right`, x: right, y: top, anchor: 'end' },
    { text: `${narrow.value ? 'Quick' : 'Quick but'} often wrong`, x: left + 6, y: bottom, anchor: 'start' },
    { text: '⚠ Worth rereading', x: right - 6, y: bottom, anchor: 'end', warn: true },
  ];
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
const describe = (p) => `${p.label}. Average ${secs(p.x)}, ${pct(p.y)} correct, ${p.n} answers. ${ZONES[p.zone]?.label || ''}. Press Enter for details.`;
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
      <li><span class="k dot" style="background: var(--bad)"></span>⚠ Worth rereading (slow and often wrong)</li>
      <li><span class="k hollow"></span>Fewer than {{ lowN }} answers: wait for more</li>
    </ul>
    <div class="viz-plot">
      <svg :height="height" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="`${label}. Arrow keys move between ${shown.length} questions; Enter opens one.`" tabindex="0"
        @focus="onFocus" @blur="activeId = null" @keydown="onKey">
        <!-- the corner worth a look -->
        <rect v-if="slowMs !== null" class="zone-shade" :x="x(slowMs)" :y="y(maxAccuracy)" :width="Math.max(0, M.left + plotW - x(slowMs))" :height="y(0) - y(maxAccuracy)" />
        <text class="tick axis-title" :transform="`translate(12 ${M.top + plotH / 2}) rotate(-90)`" text-anchor="middle">% correct</text>
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
        <text v-for="c in corners" :key="c.text" :class="['corner', { warn: c.warn }]" :x="c.x" :y="c.y" :text-anchor="c.anchor">{{ c.text }}</text>
        <circle v-for="p in shown" :key="p.id" class="pop" :cx="x(p.x)" :cy="y(p.y)" :r="p.flagged ? 5.5 : 4.5"
          :fill="p.n < lowN ? 'var(--panel)' : color(p)" :stroke="p.n < lowN ? color(p) : 'var(--panel)'" stroke-width="2"
          :class="{ lifted: activeId === p.id, faded: faded(p) }" />
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
