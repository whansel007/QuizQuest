<script setup>
// Signing out is one clear button.
import { signOut } from '../api.js';
</script>

<template>
  <div class="account-menu">
    <button class="btn small" type="button" @click="signOut">Log out</button>
  </div>
</template>

<style scoped>
.account-menu { flex: none; }
</style>
