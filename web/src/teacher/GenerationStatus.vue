<script setup>
// ============================================================
// Floating status of a question-generation batch
// ------------------------------------------------------------
// Fixed to the bottom corner so progress stays visible while the professor
// scrolls the report and configuration. It never moves focus, scrolls or
// navigates by itself; "View Question Bank" only runs when clicked.
//   <GenerationStatus :job="job" @view="..." @resume="..." @dismiss="..." />
// ============================================================
import { computed, ref, watch, onUnmounted } from 'vue';
import Meter from '../components/Meter.vue';
import { when } from '../ui.js';
import { generationStatus } from './generation-status.js';

// job: the generation job to show (null hides it); topicLabel: set when the
// job belongs to another weekly topic than the one on screen
const props = defineProps({ job: Object, topicLabel: String, busy: Boolean });
const emit = defineEmits(['view', 'resume', 'dismiss']);
const status = computed(() => props.job && generationStatus(props.job));

// Dismissing removes the panel, so give focus back to where it came from
// (without scrolling) instead of dropping it on the page body.
const box = ref(null);
let returnTo = null;
function entered(e) {
  if (!box.value?.contains(e.relatedTarget)) returnTo = e.relatedTarget;
}
function dismiss() {
  const hadFocus = box.value?.contains(document.activeElement);
  emit('dismiss');
  if (hadFocus && returnTo?.isConnected) returnTo.focus({ preventScroll: true });
}

// Room under the page while the panel shows, so the last controls on the
// page can still scroll clear of it.
let observer;
function reserve(el) {
  observer?.disconnect();
  observer = null;
  if (!el) return document.body.style.removeProperty('padding-bottom');
  const fit = () => document.body.style.setProperty('padding-bottom', el.offsetHeight + 32 + 'px');
  fit();
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(fit);
    observer.observe(el);
  }
}
watch(box, reserve, { flush: 'post' });
onUnmounted(() => reserve(null));
</script>

<template>
  <!-- always mounted, so screen readers hear each change -->
  <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ status?.announcement || '' }}</p>
  <section
    v-if="status"
    ref="box"
    :class="['gen-status', status.tone]"
    aria-label="Question generation status"
    @focusin="entered"
    @keydown.esc="!status.active && dismiss()"
  >
    <div class="gen-status-head">
      <strong class="gen-status-title">{{ status.title }}</strong>
      <button v-if="!status.active" type="button" class="gen-status-close" aria-label="Dismiss generation status" @click="dismiss">×</button>
    </div>
    <p v-if="topicLabel" class="small muted">{{ topicLabel }}</p>
    <template v-if="status.active">
      <div role="progressbar" aria-label="Questions saved" aria-valuemin="0" :aria-valuemax="status.total" :aria-valuenow="status.saved" :aria-valuetext="status.progress">
        <Meter :value="status.total ? status.saved / status.total : 0" />
      </div>
      <p class="small">{{ status.progress }}</p>
    </template>
    <p v-if="status.detail" class="small">{{ status.detail }}</p>
    <p v-if="status.active" class="small muted">You can keep working or leave this page; progress is saved.</p>
    <p v-else-if="job.retryAt > Date.now()" class="small">Try again after {{ when(job.retryAt) }}.</p>
    <p v-if="status.warnings" class="small">{{ status.warnings === 1 ? '1 warning is' : status.warnings + ' warnings are' }} shown with the generation results.</p>
    <div v-if="status.saved || status.canResume" class="gen-status-actions">
      <button v-if="status.saved" type="button" class="btn small primary" @click="emit('view')">View Question Bank</button>
      <button v-if="status.canResume" type="button" class="btn small" :disabled="busy" @click="emit('resume')">Resume saved work</button>
    </div>
  </section>
</template>

<style scoped>
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.gen-status {
  position: fixed;
  right: 20px;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  z-index: 40; /* under modals (50+) */
  width: min(340px, calc(100vw - 40px));
  max-height: calc(100vh - 120px);
  overflow-y: auto;
  padding: 12px 14px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-left: 4px solid var(--accent);
  border-radius: var(--radius);
  box-shadow: 0 6px 24px rgba(20, 24, 40, 0.18);
  animation: gen-status-in 0.2s ease-out;
}
.gen-status.good { border-left-color: var(--good); }
.gen-status.warn { border-left-color: var(--warn); }
.gen-status.bad { border-left-color: var(--bad); }
.gen-status.good .gen-status-title { color: var(--good); }
.gen-status.warn .gen-status-title { color: var(--warn); }
.gen-status.bad .gen-status-title { color: var(--bad); }
.gen-status-head { display: flex; align-items: flex-start; gap: 8px; }
.gen-status-title { flex: 1; min-width: 0; }
.gen-status p { margin: 6px 0 0; overflow-wrap: anywhere; }
.gen-status .meter { margin-top: 8px; }
.gen-status-close { flex: none; width: 28px; height: 28px; margin: -4px -6px 0 0; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font-size: 20px; line-height: 1; cursor: pointer; }
.gen-status-close:hover { background: var(--accent-soft); color: var(--ink); }
.gen-status-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.gen-status-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
@keyframes gen-status-in { from { opacity: 0; transform: translateY(8px); } }
/* phones: full width along the bottom edge, clear of the home indicator */
@media (max-width: 600px) {
  .gen-status { left: 12px; right: 12px; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); width: auto; max-height: 50vh; }
}
@media (prefers-reduced-motion: reduce) { .gen-status { animation: none; } }
</style>
