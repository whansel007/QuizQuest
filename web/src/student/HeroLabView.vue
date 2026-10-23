<script setup>
// Student-facing entry point for the campfire defense game.
// The signed-in user's kingdom upgrades are applied by the authoritative game server.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import Heading from '../components/Heading.vue';
import { loadHome } from './home.js';
import { formatHeroType } from './hero-type.js';
import { BASE_CAMPFIRE_HP, BUILDING_BONUS_PER_LEVEL, BUILDING_LEVEL_CAP } from '../../../config/tuning.js';

const selectedHero = ref(null);
const gameFrame = ref(null);
const gameUrl = ref('');
const inGame = ref(false);
const frameKey = ref(0);
const roomCode = ref('');
const activeRoomCode = ref('');
const roomError = ref('');
const roster = ref(null);
const previewHero = ref(null);
const rosterError = ref('');
const loadingRoster = ref(true);
const heroes = computed(() => roster.value?.catalog.heroes || []);
const ownsHero = (id) => roster.value?.inventory.heroes.includes(id) || false;
const buildingLevels = computed(() => roster.value?.kingdom?.buildings || {});
const buildings = [
  { id: 'library', name: 'Library', icon: '📚', applies: (hero) => hero?.type === 'magic', label: 'magic attack' },
  { id: 'workshop', name: 'Workshop', icon: '🛠️', applies: (hero) => hero?.type === 'physical', label: 'physical attack' },
  { id: 'garden', name: 'Garden', icon: '🌷', applies: () => true, label: 'campfire max HP per player' },
  { id: 'tower', name: 'Tower', icon: '🗼', applies: () => false, label: 'no combat bonus yet' },
];
const buildingLevel = (id) => Math.min(BUILDING_LEVEL_CAP, Math.max(0, Math.floor(Number(buildingLevels.value[id]) || 0)));
const buildingPercent = (id) => Math.round(buildingLevel(id) * BUILDING_BONUS_PER_LEVEL * 100);
const buildingEffect = (building) => building.id === 'tower' ? building.label : `+${buildingPercent(building.id)}% ${building.label}`;
const buildingSummary = (building) => `${building.name} Lv${buildingLevel(building.id)}: ${buildingEffect(building)}`;
const gardenSummary = computed(() => {
  const perPlayer = Math.round(BASE_CAMPFIRE_HP * buildingPercent('garden') / 100);
  const maxPlayerBonus = Math.round(BASE_CAMPFIRE_HP * BUILDING_BONUS_PER_LEVEL * BUILDING_LEVEL_CAP);
  const soloMax = BASE_CAMPFIRE_HP + maxPlayerBonus;
  const fourPlayerMax = BASE_CAMPFIRE_HP + maxPlayerBonus * 4;
  return `Garden Lv${buildingLevel('garden')} adds ${perPlayer} campfire HP per player; at Lv${BUILDING_LEVEL_CAP}, base ${BASE_CAMPFIRE_HP} HP becomes ${soloMax} HP solo or ${fourPlayerMax} HP with four players all at Lv${BUILDING_LEVEL_CAP}.`;
});

function selectHero(hero) {
  selectedHero.value = hero;
  previewHero.value = hero;
  roomError.value = '';
}

function onCodeInput() {
  roomCode.value = roomCode.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  roomError.value = '';
}

function enterRoom(mode) {
  roomError.value = '';
  if (!selectedHero.value) { roomError.value = 'Pick a hero first.'; return; }
  if (mode === 'join' && roomCode.value.length !== 4) { roomError.value = 'Enter the 4-letter room code.'; return; }
  const params = new URLSearchParams({ heroId: selectedHero.value.id, embedded: '1' });
  if (mode === 'create') params.set('create', '1');
  else params.set('room', roomCode.value);
  gameUrl.value = `/hero-lab/world?${params.toString()}`;
  frameKey.value += 1;
  inGame.value = true;
  nextTick(focusGame);
}

function reloadIntoRoom(hero, code) {
  selectedHero.value = hero;
  const params = new URLSearchParams({ heroId: hero.id, embedded: '1' });
  if (code) params.set('room', code);
  else params.set('create', '1');
  gameUrl.value = `/hero-lab/world?${params.toString()}`;
  frameKey.value += 1;
  inGame.value = true;
  nextTick(focusGame);
}

function returnToSelection(event) {
  if (event.origin !== window.location.origin || event.source !== gameFrame.value?.contentWindow) return;
  const data = event.data || {};
  if (data.type === 'hero-lab-room') {
    if (data.code) { activeRoomCode.value = data.code; roomCode.value = data.code; }
  } else if (data.type === 'hero-lab-join-error') {
    inGame.value = false;
    gameUrl.value = '';
    roomError.value = data.message || 'Could not join that room.';
  } else if (data.type === 'hero-lab-game-over') {
    inGame.value = false;
    gameUrl.value = '';
    selectedHero.value = null;
    activeRoomCode.value = '';
  } else if (data.type === 'hero-lab-run-again') {
    const hero = heroes.value.find((candidate) => candidate.id === data.heroId && ownsHero(candidate.id));
    if (hero) reloadIntoRoom(hero, activeRoomCode.value);
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
    <template v-if="!inGame">
      <Heading title="World" />
      <p class="muted">Choose a hero, then create a lobby or join a friend's room. Each Library or Workshop level adds 10% matching hero attack, up to 30%; each Garden level adds 10% of base campfire HP per player. Move with WASD or the arrow keys, aim with the mouse, and fire with the left mouse button. Press E to use your skill and Q for your ultimate.</p>
      <p class="hero-lab-tip">Tip: Move to deal more damage. Heal at the campfire.</p>

      <section class="panel room-entry" aria-label="Room entry">
        <strong>Play with friends</strong>
        <span class="muted small">Up to 4 heroes per room. The room code is shown in the top-left corner of the game.</span>
        <div class="room-actions">
          <button class="btn primary" type="button" :disabled="!selectedHero" @click="enterRoom('create')">CREATE LOBBY</button>
          <span class="room-or muted small">or join</span>
          <label class="sr-only" for="room-code-input">Room code</label>
          <input
            id="room-code-input"
            v-model="roomCode"
            class="room-code-input"
            type="text"
            inputmode="latin"
            autocomplete="off"
            spellcheck="false"
            maxlength="4"
            placeholder="CODE"
            aria-label="Room code"
            @input="onCodeInput"
            @keyup.enter="enterRoom('join')"
          >
          <button class="btn" type="button" :disabled="!selectedHero || roomCode.length !== 4" @click="enterRoom('join')">JOIN</button>
        </div>
        <span v-if="!selectedHero" class="muted small">Pick a hero below to create or join a room.</span>
        <span v-else class="small">Playing as {{ selectedHero.emoji }} {{ selectedHero.name }}.</span>
        <p v-if="roomError" class="note bad" role="alert">{{ roomError }}</p>
      </section>

      <section class="panel kingdom-preview" aria-label="Kingdom upgrades for this run">
        <strong>Your kingdom upgrades</strong>
        <span class="muted small">Select or hover over a hero to see which damage building applies.</span>
        <div class="kingdom-building-list">
          <div v-for="building in buildings" :key="building.id" class="kingdom-building" :class="{ relevant: building.applies(previewHero) && previewHero }">
            <span>{{ buildingSummary(building) }}</span>
          </div>
        </div>
        <span class="small">{{ gardenSummary }}</span>
        <span v-if="previewHero" class="small">{{ previewHero.name }} receives {{ buildings.filter((building) => building.applies(previewHero) && building.id !== 'garden').map(buildingEffect).join(', ') || 'no matching attack building bonus' }}{{ buildingPercent('garden') ? ` and +${buildingPercent('garden')}% campfire max HP per player` : '' }}.</span>
      </section>
      <p v-if="loadingRoster" class="muted">Loading your hero collection…</p>
      <div v-else-if="rosterError" class="note bad">{{ rosterError }}</div>
      <div class="hero-lab-grid">
        <button
          v-for="hero in heroes"
          :key="hero.id"
          class="panel hero-lab-card"
          :class="{ locked: !ownsHero(hero.id), previewed: previewHero?.id === hero.id, selected: selectedHero?.id === hero.id }"
          type="button"
          :disabled="!ownsHero(hero.id) || loadingRoster"
          @mouseenter="previewHero = hero"
          @focus="previewHero = hero"
          @click="selectHero(hero)"
        >
          <strong class="hero-lab-name">{{ hero.emoji }} {{ hero.name }}</strong>
          <span>{{ hero.rarity }}★ · {{ hero.weapon }}</span>
          <span class="muted small">{{ formatHeroType(hero.type) }} · HP {{ hero.hp }} · Attack {{ hero.attack }} · Defense {{ hero.defense }} · Speed {{ hero.speed }}</span>
          <span v-if="ownsHero(hero.id)" class="small">{{ selectedHero?.id === hero.id ? 'Selected' : 'Owned' }}</span>
          <span v-else class="muted small">Summon to unlock</span>
        </button>
      </div>
    </template>

    <template v-else>
      <iframe
        :key="frameKey"
        ref="gameFrame"
        class="hero-lab-frame"
        :src="gameUrl"
        title="Campfire Defense"
        allow="gamepad; clipboard-write"
        tabindex="0"
        @load="focusGame"
      />
    </template>

  </section>
</template>

<style scoped>
.hero-lab-page { width: 100%; }
.hero-lab-tip { margin-top: .25rem; color: var(--accent); font-weight: 700; }
.room-entry { display: grid; gap: 10px; margin-top: 14px; }
.room-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.room-or { text-transform: uppercase; letter-spacing: .08em; font-size: .75rem; }
.room-code-input { width: 8.5rem; padding: .45rem .6rem; font: 700 1.1rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .28em; text-transform: uppercase; text-align: center; }
.room-code-input::placeholder { color: var(--muted, #8b8b8b); letter-spacing: .2em; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
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
.hero-lab-card.selected { outline: 2px solid var(--accent); outline-offset: 2px; }
.hero-lab-frame { position: fixed; z-index: 10; inset: 0; display: block; width: 100vw; height: 100vh; border: 0; border-radius: 0; background: #70a94f; }
</style>
