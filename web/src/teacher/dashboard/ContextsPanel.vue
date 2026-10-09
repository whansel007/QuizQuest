<script setup>
// ============================================================
// Practice sessions vs the multiplayer World: accuracy side by side,
// overall and per topic (confirmed answers only).
// ============================================================
import { pct } from '../../ui.js';
import Meter from '../../components/Meter.vue';

defineProps({ contexts: { type: Object, required: true } });

const frac = (r) => (r.n ? `${pct(r.accuracy)} (${r.correct}/${r.n})` : '-');
// difference in percentage points, only when both sides have answers
function diff(row) {
  if (!row.practice.n || !row.world.n) return null;
  const d = Math.round((row.world.accuracy - row.practice.accuracy) * 100);
  return d === 0 ? 'same' : d > 0 ? `World ▲ ${d} pts` : `World ▼ ${-d} pts`;
}
</script>

<template>
  <div>
    <p class="small muted">Accuracy in practice sessions compared with answers given in the World (gathering and the raid boss). A big gap can mean the game setting helps, or distracts. World questions are timed, so expect some difference.</p>
    <p v-if="!contexts.world.n" class="note small">No World answers in this period yet, so there is nothing to compare. Practice accuracy: <b>{{ frac(contexts.practice) }}</b>.</p>
    <div v-else class="table-wrap">
      <table class="dash-table">
        <thead><tr><th>Topic</th><th>Practice</th><th></th><th>World</th><th></th><th>Difference</th></tr></thead>
        <tbody>
          <tr>
            <td class="label"><b>All topics</b></td>
            <td class="num">{{ frac(contexts.practice) }}</td><td style="width: 100px"><Meter :value="contexts.practice.accuracy" /></td>
            <td class="num">{{ frac(contexts.world) }}</td><td style="width: 100px"><Meter :value="contexts.world.accuracy" /></td>
            <td class="num">{{ diff(contexts) || '-' }}</td>
          </tr>
          <tr v-for="t in contexts.byTopic" :key="t.topicId">
            <td class="label">{{ t.name }}</td>
            <td class="num">{{ frac(t.practice) }}</td><td><Meter :value="t.practice.accuracy" /></td>
            <td class="num">{{ frac(t.world) }}</td><td><Meter :value="t.world.accuracy" /></td>
            <td class="num">{{ diff(t) || '-' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
