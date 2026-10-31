<script setup>
// ============================================================
// STUDENT: walkable kingdom town
// HUD, building panels, the first-visit tour and the telescope
// hand-off to Hero Summon. The map itself lives in KingdomTown.
// ============================================================
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { S, api, retryablePost } from '../api.js';
import { fmtBundle, toast } from '../ui.js';
import { soundState, toggleMuted, playCue } from '../sound.js';
import { wipe, wipeTo } from '../transitions.js';
import AsyncButton from '../components/AsyncButton.vue';
import { loadHome } from './home.js';
import KingdomTown from './KingdomTown.vue';
import AvatarPreview from './AvatarPreview.vue';
import BuildingIcon from './BuildingIcon.vue';
import HeroIcon from './HeroIcon.vue';
import SummonSky from './SummonSky.vue';
import LibraryProp from './kingdom/LibraryProp.vue';
import CosmeticIcon from './CosmeticIcon.vue';
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
  clearTimeout(radioTimer);
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
const heroStars = (hero) => GAME_CONFIG.arenaTuning.gachaReveal.rarityStars[hero?.rarity] || 0;
const selectedHeroLore = computed(() => selectedArchiveHero.value && HERO_LORE[selectedArchiveHero.value.id]);
const archiveOpen = ref(false);
const bookBackButton = ref(null);
let archiveReturnFocus = null;
// Three shelves of three bays each. Spines stay inside a narrow size range so
// the case reads as furniture; each bay keeps a purposeful gap for a curio.
const BOOK_COLORS = ['#c77b50', '#6b88a4', '#7b8f64', '#bba36d', '#876f91', '#bd695c', '#477d78'];
const HERO_BOOK_COLORS = ['#8062a9', '#c4574f', '#2f6f73', '#b7792f', '#4f6fa0', '#5f7f36'];
const SPINE_HEIGHTS = [80, 86, 82, 88, 84, 80, 86];
const SPINE_WIDTHS = [22, 26, 24, 26];
const BAY_PROPS = ['fireflies', 'candle', 'skull', 'portrait', 'wands', 'tarot', 'potions', 'fireflies', 'stones'];
const libraryShelves = computed(() => {
  const bays = BAY_PROPS.map((prop, id) => ({ id, prop, heroes: [] }));
  archiveHeroes.value.forEach((hero, index) => bays[(index * 4) % bays.length].heroes.push({ hero, color: HERO_BOOK_COLORS[index % HERO_BOOK_COLORS.length] }));
  const laidOut = bays.map((bay) => {
    const books = Array.from({ length: Math.max(4, 8 - bay.heroes.length * 2) }, (_, i) => {
      const n = bay.id * 5 + i;
      return { kind: 'book', key: `b${bay.id}-${i}`, color: BOOK_COLORS[n % 7], height: SPINE_HEIGHTS[n % 7], width: SPINE_WIDTHS[n % 4], tilt: n % 9 === 4, extra: i >= 3 };
    });
    // hero volumes sit among the ordinary books, never at the very edge
    bay.heroes.forEach((entry, i) => books.splice(Math.min(books.length, 1 + i * 3), 0, { kind: 'hero', key: entry.hero.id, ...entry }));
    const extras = [{ kind: 'prop', key: `p${bay.id}`, prop: bay.prop }];
    if (bay.id % 3 === 1) extras.unshift({ kind: 'stack', key: `s${bay.id}`, colors: [BOOK_COLORS[bay.id % 7], BOOK_COLORS[(bay.id + 3) % 7], BOOK_COLORS[(bay.id + 5) % 7]] });
    return { id: bay.id, items: bay.id % 2 ? [...extras, ...books] : [...books, ...extras] };
  });
  return [laidOut.slice(0, 3), laidOut.slice(3, 6), laidOut.slice(6, 9)];
});
const workshopHeroes = computed(() => homeData.value?.catalog?.heroes || []);
const previewWorkshopHero = ref(null);
const workshopHero = computed(() => previewWorkshopHero.value || workshopHeroes.value[0] || null);
const workshopConfig = computed(() => workshopHero.value && GAME_CONFIG.heroes[workshopHero.value.id]);
const ownedHeroIds = computed(() => new Set(homeData.value?.inventory?.heroes || []));
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


// ---- first-visit tour -----------------------------------------------------
// Remembered per student in this browser. There is no server-side flag for
// it, so a different browser or cleared storage shows the tour once more.
const INTRO_STEPS = [
  { highlight: 'castle', title: 'Welcome home!', body: 'This is your kingdom. The castle in the middle is your home, and it grows as your town does.' },
  { highlight: 'buildings', title: 'Four buildings', body: 'Garden to the north, Tower to the south, Library to the west and Workshop to the east. Upgrade them with the wood, crystal and herbs you earn to power up your heroes.' },
  { highlight: 'north', title: 'Adventure lies north', body: 'Walk up through the gap in the trees by the BATTLES sign, north-west of the castle. Out there you can start a Duel quiz battle or join a Campfire Run with friends.' },
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
  if (id === 'duel') { wipeTo('practice'); return; }
  if (id === 'campfire') { wipeTo('world'); return; }
  customizeOpen.value = false;
  listOpen.value = false;
  // moving from one building window to another turns the page with a wipe
  if (townTarget.value && townTarget.value !== id) { wipe(() => openBuilding(id)); return; }
  openBuilding(id);
}
function openBuilding(id) {
  tradeConfirm.value = null;
  castleInfoOpen.value = false;
  townTarget.value = id;
  if (id === 'library') archiveOpen.value = false;
  if (id === 'tower') { radioState.value = 'idle'; loadTradeBoard().then(() => { if (!tradeError.value) radioTunedAt.value = Date.now(); }); }
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

// Radio refresh: keeps the current notes pinned while tuning, holds the tuning
// animation briefly so a fresh response is noticeable, then reports it.
const radioState = ref('idle');
const radioTunedAt = ref(null);
const radioBusy = computed(() => tradeLoading.value || radioState.value === 'tuning');
let radioTimer;
const radioStatusText = computed(() => {
  if (radioBusy.value) return 'Tuning the class radio…';
  if (radioState.value === 'static') return 'No signal yet. Try tuning again.';
  if (!radioTunedAt.value) return 'Tune in to check for new notes.';
  const count = filteredTowerTrades.value.length;
  const time = new Date(radioTunedAt.value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${radioState.value === 'fresh' ? 'Fresh response' : 'Last tuned'} at ${time} · ${count} open ${count === 1 ? 'note' : 'notes'}`;
});
async function tuneRadio() {
  if (radioBusy.value) return;
  clearTimeout(radioTimer);
  radioState.value = 'tuning';
  playCue('radioTune');
  const started = performance.now();
  await loadTradeBoard({ keep: true });
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const hold = reduced ? 0 : 650 - (performance.now() - started);
  if (hold > 0) await new Promise((resolve) => { radioTimer = setTimeout(resolve, hold); });
  if (!alive) return;
  radioState.value = tradeError.value ? 'static' : 'fresh';
  if (!tradeError.value) { radioTunedAt.value = Date.now(); playCue('radioResponse'); }
  radioTimer = setTimeout(() => { if (radioState.value === 'fresh') radioState.value = 'idle'; }, 2600);
}

async function loadTradeBoard({ keep = false } = {}) {
  if (!keep) tradeBoard.value = null;
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
    await loadTradeBoard({ keep: true });
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
    await loadTradeBoard({ keep: true });
    k.value = await api('GET', '/api/student/kingdom');
  } catch (err) { await loadTradeBoard({ keep: true }); tradeError.value = err.message; }
  finally { tradePending.value = false; }
}
async function cancelTrade(trade) {
  if (tradePending.value) return;
  tradePending.value = true;
  tradeError.value = '';
  try {
    await tradeMutationPost('cancel', trade.id);
    await loadTradeBoard({ keep: true });
    k.value = await api('GET', '/api/student/kingdom');
  } catch (err) { await loadTradeBoard({ keep: true }); tradeError.value = err.message; }
  finally { tradePending.value = false; }
}

// Garden constellations: each shape keeps its own viewBox so it never
// stretches, and the line runs through every star point. [x, y, radius]
function constellation(id, name, place, viewBox, stars, edges) {
  const path = edges.map(([a, b]) => `M${stars[a][0]} ${stars[a][1]}L${stars[b][0]} ${stars[b][1]}`).join('');
  return { id, name, place, viewBox, stars, path };
}
const CONSTELLATIONS = [
  constellation('ladle', 'The Ladle', { left: '5%', top: '7%', width: '17%' }, '0 0 190 110',
    [[10, 40, 4], [48, 30, 5], [84, 38, 3.5], [112, 56, 4], [120, 94, 5], [172, 100, 4], [180, 60, 4.5]],
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]]),
  constellation('cat', 'The Sleeping Cat', { left: '27%', top: '24%', width: '16%' }, '0 0 190 100',
    [[20, 62, 3.5], [28, 30, 5], [42, 48, 3], [58, 30, 5], [64, 62, 3.5], [42, 80, 4], [112, 74, 3.5], [150, 84, 4], [172, 54, 3.5], [160, 26, 5]],
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [4, 6], [6, 7], [7, 8], [8, 9]]),
  constellation('crown', 'The Little Crown', { left: '48%', top: '5%', width: '14%' }, '0 0 180 84',
    [[10, 74, 4], [20, 22, 5], [55, 54, 3], [90, 10, 5.5], [125, 54, 3], [160, 22, 5], [170, 74, 4]],
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]]),
  constellation('kite', 'The Kite', { left: '69%', top: '6%', width: '7%' }, '0 0 120 190',
    [[60, 10, 5], [102, 52, 4], [60, 102, 4.5], [18, 52, 4], [80, 132, 3], [58, 158, 3], [84, 182, 3.5]],
    [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [2, 4], [4, 5], [5, 6]]),
  constellation('arrow', 'The Ranger’s Arrow', { left: '82%', top: '12%', width: '13%' }, '0 0 150 110',
    [[12, 92, 4], [140, 20, 5], [110, 22, 3.5], [132, 50, 3.5], [8, 70, 3], [34, 100, 3]],
    [[0, 1], [1, 2], [1, 3], [0, 4], [0, 5]]),
  constellation('hook', 'The Fishing Hook', { left: '45%', top: '38%', width: '8%' }, '0 0 120 140',
    [[20, 12, 4.5], [34, 46, 3.5], [44, 82, 4], [70, 118, 5], [104, 104, 3.5], [100, 74, 4]],
    [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]),
];

// Telescope: a lens iris closes over the whole viewport, then Hero Summon
// opens beneath it. Looking through it never pulls or spends anything.
const lensOn = ref(false);
async function lookThroughTelescope() {
  if (lensOn.value) return;
  lensOn.value = true;
  try {
    await wipeTo('pets', { variant: 'telescope', onCovered: () => { townTarget.value = null; } });
  } finally { if (alive) lensOn.value = false; }
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
        <button class="btn primary note-action" type="button" @click="wipeTo('practice')">Join a class in Practice</button>
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
        :muted="soundState.muted"
        :volume="soundState.volume"
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
        <button class="hud-btn hud-icon" type="button" :aria-pressed="soundState.muted" :aria-label="soundState.muted ? 'Turn sounds on' : 'Mute sounds'" :title="soundState.muted ? 'Sounds off' : 'Sounds on'" @click="toggleMuted">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8h3l4-4v12l-4-4H3Z" /><path v-if="!soundState.muted" d="M13 7c1.4 1.6 1.4 4.4 0 6M15.5 5c2.6 2.8 2.6 7.2 0 10" fill="none" stroke-width="1.8" stroke-linecap="round" /><path v-else d="m13 7 5 6m0-6-5 6" fill="none" stroke-width="1.8" stroke-linecap="round" /></svg>
        </button>
      </div>
      <div class="town-hud town-controls-hud">
        <span><kbd>WASD</kbd> walk</span><span><kbd>E</kbd> open / greet</span><span><kbd>Z</kbd> emote</span><span class="north-hint">Battles: walk north-west ↖</span>
        <span class="touch-controls-hint">Tap the ground to walk · tap a building to open</span>
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
            <template v-else-if="townTarget === 'tower'">
              <div class="tower-feature">
                <section class="tower-board" aria-label="Class exchange request board">
                  <div class="tower-board-heading">
                    <div class="board-sign"><span class="scene-kicker">Class channel · {{ homeData?.classes?.find((c) => c.id === S.classId)?.name || 'Selected class' }}</span><h3>Exchange noticeboard</h3></div>
                    <div class="radio-station" :class="`radio-${radioState}`">
                      <svg class="radio-set" viewBox="0 0 120 84" aria-hidden="true" focusable="false">
                        <path class="radio-antenna" d="M86 30 104 4" stroke="#23382f" stroke-width="3" stroke-linecap="round" /><circle class="radio-antenna" cx="104" cy="4" r="3.5" fill="#d86f6b" stroke="#23382f" stroke-width="1.5" />
                        <g class="radio-waves" fill="none" stroke="#fff3d0" stroke-width="2.5" stroke-linecap="round"><path d="M110 12a10 10 0 0 0-4-10" /><path d="M116 16a17 17 0 0 0-7-17" /></g>
                        <rect x="6" y="28" width="108" height="52" rx="9" fill="#c99c67" stroke="#23382f" stroke-width="3" />
                        <rect x="14" y="36" width="44" height="36" rx="5" fill="#7a5534" stroke="#23382f" stroke-width="2" />
                        <path d="M19 44h34M19 51h34M19 58h34M19 65h34" stroke="#4a3324" stroke-width="2.5" stroke-linecap="round" />
                        <rect x="64" y="36" width="42" height="16" rx="3" fill="#fff3d0" stroke="#23382f" stroke-width="2" />
                        <path d="M68 44h34" stroke="#a8774a" stroke-width="1.5" stroke-dasharray="2 3" />
                        <path class="radio-needle" d="M76 38v12" stroke="#c4574f" stroke-width="2.5" stroke-linecap="round" />
                        <circle cx="74" cy="64" r="7" fill="#e8c57c" stroke="#23382f" stroke-width="2" /><path class="radio-knob" d="M74 64v-6" stroke="#23382f" stroke-width="2" stroke-linecap="round" />
                        <circle cx="96" cy="64" r="7" fill="#e8c57c" stroke="#23382f" stroke-width="2" />
                        <circle class="radio-lamp" cx="96" cy="64" r="3" fill="#7fae58" />
                      </svg>
                      <button class="radio-tune" type="button" :disabled="radioBusy" :aria-busy="radioBusy" @click="tuneRadio">
                        <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M15.5 6.5A6.5 6.5 0 1 0 16.4 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /><path d="M16.8 2.8v4.6h-4.6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
                        {{ radioBusy ? 'Tuning…' : 'Tune in for new notes' }}
                      </button>
                      <span class="radio-status" role="status">{{ radioStatusText }}</span>
                    </div>
                  </div>
                  <div class="tower-filter-row"><span class="board-hint">Pinned requests from your classmates</span><label>Show <select v-model="tradeFilter" @change="tradePage = 0"><option value="all">All open notes</option><option value="mine">My notes</option></select></label></div>
                  <p v-if="tradeError" class="trade-error" role="alert">The radio caught only static: {{ tradeError }} <button class="text-button" type="button" :disabled="radioBusy" @click="tuneRadio">Try again</button></p>
                  <div v-if="tradeBoard" class="pinned-notes">
                    <article class="info-note">
                      <span class="note-pin" aria-hidden="true" />
                      <h4>Board rules</h4>
                      <p v-if="!tradeBoard.enabled">Your class teacher has turned trading off for now.</p>
                      <p v-else-if="!tradeBoard.unlocked">Upgrade the Tower to level 1 to unlock class trading.</p>
                      <p v-else>Offers stay in this class. Pinned resources are held safely until a classmate accepts or you unpin the note.</p>
                    </article>
                    <article v-if="tradeBoard.enabled && tradeBoard.unlocked" class="info-note stash-note">
                      <span class="note-pin" aria-hidden="true" />
                      <h4>Your stash</h4>
                      <p>{{ fmtBundle(tradeBoard.resources, R) }}</p>
                      <small>{{ tradeBoard.mine?.length || 0 }} of {{ tradeBoard.limits.maxOpenPerStudent }} notes pinned</small>
                    </article>
                    <article v-if="tradeBoard.enabled && tradeBoard.unlocked" class="info-note steps-note">
                      <span class="note-pin" aria-hidden="true" />
                      <h4>How trading works</h4>
                      <ol><li>Write a request at the offer desk.</li><li>Your offer waits safely on this board.</li><li>A classmate accepts, and both stashes update.</li></ol>
                    </article>
                    <template v-if="tradeBoard.enabled && tradeBoard.unlocked">
                    <p v-if="!towerTrades.length" class="empty-board-note">No requests pinned yet. Write the first one at the offer desk, or tune the radio to check again.</p>
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
                    </template>
                  </div>
                  <p v-else-if="tradeLoading" class="empty-board-note">Tuning the class radio…</p>
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
                <section class="library-shelves" aria-labelledby="library-archive-title">
                  <div class="shelf-heading">
                    <div class="archive-plaque"><span class="scene-kicker">The magical archive</span><h3 id="library-archive-title">Choose a volume</h3></div>
                    <p class="library-magic-note">Every hero has a gold-titled book on these shelves. The library strengthens magic heroes.</p>
                  </div>
                  <div class="bookcase">
                    <div v-for="(bays, shelfIndex) in libraryShelves" :key="shelfIndex" class="shelf-row" role="group" :aria-label="`Shelf ${shelfIndex + 1}`">
                      <div v-for="bay in bays" :key="bay.id" class="shelf-bay">
                        <template v-for="item in bay.items" :key="item.key">
                          <button v-if="item.kind === 'hero'" class="spine hero-spine" :class="{ selected: archiveOpen && archiveHero?.id === item.hero.id }" :style="{ '--book-color': item.color }" type="button" :aria-pressed="archiveOpen && archiveHero?.id === item.hero.id" :aria-label="`Read ${item.hero.name}'s story`" @click="openArchiveBook(item.hero, $event)"><span>{{ item.hero.name }}</span></button>
                          <span v-else-if="item.kind === 'book'" class="spine decorative-spine" :class="{ tilted: item.tilt, extra: item.extra }" :style="{ '--book-color': item.color, '--spine-h': `${item.height}px`, '--spine-w': `${item.width}px` }" aria-hidden="true" />
                          <span v-else-if="item.kind === 'stack'" class="book-stack" aria-hidden="true"><i v-for="(color, i) in item.colors" :key="i" :style="{ '--book-color': color }" /></span>
                          <span v-else class="shelf-curio" :class="`curio-${item.prop}`" aria-hidden="true"><LibraryProp :kind="item.prop" /></span>
                        </template>
                      </div>
                    </div>
                  </div>
                </section>
                <div v-if="archiveOpen && selectedArchiveHero" class="storybook-overlay" @pointerdown.self="closeArchiveBook">
                  <div class="storybook-spread" role="dialog" aria-modal="true" aria-labelledby="story-title" @keydown="trapBookDialog">
                  <article class="storybook-page story-left">
                    <button ref="bookBackButton" class="book-back" type="button" @click="closeArchiveBook">← Back to the shelves</button>
                    <span class="story-kicker">{{ selectedArchiveHero.name }} · {{ heroStars(selectedArchiveHero) }}-star {{ selectedArchiveHero.type }} hero</span>
                    <h3 id="story-title" class="story-title">{{ selectedHeroLore?.title || selectedArchiveHero.name }}</h3>
                    <p class="hero-personality">{{ selectedHeroLore?.personality || 'A valued member of the town’s defenders.' }}</p>
                    <p class="story-copy">{{ selectedHeroLore?.story || `${selectedArchiveHero.name} brings ${selectedArchiveHero.weapon || 'their own talents'} to every adventure. Their signature skill is ${selectedArchiveHero.skill || 'always ready'}, and their ultimate is ${selectedArchiveHero.ultimate || 'a force to reckon with'}.` }}</p>
                    <p v-if="selectedHeroLore?.fieldNote" class="field-note"><b>Field note</b> · {{ selectedHeroLore.fieldNote }}</p>
                  </article>
                  <div class="storybook-page story-right">
                    <figure class="story-portrait"><div class="portrait-frame"><HeroIcon :hero="selectedArchiveHero" :size="150" :label="`${selectedArchiveHero.name} portrait`" :animated="true" /></div><figcaption>{{ selectedArchiveHero.name }}</figcaption></figure>
                    <dl class="hero-book-stats"><div><dt>HP</dt><dd>{{ selectedArchiveHero.hp }}</dd></div><div><dt>Attack</dt><dd>{{ selectedArchiveHero.attack }}</dd></div><div><dt>Defense</dt><dd>{{ selectedArchiveHero.defense }}</dd></div><div><dt>Speed</dt><dd>{{ selectedArchiveHero.speed }}</dd></div></dl>
                    <dl class="hero-abilities"><div><dt>Primary fire</dt><dd>{{ selectedArchiveHero.weapon || 'Heroic strike' }}</dd></div><div><dt>Skill</dt><dd>{{ selectedArchiveHero.skill || 'Signature skill' }}</dd></div><div><dt>Ultimate</dt><dd>{{ selectedArchiveHero.ultimate || 'Ultimate power' }}</dd></div><div v-if="GAME_CONFIG.heroes[selectedArchiveHero.id]?.talent"><dt>Talent · {{ GAME_CONFIG.heroes[selectedArchiveHero.id].talent.name }}</dt><dd>{{ GAME_CONFIG.heroes[selectedArchiveHero.id].talent.description }}</dd></div></dl>
                  </div>
                  </div>
                </div>
              </div>
            </template>
            <template v-else-if="townTarget === 'workshop'">
              <div class="gym-card workshop-feature">
                <section class="workshop-roster" aria-labelledby="workshop-roster-title">
                  <span class="clipboard-clip" aria-hidden="true" />
                  <h3 id="workshop-roster-title" class="roster-title">Member roster</h3>
                  <p class="roster-sub">Training Workshop · sign-in sheet</p>
                  <div class="roster-list" role="group" aria-label="Choose a hero to preview">
                    <button v-for="(hero, index) in workshopHeroes" :key="hero.id" class="workshop-hero" :class="{ selected: workshopHero?.id === hero.id }" type="button" :aria-pressed="workshopHero?.id === hero.id" @click="previewWorkshopHero = hero">
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
                      <div class="form-sign"><span>Signed by coach</span><b>Bramble</b></div>
                    </div>
                  </div>
                  <footer class="form-foot">
                    <p class="trial-note">Practice privately with any hero. Trials use the real combat controls and grant no rewards or progress. Workshop levels still boost physical heroes in Campfire Run.</p>
                    <button class="btn primary trial-start" type="button" :disabled="trialStarting" @click="startWorkshopTrial(workshopHero)">{{ trialStarting ? 'Opening training ground…' : 'Start Test' }}</button>
                  </footer>
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
                        <button class="hat-option" type="button" :aria-label="'Try on ' + hat.name" :aria-pressed="wardrobeHat?.id === hat.id" :disabled="wardrobeLoading" @click="wardrobeHat = hat"><CosmeticIcon :id="hat.id" :size="58" /><small>{{ hat.name }}</small></button>
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
                        <button class="hat-option" type="button" :aria-label="'Try on ' + item.name" :aria-pressed="wardrobeAccessory?.id === item.id" :disabled="wardrobeLoading" @click="wardrobeAccessory = item"><CosmeticIcon :id="item.id" :size="58" /><small>{{ item.name }}</small></button>
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
                <aside class="wardrobe-preview dressing-room" aria-labelledby="castle-mirror-title">
                  <div class="room-wall" aria-hidden="true">
                    <span class="sconce sconce-left"><i /></span><span class="sconce sconce-right"><i /></span>
                    <span class="hat-stand"><i /><i /><i /></span>
                  </div>
                  <div class="room-floor" aria-hidden="true"><span class="rug" /></div>
                  <figure class="castle-mirror">
                    <div class="mirror-frame">
                      <div class="mirror-glass">
                        <div class="wardrobe-avatar"><AvatarPreview :color="wardrobeColor" :hat-id="wardrobeHat?.id" :accessory-id="wardrobeAccessory?.id" /></div>
                        <span class="mirror-sheen" aria-hidden="true" />
                      </div>
                    </div>
                    <span class="mirror-feet" aria-hidden="true" />
                    <figcaption id="castle-mirror-title">Castle mirror<small>{{ wardrobeDirty ? 'Previewing · not saved yet' : 'Your saved look' }}</small></figcaption>
                  </figure>
                </aside>
              </div>
            </template>
          </div>
        </section>
      </div>

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
.touch-controls-hint { display: none; }
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
.constellation { position: absolute; z-index: 1; margin: 0; pointer-events: none; }
.constellation svg { display: block; width: 100%; height: auto; overflow: visible; }
.constellation path { fill: none; stroke: #c9d6f2; stroke-width: 1.6; stroke-linecap: round; opacity: .62; vector-effect: non-scaling-stroke; }
.constellation circle { fill: #fff3d0; filter: drop-shadow(0 0 3px #fff1b8); animation: star-glimmer 3.6s ease-in-out infinite; }
.constellation circle.bright { fill: #fff8e4; filter: drop-shadow(0 0 5px #f2ba55); }
.constellation figcaption { margin-top: 2px; color: #c9d6f2; font: italic 600 .7rem Georgia,serif; letter-spacing: .03em; opacity: .7; text-align: center; }
@keyframes star-glimmer { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
.garden-horizon { position: absolute; z-index: 2; right: 0; bottom: 0; left: 0; width: 100%; height: 30%; }
.lantern-glow { animation: lantern-glow 2.8s ease-in-out infinite; }
@keyframes lantern-glow { 0%,100% { opacity: .16; } 50% { opacity: .3; } }
.telescope-button { position: absolute; z-index: 3; bottom: 6%; left: clamp(8px,8%,140px); width: clamp(150px,19vw,280px); padding: 0; background: none; border: 0; cursor: pointer; }
.telescope-art { display: block; width: 100%; height: auto; overflow: visible; filter: drop-shadow(0 4px 2px #111a28aa); }
.telescope-tube { transform-origin: 110px 102px; transition: transform .25s ease; }
.telescope-button:hover .telescope-tube { transform: rotate(-4deg); }
.telescope-button:disabled { cursor: default; }
.garden-caption { position: absolute; z-index: 4; right: clamp(8px,3%,48px); bottom: clamp(10px,5%,40px); width: min(40%,520px); padding: clamp(14px,1.4vw,24px); color: #23382f; background: #fff8e4 url('/hero-lab/assets/storybook-paper.svg'); background-size: 144px; border: 3px solid #23382f; border-radius: 6px 9px 5px 8px; box-shadow: 0 5px 0 #4a3324, 0 10px 26px rgb(8 14 30 / 45%); }
.garden-caption .scene-kicker { color: #6b5847; }
.garden-caption h3 { margin: 5px 0; color: #254937; }
.garden-caption p { margin-bottom: 10px; color: #23382f; }
.theme-tower .panel-content, .theme-workshop .panel-content, .theme-castle .panel-content { display: flex; }
.tower-feature { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(0, 3fr) minmax(250px, 1fr); gap: 14px; padding: 14px; overflow: hidden; background: repeating-linear-gradient(7deg,#835b38 0 16px,#8e6741 17px 34px,#7b5332 35px 38px); border: 3px solid #503c2a; border-radius: 7px; box-shadow: inset 0 0 0 4px #aa8153, 0 4px 0 #503c2a; }
.tower-board { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; padding: 16px; background: repeating-linear-gradient(0deg,#a47548 0 30px,#986d43 31px 33px); border: 8px solid #66462e; border-radius: 5px; box-shadow: inset 0 0 0 2px #c29965; }
.tower-board-heading { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 2px dashed #edd4a8; }
.board-sign { padding: 7px 16px 9px; color: #23382f; background: #fff3d0; border: 2px solid #4b3425; box-shadow: 3px 4px 0 #4b3425; transform: rotate(-1deg); }
.board-sign .scene-kicker { color: #6b5847; }
.board-sign h3 { margin: 2px 0 0; color: #254937; font-size: 24px; }
.radio-station { display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; align-items: center; gap: 4px 10px; }
.radio-set { grid-row: span 2; width: 104px; height: auto; overflow: visible; filter: drop-shadow(2px 3px 0 #4b3425); }
.radio-waves { opacity: 0; }
.radio-tune { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 6px 13px; color: #23382f; background: #f2ba55; border: 2px solid #23382f; border-radius: 8px 10px 7px 9px; box-shadow: 0 3px 0 #4b3425; font: 800 .86rem Nunito,Trebuchet MS,sans-serif; cursor: pointer; }
.radio-tune svg { width: 18px; height: 18px; }
.radio-tune:hover:not(:disabled), .radio-tune:focus-visible { outline: 3px solid #fff3d0; outline-offset: 2px; }
.radio-tune:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #4b3425; }
.radio-tune:disabled { cursor: wait; background: #e8d3a3; }
.radio-tuning .radio-tune svg { animation: radio-spin .8s linear infinite; }
.radio-status { max-width: 30ch; color: #fff3d0; font-size: .8rem; font-weight: 700; }
.radio-tuning .radio-set { animation: radio-lift .65s ease-in-out infinite alternate; }
.radio-tuning .radio-needle { animation: radio-sweep .65s ease-in-out infinite alternate; }
.radio-tuning .radio-knob { transform-origin: 74px 64px; animation: radio-spin .65s linear infinite; }
.radio-tuning .radio-waves, .radio-fresh .radio-waves { animation: radio-waves .55s ease-out infinite; }
.radio-tuning .radio-lamp { fill: #f2ba55; animation: radio-blink .3s steps(2) infinite; }
.radio-fresh .radio-lamp { fill: #9be07a; filter: drop-shadow(0 0 3px #9be07a); }
.radio-static .radio-lamp { fill: #c4574f; }
.radio-fresh .radio-status { color: #dff5c8; }
@keyframes radio-lift { from { transform: translateY(0) rotate(0); } to { transform: translateY(-5px) rotate(-3deg); } }
@keyframes radio-sweep { from { transform: translateX(0); } to { transform: translateX(26px); } }
@keyframes radio-spin { to { transform: rotate(360deg); } }
@keyframes radio-waves { from { opacity: .9; } to { opacity: 0; } }
@keyframes radio-blink { 50% { opacity: .3; } }
.tower-filter-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 0; color: #fff3d0; }
.board-hint { font-size: .86rem; font-weight: 700; }
.info-note { position: relative; padding: 20px 14px 12px; color: #23382f; background: #e6eed6; border: 1px solid #5f6d58; box-shadow: 3px 4px 0 #493827; transform: rotate(.8deg); }
.info-note h4 { margin: 0 0 5px; color: #254937; font: 800 .74rem ui-monospace,monospace; letter-spacing: .07em; text-transform: uppercase; }
.info-note p { margin: 0 0 4px !important; font-size: .86rem; font-weight: 700; }
.info-note small { color: #5f6d58; font-weight: 800; }
.stash-note { background: #fff3d0; transform: rotate(-1.1deg); }
.steps-note { background: #e9e1f3; transform: rotate(-.4deg); }
.steps-note ol { margin: 0; padding-left: 18px; font-size: .84rem; font-weight: 700; line-height: 1.45; }
.tower-filter-row label { color: #fff3d0; }
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

/* Library: a magical working archive. Furniture first, books as the controls. */
.library-feature { position: relative; display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; background: #3f2c1f; border: 3px solid #23382f; border-radius: 7px; }
.library-shelves { position: relative; display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; padding: 12px clamp(10px,1.4vw,22px) 16px; background: radial-gradient(ellipse at 50% 0%,rgb(242 186 85 / 16%),transparent 60%), linear-gradient(90deg,#4a3324,#5d412d 12%,#5d412d 88%,#4a3324); border: 10px solid #6b4a31; border-top-width: 14px; box-shadow: inset 0 0 0 2px #2e2016, inset 0 10px 18px rgb(0 0 0 / 30%); }
.shelf-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 18px; margin-bottom: 10px; }
.archive-plaque { padding: 6px 16px 8px; color: #23382f; background: linear-gradient(#e8c57c,#c99a4c); border: 2px solid #2e2016; border-radius: 4px 4px 10px 10px; box-shadow: 0 3px 0 #2e2016, inset 0 0 0 2px #f6dd9f; }
.archive-plaque .scene-kicker { color: #5a3d27; }
.archive-plaque h3 { margin: 2px 0 0; color: #23382f; }
.library-magic-note { max-width: 46ch; margin: 0 !important; color: #f6e7c4; font-size: .85rem; font-weight: 700; }
.bookcase { display: grid; flex: 1; min-height: 0; grid-template-rows: repeat(3,minmax(112px,1fr)); gap: 0; }
.shelf-row { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); min-width: 0; min-height: 0; background: linear-gradient(180deg,#2e2016 0,#3c2a1d 22%,#3c2a1d 100%); border-bottom: 12px solid #7a5534; box-shadow: inset 0 -3px 0 #2e2016, 0 3px 0 #a8774a; }
.shelf-bay { display: flex; min-width: 0; align-items: flex-end; justify-content: center; gap: 2px; padding: 8px 10px 0; overflow: hidden; }
.shelf-bay + .shelf-bay { border-left: 10px solid #6b4a31; box-shadow: inset 2px 0 0 #2e2016; }
.spine { display: block; flex: 0 0 auto; padding: 0; border: 2px solid #23382f; border-bottom: 0; border-radius: 3px 3px 0 0; }
.decorative-spine { width: var(--spine-w); height: var(--spine-h); background: linear-gradient(180deg,transparent 0 12%,rgb(35 56 47 / 35%) 12% 15%,transparent 15% 82%,rgb(35 56 47 / 35%) 82% 85%,transparent 85%), var(--book-color); box-shadow: inset 3px 0 rgb(255 255 255 / 14%), inset -3px 0 rgb(0 0 0 / 22%); filter: saturate(.72) brightness(.88); }
.decorative-spine.tilted { margin: 0 6px 0 4px; transform: rotate(-8deg); transform-origin: bottom right; }
.book-stack { display: flex; flex: 0 0 auto; flex-direction: column-reverse; align-items: center; margin: 0 8px; }
.book-stack i { display: block; width: 74px; height: 15px; margin-top: -2px; background: linear-gradient(90deg,transparent 0 8%,rgb(35 56 47 / 35%) 8% 11%,transparent 11%), var(--book-color); border: 2px solid #23382f; border-radius: 2px 4px 4px 2px; filter: saturate(.72) brightness(.88); }
.book-stack i:nth-child(2) { width: 66px; transform: translateX(4px); }
.book-stack i:nth-child(3) { width: 70px; transform: translateX(-3px); }
.hero-spine { position: relative; width: 36px; height: 100px; color: #fff3cf; background: linear-gradient(180deg,transparent 0 9%,#e8c57c 9% 12%,transparent 12% 88%,#e8c57c 88% 91%,transparent 91%), var(--book-color); box-shadow: inset 4px 0 rgb(255 255 255 / 20%), inset -4px 0 rgb(0 0 0 / 22%); cursor: pointer; transition: transform .14s ease; }
.hero-spine > span { display: block; max-height: 84px; margin: auto; overflow: hidden; font: 800 .64rem/1 Georgia,"Palatino Linotype",serif; letter-spacing: .02em; text-overflow: ellipsis; text-shadow: 0 1px #23382f; white-space: nowrap; writing-mode: vertical-rl; transform: rotate(180deg); }
.hero-spine::after { position: absolute; bottom: -9px; left: 9px; width: 6px; height: 14px; background: #d86f6b; border: 1px solid #23382f; clip-path: polygon(0 0,100% 0,100% 100%,50% 75%,0 100%); content: ''; }
.hero-spine:hover { transform: translateY(-6px); }
.hero-spine:focus-visible { outline: 3px solid #b9a3e3; outline-offset: 2px; transform: translateY(-6px); }
.hero-spine.selected { transform: translateY(-10px); }
.shelf-curio { flex: 0 0 auto; width: 74px; height: 90px; margin: 0 14px; }
.curio-portrait { width: 74px; height: 100px; align-self: center; }
.curio-skull, .curio-stones { width: 80px; height: 82px; }
.storybook-overlay { position: absolute; z-index: 8; inset: 0; display: grid; place-items: center; padding: clamp(10px,2vw,28px); overflow: auto; background: rgb(28 20 14 / 74%); }
.storybook-spread { position: relative; display: grid; width: min(1080px,100%); max-height: 100%; grid-template-columns: minmax(0,1fr) minmax(0,.86fr); overflow: auto; padding: 12px; background: #6b3f2a; border: 3px solid #23382f; border-radius: 10px 12px 10px 12px; box-shadow: 0 8px 0 #2e2016,0 18px 44px rgb(0 0 0 / 50%); }
.storybook-page { padding: clamp(16px,2.2vw,34px); background: #fff8e4 url('/hero-lab/assets/storybook-paper.svg'); background-size: 144px; }
.story-left { border-radius: 6px 0 0 6px; box-shadow: inset -22px 0 24px -18px rgb(80 55 30 / 55%); }
.story-right { display: flex; flex-direction: column; gap: 12px; border-radius: 0 6px 6px 0; box-shadow: inset 22px 0 24px -18px rgb(80 55 30 / 55%); }
.book-back { display: block; margin: 0 0 14px; padding: 4px 0; color: #254937; background: none; border: 0; font: 800 .85rem Nunito, sans-serif; text-decoration: underline; cursor: pointer; }
.book-back:focus-visible { outline: 3px solid #8062a9; outline-offset: 2px; }
.story-kicker { display: block; color: #6b5847; font: 800 .68rem ui-monospace,monospace; letter-spacing: .08em; text-transform: uppercase; }
.storybook-page .story-title { margin: 6px 0 4px; color: #254937; font-size: clamp(24px,2.4vw,32px); }
.hero-personality { color: #4a3d63; font: italic 700 1.02rem Georgia,serif; }
.storybook-page .story-copy { max-width: 60ch; font-size: 1.02rem; line-height: 1.65; }
.story-copy::first-letter { float: left; margin: 4px 8px 0 0; color: #8062a9; font: 700 3.1em/.8 Georgia,serif; }
.field-note { margin: 12px 0; padding: 8px 10px; background: #f3e4c4; border-left: 3px solid #8062a9; font-size: .88rem; }
.story-portrait { display: grid; justify-items: center; gap: 6px; margin: 0; }
.portrait-frame { display: grid; width: min(170px,100%); aspect-ratio: 5 / 6; place-items: center; overflow: hidden; background: radial-gradient(ellipse at 50% 88%,#8fa86f 0 18%,transparent 19%), linear-gradient(#cfe2e8,#eef3e6 70%); border: 8px solid #b98a3e; border-radius: 50% 50% 46% 46% / 40% 40% 36% 36%; box-shadow: 0 0 0 2px #23382f, inset 0 0 0 2px #23382f, 0 4px 0 #7a6545; }
.story-portrait figcaption { color: #57412f; font: 700 .95rem Georgia,serif; }
.hero-abilities { display: grid; gap: 6px; margin: 10px 0 0; }
.hero-abilities div { display: grid; grid-template-columns: 105px 1fr; gap: 8px; padding: 5px 8px; background: #f3e4c4; border-radius: 5px; }
.hero-abilities dt { color: #5f6d58; font-size: .76rem; font-weight: 900; }
.hero-abilities dd { margin: 0; font-weight: 800; }
.hero-book-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 12px 0 0; }
.hero-book-stats div { padding: 7px; background: #e8f0de; border-radius: 5px; }
.hero-book-stats dt { color: #5f6d58; font: 800 .62rem ui-monospace, monospace; text-transform: uppercase; }
.hero-book-stats dd { margin: 2px 0 0; font-weight: 900; }
/* Workshop: a friendly training gym that keeps its members' paperwork. */
.workshop-feature { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(240px,.62fr) minmax(0,1.38fr); gap: 16px; padding: 14px; overflow: hidden; background: repeating-linear-gradient(90deg,#9a7550 0 46px,#8d6a47 47px 48px); border: 3px solid #23382f; border-radius: 7px; box-shadow: inset 0 0 0 4px #b48c5f; }
.workshop-roster { position: relative; display: flex; flex-direction: column; min-height: 0; padding: 30px 12px 12px; background: #fbf2d8 url('/hero-lab/assets/storybook-paper.svg'); background-size: 144px; border: 2px solid #5a4632; border-top: 14px solid #7a5534; border-radius: 6px; box-shadow: 3px 4px 0 #4a3324; }
.clipboard-clip { position: absolute; top: -20px; left: 50%; width: 76px; height: 24px; background: linear-gradient(#d9dbd2,#a8aa9f); border: 2px solid #23382f; border-radius: 6px 6px 3px 3px; transform: translateX(-50%); }
.roster-title { margin: 0; color: #254937; font-size: 21px; text-align: center; }
.roster-sub { margin: 0 0 8px !important; color: #5f6d58; font: 800 .64rem ui-monospace,monospace; letter-spacing: .08em; text-align: center; text-transform: uppercase; }
.roster-list { display: flex; flex-direction: column; min-height: 0; overflow: auto; border-top: 2px solid #23382f; }
.workshop-hero { display: grid; flex: 0 0 auto; grid-template-columns: 24px 38px 1fr auto; grid-template-rows: auto auto; align-items: center; gap: 0 8px; min-height: 52px; padding: 5px 6px; color: #23382f; background: transparent; border: 0; border-bottom: 1px solid #c5b58e; text-align: left; cursor: pointer; }
.workshop-hero .member-no { grid-row: span 2; color: #8a7a5c; font: 800 .7rem ui-monospace,monospace; }
.workshop-hero .hero-icon { grid-row: span 2; justify-self: center; }
.workshop-hero b { grid-column: 3; grid-row: 1; align-self: end; font: 800 .9rem Nunito,sans-serif; }
.workshop-hero small { grid-column: 3; grid-row: 2; align-self: start; color: #5f6d58; font: 800 .6rem ui-monospace,monospace; text-transform: uppercase; }
.member-pass { grid-column: 4; grid-row: 1 / 3; padding: 2px 6px; color: #254937; border: 1.5px solid #254937; border-radius: 3px; font: 800 .58rem ui-monospace,monospace; font-style: normal; letter-spacing: .05em; text-transform: uppercase; transform: rotate(-4deg); }
.member-pass.guest { color: #7a6545; border-style: dashed; border-color: #7a6545; }
.workshop-hero:hover { background: rgb(220 235 200 / 45%); }
.workshop-hero.selected { background: #dcebc8; box-shadow: inset 4px 0 0 #254937; }
.workshop-hero:focus-visible { outline: 3px solid #8062a9; outline-offset: -3px; }
.workshop-detail { position: relative; display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: auto; padding: 18px 20px; background: #fbf2d8 url('/hero-lab/assets/storybook-paper.svg'); background-size: 144px; border: 2px solid #5a4632; border-radius: 4px; box-shadow: 3px 4px 0 #4a3324; }
.workshop-detail::before { position: absolute; top: -8px; left: 26px; width: 14px; height: 38px; border: 3px solid #8a8c82; border-radius: 8px; content: ''; }
.form-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 8px; border-bottom: 2px solid #23382f; }
.form-head h3 { margin: 2px 0 0; color: #254937; font-size: 26px; }
.form-stamp { display: grid; place-items: center; padding: 6px 10px; color: #4f7a3c; border: 3px double #4f7a3c; border-radius: 6px; font: 800 .62rem/1.15 ui-monospace,monospace; letter-spacing: .06em; text-align: center; text-transform: uppercase; opacity: .85; transform: rotate(-7deg); }
.form-body { display: grid; flex: 1; grid-template-columns: minmax(240px,1fr) minmax(260px,1.05fr); gap: 16px; align-items: stretch; }
.workshop-preview-stage { position: relative; min-height: 220px; background: #cfe2e8; overflow: hidden; border: 2px solid #23382f; border-radius: 4px; box-shadow: 2px 3px 0 #7a6545; }
.training-yard { position: absolute; inset: 0; width: 100%; height: 100%; }
.yard-hero { position: absolute; left: 40%; bottom: 10%; display: grid; place-items: end center; width: 45%; height: 72%; transform: translateX(-50%); }
.yard-hero .hero-icon { max-width: 100%; max-height: 100%; }
.form-fields { display: flex; flex-direction: column; gap: 8px; }
.form-sign { display: flex; align-items: flex-end; gap: 10px; margin-top: auto; padding-top: 10px; }
.form-sign span { color: #5f6d58; font: 800 .62rem ui-monospace,monospace; letter-spacing: .06em; text-transform: uppercase; }
.form-sign b { flex: 1; padding: 0 4px 2px; color: #315b45; border-bottom: 1.5px solid #23382f; font: italic 700 1.15rem Georgia,serif; transform: rotate(-2deg); }
.form-line { display: grid; grid-template-columns: 52px 1fr; gap: 8px; align-items: baseline; padding-bottom: 4px; border-bottom: 1px dashed #b9a57c; }
.form-line span { color: #5f6d58; font: 800 .62rem ui-monospace,monospace; letter-spacing: .06em; text-transform: uppercase; }
.form-line b { font-size: .9rem; }
.stat-hp { background: #e3efd6 !important; }.stat-atk { background: #f8e2d2 !important; }.stat-def { background: #dbeaf0 !important; }.stat-spd { background: #e9e1f3 !important; }
.form-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: auto; padding-top: 10px; border-top: 1px dashed #9d8962; }
.form-foot .trial-start { margin-left: auto; }
.trial-note { flex: 1 1 320px; margin: 0 !important; color: #5f4a2e; font-size: .86rem; }
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
/* Castle dressing room: wallpaper, wainscot, sconces and a standing mirror. */
.dressing-room { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-height: 0; overflow: hidden; padding: 18px 14px 22px; border: 2px solid #23382f; border-radius: 6px; }
.room-wall { position: absolute; inset: 0 0 18%; background: linear-gradient(180deg,transparent 0 70%,#7a5534 70% 71.5%,#a8774a 71.5% 100%), repeating-linear-gradient(90deg,transparent 0 22px,rgb(255 248 228 / 16%) 22px 24px), radial-gradient(circle at 50% 50%,rgb(242 186 85 / 22%) 0 3px,transparent 4px) 0 0 / 34px 34px, #6c4f7e; }
.room-wall::after { position: absolute; right: 0; bottom: 0; left: 0; height: 28.5%; background: repeating-linear-gradient(90deg,transparent 0 46px,#7a5534 46px 48px); content: ''; }
.room-floor { position: absolute; right: 0; bottom: 0; left: 0; height: 18%; background: repeating-linear-gradient(90deg,#8d6a47 0 38px,#7a5534 38px 40px); border-top: 3px solid #4a3324; }
.rug { position: absolute; bottom: 18%; left: 50%; width: 74%; height: 46%; background: #b9534c; border: 2px solid #23382f; border-radius: 50%; box-shadow: inset 0 0 0 5px #e8c57c, inset 0 0 0 7px #23382f; transform: translateX(-50%); }
.sconce { position: absolute; top: 20%; width: 14px; height: 34px; background: #c8963e; border: 2px solid #23382f; border-radius: 3px 3px 8px 8px; }
.sconce i { position: absolute; top: -18px; left: 50%; width: 12px; height: 18px; background: #f2ba55; border-radius: 50% 50% 40% 40%; box-shadow: 0 0 18px 8px rgb(242 186 85 / 35%); transform: translateX(-50%); animation: flame-glow 2.4s ease-in-out infinite; }
.sconce-left { left: 9%; }.sconce-right { right: 9%; }
.hat-stand { position: absolute; right: 6%; bottom: -48%; width: 6px; height: 86%; background: #5a3d27; border: 1.5px solid #23382f; }
.hat-stand i { position: absolute; top: 4%; width: 22px; height: 4px; background: #5a3d27; border: 1.5px solid #23382f; border-radius: 3px; }
.hat-stand i:nth-child(1) { left: -20px; transform: rotate(-20deg); }.hat-stand i:nth-child(2) { left: 2px; transform: rotate(20deg); }.hat-stand i:nth-child(3) { top: -2px; left: -9px; width: 24px; height: 12px; background: #3f4b5a; border-radius: 10px 10px 2px 2px; }
@keyframes flame-glow { 0%,100% { opacity: .85; } 50% { opacity: 1; } }
.castle-mirror { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; margin: 0; }
.mirror-frame { padding: 10px; background: linear-gradient(135deg,#e8c57c,#b98a3e 45%,#e8c57c 70%,#9a7030); border: 3px solid #23382f; border-radius: 50% 50% 10px 10px / 34% 34% 10px 10px; box-shadow: 0 6px 0 #4a3324, 0 12px 24px rgb(0 0 0 / 30%); }
.mirror-glass { position: relative; display: grid; width: clamp(150px,15vw,210px); aspect-ratio: 3 / 4.2; place-items: end center; overflow: hidden; padding-bottom: 10%; background: radial-gradient(ellipse at 50% 92%,rgb(35 56 47 / 25%) 0 22%,transparent 23%), linear-gradient(170deg,#e6eef0,#bfd2d8 55%,#a9bfc7); border: 2px solid #23382f; border-radius: 50% 50% 6px 6px / 30% 30% 6px 6px; box-shadow: inset 0 0 18px rgb(35 56 47 / 25%); }
.mirror-sheen { position: absolute; top: -10%; left: 16%; width: 18%; height: 130%; background: linear-gradient(90deg,transparent,rgb(255 255 255 / 45%),transparent); pointer-events: none; transform: rotate(18deg); }
.mirror-feet { width: 64%; height: 14px; background: #b98a3e; border: 3px solid #23382f; border-top: 0; border-radius: 0 0 10px 10px; }
.castle-mirror figcaption { display: grid; justify-items: center; gap: 2px; margin-top: 10px; padding: 5px 14px; color: #23382f; background: #fbf2d8; border: 2px solid #23382f; border-radius: 4px; box-shadow: 0 3px 0 #4a3324; font: 700 1rem Georgia,serif; }
.castle-mirror figcaption small { color: #5f6d58; font: 800 .62rem ui-monospace,monospace; letter-spacing: .05em; text-transform: uppercase; }
.wardrobe-avatar { position: relative; z-index: 1; width: 80%; aspect-ratio: 1; }
.wardrobe-avatar :deep(.avatar-preview) { width: 100%; height: 100%; }
.wardrobe-tabs { display:flex; flex-wrap:wrap; gap:7px; margin:14px 0 12px; padding-bottom:9px; border-bottom:2px dashed #c5b58e; }
.wardrobe-tab { min-height:34px; padding:5px 13px; color:#493827; background:#f3e4c4; border:1.5px solid #9b8157; border-radius:5px 8px 5px 7px; font:800 .78rem Nunito,sans-serif; cursor:pointer; }
.wardrobe-tab[aria-pressed="true"] { color:#fff8e4; background:#315b45; border-color:#23382f; box-shadow:0 2px #23382f; }
.wardrobe-tab:focus-visible { outline:3px solid #8062a9; outline-offset:2px; }
.wardrobe-items { min-height:154px; margin:8px 0 12px; }
.wardrobe-items h4 { margin:0 0 9px; color:#57412f; font:800 .78rem ui-monospace,monospace; letter-spacing:.06em; text-transform:uppercase; }
.wardrobe-save { margin-top:4px; }
.wardrobe-title-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }.wardrobe-stamp { display:grid; width:56px; height:56px; place-items:center; color:#8062a9; border:2px double #8062a9; border-radius:50%; font:800 .53rem/1.1 ui-monospace,monospace; text-align:center; transform:rotate(9deg); }
.wardrobe-selection-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(200px,.8fr); gap:20px; margin:18px 0; }
.wardrobe-selection-grid h4 { margin:0 0 9px; color:#57412f; font:800 .78rem ui-monospace,monospace; letter-spacing:.06em; text-transform:uppercase; }
.hat-options { display:grid; grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); align-items:stretch; gap:14px 10px; }
.hat-card { display:grid; min-width:0; grid-template-rows:1fr auto; gap:4px; }
.hat-option { display:grid; width:100%; min-width:0; min-height:108px; place-items:center; gap:4px; padding:10px 4px 7px; color:#493827; background:linear-gradient(#e9d6ad,#f3e4c4 40%); border:1px solid #9b8157; border-bottom:7px solid #7a5534; border-radius:6px 6px 2px 2px; box-shadow:inset 0 6px 10px rgb(90 61 39 / 18%); cursor:pointer; }
.hat-option:hover:not(:disabled) { background:linear-gradient(#efdfba,#fbf2d8 40%); }.hat-option:focus-visible { outline:3px solid #8062a9; outline-offset:2px; }
.hat-option small { max-width:100%; font-size:.62rem; font-weight:800; text-align:center; }.hat-option[aria-pressed="true"] { background:#dcebc8; outline:2px solid #254937; }
.hat-claim { min-height:29px; padding:3px; color:#254937; background:#e8f0de; border:1px solid #687553; border-radius:4px; font:800 .62rem Nunito,sans-serif; cursor:pointer; }
.hat-claim:disabled,.hat-option:disabled { cursor:wait; opacity:.65; }.hat-owned { min-height:29px; display:grid; place-items:center; color:#53654f; font:800 .6rem ui-monospace,monospace; text-align:center; }
.wardrobe-status { color:#53654f; font-size:.82rem; }.wardrobe-error { padding:8px 10px; color:#812e2d; background:#f8e3e1; border-left:3px solid #812e2d; font-size:.85rem; }
.wardrobe-purse { width:fit-content; padding:5px 9px; color:#254937; background:#e8f0de; border:1px solid #687553; font-size:.8rem; font-weight:900; }
.wardrobe-shortfall { display:grid; min-height:29px; align-content:center; color:#812e2d; font:800 .58rem/1.2 Nunito,sans-serif; text-align:center; }
.wardrobe-swatches { grid-template-columns:repeat(6,minmax(30px,38px)); gap:10px; margin:10px 0; }
.theme-garden .panel-head { border-bottom-color: #8062a9; }
.theme-tower .panel-level { color: #4a3d63; }

@media (prefers-reduced-motion: reduce) {
  .constellation circle, .lantern-glow, .sconce i, .radio-set, .radio-needle, .radio-knob, .radio-waves, .radio-lamp, .radio-tune svg { animation: none !important; }
  .hero-spine, .telescope-tube { transition: none; }
}

@media (max-width: 760px) {
  .town-controls-hud { display: none; }
  .tower-feature { grid-template-columns: minmax(0,2fr) minmax(230px,1fr); gap: 9px; padding: 9px; }
  .tower-board { padding: 11px; border-width: 6px; }
  .tower-offer-desk { padding: 12px 10px; }
  .workshop-feature { grid-template-columns: minmax(200px,.7fr) minmax(0,1.3fr); }
}
@media (max-width: 1180px) {
  .form-body { grid-template-columns: 1fr; }
  .workshop-preview-stage { max-width: 440px; min-height: 0; aspect-ratio: 400 / 260; }
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
  .theme-library .panel-content, .theme-tower .panel-content, .theme-workshop .panel-content, .theme-castle .panel-content { display: block; }
  .constellation figcaption { display: none; }
  .library-feature { overflow: visible; }
  .library-shelves { min-height: 0; border-width: 7px; }
  .bookcase { grid-template-rows: none; }
  .shelf-row { grid-template-columns: minmax(0,1fr); }
  .decorative-spine.extra, .book-stack { display: none; }
  .shelf-bay { min-height: 116px; }
  .shelf-bay + .shelf-bay { border-top: 8px solid #6b4a31; border-left: 0; box-shadow: none; }
  .shelf-curio { width: 60px; height: 74px; margin: 0 8px; }
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
  .workshop-feature { flex: 0 0 auto; grid-template-columns: 1fr; overflow: visible; }
  .workshop-roster { max-height: 300px; }
  .workshop-detail { overflow: visible; padding: 14px; }
  .theme-garden .telescope-button { left: 2%; width: 120px; }
  .dressing-room { min-height: 340px; }
  .hero-book-stats { grid-template-columns: repeat(2, 1fr); }
}
@media (pointer: coarse) {
  .town-controls-hud { display: flex; right: 10px; bottom: calc(74px + env(safe-area-inset-bottom)); left: 10px; justify-content: center; max-width: none; padding: 7px 10px; font-size: .75rem; text-align: center; }
  .town-controls-hud > span:not(.touch-controls-hint) { display: none; }
  .touch-controls-hint { display: inline; }
  .town-actions { bottom: max(10px, env(safe-area-inset-bottom)); }
  .town-actions .hud-btn { min-height: 44px; }
  .town-title-actions .hud-btn { min-height: 42px; }
  .town-modal-shade { padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); }
  .town-modal { width: 100%; height: 100%; max-height: 100%; }
}
@media (pointer: coarse) and (max-width: 600px) and (orientation: portrait) {
  .town-title-hud { top: max(8px, env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); padding: 7px 9px; }
  .town-title-hud .scene-kicker { font-size: .58rem; }
  .town-title { font-size: 16px; }
  .town-title span:last-child { display: none; }
  .town-level { top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right)); padding: 5px 8px; }
  .town-actions { right: max(8px, env(safe-area-inset-right)); left: max(8px, env(safe-area-inset-left)); justify-content: center; gap: 6px; }
  .town-actions .hud-btn { flex: 1 1 0; justify-content: center; padding: 6px 8px; font-size: .78rem; }
  .town-controls-hud { bottom: calc(68px + env(safe-area-inset-bottom)); }
  .town-list { top: 92px; left: max(8px, env(safe-area-inset-left)); width: min(290px, calc(100vw - 16px)); }
  .town-intro, .avatar-customize { bottom: calc(124px + env(safe-area-inset-bottom)); left: 8px; width: min(430px, calc(100vw - 16px)); max-height: calc(100svh - 150px); overflow: auto; }
}
@media (pointer: coarse) and (orientation: landscape) and (max-height: 520px) {
  .town-title-hud { top: max(6px, env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); padding: 6px 9px; }
  .town-title { margin-bottom: 5px; font-size: 16px; }
  .town-title-hud .scene-kicker { display: none; }
  .town-title-actions .hud-btn { min-height: 38px; }
  .town-level { top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right)); }
  .town-actions { bottom: max(6px, env(safe-area-inset-bottom)); left: max(8px, env(safe-area-inset-left)); }
  .town-actions .hud-btn { min-height: 40px; }
  .town-controls-hud { right: max(8px, env(safe-area-inset-right)); bottom: max(8px, env(safe-area-inset-bottom)); left: auto; width: min(370px, 45vw); }
  .town-modal { padding: 12px; }
  .panel-head { padding-bottom: 8px; }
  .panel-title h2 { font-size: 23px; }
  .panel-purpose { margin: 8px 0; }
}
</style>
