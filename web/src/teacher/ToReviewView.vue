<script setup>
// ============================================================
// To review: the professor's to-do list for one class, kept off the
// Analytics dashboard so that page stays about the numbers.
//  - Answers to mark: free-response answers with a provisional automatic
//    mark, waiting for the professor's (any period, this class).
//  - Open student reports: what students said is wrong with a question
//    (the class's whole course, newest first, never who sent them).
// Both work in place: a marked answer or resolved report leaves its list
// at once and the lists refresh quietly, so nothing jumps.
// ============================================================
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { S, api, setTab, dashPrefs, saveDashPrefs } from '../api.js';
import { pct, toast } from '../ui.js';
import AsyncButton from '../components/AsyncButton.vue';
import Pager from '../components/Pager.vue';
import { usePaged } from '../components/paged.js';
import ClassPicker from './ClassPicker.vue';
import QuestionInsight from './QuestionInsight.vue';
import ReportsPanel from './dashboard/ReportsPanel.vue';
import { loadCourses } from './courses.js';
import { refreshReviewCount } from './review-count.js';

const REFRESH_MS = 30000;
const courses = ref([]);
const loaded = ref(false);
const error = ref('');
const marking = ref([]); // the newest answers waiting for a mark (the server caps the list)
const markingTotal = ref(0); // all of them
const reports = ref([]);
const insight = ref(null);
const total = computed(() => markingTotal.value + reports.value.length);
const markingPages = usePaged(() => marking.value, 5);
const timezone = computed(() => courses.value.flatMap((c) => c.classes).find((c) => c.id === S.classId)?.settings?.timezone);

let seq = 0;
async function load() {
  const mine = ++seq; // a slower, older request must not overwrite a newer one
  try {
    const [queue, open] = await Promise.all([
      api('GET', `/api/teacher/classes/${S.classId}/marking`),
      api('GET', `/api/teacher/classes/${S.classId}/reports`),
    ]);
    if (mine !== seq) return;
    marking.value = queue.items;
    markingTotal.value = queue.total;
    reports.value = open.items;
    S.reviewCount = total.value;
    error.value = '';
  } catch (err) {
    if (mine === seq) error.value = err.message;
  }
}

async function init() {
  try {
    courses.value = await loadCourses();
    const classes = courses.value.flatMap((c) => c.classes);
    if (classes.length) {
      // the class the dashboard was last looking at, else the first
      if (!S.classId) S.classId = dashPrefs().classId;
      if (!classes.some((c) => c.id === S.classId)) S.classId = classes[0].id;
      saveDashPrefs({ classId: S.classId });
      await load();
    }
  } catch (err) {
    error.value = err.message;
  }
  loaded.value = true;
}

// refresh quietly while this browser tab is visible, so new answers and
// reports turn up without a reload (typed replies survive: ReportsPanel
// keeps them by report)
let timer = null;
onMounted(async () => {
  await init();
  timer = setInterval(() => {
    if (document.visibilityState === 'visible' && S.classId) load();
  }, REFRESH_MS);
});
onUnmounted(() => clearInterval(timer));

// ---- marking: the answer slides out at once; if a co-teacher (or another
// tab) marked it first, their mark stands
const sliding = ref(false);
const mark = (m, correct) => async () => {
  let taken = false;
  try {
    await api('POST', `/api/teacher/attempts/${m.attemptId}/mark`, { correct, expectPending: true });
  } catch (err) {
    if (err.status !== 409) throw err;
    taken = true;
  }
  sliding.value = true;
  setTimeout(() => (sliding.value = false), 400);
  marking.value = marking.value.filter((x) => x.attemptId !== m.attemptId);
  markingTotal.value = Math.max(0, markingTotal.value - 1);
  S.reviewCount = total.value;
  toast(taken ? 'Someone else already marked this answer, so their mark stands.' : `Marked ${correct ? 'correct' : 'not correct'}`, taken);
  await nextTick(); // the clicked button is gone: keep keyboard focus nearby
  document.querySelector(marking.value.length ? '#review-marking h3' : '#review-top h2')?.focus({ preventScroll: true });
  load(); // brings older answers into the capped list
};

// ---- reports: a resolved one leaves the list at once
function reportResolved(id) {
  reports.value = reports.value.filter((r) => r.id !== id);
  S.reviewCount = total.value;
  load();
}
const openQuestion = (id) => insight.value.open(id);
function openInBank(id) {
  S.courseId = courses.value.find((c) => c.classes.some((cl) => cl.id === S.classId))?.id || S.courseId;
  S.focusQuestionId = id;
  setTab('review');
}

onUnmounted(() => refreshReviewCount());
</script>

<template>
  <div id="review-top">
    <div class="t-toolbar">
      <h2 tabindex="-1">To review</h2>
      <ClassPicker v-if="courses.length" :courses="courses" />
    </div>
    <p class="small muted">Answers waiting for your mark and what students reported about questions. The Analytics dashboard counts these under Needs attention and links here.</p>
    <p v-if="error" class="note bad">{{ error }} <button class="linklike" @click="load">Try again</button></p>
    <p v-else-if="!loaded" class="muted">Loading…</p>
    <p v-else-if="!courses.some((c) => c.classes.length)" class="muted">You have no classes yet. Create one in Classes &amp; Roster.</p>
    <template v-else>
      <p v-if="!total" class="note good">✓ Nothing to review for this class right now.</p>

      <section v-if="marking.length" id="review-marking" class="t-section">
        <div class="panel" style="border-color: var(--warn)">
          <h3 tabindex="-1">Answers to mark ({{ markingTotal }})</h3>
          <p class="small muted">Free-response answers get a provisional automatic mark. Confirm or change it; marking an answer correct pays the usual first-correct coins. Answers are shown without student names. This list covers every period.</p>
          <p v-if="markingTotal > marking.length" class="small">Showing the newest {{ marking.length }} of {{ markingTotal }}; older ones appear as you mark these.</p>
          <TransitionGroup tag="div" :name="sliding ? 'marked' : 'none'" class="marking-list">
            <div v-for="m in markingPages.items" :key="m.attemptId" class="marking-item">
              <div style="font-weight: 600">{{ m.stem }}</div>
              <div class="small muted">Key points: {{ m.keyPoints.map((k, i) => (m.coveredPoints.includes(i) ? `✓ ${k}` : `○ ${k}`)).join(' · ') }}</div>
              <div class="panel" style="background: var(--bg); margin: 6px 0; padding: 10px; white-space: pre-wrap">{{ m.text || '(blank)' }}</div>
              <div class="row">
                <span class="small">Auto ({{ m.method }}): <b>{{ m.autoCorrect ? 'correct' : 'not correct' }}</b> · {{ pct(m.score) }} of key points</span>
                <AsyncButton class="btn small good" :run="mark(m, true)">Mark correct</AsyncButton>
                <AsyncButton class="btn small bad" :run="mark(m, false)">Mark not correct</AsyncButton>
              </div>
            </div>
          </TransitionGroup>
          <Pager :paged="markingPages" label="Answers to mark pages" noun="answers" />
        </div>
      </section>

      <section v-if="reports.length" id="review-reports" class="t-section">
        <div class="panel" style="border-color: var(--warn)">
          <h3 tabindex="-1">Open student reports ({{ reports.length }})</h3>
          <ReportsPanel :reports="reports" :timezone="timezone" @resolved="reportResolved" @open-question="openQuestion" @open-in-bank="openInBank" />
        </div>
      </section>
    </template>
    <QuestionInsight ref="insight" @open-in-bank="openInBank" />
  </div>
</template>
