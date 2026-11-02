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
    <select v-if="(store.home?.classes.length ?? 0) > 1" style="width: auto" aria-label="Class" :value="S.classId" @change="pick">
      <option v-for="c in store.home.classes" :key="c.id" :value="c.id">{{ c.name }}</option>
    </select>
    <span v-else class="badge plain">{{ store.home?.classes[0]?.name || 'No class enrolled' }}</span>

    <button type="button" class="btn small primary" @click="showJoinModal = true">
      + Join Class
    </button>
  </div>

  <!-- Join Class Modal -->
  <Teleport to="body">
    <div v-if="showJoinModal" class="join-class-overlay" @click.self="showJoinModal = false">
      <div class="join-class-card" role="dialog" aria-modal="true" aria-labelledby="join-class-title">
        <h3 id="join-class-title">Join a Class</h3>
        <p class="small muted">Enter the enrolment code given by your professor (e.g. QQ-ABC12).</p>

        <form @submit.prevent="handleJoin($event)">
          <div class="join-class-field">
            <label for="join-code-input">Class Join Code</label>
            <input
              id="join-code-input"
              v-model="joinCode"
              type="text"
              placeholder="e.g. QQ-9X4K2"
              class="join-class-code"
              required
            />
          </div>

          <div class="join-class-actions">
            <button type="button" class="btn join-class-cancel" @click="showJoinModal = false">Cancel</button>
            <button type="submit" class="btn primary join-class-submit" :disabled="loading">
              {{ loading ? 'Joining…' : 'Join Class' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.join-class-overlay {
  position: fixed;
  inset: 0;
  background: rgb(20 38 28 / 68%);
  display: grid;
  place-items: center;
  padding: 16px;
  overflow-y: auto;
  z-index: 100;
}
.join-class-card {
  width: min(400px, 100%);
  padding: 24px;
  color: #23382f;
  background: #fbf2d8 url('/hero-lab/assets/storybook-paper.svg') repeat;
  background-size: 144px 144px;
  border: 2px solid #23382f;
  border-radius: 13px 10px 14px 11px;
  box-shadow: 0 5px 0 #7a6545, 0 14px 32px rgb(6 16 31 / 28%);
  font-family: "Nunito", "Trebuchet MS", system-ui, sans-serif;
}
.join-class-card h3 {
  margin: 0 0 8px;
  color: #254937;
  font: 700 22px/1.2 Georgia, "Palatino Linotype", serif;
}
.join-class-card p { margin: 0 0 14px; color: #536a53; }
.join-class-field { display: grid; gap: 6px; margin-bottom: 18px; }
.join-class-field label { color: #23382f; font-size: 14px; font-weight: 800; }
.join-class-code {
  width: 100%;
  min-height: 44px;
  padding: 9px 11px;
  color: #23382f;
  background: #fff8e4;
  border: 2px solid #7a6545;
  border-radius: 8px;
  font: 600 16px/1.4 ui-monospace, "Cascadia Code", Consolas, monospace;
  letter-spacing: 1px;
  text-transform: uppercase;
}
.join-class-code::placeholder { color: #687553; opacity: 1; }
.join-class-code:focus-visible { outline: 3px solid #f2ba55; outline-offset: 2px; }
.join-class-actions { display: flex; justify-content: flex-end; gap: 8px; }
.join-class-card .join-class-cancel,
.join-class-card .join-class-submit {
  min-height: 44px;
  padding: 8px 14px;
  color: #23382f;
  border: 2px solid #23382f;
  border-radius: 9px;
  font-weight: 800;
  box-shadow: 0 3px 0 #7a6545;
  transition: transform .12s ease, box-shadow .12s ease, background .12s ease;
}
.join-class-card .join-class-cancel { background: #fff8e4; }
.join-class-card .join-class-submit { background: #f2ba55; border-color: #61472d; box-shadow: 0 4px 0 #9b612e; }
.join-class-card .join-class-cancel:hover,
.join-class-card .join-class-submit:hover:not(:disabled) { transform: translateY(-1px); }
.join-class-card .join-class-cancel:active,
.join-class-card .join-class-submit:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #7a6545; }
.join-class-card button:focus-visible { outline: 3px solid #f2ba55; outline-offset: 2px; }
@media (max-width: 480px) {
  .join-class-card { padding: 20px 16px; }
}
</style>
