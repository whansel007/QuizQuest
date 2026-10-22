<script setup>
// Topic + learning outcome selects that stay in sync: changing the topic
// keeps the outcome if it belongs to the new topic, else picks its first.
// With `allowNew`, both selects also offer a NEW choice: the professor
// names a new topic (and week) and/or types a new learning outcome, which
// the server creates when the material is saved.
import { computed, watch } from 'vue';
import Field from '../components/Field.vue';
import { topicLabel, NEW } from './courses.js';

const props = defineProps({ course: { type: Object, required: true }, disabled: Boolean, title: { type: String, default: null }, allowNew: Boolean });
const topicId = defineModel('topicId', { type: String });
const outcomeId = defineModel('outcomeId', { type: String });
const topicName = defineModel('topicName', { type: String, default: '' });
const topicWeek = defineModel('topicWeek', { type: [Number, String], default: null });
const outcomeText = defineModel('outcomeText', { type: String, default: '' });
const newTopic = computed(() => props.allowNew && topicId.value === NEW);
const typing = computed(() => props.allowNew && outcomeId.value === NEW);
const outcomes = computed(() => props.course.topics.find((t) => t.id === topicId.value)?.outcomes || []);
watch(
  topicId,
  () => {
    if (props.allowNew && !topicId.value && !props.course.topics.length) topicId.value = NEW;
    // a new topic has no outcomes yet, so its outcome is always typed
    if (newTopic.value) {
      outcomeId.value = NEW;
      // suggest the week after the latest one
      const weeks = props.course.topics.map((t) => t.week).filter(Number.isInteger);
      if (topicWeek.value == null) topicWeek.value = weeks.length ? Math.min(52, Math.max(...weeks) + 1) : 1;
      return;
    }
    if (typing.value && outcomes.value.length) return; // keep what is being typed
    if (!outcomes.value.some((o) => o.id === outcomeId.value)) outcomeId.value = outcomes.value[0]?.id ?? (props.allowNew ? NEW : undefined);
  },
  { immediate: true },
);
</script>

<template>
  <Field class="grow" label="Topic" v-slot="{ id }">
    <select :id="id" v-model="topicId" :disabled="disabled" :title="title">
      <option v-for="t in course.topics" :key="t.id" :value="t.id">{{ topicLabel(t) }}</option>
      <option v-if="allowNew" :value="NEW">+ New topic…</option>
    </select>
  </Field>
  <Field v-if="!newTopic" class="grow" label="Learning outcome" v-slot="{ id }">
    <select :id="id" v-model="outcomeId" :disabled="disabled" :title="title">
      <option v-for="o in outcomes" :key="o.id" :value="o.id">{{ o.text }}</option>
      <option v-if="allowNew" :value="NEW">+ Type a new learning outcome…</option>
    </select>
  </Field>
  <div v-if="newTopic || typing" class="row top" style="flex-basis: 100%">
    <template v-if="newTopic">
      <Field class="week-field" label="Week" v-slot="{ id }"><input :id="id" v-model.number="topicWeek" type="number" min="1" max="52" step="1" placeholder="none" :disabled="disabled" /></Field>
      <Field class="grow" label="New topic name" v-slot="{ id }"><input :id="id" v-model="topicName" type="text" maxlength="160" placeholder="e.g. Networking basics" :disabled="disabled" /></Field>
    </template>
    <Field style="flex-basis: 100%" :label="newTopic ? 'Learning outcome for the new topic' : 'New learning outcome'" v-slot="{ id }">
      <textarea :id="id" v-model="outcomeText" rows="2" maxlength="2000" placeholder="e.g. Explain how latency and bandwidth affect network performance" :disabled="disabled"></textarea>
      <span class="small muted">Saved to this topic with the material, so later material and questions can use it too.</span>
    </Field>
  </div>
</template>
