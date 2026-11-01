<script setup>
// Global sound on/off for the student app (beside the Tools button). Shares
// the saved setting with the World game and the Kingdom via sound.js.
import { soundState, toggleMuted } from '../sound.js';
</script>

<template>
  <button
    class="btn small sound-toggle"
    type="button"
    :aria-pressed="soundState.muted ? 'true' : 'false'"
    :aria-label="soundState.muted ? 'Turn sounds on' : 'Mute sounds'"
    :title="soundState.muted ? 'Sounds are off' : 'Sounds are on'"
    @click="toggleMuted"
  >
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 8h3l4-4v12l-4-4H3Z" fill="currentColor" />
      <path v-if="!soundState.muted" d="M13 7c1.4 1.6 1.4 4.4 0 6M15.5 5c2.6 2.8 2.6 7.2 0 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path v-else d="m13 7 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    </svg>
  </button>
</template>

<style scoped>
.sound-toggle { flex: none; align-self: stretch; display: inline-grid; place-items: center; min-width: 34px; }
.sound-toggle svg { width: 17px; height: 17px; display: block; }
.sound-toggle:focus-visible { outline: 3px solid #f2ba55; outline-offset: 2px; }
</style>
