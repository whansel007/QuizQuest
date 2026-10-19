<script setup>
// QuizQuest logo: a quest shield holding a "Q", plus the wordmark.
// size: the shield's height in px. stacked: wordmark under the shield.
defineProps({ size: { type: Number, default: 48 }, stacked: { type: Boolean, default: false } });
</script>

<template>
  <div class="qq-logo" :class="{ stacked }">
    <svg :width="size" :height="size" viewBox="0 0 64 64" aria-hidden="true" class="qq-logo-mark">
      <defs>
        <linearGradient id="qq-logo-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#7dd3fc" />
          <stop offset="0.5" stop-color="#1fb2d6" />
          <stop offset="1" stop-color="#3b6fe0" />
        </linearGradient>
        <linearGradient id="qq-logo-shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0.45" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d="M32 3 L55 12.5 V33 C55 46.5 45 56.5 32 61 C19 56.5 9 46.5 9 33 V12.5 Z" fill="url(#qq-logo-fill)" />
      <path d="M32 6.5 L52 14.8 V30 C40 27 24 27 12 30 V14.8 Z" fill="url(#qq-logo-shine)" />
      <circle cx="31" cy="32" r="11.5" fill="none" stroke="#fff" stroke-width="5.5" />
      <path d="M36.5 37.5 L44.5 45.5" stroke="#fff" stroke-width="5.5" stroke-linecap="round" />
      <path d="M50 3.5 l1.8 4.4 4.4 1.8 -4.4 1.8 -1.8 4.4 -1.8 -4.4 -4.4 -1.8 4.4 -1.8 Z" fill="#9fe8ff" class="qq-logo-spark" />
    </svg>
    <span class="qq-logo-word" :style="{ fontSize: Math.round(size * 0.62) + 'px' }">Quiz<span>Quest</span></span>
  </div>
</template>
