<script setup>
// ============================================================
// Question bank & review
// ============================================================
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { S, api } from '../api.js';
import Heading from '../components/Heading.vue';
import CoursePicker from './CoursePicker.vue';
import QuestionCard from './QuestionCard.vue';
import QuestionEditor from './QuestionEditor.vue';
import Pager from '../components/Pager.vue';
import { usePaged } from '../components/paged.js';
import { loadCourses, currentCourse, syncTopic, topicLabel } from './courses.js';

const error = ref('');
const loaded = ref(false);
const courses = ref([]);
const course = ref(null);
const questions = ref([]);
const passages = ref([]);
onMounted(async () => {
  try {
    courses.value = await loadCourses(true);
    course.value = currentCourse();
    syncTopic(course.value);
    if (course.value) {
      [questions.value, passages.value] = await Promise.all([api('GET', `/api/teacher/courses/${course.value.id}/questions`), api('GET', `/api/teacher/courses/${course.value.id}/passages`)]);
    }
    loaded.value = true;
    await focusRequested();
  } catch (err) {
    error.value = err.message;
  }
});

// Opened from the dashboard: show the question's filter, scroll to it and
// highlight it briefly (once)
async function focusRequested() {
  const id = S.focusQuestionId;
  S.focusQuestionId = null;
  const q = id && questions.value.find((x) => x.id === id);
  if (!q) return;
  S.qFilter = q.status === 'draft' ? 'draft' : q.status;
  if (S.topicId && S.topicId !== q.topicId) S.topicId = q.topicId || ''; // keep it visible
  await nextTick();
  paged.go(Math.floor(shown.value.findIndex((x) => x.id === id) / PAGE_SIZE) + 1);
  await nextTick();
  const card = document.getElementById('qcard-' + id);
  if (!card) return;
  card.scrollIntoView({ block: 'center' });
  card.focus({ preventScroll: true });
  card.classList.add('flash');
  setTimeout(() => card.classList.remove('flash'), 2500);
}

const filters = [
  ['draft', 'Needs review', (q) => q.status === 'draft'],
  ['reported', 'Reported', (q) => q.reports.some((r) => !r.resolved)],
  ['published', 'Published', (q) => q.status === 'published'],
  ['withdrawn', 'Withdrawn', (q) => q.status === 'withdrawn'],
  ['rejected', 'Rejected', (q) => q.status === 'rejected'],
];
// Topic and status filters combine; status counts follow the chosen topic.
const topics = computed(() => (course.value?.topics || [])
  .map((t) => ({ ...t, count: questions.value.filter((q) => q.topicId === t.id).length }))
  .filter((t) => t.count || t.id === S.topicId));
const inTopic = computed(() => (S.topicId ? questions.value.filter((q) => q.topicId === S.topicId) : questions.value));
// Newest first, so new drafts and just-saved questions are on page 1.
const created = (q) => (typeof q.createdAt === 'number' ? q.createdAt : Date.parse(q.createdAt) || 0);
const shown = computed(() => inTopic.value.filter((filters.find((x) => x[0] === S.qFilter) || filters[0])[2]).sort((a, b) => created(b) - created(a)));
const PAGE_SIZE = 10;
const paged = usePaged(() => shown.value, PAGE_SIZE);
watch(() => [S.qFilter, S.topicId], () => paged.go(1));
const listTop = ref(null);
function goPage(p) {
  paged.go(p);
  listTop.value?.scrollIntoView({ block: 'start' });
}

// "+ New question" again opens a fresh editor
const newKey = ref(0);
const creating = ref(false);
function openNew() {
  newKey.value++;
  creating.value = true;
}
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!course">You have no assigned courses.</p>
    <template v-else>
      <Heading title="Question bank">
        <CoursePicker :courses="courses" />
        <button class="btn primary" @click="openNew">+ New question</button>
      </Heading>
      <p class="muted small">AI-drafted questions stay drafts until you approve them. Editing a published question creates a new version, so earlier attempts still point at the wording students actually saw.</p>
      <div>
        <QuestionEditor v-if="creating" :key="newKey" :course="course" :passages="passages" @close="creating = false" />
      </div>
      <div class="row" style="align-items: flex-end; margin-bottom: 12px">
        <label class="field" style="margin: 0; max-width: 360px">Topic
          <select v-model="S.topicId" aria-label="Filter by topic">
            <option value="">All topics ({{ questions.length }})</option>
            <option v-for="t in topics" :key="t.id" :value="t.id">{{ topicLabel(t) }} ({{ t.count }})</option>
          </select>
        </label>
      </div>
      <div ref="listTop" class="chips">
        <button v-for="[id, label, fn] in filters" :key="id" :aria-pressed="S.qFilter === id ? 'true' : 'false'" @click="S.qFilter = id">{{ `${label} (${inTopic.filter(fn).length})` }}</button>
      </div>
      <Pager :paged="{ ...paged, go: goPage }" label="Question pages (top)" noun="questions" />
      <div>
        <template v-if="shown.length">
          <QuestionCard v-for="q in paged.items" :key="q.id" :q="q" :course="course" :passages="passages" />
        </template>
        <p v-else class="muted">
          Nothing here{{ S.topicId ? ' for this topic' : '' }}.
          <template v-for="[id, label, fn] in filters" :key="id"><button v-if="id !== S.qFilter && inTopic.filter(fn).length" class="btn small" style="margin-left: 8px" @click="S.qFilter = id">{{ label }} ({{ inTopic.filter(fn).length }})</button></template>
          <button v-if="S.topicId" class="btn small" style="margin-left: 8px" @click="S.topicId = ''">Show all topics</button>
        </p>
      </div>
      <Pager :paged="{ ...paged, go: goPage }" label="Question pages" noun="questions" />
    </template>
  </template>
</template>
