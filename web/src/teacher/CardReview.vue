<script setup>
// ============================================================
// Question bank: optional card mode for vetting AI drafts.
// One draft at a time on a large card. Swipe or press Right Arrow
// to approve (publish), Left Arrow to deny (reject), or use the
// buttons. Decisions go through the same status API as the list
// view; a failed save keeps the card and says what happened.
// ============================================================
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { api, setTab } from '../api.js';
import { toast } from '../ui.js';
import AsyncButton from '../components/AsyncButton.vue';
import QuestionDetails from './QuestionDetails.vue';
import QuestionEditor from './QuestionEditor.vue';
import ReportReview from './ReportReview.vue';
import { QUESTION_LABELS } from './question-types.js';
import { ORIGIN, topicLabel } from './courses.js';

const props = defineProps({
  queue: { type: Array, required: true }, // eligible drafts, in review order
  course: { type: Object, required: true },
  passages: { type: Array, required: true },
  scoped: { type: Boolean, default: false }, // narrowed to one topic
});
const emit = defineEmits(['decided', 'exit']);

const SWIPE_DISTANCE = 120;
const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const current = computed(() => props.queue[0] || null);
const v = computed(() => current.value?.latest);
const type = computed(() => v.value?.type || 'mcq');
const topic = computed(() => props.course.topics.find((t) => t.id === current.value?.topicId));
const outcome = computed(() => topic.value?.outcomes?.find((o) => o.id === current.value?.outcomeId));
const reviewed = ref(0);
const progress = computed(() => {
  const total = reviewed.value + props.queue.length;
  return total ? Math.round((reviewed.value / total) * 100) : 100;
});

// ---- decisions --------------------------------------------------------------
const pending = ref(null); // 'approve' | 'deny' while saving
const leaving = ref(null); // the direction the card is flying off in
const error = ref('');
const dragX = ref(0);
const editing = ref(false);
const editorKey = ref(0);
const card = ref(null);

watch(() => current.value?.id, () => {
  dragX.value = 0;
  error.value = '';
  editing.value = false;
});

async function decide(kind) {
  const q = current.value;
  if (!q || pending.value || editing.value) return;
  pending.value = kind;
  error.value = '';
  dragX.value = kind === 'approve' ? SWIPE_DISTANCE * 0.6 : -SWIPE_DISTANCE * 0.6;
  try {
    await api('POST', `/api/teacher/questions/${q.id}/status`, { action: kind === 'approve' ? 'approve' : 'reject' });
  } catch (err) {
    // nothing changed on the server: the card stays and can be tried again
    pending.value = null;
    dragX.value = 0;
    error.value = `Couldn't ${kind === 'approve' ? 'approve' : 'deny'} this question: ${err.message} It is still a draft; try again or use the list view.`;
    return;
  }
  leaving.value = kind;
  await new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : 220));
  reviewed.value += 1;
  toast(kind === 'approve' ? 'Approved and published' : 'Denied (rejected)');
  emit('decided', { id: q.id, status: kind === 'approve' ? 'published' : 'rejected' });
  leaving.value = null;
  pending.value = null;
  dragX.value = 0;
  card.value?.focus({ preventScroll: true });
}

async function regenerate() {
  await api('POST', `/api/teacher/questions/${current.value.id}/regenerate`);
  toast('Replacement queued. Your original draft is kept.');
  setTab('generate');
}
function edit() {
  editorKey.value += 1;
  editing.value = true;
}

// ---- keyboard: arrows decide unless focus is in something arrows control ----
function arrowsBelongToControl(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  return Boolean(target.closest('[role="slider"], [role="listbox"], [role="menu"], [role="radiogroup"], [role="tablist"], dialog[open]'));
}
function onKey(event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!current.value || editing.value || arrowsBelongToControl(event.target)) return;
  event.preventDefault();
  decide(event.key === 'ArrowRight' ? 'approve' : 'deny');
}
onMounted(() => window.addEventListener('keydown', onKey));
onUnmounted(() => window.removeEventListener('keydown', onKey));

// ---- swipe / drag ---------------------------------------------------------------
// Horizontal drags decide; a mostly vertical gesture is left to page scrolling.
let drag = null;
function onPointerDown(event) {
  if (pending.value || editing.value || event.button > 0) return;
  if (event.target.closest('button, a, input, select, textarea, summary, label, [contenteditable]')) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, locked: false };
}
function onPointerMove(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.locked) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
    if (Math.abs(dx) < 8) return;
    drag.locked = true;
    card.value?.setPointerCapture?.(event.pointerId);
  }
  dragX.value = dx;
}
function onPointerUp(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const wasDragging = drag.locked;
  drag = null;
  if (!wasDragging) return;
  if (Math.abs(dragX.value) >= SWIPE_DISTANCE) decide(dragX.value > 0 ? 'approve' : 'deny');
  else dragX.value = 0;
}

const hint = computed(() => (pending.value === 'approve' || dragX.value > 24 ? 'approve' : pending.value === 'deny' || dragX.value < -24 ? 'deny' : null));
const hintStrength = computed(() => (pending.value ? 1 : Math.min(1, Math.abs(dragX.value) / SWIPE_DISTANCE)));
const cardStyle = computed(() => {
  if (leaving.value) return { transform: `translateX(${leaving.value === 'approve' ? 120 : -120}%) rotate(${leaving.value === 'approve' ? 8 : -8}deg)`, opacity: 0 };
  if (!dragX.value) return {};
  return { transform: `translateX(${dragX.value}px) rotate(${reduceMotion ? 0 : dragX.value / 40}deg)`, transition: drag ? 'none' : undefined };
});
</script>

<template>
  <section class="card-review" aria-label="Review AI drafts as cards">
    <div class="cr-progress" role="status">
      <span><b>{{ reviewed }}</b> reviewed · <b>{{ queue.length }}</b> left{{ scoped ? ' in this topic' : '' }}</span>
      <span class="cr-bar" aria-hidden="true"><span :style="{ width: progress + '%' }"></span></span>
    </div>

    <div v-if="!current" class="t-empty cr-empty">
      <h3>{{ reviewed ? 'All caught up' : 'Nothing to review' }}</h3>
      <p v-if="reviewed">You reviewed {{ reviewed }} AI draft{{ reviewed === 1 ? '' : 's' }}. There are no more waiting{{ scoped ? ' in this topic' : '' }}.</p>
      <p v-else>No AI-drafted questions are waiting for review{{ scoped ? ' in this topic' : '' }}.</p>
      <button class="btn primary" type="button" @click="emit('exit')">Back to the question list</button>
    </div>

    <template v-else>
      <p class="cr-help small muted">
        Swipe or drag the card right to <b>approve and publish</b>, left to <b>deny</b> (reject). Keys:
        <kbd>→</kbd> approve · <kbd>←</kbd> deny.
      </p>
      <div class="cr-stage">
        <article
          :key="current.id"
          ref="card"
          class="panel cr-card"
          :class="{ dragging: !!dragX && !pending, [`hint-${hint}`]: hint }"
          :style="cardStyle"
          tabindex="-1"
          :aria-labelledby="`cr-title-${current.id}`"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <div v-if="hint" class="cr-stamp" :class="hint" :style="{ opacity: hintStrength }" aria-hidden="true">
            {{ hint === 'approve' ? (pending ? 'Approving…' : 'Approve') : (pending ? 'Denying…' : 'Deny') }}
          </div>
          <header class="cr-meta">
            <h3 :id="`cr-title-${current.id}`" class="sr-only">Draft question</h3>
            <span :class="'badge ' + current.status">{{ current.status }}</span>
            <span class="badge">{{ QUESTION_LABELS[type] || current.typeLabel }}</span>
            <span class="badge plain">{{ v.difficulty }}</span>
            <span v-if="current.cognitiveStyle" class="badge plain">{{ current.cognitiveStyle === 'application' ? 'Application' : 'Conceptual' }}</span>
            <span class="badge plain">{{ ORIGIN[current.origin] || current.origin }}</span>
            <span class="badge plain">v{{ v.v }}</span>
          </header>
          <dl class="cr-context">
            <div><dt>Topic</dt><dd>{{ topic ? topicLabel(topic) : current.assessment?.topic || '—' }}</dd></div>
            <div v-if="outcome"><dt>Learning outcome</dt><dd>{{ outcome.text }}</dd></div>
            <div><dt>Source</dt><dd>{{ current.sources.length ? current.sources.map((s) => s.title).join(', ') : v.sourceIds.length ? 'source removed' : 'none cited' }}</dd></div>
          </dl>
          <QuestionDetails :value="v" :sample="current.sample" />
          <div v-if="v.warnings?.length" class="note warn small" style="margin-top: 10px">{{ v.warnings.join(' ') }}</div>
          <ReportReview v-for="r in current.reports.filter((x) => !x.resolved)" :key="r.id" :question-id="current.id" :report="r" />
          <QuestionEditor v-if="editing" :key="editorKey" :course="course" :passages="passages" :q="current" @close="editing = false" />
        </article>
      </div>

      <div v-if="error" class="note bad cr-error" role="alert">{{ error }}</div>

      <div class="cr-decide">
        <button class="btn bad cr-deny" type="button" :disabled="!!pending || editing" @click="decide('deny')">
          <span aria-hidden="true">←</span> Deny
        </button>
        <button class="btn good cr-approve" type="button" :disabled="!!pending || editing" @click="decide('approve')">
          Approve &amp; publish <span aria-hidden="true">→</span>
        </button>
      </div>
      <div class="cr-secondary" aria-label="More actions for this question">
        <button class="btn small" type="button" :disabled="!!pending" @click="edit">Edit</button>
        <AsyncButton v-if="course.authoringEnabled && current.generationId" class="btn small" :disabled="!!pending" :run="regenerate">Regenerate draft</AsyncButton>
        <button class="btn small" type="button" @click="emit('exit')">Back to list</button>
      </div>
    </template>
  </section>
</template>

<style scoped>
.card-review { display: grid; gap: 12px; }
.cr-progress { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; font-size: 14px; }
.cr-bar { flex: 1 1 200px; height: 8px; overflow: hidden; background: var(--line); border-radius: 99px; }
.cr-bar > span { display: block; height: 100%; background: var(--accent); transition: width 0.3s ease; }
.cr-help { margin: 0; }
.cr-help kbd { padding: 1px 6px; border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 5px; background: var(--panel); font: 700 12px var(--font-body); }
.cr-stage { position: relative; overflow-x: clip; padding: 4px 0; }
.cr-card { position: relative; width: min(100%, 980px); min-height: 52vh; margin: 0 auto; padding: 22px 26px; cursor: grab; touch-action: pan-y; user-select: none; transition: transform 0.22s ease, opacity 0.22s ease, box-shadow 0.15s; }
.cr-card :deep(input), .cr-card :deep(textarea), .cr-card :deep(select) { user-select: text; }
.cr-card.dragging { cursor: grabbing; box-shadow: 0 16px 40px rgba(22, 33, 58, 0.18); }
.cr-card.hint-approve { border-color: var(--good); }
.cr-card.hint-deny { border-color: var(--bad); }
.cr-card:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
.cr-stamp { position: absolute; top: 18px; z-index: 2; padding: 6px 14px; border: 3px solid; border-radius: 8px; background: var(--panel); font: 800 18px var(--font-display); letter-spacing: 0.04em; text-transform: uppercase; pointer-events: none; }
.cr-stamp.approve { right: 22px; color: var(--good); transform: rotate(6deg); }
.cr-stamp.deny { left: 22px; color: var(--bad); transform: rotate(-6deg); }
.cr-meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cr-context { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px 18px; margin: 14px 0 4px; padding: 10px 12px; background: var(--bg); border-radius: 8px; }
.cr-context dt { color: var(--muted); font-size: 11px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; }
.cr-context dd { margin: 2px 0 0; font-size: 14px; overflow-wrap: anywhere; }
.cr-card :deep(.question-stem) { font-size: 1.2rem; }
.cr-error { width: min(100%, 980px); margin: 0 auto; }
/* decisions stay in reach however tall the card is */
.cr-decide { position: sticky; bottom: 0; z-index: 3; display: flex; justify-content: center; gap: 14px; padding: 12px 0; background: linear-gradient(transparent, var(--bg) 35%); }
.cr-decide .btn { min-width: 170px; min-height: 48px; font-size: 16px; font-weight: 800; }
.cr-approve { color: #fff !important; background: var(--good); border-color: var(--good); }
.cr-deny { background: var(--panel); border-color: var(--bad); }
.cr-secondary { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.cr-empty h3 { color: var(--ink); }
@media (max-width: 640px) {
  .cr-card { min-height: 0; padding: 16px; }
  .cr-decide .btn { flex: 1; min-width: 0; }
}
@media (prefers-reduced-motion: reduce) { .cr-card { transition: none; } }
</style>
