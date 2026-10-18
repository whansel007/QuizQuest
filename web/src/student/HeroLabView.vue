<script setup>
// Student-facing entry point for the campfire defense game.
// The signed-in user's kingdom upgrades are applied by the authoritative game server.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import Heading from '../components/Heading.vue';
import { loadHome } from './home.js';

const selectedHero = ref(null);
const gameFrame = ref(null);
const gameUrl = ref('');
const roster = ref(null);
const rosterError = ref('');
const loadingRoster = ref(true);
const heroes = computed(() => roster.value?.catalog.heroes || []);
const ownsHero = (id) => roster.value?.inventory.heroes.includes(id) || false;

function chooseHero(hero) {
  selectedHero.value = hero;
  gameUrl.value = `/hero-lab/world?heroId=${encodeURIComponent(hero.id)}&embedded=1`;
}

function returnToSelection(event) {
  if (event.origin !== window.location.origin || event.source !== gameFrame.value?.contentWindow) return;
  if (event.data?.type === 'hero-lab-game-over') {
    selectedHero.value = null;
    gameUrl.value = '';
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
      <p class="muted">Choose a hero to defend the campfire. Library levels add attack for magic heroes, Workshop levels add attack for physical heroes, and Garden levels increase the shared campfire's max HP. Move with WASD or the arrow keys, aim with the mouse, and fire with the left mouse button. Press E to use your skill and Q for your ultimate.</p>
      <p v-if="loadingRoster" class="muted">Loading your hero collection…</p>
      <div v-else-if="rosterError" class="note bad">{{ rosterError }}</div>
      <div class="hero-lab-grid">
        <button v-for="hero in heroes" :key="hero.id" class="panel hero-lab-card" :class="{ locked: !ownsHero(hero.id) }" type="button" :disabled="!ownsHero(hero.id) || loadingRoster" @click="chooseHero(hero)">
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
.hero-lab-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 12px; margin-top: 18px; }
.hero-lab-card { display: grid; gap: 7px; width: 100%; margin: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; transition: border-color .15s, transform .15s; }
.hero-lab-card:hover:not(:disabled) { border-color: var(--accent); transform: translateY(-2px); }
.hero-lab-card:disabled { cursor: not-allowed; opacity: .65; }
.hero-lab-card.locked .hero-lab-name { filter: grayscale(1); }
.hero-lab-name { font-size: 20px; }
.hero-lab-frame { position: fixed; z-index: 10; inset: 0; display: block; width: 100vw; height: 100vh; border: 0; border-radius: 0; background: #70a94f; }
</style>
