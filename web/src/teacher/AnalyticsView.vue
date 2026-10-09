<script setup>
// ============================================================
// Analytics dashboard (+ free-response marking, participation)
// ------------------------------------------------------------
// One filter row (class + period) scopes everything below it. While new
// numbers load, the old ones stay on screen (dimmed when you changed the
// period), so the layout never jumps. The page refreshes itself every
// 30 seconds while it is visible, so it keeps up with a class that is
// practising right now. The period and auto-refresh choices are
// remembered in this browser. Nothing on this page names individual
// students (opt-in participation points aside).
// ============================================================
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { S, api, rerender, download, setTab, periodQuery, dashPrefs, saveDashPrefs } from '../api.js';
import { pct, secs } from '../ui.js';
import Heading from '../components/Heading.vue';
import Meter from '../components/Meter.vue';
import AsyncButton from '../components/AsyncButton.vue';
import Pager from '../components/Pager.vue';
import { usePaged } from '../components/paged.js';
import ClassPicker from './ClassPicker.vue';
import LineChart from './charts/LineChart.vue';
import ColumnChart from './charts/ColumnChart.vue';
import ScatterChart from './charts/ScatterChart.vue';
import QuestionInsight from './QuestionInsight.vue';
import WhenPanel from './dashboard/WhenPanel.vue';
import ContextsPanel from './dashboard/ContextsPanel.vue';
import QualityPanel from './dashboard/QualityPanel.vue';
import ComparePanel from './dashboard/ComparePanel.vue';
import { loadCourses } from './courses.js';
import { downloadCsv, pctCell, secCell } from './csv.js';

const PERIODS = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['all', 'All time'], ['custom', 'Custom dates']];
const REFRESH_MS = 30000;
const MAX_COMBINED = 4; // more topics than this: one small chart per topic

const error = ref('');
const loaded = ref(false);
const refetching = ref(false);
const courses = ref([]);
const classes = ref([]);
const courseOfClass = new Map(); // so links into other tabs open the right course
const a = ref(null);
const marking = ref([]);
const updatedAt = ref(null);
const stamp = ref(0); // bumps on every load, so side panels reload too
const auto = ref(dashPrefs().auto !== false);
const insight = ref(null);
let seq = 0;

// quiet = background refresh: don't dim the page
async function load({ quiet = false } = {}) {
  const mine = ++seq; // a slower, older request must not overwrite a newer one
  if (!quiet) refetching.value = true;
  try {
    const [analytics, queue] = await Promise.all([
      api('GET', `/api/teacher/classes/${S.classId}/analytics?${periodQuery()}`),
      api('GET', `/api/teacher/classes/${S.classId}/marking`),
    ]);
    if (mine !== seq) return;
    a.value = analytics;
    marking.value = queue;
    error.value = '';
    updatedAt.value = Date.now();
    stamp.value++;
  } catch (err) {
    if (mine === seq && !quiet) error.value = err.message;
  } finally {
    if (mine === seq) refetching.value = false;
  }
}

// auto-refresh: only while this browser tab is visible
let timer = null;
onMounted(async () => {
  try {
    courses.value = await loadCourses();
    classes.value = courses.value.flatMap((c) => c.classes);
    for (const c of courses.value) for (const cl of c.classes) courseOfClass.set(cl.id, c.id);
    if (classes.value.length) {
      if (!S.classId || !classes.value.some((c) => c.id === S.classId)) S.classId = classes.value[0].id;
      if (S.range === 'custom') Object.assign(custom.value, { from: S.from, to: S.to });
      await load();
    }
    loaded.value = true;
  } catch (err) {
    error.value = err.message;
  }
  timer = setInterval(() => {
    if (auto.value && a.value && document.visibilityState === 'visible' && Date.now() - updatedAt.value >= REFRESH_MS) load({ quiet: true });
  }, 5000);
});
onUnmounted(() => clearInterval(timer));
const setAuto = () => saveDashPrefs({ auto: auto.value });

// ---- the period: presets load at once; custom dates wait for "Apply"
const isoDay = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const custom = ref({ from: isoDay(new Date(Date.now() - 13 * 86400000)), to: isoDay(new Date()) });
const choice = ref(S.range);
function pickPeriod() {
  if (choice.value === 'custom') return; // shown below; nothing loads until applied
  S.range = choice.value;
  saveDashPrefs({ range: S.range });
  load();
}
function applyCustom() {
  if (!custom.value.from || !custom.value.to) return (error.value = 'Pick a start and end date.');
  Object.assign(S, { range: 'custom', from: custom.value.from, to: custom.value.to });
  saveDashPrefs({ range: 'custom', from: S.from, to: S.to });
  load();
}
const fmtDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const period = computed(() => {
  if (!a.value) return '';
  if (a.value.range === 'custom') return `${fmtDate(a.value.from)} to ${fmtDate(a.value.to)}`;
  return PERIODS.find(([id]) => id === a.value.range)?.[1].toLowerCase() || '';
});

const frac = (r) => (r && r.n ? `${pct(r.accuracy)} (${r.correct}/${r.n})` : '-');
const mark = (m, correct) => async () => {
  await api('POST', `/api/teacher/attempts/${m.attemptId}/mark`, { correct });
  rerender();
};
const participationCsv = () => download(`/api/teacher/classes/${S.classId}/participation.csv`, `participation-${S.classId}.csv`);
const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const printedAt = computed(() => new Date(updatedAt.value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
const className = computed(() => classes.value.find((c) => c.id === S.classId)?.name || '');
const courseId = computed(() => courseOfClass.get(S.classId));
const sameCourseClasses = computed(() => courses.value.find((c) => c.id === courseId.value)?.classes.length || 0);
const printReport = () => window.print();

// ---- navigation from the dashboard
const openQuestion = (id) => insight.value.open(id);
function toBank({ focus = null, filter = null } = {}) {
  S.courseId = courseId.value || S.courseId;
  if (filter) S.qFilter = filter;
  S.focusQuestionId = focus;
  setTab('review');
}
const openInBank = (id) => toBank({ focus: id });
function draftFor(topicId, outcomeId) {
  S.courseId = courseId.value || S.courseId;
  S.draftTarget = { topicId, outcomeId };
  setTab('generate');
}
function goTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.querySelector('h3')?.focus({ preventScroll: true });
}
const sections = computed(() => [
  ['dash-overview', 'Overview'],
  ['dash-trends', 'Trends'],
  ['dash-topics', 'Topics'],
  ['dash-time', 'Questions'],
  ['dash-activity', 'Activity'],
  ['dash-quality', 'Quality'],
  ...(sameCourseClasses.value >= 2 ? [['dash-compare', 'Compare classes']] : []),
]);

// ---- "needs attention": the few things worth acting on, each linked
const attention = computed(() => {
  if (!a.value) return [];
  const out = [];
  const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
  if (marking.value.length) out.push({ icon: '✎', text: `${plural(marking.value.length, 'answer')} waiting for your mark`, go: () => goTo('dash-marking') });
  if (a.value.tags.issues.length) out.push({ icon: '⚠', text: `${plural(a.value.tags.issues.length, 'question')} missing tags`, go: () => goTo('dash-quality') });
  if (a.value.openReports) out.push({ icon: '⚑', text: `${plural(a.value.openReports, 'open student report')}`, go: () => toBank({ filter: 'reported' }) });
  const confusing = a.value.time.questions.filter((q) => q.confusing).length;
  if (confusing) out.push({ icon: '⚠', text: `${plural(confusing, 'question')} possibly confusing (slow and mostly wrong)`, go: () => goTo('dash-time') });
  if (a.value.quality.difficulty.length) out.push({ icon: '⚖', text: `${plural(a.value.quality.difficulty.length, 'difficulty tag')} not matching results`, go: () => goTo('dash-quality') });
  const weakest = a.value.byTopic.filter((t) => t.all.n >= a.value.trend.lowN).sort((x, y) => x.all.accuracy - y.all.accuracy)[0];
  if (weakest && weakest.all.accuracy < 0.7) out.push({ icon: '↓', text: `Weakest topic: ${weakest.name}, ${pct(weakest.all.accuracy)} correct (${weakest.all.n} answers)`, go: () => goTo('dash-topics') });
  const uncovered = a.value.byTopic.flatMap((t) => t.outcomes).filter((o) => !o.published).length;
  if (uncovered) out.push({ icon: '○', text: `${plural(uncovered, 'learning outcome')} with no published questions`, go: () => goTo('dash-topics') });
  const idle = a.value.participation.enrolled - a.value.participation.active7d;
  if (idle > 0) out.push({ icon: '○', text: `${idle} of ${a.value.participation.enrolled} students haven't practised in the last 7 days` });
  return out;
});

// ---- tiles: change vs the previous period of the same length
function delta(key) {
  const prev = a.value.previous;
  if (!prev) return null;
  const d = a.value.participation[key] - prev[key];
  const vs = `vs previous ${a.value.days} days`;
  if (d === 0) return { cls: 'flat', text: `no change ${vs}` };
  return d > 0 ? { cls: 'up', text: `▲ ${d} ${vs}` } : { cls: 'down', text: `▼ ${-d} ${vs}` };
}

// ---- trends: buckets are days (up to 14 days) or Monday weeks, class time zone
const bucketLabel = (start, bucket) => {
  const d = new Date(start).toLocaleDateString([], { day: 'numeric', month: 'short', timeZone: a.value.timezone });
  return bucket === 'week' ? `w/c ${d}` : d;
};
// colour follows the topic (its order in the course); past 8 we never invent colours
const series = computed(() => a.value.trend.topics.map((t, i) => ({ id: t.id, name: t.name, slot: (i % 8) + 1 })));
const combined = computed(() => series.value.length <= MAX_COMBINED);
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

// ---- by topic: expandable learning outcomes
const openTopics = ref(new Set());
function toggleTopic(id) {
  const next = new Set(openTopics.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  openTopics.value = next;
}

// ---- long lists are paged (the charts and CSV exports still use everything)
const markingPages = usePaged(() => marking.value, 5);
const timePages = usePaged(() => a.value?.time.questions, 10);
const missedPages = usePaged(() => a.value?.commonlyMissed, 5);

// ---- time vs accuracy
const scatter = computed(() => a.value.time.questions.map((q) => ({ id: q.questionId, label: q.stem, x: q.meanMs, y: q.accuracy.accuracy, n: q.n, flagged: q.confusing })));

// ---- CSV exports (no student names in any of these)
const file = (what) => `${what}-${S.classId}-${a.value.range === 'custom' ? `${a.value.from}_${a.value.to}` : a.value.range}.csv`;
function topicsCsv() {
  const rows = [['topic', 'learning_outcome', 'first_attempt_accuracy_pct', 'first_attempts', 'retry_accuracy_pct', 'retries', 'awaiting_marking', 'published_questions', 'students', 'median_time_s', 'timeouts']];
  for (const t of a.value.byTopic) {
    rows.push([t.name, '(all)', pctCell(t.first.accuracy), t.first.n, pctCell(t.retry.accuracy), t.retry.n, t.awaitingMarking, t.outcomes.reduce((n, o) => n + o.published, 0), t.students, secCell(t.medianMs), t.timeouts]);
    for (const o of t.outcomes) rows.push([t.name, o.text, pctCell(o.first.accuracy), o.first.n, pctCell(o.retry.accuracy), o.retry.n, o.awaitingMarking, o.published, '', '', '']);
  }
  downloadCsv(file('topics'), rows);
}
function timeCsv() {
  const rows = [['question', 'type', 'topic', 'students', 'answers', 'average_time_s', 'median_time_s', 'accuracy_pct', 'confirmed_answers', 'possibly_confusing']];
  for (const q of a.value.time.questions) rows.push([q.stem, q.type, q.topic, q.students, q.n, secCell(q.meanMs), secCell(q.medianMs), pctCell(q.accuracy.accuracy), q.accuracy.n, q.confusing ? 'yes' : 'no']);
  downloadCsv(file('question-times'), rows);
}
function missedCsv() {
  const rows = [['question', 'type', 'topic', 'status', 'first_attempt_accuracy_pct', 'first_attempts', 'retry_accuracy_pct', 'retries', 'most_chosen_wrong_answer', 'times_chosen', 'open_reports']];
  for (const q of a.value.commonlyMissed) rows.push([q.stem, q.type, q.topic, q.status, pctCell(q.first.accuracy), q.first.n, pctCell(q.retry.accuracy), q.retry.n, q.topWrong?.option || '', q.topWrong?.count || '', q.openReports]);
  downloadCsv(file('commonly-missed'), rows);
}
</script>

<template>
  <div v-if="error && !a" class="note bad">{{ error }}</div>
  <div v-else-if="!loaded" class="dash" aria-busy="true">
    <p class="muted">Loading analytics…</p>
    <div class="tiles" aria-hidden="true"><div v-for="i in 4" :key="i" class="tile skeleton"></div></div>
    <div v-for="i in 2" :key="i" class="panel skeleton tall" aria-hidden="true"></div>
  </div>
  <template v-else>
    <p v-if="!classes.length">You have no classes.</p>
    <div v-else-if="a" class="dash">
      <!-- shown on paper only -->
      <div class="print-only">
        <h1 style="font-size: 20px; margin: 0">QuizQuest class report</h1>
        <p>{{ className }} · {{ period }} · {{ a.timezone.replace('_', ' ') }} time · generated {{ printedAt }}</p>
      </div>

      <section class="dash-hero">
        <Heading title="Analytics">
          <ClassPicker :classes="classes" />
          <select v-model="choice" style="width: auto" aria-label="Period" @change="pickPeriod">
            <option v-for="[id, name] in PERIODS" :key="id" :value="id">{{ name }}</option>
          </select>
          <button class="btn no-print" @click="printReport">Print report</button>
        </Heading>
        <form v-if="choice === 'custom'" class="row custom-dates no-print" @submit.prevent="applyCustom">
          <label class="small" style="margin: 0">From <input v-model="custom.from" type="date" required :max="custom.to" /></label>
          <label class="small" style="margin: 0">To <input v-model="custom.to" type="date" required :min="custom.from" /></label>
          <button class="btn small primary" type="submit">Apply</button>
        </form>
        <div class="row small muted no-print" style="margin: -6px 0 10px">
          <span class="grow">Updated {{ clock(updatedAt) }} · days and weeks in {{ a.timezone.replace('_', ' ') }} time (change in Settings)</span>
          <label style="margin: 0; font-weight: 400; color: inherit"><input v-model="auto" type="checkbox" @change="setAuto" /> Auto-refresh every 30 seconds</label>
        </div>
        <nav class="dash-nav no-print" aria-label="Dashboard sections">
          <button v-for="[id, label] in sections" :key="id" class="btn small" @click="goTo(id)">{{ label }}</button>
        </nav>
      </section>
      <div v-if="error" class="note bad">{{ error }}</div>

      <div class="dash-body" :class="{ refetching }">
        <!-- a brand-new class, or a quiet period -->
        <div v-if="!a.participation.allTimeAttempts" class="panel note-panel">
          <h3>No answers yet</h3>
          <p class="small">Nothing to chart until students practise. To get started:</p>
          <ol class="small">
            <li>Check the <button class="linklike" @click="toBank({ filter: 'published' })">Question bank</button> has published questions for each topic ({{ a.byTopic.flatMap((t) => t.outcomes).filter((o) => !o.published).length }} learning outcomes have none yet).</li>
            <li>Ask students to sign in and start a practice session, or meet in the World.</li>
            <li>This page then updates by itself every 30 seconds.</li>
          </ol>
        </div>
        <div v-else-if="!a.participation.attempts" class="note warn no-print">
          No answers in {{ period }}.
          <button class="linklike" @click="choice = 'all'; pickPeriod()">Show all time</button>
        </div>

        <!-- needs attention -->
        <div id="dash-overview" class="panel attention">
          <h3 tabindex="-1">Needs attention</h3>
          <ul v-if="attention.length">
            <li v-for="(item, i) in attention" :key="i">
              <span class="icon" aria-hidden="true">{{ item.icon }}</span>
              <button v-if="item.go" class="linklike" @click="item.go">{{ item.text }}</button>
              <span v-else>{{ item.text }}</span>
            </li>
          </ul>
          <p v-else class="small" style="margin: 0">✓ Nothing needs attention right now.</p>
        </div>

        <div class="tiles">
          <div class="tile">
            <div class="v">{{ `${a.participation.activeEver} / ${a.participation.enrolled}` }}</div><div class="l">students who practised ({{ period }})</div>
            <div v-if="delta('activeEver')" :class="'delta ' + delta('activeEver').cls">{{ delta('activeEver').text }}</div>
          </div>
          <div class="tile"><div class="v">{{ `${a.participation.active7d} / ${a.participation.enrolled}` }}</div><div class="l">active in the last 7 days</div></div>
          <div class="tile">
            <div class="v">{{ a.participation.sessionsCompleted }}</div><div class="l">sessions completed</div>
            <div v-if="delta('sessionsCompleted')" :class="'delta ' + delta('sessionsCompleted').cls">{{ delta('sessionsCompleted').text }}</div>
          </div>
          <div class="tile">
            <div class="v">{{ a.participation.attempts }}</div><div class="l">answers submitted ({{ a.participation.worldAttempts }} in World)</div>
            <div v-if="delta('attempts')" :class="'delta ' + delta('attempts').cls">{{ delta('attempts').text }}</div>
          </div>
          <div v-if="a.participation.awaitingMarking" class="tile"><div class="v">{{ a.participation.awaitingMarking }}</div><div class="l">answers awaiting marking (left out of accuracy)</div></div>
        </div>

        <div v-if="marking.length" id="dash-marking" class="panel no-print" style="border-color: var(--warn)">
          <h3 tabindex="-1">Answers to mark ({{ marking.length }})</h3>
          <p class="small muted">Free-response answers get a provisional automatic mark. Confirm or change it; marking an answer correct pays the usual first-correct coins. Answers are shown without student names.</p>
          <div :key="markingPages.page" class="page-in">
            <div v-for="m in markingPages.items" :key="m.attemptId" class="list-item">
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
          <Pager :paged="markingPages" label="Answers to mark pages" noun="answers" />
        </div>

        <div id="dash-trends" class="panel">
          <h3 tabindex="-1">Trends</h3>
          <p class="small muted">Per {{ per }}, {{ a.trend.capped ? `the last ${a.trend.maxWeeks} weeks (tiles and tables below cover all time)` : period }}. Accuracy counts every confirmed answer (first attempts and retries); hollow points rest on fewer than {{ a.trend.lowN }} answers, so read them with care.</p>
          <div class="charts">
            <div v-if="combined">
              <div class="chart-title">Accuracy by topic</div>
              <LineChart :series="series" :rows="accuracyRows" :low-n="a.trend.lowN" :label="`Accuracy by topic per ${per}`" />
            </div>
            <div>
              <div class="chart-title">Answers submitted</div>
              <ColumnChart :rows="activityRows" unit="answers" :label="`Answers submitted per ${per}`" />
            </div>
          </div>
          <template v-if="!combined">
            <div class="chart-title" style="margin-top: 14px">Accuracy by topic <span class="muted">(one chart per topic, same scale)</span></div>
            <div class="multiples">
              <div v-for="s in series" :key="s.id">
                <LineChart :series="[{ ...s, slot: 1 }]" :rows="accuracyRows" :low-n="a.trend.lowN" :height="150" :label="`${s.name}: accuracy per ${per}`" />
              </div>
            </div>
          </template>
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

        <div id="dash-topics" class="panel">
          <div class="row">
            <h3 class="grow" tabindex="-1">By topic</h3>
            <button class="btn small no-print" @click="topicsCsv">Download CSV</button>
          </div>
          <p class="small muted">First attempts are a student's first ever answer to a question; retries are later answers (often after seeing the explanation). Answers awaiting marking are not counted in accuracy. Open a topic to see its learning outcomes and how many published questions cover each.</p>
          <div class="table-wrap">
            <table class="dash-table">
              <thead><tr><th></th><th v-for="(h, i) in ['Topic', 'First-attempt accuracy', '', 'Retry accuracy', 'Awaiting marking', 'Students', 'Median / p75 time', 'Timeouts']" :key="i">{{ h }}</th></tr></thead>
              <tbody>
                <template v-for="t in a.byTopic" :key="t.topicId">
                  <tr>
                    <td style="width: 1%">
                      <button class="btn small" :aria-expanded="openTopics.has(t.topicId) ? 'true' : 'false'" :aria-label="`${openTopics.has(t.topicId) ? 'Hide' : 'Show'} learning outcomes for ${t.name}`" @click="toggleTopic(t.topicId)"><span class="chev" aria-hidden="true">▸</span></button>
                    </td>
                    <td class="label"><b>{{ t.name }}</b></td>
                    <td class="num">{{ frac(t.first) }}</td>
                    <td style="width: 120px"><Meter :value="t.first.accuracy" /></td>
                    <td class="num">{{ frac(t.retry) }}</td>
                    <td class="num">{{ t.awaitingMarking }}</td>
                    <td class="num">{{ t.students }}</td>
                    <td class="num">{{ `${secs(t.medianMs)} / ${secs(t.p75Ms)}` }}</td>
                    <td class="num">{{ t.timeouts }}</td>
                  </tr>
                  <tr v-for="o in openTopics.has(t.topicId) ? t.outcomes : []" :key="o.outcomeId" class="subrow subrow-in">
                    <td></td>
                    <td class="label small">{{ o.text }}</td>
                    <td class="num small">{{ frac(o.first) }}</td>
                    <td><Meter :value="o.first.accuracy" /></td>
                    <td class="num small">{{ frac(o.retry) }}</td>
                    <td class="num small">{{ o.awaitingMarking }}</td>
                    <td colspan="3" class="small">
                      <span v-if="o.published">{{ o.published }} published question{{ o.published === 1 ? '' : 's' }}</span>
                      <template v-else>
                        <span class="badge draft">⚠ no published questions</span>
                        <button class="btn small no-print" style="margin-left: 6px" @click="draftFor(t.topicId, o.outcomeId)">Draft questions</button>
                      </template>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <div id="dash-time" class="panel">
          <div class="row">
            <h3 class="grow" tabindex="-1">Time and accuracy per question</h3>
            <button v-if="a.time.questions.length" class="btn small no-print" @click="timeCsv">Download CSV</button>
          </div>
          <p class="small muted">Average time students spent on each question ({{ period }}), from the question appearing to the answer arriving, measured by the server. Each student counts once, and timed-out answers are left out; times include reading and are not a measure of ability. A question that is both <b>slow</b> (slower than three quarters of questions) and <b>mostly wrong</b> (under {{ pct(a.time.maxAccuracy) }}, at least {{ a.time.minN }} answers) is flagged as possibly confusing: worth rereading. Slowest first. Click a dot or a question for details.</p>
          <template v-if="a.time.questions.length">
            <ScatterChart :points="scatter" :slow-ms="a.time.slowMs" :max-accuracy="a.time.maxAccuracy" :low-n="a.time.minN" label="Average time against accuracy, one dot per question" @open="openQuestion" />
            <div class="table-wrap" style="margin-top: 12px">
              <table class="dash-table">
                <thead><tr><th>Question</th><th>Topic</th><th>Students</th><th>Answers</th><th>Average time</th><th>Median</th><th>Accuracy</th></tr></thead>
                <tbody :key="timePages.page" class="page-in">
                  <tr v-for="q in timePages.items" :key="q.questionId">
                    <td class="q">
                      <button class="linklike" @click="openQuestion(q.questionId)">{{ q.stem }}</button>
                      <span class="badge plain">{{ q.type }}</span>
                      <span v-if="q.confusing" class="badge draft">⚠ possibly confusing</span>
                    </td>
                    <td class="label">{{ q.topic }}</td>
                    <td class="num">{{ q.students }}</td>
                    <td class="num">{{ q.n }}</td>
                    <td class="num"><b>{{ secs(q.meanMs) }}</b></td>
                    <td class="num">{{ secs(q.medianMs) }}</td>
                    <td class="num">{{ frac(q.accuracy) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Pager :paged="timePages" label="Time and accuracy pages" noun="questions" />
          </template>
          <p v-else class="muted small">No answers in this period.</p>
        </div>

        <div class="panel">
          <div class="row">
            <h3 class="grow">Commonly missed questions</h3>
            <button v-if="a.commonlyMissed.length" class="btn small no-print" @click="missedCsv">Download CSV</button>
          </div>
          <p class="small muted">Every question with at least {{ a.minN }} confirmed first attempts, lowest first-attempt accuracy first. Low accuracy is a reason to look closer: it can mean a difficult concept, an ambiguous question, or a gap in coverage. Click a question for its answer breakdown.</p>
          <template v-if="a.commonlyMissed.length">
            <div :key="missedPages.page" class="page-in">
              <div v-for="q in missedPages.items" :key="q.questionId" class="list-item">
                <div class="row">
                  <button class="linklike grow missed-title" style="font-weight: 600; text-align: left" @click="openQuestion(q.questionId)">{{ q.stem }}</button>
                  <span class="badge plain">{{ q.type }}</span>
                  <span :class="'badge ' + q.status">{{ q.status }}</span>
                </div>
                <div class="small muted">{{ `${q.topic} · first attempts ${frac(q.first)} · retries ${frac(q.retry)} · versions answered: ${q.versionsAttempted.map((v) => 'v' + v).join(', ')}` }}</div>
                <div v-if="q.topWrong" class="small">Most chosen wrong answer: <b>"{{ q.topWrong.option }}"</b> ({{ q.topWrong.count }}x)</div>
                <div v-if="q.openReports" class="small" style="color: var(--bad)">⚑ {{ q.openReports }} open student report(s) - see Question bank → Reported</div>
              </div>
            </div>
            <Pager :paged="missedPages" label="Commonly missed questions pages" noun="questions" />
          </template>
          <p v-else class="muted small">Not enough data yet.</p>
        </div>

        <div id="dash-activity" class="panel">
          <h3 tabindex="-1">When students practise</h3>
          <WhenPanel :when="a.when" :timezone="a.timezone" />
          <h3 style="margin-top: 18px">Practice vs World</h3>
          <ContextsPanel :contexts="a.contexts" />
        </div>

        <div id="dash-quality" class="panel">
          <h3 tabindex="-1">Question quality</h3>
          <QualityPanel :tags="a.tags" :quality="a.quality" @open-question="openQuestion" @open-in-bank="openInBank" />
        </div>

        <div v-if="sameCourseClasses >= 2" id="dash-compare" class="panel">
          <h3 tabindex="-1">Compare your classes</h3>
          <ComparePanel :course-id="courseId" :stamp="stamp" />
        </div>

        <div v-if="a.points" class="panel">
          <div class="row">
            <h3 class="grow">Participation points</h3>
            <AsyncButton class="btn small no-print" :run="participationCsv">Download CSV</AsyncButton>
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
      <QuestionInsight ref="insight" @open-in-bank="openInBank" />
    </div>
  </template>
</template>
