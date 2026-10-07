<script setup>
// ============================================================
// STUDENT: pets, shop, history
// ============================================================
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { api, rerender, retryablePost } from '../api.js';
import { pct, when, toast, action } from '../ui.js';
import Heading from '../components/Heading.vue';
import AsyncButton from '../components/AsyncButton.vue';
import { store, loadHome } from './home.js';
import WalletBadge from './WalletBadge.vue';

const error = ref('');
const ledger = ref(null);
const eggResult = ref(null);
let alive = true;
let eggTimer = null;

const home = computed(() => store.home);
const inv = computed(() => home.value.inventory);
const catalog = computed(() => home.value.catalog);
const oddsTotal = computed(() => Object.values(catalog.value.eggOdds).reduce((a, b) => a + b, 0));

onMounted(async () => {
  try {
    await loadHome();
    const l = await api('GET', '/api/student/ledger');
    if (alive) ledger.value = l;
  } catch (err) {
    if (alive) error.value = err.message;
  }
});
onUnmounted(() => {
  alive = false;
  clearTimeout(eggTimer);
});

// One purchase key per thing until the purchase is acknowledged, so a
// retry after a lost response can't charge twice.
const buyers = {};
const buyer = (itemId) => (buyers[itemId] ||= retryablePost('/api/student/shop/buy', { itemId }));
const openEgg = retryablePost('/api/student/shop/egg');

const equip = (body) => action(async () => {
  await api('POST', '/api/student/equip', body);
  rerender();
});
const mineOf = (p) => inv.value.pets.find((x) => x.id === p.id);

async function buyPet(p) {
  await buyer(p.id)();
  toast(`${p.name} joined your team!`);
  rerender();
}
async function buyItem(it) {
  await buyer(it.id)();
  rerender();
}
async function egg() {
  const r = await openEgg();
  eggResult.value = r;
  eggTimer = setTimeout(() => alive && rerender(), 1600); // only if still on this tab
}
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="ledger">
    <Heading title="Pets & shop"><WalletBadge /></Heading>
    <div class="note small">Coins have no cash or academic value. You earn {{ home.rules.firstCorrect }} for the first correct answer to each question, {{ home.rules.sessionComplete }} for finishing a session of {{ home.rules.minSessionForBonus }}+ questions, and {{ home.rules.milestone }} once per topic when your practice indicator reaches {{ pct(home.rules.milestoneAccuracy) }}. Raid victories in the World pay too. Up to {{ home.wallet.dailyCap }} per day ({{ home.wallet.earnedToday }} earned today).</div>
    <div class="panel">
      <h3>Collection</h3>
      <div class="grid" style="grid-template-columns: repeat(auto-fill, minmax(130px, 1fr))">
        <div v-for="p in catalog.pets" :key="p.id" class="pet-card" :class="{ locked: !mineOf(p), equipped: inv.equippedPet === p.id }">
          <div class="sprite">{{ p.emoji }}</div>
          <div style="font-weight: 700">{{ mineOf(p) ? p.name : '???' }}</div>
          <div class="rarity" :class="p.rarity">{{ p.rarity }}</div>
          <template v-if="mineOf(p)">
            <div class="small muted">Move: {{ p.move }}</div>
            <div v-if="mineOf(p).dupes" class="small muted">+{{ mineOf(p).dupes }} duplicate(s)</div>
            <div v-if="inv.equippedPet === p.id" class="small muted">Equipped</div>
            <button v-else class="btn small" @click="equip({ petId: p.id })($event)">Equip</button>
          </template>
          <AsyncButton v-else-if="p.price" class="btn small" :run="() => buyPet(p)">Buy {{ p.price }} 🪙</AsyncButton>
          <div v-else class="small muted">Egg only</div>
        </div>
      </div>
    </div>
    <div class="row top">
      <div class="panel grow" style="min-width: 260px">
        <h3>🥚 Mystery egg - {{ catalog.eggCost }} 🪙</h3>
        <p class="small muted">Odds are fixed and shown before you open:</p>
        <table>
          <tbody>
            <tr v-for="(w, r) in catalog.eggOdds" :key="r">
              <td><span class="rarity" :class="r">{{ r }}</span></td>
              <td>{{ ((w / oddsTotal) * 100).toFixed(0) }}%</td>
              <td class="small muted">{{ catalog.pets.filter((p) => p.rarity === r).map((p) => p.name).join(', ') }}</td>
            </tr>
          </tbody>
        </table>
        <p class="small muted" style="margin-top: 8px">A duplicate refunds {{ catalog.duplicateRefund }} 🪙.</p>
        <AsyncButton class="btn primary" :disabled="home.wallet.balance < catalog.eggCost" :run="egg">Open an egg</AsyncButton>
        <div>
          <div v-if="eggResult" class="note good" style="margin-top: 10px; font-size: 16px">{{ `${eggResult.pet.emoji} ${eggResult.pet.name} (${eggResult.pet.rarity})` }}{{ eggResult.duplicatePet ? ` - duplicate, +${catalog.duplicateRefund} 🪙 back` : ' - new!' }}</div>
        </div>
      </div>
      <div class="panel grow" style="min-width: 260px">
        <h3>Accessories</h3>
        <div v-for="it in catalog.items" :key="it.id" class="row" style="padding: 6px 0">
          <span style="font-size: 26px">{{ it.emoji }}</span>
          <span class="grow">{{ it.name }}</span>
          <template v-if="inv.items.includes(it.id)">
            <button v-if="inv.equippedItem === it.id" class="btn small" @click="equip({ itemId: null })($event)">Take off</button>
            <button v-else class="btn small" @click="equip({ itemId: it.id })($event)">Wear</button>
          </template>
          <AsyncButton v-else class="btn small" :run="() => buyItem(it)">{{ it.price }} 🪙</AsyncButton>
        </div>
      </div>
    </div>
    <div class="row top">
      <div class="panel grow" style="min-width: 300px">
        <h3>Coin history</h3>
        <div v-if="ledger.coins.length" class="table-wrap">
          <table>
            <tbody>
              <tr v-for="(t, i) in ledger.coins" :key="t.id || i">
                <td class="small muted">{{ when(t.at) }}</td>
                <td>{{ t.reason }}</td>
                <td :style="{ textAlign: 'right', fontWeight: 700, color: `var(--${t.amount >= 0 ? 'good' : 'bad'})` }">{{ (t.amount >= 0 ? '+' : '') + t.amount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="muted small">No coins yet - finish a practice session to earn some.</p>
      </div>
      <div class="panel grow" style="min-width: 300px">
        <h3>Resource history</h3>
        <div v-if="ledger.resources.length" class="table-wrap">
          <table>
            <tbody>
              <tr v-for="(t, i) in ledger.resources" :key="t.id || i">
                <td class="small muted">{{ when(t.at) }}</td>
                <td>{{ t.reason }}</td>
                <td style="text-align: right">{{ Object.entries(t.delta).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${catalog.resources[k].emoji}`).join(' ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="muted small">No resources yet. Complete sessions or gather in the World.</p>
      </div>
    </div>
  </template>
</template>
