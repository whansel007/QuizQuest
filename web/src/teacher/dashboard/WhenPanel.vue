<script setup>
// ============================================================
// When the class practises: answers per weekday x 3-hour block, in the
// class time zone. One hue, light -> dark with the count (sequential),
// a scale legend, hover/focus tooltips and a table view.
// ============================================================
import { ref, computed } from 'vue';

const props = defineProps({
  when: { type: Object, required: true }, // { blockHours, counts[7][n] }
  timezone: { type: String, required: true },
});

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const hh = (h) => String(h).padStart(2, '0') + ':00';
const blocks = computed(() => props.when.counts[0].map((_, i) => ({ from: i * props.when.blockHours, to: (i + 1) * props.when.blockHours })));
const blockLabel = (b) => `${hh(b.from)}–${hh(b.to % 24)}`;
const max = computed(() => Math.max(0, ...props.when.counts.flat()));
const total = computed(() => props.when.counts.flat().reduce((a, b) => a + b, 0));
// share of the busiest cell, floored so a single answer is still visible
const shade = (n) => (n ? 0.15 + 0.85 * (n / max.value) : 0);

const busiest = computed(() => {
  if (!total.value) return null;
  let best = null;
  props.when.counts.forEach((row, d) => row.forEach((n, b) => {
    if (!best || n > best.n) best = { n, d, b };
  }));
  return `${DAYS[best.d]} ${blockLabel(blocks.value[best.b])}`;
});

const active = ref(null);
const describe = (d, b) => `${DAYS[d]} ${blockLabel(blocks.value[b])}: ${props.when.counts[d][b]} answers`;
</script>

<template>
  <div>
    <p class="small muted">Answers submitted per day of the week and time of day ({{ timezone.replace('_', ' ') }} time). Useful for timing reminders and quizzes.<template v-if="busiest"> Busiest: <b>{{ busiest }}</b>.</template></p>
    <p v-if="!total" class="muted small">No answers in this period.</p>
    <div v-else class="viz">
      <div class="heat" role="img" :aria-label="`Answers by day and time. Busiest: ${busiest}.`">
        <div></div>
        <div v-for="b in blocks" :key="b.from" class="heat-col">{{ hh(b.from) }}</div>
        <template v-for="(row, d) in when.counts" :key="d">
          <div class="heat-row">{{ DAYS[d] }}</div>
          <div v-for="(n, b) in row" :key="b" class="heat-cell" tabindex="0" :aria-label="describe(d, b)" :style="{ '--d': d + b }"
            :class="{ active: active && active.d === d && active.b === b }"
            @pointerenter="active = { d, b }" @pointerleave="active = null" @focus="active = { d, b }" @blur="active = null">
            <span class="fill" :style="{ opacity: shade(n) }"></span>
          </div>
        </template>
      </div>
      <div class="heat-foot">
        <span class="small muted">{{ active ? describe(active.d, active.b) : 'Hover or tab to a cell for its count.' }}</span>
        <span class="heat-scale small muted">0 <span class="ramp"></span> {{ max }}</span>
      </div>
      <details class="viz-table">
        <summary>Show as a table</summary>
        <div class="table-wrap">
          <table class="dash-table">
            <thead><tr><th>Day</th><th v-for="b in blocks" :key="b.from">{{ blockLabel(b) }}</th></tr></thead>
            <tbody>
              <tr v-for="(row, d) in when.counts" :key="d"><td>{{ DAYS[d] }}</td><td v-for="(n, b) in row" :key="b" class="num">{{ n }}</td></tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  </div>
</template>
