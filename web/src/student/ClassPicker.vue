<script setup>
// Switch between the student's classes (remounts the current tab)
import { S, rerender } from '../api.js';
import { store } from './home.js';

function pick(e) {
  S.classId = e.target.value;
  rerender();
}
</script>

<template>
  <select v-if="store.home.classes.length > 1" style="width: auto" aria-label="Class" :value="S.classId" @change="pick">
    <option v-for="c in store.home.classes" :key="c.id" :value="c.id">{{ c.name }}</option>
  </select>
  <span v-else class="badge plain">{{ store.home.classes[0]?.name || 'No class' }}</span>
</template>
