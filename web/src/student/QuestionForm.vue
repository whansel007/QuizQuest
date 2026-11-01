<script setup>
// ============================================================
// Student question UI for every format (used by Practice and World)
// ------------------------------------------------------------
// Props: q (the question WITHOUT its answer), submit(submission).
// Exposed for the parent (via a template ref):
//   submitEmpty() submit "no answer" (timer ran out)
//   retry(sub)    resubmit the same answer (after a lost response)
//   showResult(r) reveal the server's verdict on the options/inputs
//   unlock()      allow answering again
//   destroy()     stop listening (question discarded unanswered)
// Number keys 1-5 pick an option; Enter submits typed answers.
// ============================================================
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { toast } from '../ui.js';

const props = defineProps({ q: { type: Object, required: true }, submit: { type: Function, required: true } });
const LETTERS = 'ABCDEF';
const q = props.q;
const kind = q.type === 'mcq' || q.type === 'tf' ? 'single' : q.type;

const locked = ref(false);
const picked = ref(null); // single answer: the option clicked
const ticked = reactive(new Set()); // select-all: the options ticked
const value = ref(''); // numeric
const text = ref(''); // short answer
const result = ref(null); // the server's verdict, once shown
const numericInput = ref(null);
let alive = true;

// page-level keyboard shortcut listener, attached only while answerable
let listening = false;
function listen(on) {
  if (!hasKeys || on === listening) return;
  listening = on;
  if (on) document.addEventListener('keydown', onKey);
  else document.removeEventListener('keydown', onKey);
}

function send(sub) {
  if (locked.value) return;
  locked.value = true;
  listen(false);
  Promise.resolve().then(() => props.submit(sub)).catch((err) => {
    if (!alive) return;
    unlock();
    toast(err.message || 'Could not submit the answer. Please retry.', true);
  });
}
function unlock() {
  locked.value = false;
  if (kind === 'single') picked.value = null;
  listen(true);
}

function pick(i) {
  if (locked.value) return;
  picked.value = i;
  send({ choice: i });
}
function tick(i) {
  if (locked.value) return;
  if (ticked.has(i)) ticked.delete(i);
  else ticked.add(i);
}
function goMulti() {
  if (locked.value) return;
  if (ticked.size) send({ choices: [...ticked] });
  else toast('Tick at least one option first.');
}
function goNumeric() {
  if (locked.value) return;
  if (value.value.trim()) send({ value: value.value.trim() });
  else toast('Type a number first.');
}
function goShort() {
  if (locked.value) return;
  if (text.value.trim()) send({ text: text.value });
  else toast('Write an answer first.');
}

const hasKeys = kind === 'single' || kind === 'multi';
function onKey(e) {
  if (!alive) return listen(false); // view was replaced without answering
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  const i = Number(e.key) - 1;
  if (i >= 0 && i < (q.options || []).length) {
    if (kind === 'single') pick(i);
    else tick(i);
  }
  if (kind === 'multi' && e.key === 'Enter') goMulti();
}

// Mark options with text as well as colour, so the result doesn't
// depend on telling green from red (and screen readers hear it).
const marks = computed(() => {
  const r = result.value;
  if (!r) return [];
  const rv = r.reveal || {};
  const out = [];
  if (kind === 'single' && rv.answerIndex !== undefined) {
    out[rv.answerIndex] = { cls: 'right', text: ' ✓ correct answer' };
    if (Number.isInteger(rv.choice) && !r.correct && rv.choice !== rv.answerIndex) out[rv.choice] = { cls: 'wrong', text: ' ✗ your answer' };
  }
  if (kind === 'multi') {
    (q.options || []).forEach((_, i) => {
      if (rv.answerIndexes.includes(i)) out[i] = { cls: 'right', text: rv.choices.includes(i) ? ' ✓ correct' : ' ✓ correct (missed)' };
      else if (rv.choices.includes(i)) out[i] = { cls: 'wrong', text: ' ✗ not correct' };
    });
  }
  return out;
});
const reveal = computed(() => result.value?.reveal || {});

function optionClass(i) {
  const m = marks.value[i];
  return { picked: kind === 'single' ? picked.value === i : ticked.has(i), [m?.cls]: !!m };
}

onMounted(() => {
  listen(true);
  if (kind === 'numeric') setTimeout(() => numericInput.value?.focus(), 0);
});
onUnmounted(() => {
  alive = false;
  listen(false);
});

defineExpose({
  submitEmpty: () => send({}),
  retry: (submission) => send(submission),
  showResult: (r) => (result.value = r),
  unlock,
  destroy: () => {
    locked.value = true;
    listen(false);
  },
});
</script>

<template>
  <div>
    <div class="stem">{{ q.stem }}</div>

    <div v-if="kind === 'single'" class="options" :class="{ two: q.type === 'tf' }">
      <button v-for="(opt, i) in q.options" :key="i" :disabled="locked" :class="optionClass(i)" @click="pick(i)">
        <b>{{ LETTERS[i] + '. ' }}</b>{{ opt }}<span v-if="marks[i]" class="mark">{{ marks[i].text }}</span>
      </button>
    </div>

    <div v-else-if="kind === 'multi'">
      <p class="small muted">Select all that apply.</p>
      <div class="options">
        <button v-for="(opt, i) in q.options" :key="i" :disabled="locked" :aria-pressed="String(ticked.has(i))" :class="optionClass(i)" @click="tick(i)">
          <b>{{ ticked.has(i) ? '☑ ' : '☐ ' }}</b>{{ opt }}<span v-if="marks[i]" class="mark">{{ marks[i].text }}</span>
        </button>
      </div>
      <div style="margin-top: 10px"><button class="btn primary" :disabled="locked" @click="goMulti">Submit answer</button></div>
    </div>

    <div v-else-if="kind === 'numeric'" class="row">
      <input ref="numericInput" v-model="value" aria-label="Numeric answer" type="text" inputmode="decimal" autocomplete="off" placeholder="Your answer" style="max-width: 220px" :disabled="locked" @keydown.enter="goNumeric" />
      <span v-if="q.unit">{{ q.unit }}</span>
      <button class="btn primary" :disabled="locked" @click="goNumeric">Submit answer</button>
    </div>

    <div v-else-if="kind === 'short'">
      <textarea v-model="text" aria-label="Written answer" rows="4" maxlength="1000" placeholder="Write your answer in a few sentences." :disabled="locked"></textarea>
      <p class="small muted" style="margin-top: 4px">Marked against key points; your professor may review the mark. Please don't include personal information.</p>
      <button class="btn primary" :disabled="locked" @click="goShort">Submit answer</button>
    </div>

    <template v-if="result">
      <div v-if="kind === 'numeric'" class="small" style="margin-top: 8px">
        Answer: <b>{{ `${reveal.answer}${reveal.unit ? ' ' + reveal.unit : ''}` }}</b>{{ reveal.tolerance ? ` (accepted within ±${reveal.tolerance})` : '' }}
      </div>
      <div v-if="kind === 'short'" class="panel" style="margin-top: 10px; background: var(--bg)">
        <div class="small"><b>Key points: </b></div>
        <ul style="margin: 4px 0 8px">
          <li v-for="(k, i) in reveal.keyPoints || []" :key="i" class="small">{{ (reveal.coveredPoints || []).includes(i) ? '✓ ' : '○ ' }}{{ k }}</li>
        </ul>
        <div class="small"><b>Model answer: </b>{{ reveal.modelAnswer }}</div>
        <div v-if="reveal.feedback" class="small" style="margin-top: 6px">{{ reveal.feedback }}</div>
      </div>
    </template>
  </div>
</template>
