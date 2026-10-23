<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { api } from '../api.js';
import { loadHome, store, updateBalances } from '../student/home.js';
import { DEBUG_TUNING } from '../../../config/tuning.js';
import packageJson from '../../../package.json';

const enabled = ref(false);
const versionOpen = ref(false);
const open = ref(false);
const balance = ref(0);
const resourceBalances = ref({});
const error = ref('');
const saved = ref(false);
const versionNotice = ref('');
const versionDialog = ref(null);
const debugDialog = ref(null);
const rooms = ref([]);
const maxRooms = ref(0);
const roomsError = ref('');
const appVersion = packageJson.version;
const resources = () => Object.entries(store.home?.catalog.resources || {});
const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter'];
let position = 0;

function konami(e) {
  if (!versionOpen.value) return;
  // The version dialog owns keyboard input while it is open. In particular,
  // keep the arrow keys from scrolling the page while entering the code.
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    versionOpen.value = false;
    position = 0;
    return;
  }
  // Prefer physical key codes for letter keys so the sequence still works
  // when Caps Lock or a non-US keyboard layout changes `event.key`.
  if (e.repeat) return;
  const key = e.code === 'KeyB' ? 'b'
    : e.code === 'KeyA' ? 'a'
      : e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (key === code[position]) {
    position++;
    if (position === code.length) {
      position = 0;
      if (enabled.value) {
        versionOpen.value = false;
        void openMenu();
      } else versionNotice.value = 'Debug tools are unavailable in this build.';
    }
  } else position = key === code[0] ? 1 : 0;
}

async function openVersion() {
  position = 0;
  versionNotice.value = '';
  versionOpen.value = true;
  await nextTick();
  versionDialog.value?.focus();
}

async function setWalletBalance(nextBalance = balance.value) {
  error.value = '';
  saved.value = false;
  try {
    const wallet = await api('POST', '/api/student/debug/wallet', { balance: Number(nextBalance) });
    updateBalances({ wallet });
    balance.value = wallet.balance;
    saved.value = true;
  } catch (err) { error.value = err.message; }
}

async function setResourceBalance(resource, nextBalance = resourceBalances.value[resource]) {
  error.value = '';
  saved.value = false;
  try {
    const result = await api('POST', '/api/student/debug/resources', { resource, balance: Number(nextBalance) });
    updateBalances({ resources: result.resources });
    resourceBalances.value = { ...resourceBalances.value, [resource]: result.resources[resource] };
    saved.value = true;
  } catch (err) { error.value = err.message; }
}

function adjustWallet(amount) { return setWalletBalance(Math.max(DEBUG_TUNING.minimumBalance, Math.min(DEBUG_TUNING.maximumBalance, balance.value + amount))); }
function adjustResource(resource, amount) { return setResourceBalance(resource, Math.max(DEBUG_TUNING.minimumBalance, Math.min(DEBUG_TUNING.maximumBalance, Number(resourceBalances.value[resource]) + amount))); }

async function loadRooms() {
  roomsError.value = '';
  try {
    const result = await api('GET', '/api/student/hero-lab/rooms');
    rooms.value = result.rooms || [];
    maxRooms.value = result.maxRooms || 0;
  } catch (err) {
    roomsError.value = err.message;
  }
}

async function openMenu() {
  open.value = true;
  try {
    const home = await loadHome();
    balance.value = home.wallet.balance;
    resourceBalances.value = Object.fromEntries(Object.keys(home.catalog.resources).map((resource) => [resource, home.inventory.resources[resource] || 0]));
  }
  catch (err) { error.value = err.message; }
  await loadRooms();
  await nextTick();
  debugDialog.value?.focus();
}

onMounted(async () => {
  // Capture the sequence before game controls or focused form elements can
  // consume keys (especially the final Enter).
  window.addEventListener('keydown', konami, true);
  try { enabled.value = (await api('GET', '/api/student/debug-mode')).enabled; }
  catch { enabled.value = false; }
});
onUnmounted(() => window.removeEventListener('keydown', konami, true));
</script>

<template>
  <span v-if="enabled" id="debug-menu-enabled" hidden></span>
  <button class="btn small debug-trigger" type="button" aria-label="Tools and version" title="Tools and version" @click="openVersion">🔧</button>
  <section v-if="versionOpen" ref="versionDialog" class="debug-backdrop" role="dialog" aria-modal="true" aria-labelledby="version-title" tabindex="-1" @click.self="versionOpen = false">
    <div class="panel debug-panel version-panel">
      <button class="btn small debug-close" type="button" aria-label="Close version" @click="versionOpen = false; position = 0">×</button>
      <h2 id="version-title">QuizQuest v{{ appVersion }}</h2>
      <p v-if="versionNotice" class="muted small">{{ versionNotice }}</p>
    </div>
  </section>
  <section v-if="enabled && open" class="debug-backdrop" role="dialog" aria-modal="true" aria-labelledby="debug-title" @click.self="open = false">
    <div ref="debugDialog" class="panel debug-panel" tabindex="-1">
      <button class="btn small debug-close" type="button" aria-label="Close debug menu" @click="open = false">×</button>
      <h2 id="debug-title">Demo debug menu</h2>
      <p class="muted small">Change this signed-in student's coins and kingdom resources for playtesting.</p>
      <form class="resource-controls" @submit.prevent="setWalletBalance()">
        <label for="debug-balance">Coin balance</label>
        <input id="debug-balance" v-model.number="balance" type="number" :min="DEBUG_TUNING.minimumBalance" :max="DEBUG_TUNING.maximumBalance" :step="DEBUG_TUNING.inputStep" required>
        <div class="debug-actions">
          <button class="btn primary" type="submit">Set</button>
          <button class="btn" type="button" @click="adjustWallet(DEBUG_TUNING.smallAdjustment)">+{{ DEBUG_TUNING.smallAdjustment }}</button>
          <button class="btn" type="button" @click="adjustWallet(DEBUG_TUNING.largeAdjustment)">+{{ DEBUG_TUNING.largeAdjustment }}</button>
          <button class="btn" type="button" @click="setWalletBalance(DEBUG_TUNING.minimumBalance)">Reset to 0</button>
        </div>
      </form>
      <form v-for="[resource, details] in resources()" :key="resource" class="resource-controls" @submit.prevent="setResourceBalance(resource)">
        <label :for="`debug-resource-${resource}`">{{ details.emoji }} {{ details.name }}</label>
        <input :id="`debug-resource-${resource}`" v-model.number="resourceBalances[resource]" type="number" :min="DEBUG_TUNING.minimumBalance" :max="DEBUG_TUNING.maximumBalance" :step="DEBUG_TUNING.inputStep" required>
        <div class="debug-actions">
          <button class="btn primary" type="submit">Set</button>
          <button class="btn" type="button" @click="adjustResource(resource, DEBUG_TUNING.smallAdjustment)">+{{ DEBUG_TUNING.smallAdjustment }}</button>
          <button class="btn" type="button" @click="adjustResource(resource, DEBUG_TUNING.largeAdjustment)">+{{ DEBUG_TUNING.largeAdjustment }}</button>
          <button class="btn" type="button" @click="setResourceBalance(resource, DEBUG_TUNING.minimumBalance)">Reset to 0</button>
        </div>
      </form>
      <p v-if="saved" class="small">Balance updated.</p>
      <p v-if="error" class="note bad small">{{ error }}</p>
      <section class="debug-rooms">
        <div class="debug-rooms-head">
          <strong>Live rooms <span class="muted small">{{ rooms.length }}/{{ maxRooms }}</span></strong>
          <button class="btn small" type="button" @click="loadRooms">Refresh</button>
        </div>
        <p v-if="roomsError" class="note bad small">{{ roomsError }}</p>
        <p v-else-if="rooms.length === 0" class="muted small">No active rooms. Open the World to create one.</p>
        <table v-else class="debug-rooms-table">
          <thead>
            <tr><th scope="col">Room</th><th scope="col">Phase</th><th scope="col">Heroes</th><th scope="col">Wave</th><th scope="col">Tick</th></tr>
          </thead>
          <tbody>
            <tr v-for="room in rooms" :key="room.id">
              <td><code>{{ room.code || 'sandbox' }}</code></td>
              <td>{{ room.phase }}</td>
              <td>{{ room.players }}<span class="muted"> +{{ room.waiting }} waiting</span></td>
              <td>{{ room.wave }}</td>
              <td>{{ room.tickMs.toFixed(2) }} ms</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  </section>
</template>

<style scoped>
.debug-backdrop { position:fixed;z-index:50;inset:0;background:#101322bb;display:grid;place-items:center;padding:16px; }
.debug-panel { position:relative;width:min(520px,100%);max-height:min(90vh,760px);overflow:auto;display:grid;gap:12px; }
.debug-panel h2,.debug-panel p { margin:0; }
.debug-panel form { display:grid;gap:8px; }
.debug-actions { display:flex;flex-wrap:wrap;gap:6px; }
.debug-trigger { flex:none; }
.version-panel { width:min(320px,100%);min-height:110px;place-items:center; }
.debug-close { position:absolute;top:10px;right:10px; }
.debug-rooms { display:grid;gap:8px;padding-top:12px;border-top:1px solid #ffffff22; }
.debug-rooms-head { display:flex;align-items:center;justify-content:space-between;gap:8px; }
.debug-rooms-table { width:100%;border-collapse:collapse;font-size:.82rem; }
.debug-rooms-table th,.debug-rooms-table td { padding:4px 6px;text-align:left;border-bottom:1px solid #ffffff14; }
.debug-rooms-table th { color:#cbd5e1;font-weight:600; }
</style>
