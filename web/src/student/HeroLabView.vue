<script setup>
// Student-facing entry point for the campfire defense game.
// The signed-in user's kingdom upgrades are applied by the authoritative game server.
//
// Layout: the pre-lobby World page is a forest clearing with camp controls,
// a highlighted hero beside an animated campfire, and the roster below.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import BuildingIcon from './BuildingIcon.vue';
import HeroIcon from './HeroIcon.vue';
import { loadHome } from './home.js';
import { api } from '../api.js';
import { wipeTo } from '../transitions.js';
import { HERO_TYPE_ICON } from './hero-type.js';
import TalentBadge from './TalentBadge.vue';
import { GAME_CONFIG } from '../../../public/hero-lab/game-config.js';
import { talentKeyLabel, talentKeyTooltip } from '../../../public/hero-lab/talent-badge.js';
import {
  BUILDING_BONUS_PER_LEVEL, BUILDING_LEVEL_CAP,
  HERO_PREVIEW_EMOJI_PX, HERO_PREVIEW_EMOJI_OFFSET_X_PX, HERO_PREVIEW_EMOJI_OFFSET_Y_PX,
  TOWER_BONUS_PER_LEVEL, TOWER_MAX_LEVEL,
} from '../../../config/tuning.js';

// Remember the hero the player used last this session so the page always opens
// with a selection (falls back to the first owned hero).
const HERO_SESSION_KEY = 'hero-lab-selected-hero';

const selectedHero = ref(null);
const gameFrame = ref(null);
const gameUrl = ref('');
const inGame = ref(false);
const frameKey = ref(0);
const roomCode = ref('');
const activeRoomCode = ref('');
const roomError = ref('');
const roster = ref(null);
const debugUnlockedHeroes = ref([]);
try { debugUnlockedHeroes.value = JSON.parse(localStorage.getItem('hero-lab-debug-unlocked-heroes') || '[]'); } catch { /* optional local debug roster */ }
// previewHero drives the preview panel AND the kingdom tile highlight: it
// follows the hovered hero and snaps back to the selection on mouse leave.
const previewHero = ref(null);
const rosterError = ref('');
const loadingRoster = ref(true);
const heroes = computed(() => roster.value?.catalog.heroes || []);
const ownsHero = (id) => roster.value?.inventory.heroes.includes(id) || debugUnlockedHeroes.value.includes(id) || false;
// Building levels live on their own endpoint (/api/student/kingdom); the home
// payload does not carry a kingdom block, so reading levels from `roster` left
// every tile stuck at Lv 0 forever.
const kingdomLevels = ref({});

// The highlight ring answers one question: which building boosts THIS hero? Only
// Library and Workshop are type-specific. The Garden (campfire HP) and the Tower
// (buff strength) apply to every hero, so ringing them would mark nothing.
const buildings = [
  { id: 'library', name: 'Library', highlightsFor: (hero) => hero?.type === 'magic' },
  { id: 'workshop', name: 'Workshop', highlightsFor: (hero) => hero?.type === 'physical' },
  { id: 'garden', name: 'Garden' },
  { id: 'tower', name: 'Tower' },
];

// The Tower scales the team's buff cards instead of granting a flat stat, so it
// carries its own per-level bonus and cap. Read those from its own constants
// rather than borrowing the building-wide ones.
const buildingCap = (id) => (id === 'tower' ? TOWER_MAX_LEVEL : BUILDING_LEVEL_CAP);
const buildingPerLevel = (id) => (id === 'tower' ? TOWER_BONUS_PER_LEVEL : BUILDING_BONUS_PER_LEVEL);
const buildingLevel = (id) => Math.min(buildingCap(id), Math.max(0, Math.floor(Number(kingdomLevels.value[id]) || 0)));
const buildingPercent = (id) => Math.round(buildingLevel(id) * buildingPerLevel(id) * 100);

// Short tile line, e.g. "+20% magic ATK" / "+20% buff strength". The Tower line
// states what it multiplies rather than a flat stat, matching the buff-card
// model on the server.
function tileEffect(building) {
  const percent = buildingPercent(building.id);
  if (building.id === 'tower') return `+${percent}% buff strength`;
  if (building.id === 'garden') return `+${percent}% campfire HP`;
  return `+${percent}% ${building.id === 'library' ? 'magic' : 'physical'} ATK`;
}

// Longer tile detail (shown as the tile's tooltip).
function buildingDetail(building) {
  if (building.id === 'tower') return `Tower makes your team buffs ${buildingPercent('tower')}% stronger on your hero.`;
  return tileEffect(building);
}

function selectHero(hero) {
  if (!ownsHero(hero.id)) return;
  selectedHero.value = hero;
  previewHero.value = hero;
  roomError.value = '';
  try { sessionStorage.setItem(HERO_SESSION_KEY, hero.id); } catch { /* session storage is optional */ }
}

// Rarity is a word in the data; the selector shows it as stars. Same mapping the
// summon reveal uses, so a "rare" hero is 4 stars everywhere.
const RARITY_STARS = GAME_CONFIG.arenaTuning.gachaReveal.rarityStars;
function heroStars(hero) {
  return RARITY_STARS[String(hero.rarity).toLowerCase()] || 0;
}

// Tier colour for the card edge, tuned to the Guild Field Guide palette.
const RARITY_COLOR = { common: '#aab0b5', rare: '#3155ed', epic: '#e4a72f' };
function heroRarity(hero) { return String(hero.rarity || 'common').toLowerCase(); }
function heroRarityColor(hero) { return RARITY_COLOR[heroRarity(hero)] || RARITY_COLOR.common; }

function previewHeroOn(hero) { previewHero.value = hero; }
function previewHeroOff() { previewHero.value = selectedHero.value; }

function applyInitialHero() {
  const list = heroes.value;
  if (!list.length) return;
  let stored = '';
  try { stored = sessionStorage.getItem(HERO_SESSION_KEY) || ''; } catch { /* session storage is optional */ }
  const restored = list.find((hero) => hero.id === stored && ownsHero(hero.id));
  const pick = restored || list.find((hero) => ownsHero(hero.id)) || null;
  if (pick) { selectedHero.value = pick; previewHero.value = pick; }
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
  if (data.type === 'hero-lab-debug-unlock') {
    if (!heroes.value.some((hero) => hero.id === data.heroId)) return;
    if (!debugUnlockedHeroes.value.includes(data.heroId)) debugUnlockedHeroes.value = [...debugUnlockedHeroes.value, data.heroId];
    const unlocked = heroes.value.find((hero) => hero.id === data.heroId);
    selectedHero.value = unlocked; previewHero.value = unlocked;
    try { sessionStorage.setItem(HERO_SESSION_KEY, data.heroId); } catch { /* optional */ }
    inGame.value = false; gameUrl.value = ''; roomError.value = `${unlocked.name} unlocked for this browser's sandbox.`;
  } else if (data.type === 'hero-lab-room') {
    if (data.code) { activeRoomCode.value = data.code; roomCode.value = data.code; }
  } else if (data.type === 'hero-lab-join-error') {
    inGame.value = false;
    gameUrl.value = '';
    roomError.value = data.message || 'Could not join that room.';
  } else if (data.type === 'hero-lab-game-over') {
    inGame.value = false;
    gameUrl.value = '';
    activeRoomCode.value = '';
    // The page must always come back with a hero selected.
    applyInitialHero();
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
  // Camp Buffs levels: a failure here only leaves the tiles at Lv 0, so it must
  // never take the whole page down with it.
  try { kingdomLevels.value = (await api('GET', '/api/student/kingdom'))?.buildings || {}; }
  catch { kingdomLevels.value = {}; }
  applyInitialHero();
});
onUnmounted(() => window.removeEventListener('message', returnToSelection));
</script>

<template>
  <section
    class="hero-lab-page"
    :style="{
      '--preview-emoji-x': `${HERO_PREVIEW_EMOJI_OFFSET_X_PX}px`,
      '--preview-emoji-y': `${HERO_PREVIEW_EMOJI_OFFSET_Y_PX}px`,
    }"
  >
    <template v-if="!inGame">
      <p v-if="loadingRoster" class="muted">Loading your hero collection…</p>
      <div v-else-if="rosterError" class="note bad">{{ rosterError }}</div>

      <div class="world-sides">
        <section class="panel room-entry" aria-label="Room entry">
          <div class="room-join-block">
            <button class="kingdom-return" type="button" @click="wipeTo('kingdom')"><span aria-hidden="true">←</span> Back to Kingdom</button>
            <h1 class="room-title">The Clearing</h1>
            <p class="room-intro">Choose a hero and defend the campfire. Move with WASD; E is your skill and Q your ultimate.</p>
            <span class="panel-kicker">JOIN A PARTY</span>
            <div class="room-actions">
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
          </div>
          <div class="room-host-block">
            <span class="panel-kicker">READY TO PLAY?</span>
            <button class="btn primary" type="button" :disabled="!selectedHero" @click="enterRoom('create')">HOST LOBBY</button>
          </div>
          <p v-if="roomError" class="note bad" role="alert">{{ roomError }}</p>
        </section>

        <section class="panel kingdom-preview" aria-label="Camp upgrades for this run">
          <div class="kingdom-head">
            <span class="panel-kicker">CAMP BUFFS</span>
          </div>
          <div class="kingdom-tiles">
            <div
              v-for="building in buildings"
              :key="building.id"
              class="kingdom-tile"
              :class="{ relevant: previewHero && building.highlightsFor?.(previewHero) }"
              :title="buildingDetail(building)"
            >
              <BuildingIcon class="kingdom-tile-icon" :building="building.id" />
              <span class="kingdom-tile-name">{{ building.name }}</span>
              <span class="kingdom-tile-level">Lv {{ buildingLevel(building.id) }}/{{ buildingCap(building.id) }}</span>
              <span class="kingdom-tile-effect">{{ tileEffect(building) }}</span>
            </div>
          </div>
        </section>

        <section v-if="previewHero" class="panel hero-preview" aria-label="Selected hero stats and talent">
          <div class="hero-basic-stats">
            <span class="panel-kicker">BASIC HERO STATS</span>
            <strong class="hero-preview-name">{{ previewHero.name }}</strong>
            <span class="hero-preview-type">{{ HERO_TYPE_ICON[String(previewHero.type).toLowerCase()] }} {{ previewHero.type }} · {{ heroStars(previewHero) }}-star</span>
            <div class="hero-stat-grid">
              <span class="stat-hp"><b>{{ previewHero.hp }}</b><small>HP</small></span>
              <span class="stat-attack"><b>{{ previewHero.attack }}</b><small>ATK</small></span>
              <span class="stat-defense"><b>{{ previewHero.defense }}</b><small>DEF</small></span>
              <span class="stat-speed"><b>{{ previewHero.speed }}</b><small>SPD</small></span>
            </div>
          </div>
          <div v-if="previewHero.talent" class="hero-talent-panel">
            <span class="panel-kicker">HERO TALENT &amp; ICON</span>
            <div class="talent-row">
              <TalentBadge :hero-id="previewHero.id" :type="previewHero.type" :talent="previewHero.talent" :size="56" />
              <span class="talent-text">
                <b class="talent-name">{{ previewHero.talent.name }}</b>
                <span class="talent-desc">{{ previewHero.talent.description }}</span>
              </span>
              <span class="talent-key" :title="talentKeyTooltip(previewHero.talent.linkedSlot)">{{ talentKeyLabel(previewHero.talent.linkedSlot) }}</span>
            </div>
          </div>
        </section>

        <section class="forest-scene" aria-label="A forest campfire with your selected hero">
          <div class="campfire-spotlight">
            <div class="campfire-glow" aria-hidden="true"></div>
            <svg class="campfire-art" viewBox="0 0 220 220" role="img" aria-label="A small animated campfire">
              <ellipse cx="110" cy="193" rx="77" ry="14" fill="#122b24" opacity=".42"/>
              <g class="campfire-logs">
                <path d="M48 164c19-17 91-26 128-4 8 5 9 14 2 19-31 20-101 20-132 4-8-4-7-14 2-19Z" fill="#874a2f" stroke="#452c25" stroke-width="5"/>
                <path d="M51 175c31-15 90-20 127-5M63 162l12 19m76-22-14 24" fill="none" stroke="#d28a4d" stroke-width="4" stroke-linecap="round"/>
                <path d="M57 148c22-9 36-5 42 6l-2 29c-11 13-31 16-44 4-10-10-8-27 4-39Zm106 0c-22-9-36-5-42 6l2 29c11 13 31 16 44 4 10-10 8-27-4-39Z" fill="#b86b3a" stroke="#603629" stroke-width="5"/>
                <path d="M58 158c12 9 24 16 39 20m-38-8 20-12m85 0c-12 9-24 16-39 20m38-8-20-12" fill="none" stroke="#e7a05b" stroke-width="3" stroke-linecap="round"/>
              </g>
              <g class="campfire-flames">
                <path d="M109 160c-34-17-48-43-27-77 3 19 11 23 16 29-2-41 26-58 37-91 16 27 7 44 22 64 12 17 23 34 13 55-9 18-35 28-61 20Z" fill="#ef7137"/>
                <path d="M110 160c-23-15-26-34-12-56 2 13 8 16 12 21 0-27 18-38 22-58 11 18 3 31 15 46 12 16 12 34-2 46-10 8-23 8-35 1Z" fill="#ffc34f"/>
                <path d="M112 160c-11-11-10-24-1-34 3 8 7 10 9 14 2-12 9-18 10-27 8 13 13 24 6 38-5 11-16 15-24 9Z" fill="#fff0a2"/>
              </g>
              <g class="fire-sparks" fill="#ffe28a"><circle cx="72" cy="88" r="3"/><circle cx="151" cy="73" r="2.5"/><circle cx="131" cy="47" r="2"/></g>
            </svg>
          </div>
          <div class="hero-spotlight">
            <div class="hero-halo" aria-hidden="true"></div>
            <div class="hero-preview-art"><HeroIcon v-if="previewHero" :hero="previewHero" :size="HERO_PREVIEW_EMOJI_PX * 3.2" :label="`${previewHero.name}, selected hero`" animated /></div>
          </div>
          <span class="forest-firefly firefly-one" aria-hidden="true"></span>
          <span class="forest-firefly firefly-two" aria-hidden="true"></span>
          <span class="forest-firefly firefly-three" aria-hidden="true"></span>
        </section>

        <section class="hero-selector" aria-label="Choose your hero">
          <div class="roster-heading"><strong>Choose an adventurer</strong></div>
          <div class="hero-roster-grid" :style="{ '--hero-cols': heroes.length }">
            <button
              v-for="hero in heroes"
              :key="hero.id"
              class="hero-chip"
              :class="[`rarity-${heroRarity(hero)}`, { selected: selectedHero?.id === hero.id, locked: !ownsHero(hero.id) }]"
              :style="{ '--rarity': heroRarityColor(hero) }"
              type="button"
              :aria-pressed="selectedHero?.id === hero.id"
              :aria-disabled="!ownsHero(hero.id)"
              @mouseenter="previewHeroOn(hero)"
              @mouseleave="previewHeroOff"
              @focus="previewHeroOn(hero)"
              @blur="previewHeroOff"
              @click="selectHero(hero)"
            >
              <HeroIcon :hero="hero" :size="42" />
              <span class="hero-chip-body">
                <span class="hero-chip-name">{{ hero.name }}</span>
                <span class="hero-chip-kind">{{ hero.type }}</span>
                <span class="hero-chip-stars" :aria-label="`${heroStars(hero)} out of 5 stars`">{{ '★'.repeat(heroStars(hero)) }}</span>
              </span>
              <span v-if="ownsHero(hero.id)" class="hero-chip-state">Owned</span>
              <span v-else class="hero-chip-state locked" aria-label="Locked">🔒</span>
            </button>
          </div>
        </section>
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
.hero-lab-page {
  --hero-art-size: 512px;
  --camp-ink: #23382f;
  --camp-pine: #254937;
  --camp-moss: #6e8048;
  --camp-paper: #fff7df;
  --camp-ember: #e88043;
  --camp-gold: #f1c45f;
  --camp-violet: #8062a9;
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 100%;
  padding: 0;
  color: var(--camp-ink);
  background: #32533e;
  border-radius: 0;
  overflow: hidden;
  font-family: "Nunito", "Trebuchet MS", system-ui, sans-serif;
}
.hero-lab-page strong { font-family: Georgia, "Palatino Linotype", serif; }
.hero-lab-page :deep(.muted), .hero-lab-page .muted, .hero-lab-page .small { color: #657267; }
.panel-kicker, .room-code-input, .kingdom-tile-level, .talent-heading, .talent-key {
  font-family: ui-monospace, "Cascadia Code", monospace;
  letter-spacing: .075em;
  text-transform: uppercase;
}
.hero-lab-page > .muted, .hero-lab-page > .note.bad { position: absolute; z-index: 8; top: 12px; left: 16px; margin: 0; }
.world-sides {
  position: relative;
  isolation: isolate;
  display: grid;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr) minmax(0, .915fr) minmax(0, 2.3fr);
  grid-template-rows: 16.2% 14.9% minmax(0, 1fr) auto;
  grid-template-areas: "room upgrades dossier" "room upgrades ." ". . ." "roster roster roster";
  column-gap: clamp(14px, 1.6vw, 22px);
  row-gap: 15px;
  padding: clamp(18px, 2.25vw, 31px) clamp(20px, 3.45vw, 48px) clamp(16px, 1.9vw, 26px);
  overflow: hidden;
  background-color: #32533e;
  background-image: linear-gradient(180deg, rgb(21 48 37 / 26%), rgb(28 51 37 / 5%) 54%, rgb(22 48 34 / 14%)), url('/hero-lab/assets/forest-clearing.svg');
  background-position: center;
  background-size: cover;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.world-sides::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  content: '';
  background: radial-gradient(ellipse at 50% 60%, rgb(251 225 150 / 13%), transparent 53%);
  pointer-events: none;
}
.world-sides .panel { margin: 0; padding: 15px 16px; }
.panel {
  position: relative;
  z-index: 1;
  color: var(--camp-ink);
  background-color: #fbf2d8;
  background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7);
  background-size: 144px 144px, auto;
  border: 2px solid #4b4835;
  border-radius: 14px 11px 16px 12px;
  box-shadow: 0 5px 0 rgb(35 56 47 / 72%), 0 10px 24px rgb(11 33 25 / 17%), inset 0 0 0 1px rgb(255 255 255 / 42%);
}
.panel-kicker { display: block; color: #778054; font-size: .6rem; font-weight: 900; }
.room-entry { grid-area: room; grid-row: 1 / 3; display: grid; align-content: stretch; gap: 0; }
.room-entry, .kingdom-preview { background-image: linear-gradient(135deg, #fff8e4, #f1e6c7); }
.room-entry, .hero-preview { align-self: stretch; height: 100%; max-height: 100%; overflow: hidden; padding: 10px 14px !important; }
.kingdom-preview { grid-area: upgrades; grid-row: 1 / 3; height: 100%; max-height: 100%; overflow: hidden; padding-block: 10px !important; grid-template-rows: auto minmax(0, 1fr); }
.room-join-block, .room-host-block { display: grid; align-content: center; gap: 5px; min-height: 0; }
.room-join-block { padding-bottom: 10px; border-bottom: 2px dashed #a79773; }
.room-host-block { padding-top: 10px; }
.kingdom-return { align-self: flex-start; margin: 0 0 6px; padding: 2px 0; color: var(--camp-pine); background: none; border: 0; font: 800 .8rem Nunito, Trebuchet MS, sans-serif; text-decoration: underline; cursor: pointer; }
.kingdom-return:focus-visible { outline: 3px solid #8062a9; outline-offset: 2px; }
.room-title { margin: 0; color: var(--camp-pine); font-family: Georgia, "Palatino Linotype", serif; font-size: clamp(19px, 1.55vw, 23px); font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.room-intro { margin: 0; color: #66745d; font-size: .68rem; line-height: 1.15; }
.room-actions { display: flex; align-items: center; gap: 7px; }
.room-code-input { flex: 1 1 0; width: auto; min-width: 0; padding: .45rem .35rem; text-align: center; font-size: .76rem !important; font-weight: 900; }
.room-code-input::placeholder { color: #8a8b7e; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.hero-lab-page :deep(.btn), .hero-lab-page .btn {
  min-height: 40px;
  padding: 7px 10px;
  color: var(--camp-ink);
  background: #fffaf0;
  border: 2px solid #4b4835;
  border-radius: 9px;
  box-shadow: 0 3px 0 #7a6545;
  font-family: ui-monospace, "Cascadia Code", monospace;
  font-size: .64rem;
  font-weight: 900;
  letter-spacing: .025em;
  transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
}
.hero-lab-page :deep(.btn.primary), .hero-lab-page .btn.primary {
  color: #3b2b1d;
  background: #f2ba55;
  border-color: #61472d;
  box-shadow: 0 4px 0 #9b612e;
}
.hero-lab-page :deep(.btn:hover:not(:disabled)), .hero-lab-page .btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 5px 0 #7a6545; }
.hero-lab-page :deep(.btn:active), .hero-lab-page .btn:active { transform: translateY(2px); box-shadow: 0 1px 0 #7a6545; }
.hero-lab-page :deep(.btn:disabled), .hero-lab-page .btn:disabled { color: #949284; background: #e6e1d0; box-shadow: 0 2px 0 #99927e; cursor: not-allowed; }
.hero-lab-page :deep(input), .hero-lab-page :deep(select) {
  min-height: 40px;
  color: var(--camp-ink);
  background: #fffdf6;
  border: 2px solid #67634d;
  border-radius: 8px;
}
.hero-lab-page :deep(input:focus-visible), .hero-lab-page :deep(select:focus-visible),
.hero-lab-page :deep(.btn:focus-visible), .hero-lab-page .btn:focus-visible,
.hero-lab-page .hero-chip:focus-visible { outline: 3px solid #f2ba55; outline-offset: 3px; }
.kingdom-preview { display: grid; align-content: stretch; gap: 7px; }
.kingdom-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); gap: 7px; min-height: 0; }
.kingdom-tile {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 1px;
  min-width: 0;
  min-height: 0;
  padding: 5px 4px;
  color: var(--camp-ink);
  text-align: center;
  background-color: #edf0d9;
  background-image: url('/hero-lab/assets/storybook-paper.svg');
  background-size: 144px 144px;
  border: 1px solid #827c60;
  border-radius: 9px;
  box-shadow: 0 2px 0 #9a8f6e;
}
.kingdom-tile:nth-child(2) { background-color: #f7e8d6; }
.kingdom-tile:nth-child(3) { background-color: #e1eddb; }
.kingdom-tile:nth-child(4) { background-color: #e9e1ef; }
.kingdom-tile.relevant { outline: 2px solid #e7aa3e; outline-offset: 1px; }
.kingdom-head { display: flex; align-items: center; gap: 6px; min-width: 0; height: 15px; }
.kingdom-tile-icon { width: 40px; height: 40px; overflow: visible; }
.kingdom-tile-name { font-size: .8rem; }
.kingdom-tile-level { color: #737660; font-size: .65rem; }
.kingdom-tile-effect { color: #4e5d4b; font-size: .68rem; line-height: 1.12; }
.hero-preview { grid-area: dossier; grid-row: 1; display: grid; grid-template-columns: .42fr 1fr; align-content: center; gap: 14px; margin-left: clamp(0px, 4.8vw, 67px); padding: 12px 20px !important; border-radius: 11px 15px 12px 14px; }
.hero-basic-stats { display: grid; align-content: center; gap: 3px; min-width: 0; }
.hero-preview-name { color: var(--camp-pine); font-size: clamp(19px, 1.6vw, 24px); line-height: 1; }
.hero-preview-type { color: #8062a9; font-size: .66rem; font-weight: 900; text-transform: capitalize; }
.hero-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; margin-top: 2px; }
.hero-stat-grid > span { display: grid; justify-items: center; gap: 0; padding: 4px; border: 1px solid #d2c6a8; border-radius: 6px; }
.hero-stat-grid .stat-hp { background: #e1efdd; border-color: #a7bf9c; }
.hero-stat-grid .stat-attack { background: #f8e4d1; border-color: #d6ae86; }
.hero-stat-grid .stat-defense { background: #e1eaf1; border-color: #a8bdcb; }
.hero-stat-grid .stat-speed { background: #eee5f2; border-color: #c2accb; }
.hero-stat-grid b { color: var(--camp-pine); font-size: .85rem; line-height: 1; }
.hero-stat-grid small { color: #75806c; font-size: .5rem; font-weight: 900; }
.hero-talent-panel { display: grid; align-content: center; gap: 7px; min-width: 0; padding-left: 16px; border-left: 2px solid #716247; }
.talent-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; }
.talent-text { display: grid; gap: 1px; min-width: 0; }
.talent-name { color: #304b38; font-size: 1.15rem; line-height: 1.2; }
.talent-desc { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; color: #637064; font-size: .86rem; line-height: 1.3; }
.talent-key { display: grid; place-items: center; min-width: 32px; min-height: 32px; padding: 4px 8px; color: #fff7df; background: #456b53; border: 1px solid #2d4937; border-radius: 7px; font-size: .75rem; font-weight: 900; }
.forest-scene {
  position: relative;
  z-index: 0;
  grid-column: 1 / 4;
  grid-row: 2 / 4;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  min-height: 0;
  isolation: isolate;
}
.campfire-spotlight, .hero-spotlight { position: relative; display: grid; justify-items: center; align-content: center; min-width: 0; height: 100%; }
.campfire-spotlight { align-content: end; padding-bottom: 0; }
.campfire-glow {
  position: absolute;
  bottom: 20%;
  left: 50%;
  width: min(33vw, 360px);
  aspect-ratio: 1;
  background: radial-gradient(circle, rgb(255 192 80 / 48%) 0, rgb(247 148 55 / 25%) 35%, transparent 70%);
  border-radius: 50%;
  filter: blur(10px);
  transform: translateX(-50%);
  animation: ember-glow 3s ease-in-out infinite alternate;
}
.campfire-art { position: relative; z-index: 1; width: clamp(220px, 20vw, 300px); max-height: 92%; overflow: visible; filter: drop-shadow(0 12px 12px rgb(15 30 22 / 35%)); }
.campfire-flames { transform-origin: 110px 164px; animation: fire-flicker 1.15s ease-in-out infinite alternate; }
.fire-sparks { animation: spark-rise 1.8s ease-in-out infinite; }
.hero-spotlight { align-content: center; padding: 0; margin-left: -5%; }
.hero-halo {
  position: absolute;
  top: 10%;
  left: 50%;
  width: min(39vw, 480px);
  height: min(38vw, 410px);
  background: radial-gradient(ellipse, rgb(238 220 157 / 70%) 0, rgb(213 210 137 / 34%) 45%, transparent 73%);
  border-radius: 50%;
  transform: translateX(-50%);
}
.hero-preview-art { position: absolute; z-index: 1; bottom: 12px; left: 50%; display: grid; place-items: center; width: clamp(480px, 48vw, 680px); height: calc(var(--hero-art-size) + 12px); transform: translateX(-50%); }
.hero-preview-art > .hero-icon { transform: translate(var(--preview-emoji-x, 0), var(--preview-emoji-y, 0)); }
.forest-firefly { position: absolute; z-index: 1; width: 5px; height: 5px; background: #f9e493; border-radius: 50%; box-shadow: 0 0 13px 4px rgb(251 220 118 / 75%); animation: firefly 3.4s ease-in-out infinite alternate; }
.firefly-one { top: 25%; left: 41%; }
.firefly-two { top: 50%; left: 68%; animation-delay: -1.4s; }
.firefly-three { top: 35%; left: 83%; animation-delay: -.8s; }
.hero-selector { position: relative; z-index: 2; grid-area: roster; display: grid; gap: 6px; padding: 8px 12px; color: var(--camp-ink); background-color: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 2px solid #4b4835; border-radius: 14px 11px 15px 12px; box-shadow: 0 5px 0 rgb(35 56 47 / 78%); }
.roster-heading { display: flex; align-items: center; min-height: 16px; }
.roster-heading strong { color: var(--camp-pine); font-size: .8rem; }
.roster-hint { color: #77806d; font-size: .68rem; }
.hero-row { display: grid; gap: 6px; }
.hero-row-label { width: fit-content; padding: 3px 8px; color: #496749; background: #e5ecd9; border: 1px solid #afbd9d; border-radius: 999px; font-size: .59rem; font-weight: 900; }
.hero-row:nth-child(3) .hero-row-label { color: #785c98; background: #eee6f1; border-color: #c5b1d1; }
.hero-roster-grid { display: grid; grid-template-columns: repeat(var(--hero-cols, 6), minmax(0, 1fr)); gap: 8px; }
.hero-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 62px;
  padding: 7px 11px;
  color: var(--camp-ink);
  background-color: #fffdf5;
  background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fffdf5, #f6edda);
  background-size: 144px 144px, auto;
  border: 1px solid #8a826b;
  border-top: 4px solid var(--rarity, #8a826b);
  border-bottom: 3px solid #a49574;
  border-radius: 10px;
  box-shadow: 0 2px 0 rgb(57 63 43 / 20%);
  text-align: left;
  font: inherit;
  cursor: pointer;
  transition: transform .14s ease, box-shadow .14s ease, background .14s ease;
}
.hero-chip:hover { transform: translateY(-2px); box-shadow: 0 5px 0 rgb(57 63 43 / 18%); }
.hero-chip:active { transform: translateY(1px); }
.hero-chip.selected { background-color: #e6eddb; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #f0f3df, #dfe8d4); border-color: #526d4e; border-top-color: var(--rarity, #526d4e); border-bottom-color: #3d5a43; box-shadow: 0 0 0 2px #f0bd54, 0 3px 0 #526d4e; }
.hero-chip.locked { filter: saturate(.55); opacity: .7; }
.hero-chip-body { display: grid; gap: 1px; min-width: 0; }
.hero-chip-name { overflow: hidden; color: var(--camp-pine); font-family: Georgia, serif; font-size: .83rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.hero-chip-kind { color: #75806c; font-size: .58rem; text-transform: capitalize; }
.hero-chip-stars { color: #bd8624; font-size: .61rem; letter-spacing: .07em; line-height: 1; }
.hero-chip.selected .hero-chip-stars { color: #8e6721; }
.hero-chip-state { margin-left: auto; color: #788073; font-size: .58rem; }
.hero-chip-state.locked { color: #7b5c6a; font-size: .78rem; }
.hero-lab-page :deep(.note.bad), .hero-lab-page .note.bad { color: #8a3340; background: #fde8dc; border-color: #b76360; }
@keyframes fire-flicker { from { transform: scale(.97) skewX(-1deg); } to { transform: scale(1.03, 1.06) skewX(1deg); } }
@keyframes ember-glow { from { opacity: .68; transform: translateX(-50%) scale(.92); } to { opacity: 1; transform: translateX(-50%) scale(1.08); } }
@keyframes spark-rise { 0%, 100% { opacity: .35; transform: translateY(5px); } 50% { opacity: 1; transform: translateY(-8px); } }
@keyframes firefly { from { opacity: .22; transform: translate(0, 6px) scale(.75); } to { opacity: 1; transform: translate(8px, -9px) scale(1.25); } }
@media (max-width: 1100px) {
  .hero-lab-page { height: auto; min-height: 100svh; overflow: visible; }
  .room-entry, .hero-preview { height: auto; max-height: none; overflow: visible; }
  .kingdom-preview { height: auto; max-height: none; overflow: visible; grid-template-rows: auto auto; }
  .world-sides {
    height: auto;
    min-height: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: auto auto minmax(390px, 1fr) auto;
    grid-template-areas: "room upgrades" "dossier dossier" "scene scene" "roster roster";
  }
  .room-entry, .kingdom-preview { grid-row: auto; }
  .forest-scene { grid-area: scene; }
  .hero-preview { grid-row: auto; margin-left: 0; }
}
@media (max-height: 820px) and (min-width: 1101px) {
  .hero-lab-page { height: 100%; min-height: 0; overflow: hidden; }
  .world-sides { height: 100%; min-height: 0; grid-template-rows: 16.2% 14.9% minmax(0, 1fr) auto; }
  .hero-preview { padding: 8px 18px !important; }
  /* The Camp Buffs panel is only ~31% of a short viewport tall. Shrink the tile
     icon and effect line so neither the "Lv N/3" nor the effect text wraps or
     spills past the tile border. */
  .kingdom-tile { padding: 4px; }
  .kingdom-tile-icon { width: 30px; height: 30px; }
  .kingdom-tile-effect { font-size: .6rem; }
}
@media (min-width: 1600px) and (min-height: 821px) {
  .hero-lab-page { --hero-art-size: 614px; }
  .hero-preview-art > .hero-icon { transform: translate(var(--preview-emoji-x, 0), var(--preview-emoji-y, 0)) scale(1.2); }
}
@media (max-width: 700px) {
  .hero-lab-page { height: auto; min-height: 100svh; padding: 0; overflow: visible; }
  .hero-lab-page { --hero-art-size: 256px; }
  .world-sides {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto;
    grid-template-areas: "room" "upgrades" "dossier" "scene" "roster";
    gap: 12px;
    padding: 12px;
    background-position: center;
  }
  .forest-scene { min-height: 420px; grid-template-columns: 1fr 1fr; }
  .hero-spotlight { margin-left: 0; }
  .campfire-art { width: clamp(150px, 31vw, 230px); }
  .hero-preview-art { width: clamp(240px, 48vw, 340px); }
  .hero-preview-art > .hero-icon { transform: translate(var(--preview-emoji-x, 0), var(--preview-emoji-y, 0)) scale(.5); }
  .hero-selector { padding: 12px; }
  .roster-hint { max-width: 110px; text-align: right; }
  .hero-roster-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .hero-chip { min-height: 54px; gap: 5px; padding: 6px; }
  .hero-chip .hero-icon { width: 32px !important; height: 32px !important; }
  .hero-chip-state { display: none; }
}
@media (max-height: 700px) and (min-width: 1101px) {
  .hero-lab-page { height: auto; min-height: 100svh; overflow: visible; }
  .hero-lab-page { --hero-art-size: 369px; }
  .world-sides { height: auto; min-height: 100svh; grid-template-rows: auto auto minmax(330px, 1fr) auto; }
  .room-entry, .kingdom-preview { grid-row: auto; }
  .forest-scene { grid-area: scene; }
  .hero-preview-art > .hero-icon { transform: translate(var(--preview-emoji-x, 0), var(--preview-emoji-y, 0)) scale(.72); }
}
@media (max-width: 380px) {
  .hero-lab-page { --hero-art-size: 164px; }
  .world-sides .panel { padding: 12px; }
  .room-actions { gap: 5px; }
  .room-code-input { width: 4.8rem; }
  .hero-roster-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .forest-scene { min-height: 340px; }
  .hero-preview-art { width: 160px; }
}
@media (max-width: 480px) {
  .hero-preview-art > .hero-icon { transform: translate(var(--preview-emoji-x, 0), var(--preview-emoji-y, 0)) scale(.5); }
}
@media (max-width: 380px) {
  .hero-preview-art > .hero-icon { transform: translate(var(--preview-emoji-x, 0), var(--preview-emoji-y, 0)) scale(.32); }
}
@media (prefers-reduced-motion: reduce) {
  .hero-lab-page *, .hero-lab-page *::before, .hero-lab-page *::after {
    scroll-behavior: auto !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
.hero-lab-frame { position: fixed; z-index: 10; inset: 0; display: block; width: 100vw; height: 100vh; height: 100dvh; border: 0; border-radius: 0; background: #70a94f; }
</style>
