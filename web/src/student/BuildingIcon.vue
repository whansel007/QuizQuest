<script setup>
defineProps({ building: { type: String, required: true } });
</script>

<template>
  <svg class="building-icon" viewBox="0 0 48 48" focusable="false" aria-hidden="true">
    <g v-if="building === 'library'" stroke="#57412f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m8 29 20-9 13 6v13l-20 8-13-7V29Z" fill="#fff4d3"/>
      <path d="m8 29 20 7 13-10M28 36v11" fill="none"/>
      <path d="m11 20 17-9 13 5v12l-17 8-13-6V20Z" fill="#6db8cf"/>
      <path d="m11 20 17 6 13-10M28 26v10" fill="none"/>
      <path d="m15 12 15-8 12 5v11l-15 7-12-5V12Z" fill="#e9ad4c"/>
      <path d="m15 12 12 5 15-8M27 17v10" fill="none"/>
      <path d="M36 10v8l-3-2-3 4v-9" fill="#d86f6b"/>
    </g>

    <g v-else-if="building === 'workshop'" stroke="#57412f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="m10 37 21-21 6 6-21 21-6-6Z" fill="#bc7541"/>
      <path d="m26 13 5-6 5 5 5-2 3 4-5 5 3 4-5 5-5-6-6-1 4-4-4-4Z" fill="#91b3bc"/>
      <path d="m33 11 5 5m-7 1 5 5M13 36l4 4" fill="none" stroke="#f2cf8c" stroke-width="1.6"/>
      <path d="M8 41 7 44l3-1" fill="#e9ad4c"/>
    </g>

    <g v-else-if="building === 'garden'" stroke="#57412f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M11 38c4-4 8-6 13-6s9 2 13 6l-3 5H14l-3-5Z" fill="#a9663d"/>
      <path d="M24 33V17" fill="none" stroke="#557b43" stroke-width="3"/>
      <path d="M24 23c-8 1-12-3-12-10 8-1 13 2 12 10Z" fill="#7fae58"/>
      <path d="M24 19c1-8 6-12 14-10 0 8-5 12-14 10Z" fill="#9ac765"/>
      <path d="m16 38 3 3m13-4-3 4" fill="none" stroke="#df9a58" stroke-width="1.5"/>
      <circle cx="24" cy="8" r="2.2" fill="#f0c75f" stroke="none"/>
    </g>

    <g v-else stroke="#57412f" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 39h30l-3-5H12l-3 5Z" fill="#ad7646"/>
      <path d="M14 34V21h20v13M17 21l7-8 7 8" fill="#e7c97d"/>
      <path d="M19 34V24m10 10V24M14 28h20M24 24v10" fill="none"/>
      <path d="M21 13h6V8h-6z" fill="#f5e7bc"/>
      <path d="M24 8V4l9 3-9 3" fill="#d87361"/>
      <path d="M11 43h26" fill="none" stroke="#68844b" stroke-width="2"/>
    </g>
  </svg>
</template>

<style scoped>
.building-icon { display: block; flex: none; }
</style>
