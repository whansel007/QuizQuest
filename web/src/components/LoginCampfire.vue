<script setup>
// ============================================================
// Sign-in page: a small storybook campfire on the paper beside
// the form, with a log seat and a toasting stick. Decorative only:
// hidden from assistive tech; the flames hold still when reduced
// motion is requested.
// ============================================================
</script>

<template>
  <svg class="login-campfire" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="login-campfire-glow" cx="50%" cy="60%" r="50%">
        <stop offset="0" stop-color="#F2BA55" stop-opacity=".55" />
        <stop offset="1" stop-color="#F2BA55" stop-opacity="0" />
      </radialGradient>
    </defs>
    <ellipse class="glow" cx="104" cy="96" rx="92" ry="54" fill="url(#login-campfire-glow)" />
    <!-- ground shadow and a few grass tufts -->
    <ellipse cx="104" cy="132" rx="84" ry="9" fill="#23382F" opacity=".13" />
    <path d="M18 132 l4 -12 l3 12 M24 132 l6 -9 l1 9 M176 133 l3 -11 l3 11 M182 133 l5 -8 l1 8" fill="none" stroke="#5F984C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    <!-- log seat on the left -->
    <rect x="22" y="112" width="44" height="15" rx="7" fill="#9E6238" stroke="#23382F" stroke-width="2.5" />
    <ellipse cx="62" cy="119.5" rx="5" ry="7" fill="#D8B27A" stroke="#23382F" stroke-width="2" />
    <!-- toasting stick with a marshmallow, leaning toward the fire -->
    <path d="M40 112 L92 80" stroke="#6B4128" stroke-width="3" stroke-linecap="round" />
    <rect x="88" y="73" width="11" height="9" rx="3" transform="rotate(-31 93 78)" fill="#FFF8E4" stroke="#23382F" stroke-width="2" />
    <!-- stone ring, crossed logs, then the flames -->
    <g stroke="#23382F" stroke-width="2">
      <ellipse cx="78" cy="124" rx="8" ry="5.5" fill="#AAB6A0" />
      <ellipse cx="92" cy="129" rx="8" ry="5.5" fill="#C2CDB6" />
      <ellipse cx="110" cy="130" rx="8" ry="5.5" fill="#AAB6A0" />
      <ellipse cx="127" cy="127" rx="8" ry="5.5" fill="#C2CDB6" />
      <ellipse cx="138" cy="120" rx="7" ry="5" fill="#AAB6A0" />
    </g>
    <path d="M84 122 L126 106" stroke="#23382F" stroke-width="9" stroke-linecap="round" />
    <path d="M84 122 L126 106" stroke="#9E6238" stroke-width="5.5" stroke-linecap="round" />
    <path d="M126 122 L84 106" stroke="#23382F" stroke-width="9" stroke-linecap="round" />
    <path d="M126 122 L84 106" stroke="#6B4128" stroke-width="5.5" stroke-linecap="round" />
    <g class="flames">
      <path class="flame outer" d="M83 112 C80 92 94 86 96 64 C106 78 104 84 112 76 C124 94 128 104 125 112 Z" fill="#EF7137" stroke="#23382F" stroke-width="2.5" stroke-linejoin="round" />
      <path class="flame mid" d="M92 112 C90 98 100 94 101 80 C108 90 110 92 113 88 C120 100 118 108 117 112 Z" fill="#F2BA55" />
      <path class="flame core" d="M99 112 C98 104 104 100 105 93 C110 101 112 106 110 112 Z" fill="#FFF1B8" />
    </g>
    <g class="sparks" fill="#F2BA55">
      <circle class="spark s1" cx="98" cy="58" r="2" />
      <circle class="spark s2" cx="114" cy="50" r="1.6" />
    </g>
  </svg>
</template>

<style scoped>
.login-campfire { display: block; overflow: visible; pointer-events: none; }
.flames { transform-box: fill-box; transform-origin: 50% 100%; }
@media (prefers-reduced-motion: no-preference) {
  .flames { animation: campfire-flicker 1.6s ease-in-out infinite alternate; }
  .flame.mid { transform-box: fill-box; transform-origin: 50% 100%; animation: campfire-sway 1.1s ease-in-out infinite alternate; }
  .glow { animation: campfire-glow 2.4s ease-in-out infinite alternate; }
  .spark { animation: campfire-spark 2.8s ease-out infinite; }
  .spark.s2 { animation-delay: 1.4s; }
}
@keyframes campfire-flicker { from { transform: scale(1, 1); } to { transform: scale(.96, 1.06); } }
@keyframes campfire-sway { from { transform: skewX(-3deg); } to { transform: skewX(4deg); } }
@keyframes campfire-glow { from { opacity: .75; } to { opacity: 1; } }
@keyframes campfire-spark { 0% { opacity: 0; transform: translateY(14px); } 25% { opacity: 1; } 100% { opacity: 0; transform: translateY(-18px); } }
</style>
