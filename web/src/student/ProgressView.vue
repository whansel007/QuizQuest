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
    <div class="panel">
      <h3>Your practice indicator</h3>
      <p class="small muted">Your latest confirmed answer to each of the most recent {{ progress.window }} different questions per topic counts. Practice and World answers are included. Retries replace earlier answers. This is a practice guide, not a grade or a measure of mastery.</p>
      <p v-if="!progress.indicator.n">No confirmed answers yet. Start a practice session to build your history.</p>
      <p v-else><b>{{ progress.indicator.correct }} / {{ progress.indicator.n }}</b> counted questions correct ({{ pct(progress.indicator.accuracy) }} across the topic windows below).</p>
      <p v-if="progress.awaitingMarking" class="note small">{{ progress.awaitingMarking }} written answer(s) awaiting marking are excluded from accuracy. Confirmed earlier answers to those questions may still count.</p>
      <p v-if="focus.length" class="note small">Worth practising next: <b>{{ focus.map((t) => t.name).join(', ') }}</b>. These topics have at least {{ progress.minPerTopic }} counted questions and accuracy below {{ pct(progress.weakBelow) }}.</p>
      <p v-else class="small muted">Keep exploring all topics. Topics need at least {{ progress.minPerTopic }} different confirmed questions before we suggest extra practice.</p>
      <button class="btn primary" @click="setTab('practice')">Go to practice</button>
    </div>
    <div class="grid">
      <article v-for="topic in progress.topics" :key="topic.topicId" class="tile">
        <h3>{{ topic.name }}</h3>
        <p class="badge plain">{{ statusLabel(topic) }}</p>
        <template v-if="topic.n">
          <div class="v">{{ pct(topic.accuracy) }}</div>
          <Meter :value="topic.accuracy" />
          <p>{{ topic.correct }} / {{ topic.n }} counted questions correct</p>
        </template>
        <p v-else class="small muted">No confirmed answers for this topic.</p>
        <p class="small muted">{{ topic.bank }} published question(s) available{{ !topic.bank ? ' — ask your professor about more practice material.' : '.' }}</p>
        <p v-if="topic.awaitingMarking" class="small muted">{{ topic.awaitingMarking }} answer(s) awaiting marking.</p>
      </article>
    </div>
    <section class="panel" style="margin-top: 16px">
      <h3>Recent sessions</h3>
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
    <section class="panel">
      <h3>My question reports</h3>
      <p class="small muted">Report a problem after answering a question in Practice or the World. Professors see your reason without your identity. Resolving a report does not automatically change your marks.</p>
      <label for="report-status">Report status</label>
      <select id="report-status" v-model="filter"><option value="all">All reports</option><option value="pending">Awaiting review</option><option value="resolved">Resolved</option></select>
      <p v-if="!shown.total" class="muted">{{ reports.length ? 'No reports match this status.' : 'You have not reported any questions in this class.' }}</p>
      <article v-for="report in shown.items" :key="report.id" class="panel" style="margin-top: 12px">
        <div class="row"><b>{{ report.resolved ? 'Resolved' : 'Awaiting review' }}</b><span class="small muted">{{ when(report.at) }} · {{ report.topic }}<template v-if="report.version"> · v{{ report.version }}</template></span></div>
        <p>{{ report.stem }}</p>
        <p class="small"><b>{{ categoryLabel(report.category) }}:</b> {{ report.reason }}</p>
        <p v-if="report.resolvedAt" class="small muted">Resolved {{ when(report.resolvedAt) }}</p>
        <p v-if="report.resolutionNote" class="note small"><b>Professor response:</b> {{ report.resolutionNote }}</p>
        <p v-else-if="report.resolved" class="small muted">Your professor marked this report resolved without an additional response.</p>
      </article>
      <Pager :paged="shown" label="My question reports pages" noun="reports" />
    </section>
  </template>
</template>

<style scoped>
.progress-table { overflow-x: auto; }
article p { overflow-wrap: anywhere; }
caption { text-align: left; padding-bottom: 8px; }
</style>
