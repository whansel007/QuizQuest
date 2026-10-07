<script setup>
import { store } from './home.js';
</script>

<template>
  <span v-if="store.home" class="badge" :title="`Earned today: ${store.home.wallet.earnedToday}/${store.home.wallet.dailyCap}`">🪙 {{ store.home.wallet.balance }}</span>
</template>
