<script setup>
// Sign-in page, in two steps: email, then password (the card slides
// between them). "Create an account" swaps in a one-step sign-up form
// (students only; teacher accounts are set up by the team). A small "Test accounts" button opens #test-accounts,
// shown only while the server offers demo login (not in production).
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { api, signIn, signUp } from './api.js';
import QuizQuestLogo from './components/QuizQuestLogo.vue';
import TestAccountsView from './TestAccountsView.vue';

// ---- two pages without a router: the form, and #test-accounts ----
const ACCOUNTS = '#test-accounts';
const page = ref(location.hash === ACCOUNTS ? 'accounts' : 'signin');
const syncPage = () => (page.value = location.hash === ACCOUNTS ? 'accounts' : 'signin');
function go(to) {
  if (to === 'accounts') location.hash = ACCOUNTS; // hashchange syncs the page
  else {
    history.pushState(null, '', location.pathname + location.search);
    page.value = 'signin';
  }
}

// ---- the form ----
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 8; // same as the server's passwords.js
const step = ref('email'); // 'email' | 'password' | 'signup'
const name = ref('');
const nameInput = ref(null);
const forward = ref(true); // slide direction
const email = ref('');
const password = ref('');
const showPassword = ref(false);
const error = ref('');
const busy = ref(false);
const emailInput = ref(null);
const passwordInput = ref(null);
const initial = computed(() => (email.value.trim()[0] || '?').toUpperCase());

function focusStep() {
  ({ email: emailInput, password: passwordInput, signup: nameInput })[step.value].value?.focus();
}
function next() {
  error.value = '';
  const e = email.value.trim();
  if (!e) error.value = 'Enter your email to continue.';
  else if (!EMAIL_RE.test(e)) error.value = "That doesn't look like an email address.";
  else {
    forward.value = true;
    step.value = 'password';
  }
}
function back() {
  error.value = '';
  password.value = '';
  showPassword.value = false;
  forward.value = false;
  step.value = 'email';
}
async function submit() {
  error.value = '';
  if (!password.value) {
    error.value = 'Enter your password.';
    return;
  }
  busy.value = true;
  try {
    await signIn({ email: email.value.trim(), password: password.value });
  } catch (err) {
    error.value = err.message;
    password.value = '';
    passwordInput.value?.focus();
  } finally {
    busy.value = false;
  }
}
function toSignup() {
  error.value = '';
  password.value = '';
  showPassword.value = false;
  forward.value = true;
  step.value = 'signup';
}
async function register() {
  error.value = '';
  const e = email.value.trim();
  if (!name.value.trim()) error.value = 'Enter your name.';
  else if (!EMAIL_RE.test(e)) error.value = "That doesn't look like an email address.";
  else if (password.value.length < PASSWORD_MIN) error.value = `Use a password of at least ${PASSWORD_MIN} characters.`;
  if (error.value) return;
  busy.value = true;
  try {
    await signUp({ name: name.value.trim(), email: e, password: password.value });
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}
// "Fill form" on the test accounts page
function fill(address) {
  email.value = address;
  password.value = '';
  error.value = '';
  forward.value = true;
  step.value = 'password';
  go('signin');
}
watch(page, (p) => p === 'signin' && nextTick(focusStep));

// ---- seeded synthetic test accounts ----
const users = ref(null);
const demoError = ref('');
async function loadDemo() {
  demoError.value = '';
  try {
    users.value = await api('GET', '/api/demo-users');
  } catch (err) {
    if (err.status !== 404) demoError.value = err.message;
    else if (page.value === 'accounts') go('signin');
  }
}

onMounted(() => {
  addEventListener('hashchange', syncPage);
  loadDemo();
});
onBeforeUnmount(() => removeEventListener('hashchange', syncPage));

const floaters = ['?', '★', '✓', 'A', '+', '!', '◆', '?'];
</script>

<template>
  <div class="qq-login">
    <div class="qq-bg" aria-hidden="true">
      <span v-for="(g, i) in floaters" :key="i" :class="'qq-float qq-float-' + (i + 1)">{{ g }}</span>
    </div>

    <section v-if="page === 'signin'" class="qq-shell">
      <!-- left: the illustrated panel -->
      <div class="qq-art">
        <span class="qq-planet qq-planet-1" aria-hidden="true" />
        <span class="qq-planet qq-planet-2" aria-hidden="true" />
        <span class="qq-planet qq-planet-3" aria-hidden="true" />
        <span class="qq-planet qq-planet-4" aria-hidden="true" />
        <div class="qq-scene" aria-hidden="true">
          <span class="qq-scene-glow" />
          <span class="qq-bubble qq-bubble-l">? ? ?</span>
          <span class="qq-bubble qq-bubble-r">✓ ★ ✓</span>
          <QuizQuestLogo :size="170" class="qq-scene-logo" />
          <span class="qq-badge qq-badge-1">🎯</span>
          <span class="qq-badge qq-badge-2">🐣</span>
          <span class="qq-badge qq-badge-3">⚔️</span>
        </div>
        <h1 class="qq-hero-title">Learn. Level up. <span>Conquer the quest.</span></h1>
        <ul class="qq-perks">
          <li><span class="qq-perk-icon qq-perk-1" aria-hidden="true">🎯</span>Practice that adapts to your weaker topics</li>
          <li><span class="qq-perk-icon qq-perk-2" aria-hidden="true">🐣</span>Hatch pets and build your own kingdom</li>
          <li><span class="qq-perk-icon qq-perk-3" aria-hidden="true">⚔️</span>Team up with classmates to beat the raid boss</li>
        </ul>
      </div>

      <!-- right: the form -->
      <div class="qq-card">
        <QuizQuestLogo :size="48" class="qq-card-logo" />
        <div class="qq-progress" aria-hidden="true">
          <span class="on" />
          <span :class="{ on: step !== 'email' }" />
        </div>

        <Transition :name="forward ? 'qq-step' : 'qq-step-back'" mode="out-in" @after-enter="focusStep">
          <form v-if="step === 'email'" key="email" novalidate @submit.prevent="next">
            <h2>Log in to your account</h2>
            <p class="qq-sub">Welcome back! Sign in to continue your quest.</p>
            <label for="login-email" class="qq-label">Email</label>
            <input id="login-email" ref="emailInput" v-model="email" class="qq-input" type="email" autocomplete="username" placeholder="you@school.edu" autofocus @input="error = ''">
            <p v-if="error" class="qq-error" role="alert">{{ error }}</p>
            <button type="submit" class="qq-btn">Continue <span class="qq-arrow" aria-hidden="true">→</span></button>
          </form>

          <form v-else-if="step === 'signup'" key="signup" novalidate @submit.prevent="register">
            <h2>Create your account</h2>
            <p class="qq-sub">Students can sign up here. Teachers, ask the team for an account.</p>
            <label for="signup-name" class="qq-label">Name</label>
            <input id="signup-name" ref="nameInput" v-model="name" class="qq-input" type="text" autocomplete="name" maxlength="60" @input="error = ''">
            <label for="signup-email" class="qq-label">Email</label>
            <input id="signup-email" v-model="email" class="qq-input" type="email" autocomplete="email" placeholder="you@school.edu" @input="error = ''">
            <label for="signup-password" class="qq-label">Password</label>
            <div class="qq-pw">
              <input id="signup-password" v-model="password" class="qq-input" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" :placeholder="`At least ${PASSWORD_MIN} characters`" @input="error = ''">
              <button type="button" class="qq-eye" aria-label="Show password" :aria-pressed="showPassword" @click="showPassword = !showPassword">{{ showPassword ? 'Hide' : 'Show' }}</button>
            </div>
            <p v-if="error" class="qq-error" role="alert">{{ error }}</p>
            <button type="submit" class="qq-btn" :disabled="busy">
              <span v-if="busy" class="qq-spinner" aria-hidden="true" />
              {{ busy ? 'Creating account…' : 'Create account' }}
              <span v-if="!busy" class="qq-arrow" aria-hidden="true">→</span>
            </button>
            <button type="button" class="qq-link" @click="back">Already have an account? Sign in</button>
          </form>

          <form v-else key="password" novalidate @submit.prevent="submit">
            <button type="button" class="qq-chip" :aria-label="`Change email (${email.trim()})`" @click="back">
              <span class="qq-avatar" aria-hidden="true">{{ initial }}</span>
              <span class="qq-chip-email">{{ email.trim() }}</span>
              <span class="qq-chip-change" aria-hidden="true">Change</span>
            </button>
            <h2>Enter your password</h2>
            <p class="qq-sub">Almost there. Your adventure awaits.</p>
            <!-- lets password managers pair the password with the email -->
            <input type="email" autocomplete="username" :value="email.trim()" class="qq-hidden" tabindex="-1" aria-hidden="true" readonly>
            <label for="login-password" class="qq-label">Password</label>
            <div class="qq-pw">
              <input id="login-password" ref="passwordInput" v-model="password" class="qq-input" :type="showPassword ? 'text' : 'password'" autocomplete="current-password" @input="error = ''">
              <button type="button" class="qq-eye" aria-label="Show password" :aria-pressed="showPassword" @click="showPassword = !showPassword">{{ showPassword ? 'Hide' : 'Show' }}</button>
            </div>
            <p v-if="error" class="qq-error" role="alert">{{ error }}</p>
            <button type="submit" class="qq-btn" :disabled="busy">
              <span v-if="busy" class="qq-spinner" aria-hidden="true" />
              {{ busy ? 'Signing in…' : 'Sign in' }}
              <span v-if="!busy" class="qq-arrow" aria-hidden="true">→</span>
            </button>
          </form>
        </Transition>

        <div class="qq-card-foot">
          <p v-if="step !== 'signup'" class="qq-register">Not registered yet? <button type="button" class="qq-inline-link" @click="toSignup">Create a student account</button></p>
          <button v-if="users || demoError" type="button" class="qq-link" @click="go('accounts')"><span aria-hidden="true">🧪</span> Test accounts</button>
        </div>
      </div>
    </section>

    <TestAccountsView v-else :users="users" :error="demoError" @back="go('signin')" @retry="loadDemo" @fill="fill" />

    <p class="qq-foot">
      Demo build with synthetic users and demo course content only. Do not enter real student data.
      · <a href="/tag">Circle Tag</a>
    </p>
  </div>
</template>
