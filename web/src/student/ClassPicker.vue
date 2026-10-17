<script setup>
// ============================================================
// Student Class Picker with Join Class Code Feature
// Switch between enrolled classes or enter a join code.
// ============================================================
import { ref } from 'vue';
import { S, api, rerender } from '../api.js';
import { store, loadHome } from './home.js';
import { toast, action } from '../ui.js';

const showJoinModal = ref(false);
const joinCode = ref('');
const loading = ref(false);

function pick(e) {
  S.classId = e.target.value;
  rerender();
}

const handleJoin = action(async () => {
  if (!joinCode.value.trim()) throw new Error('Please enter a join code.');
  loading.value = true;
  try {
    const res = await api('POST', '/api/classes/join', { code: joinCode.value.trim() });
    toast(`Successfully enrolled in ${res.class?.name || 'class'}!`);
    joinCode.value = '';
    showJoinModal.value = false;
    await loadHome();
    if (res.class?.id) {
      S.classId = res.class.id;
    }
    rerender();
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div style="display: inline-flex; align-items: center; gap: 8px;">
    <select v-if="store.home.classes.length > 1" style="width: auto" aria-label="Class" :value="S.classId" @change="pick">
      <option v-for="c in store.home.classes" :key="c.id" :value="c.id">{{ c.name }}</option>
    </select>
    <span v-else class="badge plain">{{ store.home.classes[0]?.name || 'No class enrolled' }}</span>

    <button type="button" class="btn small primary" @click="showJoinModal = true">
      + Join Class
    </button>
  </div>

  <!-- Join Class Modal -->
  <div v-if="showJoinModal" class="modal-overlay" @click.self="showJoinModal = false">
    <div class="modal-card">
      <h3 style="margin-top: 0;">Join a Class</h3>
      <p class="small muted">Enter the enrolment code given by your professor (e.g. QQ-ABC12).</p>

      <form @submit.prevent="handleJoin($event)">
        <div class="field" style="margin-bottom: 16px;">
          <label for="join-code-input">Class Join Code</label>
          <input
            id="join-code-input"
            v-model="joinCode"
            type="text"
            placeholder="e.g. QQ-9X4K2"
            style="font-family: monospace; text-transform: uppercase; font-size: 16px; letter-spacing: 1px;"
            required
          />
        </div>

        <div class="row" style="justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn" @click="showJoinModal = false">Cancel</button>
          <button type="submit" class="btn primary" :disabled="loading">
            {{ loading ? 'Joining…' : 'Join Class' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-card {
  background: var(--panel);
  border-radius: var(--radius);
  border: 1px solid var(--line);
  padding: 24px;
  width: 100%;
  max-width: 400px;
  box-shadow: var(--shadow);
}
</style>
