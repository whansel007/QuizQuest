<script setup>
import { pct } from '../ui.js';
defineProps({ value: { type: Number, default: 0 } });
</script>

<template>
  <div class="meter" :title="pct(value)"><div :style="{ width: Math.round((value || 0) * 100) + '%' }"></div></div>
</template>
