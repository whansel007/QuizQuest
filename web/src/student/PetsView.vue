<script setup>
// Student: hero summon, collection, and coin/resource history.
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api, retryablePost } from '../api.js';
import { when, toast } from '../ui.js';
import Heading from '../components/Heading.vue';
import { store, loadHome, updateBalances } from './home.js';
import WalletBadge from './WalletBadge.vue';
import ResourceBadge from './ResourceBadge.vue';
import GachaMachine from './gacha/GachaMachine.vue';
import PrizeReveal from './gacha/PrizeReveal.vue';
import { formatHeroType } from './hero-type.js';
import HeroIcon from './HeroIcon.vue';

const error = ref('');
const ledger = ref(null);
const prize = ref(null);
const historyKind = ref('coins');
let alive = true;
const home = computed(() => store.home);
const inv = computed(() => home.value.inventory);
const catalog = computed(() => home.value.catalog);
const summonConfig = computed(() => catalog.value.heroSummon);
const ownsHero = (id) => inv.value.heroes.includes(id);
const pityText = computed(() => `${inv.value.heroPity.sinceHero}/${summonConfig.value.heroPityPulls - 1} pulls toward a guaranteed hero · ${inv.value.heroPity.sinceEpic}/${summonConfig.value.epicPityPulls - 1} toward a guaranteed 5★`);
const rates = computed(() => {
  const odds = summonConfig.value.odds;
  const total = Object.values(odds).reduce((sum, value) => sum + value, 0);
  return Object.entries(odds).map(([rarity, weight]) => ({ rarity, percent: Math.round(weight * 100 / total) }));
});

const summon = retryablePost('/api/student/hero-summon');
async function pull() {
  const result = await summon();
  if (alive) {
    store.home.inventory = result.inventory;
    updateBalances({ wallet: result.wallet });
  }
  return result;
}
function showPrize(result) {
  if (alive) prize.value = result;
}
async function closePrize() {
  prize.value = null;
  try {
    const fresh = await api('GET', '/api/student/ledger');
    if (alive) ledger.value = fresh;
  } catch { /* keep the current history visible */ }
}

onMounted(async () => {
  try {
    await loadHome();
    ledger.value = await api('GET', '/api/student/ledger');
  } catch (err) { if (alive) error.value = err.message; }
});
onUnmounted(() => { alive = false; });
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="ledger">
    <Heading title="Hero Summon"><WalletBadge /></Heading>
    <p class="note small">Summons use quiz-earned coins. Common pulls award kingdom resources; rare and epic pulls add heroes to your World collection. Your first hero, Sheriff, is free.</p>

    <section class="panel summon-panel" aria-labelledby="summon-title">
      <div class="summon-copy">
        <h2 id="summon-title">✨ Hero Summon</h2>
        <p>Call a new hero or earn resources for your kingdom.</p>
        <div class="summon-balances"><WalletBadge /><ResourceBadge /></div>
        <GachaMachine :cost="summonConfig.pullCost" :disabled="home.wallet.balance < summonConfig.pullCost" :open="pull" @prize="showPrize" />
        <p class="small muted">{{ pityText }}. Pity counters persist and reset only when the matching hero rarity is drawn.</p>
      </div>
      <div class="summon-rates">
        <h3>Drop rates</h3>
        <div v-for="rate in rates" :key="rate.rarity" class="rate-row">
          <b class="rarity" :class="rate.rarity">{{ rate.rarity === 'common' ? '3★' : rate.rarity === 'rare' ? '4★' : '5★' }} {{ rate.rarity }}</b>
          <span>{{ rate.percent }}%</span>
          <span v-if="rate.rarity === 'common'">{{ summonConfig.commonResourceAmount }} wood, crystal, or herb</span>
          <span v-else>{{ catalog.heroes.filter((hero) => hero.rarity === rate.rarity).map((hero) => hero.name).join(', ') }}</span>
        </div>
        <p class="small muted">Every 10th pull guarantees a hero. Every 50th guarantees an epic; the epic guarantee takes priority.</p>
        <p class="small muted">Duplicates refund {{ Math.floor(summonConfig.pullCost * summonConfig.duplicateRefundFraction) }} coins.</p>
      </div>
    </section>

    <section class="panel hero-collection" aria-labelledby="collection-title">
      <h2 id="collection-title">Collection</h2>
      <div class="hero-collection-grid">
        <article v-for="hero in catalog.heroes" :key="hero.id" class="hero-collection-card" :class="[{ locked: !ownsHero(hero.id) }, hero.rarity]">
          <div class="hero-collection-emoji"><HeroIcon :hero="hero" :size="48" /></div>
          <div class="hero-collection-title"><strong>{{ hero.name }}</strong><span class="rarity" :class="hero.rarity">{{ hero.rarity }}★</span></div>
          <div class="small muted">{{ formatHeroType(hero.type) }} · {{ ownsHero(hero.id) ? 'Owned' : 'Not summoned' }}</div>
          <div class="small">{{ hero.weapon }} · {{ hero.skill }} · {{ hero.ultimate }}</div>
          <div v-if="ownsHero(hero.id) && inv.heroDupes[hero.id]" class="small muted">{{ inv.heroDupes[hero.id] }} duplicate pull(s)</div>
        </article>
      </div>
    </section>

    <section class="panel summon-history" aria-labelledby="history-title">
      <div class="history-heading"><h2 id="history-title">History</h2><div class="history-toggle" role="group" aria-label="History type">
        <button type="button" class="btn small" :aria-pressed="historyKind === 'coins'" @click="historyKind = 'coins'">Coins</button>
        <button type="button" class="btn small" :aria-pressed="historyKind === 'resources'" @click="historyKind = 'resources'">Resources</button>
      </div></div>
      <div v-if="historyKind === 'coins'" class="table-wrap">
        <table v-if="ledger.coins.length"><tbody><tr v-for="(entry, i) in ledger.coins" :key="entry.id || i"><td class="small muted">{{ when(entry.at) }}</td><td>{{ entry.reason }}</td><td class="history-amount" :class="{ positive: entry.amount > 0 }">{{ entry.amount > 0 ? '+' : '' }}{{ entry.amount }} 🪙</td></tr></tbody></table>
        <p v-else class="muted small">No coin history yet.</p>
      </div>
      <div v-else class="table-wrap">
        <table v-if="ledger.resources.length"><tbody><tr v-for="(entry, i) in ledger.resources" :key="entry.id || i"><td class="small muted">{{ when(entry.at) }}</td><td>{{ entry.reason }}</td><td class="history-amount">{{ Object.entries(entry.delta).map(([key, value]) => `${value > 0 ? '+' : ''}${value} ${catalog.resources[key].emoji}`).join(' ') }}</td></tr></tbody></table>
        <p v-else class="muted small">No resource history yet.</p>
      </div>
    </section>

    <PrizeReveal v-if="prize" :result="prize" :resources="catalog.resources" @close="closePrize" />
  </template>
</template>

<style scoped>
.summon-panel { display:grid; grid-template-columns:minmax(230px,1fr) minmax(260px,1.2fr); gap:22px; align-items:center; }
.summon-copy h2,.hero-collection h2,.summon-history h2 { margin:0 0 8px; }
.summon-balances { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }
.summon-rates h3 { margin:0 0 8px; }
.rate-row { display:grid;grid-template-columns:92px 44px 1fr;gap:8px;align-items:start;padding:5px 0;font-size:13px; }
.hero-collection,.summon-history { margin-top:16px; }
.hero-collection-grid { display:grid;grid-template-columns:repeat(auto-fill,minmax(min(210px,100%),1fr));gap:10px;margin-top:12px; }
.hero-collection-card { display:grid;gap:6px;padding:13px;border:1px solid var(--line,#d4d9e2);border-radius:12px;background:var(--panel,#fff); }
.hero-collection-card.locked { opacity:.65;filter:saturate(.55); }
.hero-collection-emoji { font-size:35px; }
.hero-collection-title { display:flex;justify-content:space-between;align-items:center;gap:8px; }
.history-heading { display:flex;justify-content:space-between;align-items:center;gap:12px; }
.history-toggle { display:flex;gap:6px; }
.history-toggle [aria-pressed="true"] { outline:2px solid var(--accent); }
.history-amount { text-align:right;font-weight:700;white-space:nowrap; }
.history-amount.positive { color:var(--good); }
@media (max-width:760px) { .summon-panel { grid-template-columns:1fr; } }
</style>
