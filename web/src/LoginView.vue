<script setup>
// Sign-in page, in two steps: email, then password (the card slides
// between them). "Create an account" swaps in a one-step sign-up form
// (students only; teacher accounts are set up by the team). Synthetic test
// accounts are available from Tools after entering the Konami code.
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { api, signIn, signUp } from './api.js';
import QuizQuestLogo from './components/QuizQuestLogo.vue';
import LoginPreview from './components/LoginPreview.vue';
import TestAccountsView from './TestAccountsView.vue';
import packageJson from '../../package.json';

// ---- two pages without a router: the form, and #test-accounts ----
const ACCOUNTS = '#test-accounts';
const page = ref('signin');
const debugUnlocked = ref(false);
const versionOpen = ref(false);
const versionDialog = ref(null);
const version = packageJson.version;
const debugCode = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter'];
let debugPosition = 0;
const syncPage = () => {
  if (location.hash === ACCOUNTS && !debugUnlocked.value) {
    history.replaceState(null, '', location.pathname + location.search);
    page.value = 'signin';
  } else page.value = location.hash === ACCOUNTS ? 'accounts' : 'signin';
};
function go(to) {
  if (to === 'accounts' && debugUnlocked.value) location.hash = ACCOUNTS; // hashchange syncs the page
  else {
    history.pushState(null, '', location.pathname + location.search);
    page.value = 'signin';
  }
}
async function openTools() {
  debugPosition = 0;
  versionOpen.value = true;
  await nextTick();
  versionDialog.value?.focus();
}
function enterDebugCode(event) {
  if (!versionOpen.value) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.key === 'Escape') {
    versionOpen.value = false;
    debugPosition = 0;
    return;
  }
  if (event.repeat) return;
  const key = event.code === 'KeyB' ? 'b' : event.code === 'KeyA' ? 'a' : event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (key === debugCode[debugPosition]) {
    debugPosition++;
    if (debugPosition === debugCode.length) {
      debugPosition = 0;
      debugUnlocked.value = true;
      versionOpen.value = false;
      void loadDemo().then(() => go('accounts'));
    }
  } else debugPosition = key === debugCode[0] ? 1 : 0;
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
  const el = ({ email: emailInput, password: passwordInput, signup: nameInput })[step.value].value;
  if (!el) return;
  // The card slides in before the field is focused, so the user may already
  // be typing in one of the fields. Never pull the focus away from them.
  const active = document.activeElement;
  if (active && active !== document.body && active !== el) return;
  el.focus();
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
  addEventListener('keydown', enterDebugCode, true);
  syncPage();
});
onBeforeUnmount(() => {
  removeEventListener('hashchange', syncPage);
  removeEventListener('keydown', enterDebugCode, true);
});

const floaters = ['?', '★', '✓', 'A', '+', '!', '◆', '?'];
</script>

<template>
  <div class="qq-login" :class="{ 'qq-story': page === 'signin' }">
    <div v-if="page !== 'signin'" class="qq-bg" aria-hidden="true">
      <span v-for="(g, i) in floaters" :key="i" :class="'qq-float qq-float-' + (i + 1)">{{ g }}</span>
    </div>

    <!-- full-page sign-in: the storybook page with the form on the left, a
         living forest preview on the right behind a soft curved edge -->
    <section v-if="page === 'signin'" class="qq-split">
      <div class="qq-form-side">
        <div class="qq-form-col">
          <h1 class="qq-title"><QuizQuestLogo :size="58" class="qq-title-logo" /><span class="sr-only">QuizQuest</span></h1>
          <p class="qq-tagline">A storybook quest where your class learns together around the campfire.</p>
          <div class="qq-card">
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
              <button type="button" class="qq-link" aria-label="Tools and version" title="Tools and version" @click="openTools">🔧</button>
            </div>
          </div>
        </div>
        <p class="qq-foot">
          Demo build with synthetic users and demo course content only. Do not enter real student data.
          · <a href="/tag">Circle Tag</a>
        </p>
      </div>
      <div class="qq-preview-side">
        <div class="qq-preview-clip"><LoginPreview /></div>
      </div>
    </section>

    <TestAccountsView v-else :users="users" :error="demoError" @back="go('signin')" @retry="loadDemo" @fill="fill" />

    <section v-if="versionOpen" ref="versionDialog" class="qq-debug-backdrop" role="dialog" aria-modal="true" aria-labelledby="login-version-title" tabindex="-1" @click.self="versionOpen = false">
      <div class="qq-debug-panel">
        <button class="qq-debug-close" type="button" aria-label="Close tools and version" @click="versionOpen = false; debugPosition = 0">×</button>
        <h2 id="login-version-title">QuizQuest v{{ version }}</h2>
      </div>
    </section>

    <p v-if="page !== 'signin'" class="qq-foot">
      Demo build with synthetic users and demo course content only. Do not enter real student data.
      · <a href="/tag">Circle Tag</a>
    </p>
  </div>
</template>


<style scoped>
/* ---- full-page storybook sign-in (BRANDBOOK: parchment, ink, campfire gold) ---- */
.qq-login.qq-story {
  --qq-ink: #23382F;
  --qq-muted: #5F6D58;
  --qq-card: #FFF8E4;
  --qq-line: #C9BA93;
  --qq-field: #FFFDF5;
  --qq-violet: #254937; /* links and focus rings */
  --qq-bad: #9A2F28;
  --qq-bad-soft: #F7E0D7;
  display: block;
  padding: 0;
  gap: 0;
  color: var(--qq-ink);
  background: #FBF2D8 url('/hero-lab/assets/storybook-paper.svg') repeat;
  background-size: 160px 160px;
}
.qq-split { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); min-height: 100vh; min-height: 100dvh; }
.qq-form-side { position: relative; z-index: 2; display: flex; flex-direction: column; justify-content: center; width: 60%; min-height: 100vh; min-height: 100dvh; padding: 40px clamp(24px, 6vw, 96px) 18px; }
.qq-form-col { width: min(460px, 100%); margin: auto 0; }
.qq-title { margin: 0 0 6px; }
.qq-title :deep(.qq-logo-word) { color: var(--qq-ink); }
.qq-title :deep(.qq-logo-word span) { color: #B86E1E; }
.qq-title :deep(.qq-logo-mark) { filter: drop-shadow(0 4px 0 rgb(122 101 69 / 45%)); }
.qq-tagline { margin: 0 0 22px; color: var(--qq-muted); font-size: 17px; line-height: 1.45; }
.qq-story .qq-card { padding: 26px 28px 18px; background: var(--qq-card); border: 3px solid var(--qq-ink); border-radius: 16px 13px 17px 14px; box-shadow: 0 6px 0 #7A6545; backdrop-filter: none; }
.qq-story .qq-card h2 { color: #254937; font: 700 30px/1.15 Georgia, 'Palatino Linotype', serif; }
.qq-story .qq-sub { color: var(--qq-muted); }
.qq-story .qq-progress span { background: #E8DDBF; }
.qq-story .qq-progress span::after { background: #F2BA55; }
.qq-story .qq-input { color: var(--qq-ink); background: var(--qq-field); border: 2px solid #7A6545; border-radius: 9px; }
.qq-story .qq-input:focus { border-color: var(--qq-ink); box-shadow: 0 0 0 4px rgb(242 186 85 / 55%); }
.qq-story .qq-btn { color: #23382F; background: #F2BA55; border: 3px solid #23382F; border-radius: 10px 9px 11px 9px; box-shadow: 0 4px 0 #7A6545; text-shadow: none; }
.qq-story .qq-btn::before { display: none; }
.qq-story .qq-btn:hover:not(:disabled) { background: #F7C96E; box-shadow: 0 5px 0 #7A6545; transform: translateY(-1px); }
.qq-story .qq-btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 #7A6545; }
.qq-story .qq-spinner { border-color: rgb(35 56 47 / 25%); border-top-color: #23382F; }
.qq-story .qq-chip { color: var(--qq-ink); background: var(--qq-field); border-color: #C9BA93; }
.qq-story .qq-avatar { color: #23382F; background: #F2BA55; }
.qq-story .qq-chip-change { color: #254937; background: #E2EED6; }
.qq-story .qq-eye { color: #254937; }
.qq-story .qq-error { color: var(--qq-bad); background: var(--qq-bad-soft); border-color: #DCAAA2; }
.qq-story .qq-link { color: #254937; }
.qq-story .qq-link:hover, .qq-story .qq-link:focus-visible { color: #23382F; background: rgb(242 186 85 / 30%); }
.qq-story :is(button, a, input):focus-visible { outline: 3px solid #254937; outline-offset: 2px; }
.qq-story .qq-foot { position: static; margin: 22px 0 0; color: var(--qq-muted); text-align: left; }
.qq-story .qq-foot a { color: #254937; }
/* the preview fills the right of the page; its curved edge bulges into the
   paper side, behind the form column's padding, never across the text */
.qq-preview-side { position: absolute; z-index: 1; top: 0; right: 0; bottom: 0; width: 46%; filter: drop-shadow(-6px 0 14px rgb(35 56 47 / 28%)); pointer-events: none; }
.qq-preview-clip { position: absolute; inset: 0; clip-path: ellipse(100% 82% at 100% 50%); }
.qq-preview-clip::after { content: ''; position: absolute; inset: 0; box-shadow: inset 18px 0 30px -18px rgb(251 242 216 / 70%); }
@media (max-width: 980px) {
  .qq-form-side { width: 62%; padding-inline: 32px 40px; }
  .qq-preview-side { width: 44%; }
}
/* narrow screens: the form comes first; the forest becomes a short band on top */
@media (max-width: 760px) {
  .qq-split { grid-template-rows: auto 1fr; }
  .qq-preview-side { position: relative; order: -1; width: 100%; height: 190px; filter: drop-shadow(0 6px 10px rgb(35 56 47 / 24%)); }
  .qq-preview-clip { clip-path: ellipse(90% 100% at 50% 0%); }
  .qq-preview-clip::after { box-shadow: none; }
  .qq-form-side { width: 100%; min-height: 0; padding: 18px 16px 18px; }
  .qq-form-col { margin: 0 auto; }
  .qq-tagline { font-size: 15px; margin-bottom: 16px; }
  .qq-story .qq-card { padding: 20px 18px 14px; }
  .qq-story .qq-card h2 { font-size: 25px; }
}
.qq-debug-backdrop { position:fixed;z-index:50;inset:0;background:#101322bb;display:grid;place-items:center;padding:16px; }
.qq-debug-panel { position:relative;width:min(320px,100%);min-height:110px;padding:24px;border-radius:18px;background:var(--qq-card,#fff);color:var(--qq-ink,#13213f);display:grid;place-items:center;box-shadow:0 20px 80px #0005;border:1px solid var(--qq-line,#dbe6f6); }
.qq-debug-close { position:absolute;top:10px;right:10px;border:0;background:transparent;font-size:24px;cursor:pointer; }
</style>
