<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { api } from '../api.js';
import { loadHome, updateBalances } from '../student/home.js';

const enabled = ref(false);
const open = ref(false);
const balance = ref(0);
const error = ref('');
const saved = ref(false);
const code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter'];
let position = 0;

function konami(e) {
  if (!enabled.value) return;
  if (open.value) {
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
      e.preventDefault();
      openMenu();
    }
  } else position = key === code[0] ? 1 : 0;
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
  <section v-if="enabled && open" class="debug-backdrop" role="dialog" aria-modal="true" aria-labelledby="debug-title" @click.self="open = false">
    <div class="panel debug-panel">
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
.debug-close { position:absolute;top:10px;right:10px; }
</style>
