<script setup>
import { ref } from 'vue';
import { api, rerender, setTab } from '../api.js';
import { toast } from '../ui.js';
import AsyncButton from '../components/AsyncButton.vue';
import QuestionEditor from './QuestionEditor.vue';
import ReportReview from './ReportReview.vue';
import QuestionDetails from './QuestionDetails.vue';
import { QUESTION_LABELS } from './question-types.js';
import { ORIGIN, topicLabel } from './courses.js';

const props = defineProps({
  q: { type: Object, required: true },
  course: { type: Object, required: true },
  passages: { type: Array, required: true },
  // The guard rails: the professor ticks the drafts they want rewritten
  selectable: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle']);
const { q, course } = props;
const topic = course.topics.find((t) => t.id === q.topicId);
const v = q.latest;
const type = v.type || 'mcq';
const totalAttempts = q.versions.reduce((n, x) => n + x.attempts, 0);

// re-clicking Edit opens a fresh editor (new key), like the old fill()
const editorKey = ref(0);
const editing = ref(false);
function edit() {
  editorKey.value++;
  editing.value = true;
}

const setStatus = (a) => async () => {
  await api('POST', `/api/teacher/questions/${q.id}/status`, { action: a });
  toast({ approve: 'Published', reject: 'Rejected', withdraw: 'Withdrawn from practice', republish: 'Published again' }[a]);
  rerender();
};
async function regenerate() {
  await api('POST', `/api/teacher/questions/${q.id}/regenerate`);
  toast('Replacement queued. Your original draft is kept.');
  setTab('generate');
}
</script>

<template>
  <div :id="'qcard-' + q.id" class="panel qcard" tabindex="-1">
    <div class="meta">
      <label v-if="selectable" class="qsel">
        <input type="checkbox" :checked="selected" :aria-label="`Rewrite this ${QUESTION_LABELS[type] || q.typeLabel} question`" @change="emit('toggle', q.id)" />
        <span>Rewrite</span>
      </label>
      <span :class="'badge ' + q.status">{{ q.status }}</span>
      <span class="badge">{{ QUESTION_LABELS[type] || q.typeLabel }}</span>
      <span class="badge plain">{{ v.difficulty }}</span>
      <span v-if="q.cognitiveStyle" class="badge plain">{{ q.cognitiveStyle === 'application' ? 'Application' : 'Conceptual' }}</span>
      <span class="badge plain">v{{ v.v }}{{ q.publishedVersion && q.publishedVersion !== v.v ? ` (live: v${q.publishedVersion})` : '' }}</span>
      <span v-if="q.origin" class="badge plain">{{ ORIGIN[q.origin] || q.origin }}</span>
      <span class="small muted">{{ topic ? topicLabel(topic) : q.assessment?.topic }}</span>
    </div>
    <QuestionDetails :value="v" :sample="q.sample" />
    <details class="question-provenance"><summary>Sources &amp; history</summary>
    <div class="small muted">Source: {{ q.sources.length ? q.sources.map((s) => s.title).join(', ') : v.sourceIds.length ? 'source removed' : 'none cited' }}</div>
    <div v-if="totalAttempts" class="small muted">{{ totalAttempts }} attempt(s) across {{ q.versions.filter((x) => x.attempts).length }} version(s)</div>
    </details>
    <div v-if="v.warnings?.length" class="note warn small" style="margin-top: 8px">{{ v.warnings.join(' ') }}</div>
    <ReportReview v-for="r in q.reports.filter((x) => !x.resolved)" :key="r.id" :question-id="q.id" :report="r" />
    <details v-if="q.reports.some((r) => r.resolved)" style="margin-top: 8px">
      <summary>Resolved reports ({{ q.reports.filter((r) => r.resolved).length }})</summary>
      <ReportReview v-for="r in q.reports.filter((x) => x.resolved)" :key="r.id" :question-id="q.id" :report="r" />
    </details>
    <div class="actions">
      <AsyncButton v-if="['draft', 'rejected'].includes(q.status)" class="btn good" :run="setStatus('approve')">Approve &amp; publish</AsyncButton>
      <AsyncButton v-if="q.status === 'published'" class="btn bad" :run="setStatus('withdraw')">Withdraw</AsyncButton>
      <AsyncButton v-if="q.status === 'withdrawn'" class="btn" :run="setStatus('republish')">Publish again</AsyncButton>
      <button class="btn" @click="edit">Edit</button>
      <AsyncButton v-if="course.authoringEnabled && q.generationId && ['draft','rejected'].includes(q.status)" class="btn" :run="regenerate">Regenerate draft</AsyncButton>
      <AsyncButton v-if="q.status === 'draft'" class="btn bad" :run="setStatus('reject')">Reject</AsyncButton>
    </div>
    <div>
      <QuestionEditor v-if="editing" :key="editorKey" :course="course" :passages="passages" :q="q" @close="editing = false" />
    </div>
  </div>
</template>

<style scoped>
.qcard { min-width:0; }
.meta > .small { min-width:0; overflow-wrap:anywhere; max-width:100%; }
.qcard:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
.question-provenance { margin:14px 0; }
summary { cursor:pointer; color:var(--muted); font-size:.85rem; }
.actions { border-top:1px solid var(--line); padding-top:14px; margin-top:16px; }
.qsel { display:inline-flex; align-items:center; gap:6px; font-size:.8rem; cursor:pointer; }
.qsel input { width:18px; height:18px; accent-color:var(--accent); cursor:pointer; }
</style>
