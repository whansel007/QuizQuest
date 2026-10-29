<script setup>
// Line icons for the teacher sidebar, one per tab. Decorative: the
// button's text label (visible or visually hidden) carries the name.
defineProps({ tab: { type: String, required: true } });
</script>

<template>
  <svg class="t-nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <template v-if="tab === 'analytics'"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></template>
    <template v-else-if="tab === 'classes'"><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 13.7c2.4.2 4 1.8 4.5 4.6" /></template>
    <template v-else-if="tab === 'review'"><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="m8 9 1.6 1.6L12.5 7.6M8 15.5h8M14.5 10H16" /></template>
    <template v-else-if="tab === 'content'"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" /><path d="M9 13h6" /></template>
    <template v-else-if="tab === 'generate'"><path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.7 10.4 11.2 6 9.6 10.4 8Z" /><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z" /></template>
    <template v-else-if="tab === 'evaluation'"><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 3h6v3H9zM8.5 12.5l2.2 2.2 4.8-4.8" /></template>
    <template v-else-if="tab === 'settings'"><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></template>
    <template v-else><circle cx="12" cy="12" r="8" /></template>
  </svg>
</template>

<style scoped>
.t-nav-icon { width: 20px; height: 20px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
</style>
