<script setup>
// The parent makes sure S.classId is one of the courses' classes before
// loading data. Classes are grouped under their course when the professor
// teaches more than one.
import { computed } from 'vue';
import { S, rerender } from '../api.js';
const props = defineProps({ courses: { type: Array, required: true } });
const withClasses = computed(() => props.courses.filter((c) => c.classes.length));
function pick(e) {
  S.classId = e.target.value;
  rerender();
}
</script>

<template>
  <select style="width: auto; max-width: 100%" :value="S.classId" aria-label="Class" @change="pick">
    <template v-if="withClasses.length > 1">
      <optgroup v-for="c in withClasses" :key="c.id" :label="c.title">
        <option v-for="cl in c.classes" :key="cl.id" :value="cl.id">{{ cl.name }}</option>
      </optgroup>
    </template>
    <template v-else>
      <option v-for="cl in withClasses[0]?.classes || []" :key="cl.id" :value="cl.id">{{ cl.name }}</option>
    </template>
  </select>
</template>
