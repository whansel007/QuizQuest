<script setup>
// ============================================================
// Settings: subject guidance, coverage and semester dates.
// The per-class settings (trading, analytics time zone, trade log)
// moved to the class management page, where each class carries its
// own: Classes & Roster -> a class -> Class Settings.
// ============================================================
import { ref, onMounted, useId } from 'vue';
import { api } from '../api.js';
import { toast } from '../ui.js';
import Heading from '../components/Heading.vue';
import AsyncButton from '../components/AsyncButton.vue';
import CoursePicker from './CoursePicker.vue';
import { loadCourses, currentCourse } from './courses.js';

const error = ref('');
const loaded = ref(false);
const courses = ref([]);
const course = ref(null);
const guidance = ref('');
const target = ref(1);
// "This semester" on Analytics runs from the start to the end (or to today)
const semester = ref({ start: '', end: '' });
onMounted(async () => {
  try {
    courses.value = await loadCourses(true);
    const c = currentCourse();
    course.value = c;
    if (c) {
      guidance.value = c.promptConfig;
      target.value = c.coverageTarget;
      semester.value = { start: c.semester?.start || '', end: c.semester?.end || '' };
    }
    loaded.value = true;
  } catch (err) {
    error.value = err.message;
  }
});

async function saveSemester() {
  const { start, end } = semester.value;
  await api('PUT', `/api/teacher/courses/${course.value.id}/settings`, { semester: start ? { start, end: end || null } : null });
  toast(start ? 'Semester dates saved' : 'Semester dates cleared');
  await loadCourses(true);
}

async function save() {
  await api('PUT', `/api/teacher/courses/${course.value.id}/settings`, { promptConfig: guidance.value, coverageTarget: Number(target.value) });
  toast('Saved');
  await loadCourses(true);
}

const targetId = useId();
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!course">You have no assigned courses.</p>
    <template v-else>
      <Heading title="Settings" data-testid="settings-page"><CoursePicker :courses="courses" /></Heading>
      <div class="panel">
        <h3>Subject guidance for AI drafting</h3>
        <p class="small muted">Added to every drafting prompt for this course (e.g. "use SI units", "prefer applied scenarios"). It is the per-subject "skill" from proposal §6.</p>
        <textarea v-model="guidance" rows="3" maxlength="1000" aria-label="Subject guidance for AI drafting"></textarea>
        <div class="row" style="margin-top: 10px">
          <label :for="targetId" style="margin: 0">Coverage target per learning outcome</label>
          <input :id="targetId" v-model="target" type="number" min="1" max="50" style="max-width: 100px" />
          <AsyncButton class="btn primary" :run="save">Save</AsyncButton>
        </div>
      </div>
      <div class="panel">
        <h3>Semester dates</h3>
        <p class="small muted">Used by "This semester" on the Analytics dashboard: from the start date to today, or to the end date once the semester is over. Update them at the start of each term.</p>
        <form class="row" @submit.prevent>
          <label class="small" style="margin: 0">Semester starts <input v-model="semester.start" type="date" :max="semester.end || undefined" /></label>
          <label class="small" style="margin: 0">Ends (optional) <input v-model="semester.end" type="date" :min="semester.start || undefined" :disabled="!semester.start" /></label>
          <AsyncButton class="btn primary" :run="saveSemester">{{ semester.start ? 'Save dates' : 'Clear dates' }}</AsyncButton>
        </form>
      </div>
      <div class="panel">
        <h3>Per-class settings</h3>
        <p class="small muted">
          Trading, the analytics time zone and the trade log now live with the class they belong to:
          <b>Classes &amp; Roster</b> → pick a class → <b>Class Settings</b>.
        </p>
      </div>
    </template>
  </template>
</template>
