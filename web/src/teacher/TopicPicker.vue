<script setup>
// Weekly topic select bound to the shared S.topicId. The parent decides
// what a change means (reload numbers, remount a workflow...).
import { S } from '../api.js';
import { topicLabel } from './courses.js';
defineProps({
  topics: { type: Array, required: true },
  allowAll: Boolean, // adds "All topics" ('')
  counts: { type: Object, default: null }, // optional { topicId: n } shown after each name
  total: { type: Number, default: null }, // shown after "All topics"
});
const emit = defineEmits(['change']);
function pick(e) {
  S.topicId = e.target.value;
  emit('change', S.topicId);
}
</script>

<template>
  <select style="width: auto; max-width: 100%" :value="S.topicId" aria-label="Weekly topic" @change="pick">
    <option v-if="allowAll" value="">All topics{{ total === null ? '' : ` (${total})` }}</option>
    <option v-for="t in topics" :key="t.id" :value="t.id">{{ topicLabel(t) }}{{ counts ? ` (${counts[t.id] || 0})` : '' }}</option>
  </select>
</template>
