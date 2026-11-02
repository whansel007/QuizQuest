<script setup>
// ============================================================
// STUDENT: practice home (start/resume a session, progress); the
// session itself runs in QuizRunner.vue.
// ============================================================
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { S, api, setTab } from '../api.js';
import { action } from '../ui.js';
import Field from '../components/Field.vue';
import { store, loadHome } from './home.js';
import ClassPicker from './ClassPicker.vue';
import WalletBadge from './WalletBadge.vue';
import ResourceBadge from './ResourceBadge.vue';
import QuizRunner from './QuizRunner.vue';
import { wipeTo } from '../transitions.js';
import AvatarPreview from './AvatarPreview.vue';
import { TOWN_AVATAR_DEFAULT_COLOR } from '../../../config/tuning.js';

const error = ref('');
const loaded = ref(false);
const quiz = ref(null); // { sid, initial } once a session is running
const length = ref(8);
const timer = ref(0);
const acc = ref(1);
let alive = true;

const home = computed(() => store.home);
const cls = computed(() => home.value.classes.find((c) => c.id === S.classId));
const resumable = computed(() => home.value.resumable?.find((s) => s.classId === S.classId));
const avatarVisual = computed(() => S.me?.avatarVisual || { color: S.me?.avatarColor || TOWN_AVATAR_DEFAULT_COLOR, hat: null, accessory: null });

// Topic picker. Only topics with published questions can be chosen. The
// browser remembers the topics left OUT per class, so a topic the
// professor adds later starts included.
const topics = computed(() => cls.value?.topics || []);
const pickable = computed(() => topics.value.filter((t) => t.questions > 0));
const excluded = ref(new Set());
const excludedKey = () => `qq-practice-excluded:${S.me?.id}:${S.classId}`;
function loadExcluded() {
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(excludedKey()) || '[]'); } catch { /* storage blocked or bad value: start with everything */ }
  excluded.value = new Set(Array.isArray(saved) ? saved : []);
}
function saveExcluded() {
  try { localStorage.setItem(excludedKey(), JSON.stringify([...excluded.value])); } catch { /* fine: the choice just isn't remembered */ }
}
const chosen = computed(() => pickable.value.filter((t) => !excluded.value.has(t.id)));
const allChosen = computed(() => chosen.value.length === pickable.value.length);
function toggleTopic(id) {
  const next = new Set(excluded.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  excluded.value = next;
  saveExcluded();
}
function chooseAll(on) {
  excluded.value = new Set(on ? [] : pickable.value.map((t) => t.id));
  saveExcluded();
}
const topicLabel = (t) => (t.week ? `Week ${t.week} · ${t.name}` : t.name);
watch(() => S.classId, loadExcluded, { immediate: true });

onMounted(async () => {
  try {
    await loadHome();
    if (!alive) return;
    acc.value = store.home.options.accommodation[0];
    loaded.value = true;
  } catch (err) {
    if (alive) error.value = err.message;
  }
});
onUnmounted(() => (alive = false));

// Entering a battle: an encounter wipe sweeps across and covers the setup,
// the battle mounts underneath, then the wipe clears to reveal it. The setup
// stays on screen until it is covered, so there is never a blank frame.
const wipe = ref(null); // null | 'cover' | 'reveal'
const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const WIPE_MS = reducedMotion ? 200 : 520;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function loadSession(sid) {
  return { sid, initial: await api('GET', `/api/student/sessions/${sid}`) };
}
async function enterBattle(load) {
  if (wipe.value) return;
  wipe.value = 'cover';
  let next;
  try {
    [next] = await Promise.all([load(), wait(WIPE_MS)]);
  } catch (err) {
    // nothing to enter: clear the wipe back to the setup and report the error
    if (alive) wipe.value = 'reveal';
    await wait(WIPE_MS);
    if (alive) wipe.value = null;
    throw err;
  }
  // only take over the view if the student is still on this tab
  if (!alive) return;
  quiz.value = next;
  await nextTick();
  wipe.value = 'reveal';
  await wait(WIPE_MS);
  if (alive) wipe.value = null;
}
const onResume = action(() => enterBattle(() => loadSession(resumable.value.id)));
const onStart = action(() => enterBattle(async () => {
  if (!chosen.value.length) throw new Error('Choose at least one topic to practise.');
  const r = await api('POST', '/api/student/sessions', {
    classId: S.classId, length: Number(length.value), timerSec: Number(timer.value), accommodation: Number(acc.value),
    // all topics: let the server cover the whole course, including topics that gain questions later
    ...(allChosen.value ? {} : { topicIds: chosen.value.map((t) => t.id) }),
  });
  return loadSession(r.id);
}));
</script>

<template>
  <!-- encounter wipe: covers the setup, then reveals the battle beneath it -->
  <div v-if="wipe" class="encounter-wipe" :class="[wipe, { reduced: reducedMotion }]" :style="{ '--wipe-ms': WIPE_MS + 'ms' }" role="status" aria-live="polite">
    <span class="sr-only">{{ wipe === 'cover' ? 'Entering battle…' : 'Battle!' }}</span>
    <div class="wipe-band" aria-hidden="true">
      <svg class="wipe-emblem" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="28" fill="#F2BA55" stroke="#23382F" stroke-width="4" />
        <path d="M18 46 44 20M44 20l3-8-8 3M20 20l26 26M20 20l-3-8 8 3" fill="none" stroke="#23382F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M14 42l8 8M50 42l-8 8" stroke="#23382F" stroke-width="5" stroke-linecap="round" />
      </svg>
    </div>
  </div>
  <div v-if="error" class="note bad practice-page-message">{{ error }}</div>
  <QuizRunner v-else-if="quiz" :sid="quiz.sid" :initial="quiz.initial" />
  <div v-else-if="loaded" class="practice-layout">
    <section class="practice-controls" aria-label="Practice setup">
      <header class="practice-lobby">
        <div class="practice-lobby-row">
          <div class="practice-class-picker"><ClassPicker /></div>
        </div>
        <div class="practice-resource-row" aria-label="Your resources">
          <WalletBadge />
          <ResourceBadge />
          <button class="btn small practice-return" type="button" @click="wipeTo('kingdom')"><span aria-hidden="true">&#8592;</span> Return to Kingdom</button>
        </div>
      </header>

      <template v-if="S.classId">
        <div class="practice-settings-stack">
          <section class="panel practice-settings">
            <div class="practice-settings-heading">
              <span class="practice-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 6.5c-2.2-1.7-5.5-2-9-1.2v13c3.5-.8 6.8-.5 9 1.2m0-13c2.2-1.7 5.5-2 9-1.2v13c-3.5-.8-6.8-.5-9 1.2m0-13v13" /></svg></span>
              <div>
                <span class="practice-kicker">READY WHEN YOU ARE</span>
                <h2>Quiz details and settings</h2>
                <p class="small muted">Choose your pace. Your cat-ball hero joins every practice round.</p>
              </div>
            </div>
            <div class="practice-fields">
              <Field v-slot="{ id }" label="Length">
                <select :id="id" v-model="length">
                  <option v-for="n in home.options.lengths" :key="n" :value="n">{{ n }} questions</option>
                </select>
              </Field>
              <Field v-slot="{ id }" label="Timer">
                <select :id="id" v-model="timer">
                  <option v-for="t in home.options.timers" :key="t" :value="t">{{ t ? `${t}s per question` : 'Untimed' }}</option>
                </select>
              </Field>
              <Field v-slot="{ id }" label="Accommodation">
                <select :id="id" v-model="acc">
                  <option v-for="m in home.options.accommodation" :key="m" :value="m">{{ m === 1 ? 'Standard time' : `Extra time x${m}` }}</option>
                </select>
              </Field>
            </div>
            <fieldset v-if="topics.length" class="practice-topics">
              <legend class="practice-kicker">TOPICS TO PRACTISE</legend>
              <div class="practice-topics-head">
                <span class="practice-topics-count" aria-live="polite">{{ chosen.length }} of {{ pickable.length }} chosen</span>
                <div class="practice-topics-actions">
                  <button class="btn small" type="button" :disabled="allChosen" @click="chooseAll(true)">Select all</button>
                  <button class="btn small" type="button" :disabled="!chosen.length" @click="chooseAll(false)">Select none</button>
                </div>
              </div>
              <ul class="practice-topic-list">
                <li v-for="t in topics" :key="t.id">
                  <label class="practice-topic" :class="{ on: t.questions && !excluded.has(t.id), empty: !t.questions }">
                    <input type="checkbox" :checked="t.questions > 0 && !excluded.has(t.id)" :disabled="!t.questions" @change="toggleTopic(t.id)" />
                    <span class="practice-topic-name" :title="topicLabel(t)">{{ topicLabel(t) }}</span>
                    <span class="practice-topic-meta">{{ t.questions ? `${t.questions} question${t.questions === 1 ? '' : 's'}` : 'No questions yet' }}</span>
                  </label>
                </li>
              </ul>
              <p v-if="!chosen.length" class="practice-topics-hint" role="status">Choose at least one topic to start practising.</p>
            </fieldset>
          </section>
          <section v-if="resumable" class="panel practice-resume-card">
            <div>
              <span class="practice-kicker">PICK UP WHERE YOU LEFT OFF</span>
              <p>Unfinished session: {{ resumable.answered }} of {{ resumable.total }} answered. Timed questions keep their original deadline.</p>
            </div>
            <button class="btn small" @click="onResume">Resume practice</button>
          </section>
        </div>
        <footer class="practice-actions">
          <button class="btn primary" :disabled="topics.length > 0 && !chosen.length" @click="onStart">Start practice</button>
          <button class="btn" @click="setTab('progress')">View my progress</button>
        </footer>
      </template>
      <template v-else>
        <section class="panel practice-settings practice-no-class">
          <span class="practice-section-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M12 6.5c-2.2-1.7-5.5-2-9-1.2v13c3.5-.8 6.8-.5 9 1.2m0-13c2.2-1.7 5.5-2 9-1.2v13c-3.5-.8-6.8-.5-9 1.2m0-13v13" /></svg></span>
          <div>
            <span class="practice-kicker">YOUR NEXT ADVENTURE</span>
            <h2>Join a class to begin</h2>
            <p class="small muted">Enter the join code your professor gave you. Your practice questions and progress will appear here.</p>
          </div>
        </section>
      </template>
    </section>

    <aside class="panel practice-hero" aria-label="Your cat-ball hero">
      <span class="practice-hero-kicker">YOUR LEARNING COMPANION</span>
      <div class="practice-hero-orbit" aria-hidden="true"></div>
      <div class="practice-hero-art">
        <AvatarPreview class="practice-avatar-preview" :color="avatarVisual.color" :hat-id="avatarVisual.hat" :accessory-id="avatarVisual.accessory" />
      </div>
      <div class="practice-hero-caption">
        <strong>Cat-ball hero</strong>
        <span>Ready for the next question</span>
      </div>
    </aside>
  </div>
</template>

<style scoped>
/* Encounter wipe: a forest band with a gold stripe sweeps across the window */
/* below the student navigation (z 5), so the tabs stay usable if the request is slow */
.encounter-wipe { position: fixed; z-index: 4; inset: 0; overflow: hidden; pointer-events: none; }
.wipe-band { position: absolute; inset: -10% -25%; display: grid; place-items: center; background:
  linear-gradient(100deg, transparent 0 6%, #F2BA55 6% 8.5%, #254937 8.5% 91.5%, #F2BA55 91.5% 94%, transparent 94% 100%); }
.wipe-band::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(100deg, rgb(255 248 228 / 0%) 0 46px, rgb(255 248 228 / 7%) 46px 92px); }
.wipe-emblem { position: relative; width: clamp(96px, 16vw, 168px); height: auto; filter: drop-shadow(0 6px 0 rgb(17 34 26 / 45%)); }
.encounter-wipe.cover .wipe-band { animation: wipe-in var(--wipe-ms) cubic-bezier(.7, 0, .3, 1) both; }
.encounter-wipe.reveal .wipe-band { animation: wipe-out var(--wipe-ms) cubic-bezier(.7, 0, .3, 1) both; }
.encounter-wipe.cover .wipe-emblem { animation: emblem-in var(--wipe-ms) ease-out both; }
@keyframes wipe-in { from { transform: translateX(-130%); } to { transform: translateX(0); } }
@keyframes wipe-out { from { transform: translateX(0); } to { transform: translateX(130%); } }
@keyframes emblem-in { 0%, 45% { transform: scale(.3) rotate(-30deg); opacity: 0; } 80% { transform: scale(1.12) rotate(4deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }
/* reduced motion: a quick straight fade in and out, still a clear cue */
.encounter-wipe.reduced .wipe-band { inset: 0; background: #254937; }
.encounter-wipe.reduced.cover .wipe-band { animation: wipe-fade-in var(--wipe-ms) linear both; }
.encounter-wipe.reduced.reveal .wipe-band { animation: wipe-fade-out var(--wipe-ms) linear both; }
.encounter-wipe.reduced .wipe-emblem { animation: none; }
@keyframes wipe-fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes wipe-fade-out { from { opacity: 1; } to { opacity: 0; } }
/* back to the Kingdom: tucked at the end of the coins/resources row */
.practice-return { margin-left: auto; white-space: nowrap; }

/* Topic picker: paper slips on a dashed rule, in the page's forest-parchment palette */
.practice-topics { min-width: 0; margin: 0; padding: 16px 0 0; border: 0; border-top: 2px dashed rgb(83 106 83 / 38%); }
.practice-topics legend { float: left; width: 100%; margin: 0 0 8px; padding: 0; }
.practice-topics-head { clear: both; display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-bottom: 10px; }
.practice-topics-count { color: #536A53; font-size: 14px; font-weight: 700; }
.practice-topics-actions { display: flex; gap: 8px; margin-left: auto; }
.practice-topic-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; padding: 0 0 4px; list-style: none; }
.practice-topic {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 10px;
  min-height: 52px;
  margin: 0;
  padding: 8px 11px;
  color: #20382C;
  background: #DCE5D1;
  border: 2px solid #82936A;
  border-radius: 10px 8px 11px 9px;
  box-shadow: 0 3px 0 #536A4E;
  font-size: 14px;
  cursor: pointer;
  transition: transform .12s ease, box-shadow .12s ease, background-color .12s ease;
}
.practice-topic:hover { background: #EAF0DE; transform: translateY(-1px); box-shadow: 0 4px 0 #536A4E; }
.practice-topic.on { background: #F0E2AC; border-color: #B5944A; box-shadow: 0 3px 0 #785D2B; }
.practice-topic.empty { color: #77816C; background: #D2D8C2; border-style: dashed; border-color: #A1AA8C; box-shadow: none; cursor: not-allowed; transform: none; }
.practice-topic input { grid-row: span 2; width: 20px; height: 20px; margin: 0; accent-color: #3E6B4A; cursor: inherit; }
.practice-topic input:focus-visible { outline: 3px solid #D5B96C; outline-offset: 2px; }
.practice-topic-name { overflow: hidden; font-weight: 700; line-height: 1.25; text-overflow: ellipsis; white-space: nowrap; }
.practice-topic-meta { color: #536A53; font-size: 12px; font-weight: 600; }
.practice-topic.empty .practice-topic-meta { color: #77816C; }
.practice-topics-hint { margin: 10px 0 0; color: #713C36 !important; font-size: 14px; font-weight: 700; }
@media (max-width: 760px) {
  .practice-topic-list { grid-template-columns: minmax(0, 1fr); }
  .practice-topics-actions { margin-left: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .practice-topic, .practice-topic:hover { transition: none; transform: none; }
}
</style>
