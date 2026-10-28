<script setup>
// ============================================================
// Every weekly topic of the course in one table: what is ready (files,
// knowledge report, questions) next to how this class is doing, with the
// next step for each topic. Click a topic to narrow the dashboard to it.
// ============================================================
import { computed } from 'vue';
import { pct } from '../../ui.js';
import Meter from '../../components/Meter.vue';

const props = defineProps({
  overview: { type: Object, required: true }, // analytics.overview
  current: { type: String, default: '' }, // the topic the dashboard is narrowed to
  enrolled: { type: Number, required: true },
  period: { type: String, required: true },
});
// focus: narrow the dashboard; go: open another tab on this topic
const emit = defineEmits(['focus', 'go']);

// narrowed to one topic: only its row (the dropdown or "Show all topics" widens it again)
const rows = computed(() => (props.current ? props.overview.topics.filter((t) => t.topicId === props.current) : props.overview.topics));
const frac = (r) => (r.n ? `${pct(r.accuracy)} (${r.correct}/${r.n})` : '-');
// The one thing that moves this topic forward, if anything
function next(t) {
  if (t.questions.draft) return { label: `Review ${t.questions.draft} draft${t.questions.draft === 1 ? '' : 's'}`, tab: 'review', filter: 'draft' };
  if (t.questions.published) return null;
  if (!t.files && !t.passages) return { label: 'Add lecture files', tab: 'generate' };
  if (!t.report?.saved) return { label: 'Make knowledge report', tab: 'generate' };
  return { label: 'Draft questions', tab: 'generate' };
}
const reportText = (r) => (!r ? 'not made yet' : r.saved ? 'saved' : r.status === 'complete' ? 'made, not saved' : r.status === 'running' ? 'being made' : r.status);
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
</script>

<template>
  <div>
    <p class="small muted">Material and questions are shared by all your classes for this course; accuracy and practice are this class's ({{ period }}). {{ current ? 'Showing the chosen topic only.' : 'Click a topic to narrow the whole dashboard to it.' }}</p>
    <p v-if="!overview.topics.length" class="muted small">This course has no topics yet. Add weekly topics in AI drafting.</p>
    <div v-else class="table-wrap">
      <table class="dash-table">
        <thead>
          <tr><th>Week</th><th>Topic</th><th title="Uploaded files and added passages">Material</th><th title="The knowledge report AI drafting makes from this topic's material">Report</th><th>Questions</th><th>First-attempt accuracy</th><th></th><th>Practised</th><th class="no-print">Next step</th></tr>
        </thead>
        <tbody>
          <tr v-for="t in rows" :key="t.topicId">
            <td class="num">{{ t.week ?? '—' }}</td>
            <td class="label">
              <button class="linklike" :aria-pressed="t.topicId === current ? 'true' : 'false'" :aria-label="t.topicId === current ? 'Show every topic on the dashboard' : `Show only ${t.name} on the dashboard`" @click="emit('focus', t.topicId === current ? '' : t.topicId)">{{ t.name }}</button>
            </td>
            <td class="num">{{ t.files + t.passages || '—' }}</td>
            <td class="small">{{ reportText(t.report) }}</td>
            <td class="small">
              {{ t.questions.published }} published
              <span v-if="t.openReports" class="badge draft" :title="plural(t.openReports, 'open student report')">⚑ {{ t.openReports }}</span>
            </td>
            <td class="num">{{ frac(t.first) }}</td>
            <td style="width: 100px"><Meter v-if="t.first.n" :value="t.first.accuracy" /></td>
            <td class="num">{{ t.students }} / {{ enrolled }}</td>
            <td class="no-print">
              <button v-if="next(t)" class="btn small" @click="emit('go', { topicId: t.topicId, ...next(t) })">{{ next(t).label }}</button>
              <span v-else-if="!t.answers" class="small muted">Waiting for practice</span>
              <span v-else class="small muted">✓ Ready</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="overview.unsortedFiles && !current" class="note warn small no-print">
      {{ plural(overview.unsortedFiles, 'uploaded file') }} {{ overview.unsortedFiles === 1 ? 'is' : 'are' }} not in a topic yet.
      <button class="linklike" @click="emit('go', { topicId: '', tab: 'generate' })">Sort them in the AI drafting material library</button>
    </p>
  </div>
</template>
