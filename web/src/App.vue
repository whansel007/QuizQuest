<script setup>
// ============================================================
// QuizQuest - app shell: sign-in, header, tabs
// ============================================================
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
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
function closeDrawer({ restoreFocus = true } = {}) {
  drawerOpen.value = false;
  if (restoreFocus) drawerToggle.value?.focus();
}
// The drawer only exists below 992px (CSS). Crossing that width resets it,
// so no half-open drawer or stale scrim is left behind: growing past 992px
// closes it (the sidebar is then on screen anyway, and keyboard focus that
// was inside it stays where it is); shrinking below starts with it shut.
const drawerQuery = window.matchMedia?.('(max-width: 991.98px)');
function onDrawerQueryChange() {
  if (drawerOpen.value) closeDrawer({ restoreFocus: false });
}
drawerQuery?.addEventListener?.('change', onDrawerQueryChange);
// While the window is being resized, the professor shell suspends its
// transitions (html.is-resizing, teacher-responsive.css): otherwise a
// breakpoint that moves the sidebar between in-page and off-canvas replays
// its 0.2s slide after the window has stopped. Cleared 150ms after the
// last resize event, so the drawer's own slide still animates on tap.
//
// The same resize keeps the reader's place. A breakpoint can change the
// page's height by thousands of pixels, and the browser's own scroll
// anchoring drifts across that (1200 -> 375 -> 1200 px moved Analytics from
// "Commonly missed" to "Compare classes"). So the shell remembers the element
// at the top of the view (just below the sticky bars) while the professor
// scrolls, and when a resize ends it puts that element back where it was.
let resizingTimer = 0;
let viewAnchor = null;
let anchorFrame = 0;
const ANCHOR = 'h2, h3, h4, tr, li, .qcard, .class-card, .marking-item, .tile, .panel, section';
function pickViewAnchor() {
  if (!teacherActive.value || window.scrollY < 1) return (viewAnchor = null);
  const line = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0) + 4;
  const main = document.querySelector('main#main');
  if (!main) return;
  const box = main.getBoundingClientRect();
  // what the professor is reading: the first heading or card that starts
  // at the line (below the sticky bars) and is on screen ...
  for (const h of main.querySelectorAll('h2, h3, h4, .qcard, .class-card, .marking-item')) {
    const r = h.getBoundingClientRect();
    if (!r.height || r.top < line - 2) continue;
    if (r.top < window.innerHeight * 0.6) return (viewAnchor = { el: h, top: r.top });
    break;
  }
  // ... or, in a long stretch without one, whatever sits at the line
  let el = document.elementFromPoint(box.left + Math.min(40, box.width / 2), Math.min(window.innerHeight - 1, line))?.closest(ANCHOR);
  if (!el || !main.contains(el)) return;
  // a tall box (a whole panel) changes height with the width: anchor to
  // the first small piece of it (heading, row, paragraph) at the line instead
  if (el.getBoundingClientRect().height > window.innerHeight / 3) {
    const inner = [...el.querySelectorAll('h2, h3, h4, tr, li, p, .tile, .qcard, .class-card, .marking-item')]
      .find((x) => { const r = x.getBoundingClientRect(); return r.height > 0 && r.height < window.innerHeight / 3 && r.top >= line - 2; });
    if (inner) el = inner;
  }
  viewAnchor = { el, top: el.getBoundingClientRect().top };
}
function onShellScroll() {
  if (!teacherActive.value) return;
  if (document.documentElement.classList.contains('is-resizing')) return; // anchoring moves, not the reader
  cancelAnimationFrame(anchorFrame);
  anchorFrame = requestAnimationFrame(pickViewAnchor);
}
function endResize() {
  document.documentElement.classList.remove('is-resizing');
  const anchor = viewAnchor;
  if (anchor?.el.isConnected && window.scrollY > 0) {
    const drift = anchor.el.getBoundingClientRect().top - anchor.top;
    if (Math.abs(drift) > 1) window.scrollBy(0, drift);
  }
  requestAnimationFrame(pickViewAnchor);
}
function onShellResize() {
  if (!teacherActive.value) return;
  document.documentElement.classList.add('is-resizing');
  clearTimeout(resizingTimer);
  resizingTimer = setTimeout(endResize, 150);
}
window.addEventListener('resize', onShellResize, { passive: true });
window.addEventListener('scroll', onShellScroll, { passive: true });
function onShellKey(event) {
  if (event.key === 'Escape' && drawerOpen.value) closeDrawer();
}
document.addEventListener('keydown', onShellKey);
// The sticky top bar's height (0 beside the sidebar, where it is hidden),
// for scroll-padding-top in teacher/teacher-responsive.css: focus, anchors
// and scrollIntoView() then stop below the bar instead of under it.
// Writing a custom property on <html> changes no layout, so this observer
// cannot feed itself.
const topbarEl = ref(null);
let topbarRo = null;
function setTopbarHeight() {
  const h = (topbarEl.value?.offsetHeight || 0) + 'px';
  if (document.documentElement.style.getPropertyValue('--t-topbar-h') !== h) document.documentElement.style.setProperty('--t-topbar-h', h);
}
watch(topbarEl, (el) => {
  topbarRo?.disconnect();
  topbarRo = null;
  if (!el) return document.documentElement.style.removeProperty('--t-topbar-h');
  setTopbarHeight();
  if (typeof ResizeObserver !== 'undefined') {
    topbarRo = new ResizeObserver(setTopbarHeight);
    topbarRo.observe(el);
  }
});

onUnmounted(() => {
  document.removeEventListener('keydown', onShellKey);
  topbarRo?.disconnect();
  drawerQuery?.removeEventListener?.('change', onDrawerQueryChange);
  window.removeEventListener('resize', onShellResize);
  window.removeEventListener('scroll', onShellScroll);
  clearTimeout(resizingTimer);
  cancelAnimationFrame(anchorFrame);
  document.documentElement.classList.remove('is-resizing');
  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.removeEventListener('pointerdown', onDocumentPointerDown);
  clearStudentNavTimer();
});
</script>

<template>
  <!-- signed out: the sign-in page fills the screen, with its own logo -->
  <LoginView v-if="ready && !S.me" :key="'login' + S.viewKey" />
  <!-- teachers: a calm workspace with a collapsible sidebar and full-width pages -->
  <div v-else-if="ready && teacherActive" class="teacher-app" :class="{ 'nav-collapsed': navCollapsed, 'drawer-open': drawerOpen }">
    <header id="top" ref="topbarEl" class="t-topbar">
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
    :class="{ 'student-immersive-nav': immersiveStudentTab, 'student-nav-hidden': immersiveStudentTab && !studentNavVisible, 'summon-nav': current?.[0] === 'pets', 'practice-nav': current?.[0] === 'practice', 'progress-nav': current?.[0] === 'progress' }"
    @pointerenter="onTopPointerEnter"
    @pointerleave="onTopPointerLeave"
    @focusin="onTopFocusIn"
    @focusout="onTopFocusOut"
  >
    <div class="brand d-flex align-items-center">
      <QuizQuestLogo :size="30" />
    </div>
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
  </template>
  <ScreenWipe />
  <div id="toast" role="status" aria-live="polite" :class="{ show: toastState.show, bad: toastState.bad }">{{ toastState.msg }}</div>
</template>
