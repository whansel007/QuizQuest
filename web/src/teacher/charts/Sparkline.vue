<script setup>
// ============================================================
// A tile's trend at a glance: one line, no axes, the latest value marked.
// The Trends section has the full chart (and its table); this only shows
// the shape. A last bucket that is still running (today, this week) is
// drawn hollow, so a dip there isn't read as a drop.
// ============================================================
import { ref, computed } from 'vue';
import { useWidth } from './useWidth.js';

const props = defineProps({
  // [{ value, partial }]
  points: { type: Array, required: true },
  label: { type: String, required: true }, // e.g. "Answers per day, last 7 days: 0, 12, 40"
  height: { type: Number, default: 28 },
});
const el = ref(null);
const width = useWidth(el, 140);
const PAD = 4; // room for the end dot
const max = computed(() => Math.max(1, ...props.points.map((p) => p.value)));
const x = (i) => PAD + (width.value - 2 * PAD) * (props.points.length > 1 ? i / (props.points.length - 1) : 0.5);
const y = (v) => PAD + (props.height - 2 * PAD) * (1 - v / max.value);
const d = computed(() => props.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(''));
const last = computed(() => props.points.at(-1));
</script>

<template>
  <div ref="el" class="viz spark">
    <svg :height="height" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="label">
      <path class="line" pathLength="1" :d="d" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
      <circle class="pop" :cx="x(points.length - 1)" :cy="y(last.value)" r="3"
        :fill="last.partial ? 'var(--panel)' : 'var(--series-1)'" stroke="var(--series-1)" stroke-width="2" />
    </svg>
  </div>
</template>
