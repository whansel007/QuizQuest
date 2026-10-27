<script setup>
// Thin Vue wrapper around the shared talent badge builder, so the World page and
// the in-game I card render the exact same circle, colour and icon.
import { ref, watchEffect } from 'vue';
import { createTalentBadge } from '../../../public/hero-lab/talent-badge.js';

const props = defineProps({
  heroId: { type: String, required: true },
  type: { type: String, default: 'physical' },
  talent: { type: Object, default: null },
  // Icons live under /hero-lab/ on the server, not at the site root.
  base: { type: String, default: '/hero-lab/' },
});

const host = ref(null);
watchEffect(() => {
  if (!host.value) return;
  host.value.replaceChildren(createTalentBadge({
    heroId: props.heroId, type: props.type, talent: props.talent, base: props.base,
  }));
});
</script>

<template>
  <span ref="host" class="talent-badge-host" />
</template>

<style scoped>
.talent-badge-host { display: inline-flex; }
</style>
