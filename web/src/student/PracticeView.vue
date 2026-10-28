<script setup>
// ============================================================
// STUDENT: practice home (start/resume a session, progress); the
// session itself runs in QuizRunner.vue.
// ============================================================
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { S, api, setTab } from '../api.js';
import { action } from '../ui.js';
import Field from '../components/Field.vue';
import { store, loadHome } from './home.js';
import ClassPicker from './ClassPicker.vue';
import WalletBadge from './WalletBadge.vue';
import ResourceBadge from './ResourceBadge.vue';
import QuizRunner from './QuizRunner.vue';
import HeroIcon from './HeroIcon.vue';

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
const practiceHero = { id: 'player', emoji: '🐱' };

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

// Take over this view with a live session (only if still on this tab)
async function runQuiz(sid) {
  const initial = await api('GET', `/api/student/sessions/${sid}`);
  if (alive) quiz.value = { sid, initial };
}
const onResume = action(() => runQuiz(resumable.value.id));
const onStart = action(async () => {
  const r = await api('POST', '/api/student/sessions', { classId: S.classId, length: Number(length.value), timerSec: Number(timer.value), accommodation: Number(acc.value) });
  if (alive) await runQuiz(r.id);
});
</script>

<template>
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
            <p v-if="cls?.participation" class="note small practice-participation">
              Practice participation: {{ cls.participation.points }} point(s) so far. Sessions of 5+ questions earn one point (max {{ cls.participation.weeklyCap }} a week).
            </p>
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
      <div class="practice-hero-art"><HeroIcon :hero="practiceHero" :size="340" :animated="true" label="Your cat-ball hero" /></div>
      <div class="practice-hero-caption">
        <strong>Cat-ball hero</strong>
        <span>Ready for the next question</span>
      </div>
    </aside>
  </div>
</template>
