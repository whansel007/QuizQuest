<script setup>
// ============================================================
// STUDENT: walkable kingdom town
// HUD, building panels, the first-visit tour and the telescope
// hand-off to Hero Summon. The map itself lives in KingdomTown.
// ============================================================
import { ref, computed, reactive, nextTick, onMounted, onUnmounted } from 'vue';
import { S, api, retryablePost } from '../api.js';
import { fmtBundle, toast } from '../ui.js';
import { soundState, toggleMuted, playCue } from '../sound.js';
import { wipe, wipeTo } from '../transitions.js';
import AsyncButton from '../components/AsyncButton.vue';
import { loadHome } from './home.js';
import KingdomTown from './KingdomTown.vue';
import AvatarPreview from './AvatarPreview.vue';
import BuildingIcon from './BuildingIcon.vue';
import GardenPanel from './kingdom/panels/GardenPanel.vue';
import TowerPanel from './kingdom/panels/TowerPanel.vue';
import LibraryPanel from './kingdom/panels/LibraryPanel.vue';
import WorkshopPanel from './kingdom/panels/WorkshopPanel.vue';
import CastlePanel from './kingdom/panels/CastlePanel.vue';
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
const castleLevel = computed(() => k.value?.castleLevel || 0);
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

const gardenPanelContext = reactive({ CONSTELLATIONS, lensOn, lookThroughTelescope });
const towerPanelContext = reactive({
  homeData, S, radioState, radioBusy, tuneRadio, radioStatusText,
  tradeFilter, tradePage, tradeError, tradeBoard, fmtBundle, R, towerTrades, TRADE_PAGE_SIZE,
  cancelTrade, tradePending, tradeConfirm, filteredTowerTrades, tradePageCount, tradeConfirmPreview,
  acceptTrade, tradeLoading, tradeGive, tradeWant, tradePost, setTradeAmount, tradeCreateConfirm,
  tradeBundleHasItems, reviewTrade, createTrade,
});
const libraryPanelContext = reactive({
  libraryShelves, archiveOpen, archiveHero, selectedArchiveHero, openArchiveBook, closeArchiveBook,
  bookBackButton, trapBookDialog, heroStars, selectedHeroLore, GAME_CONFIG,
});
const workshopPanelContext = reactive({
  workshopHeroes, workshopHero, previewWorkshopHero, workshopConfig, ownedHeroIds,
  heroesOfType, heroStars, trialStarting, startWorkshopTrial,
});
const castlePanelContext = reactive({
  wardrobeResources, R, fmtBundle, wardrobeLoading, wardrobeError, wardrobeCategory, wardrobeHats,
  wardrobeOwnedIds, wardrobeHat, wardrobeClaiming, wardrobeCanAfford, wardrobePrice, wardrobeShortfall,
  claimWardrobeCosmetic, wardrobeAccessory, wardrobeAccessories, wardrobeColors, wardrobeColor,
  colorSaving, wardrobeDirty, wardrobeCanSave, saveWardrobeLook, castleInfoOpen, castleLevel, BUILDING_LEVEL_CAP,
});
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

          <template v-if="townPlot">
            <p v-if="townPlot.cost && !townPlot.affordable" class="panel-note">You have {{ haveText }}. Gather more through Practice or by exploring the World.</p>
          </template>

          <!-- Each building owns its own panel content. Shared title, level, effect and upgrade controls stay above. -->
          <div class="panel-content">
            <GardenPanel v-if="townTarget === 'garden'" :context="gardenPanelContext" />
            <TowerPanel v-else-if="townTarget === 'tower'" :context="towerPanelContext" />
            <LibraryPanel v-else-if="townTarget === 'library'" :context="libraryPanelContext" />
            <WorkshopPanel v-else-if="townTarget === 'workshop'" :context="workshopPanelContext" />
            <CastlePanel v-else-if="townTarget === 'castle'" :context="castlePanelContext" />
          </div>
        </section>
      </div>

   </template>
  </div>
</template>

<style>
/* Root-scoped global rules also style the building panel child components. */
.kingdom-screen { position: relative; width: 100%; height: 100%; min-height: 100%; overflow: hidden; background: #2f5e3e; }
.kingdom-screen .scene-note { position: absolute; inset: 50% auto auto 50%; width: min(90vw, 440px); padding: 30px; transform: translate(-50%, -50%); color: #23382f; background: #fbf2d8; border: 4px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 8px 0 #7a6545; text-align: center; }
.kingdom-screen .scene-note h1 { margin: 8px 0; color: #254937; font: 700 32px/1.1 Georgia, "Palatino Linotype", serif; }
.kingdom-screen .scene-note p { margin: 0; }
.kingdom-screen .note-action { margin-top: 16px; }
.kingdom-screen .scene-error { color: #812e2d; }
/* storybook buttons: campfire-gold main action, parchment secondary */
.kingdom-screen .btn { min-height: 38px; padding: 7px 14px; color: #23382f; background: #fff8e4; border: 2px solid #23382f; border-radius: 8px 9px 7px 10px; box-shadow: 0 3px 0 #7a6545; font: 800 .9rem Nunito, Trebuchet MS, sans-serif; cursor: pointer; }
.kingdom-screen .btn.primary { color: #23382f; background: #f2ba55; border-color: #23382f; }
.kingdom-screen .btn:hover:not(:disabled), .kingdom-screen .btn:focus-visible { outline: 3px solid #8062a9; outline-offset: 2px; }
.kingdom-screen .btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #7a6545; }
.kingdom-screen .btn:disabled { color: #6b6450; background: #ece3cc; border-style: dashed; box-shadow: none; cursor: not-allowed; opacity: 1; }
.kingdom-screen .scene-kicker { display: block; color: #778054; font: 800 .66rem ui-monospace, monospace; letter-spacing: .11em; }
.kingdom-screen .town-hud { position: absolute; z-index: 2; }
.kingdom-screen .town-title-hud { top: 18px; left: 18px; padding: 11px 14px 12px; color: #fff8e4; background: rgb(35 56 47 / 90%); border: 2px solid #23382f; border-radius: 12px 10px 14px 9px; box-shadow: 0 4px 0 rgb(35 56 47 / 45%); }
.kingdom-screen .town-title-hud .scene-kicker { color: #f2ba55; }
.kingdom-screen .town-title { margin: 3px 0 9px; color: #fff8e4; font: 700 22px/1.15 Georgia, "Palatino Linotype", serif; }
.kingdom-screen .town-title-dot { color: #f2ba55; }
.kingdom-screen .town-title-actions { display: flex; gap: 6px; }
.kingdom-screen .hud-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 6px 12px; color: #23382f; background: #fbf2d8; border: 2px solid #23382f; border-radius: 8px; box-shadow: 0 3px 0 #7a6545; font: 800 .84rem Nunito, Trebuchet MS, sans-serif; cursor: pointer; }
.kingdom-screen .hud-btn svg { width: 17px; height: 17px; fill: #23382f; stroke: #23382f; }
.kingdom-screen .hud-btn.gold { background: #f2ba55; }
.kingdom-screen .hud-btn kbd { padding: 0 5px; background: #fff8e4; border: 1.5px solid #23382f; border-radius: 4px; font: 800 .66rem/1.5 ui-monospace, monospace; }
.kingdom-screen .hud-icon { justify-content: center; min-width: 36px; padding: 6px; }
.kingdom-screen .hud-btn:hover, .kingdom-screen .hud-btn:focus-visible { outline: 3px solid #f2ba55; outline-offset: 2px; }
.kingdom-screen .hud-btn.gold:hover, .kingdom-screen .hud-btn.gold:focus-visible { outline-color: #fff8e4; }
.kingdom-screen .hud-btn:active { transform: translateY(2px); box-shadow: 0 1px 0 #7a6545; }
.kingdom-screen .town-list { position: absolute; z-index: 3; top: 128px; left: 18px; display: grid; gap: 6px; width: min(270px, calc(100vw - 36px)); padding: 9px; background: #fbf2d8; border: 2px solid #23382f; border-radius: 10px; box-shadow: 0 4px 0 #7a6545; }
.kingdom-screen .town-list-entry { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 10px; padding: 6px 9px; color: #23382f; background: #fff8e4; border: 1.5px solid #c5b58e; border-radius: 7px; text-align: left; cursor: pointer; }
.kingdom-screen .town-list-entry .building-icon, .kingdom-screen .town-list-entry .building-icon { width: 34px; height: 34px; }
.kingdom-screen .town-list-entry b { display: block; font: 700 1rem Georgia, "Palatino Linotype", serif; }
.kingdom-screen .town-list-entry small { color: #5f6d58; font: 800 .64rem ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
.kingdom-screen .town-list-entry em { color: #5f6d58; font: 800 .72rem ui-monospace, monospace; font-style: normal; white-space: nowrap; }
.kingdom-screen .town-list-entry em.ready { color: #254937; }
.kingdom-screen .town-list-entry:hover, .kingdom-screen .town-list-entry:focus-visible { border-color: #23382f; outline: 2px solid #f2ba55; outline-offset: 1px; }
.kingdom-screen .town-level { top: 18px; right: 18px; padding: 9px 14px; color: #23382f; background: #f2ba55; border: 3px solid #23382f; border-radius: 9px; box-shadow: 0 4px 0 #7a6545; font-weight: 900; pointer-events: none; }
.kingdom-screen .town-actions { left: 18px; bottom: 16px; display: flex; gap: 8px; }
.kingdom-screen .town-controls-hud { right: 18px; bottom: 16px; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 14px; max-width: min(560px, 60vw); padding: 9px 14px; color: #fff8e4; background: rgb(35 56 47 / 90%); border-radius: 9px; font: 700 .8rem/1.3 Nunito, Trebuchet MS, sans-serif; pointer-events: none; }
.kingdom-screen .town-controls-hud kbd { padding: 1px 5px; color: #23382f; background: #f2ba55; border: 1px solid #23382f; border-radius: 4px; font: 800 .68rem ui-monospace, monospace; }
.kingdom-screen .north-hint { color: #f2ba55; }
.kingdom-screen .touch-controls-hint { display: none; }
.kingdom-screen .avatar-customize { position: absolute; z-index: 4; left: 18px; bottom: 70px; width: min(360px, calc(100vw - 32px)); max-height: calc(100% - 100px); overflow-y: auto; padding: 22px; color: #23382f; background: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 3px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 6px 0 #7a6545, 0 14px 30px rgb(16 33 23 / 28%); }
.kingdom-screen .avatar-customize h2 { margin: 4px 38px 0 0; color: #254937; font: 700 22px/1.1 Georgia, "Palatino Linotype", serif; }
.kingdom-screen .customize-close { top: 10px; right: 10px; }
.kingdom-screen .avatar-swatches { display: grid; grid-template-columns: repeat(6, 1fr); gap: 9px; }
.kingdom-screen .avatar-swatch { width: 38px; height: 38px; justify-self: center; padding: 0; background: var(--swatch-color); border: 2px solid #23382f; border-radius: 50% 45% 48% 42%; box-shadow: 0 2px 0 #7a6545; cursor: pointer; }
.kingdom-screen .avatar-swatch[aria-pressed="true"] { outline: 3px solid #8062a9; outline-offset: 2px; transform: scale(1.08); }
.kingdom-screen .avatar-swatch:disabled { opacity: .72; cursor: wait; }
.kingdom-screen .avatar-swatch:focus-visible { outline: 3px solid #8062a9; outline-offset: 3px; }
.kingdom-screen .avatar-save-state { min-height: 1.3em; margin: 12px 0 0 !important; color: #52664b; font-size: .82rem; text-align: center; }

.kingdom-screen .town-intro { position: absolute; z-index: 5; left: 18px; bottom: 70px; width: min(430px, calc(100vw - 32px)); padding: 18px 20px 16px; color: #23382f; background: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 3px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 6px 0 #7a6545, 0 14px 30px rgb(16 33 23 / 30%); }
.kingdom-screen .town-intro h2 { margin: 4px 0 6px; color: #254937; font: 700 24px/1.15 Georgia, "Palatino Linotype", serif; }
.kingdom-screen .town-intro p { margin: 0 0 14px; line-height: 1.45; }
.kingdom-screen .town-intro-actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }
.kingdom-screen .intro-dots { display: flex; gap: 6px; margin-right: auto; }
.kingdom-screen .intro-dots i { width: 9px; height: 9px; background: #e2d3ad; border: 1.5px solid #23382f; border-radius: 50%; }
.kingdom-screen .intro-dots i.on { background: #f2ba55; }

.kingdom-screen .town-modal-shade { position: fixed; z-index: 1000; inset: 0; display: grid; place-items: center; padding: 20px; background: rgb(22 36 27 / 66%); }
.kingdom-screen .town-modal { position: relative; display: flex; flex-direction: column; width: min(82vw, 1540px); height: min(82vh, 900px); max-height: calc(100svh - 40px); overflow: hidden; padding: 22px 24px 24px; color: #23382f; background: #fbf2d8; background-image: url('/hero-lab/assets/storybook-paper.svg'), linear-gradient(135deg, #fff8e4, #f1e6c7); background-size: 144px 144px, auto; border: 4px solid #23382f; border-radius: 14px 11px 16px 12px; box-shadow: 0 8px 0 #7a6545, 0 18px 48px rgb(0 0 0 / 30%); }
.kingdom-screen .panel-head { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px 16px; padding-right: 44px; padding-bottom: 14px; border-bottom: 2px dashed #c5b58e; }
.kingdom-screen .panel-title { flex: 0 1 190px; }
.kingdom-screen .panel-title h2 { margin: 4px 0 4px; color: #254937; font: 700 30px/1.05 Georgia, "Palatino Linotype", serif; }
.kingdom-screen .panel-level { display: flex; align-items: center; gap: 8px; margin: 0; color: #4a3d63; font-weight: 900; }
.kingdom-screen .level-pips { display: inline-flex; gap: 4px; }
.kingdom-screen .level-pips i { width: 14px; height: 14px; background: #fff8e4; border: 2px solid #23382f; border-radius: 3px 4px 3px 5px; }
.kingdom-screen .level-pips i.on { background: #f2ba55; }
.kingdom-screen .panel-upgrade { display: flex; align-items: center; align-self: center; }
.kingdom-screen .panel-upgrade .btn { white-space: nowrap; }
.kingdom-screen .max-badge { padding: 6px 10px; color: #254937; background: #dcebc8; border: 2px solid #254937; border-radius: 8px; font-weight: 900; }
.kingdom-screen .town-modal-kicker { color: #5f6d58; font: 800 .68rem ui-monospace, monospace; letter-spacing: .08em; }
.kingdom-screen .town-modal-close { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; color: #23382f; background: #fff8e4; border: 2px solid #23382f; border-radius: 8px; box-shadow: 0 3px 0 #7a6545; font-size: 24px; line-height: 1; cursor: pointer; }
.kingdom-screen .town-modal-close:focus-visible, .kingdom-screen .town-modal-close:hover { outline: 3px solid #f2ba55; outline-offset: 2px; }
.kingdom-screen .panel-purpose { margin: 14px 0 10px; line-height: 1.45; }
.kingdom-screen .panel-effect { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; margin: 0 0 10px; }
.kingdom-screen .panel-effect div { padding: 9px 12px; background: #fff8e4; border: 2px solid #23382f; border-radius: 8px 10px 7px 9px; }
.kingdom-screen .panel-effect dt { color: #5f6d58; font: 800 .64rem ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; }
.kingdom-screen .panel-effect dd { margin: 2px 0 0; font-weight: 800; }
.kingdom-screen .compact-effect { flex: 1 1 330px; grid-template-columns: repeat(2,minmax(0,1fr)); margin: 0; }
.kingdom-screen .panel-note { margin: 0 0 8px; color: #5f4a2e; font-size: .88rem; }
.kingdom-screen .panel-content { flex: 1; min-height: 0; overflow: auto; margin-top: 14px; }
.kingdom-screen .panel-content h3 { margin: 2px 0 4px; font: 700 19px/1.2 Georgia, "Palatino Linotype", serif; }
.kingdom-screen .panel-content p { margin: 0 0 10px; line-height: 1.45; }
.kingdom-screen .preview-tag { display: inline-block; padding: 2px 8px; color: #4a3d63; background: #ece3f8; border: 1.5px dashed #8062a9; border-radius: 999px; font: 800 .64rem ui-monospace, monospace; letter-spacing: .06em; text-transform: uppercase; }
.kingdom-screen .sky-card { position: relative; flex: 1; min-height: 0; overflow: hidden; padding: 0; color: #fff8e4; background: #101d42; border: 3px solid #23382f; border-radius: 12px 10px 14px 9px; }
.kingdom-screen .theme-garden .panel-content, .kingdom-screen .theme-library .panel-content { display: flex; }
.kingdom-screen .garden-sky { position: absolute; inset: 0; overflow: hidden; background: linear-gradient(180deg,#1b3154 0%,#2c4d7c 68%,#4d6e9e 100%); }
.kingdom-screen .garden-star-sky { position: absolute; z-index: 0; inset: 0; }
.kingdom-screen .garden-star-sky .summon-sky { position: absolute; inset: 0; }
.kingdom-screen .constellation { position: absolute; z-index: 1; margin: 0; pointer-events: none; }
.kingdom-screen .constellation svg { display: block; width: 100%; height: auto; overflow: visible; }
.kingdom-screen .constellation path { fill: none; stroke: #c9d6f2; stroke-width: 1.6; stroke-linecap: round; opacity: .62; vector-effect: non-scaling-stroke; }
.kingdom-screen .constellation circle { fill: #fff3d0; filter: drop-shadow(0 0 3px #fff1b8); animation: star-glimmer 3.6s ease-in-out infinite; }
.kingdom-screen .constellation circle.bright { fill: #fff8e4; filter: drop-shadow(0 0 5px #f2ba55); }
.kingdom-screen .constellation figcaption { margin-top: 2px; color: #c9d6f2; font: italic 600 .7rem Georgia,serif; letter-spacing: .03em; opacity: .7; text-align: center; }
@keyframes star-glimmer { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
.kingdom-screen .garden-horizon { position: absolute; z-index: 2; right: 0; bottom: 0; left: 0; width: 100%; height: 30%; }
.kingdom-screen .lantern-glow { animation: lantern-glow 2.8s ease-in-out infinite; }
@keyframes lantern-glow { 0%,100% { opacity: .16; } 50% { opacity: .3; } }
.kingdom-screen .telescope-button { position: absolute; z-index: 3; bottom: 6%; left: clamp(8px,8%,140px); width: clamp(150px,19vw,280px); padding: 0; background: none; border: 0; cursor: pointer; }
.kingdom-screen .telescope-art { display: block; width: 100%; height: auto; overflow: visible; filter: drop-shadow(0 4px 2px #111a28aa); }
.kingdom-screen .telescope-tube { transform-origin: 110px 102px; transition: transform .25s ease; }
.kingdom-screen .telescope-button:hover .telescope-tube { transform: rotate(-4deg); }
.kingdom-screen .telescope-button:disabled { cursor: default; }
.kingdom-screen .garden-caption { position: absolute; z-index: 4; right: clamp(8px,3%,48px); bottom: clamp(10px,5%,40px); width: min(40%,520px); padding: clamp(14px,1.4vw,24px); color: #23382f; background: #fff8e4 url('/hero-lab/assets/storybook-paper.svg'); background-size: 144px; border: 3px solid #23382f; border-radius: 6px 9px 5px 8px; box-shadow: 0 5px 0 #4a3324, 0 10px 26px rgb(8 14 30 / 45%); }
.kingdom-screen .garden-caption .scene-kicker { color: #6b5847; }
.kingdom-screen .garden-caption h3 { margin: 5px 0; color: #254937; }
.kingdom-screen .garden-caption p { margin-bottom: 10px; color: #23382f; }
.kingdom-screen .theme-tower .panel-content, .kingdom-screen .theme-workshop .panel-content, .kingdom-screen .theme-castle .panel-content { display: flex; }
.kingdom-screen .tower-feature { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(0, 3fr) minmax(250px, 1fr); gap: 14px; padding: 14px; overflow: hidden; background: repeating-linear-gradient(7deg,#835b38 0 16px,#8e6741 17px 34px,#7b5332 35px 38px); border: 3px solid #503c2a; border-radius: 7px; box-shadow: inset 0 0 0 4px #aa8153, 0 4px 0 #503c2a; }
.kingdom-screen .tower-board { position: relative; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; padding: 16px; background: repeating-linear-gradient(0deg,#a47548 0 30px,#986d43 31px 33px); border: 8px solid #66462e; border-radius: 5px; box-shadow: inset 0 0 0 2px #c29965; }
.kingdom-screen .tower-board-heading { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; padding-bottom: 12px; border-bottom: 2px dashed #edd4a8; }
.kingdom-screen .board-sign { padding: 7px 16px 9px; color: #23382f; background: #fff3d0; border: 2px solid #4b3425; box-shadow: 3px 4px 0 #4b3425; transform: rotate(-1deg); }
.kingdom-screen .board-sign .scene-kicker { color: #6b5847; }
.kingdom-screen .board-sign h3 { margin: 2px 0 0; color: #254937; font-size: 24px; }
.kingdom-screen .radio-station { display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; align-items: center; gap: 4px 10px; }
.kingdom-screen .radio-set { grid-row: span 2; width: 104px; height: auto; overflow: visible; filter: drop-shadow(2px 3px 0 #4b3425); }
.kingdom-screen .radio-waves { opacity: 0; }
.kingdom-screen .radio-tune { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 6px 13px; color: #23382f; background: #f2ba55; border: 2px solid #23382f; border-radius: 8px 10px 7px 9px; box-shadow: 0 3px 0 #4b3425; font: 800 .86rem Nunito,Trebuchet MS,sans-serif; cursor: pointer; }
.kingdom-screen .radio-tune svg { width: 18px; height: 18px; }
.kingdom-screen .radio-tune:hover:not(:disabled), .kingdom-screen .radio-tune:focus-visible { outline: 3px solid #fff3d0; outline-offset: 2px; }
.kingdom-screen .radio-tune:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #4b3425; }
.kingdom-screen .radio-tune:disabled { cursor: wait; background: #e8d3a3; }
.kingdom-screen .radio-tuning .radio-tune svg { animation: radio-spin .8s linear infinite; }
.kingdom-screen .radio-status { max-width: 30ch; color: #fff3d0; font-size: .8rem; font-weight: 700; }
.kingdom-screen .radio-tuning .radio-set { animation: radio-lift .65s ease-in-out infinite alternate; }
.kingdom-screen .radio-tuning .radio-needle { animation: radio-sweep .65s ease-in-out infinite alternate; }
.kingdom-screen .radio-tuning .radio-knob { transform-origin: 74px 64px; animation: radio-spin .65s linear infinite; }
.kingdom-screen .radio-tuning .radio-waves, .kingdom-screen .radio-fresh .radio-waves { animation: radio-waves .55s ease-out infinite; }
.kingdom-screen .radio-tuning .radio-lamp { fill: #f2ba55; animation: radio-blink .3s steps(2) infinite; }
.kingdom-screen .radio-fresh .radio-lamp { fill: #9be07a; filter: drop-shadow(0 0 3px #9be07a); }
.kingdom-screen .radio-static .radio-lamp { fill: #c4574f; }
.kingdom-screen .radio-fresh .radio-status { color: #dff5c8; }
@keyframes radio-lift { from { transform: translateY(0) rotate(0); } to { transform: translateY(-5px) rotate(-3deg); } }
@keyframes radio-sweep { from { transform: translateX(0); } to { transform: translateX(26px); } }
@keyframes radio-spin { to { transform: rotate(360deg); } }
@keyframes radio-waves { from { opacity: .9; } to { opacity: 0; } }
@keyframes radio-blink { 50% { opacity: .3; } }
.kingdom-screen .tower-filter-row { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 0; color: #fff3d0; }
.kingdom-screen .board-hint { font-size: .86rem; font-weight: 700; }
.kingdom-screen .info-note { position: relative; padding: 20px 14px 12px; color: #23382f; background: #e6eed6; border: 1px solid #5f6d58; box-shadow: 3px 4px 0 #493827; transform: rotate(.8deg); }
.kingdom-screen .info-note h4 { margin: 0 0 5px; color: #254937; font: 800 .74rem ui-monospace,monospace; letter-spacing: .07em; text-transform: uppercase; }
.kingdom-screen .info-note p { margin: 0 0 4px !important; font-size: .86rem; font-weight: 700; }
.kingdom-screen .info-note small { color: #5f6d58; font-weight: 800; }
.kingdom-screen .stash-note { background: #fff3d0; transform: rotate(-1.1deg); }
.kingdom-screen .steps-note { background: #e9e1f3; transform: rotate(-.4deg); }
.kingdom-screen .steps-note ol { margin: 0; padding-left: 18px; font-size: .84rem; font-weight: 700; line-height: 1.45; }
.kingdom-screen .tower-filter-row label { color: #fff3d0; }
.kingdom-screen .tower-filter-row label { display: flex; align-items: center; gap: 6px; font-weight: 800; }.kingdom-screen .tower-filter-row select { min-height: 34px; padding: 4px 7px; color: #23382f; background: #fff8e4; border: 2px solid #503c2a; border-radius: 5px; font: inherit; }
.kingdom-screen .pinned-notes { display: grid; flex: 1; min-height: 0; grid-template-columns: repeat(auto-fit,minmax(min(100%,260px),1fr)); align-content: start; gap: 12px; overflow: auto; padding: 7px 7px 14px; }
.kingdom-screen .empty-board-note { grid-column: 1/-1; align-self: center; max-width: 440px; margin: auto; padding: 24px; color: #493829; background: #fff4d5; border: 2px dashed #795738; box-shadow: 3px 4px #513b29; text-align: center; transform: rotate(-1deg); }
.kingdom-screen .tower-offer-desk { align-self: stretch; padding: 18px 15px; overflow: auto; background: repeating-linear-gradient(0deg,#fff8e4 0 29px,#e9d9b5 30px 31px); border: 2px solid #513b29; box-shadow: 3px 4px #513b29; }
.kingdom-screen .tower-offer-desk h3 { margin-top: 8px; font-size: 23px; }.kingdom-screen .tower-offer-desk > p { font-size: .88rem; }
.kingdom-screen .offer-paper { background: rgb(255 248 228 / 80%); }
.kingdom-screen .trade-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.kingdom-screen .trade-columns fieldset { display: grid; gap: 7px; margin: 0; padding: 10px; border: 1.5px solid #c5b58e; border-radius: 7px; }
.kingdom-screen .trade-columns legend { padding: 0 5px; font-weight: 900; }
.kingdom-screen .trade-columns label { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 700; }
.kingdom-screen .trade-columns input { width: 70px; min-height: 34px; padding: 4px 7px; color: #23382f; background: white; border: 1.5px solid #7a6545; border-radius: 5px; font: inherit; }
.kingdom-screen .trade-entry { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 8px; min-height: 132px; padding: 19px 12px 12px; color: #3c3229; background: #fff6dc; border: 1px solid #76573a; box-shadow: 3px 4px 0 #493827; transform: rotate(-.7deg); }
.kingdom-screen .trade-entry:nth-child(even) { background: #f8edcf; transform: rotate(.65deg); }.kingdom-screen .trade-entry.own { background: #e9edcf; }
.kingdom-screen .note-pin { position: absolute; top: 5px; left: 50%; width: 12px; height: 12px; background: #b95643; border: 2px solid #4d3827; border-radius: 50%; box-shadow: 1px 2px #493827; transform: translateX(-50%); }
.kingdom-screen .note-author { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 5px; font: 800 .78rem ui-monospace,monospace; text-transform: uppercase; }
.kingdom-screen .note-exchange { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 6px; }.kingdom-screen .note-exchange span { display: grid; gap: 3px; overflow-wrap: anywhere; font-weight: 800; font-size: .83rem; }.kingdom-screen .note-exchange small { color: #726047; font: 800 .58rem ui-monospace,monospace; letter-spacing: .08em; }.kingdom-screen .note-exchange > b { color: #8062a9; font-size: 1.2rem; }
.kingdom-screen .note-action { align-self: start; margin-top: auto; }
.kingdom-screen .offer-rules { padding: 8px; color: #594630; background: rgb(243 228 196 / 75%); border-left: 3px solid #a47b49; font-size: .8rem; }
.kingdom-screen .trade-state { color: #5f6d58; font-size: .88rem; }
.kingdom-screen .trade-error { padding: 8px 10px; color: #812e2d; background: #f8e3e1; border-radius: 6px; }
.kingdom-screen .text-button { color: #254937; background: transparent; border: 0; font: inherit; font-weight: 900; text-decoration: underline; cursor: pointer; }
.kingdom-screen .trade-confirm { position: sticky; bottom: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 9px; margin-top: 10px; padding: 12px; background: #f2ba55; border: 2px solid #23382f; border-radius: 8px; box-shadow: 0 4px 14px #23382f44; }
.kingdom-screen .trade-confirm p { flex: 1 1 100%; margin: 0; font-weight: 800; }
.kingdom-screen .trade-preview-values { display:grid; flex:1 1 100%; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:0; }
.kingdom-screen .trade-preview-values > div { padding:8px; background:#fff8e4; border:1px solid #9b8157; }
.kingdom-screen .trade-preview-values dt { color:#5f6d58; font:800 .62rem ui-monospace,monospace; text-transform:uppercase; }
.kingdom-screen .trade-preview-values dd { margin:3px 0 0; font-weight:800; }
.kingdom-screen .trade-pagination { display:flex; grid-column:1/-1; align-items:center; justify-content:space-between; gap:8px; padding:8px; color:#493827; background:#f1e2bd; border:1px dashed #76573a; font-size:.76rem; font-weight:800; }
.kingdom-screen .trade-create-confirm { margin:12px 0; padding:12px; color:#23382f; background:#fff8e4; border:2px solid #76573a; box-shadow:3px 3px #493827; }
.kingdom-screen .trade-create-confirm h4 { margin:0 0 8px; color:#315b45; font:800 .82rem ui-monospace,monospace; text-transform:uppercase; }
.kingdom-screen .trade-create-confirm p { max-width:none; margin:0 0 8px; font-size:.82rem; }

/* Library: a magical working archive. Furniture first, books as the controls. */
.kingdom-screen .library-feature { position: relative; display: flex; flex: 1; min-width: 0; min-height: 0; overflow: hidden; background: #3f2c1f; border: 3px solid #23382f; border-radius: 7px; }
.kingdom-screen .library-shelves { position: relative; display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; padding: 12px clamp(10px,1.4vw,22px) 16px; background: radial-gradient(ellipse at 50% 0%,rgb(242 186 85 / 16%),transparent 60%), linear-gradient(90deg,#4a3324,#5d412d 12%,#5d412d 88%,#4a3324); border: 10px solid #6b4a31; border-top-width: 14px; box-shadow: inset 0 0 0 2px #2e2016, inset 0 10px 18px rgb(0 0 0 / 30%); }
.kingdom-screen .shelf-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 18px; margin-bottom: 10px; }
.kingdom-screen .archive-plaque { padding: 6px 16px 8px; color: #23382f; background: linear-gradient(#e8c57c,#c99a4c); border: 2px solid #2e2016; border-radius: 4px 4px 10px 10px; box-shadow: 0 3px 0 #2e2016, inset 0 0 0 2px #f6dd9f; }
.kingdom-screen .archive-plaque .scene-kicker { color: #5a3d27; }
.kingdom-screen .archive-plaque h3 { margin: 2px 0 0; color: #23382f; }
.kingdom-screen .library-magic-note { max-width: 46ch; margin: 0 !important; color: #f6e7c4; font-size: .85rem; font-weight: 700; }
.kingdom-screen .bookcase { display: grid; flex: 1; min-height: 0; grid-template-rows: repeat(3,minmax(112px,1fr)); gap: 0; }
.kingdom-screen .shelf-row { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); min-width: 0; min-height: 0; background: linear-gradient(180deg,#2e2016 0,#3c2a1d 22%,#3c2a1d 100%); border-bottom: 12px solid #7a5534; box-shadow: inset 0 -3px 0 #2e2016, 0 3px 0 #a8774a; }
.kingdom-screen .shelf-bay { display: flex; min-width: 0; align-items: flex-end; justify-content: center; gap: 2px; padding: 8px 10px 0; overflow: hidden; }
.kingdom-screen .shelf-bay + .shelf-bay { border-left: 10px solid #6b4a31; box-shadow: inset 2px 0 0 #2e2016; }
.kingdom-screen .spine { display: block; flex: 0 0 auto; padding: 0; border: 2px solid #23382f; border-bottom: 0; border-radius: 3px 3px 0 0; }
.kingdom-screen .decorative-spine { width: var(--spine-w); height: var(--spine-h); background: linear-gradient(180deg,transparent 0 12%,rgb(35 56 47 / 35%) 12% 15%,transparent 15% 82%,rgb(35 56 47 / 35%) 82% 85%,transparent 85%), var(--book-color); box-shadow: inset 3px 0 rgb(255 255 255 / 14%), inset -3px 0 rgb(0 0 0 / 22%); filter: saturate(.72) brightness(.88); }
.kingdom-screen .decorative-spine.tilted { margin: 0 6px 0 4px; transform: rotate(-8deg); transform-origin: bottom right; }
.kingdom-screen .book-stack { display: flex; flex: 0 0 auto; flex-direction: column-reverse; align-items: center; margin: 0 8px; }
.kingdom-screen .book-stack i { display: block; width: 74px; height: 15px; margin-top: -2px; background: linear-gradient(90deg,transparent 0 8%,rgb(35 56 47 / 35%) 8% 11%,transparent 11%), var(--book-color); border: 2px solid #23382f; border-radius: 2px 4px 4px 2px; filter: saturate(.72) brightness(.88); }
.kingdom-screen .book-stack i:nth-child(2) { width: 66px; transform: translateX(4px); }
.kingdom-screen .book-stack i:nth-child(3) { width: 70px; transform: translateX(-3px); }
.kingdom-screen .hero-spine { position: relative; width: 36px; height: 100px; color: #fff3cf; background: linear-gradient(180deg,transparent 0 9%,#e8c57c 9% 12%,transparent 12% 88%,#e8c57c 88% 91%,transparent 91%), var(--book-color); box-shadow: inset 4px 0 rgb(255 255 255 / 20%), inset -4px 0 rgb(0 0 0 / 22%); cursor: pointer; transition: transform .14s ease; }
.kingdom-screen .hero-spine > span { display: block; max-height: 84px; margin: auto; overflow: hidden; font: 800 .64rem/1 Georgia,"Palatino Linotype",serif; letter-spacing: .02em; text-overflow: ellipsis; text-shadow: 0 1px #23382f; white-space: nowrap; writing-mode: vertical-rl; transform: rotate(180deg); }
.kingdom-screen .hero-spine::after { position: absolute; bottom: -9px; left: 9px; width: 6px; height: 14px; background: #d86f6b; border: 1px solid #23382f; clip-path: polygon(0 0,100% 0,100% 100%,50% 75%,0 100%); content: ''; }
.kingdom-screen .hero-spine:hover { transform: translateY(-6px); }
.kingdom-screen .hero-spine:focus-visible { outline: 3px solid #b9a3e3; outline-offset: 2px; transform: translateY(-6px); }
.kingdom-screen .hero-spine.selected { transform: translateY(-10px); }
.kingdom-screen .shelf-curio { flex: 0 0 auto; width: 74px; height: 90px; margin: 0 14px; }
.kingdom-screen .curio-portrait { width: 74px; height: 100px; align-self: center; }
.kingdom-screen .curio-skull, .kingdom-screen .curio-stones { width: 80px; height: 82px; }
.kingdom-screen .storybook-overlay { position: absolute; z-index: 8; inset: 0; display: grid; place-items: center; padding: clamp(10px,2vw,28px); overflow: auto; background: rgb(28 20 14 / 74%); }
.kingdom-screen .storybook-spread { position: relative; display: grid; width: min(1080px,100%); max-height: 100%; grid-template-columns: minmax(0,1fr) minmax(0,.86fr); overflow: auto; padding: 12px; background: #6b3f2a; border: 3px solid #23382f; border-radius: 10px 12px 10px 12px; box-shadow: 0 8px 0 #2e2016,0 18px 44px rgb(0 0 0 / 50%); }
.kingdom-screen .storybook-page { padding: clamp(16px,2.2vw,34px); background: #fff8e4 url('/hero-lab/assets/storybook-paper.svg'); background-size: 144px; }
.kingdom-screen .story-left { border-radius: 6px 0 0 6px; box-shadow: inset -22px 0 24px -18px rgb(80 55 30 / 55%); }
.kingdom-screen .story-right { display: flex; flex-direction: column; gap: 12px; border-radius: 0 6px 6px 0; box-shadow: inset 22px 0 24px -18px rgb(80 55 30 / 55%); }
.kingdom-screen .book-back { display: block; margin: 0 0 14px; padding: 4px 0; color: #254937; background: none; border: 0; font: 800 .85rem Nunito, sans-serif; text-decoration: underline; cursor: pointer; }
.kingdom-screen .book-back:focus-visible { outline: 3px solid #8062a9; outline-offset: 2px; }
.kingdom-screen .story-kicker { display: block; color: #6b5847; font: 800 .68rem ui-monospace,monospace; letter-spacing: .08em; text-transform: uppercase; }
.kingdom-screen .storybook-page .story-title { margin: 6px 0 4px; color: #254937; font-size: clamp(24px,2.4vw,32px); }
.kingdom-screen .hero-personality { color: #4a3d63; font: italic 700 1.02rem Georgia,serif; }
.kingdom-screen .storybook-page .story-copy { max-width: 60ch; font-size: 1.02rem; line-height: 1.65; }
.kingdom-screen .story-copy::first-letter { float: left; margin: 4px 8px 0 0; color: #8062a9; font: 700 3.1em/.8 Georgia,serif; }
.kingdom-screen .field-note { margin: 12px 0; padding: 8px 10px; background: #f3e4c4; border-left: 3px solid #8062a9; font-size: .88rem; }
.kingdom-screen .story-portrait { display: grid; justify-items: center; gap: 6px; margin: 0; }
.kingdom-screen .portrait-frame { display: grid; width: min(170px,100%); aspect-ratio: 5 / 6; place-items: center; overflow: hidden; background: radial-gradient(ellipse at 50% 88%,#8fa86f 0 18%,transparent 19%), linear-gradient(#cfe2e8,#eef3e6 70%); border: 8px solid #b98a3e; border-radius: 50% 50% 46% 46% / 40% 40% 36% 36%; box-shadow: 0 0 0 2px #23382f, inset 0 0 0 2px #23382f, 0 4px 0 #7a6545; }
.kingdom-screen .story-portrait figcaption { color: #57412f; font: 700 .95rem Georgia,serif; }
.kingdom-screen .hero-abilities { display: grid; gap: 6px; margin: 10px 0 0; }
.kingdom-screen .hero-abilities div { display: grid; grid-template-columns: 105px 1fr; gap: 8px; padding: 5px 8px; background: #f3e4c4; border-radius: 5px; }
.kingdom-screen .hero-abilities dt { color: #5f6d58; font-size: .76rem; font-weight: 900; }
.kingdom-screen .hero-abilities dd { margin: 0; font-weight: 800; }
.kingdom-screen .hero-book-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 12px 0 0; }
.kingdom-screen .hero-book-stats div { padding: 7px; background: #e8f0de; border-radius: 5px; }
.kingdom-screen .hero-book-stats dt { color: #5f6d58; font: 800 .62rem ui-monospace, monospace; text-transform: uppercase; }
.kingdom-screen .hero-book-stats dd { margin: 2px 0 0; font-weight: 900; }
/* Workshop: a friendly training gym that keeps its members' paperwork. */
.kingdom-screen .workshop-feature { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(240px,.62fr) minmax(0,1.38fr); gap: 16px; padding: 14px; overflow: hidden; background: repeating-linear-gradient(90deg,#9a7550 0 46px,#8d6a47 47px 48px); border: 3px solid #23382f; border-radius: 7px; box-shadow: inset 0 0 0 4px #b48c5f; }
.kingdom-screen .workshop-roster { position: relative; display: flex; flex-direction: column; min-height: 0; padding: 30px 12px 12px; background: #fbf2d8 url('/hero-lab/assets/storybook-paper.svg'); background-size: 144px; border: 2px solid #5a4632; border-top: 14px solid #7a5534; border-radius: 6px; box-shadow: 3px 4px 0 #4a3324; }
.kingdom-screen .clipboard-clip { position: absolute; top: -20px; left: 50%; width: 76px; height: 24px; background: linear-gradient(#d9dbd2,#a8aa9f); border: 2px solid #23382f; border-radius: 6px 6px 3px 3px; transform: translateX(-50%); }
.kingdom-screen .roster-title { margin: 0; color: #254937; font-size: 21px; text-align: center; }
.kingdom-screen .roster-sub { margin: 0 0 8px !important; color: #5f6d58; font: 800 .64rem ui-monospace,monospace; letter-spacing: .08em; text-align: center; text-transform: uppercase; }
.kingdom-screen .roster-list { display: flex; flex-direction: column; min-height: 0; overflow: auto; border-top: 2px solid #23382f; }
.kingdom-screen .workshop-hero { display: grid; flex: 0 0 auto; grid-template-columns: 24px 38px 1fr auto; grid-template-rows: auto auto; align-items: center; gap: 0 8px; min-height: 52px; padding: 5px 6px; color: #23382f; background: transparent; border: 0; border-bottom: 1px solid #c5b58e; text-align: left; cursor: pointer; }
.kingdom-screen .workshop-hero .member-no { grid-row: span 2; color: #8a7a5c; font: 800 .7rem ui-monospace,monospace; }
.kingdom-screen .workshop-hero .hero-icon { grid-row: span 2; justify-self: center; }
.kingdom-screen .workshop-hero b { grid-column: 3; grid-row: 1; align-self: end; font: 800 .9rem Nunito,sans-serif; }
.kingdom-screen .workshop-hero small { grid-column: 3; grid-row: 2; align-self: start; color: #5f6d58; font: 800 .6rem ui-monospace,monospace; text-transform: uppercase; }
.kingdom-screen .member-pass { grid-column: 4; grid-row: 1 / 3; padding: 2px 6px; color: #254937; border: 1.5px solid #254937; border-radius: 3px; font: 800 .58rem ui-monospace,monospace; font-style: normal; letter-spacing: .05em; text-transform: uppercase; transform: rotate(-4deg); }
.kingdom-screen .member-pass.guest { color: #7a6545; border-style: dashed; border-color: #7a6545; }
.kingdom-screen .workshop-hero:hover { background: rgb(220 235 200 / 45%); }
.kingdom-screen .workshop-hero.selected { background: #dcebc8; box-shadow: inset 4px 0 0 #254937; }
.kingdom-screen .workshop-hero:focus-visible { outline: 3px solid #8062a9; outline-offset: -3px; }
.kingdom-screen .workshop-detail { position: relative; display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: auto; padding: 18px 20px; background: #fbf2d8 url('/hero-lab/assets/storybook-paper.svg'); background-size: 144px; border: 2px solid #5a4632; border-radius: 4px; box-shadow: 3px 4px 0 #4a3324; }
.kingdom-screen .workshop-detail::before { position: absolute; top: -8px; left: 26px; width: 14px; height: 38px; border: 3px solid #8a8c82; border-radius: 8px; content: ''; }
.kingdom-screen .form-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 8px; border-bottom: 2px solid #23382f; }
.kingdom-screen .form-head h3 { margin: 2px 0 0; color: #254937; font-size: 26px; }
.kingdom-screen .form-stamp { display: grid; place-items: center; padding: 6px 10px; color: #4f7a3c; border: 3px double #4f7a3c; border-radius: 6px; font: 800 .62rem/1.15 ui-monospace,monospace; letter-spacing: .06em; text-align: center; text-transform: uppercase; opacity: .85; transform: rotate(-7deg); }
.kingdom-screen .form-body { display: grid; flex: 1; grid-template-columns: minmax(240px,1fr) minmax(260px,1.05fr); gap: 16px; align-items: stretch; }
.kingdom-screen .workshop-preview-stage { position: relative; min-height: 220px; background: #cfe2e8; overflow: hidden; border: 2px solid #23382f; border-radius: 4px; box-shadow: 2px 3px 0 #7a6545; }
.kingdom-screen .training-yard { position: absolute; inset: 0; width: 100%; height: 100%; }
.kingdom-screen .yard-hero { position: absolute; left: 40%; bottom: 10%; display: grid; place-items: end center; width: 45%; height: 72%; transform: translateX(-50%); }
.kingdom-screen .yard-hero .hero-icon { max-width: 100%; max-height: 100%; }
.kingdom-screen .form-fields { display: flex; flex-direction: column; gap: 8px; }
.kingdom-screen .form-sign { display: flex; align-items: flex-end; gap: 10px; margin-top: auto; padding-top: 10px; }
.kingdom-screen .form-sign span { color: #5f6d58; font: 800 .62rem ui-monospace,monospace; letter-spacing: .06em; text-transform: uppercase; }
.kingdom-screen .form-sign b { flex: 1; padding: 0 4px 2px; color: #315b45; border-bottom: 1.5px solid #23382f; font: italic 700 1.15rem Georgia,serif; transform: rotate(-2deg); }
.kingdom-screen .form-line { display: grid; grid-template-columns: 52px 1fr; gap: 8px; align-items: baseline; padding-bottom: 4px; border-bottom: 1px dashed #b9a57c; }
.kingdom-screen .form-line span { color: #5f6d58; font: 800 .62rem ui-monospace,monospace; letter-spacing: .06em; text-transform: uppercase; }
.kingdom-screen .form-line b { font-size: .9rem; }
.kingdom-screen .stat-hp { background: #e3efd6 !important; }.kingdom-screen .stat-atk { background: #f8e2d2 !important; }.kingdom-screen .stat-def { background: #dbeaf0 !important; }.kingdom-screen .stat-spd { background: #e9e1f3 !important; }
.kingdom-screen .form-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; margin-top: auto; padding-top: 10px; border-top: 1px dashed #9d8962; }
.kingdom-screen .form-foot .trial-start { margin-left: auto; }
.kingdom-screen .trial-note { flex: 1 1 320px; margin: 0 !important; color: #5f4a2e; font-size: .86rem; }
.kingdom-screen .trial-cooldowns { display: flex; flex-wrap: wrap; gap: 7px; margin: 8px 0; }
.kingdom-screen .trial-cooldowns div { display: flex; gap: 5px; padding: 4px 8px; background: #f3e4c4; border-radius: 99px; }
.kingdom-screen .trial-cooldowns dt { color: #5f6d58; font-size: .7rem; font-weight: 900; }
.kingdom-screen .trial-cooldowns dd { margin: 0; font-size: .75rem; font-weight: 900; }
.kingdom-screen .trial-talent { margin: 8px 0 0 !important; font-size: .86rem; }
.kingdom-screen .gym-roster { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; padding: 0; list-style: none; }
.kingdom-screen .gym-roster li { padding: 5px 11px; background: #fff8e4; border: 2px solid #23382f; border-radius: 999px 999px 999px 6px; font-weight: 800; }
.kingdom-screen .gym-roster li.empty { border-style: dashed; color: #5f4a2e; }
.kingdom-screen .castle-levels { display: grid; gap: 8px; margin: 0 0 14px; padding-left: 22px; line-height: 1.4; }
.kingdom-screen .castle-levels li.done { color: #254937; font-weight: 800; }
.kingdom-screen .castle-info-chip { align-self: center; min-height: 40px; padding: 7px 12px; color: #254937; background: #dcebc8; border: 2px solid #254937; border-radius: 9px; box-shadow: 0 3px #7a8d67; font: 900 .84rem Nunito,sans-serif; cursor: pointer; }
.kingdom-screen .castle-info-chip span { display: inline-grid; width: 19px; height: 19px; place-items: center; margin-right: 5px; color: #fff8e4; background: #8062a9; border-radius: 50%; }
.kingdom-screen .castle-info-chip:focus-visible, .kingdom-screen .castle-info-chip:hover { outline: 3px solid #f2ba55; outline-offset: 2px; }
.kingdom-screen .castle-info-card { position: absolute; z-index: 5; top: 88px; right: 62px; width: min(420px,calc(100% - 40px)); padding: 16px; background: #fff8e4 url('/hero-lab/assets/storybook-paper.svg') repeat; background-size: 144px; border: 3px solid #23382f; box-shadow: 0 5px #7a6545; }
.kingdom-screen .castle-info-card h3 { font: 700 20px Georgia,serif; }
.kingdom-screen .wardrobe-feature { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(0,3fr) minmax(220px,1fr); gap: 12px; padding: 12px; overflow: hidden; background: linear-gradient(145deg,#ead9b2,#d7c49a); border: 3px solid #57412f; box-shadow: inset 0 0 0 4px #a98256; }
.kingdom-screen .wardrobe-catalog { overflow: auto; padding: clamp(16px,2vw,30px); background: #fff8e4; border: 2px solid #9b8157; box-shadow: inset 0 0 0 4px #f1e6c7; }
.kingdom-screen .wardrobe-catalog h3 { margin-top: 10px; font-size: 25px; }
.kingdom-screen .wardrobe-catalog p { max-width: 640px; }
.kingdom-screen .wardrobe-swatches { justify-content: flex-start; max-width: 480px; margin: 20px 0; }
.kingdom-screen .wardrobe-current { color: #5f6d58; font-size: .85rem; }
/* Castle dressing room: wallpaper, wainscot, sconces and a standing mirror. */
.kingdom-screen .dressing-room { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; min-height: 0; overflow: hidden; padding: 18px 14px 22px; border: 2px solid #23382f; border-radius: 6px; }
.kingdom-screen .room-wall { position: absolute; inset: 0 0 18%; background: linear-gradient(180deg,transparent 0 70%,#7a5534 70% 71.5%,#a8774a 71.5% 100%), repeating-linear-gradient(90deg,transparent 0 22px,rgb(255 248 228 / 16%) 22px 24px), radial-gradient(circle at 50% 50%,rgb(242 186 85 / 22%) 0 3px,transparent 4px) 0 0 / 34px 34px, #6c4f7e; }
.kingdom-screen .room-wall::after { position: absolute; right: 0; bottom: 0; left: 0; height: 28.5%; background: repeating-linear-gradient(90deg,transparent 0 46px,#7a5534 46px 48px); content: ''; }
.kingdom-screen .room-floor { position: absolute; right: 0; bottom: 0; left: 0; height: 18%; background: repeating-linear-gradient(90deg,#8d6a47 0 38px,#7a5534 38px 40px); border-top: 3px solid #4a3324; }
.kingdom-screen .rug { position: absolute; bottom: 18%; left: 50%; width: 74%; height: 46%; background: #b9534c; border: 2px solid #23382f; border-radius: 50%; box-shadow: inset 0 0 0 5px #e8c57c, inset 0 0 0 7px #23382f; transform: translateX(-50%); }
.kingdom-screen .sconce { position: absolute; top: 20%; width: 14px; height: 34px; background: #c8963e; border: 2px solid #23382f; border-radius: 3px 3px 8px 8px; }
.kingdom-screen .sconce i { position: absolute; top: -18px; left: 50%; width: 12px; height: 18px; background: #f2ba55; border-radius: 50% 50% 40% 40%; box-shadow: 0 0 18px 8px rgb(242 186 85 / 35%); transform: translateX(-50%); animation: flame-glow 2.4s ease-in-out infinite; }
.kingdom-screen .sconce-left { left: 9%; }.kingdom-screen .sconce-right { right: 9%; }
.kingdom-screen .hat-stand { position: absolute; right: 6%; bottom: -48%; width: 6px; height: 86%; background: #5a3d27; border: 1.5px solid #23382f; }
.kingdom-screen .hat-stand i { position: absolute; top: 4%; width: 22px; height: 4px; background: #5a3d27; border: 1.5px solid #23382f; border-radius: 3px; }
.kingdom-screen .hat-stand i:nth-child(1) { left: -20px; transform: rotate(-20deg); }.kingdom-screen .hat-stand i:nth-child(2) { left: 2px; transform: rotate(20deg); }.kingdom-screen .hat-stand i:nth-child(3) { top: -2px; left: -9px; width: 24px; height: 12px; background: #3f4b5a; border-radius: 10px 10px 2px 2px; }
@keyframes flame-glow { 0%,100% { opacity: .85; } 50% { opacity: 1; } }
.kingdom-screen .castle-mirror { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; margin: 0; }
.kingdom-screen .mirror-frame { padding: 10px; background: linear-gradient(135deg,#e8c57c,#b98a3e 45%,#e8c57c 70%,#9a7030); border: 3px solid #23382f; border-radius: 50% 50% 10px 10px / 34% 34% 10px 10px; box-shadow: 0 6px 0 #4a3324, 0 12px 24px rgb(0 0 0 / 30%); }
.kingdom-screen .mirror-glass { position: relative; display: grid; width: clamp(150px,15vw,210px); aspect-ratio: 3 / 4.2; place-items: end center; overflow: hidden; padding-bottom: 10%; background: radial-gradient(ellipse at 50% 92%,rgb(35 56 47 / 25%) 0 22%,transparent 23%), linear-gradient(170deg,#e6eef0,#bfd2d8 55%,#a9bfc7); border: 2px solid #23382f; border-radius: 50% 50% 6px 6px / 30% 30% 6px 6px; box-shadow: inset 0 0 18px rgb(35 56 47 / 25%); }
.kingdom-screen .mirror-sheen { position: absolute; top: -10%; left: 16%; width: 18%; height: 130%; background: linear-gradient(90deg,transparent,rgb(255 255 255 / 45%),transparent); pointer-events: none; transform: rotate(18deg); }
.kingdom-screen .mirror-feet { width: 64%; height: 14px; background: #b98a3e; border: 3px solid #23382f; border-top: 0; border-radius: 0 0 10px 10px; }
.kingdom-screen .castle-mirror figcaption { display: grid; justify-items: center; gap: 2px; margin-top: 10px; padding: 5px 14px; color: #23382f; background: #fbf2d8; border: 2px solid #23382f; border-radius: 4px; box-shadow: 0 3px 0 #4a3324; font: 700 1rem Georgia,serif; }
.kingdom-screen .castle-mirror figcaption small { color: #5f6d58; font: 800 .62rem ui-monospace,monospace; letter-spacing: .05em; text-transform: uppercase; }
.kingdom-screen .wardrobe-avatar { position: relative; z-index: 1; width: 80%; aspect-ratio: 1; }
.kingdom-screen .wardrobe-avatar .avatar-preview { width: 100%; height: 100%; }
.kingdom-screen .wardrobe-tabs { display:flex; flex-wrap:wrap; gap:7px; margin:14px 0 12px; padding-bottom:9px; border-bottom:2px dashed #c5b58e; }
.kingdom-screen .wardrobe-tab { min-height:34px; padding:5px 13px; color:#493827; background:#f3e4c4; border:1.5px solid #9b8157; border-radius:5px 8px 5px 7px; font:800 .78rem Nunito,sans-serif; cursor:pointer; }
.kingdom-screen .wardrobe-tab[aria-pressed="true"] { color:#fff8e4; background:#315b45; border-color:#23382f; box-shadow:0 2px #23382f; }
.kingdom-screen .wardrobe-tab:focus-visible { outline:3px solid #8062a9; outline-offset:2px; }
.kingdom-screen .wardrobe-items { min-height:154px; margin:8px 0 12px; }
.kingdom-screen .wardrobe-items h4 { margin:0 0 9px; color:#57412f; font:800 .78rem ui-monospace,monospace; letter-spacing:.06em; text-transform:uppercase; }
.kingdom-screen .wardrobe-save { margin-top:4px; }
.kingdom-screen .wardrobe-title-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }.kingdom-screen .wardrobe-stamp { display:grid; width:56px; height:56px; place-items:center; color:#8062a9; border:2px double #8062a9; border-radius:50%; font:800 .53rem/1.1 ui-monospace,monospace; text-align:center; transform:rotate(9deg); }
.kingdom-screen .wardrobe-selection-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(200px,.8fr); gap:20px; margin:18px 0; }
.kingdom-screen .wardrobe-selection-grid h4 { margin:0 0 9px; color:#57412f; font:800 .78rem ui-monospace,monospace; letter-spacing:.06em; text-transform:uppercase; }
.kingdom-screen .hat-options { display:grid; grid-template-columns:repeat(auto-fill,minmax(112px,1fr)); align-items:stretch; gap:14px 10px; }
.kingdom-screen .hat-card { display:grid; min-width:0; grid-template-rows:1fr auto; gap:4px; }
.kingdom-screen .hat-option { display:grid; width:100%; min-width:0; min-height:108px; place-items:center; gap:4px; padding:10px 4px 7px; color:#493827; background:linear-gradient(#e9d6ad,#f3e4c4 40%); border:1px solid #9b8157; border-bottom:7px solid #7a5534; border-radius:6px 6px 2px 2px; box-shadow:inset 0 6px 10px rgb(90 61 39 / 18%); cursor:pointer; }
.kingdom-screen .hat-option:hover:not(:disabled) { background:linear-gradient(#efdfba,#fbf2d8 40%); }.kingdom-screen .hat-option:focus-visible { outline:3px solid #8062a9; outline-offset:2px; }
.kingdom-screen .hat-option small { max-width:100%; font-size:.62rem; font-weight:800; text-align:center; }.kingdom-screen .hat-option[aria-pressed="true"] { background:#dcebc8; outline:2px solid #254937; }
.kingdom-screen .hat-claim { min-height:29px; padding:3px; color:#254937; background:#e8f0de; border:1px solid #687553; border-radius:4px; font:800 .62rem Nunito,sans-serif; cursor:pointer; }
.kingdom-screen .hat-claim:disabled, .kingdom-screen .hat-option:disabled { cursor:wait; opacity:.65; }.kingdom-screen .hat-owned { min-height:29px; display:grid; place-items:center; color:#53654f; font:800 .6rem ui-monospace,monospace; text-align:center; }
.kingdom-screen .wardrobe-status { color:#53654f; font-size:.82rem; }.kingdom-screen .wardrobe-error { padding:8px 10px; color:#812e2d; background:#f8e3e1; border-left:3px solid #812e2d; font-size:.85rem; }
.kingdom-screen .wardrobe-purse { width:fit-content; padding:5px 9px; color:#254937; background:#e8f0de; border:1px solid #687553; font-size:.8rem; font-weight:900; }
.kingdom-screen .wardrobe-shortfall { display:grid; min-height:29px; align-content:center; color:#812e2d; font:800 .58rem/1.2 Nunito,sans-serif; text-align:center; }
.kingdom-screen .wardrobe-swatches { grid-template-columns:repeat(6,minmax(30px,38px)); gap:10px; margin:10px 0; }
.kingdom-screen .theme-garden .panel-head { border-bottom-color: #8062a9; }
.kingdom-screen .theme-tower .panel-level { color: #4a3d63; }

@media (prefers-reduced-motion: reduce) {
  .kingdom-screen .constellation circle, .kingdom-screen .lantern-glow, .kingdom-screen .sconce i, .kingdom-screen .radio-set, .kingdom-screen .radio-needle, .kingdom-screen .radio-knob, .kingdom-screen .radio-waves, .kingdom-screen .radio-lamp, .kingdom-screen .radio-tune svg { animation: none !important; }
  .kingdom-screen .hero-spine, .kingdom-screen .telescope-tube { transition: none; }
}

@media (max-width: 760px) {
  .kingdom-screen .town-controls-hud { display: none; }
  .kingdom-screen .tower-feature { grid-template-columns: minmax(0,2fr) minmax(230px,1fr); gap: 9px; padding: 9px; }
  .kingdom-screen .tower-board { padding: 11px; border-width: 6px; }
  .kingdom-screen .tower-offer-desk { padding: 12px 10px; }
  .kingdom-screen .workshop-feature { grid-template-columns: minmax(200px,.7fr) minmax(0,1.3fr); }
}
@media (max-width: 1180px) {
  .kingdom-screen .form-body { grid-template-columns: 1fr; }
  .kingdom-screen .workshop-preview-stage { max-width: 440px; min-height: 0; aspect-ratio: 400 / 260; }
}
@media (max-width: 600px) {
  .kingdom-screen .town-title-hud { top: 10px; left: 10px; right: auto; padding: 8px 10px; }
  .kingdom-screen .town-title { font-size: 17px; margin-bottom: 7px; }
  .kingdom-screen .town-title span:last-child { display: block; font-size: 14px; }
  .kingdom-screen .town-title-dot { display: none; }
  .kingdom-screen .town-list { top: 118px; left: 10px; }
  .kingdom-screen .town-level { top: 10px; right: 10px; padding: 6px 9px; font-size: .78rem; }
  .kingdom-screen .town-actions { left: 10px; right: 10px; bottom: 10px; flex-wrap: wrap; }
  .kingdom-screen .avatar-customize { bottom: 62px; left: 10px; padding: 18px; }
  .kingdom-screen .town-intro { bottom: 62px; padding: 14px 16px; }
  .kingdom-screen .town-intro h2 { font-size: 20px; }
  .kingdom-screen .town-modal { width: calc(100vw - 16px); height: calc(100svh - 16px); max-height: none; padding: 16px 12px; }
  .kingdom-screen .panel-title h2 { font-size: 24px; }
  .kingdom-screen .theme-tower .panel-content, .kingdom-screen .theme-workshop .panel-content, .kingdom-screen .theme-castle .panel-content, .kingdom-screen .theme-library .panel-content { overflow: auto; }
  .kingdom-screen .tower-feature { flex: 0 0 auto; grid-template-columns: 1fr; overflow: visible; }
  .kingdom-screen .tower-board { min-height: 420px; }
  .kingdom-screen .pinned-notes { grid-template-columns: 1fr; }
  .kingdom-screen .tower-offer-desk { min-height: 310px; }
  .kingdom-screen .trade-columns { grid-template-columns: 1fr; }
  .kingdom-screen .theme-library .panel-content, .kingdom-screen .theme-tower .panel-content, .kingdom-screen .theme-workshop .panel-content, .kingdom-screen .theme-castle .panel-content { display: block; }
  .kingdom-screen .constellation figcaption { display: none; }
  .kingdom-screen .library-feature { overflow: visible; }
  .kingdom-screen .library-shelves { min-height: 0; border-width: 7px; }
  .kingdom-screen .bookcase { grid-template-rows: none; }
  .kingdom-screen .shelf-row { grid-template-columns: minmax(0,1fr); }
  .kingdom-screen .decorative-spine.extra, .kingdom-screen .book-stack { display: none; }
  .kingdom-screen .shelf-bay { min-height: 116px; }
  .kingdom-screen .shelf-bay + .shelf-bay { border-top: 8px solid #6b4a31; border-left: 0; box-shadow: none; }
  .kingdom-screen .shelf-curio { width: 60px; height: 74px; margin: 0 8px; }
  .kingdom-screen .storybook-spread { grid-template-columns: 1fr; }
  .kingdom-screen .storybook-overlay { padding: 7px; }
  .kingdom-screen .storybook-page { min-height: 300px; }
  .kingdom-screen .story-right { border-top: 2px solid #c5b58e; border-left: 0; }
  .kingdom-screen .wardrobe-feature { flex: 0 0 auto; grid-template-columns: 1fr; overflow: visible; }
  .kingdom-screen .wardrobe-preview { min-height: 250px; }
  .kingdom-screen .wardrobe-selection-grid { grid-template-columns: 1fr; }
  .kingdom-screen .castle-info-card { top: 105px; right: 12px; }
  .kingdom-screen .theme-garden .garden-caption { right: 8px; bottom: 8px; left: 34%; width: auto; padding: 12px; }
  .kingdom-screen .theme-garden .garden-caption p { max-width: 56ch; }
  .kingdom-screen .workshop-feature { flex: 0 0 auto; grid-template-columns: 1fr; overflow: visible; }
  .kingdom-screen .workshop-roster { max-height: 300px; }
  .kingdom-screen .workshop-detail { overflow: visible; padding: 14px; }
  .kingdom-screen .theme-garden .telescope-button { left: 2%; width: 120px; }
  .kingdom-screen .dressing-room { min-height: 340px; }
  .kingdom-screen .hero-book-stats { grid-template-columns: repeat(2, 1fr); }
}
@media (pointer: coarse) {
  .kingdom-screen .town-controls-hud { display: flex; right: 10px; bottom: calc(74px + env(safe-area-inset-bottom)); left: 10px; justify-content: center; max-width: none; padding: 7px 10px; font-size: .75rem; text-align: center; }
  .kingdom-screen .town-controls-hud > span:not(.touch-controls-hint) { display: none; }
  .kingdom-screen .touch-controls-hint { display: inline; }
  .kingdom-screen .town-actions { bottom: max(10px, env(safe-area-inset-bottom)); }
  .kingdom-screen .town-actions .hud-btn { min-height: 44px; }
  .kingdom-screen .town-title-actions .hud-btn { min-height: 42px; }
  .kingdom-screen .town-modal-shade { padding: max(8px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(8px, env(safe-area-inset-left)); }
  .kingdom-screen .town-modal { width: 100%; height: 100%; max-height: 100%; }
}
@media (pointer: coarse) and (max-width: 600px) and (orientation: portrait) {
  .kingdom-screen .town-title-hud { top: max(8px, env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); padding: 7px 9px; }
  .kingdom-screen .town-title-hud .scene-kicker { font-size: .58rem; }
  .kingdom-screen .town-title { font-size: 16px; }
  .kingdom-screen .town-title span:last-child { display: none; }
  .kingdom-screen .town-level { top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right)); padding: 5px 8px; }
  .kingdom-screen .town-actions { right: max(8px, env(safe-area-inset-right)); left: max(8px, env(safe-area-inset-left)); justify-content: center; gap: 6px; }
  .kingdom-screen .town-actions .hud-btn { flex: 1 1 0; justify-content: center; padding: 6px 8px; font-size: .78rem; }
  .kingdom-screen .town-controls-hud { bottom: calc(68px + env(safe-area-inset-bottom)); }
  .kingdom-screen .town-list { top: 92px; left: max(8px, env(safe-area-inset-left)); width: min(290px, calc(100vw - 16px)); }
  .kingdom-screen .town-intro, .kingdom-screen .avatar-customize { bottom: calc(124px + env(safe-area-inset-bottom)); left: 8px; width: min(430px, calc(100vw - 16px)); max-height: calc(100svh - 150px); overflow: auto; }
}
@media (pointer: coarse) and (orientation: landscape) and (max-height: 520px) {
  .kingdom-screen .town-title-hud { top: max(6px, env(safe-area-inset-top)); left: max(8px, env(safe-area-inset-left)); padding: 6px 9px; }
  .kingdom-screen .town-title { margin-bottom: 5px; font-size: 16px; }
  .kingdom-screen .town-title-hud .scene-kicker { display: none; }
  .kingdom-screen .town-title-actions .hud-btn { min-height: 38px; }
  .kingdom-screen .town-level { top: max(8px, env(safe-area-inset-top)); right: max(8px, env(safe-area-inset-right)); }
  .kingdom-screen .town-actions { bottom: max(6px, env(safe-area-inset-bottom)); left: max(8px, env(safe-area-inset-left)); }
  .kingdom-screen .town-actions .hud-btn { min-height: 40px; }
  .kingdom-screen .town-controls-hud { right: max(8px, env(safe-area-inset-right)); bottom: max(8px, env(safe-area-inset-bottom)); left: auto; width: min(370px, 45vw); }
  .kingdom-screen .town-modal { padding: 12px; }
  .kingdom-screen .panel-head { padding-bottom: 8px; }
  .kingdom-screen .panel-title h2 { font-size: 23px; }
  .kingdom-screen .panel-purpose { margin: 8px 0; }
}
</style>
