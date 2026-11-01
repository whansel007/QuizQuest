<script setup>
import { toRefs } from 'vue';
import SummonSky from '../../SummonSky.vue';


const props = defineProps({ context: { type: Object, required: true } });
const { CONSTELLATIONS, lensOn, lookThroughTelescope } = toRefs(props.context);
</script>

<template>
              <div class="sky-card">
                <div class="garden-sky" aria-hidden="true">
                  <SummonSky class="garden-star-sky" />
                  <figure v-for="c in CONSTELLATIONS" :key="c.id" class="constellation" :style="c.place">
                    <svg :viewBox="c.viewBox"><path :d="c.path" /><circle v-for="(star, i) in c.stars" :key="i" :class="{ bright: star[2] > 4 }" :cx="star[0]" :cy="star[1]" :r="star[2]" :style="{ animationDelay: `${-i * 0.7}s` }" /></svg>
                    <figcaption>{{ c.name }}</figcaption>
                  </figure>
                  <svg class="garden-horizon" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice">
                    <path d="M0 120C140 84 260 92 380 112s230 8 330-22 250-22 330 2 120 30 160 26V220H0Z" fill="#3f5e45" />
                    <path d="M0 150c160-30 300-22 450 4s260 12 400-14 260-8 350 18V220H0Z" fill="#567a4f" stroke="#23382f" stroke-width="3" />
                    <g stroke="#23382f" stroke-width="3" stroke-linecap="round"><path d="M520 150v-34M560 147v-34M600 146v-34M640 147v-34M680 149v-34M510 124h180M510 140h180" stroke="#8a6541" /></g>
                    <g><path d="M760 154v-56" stroke="#23382f" stroke-width="4" /><path d="M748 98h24l-4 18h-16Z" fill="#f2ba55" stroke="#23382f" stroke-width="3" stroke-linejoin="round" /><circle class="lantern-glow" cx="760" cy="107" r="22" fill="#f2ba55" opacity=".22" /></g>
                    <g><path d="M436 160v-52" stroke="#23382f" stroke-width="4" /><path d="M424 108h24l-4 18h-16Z" fill="#f2ba55" stroke="#23382f" stroke-width="3" stroke-linejoin="round" /><circle class="lantern-glow" cx="436" cy="117" r="22" fill="#f2ba55" opacity=".22" /></g>
                    <g stroke="#23382f" stroke-width="2"><circle cx="300" cy="158" r="8" fill="#d86f6b" /><circle cx="318" cy="152" r="7" fill="#f3cfd1" /><circle cx="336" cy="160" r="8" fill="#8062a9" /><circle cx="880" cy="160" r="8" fill="#f2ba55" /><circle cx="898" cy="154" r="7" fill="#d86f6b" /><circle cx="916" cy="162" r="7" fill="#f3cfd1" /><circle cx="1080" cy="168" r="8" fill="#8062a9" /><circle cx="1098" cy="162" r="7" fill="#f2ba55" /></g>
                    <g fill="#7fae58" stroke="#23382f" stroke-width="2"><path d="M290 172c4-10 10-14 18-12-2 8-8 12-18 12ZM340 174c-2-9 2-15 10-16 1 8-3 13-10 16ZM870 176c4-10 10-14 18-12-2 8-8 12-18 12ZM1090 182c-2-9 2-15 10-16 1 8-3 13-10 16Z" /></g>
                  </svg>
                </div>
                <button class="telescope-button" type="button" tabindex="-1" aria-label="Look through the telescope to open Hero Summon" :disabled="lensOn" @click="lookThroughTelescope">
                  <svg class="telescope-art" viewBox="0 0 220 200" aria-hidden="true" focusable="false">
                    <ellipse cx="110" cy="188" rx="92" ry="10" fill="#23382f" opacity=".35" />
                    <g stroke="#23382f" stroke-width="4" stroke-linecap="round"><path d="M110 104 54 184M110 104l58 80M110 104v80" stroke="#7a5534" stroke-width="9" /><path d="M110 104 54 184M110 104l58 80M110 104v80" fill="none" /></g>
                    <circle cx="110" cy="102" r="10" fill="#c99c67" stroke="#23382f" stroke-width="3" />
                    <g class="telescope-tube">
                      <path d="m40 96 120-52 12 28-120 52Z" fill="#c8963e" stroke="#23382f" stroke-width="4" stroke-linejoin="round" />
                      <path d="m70 83 8 28M128 58l9 28" stroke="#7a5534" stroke-width="6" />
                      <path d="m158 40 30-13 16 36-30 13Z" fill="#e8c57c" stroke="#23382f" stroke-width="4" stroke-linejoin="round" />
                      <path d="m190 30 10 23" stroke="#6db8cf" stroke-width="6" stroke-linecap="round" />
                      <path d="m24 100 18-8 10 24-18 8Z" fill="#7a5534" stroke="#23382f" stroke-width="4" stroke-linejoin="round" />
                      <path d="m62 86 70-30" stroke="#fff3d0" stroke-width="3" stroke-linecap="round" opacity=".6" />
                    </g>
                  </svg>
                </button>
                <div class="garden-caption">
                  <span class="scene-kicker">The star garden</span>
                  <h3>The stargazing telescope</h3>
                  <p>Follow a shooting star through the lens to visit Hero Summon. The visit is free, and summoning always asks you first.</p>
                  <button class="btn primary" type="button" :disabled="lensOn" @click="lookThroughTelescope">Look through the telescope</button>
                </div>
              </div>
</template>
