<script setup>
// ============================================================
// Single-series column chart (e.g. answers per day/week). One colour
// (slot 1), so no legend: the panel title names it. Each column is its
// own hover/focus target with a tooltip.
// ============================================================
import { ref, computed } from 'vue';
import { useWidth, labelStep } from './useWidth.js';

const props = defineProps({
  // [{ label, value, detail }] - detail is extra tooltip text
  rows: { type: Array, required: true },
  unit: { type: String, default: '' },
  height: { type: Number, default: 220 },
  label: { type: String, required: true },
});

const el = ref(null);
const width = useWidth(el);
const M = { top: 10, right: 14, bottom: 26, left: 40 };
const plotW = computed(() => Math.max(60, width.value - M.left - M.right));
const plotH = computed(() => props.height - M.top - M.bottom);
const band = computed(() => plotW.value / Math.max(1, props.rows.length));
const barW = computed(() => Math.max(2, Math.min(24, band.value * 0.6)));
// a clean axis maximum: 4 equal steps of 1, 2 or 5 x 10^k
const max = computed(() => {
  const raw = Math.max(1, ...props.rows.map((r) => r.value)) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const nice = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return Math.max(4, Math.ceil(nice) * 4);
});
const ticks = computed(() => [0, 1, 2, 3, 4].map((k) => (max.value / 4) * k));
const y = (v) => M.top + plotH.value * (1 - v / max.value);
const step = computed(() => labelStep(props.rows.length, plotW.value));
const cx = (i) => M.left + band.value * (i + 0.5);

// 4px rounded data end, square at the baseline
function bar(i, v) {
  if (!v) return '';
  const w = barW.value;
  const x0 = cx(i) - w / 2;
  const top = y(v);
  const base = y(0);
  const r = Math.min(4, w / 2, base - top);
  return `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + w - r}Q${x0 + w},${top} ${x0 + w},${top + r}V${base}Z`;
}

const active = ref(null);
const tipLeft = computed(() => {
  if (active.value === null) return 0;
  const px = cx(active.value);
  return px > width.value / 2 ? Math.max(0, px - 252) : px + 12;
});
const fmt = (n) => n.toLocaleString();
const describe = (r) => `${r.label}: ${fmt(r.value)} ${props.unit}. ${r.detail || ''}`;
</script>

<template>
  <div ref="el" class="viz" @pointerleave="active = null">
    <div class="viz-plot">
      <svg :height="height" role="img" :aria-label="label">
        <template v-for="t in ticks" :key="t">
          <line class="gridline" :x1="M.left" :x2="M.left + plotW" :y1="y(t)" :y2="y(t)" />
          <text class="tick" :x="M.left - 6" :y="y(t) + 4" text-anchor="end">{{ fmt(t) }}</text>
        </template>
        <path v-for="(r, i) in rows" :key="'b' + i" class="bar" :class="{ active: active === i }" :style="{ '--d': Math.min(i, 30) }" :d="bar(i, r.value)" fill="var(--series-1)" />
        <line class="baseline" :x1="M.left" :x2="M.left + plotW" :y1="y(0)" :y2="y(0)" />
        <template v-for="(r, i) in rows" :key="'x' + i">
          <text v-if="i % step === 0" class="tick" :x="cx(i)" :y="height - 8" text-anchor="middle">{{ r.label }}</text>
        </template>
        <rect v-for="(r, i) in rows" :key="'h' + i" class="hit" :x="M.left + band * i" :y="M.top" :width="band" :height="plotH"
          tabindex="0" :aria-label="describe(r)" @pointerenter="active = i" @focus="active = i" @blur="active = null" />
      </svg>
      <Transition name="tip">
        <div v-if="active !== null" class="viz-tip" :style="{ left: tipLeft + 'px', top: M.top + 'px' }">
          <div class="t">{{ rows[active].label }}</div>
          <div class="r"><b>{{ fmt(rows[active].value) }}</b><span>{{ unit }}</span></div>
          <div v-if="rows[active].detail" class="muted">{{ rows[active].detail }}</div>
        </div>
      </Transition>
    </div>
  </div>
</template>
