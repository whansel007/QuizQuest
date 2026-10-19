<script setup>
// Student-facing entry point for the campfire defense game.
// The signed-in user's kingdom upgrades are applied by the authoritative game server.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import Heading from '../components/Heading.vue';
import { loadHome } from './home.js';

const selectedHero = ref(null);
const gameFrame = ref(null);
const gameUrl = ref('');
const roster = ref(null);
const previewHero = ref(null);
const rosterError = ref('');
const loadingRoster = ref(true);
const heroes = computed(() => roster.value?.catalog.heroes || []);
const ownsHero = (id) => roster.value?.inventory.heroes.includes(id) || false;
const buildingLevels = computed(() => roster.value?.kingdom?.buildings || {});
const buildings = [
  { id: 'library', name: 'Library', icon: '📚', applies: (hero) => hero?.type === 'magic', label: 'magic damage' },
  { id: 'workshop', name: 'Workshop', icon: '🛠️', applies: (hero) => hero?.type === 'physical', label: 'physical damage' },
  { id: 'garden', name: 'Garden', icon: '🌷', applies: () => true, label: 'campfire max HP' },
  { id: 'tower', name: 'Tower', icon: '🗼', applies: () => false, label: 'no combat bonus yet' },
];
const buildingPercent = (id) => Math.min(40, Math.max(0, Number(buildingLevels.value[id]) || 0) * 4);
const buildingEffect = (building) => building.id === 'tower' ? building.label : `+${buildingPercent(building.id)}% ${building.label}`;

function chooseHero(hero) {
  selectedHero.value = hero;
  gameUrl.value = `/hero-lab/world?heroId=${encodeURIComponent(hero.id)}&embedded=1`;
}

function returnToSelection(event) {
  if (event.origin !== window.location.origin || event.source !== gameFrame.value?.contentWindow) return;
  if (event.data?.type === 'hero-lab-game-over') {
    selectedHero.value = null;
    gameUrl.value = '';
  } else if (event.data?.type === 'hero-lab-run-again') {
    const hero = heroes.value.find((candidate) => candidate.id === event.data.heroId && ownsHero(candidate.id));
    selectedHero.value = null;
    gameUrl.value = '';
    if (hero) nextTick(() => chooseHero(hero));
  }
}

function focusGame() {
  gameFrame.value?.contentWindow?.focus();
}

onMounted(async () => {
  window.addEventListener('message', returnToSelection);
  try { roster.value = await loadHome(); }
  catch (err) { rosterError.value = err.message; }
  finally { loadingRoster.value = false; }
});
onUnmounted(() => window.removeEventListener('message', returnToSelection));
</script>

<template>
  <section class="hero-lab-page">
    <template v-if="!selectedHero">
      <Heading title="World" />
      <p class="muted">Choose a hero to defend the campfire. Each Library or Workshop level adds 4% matching hero damage, up to 40%; each Garden level adds 4% shared campfire max HP, up to 40%. Move with WASD or the arrow keys, aim with the mouse, and fire with the left mouse button. Press E to use your skill and Q for your ultimate.</p>
      <p class="hero-lab-tip">Tip: Move to deal more damage. Heal at the campfire.</p>
      <section class="panel kingdom-preview" aria-label="Kingdom upgrades for this run">
        <strong>Your kingdom upgrades</strong>
        <span class="muted small">Select or hover over a hero to see which damage building applies.</span>
        <div class="kingdom-building-list">
          <div v-for="building in buildings" :key="building.id" class="kingdom-building" :class="{ relevant: building.applies(previewHero) && previewHero }">
            <span>{{ building.icon }} {{ building.name }} Lv {{ buildingLevels[building.id] || 0 }}</span>
            <b>{{ buildingEffect(building) }}</b>
          </div>
        </div>
        <span v-if="previewHero" class="small">{{ previewHero.name }} receives {{ buildings.filter((building) => building.applies(previewHero) && building.id !== 'garden').map(buildingEffect).join(', ') || 'no damage building bonus' }}{{ buildingPercent('garden') ? ` and +${buildingPercent('garden')}% campfire max HP` : '' }}.</span>
      </section>
      <p v-if="loadingRoster" class="muted">Loading your hero collection…</p>
      <div v-else-if="rosterError" class="note bad">{{ rosterError }}</div>
      <div class="hero-lab-grid">
        <button v-for="hero in heroes" :key="hero.id" class="panel hero-lab-card" :class="{ locked: !ownsHero(hero.id), previewed: previewHero?.id === hero.id }" type="button" :disabled="!ownsHero(hero.id) || loadingRoster" @mouseenter="previewHero = hero" @focus="previewHero = hero" @click="previewHero = hero; chooseHero(hero)">
          <strong class="hero-lab-name">{{ hero.emoji }} {{ hero.name }}</strong>
          <span>{{ hero.rarity }}★ · {{ hero.weapon }}</span>
          <span class="muted small">{{ hero.type }} · HP {{ hero.hp }} · Attack {{ hero.attack }} · Defense {{ hero.defense }} · Speed {{ hero.speed }}</span>
          <span v-if="ownsHero(hero.id)" class="small">Owned</span>
          <span v-else class="muted small">Summon to unlock</span>
        </button>
      </div>
    </template>

    <template v-else>
      <iframe
        :key="gameUrl"
        ref="gameFrame"
        class="hero-lab-frame"
        :src="gameUrl"
        title="Campfire Defense"
        allow="gamepad"
        tabindex="0"
        @load="focusGame"
      />
    </template>

  </section>
</template>

<style scoped>
.hero-lab-page { width: 100%; }
.hero-lab-tip { margin-top: .25rem; color: var(--accent); font-weight: 700; }
.hero-lab-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 12px; margin-top: 18px; }
.hero-lab-card { display: grid; gap: 7px; width: 100%; margin: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, transform .15s; }
.hero-lab-card:hover:not(:disabled) { border-color: var(--accent); transform: translateY(-2px); }
.hero-lab-card:disabled { cursor: not-allowed; opacity: .65; }
.hero-lab-card.locked .hero-lab-name { filter: grayscale(1); }
.hero-lab-name { font-size: 20px; }
.kingdom-preview { display: grid; gap: 8px; margin-top: 14px; }
.kingdom-building-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 7px; }
.kingdom-building { display: flex; justify-content: space-between; gap: 10px; padding: 7px 9px; border-radius: 7px; background: rgb(127 127 127 / 10%); font-size: .9rem; }
.kingdom-building b { text-align: right; }
.kingdom-building.relevant { outline: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 15%, transparent); }
.hero-lab-card.previewed { border-color: var(--accent); }
.hero-lab-frame { position: fixed; z-index: 10; inset: 0; display: block; width: 100vw; height: 100vh; border: 0; border-radius: 0; background: #70a94f; }
</style>
