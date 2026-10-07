<script setup>
import { S, rerender } from '../api.js';
defineProps({ courses: { type: Array, required: true } });
function pick(e) {
  S.courseId = e.target.value;
  rerender();
}
</script>

<template>
  <span v-if="courses.length < 2" class="badge plain">{{ courses.find((c) => c.id === S.courseId)?.title }}</span>
  <select v-else style="width: auto" :value="S.courseId" @change="pick">
    <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
  </select>
</template>
