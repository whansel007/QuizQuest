<script setup>
// ============================================================
// AI drafting
// ============================================================
import { ref, reactive, onMounted } from 'vue';
import { S, api, setTab } from '../api.js';
import { when } from '../ui.js';
import Heading from '../components/Heading.vue';
import Field from '../components/Field.vue';
import AsyncButton from '../components/AsyncButton.vue';
import CoursePicker from './CoursePicker.vue';
import TopicOutcomeFields from './TopicOutcomeFields.vue';
import { loadCourses, currentCourse, initialTags } from './courses.js';

const error = ref('');
const loaded = ref(false);
const courses = ref([]);
const course = ref(null);
const coverage = ref([]);
const history = ref([]);
const tags = reactive({ topicId: null, outcomeId: null });
const count = ref(3);
const format = ref(null);
const focus = ref('');
onMounted(async () => {
  try {
    courses.value = await loadCourses();
    const c = currentCourse();
    course.value = c;
    if (c) {
      [coverage.value, history.value] = await Promise.all([api('GET', `/api/teacher/courses/${c.id}/coverage`), api('GET', `/api/teacher/courses/${c.id}/generations`)]);
      // opened from the dashboard's "Draft questions": start on that outcome
      Object.assign(tags, initialTags(c, S.draftTarget || {}));
      S.draftTarget = null;
      // like a plain <select>: the first format that isn't disabled
      format.value = c.formats.all.find((f) => c.formats.drafter.includes(f)) ?? null;
    }
    loaded.value = true;
  } catch (err) {
    error.value = err.message;
  }
});

// result box: { progress } | { error } | { r: generate response }
const result = ref(null);
const run = (force) => async () => {
  result.value = { progress: 'Drafting…' };
  try {
    const r = await api('POST', `/api/teacher/courses/${course.value.id}/generate`, { topicId: tags.topicId, outcomeId: tags.outcomeId, count: Number(count.value), format: format.value, focus: focus.value, force });
    result.value = { r };
  } catch (err) {
    result.value = { error: err.message };
    err.shown = true;
    throw err;
  }
};

function reviewDrafts() {
  S.qFilter = 'draft';
  setTab('review');
}
function fillGap(c) {
  tags.topicId = c.topicId;
  tags.outcomeId = c.outcomeId;
  count.value = Math.min(5, c.gap);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
const outcomeText = (id) => course.value.topics.flatMap((t) => t.outcomes).find((o) => o.id === id)?.text;
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!course">You have no assigned courses.</p>
    <template v-else>
      <Heading title="AI drafting"><CoursePicker :courses="courses" /></Heading>
      <div class="panel">
        <div class="note small">
          <b>Drafter: </b>{{ course.drafter }}. {{ course.geminiEnabled ? '' : 'Set GEMINI_API_KEY in the server environment to use Gemini and unlock every format. ' }}The drafter only sees the retrieved chunks - never student names, grades or tools. Structure checks (and maths sampling) run in code; correctness is your call during review.
        </div>
        <div class="row top"><TopicOutcomeFields v-model:topic-id="tags.topicId" v-model:outcome-id="tags.outcomeId" :course="course" /></div>
        <div class="row top">
          <Field label="Format" v-slot="{ id }">
            <select :id="id" v-model="format">
              <option v-for="f in course.formats.all" :key="f" :value="f" :disabled="!course.formats.drafter.includes(f)">{{ course.formats.labels[f] + (course.formats.drafter.includes(f) ? '' : ' (needs Gemini)') }}</option>
            </select>
          </Field>
          <Field label="Batch size" v-slot="{ id }">
            <select :id="id" v-model.number="count"><option v-for="n in [1, 2, 3, 4, 5]" :key="n" :value="n">{{ n }}</option></select>
          </Field>
          <Field class="grow" label="Focus keywords" v-slot="{ id }"><input :id="id" v-model="focus" type="text" placeholder="optional, e.g. latency bandwidth" /></Field>
        </div>
        <AsyncButton class="btn primary" :run="run(false)">Draft questions</AsyncButton>
        <div>
          <template v-if="result">
            <p v-if="result.progress" class="muted small">{{ result.progress }}</p>
            <div v-else-if="result.error" class="note bad small">{{ result.error }}</div>
            <template v-else>
              <div v-if="result.r.cached" class="note">These exact inputs were drafted before, so nothing new was generated (saves cost and avoids duplicates). <AsyncButton class="btn small" :run="run(true)">Generate anyway</AsyncButton></div>
              <div v-else :class="result.r.created.length ? 'note good' : 'note warn'">{{ result.r.created.length }} draft(s) added to the review queue.</div>
              <div v-if="result.r.rejected.length" class="note warn">
                <b>{{ result.r.rejected.length }} item(s) failed the structure checks and were discarded:</b>
                <ul><li v-for="(x, i) in result.r.rejected" :key="i" class="small">{{ `"${x.stem.slice(0, 90)}" - ${x.errors.join(' ')}` }}</li></ul>
              </div>
              <details v-if="result.r.retrieved?.length" class="small" style="margin-bottom: 10px">
                <summary>Material sent to the drafter ({{ result.r.retrieved.length }} chunk(s))</summary>
                <table>
                  <tbody>
                    <tr v-for="(c, i) in result.r.retrieved" :key="i">
                      <td>{{ c.title }}</td>
                      <td class="muted">{{ c.why.join(', ') }}</td>
                      <td>{{ c.score }}</td>
                      <td class="muted">"{{ c.preview }}…"</td>
                    </tr>
                  </tbody>
                </table>
              </details>
              <button v-if="result.r.created.length" class="btn primary" @click="reviewDrafts">Review drafts →</button>
            </template>
          </template>
        </div>
      </div>

      <div class="panel">
        <h3>Coverage</h3>
        <p class="small muted">Target: {{ course.coverageTarget }} published questions per learning outcome (change it in Settings). Generate where there are gaps, rather than after every student answer.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th v-for="h in ['Topic', 'Learning outcome', 'Published', 'Drafts', 'Passages', '']" :key="h">{{ h }}</th></tr></thead>
            <tbody>
              <tr v-for="c in coverage" :key="c.outcomeId">
                <td>{{ c.topic }}</td>
                <td>{{ c.outcome }}</td>
                <td>{{ c.published }} / {{ c.target }}</td>
                <td>{{ c.drafts }}</td>
                <td>{{ c.passages }}</td>
                <td>
                  <button v-if="c.gap" class="btn small" @click="fillGap(c)">Fill gap ({{ c.gap }})</button>
                  <span v-else class="badge published">covered</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="panel">
        <h3>Generation log</h3>
        <div v-if="history.length" class="table-wrap">
          <table>
            <thead><tr><th v-for="h in ['When', 'Outcome', 'Format', 'Drafter', 'Chunks', 'Kept', 'Discarded']" :key="h">{{ h }}</th></tr></thead>
            <tbody>
              <tr v-for="g in history" :key="g.id">
                <td>{{ when(g.at) }}</td>
                <td>{{ outcomeText(g.outcomeId) }}</td>
                <td>{{ course.formats.labels[g.format || 'mcq'] }}</td>
                <td>{{ g.provider + (g.model ? ` (${g.model})` : '') }}</td>
                <td>{{ g.chunkCount ?? g.passageIds.length }}</td>
                <td>
                  <template v-if="g.ok || g.createdQuestionIds.length">{{ g.createdQuestionIds.length }}</template>
                  <span v-else class="badge rejected">{{ g.error || 'none' }}</span>
                </td>
                <td>{{ g.rejected.length }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="muted small">Nothing generated yet.</p>
      </div>
    </template>
  </template>
</template>
