<script setup>
// ============================================================
// QuizQuest - app shell: sign-in, header, tabs
// ============================================================
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { S, setTab, restoreSession } from './api.js';
import { toastState } from './ui.js';
import LoginView from './LoginView.vue';
import ReviewView from './teacher/ReviewView.vue';
import MaterialLibrary from './teacher/MaterialLibrary.vue';
import GenerateView from './teacher/GenerateView.vue';
import AnalyticsView from './teacher/AnalyticsView.vue';
import EvaluationView from './teacher/EvaluationView.vue';
import SettingsView from './teacher/SettingsView.vue';
import ClassManagementView from './teacher/ClassManagementView.vue';
import PracticeView from './student/PracticeView.vue';
import ProgressView from './student/ProgressView.vue';
import HeroLabView from './student/HeroLabView.vue';
import KingdomView from './student/KingdomView.vue';
import PetsView from './student/PetsView.vue';
import DebugMenu from './components/DebugMenu.vue';
import AccountMenu from './components/AccountMenu.vue';
import QuizQuestLogo from './components/QuizQuestLogo.vue';

const TABS = {
  teacher: [['analytics', 'Analytics', AnalyticsView], ['classes', 'Classes & Roster', ClassManagementView], ['review', 'Question bank', ReviewView], ['content', 'Source material', MaterialLibrary], ['generate', 'AI drafting', GenerateView], ['evaluation', 'Evaluation', EvaluationView], ['settings', 'Settings', SettingsView]],
  student: [['practice', 'Practice', PracticeView], ['progress', 'My Progress', ProgressView], ['world', 'World', HeroLabView], ['kingdom', 'Kingdom', KingdomView], ['pets', 'Summon', PetsView]],
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

watch(immersiveStudentTab, (active) => {
  clearStudentNavTimer();
  pointerInsideTop = false;
  studentNavVisible.value = true;
  if (active) studentNavTimer = setTimeout(() => { studentNavVisible.value = false; }, 1600);
}, { immediate: true });

onUnmounted(() => {
  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  clearStudentNavTimer();
});
</script>

<template>
  <!-- signed out: the sign-in page fills the screen, with its own logo and footer -->
  <LoginView v-if="ready && !S.me" :key="'login' + S.viewKey" />
  <template v-else-if="ready">
  <header
    id="top"
    :class="{ 'student-immersive-nav': immersiveStudentTab, 'student-nav-hidden': immersiveStudentTab && !studentNavVisible, 'summon-nav': current?.[0] === 'pets', 'practice-nav': current?.[0] === 'practice', 'progress-nav': current?.[0] === 'progress' }"
    @pointerenter="onTopPointerEnter"
    @pointerleave="onTopPointerLeave"
    @focusin="onTopFocusIn"
    @focusout="onTopFocusOut"
  >
    <div class="brand">
      <QuizQuestLogo :size="30" />
    </div>
    <nav id="tabs" :class="{ crowded: tabs.length > 5 }">
      <button v-for="[id, label] in tabs" :key="id" :aria-current="current && current[0] === id ? 'page' : null" @click="setTab(id)">{{ label }}</button>
    </nav>
    <div id="who">
      <template v-if="S.me">
        <span>{{ S.me.name }}</span>
        <AccountMenu />
        <DebugMenu v-if="S.me.role === 'student'" :key="S.token" />
      </template>
    </div>
  </header>
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
    v-if="immersiveStudentTab"
    class="nav-peek"
    :class="{ 'is-hidden': studentNavVisible }"
    type="button"
    aria-label="Show menu"
    title="Show menu"
    @pointerenter="showStudentNav"
    @focus="showStudentNav"
    @click="onTopPointerEnter"
  >▾</button>
  <footer :class="{ 'footer-student': studentActive }">
    Demo build with synthetic users and demo course content only. Do not enter real student data.
    · <a href="/tag">Circle Tag (the original multiplayer experiment)</a>
  </footer>
  </template>
  <div id="toast" role="status" aria-live="polite" :class="{ show: toastState.show, bad: toastState.bad }">{{ toastState.msg }}</div>
</template>
