<script setup>
// "Switch user" opens a small menu; signing out takes a second, deliberate click.
import { nextTick, onMounted, onUnmounted, ref } from 'vue';
import { signOut } from '../api.js';

const open = ref(false);
const root = ref(null);
const logoutButton = ref(null);

async function toggle() {
  open.value = !open.value;
  if (open.value) {
    await nextTick();
    logoutButton.value?.focus();
  }
}

// Close on a click outside the menu or on Escape
function onPointer(e) {
  if (open.value && !root.value?.contains(e.target)) open.value = false;
}
function onKey(e) {
  if (open.value && e.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointer);
  document.addEventListener('keydown', onKey);
});
onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointer);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div ref="root" class="account-menu">
    <button class="btn small" type="button" aria-haspopup="menu" :aria-expanded="open" @click="toggle">Switch user<span aria-hidden="true"> ▾</span></button>
    <div v-if="open" class="panel account-popover" role="menu">
      <button ref="logoutButton" class="btn small" type="button" role="menuitem" @click="signOut">Log out</button>
    </div>
  </div>
</template>

<style scoped>
.account-menu { position:relative;flex:none; }
.account-popover { position:absolute;z-index:40;top:calc(100% + 6px);right:0;display:grid;gap:6px;padding:8px;min-width:140px; }
.account-popover .btn { width:100%; }
</style>
