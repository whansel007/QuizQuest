<script setup>
// A live practice session, question by question, until the summary.
// The server owns the session: every question is fetched fresh, answers
// are graded there, and timers count down from the server's remainingMs.
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
import { S, api, rerender, setTab } from '../api.js';
import { toast, action, fmtBundle } from '../ui.js';
import { store } from './home.js';
import QuestionForm from './QuestionForm.vue';
import ResultBlock from './ResultBlock.vue';
import ReportForm from './ReportForm.vue';
import AvatarPreview from './AvatarPreview.vue';
import { TOWN_AVATAR_DEFAULT_COLOR } from '../../../config/tuning.js';

const props = defineProps({ sid: { type: String, required: true }, initial: { type: Object, required: true } });
const sid = props.sid;
const home = store.home;
const avatarVisual = computed(() => S.me?.avatarVisual || { color: S.me?.avatarColor || TOWN_AVATAR_DEFAULT_COLOR, hat: null, accessory: null });
const notes = props.initial.notes;

// --- battle stage (persists across questions) ---
const npc = ref({ ...props.initial.npc });
const enemyHpWidth = computed(() => `${Math.max(0, (npc.value.hp / npc.value.maxHp) * 100)}%`);
const playerMaxHp = 100;
const playerHp = ref(playerMaxHp);
const playerHpWidth = computed(() => `${(playerHp.value / playerMaxHp) * 100}%`);
const enemyDamage = ref([]);
const playerDamage = ref([]);
const battleTurn = ref('');
const isAnimatingTurn = ref(false);
const encounterIntro = ref(true);
const petSprite = ref(null);
const npcSprite = ref(null);
let damageId = 0;
const replay = (node, cls) => {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth; // restart CSS animation
  node.classList.add(cls);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function animateTurn(result) {
  encounterIntro.value = false;
  isAnimatingTurn.value = true;
  if (result.correct && result.attack) {
    battleTurn.value = 'hero';
    replay(petSprite.value, 'hero-attack');
    await delay(280);
    if (!alive) return;
    replay(npcSprite.value, 'battle-impact');
    enemyDamage.value.push({ id: damageId++, text: `−${result.attack.damage}` });
    npc.value = { ...result.npc };
    if (npc.value.hp <= 0) npcSprite.value?.classList.add('defeated');
  } else {
    battleTurn.value = 'enemy';
    replay(npcSprite.value, 'enemy-attack');
    await delay(280);
    if (!alive) return;
    replay(petSprite.value, 'battle-impact');
    playerHp.value = Math.max(0, playerHp.value - 12);
    playerDamage.value.push({ id: damageId++, text: '−12' });
  }
  await delay(560);
  battleTurn.value = '';
  isAnimatingTurn.value = false;
}

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
let introTimer = null;
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
    feedback.value = { kind: 'result', r };
    await animateTurn(r);
    if (!alive) return;
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
  introTimer = setTimeout(() => { encounterIntro.value = false; }, 1350);
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
  clearTimeout(introTimer);
  clearInterval(countdown);
  form.value?.destroy();
});
</script>

<template>
  <div class="practice-quiz-layout" :class="{ 'encounter-intro': encounterIntro, 'turn-hero': battleTurn === 'hero', 'turn-enemy': battleTurn === 'enemy' }">
    <section class="quiz-content-column" aria-label="Practice question">
      <template v-if="phase === 'error'">
        <section class="panel quiz-details-card">
          <div class="quiz-section-kicker">PRACTICE DETAILS</div>
          <div class="note bad">{{ loadError }}</div>
          <button class="btn primary" @click="onRetryQuestion">Retry question</button>
        </section>
      </template>

      <template v-else-if="phase === 'summary'">
        <section class="panel quiz-summary-card">
          <div class="quiz-section-kicker">SESSION COMPLETE</div>
          <h2>{{ summary.npc.hp <= 0 ? 'The Fog of Confusion is defeated! 🎉' : 'Session complete' }}</h2>
          <p>{{ summary.correct }} of {{ summary.total }} correct · +{{ summary.coins }} 🪙 this session · balance {{ summary.wallet.balance }} 🪙</p>
          <p v-if="summary.resources && Object.keys(summary.resources).length">Kingdom supplies: +{{ fmtBundle(summary.resources, home.catalog.resources) }}</p>
          <p v-if="summary.provisional" class="small muted">{{ summary.provisional }} written answer(s) have a provisional mark that your professor may review.</p>
          <table>
            <tbody>
              <tr v-for="(t, name) in summary.byTopic" :key="name"><td>{{ name }}</td><td>{{ t.correct }} / {{ t.n }}</td></tr>
            </tbody>
          </table>
          <div v-if="summary.wallet.earnedToday >= summary.wallet.dailyCap" class="note warn small">You reached today's coin cap. You can keep practising; coins reset at midnight.</div>
          <div v-if="!summary.feedbackGiven">
            <div v-if="fbDone" class="note good small">Thanks - this helps improve the app.</div>
            <div v-else class="panel quiz-feedback-card">
              <b>How was this session?</b>
              <div class="row" style="margin: 8px 0">
                <input v-model="fbComment" type="text" maxlength="300" aria-label="Session comment" placeholder="Anything that was confusing or annoying? (optional, no personal info)" />
              </div>
              <div class="row faces">
                <button v-for="[n, face, label] in FACES" :key="n" class="btn" :aria-label="label" :title="label" @click="rate(n)($event)">{{ face }}</button>
              </div>
            </div>
          </div>
          <div class="quiz-action-row">
            <button class="btn primary" @click="rerender">Back to practice</button>
            <button class="btn" @click="setTab('progress')">View my progress</button>
            <button class="btn" @click="setTab('kingdom')">Build your kingdom</button>
            <button class="btn" @click="setTab('world')">Enter the World</button>
          </div>
        </section>
      </template>

      <template v-else>
        <section class="panel quiz-prompt-card">
          <div class="quiz-head">
            <span class="quiz-question-number">Question {{ (question?.index ?? 0) + 1 }} <span>of {{ state.total }}</span></span>
            <span v-if="question" class="badge plain quiz-topic">{{ question.topic }}</span>
            <span class="timer" :class="{ low: timerLow }">{{ timerText }}</span>
          </div>
          <div class="stem">{{ question?.stem || 'Preparing your next question…' }}</div>
        </section>

        <section class="panel quiz-answers-card" aria-label="Answer choices">
          <div class="quiz-section-kicker">CHOOSE YOUR ANSWER</div>
          <QuestionForm v-if="phase === 'question' && question" :key="qKey" ref="form" :q="question" :submit="answerer(question)" />
          <p v-else class="small muted">Preparing your next question…</p>
        </section>

        <section class="panel quiz-details-card">
          <div class="quiz-section-kicker">DETAILS</div>
          <p v-if="notes.length" class="small muted">{{ notes.join(' ') }}</p>
          <p v-else-if="!feedback" class="small muted">A correct answer lets your hero strike. A miss gives the Fog a turn.</p>
          <template v-if="feedback?.kind === 'retry'">
            <div class="note bad">Your answer could not be confirmed. Retry to recover the result.</div>
            <button class="btn primary" @click="retryAnswer">Retry answer</button>
          </template>
          <template v-else-if="feedback?.kind === 'result'">
            <ResultBlock :r="feedback.r" :correct-text="feedback.r.attack ? `Correct! Your cat-ball hero used ${feedback.r.attack.move}.` : 'Correct!'" />
            <div class="quiz-action-row">
              <button ref="nextBtn" class="btn primary" :disabled="isAnimatingTurn" @click="onNext">{{ isAnimatingTurn ? 'Battling…' : feedback.r.done ? 'See results' : 'Next question →' }}</button>
              <button class="btn small" :disabled="isAnimatingTurn" @click="(reportOpen = true), (reportDone = '')">Report a problem</button>
            </div>
            <div>
              <div v-if="reportDone" class="note good small">{{ reportDone }}</div>
              <ReportForm v-else-if="reportOpen" :key="qKey" :question-id="question.questionId" :attempt-id="feedback.r.attemptId" @sent="(msg) => (reportDone = msg)" @cancel="reportOpen = false" />
            </div>
          </template>
        </section>
      </template>
    </section>

    <aside class="quiz-battle-stage" aria-label="Battle">
      <div class="battle-enemy-status">
        <div class="battle-status-top"><span>FOG OF CONFUSION</span><strong>{{ npc.hp }} <small>/ {{ npc.maxHp }} HP</small></strong></div>
        <div class="battle-name">{{ npc.name }}</div>
        <div class="battle-health" role="progressbar" :aria-label="`${npc.name} health`" :aria-valuemin="0" :aria-valuemax="npc.maxHp" :aria-valuenow="npc.hp"><span :style="{ width: enemyHpWidth }"></span></div>
      </div>

      <div class="battle-enemy" aria-hidden="true">
        <span ref="npcSprite" class="battle-enemy-sprite">{{ npc.emoji }}</span>
        <span v-for="d in enemyDamage" :key="d.id" class="battle-damage enemy-damage">{{ d.text }}</span>
      </div>

      <div class="battle-player" aria-hidden="true">
        <span ref="petSprite" class="battle-player-sprite">
          <AvatarPreview class="duel-avatar-preview" :color="avatarVisual.color" :hat-id="avatarVisual.hat" :accessory-id="avatarVisual.accessory" />
        </span>
        <span v-for="d in playerDamage" :key="d.id" class="battle-damage player-damage">{{ d.text }}</span>
      </div>

      <div class="battle-player-status">
        <div class="battle-status-top"><span>YOUR HERO</span><strong>{{ playerHp }} <small>/ {{ playerMaxHp }} HP</small></strong></div>
        <div class="battle-name">Cat-ball hero</div>
        <div class="battle-health player-health" role="progressbar" aria-label="Your hero health" :aria-valuemin="0" :aria-valuemax="playerMaxHp" :aria-valuenow="playerHp"><span :style="{ width: playerHpWidth }"></span></div>
      </div>
      <div class="battle-turn-label" role="status" aria-live="polite">
        {{ battleTurn === 'hero' ? 'Your hero attacks!' : battleTurn === 'enemy' ? 'The Fog attacks!' : phase === 'summary' ? 'Battle complete' : 'Your turn' }}
      </div>
    </aside>
  </div>
</template>
