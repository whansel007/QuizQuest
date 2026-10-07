<script setup>
// ============================================================
// QuizQuest - app shell: sign-in, header, tabs
// ============================================================
import { computed, onMounted, ref } from 'vue';
import { S, setTab, signOut, restoreSession } from './api.js';
import { toastState } from './ui.js';
import LoginView from './LoginView.vue';
import ReviewView from './teacher/ReviewView.vue';
import ContentView from './teacher/ContentView.vue';
import GenerateView from './teacher/GenerateView.vue';
import AnalyticsView from './teacher/AnalyticsView.vue';
import EvaluationView from './teacher/EvaluationView.vue';
import SettingsView from './teacher/SettingsView.vue';
import PracticeView from './student/PracticeView.vue';
import WorldView from './student/WorldView.vue';
import KingdomView from './student/KingdomView.vue';
import PetsView from './student/PetsView.vue';

const TABS = {
  teacher: [['review', 'Question bank', ReviewView], ['content', 'Source material', ContentView], ['generate', 'AI drafting', GenerateView], ['analytics', 'Analytics', AnalyticsView], ['evaluation', 'Evaluation', EvaluationView], ['settings', 'Settings', SettingsView]],
  student: [['practice', 'Practice', PracticeView], ['world', 'World', WorldView], ['kingdom', 'Kingdom', KingdomView], ['pets', 'Pets & shop', PetsView]],
};

const ready = ref(false);
onMounted(async () => {
  await restoreSession();
  ready.value = true;
});

const tabs = computed(() => (S.me ? TABS[S.me.role] : []));
const current = computed(() => {
  if (!S.me) return null;
  return tabs.value.find(([id]) => id === S.tab) || tabs.value[0];
});
</script>

<template>
  <header id="top">
    <div class="brand">Quiz<span>Quest</span> <small>prototype</small></div>
    <nav id="tabs">
      <button v-for="[id, label] in tabs" :key="id" :aria-current="current && current[0] === id ? 'page' : null" @click="setTab(id)">{{ label }}</button>
    </nav>
    <div id="who">
      <template v-if="S.me">
        <span>{{ S.me.name }}</span>
        <button class="btn small" @click="signOut">Switch user</button>
      </template>
    </div>
  </header>
  <main id="main">
    <template v-if="ready">
      <LoginView v-if="!S.me" :key="'login' + S.viewKey" />
      <!-- the key remounts the view on tab switch, user switch or rerender(),
           so each view starts fresh and releases sockets/timers on unmount -->
      <component :is="current[2]" v-else :key="current[0] + ':' + S.viewKey + ':' + S.token" />
    </template>
  </main>
  <div id="toast" role="status" aria-live="polite" :class="{ show: toastState.show, bad: toastState.bad }">{{ toastState.msg }}</div>
  <footer>
    Demo build with synthetic users and demo course content only. Do not enter real student data.
    · <a href="/tag">Circle Tag (the original multiplayer experiment)</a>
  </footer>
</template>
