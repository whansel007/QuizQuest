<script setup>
// Demo sign-in: pick a synthetic user (no passwords). See PROTOTYPE.md.
import { ref, onMounted } from 'vue';
import { api, signIn } from './api.js';
import { action } from './ui.js';

const users = ref(null);
const error = ref('');
async function load() {
  error.value = '';
  try {
    users.value = await api('GET', '/api/demo-users');
  } catch (err) {
    error.value = err.message;
  }
}
onMounted(load);
const pick = (u) => action(() => signIn(u.id));
const groups = [['teacher', 'Professors'], ['student', 'Students']];
</script>

<template>
  <template v-if="error">
    <div class="note bad">{{ error }}</div>
    <button class="btn" @click="load">Retry sign-in</button>
  </template>
  <template v-else-if="users">
    <div class="panel">
      <h2>Pick a demo user</h2>
      <p class="muted">This prototype uses synthetic accounts with no passwords. The real build would use proper sign-in, with professor access assigned by an administrator. Tip: open several browser tabs to be a professor and a few students at once - try the World with two students.</p>
    </div>
    <div v-for="[role, title] in groups" :key="role" class="panel">
      <h3>{{ title }}</h3>
      <div class="login-grid">
        <button v-for="u in users.filter((x) => x.role === role)" :key="u.id" @click="pick(u)($event)">
          <b>{{ u.name }}</b><span class="small muted">{{ u.note }}</span>
        </button>
      </div>
    </div>
  </template>
</template>
