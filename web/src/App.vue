<script setup>
// ============================================================
// QuizQuest - app shell: sign-in, header, tabs
// ============================================================
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { PHONE_NAV_QUERY } from './mobile-config.js';
import { S, setTab, restoreSession } from './api.js';
import { toastState } from './ui.js';
import LoginView from './LoginView.vue';
import ReviewView from './teacher/ReviewView.vue';
import GenerateView from './teacher/GenerateView.vue';
import AnalyticsView from './teacher/AnalyticsView.vue';
import ToReviewView from './teacher/ToReviewView.vue';
import EvaluationView from './teacher/EvaluationView.vue';
import SettingsView from './teacher/SettingsView.vue';
import ClassManagementView from './teacher/ClassManagementView.vue';
import PracticeView from './student/PracticeView.vue';
import ProgressView from './student/ProgressView.vue';
import HeroLabView from './student/HeroLabView.vue';
import KingdomView from './student/KingdomView.vue';
import PetsView from './student/PetsView.vue';
import DebugMenu from './components/DebugMenu.vue';
import SoundToggle from './components/SoundToggle.vue';
import ScreenWipe from './components/ScreenWipe.vue';
import { wipeTo } from './transitions.js';
import AccountMenu from './components/AccountMenu.vue';
import QuizQuestLogo from './components/QuizQuestLogo.vue';
import TeacherNavIcon from './teacher/TeacherNavIcon.vue';

const TABS = {
  teacher: [['analytics', 'Analytics', AnalyticsView], ['todo', 'To review', ToReviewView], ['classes', 'Classes & Roster', ClassManagementView], ['review', 'Question bank', ReviewView], ['generate', 'AI drafting', GenerateView], ['evaluation', 'Evaluation', EvaluationView], ['settings', 'Settings', SettingsView]],
  student: [['kingdom', 'Kingdom', KingdomView], ['practice', 'Quiz', PracticeView], ['progress', 'My Progress', ProgressView], ['world', 'Campfire Run', HeroLabView], ['pets', 'Summon', PetsView]],
};

const ready = ref(false);
onMounted(async () => {
  document.addEventListener('pointermove', onDocumentPointerMove, { passive: true });
  document.addEventListener('pointerdown', onDocumentPointerDown, { passive: true });
  await restoreSession();
  ready.value = true;
});

const tabs = computed(() => (S.me ? TABS[S.me.role] : []));
const current = computed(() => {
  if (!S.me) return null;
  return tabs.value.find(([id]) => id === S.tab) || tabs.value[0];
});
watch(current, (tab) => {
  document.title = tab?.[0] === 'pets' ? 'Summon | QuizQuest' : 'QuizQuest';
}, { immediate: true });
const studentActive = computed(() => S.me?.role === 'student');
const immersiveStudentTab = computed(() => studentActive.value && !['practice', 'progress'].includes(current.value?.[0]));
const studentNavVisible = ref(true);
let studentNavTimer;
let pointerInsideTop = false;

function clearStudentNavTimer() {
  if (studentNavTimer) clearTimeout(studentNavTimer);
  studentNavTimer = undefined;
}
function showStudentNav() {
  if (!immersiveStudentTab.value) return;
  clearStudentNavTimer();
  studentNavVisible.value = true;
  if (!pointerInsideTop) studentNavTimer = setTimeout(() => { studentNavVisible.value = false; }, 1600);
}
function onDocumentPointerMove(event) {
  if (immersiveStudentTab.value && event.clientY <= 18) showStudentNav();
}
function onDocumentPointerDown(event) {
  if (immersiveStudentTab.value && event.clientY <= 24) showStudentNav();
}
function onTopPointerEnter() {
  if (!immersiveStudentTab.value) return;
  pointerInsideTop = true;
  clearStudentNavTimer();
  studentNavVisible.value = true;
}
function onTopPointerLeave() {
  if (!immersiveStudentTab.value) return;
  pointerInsideTop = false;
  showStudentNav();
}
function onTopFocusIn() { onTopPointerEnter(); }
function onTopFocusOut(event) {
  if (event.currentTarget.contains(event.relatedTarget)) return;
  pointerInsideTop = false;
  showStudentNav();
}

// Moving between the Kingdom and its game screens (Quiz/Duel, the Campfire
// Run hero selector, Summon) uses the storybook screen wipe; other tabs switch
// at once.
const WIPE_FROM_KINGDOM = new Set(['practice', 'world', 'pets']);
function openStudentTab(id) {
  const from = current.value?.[0];
  const linked = from !== id && ((from === 'kingdom' && WIPE_FROM_KINGDOM.has(id)) || (id === 'kingdom' && WIPE_FROM_KINGDOM.has(from)));
  if (linked) wipeTo(id);
  else setTab(id);
}

watch(immersiveStudentTab, (active) => {
  clearStudentNavTimer();
  pointerInsideTop = false;
  studentNavVisible.value = true;
  if (active) studentNavTimer = setTimeout(() => { studentNavVisible.value = false; }, 1600);
}, { immediate: true });

// ---- student shell on phones and portrait tablets (PHONE_NAV_QUERY): the top bar is the logo and
// a menu button; the tabs and account controls move into a full-height drawer
// that closes on a tap outside, Esc, the close button or choosing a tab.
const phoneNavQuery = window.matchMedia?.(PHONE_NAV_QUERY);
const phoneNav = ref(Boolean(phoneNavQuery?.matches));
const studentDrawerOpen = ref(false);
const studentDrawerToggle = ref(null);
const studentDrawer = ref(null);
function onPhoneNavChange(event) {
  phoneNav.value = event.matches;
  if (!event.matches) studentDrawerOpen.value = false;
}
phoneNavQuery?.addEventListener?.('change', onPhoneNavChange);
async function openStudentDrawer() {
  studentDrawerOpen.value = true;
  clearStudentNavTimer();
  await nextTick();
  focusWhenVisible(() => studentDrawer.value?.querySelector('nav#tabs button[aria-current="page"]') || studentDrawer.value?.querySelector('nav#tabs button'));
}
// A control can only take focus once it is visible; buttons inside the
// drawer inherit its visibility through their own short transition, so try
// each frame (for up to ~half a second) until the focus lands.
function focusWhenVisible(find, frames = 30) {
  const el = find();
  if (el) el.focus({ preventScroll: true });
  if ((!el || document.activeElement !== el) && frames > 0) requestAnimationFrame(() => focusWhenVisible(find, frames - 1));
}
function closeStudentDrawer({ restoreFocus = true } = {}) {
  if (!studentDrawerOpen.value) return;
  studentDrawerOpen.value = false;
  if (restoreFocus) (studentDrawerToggle.value || document.querySelector('.nav-peek'))?.focus({ preventScroll: true });
}
function onStudentDrawerTab(id) {
  closeStudentDrawer({ restoreFocus: false });
  openStudentTab(id);
}
// keep keyboard focus inside the open drawer
function onStudentDrawerKey(event) {
  if (event.key !== 'Tab' || !studentDrawer.value) return;
  const items = [...studentDrawer.value.querySelectorAll('button:not([disabled]), a[href], select, input')].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
// The in-run game has its own menu button: the site nav and its peek handle
// stay out of the way while a run is on screen.
// Desktop keeps its tucked-away nav and peek handle unchanged.
const coarseQuery = window.matchMedia?.('(pointer: coarse)');
const coarsePointer = ref(Boolean(coarseQuery?.matches));
const onCoarseChange = (event) => { coarsePointer.value = event.matches; };
coarseQuery?.addEventListener?.('change', onCoarseChange);
const gameActive = computed(() => S.gameActive && current.value?.[0] === 'world' && (phoneNav.value || coarsePointer.value));
watch(gameActive, (active) => { if (active) closeStudentDrawer({ restoreFocus: false }); });

// ---- teacher shell: a sidebar that collapses to an icon rail on desktop and
// becomes a drawer on narrow screens. The collapsed choice is remembered.
const teacherActive = computed(() => S.me?.role === 'teacher');
const NAV_KEY = 'qq-teacher-nav-collapsed';
let savedCollapsed = false;
try { savedCollapsed = localStorage.getItem(NAV_KEY) === '1'; } catch { /* storage blocked: start expanded */ }
const navCollapsed = ref(savedCollapsed);
const drawerOpen = ref(false);
const drawerToggle = ref(null);
function toggleCollapsed() {
  navCollapsed.value = !navCollapsed.value;
  try { localStorage.setItem(NAV_KEY, navCollapsed.value ? '1' : '0'); } catch { /* fine */ }
}
function openTeacherTab(id) {
  setTab(id);
  if (drawerOpen.value) closeDrawer();
}
function closeDrawer() {
  drawerOpen.value = false;
  drawerToggle.value?.focus();
}
function onShellKey(event) {
  if (event.key === 'Escape' && drawerOpen.value) closeDrawer();
  if (event.key === 'Escape' && studentDrawerOpen.value) closeStudentDrawer();
}
// Opening the professor's drawer moves focus into it, so keyboard and
// screen-reader users land on the navigation they just opened.
watch(drawerOpen, async (open) => {
  if (!open) return;
  await nextTick();
  focusWhenVisible(() => document.querySelector('#t-sidebar nav#tabs button[aria-current="page"]') || document.querySelector('#t-sidebar nav#tabs button'));
});
document.addEventListener('keydown', onShellKey);

onUnmounted(() => {
  document.removeEventListener('keydown', onShellKey);
  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  phoneNavQuery?.removeEventListener?.('change', onPhoneNavChange);
  coarseQuery?.removeEventListener?.('change', onCoarseChange);
  clearStudentNavTimer();
});
</script>

<template>
  <!-- signed out: the sign-in page fills the screen, with its own logo -->
  <LoginView v-if="ready && !S.me" :key="'login' + S.viewKey" />
  <!-- teachers: a calm workspace with a collapsible sidebar and full-width pages -->
  <div v-else-if="ready && teacherActive" class="teacher-app" :class="{ 'nav-collapsed': navCollapsed, 'drawer-open': drawerOpen }">
    <header id="top" class="t-topbar">
      <button ref="drawerToggle" class="t-icon-btn" type="button" aria-controls="t-sidebar" :aria-expanded="drawerOpen" aria-label="Open navigation" @click="drawerOpen = true">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <QuizQuestLogo :size="26" />
      <span class="t-topbar-page">{{ current?.[1] }}</span>
    </header>
    <div v-if="drawerOpen" class="t-scrim" @click="closeDrawer"></div>
    <aside id="t-sidebar" class="t-sidebar" aria-label="Teacher navigation">
      <div class="t-brand d-flex align-items-center">
        <QuizQuestLogo :size="30" />
        <button class="t-icon-btn t-collapse" type="button" :aria-label="navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'" :title="navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'" :aria-expanded="!navCollapsed" @click="toggleCollapsed">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="navCollapsed ? 'm10 7 5 5-5 5' : 'm14 7-5 5 5 5'" /></svg>
        </button>
        <button class="t-icon-btn t-drawer-close" type="button" aria-label="Close navigation" @click="closeDrawer">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <nav id="tabs" class="t-nav">
        <button v-for="[id, label] in tabs" :key="id" type="button" :aria-current="current && current[0] === id ? 'page' : null" :title="navCollapsed ? label : null" @click="openTeacherTab(id)">
          <TeacherNavIcon :tab="id" /><span class="t-nav-label">{{ label }}</span>
          <!-- answers to mark + open reports for the class in view; the page itself says how many -->
          <span v-if="id === 'todo' && S.reviewCount" class="t-nav-count" aria-hidden="true">{{ S.reviewCount > 99 ? '99+' : S.reviewCount }}</span>
        </button>
      </nav>
      <div id="who" class="t-account d-flex align-items-center">
        <span class="t-avatar" aria-hidden="true">{{ (S.me.name || '?').trim().charAt(0).toUpperCase() }}</span>
        <span class="t-account-name">{{ S.me.name }}</span>
        <AccountMenu icon />
      </div>
    </aside>
    <main id="main" class="main-teacher">
      <component :is="current[2]" :key="current[0] + ':' + S.viewKey + ':' + S.token" />
    </main>
  </div>
  <template v-else-if="ready">
  <header
    id="top"
    :class="{ 'student-immersive-nav': immersiveStudentTab, 'student-nav-hidden': (immersiveStudentTab && (phoneNav || !studentNavVisible)) || gameActive, 'summon-nav': current?.[0] === 'pets', 'practice-nav': current?.[0] === 'practice', 'progress-nav': current?.[0] === 'progress', 'phone-nav': phoneNav }"
    @pointerenter="onTopPointerEnter"
    @pointerleave="onTopPointerLeave"
    @focusin="onTopFocusIn"
    @focusout="onTopFocusOut"
  >
    <div class="brand d-flex align-items-center">
      <QuizQuestLogo :size="30" />
    </div>
    <template v-if="!phoneNav">
      <nav id="tabs" :class="{ crowded: tabs.length > 5 }">
        <button v-for="[id, label] in tabs" :key="id" :aria-current="current && current[0] === id ? 'page' : null" @click="openStudentTab(id)">{{ label }}</button>
      </nav>
      <div id="who" class="d-flex align-items-center">
        <template v-if="S.me">
          <span>{{ S.me.name }}</span>
          <AccountMenu />
          <DebugMenu v-if="S.me.role === 'student'" :key="S.token" />
          <SoundToggle v-if="S.me.role === 'student'" />
        </template>
      </div>
    </template>
    <template v-else>
      <span class="s-topbar-page">{{ current?.[1] }}</span>
      <button ref="studentDrawerToggle" class="s-menu-btn" type="button" aria-controls="s-drawer" :aria-expanded="studentDrawerOpen" aria-label="Open menu" data-testid="nav-menu" @click="openStudentDrawer">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
    </template>
  </header>
  <!-- phones: the student navigation drawer (outside the header, whose
       slide-away transform would otherwise trap a fixed child) -->
  <template v-if="phoneNav">
    <div v-if="studentDrawerOpen" class="s-scrim" data-testid="nav-scrim" @click="closeStudentDrawer()"></div>
    <aside
      id="s-drawer"
      ref="studentDrawer"
      class="s-drawer"
      :class="{ open: studentDrawerOpen, 'summon-nav': current?.[0] === 'pets' }"
      :inert="!studentDrawerOpen"
      :aria-hidden="!studentDrawerOpen"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      data-testid="nav-drawer"
      @keydown="onStudentDrawerKey"
    >
      <div class="s-drawer-head">
        <QuizQuestLogo :size="28" />
        <button class="s-drawer-close" type="button" aria-label="Close menu" data-testid="nav-close" @click="closeStudentDrawer()">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <nav id="tabs" aria-label="Student pages">
        <button v-for="[id, label] in tabs" :key="id" type="button" :aria-current="current && current[0] === id ? 'page' : null" @click="onStudentDrawerTab(id)">{{ label }}</button>
      </nav>
      <div id="who" class="s-drawer-account">
        <template v-if="S.me">
          <span class="s-drawer-name">{{ S.me.name }}</span>
          <div class="s-drawer-tools">
            <AccountMenu />
            <DebugMenu v-if="S.me.role === 'student'" :key="S.token" />
            <SoundToggle v-if="S.me.role === 'student'" />
          </div>
        </template>
      </div>
    </aside>
  </template>
  <main id="main" :class="{ 'main-student': studentActive, 'main-world': current?.[0] === 'world', 'main-kingdom': current?.[0] === 'kingdom', 'main-summon': current?.[0] === 'pets', 'main-practice': current?.[0] === 'practice', 'main-progress': current?.[0] === 'progress' }">
    <!-- the key remounts the view on tab switch, user switch or rerender(),
         so each view starts fresh and releases sockets/timers on unmount -->
    <component :is="current[2]" :key="current[0] + ':' + S.viewKey + ':' + S.token" />
  </main>
  <!-- Handle for the tucked-away student menu: the nav slides up out of the
       viewport, so this chip is the only sign that tabs exist up there. It stays
       mounted while the nav is open (hidden, not removed) so pointerleave on the
       header still fires normally. -->
  <button
    v-if="immersiveStudentTab && !phoneNav && !gameActive"
    class="nav-peek"
    :class="{ 'is-hidden': studentNavVisible }"
    type="button"
    aria-label="Show menu"
    title="Show menu"
    @pointerenter="showStudentNav"
    @focus="showStudentNav"
    @click="onTopPointerEnter"
  >▾</button>
  <!-- phones: one tap on the corner menu button opens the drawer directly -->
  <button
    v-if="immersiveStudentTab && phoneNav && !gameActive"
    class="nav-peek nav-peek-phone"
    :class="{ 'is-hidden': studentDrawerOpen }"
    type="button"
    aria-label="Open menu"
    aria-controls="s-drawer"
    :aria-expanded="studentDrawerOpen"
    data-testid="nav-peek"
    @click="openStudentDrawer"
  ><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
  </template>
  <ScreenWipe />
  <div id="toast" role="status" aria-live="polite" :class="{ show: toastState.show, bad: toastState.bad }">{{ toastState.msg }}</div>
</template>
