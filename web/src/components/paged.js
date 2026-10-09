// ============================================================
// Client-side paging for long lists (used with <Pager>).
//   const missed = usePaged(() => a.value.commonlyMissed, 5);
//   v-for="q in missed.items"   <Pager :paged="missed" label="..." />
// The page survives data refreshes (auto-refresh), and is pulled back
// when the list shrinks below it.
// ============================================================
import { ref, computed, watch, reactive } from 'vue';

export function usePaged(source, size) {
  const page = ref(1);
  const list = computed(() => source() || []);
  const total = computed(() => list.value.length);
  const pages = computed(() => Math.max(1, Math.ceil(total.value / size)));
  watch(pages, (p) => {
    if (page.value > p) page.value = p;
  });
  const items = computed(() => list.value.slice((page.value - 1) * size, page.value * size));
  const from = computed(() => (total.value ? (page.value - 1) * size + 1 : 0));
  const to = computed(() => Math.min(total.value, page.value * size));
  return reactive({ page, pages, total, items, from, to, size, go: (p) => (page.value = Math.min(pages.value, Math.max(1, p))) });
}
