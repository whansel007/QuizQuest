<script setup>
// The parent makes sure S.classId is one of `classes` before loading data.
import { S, rerender } from '../api.js';
defineProps({ classes: { type: Array, required: true } });
function pick(e) {
  S.classId = e.target.value;
  rerender();
}
</script>

<template>
  <select style="width: auto" aria-label="Class" :value="S.classId" @change="pick">
    <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</option>
  </select>
</template>
