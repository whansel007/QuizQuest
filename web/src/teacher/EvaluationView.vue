<script setup>
// ============================================================
// Evaluation: is the prototype doing its job?
// ============================================================
import { ref, onMounted } from 'vue';
import { api } from '../api.js';
import { pct } from '../ui.js';
import Heading from '../components/Heading.vue';
import CoursePicker from './CoursePicker.vue';
import { loadCourses, currentCourse, ORIGIN } from './courses.js';

const error = ref('');
const loaded = ref(false);
const courses = ref([]);
const course = ref(null);
const ev = ref(null);
onMounted(async () => {
  try {
    courses.value = await loadCourses();
    course.value = currentCourse();
    if (course.value) ev.value = await api('GET', `/api/teacher/courses/${course.value.id}/evaluation`);
    loaded.value = true;
  } catch (err) {
    error.value = err.message;
  }
});

const n = (x, d = 1) => (x === null || x === undefined ? '-' : Number(x).toFixed(d));
const totalRatings = (u) => u.ratings[1] + u.ratings[2] + u.ratings[3];
const change = (r) => (r.meanAccuracyChange === null ? '-' : `${r.meanAccuracyChange >= 0 ? '+' : ''}${Math.round(r.meanAccuracyChange * 100)} pts`);
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!course">You have no assigned courses.</p>
    <template v-else>
      <Heading title="Prototype evaluation"><CoursePicker :courses="courses" /></Heading>
      <div class="note small">The measures the proposal commits to. All descriptive: small samples and no control group, so none of this shows that learning improved.</div>
      <div class="panel">
        <h3>Question drafting: acceptance and editing</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th v-for="h in ['Source', 'Total', 'Pending', 'Approved', 'Rejected', 'Acceptance', 'Edited before approval', 'Discarded by checks', 'Median review time']" :key="h">{{ h }}</th></tr></thead>
            <tbody>
              <tr v-for="d in ev.drafting" :key="d.origin">
                <td>{{ ORIGIN[d.origin] || d.origin }}</td>
                <td>{{ d.total }}</td>
                <td>{{ d.pending }}</td>
                <td>{{ d.approved }}</td>
                <td>{{ d.rejected }}</td>
                <td>{{ pct(d.acceptanceRate) }}</td>
                <td>{{ d.approved ? `${d.editedBeforeApproval} (${pct(d.editRate)})` : '-' }}</td>
                <td>{{ d.discardedByChecks }}</td>
                <td>{{ d.medianReviewHours === null ? '-' : `${n(d.medianReviewHours)} h` }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <h3>Preparation time</h3>
        <p class="small muted">Time with the question editor open (capped at 1 hour per save). Hand-written baseline in the demo data is synthetic.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th v-for="h in ['Source', 'Questions timed', 'Total minutes', 'Median per question', 'Minutes per published question']" :key="h">{{ h }}</th></tr></thead>
            <tbody>
              <tr v-for="p in ev.prep" :key="p.origin">
                <td>{{ ORIGIN[p.origin] || p.origin }}</td>
                <td>{{ p.questionsTimed }}</td>
                <td>{{ n(p.totalMinutes) }}</td>
                <td>{{ p.medianSeconds === null ? '-' : `${Math.round(p.medianSeconds)} s` }}</td>
                <td>{{ n(p.minutesPerPublished) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <h3>Recommendation behaviour</h3>
        <div class="tiles">
          <div class="tile"><div class="v">{{ `${ev.recommendation.adaptive} / ${ev.recommendation.sessions}` }}</div><div class="l">sessions personalised ({{ ev.recommendation.broad }} broad)</div></div>
          <div class="tile"><div class="v">{{ pct(ev.recommendation.meanWeakShare) }}</div><div class="l">of personalised questions from focus topics (target 70%)</div></div>
          <div class="tile"><div class="v">{{ ev.recommendation.shortageNotices }}</div><div class="l">sessions that disclosed a small bank</div></div>
          <div class="tile"><div class="v">{{ change(ev.recommendation) }}</div><div class="l">focus-topic accuracy, next session vs before (n={{ ev.recommendation.followUps }})</div></div>
        </div>
      </div>
      <div class="panel">
        <h3>Student usability</h3>
        <div class="tiles">
          <div class="tile"><div class="v">{{ pct(ev.usability.completionRate) }}</div><div class="l">sessions completed ({{ ev.usability.completed }}/{{ ev.usability.started }})</div></div>
          <div class="tile"><div class="v">{{ ev.usability.medianMinutes === null ? '-' : `${n(ev.usability.medianMinutes)} min` }}</div><div class="l">median session length</div></div>
          <div class="tile"><div class="v">{{ `😕 ${ev.usability.ratings[1]} · 😐 ${ev.usability.ratings[2]} · 🙂 ${ev.usability.ratings[3]}` }}</div><div class="l">end-of-session ratings (n={{ totalRatings(ev.usability) }})</div></div>
        </div>
        <div v-if="ev.usability.comments.length">
          <b class="small">Recent comments (anonymous)</b>
          <ul><li v-for="(c, i) in ev.usability.comments" :key="i" class="small">{{ ['', '😕', '😐', '🙂'][c.rating] }} {{ c.comment }}</li></ul>
        </div>
        <p v-else class="small muted">No comments yet.</p>
      </div>
    </template>
  </template>
</template>
