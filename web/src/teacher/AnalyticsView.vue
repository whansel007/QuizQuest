<script setup>
// ============================================================
// Analytics dashboard (+ free-response marking, participation)
// ------------------------------------------------------------
// One filter row (class + period) scopes everything below it. While a new
// period loads, the old numbers stay on screen, dimmed, so the layout
// doesn't jump.
// ============================================================
import { ref, computed, onMounted } from 'vue';
import { S, api, rerender, download } from '../api.js';
import { pct, secs } from '../ui.js';
import Heading from '../components/Heading.vue';
import Meter from '../components/Meter.vue';
import AsyncButton from '../components/AsyncButton.vue';
import ClassPicker from './ClassPicker.vue';
import LineChart from './charts/LineChart.vue';
import ColumnChart from './charts/ColumnChart.vue';
import { loadCourses } from './courses.js';

const PERIODS = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time']];

const error = ref('');
const loaded = ref(false);
const refetching = ref(false);
const classes = ref([]);
const a = ref(null);
const marking = ref([]);
let seq = 0;

async function load() {
  const mine = ++seq; // a slower, older request must not overwrite a newer one
  refetching.value = true;
  try {
    const [analytics, queue] = await Promise.all([
      api('GET', `/api/teacher/classes/${S.classId}/analytics?range=${S.range}`),
      api('GET', `/api/teacher/classes/${S.classId}/marking`),
    ]);
    if (mine !== seq) return;
    a.value = analytics;
    marking.value = queue;
    error.value = '';
  } catch (err) {
    if (mine === seq) error.value = err.message;
  } finally {
    if (mine === seq) refetching.value = false;
  }
}

onMounted(async () => {
  try {
    const courses = await loadCourses();
    classes.value = courses.flatMap((c) => c.classes);
    if (classes.value.length) {
      if (!S.classId || !classes.value.some((c) => c.id === S.classId)) S.classId = classes.value[0].id;
      await load();
    }
    loaded.value = true;
  } catch (err) {
    error.value = err.message;
  }
});

const frac = (r) => (r.n ? `${pct(r.accuracy)} (${r.correct}/${r.n})` : '-');
const mark = (m, correct) => async () => {
  await api('POST', `/api/teacher/attempts/${m.attemptId}/mark`, { correct });
  rerender();
};
const csv = () => download(`/api/teacher/classes/${S.classId}/participation.csv`, `participation-${S.classId}.csv`);
const periodName = computed(() => PERIODS.find(([id]) => id === a.value?.range)?.[1].toLowerCase() || '');

// ---- trends: buckets are UTC days (7-day view) or Monday weeks
const bucketLabel = (start, bucket) => {
  const d = new Date(start).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return bucket === 'week' ? `w/c ${d}` : d;
};
// colour follows the topic (its order in the course), max 8 slots
const series = computed(() => a.value.trend.topics.slice(0, 8).map((t, i) => ({ id: t.id, name: t.name, slot: i + 1 })));
const accuracyRows = computed(() => a.value.trend.points.map((p) => ({
  label: bucketLabel(p.start, a.value.trend.bucket),
  cells: Object.fromEntries(Object.entries(p.topics).map(([id, r]) => [id, { value: r.accuracy, n: r.n }])),
})));
const activityRows = computed(() => a.value.trend.points.map((p) => ({
  label: bucketLabel(p.start, a.value.trend.bucket),
  value: p.answers,
  detail: `${p.students} student${p.students === 1 ? '' : 's'} active`,
})));
const per = computed(() => (a.value.trend.bucket === 'week' ? 'week' : 'day'));

// ---- time per question: slowest first, top 10 unless expanded
const TOP = 10;
const showAllTimes = ref(false);
const times = computed(() => (showAllTimes.value ? a.value.timeByQuestion : a.value.timeByQuestion.slice(0, TOP)));
</script>

<template>
  <div v-if="error && !a" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!classes.length">You have no classes.</p>
    <template v-else-if="a">
      <Heading title="Analytics">
        <ClassPicker :classes="classes" />
        <select v-model="S.range" style="width: auto" aria-label="Period" @change="load">
          <option v-for="[id, name] in PERIODS" :key="id" :value="id">{{ name }}</option>
        </select>
      </Heading>
      <div v-if="error" class="note bad">{{ error }}</div>

      <div :class="{ refetching }">
        <div class="tiles">
          <div class="tile"><div class="v">{{ `${a.participation.activeEver} / ${a.participation.enrolled}` }}</div><div class="l">students who practised ({{ periodName }})</div></div>
          <div class="tile"><div class="v">{{ `${a.participation.active7d} / ${a.participation.enrolled}` }}</div><div class="l">active in the last 7 days</div></div>
          <div class="tile"><div class="v">{{ a.participation.sessionsCompleted }}</div><div class="l">sessions completed</div></div>
          <div class="tile"><div class="v">{{ a.participation.attempts }}</div><div class="l">answers submitted ({{ a.participation.worldAttempts }} in World)</div></div>
          <div v-if="a.participation.awaitingMarking" class="tile"><div class="v">{{ a.participation.awaitingMarking }}</div><div class="l">answers awaiting marking (left out of accuracy)</div></div>
        </div>

        <div v-if="marking.length" class="panel" style="border-color: var(--warn)">
          <h3>Answers to mark ({{ marking.length }})</h3>
          <p class="small muted">Free-response answers get a provisional automatic mark. Confirm or change it; marking an answer correct pays the usual first-correct coins. Answers are shown without student names.</p>
          <div v-for="m in marking" :key="m.attemptId" style="padding: 10px 0; border-bottom: 1px solid var(--line)">
            <div style="font-weight: 600">{{ m.stem }}</div>
            <div class="small muted">Key points: {{ m.keyPoints.map((k, i) => (m.coveredPoints.includes(i) ? `✓ ${k}` : `○ ${k}`)).join(' · ') }}</div>
            <div class="panel" style="background: var(--bg); margin: 6px 0; padding: 10px; white-space: pre-wrap">{{ m.text || '(blank)' }}</div>
            <div class="row">
              <span class="small">Auto ({{ m.method }}): <b>{{ m.autoCorrect ? 'correct' : 'not correct' }}</b> · {{ pct(m.score) }} of key points</span>
              <AsyncButton class="btn small good" :run="mark(m, true)">Mark correct</AsyncButton>
              <AsyncButton class="btn small bad" :run="mark(m, false)">Mark not correct</AsyncButton>
            </div>
          </div>
        </div>

        <div class="panel">
          <h3>Trends</h3>
          <p class="small muted">Per {{ per }}, {{ periodName }}. Accuracy counts every confirmed answer (first attempts and retries); hollow points rest on fewer than {{ a.trend.lowN }} answers, so read them with care.</p>
          <div class="charts">
            <div>
              <div class="small" style="font-weight: 600; margin-bottom: 4px">Accuracy by topic</div>
              <LineChart :series="series" :rows="accuracyRows" :low-n="a.trend.lowN" :label="`Accuracy by topic per ${per}`" />
            </div>
            <div>
              <div class="small" style="font-weight: 600; margin-bottom: 4px">Answers submitted</div>
              <ColumnChart :rows="activityRows" unit="answers" :label="`Answers submitted per ${per}`" />
            </div>
          </div>
          <details class="viz-table">
            <summary>Show the chart data as a table</summary>
            <div class="table-wrap">
              <table class="dash-table">
                <thead>
                  <tr>
                    <th>{{ per === 'week' ? 'Week' : 'Day' }}</th>
                    <th>Answers</th>
                    <th>Students</th>
                    <th v-for="s in series" :key="s.id">{{ s.name }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(p, i) in a.trend.points" :key="p.start">
                    <td>{{ accuracyRows[i].label }}</td>
                    <td class="num">{{ p.answers }}</td>
                    <td class="num">{{ p.students }}</td>
                    <td v-for="s in series" :key="s.id" class="num">{{ frac(p.topics[s.id]) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>

        <div class="panel">
          <h3>By topic</h3>
          <p class="small muted">First attempts are a student's first ever answer to a question; retries are later answers (often after seeing the explanation). Answers awaiting marking are not counted in accuracy. Response time is context, not a measure of ability.</p>
          <div class="table-wrap">
            <table class="dash-table">
              <thead><tr><th v-for="(h, i) in ['Topic', 'First-attempt accuracy', '', 'Retry accuracy', 'Awaiting marking', 'Students', 'Median / p75 time', 'Timeouts']" :key="i">{{ h }}</th></tr></thead>
              <tbody>
                <tr v-for="t in a.byTopic" :key="t.name">
                  <td class="label">{{ t.name }}</td>
                  <td class="num">{{ frac(t.first) }}</td>
                  <td style="width: 120px"><Meter :value="t.first.accuracy" /></td>
                  <td class="num">{{ frac(t.retry) }}</td>
                  <td class="num">{{ t.awaitingMarking }}</td>
                  <td class="num">{{ t.students }}</td>
                  <td class="num">{{ `${secs(t.medianMs)} / ${secs(t.p75Ms)}` }}</td>
                  <td class="num">{{ t.timeouts }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <h3>Commonly missed questions</h3>
          <p class="small muted">Lowest first-attempt accuracy, questions with at least {{ a.minN }} confirmed first attempts. Low accuracy is a reason to look closer: it can mean a difficult concept, an ambiguous question, or a gap in coverage.</p>
          <template v-if="a.commonlyMissed.length">
            <div v-for="(q, i) in a.commonlyMissed" :key="i" style="padding: 10px 0; border-bottom: 1px solid var(--line)">
              <div class="row">
                <div class="grow" style="font-weight: 600">{{ q.stem }}</div>
                <span class="badge plain">{{ q.type }}</span>
                <span :class="'badge ' + q.status">{{ q.status }}</span>
              </div>
              <div class="small muted">{{ `${q.topic} · first attempts ${frac(q.first)} · retries ${frac(q.retry)} · versions answered: ${q.versionsAttempted.map((v) => 'v' + v).join(', ')}` }}</div>
              <div v-if="q.topWrong" class="small">Most chosen wrong answer: <b>"{{ q.topWrong.option }}"</b> ({{ q.topWrong.count }}x)</div>
              <div v-if="q.openReports" class="small" style="color: var(--bad)">{{ q.openReports }} open student report(s) - see Question bank → Reported</div>
            </div>
          </template>
          <p v-else class="muted small">Not enough data yet.</p>
        </div>

        <div class="panel">
          <h3>Time per question</h3>
          <p class="small muted">Average time students spent on each question ({{ periodName }}), from the question appearing to the answer arriving, measured by the server. Each student counts once, so one student answering many times can't skew it. It includes reading time and helps spot confusing or long questions; it is not a measure of ability. Timed-out answers are left out.</p>
          <div v-if="a.timeByQuestion.length" class="table-wrap">
            <table class="dash-table">
              <thead><tr><th>Question</th><th>Topic</th><th>Students</th><th>Answers</th><th>Average time</th><th>Median</th></tr></thead>
              <tbody>
                <tr v-for="q in times" :key="q.questionId">
                  <td class="q">{{ q.stem }} <span class="badge plain">{{ q.type }}</span></td>
                  <td class="label">{{ q.topic }}</td>
                  <td class="num">{{ q.students }}</td>
                  <td class="num">{{ q.n }}</td>
                  <td class="num"><b>{{ secs(q.meanMs) }}</b></td>
                  <td class="num">{{ secs(q.medianMs) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="muted small">No answers in this period.</p>
          <button v-if="a.timeByQuestion.length > TOP" class="btn small" style="margin-top: 8px" @click="showAllTimes = !showAllTimes">
            {{ showAllTimes ? `Show the ${TOP} slowest only` : `Show all ${a.timeByQuestion.length} questions` }}
          </button>
        </div>

        <div class="panel">
          <h3>Question tags</h3>
          <p class="small muted">Every question in the bank (except rejected ones) should have a topic, a learning outcome from that topic, and a difficulty. Analytics and adaptive practice rely on these tags.</p>
          <div :class="a.tags.issues.length ? 'note warn' : 'note good'">
            {{ a.tags.issues.length ? '⚠' : '✓' }} {{ a.tags.complete }} of {{ a.tags.total }} questions are fully tagged{{ a.tags.issues.length ? '.' : ' - nothing to fix.' }}
          </div>
          <div v-if="a.tags.issues.length" class="table-wrap">
            <table class="dash-table">
              <thead><tr><th>Question</th><th>Status</th><th>Missing or invalid</th></tr></thead>
              <tbody>
                <tr v-for="q in a.tags.issues" :key="q.questionId">
                  <td class="q">{{ q.stem }}</td>
                  <td><span :class="'badge ' + q.status">{{ q.status }}</span></td>
                  <td>{{ q.missing.join(', ') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="a.points" class="panel">
          <div class="row">
            <h3 class="grow">Participation points</h3>
            <AsyncButton class="btn small" :run="csv">Download CSV</AsyncButton>
          </div>
          <p class="small muted">One point per completed practice session of 5+ questions (max 3 per week), regardless of score. Turned on in Settings.</p>
          <table>
            <tbody>
              <tr v-for="(p, i) in a.points" :key="i"><td>{{ p.name }}</td><td>{{ p.points }}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <p class="small muted">These are practice indicators to support teaching judgement. They are not grades, and the platform does not label individual students.</p>
    </template>
  </template>
</template>
