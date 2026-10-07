<script setup>
// ============================================================
// Analytics (+ free-response marking, participation)
// ============================================================
import { ref, onMounted } from 'vue';
import { S, api, rerender, download } from '../api.js';
import { pct, secs } from '../ui.js';
import Heading from '../components/Heading.vue';
import Meter from '../components/Meter.vue';
import AsyncButton from '../components/AsyncButton.vue';
import ClassPicker from './ClassPicker.vue';
import { loadCourses } from './courses.js';

const error = ref('');
const loaded = ref(false);
const classes = ref([]);
const a = ref(null);
const marking = ref([]);
onMounted(async () => {
  try {
    const courses = await loadCourses();
    classes.value = courses.flatMap((c) => c.classes);
    if (classes.value.length) {
      if (!S.classId || !classes.value.some((c) => c.id === S.classId)) S.classId = classes.value[0].id;
      [a.value, marking.value] = await Promise.all([api('GET', `/api/teacher/classes/${S.classId}/analytics`), api('GET', `/api/teacher/classes/${S.classId}/marking`)]);
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
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!classes.length">You have no classes.</p>
    <template v-else>
      <Heading title="Analytics"><ClassPicker :classes="classes" /></Heading>
      <div class="tiles">
        <div class="tile"><div class="v">{{ `${a.participation.activeEver} / ${a.participation.enrolled}` }}</div><div class="l">students who have practised</div></div>
        <div class="tile"><div class="v">{{ `${a.participation.active7d} / ${a.participation.enrolled}` }}</div><div class="l">active in the last 7 days</div></div>
        <div class="tile"><div class="v">{{ a.participation.sessionsCompleted }}</div><div class="l">sessions completed</div></div>
        <div class="tile"><div class="v">{{ a.participation.attempts }}</div><div class="l">answers submitted ({{ a.participation.worldAttempts }} in World)</div></div>
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
        <h3>By topic</h3>
        <p class="small muted">First attempts are a student's first ever answer to a question; retries are later answers (often after seeing the explanation). Response time is context, not a measure of ability.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th v-for="(h, i) in ['Topic', 'First-attempt accuracy', '', 'Retry accuracy', 'Students', 'Median / p75 time', 'Timeouts']" :key="i">{{ h }}</th></tr></thead>
            <tbody>
              <tr v-for="t in a.byTopic" :key="t.name">
                <td>{{ t.name }}</td>
                <td>{{ frac(t.first) }}</td>
                <td style="width: 120px"><Meter :value="t.first.accuracy" /></td>
                <td>{{ frac(t.retry) }}</td>
                <td>{{ t.students }}</td>
                <td>{{ `${secs(t.medianMs)} / ${secs(t.p75Ms)}` }}</td>
                <td>{{ t.timeouts }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <h3>Commonly missed questions</h3>
        <p class="small muted">Lowest first-attempt accuracy, questions with at least {{ a.minN }} first attempts. Low accuracy is a reason to look closer: it can mean a difficult concept, an ambiguous question, or a gap in coverage.</p>
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
      <p class="small muted">These are practice indicators to support teaching judgement. They are not grades, and the platform does not label individual students.</p>
    </template>
  </template>
</template>
