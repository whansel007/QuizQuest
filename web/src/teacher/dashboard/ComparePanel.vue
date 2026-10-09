<script setup>
// ============================================================
// The professor's classes of the same course, side by side (only shown
// when they teach two or more). Class-level numbers only.
// ============================================================
import { ref, watch } from 'vue';
import { S, api, periodQuery } from '../../api.js';
import { pct } from '../../ui.js';

const props = defineProps({
  courseId: { type: String, required: true },
  // reload when the dashboard reloads (period change, auto-refresh)
  stamp: { type: Number, default: 0 },
});
const rows = ref(null);
const error = ref('');
let seq = 0;
async function load() {
  const mine = ++seq;
  try {
    const data = await api('GET', `/api/teacher/courses/${props.courseId}/compare?${periodQuery()}`);
    if (mine === seq) {
      rows.value = data;
      error.value = '';
    }
  } catch (err) {
    if (mine === seq) error.value = err.message;
  }
}
watch(() => props.stamp, load, { immediate: true });
const frac = (r) => (r.n ? `${pct(r.accuracy)} (${r.correct}/${r.n})` : '-');
</script>

<template>
  <div>
    <p class="small muted">Your tutorial groups for this course over the same period. Differences can come from timing, group size or teaching order as much as from understanding.</p>
    <div v-if="error" class="note bad">{{ error }}</div>
    <p v-else-if="!rows" class="muted small">Loading…</p>
    <div v-else class="table-wrap">
      <table class="dash-table">
        <thead>
          <tr>
            <th>Class</th><th>Practised</th><th>Answers</th><th>Sessions</th><th>Accuracy</th>
            <th v-for="t in rows[0].topics" :key="t.topicId">{{ t.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.classId" :class="{ current: r.classId === S.classId }">
            <td class="label"><b v-if="r.classId === S.classId">{{ r.name }} (this class)</b><template v-else>{{ r.name }}</template></td>
            <td class="num">{{ r.activeEver }} / {{ r.enrolled }}</td>
            <td class="num">{{ r.attempts }}</td>
            <td class="num">{{ r.sessionsCompleted }}</td>
            <td class="num">{{ frac(r.accuracy) }}</td>
            <td v-for="t in r.topics" :key="t.topicId" class="num">{{ frac(t.accuracy) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
