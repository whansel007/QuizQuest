<script setup>
// Each class gets its own progress and reports. Switching classes remounts the
// view through ClassPicker; late responses must not update an abandoned view.
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { S, api, setTab } from '../api.js';
import { pct, when } from '../ui.js';
import { loadHome } from './home.js';
import categories from '../../../src/quiz/report-categories.json';
import Heading from '../components/Heading.vue';
import Meter from '../components/Meter.vue';
import Pager from '../components/Pager.vue';
import { usePaged } from '../components/paged.js';
import ClassPicker from './ClassPicker.vue';

const progress = ref(null);
const reports = ref([]);
const error = ref('');
const busy = ref(false);
const loaded = ref(false);
const updatedAt = ref(null);
const filter = ref('all');
let alive = true;
const shown = usePaged(() => reports.value.filter((r) => filter.value === 'all' || (filter.value === 'resolved') === r.resolved), 5);
watch(filter, () => shown.go(1));
const focus = computed(() => progress.value?.topics.filter((t) => t.status === 'focus' && t.bank) || []);
const categoryLabel = (value) => categories.find((c) => c.value === value)?.label || 'Other problem';
const statusLabel = (topic) => !topic.n ? 'Not practised yet' : topic.status === 'building' ? 'Building a practice history' : topic.status === 'focus' ? 'Worth practising next' : 'Keep practising';
// one visual family per status; the label always says it in words too
const statusClass = (topic) => !topic.n ? 'is-idle' : topic.status === 'building' ? 'is-building' : topic.status === 'focus' ? 'is-focus' : 'is-steady';
// the overall score ring is the same counted accuracy, drawn
const RING = 2 * Math.PI * 52;

async function refresh() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await loadHome();
    if (!alive) return;
    if (S.classId) {
      const [p, r] = await Promise.all([
        api('GET', `/api/student/classes/${S.classId}/progress`),
        api('GET', `/api/student/classes/${S.classId}/reports`),
      ]);
      if (!alive) return;
      progress.value = p;
      reports.value = r;
      updatedAt.value = Date.now();
    }
    loaded.value = true;
  } catch (err) {
    if (alive) error.value = err.message;
  } finally {
    if (alive) busy.value = false;
  }
}
onMounted(refresh);
onUnmounted(() => { alive = false; });
</script>

<template>
  <Heading title="My Progress">
    <ClassPicker v-if="loaded" />
    <button class="btn small" :disabled="busy" @click="refresh">{{ busy ? 'Refreshing…' : 'Refresh progress' }}</button>
  </Heading>
  <div v-if="error" class="note bad" role="alert">{{ error }}{{ progress ? ' Showing the last loaded data.' : '' }}</div>
  <p v-if="!loaded && busy" role="status">Loading your progress…</p>
  <p v-else-if="loaded && !S.classId">Join a class to start tracking your practice.</p>
  <template v-else-if="progress">
    <p class="small muted">Updated {{ when(updatedAt) }}. Refresh to check for new marks and professor responses.</p>

    <!-- 1. overall: the counted score first -->
    <section class="pg-hero" aria-labelledby="pg-indicator">
      <div class="pg-score">
        <template v-if="progress.indicator.n">
          <svg class="pg-ring" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="52" class="pg-ring-track" />
            <circle cx="60" cy="60" r="52" class="pg-ring-fill" :stroke-dasharray="`${RING * progress.indicator.accuracy} ${RING}`" />
          </svg>
          <span class="pg-ring-pct">{{ pct(progress.indicator.accuracy) }}</span>
        </template>
        <span v-else class="pg-ring-empty" aria-hidden="true">–</span>
      </div>
      <div class="pg-hero-body">
        <h3 id="pg-indicator">Your practice indicator</h3>
        <p v-if="!progress.indicator.n" class="progress-score">No confirmed answers yet. Start a practice session to build your history.</p>
        <p v-else class="progress-score"><b>{{ progress.indicator.correct }} / {{ progress.indicator.n }}</b> counted questions correct ({{ pct(progress.indicator.accuracy) }} across the topic windows below).</p>
        <p class="pg-explain">Your latest confirmed answer to each of the most recent {{ progress.window }} different questions per topic counts. Practice and World answers are included. Retries replace earlier answers. This is a practice guide, not a grade or a measure of mastery.</p>
        <p v-if="progress.awaitingMarking" class="pg-note">{{ progress.awaitingMarking }} written answer(s) awaiting marking are excluded from accuracy. Confirmed earlier answers to those questions may still count.</p>
        <div v-if="focus.length" class="pg-focus progress-focus-note">
          <span class="pg-focus-label">Worth practising next:</span>
          <b v-for="t in focus" :key="t.topicId" class="pg-chip">{{ t.name }}</b>
          <span class="pg-focus-why">These topics have at least {{ progress.minPerTopic }} counted questions and accuracy below {{ pct(progress.weakBelow) }}.</span>
        </div>
        <p v-else class="pg-explain">Keep exploring all topics. Topics need at least {{ progress.minPerTopic }} different confirmed questions before we suggest extra practice.</p>
        <button class="btn primary" @click="setTab('practice')">Go to practice</button>
      </div>
    </section>

    <!-- 2. topics: status, accuracy, sample size and question bank -->
    <section class="pg-section" aria-labelledby="pg-topics">
      <h3 id="pg-topics" class="pg-heading">Topics</h3>
      <div class="pg-topics progress-topics" aria-label="Progress by topic">
        <article v-for="topic in progress.topics" :key="topic.topicId" class="pg-topic" :class="statusClass(topic)">
          <header class="pg-topic-head">
            <h4>{{ topic.name }}</h4>
            <span class="pg-status">{{ statusLabel(topic) }}</span>
          </header>
          <template v-if="topic.n">
            <div class="pg-topic-score"><span class="pg-pct">{{ pct(topic.accuracy) }}</span><span>{{ topic.correct }} / {{ topic.n }} counted questions correct</span></div>
            <Meter :value="topic.accuracy" />
          </template>
          <p v-else class="small muted">No confirmed answers for this topic.</p>
          <p class="pg-bank">{{ topic.bank }} published question(s) available{{ !topic.bank ? ' — ask your professor about more practice material.' : '.' }}</p>
          <p v-if="topic.awaitingMarking" class="small muted">{{ topic.awaitingMarking }} answer(s) awaiting marking.</p>
        </article>
      </div>
    </section>

    <!-- 3 + 4. recent sessions, then question reports -->
    <div class="pg-columns">
      <section class="panel progress-sessions" aria-labelledby="pg-sessions">
        <h3 id="pg-sessions" class="pg-heading">Recent sessions</h3>
        <p v-if="!progress.sessions.length" class="muted">No completed practice sessions yet.</p>
        <div v-else class="progress-table">
          <table>
            <caption class="small muted">Your five most recently completed practice sessions. Pending marks are excluded from confirmed scores.</caption>
            <thead><tr><th scope="col">Completed</th><th scope="col">Confirmed score</th><th scope="col">Awaiting marking</th></tr></thead>
            <tbody><tr v-for="session in progress.sessions" :key="session.id">
              <td>{{ when(session.at) }}</td><td>{{ session.correct }} / {{ session.marked }} marked · {{ session.total }} answered</td><td>{{ session.awaitingMarking }}</td>
            </tr></tbody>
          </table>
        </div>
      </section>
      <section class="panel progress-reports" aria-labelledby="pg-reports">
        <h3 id="pg-reports" class="pg-heading">My question reports</h3>
        <p class="small muted">Report a problem after answering a question in Practice or the World. Professors see your reason without your identity. Resolving a report does not automatically change your marks.</p>
        <label for="report-status">Report status</label>
        <select id="report-status" v-model="filter"><option value="all">All reports</option><option value="pending">Awaiting review</option><option value="resolved">Resolved</option></select>
        <p v-if="!shown.total" class="muted">{{ reports.length ? 'No reports match this status.' : 'You have not reported any questions in this class.' }}</p>
        <article v-for="report in shown.items" :key="report.id" class="pg-report" :class="{ resolved: report.resolved }">
          <div class="row"><b class="pg-report-state">{{ report.resolved ? 'Resolved' : 'Awaiting review' }}</b><span class="small muted">{{ when(report.at) }} · {{ report.topic }}<template v-if="report.version"> · v{{ report.version }}</template></span></div>
          <p>{{ report.stem }}</p>
          <p class="small"><b>{{ categoryLabel(report.category) }}:</b> {{ report.reason }}</p>
          <p v-if="report.resolvedAt" class="small muted">Resolved {{ when(report.resolvedAt) }}</p>
          <p v-if="report.resolutionNote" class="note small"><b>Professor response:</b> {{ report.resolutionNote }}</p>
          <p v-else-if="report.resolved" class="small muted">Your professor marked this report resolved without an additional response.</p>
        </article>
        <Pager :paged="shown" label="My question reports pages" noun="reports" />
      </section>
    </div>
  </template>
</template>

<style scoped>
/* My Progress: a reading dashboard. Forest-green structure, leaf-tinted
   data surfaces, parchment cards, campfire gold for the main action. */
article p { overflow-wrap: anywhere; }
caption { text-align: left; padding-bottom: 8px; }
.progress-table { overflow-x: auto; }
.pg-heading { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; font-size: 22px; }
.pg-heading::after { content: ''; flex: 1; height: 0; border-top: 2px dashed #9db37f; }

/* 1. overall */
.pg-hero { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 22px 28px; align-items: center; margin: 4px 0 26px; padding: 22px 26px; color: #f1f0d9; background: radial-gradient(ellipse at 0% 0%, rgb(127 174 88 / 28%), transparent 55%), #2f5240; border: 2px solid #23382f; border-radius: 16px 13px 17px 14px; box-shadow: 0 5px 0 #1d3329, 0 12px 26px rgb(35 56 47 / 18%); }
.pg-hero h3 { margin: 0 0 6px; color: #fff8e4 !important; font-size: 24px; }
.pg-score { position: relative; display: grid; place-items: center; width: 148px; height: 148px; }
.pg-ring { width: 100%; height: 100%; transform: rotate(-90deg); }
.pg-ring circle { fill: none; stroke-width: 12; }
.pg-ring-track { stroke: rgb(255 248 228 / 16%); }
.pg-ring-fill { stroke: #f2ba55; stroke-linecap: round; }
.pg-ring-pct { position: absolute; color: #fff8e4; font: 700 34px/1 Georgia, 'Palatino Linotype', serif; font-variant-numeric: tabular-nums; }
.pg-ring-empty { display: grid; place-items: center; width: 120px; height: 120px; color: rgb(255 248 228 / 60%); font: 700 40px Georgia, serif; border: 12px solid rgb(255 248 228 / 16%); border-radius: 50%; }
.pg-hero .progress-score { margin: 0 0 8px; color: #e9eedb; font-size: 17px; }
.pg-hero .progress-score b { color: #f2ba55; font: 700 30px/1 Georgia, 'Palatino Linotype', serif; font-variant-numeric: tabular-nums; }
.pg-explain { margin: 0 0 10px; color: #cfdac3; font-size: 14px; line-height: 1.45; }
.pg-note { margin: 0 0 10px; padding: 8px 12px; color: #23382f; background: #f8e6bd; border-left: 4px solid #b07a1e; border-radius: 8px; font-size: 14px; }
.pg-focus { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin: 2px 0 14px; }
.pg-focus-label { color: #fff8e4; font-weight: 800; }
.pg-chip { padding: 3px 11px; color: #23382f; background: #f2ba55; border: 2px solid #23382f; border-radius: 999px 999px 999px 6px; font-size: 14px; }
.pg-focus-why { flex-basis: 100%; color: #cfdac3; font-size: 13px; }

/* 2. topics */
.pg-section { margin: 0 0 26px; }
.pg-topics { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(270px, 100%), 1fr)); gap: 14px; }
.pg-topic { --status: #9db37f; --status-bg: #e8f0dc; display: grid; align-content: start; gap: 8px; min-width: 0; padding: 14px 16px 16px; background: #fbf2d8 url('/hero-lab/assets/storybook-paper.svg'); background-size: 144px 144px; border: 2px solid #23382f; border-top: 6px solid var(--status); border-radius: 12px 10px 13px 11px; box-shadow: 0 4px 0 #a59a72; }
.pg-topic.is-focus { --status: #c56a3c; --status-bg: #f7e0d0; }
.pg-topic.is-building { --status: #5f9fb3; --status-bg: #dceef3; }
.pg-topic.is-steady { --status: #4c7c3a; --status-bg: #e2eed6; }
.pg-topic.is-idle { --status: #b3a37c; --status-bg: #efe6cd; }
.pg-topic-head { display: grid; gap: 6px; }
.pg-topic h4 { margin: 0; color: #254937; font: 700 18px/1.2 Georgia, 'Palatino Linotype', serif; }
.pg-status { justify-self: start; display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; color: #23382f; background: var(--status-bg); border: 1px solid var(--status); border-radius: 999px; font-size: 12px; font-weight: 800; }
.pg-status::before { content: ''; width: 8px; height: 8px; background: var(--status); border-radius: 50%; }
.is-focus .pg-status::before { border-radius: 2px; transform: rotate(45deg); }
.is-idle .pg-status::before { background: none; border: 2px solid var(--status); }
.pg-topic-score { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
.pg-pct { color: #254937; font: 700 28px/1 Georgia, 'Palatino Linotype', serif; font-variant-numeric: tabular-nums; }
.pg-topic-score span:last-child { color: #5f6d58; font-size: 14px; }
.pg-bank { margin: 0; padding: 6px 10px; color: #3d5140; background: #eef4e3; border-radius: 8px; font-size: 13px; }

/* 3 + 4. sessions and reports */
.pg-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
.pg-columns > .panel { min-width: 0; margin: 0; }
.progress-table table { width: 100%; border-collapse: collapse; }
.progress-table th { color: #254937; background: #e8f0dc; }
.progress-table :is(th, td) { padding: 9px 10px; text-align: left; }
.progress-table tbody tr:nth-child(even) td { background: rgb(232 240 220 / 45%); }
.progress-reports select { width: 100%; margin-bottom: 10px; }
.pg-report { margin-top: 12px; padding: 12px 14px; background: #fff8e4; border: 1px solid #c9ba93; border-left: 5px solid #b07a1e; border-radius: 10px; }
.pg-report.resolved { border-left-color: #4c7c3a; }
.pg-report p { margin: 6px 0 0; }
.pg-report-state { color: #254937; }
@media (max-width: 1100px) { .pg-columns { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) {
  .pg-hero { grid-template-columns: minmax(0, 1fr); justify-items: start; padding: 18px; }
  .pg-score { width: 112px; height: 112px; }
  .pg-ring-pct { font-size: 26px; }
  .pg-ring-empty { width: 96px; height: 96px; }
}
</style>
