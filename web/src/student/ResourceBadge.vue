<script setup>
import { computed } from 'vue';
import { store } from './home.js';

const text = computed(() => {
  const home = store.home;
  return Object.entries(home.catalog.resources).map(([k, d]) => `${d.emoji} ${home.inventory.resources[k] || 0}`).join('  ');
});
</script>

<template>
  <span v-if="store.home" class="badge plain">{{ text }}</span>
</template>
