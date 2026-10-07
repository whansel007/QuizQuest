<script setup>
// The explanation / rewards block shown after an answer (Practice and World).
// Extra content (e.g. what the World answer gathered) goes in the slot.
import { computed } from 'vue';

const props = defineProps({ r: { type: Object, required: true }, correctText: { type: String, default: 'Correct!' } });
const title = computed(() => {
  const r = props.r;
  if (r.timedOut) return 'Time is up.';
  if (r.blank) return 'No answer given.';
  if (r.correct) return props.correctText;
  if (r.reveal?.partial) return `Partly right (${Math.round(r.reveal.partial * 100)}%).`;
  return 'Not quite.';
});
</script>

<template>
  <div>
    <div class="note" :class="r.correct ? 'good' : 'bad'" style="margin-top: 14px">
      <b>{{ title }}</b> {{ r.explanation }}
      <div v-if="r.provisional" class="small" style="margin-top: 4px">This mark is provisional - your professor may review it.</div>
    </div>
    <div v-if="r.sources?.length" class="small muted">From: {{ r.sources.map((s) => s.title).join(', ') }}</div>
    <div v-if="r.rewards?.length" class="small">{{ r.rewards.map((x) => `+${x.granted} 🪙 ${x.reason}`).join(' · ') }}</div>
    <slot />
  </div>
</template>
