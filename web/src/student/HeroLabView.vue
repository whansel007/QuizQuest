<script setup>
// Student-facing entry point for the Hero Lab prototype.
// The existing game client stays in its own page and socket namespace; this
// view supplies the hero choice and hosts that page inside QuizQuest.
import { onMounted, onUnmounted, ref } from 'vue';
import Heading from '../components/Heading.vue';

const heroes = [
  { id: 'flamekeeper', name: 'Flamekeeper', emoji: '🧙', hp: 100, attack: 14, defense: 5, speed: 220, weapon: 'Ember Staff' },
  { id: 'ranger', name: 'Ranger', emoji: '🏹', hp: 85, attack: 18, defense: 3, speed: 260, weapon: 'Longbow' },
  { id: 'guardian', name: 'Guardian', emoji: '🛡️', hp: 130, attack: 10, defense: 9, speed: 180, weapon: 'Iron Mace' },
];

const selectedHero = ref(null);
const gameFrame = ref(null);
const gameUrl = ref('');

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

onMounted(() => window.addEventListener('message', returnToSelection));
onUnmounted(() => window.removeEventListener('message', returnToSelection));
</script>

<template>
  <section class="hero-lab-page">
    <template v-if="!selectedHero">
      <Heading title="World" />
      <p class="muted">Choose a hero to defend the campfire. Move with WASD or the arrow keys, aim with the mouse, and fire with the left mouse button. Press E to dash and Q to use the ultimate.</p>
      <div class="hero-lab-grid">
        <button v-for="hero in heroes" :key="hero.id" class="panel hero-lab-card" type="button" @click="chooseHero(hero)">
          <strong class="hero-lab-name">{{ hero.emoji }} {{ hero.name }}</strong>
          <span>{{ hero.weapon }}</span>
          <span class="muted small">HP {{ hero.hp }} · Attack {{ hero.attack }} · Defense {{ hero.defense }} · Speed {{ hero.speed }}</span>
        </button>
      </div>
    </template>

    <template v-else>
      <iframe
        :key="gameUrl"
        ref="gameFrame"
        class="hero-lab-frame"
        :src="gameUrl"
        title="Hero Lab World"
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
.hero-lab-card:hover { border-color: var(--accent); transform: translateY(-2px); }
.hero-lab-name { font-size: 20px; }
.hero-lab-frame { position: fixed; z-index: 10; inset: 0; display: block; width: 100vw; height: 100vh; border: 0; border-radius: 0; background: #70a94f; }
</style>
