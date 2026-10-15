<script setup>
import { ref } from 'vue';
import { api, rerender, setTab } from '../api.js';
import { toast } from '../ui.js';
import AsyncButton from '../components/AsyncButton.vue';
import QuestionEditor from './QuestionEditor.vue';
import QuestionDetails from './QuestionDetails.vue';
import {QUESTION_LABELS} from './question-types.js';

const props = defineProps({ q: { type: Object, required: true }, course: { type: Object, required: true }, passages: { type: Array, required: true } });
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
const resolve = (r) => async () => {
  await api('POST', `/api/teacher/questions/${q.id}/reports/${r.id}/resolve`);
  toast('Report marked resolved');
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
      <span :class="'badge ' + q.status">{{ q.status }}</span>
      <span class="badge">{{ QUESTION_LABELS[type] || q.typeLabel }}</span>
      <span class="badge plain">{{ v.difficulty }}</span>
      <span class="badge plain">v{{ v.v }}{{ q.publishedVersion && q.publishedVersion !== v.v ? ` (live: v${q.publishedVersion})` : '' }}</span>
      <span class="small muted">{{ topic?.name || q.assessment?.topic }}</span>
    </div>
    <QuestionDetails :value="v" :sample="q.sample" />
    <details class="question-provenance"><summary>Sources &amp; history</summary>
    <div class="small muted">Source: {{ q.sources.length ? q.sources.map((s) => s.title).join(', ') : v.sourceIds.length ? 'source removed' : 'none cited' }}</div>
    <div v-if="totalAttempts" class="small muted">{{ totalAttempts }} attempt(s) across {{ q.versions.filter((x) => x.attempts).length }} version(s)</div>
    </details>
    <div v-if="v.warnings?.length" class="note warn small" style="margin-top: 8px">{{ v.warnings.join(' ') }}</div>
    <div v-for="r in q.reports.filter((x) => !x.resolved)" :key="r.id" class="note bad small" style="margin-top: 8px">
      <b>Student report: </b>{{ r.reason }} <AsyncButton class="btn small" :run="resolve(r)">Mark resolved</AsyncButton>
    </div>
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
</style>
