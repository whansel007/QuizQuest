<script setup>
// ============================================================
// Open student reports, on the dashboard itself: what the student said was
// wrong with a question, and a reply box to resolve it without leaving the
// page. Reports never say who sent them. The list is one class's (the
// parent picks it); old reports whose class is unknown show for every class.
// Resolving never edits a question or a mark; "Edit in Question bank" does
// that. The same resolve call as the Question bank (ReportReview.vue).
// ============================================================
import { reactive } from 'vue';
import { api } from '../../api.js';
import { when, toast } from '../../ui.js';
import AsyncButton from '../../components/AsyncButton.vue';
import Pager from '../../components/Pager.vue';
import { usePaged } from '../../components/paged.js';
import categories from '../../../../src/quiz/report-categories.json';

const props = defineProps({
  reports: { type: Array, required: true }, // GET .../reports items: this class's open ones, newest first
  timezone: { type: String, default: undefined },
});
const emit = defineEmits(['resolved', 'open-question', 'open-in-bank']);

const pages = usePaged(() => props.reports, 5);
const categoryLabel = (value) => categories.find((c) => c.value === value)?.label || 'Other problem';
// typed replies are kept by report, so the 30-second auto-refresh can redraw
// the list without losing what the professor was writing
const replies = reactive({});

const resolve = (r) => async () => {
  await api('POST', `/api/teacher/questions/${r.questionId}/reports/${r.id}/resolve`, {
    resolutionNote: (replies[r.id] || '').trim() || undefined,
  });
  delete replies[r.id];
  toast('Report resolved. The student can see the status in My Progress.');
  emit('resolved', r.id);
};
</script>

<template>
  <div>
    <p class="small muted">What students in this class said is wrong with a question, newest first. Reports never show who sent them. Resolving one doesn't change the question or anyone's marks; edit or withdraw the question in the Question bank if it needs it.</p>
    <ul class="report-list">
      <li v-for="r in pages.items" :key="r.id" class="report-item">
        <div class="report-head">
          <button class="linklike report-stem" @click="emit('open-question', r.questionId)">{{ r.stem }}</button>
          <span class="badge draft">⚑ {{ categoryLabel(r.category) }}</span>
        </div>
        <p class="small muted report-meta">
          {{ when(r.at, timezone) }}
          <template v-if="r.topic"> · {{ r.topic }}</template>
          <template v-if="!r.classKnown"> · <span title="Sent before reports recorded their class, so it shows for every class of the course">class not recorded</span></template>
          <template v-if="r.version"> · version {{ r.version }}</template>
        </p>
        <blockquote class="report-reason">{{ r.reason }}</blockquote>
        <label :for="'dash-reply-' + r.id" class="small">Your response (optional, the student sees it)</label>
        <textarea :id="'dash-reply-' + r.id" v-model="replies[r.id]" rows="2" maxlength="500" placeholder="Explain what you checked or changed. Avoid personal information."></textarea>
        <div class="row report-actions">
          <AsyncButton class="btn small good" :run="resolve(r)">Mark resolved</AsyncButton>
          <button class="btn small" @click="emit('open-in-bank', r.questionId)">Edit in Question bank</button>
        </div>
      </li>
    </ul>
    <Pager :paged="pages" label="Student report pages" noun="reports" />
  </div>
</template>

<style scoped>
.report-list { list-style: none; margin: 0; padding: 0; }
.report-item { padding: 12px 0; border-top: 1px solid var(--line); }
.report-item:first-child { border-top: 0; padding-top: 4px; }
.report-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; }
.report-stem { flex: 1 1 260px; min-width: 0; font-weight: 600; text-align: left; }
.report-meta { margin: 4px 0 8px; }
.report-reason {
  margin: 0 0 10px; padding: 8px 12px; border-left: 3px solid var(--warn);
  border-radius: 0 8px 8px 0; background: var(--warn-soft); white-space: pre-wrap; overflow-wrap: anywhere;
}
.report-item textarea { min-height: 64px; margin-top: 4px; }
.report-actions { gap: 8px; margin-top: 8px; }
</style>
