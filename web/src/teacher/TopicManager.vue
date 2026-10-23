<script setup>
// ============================================================
// Weekly topics of a course: what each already has (files, report,
// questions), plus add / edit / delete. Every class (tutorial group) of
// the course shares these topics and everything grouped under them.
// ============================================================
import { ref, computed, watch } from 'vue';
import { S, api, rerender } from '../api.js';
import { toast } from '../ui.js';
import Field from '../components/Field.vue';
import AsyncButton from '../components/AsyncButton.vue';
import TopicForm from './TopicForm.vue';
import { loadCourses, topicLabel } from './courses.js';

const props = defineProps({
  course: { type: Object, required: true },
  stamp: { type: Number, default: 0 }, // bump to reload the counts
});
const emit = defineEmits(['select']);
const summary = ref(null);
const error = ref('');
const adding = ref(false);
const showAll = ref(false);
const editing = ref(null); // { id, week, name, addOutcome }

async function load() {
  try {
    summary.value = await api('GET', `/api/teacher/courses/${props.course.id}/topics`);
    error.value = '';
  } catch (err) {
    error.value = err.message;
  }
}
watch(() => props.stamp, load, { immediate: true });

// follows the page's topic filter: one row when a topic is chosen
const rows = computed(() => (summary.value?.topics || []).filter((t) => showAll.value || !S.topicId || t.topicId === S.topicId));
const topicOf = (id) => props.course.topics.find((t) => t.id === id);
function edit(row) {
  editing.value = { id: row.topicId, week: row.week ?? '', name: row.name, addOutcome: '' };
}
async function saveEdit() {
  const e = editing.value;
  await api('PUT', `/api/teacher/topics/${e.id}`, {
    name: e.name,
    week: e.week === '' || e.week === null ? null : Number(e.week),
    ...(e.addOutcome.trim() && { addOutcome: e.addOutcome }),
  });
  toast('Topic saved');
  await loadCourses(true);
  rerender();
}
async function remove(row) {
  if (!window.confirm(`Delete the topic "${row.name}"? It has no material or questions yet.`)) return;
  await api('DELETE', `/api/teacher/topics/${row.topicId}`);
  if (S.topicId === row.topicId) S.topicId = '';
  toast('Topic deleted');
  await loadCourses(true);
  rerender();
}
function created() {
  adding.value = false;
  rerender();
}
const reportText = (r) => (!r ? '—' : r.saved ? `saved (v${r.revision})` : r.status === 'complete' ? 'not saved yet' : r.status);
</script>

<template>
  <div class="panel">
    <div class="row">
      <h3 class="grow">Weekly topics</h3>
      <button v-if="!adding" class="btn small" @click="adding = true">+ Add topic</button>
    </div>
    <p class="small muted">Manage weekly topics and their learning outcomes.<template v-if="S.topicId && summary?.topics.length > 1"> <button class="linklike" @click="showAll = !showAll">{{ showAll ? 'Show selected topic' : 'Show all topics' }}</button></template></p>
    <TopicForm v-if="adding" :course="course" @created="created" @cancel="adding = false" />
    <div v-if="error" class="note bad">{{ error }}</div>
    <p v-else-if="!summary" class="muted small">Loading…</p>
    <template v-else>
      <p v-if="!summary.topics.length" class="muted small">No topics yet. Add the first week's topic to start grouping material.</p>
      <div v-else class="table-wrap">
        <table class="dash-table topic-table">
          <thead><tr><th>Week</th><th>Topic</th><th>Files</th><th>Report</th><th>Questions</th><th></th></tr></thead>
          <tbody>
            <template v-for="row in rows" :key="row.topicId">
              <tr>
                <td class="num">{{ row.week ?? '—' }}</td>
                <td class="label">
                  <button class="linklike" :aria-label="`Show material for ${topicLabel(topicOf(row.topicId))}`" @click="emit('select', row.topicId)">{{ row.name }}</button>
                  <div class="small muted">{{ topicOf(row.topicId)?.outcomes.length || 0 }} learning outcome(s){{ row.passages ? ` · ${row.passages} added passage(s)` : '' }}</div>
                </td>
                <td class="num">{{ row.files }}</td>
                <td class="small">{{ reportText(row.report) }}</td>
                <td class="small">
                  {{ row.questions.published }} published<template v-if="row.questions.draft"> · <span class="badge draft">{{ row.questions.draft }} to review</span></template>
                </td>
                <td><button class="btn small" :aria-label="`Edit ${row.name}`" @click="edit(row)">Edit</button></td>
              </tr>
              <tr v-if="editing?.id === row.topicId" class="subrow">
                <td colspan="6">
                  <div class="row top">
                    <Field class="week-field" label="Week" v-slot="{ id }"><input :id="id" v-model.number="editing.week" type="number" min="1" max="52" step="1" placeholder="none" /></Field>
                    <Field class="grow" label="Topic name" v-slot="{ id }"><input :id="id" v-model="editing.name" type="text" maxlength="160" /></Field>
                  </div>
                  <ul v-if="topicOf(row.topicId)?.outcomes.length" class="small outcome-list">
                    <li v-for="o in topicOf(row.topicId).outcomes" :key="o.id">{{ o.text }}</li>
                  </ul>
                  <Field label="Add a learning outcome" v-slot="{ id }"><input :id="id" v-model="editing.addOutcome" type="text" maxlength="2000" placeholder="optional" /></Field>
                  <div class="actions">
                    <AsyncButton class="btn primary small" :disabled="!editing.name.trim()" :run="saveEdit">Save topic</AsyncButton>
                    <button class="btn small" @click="editing = null">Cancel</button>
                    <AsyncButton v-if="row.empty" class="btn small bad" :run="() => remove(row)">Delete topic</AsyncButton>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <p v-if="summary.unsortedFiles && !S.topicId" class="note warn small">{{ summary.unsortedFiles }} uploaded file(s) are not in a topic yet. Move them into their week under <b>Files not in a topic</b> below.</p>
    </template>
  </div>
</template>
