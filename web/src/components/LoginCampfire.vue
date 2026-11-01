<script setup>
// ============================================================
// Sign-in page: a small storybook campfire on the paper beside
// the form, with a log seat and a cat toasting a marshmallow. Decorative only:
// hidden from assistive tech; the flames hold still when reduced
// motion is requested.
// ============================================================
import AvatarPreview from '../student/AvatarPreview.vue';
import { TOWN_AVATAR_ORIGINAL_COLOR } from '../../../config/tuning.js';
</script>

<template>
  <!-- Scalable composition: the two SVG layers use a 200×150 coordinate grid. -->
  <div class="login-campfire" aria-hidden="true">
  <svg class="campfire-scene" viewBox="0 0 200 150" focusable="false">
    <defs>
      <!-- Soft amber halo behind the fire. Adjust cx/cy to move its center, r to resize it. -->
      <radialGradient id="login-campfire-glow" cx="50%" cy="60%" r="50%">
        <!-- Bright center of the glow. -->
        <stop offset="0" stop-color="#F2BA55" stop-opacity=".55" />
        <!-- Transparent outer edge of the glow. -->
        <stop offset="1" stop-color="#F2BA55" stop-opacity="0" />
      </radialGradient>
    </defs>
    <!-- Large diffuse light around the fire; rx/ry control its width and height. -->
    <ellipse class="glow" cx="104" cy="96" rx="92" ry="54" fill="url(#login-campfire-glow)" />
    <!-- Ground shadow beneath the whole scene. -->
    <ellipse cx="104" cy="132" rx="84" ry="9" fill="#23382F" opacity=".13" />
    <!-- Grass tufts at the left and right edges. Each M starts a separate tuft. -->
    <path d="M-10 132 l4 -12 l3 12 M-20 132 l6 -9 l1 9 M250 133 l3 -11 l3 11 M240 133 l5 -8 l1 8" fill="none" stroke="#5F984C" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    <!-- Left log seat: rect is the bark; ellipse is the cut end. -->
    <rect x="10" y="112" width="44" height="15" rx="7" fill="#9E6238" stroke="#23382F" stroke-width="2.5" />
    <ellipse cx="50" cy="119.5" rx="5" ry="7" fill="#D8B27A" stroke="#23382F" stroke-width="2" />
    <!-- Right log seat: rect is the bark; ellipse is its cut end. -->
    <rect x="175" y="112" width="44" height="15" rx="7" fill="#9E6238" stroke="#23382F" stroke-width="2.5" />
    <ellipse cx="180" cy="119.5" rx="5" ry="7" fill="#D8B27A" stroke="#23382F" stroke-width="2" />
    <!-- Stone ring around the fire. The five ellipses are individual stones. -->
    <g stroke="#23382F" stroke-width="2">
      <ellipse cx="78" cy="124" rx="8" ry="5.5" fill="#AAB6A0" /> <!-- left stone -->
      <ellipse cx="92" cy="129" rx="8" ry="5.5" fill="#C2CDB6" /> <!-- front-left stone -->
      <ellipse cx="110" cy="130" rx="8" ry="5.5" fill="#AAB6A0" /> <!-- front-center stone -->
      <ellipse cx="127" cy="127" rx="8" ry="5.5" fill="#C2CDB6" /> <!-- front-right stone -->
      <ellipse cx="138" cy="120" rx="7" ry="5" fill="#AAB6A0" /> <!-- right stone -->
    </g>
    <!-- First crossed log: dark outline, then warm wood fill. -->
    <path d="M84 122 L126 106" stroke="#23382F" stroke-width="9" stroke-linecap="round" />
    <path d="M84 122 L126 106" stroke="#9E6238" stroke-width="5.5" stroke-linecap="round" />
    <!-- Second crossed log: dark outline, then darker wood fill. -->
    <path d="M126 122 L84 106" stroke="#23382F" stroke-width="9" stroke-linecap="round" />
    <path d="M126 122 L84 106" stroke="#6B4128" stroke-width="5.5" stroke-linecap="round" />
    <!-- Three flame shapes. Their d values control the silhouette; the CSS animates the group. -->
    <g class="flames">
      <path class="flame outer" d="M83 112 C80 92 94 86 96 64 C106 78 104 84 112 76 C124 94 128 104 125 112 Z" fill="#EF7137" stroke="#23382F" stroke-width="2.5" stroke-linejoin="round" /> <!-- orange outline flame -->
      <path class="flame mid" d="M92 112 C90 98 100 94 101 80 C108 90 110 92 113 88 C120 100 118 108 117 112 Z" fill="#F2BA55" /> <!-- gold flame -->
      <path class="flame core" d="M99 112 C98 104 104 100 105 93 C110 101 112 106 110 112 Z" fill="#FFF1B8" /> <!-- pale hot center -->
    </g>
    <!-- Floating sparks; cx/cy place them, r sets their size. -->
    <g class="sparks" fill="#F2BA55">
      <circle class="spark s1" cx="98" cy="58" r="2" />
      <circle class="spark s2" cx="114" cy="50" r="1.6" />
    </g>
  </svg>
  <!-- Foreground layer sits over the fire: move the marshmallow rect and stick path together. -->
  <svg class="campfire-foreground" viewBox="0 0 200 150" aria-hidden="true" focusable="false">
    <!-- Skewer is drawn first so the marshmallow can cover its tip. -->
    <path d="M170 108 L130 70" stroke="#6B4128" stroke-width="3" stroke-linecap="round" />
    <!-- Marshmallow drawn over the skewer. x/y move it; width/height resize it; rotate sets its angle. -->
    <rect x="120" y="45" width="12" height="9" rx="3" transform="rotate(31 90 66.5)" fill="#FFF8E4" stroke="#23382F" stroke-width="2"/>
  </svg>
  <!-- Reusable player avatar canvas. Change top/left/size in CSS; these props select gray fur, top hat, and star pin. -->
  <AvatarPreview class="campfire-cat" :color="TOWN_AVATAR_ORIGINAL_COLOR" hat-id="hat_crown" accessory-id="accessory_star_pin" />
  </div>
</template>

<style scoped>
/* Overall illustration box. aspect-ratio follows the SVG viewBox. */
.login-campfire { position: relative; display: block; aspect-ratio: 4 / 3; overflow: visible; pointer-events: none; }
/* Main campfire SVG fills the box. */
.campfire-scene { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
/* Marshmallow and skewer layer; z-index puts it over the main scene. */
.campfire-foreground { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; overflow: visible; }
/* Cat position and scale as percentages of the illustration box. */
.campfire-cat { position: absolute; z-index: 2; top: 33%; left: 80%; width: 38% !important; height: 50.667% !important; margin: 0 !important; }
/* Anchor the flame animation at its base. */
.flames { transform-box: fill-box; transform-origin: 50% 100%; }
@media (prefers-reduced-motion: no-preference) {
  /* Gentle fire movement, glow pulse, and floating sparks when motion is allowed. */
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
