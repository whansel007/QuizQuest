<script setup>
// ============================================================
// STUDENT: practice home (start/resume a session, progress); the
// session itself runs in QuizRunner.vue.
// ============================================================
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { S, api } from '../api.js';
import { pct, when, action } from '../ui.js';
import Heading from '../components/Heading.vue';
import Field from '../components/Field.vue';
import Meter from '../components/Meter.vue';
import { store, loadHome } from './home.js';
import ClassPicker from './ClassPicker.vue';
import WalletBadge from './WalletBadge.vue';
import ResourceBadge from './ResourceBadge.vue';
import QuizRunner from './QuizRunner.vue';

const error = ref('');
const loaded = ref(false);
const prog = ref(null);
const quiz = ref(null); // { sid, initial } once a session is running
const length = ref(8);
const timer = ref(0);
const acc = ref(1);
let alive = true;

const home = computed(() => store.home);
const cls = computed(() => home.value.classes.find((c) => c.id === S.classId));
const resumable = computed(() => home.value.resumable?.find((s) => s.classId === S.classId));
const pet = computed(() => home.value.catalog.pets.find((p) => p.id === home.value.inventory.equippedPet));

onMounted(async () => {
  try {
    await loadHome();
    if (S.classId) prog.value = await api('GET', `/api/student/classes/${S.classId}/progress`);
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
  <div v-if="error" class="note bad">{{ error }}</div>
  <QuizRunner v-else-if="quiz" :sid="quiz.sid" :initial="quiz.initial" />
  <template v-else-if="loaded">
    <p v-if="!S.classId">You are not enrolled in any class.</p>
    <template v-else>
      <Heading title="Practice"><ClassPicker /><WalletBadge /><ResourceBadge /></Heading>
      <div v-if="resumable" class="note small">
        Unfinished session: {{ resumable.answered }} of {{ resumable.total }} answered. Timed questions keep their original deadline.
        <button class="btn small" @click="onResume">Resume practice</button>
      </div>
      <div class="panel">
        <div class="row top">
          <div style="font-size: 48px">{{ pet.emoji }}</div>
          <div class="grow">
            <h3>Start a session</h3>
            <p class="small muted">Your {{ pet.name }} attacks the Fog of Confusion each time you answer correctly. The timer is optional and is just for practice. Tip: number keys pick an answer.</p>
            <div class="row">
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
            <button class="btn primary" @click="onStart">Start practice</button>
          </div>
        </div>
      </div>
      <div v-if="cls.participation" class="note small">Your professor counts practice participation for this class: {{ cls.participation.points }} point(s) so far. You get one per completed session of 5+ questions (max {{ cls.participation.weeklyCap }} a week). Your score doesn't affect it.</div>
      <div v-if="prog.awaitingMarking" class="note small">{{ prog.awaitingMarking }} of your written answers are waiting for your professor to confirm the mark.</div>
      <div class="panel">
        <h3>Your practice indicator</h3>
        <p class="small muted">Accuracy on your most recent {{ prog.window }} different questions per topic. It is a rough guide for what to practise next, not a measure of mastery or a grade.</p>
        <div class="grid">
          <div v-for="t in prog.topics" :key="t.topicId || t.name" class="tile">
            <div style="font-weight: 700">{{ t.name }}</div>
            <template v-if="t.n">
              <div class="v">{{ pct(t.accuracy) }}</div>
              <Meter :value="t.accuracy" />
              <div class="l" style="margin-top: 4px">{{ t.correct }} of {{ t.n }} recent question(s) · {{ t.bank }} in bank</div>
            </template>
            <div v-else class="l">Not practised yet · {{ t.bank }} in bank</div>
          </div>
        </div>
      </div>
      <div v-if="prog.sessions.length" class="panel">
        <h3>Recent sessions</h3>
        <table>
          <tbody>
            <tr v-for="s in prog.sessions" :key="s.id"><td>{{ when(s.at) }}</td><td>{{ s.correct }} / {{ s.total }} correct</td></tr>
          </tbody>
        </table>
      </div>
    </template>
  </template>
</template>
