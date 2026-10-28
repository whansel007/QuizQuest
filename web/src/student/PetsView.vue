<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { api, retryablePost } from '../api.js';
import { when } from '../ui.js';
import { store, loadHome, updateBalances } from './home.js';
import GachaMachine from './gacha/GachaMachine.vue';
import PrizeReveal from './gacha/PrizeReveal.vue';
import { HERO_TYPE_ICON, heroTypeLabel } from './hero-type.js';
import HeroIcon from './HeroIcon.vue';
import SummonSky from './SummonSky.vue';
import { GAME_CONFIG } from '../../../public/hero-lab/game-config.js';
import { playSound } from '../../../public/hero-lab/arena-audio.js';
import { SUMMON_SUMMARY_COLUMNS, SUMMON_SUMMARY_SLANT_DEG, SUMMON_SUMMARY_SOUND_INTERVAL_MS } from '../../../config/tuning.js';

const error = ref('');
const loading = ref(true);
const prize = ref(null);
const machineOpen = ref(false);
const machineBusy = ref(false);
const multiBusy = ref(false);
const batchResults = ref([]);
const summaryOpen = ref(false);
const revealedCards = ref([]);
const activeSummaryEggIndex = ref(null);
const batchPity = ref(null);
const summaryCoins = ref(0);
const debugPreview = ref(false);
const machineOpenFn = ref(null);
const machineOverlayRoot = ref(null);
const pullTenButton = ref(null);
const summaryRoot = ref(null);
const machine = ref(null);
const pullError = ref('');
const activeModal = ref('');
const modalRoot = ref(null);
const closeButton = ref(null);
const historyButton = ref(null);
const detailsButton = ref(null);
const historyData = ref(null);
const historyLedger = ref(null);
const historyPage = ref(1);
const historyKind = ref('summons');
const rarityFilter = ref('all');
const historyLoading = ref(false);
const historyError = ref('');
let alive = true;
let modalOpener = null;

const home = computed(() => store.home);
const inv = computed(() => home.value?.inventory);
const catalog = computed(() => home.value?.catalog);
const summonConfig = computed(() => catalog.value?.heroSummon);
const coinBalance = computed(() => home.value?.wallet?.balance || 0);
const pullCost = computed(() => summonConfig.value?.pullCost || 0);
const multiDiscount = computed(() => summonConfig.value?.multiDiscount ?? 0);
const tenPullCost = computed(() => Math.floor(pullCost.value * 10 * (1 - multiDiscount.value)));
const resources = computed(() => catalog.value?.resources || {});
const rarityStars = (hero) => GAME_CONFIG.arenaTuning.gachaReveal.rarityStars[hero.rarity] || 3;
const orderedHeroes = computed(() => {
  if (!catalog.value || !summonConfig.value) return [];
  const order = new Map((summonConfig.value.bannerOrder || []).map((id, index) => [id, index]));
  return [...catalog.value.heroes].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
});
const highestStarCount = computed(() => Math.max(0, ...orderedHeroes.value.map(rarityStars)));
const featuredHeroes = computed(() => orderedHeroes.value.filter((hero) => rarityStars(hero) === highestStarCount.value));
const otherHeroes = computed(() => orderedHeroes.value.filter((hero) => rarityStars(hero) < highestStarCount.value));
const oddsRows = computed(() => {
  if (!summonConfig.value) return [];
  const odds = summonConfig.value.odds;
  const total = Object.values(odds).reduce((sum, value) => sum + value, 0);
  return Object.entries(odds).map(([rarity, weight]) => ({
    rarity,
    stars: GAME_CONFIG.arenaTuning.gachaReveal.rarityStars[rarity] || 3,
    percent: Math.round(weight * 100 / total),
    heroes: catalog.value.heroes.filter((hero) => hero.rarity === rarity),
  }));
});
const rarityFilters = [
  { id: 'all', label: 'All' },
  { id: 'epic', label: GAME_CONFIG.arenaTuning.gachaReveal.rarityStars.epic + '-star' },
  { id: 'rare', label: GAME_CONFIG.arenaTuning.gachaReveal.rarityStars.rare + '-star' },
  { id: 'common', label: GAME_CONFIG.arenaTuning.gachaReveal.rarityStars.common + '-star' },
];
const activeHistoryRows = computed(() => {
  const rows = historyData.value?.items || [];
  return rarityFilter.value === 'all' ? rows : rows.filter((row) => row.rarity === rarityFilter.value);
});
const summary = computed(() => historyData.value?.summary || { totalPulls: 0, common: 0, rare: 0, epic: 0 });
const summon = retryablePost('/api/student/hero-summon');
const summonTen = retryablePost('/api/student/hero-summon', { count: 10 });
const summaryColumns = SUMMON_SUMMARY_COLUMNS;
const summarySlant = SUMMON_SUMMARY_SLANT_DEG;
let lastRareSoundAt = 0;

async function pull() {
  const result = await summon();
  if (alive && home.value) {
    home.value.inventory = result.inventory;
    updateBalances({ wallet: result.wallet });
  }
  return result;
}
function showPrize(result) { if (alive && !multiBusy.value) prize.value = result; }

async function beginPull() {
  if (machineBusy.value || multiBusy.value || coinBalance.value < pullCost.value || !pullCost.value) return;
  machineBusy.value = true;
  pullError.value = '';
  machineOpen.value = true;
  machineOpenFn.value = pull;
  await nextTick();
  try {
    await machine.value?.turn();
  } catch (err) {
    pullError.value = err.message || 'The summon could not be completed. Please try again.';
  } finally {
    machineOpen.value = false;
    machineBusy.value = false;
  }
}
function resultRarityStars(row) { return GAME_CONFIG.arenaTuning.gachaReveal.rarityStars[row.rarity] || 3; }
function resultAsLegacy(row, pity) {
  return { prize: row.type === 'hero' ? { kind: 'hero', rarity: row.rarity, hero: row.hero } : { kind: 'resource', rarity: row.rarity, resource: row.resource, amount: row.amount }, pity: row.pity || pity, duplicateHero: row.type === 'hero' && !row.isNew, refund: row.refundCoins || 0 };
}
async function beginTenPull() {
  if (machineBusy.value || multiBusy.value || coinBalance.value < tenPullCost.value || !tenPullCost.value) return;
  machineBusy.value = true; multiBusy.value = true; activeSummaryEggIndex.value = null; revealedCards.value = []; pullError.value = '';
  try {
    const response = await summonTen();
    batchPity.value = response.pity;
    batchResults.value = response.results.map((row) => ({ ...row, hero: row.hero || catalog.value.heroes.find((hero) => hero.id === row.heroId) }));
    summaryCoins.value = batchResults.value.reduce((sum, row) => sum + (row.refundCoins || 0), 0);
    debugPreview.value = Boolean(response.debugPreview);
    if (alive && home.value) { home.value.inventory = response.inventory; updateBalances({ wallet: response.wallet }); }
    const machinePrize = batchResults.value[0];
    machineOpen.value = true;
    machineOpenFn.value = () => Promise.resolve(resultAsLegacy(machinePrize, response.pity));
    await nextTick();
    machineOverlayRoot.value?.focus();
    await machine.value?.turn();
    if (!alive || summaryOpen.value || prize.value) return;
    startBatchReveal(0);
  } catch (err) { pullError.value = err.message || 'The ten-pull could not be completed. Please try again.'; }
  finally { machineOpen.value = false; machineBusy.value = false; if (!summaryOpen.value && !prize.value) multiBusy.value = false; }
}
function openSummary() {
  machineOpen.value = false; prize.value = null; activeSummaryEggIndex.value = null;
  summaryOpen.value = true;
  revealedCards.value = batchResults.value.map((_, index) => index);
  nextTick(() => summaryRoot.value?.focus());
}
function isCardRevealed(index) { return revealedCards.value.includes(index); }
function startBatchReveal(index) {
  if (index >= batchResults.value.length) { openSummary(); return; }
  const row = batchResults.value[index]; const time = performance.now();
  if (row?.type === 'hero' && resultRarityStars(row) >= 4 && time - lastRareSoundAt >= SUMMON_SUMMARY_SOUND_INTERVAL_MS) { lastRareSoundAt = time; try { playSound('cardPick'); } catch { /* optional audio */ } }
  activeSummaryEggIndex.value = index;
  const rarity = row.type === 'hero' ? row.rarity : 'common';
  const eggColour = rarity === 'epic' ? '#F2BA55' : rarity === 'rare' ? '#89B9DF' : '#E9E4CF';
  prize.value = { ...resultAsLegacy(row, batchPity.value), eggColour };
}
async function closeSummary() {
  summaryOpen.value = false; multiBusy.value = false; debugPreview.value = false;
  if (historyData.value) await loadHistoryPage(historyPage.value);
  if (historyLedger.value) { try { historyLedger.value = await api('GET', '/api/student/ledger'); } catch { /* keep loaded ledger */ } }
  await nextTick(); pullTenButton.value?.focus();
}
function summaryKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); closeSummary(); }
  if (event.key === 'Enter' && !event.target.closest('button')) { event.preventDefault(); closeSummary(); }
  if (event.key === 'Tab') {
    const controls = [...summaryRoot.value.querySelectorAll('button:not(:disabled)')];
    if (!controls.length) return;
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus(); }
    else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
  }
}
function skipMachine() { if (multiBusy.value && machineOpen.value) { machineOpen.value = false; startBatchReveal(0); } }
async function loadHistoryPage(page = 1) {
  historyLoading.value = true;
  historyError.value = '';
  try {
    const [summons, ledger] = await Promise.all([
      api('GET', '/api/student/hero-summon/history?page=' + encodeURIComponent(page)),
      historyLedger.value ? Promise.resolve(historyLedger.value) : api('GET', '/api/student/ledger'),
    ]);
    if (!alive) return;
    historyData.value = summons;
    historyLedger.value = ledger;
    historyPage.value = summons.page;
  } catch (err) {
    if (alive) historyError.value = err.message || 'History could not be loaded.';
  } finally { if (alive) historyLoading.value = false; }
}
async function openModal(kind, event) {
  modalOpener = event.currentTarget;
  activeModal.value = kind;
  if (kind === 'history' && !historyData.value) await loadHistoryPage(1);
  await nextTick();
  closeButton.value?.focus();
}
function closeModal() {
  activeModal.value = '';
  nextTick(() => modalOpener?.focus?.());
}
function onModalKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
  if (event.key !== 'Tab') return;
  const controls = [...modalRoot.value.querySelectorAll('button:not(:disabled), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
async function closePrize() {
  if (multiBusy.value && activeSummaryEggIndex.value !== null) {
    const finishedIndex = activeSummaryEggIndex.value;
    if (!isCardRevealed(finishedIndex)) revealedCards.value = [...revealedCards.value, finishedIndex];
    const nextIndex = finishedIndex + 1;
    if (nextIndex < batchResults.value.length) {
      startBatchReveal(nextIndex);
      return;
    }
    activeSummaryEggIndex.value = null;
    openSummary();
    return;
  }
  prize.value = null;
  if (multiBusy.value) {
    openSummary();
    return;
  }
  if (historyData.value) await loadHistoryPage(historyPage.value);
  if (historyLedger.value) {
    try { historyLedger.value = await api('GET', '/api/student/ledger'); } catch { /* keep the loaded history */ }
  }
}
function historyResource(row) { return resources.value[row.resource] || { name: row.resource, emoji: '✨' }; }
function resultName(row) {
  if (row.type === 'hero') return row.hero?.name || 'Hero';
  if (row.type === 'resource') return historyResource(row).name;
  return 'Summon record';
}
function timeLabel(at) { return when(at); }

onMounted(async () => {
  try { await loadHome(); }
  catch (err) { if (alive) error.value = err.message; }
  finally { if (alive) loading.value = false; }
});
onUnmounted(() => {
  alive = false;
  document.body.style.overflow = '';
});
</script>

<template>
  <div class="summon-page">
    <SummonSky />
    <p v-if="error" class="summon-error" role="alert">{{ error }}</p>
    <template v-else>
      <header class="summon-topbar">
        <div class="summon-page-title"><span aria-hidden="true">✦</span><h1>Summon</h1></div>
        <div v-if="home" class="summon-wallet" :title="'Your coin balance: ' + coinBalance"><span aria-hidden="true">🪙</span><strong>{{ coinBalance }}</strong></div>
      </header>

      <div class="summon-content">
        <section v-if="!loading && catalog" class="summon-banner" aria-labelledby="banner-title">
          <div class="banner-heading">
            <div class="banner-kicker">A TALE IN THE MAKING</div>
            <h2 id="banner-title">{{ summonConfig.bannerTitle }}</h2>
            <p>{{ summonConfig.bannerSubtitle }}</p>
          </div>

          <div class="featured-row" :class="{ 'featured-many': featuredHeroes.length > 3 }">
        <article v-for="hero in featuredHeroes" :key="hero.id" class="featured-hero">
              <div class="featured-art"><HeroIcon :hero="hero" :size="200" animated /></div>
              <div class="featured-info">
                <h3>{{ hero.name }}</h3>
                <div class="hero-type"><span aria-hidden="true">{{ HERO_TYPE_ICON[String(hero.type).toLowerCase()] }}</span>{{ heroTypeLabel(hero.type) }}</div>
                <div class="hero-stars" :aria-label="rarityStars(hero) + ' stars'">{{ '★'.repeat(rarityStars(hero)) }}</div>
                <div class="hero-talent"><span class="talent-label">SPECIAL TALENT</span><strong>{{ hero.talent?.name || 'Hero talent' }}</strong></div>
              </div>
            </article>
          </div>

          <div v-if="otherHeroes.length" class="roster-strip" aria-label="Other summon heroes">
            <article v-for="hero in otherHeroes" :key="hero.id" class="roster-hero">
              <HeroIcon :hero="hero" :size="54" />
              <div class="roster-info"><strong>{{ hero.name }}</strong><span><span aria-hidden="true">{{ HERO_TYPE_ICON[String(hero.type).toLowerCase()] }}</span> {{ heroTypeLabel(hero.type) }}</span></div>
              <span class="roster-stars" :aria-label="rarityStars(hero) + ' stars'">{{ '★'.repeat(rarityStars(hero)) }}</span>
            </article>
          </div>
        </section>
        <div v-else-if="loading" class="summon-loading" role="status">Turning the pages…</div>
      </div>

      <footer class="summon-bottom-bar">
        <div class="summon-secondary-actions">
          <button ref="historyButton" type="button" class="story-button ghost-button" @click="openModal('history', $event)">History</button>
          <button v-if="summonConfig?.showDetails" ref="detailsButton" type="button" class="story-button ghost-button" @click="openModal('details', $event)">Details</button>
        </div>
        <div class="summon-actions">
          <button type="button" class="story-button pull-one" :disabled="machineBusy || multiBusy || coinBalance < pullCost" :title="coinBalance < pullCost ? 'Need ' + (pullCost - coinBalance) + ' more coins' : 'Summon one hero or resource'" @click="beginPull">
            <span>Summon ×1</span><small>🪙 {{ pullCost }}</small>
          </button>
          <button ref="pullTenButton" type="button" class="story-button pull-ten" :disabled="machineBusy || multiBusy || coinBalance < tenPullCost" :title="coinBalance < tenPullCost ? 'Need ' + (tenPullCost - coinBalance) + ' more coins' : 'Summon ten heroes or resources'" @click="beginTenPull">
            <span>Summon ×10</span><small>🪙 {{ tenPullCost }}</small>
          </button>
        </div>
      </footer>

      <div v-if="pullError" class="summon-toast" role="alert">
        <span>{{ pullError }}</span><button type="button" aria-label="Dismiss message" @click="pullError = ''">×</button>
      </div>

      <div v-if="machineOpen" ref="machineOverlayRoot" class="machine-overlay" role="presentation" tabindex="0" @keydown.esc.prevent="skipMachine" @click.self="skipMachine">
        <section class="machine-overlay-card" aria-label="Summon animation" @click="skipMachine">
          <GachaMachine ref="machine" :cost="pullCost" :disabled="machineBusy" :button-visible="false" :open="machineOpenFn || pull" @prize="showPrize" />
          <button v-if="multiBusy" type="button" class="story-button machine-skip" @click.stop="skipMachine">Skip machine</button>
        </section>
      </div>

      <div v-if="activeModal" class="story-modal-shade" @click.self="closeModal">
        <section ref="modalRoot" class="story-modal" role="dialog" aria-modal="true" :aria-labelledby="'modal-' + activeModal + '-title'" tabindex="-1" @keydown="onModalKeydown">
          <header class="story-modal-header">
            <div><p class="modal-kicker">THE SUMMONER'S JOURNAL</p><h2 :id="'modal-' + activeModal + '-title'">{{ activeModal === 'history' ? 'Summon History' : 'Summon Details' }}</h2></div>
            <button ref="closeButton" type="button" class="modal-close" aria-label="Close" @click="closeModal">×</button>
          </header>

          <template v-if="activeModal === 'details'">
            <div class="detail-rates">
              <article v-for="row in oddsRows" :key="row.rarity" class="detail-rate" :class="'rarity-' + row.rarity">
                <span class="detail-stars">{{ '★'.repeat(row.stars) }}</span><strong>{{ row.percent }}%</strong>
                <span>{{ row.rarity === 'common' ? 'Kingdom resources' : row.stars + '-star heroes' }}</span>
              </article>
            </div>
            <p class="detail-copy">Each summon costs {{ pullCost }} coins. A common result adds {{ summonConfig.commonResourceAmount }} units of one kingdom resource.</p>
            <div class="detail-rules">
              <p>The {{ summonConfig.heroPityPulls }}th pull without a hero guarantees at least a 4-star hero. That counter resets whenever a hero appears.</p>
              <p>The {{ summonConfig.epicPityPulls }}th pull without a 5-star guarantees a 5-star hero. A 5-star guarantee takes priority and resets both counters.</p>
              <p>A duplicate hero converts to {{ Math.floor(pullCost * summonConfig.duplicateRefundFraction) }} coins.</p>
            </div>
          </template>

          <template v-else>
            <div v-if="historyData" class="history-summary">
              <div><strong>{{ summary.totalPulls }}</strong><span>total pulls</span></div>
              <div><strong>{{ summary.common }}</strong><span>{{ GAME_CONFIG.arenaTuning.gachaReveal.rarityStars.common }}-star results</span></div>
              <div><strong>{{ summary.rare }}</strong><span>{{ GAME_CONFIG.arenaTuning.gachaReveal.rarityStars.rare }}-star results</span></div>
              <div><strong>{{ summary.epic }}</strong><span>{{ GAME_CONFIG.arenaTuning.gachaReveal.rarityStars.epic }}-star results</span></div>
              <p v-if="inv?.heroPity">Since your last 4-star: {{ inv.heroPity.sinceHero }} pulls · Since your last 5-star: {{ inv.heroPity.sinceEpic }} pulls</p>
            </div>

            <div class="history-tabs" role="group" aria-label="History type">
              <button v-for="kind in [['summons', 'Summons'], ['coins', 'Coins'], ['resources', 'Resources']]" :key="kind[0]" type="button" :aria-pressed="historyKind === kind[0]" @click="historyKind = kind[0]">{{ kind[1] }}</button>
            </div>

            <div v-if="historyLoading" class="history-state" role="status">Opening the journal…</div>
            <div v-else-if="historyError" class="history-state error-state" role="alert">{{ historyError }} <button type="button" class="story-button ghost-button" @click="loadHistoryPage(historyPage)">Try again</button></div>
            <template v-else-if="historyKind === 'summons'">
              <div class="rarity-filters" role="group" aria-label="Filter summon rarity">
                <button v-for="filter in rarityFilters" :key="filter.id" type="button" :aria-pressed="rarityFilter === filter.id" @click="rarityFilter = filter.id">{{ filter.label }}</button>
              </div>
              <div v-if="!historyData?.total" class="empty-history"><span aria-hidden="true">😽</span><p>No summons yet. Your results will appear here.</p></div>
              <div v-else-if="!activeHistoryRows.length" class="history-state">No results of that rarity on this page.</div>
              <ol v-else class="summon-history-list">
                <li v-for="(row, index) in activeHistoryRows" :key="row.id" class="summon-history-row" :class="['rarity-' + row.rarity, { 'batch-start': row.batchId && (row.rollIndex === 1 || (index > 0 && activeHistoryRows[index - 1].batchId !== row.batchId)) }]" :data-batch="row.batchId">
                  <time class="history-time">{{ timeLabel(row.at) }}</time>
                  <HeroIcon v-if="row.type === 'hero' && row.hero" :hero="row.hero" :size="44" />
                  <span v-else class="history-resource" aria-hidden="true">{{ row.type === 'resource' ? historyResource(row).emoji : '🐱' }}</span>
                  <div class="history-result"><strong>{{ resultName(row) }}</strong><span v-if="row.type === 'resource'">× {{ row.amount }}</span><span v-else-if="row.type === 'hero'" class="history-stars">{{ '★'.repeat(GAME_CONFIG.arenaTuning.gachaReveal.rarityStars[row.rarity] || 3) }}</span><span v-else>Older result details unavailable</span></div>
                  <span v-if="row.isNew" class="result-tag new-tag">NEW</span>
                  <span v-else-if="row.duplicate" class="result-tag duplicate-tag">Duplicate (+{{ row.refundCoins }} coins)</span>
                </li>
              </ol>
              <nav v-if="historyData?.totalPages > 1" class="history-pagination" aria-label="Summon history pages">
                <button type="button" class="story-button ghost-button" :disabled="historyPage <= 1 || historyLoading" @click="loadHistoryPage(historyPage - 1)">Previous</button>
                <span>Page {{ historyPage }} of {{ historyData.totalPages }}</span>
                <button type="button" class="story-button ghost-button" :disabled="historyPage >= historyData.totalPages || historyLoading" @click="loadHistoryPage(historyPage + 1)">Next</button>
              </nav>
            </template>
            <div v-else-if="historyLedger" class="ledger-history">
              <template v-if="historyKind === 'coins'">
                <p v-if="!historyLedger.coins.length" class="history-state">No coin history yet.</p>
                <ol v-else><li v-for="entry in historyLedger.coins" :key="entry.id"><time>{{ timeLabel(entry.at) }}</time><span>{{ entry.reason }}</span><strong>{{ entry.amount > 0 ? '+' : '' }}{{ entry.amount }} 🪙</strong></li></ol>
              </template>
              <template v-else>
                <p v-if="!historyLedger.resources.length" class="history-state">No resource history yet.</p>
                <ol v-else><li v-for="entry in historyLedger.resources" :key="entry.id"><time>{{ timeLabel(entry.at) }}</time><span>{{ entry.reason }}</span><strong>{{ Object.entries(entry.delta).map(([key, value]) => (value > 0 ? '+' : '') + value + ' ' + (resources[key]?.emoji || key)).join(' ') }}</strong></li></ol>
              </template>
            </div>
          </template>
        </section>
      </div>
      <PrizeReveal v-if="prize" :result="prize" :resources="resources" :click-to-continue="multiBusy && activeSummaryEggIndex !== null" @close="closePrize" />
      <div v-if="summaryOpen" ref="summaryRoot" class="summon-summary-shade" role="dialog" aria-modal="true" aria-labelledby="summary-title" tabindex="0" @keydown="summaryKeydown">
        <section class="summon-summary-panel">
          <header class="summary-header"><div><p class="modal-kicker">THE ADVENTURER'S NOTES</p><h2 id="summary-title">{{ debugPreview ? 'Preview the haul' : 'Your ten discoveries' }}</h2></div><button type="button" class="modal-close" aria-label="Close results" @click.stop="closeSummary">×</button></header>
          <p class="summary-instruction">All ten discoveries are revealed and added to your traveling tale.</p>
          <div class="summary-grid" :style="{ '--summary-columns': summaryColumns, '--summary-slant': summarySlant + 'deg' }">
            <article v-for="(row, index) in batchResults" :key="row.rollIndex || index" class="summary-card" :class="'rarity-' + row.rarity" :style="{ '--card-index': index }">
              <span class="summary-roll">{{ index + 1 }}</span>
              <HeroIcon v-if="row.type === 'hero' && row.hero" :hero="row.hero" :size="96" />
              <span v-else class="summary-resource" aria-hidden="true">{{ historyResource(row).emoji }}<small>×{{ row.amount }}</small></span>
              <strong class="summary-name">{{ row.type === 'hero' ? row.hero?.name || 'Hero' : historyResource(row).name }}</strong>
              <span v-if="row.type === 'hero'" class="summary-stars">{{ '★'.repeat(resultRarityStars(row)) }}</span>
              <span v-if="row.isNew" class="summary-status new-tag">NEW</span>
              <span v-else-if="row.type === 'hero'" class="summary-status duplicate-tag">Converted to 🪙 {{ row.refundCoins }}</span>
            </article>
          </div>
          <p v-if="summaryCoins > 0" class="summary-refunds">Coins refunded: <strong>🪙 {{ summaryCoins }}</strong></p>
          <footer class="summary-footer"><button type="button" class="story-button pull-one" @click="closeSummary">OK</button></footer>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.summon-page { position:fixed; z-index:1; inset:0; display:grid; grid-template-rows:64px minmax(0,1fr) 76px; padding:0 clamp(14px,2vw,30px); overflow:hidden; color:#FBF2D8; font-family:Nunito,Trebuchet MS,system-ui,sans-serif; }
.summon-topbar,.summon-content,.summon-bottom-bar,.summon-error,.summon-toast,.machine-overlay,.story-modal-shade { position:relative; z-index:1; }
.summon-topbar { display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid rgb(251 242 216 / 22%); }
.summon-page-title { display:flex; align-items:center; gap:10px; }
.summon-page-title>span { color:#F2BA55; font-size:25px; }
.summon-page-title h1 { margin:0; color:#FBF2D8; font:700 29px/1 Georgia,'Palatino Linotype',serif; }
.summon-wallet { display:flex; align-items:center; gap:8px; padding:7px 15px; color:#23382F; background:#FBF2D8; border:2px solid #23382F; border-radius:9px 12px 8px 11px; box-shadow:0 3px 0 #7A6545; }
.summon-wallet span { font-size:18px; }.summon-wallet strong { font-size:17px; }
.summon-content { display:grid; place-items:center; min-height:0; padding:10px 0; }
.summon-banner { width:min(1540px,100%); max-height:calc(100svh - 150px); min-height:min(68svh,calc(100svh - 170px)); display:grid; grid-template-rows:auto minmax(0,1fr) auto; gap:clamp(12px,1.8vh,20px); padding:clamp(16px,2.5vh,30px) clamp(16px,2.3vw,34px); color:#23382F; background-color:#FBF2D8; background-image:url('/hero-lab/assets/storybook-paper.svg'); background-size:144px 144px; border:3px solid #23382F; border-radius:15px 12px 16px 13px; box-shadow:0 7px 0 rgb(20 39 30 / 60%),0 16px 34px rgb(8 24 19 / 24%); }
.banner-heading { text-align:center; }.banner-kicker,.modal-kicker { margin:0 0 3px; color:#687553; font:700 10px/1.3 ui-monospace,'Cascadia Code',monospace; letter-spacing:.15em; }
.banner-heading h2 { margin:0; color:#254937; font:700 clamp(27px,3vw,35px)/1.05 Georgia,'Palatino Linotype',serif; }
.banner-heading p { margin:5px 0 0; color:#53654f; font-size:14px; }
.featured-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(390px,100%),1fr)); gap:12px; min-height:0; }
.featured-row.featured-many { grid-template-columns:repeat(auto-fit,minmax(0,1fr)); }
.featured-many .featured-hero { gap:7px; padding:7px; }.featured-many .featured-art { flex-basis:86px; }.featured-many .featured-art :deep(canvas) { width:86px!important; height:auto!important; }.featured-many .featured-info h3 { font-size:21px; }
.featured-hero { min-width:0; min-height:clamp(280px,37svh,390px); display:flex; align-items:center; justify-content:center; gap:clamp(18px,2.2vw,34px); padding:18px 24px; position:relative; background:rgb(255 248 228 / 75%); border:4px double #B58324; border-radius:12px 9px 13px 10px; box-shadow:0 4px 0 #7A6545; }
.featured-art { display:grid; place-items:center; flex:0 0 clamp(175px,15vw,230px); min-width:0; }
.featured-art :deep(canvas) { display:block; max-width:100%; }
.featured-info { flex:1; min-width:0; }
.featured-info h3 { margin:0 0 8px; color:#254937; font:700 clamp(34px,3.5vw,48px)/1.05 Georgia,'Palatino Linotype',serif; }
.hero-type { color:#53654f; font-weight:800; font-size:14px; }.hero-type span { margin-right:5px; color:#8062A9; }
.hero-stars { margin:8px 0 12px; color:#C38B25; font-size:22px; letter-spacing:3px; }
.hero-talent { display:grid; gap:3px; color:#304638; font-size:16px; }.talent-label { color:#687553; font:700 10px ui-monospace,'Cascadia Code',monospace; letter-spacing:.1em; }
.roster-strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:8px; }
.roster-hero { min-width:0; display:flex; align-items:center; gap:8px; padding:8px 10px; min-height:92px; background:#E8F0DE; border:2px solid #5D8DB0; border-radius:9px 7px 10px 8px; box-shadow:0 3px 0 #7A6545; }
.roster-hero :deep(canvas) { flex:0 0 auto; display:block; }.roster-info { display:grid; min-width:0; }.roster-info strong { color:#254937; font:700 14px/1.2 Georgia,'Palatino Linotype',serif; }.roster-info span { color:#53654f; font-size:11px; }.roster-stars { color:#5D8DB0; font-size:12px; white-space:nowrap; }
.summon-bottom-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.summon-secondary-actions,.summon-actions { display:flex; align-items:center; gap:10px; }.summon-actions { justify-content:flex-end; }
.story-button { display:grid; justify-items:center; gap:1px; min-width:138px; min-height:54px; padding:6px 13px; color:#23382F; background:#FBF2D8; border:2px solid #23382F; border-radius:9px 7px 10px 8px; box-shadow:0 4px 0 #7A6545; font:800 14px/1.2 Nunito,Trebuchet MS,sans-serif; cursor:pointer; transition:transform .12s ease,box-shadow .12s ease,filter .12s ease; }
.story-button small { font-size:12px; font-weight:800; }.story-button:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 5px 0 #7A6545; }.story-button:active:not(:disabled) { transform:translateY(2px); box-shadow:0 1px 0 #7A6545; }.story-button:focus-visible,.modal-close:focus-visible { outline:3px solid #F2BA55; outline-offset:3px; }
.ghost-button { min-height:45px; min-width:104px; background:rgb(251 242 216 / 96%); }.pull-one { background:#6DB8CF; }.pull-ten { background:#F2BA55; }.story-button:disabled { cursor:not-allowed; opacity:.58; filter:saturate(.55); box-shadow:0 2px 0 #7A6545; }
.summon-error,.summon-loading { align-self:center; justify-self:center; color:#FBF2D8; font-weight:800; }.summon-toast { position:fixed; z-index:11; bottom:95px; left:50%; display:flex; gap:18px; align-items:center; transform:translateX(-50%); padding:10px 16px; color:#23382F; background:#FBF2D8; border:2px solid #23382F; border-radius:10px; box-shadow:0 4px 0 #7A6545; }.summon-toast button { border:0; background:none; color:inherit; font-size:22px; cursor:pointer; }
.machine-overlay,.story-modal-shade { position:fixed; z-index:15; inset:0; display:grid; place-items:center; padding:20px; background:rgb(15 35 28 / 78%); }.machine-overlay-card { position:relative; width:min(420px,100%); padding:28px 18px 16px; background:#FBF2D8 url('/hero-lab/assets/storybook-paper.svg') repeat; background-size:144px 144px; border:3px solid #23382F; border-radius:14px; box-shadow:0 7px 0 #7A6545; }.machine-overlay-card :deep(.gm-wrap) { margin:0 auto; }
.machine-skip { display:block; margin:16px auto 0; min-height:42px; }
.summon-summary-shade { position:fixed; z-index:30; inset:0; display:grid; place-items:center; padding:20px; overflow:auto; background:rgb(11 27 27 / 88%); color:#FBF2D8; }
.summon-summary-panel { width:min(1190px,100%); max-height:calc(100svh - 40px); overflow:auto; padding:20px 24px; background:radial-gradient(ellipse at 50% 0%,rgb(87 142 189 / 17%),transparent 54%),linear-gradient(155deg,#182D32,#203B36 60%,#152B33); border:0; border-radius:14px; box-shadow:0 0 0 5px rgb(12 24 27 / 70%),0 16px 48px #071614; animation:summary-panel-in .42s cubic-bezier(.2,.8,.25,1) both; }
.summary-header { display:flex; align-items:center; justify-content:space-between; gap:15px; }.summary-header h2 { margin:0; color:#FBF2D8; font:700 clamp(26px,3vw,36px)/1 Georgia,'Palatino Linotype',serif; }.summary-instruction { margin:7px 0 12px; color:#D7DDC9; font-size:13px; }
.summary-grid { display:grid; grid-template-columns:repeat(var(--summary-columns),minmax(0,1fr)); gap:10px; transform:skewY(var(--summary-slant)); }
.summary-card { --card-delay:calc(var(--card-index, 0) * 55ms); min-width:0; min-height:220px; position:relative; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; padding:12px 8px; overflow:hidden; color:#FBF2D8; background:radial-gradient(ellipse at 50% 28%,rgb(116 180 220 / 12%),transparent 58%),#233B3A; border:2px solid #B8C4B3; border-radius:8px; text-align:center; animation:summary-card-in .5s cubic-bezier(.16,1,.3,1) both; animation-delay:var(--card-delay); transition:transform .18s ease,box-shadow .18s ease,filter .18s ease; }
.summary-card:hover { z-index:2; transform:translateY(-5px) scale(1.018); filter:brightness(1.1); box-shadow:0 10px 24px rgb(0 0 0 / 28%); }
.summary-card.rarity-rare { background:linear-gradient(145deg,#263B56,#33475C); border-color:#8CC4FF; box-shadow:inset 0 0 0 2px #8062A9; }.summary-card.rarity-epic { background:linear-gradient(145deg,#53452B,#766032); border:4px double #F2BA55; box-shadow:0 0 16px rgb(242 186 85 / 30%); }
.summary-card.rarity-epic::before,.summary-card.rarity-epic::after { content:""; position:absolute; z-index:1; width:4px; height:4px; background:#FFE88A; image-rendering:pixelated; box-shadow:8px 0 #F2BA55,0 8px #F2BA55; }.summary-card.rarity-epic::before { top:12px; right:13px; }.summary-card.rarity-epic::after { bottom:18px; left:13px; transform:rotate(180deg); }
.summary-roll { position:absolute; top:6px; left:8px; color:#D4C99E; font:700 10px ui-monospace,monospace; }
.summary-resource { display:grid; place-items:center; font-size:43px; line-height:1; }.summary-resource small { margin-top:4px; font:800 12px Nunito,sans-serif; }.summary-card :deep(canvas) { max-width:100%; }.summary-name { max-width:100%; overflow-wrap:anywhere; font:700 16px/1.1 Georgia,'Palatino Linotype',serif; }.summary-stars { color:#F2BA55; letter-spacing:1px; animation:summary-star-glint 1.8s ease-in-out infinite alternate; }.summary-status { display:inline-block; max-width:100%; padding:4px 6px; border-radius:5px; font-size:10px; font-weight:900; }.summary-refunds { margin:12px 0 0; color:#FBE4A4; text-align:center; }.summary-footer { display:flex; justify-content:center; margin-top:12px; }.summary-footer .story-button { display:inline-flex; align-items:center; justify-content:center; width:max-content; min-width:0; min-height:42px; padding:8px 24px; }
@keyframes summary-panel-in { from { opacity:0; transform:translateY(16px) scale(.985); } to { opacity:1; transform:translateY(0) scale(1); } }
@keyframes summary-card-in { from { opacity:0; transform:translateY(18px) scale(.94); } to { opacity:1; transform:translateY(0) scale(1); } }
@keyframes summary-star-glint { from { filter:brightness(.9); } to { filter:brightness(1.35) drop-shadow(0 0 5px rgb(242 186 85 / 55%)); } }
@media (prefers-reduced-motion:reduce) { .summon-summary-panel,.summary-card,.summary-stars { animation:none; }.summary-card { transition:none; } }
.story-modal-shade { z-index:20; }.story-modal { width:min(820px,100%); max-height:min(650px,calc(100svh - 36px)); overflow:auto; padding:20px 22px 18px; color:#23382F; background:#FBF2D8 url('/hero-lab/assets/storybook-paper.svg') repeat; background-size:144px 144px; border:3px solid #23382F; border-radius:15px 12px 16px 13px; box-shadow:0 7px 0 #7A6545; }
.story-modal-header { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; }.story-modal-header h2 { margin:0; color:#254937; font:700 28px/1.05 Georgia,'Palatino Linotype',serif; }.modal-kicker { margin-bottom:4px; }
.modal-close { width:36px; height:36px; padding:0; color:#23382F; background:#FFF8E4; border:2px solid #23382F; border-radius:8px; box-shadow:0 2px 0 #7A6545; font-size:23px; line-height:1; cursor:pointer; }
.detail-rates { display:grid; grid-template-columns:repeat(3,1fr); gap:9px; margin:10px 0 15px; }.detail-rate { display:grid; gap:3px; padding:12px; background:#FFF8E4; border:2px solid #687553; border-radius:9px; }.detail-rate strong { color:#254937; font-size:22px; }.detail-rate>span:last-child { font-size:13px; }.detail-rate.rarity-rare { border-color:#4D87B4; }.detail-rate.rarity-epic { border-color:#B58324; }.detail-stars { color:#C38B25; font-size:13px; letter-spacing:1px; }
.detail-copy,.detail-rules p { color:#435744; font-size:14px; }.detail-rules { display:grid; gap:8px; margin-top:10px; }.detail-rules p { margin:0; padding:9px 12px; background:rgb(255 248 228 / 76%); border-left:3px solid #7FAE58; }
.history-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:12px; }.history-summary div { display:grid; gap:0; padding:8px 10px; background:#FFF8E4; border:1px solid #C9BA93; border-radius:8px; }.history-summary strong { color:#254937; font-size:19px; }.history-summary span { color:#53654f; font-size:11px; }.history-summary>p { grid-column:1/-1; margin:0; padding:8px 10px; color:#435744; background:#E8F0DE; border-radius:7px; font-size:13px; }
.history-tabs,.rarity-filters { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }.history-tabs button,.rarity-filters button { padding:6px 10px; color:#23382F; background:#FFF8E4; border:1px solid #867a5c; border-radius:7px; font:700 12px Nunito,sans-serif; cursor:pointer; }.history-tabs button[aria-pressed="true"],.rarity-filters button[aria-pressed="true"] { color:#23382F; background:#F2BA55; border-color:#61472d; box-shadow:0 2px 0 #7A6545; }
.summon-history-list,.ledger-history ol { display:grid; gap:0; max-height:300px; overflow:auto; margin:0; padding:0; list-style:none; }.summon-history-row { display:grid; grid-template-columns:minmax(72px,110px) 48px minmax(100px,1fr) auto; align-items:center; gap:9px; min-height:61px; padding:6px 8px; background:rgb(255 248 228 / 65%); border-bottom:1px dashed #b7a77e; }.summon-history-row.batch-start { border-top:2px dashed #7A6545; margin-top:3px; }.history-time,.ledger-history time { color:#65745b; font-size:11px; }.history-resource { display:grid; place-items:center; width:44px; font-size:25px; }.history-result { display:grid; gap:0; min-width:0; color:#304638; font-size:13px; }.history-result strong { font:700 15px Georgia,'Palatino Linotype',serif; }.history-stars { color:#8062A9; letter-spacing:1px; }.rarity-epic .history-stars { color:#C38B25; }.result-tag { padding:4px 7px; border-radius:6px; font-size:10px; font-weight:900; white-space:nowrap; }.new-tag { color:#3b2b1d; background:#F2BA55; }.duplicate-tag { color:#254937; background:#DDEAD4; border:1px solid #7FAE58; }
.history-pagination { display:flex; justify-content:center; align-items:center; gap:14px; margin-top:12px; color:#53654f; font-size:13px; }.history-pagination .story-button { min-width:95px; min-height:38px; }
.history-state,.empty-history { padding:22px 10px; color:#53654f; text-align:center; }.empty-history span { font-size:30px; }.empty-history p { margin:4px 0 0; }.ledger-history li { display:grid; grid-template-columns:110px minmax(100px,1fr) auto; align-items:center; gap:10px; padding:9px 7px; border-bottom:1px dashed #b7a77e; font-size:13px; }.ledger-history li strong { text-align:right; }.error-state { display:grid; gap:10px; justify-items:center; }
@media (max-width:899px) {
  .summary-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }.summary-card { min-height:175px; }
  .summon-page { position:relative; min-height:100svh; height:auto; grid-template-rows:64px auto auto; padding:0 14px 12px; overflow:auto; }
  .summon-content { padding:14px 0; }.summon-banner { min-height:0; max-height:none; width:100%; }.featured-row { grid-template-columns:1fr; }.featured-hero { min-height:230px; }.roster-strip { grid-template-columns:repeat(2,minmax(0,1fr)); }.summon-bottom-bar { position:sticky; bottom:0; z-index:4; padding:8px 0; background:linear-gradient(0deg,#254937 80%,transparent); }
}
@media (max-width:520px) {
  .summon-summary-shade { padding:8px; }.summon-summary-panel { max-height:calc(100svh - 16px); padding:13px 10px; }.summary-grid { gap:6px; }.summary-card { min-height:150px; padding:9px 5px; }.summary-card :deep(canvas) { width:68px!important; height:auto!important; }.summary-name { font-size:13px; }.summary-status { font-size:9px; }
  .summon-page { padding:0 10px 8px; }.summon-topbar { height:58px; }.summon-page-title h1 { font-size:25px; }.summon-banner { padding:13px 10px; }.featured-hero { gap:8px; padding:9px 6px; }.featured-art { flex-basis:115px; }.featured-art :deep(canvas) { width:115px!important; height:auto!important; }.featured-info h3 { font-size:24px; }.roster-strip { grid-template-columns:1fr 1fr; gap:6px; }.roster-hero { flex-wrap:wrap; justify-content:center; text-align:center; }.roster-hero :deep(canvas) { width:44px!important; height:auto!important; }.summon-bottom-bar { gap:6px; flex-wrap:wrap; justify-content:center; }.summon-secondary-actions,.summon-actions { gap:6px; }.story-button { min-width:105px; min-height:47px; padding:5px 8px; font-size:12px; }.ghost-button { min-width:80px; }.detail-rates { grid-template-columns:1fr; }.history-summary { grid-template-columns:1fr 1fr; }.summon-history-row { grid-template-columns:75px 40px minmax(80px,1fr); }.summon-history-row .result-tag { grid-column:3; justify-self:start; }.ledger-history li { grid-template-columns:75px 1fr; }.ledger-history li strong { grid-column:2; justify-self:start; }.story-modal { padding:15px 12px; }
}
</style>
