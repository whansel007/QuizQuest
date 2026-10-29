<script setup>
// ============================================================
// STUDENT: walkable kingdom town
// HUD, building panels, the first-visit tour and the telescope
// hand-off to Hero Summon. The map itself lives in KingdomTown.
// ============================================================
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { S, api, retryablePost, setTab } from '../api.js';
import { fmtBundle, toast } from '../ui.js';
import AsyncButton from '../components/AsyncButton.vue';
import { loadHome } from './home.js';
import KingdomTown from './KingdomTown.vue';
import AvatarPreview from './AvatarPreview.vue';
import BuildingIcon from './BuildingIcon.vue';
import HeroIcon from './HeroIcon.vue';
import SummonSky from './SummonSky.vue';
import { HERO_LORE } from './kingdom/hero-lore.js';
import { BUILDING_ROLES, buildingCap, buildingEffect } from './kingdom/building-effects.js';
import { GAME_CONFIG } from '../../../public/hero-lab/game-config.js';
import {
  BUILDING_LEVEL_CAP, TOWN_AVATAR_DEFAULT_COLOR, TOWN_AVATAR_ORIGINAL_COLOR, TOWN_AVATAR_PRESET_COLORS, TOWN_MAX_HEROES,
} from '../../../config/tuning.js';

const error = ref('');
const loaded = ref(false);
const k = ref(null);
const homeData = ref(null);
const town = ref(null);
let alive = true;

onMounted(async () => {
  window.addEventListener('keydown', onTownKeydown);
  try {
    homeData.value = await loadHome();
    if (S.classId) {
      const kd = await api('GET', '/api/student/kingdom');
      if (!alive) return;
      k.value = kd;
    }
    if (alive) loaded.value = true;
    if (alive && k.value) maybeStartIntro();
  } catch (err) {
    if (alive) error.value = err.message;
  }
});
onUnmounted(() => {
  alive = false;
  window.removeEventListener('keydown', onTownKeydown);
  clearTimeout(lensTimer);
});

const R = computed(() => k.value.catalog.resources);
const ownedHeroes = computed(() => {
  const home = homeData.value;
  if (!home) return [];
  const owned = new Set(home.inventory.heroes);
  return home.catalog.heroes.filter((hero) => owned.has(hero.id));
});
const townHeroes = computed(() => ownedHeroes.value.slice(0, TOWN_MAX_HEROES));
const archiveHeroes = computed(() => homeData.value?.catalog?.heroes || []);
const archiveHero = ref(null);
const selectedArchiveHero = computed(() => archiveHero.value || archiveHeroes.value[0] || null);
const selectedHeroLore = computed(() => selectedArchiveHero.value && HERO_LORE[selectedArchiveHero.value.id]);
const archiveOpen = ref(false);
const bookBackButton = ref(null);
let archiveReturnFocus = null;
const decorativeShelves = Array.from({ length: 3 }, (_, shelf) => Array.from({ length: 13 }, (_, index) => ({
  id: `${shelf}-${index}`,
  title: ['Moon Atlas', 'The Moss Almanac', 'Songs for Small Storms', 'A Field Guide to Stars', 'The Clockmaker’s Fern'][((shelf * 13) + index) % 5],
  color: ['#c77b50', '#6b88a4', '#7b8f64', '#bba36d', '#876f91', '#bd695c', '#477d78'][((shelf * 13) + index) % 7],
})));
const workshopHeroes = computed(() => homeData.value?.catalog?.heroes || []);
const previewWorkshopHero = ref(null);
const trialStarting = ref(false);
const wardrobeHat = ref(null);
const wardrobeAccessory = ref(null);
const wardrobeCategory = ref('hats');
const wardrobeCatalog = ref([]);
const wardrobeOwnedIds = ref([]);
const wardrobeResources = ref({ wood: 0, crystal: 0, herb: 0 });
const wardrobeLoading = ref(false);
const wardrobeError = ref('');
const wardrobeClaiming = ref(null);
const wardrobeHats = computed(() => wardrobeCatalog.value.filter((item) => item.slot === 'hat' && item.active));
const wardrobeAccessories = computed(() => wardrobeCatalog.value.filter((item) => item.slot === 'accessory' && item.active));
const wardrobeColors = computed(() => wardrobeCatalog.value.filter((item) => item.slot === 'color' && item.active));
const wardrobeDirty = computed(() => wardrobeHat.value?.id !== wardrobeEquipped.value.hatId
  || wardrobeAccessory.value?.id !== wardrobeEquipped.value.accessoryId
  || wardrobeColors.value.find((item) => item.renderValue === wardrobeColor.value)?.id !== wardrobeEquipped.value.colorId);
const wardrobeCanSave = computed(() => (!wardrobeHat.value || wardrobeOwnedIds.value.includes(wardrobeHat.value.id))
  && (!wardrobeAccessory.value || wardrobeOwnedIds.value.includes(wardrobeAccessory.value.id)));
const wardrobeEquipped = ref({ hatId: null, accessoryId: null, colorId: null });
function wardrobePrice(item) {
  if (!item?.cost || !item.currency) return 'Free';
  return `${item.cost} ${R.value?.[item.currency]?.name || item.currency}`;
}
function wardrobeCanAfford(item) {
  return !item?.cost || (wardrobeResources.value[item.currency] || 0) >= item.cost;
}
function wardrobeShortfall(item) {
  const have = wardrobeResources.value[item.currency] || 0;
  return `Need ${wardrobePrice(item)} · have ${have}`;
}
const castleInfoOpen = ref(false);
const upgraders = {};
const townTarget = ref(null);
const customizeOpen = ref(false);
const listOpen = ref(false);
const tradeBoard = ref(null);
const tradeLoading = ref(false);
const tradeError = ref('');
const tradePending = ref(false);
const tradeGive = ref({ wood: 0, crystal: 0, herb: 0 });
const tradeWant = ref({ wood: 0, crystal: 0, herb: 0 });
const tradeConfirm = ref(null);
const tradePost = ref(null);
const tradeMutationPosts = new Map();
const tradeFilter = ref('all');
const tradePage = ref(0);
const tradeCreateConfirm = ref(false);
const TRADE_PAGE_SIZE = 5;
const filteredTowerTrades = computed(() => {
  const list = [...(tradeBoard.value?.market || []), ...(tradeBoard.value?.mine || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return tradeFilter.value === 'mine' ? list.filter((trade) => trade.mine) : list;
});
const tradePageCount = computed(() => Math.max(1, Math.ceil(filteredTowerTrades.value.length / TRADE_PAGE_SIZE)));
const towerTrades = computed(() => filteredTowerTrades.value.slice(tradePage.value * TRADE_PAGE_SIZE, (tradePage.value + 1) * TRADE_PAGE_SIZE));
const tradeConfirmPreview = computed(() => {
  const trade = tradeConfirm.value;
  const before = tradeBoard.value?.resources || {};
  if (!trade) return null;
  const resources = Object.keys(R.value || {});
  const after = Object.fromEntries(resources.map((key) => [key, (before[key] || 0) - (trade.want[key] || 0) + (trade.give[key] || 0)]));
  const affordable = Object.entries(trade.want).every(([key, amount]) => (before[key] || 0) >= amount);
  return { before, after, affordable };
});
const previewColor = ref(S.me?.avatarColor || TOWN_AVATAR_DEFAULT_COLOR);
const wardrobeColor = ref(S.me?.avatarColor || TOWN_AVATAR_DEFAULT_COLOR);
const colorSaving = ref(false);
const plots = computed(() => Object.keys(k.value.catalog.buildings).map((id) => {
  const def = k.value.catalog.buildings[id];
  const lvl = k.value.buildings[id];
  const cost = def.costs[lvl];
  const affordable = !!cost && Object.entries(cost).every(([r, v]) => (k.value.resources[r] || 0) >= v);
  return { id, def, lvl, cost, affordable };
}));
const townPlot = computed(() => townTarget.value && townTarget.value !== 'castle' ? plots.value.find((p) => p.id === townTarget.value) : null);
const castleMeaning = computed(() => k.value?.castleLevel === 0
  ? 'Your castle grows as every building reaches the same level.'
  : `Every building has reached level ${k.value?.castleLevel}. The castle level is the lowest level among your four buildings.`);
const heroesOfType = (type) => ownedHeroes.value.filter((hero) => hero.type === type);
const haveText = computed(() => {
  const res = Object.fromEntries(Object.entries(k.value?.resources || {}).filter(([, v]) => v > 0));
  return Object.keys(res).length ? fmtBundle(res, R.value) : 'nothing yet';
});

// ---- sound: shares the World's saved volume/mute setting ----------------
const SETTINGS_KEY = 'hero-lab-settings';
function readSoundSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { muted: Boolean(saved.muted), volume: Number.isFinite(Number(saved.masterVolume)) ? Number(saved.masterVolume) : GAME_CONFIG.arenaTuning.sound.defaultMasterVolume };
  } catch { return { muted: false, volume: GAME_CONFIG.arenaTuning.sound.defaultMasterVolume }; }
}
const sound = ref(readSoundSettings());
function toggleSound() {
  sound.value = { ...sound.value, muted: !sound.value.muted };
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, muted: sound.value.muted }));
  } catch { /* storage blocked: the choice lasts for this visit */ }
}

// ---- first-visit tour -----------------------------------------------------
// Remembered per student in this browser. There is no server-side flag for
// it, so a different browser or cleared storage shows the tour once more.
const INTRO_STEPS = [
  { highlight: 'castle', title: 'Welcome home!', body: 'This is your kingdom. The castle in the middle is your home, and it grows as your town does.' },
  { highlight: 'buildings', title: 'Four buildings', body: 'Garden to the north, Tower to the south, Library to the west and Workshop to the east. Upgrade them with the wood, crystal and herbs you earn to power up your heroes.' },
  { highlight: 'north', title: 'Adventure lies north', body: 'Walk up through the gap in the trees by the sign. Out there you can start a Duel quiz battle or join a Campfire Run with friends.' },
  { highlight: null, title: 'Getting around', body: 'Use WASD or the arrow keys, or click to walk. Press E at a door or beside a hero, and Z for emotes. The Buildings button opens any building from anywhere.' },
];
const introStep = ref(-1);
const introOpen = computed(() => introStep.value >= 0);
const introNext = ref(null);
const introKey = () => `qq-kingdom-intro-seen:${S.me?.id || S.me?.email || 'student'}`;
function maybeStartIntro() {
  let seen = false;
  try { seen = localStorage.getItem(introKey()) === '1'; } catch { /* storage blocked: show it this time */ }
  if (!seen) openIntro();
}
async function openIntro() {
  listOpen.value = false;
  townTarget.value = null;
  introStep.value = 0;
  await nextTick();
  introNext.value?.focus();
}
function closeIntro() {
  introStep.value = -1;
  try { localStorage.setItem(introKey(), '1'); } catch { /* storage blocked */ }
  town.value?.focus();
}
async function nextIntro() {
  if (introStep.value >= INTRO_STEPS.length - 1) { closeIntro(); return; }
  introStep.value += 1;
  await nextTick();
  introNext.value?.focus();
}

// ---- panels and navigation -------------------------------------------------
async function loadWardrobe() {
  wardrobeLoading.value = true;
  wardrobeError.value = '';
  try {
    const data = await api('GET', '/api/student/castle/wardrobe');
    wardrobeCatalog.value = data.catalog || [];
    wardrobeOwnedIds.value = data.ownedIds || [];
    wardrobeResources.value = data.resources || wardrobeResources.value;
    if (k.value && data.resources) k.value.resources = data.resources;
    wardrobeEquipped.value = data.equipped || { hatId: null, accessoryId: null, colorId: null };
    if (S.me) { S.me.avatarColor = data.avatarVisual?.color || S.me.avatarColor; S.me.avatarVisual = data.avatarVisual; }
    wardrobeHat.value = wardrobeHats.value.find((item) => item.id === wardrobeEquipped.value.hatId) || null;
    wardrobeAccessory.value = wardrobeAccessories.value.find((item) => item.id === wardrobeEquipped.value.accessoryId) || null;
    wardrobeColor.value = data.avatarVisual?.color || S.me?.avatarColor || TOWN_AVATAR_DEFAULT_COLOR;
  } catch (err) { wardrobeError.value = err.message; }
  finally { wardrobeLoading.value = false; }
}
async function claimWardrobeCosmetic(item) {
  if (wardrobeClaiming.value) return;
  wardrobeClaiming.value = item.id;
  wardrobeError.value = '';
  const selectedHat = wardrobeHat.value;
  const selectedAccessory = wardrobeAccessory.value;
  const selectedColor = wardrobeColor.value;
  try {
    const data = await retryablePost('/api/student/castle/wardrobe/purchase', { cosmeticId: item.id })();
    wardrobeCatalog.value = data.catalog || wardrobeCatalog.value;
    wardrobeOwnedIds.value = data.ownedIds || wardrobeOwnedIds.value;
    wardrobeResources.value = data.resources || wardrobeResources.value;
    if (k.value && data.resources) k.value.resources = data.resources;
    wardrobeEquipped.value = data.equipped || wardrobeEquipped.value;
    wardrobeHat.value = selectedHat;
    wardrobeAccessory.value = selectedAccessory;
    wardrobeColor.value = selectedColor;
    if (S.me) { S.me.avatarColor = data.avatarVisual?.color || S.me.avatarColor; S.me.avatarVisual = data.avatarVisual; }
    toast(data.alreadyOwned ? 'That keepsake is already in your wardrobe.' : item.cost ? `${item.name} added for ${wardrobePrice(item)}.` : 'Added to your wardrobe for free.');
  } catch (err) { wardrobeError.value = err.message; }
  finally { wardrobeClaiming.value = null; }
}
async function openArchiveBook(hero, event) {
  archiveHero.value = hero;
  archiveReturnFocus = event?.currentTarget || null;
  archiveOpen.value = true;
  await nextTick();
  bookBackButton.value?.focus();
}
function closeArchiveBook() {
  archiveOpen.value = false;
  nextTick(() => archiveReturnFocus?.focus?.());
}
function trapBookDialog(event) {
  if (event.key !== 'Tab') return;
  event.preventDefault();
  bookBackButton.value?.focus();
}
function onTownInteract(id) {
  if (id === 'duel') { setTab('practice'); return; }
  if (id === 'campfire') { setTab('world'); return; }
  customizeOpen.value = false;
  listOpen.value = false;
  townTarget.value = id;
  if (id === 'library') archiveOpen.value = false;
  if (id === 'tower') loadTradeBoard();
  if (id === 'castle') loadWardrobe();
}
function closePanel() {
  townTarget.value = null;
  tradeConfirm.value = null;
  castleInfoOpen.value = false;
  town.value?.focus();
}
function onTownKeydown(event) {
  if (event.key !== 'Escape') return;
  if (introOpen.value) { closeIntro(); event.stopPropagation(); }
  else if (archiveOpen.value) { closeArchiveBook(); event.stopPropagation(); }
  else if (townTarget.value) { closePanel(); event.stopPropagation(); }
  else if (listOpen.value) { listOpen.value = false; event.stopPropagation(); }
  else if (customizeOpen.value) { customizeOpen.value = false; event.stopPropagation(); }
}
function openCustomize() {
  townTarget.value = null;
  customizeOpen.value = true;
}

async function loadTradeBoard() {
  tradeBoard.value = null;
  tradeLoading.value = true;
  tradeError.value = '';
  try {
    tradeBoard.value = await api('GET', `/api/student/classes/${encodeURIComponent(S.classId)}/trades`);
    tradePage.value = Math.min(tradePage.value, Math.max(0, Math.ceil(filteredTowerTrades.value.length / TRADE_PAGE_SIZE) - 1));
  } catch (err) { tradeError.value = err.message; }
  finally { tradeLoading.value = false; }
}
function tradeBundleHasItems(bundle) { return Object.values(bundle).some((value) => Number(value) > 0); }
function reviewTrade() {
  tradeError.value = '';
  tradeCreateConfirm.value = true;
}
function setTradeAmount(side, resource, value) {
  const amount = Math.max(0, Math.min(20, Math.floor(Number(value) || 0)));
  (side === 'give' ? tradeGive.value : tradeWant.value)[resource] = amount;
}
async function createTrade() {
  if (tradePending.value) return;
  tradePending.value = true;
  tradeError.value = '';
  try {
    if (!tradePost.value) {
      const give = Object.fromEntries(Object.entries(tradeGive.value).map(([key, value]) => [key, Number(value)]).filter(([, value]) => value > 0));
      const want = Object.fromEntries(Object.entries(tradeWant.value).map(([key, value]) => [key, Number(value)]).filter(([, value]) => value > 0));
      tradePost.value = retryablePost(`/api/student/classes/${encodeURIComponent(S.classId)}/trades`, { give, want });
    }
    await tradePost.value();
    tradePost.value = null;
    tradeCreateConfirm.value = false;
    tradePage.value = 0;
    tradeGive.value = { wood: 0, crystal: 0, herb: 0 };
    tradeWant.value = { wood: 0, crystal: 0, herb: 0 };
    await loadTradeBoard();
    toast('Your offer is on the board.');
  } catch (err) { if (err.response) tradePost.value = null; tradeError.value = err.message; }
  finally { tradePending.value = false; }
}
function tradeMutationPost(action, tradeId) {
  const key = action + ':' + tradeId;
  if (!tradeMutationPosts.has(key)) {
    const path = '/api/student/trades/' + encodeURIComponent(tradeId) + '/' + action;
    tradeMutationPosts.set(key, retryablePost(path, {}));
  }
  return tradeMutationPosts.get(key)();
}
async function acceptTrade(trade) {
  if (!tradeConfirm.value || tradePending.value) return;
  tradePending.value = true;
  tradeError.value = '';
  try {
    await tradeMutationPost('accept', trade.id);
    tradeConfirm.value = null;
    await loadTradeBoard();
    k.value = await api('GET', '/api/student/kingdom');
  } catch (err) { await loadTradeBoard(); tradeError.value = err.message; }
  finally { tradePending.value = false; }
}
async function cancelTrade(trade) {
  if (tradePending.value) return;
  tradePending.value = true;
  tradeError.value = '';
  try {
    await tradeMutationPost('cancel', trade.id);
    await loadTradeBoard();
    k.value = await api('GET', '/api/student/kingdom');
  } catch (err) { await loadTradeBoard(); tradeError.value = err.message; }
  finally { tradePending.value = false; }
}

// Telescope: a lens closes over the town, then Hero Summon opens. Looking
// through it never pulls or spends anything.
const lensOn = ref(false);
let lensTimer;
function lookThroughTelescope() {
  if (lensOn.value) return;
  townTarget.value = null;
  lensOn.value = true;
  try { sessionStorage.setItem('qq-summon-from-telescope', '1'); } catch { /* the lens just won't open on arrival */ }
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { setTab('pets'); return; }
  lensTimer = setTimeout(() => setTab('pets'), 600);
}

async function chooseAvatarColor(color) {
  if (colorSaving.value || color === previewColor.value) return;
  const previous = previewColor.value;
  previewColor.value = color;
  colorSaving.value = true;
  try {
    const result = await api('POST', '/api/student/avatar/color', { color });
    S.me.avatarColor = result.avatarColor;
    S.me.avatarVisual = result.avatarVisual;
    previewColor.value = result.avatarColor;
    toast('Your new look is saved!');
  } catch (err) {
    previewColor.value = previous;
    toast(err.message, true);
  } finally { colorSaving.value = false; }
}
async function saveWardrobeLook() {
  if (colorSaving.value) return;
  const colorId = wardrobeColors.value.find((item) => item.renderValue === wardrobeColor.value)?.id;
  if (!colorId) { wardrobeError.value = 'Choose a color from the wardrobe swatches.'; return; }
  colorSaving.value = true;
  wardrobeError.value = '';
  try {
    const result = await api('PUT', '/api/student/castle/wardrobe/loadout', {
      hatId: wardrobeHat.value?.id || null,
      accessoryId: wardrobeAccessory.value?.id || null,
      colorId,
    });
    S.me.avatarColor = result.avatarColor;
    S.me.avatarVisual = result.avatarVisual;
    previewColor.value = result.avatarColor;
    wardrobeEquipped.value = result.equipped;
    wardrobeOwnedIds.value = result.ownedIds;
    wardrobeResources.value = result.resources || wardrobeResources.value;
    toast('Your royal look is saved!');
  } catch (err) { wardrobeError.value = err.message; }
  finally { colorSaving.value = false; }
}
async function startWorkshopTrial(hero) {
  if (trialStarting.value) return;
  trialStarting.value = true;
  try {
    const session = await api('POST', '/api/student/workshop/trial', { heroId: hero.id });
    window.location.assign(session.url);
  } catch (err) { toast(err.message, true); trialStarting.value = false; }
}
async function upgrade(p) {
  // the same build key is reused until the server confirms the build
  const r = await (upgraders[p.id] ||= retryablePost('/api/student/kingdom/build', { building: p.id }))();
  // update in place (no remount) so the new building art swaps in on the map
  const grew = r.castleLevel > k.value.castleLevel;
  Object.assign(k.value, { buildings: r.buildings, castleLevel: r.castleLevel, resources: r.resources });
  toast(grew ? `${p.def.name} upgraded - your castle grew!` : `${p.def.name} upgraded!`);
}
</script>

<template>
  <div class="kingdom-screen">
    <div v-if="error" class="scene-note scene-error" role="alert">{{ error }}</div>
    <template v-else-if="loaded && !S.classId">
      <div class="scene-note">
        <span class="scene-kicker">A LITTLE KINGDOM AWAITS</span>
        <h1>Find your party</h1>
        <p>Join a class to explore and build your town.</p>
        <button class="btn primary note-action" type="button" @click="setTab('practice')">Join a class in Practice</button>
      </div>
    </template>
    <template v-else-if="loaded">
      <KingdomTown
        ref="town"
        :buildings="plots"
        :castle-level="k.castleLevel"
        :avatar-color="previewColor"
        :avatar-visual="S.me?.avatarVisual"
        :heroes="townHeroes"
        :highlight="introOpen ? INTRO_STEPS[introStep].highlight : null"
        :paused="introOpen || !!townTarget || lensOn"
        :muted="sound.muted"
        :volume="sound.volume"
        @interact="onTownInteract"
      />

      <div class="town-hud town-title-hud">
        <span class="scene-kicker">WELCOME HOME</span>
        <h1 class="town-title"><span>Your Kingdom</span><span class="town-title-dot" aria-hidden="true"> · </span><span>Storybook Town</span></h1>
        <div class="town-title-actions">
          <button class="hud-btn" type="button" :aria-expanded="listOpen" aria-controls="town-building-list" @click="listOpen = !listOpen">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 17V8l7-5 7 5v9h-5v-5H8v5H3Z" /></svg>
            Buildings
          </button>
          <button class="hud-btn hud-icon" type="button" :aria-label="'Replay the kingdom tour'" title="Kingdom tour" @click="openIntro">?</button>
        </div>
      </div>
      <section v-if="listOpen" id="town-building-list" class="town-list" aria-label="Your buildings">
        <button type="button" class="town-list-entry" @click="onTownInteract('castle')">
          <svg class="building-icon" viewBox="0 0 48 48" aria-hidden="true"><path d="M8 42V18h6v5h5v-9h10v9h5v-5h6v24H28V32h-8v10H8Z" fill="#ebddb8" stroke="#57412f" stroke-width="2.4" stroke-linejoin="round" /><path d="M24 14V5l8 3-8 3" fill="#d86f6b" stroke="#57412f" stroke-width="2" stroke-linejoin="round" /></svg>
          <span><b>Castle</b><small>Centre</small></span><em>Lv {{ k.castleLevel }}/{{ BUILDING_LEVEL_CAP }}</em>
        </button>
        <button v-for="p in plots" :key="p.id" type="button" class="town-list-entry" @click="onTownInteract(p.id)">
          <BuildingIcon :building="p.id" />
          <span><b>{{ p.def.name }}</b><small>{{ { garden: 'North', tower: 'South', library: 'West', workshop: 'East' }[p.id] }}</small></span>
          <em :class="{ ready: p.affordable }">Lv {{ p.lvl }}/{{ buildingCap(p.id) }}<template v-if="p.affordable"> · ready</template></em>
        </button>
      </section>
      <div class="town-hud town-level">Castle · {{ k.castleLevel }} / {{ BUILDING_LEVEL_CAP }}</div>

      <div class="town-hud town-actions">
        <button class="hud-btn gold" type="button" :aria-expanded="customizeOpen" @click="customizeOpen = !customizeOpen">Customize</button>
        <button class="hud-btn" type="button" title="Emotes (Z)" @click="town?.openEmotes()">Emote <kbd>Z</kbd></button>
        <button class="hud-btn hud-icon" type="button" :aria-pressed="sound.muted" :aria-label="sound.muted ? 'Turn town sounds on' : 'Mute town sounds'" :title="sound.muted ? 'Sounds off' : 'Sounds on'" @click="toggleSound">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-4v12l-4-4H3Z" /><path v-if="!sound.muted" d="M13 7c1.4 1.6 1.4 4.4 0 6M15.5 5c2.6 2.8 2.6 7.2 0 10" fill="none" stroke-width="1.8" stroke-linecap="round" /><path v-else d="m13 7 5 6m0-6-5 6" fill="none" stroke-width="1.8" stroke-linecap="round" /></svg>
        </button>
      </div>
      <div class="town-hud town-controls-hud">
        <span><kbd>WASD</kbd> walk</span><span><kbd>E</kbd> open / greet</span><span><kbd>Z</kbd> emote</span><span class="north-hint">Battles: walk north ↑</span>
      </div>

      <section v-if="customizeOpen" class="avatar-customize" role="dialog" aria-label="Customize your town avatar">
        <button class="town-modal-close customize-close" type="button" aria-label="Close customization" @click="customizeOpen = false">×</button>
        <span class="town-modal-kicker">A NEW COAT OF COLOR</span>
        <h2>Customize your cat</h2>
        <AvatarPreview :color="previewColor" />
        <div class="avatar-swatches" role="group" aria-label="Avatar color presets">
          <button
            v-for="color in TOWN_AVATAR_PRESET_COLORS"
            :key="color"
            class="avatar-swatch"
            type="button"
            :style="{ '--swatch-color': color }"
            :aria-label="color === TOWN_AVATAR_ORIGINAL_COLOR ? 'Use original sprite color' : `Choose ${color}`"
            :title="color === TOWN_AVATAR_ORIGINAL_COLOR ? 'Original sprite color' : color"
            :aria-pressed="previewColor === color"
            :disabled="colorSaving"
            @click="chooseAvatarColor(color)"
          />
        </div>
        <p class="avatar-save-state" role="status">{{ colorSaving ? 'Saving your look…' : 'Pick a color to wear around town.' }}</p>
      </section>

      <!-- first-visit tour: a card along the bottom, so the town stays visible -->
      <section v-if="introOpen" class="town-intro" role="dialog" aria-labelledby="town-intro-title" aria-describedby="town-intro-body">
        <span class="town-modal-kicker">KINGDOM TOUR · {{ introStep + 1 }} OF {{ INTRO_STEPS.length }}</span>
        <h2 id="town-intro-title">{{ INTRO_STEPS[introStep].title }}</h2>
        <p id="town-intro-body">{{ INTRO_STEPS[introStep].body }}</p>
        <div class="town-intro-actions">
          <span class="intro-dots" aria-hidden="true"><i v-for="(s, i) in INTRO_STEPS" :key="i" :class="{ on: i === introStep }" /></span>
          <button class="btn" type="button" @click="closeIntro">Skip</button>
          <button ref="introNext" class="btn primary" type="button" @click="nextIntro">{{ introStep === INTRO_STEPS.length - 1 ? 'Start exploring' : 'Next' }}</button>
        </div>
      </section>

      <div v-if="townTarget" class="town-modal-shade" @pointerdown.self="closePanel">
        <section class="town-modal" :class="`theme-${townTarget}`" role="dialog" aria-modal="true" aria-labelledby="town-panel-title">
          <header class="panel-head">
            <div class="panel-title">
              <span class="town-modal-kicker">{{ BUILDING_ROLES[townTarget].kicker }}</span>
              <h2 id="town-panel-title">{{ townTarget === 'castle' ? 'Castle' : townPlot?.def.name }}</h2>
              <p class="panel-level">
                <span class="level-pips" aria-hidden="true"><i v-for="n in BUILDING_LEVEL_CAP" :key="n" :class="{ on: n <= (townTarget === 'castle' ? k.castleLevel : townPlot.lvl) }" /></span>
                Level {{ townTarget === 'castle' ? k.castleLevel : townPlot.lvl }} / {{ townTarget === 'castle' ? BUILDING_LEVEL_CAP : buildingCap(townPlot.id) }}
              </p>
            </div>
            <dl v-if="townPlot" class="panel-effect compact-effect">
              <div><dt>Now</dt><dd>{{ townPlot.lvl ? buildingEffect(townPlot.id, townPlot.lvl) : 'Not built yet' }}</dd></div>
              <div v-if="townPlot.cost"><dt>At next level</dt><dd>{{ buildingEffect(townPlot.id, townPlot.lvl + 1) }}</dd></div>
            </dl>
            <div v-if="townPlot" class="panel-upgrade">
              <AsyncButton v-if="townPlot.cost" class="btn" :class="{ primary: townPlot.affordable }" :disabled="!townPlot.affordable" :run="() => upgrade(townPlot)">
                {{ townPlot.lvl ? 'Upgrade' : 'Build' }} · {{ fmtBundle(townPlot.cost, R) }}
              </AsyncButton>
              <span v-else class="max-badge">Highest level</span>
            </div>
            <button v-else-if="townTarget === 'castle'" class="castle-info-chip" type="button" :aria-expanded="castleInfoOpen" aria-controls="castle-upgrade-info" @click="castleInfoOpen = !castleInfoOpen"><span aria-hidden="true">i</span> Castle growth</button>
            <button class="town-modal-close" type="button" aria-label="Close" @click="closePanel">×</button>
          </header>

          <section v-if="castleInfoOpen && townTarget === 'castle'" id="castle-upgrade-info" class="castle-info-card" aria-label="How castle levels grow">
            <button class="book-back" type="button" @click="castleInfoOpen = false">Close explanation</button>
            <h3>The castle follows your town</h3>
            <p>{{ castleMeaning }}</p>
            <ol class="castle-levels"><li v-for="level in BUILDING_LEVEL_CAP" :key="level" :class="{ done: k.castleLevel >= level }">Level {{ level }} · All four buildings reach level {{ level }}.</li></ol>
          </section>

          <template v-if="townPlot">
            <p v-if="townPlot.cost && !townPlot.affordable" class="panel-note">You have {{ haveText }}. Gather more through Practice or by exploring the World.</p>
          </template>

          <!-- role-specific content -->
          <div class="panel-content">
            <template v-if="townTarget === 'garden'">
              <div class="sky-card">
                <div class="garden-sky" aria-hidden="true">
                  <SummonSky class="garden-star-sky" />
                  <svg class="sky-constellations" viewBox="0 0 1200 640" preserveAspectRatio="xMidYMid meet">
                    <g class="constellation"><path d="M70 110 145 65 212 96 285 40 345 88"/><circle cx="70" cy="110" r="4"/><circle cx="145" cy="65" r="5"/><circle cx="212" cy="96" r="3"/><circle cx="285" cy="40" r="5"/><circle cx="345" cy="88" r="4"/></g>
                    <g class="constellation"><path d="M460 185 520 125 600 152 650 90 725 118 765 58"/><circle cx="460" cy="185" r="4"/><circle cx="520" cy="125" r="5"/><circle cx="600" cy="152" r="3"/><circle cx="650" cy="90" r="4"/><circle cx="725" cy="118" r="5"/><circle cx="765" cy="58" r="4"/></g>
                    <g class="constellation"><path d="M865 150 925 98 1005 120 1080 62 1150 100"/><circle cx="865" cy="150" r="4"/><circle cx="925" cy="98" r="5"/><circle cx="1005" cy="120" r="3"/><circle cx="1080" cy="62" r="5"/><circle cx="1150" cy="100" r="4"/></g>
                    <g class="constellation"><path d="M285 330 350 285 415 314 475 250 550 280"/><circle cx="285" cy="330" r="4"/><circle cx="350" cy="285" r="5"/><circle cx="415" cy="314" r="3"/><circle cx="475" cy="250" r="5"/><circle cx="550" cy="280" r="4"/></g>
                    <g class="constellation"><path d="M710 360 770 300 830 330 900 255 960 288 1025 235"/><circle cx="710" cy="360" r="4"/><circle cx="770" cy="300" r="5"/><circle cx="830" cy="330" r="3"/><circle cx="900" cy="255" r="5"/><circle cx="960" cy="288" r="4"/><circle cx="1025" cy="235" r="5"/></g>
                  </svg>
                  <div class="garden-horizon" />
                  <svg class="telescope-art" viewBox="0 0 180 110"><path d="M62 67 38 102M104 68l24 34M82 69v34" stroke="#8a6541" stroke-width="8" stroke-linecap="round"/><path d="m54 27 75-13 8 27-75 14z" fill="#d4a95f" stroke="#1d263f" stroke-width="5" stroke-linejoin="round"/><path d="m130 14 20-4 8 29-20 2z" fill="#77bad0" stroke="#1d263f" stroke-width="5" stroke-linejoin="round"/><path d="M66 28 61 15l35-6 2 13" fill="#e7c47d" stroke="#1d263f" stroke-width="4" stroke-linejoin="round"/></svg>
                </div>
                <div class="garden-caption">
                  <span class="scene-kicker">THE STAR GARDEN</span>
                  <h3>The stargazing telescope</h3>
                  <p>Settle in among the garden lights and follow a shooting star. Looking through the telescope opens Hero Summon; the visit is free, and summoning always asks you first.</p>
                  <button class="btn primary" type="button" @click="lookThroughTelescope">Look through the telescope</button>
                </div>
              </div>
            </template>
            <template v-else-if="townTarget === 'tower'">
              <div class="tower-feature">
                <section class="tower-board" aria-label="Class exchange request board">
                  <div class="tower-board-heading"><div class="radio-face" aria-hidden="true"><span>◖</span><i /><b>FM</b></div><div><span class="preview-tag">Class channel · {{ homeData?.classes?.find((c) => c.id === S.classId)?.name || 'Selected class' }}</span><h3>Exchange notices</h3><p v-if="tradeBoard?.enabled">Offers are visible only to this class. Posted resources stay pinned in escrow until accepted or cancelled.</p><p v-else-if="tradeBoard && !tradeBoard.enabled">Trading is turned off for this class.</p><p v-if="tradeBoard?.enabled && !tradeBoard.unlocked">Upgrade the Tower to level 1 to unlock class trading.</p></div></div>
                  <div class="tower-filter-row"><span class="trade-state" role="status">{{ tradeLoading ? 'Tuning the class radio…' : tradeError || 'Latest requests from your classmates' }}</span><label>Show <select v-model="tradeFilter" @change="tradePage = 0"><option value="all">All open notes</option><option value="mine">My notes</option></select></label></div>
                  <p v-if="tradeError" class="trade-error" role="alert">{{ tradeError }} <button class="text-button" type="button" @click="loadTradeBoard">Try again</button></p>
                  <div v-if="tradeBoard?.enabled && tradeBoard?.unlocked" class="pinned-notes">
                    <p v-if="!towerTrades.length" class="empty-board-note">No notes on the board yet. Write the first request at the offer desk.</p>
                    <article v-for="trade in towerTrades" :key="trade.id" class="trade-entry" :class="{ own: trade.mine }">
                      <span class="note-pin" aria-hidden="true" />
                      <div class="note-author"><b>{{ trade.from }}</b><span v-if="trade.mine" class="trade-state">Your note · resources held</span></div>
                      <div class="note-exchange"><span><small>OFFER</small>{{ fmtBundle(trade.give, R) }}</span><b aria-hidden="true">⇄</b><span><small>LOOKING FOR</small>{{ fmtBundle(trade.want, R) }}</span></div>
                      <template v-if="trade.mine"><button class="btn note-action" type="button" :disabled="tradePending" @click="cancelTrade(trade)">Unpin · return resources</button></template>
                      <button v-else class="btn note-action" type="button" :disabled="tradePending" @click="tradeConfirm = trade">Read &amp; accept</button>
                    </article>
                                      <nav v-if="filteredTowerTrades.length > TRADE_PAGE_SIZE" class="trade-pagination" aria-label="Exchange note pages">
                      <button class="text-button" type="button" :disabled="tradePage === 0" @click="tradePage--">← Newer notes</button>
                      <span>Page {{ tradePage + 1 }} of {{ tradePageCount }} · {{ filteredTowerTrades.length }} notes</span>
                      <button class="text-button" type="button" :disabled="tradePage + 1 >= tradePageCount" @click="tradePage++">Older notes →</button>
                    </nav>
</div>
                  <div v-if="tradeConfirm" class="trade-confirm" role="alertdialog" aria-modal="true" aria-label="Confirm trade">
                    <p>Accept {{ tradeConfirm.from }}’s offer? You give {{ fmtBundle(tradeConfirm.want, R) }} and receive {{ fmtBundle(tradeConfirm.give, R) }}.</p>
                    <dl v-if="tradeConfirmPreview" class="trade-preview-values"><div><dt>Your resources now</dt><dd>{{ fmtBundle(tradeConfirmPreview.before, R) }}</dd></div><div v-if="tradeConfirmPreview.affordable"><dt>After the exchange</dt><dd>{{ fmtBundle(tradeConfirmPreview.after, R) }}</dd></div></dl>
                    <p v-if="tradeConfirmPreview && !tradeConfirmPreview.affordable" class="trade-error">You do not currently have enough resources for this note.</p>
                    <button class="btn" type="button" :disabled="tradePending" @click="tradeConfirm = null">Close note</button>
                    <button class="btn primary" type="button" :disabled="tradePending || !tradeConfirmPreview?.affordable" @click="acceptTrade(tradeConfirm)">{{ tradePending ? 'Trading…' : 'Yes, accept' }}</button>
                  </div>
                </section>
                <aside class="tower-offer-desk" aria-labelledby="tower-offer-title">
                  <span class="preview-tag">Offer desk</span><h3 id="tower-offer-title">Write a request</h3>
                  <p>Tell your class what you can trade and what you hope to find.</p>
                  <template v-if="tradeBoard?.enabled && tradeBoard?.unlocked">
                    <div class="trade-columns">
                      <fieldset v-for="side in ['give', 'want']" :key="side" class="offer-paper">
                        <legend>{{ side === 'give' ? 'I can offer' : 'I am looking for' }}</legend>
                        <label v-for="(resource, key) in R" :key="key"><span>{{ resource.emoji }} {{ resource.name }}</span><input :value="side === 'give' ? tradeGive[key] : tradeWant[key]" type="number" min="0" max="20" inputmode="numeric" :disabled="tradePending || !!tradePost" @input="setTradeAmount(side, key, $event.target.value)" /></label>
                      </fieldset>
                    </div>
                    <p class="offer-rules">Available: {{ fmtBundle(tradeBoard.resources, R) }}<br>Up to 20 units per side · {{ tradeBoard.limits.maxOpenPerStudent }} open notes</p>
                    <section v-if="tradeCreateConfirm" class="trade-create-confirm" role="alertdialog" aria-label="Review your exchange note">
                      <h4>Review before pinning</h4>
                      <p>You offer {{ fmtBundle(tradeGive, R) }} and ask for {{ fmtBundle(tradeWant, R) }}.</p>
                      <p>Pinning this note holds your offered resources in escrow until a classmate accepts or you unpin it.</p>
                      <button class="btn" type="button" :disabled="tradePending || !!tradePost" @click="tradeCreateConfirm = false">Edit offer</button>
                      <button class="btn primary" type="button" :disabled="tradePending" @click="createTrade">{{ tradePending ? 'Pinning…' : tradePost ? 'Retry pinning note' : 'Confirm and pin' }}</button>
                    </section>
                    <button v-else class="btn primary" type="button" :disabled="tradePending || !tradeBundleHasItems(tradeGive) || !tradeBundleHasItems(tradeWant)" @click="reviewTrade">Review my offer</button>
                  </template>
                  <p v-else-if="tradeBoard && !tradeBoard.enabled" class="offer-rules">Your class teacher has turned trading off.</p>
                  <p v-else-if="tradeError" class="offer-rules">Resolve the board notice to make an offer.</p>
                  <p v-else class="offer-rules">Loading your class exchange rules…</p>
                </aside>
              </div>
            </template>
            <template v-else-if="townTarget === 'library'">
              <div class="library-feature">
                <section class="library-shelves" aria-label="Hero story archive">
                  <div class="shelf-heading"><div><span class="preview-tag">The archive</span><h3>Choose a volume</h3></div><span class="library-magic-note">The library strengthens magic heroes. Every hero has a place on these shelves.</span></div>
                  <div class="bookcase" aria-label="Three shelves of storybooks">
                    <div v-for="(books, shelfIndex) in decorativeShelves" :key="shelfIndex" class="shelf-row">
                      <div class="shelf" :aria-label="`Shelf ${shelfIndex + 1}`">
                        <button v-if="shelfIndex === 0" v-for="hero in archiveHeroes" :key="hero.id" class="spine hero-spine" :class="{ selected: archiveOpen && archiveHero?.id === hero.id }" type="button" :aria-pressed="archiveOpen && archiveHero?.id === hero.id" :aria-label="`Open ${hero.name}'s story`" @click="openArchiveBook(hero, $event)">{{ hero.name }}</button>
                        <span v-for="book in books" :key="book.id" class="spine decorative-spine" :style="{ '--book-color': book.color }" :title="book.title" aria-hidden="true" />
                      </div>
                    </div>
                  </div>
                </section>
                <div v-if="archiveOpen && selectedArchiveHero" class="storybook-overlay" @pointerdown.self="closeArchiveBook">
                  <div class="storybook-spread" role="dialog" aria-modal="true" :aria-label="`${selectedArchiveHero.name}'s story`" @keydown="trapBookDialog">
                  <article class="storybook-page story-left">
                    <button ref="bookBackButton" class="book-back" type="button" @click="closeArchiveBook">← Back to the shelves</button>
                    <span class="preview-tag">{{ selectedArchiveHero.rarity }} · {{ selectedArchiveHero.type }} hero</span>
                    <h3>{{ selectedArchiveHero.name }}</h3>
                    <p class="hero-personality">{{ selectedHeroLore?.personality || 'A valued member of the town’s defenders.' }}</p>
                    <p class="story-copy">{{ selectedHeroLore?.story || `${selectedArchiveHero.name} brings ${selectedArchiveHero.weapon || 'their own talents'} to every adventure. Their signature skill is ${selectedArchiveHero.skill || 'always ready'}, and their ultimate is ${selectedArchiveHero.ultimate || 'a force to reckon with'}.` }}</p>
                    <p v-if="selectedHeroLore?.fieldNote" class="field-note"><b>Field note</b> · {{ selectedHeroLore.fieldNote }}</p>
                    <dl class="hero-book-stats"><div><dt>HP</dt><dd>{{ selectedArchiveHero.hp }}</dd></div><div><dt>Attack</dt><dd>{{ selectedArchiveHero.attack }}</dd></div><div><dt>Defense</dt><dd>{{ selectedArchiveHero.defense }}</dd></div><div><dt>Speed</dt><dd>{{ selectedArchiveHero.speed }}</dd></div></dl>
                  </article>
                  <div class="storybook-page story-right">
                    <div class="portrait-stage"><div class="portrait-halo" /><HeroIcon :hero="selectedArchiveHero" :size="220" :label="`${selectedArchiveHero.name} portrait`" :animated="true" /></div>
                    <h3>{{ selectedArchiveHero.emoji }} {{ selectedArchiveHero.name }}</h3>
                    <dl class="hero-abilities"><div><dt>Primary fire</dt><dd>{{ selectedArchiveHero.weapon || 'Heroic strike' }}</dd></div><div><dt>Skill</dt><dd>{{ selectedArchiveHero.skill || 'Signature skill' }}</dd></div><div><dt>Ultimate</dt><dd>{{ selectedArchiveHero.ultimate || 'Ultimate power' }}</dd></div><div v-if="GAME_CONFIG.heroes[selectedArchiveHero.id]?.talent"><dt>Talent · {{ GAME_CONFIG.heroes[selectedArchiveHero.id].talent.name }}</dt><dd>{{ GAME_CONFIG.heroes[selectedArchiveHero.id].talent.description }}</dd></div></dl>
                  </div>
                  </div>
                </div>
              </div>
            </template>
            <template v-else-if="townTarget === 'workshop'">
              <div class="gym-card workshop-feature">
                <div class="workshop-roster" role="group" aria-label="Choose a hero to preview">
                  <button v-for="hero in workshopHeroes" :key="hero.id" class="workshop-hero" :class="{ selected: (previewWorkshopHero || workshopHeroes[0])?.id === hero.id }" type="button" :aria-pressed="(previewWorkshopHero || workshopHeroes[0])?.id === hero.id" @click="previewWorkshopHero = hero"><span>{{ hero.emoji }}</span><b>{{ hero.name }}</b><small>{{ hero.rarity }}</small></button>
                </div>
                <article v-if="previewWorkshopHero || workshopHeroes[0]" class="workshop-detail">
                  <div class="workshop-preview-stage" aria-label="Animated hero preview in the training yard"><span class="practice-target" aria-hidden="true" /><HeroIcon :hero="previewWorkshopHero || workshopHeroes[0]" :size="132" :label="`${(previewWorkshopHero || workshopHeroes[0]).name} training preview`" :animated="true" /></div>
                  <span class="preview-tag">Training dummy · preview</span>
                  <h3>{{ (previewWorkshopHero || workshopHeroes[0]).emoji }} {{ (previewWorkshopHero || workshopHeroes[0]).name }}</h3>
                  <p>{{ (previewWorkshopHero || workshopHeroes[0]).weapon || 'A practiced fighter' }} · {{ (previewWorkshopHero || workshopHeroes[0]).skill || 'Signature skill' }} · {{ (previewWorkshopHero || workshopHeroes[0]).ultimate || 'Ultimate' }}</p>
                  <dl class="hero-book-stats"><div><dt>HP</dt><dd>{{ (previewWorkshopHero || workshopHeroes[0]).hp }}</dd></div><div><dt>Attack</dt><dd>{{ (previewWorkshopHero || workshopHeroes[0]).attack }}</dd></div><div><dt>Defense</dt><dd>{{ (previewWorkshopHero || workshopHeroes[0]).defense }}</dd></div><div><dt>Speed</dt><dd>{{ (previewWorkshopHero || workshopHeroes[0]).speed }}</dd></div></dl>
                  <dl class="trial-cooldowns"><div><dt>Primary</dt><dd>{{ ((GAME_CONFIG.heroes[(previewWorkshopHero || workshopHeroes[0]).id]?.weaponCooldownMs || 0) / 1000).toFixed(1) }}s</dd></div><div><dt>Skill</dt><dd>{{ ((GAME_CONFIG.heroes[(previewWorkshopHero || workshopHeroes[0]).id]?.skillCooldownMs || 0) / 1000).toFixed(1) }}s</dd></div><div><dt>Ultimate</dt><dd>{{ ((GAME_CONFIG.heroes[(previewWorkshopHero || workshopHeroes[0]).id]?.ultimateCooldownMs || 0) / 1000).toFixed(1) }}s</dd></div></dl>
                  <p v-if="GAME_CONFIG.heroes[(previewWorkshopHero || workshopHeroes[0]).id]?.talent" class="trial-talent"><b>{{ GAME_CONFIG.heroes[(previewWorkshopHero || workshopHeroes[0]).id].talent.name }}</b> · {{ GAME_CONFIG.heroes[(previewWorkshopHero || workshopHeroes[0]).id].talent.description }}</p>
                  <p class="trial-note">Practice privately with any hero. Trials use the real combat controls and grant no rewards or progress. Workshop levels still boost physical heroes in Campfire Run.</p>
                  <button class="btn primary trial-start" type="button" :disabled="trialStarting" @click="startWorkshopTrial(previewWorkshopHero || workshopHeroes[0])">{{ trialStarting ? 'Opening training ground…' : 'Start Test' }}</button>
                </article>
              </div>
            </template>
            <template v-else-if="townTarget === 'castle'">
              <div class="wardrobe-feature">
                <section class="wardrobe-catalog" aria-labelledby="wardrobe-title">
                  <div class="wardrobe-title-row"><div><span class="preview-tag">Castle wardrobe</span><h3 id="wardrobe-title">Dress for your next tale</h3></div><span class="wardrobe-stamp" aria-hidden="true">ROYAL<br>SEAL</span></div>
                  <p>Try-ons are free. Add keepsakes with the resources you gather around town, then save the look to equip them.</p>
                  <p class="wardrobe-purse">On hand: {{ fmtBundle(wardrobeResources, R) }}</p>
                  <p v-if="wardrobeLoading" class="wardrobe-status" role="status">Opening the wardrobe…</p>
                  <p v-if="wardrobeError" class="wardrobe-error" role="alert">{{ wardrobeError }}</p>
                  <div class="wardrobe-tabs" role="group" aria-label="Wardrobe category">
                    <button v-for="tab in [{ id: 'hats', label: 'Hats' }, { id: 'accessories', label: 'Pins' }, { id: 'colors', label: 'Colors' }]" :key="tab.id" class="wardrobe-tab" type="button" :aria-pressed="wardrobeCategory === tab.id" @click="wardrobeCategory = tab.id">{{ tab.label }}</button>
                  </div>
                  <section v-if="wardrobeCategory === 'hats'" class="wardrobe-items" aria-labelledby="wardrobe-hats-title">
                    <h4 id="wardrobe-hats-title">Hat shelf</h4>
                    <div class="hat-options" role="group" aria-label="Try on a hat">
                      <article v-for="hat in wardrobeHats" :key="hat.id" class="hat-card">
                        <button class="hat-option" type="button" :aria-label="'Try on ' + hat.name" :aria-pressed="wardrobeHat?.id === hat.id" :disabled="wardrobeLoading" @click="wardrobeHat = hat"><span aria-hidden="true">{{ hat.renderValue }}</span><small>{{ hat.name }}</small></button>
                        <button v-if="!wardrobeOwnedIds.includes(hat.id) && wardrobeCanAfford(hat)" class="hat-claim" type="button" :disabled="!!wardrobeClaiming" @click="claimWardrobeCosmetic(hat)">{{ wardrobeClaiming === hat.id ? 'Adding…' : `${hat.cost ? 'Buy' : 'Add'} · ${wardrobePrice(hat)}` }}</button>
                        <small v-else-if="!wardrobeOwnedIds.includes(hat.id)" class="wardrobe-shortfall">{{ wardrobeShortfall(hat) }}</small>
                        <small v-else class="hat-owned">{{ wardrobeHat?.id === hat.id ? 'Selected' : 'In wardrobe' }}</small>
                      </article>
                      <article class="hat-card"><button class="hat-option" type="button" :aria-pressed="!wardrobeHat" aria-label="Preview without a hat" @click="wardrobeHat = null"><span aria-hidden="true">◌</span><small>No hat</small></button><small class="hat-owned">Always available</small></article>
                    </div>
                  </section>
                  <section v-else-if="wardrobeCategory === 'accessories'" class="wardrobe-items" aria-labelledby="wardrobe-accessories-title">
                    <h4 id="wardrobe-accessories-title">Pinned keepsakes</h4>
                    <div class="hat-options" role="group" aria-label="Try on an accessory">
                      <article v-for="item in wardrobeAccessories" :key="item.id" class="hat-card">
                        <button class="hat-option" type="button" :aria-label="'Try on ' + item.name" :aria-pressed="wardrobeAccessory?.id === item.id" :disabled="wardrobeLoading" @click="wardrobeAccessory = item"><span aria-hidden="true">{{ item.renderValue }}</span><small>{{ item.name }}</small></button>
                        <button v-if="!wardrobeOwnedIds.includes(item.id) && wardrobeCanAfford(item)" class="hat-claim" type="button" :disabled="!!wardrobeClaiming" @click="claimWardrobeCosmetic(item)">{{ wardrobeClaiming === item.id ? 'Adding…' : `${item.cost ? 'Buy' : 'Add'} · ${wardrobePrice(item)}` }}</button>
                        <small v-else-if="!wardrobeOwnedIds.includes(item.id)" class="wardrobe-shortfall">{{ wardrobeShortfall(item) }}</small>
                        <small v-else class="hat-owned">{{ wardrobeAccessory?.id === item.id ? 'Selected' : 'In wardrobe' }}</small>
                      </article>
                      <article class="hat-card"><button class="hat-option" type="button" :aria-pressed="!wardrobeAccessory" aria-label="Preview without a pin" @click="wardrobeAccessory = null"><span aria-hidden="true">◌</span><small>No pin</small></button><small class="hat-owned">Always available</small></article>
                    </div>
                  </section>
                  <section v-else class="wardrobe-items" aria-labelledby="wardrobe-colors-title">
                    <h4 id="wardrobe-colors-title">Color swatches</h4>
                    <div class="avatar-swatches wardrobe-swatches" role="group" aria-label="Preview avatar color">
                      <button v-for="color in wardrobeColors" :key="color.id" class="avatar-swatch" type="button" :style="{ '--swatch-color': color.renderValue }" :aria-label="color.name" :title="color.name" :aria-pressed="wardrobeColor === color.renderValue" :disabled="colorSaving || wardrobeLoading" @click="wardrobeColor = color.renderValue" />
                    </div>
                    <p class="wardrobe-current">Selected color: <code>{{ wardrobeColor }}</code></p>
                  </section>
                  <button class="btn primary wardrobe-save" type="button" :disabled="colorSaving || wardrobeLoading || !wardrobeDirty || !wardrobeCanSave" @click="saveWardrobeLook">{{ colorSaving ? 'Saving…' : 'Save this look' }}</button>
                </section>
                <aside class="wardrobe-preview" aria-label="Live avatar preview">
                  <div class="castle-window"><span>✦</span><i /><i /></div>
                  <span class="preview-tag">Castle mirror</span>
                  <div class="wardrobe-avatar"><AvatarPreview :color="wardrobeColor" /><span v-if="wardrobeHat" class="wardrobe-hat" aria-hidden="true">{{ wardrobeHat.renderValue }}</span><span v-if="wardrobeAccessory" class="wardrobe-accessory" aria-hidden="true">{{ wardrobeAccessory.renderValue }}</span></div>
                  <b>Your look · preview</b>
                </aside>
              </div>
            </template>
          </div>
        </section>
      </div>

      <div v-if="lensOn" class="lens-transition" aria-hidden="true"><div class="lens" /></div>
    </template>
  </div>
</template>

<style scoped>
.kingdom-screen { position: relative; width: 100%; height: 100%; min-height: 100%; overflow: hidden; background: #2f5e3e; }
.scene-note { position: absolute; inset: 50% auto auto 50%; width: min(90vw, 440px); padding: 30px; transform: translate(-50%, -50%); color: #23382f; background: #fbf2d8; border: 4px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 8px 0 #7a6545; text-align: center; }
.scene-note h1 { margin: 8px 0; color: #254937; font: 700 32px/1.1 Georgia, "Palatino Linotype", serif; }
.scene-note p { margin: 0; }
.note-action { margin-top: 16px; }
.scene-error { color: #812e2d; }
/* storybook buttons: campfire-gold main action, parchment secondary */
.kingdom-screen .btn { min-height: 38px; padding: 7px 14px; color: #23382f; background: #fff8e4; border: 2px solid #23382f; border-radius: 8px 9px 7px 10px; box-shadow: 0 3px 0 #7a6545; font: 800 .9rem Nunito, Trebuchet MS, sans-serif; cursor: pointer; }
.kingdom-screen .btn.primary { color: #23382f; background: #f2ba55; border-color: #23382f; }
.kingdom-screen .btn:hover:not(:disabled), .kingdom-screen .btn:focus-visible { outline: 3px solid #8062a9; outline-offset: 2px; }
.kingdom-screen .btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #7a6545; }
.kingdom-screen .btn:disabled { color: #6b6450; background: #ece3cc; border-style: dashed; box-shadow: none; cursor: not-allowed; opacity: 1; }
.scene-kicker { display: block; color: #778054; font: 800 .66rem ui-monospace, monospace; letter-spacing: .11em; }
.town-hud { position: absolute; z-index: 2; }
.town-title-hud { top: 18px; left: 18px; padding: 11px 14px 12px; color: #fff8e4; background: rgb(35 56 47 / 90%); border: 2px solid #23382f; border-radius: 12px 10px 14px 9px; box-shadow: 0 4px 0 rgb(35 56 47 / 45%); }
.town-title-hud .scene-kicker { color: #f2ba55; }
.town-title { margin: 3px 0 9px; color: #fff8e4; font: 700 22px/1.15 Georgia, "Palatino Linotype", serif; }
.town-title-dot { color: #f2ba55; }
.town-title-actions { display: flex; gap: 6px; }
.hud-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 6px 12px; color: #23382f; background: #fbf2d8; border: 2px solid #23382f; border-radius: 8px; box-shadow: 0 3px 0 #7a6545; font: 800 .84rem Nunito, Trebuchet MS, sans-serif; cursor: pointer; }
.hud-btn svg { width: 17px; height: 17px; fill: #23382f; stroke: #23382f; }
.hud-btn.gold { background: #f2ba55; }
.hud-btn kbd { padding: 0 5px; background: #fff8e4; border: 1.5px solid #23382f; border-radius: 4px; font: 800 .66rem/1.5 ui-monospace, monospace; }
.hud-icon { justify-content: center; min-width: 36px; padding: 6px; }
.hud-btn:hover, .hud-btn:focus-visible { outline: 3px solid #f2ba55; outline-offset: 2px; }
.hud-btn.gold:hover, .hud-btn.gold:focus-visible { outline-color: #fff8e4; }
.hud-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 #7a6545; }
.town-list { position: absolute; z-index: 3; top: 128px; left: 18px; display: grid; gap: 6px; width: min(270px, calc(100vw - 36px)); padding: 9px; background: #fbf2d8; border: 2px solid #23382f; border-radius: 10px; box-shadow: 0 4px 0 #7a6545; }
.town-list-entry { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 10px; padding: 6px 9px; color: #23382f; background: #fff8e4; border: 1.5px solid #c5b58e; border-radius: 7px; text-align: left; cursor: pointer; }
.town-list-entry :deep(.building-icon), .town-list-entry .building-icon { width: 34px; height: 34px; }
.town-list-entry b { display: block; font: 700 1rem Georgia, "Palatino Linotype", serif; }
.town-list-entry small { color: #5f6d58; font: 800 .64rem ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
.town-list-entry em { color: #5f6d58; font: 800 .72rem ui-monospace, monospace; font-style: normal; white-space: nowrap; }
.town-list-entry em.ready { color: #254937; }
.town-list-entry:hover, .town-list-entry:focus-visible { border-color: #23382f; outline: 2px solid #f2ba55; outline-offset: 1px; }
.town-level { top: 18px; right: 18px; padding: 9px 14px; color: #23382f; background: #f2ba55; border: 3px solid #23382f; border-radius: 9px; box-shadow: 0 4px 0 #7a6545; font-weight: 900; pointer-events: none; }
.town-actions { left: 18px; bottom: 16px; display: flex; gap: 8px; }
.town-controls-hud { right: 18px; bottom: 16px; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 14px; max-width: min(560px, 60vw); padding: 9px 14px; color: #fff8e4; background: rgb(35 56 47 / 90%); border-radius: 9px; font: 700 .8rem/1.3 Nunito, Trebuchet MS, sans-serif; pointer-events: none; }
.town-controls-hud kbd { padding: 1px 5px; color: #23382f; background: #f2ba55; border: 1px solid #23382f; border-radius: 4px; font: 800 .68rem ui-monospace, monospace; }
.north-hint { color: #f2ba55; }
.avatar-customize { position: absolute; z-index: 4; left: 18px; bottom: 70px; width: min(360px, calc(100vw - 32px)); max-height: calc(100% - 100px); overflow-y: auto; padding: 22px; color: #23382f; background: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 3px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 6px 0 #7a6545, 0 14px 30px rgb(16 33 23 / 28%); }
.avatar-customize h2 { margin: 4px 38px 0 0; color: #254937; font: 700 22px/1.1 Georgia, "Palatino Linotype", serif; }
.customize-close { top: 10px; right: 10px; }
.avatar-swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 9px; }
.avatar-swatch { width: 38px; height: 38px; justify-self: center; padding: 0; background: var(--swatch-color); border: 2px solid #23382f; border-radius: 50% 45% 48% 42%; box-shadow: 0 2px 0 #7a6545; cursor: pointer; }
.avatar-swatch[aria-pressed="true"] { outline: 3px solid #8062a9; outline-offset: 2px; transform: scale(1.08); }
.avatar-swatch:disabled { opacity: .72; cursor: wait; }
.avatar-swatch:focus-visible { outline: 3px solid #8062a9; outline-offset: 3px; }
.avatar-save-state { min-height: 1.3em; margin: 12px 0 0 !important; color: #52664b; font-size: .82rem; text-align: center; }

.town-intro { position: absolute; z-index: 5; left: 18px; bottom: 70px; width: min(430px, calc(100vw - 32px)); padding: 18px 20px 16px; color: #23382f; background: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 3px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 6px 0 #7a6545, 0 14px 30px rgb(16 33 23 / 30%); }
.town-intro h2 { margin: 4px 0 6px; color: #254937; font: 700 24px/1.15 Georgia, "Palatino Linotype", serif; }
.town-intro p { margin: 0 0 14px; line-height: 1.45; }
.town-intro-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.intro-dots { display: flex; gap: 6px; margin-right: auto; }
.intro-dots i { width: 9px; height: 9px; background: #e2d3ad; border: 1.5px solid #23382f; border-radius: 50%; }
.intro-dots i.on { background: #f2ba55; }

.town-modal-shade { position: fixed; z-index: 1000; inset: 0; display: grid; place-items: center; padding: 20px; background: rgb(22 36 27 / 66%); }
.town-modal { position: relative; display: flex; flex-direction: column; width: min(82vw, 1540px); height: min(82vh, 900px); max-height: calc(100svh - 40px); overflow: hidden; padding: 22px 24px 24px; color: #23382f; background: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 4px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 8px 0 #7a6545, 0 18px 48px rgb(0 0 0 / 30%); }
.panel-head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px 16px; padding-right: 44px; padding-bottom: 14px; border-bottom: 2px dashed #c5b58e; }
.panel-title { flex: 0 1 190px; }
.panel-title h2 { margin: 4px 0 4px; color: #254937; font: 700 30px/1.05 Georgia, "Palatino Linotype", serif; }
.panel-level { display: flex; align-items: center; gap: 8px; margin: 0; color: #4a3d63; font-weight: 900; }
.level-pips { display: inline-flex; gap: 4px; }
.level-pips i { width: 14px; height: 14px; background: #fff8e4; border: 2px solid #23382f; border-radius: 3px 4px 3px 5px; }
.level-pips i.on { background: #f2ba55; }
.panel-upgrade { display: flex; align-items: center; align-self: center; }
.panel-upgrade :deep(.btn) { white-space: nowrap; }
.max-badge { padding: 6px 10px; color: #254937; background: #dcebc8; border: 2px solid #254937; border-radius: 8px; font-weight: 900; }
.town-modal-kicker { color: #5f6d58; font: 800 .68rem ui-monospace, monospace; letter-spacing: .08em; }
.town-modal-close { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; color: #23382f; background: #fff8e4; border: 2px solid #23382f; border-radius: 8px; box-shadow: 0 3px 0 #7a6545; font-size: 24px; line-height: 1; cursor: pointer; }
.town-modal-close:focus-visible, .town-modal-close:hover { outline: 3px solid #f2ba55; outline-offset: 2px; }
.panel-purpose { margin: 14px 0 10px; line-height: 1.45; }
.panel-effect { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; margin: 0 0 10px; }
.panel-effect div { padding: 9px 12px; background: #fff8e4; border: 2px solid #23382f; border-radius: 8px 10px 7px 9px; }
.panel-effect dt { color: #5f6d58; font: 800 .64rem ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
.panel-effect dd { margin: 2px 0 0; font-weight: 800; }
.compact-effect { flex: 1 1 330px; grid-template-columns: repeat(2,minmax(0,1fr)); margin: 0; }
.panel-note { margin: 0 0 8px; color: #5f4a2e; font-size: .88rem; }
.panel-content { flex: 1; min-height: 0; overflow: auto; margin-top: 14px; }
.panel-content h3 { margin: 2px 0 4px; font: 700 19px/1.2 Georgia, "Palatino Linotype", serif; }
.panel-content p { margin: 0 0 10px; line-height: 1.45; }
.preview-tag { display: inline-block; padding: 2px 8px; color: #4a3d63; background: #ece3f8; border: 1.5px dashed #8062a9; border-radius: 999px; font: 800 .64rem ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; }
.sky-card { position: relative; flex: 1; min-height: 0; overflow: hidden; padding: 0; color: #fff8e4; background: #101d42; border: 3px solid #23382f; border-radius: 12px 10px 14px 9px; }
.theme-garden .panel-content, .theme-library .panel-content { display: flex; }
.garden-sky { position: absolute; inset: 0; overflow: hidden; background: linear-gradient(180deg,#1b3154 0%,#2c4d7c 68%,#4d6e9e 100%); }
.garden-star-sky { position: absolute; z-index: 0; inset: 0; }
.garden-star-sky :deep(.summon-sky) { position: absolute; inset: 0; }
.sky-constellations { position: absolute; z-index: 1; inset: 0 0 20%; width: 100%; height: 80%; overflow: visible; pointer-events: none; }
.constellation path { fill: none; stroke: #d5c8ef; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; opacity: .84; }
.constellation circle { fill: #f2ba55; stroke: #fff1b8; stroke-width: 1; filter: drop-shadow(0 0 4px #f2ba55); }
.garden-horizon { position: absolute; z-index: 2; right: -2%; bottom: -10%; left: -2%; height: 28%; background: radial-gradient(ellipse at 16% 100%,#88a772 0 37%,transparent 38%),radial-gradient(ellipse at 48% 112%,#708d5b 0 43%,transparent 44%),radial-gradient(ellipse at 85% 110%,#829e68 0 37%,transparent 38%),linear-gradient(#667f58,#5a764d); }
.telescope-art { position: absolute; z-index: 3; bottom: 5%; left: 5%; width: clamp(140px,18vw,275px); height: auto; filter: drop-shadow(0 5px 2px #111a28aa); }
.garden-caption { position: absolute; z-index: 4; right: 2%; bottom: 3%; width: min(46%,620px); padding: clamp(12px,1.4vw,24px); color: #fff8e4; background: rgb(48 37 89 / 92%); border: 2px solid #23382f; box-shadow: 0 4px 0 #7a6545; }
.garden-caption .scene-kicker { color: #f2ba55; }
.garden-caption h3 { margin: 5px 0; color: #fff1b8; }
.garden-caption p { margin-bottom: 9px; color: #ece6ff; }
.theme-tower .panel-content, .theme-workshop .panel-content, .theme-castle .panel-content { display: flex; }
.tower-feature { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(0, 3fr) minmax(250px, 1fr); gap: 14px; padding: 14px; overflow: hidden; background: repeating-linear-gradient(7deg,#835b38 0 16px,#8e6741 17px 34px,#7b5332 35px 38px); border: 3px solid #503c2a; border-radius: 7px; box-shadow: inset 0 0 0 4px #aa8153, 0 4px 0 #503c2a; }
.tower-board { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; padding: 16px; background: repeating-linear-gradient(0deg,#a47548 0 30px,#986d43 31px 33px); border: 8px solid #66462e; border-radius: 5px; box-shadow: inset 0 0 0 2px #c29965; }
.tower-board-heading { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 2px dashed #edd4a8; }
.tower-board-heading h3 { color: #fff3d0; font-size: 24px; text-shadow: 1px 2px #4b3425; }
.tower-board-heading p { margin: 4px 0 0; color: #fff3d0; font-size: .84rem; }
.radio-face { position: relative; display: grid; flex: 0 0 64px; height: 56px; place-items: center; color: #314236; background: #d6b779; border: 3px solid #49382b; border-radius: 8px; box-shadow: 0 3px #49382b; }
.radio-face span { font-size: 25px; }.radio-face i { position: absolute; right: 7px; top: 9px; width: 6px; height: 6px; background: #b34d3a; border-radius: 50%; }.radio-face b { position: absolute; right: 6px; bottom: 4px; font: 800 9px ui-monospace,monospace; }
.tower-filter-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 0; color: #fff3d0; }
.tower-filter-row label { display: flex; align-items: center; gap: 6px; font-weight: 800; }.tower-filter-row select { min-height: 34px; padding: 4px 7px; color: #23382f; background: #fff8e4; border: 2px solid #503c2a; border-radius: 5px; font: inherit; }
.pinned-notes { display: grid; flex: 1; min-height: 0; grid-template-columns: repeat(auto-fit,minmax(min(100%,260px),1fr)); align-content: start; gap: 12px; overflow: auto; padding: 7px 7px 14px; }
.empty-board-note { grid-column: 1/-1; align-self: center; max-width: 440px; margin: auto; padding: 24px; color: #493829; background: #fff4d5; border: 2px dashed #795738; box-shadow: 3px 4px #513b29; text-align: center; transform: rotate(-1deg); }
.tower-offer-desk { align-self: stretch; padding: 18px 15px; overflow: auto; background: repeating-linear-gradient(0deg,#fff8e4 0 29px,#e9d9b5 30px 31px); border: 2px solid #513b29; box-shadow: 3px 4px #513b29; }
.tower-offer-desk h3 { margin-top: 8px; font-size: 23px; }.tower-offer-desk > p { font-size: .88rem; }
.offer-paper { background: rgb(255 248 228 / 80%); }
.trade-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.trade-columns fieldset { display: grid; gap: 7px; margin: 0; padding: 10px; border: 1.5px solid #c5b58e; border-radius: 7px; }
.trade-columns legend { padding: 0 5px; font-weight: 900; }
.trade-columns label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 700; }
.trade-columns input { width: 70px; min-height: 34px; padding: 4px 7px; color: #23382f; background: white; border: 1.5px solid #7a6545; border-radius: 5px; font: inherit; }
.trade-entry { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 8px; min-height: 132px; padding: 19px 12px 12px; color: #3c3229; background: #fff6dc; border: 1px solid #76573a; box-shadow: 3px 4px 0 #493827; transform: rotate(-.7deg); }
.trade-entry:nth-child(even) { background: #f8edcf; transform: rotate(.65deg); }.trade-entry.own { background: #e9edcf; }
.note-pin { position: absolute; top: 5px; left: 50%; width: 12px; height: 12px; background: #b95643; border: 2px solid #4d3827; border-radius: 50%; box-shadow: 1px 2px #493827; transform: translateX(-50%); }
.note-author { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 5px; font: 800 .78rem ui-monospace,monospace; text-transform: uppercase; }
.note-exchange { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 6px; }.note-exchange span { display: grid; gap: 3px; overflow-wrap: anywhere; font-weight: 800; font-size: .83rem; }.note-exchange small { color: #726047; font: 800 .58rem ui-monospace,monospace; letter-spacing: .08em; }.note-exchange > b { color: #8062a9; font-size: 1.2rem; }
.note-action { align-self: start; margin-top: auto; }
.offer-rules { padding: 8px; color: #594630; background: rgb(243 228 196 / 75%); border-left: 3px solid #a47b49; font-size: .8rem; }
.trade-state { color: #5f6d58; font-size: .88rem; }
.trade-error { padding: 8px 10px; color: #812e2d; background: #f8e3e1; border-radius: 6px; }
.text-button { color: #254937; background: transparent; border: 0; font: inherit; font-weight: 900; text-decoration: underline; cursor: pointer; }
.trade-confirm { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin-top: 10px; padding: 12px; background: #f2ba55; border: 2px solid #23382f; border-radius: 8px; box-shadow: 0 4px 14px #23382f44; }
.trade-confirm p { flex: 1 1 100%; margin: 0; font-weight: 800; }
.trade-preview-values { display:grid; flex:1 1 100%; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:0; }
.trade-preview-values > div { padding:8px; background:#fff8e4; border:1px solid #9b8157; }
.trade-preview-values dt { color:#5f6d58; font:800 .62rem ui-monospace,monospace; text-transform:uppercase; }
.trade-preview-values dd { margin:3px 0 0; font-weight:800; }
.trade-pagination { display:flex; grid-column:1/-1; align-items:center; justify-content:space-between; gap:8px; padding:8px; color:#493827; background:#f1e2bd; border:1px dashed #76573a; font-size:.76rem; font-weight:800; }
.trade-create-confirm { margin:12px 0; padding:12px; color:#23382f; background:#fff8e4; border:2px solid #76573a; box-shadow:3px 3px #493827; }
.trade-create-confirm h4 { margin:0 0 8px; color:#315b45; font:800 .82rem ui-monospace,monospace; text-transform:uppercase; }
.trade-create-confirm p { max-width:none; margin:0 0 8px; font-size:.82rem; }

.library-feature { position: relative; display: flex; flex: 1; min-width: 0; min-height: 0; padding: 12px; overflow: hidden; background: linear-gradient(145deg,#ead9b2,#d8c49b); border: 3px solid #57412f; border-radius: 7px; box-shadow: inset 0 0 0 4px #a98256; }
.library-shelves { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; padding: 12px; background: linear-gradient(120deg,#6e5138,#8c6744 48%,#624833); border: 7px solid #503b2b; box-shadow: inset 0 0 0 2px #c19b67; }
.shelf-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 18px; margin-bottom: 10px; }
.shelf-heading h3 { margin: 4px 0 0; }
.library-magic-note { color: #4a3d63; font-size: .85rem; font-weight: 800; }
.bookcase { display: grid; flex: 1; min-height: 0; grid-template-rows: repeat(3,minmax(96px,1fr)); gap: 7px; }
.shelf-row { display: flex; min-width: 0; min-height: 0; align-items: flex-end; padding: 0 6px; border-bottom: 9px solid #553a27; box-shadow: 0 3px 0 #bd925b; }
.shelf { display: flex; width: 100%; height: 100%; min-width: 0; align-items: flex-end; gap: 3px; padding: 4px 4px 0; overflow: hidden; }
.spine { display: grid; flex: 1 1 30px; min-width: 0; max-width: 42px; place-items: center; height: 82px; overflow: hidden; padding: 3px 0; color: #fff8e4; background: #f2ba55; border: 2px solid #493827; border-bottom: 0; border-radius: 3px 3px 0 0; box-shadow: inset 3px 0 rgb(255 255 255 / 18%), inset -3px 0 rgb(0 0 0 / 15%); font: 800 .59rem/1 Nunito,sans-serif; text-overflow: ellipsis; white-space: nowrap; writing-mode: vertical-rl; transform: rotate(180deg); }
.hero-spine { flex-basis: 38px; max-width: 48px; cursor: pointer; }
.decorative-spine { flex: 1 1 25px; max-width: 34px; background: var(--book-color); }
.spine.selected { outline: 3px solid #fff8e4; outline-offset: 1px; }
.hero-spine:nth-child(3n+2) { background: #6db8cf; }.hero-spine:nth-child(3n) { background: #d86f6b; }
.hero-spine.selected { outline: 3px solid #fff8e4; outline-offset: 1px; }
.storybook-overlay { position: absolute; z-index: 8; inset: 0; display: grid; place-items: center; padding: clamp(10px,2vw,28px); overflow: auto; background: rgb(20 28 38 / 76%); backdrop-filter: blur(3px); }
.storybook-spread { display: grid; width: min(1120px,100%); max-height: 100%; grid-template-columns: minmax(0,1fr) minmax(0,.82fr); overflow: auto; background: #af9467; border: 4px solid #57412f; border-radius: 8px; box-shadow: 0 8px 0 #7a6545,0 16px 40px rgb(0 0 0 / 45%); }
.storybook-page { padding: clamp(16px, 2vw, 30px); background: #fff8e4; border: 2px solid #c5b58e; border-radius: 8px 12px 8px 12px; box-shadow: inset 5px 0 #ead9b2; }
.story-left { border-radius: 6px 2px 2px 6px; }
.story-right { display: flex; flex-direction: column; border-left: 2px solid #c5b58e; border-radius: 2px 6px 6px 2px; }
.book-back { display: block; margin: 0 0 14px; padding: 4px 0; color: #254937; background: none; border: 0; font: 800 .85rem Nunito, sans-serif; text-decoration: underline; cursor: pointer; }
.hero-personality { color: #4a3d63; font: italic 800 1.02rem Georgia,serif; }
.storybook-page h3 { margin-top: 10px; font-size: 24px; }
.storybook-page .story-copy { line-height: 1.6; }
.field-note { margin: 12px 0; padding: 8px 10px; background: #f3e4c4; border-left: 3px solid #8062a9; font-size: .88rem; }
.portrait-stage { position: relative; display: grid; flex: 1; min-height: 230px; place-items: center; overflow: hidden; background: radial-gradient(ellipse at 50% 84%,#a9bc86 0 4%,transparent 5%), linear-gradient(#b7d4df 0 58%,#e5eef6 59%); border: 2px solid #c5b58e; border-radius: 8px; }
.portrait-halo { position: absolute; width: 190px; height: 190px; background: #f2ba5577; border: 2px dashed #9a7546; border-radius: 50%; }
.hero-abilities { display: grid; gap: 6px; margin: 10px 0 0; }
.hero-abilities div { display: grid; grid-template-columns: 105px 1fr; gap: 8px; padding: 5px 8px; background: #f3e4c4; border-radius: 5px; }
.hero-abilities dt { color: #5f6d58; font-size: .76rem; font-weight: 900; }
.hero-abilities dd { margin: 0; font-weight: 800; }
.hero-book-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 12px 0 0; }
.hero-book-stats div { padding: 7px; background: #e8f0de; border-radius: 5px; }
.hero-book-stats dt { color: #5f6d58; font: 800 .62rem ui-monospace, monospace; text-transform: uppercase; }
.hero-book-stats dd { margin: 2px 0 0; font-weight: 900; }
.workshop-feature { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(220px,.72fr) minmax(0,1.28fr); gap: 12px; padding: 12px; overflow: hidden; background: linear-gradient(135deg,#e8f0de,#fbf2d8 54%,#dce7d1); border: 3px solid #23382f; box-shadow: inset 0 0 0 4px #f3e7c8; }
.workshop-roster { position: relative; display: flex; flex-direction: column; align-content: start; gap: 7px; min-height: 0; overflow: auto; padding: 28px 10px 10px; background: #d8e3cf; border: 2px solid #687553; }
.workshop-roster::before { position: absolute; top: 6px; left: 50%; color: #53654f; content: 'MEMBERS · SIGN IN'; font: 800 .68rem ui-monospace,monospace; letter-spacing: .08em; transform: translateX(-50%); }
.workshop-hero { position: relative; display: grid; flex: 0 0 auto; grid-template-columns: 32px 1fr auto; align-items: center; gap: 3px 8px; min-height: 55px; padding: 8px 12px; color: #23382f; background: repeating-linear-gradient(0deg,#fff9e7 0 24px,#eee8d3 25px 26px); border: 1px solid #9d8962; border-left: 5px solid #c8d4ba; box-shadow: 1px 2px #687553; text-align: left; cursor: pointer; }
.workshop-hero::before { position: absolute; top: -5px; left: 15px; width: 25px; height: 8px; border: 2px solid #77766d; border-bottom: 0; border-radius: 12px 12px 0 0; content: ''; }
.workshop-hero > span { grid-row: span 2; font-size: 24px; }
.workshop-hero b { font: 800 .86rem Nunito,sans-serif; }
.workshop-hero small { color: #5f6d58; font: 800 .6rem ui-monospace, monospace; text-transform: uppercase; }
.workshop-hero.selected { border-color: #254937; box-shadow: inset 0 0 0 2px #f2ba55, 2px 3px #687553; transform: translateX(3px); }
.workshop-detail { position: relative; display: flex; flex-direction: column; min-height: 0; overflow: auto; padding: 18px; background: repeating-linear-gradient(0deg,#fff9e7 0 30px,#eee8d3 31px 32px); border: 2px solid #9d8962; box-shadow: 2px 3px #687553; }
.workshop-detail::before { position: absolute; top: 6px; left: 50%; width: 34px; height: 12px; border: 2px solid #77766d; border-bottom: 0; border-radius: 16px 16px 0 0; content: ''; transform: translateX(-50%); }
.workshop-preview-stage { position: relative; display: grid; flex: 1 1 175px; min-height: 150px; max-height: 220px; place-items: center; overflow: hidden; margin: 0 0 12px; background: linear-gradient(#b7d4df 0 56%,#d2ba8b 57% 67%,#b88559 68%); border: 2px solid #6b5847; }
.workshop-preview-stage::before { position: absolute; right: 7%; bottom: 13%; left: 7%; height: 9px; background: #6c4d38; border-radius: 50%; content: ''; }
.practice-target { position: absolute; right: 15%; bottom: 18%; width: 60px; height: 70px; background: repeating-radial-gradient(circle,#f8e3e1 0 7px,#d86f6b 8px 13px); border: 3px solid #57412f; border-radius: 50%; box-shadow: 2px 3px 0 #57412f; }
.practice-target::after { position: absolute; top: 100%; left: 50%; width: 5px; height: 28px; background: #57412f; content: ''; }
.workshop-detail h3 { margin-top: 9px; font-size: 24px; }
.trial-note { margin: auto 0 0 !important; padding-top: 9px; border-top: 1px dashed #9d8962; color: #5f4a2e; font-size: .88rem; }
.trial-cooldowns { display: flex; flex-wrap: wrap; gap: 7px; margin: 8px 0; }
.trial-cooldowns div { display: flex; gap: 5px; padding: 4px 8px; background: #f3e4c4; border-radius: 99px; }
.trial-cooldowns dt { color: #5f6d58; font-size: .7rem; font-weight: 900; }
.trial-cooldowns dd { margin: 0; font-size: .75rem; font-weight: 900; }
.trial-talent { margin: 8px 0 0 !important; font-size: .86rem; }
.gym-roster { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; padding: 0; list-style: none; }
.gym-roster li { padding: 5px 11px; background: #fff8e4; border: 2px solid #23382f; border-radius: 999px 999px 999px 6px; font-weight: 800; }
.gym-roster li.empty { border-style: dashed; color: #5f4a2e; }
.castle-levels { display: grid; gap: 8px; margin: 0 0 14px; padding-left: 22px; line-height: 1.4; }
.castle-levels li.done { color: #254937; font-weight: 800; }
.castle-info-chip { align-self: center; min-height: 40px; padding: 7px 12px; color: #254937; background: #dcebc8; border: 2px solid #254937; border-radius: 9px; box-shadow: 0 3px #7a8d67; font: 900 .84rem Nunito,sans-serif; cursor: pointer; }
.castle-info-chip span { display: inline-grid; width: 19px; height: 19px; place-items: center; margin-right: 5px; color: #fff8e4; background: #8062a9; border-radius: 50%; }
.castle-info-chip:focus-visible,.castle-info-chip:hover { outline: 3px solid #f2ba55; outline-offset: 2px; }
.castle-info-card { position: absolute; z-index: 5; top: 88px; right: 62px; width: min(420px,calc(100% - 40px)); padding: 16px; background: #fff8e4 url('/hero-lab/assets/storybook-paper.svg') repeat; background-size: 144px; border: 3px solid #23382f; box-shadow: 0 5px #7a6545; }
.castle-info-card h3 { font: 700 20px Georgia,serif; }
.wardrobe-feature { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(0,3fr) minmax(220px,1fr); gap: 12px; padding: 12px; overflow: hidden; background: linear-gradient(145deg,#ead9b2,#d7c49a); border: 3px solid #57412f; box-shadow: inset 0 0 0 4px #a98256; }
.wardrobe-catalog { overflow: auto; padding: clamp(16px,2vw,30px); background: #fff8e4; border: 2px solid #9b8157; box-shadow: inset 0 0 0 4px #f1e6c7; }
.wardrobe-catalog h3 { margin-top: 10px; font-size: 25px; }
.wardrobe-catalog p { max-width: 640px; }
.wardrobe-swatches { justify-content: flex-start; max-width: 480px; margin: 20px 0; }
.wardrobe-current { color: #5f6d58; font-size: .85rem; }
.wardrobe-preview { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: end; gap: 8px; overflow: hidden; padding: 14px; background: linear-gradient(#b7d4df 0 35%,#e7ddb9 36% 100%); border: 2px solid #6b5847; border-radius: 8px; }
.wardrobe-preview :deep(.avatar-preview) { position: relative; z-index: 1; width: 144px; height: 144px; }
.wardrobe-hat { position: absolute; z-index: 2; bottom: 128px; left: 50%; font-size: 48px; filter: drop-shadow(1px 2px #493827); transform: translateX(-50%) rotate(-5deg); }
.wardrobe-tabs { display:flex; flex-wrap:wrap; gap:7px; margin:14px 0 12px; padding-bottom:9px; border-bottom:2px dashed #c5b58e; }
.wardrobe-tab { min-height:34px; padding:5px 13px; color:#493827; background:#f3e4c4; border:1.5px solid #9b8157; border-radius:5px 8px 5px 7px; font:800 .78rem Nunito,sans-serif; cursor:pointer; }
.wardrobe-tab[aria-pressed="true"] { color:#fff8e4; background:#315b45; border-color:#23382f; box-shadow:0 2px #23382f; }
.wardrobe-tab:focus-visible { outline:3px solid #8062a9; outline-offset:2px; }
.wardrobe-items { min-height:154px; margin:8px 0 12px; }
.wardrobe-items h4 { margin:0 0 9px; color:#57412f; font:800 .78rem ui-monospace,monospace; letter-spacing:.06em; text-transform:uppercase; }
.wardrobe-save { margin-top:4px; }
.wardrobe-accessory { position:absolute; z-index:3; right:calc(50% - 68px); bottom:92px; display:grid; width:30px; height:30px; place-items:center; background:#fff8e4; border:2px solid #493827; border-radius:50%; box-shadow:0 2px #7a6545; font-size:17px; }
.wardrobe-title-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }.wardrobe-stamp { display:grid; width:56px; height:56px; place-items:center; color:#8062a9; border:2px double #8062a9; border-radius:50%; font:800 .53rem/1.1 ui-monospace,monospace; text-align:center; transform:rotate(9deg); }
.wardrobe-selection-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(200px,.8fr); gap:20px; margin:18px 0; }
.wardrobe-selection-grid h4 { margin:0 0 9px; color:#57412f; font:800 .78rem ui-monospace,monospace; letter-spacing:.06em; text-transform:uppercase; }
.hat-options { display:grid; grid-template-columns:repeat(auto-fit,minmax(92px,1fr)); align-items:stretch; gap:8px; }
.hat-card { display:grid; min-width:0; grid-template-rows:1fr auto; gap:4px; }
.hat-option { display:grid; width:100%; min-width:0; min-height:78px; place-items:center; gap:3px; padding:7px 4px; color:#493827; background:#f3e4c4; border:1px solid #9b8157; box-shadow:0 2px #9b8157; cursor:pointer; }
.hat-option > span { font-size:25px; }.hat-option small { max-width:100%; font-size:.62rem; font-weight:800; text-align:center; }.hat-option[aria-pressed="true"] { background:#dcebc8; outline:2px solid #254937; }
.hat-claim { min-height:29px; padding:3px; color:#254937; background:#e8f0de; border:1px solid #687553; border-radius:4px; font:800 .62rem Nunito,sans-serif; cursor:pointer; }
.hat-claim:disabled,.hat-option:disabled { cursor:wait; opacity:.65; }.hat-owned { min-height:29px; display:grid; place-items:center; color:#53654f; font:800 .6rem ui-monospace,monospace; text-align:center; }
.wardrobe-status { color:#53654f; font-size:.82rem; }.wardrobe-error { padding:8px 10px; color:#812e2d; background:#f8e3e1; border-left:3px solid #812e2d; font-size:.85rem; }
.wardrobe-purse { width:fit-content; padding:5px 9px; color:#254937; background:#e8f0de; border:1px solid #687553; font-size:.8rem; font-weight:900; }
.wardrobe-shortfall { display:grid; min-height:29px; align-content:center; color:#812e2d; font:800 .58rem/1.2 Nunito,sans-serif; text-align:center; }
.wardrobe-swatches { grid-template-columns:repeat(6,minmax(30px,38px)); gap:10px; margin:10px 0; }
.castle-window { position: absolute; top: 16px; left: 50%; width: 96px; height: 130px; overflow: hidden; transform: translateX(-50%); background: linear-gradient(#5796b7 0 65%,#7b9d68 66%); border: 8px solid #ead9b2; border-bottom-width: 12px; border-radius: 48px 48px 4px 4px; box-shadow: 0 0 0 3px #57412f; }
.castle-window > span { display: block; padding: 12px; color: #fff1b8; text-align: center; }
.castle-window i { position: absolute; right: -14px; bottom: -12px; width: 60px; height: 40px; background: #557b4b; border-radius: 50%; }
.castle-window i:last-child { right: auto; left: -16px; bottom: -16px; background: #71955d; }
.wardrobe-preview b { position: relative; z-index: 1; }
.theme-garden .panel-head { border-bottom-color: #8062a9; }
.theme-tower .panel-level { color: #4a3d63; }

.lens-transition { position: fixed; z-index: 2000; inset: 0; overflow: hidden; pointer-events: auto; background: transparent; animation: lens-scene-dim .6s ease both; }
.lens-transition .lens { position: absolute; left: 50%; top: 50%; width: 160vmax; height: 160vmax; border: 12px solid #c8963e; border-radius: 50%; box-shadow: 0 0 0 4px #23382f, inset 0 0 0 5px #f2ba55, 0 0 0 200vmax #101d42; transform: translate(-50%,-50%) scale(1); animation: lens-close .6s cubic-bezier(.65,0,.4,1) forwards; }
@keyframes lens-scene-dim { 0% { background:transparent; } 42%,100% { background:#101d42; } }
@keyframes lens-close { 0% { transform:translate(-50%,-50%) scale(1); } 60% { transform:translate(-50%,-50%) scale(.02); } 82%,100% { transform:translate(-50%,-50%) scale(0); } }
@media (prefers-reduced-motion: reduce) { .lens-transition { animation:none; background:#101d42; }.lens-transition .lens { animation:none; transform:translate(-50%,-50%) scale(0); } }

@media (max-width: 760px) {
  .town-controls-hud { display: none; }
  .tower-feature { grid-template-columns: minmax(0,2fr) minmax(230px,1fr); gap: 9px; padding: 9px; }
  .tower-board { padding: 11px; border-width: 6px; }
  .tower-offer-desk { padding: 12px 10px; }
  .workshop-feature { grid-template-columns: minmax(180px,.72fr) minmax(0,1.28fr); }
}
@media (max-width: 600px) {
  .town-title-hud { top: 10px; left: 10px; right: auto; padding: 8px 10px; }
  .town-title { font-size: 17px; margin-bottom: 7px; }
  .town-title span:last-child { display: block; font-size: 14px; }
  .town-title-dot { display: none; }
  .town-list { top: 118px; left: 10px; }
  .town-level { top: 10px; right: 10px; padding: 6px 9px; font-size: .78rem; }
  .town-actions { left: 10px; right: 10px; bottom: 10px; flex-wrap: wrap; }
  .avatar-customize { bottom: 62px; left: 10px; padding: 18px; }
  .town-intro { bottom: 62px; padding: 14px 16px; }
  .town-intro h2 { font-size: 20px; }
  .town-modal { width: calc(100vw - 16px); height: calc(100svh - 16px); max-height: none; padding: 16px 12px; }
  .panel-title h2 { font-size: 24px; }
  .theme-tower .panel-content, .theme-workshop .panel-content, .theme-castle .panel-content, .theme-library .panel-content { overflow: auto; }
  .tower-feature { flex: 0 0 auto; grid-template-columns: 1fr; overflow: visible; }
  .tower-board { min-height: 420px; }
  .pinned-notes { grid-template-columns: 1fr; }
  .tower-offer-desk { min-height: 310px; }
  .trade-columns { grid-template-columns: 1fr; }
  .library-feature { flex: 1 0 520px; min-height: 520px; overflow: hidden; }
  .library-shelves { min-height: 0; }
  .shelf { gap: 2px; }
  .spine { flex-basis: 0; min-width: 10px; font-size: .49rem; }
  .storybook-spread { grid-template-columns: 1fr; }
  .storybook-overlay { padding: 7px; }
  .storybook-page { min-height: 300px; }
  .story-right { border-top: 2px solid #c5b58e; border-left: 0; }
  .wardrobe-feature { flex: 0 0 auto; grid-template-columns: 1fr; overflow: visible; }
  .wardrobe-preview { min-height: 250px; }
  .wardrobe-selection-grid { grid-template-columns: 1fr; }
  .castle-info-card { top: 105px; right: 12px; }
  .theme-garden .garden-caption { right: 8px; bottom: 8px; left: 34%; width: auto; padding: 12px; }
  .theme-garden .garden-caption p { max-width: 56ch; }
  .theme-garden .telescope-art { bottom: 3%; left: 1%; width: 125px; }
  .workshop-feature { flex: 0 0 auto; grid-template-columns: 1fr; overflow: visible; }
  .workshop-roster { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); max-height: 240px; }
  .workshop-detail { min-height: 520px; }
  .workshop-preview-stage { flex: 0 0 155px; }
  .hero-book-stats { grid-template-columns: repeat(2, 1fr); }
}
</style>
