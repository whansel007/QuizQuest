<script setup>
// ============================================================
// STUDENT: kingdom building + class trading
// ------------------------------------------------------------
// Resources come from finishing practice sessions and from gathering
// in the World. They are spent on cosmetic buildings, or traded with
// classmates through open offers (the server holds offered resources
// in escrow, so an offer can always be honoured).
// ============================================================
import { ref, reactive, computed, onMounted, onUnmounted, useId } from 'vue';
import { S, api, rerender, retryablePost } from '../api.js';
import { when, toast, fmtBundle } from '../ui.js';
import Heading from '../components/Heading.vue';
import AsyncButton from '../components/AsyncButton.vue';
import { loadHome, updateBalances } from './home.js';
import ClassPicker from './ClassPicker.vue';
import IsoKingdom from './kingdom/IsoKingdom.vue';

const error = ref('');
const loaded = ref(false);
const k = ref(null);
const market = ref(null);
const give = reactive({});
const want = reactive({});
const giveId = useId();
const wantId = useId();
let alive = true;

onMounted(async () => {
  try {
    await loadHome();
    if (S.classId) {
      const [kd, m] = await Promise.all([api('GET', '/api/student/kingdom'), api('GET', `/api/student/classes/${S.classId}/trades`)]);
      if (!alive) return;
      k.value = kd;
      market.value = m;
      for (const id of Object.keys(kd.catalog.resources)) {
        give[id] = 0;
        want[id] = 0;
      }
    }
    if (alive) loaded.value = true;
  } catch (err) {
    if (alive) error.value = err.message;
  }
});
onUnmounted(() => (alive = false));

const R = computed(() => k.value.catalog.resources);
// --- the kingdom: a block castle in the middle, four buildings around it
const upgraders = {};
const preview = ref(null); // building whose next level is shown as ghost blocks
function plot(id) {
  const def = k.value.catalog.buildings[id];
  const lvl = k.value.buildings[id];
  const cost = def.costs[lvl];
  const affordable = !!cost && Object.entries(cost).every(([r, v]) => (k.value.resources[r] || 0) >= v);
  return { id, def, lvl, cost, affordable };
}
const plots = computed(() => Object.keys(k.value.catalog.buildings).map(plot));
const summary = computed(() => `Your kingdom: castle level ${k.value.castleLevel} of 3, ` + plots.value.map((p) => `${p.def.name} level ${p.lvl}`).join(', '));
async function upgrade(p) {
  // the same build key is reused until the server confirms the build
  const r = await (upgraders[p.id] ||= retryablePost('/api/student/kingdom/build', { building: p.id }))();
  // update in place (no remount) so the new blocks drop into the scene
  const grew = r.castleLevel > k.value.castleLevel;
  Object.assign(k.value, { buildings: r.buildings, castleLevel: r.castleLevel, resources: r.resources });
  market.value.resources = r.resources;
  updateBalances({ resources: r.resources });
  preview.value = null;
  toast(grew ? `${p.def.name} upgraded - your castle grew!` : `${p.def.name} upgraded!`);
}

// --- trading
const read = (inputs) => Object.fromEntries(Object.entries(inputs).map(([id, v]) => [id, Math.max(0, Math.floor(Number(v) || 0))]));
const canAccept = (t) => Object.entries(t.want).every(([r, v]) => (market.value.resources[r] || 0) >= v);
async function accept(t) {
  await api('POST', `/api/student/trades/${t.id}/accept`);
  toast('Trade done!');
  rerender();
}
async function cancel(t) {
  await api('POST', `/api/student/trades/${t.id}/cancel`);
  toast('Offer cancelled - resources returned');
  rerender();
}
async function post() {
  await api('POST', `/api/student/classes/${S.classId}/trades`, { give: read(give), want: read(want) });
  toast('Offer posted');
  rerender();
}
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!S.classId">You are not enrolled in any class.</p>
    <template v-else>
      <Heading title="Kingdom"><ClassPicker /></Heading>
      <p class="small muted">Earn supplies by finishing practice sessions (🪵🪵🌿 each) and by answering questions at resource nodes in the World. Buildings are just for fun: no academic value.</p>
      <div class="tiles">
        <div v-for="(d, id) in R" :key="id" class="tile">
          <div class="v">{{ d.emoji }} {{ k.resources[id] || 0 }}</div>
          <div class="l">{{ d.name }}</div>
        </div>
        <div class="tile">
          <div class="v">{{ k.earnedToday }} / {{ k.dailyCap }}</div>
          <div class="l">resources earned today (daily cap)</div>
        </div>
      </div>
      <div class="panel">
        <div class="iso-wrap">
          <IsoKingdom :buildings="k.buildings" :castle-level="k.castleLevel" :preview="preview" :label="summary" />
          <div class="iso-castle">🏯 Castle level {{ k.castleLevel }} / 3 <span class="muted">· grows when every building does</span></div>
        </div>
        <div class="build-grid">
          <div v-for="p in plots" :key="p.id" class="build-card" :class="{ previewing: preview === p.id }" @mouseenter="p.cost && (preview = p.id)" @mouseleave="preview === p.id && (preview = null)">
            <div class="row" style="gap: 8px; flex-wrap: nowrap">
              <span class="build-icon" aria-hidden="true">{{ p.def.emoji }}</span>
              <div class="grow">
                <div style="font-weight: 700">{{ p.def.name }}</div>
                <div class="stars" :aria-label="`level ${p.lvl} of 3`">{{ '★'.repeat(p.lvl) + '☆'.repeat(3 - p.lvl) }}</div>
              </div>
            </div>
            <AsyncButton v-if="p.cost" class="btn small" :class="{ primary: p.affordable }" :disabled="!p.affordable" :run="() => upgrade(p)" @focus="preview = p.id" @blur="preview === p.id && (preview = null)">{{ p.lvl ? 'Upgrade' : 'Build' }}: {{ fmtBundle(p.cost, R) }}</AsyncButton>
            <div v-else class="small muted">Max level</div>
          </div>
        </div>
        <p class="small muted" style="margin: 8px 0 0">Hover or focus a button to preview the blocks it adds.</p>
      </div>

      <div v-if="!market.enabled" class="panel">
        <h3>Class market</h3>
        <p class="muted">Your professor has turned trading off for this class.</p>
      </div>
      <div v-else class="panel">
        <h3>Class market</h3>
        <p class="small muted">Offers are visible to your whole class. Offered resources are held until the offer is taken or you cancel. Max {{ market.limits.maxOpenPerStudent }} open offers, {{ market.limits.maxUnitsPerSide }} per side, {{ market.limits.maxCompletedPerDay }} trades a day. Resources can't be swapped for coins.</p>
        <div v-if="market.market.length" class="table-wrap">
          <table>
            <tbody>
              <tr v-for="t in market.market" :key="t.id">
                <td>{{ t.from }}</td>
                <td>offers <b>{{ fmtBundle(t.give, R) }}</b></td>
                <td>for <b>{{ fmtBundle(t.want, R) }}</b></td>
                <td class="small muted">{{ when(t.createdAt) }}</td>
                <td><AsyncButton class="btn small primary" :disabled="!canAccept(t)" :run="() => accept(t)">Accept</AsyncButton></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="small muted">No open offers from classmates right now.</p>
        <template v-if="market.mine.length">
          <h3 style="margin-top: 14px">Your open offers</h3>
          <div class="table-wrap">
            <table>
              <tbody>
                <tr v-for="t in market.mine" :key="t.id">
                  <td>{{ t.from }}</td>
                  <td>offers <b>{{ fmtBundle(t.give, R) }}</b></td>
                  <td>for <b>{{ fmtBundle(t.want, R) }}</b></td>
                  <td class="small muted">{{ when(t.createdAt) }}</td>
                  <td><AsyncButton class="btn small" :run="() => cancel(t)">Cancel</AsyncButton></td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <h3 style="margin-top: 14px">Post an offer</h3>
        <div class="row top">
          <div class="field">
            <label :id="giveId">I give</label>
            <div class="row" role="group" :aria-labelledby="giveId">
              <span v-for="(d, id) in R" :key="id">{{ d.emoji }} <input v-model="give[id]" type="number" min="0" max="20" style="max-width: 70px" :aria-label="d.name" /></span>
            </div>
          </div>
          <div class="field">
            <label :id="wantId">I want</label>
            <div class="row" role="group" :aria-labelledby="wantId">
              <span v-for="(d, id) in R" :key="id">{{ d.emoji }} <input v-model="want[id]" type="number" min="0" max="20" style="max-width: 70px" :aria-label="d.name" /></span>
            </div>
          </div>
        </div>
        <AsyncButton class="btn primary" :run="post">Post offer</AsyncButton>
        <details v-if="market.history.length" style="margin-top: 14px">
          <summary>Your trade history</summary>
          <div class="table-wrap">
            <table>
              <tbody>
                <tr v-for="t in market.history" :key="t.id">
                  <td class="small muted">{{ when(t.acceptedAt || t.createdAt) }}</td>
                  <td>{{ t.mine ? `You offered ${fmtBundle(t.give, R)} for ${fmtBundle(t.want, R)}` : `You gave ${fmtBundle(t.want, R)} to ${t.from} for ${fmtBundle(t.give, R)}` }}</td>
                  <td><span class="badge plain">{{ t.status }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </template>
  </template>
</template>
