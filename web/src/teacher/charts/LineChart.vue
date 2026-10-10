<script setup>
// ============================================================
// Multi-series line chart (one line per topic), y = 0-100%.
// - colour follows the series' slot (its topic order), never its rank
// - points from fewer than `lowN` answers are drawn hollow
// - a crosshair + tooltip lists every series at the hovered/focused x
// - the parent shows a table view, so no value needs hovering to read
// - lines draw in when the chart mounts (the parent remounts it for a new
//   period, not for background refreshes)
// - one tab stop: arrow keys move the crosshair (see keys.js)
// ============================================================
import { ref, computed } from 'vue';
import { useWidth, labelStep } from './useWidth.js';
import { stepKey } from './keys.js';
import { pct } from '../../ui.js';

const props = defineProps({
  // [{ id, name, slot }] - slot 1..8 picks --series-N
  series: { type: Array, required: true },
  // [{ label, cells: { [id]: { value: 0..1 | null, n } } }]
  rows: { type: Array, required: true },
  lowN: { type: Number, default: 5 },
  height: { type: Number, default: 220 },
  label: { type: String, required: true },
});

const el = ref(null);
const width = useWidth(el);
const M = { top: 10, right: 14, bottom: 26, left: 40 };
const plotW = computed(() => Math.max(60, width.value - M.left - M.right));
const plotH = computed(() => props.height - M.top - M.bottom);
const band = computed(() => plotW.value / Math.max(1, props.rows.length));
const x = (i) => M.left + band.value * (i + 0.5);
const y = (v) => M.top + plotH.value * (1 - v);
const ticks = [0, 0.25, 0.5, 0.75, 1];
const step = computed(() => labelStep(props.rows.length, plotW.value));
const color = (s) => `var(--series-${s.slot})`;

// One path per series; a bucket with no answers breaks the line
const paths = computed(() => props.series.map((s) => {
  let d = '';
  let pen = false;
  props.rows.forEach((r, i) => {
    const c = r.cells[s.id];
    if (!c || c.value === null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(c.value).toFixed(1)}`;
    pen = true;
  });
  return { s, d };
}));
const dots = computed(() => props.series.flatMap((s) => props.rows.map((r, i) => {
  const c = r.cells[s.id];
  return c && c.value !== null ? { key: `${s.id}:${i}`, s, cx: x(i), cy: y(c.value), low: c.n < props.lowN } : null;
}).filter(Boolean)));

const active = ref(null);
const tipLeft = computed(() => {
  if (active.value === null) return 0;
  const px = x(active.value);
  return px > width.value / 2 ? Math.max(0, px - 252) : px + 12;
});
const cell = (r, s) => r.cells[s.id] || { value: null, n: 0 };
const describe = (r) => `${r.label}: ` + props.series.map((s) => {
  const c = cell(r, s);
  return `${s.name} ${c.value !== null ? `${pct(c.value)} of ${c.n}` : 'no answers'}`;
}).join(', ');
// keyboard focus starts on the latest point
function onFocus() {
  if (active.value === null) active.value = props.rows.length - 1;
}
function onKey(e) {
  const next = stepKey(e, active.value, props.rows.length);
  if (next !== null) active.value = next;
}
</script>

<template>
  <div ref="el" class="viz" @pointerleave="active = null">
    <ul class="viz-legend">
      <li v-for="s in series" :key="s.id"><span class="k" :style="{ background: color(s) }"></span>{{ s.name }}</li>
      <li><span class="k hollow"></span>fewer than {{ lowN }} answers</li>
    </ul>
    <div class="viz-plot">
      <svg :height="height" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="`${label}. Arrow keys move between ${rows.length} points.`" tabindex="0"
        @focus="onFocus" @blur="active = null" @keydown="onKey">
        <template v-for="t in ticks" :key="t">
          <line class="gridline" :x1="M.left" :x2="M.left + plotW" :y1="y(t)" :y2="y(t)" />
          <text class="tick" :x="M.left - 6" :y="y(t) + 4" text-anchor="end">{{ pct(t) }}</text>
        </template>
        <line class="baseline" :x1="M.left" :x2="M.left + plotW" :y1="y(0)" :y2="y(0)" />
        <template v-for="(r, i) in rows" :key="'x' + i">
          <text v-if="i % step === 0" class="tick" :x="x(i)" :y="height - 8" text-anchor="middle">{{ r.label }}</text>
        </template>
        <line v-if="active !== null" class="crosshair" :x1="x(active)" :x2="x(active)" :y1="M.top" :y2="M.top + plotH" />
        <path v-for="p in paths" :key="p.s.id" class="line" pathLength="1" :d="p.d" fill="none" :stroke="color(p.s)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        <circle v-for="d in dots" :key="d.key" class="pop" :cx="d.cx" :cy="d.cy" r="4"
          :fill="d.low ? 'var(--panel)' : color(d.s)" :stroke="d.low ? color(d.s) : 'var(--panel)'" stroke-width="2" />
        <!-- hover areas: the whole column of each x -->
        <rect v-for="(r, i) in rows" :key="'h' + i" class="hit" :x="M.left + band * i" :y="M.top" :width="band" :height="plotH" @pointerenter="active = i" />
      </svg>
      <p class="sr-only" aria-live="polite">{{ active !== null && rows[active] ? describe(rows[active]) : '' }}</p>
      <div v-if="active !== null" class="viz-tip" :style="{ left: tipLeft + 'px', top: M.top + 'px' }">
        <div class="t">{{ rows[active].label }}</div>
        <div v-for="s in series" :key="s.id" class="r">
          <span class="k" :style="{ background: color(s) }"></span>
          <b>{{ cell(rows[active], s).value === null ? '-' : pct(cell(rows[active], s).value) }}</b>
          <span>{{ s.name }}</span>
          <span class="muted">(n={{ cell(rows[active], s).n }})</span>
        </div>
      </div>
    </div>
  </div>
</template>
