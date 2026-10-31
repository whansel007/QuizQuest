<script setup>
// Decorative curiosities for the Library shelves. Purely set dressing: no
// interaction and hidden from assistive technology.
defineProps({ kind: { type: String, required: true } });
</script>

<template>
  <svg class="library-prop" :class="`prop-${kind}`" viewBox="0 0 80 96" aria-hidden="true" focusable="false">
    <g v-if="kind === 'fireflies'">
      <path d="M22 30h36v4c6 4 9 12 9 24v18c0 9-6 14-14 14H27c-8 0-14-5-14-14V58c0-12 3-20 9-24Z" fill="#dcebc8" fill-opacity=".45" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M20 22h40v9H20Z" fill="#a8774a" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M24 26h32" stroke="#7a5534" stroke-width="2" />
      <path d="M18 57c6 8 0 18 7 26" fill="none" stroke="#fff8e4" stroke-opacity=".7" stroke-width="3" stroke-linecap="round" />
      <circle class="firefly f1" cx="34" cy="58" r="3.2" fill="#f7e27a" />
      <circle class="firefly f2" cx="50" cy="48" r="2.6" fill="#f7e27a" />
      <circle class="firefly f3" cx="45" cy="74" r="3" fill="#f7e27a" />
      <circle class="firefly f4" cx="29" cy="76" r="2.2" fill="#f7e27a" />
    </g>
    <g v-else-if="kind === 'wands'">
      <path d="M18 88h44l-4-30H22Z" fill="#8062a9" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M24 64h32" stroke="#fbf2d8" stroke-width="2" stroke-dasharray="3 4" />
      <path d="m30 60-8-46" stroke="#5a3d27" stroke-width="5" stroke-linecap="round" />
      <path d="m30 60-8-46" stroke="#23382f" stroke-width="1.5" stroke-linecap="round" fill="none" opacity=".4" />
      <path d="m42 60 2-50" stroke="#c99c67" stroke-width="5" stroke-linecap="round" />
      <path d="m52 60 9-40" stroke="#3f4b5a" stroke-width="5" stroke-linecap="round" />
      <path class="spark" d="M44 4v8M40 8h8" stroke="#f2ba55" stroke-width="2.5" stroke-linecap="round" />
      <circle cx="61" cy="19" r="3.5" fill="#6db8cf" stroke="#23382f" stroke-width="1.5" />
    </g>
    <g v-else-if="kind === 'stones'">
      <path d="M8 90c2-12 12-18 22-18s18 6 20 18Z" fill="#6db8cf" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M36 90c0-16 10-26 20-26s16 10 16 26Z" fill="#8062a9" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M26 90c1-8 6-12 11-12s10 4 10 12Z" fill="#7fae58" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <circle class="glow" cx="56" cy="76" r="14" fill="#d8c8ff" opacity=".3" />
      <path d="M17 80c3-4 7-5 10-4M48 72c3-3 7-3 9-1" fill="none" stroke="#fff8e4" stroke-width="2" stroke-linecap="round" />
    </g>
    <g v-else-if="kind === 'tarot'">
      <g transform="rotate(-12 28 70)"><rect x="12" y="44" width="30" height="46" rx="3" fill="#254937" stroke="#23382f" stroke-width="2.5" /><path d="M27 54v26M17 67h20" stroke="#f2ba55" stroke-width="2" /><circle cx="27" cy="67" r="6" fill="none" stroke="#f2ba55" stroke-width="2" /></g>
      <g transform="rotate(9 52 70)"><rect x="36" y="42" width="30" height="48" rx="3" fill="#fbf2d8" stroke="#23382f" stroke-width="2.5" /><path d="M51 52a9 9 0 1 0 6 16 7 7 0 1 1-6-16Z" fill="#8062a9" stroke="#23382f" stroke-width="1.5" /><path d="M42 82h18" stroke="#d86f6b" stroke-width="2" /></g>
    </g>
    <g v-else-if="kind === 'potions'">
      <path d="M22 50h10v8c7 4 10 10 10 17 0 9-6 15-15 15s-15-6-15-15c0-7 3-13 10-17Z" fill="#d86f6b" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M14 76h26" stroke="#fbf2d8" stroke-width="2" opacity=".6" />
      <path d="M21 44h12v7H21Z" fill="#a8774a" stroke="#23382f" stroke-width="2" />
      <path d="M50 34h12v18c6 4 8 9 8 16v18c0 3-2 4-4 4H46c-2 0-4-1-4-4V68c0-7 2-12 8-16Z" fill="#7fae58" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M48 28h16v7H48Z" fill="#a8774a" stroke="#23382f" stroke-width="2" />
      <circle class="bubble" cx="55" cy="72" r="2.5" fill="#fff8e4" opacity=".75" />
      <circle class="bubble b2" cx="61" cy="80" r="1.8" fill="#fff8e4" opacity=".75" />
    </g>
    <g v-else-if="kind === 'skull'">
      <path d="M8 90h64l-4-10H12Z" fill="#7a6545" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M22 80c-6-7-8-14-8-22 0-15 12-26 26-26s26 11 26 26c0 8-2 15-8 22Z" fill="#f4ecd6" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <path d="M21 39 15 24l12 9M59 39l6-15-12 9" fill="#f4ecd6" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <ellipse cx="31" cy="58" rx="6" ry="7" fill="#23382f" />
      <ellipse cx="49" cy="58" rx="6" ry="7" fill="#23382f" />
      <circle class="eye-glint" cx="33" cy="56" r="1.6" fill="#6db8cf" />
      <circle class="eye-glint" cx="51" cy="56" r="1.6" fill="#6db8cf" />
      <path d="M36 70h8l-4 4Z" fill="#23382f" />
      <path d="M32 80v-5M40 80v-5M48 80v-5" stroke="#23382f" stroke-width="2" />
    </g>
    <g v-else-if="kind === 'portrait'">
      <rect x="10" y="10" width="60" height="78" rx="4" fill="#b98a3e" stroke="#23382f" stroke-width="2.5" />
      <rect x="17" y="17" width="46" height="64" rx="22" fill="#3d4e5c" stroke="#23382f" stroke-width="2" />
      <path d="M24 81c0-14 7-22 16-22s16 8 16 22Z" fill="#5b4a6e" />
      <path d="M30 45 26 31l9 8M50 45l4-14-9 8" fill="#cbbfa8" stroke="#23382f" stroke-width="1.5" stroke-linejoin="round" />
      <circle cx="40" cy="50" r="13" fill="#cbbfa8" stroke="#23382f" stroke-width="1.5" />
      <g class="portrait-eyes"><circle cx="35" cy="49" r="2" fill="#23382f" /><circle cx="45" cy="49" r="2" fill="#23382f" /></g>
      <path d="M36 56q4 2 8 0" fill="none" stroke="#23382f" stroke-width="1.5" stroke-linecap="round" />
    </g>
    <g v-else-if="kind === 'candle'">
      <path d="M16 90h48l-6-8H22Z" fill="#c99c67" stroke="#23382f" stroke-width="2.5" stroke-linejoin="round" />
      <rect x="30" y="46" width="20" height="36" rx="2" fill="#fbf2d8" stroke="#23382f" stroke-width="2.5" />
      <path d="M33 46c0 6 3 7 3 12" fill="none" stroke="#e7d6ac" stroke-width="3" stroke-linecap="round" />
      <path d="M40 46v-6" stroke="#23382f" stroke-width="2" />
      <path class="flame" d="M40 22c6 7 7 12 0 18-7-6-6-11 0-18Z" fill="#f2ba55" stroke="#ef7137" stroke-width="2" stroke-linejoin="round" />
    </g>
  </svg>
</template>

<style scoped>
.library-prop { display: block; width: 100%; height: 100%; overflow: visible; }
.firefly { filter: drop-shadow(0 0 4px #f7e27a); animation: firefly-drift 3.4s ease-in-out infinite; }
.f2 { animation-delay: -1.1s; animation-duration: 4.1s; }
.f3 { animation-delay: -2.2s; animation-duration: 3.7s; }
.f4 { animation-delay: -.6s; animation-duration: 4.6s; }
.glow { animation: stone-glow 3.2s ease-in-out infinite; }
.flame { transform-origin: 40px 40px; animation: flame-flicker 1.6s ease-in-out infinite; }
.spark { animation: stone-glow 2.4s ease-in-out infinite; }
.bubble { animation: bubble-rise 3s ease-in infinite; }
.b2 { animation-delay: -1.4s; }
.portrait-eyes { animation: portrait-glance 7s ease-in-out infinite; }
@keyframes firefly-drift { 0%,100% { opacity: .35; transform: translate(0,0); } 50% { opacity: 1; transform: translate(2px,-4px); } }
@keyframes stone-glow { 0%,100% { opacity: .2; } 50% { opacity: .65; } }
@keyframes flame-flicker { 0%,100% { transform: scale(1) rotate(-2deg); } 50% { transform: scale(.92,1.06) rotate(2deg); } }
@keyframes bubble-rise { 0% { opacity: 0; transform: translateY(0); } 30% { opacity: .8; } 100% { opacity: 0; transform: translateY(-14px); } }
@keyframes portrait-glance { 0%,40%,100% { transform: translateX(0); } 48%,62% { transform: translateX(-2.5px); } 70%,86% { transform: translateX(2.5px); } }
@media (prefers-reduced-motion: reduce) {
  .firefly, .glow, .flame, .spark, .bubble, .portrait-eyes { animation: none; }
}
</style>
