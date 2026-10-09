<script setup>
// ============================================================
// Question quality: missing tags, difficulty tags that don't match how
// students did, and wrong options almost nobody picks.
// ============================================================
import { pct } from '../../ui.js';

defineProps({
  tags: { type: Object, required: true },
  quality: { type: Object, required: true },
});
const emit = defineEmits(['open-question', 'open-in-bank']);
const frac = (r) => `${pct(r.accuracy)} (${r.correct}/${r.n})`;
</script>

<template>
  <div>
    <h4>Tags</h4>
    <p class="small muted">Every question in the bank (except rejected ones) should have a topic, a learning outcome from that topic, and a difficulty. Analytics and adaptive practice rely on these tags.</p>
    <div :class="tags.issues.length ? 'note warn' : 'note good'">
      {{ tags.issues.length ? '⚠' : '✓' }} {{ tags.complete }} of {{ tags.total }} questions are fully tagged{{ tags.issues.length ? '.' : ' - nothing to fix.' }}
    </div>
    <div v-if="tags.issues.length" class="table-wrap">
      <table class="dash-table">
        <thead><tr><th>Question</th><th>Status</th><th>Missing or invalid</th><th></th></tr></thead>
        <tbody>
          <tr v-for="q in tags.issues" :key="q.questionId">
            <td class="q">{{ q.stem }}</td>
            <td><span :class="'badge ' + q.status">{{ q.status }}</span></td>
            <td>{{ q.missing.join(', ') }}</td>
            <td><button class="btn small" @click="emit('open-in-bank', q.questionId)">Fix in Question bank</button></td>
          </tr>
        </tbody>
      </table>
    </div>

    <h4>Difficulty check</h4>
    <p class="small muted">Compares each question's difficulty tag with how students actually did (at least {{ quality.difficultyCheck.minN }} confirmed answers): "easy" questions under {{ pct(quality.difficultyCheck.easyBelow) }} correct, or "hard" ones over {{ pct(quality.difficultyCheck.hardAbove) }} correct. Re-tagging keeps adaptive practice and reports honest.</p>
    <div v-if="!quality.difficulty.length" class="note good">✓ No mismatches in this period.</div>
    <div v-else class="table-wrap">
      <table class="dash-table">
        <thead><tr><th>Question</th><th>Topic</th><th>Tagged</th><th>Correct</th><th>Looks</th></tr></thead>
        <tbody>
          <tr v-for="q in quality.difficulty" :key="q.questionId">
            <td class="q"><button class="linklike" @click="emit('open-question', q.questionId)">{{ q.stem }}</button></td>
            <td class="label">{{ q.topic }}</td>
            <td>{{ q.tagged }}</td>
            <td class="num">{{ frac(q.accuracy) }}</td>
            <td><span class="badge draft">⚠ {{ q.verdict }}</span></td>
          </tr>
        </tbody>
      </table>
    </div>

    <h4>Rarely chosen wrong options</h4>
    <p class="small muted">Wrong options picked by under {{ pct(quality.unused.maxShare) }} of answers (questions with at least {{ quality.unused.minAnswers }} answers to the current version). An option nobody picks doesn't test anything: a more plausible distractor makes the question more useful. True/false questions are left out.</p>
    <div v-if="!quality.unusedOptions.length" class="note good">✓ Every wrong option is being chosen sometimes.</div>
    <div v-else class="table-wrap">
      <table class="dash-table">
        <thead><tr><th>Question</th><th>Rarely chosen</th><th>Answers</th></tr></thead>
        <tbody>
          <tr v-for="q in quality.unusedOptions" :key="q.questionId">
            <td class="q"><button class="linklike" @click="emit('open-question', q.questionId)">{{ q.stem }}</button></td>
            <td>{{ q.options.map((o) => `"${o.text}" (${o.count})`).join(', ') }}</td>
            <td class="num">{{ q.answered }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
