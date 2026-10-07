<script setup>
// A live practice session, question by question, until the summary.
// The server owns the session: every question is fetched fresh, answers
// are graded there, and timers count down from the server's remainingMs.
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { api, rerender, setTab } from '../api.js';
import { toast, action, fmtBundle } from '../ui.js';
import { store } from './home.js';
import QuestionForm from './QuestionForm.vue';
import ResultBlock from './ResultBlock.vue';
import ReportForm from './ReportForm.vue';

const props = defineProps({ sid: { type: String, required: true }, initial: { type: Object, required: true } });
const sid = props.sid;
const home = store.home;
const pet = home.catalog.pets.find((p) => p.id === home.inventory.equippedPet);
const item = home.catalog.items.find((i) => i.id === home.inventory.equippedItem);
const notes = props.initial.notes;

// --- battle arena (persists across questions) ---
const npc = ref({ ...props.initial.npc });
const hpWidth = ref(`${(npc.value.hp / npc.value.maxHp) * 100}%`);
const dmgs = ref([]);
const petSprite = ref(null);
const npcSprite = ref(null);
const replay = (node, cls) => {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth; // restart CSS animation
  node.classList.add(cls);
};

// --- the panel below the arena ---
const phase = ref('loading'); // loading | question | summary | error
const loadError = ref('');
const state = ref(props.initial);
const question = ref(null);
const qKey = ref(0);
const form = ref(null);
const feedback = ref(null); // { kind: 'retry', submission } | { kind: 'result', r }
const timerText = ref('');
const timerLow = ref(false);
const reportOpen = ref(false);
const reportDone = ref('');
const nextBtn = ref(null);
const summary = ref(null);
const fbComment = ref('');
const fbDone = ref(false);

let alive = true;
let countdown = null;
let turn = 0;

async function showQuestion() {
  // A double-clicked "Next" (or held Enter) would run this twice; only
  // the latest call may draw, and any previous timer is stopped first.
  const mine = ++turn;
  clearInterval(countdown);
  form.value?.destroy();
  const s = await api('GET', `/api/student/sessions/${sid}`);
  if (mine !== turn || !alive) return;
  state.value = s;
  if (s.done) return showSummary();
  const q = s.question;
  question.value = q;
  feedback.value = null;
  reportOpen.value = false;
  reportDone.value = '';
  timerText.value = '';
  timerLow.value = false;
  qKey.value++;
  phase.value = 'question';
  await nextTick();
  if (mine !== turn || !alive) return;
  if (q.remainingMs !== null) {
    const deadline = Date.now() + q.remainingMs;
    const f = form.value;
    let id = null; // this question's own timer (never another question's)
    const tickTimer = () => {
      const left = Math.max(0, deadline - Date.now());
      timerText.value = `⏱ ${Math.ceil(left / 1000)}s`;
      timerLow.value = left < 10000;
      if (left <= 0) {
        clearInterval(id);
        f?.submitEmpty();
      }
    };
    id = countdown = setInterval(tickTimer, 250);
    tickTimer();
  }
}

// QuestionForm calls this with the student's submission
function answerer(q) {
  return async (submission) => {
    clearInterval(countdown);
    const f = form.value;
    let r;
    try {
      r = await api('POST', `/api/student/sessions/${sid}/answer`, { index: q.index, ...submission });
    } catch (err) {
      toast(err.message, true);
      if (!alive) return;
      // Keep the original submission for a safe idempotent retry.
      feedback.value = { kind: 'retry', submission, form: f };
      return;
    }
    if (!alive) return;
    f?.showResult(r);
    npc.value = { ...r.npc };
    hpWidth.value = `${(r.npc.hp / r.npc.maxHp) * 100}%`;
    if (r.attack) {
      replay(petSprite.value, 'lunge');
      setTimeout(() => {
        if (!alive) return;
        replay(npcSprite.value, 'shake');
        dmgs.value.push({ id: dmgs.value.length, text: `-${r.attack.damage}` });
        if (r.npc.hp <= 0) npcSprite.value?.classList.add('defeated');
      }, 250);
    } else {
      replay(npcSprite.value, 'wobble');
    }
    feedback.value = { kind: 'result', r };
    await nextTick();
    nextBtn.value?.focus();
  };
}

function retryAnswer() {
  const { form: f, submission } = feedback.value;
  f.unlock();
  f.retry(submission);
}

const onNext = action(showQuestion);
const onRetryQuestion = action(showQuestion);

async function showSummary() {
  const s = await api('GET', `/api/student/sessions/${sid}/summary`);
  if (!alive) return;
  home.wallet = s.wallet;
  summary.value = s;
  phase.value = 'summary';
}

const rate = (n) => action(async () => {
  await api('POST', `/api/student/sessions/${sid}/feedback`, { rating: n, comment: fbComment.value });
  fbDone.value = true;
});
const FACES = [[1, '😕', 'Frustrating'], [2, '😐', 'OK'], [3, '🙂', 'Good']];

onMounted(async () => {
  try {
    await showQuestion();
  } catch (err) {
    if (!alive) return;
    loadError.value = err.message;
    phase.value = 'error';
  }
});
// Leaving the tab mid-question must stop the timer, or it would later
// submit "time's up" for a quiz you can no longer see.
onUnmounted(() => {
  alive = false;
  clearInterval(countdown);
  form.value?.destroy();
});
</script>

<template>
  <div class="arena">
    <div class="fighter">
      <span ref="petSprite" class="sprite">{{ pet.emoji }}<span v-if="item" class="hat">{{ item.emoji }}</span></span>
      <div class="name">Your {{ pet.name }}</div>
    </div>
    <div class="fighter">
      <span ref="npcSprite" class="sprite">{{ npc.emoji }}</span>
      <div class="name">{{ npc.name }}</div>
      <div class="hp"><div :style="{ width: hpWidth }"></div></div>
      <span v-for="d in dmgs" :key="d.id" class="dmg">{{ d.text }}</span>
    </div>
  </div>
  <div v-if="notes.length" class="note small">{{ notes.join(' ') }}</div>
  <div class="panel">
    <template v-if="phase === 'error'">
      <div class="note bad">{{ loadError }}</div>
      <button class="btn primary" @click="onRetryQuestion">Retry question</button>
    </template>

    <template v-else-if="phase === 'question'">
      <div class="quiz-head">
        <span class="small muted">Question {{ question.index + 1 }} of {{ state.total }} · <span class="badge plain">{{ question.topic }}</span></span>
        <span class="timer" :class="{ low: timerLow }">{{ timerText }}</span>
      </div>
      <QuestionForm :key="qKey" ref="form" :q="question" :submit="answerer(question)" />
      <div>
        <template v-if="feedback?.kind === 'retry'">
          <div class="note bad">Your answer could not be confirmed. Retry to recover the result.</div>
          <button class="btn primary" @click="retryAnswer">Retry answer</button>
        </template>
        <template v-else-if="feedback?.kind === 'result'">
          <ResultBlock :r="feedback.r" :correct-text="feedback.r.attack ? `Correct! ${pet.name} used ${feedback.r.attack.move}.` : 'Correct!'" />
          <div class="row" style="margin-top: 12px">
            <button ref="nextBtn" class="btn primary" @click="onNext">{{ feedback.r.done ? 'See results' : 'Next question →' }}</button>
            <button class="btn small" @click="(reportOpen = true), (reportDone = '')">Report a problem with this question</button>
          </div>
          <div>
            <div v-if="reportDone" class="note good small">{{ reportDone }}</div>
            <ReportForm v-else-if="reportOpen" :question-id="question.questionId" @sent="(msg) => (reportDone = msg)" @cancel="reportOpen = false" />
          </div>
        </template>
      </div>
    </template>

    <template v-else-if="phase === 'summary'">
      <h2>{{ summary.npc.hp <= 0 ? 'The Fog of Confusion is defeated! 🎉' : 'Session complete' }}</h2>
      <p>{{ summary.correct }} of {{ summary.total }} correct · +{{ summary.coins }} 🪙 this session · balance {{ summary.wallet.balance }} 🪙</p>
      <p v-if="summary.resources && Object.keys(summary.resources).length">Kingdom supplies: +{{ fmtBundle(summary.resources, home.catalog.resources) }}</p>
      <p v-if="summary.participation?.point" class="small">+1 participation point for this class.</p>
      <p v-else-if="summary.participation?.capped" class="small muted">Participation points: weekly maximum already reached.</p>
      <p v-if="summary.provisional" class="small muted">{{ summary.provisional }} written answer(s) have a provisional mark that your professor may review.</p>
      <table>
        <tbody>
          <tr v-for="(t, name) in summary.byTopic" :key="name"><td>{{ name }}</td><td>{{ t.correct }} / {{ t.n }}</td></tr>
        </tbody>
      </table>
      <div class="spacer"></div>
      <div v-if="summary.wallet.earnedToday >= summary.wallet.dailyCap" class="note warn small">You reached today's coin cap. You can keep practising; coins reset tomorrow.</div>
      <div v-if="!summary.feedbackGiven">
        <div v-if="fbDone" class="note good small">Thanks - this helps improve the app.</div>
        <div v-else class="panel" style="background: var(--bg)">
          <b>How was this session?</b>
          <div class="row" style="margin: 8px 0">
            <input v-model="fbComment" type="text" maxlength="300" aria-label="Session comment" placeholder="Anything that was confusing or annoying? (optional, no personal info)" />
          </div>
          <div class="row faces">
            <button v-for="[n, face, label] in FACES" :key="n" class="btn" :aria-label="label" :title="label" @click="rate(n)($event)">{{ face }}</button>
          </div>
        </div>
      </div>
      <div class="row" style="margin-top: 12px">
        <button class="btn primary" @click="rerender">Back to practice</button>
        <button class="btn" @click="setTab('kingdom')">Build your kingdom</button>
        <button class="btn" @click="setTab('world')">Enter the World</button>
      </div>
    </template>
  </div>
</template>
