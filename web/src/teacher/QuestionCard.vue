<script setup>
import { ref } from 'vue';
import { api, rerender } from '../api.js';
import { toast } from '../ui.js';
import AsyncButton from '../components/AsyncButton.vue';
import QuestionEditor from './QuestionEditor.vue';
import { ORIGIN } from './courses.js';

const props = defineProps({ q: { type: Object, required: true }, course: { type: Object, required: true }, passages: { type: Array, required: true } });
const { q, course } = props;
const topic = course.topics.find((t) => t.id === q.topicId);
const outcome = topic?.outcomes.find((o) => o.id === q.outcomeId);
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
</script>

<template>
  <div class="panel qcard">
    <div class="meta">
      <span :class="'badge ' + q.status">{{ q.status }}</span>
      <span class="badge">{{ q.typeLabel }}</span>
      <span class="badge plain">{{ ORIGIN[q.origin] || q.origin }}</span>
      <span class="badge plain">{{ v.difficulty }}</span>
      <span class="badge plain">v{{ v.v }}{{ q.publishedVersion && q.publishedVersion !== v.v ? ` (live: v${q.publishedVersion})` : '' }}</span>
      <span class="small muted">{{ topic?.name }} → {{ outcome?.text }}</span>
    </div>
    <div style="font-weight: 650">{{ v.stem }}</div>

    <!-- type-specific answer display (teacher sees everything) -->
    <ol v-if="type === 'mcq' || type === 'tf'" type="A">
      <li v-for="(o, i) in v.options" :key="i" :class="i === v.answerIndex ? 'correct' : null">{{ o }}{{ i === v.answerIndex ? '  ✓' : '' }}</li>
    </ol>
    <ol v-else-if="type === 'multi'" type="A">
      <li v-for="(o, i) in v.options" :key="i" :class="v.answerIndexes.includes(i) ? 'correct' : null">{{ o }}{{ v.answerIndexes.includes(i) ? '  ✓' : '' }}</li>
    </ol>
    <p v-else-if="type === 'numeric'">Answer: <b>{{ `${v.answer}${v.unit ? ' ' + v.unit : ''}` }}</b>{{ v.tolerance ? ` (± ${v.tolerance})` : ' (exact)' }}</p>
    <div v-else-if="type === 'short'" class="small" style="margin: 8px 0">
      <div><b>Model answer: </b>{{ v.modelAnswer }}</div>
      <div>
        <b>Key points: </b>
        <ul style="margin: 2px 0"><li v-for="(k, i) in v.keyPoints" :key="i">{{ k }}</li></ul>
      </div>
    </div>
    <div v-else-if="type === 'param'" class="small" style="margin: 8px 0">
      <div><b>Variables: </b>{{ v.variables.map((x) => `${x.name} ∈ [${x.min}..${x.max}] step ${x.step}`).join(', ') }}</div>
      <div><b>Answer: </b><code>{{ v.answerExpr }}</code>{{ v.decimals ? ` (rounded to ${v.decimals} dp)` : '' }}</div>
      <div><b>Common-mistake distractors: </b><code v-for="(d, i) in v.distractorExprs" :key="i" style="margin-right: 8px">{{ d }}</code></div>
      <div v-if="v.constraint"><b>Constraint: </b><code>{{ v.constraint }}</code></div>
      <div v-if="q.sample" class="panel" style="background: var(--bg); margin-top: 8px; padding: 10px">
        <div class="muted">Example a student might see:</div>
        <div style="font-weight: 600">{{ q.sample.stem }}</div>
        <ol type="A" style="margin: 4px 0">
          <li v-for="(o, i) in q.sample.options" :key="i" :class="i === q.sample.answerIndex ? 'correct' : null">{{ o }}</li>
        </ol>
      </div>
    </div>

    <div class="small"><b>Explanation: </b>{{ v.explanation }}</div>
    <div class="small muted">Source: {{ q.sources.length ? q.sources.map((s) => s.title).join(', ') : v.sourceIds.length ? 'source removed' : 'none cited' }}</div>
    <div v-if="totalAttempts" class="small muted">{{ totalAttempts }} attempt(s) across {{ q.versions.filter((x) => x.attempts).length }} version(s)</div>
    <div v-if="v.warnings?.length" class="note warn small" style="margin-top: 8px">{{ v.warnings.join(' ') }}</div>
    <div v-for="r in q.reports.filter((x) => !x.resolved)" :key="r.id" class="note bad small" style="margin-top: 8px">
      <b>Student report: </b>{{ r.reason }} <AsyncButton class="btn small" :run="resolve(r)">Mark resolved</AsyncButton>
    </div>
    <div class="actions">
      <AsyncButton v-if="['draft', 'rejected'].includes(q.status)" class="btn good" :run="setStatus('approve')">Approve &amp; publish</AsyncButton>
      <AsyncButton v-if="q.status === 'draft'" class="btn bad" :run="setStatus('reject')">Reject</AsyncButton>
      <AsyncButton v-if="q.status === 'published'" class="btn bad" :run="setStatus('withdraw')">Withdraw</AsyncButton>
      <AsyncButton v-if="q.status === 'withdrawn'" class="btn" :run="setStatus('republish')">Publish again</AsyncButton>
      <button class="btn" @click="edit">Edit</button>
    </div>
    <div>
      <QuestionEditor v-if="editing" :key="editorKey" :course="course" :passages="passages" :q="q" @close="editing = false" />
    </div>
  </div>
</template>
