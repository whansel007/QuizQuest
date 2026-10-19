<script setup>
// Keep the professor's reply local until resolution succeeds. The response is
// student-visible, but resolving a report never edits a question or a mark.
import { ref } from 'vue';
import { api, rerender } from '../api.js';
import { when, toast } from '../ui.js';
import AsyncButton from '../components/AsyncButton.vue';
import categories from '../../../src/quiz/report-categories.json';

const props = defineProps({ questionId: { type: String, required: true }, report: { type: Object, required: true } });
const response = ref('');
const category = categories.find((c) => c.value === props.report.category)?.label || 'Other problem';
async function resolve() {
  await api('POST', `/api/teacher/questions/${props.questionId}/reports/${props.report.id}/resolve`, {
    resolutionNote: response.value.trim() || undefined,
  });
  toast('Report resolved. The student can see the status in My Progress.');
  rerender();
}
</script>

<template>
  <div class="note small" :class="report.resolved ? 'good' : 'warn'" style="margin-top: 8px; overflow-wrap: anywhere">
    <b>Student report · {{ report.resolved ? 'Resolved' : 'Awaiting review' }}</b>
    <p class="small muted">{{ when(report.at) }}<template v-if="report.version"> · Reported version {{ report.version }}</template></p>
    <p v-if="report.stem">{{ report.stem }}</p>
    <p><b>{{ category }}:</b> {{ report.reason }}</p>
    <template v-if="!report.resolved">
      <label :for="'reply-' + report.id">Professor response (optional, visible to the student)</label>
      <textarea :id="'reply-' + report.id" v-model="response" rows="2" maxlength="500" placeholder="Explain what was checked or changed. Avoid personal information."></textarea>
      <p class="small muted">Edit or withdraw the question separately if needed. Resolving this report does not change marks.</p>
      <AsyncButton class="btn small" :run="resolve">Mark resolved</AsyncButton>
    </template>
    <template v-else>
      <p v-if="report.resolutionNote"><b>Professor response:</b> {{ report.resolutionNote }}</p>
      <p v-if="report.resolvedAt" class="small muted">Resolved {{ when(report.resolvedAt) }}</p>
    </template>
  </div>
</template>
