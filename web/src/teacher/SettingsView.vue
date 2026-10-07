<script setup>
// ============================================================
// Settings: subject guidance, coverage, class toggles, trade log
// ============================================================
import { ref, onMounted, useId } from 'vue';
import { api, rerender } from '../api.js';
import { toast, when, fmtBundle, action } from '../ui.js';
import Heading from '../components/Heading.vue';
import AsyncButton from '../components/AsyncButton.vue';
import CoursePicker from './CoursePicker.vue';
import { loadCourses, currentCourse, RES } from './courses.js';

const error = ref('');
const loaded = ref(false);
const courses = ref([]);
const course = ref(null);
const guidance = ref('');
const target = ref(1);
const classTrades = ref({});
onMounted(async () => {
  try {
    courses.value = await loadCourses(true);
    const c = currentCourse();
    course.value = c;
    if (c) {
      guidance.value = c.promptConfig;
      target.value = c.coverageTarget;
      const lists = await Promise.all(c.classes.map((cl) => api('GET', `/api/teacher/classes/${cl.id}/trades`)));
      classTrades.value = Object.fromEntries(c.classes.map((cl, i) => [cl.id, lists[i]]));
    }
    loaded.value = true;
  } catch (err) {
    error.value = err.message;
  }
});

async function save() {
  await api('PUT', `/api/teacher/courses/${course.value.id}/settings`, { promptConfig: guidance.value, coverageTarget: Number(target.value) });
  toast('Saved');
  await loadCourses(true);
}

const toggle = (cl, key) => action(async (e) => {
  const box = e.target;
  try {
    await api('PUT', `/api/teacher/classes/${cl.id}/settings`, { [key]: box.checked });
  } catch (err) {
    box.checked = !box.checked; // failed: show the setting as it really is
    throw err;
  }
  toast('Saved');
  rerender();
});
const toggles = (cl) => [
  ['Allow resource trading between classmates', 'tradingEnabled', cl.settings.tradingEnabled, 'Students post offers to the whole class (no private targeting), with limits on open offers, size and daily trades. Turning this off refunds every open offer.'],
  ['Award participation points', 'participationEnabled', !!cl.settings.participation?.enabled, 'Needs team decision (proposal §5). One point per completed session of 5+ questions, max 3/week, regardless of score. Points are visible to students and exportable as CSV. Off by default.'],
];
const statusClass = (t) => 'badge ' + (t.status === 'accepted' ? 'published' : t.status === 'open' ? 'draft' : 'plain');
const targetId = useId();
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!course">You have no assigned courses.</p>
    <template v-else>
      <Heading title="Settings"><CoursePicker :courses="courses" /></Heading>
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
      <div v-for="cl in course.classes" :key="cl.id" class="panel">
        <h3>{{ cl.name }}</h3>
        <label v-for="[label, key, checked, help] in toggles(cl)" :key="key" style="font-weight: 400; color: inherit; margin: 8px 0">
          <input type="checkbox" :checked="checked" @change="toggle(cl, key)($event)" /> <b>{{ label }}</b>
          <div class="small muted" style="margin-left: 24px">{{ help }}</div>
        </label>
        <details style="margin-top: 10px">
          <summary>Trade log ({{ classTrades[cl.id].length }})</summary>
          <div v-if="classTrades[cl.id].length" class="table-wrap">
            <table>
              <tbody>
                <tr v-for="t in classTrades[cl.id]" :key="t.id">
                  <td class="small muted">{{ when(t.createdAt) }}</td>
                  <td>{{ t.from }}</td>
                  <td>{{ `${fmtBundle(t.give, RES)} for ${fmtBundle(t.want, RES)}` }}</td>
                  <td><span :class="statusClass(t)">{{ t.status }}</span></td>
                  <td>{{ t.acceptedByName || '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="small muted">No trades yet.</p>
        </details>
      </div>
    </template>
  </template>
</template>
