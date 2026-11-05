// ============================================================
// QuizQuest - which student overlays are open (docs/mobile/FIXES.md, F1)
// ============================================================
// A page can sit inside its own stacking context (the Summon page is a
// fixed layer at z-index 0), so a modal inside it can never paint above the
// app's top bar or corner menu button, however large its own z-index. While
// any overlay is open, App.vue marks the top bar and the menu button inert
// and drops them beneath the page (see `.under-overlay` in mobile.css), so an
// overlay's close button is never covered.
//
//   useOverlay(() => someRef.value)   // inside a component's setup()
import { computed, getCurrentInstance, onUnmounted, reactive, watch } from 'vue';

const open = reactive(new Set());
let nextId = 0;

export const overlayOpen = computed(() => open.size > 0);

// Track a component's overlay: `isOpen` is a getter or ref that is truthy
// while the overlay is on screen. It stops counting when the component
// unmounts (for example on a tab switch), so the shell never stays inert.
export function useOverlay(isOpen) {
  const id = ++nextId;
  const stop = watch(isOpen, (value) => { if (value) open.add(id); else open.delete(id); }, { immediate: true });
  if (getCurrentInstance()) onUnmounted(() => { stop(); open.delete(id); });
  return () => { stop(); open.delete(id); };
}
