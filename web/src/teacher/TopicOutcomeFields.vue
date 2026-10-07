<script setup>
// Topic + learning outcome selects that stay in sync: changing the topic
// keeps the outcome if it belongs to the new topic, else picks its first.
import { computed, watch } from 'vue';
import Field from '../components/Field.vue';

const props = defineProps({ course: { type: Object, required: true }, disabled: Boolean, title: { type: String, default: null } });
const topicId = defineModel('topicId', { type: String });
const outcomeId = defineModel('outcomeId', { type: String });
const outcomes = computed(() => props.course.topics.find((t) => t.id === topicId.value)?.outcomes || []);
watch(topicId, () => {
  if (!outcomes.value.some((o) => o.id === outcomeId.value)) outcomeId.value = outcomes.value[0]?.id;
});
</script>

<template>
  <Field class="grow" label="Topic" v-slot="{ id }">
    <select :id="id" v-model="topicId" :disabled="disabled" :title="title">
      <option v-for="t in course.topics" :key="t.id" :value="t.id">{{ t.name }}</option>
    </select>
  </Field>
  <Field class="grow" label="Learning outcome" v-slot="{ id }">
    <select :id="id" v-model="outcomeId" :disabled="disabled" :title="title">
      <option v-for="o in outcomes" :key="o.id" :value="o.id">{{ o.text }}</option>
    </select>
  </Field>
</template>
