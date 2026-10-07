<script setup>
// ============================================================
// Question bank & review
// ============================================================
import { ref, computed, onMounted } from 'vue';
import { S, api } from '../api.js';
import Heading from '../components/Heading.vue';
import CoursePicker from './CoursePicker.vue';
import QuestionCard from './QuestionCard.vue';
import QuestionEditor from './QuestionEditor.vue';
import { loadCourses, currentCourse } from './courses.js';

const error = ref('');
const loaded = ref(false);
const courses = ref([]);
const course = ref(null);
const questions = ref([]);
const passages = ref([]);
onMounted(async () => {
  try {
    courses.value = await loadCourses();
    course.value = currentCourse();
    if (course.value) {
      [questions.value, passages.value] = await Promise.all([api('GET', `/api/teacher/courses/${course.value.id}/questions`), api('GET', `/api/teacher/courses/${course.value.id}/passages`)]);
    }
    loaded.value = true;
  } catch (err) {
    error.value = err.message;
  }
});

const filters = [
  ['draft', 'Needs review', (q) => q.status === 'draft'],
  ['reported', 'Reported', (q) => q.reports.some((r) => !r.resolved)],
  ['published', 'Published', (q) => q.status === 'published'],
  ['withdrawn', 'Withdrawn', (q) => q.status === 'withdrawn'],
  ['rejected', 'Rejected', (q) => q.status === 'rejected'],
];
const shown = computed(() => questions.value.filter((filters.find((x) => x[0] === S.qFilter) || filters[0])[2]));

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
      <div class="chips">
        <button v-for="[id, label, fn] in filters" :key="id" :aria-pressed="S.qFilter === id ? 'true' : 'false'" @click="S.qFilter = id">{{ `${label} (${questions.filter(fn).length})` }}</button>
      </div>
      <div>
        <template v-if="shown.length">
          <QuestionCard v-for="q in shown" :key="q.id" :q="q" :course="course" :passages="passages" />
        </template>
        <p v-else class="muted">Nothing here.</p>
      </div>
    </template>
  </template>
</template>
