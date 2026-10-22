<script setup>
// ============================================================
// AI drafting
// ============================================================
import { ref, reactive, onMounted, watch } from 'vue';
import { S, api, setTab, rerender } from '../api.js';
import { when } from '../ui.js';
import Heading from '../components/Heading.vue';
import Field from '../components/Field.vue';
import AsyncButton from '../components/AsyncButton.vue';
import CoursePicker from './CoursePicker.vue';
import AuthoringWorkflow from './AuthoringWorkflow.vue';
import TopicPicker from './TopicPicker.vue';
import TopicForm from './TopicForm.vue';
import { loadCourses, currentCourse, initialTags, syncTopic } from './courses.js';
import { draftStore } from './authoring-draft.js';

const error = ref('');
const loaded = ref(false);
const courses = ref([]);
const course = ref(null);
const history = ref([]);
const tags = reactive({ topicId: null, outcomeId: null, topicText: '', learningOutcome: '' });
const count = ref(3);
const format = ref(null);
const focus = ref('');
const workflowTarget = ref(null);
const topic = ref(null); // the weekly topic being worked on
const addingTopic = ref(false);
onMounted(async () => {
  try {
    courses.value = await loadCourses();
    const c = currentCourse();
    course.value = c;
    if (c) {
      // opened from the dashboard's "Draft questions": work on that topic
      if (S.draftTarget?.topicId) S.topicId = S.draftTarget.topicId;
      topic.value = syncTopic(c, { required: true });
      if (!c.authoringEnabled) history.value = await api('GET', `/api/teacher/courses/${c.id}/generations`);
      // start on the dashboard's outcome, else the selected topic's first
      Object.assign(tags, initialTags(c, S.draftTarget || { topicId: S.topicId }));
      if(S.draftTarget) workflowTarget.value={...tags,count:3};
      tags.topicText=c.topics.find(t=>t.id===tags.topicId)?.name || '';
      tags.learningOutcome=c.topics.flatMap(t=>t.outcomes).find(o=>o.id===tags.outcomeId)?.text || '';
      S.draftTarget = null;
      // like a plain <select>: the first format that isn't disabled
      format.value = c.formats.all.find((f) => c.formats.drafter.includes(f)) ?? null;
      if(!c.authoringEnabled) {
        const recovered=await draftStore(`offline-assessment:${S.me.id}:${c.id}`);
        if(recovered){Object.assign(tags,recovered.tags);count.value=recovered.count;format.value=['mcq','tf','short','multi'].includes(recovered.format)?recovered.format:'mcq';focus.value=recovered.focus;}
      }
    }
    loaded.value = true;
  } catch (err) {
    error.value = err.message;
  }
});
watch([tags,count,format,focus],async()=>{
  if(!loaded.value || !course.value || course.value.authoringEnabled)return;
  try {await draftStore(`offline-assessment:${S.me.id}:${course.value.id}`,JSON.parse(JSON.stringify({tags,count:count.value,format:format.value,focus:focus.value})));}
  catch {error.value='Browser recovery storage is unavailable. Keep your assessment details before leaving.';}
},{deep:true});

// result box: { progress } | { error } | { r: generate response }
const result = ref(null);
const run = (force) => async () => {
  result.value = { progress: 'Drafting…' };
  try {
    const r = await api('POST', `/api/teacher/courses/${course.value.id}/generate`, { topicText: tags.topicText, learningOutcome: tags.learningOutcome, count: Number(count.value), format: format.value, focus: focus.value, force });
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

const outcomeText = (id) => course.value.topics.flatMap((t) => t.outcomes).find((o) => o.id === id)?.text;
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!course">You have no assigned courses.</p>
    <template v-else>
      <Heading title="AI drafting">
        <CoursePicker :courses="courses" />
        <TopicPicker v-if="course.topics.length" :topics="course.topics" @change="rerender" />
        <button v-if="!addingTopic" class="btn" @click="addingTopic = true">+ New topic</button>
      </Heading>
      <div v-if="addingTopic || !topic" class="panel">
        <h3>{{ topic ? 'New weekly topic' : 'Add your first weekly topic' }}</h3>
        <p class="small muted">Lecture files, knowledge reports and questions are grouped by topic, and shared by all your classes for this course.</p>
        <TopicForm :course="course" @created="rerender" @cancel="addingTopic = false" />
      </div>
      <AuthoringWorkflow v-if="course.authoringEnabled && topic" :key="topic.id" :course="course" :topic="topic" :target="workflowTarget" />
      <div v-else-if="!course.authoringEnabled" class="panel">
        <div class="note small">
          <b>Drafter: </b>{{ course.drafter }}. {{ course.geminiEnabled ? '' : 'Set GEMINI_API_KEY in the server environment to use Gemini and unlock every format. ' }}The drafter only sees the retrieved chunks - never student names, grades or tools. Structure checks (and maths sampling) run in code; correctness is your call during review.
        </div>
        <label>Topic<input type="text" v-model="tags.topicText" maxlength="160" /></label><label>Learning outcome<textarea v-model="tags.learningOutcome" maxlength="2000"></textarea></label>
        <div class="row top">
          <Field label="Format" v-slot="{ id }">
            <select :id="id" v-model="format">
              <option v-for="f in ['mcq','tf','short','multi']" :key="f" :value="f" :disabled="!course.formats.drafter.includes(f)">{{ ({mcq:'MCQ',tf:'True/False',short:'Short Answer',multi:'Multi-select'})[f] + (course.formats.drafter.includes(f) ? '' : ' (needs Gemini)') }}</option>
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

      <div v-if="!course.authoringEnabled" class="panel">
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
                <td>{{ g.rejected?.length ?? 0 }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="muted small">Nothing generated yet.</p>
      </div>
    </template>
  </template>
</template>
