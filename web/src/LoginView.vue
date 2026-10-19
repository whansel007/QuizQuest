<script setup>
// ============================================================
// QuizQuest Authentication View
// Supports: Email/Password login, Student Registration,
// Password Reset, and 1-click Demo Account picker.
// ============================================================
import { ref, onMounted } from 'vue';
import { api, signIn, register, resetPassword } from './api.js';
import { action, toast } from './ui.js';

const activeTab = ref('login'); // 'login' | 'register' | 'demo' | 'reset-password'
const users = ref(null);
const loading = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

// Login Form
const loginEmail = ref('');
const loginPassword = ref('');
const showLoginPassword = ref(false);
const showForgotPassword = ref(false);
const forgotEmail = ref('');

// Registration Form
const regName = ref('');
const regEmail = ref('');
const regPassword = ref('');
const regConfirm = ref('');
const showRegPassword = ref(false);

// Password Reset Form (when user arrives via Supabase email recovery link)
const recoveryToken = ref('');
const newPassword = ref('');
const newPasswordConfirm = ref('');
const showNewPassword = ref(false);

function checkAuthUrlCallback() {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  const search = window.location.search.startsWith('?') ? window.location.search.slice(1) : window.location.search;

  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(search);

  const error = hashParams.get('error') || searchParams.get('error');
  const errorCode = hashParams.get('error_code') || searchParams.get('error_code');
  const rawDesc = hashParams.get('error_description') || searchParams.get('error_description');

  if (error || errorCode) {
    const desc = rawDesc ? decodeURIComponent(rawDesc.replace(/\+/g, ' ')) : '';
    errorMsg.value = `Password reset link is invalid or has expired (${desc || errorCode || error}). Please enter your account email below to send a fresh reset link.`;
    showForgotPassword.value = true;
    activeTab.value = 'login';
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
    return;
  }

  const accessToken = hashParams.get('access_token');
  const type = hashParams.get('type');
  const code = searchParams.get('code');

  if (accessToken && (type === 'recovery' || hash.includes('recovery') || !type)) {
    recoveryToken.value = accessToken;
    activeTab.value = 'reset-password';
    successMsg.value = 'Password recovery link verified! Please enter your new password below.';
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  } else if (code) {
    recoveryToken.value = code;
    activeTab.value = 'reset-password';
    successMsg.value = 'Recovery authorization code detected. Please set your new password.';
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }
}

async function loadDemoUsers() {
  try {
    users.value = await api('GET', '/api/demo-users');
  } catch (err) {
    console.error('Failed to load demo users:', err);
  }
}

onMounted(() => {
  loadDemoUsers();
  checkAuthUrlCallback();
});

const handleLogin = action(async () => {
  errorMsg.value = '';
  successMsg.value = '';
  if (!loginEmail.value.trim() || !loginPassword.value) {
    throw new Error('Please enter both email and password.');
  }
  loading.value = true;
  try {
    await signIn({
      email: loginEmail.value.trim(),
      password: loginPassword.value,
    });
  } catch (err) {
    errorMsg.value = err.message || 'Login failed.';
    throw err;
  } finally {
    loading.value = false;
  }
});

const handleRegister = action(async () => {
  errorMsg.value = '';
  successMsg.value = '';
  if (!regName.value.trim()) throw new Error('Please enter your full name.');
  if (!regEmail.value.trim()) throw new Error('Please enter your email address.');
  if (!regPassword.value || regPassword.value.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  if (regPassword.value !== regConfirm.value) {
    throw new Error('Passwords do not match.');
  }

  loading.value = true;
  try {
    await register({
      name: regName.value.trim(),
      email: regEmail.value.trim(),
      password: regPassword.value,
    });
    toast('Account created successfully! Welcome to QuizQuest.');
  } catch (err) {
    errorMsg.value = err.message || 'Registration failed.';
    throw err;
  } finally {
    loading.value = false;
  }
});

const handleForgotPassword = action(async () => {
  if (!forgotEmail.value.trim()) throw new Error('Please enter your account email.');
  loading.value = true;
  try {
    const res = await api('POST', '/api/auth/forgot-password', {
      email: forgotEmail.value.trim(),
      redirectTo: window.location.origin,
    });
    successMsg.value = res.message || 'Password reset link sent if account exists.';
    showForgotPassword.value = false;
    toast(successMsg.value);
  } catch (err) {
    errorMsg.value = err.message;
    throw err;
  } finally {
    loading.value = false;
  }
});

const handleSetNewPassword = action(async () => {
  errorMsg.value = '';
  successMsg.value = '';
  if (!newPassword.value || newPassword.value.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  if (newPassword.value !== newPasswordConfirm.value) {
    throw new Error('Passwords do not match.');
  }
  loading.value = true;
  try {
    await resetPassword({
      accessToken: recoveryToken.value,
      newPassword: newPassword.value,
    });
    toast('Password updated successfully! Welcome back.');
  } catch (err) {
    errorMsg.value = err.message || 'Failed to update password.';
    throw err;
  } finally {
    loading.value = false;
  }
});

const pickDemo = (u) => action(() => signIn(u.id));
const groups = [['teacher', 'Professors'], ['student', 'Students']];
</script>

<template>
  <div class="auth-container">
    <div class="panel auth-hero">
      <div class="auth-badge">QuizQuest Platform</div>
      <h2>Welcome to Prince William's Quest</h2>
      <p class="muted">
        Adaptive gamified quiz platform. Sign in with your registered account, create a new student account, or choose a pre-configured demo user.
      </p>

      <div class="auth-tabs">
        <button
          v-if="activeTab === 'reset-password'"
          type="button"
          class="auth-tab-btn active"
        >
          Set New Password
        </button>
        <button
          type="button"
          :class="['auth-tab-btn', { active: activeTab === 'login' }]"
          @click="activeTab = 'login'; errorMsg = ''; successMsg = '';"
        >
          Sign In
        </button>
        <button
          type="button"
          :class="['auth-tab-btn', { active: activeTab === 'register' }]"
          @click="activeTab = 'register'; errorMsg = ''; successMsg = '';"
        >
          Create Account
        </button>
        <button
          type="button"
          :class="['auth-tab-btn', { active: activeTab === 'demo' }]"
          @click="activeTab = 'demo'; errorMsg = ''; successMsg = '';"
        >
          Demo Accounts
        </button>
      </div>
    </div>

    <!-- Notifications -->
    <div v-if="errorMsg" class="note bad" style="margin-bottom: 16px;">
      {{ errorMsg }}
    </div>
    <div v-if="successMsg" class="note good" style="margin-bottom: 16px;">
      {{ successMsg }}
    </div>

    <!-- 1. SIGN IN FORM -->
    <div v-if="activeTab === 'login'" class="panel auth-card">
      <template v-if="!showForgotPassword">
        <h3>Account Sign In</h3>
        <p class="small muted">Enter your email and password to access your dashboard.</p>

        <form @submit.prevent="handleLogin($event)">
          <div class="field" style="margin-bottom: 14px;">
            <label for="login-email">Email Address</label>
            <input
              id="login-email"
              v-model="loginEmail"
              type="email"
              placeholder="e.g. student01@quizquest.edu or prof.a@quizquest.edu"
              autocomplete="email"
              required
            />
          </div>

          <div class="field" style="margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
              <label for="login-password" style="margin-bottom: 0;">Password</label>
              <button
                type="button"
                class="link-btn small"
                @click="showLoginPassword = !showLoginPassword"
              >
                {{ showLoginPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
            <input
              id="login-password"
              v-model="loginPassword"
              :type="showLoginPassword ? 'text' : 'password'"
              placeholder="••••••••"
              autocomplete="current-password"
              required
            />
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 18px;">
            <button
              type="button"
              class="link-btn small"
              @click="showForgotPassword = true; forgotEmail = loginEmail;"
            >
              Forgot password?
            </button>
            <button type="submit" class="btn primary" :disabled="loading">
              {{ loading ? 'Signing in…' : 'Sign In' }}
            </button>
          </div>
        </form>

        <div class="auth-footer-prompt">
          <span class="muted small">Don't have an account yet?</span>
          <button type="button" class="link-btn small" @click="activeTab = 'register'">
            Register as a Student
          </button>
        </div>
      </template>

      <!-- Forgot Password Subform -->
      <template v-else>
        <h3>Reset Password</h3>
        <p class="small muted">Enter your email and we'll send you recovery instructions.</p>

        <form @submit.prevent="handleForgotPassword($event)">
          <div class="field" style="margin-bottom: 14px;">
            <label for="forgot-email">Account Email</label>
            <input
              id="forgot-email"
              v-model="forgotEmail"
              type="email"
              placeholder="student@quizquest.edu"
              required
            />
          </div>

          <div class="row" style="justify-content: flex-end; margin-top: 16px;">
            <button type="button" class="btn" @click="showForgotPassword = false">Cancel</button>
            <button type="submit" class="btn primary" :disabled="loading">
              {{ loading ? 'Sending…' : 'Send Reset Link' }}
            </button>
          </div>
        </form>
      </template>
    </div>

    <!-- 2. STUDENT REGISTRATION FORM -->
    <div v-if="activeTab === 'register'" class="panel auth-card">
      <h3>Student Registration</h3>
      <p class="small muted">Create your student account. Professor accounts are provisioned by course administration.</p>

      <form @submit.prevent="handleRegister($event)">
        <div class="field" style="margin-bottom: 14px;">
          <label for="reg-name">Full Name</label>
          <input
            id="reg-name"
            v-model="regName"
            type="text"
            placeholder="e.g. Alex Tan"
            required
          />
        </div>

        <div class="field" style="margin-bottom: 14px;">
          <label for="reg-email">Email Address</label>
          <input
            id="reg-email"
            v-model="regEmail"
            type="email"
            placeholder="e.g. alex.tan@student.edu"
            autocomplete="email"
            required
          />
        </div>

        <div class="field" style="margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label for="reg-password" style="margin-bottom: 0;">Password (min. 6 characters)</label>
            <button
              type="button"
              class="link-btn small"
              @click="showRegPassword = !showRegPassword"
            >
              {{ showRegPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <input
            id="reg-password"
            v-model="regPassword"
            :type="showRegPassword ? 'text' : 'password'"
            placeholder="Create password"
            autocomplete="new-password"
            minlength="6"
            required
          />
        </div>

        <div class="field" style="margin-bottom: 18px;">
          <label for="reg-confirm">Confirm Password</label>
          <input
            id="reg-confirm"
            v-model="regConfirm"
            :type="showRegPassword ? 'text' : 'password'"
            placeholder="Repeat password"
            autocomplete="new-password"
            required
          />
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <button type="button" class="link-btn small" @click="activeTab = 'login'">
            Already have an account?
          </button>
          <button type="submit" class="btn primary" :disabled="loading">
            {{ loading ? 'Creating Account…' : 'Create Account' }}
          </button>
        </div>
      </form>
    </div>

    <!-- 3. SET NEW PASSWORD FORM (PASSWORD RECOVERY) -->
    <div v-if="activeTab === 'reset-password'" class="panel auth-card">
      <h3>Set New Password</h3>
      <p class="small muted">Please enter a new password for your account (minimum 6 characters).</p>

      <form @submit.prevent="handleSetNewPassword($event)">
        <div class="field" style="margin-bottom: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <label for="new-password" style="margin-bottom: 0;">New Password (min. 6 characters)</label>
            <button
              type="button"
              class="link-btn small"
              @click="showNewPassword = !showNewPassword"
            >
              {{ showNewPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <input
            id="new-password"
            v-model="newPassword"
            :type="showNewPassword ? 'text' : 'password'"
            placeholder="Enter new password"
            autocomplete="new-password"
            minlength="6"
            required
          />
        </div>

        <div class="field" style="margin-bottom: 18px;">
          <label for="new-password-confirm">Confirm New Password</label>
          <input
            id="new-password-confirm"
            v-model="newPasswordConfirm"
            :type="showNewPassword ? 'text' : 'password'"
            placeholder="Repeat new password"
            autocomplete="new-password"
            minlength="6"
            required
          />
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center;">
          <button
            type="button"
            class="link-btn small"
            @click="activeTab = 'login'; errorMsg = ''; successMsg = '';"
          >
            Cancel / Back to Sign In
          </button>
          <button type="submit" class="btn primary" :disabled="loading">
            {{ loading ? 'Updating…' : 'Update Password & Sign In' }}
          </button>
        </div>
      </form>
    </div>

    <!-- 4. DEMO ACCOUNTS PICKER -->
    <div v-if="activeTab === 'demo'">
      <div class="panel">
        <h3>1-Click Demo Profiles</h3>
        <p class="muted small">
          Quick evaluation shortcuts. Click any persona below to simulate their role instantly without passwords. Tip: open two separate browser tabs to test professor and student workflows side-by-side!
        </p>
      </div>

      <div v-for="[role, title] in groups" :key="role" class="panel">
        <h4 style="margin: 0 0 10px; font-size: 15px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px;">{{ title }}</h4>
        <div class="login-grid">
          <button
            v-for="u in (users ? users.filter((x) => x.role === role) : [])"
            :key="u.id"
            class="demo-card-btn"
            @click="pickDemo(u)($event)"
          >
            <b>{{ u.name }}</b>
            <span class="small muted">{{ u.note }}</span>
            <span class="small" style="color: var(--accent); margin-top: 4px; display: inline-block;">{{ u.email }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.auth-container {
  max-width: 680px;
  margin: 20px auto;
}
.auth-hero {
  text-align: center;
  padding: 28px 24px 20px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  margin-bottom: 20px;
}
.auth-badge {
  display: inline-block;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  background: var(--accent-soft);
  color: var(--accent);
  border-radius: 20px;
  margin-bottom: 12px;
}
.auth-tabs {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 20px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 12px;
}
.auth-tab-btn {
  background: none;
  border: none;
  font: inherit;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s ease;
}
.auth-tab-btn:hover {
  color: var(--ink);
  background: rgba(0, 0, 0, 0.04);
}
.auth-tab-btn.active {
  background: var(--accent-soft);
  color: var(--accent);
}
.auth-card {
  padding: 24px;
}
.auth-footer-prompt {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.link-btn {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
}
.link-btn:hover {
  opacity: 0.8;
}
.demo-card-btn {
  text-align: left;
  font: inherit;
  padding: 12px 14px;
  border-radius: var(--radius);
  border: 1px solid var(--line);
  background: var(--panel);
  color: var(--ink);
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.demo-card-btn:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.demo-card-btn b {
  display: block;
}
</style>
