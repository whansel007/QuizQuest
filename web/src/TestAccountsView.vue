<script setup>
// Test accounts page (#test-accounts): the seeded demo users with their
// emails. Selecting one fills the regular password sign-in form.
import QuizQuestLogo from './components/QuizQuestLogo.vue';

defineProps({ users: { type: Array, default: null }, error: { type: String, default: '' } });
defineEmits(['back', 'retry', 'fill']);

const groups = [['teacher', 'Professors'], ['student', 'Students']];
// "Student 07" -> 07, "Prof. Demo A" -> DA
const initials = (name) => name.match(/\d+$/)?.[0] || name.replace(/^Prof\.\s*/, '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
</script>

<template>
  <section class="qq-accounts">
    <div class="qq-accounts-top">
      <button type="button" class="qq-back" @click="$emit('back')"><span aria-hidden="true">←</span> Back to sign in</button>
      <QuizQuestLogo :size="34" />
    </div>
    <div class="qq-card qq-card-wide">
      <h2>Test accounts</h2>
      <p class="qq-sub">
        Synthetic demo users for development and testing. Every account uses the password
        <code class="qq-pass">quizquest</code>. Select an account to fill the sign-in form.
      </p>

      <template v-if="error">
        <p class="qq-error" role="alert">{{ error }}</p>
        <button type="button" class="qq-btn qq-btn-small" @click="$emit('retry')">Retry loading demo accounts</button>
      </template>
      <p v-else-if="!users" class="qq-sub">Loading accounts…</p>
      <template v-else>
        <div v-for="[role, title] in groups" :key="role">
          <h3 class="qq-group">{{ title }}</h3>
          <div class="qq-acc-grid">
            <div v-for="u in users.filter((x) => x.role === role)" :key="u.id" class="qq-acc" :class="'qq-acc-' + role">
              <button type="button" class="qq-acc-main" @click="$emit('fill', u.email)">
                <span class="qq-avatar" aria-hidden="true">{{ initials(u.name) }}</span>
                <span class="qq-acc-text">
                  <b>{{ u.name }}</b>
                  <span class="qq-acc-email">{{ u.email }}</span>
                  <span class="qq-acc-note">{{ u.note }}</span>
                </span>
              </button>
              <button type="button" class="qq-acc-fill" :aria-label="`Fill the sign-in form with ${u.email}`" @click="$emit('fill', u.email)">Use account</button>
            </div>
          </div>
        </div>
        <p class="qq-sub qq-tip">Tip: each browser tab keeps its own sign-in. Open a professor and a couple of students side by side, then try the World with two students.</p>
      </template>
    </div>
  </section>
</template>
