<script setup>
// ============================================================
// One question in detail, opened from the dashboard. A native <dialog>
// (focus stays inside, Esc closes). Shows how the class answered it in
// the selected period - no student names.
// ============================================================
import { ref, computed, nextTick } from 'vue';
import { S, api, periodQuery } from '../api.js';
import { pct, secs, when } from '../ui.js';

const dlg = ref(null);
const q = ref(null);
const error = ref('');
let seq = 0;

async function open(questionId) {
  const mine = ++seq;
  q.value = null;
  error.value = '';
  if (!dlg.value.open) dlg.value.showModal();
  try {
    const data = await api('GET', `/api/teacher/classes/${S.classId}/questions/${questionId}/insights?${periodQuery()}`);
    if (mine === seq) q.value = data;
  } catch (err) {
    if (mine === seq) error.value = err.message;
  }
  await nextTick();
}
const close = () => dlg.value?.close();
defineExpose({ open });

const frac = (r) => (r.n ? `${pct(r.accuracy)} (${r.correct}/${r.n})` : '-');
const share = (count, total) => (total ? count / total : 0);
const maxCount = computed(() => Math.max(1, ...(q.value?.answers.options || q.value?.answers.keyPoints || []).map((o) => o.count ?? o.covered)));

// Jump to the question in the Question bank (the dashboard picks the course)
const emit = defineEmits(['open-in-bank']);
function openInBank() {
  const id = q.value.questionId;
  close();
  emit('open-in-bank', id);
}
</script>

<template>
  <dialog ref="dlg" class="insight" aria-labelledby="insight-title" @click.self="close">
    <div class="insight-body">
      <div class="row" style="align-items: flex-start">
        <h3 id="insight-title" class="grow" style="margin: 0">{{ q ? q.stem : 'Question details' }}</h3>
        <button class="btn small" aria-label="Close" @click="close">✕</button>
      </div>
      <div v-if="error" class="note bad" style="margin-top: 10px">{{ error }}</div>
      <p v-else-if="!q" class="muted small">Loading…</p>
      <template v-else>
        <div class="row small" style="margin: 8px 0 12px; gap: 6px">
          <span class="badge plain">{{ q.type }}</span>
          <span :class="'badge ' + q.status">{{ q.status }}</span>
          <span v-if="q.difficulty" class="badge plain">{{ q.difficulty }}</span>
          <span v-if="q.difficultyVerdict" class="badge draft">⚠ {{ q.difficultyVerdict }}</span>
          <span class="muted">{{ q.topic }}<template v-if="q.outcome"> · {{ q.outcome }}</template> · version {{ q.version }}</span>
        </div>

        <div class="tiles">
          <div class="tile"><div class="v">{{ q.first.n ? pct(q.first.accuracy) : '-' }}</div><div class="l">first-attempt accuracy ({{ q.first.correct }}/{{ q.first.n }})</div></div>
          <div class="tile"><div class="v">{{ q.retry.n ? pct(q.retry.accuracy) : '-' }}</div><div class="l">retry accuracy ({{ q.retry.correct }}/{{ q.retry.n }})</div></div>
          <div class="tile"><div class="v">{{ secs(q.time.meanMs) }}</div><div class="l">average time ({{ q.time.students }} students, median {{ secs(q.time.medianMs) }})</div></div>
          <div v-if="q.awaitingMarking || q.timeouts" class="tile"><div class="v">{{ q.awaitingMarking }} · {{ q.timeouts }}</div><div class="l">awaiting marking · timed out</div></div>
        </div>

        <!-- how the class answered -->
        <template v-if="q.answers.kind === 'options'">
          <h4>Answers chosen <span class="muted small">({{ q.answers.answered }} answers to version {{ q.version }}{{ q.answers.multi ? '; students could pick several' : '' }})</span></h4>
          <div v-if="q.answers.answered" class="optbars">
            <div v-for="(o, i) in q.answers.options" :key="i" class="optbar">
              <div class="optbar-label">
                <span>{{ o.text }}</span>
                <b v-if="o.correct" class="right-answer">✓ correct answer</b>
                <span v-else-if="o.rarelyChosen" class="badge draft">rarely chosen</span>
              </div>
              <div class="optbar-track">
                <div class="optbar-fill" :style="{ width: (100 * o.count) / maxCount + '%' }"></div>
                <span class="num small">{{ o.count }} ({{ pct(share(o.count, q.answers.answered)) }})</span>
              </div>
            </div>
          </div>
          <p v-else class="muted small">No answers to this version in the period.</p>
          <p v-if="q.answers.options.some((o) => o.rarelyChosen)" class="small muted">"Rarely chosen" wrong options were picked by under {{ Math.round(q.answers.unused.maxShare * 100) }}% of answers: they may be too obviously wrong to test understanding. Consider a more plausible distractor.</p>
        </template>
        <template v-else-if="q.answers.kind === 'numeric'">
          <h4>Answers given <span class="muted small">({{ q.answers.answered }} answers)</span></h4>
          <p class="small">Correct answer: <b>{{ q.answers.answer }}{{ q.answers.unit ? ' ' + q.answers.unit : '' }}</b><span v-if="q.answers.tolerance"> (± {{ q.answers.tolerance }})</span></p>
          <table v-if="q.answers.commonWrong.length" class="dash-table">
            <thead><tr><th>Common wrong value</th><th>Times given</th></tr></thead>
            <tbody><tr v-for="w in q.answers.commonWrong" :key="w.value"><td class="num">{{ w.value }}</td><td class="num">{{ w.count }}</td></tr></tbody>
          </table>
          <p v-else class="muted small">No wrong answers in the period.</p>
        </template>
        <template v-else-if="q.answers.kind === 'keyPoints'">
          <h4>Key points covered <span class="muted small">({{ q.answers.answered }} answers; automatic check, confirmed marks may differ)</span></h4>
          <div v-if="q.answers.answered" class="optbars">
            <div v-for="(k, i) in q.answers.keyPoints" :key="i" class="optbar">
              <div class="optbar-label"><span>{{ k.text }}</span></div>
              <div class="optbar-track">
                <div class="optbar-fill" :style="{ width: (100 * k.covered) / maxCount + '%' }"></div>
                <span class="num small">{{ k.covered }} ({{ pct(share(k.covered, q.answers.answered)) }})</span>
              </div>
            </div>
          </div>
          <p v-else class="muted small">No answers in the period.</p>
        </template>
        <p v-else class="muted small">This is a maths variation: every student gets different numbers and options, so choices can't be compared. {{ q.answers.answered }} answers in the period.</p>
        <p v-if="q.olderVersionAnswers" class="muted small">{{ q.olderVersionAnswers }} answer(s) to older versions are counted in accuracy but not in the choices above.</p>

        <template v-if="q.explanation">
          <h4>Explanation shown to students</h4>
          <p class="small" style="white-space: pre-wrap">{{ q.explanation }}</p>
        </template>

        <template v-if="q.reports.length">
          <h4>Student reports ({{ q.reports.filter((r) => !r.resolved).length }} open)</h4>
          <div v-for="(r, i) in q.reports" :key="i" class="small" style="padding: 6px 0; border-bottom: 1px solid var(--line)">
            <span :class="'badge ' + (r.resolved ? 'plain' : 'draft')">{{ r.resolved ? 'resolved' : 'open' }}</span>
            {{ r.reason }} <span class="muted">· {{ when(r.at) }}</span>
          </div>
        </template>

        <div class="row" style="margin-top: 16px; justify-content: flex-end">
          <button class="btn" @click="close">Close</button>
          <button class="btn primary" @click="openInBank">Open in Question bank</button>
        </div>
      </template>
    </div>
  </dialog>
</template>
