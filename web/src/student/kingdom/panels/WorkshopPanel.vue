<script setup>
import { computed, toRefs } from 'vue';
import HeroIcon from '../../HeroIcon.vue';


const props = defineProps({ context: { type: Object, required: true } });
const { workshopHeroes, workshopHero, previewWorkshopHero, workshopConfig, ownedHeroIds, heroesOfType, heroStars, trialStarting, startWorkshopTrial } = toRefs(props.context);
const orderedWorkshopHeroes = computed(() => [...workshopHeroes.value].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
</script>

<template>
              <div class="gym-card workshop-feature">
                <section class="workshop-roster" aria-labelledby="workshop-roster-title">
                  <span class="clipboard-clip" aria-hidden="true" />
                  <h3 id="workshop-roster-title" class="roster-title">Member roster</h3>
                  <p class="roster-sub">Training Workshop · sign-in sheet</p>
                  <div class="roster-list" role="group" aria-label="Choose a hero to preview">
                    <button v-for="(hero, index) in orderedWorkshopHeroes" :key="hero.id" class="workshop-hero" :class="{ selected: workshopHero?.id === hero.id }" type="button" :aria-pressed="workshopHero?.id === hero.id" @click="previewWorkshopHero = hero">
                      <span class="member-no" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
                      <HeroIcon :hero="hero" :size="34" />
                      <b>{{ hero.name }}</b>
                      <small>{{ heroStars(hero) }}-star · {{ hero.type }}</small>
                      <em class="member-pass" :class="{ guest: !ownedHeroIds.has(hero.id) }">{{ ownedHeroIds.has(hero.id) ? 'Member' : 'Guest pass' }}</em>
                    </button>
                  </div>
                </section>
                <article v-if="workshopHero" class="workshop-detail training-form" aria-labelledby="training-form-title">
                  <header class="form-head">
                    <div><span class="scene-kicker">Training registration form</span><h3 id="training-form-title">{{ workshopHero.name }}</h3></div>
                    <span class="form-stamp" aria-hidden="true">Cleared for<br>practice</span>
                  </header>
                  <div class="form-body">
                    <div class="workshop-preview-stage">
                      <svg class="training-yard" viewBox="0 0 400 260" preserveAspectRatio="xMidYMax meet" aria-hidden="true" focusable="false">
                        <rect width="400" height="260" fill="#cfe2e8" />
                        <path d="M0 120c60-18 120-16 180-4s130 8 220-10v154H0Z" fill="#9db98a" />
                        <path d="M0 150h400v110H0Z" fill="#d8bf8f" />
                        <path d="M0 150h400" stroke="#23382f" stroke-width="2.5" />
                        <g stroke="#7a5534" stroke-width="5" stroke-linecap="round"><path d="M14 150v-44M64 150v-44M114 150v-44M286 150v-44M336 150v-44M386 150v-44" /><path d="M8 116h112M8 134h112M280 116h112M280 134h112" stroke-width="4" /></g>
                        <g stroke="#23382f" stroke-width="2.5"><path d="M30 196h58l6 30H24Z" fill="#e8c57c" /><path d="M34 206h50M30 216h58" stroke="#b7914e" /></g>
                        <g><path d="M312 222v-56" stroke="#7a5534" stroke-width="5" /><circle cx="312" cy="160" r="30" fill="#fff8e4" stroke="#23382f" stroke-width="3" /><circle cx="312" cy="160" r="20" fill="#d86f6b" /><circle cx="312" cy="160" r="11" fill="#fff8e4" /><circle cx="312" cy="160" r="4.5" fill="#d86f6b" /></g>
                        <g><path d="M366 214v-46" stroke="#7a5534" stroke-width="4" /><circle cx="366" cy="166" r="18" fill="#fff8e4" stroke="#23382f" stroke-width="2.5" /><circle cx="366" cy="166" r="11" fill="#d86f6b" /><circle cx="366" cy="166" r="4" fill="#fff8e4" /></g>
                        <ellipse cx="160" cy="226" rx="70" ry="9" fill="#7a6545" opacity=".35" />
                      </svg>
                      <div class="yard-hero"><HeroIcon :hero="workshopHero" :size="150" :label="`${workshopHero.name} warming up in the training yard`" :animated="true" /></div>
                    </div>
                    <div class="form-fields">
                      <div class="form-line"><span>Class</span><b>{{ heroStars(workshopHero) }}-star {{ workshopHero.type }} hero</b></div>
                      <div class="form-line"><span>Kit</span><b>{{ workshopHero.weapon || 'A practiced strike' }} · {{ workshopHero.skill || 'Signature skill' }} · {{ workshopHero.ultimate || 'Ultimate' }}</b></div>
                      <dl class="hero-book-stats"><div class="stat-hp"><dt>HP</dt><dd>{{ workshopHero.hp }}</dd></div><div class="stat-atk"><dt>Attack</dt><dd>{{ workshopHero.attack }}</dd></div><div class="stat-def"><dt>Defense</dt><dd>{{ workshopHero.defense }}</dd></div><div class="stat-spd"><dt>Speed</dt><dd>{{ workshopHero.speed }}</dd></div></dl>
                      <dl class="trial-cooldowns"><div><dt>Primary</dt><dd>{{ ((workshopConfig?.weaponCooldownMs || 0) / 1000).toFixed(1) }}s</dd></div><div><dt>Skill</dt><dd>{{ ((workshopConfig?.skillCooldownMs || 0) / 1000).toFixed(1) }}s</dd></div><div><dt>Ultimate</dt><dd>{{ ((workshopConfig?.ultimateCooldownMs || 0) / 1000).toFixed(1) }}s</dd></div></dl>
                      <p v-if="workshopConfig?.talent" class="trial-talent"><b>{{ workshopConfig.talent.name }}</b> · {{ workshopConfig.talent.description }}</p>
                      <div class="form-sign"><span>Signed by coach</span><b>Lepurr James</b></div>
                    </div>
                  </div>
                  <footer class="form-foot">
                    <p class="trial-note">Practice privately with any hero. Trials use the real combat controls and grant no rewards or progress. Workshop levels still boost physical heroes in Campfire Run.</p>
                    <button class="btn primary trial-start" type="button" :disabled="trialStarting" @click="startWorkshopTrial(workshopHero)">{{ trialStarting ? 'Opening training ground…' : 'Start Test' }}</button>
                  </footer>
                </article>
              </div>
</template>
