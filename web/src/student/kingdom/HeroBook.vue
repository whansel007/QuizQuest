<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import HeroIcon from '../HeroIcon.vue';
import { ABILITY_ICONS, GAME_CONFIG } from '../../../../public/hero-lab/game-config.js';
import { HERO_ABILITY_GUIDE } from './hero-ability-guide.js';

const props = defineProps({
  hero: { type: Object, required: true },
  lore: { type: Object, default: null },
  stars: { type: Number, default: 0 },
});
const emit = defineEmits(['close']);
const backButton = ref(null);

function formatCooldown(milliseconds) {
  const seconds = Number((milliseconds / 1000).toFixed(2));
  return `${seconds} s`;
}

const heroAbilities = computed(() => {
  const hero = props.hero;
  const config = GAME_CONFIG.heroes[hero.id] || {};
  const icons = ABILITY_ICONS[hero.id] || {};
  const guide = HERO_ABILITY_GUIDE[hero.id] || {};
  return [
    { key: 'primary', label: 'Primary fire', name: hero.weapon || 'Heroic strike', cooldown: config.weaponCooldownMs, icon: icons.primary, mechIcon: icons.mechPrimary, mechName: config.mech?.weaponName, mechCooldown: config.mech?.weaponCooldownMs },
    { key: 'skill', label: 'Skill', name: hero.skill || 'Signature skill', cooldown: config.skillCooldownMs, icon: icons.skill, mechIcon: icons.mechSkill, mechName: config.mech?.skillName, mechCooldown: config.mech?.skillCooldownMs },
    { key: 'ultimate', label: 'Ultimate', name: hero.ultimate || 'Ultimate power', cooldown: config.ultimateCooldownMs, icon: icons.ultimate },
  ].map((ability) => ({
    ...ability,
    description: guide[ability.key] || 'Use this ability to help defend the campfire.',
    iconUrl: ability.icon ? `/hero-lab/${ability.icon}` : '',
    mechIconUrl: ability.mechIcon ? `/hero-lab/${ability.mechIcon}` : '',
    cooldownText: Number.isFinite(ability.cooldown) ? formatCooldown(ability.cooldown) : '—',
    mechCooldownText: Number.isFinite(ability.mechCooldown) ? formatCooldown(ability.mechCooldown) : '',
  }));
});
const heroTalent = computed(() => {
  const talent = GAME_CONFIG.heroes[props.hero.id]?.talent;
  if (!talent) return null;
  const icon = talent.icon || ABILITY_ICONS[props.hero.id]?.talent;
  const description = HERO_ABILITY_GUIDE[props.hero.id]?.talent || talent.description;
  return { ...talent, description, iconUrl: icon ? `/hero-lab/${icon}` : '' };
});

function trapDialogFocus(event) {
  if (event.key !== 'Tab') return;
  event.preventDefault();
  backButton.value?.focus();
}

onMounted(async () => {
  await nextTick();
  backButton.value?.focus();
});
</script>

<template>
  <div class="hero-book-host">
    <div class="storybook-overlay" @pointerdown.self="emit('close')">
      <div class="storybook-spread" :class="`hero-${hero.id}`" role="dialog" aria-modal="true" aria-labelledby="story-title" @keydown="trapDialogFocus">
        <button ref="backButton" class="book-back-bookmark" type="button" aria-label="Back to the shelves" title="Back to the shelves" @click="emit('close')"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M18 10H4m7-7-7 7 7 7" /></svg></button>
        <article class="storybook-page story-left">
          <figure class="story-portrait story-portrait-left"><div class="portrait-frame"><HeroIcon :hero="hero" :size="96" :label="`${hero.name} portrait`" :animated="true" /></div><figcaption>{{ hero.name }}</figcaption></figure>
          <span class="story-kicker">{{ hero.name }} · {{ stars }}-star {{ hero.type }} hero</span>
          <h3 id="story-title" class="story-title">{{ lore?.title || hero.name }}</h3>
          <p class="hero-personality">{{ lore?.personality || 'A valued member of the town’s defenders.' }}</p>
          <p class="story-copy">{{ lore?.story || `${hero.name} brings ${hero.weapon || 'their own talents'} to every adventure. Their signature skill is ${hero.skill || 'always ready'}, and their ultimate is ${hero.ultimate || 'a force to reckon with'}.` }}</p>
          <p v-if="lore?.fieldNote" class="field-note"><b>Field note</b> · {{ lore.fieldNote }}</p>
        </article>
        <div class="storybook-page story-right">
          <dl class="hero-book-stats"><div class="stat-hp"><dt>HP</dt><dd>{{ hero.hp }}</dd></div><div class="stat-atk"><dt>Attack</dt><dd>{{ hero.attack }}</dd></div><div class="stat-def"><dt>Defense</dt><dd>{{ hero.defense }}</dd></div><div class="stat-spd"><dt>Speed</dt><dd>{{ hero.speed }}</dd></div></dl>
          <dl class="hero-abilities">
            <div v-for="ability in heroAbilities" :key="ability.key" class="hero-ability-entry">
              <dt><img v-if="ability.iconUrl" class="hero-ability-icon" :src="ability.iconUrl" :alt="`${ability.name} icon`"><span>{{ ability.label }}</span></dt>
              <dd><strong>{{ ability.name }}</strong><p>{{ ability.description }}</p><small class="hero-ability-cooldown">Cooldown · {{ ability.cooldownText }}</small><span v-if="ability.mechIconUrl" class="hero-mech-ability"><img :src="ability.mechIconUrl" :alt="`${ability.mechName} icon`"><span>Mech form · {{ ability.mechName }} · {{ ability.mechCooldownText }} cooldown</span></span></dd>
            </div>
            <div v-if="heroTalent" class="hero-talent-entry">
              <dt><img v-if="heroTalent.iconUrl" class="hero-ability-icon" :src="heroTalent.iconUrl" :alt="`${heroTalent.name} icon`"><span>Talent</span></dt>
              <dd><strong>{{ heroTalent.name }}</strong><p>{{ heroTalent.description }}</p></dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </div>
</template>

<style src="./hero-book.css"></style>
