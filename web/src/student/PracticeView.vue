<script setup>
// ============================================================
// STUDENT: practice home (start/resume a session, progress); the
// session itself runs in QuizRunner.vue.
// ============================================================
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { S, api, setTab } from '../api.js';
import { action } from '../ui.js';
import Field from '../components/Field.vue';
import { store, loadHome } from './home.js';
import ClassPicker from './ClassPicker.vue';
import WalletBadge from './WalletBadge.vue';
import ResourceBadge from './ResourceBadge.vue';
import QuizRunner from './QuizRunner.vue';
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
  const r = await api('POST', '/api/student/sessions', { classId: S.classId, length: Number(length.value), timerSec: Number(timer.value), accommodation: Number(acc.value) });
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
          <button class="btn primary" @click="onStart">Start practice</button>
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
</style>
