<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { api } from '../api.js';
import { loadHome, updateBalances } from '../student/home.js';
import packageJson from '../../../package.json';

const enabled = ref(false);
const versionOpen = ref(false);
const open = ref(false);
const balance = ref(0);
const error = ref('');
const saved = ref(false);
const versionNotice = ref('');
const versionDialog = ref(null);
const debugDialog = ref(null);
const appVersion = packageJson.version;
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

async function saveBalance() {
  error.value = '';
  saved.value = false;
  try {
    const wallet = await api('POST', '/api/student/debug/wallet', { balance: Number(balance.value) });
    updateBalances({ wallet });
    saved.value = true;
  } catch (err) { error.value = err.message; }
}

async function openMenu() {
  open.value = true;
  try { balance.value = (await loadHome()).wallet.balance; }
  catch (err) { error.value = err.message; }
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
      <p class="muted small">Change this signed-in student's coin balance for summon playtesting.</p>
      <form @submit.prevent="saveBalance">
        <label for="debug-balance">Coin balance</label>
        <input id="debug-balance" v-model.number="balance" type="number" min="0" max="1000000" step="1" required>
        <button class="btn primary" type="submit">Set balance</button>
      </form>
      <p v-if="saved" class="small">Balance updated.</p>
      <p v-if="error" class="note bad small">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.debug-backdrop { position:fixed;z-index:50;inset:0;background:#101322bb;display:grid;place-items:center;padding:16px; }
.debug-panel { position:relative;width:min(380px,100%);display:grid;gap:12px; }
.debug-panel h2,.debug-panel p { margin:0; }
.debug-panel form { display:grid;gap:8px; }
.debug-trigger { flex:none; }
.version-panel { width:min(320px,100%);min-height:110px;place-items:center; }
.debug-close { position:absolute;top:10px;right:10px; }
</style>
