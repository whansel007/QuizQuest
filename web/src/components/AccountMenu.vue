<script setup>
// Signing out is one clear button. `icon`: just an exit-door icon (the
// professor sidebar, which narrows to a rail); "Log out" stays as its
// screen-reader name and tooltip.
import { signOut } from '../api.js';

defineProps({ icon: { type: Boolean, default: false } });
</script>

<template>
  <div class="account-menu">
    <button v-if="icon" class="btn small account-logout" type="button" title="Log out" @click="signOut">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="m15 8 4 4-4 4M19 12H9" /></svg>
      <span class="sr-only">Log out</span>
    </button>
    <button v-else class="btn small" type="button" @click="signOut">Log out</button>
  </div>
</template>

<style scoped>
.account-menu { flex: none; }
/* .account-menu .btn: outranks the teacher app's padding for small buttons */
.account-menu .btn.account-logout { display: grid; place-items: center; width: 36px; height: 36px; min-height: 0; padding: 0; }
@media (pointer: coarse) { .account-menu .btn.account-logout { width: 44px; height: 44px; } }
.account-logout svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
.account-logout:hover, .account-logout:focus-visible { color: var(--bad); border-color: var(--bad); }
</style>
