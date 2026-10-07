<script setup>
// Page title with optional controls on the right (course/class pickers...)
defineProps({ title: { type: String, required: true } });
</script>

<template>
  <div class="row" style="margin-bottom: 14px">
    <h2 class="grow" style="margin: 0">{{ title }}</h2>
    <slot />
  </div>
</template>
