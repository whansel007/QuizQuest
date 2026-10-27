<script setup>
// Student-facing entry point for the campfire defense game.
// The signed-in user's kingdom upgrades are applied by the authoritative game server.
//
// Layout: the pre-lobby World page is two sides — room entry + kingdom upgrade
// tiles on the left, hero preview + two-row hero selector on the right.
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import Heading from '../components/Heading.vue';
import HeroIcon from './HeroIcon.vue';
import { loadHome } from './home.js';
import { HERO_TYPE_ICON } from './hero-type.js';
import TalentBadge from './TalentBadge.vue';
import { GAME_CONFIG } from '../../../public/hero-lab/game-config.js';
import { talentKeyLabel, talentKeyTooltip } from '../../../public/hero-lab/talent-badge.js';
import {
  BASE_CAMPFIRE_HP, BUILDING_BONUS_PER_LEVEL, BUILDING_LEVEL_CAP, BUILDING_ICONS,
  HERO_PREVIEW_EMOJI_PX, HERO_PREVIEW_EMOJI_OFFSET_X_PX, HERO_PREVIEW_EMOJI_OFFSET_Y_PX,
  WORLD_LEFT_COLUMN_PCT, WORLD_RIGHT_COLUMN_PCT, WORLD_STACK_BREAKPOINT_PX,
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
// previewHero drives the preview panel AND the kingdom tile highlight: it
// follows the hovered hero and snaps back to the selection on mouse leave.
const previewHero = ref(null);
const rosterError = ref('');
const loadingRoster = ref(true);
const heroes = computed(() => roster.value?.catalog.heroes || []);
const ownsHero = (id) => roster.value?.inventory.heroes.includes(id) || false;
const buildingLevels = computed(() => roster.value?.kingdom?.buildings || {});

const buildings = [
  { id: 'library', name: 'Library', applies: (hero) => hero?.type === 'magic', label: 'magic attack' },
  { id: 'workshop', name: 'Workshop', applies: (hero) => hero?.type === 'physical', label: 'physical attack' },
  { id: 'garden', name: 'Garden', applies: () => true, label: 'campfire max HP per player' },
  { id: 'tower', name: 'Tower', applies: () => false, label: 'no combat bonus yet' },
];

const buildingLevel = (id) => Math.min(BUILDING_LEVEL_CAP, Math.max(0, Math.floor(Number(buildingLevels.value[id]) || 0)));
const buildingPercent = (id) => Math.round(buildingLevel(id) * BUILDING_BONUS_PER_LEVEL * 100);

// Short tile line, e.g. "+20% magic ATK" / "No combat bonus yet".
function tileEffect(building) {
  if (building.id === 'tower') return 'No combat bonus yet';
  const percent = buildingPercent(building.id);
  if (building.id === 'garden') return `+${percent}% campfire HP`;
  return `+${percent}% ${building.id === 'library' ? 'magic' : 'physical'} ATK`;
}

const tileIcon = (id) => BUILDING_ICONS[id] || '🏛️';

// Detail line 1: which attack building applies to the previewed hero.
const heroBonusLine = computed(() => {
  const hero = previewHero.value;
  if (!hero) return '';
  const parts = buildings
    .filter((building) => building.applies(hero) && building.id !== 'garden')
    .map((building) => `+${buildingPercent(building.id)}% ${building.label}`);
  return `${hero.name} receives ${parts.length ? parts.join(', ') : 'no matching attack building bonus'}.`;
});

// Detail line 2: the Garden numbers for this student's level. Kept to one line
// so the whole detail area stays within the two-line budget.
const gardenSummary = computed(() => {
  const perPlayer = Math.round(BASE_CAMPFIRE_HP * buildingPercent('garden') / 100);
  const maxPlayerBonus = Math.round(BASE_CAMPFIRE_HP * BUILDING_BONUS_PER_LEVEL * BUILDING_LEVEL_CAP);
  const soloMax = BASE_CAMPFIRE_HP + maxPlayerBonus;
  const fourPlayerMax = BASE_CAMPFIRE_HP + maxPlayerBonus * 4;
  return `Garden: +${perPlayer} HP/player · ${soloMax} solo · ${fourPlayerMax} with 4 players at Lv${BUILDING_LEVEL_CAP}`;
});

// Two selector rows, grouped by the hero's own type field (never a hardcoded list).
const heroRows = computed(() => ['physical', 'magic'].map((type) => ({
  type,
  label: `${HERO_TYPE_ICON[type]} ${type[0].toUpperCase()}${type.slice(1)}`,
  heroes: heroes.value.filter((hero) => String(hero.type).toLowerCase() === type),
})).filter((row) => row.heroes.length > 0));

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

// Tier colour for the card stroke, built from the summon/reveal palette:
// rare uses the reveal's blue and epic uses its gold. Common
// uses a neutral slate so the border stays visible on the dark panel (white, the
// reveal's common flash, would be near-invisible here).
const RARITY_COLOR = { common: '#7d879c', rare: '#4f8df7', epic: '#f5c84c' };
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
  if (data.type === 'hero-lab-room') {
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
  applyInitialHero();
});
onUnmounted(() => window.removeEventListener('message', returnToSelection));
</script>

<template>
  <section
    class="hero-lab-page"
    :style="{
      '--world-left': `${WORLD_LEFT_COLUMN_PCT}fr`,
      '--world-right': `${WORLD_RIGHT_COLUMN_PCT}fr`,
      '--world-stack-at': `${WORLD_STACK_BREAKPOINT_PX}px`,
      '--preview-emoji': `${HERO_PREVIEW_EMOJI_PX}px`,
      '--preview-emoji-x': `${HERO_PREVIEW_EMOJI_OFFSET_X_PX}px`,
      '--preview-emoji-y': `${HERO_PREVIEW_EMOJI_OFFSET_Y_PX}px`,
    }"
  >
    <template v-if="!inGame">
      <Heading title="World" />
      <p class="muted hero-lab-intro">Choose a hero, then create a lobby or join a friend's room. Move with WASD, aim with the mouse, fire with left-click. E is your skill, Q your ultimate.</p>
      <p class="hero-lab-tip">Tip: Move to deal more damage. Heal at the campfire.</p>

      <p v-if="loadingRoster" class="muted">Loading your hero collection…</p>
      <div v-else-if="rosterError" class="note bad">{{ rosterError }}</div>

      <div class="world-sides">
        <!-- LEFT: room entry + kingdom upgrade tiles -->
        <div class="world-side">
          <section class="panel room-entry" aria-label="Room entry">
            <strong>Play with friends</strong>
            <span class="muted small">Up to 4 heroes per room. The room code is shown in the top-right corner of the game.</span>
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
            <span v-if="selectedHero" class="small">Playing as <HeroIcon :hero="selectedHero" :size="16" /> {{ selectedHero.name }}.</span>
            <p v-if="roomError" class="note bad" role="alert">{{ roomError }}</p>
          </section>

          <section class="panel kingdom-preview" aria-label="Kingdom upgrades for this run">
            <strong>Your kingdom upgrades</strong>
            <div class="kingdom-tiles">
              <div
                v-for="building in buildings"
                :key="building.id"
                class="kingdom-tile"
                :class="{ relevant: previewHero && building.applies(previewHero), tower: building.id === 'tower' }"
              >
                <span class="kingdom-tile-icon" aria-hidden="true">{{ tileIcon(building.id) }}</span>
                <span class="kingdom-tile-name">{{ building.name }}</span>
                <span class="kingdom-tile-level">Lv {{ buildingLevel(building.id) }}/{{ BUILDING_LEVEL_CAP }}</span>
                <span class="kingdom-tile-effect">{{ tileEffect(building) }}</span>
              </div>
            </div>
            <div class="kingdom-detail">
              <span v-if="heroBonusLine" class="small">{{ heroBonusLine }}</span>
              <span class="small">{{ gardenSummary }}</span>
            </div>
          </section>
        </div>

        <!-- RIGHT: hero preview + two-row hero selector -->
        <div class="world-side">
          <section v-if="previewHero" class="panel hero-preview" aria-label="Hero preview">
            <div class="hero-preview-art">
              <HeroIcon :hero="previewHero" :size="HERO_PREVIEW_EMOJI_PX" animated />
            </div>
            <div class="hero-preview-body">
              <strong class="hero-preview-name">{{ previewHero.name }}</strong>
              <span class="hero-preview-type">{{ HERO_TYPE_ICON[String(previewHero.type).toLowerCase()] }} {{ previewHero.type }}</span>
              <span class="hero-preview-rarity">{{ previewHero.rarity }}★</span>
              <span class="hero-preview-stats">HP {{ previewHero.hp }} · Attack {{ previewHero.attack }} · Defense {{ previewHero.defense }} · Speed {{ previewHero.speed }}</span>
              <template v-if="previewHero.talent">
                <span class="talent-heading">Talent</span>
                <div class="talent-row">
                  <TalentBadge :hero-id="previewHero.id" :type="previewHero.type" :talent="previewHero.talent" />
                  <span class="talent-text">
                    <b class="talent-name">{{ previewHero.talent.name }}</b>
                    <span class="talent-desc">{{ previewHero.talent.description }}</span>
                  </span>
                  <span class="talent-key" :title="talentKeyTooltip(previewHero.talent.linkedSlot)">{{ talentKeyLabel(previewHero.talent.linkedSlot) }}</span>
                </div>
              </template>
            </div>
          </section>

          <section class="hero-selector" aria-label="Choose your hero">
            <div v-for="row in heroRows" :key="row.type" class="hero-row">
              <span class="hero-row-label">{{ row.label }}</span>
              <div class="hero-row-cards" :style="{ '--hero-cols': row.heroes.length }">
                <button
                  v-for="hero in row.heroes"
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
                  <HeroIcon :hero="hero" :size="20" />
                  <span class="hero-chip-body">
                    <span class="hero-chip-name">{{ hero.name }}</span>
                    <span class="hero-chip-stars" :aria-label="`${heroStars(hero)} out of 5 stars`">{{ '★'.repeat(heroStars(hero)) }}</span>
                  </span>
                  <span v-if="ownsHero(hero.id)" class="hero-chip-state">Owned</span>
                  <span v-else class="hero-chip-state locked" aria-label="Locked">🔒</span>
                </button>
              </div>
            </div>
          </section>
        </div>
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
  --qq-night: #14123a;
  --qq-panel: #1e1b4b;
  --qq-raised: #2b2766;
  --qq-ink: #101018;
  --qq-cream: #fff8e7;
  --qq-muted: #c9c5ee;
  --qq-sun: #ffd93d;
  --qq-sun-shade: #c98f00;
  --qq-sky: #3fa9f5;
  --qq-grape: #8b5cf6;
  width: 100%;
  padding: 16px;
  color: var(--qq-cream);
  background: var(--qq-night);
  font-family: "Nunito", system-ui, sans-serif;
  border-radius: 12px;
}
.hero-lab-page :deep(h1), .hero-lab-page :deep(h2), .hero-lab-page :deep(h3), .hero-lab-page strong,
.hero-lab-page .hero-chip-name, .hero-lab-page .hero-preview-name {
  font-family: "Pixelify Sans", "Silkscreen", system-ui, sans-serif;
}
.hero-lab-page :deep(h1) { color: var(--qq-sun); font-size: clamp(28px, 3vw, 40px); }
.hero-lab-page :deep(.muted), .hero-lab-page .muted, .hero-lab-page .small { color: var(--qq-muted); }
.hero-lab-page :deep(.panel), .hero-lab-page .panel {
  color: var(--qq-cream);
  background: var(--qq-panel);
  border: 4px solid var(--qq-ink);
  border-radius: 12px;
  box-shadow: 0 6px 0 var(--qq-ink);
}
.hero-lab-page :deep(.btn), .hero-lab-page .btn {
  min-height: 44px;
  color: var(--qq-ink);
  background: var(--qq-sky);
  border: 4px solid var(--qq-ink);
  border-radius: 12px;
  box-shadow: 0 4px 0 #1e78c8;
  font-family: "Pixelify Sans", "Silkscreen", system-ui, sans-serif;
  transition: transform 80ms ease, box-shadow 80ms ease;
}
.hero-lab-page :deep(.btn.primary), .hero-lab-page .btn.primary {
  color: var(--qq-ink);
  background: var(--qq-sun);
  border-color: var(--qq-ink);
  box-shadow: 0 4px 0 var(--qq-sun-shade);
}
.hero-lab-page :deep(.btn:active), .hero-lab-page .btn:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--qq-ink); }
.hero-lab-page :deep(.btn:disabled), .hero-lab-page .btn:disabled {
  color: var(--qq-muted);
  background: var(--qq-raised);
  opacity: .5;
  box-shadow: none;
  cursor: not-allowed;
  transform: none;
}
.hero-lab-page :deep(.btn:focus-visible), .hero-lab-page .btn:focus-visible,
.hero-lab-page .hero-chip:focus-visible { outline: 3px solid var(--qq-sun); outline-offset: 3px; }
.hero-lab-page :deep(input), .hero-lab-page :deep(select) {
  color: var(--qq-cream);
  background: var(--qq-raised);
  border: 3px solid var(--qq-ink);
  border-radius: 8px;
}
.hero-lab-page :deep(input:focus-visible), .hero-lab-page :deep(select:focus-visible) { outline: 3px solid var(--qq-sun); outline-offset: 2px; }
.hero-lab-intro { margin: .25rem 0 .1rem; }
.hero-lab-tip { margin: .1rem 0 .6rem; color: var(--qq-sun); font-weight: 700; }

/* Two sides: 42% left / 58% right, stacking below the configured breakpoint. */
.world-sides {
  display: grid;
  grid-template-columns: minmax(0, var(--world-left)) minmax(0, var(--world-right));
  gap: 16px;
  align-items: start;
}
.world-side { display: grid; gap: 12px; min-width: 0; width: 100%; justify-self: stretch; }
.world-sides .panel { margin-bottom: 0; padding: 12px 14px; }
@media (max-width: 900px) {
  .world-sides { grid-template-columns: minmax(0, 1fr); }
}

/* --- room entry --- */
.room-entry { display: grid; gap: 8px; }
.room-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.room-or { font-size: .75rem; }
.room-code-input { width: 8.5rem; padding: .4rem .55rem; font: 700 1.05rem/1 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .28em; text-transform: uppercase; text-align: center; }
.room-code-input::placeholder { color: var(--muted, #8b8b8b); letter-spacing: .2em; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }

/* --- kingdom upgrade tiles: one row of four equal columns, never stacked --- */
.kingdom-preview { display: grid; gap: 8px; }
.kingdom-tiles {
  display: grid;
  grid-template-columns: repeat(4, minmax(100px, 1fr));
  gap: 8px;
  overflow-x: auto;
}
.kingdom-tile {
  display: grid;
  gap: 1px;
  justify-items: center;
  padding: 8px 6px;
  text-align: center;
  background: var(--qq-raised);
  border: 3px solid var(--qq-ink);
  border-radius: 12px;
  box-shadow: 0 3px 0 var(--qq-ink);
}
.kingdom-tile.relevant { border-color: var(--qq-sun); background: var(--qq-panel); box-shadow: 0 3px 0 var(--qq-ink); }
.kingdom-tile.tower { opacity: .55; }
.kingdom-tile-icon { font-size: 26px; line-height: 1.1; }
.kingdom-tile-name { font-size: .82rem; font-weight: 700; }
.kingdom-tile-level { font-size: .72rem; color: var(--muted); }
.kingdom-tile-effect { font-size: .72rem; line-height: 1.2; }
.kingdom-detail { display: grid; gap: 1px; font-size: .72rem; line-height: 1.3; }

/* --- hero preview --- */
.hero-preview { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 16px; align-items: center; }
/* Emoji glyphs render wider than their font-size, so the art box is a little
   wider than the requested size to keep the name clear of the icon. */
.hero-preview-art { position: relative; display: grid; place-items: center; width: calc(var(--preview-emoji) * 1.25); height: calc(var(--preview-emoji) * 1.05); }
/* Nudge only the glyph: the platform shadow stays centred on the box. */
.hero-preview-art > .hero-icon { transform: translate(var(--preview-emoji-x, 0), var(--preview-emoji-y, 0)); }
/* soft platform shadow under the hero icon */
.hero-preview-art::after {
  position: absolute;
  bottom: 2px;
  left: 50%;
  width: 68%;
  height: 14px;
  content: '';
  background: var(--qq-ink);
  opacity: .28;
  border-radius: 50%;
  transform: translateX(-50%);
}
.hero-preview-body { display: grid; gap: 3px; min-width: 0; }
.hero-preview-name { font-size: 22px; line-height: 1.15; }
.hero-preview-type { font-size: .9rem; text-transform: capitalize; }
.hero-preview-rarity { font-size: .82rem; color: var(--muted); }
.hero-preview-stats { font-size: .84rem; }

/* --- talent row: badge + name/description + key chip --- */
.talent-heading { margin-top: 6px; font-size: .7rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.talent-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.talent-text { display: grid; gap: 1px; min-width: 0; }
.talent-name { font-size: .92rem; line-height: 1.2; }
/* Two lines at most, then ellipsis: the preview must never scroll. */
.talent-desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: .78rem;
  line-height: 1.25;
  color: var(--muted);
}
/* Key chip, styled like the HUD key labels under the ability buttons. */
.talent-key {
  display: grid;
  place-items: center;
  min-width: 26px;
  padding: 2px 6px;
  color: #fff;
  font-size: .72rem;
  font-weight: 800;
  letter-spacing: .04em;
  white-space: nowrap;
  background: #1b2432;
  border-radius: 5px;
}

/* --- hero selector: two labeled rows --- */
.hero-selector { display: grid; gap: 8px; }
.hero-row { display: grid; gap: 5px; }
.hero-row-label { font-size: .74rem; font-weight: 700; color: var(--qq-muted); }
/* Every hero button takes an equal share of the row, so the row reads as a
   grid of equally sized cards instead of ragged pills. */
.hero-row-cards { display: grid; grid-template-columns: repeat(var(--hero-cols, 3), minmax(0, 1fr)); gap: 6px; }
.hero-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: 44px;
  padding: 5px 9px;
  text-align: center;
  color: var(--qq-cream);
  font: inherit;
  font-size: .86rem;
  background: var(--qq-raised);
  border: 3px solid var(--qq-ink);
  border-radius: 12px;
  box-shadow: 0 4px 0 var(--qq-ink);
  cursor: pointer;
  transition: border-color .15s, background .15s, box-shadow .15s;
}
/* Rare and epic cards use their reveal colours on the outline; selection keeps
   its own sun outline so the current choice remains clear. */
.hero-chip.rarity-rare { border-color: #4da3ff; }
.hero-chip.rarity-epic { border-color: #ffc93c; }
.hero-chip.rarity-rare .hero-chip-stars { color: #7fb2ff; }
.hero-chip.rarity-epic .hero-chip-stars { color: #f5c84c; }
.hero-chip:hover { border-color: var(--qq-sun); }
.hero-chip:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--qq-ink); }
/* Selection is the accent OUTLINE, so the border can keep showing the tier. */
.hero-chip.selected { outline: 3px solid var(--qq-sun); outline-offset: 2px; }
.hero-chip.locked { cursor: pointer; opacity: .55; }
.hero-chip.locked .hero-chip-name { filter: grayscale(1); }
.hero-chip-body { display: grid; justify-items: center; gap: 1px; min-width: 0; }
.hero-chip-name { font-weight: 600; }
/* Rarity as actual stars under the name (tinted to match the tier). */
.hero-chip-stars { font-size: .64rem; line-height: 1.1; letter-spacing: .08em; color: #e8a33d; }
.hero-chip-state { font-size: .72rem; color: var(--muted); }
.hero-chip-state.locked { font-size: .8rem; }
.hero-icon { vertical-align: middle; }
@media (prefers-reduced-motion: reduce) {
  .hero-lab-page *, .hero-lab-page *::before, .hero-lab-page *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
@media (max-width: 600px) {
  .hero-lab-page { padding: 10px; }
  .kingdom-tiles { grid-template-columns: repeat(2, minmax(96px, 1fr)); }
  .hero-row-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .hero-chip { padding-inline: 5px; }
}

.hero-lab-frame { position: fixed; z-index: 10; inset: 0; display: block; width: 100vw; height: 100vh; border: 0; border-radius: 0; background: #70a94f; }
</style>
