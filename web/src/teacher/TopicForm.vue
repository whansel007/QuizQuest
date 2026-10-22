<script setup>
// Add a weekly topic: an optional week number, a name and (optionally) its
// first learning outcome. The new topic becomes the selected one.
import { ref } from 'vue';
import { S, api } from '../api.js';
import { toast } from '../ui.js';
import Field from '../components/Field.vue';
import AsyncButton from '../components/AsyncButton.vue';
import { loadCourses } from './courses.js';

const props = defineProps({ course: { type: Object, required: true } });
const emit = defineEmits(['created', 'cancel']);
// suggest the week after the latest one
const weeks = props.course.topics.map((t) => t.week).filter(Number.isInteger);
const week = ref(weeks.length ? Math.min(52, Math.max(...weeks) + 1) : 1);
const name = ref('');
const outcome = ref('');

async function save() {
  const topic = await api('POST', `/api/teacher/courses/${props.course.id}/topics`, {
    name: name.value,
    week: week.value === '' || week.value === null ? null : Number(week.value),
    outcome: outcome.value,
  });
  await loadCourses(true);
  S.topicId = topic.id;
  toast(`Added ${topic.week ? `Week ${topic.week} · ` : ''}${topic.name}`);
  emit('created', topic);
}
</script>

<template>
  <div class="topic-form">
    <div class="row top">
      <Field class="week-field" label="Week" v-slot="{ id }"><input :id="id" v-model.number="week" type="number" min="1" max="52" step="1" placeholder="none" /></Field>
      <Field class="grow" label="Topic name" v-slot="{ id }"><input :id="id" v-model="name" type="text" maxlength="160" placeholder="e.g. Networking basics" /></Field>
    </div>
    <Field label="First learning outcome (optional)" v-slot="{ id }"><input :id="id" v-model="outcome" type="text" maxlength="2000" placeholder="e.g. Describe how data moves across a network" /></Field>
    <div class="actions">
      <AsyncButton class="btn primary" :disabled="!name.trim()" :run="save">Add topic</AsyncButton>
      <button type="button" class="btn" @click="emit('cancel')">Cancel</button>
    </div>
  </div>
</template>
