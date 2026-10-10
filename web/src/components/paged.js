// ============================================================
// Client-side paging for long lists (used with <Pager>).
//   const missed = usePaged(() => a.value.commonlyMissed, 5);
//   v-for="q in missed.items"   <Pager :paged="missed" label="..." />
// The page survives data refreshes (auto-refresh), and is pulled back
// when the list shrinks below it. While printing, every list shows all of
// its items: paper can't turn pages.
// ============================================================
import { ref, computed, watch, reactive } from 'vue';

// true between beforeprint and afterprint (Vue re-renders before the page is laid out for paper)
export const printing = ref(false);
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => (printing.value = true));
  window.addEventListener('afterprint', () => (printing.value = false));
}

export function usePaged(source, size) {
  const page = ref(1);
  const list = computed(() => source() || []);
  const total = computed(() => list.value.length);
  const pages = computed(() => Math.max(1, Math.ceil(total.value / size)));
  watch(pages, (p) => {
    if (page.value > p) page.value = p;
  });
  const items = computed(() => (printing.value ? list.value : list.value.slice((page.value - 1) * size, page.value * size)));
  const from = computed(() => (total.value ? (page.value - 1) * size + 1 : 0));
  const to = computed(() => Math.min(total.value, page.value * size));
  return reactive({ page, pages, total, items, from, to, size, go: (p) => (page.value = Math.min(pages.value, Math.max(1, p))) });
}
