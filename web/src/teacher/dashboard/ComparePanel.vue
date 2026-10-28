<script setup>
// ============================================================
// The professor's classes of the same course, side by side (only shown
// when they teach two or more). Class-level numbers only.
// ============================================================
import { ref, watch } from 'vue';
import { S, api, dashQuery } from '../../api.js';
import { pct } from '../../ui.js';

const props = defineProps({
  courseId: { type: String, required: true },
  // reload when the dashboard reloads (period change, auto-refresh)
  stamp: { type: Number, default: 0 },
});
// the rows also feed "Needs attention" (a class far behind on a topic)
const emit = defineEmits(['loaded']);
const rows = ref(null);
const error = ref('');
let seq = 0;
async function load() {
  const mine = ++seq;
  try {
    const data = await api('GET', `/api/teacher/courses/${props.courseId}/compare?${dashQuery()}`);
    if (mine === seq) {
      rows.value = data;
      error.value = '';
      emit('loaded', data);
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
    <!-- one column per class, so many topics read down the page instead of scrolling sideways -->
    <div v-else class="table-wrap">
      <table class="dash-table compare-table">
        <thead>
          <tr>
            <th scope="col"></th>
            <th v-for="r in rows" :key="r.classId" scope="col" :class="{ current: r.classId === S.classId }">{{ r.name }}<template v-if="r.classId === S.classId"> (this class)</template></th>
          </tr>
        </thead>
        <tbody>
          <tr><th scope="row" class="label">Practised</th><td v-for="r in rows" :key="r.classId" class="num" :class="{ current: r.classId === S.classId }">{{ r.activeEver }} / {{ r.enrolled }}</td></tr>
          <tr><th scope="row" class="label">Answers</th><td v-for="r in rows" :key="r.classId" class="num" :class="{ current: r.classId === S.classId }">{{ r.attempts }}</td></tr>
          <tr><th scope="row" class="label">Sessions</th><td v-for="r in rows" :key="r.classId" class="num" :class="{ current: r.classId === S.classId }">{{ r.sessionsCompleted }}</td></tr>
          <tr><th scope="row" class="label">Accuracy</th><td v-for="r in rows" :key="r.classId" class="num" :class="{ current: r.classId === S.classId }">{{ frac(r.accuracy) }}</td></tr>
          <tr class="compare-group"><th scope="rowgroup" :colspan="rows.length + 1">Accuracy by topic</th></tr>
          <tr v-for="(t, i) in rows[0].topics" :key="t.topicId">
            <th scope="row" class="label">{{ t.name }}</th>
            <td v-for="r in rows" :key="r.classId" class="num" :class="{ current: r.classId === S.classId }">{{ frac(r.topics[i]?.accuracy) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
