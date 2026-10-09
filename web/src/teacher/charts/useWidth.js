// Measure an element's width so charts draw at real pixel size (text stays
// readable instead of being scaled down with a viewBox on phones).
import { ref, onMounted, onUnmounted } from 'vue';

export function useWidth(el, fallback = 600) {
  const width = ref(fallback);
  let ro = null;
  onMounted(() => {
    width.value = el.value?.clientWidth || fallback;
    if (typeof ResizeObserver === 'undefined') return;
    ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width) width.value = entry.contentRect.width;
    });
    ro.observe(el.value);
  });
  onUnmounted(() => ro?.disconnect());
  return width;
}

// Show every nth x label so labels never collide
export const labelStep = (count, plotWidth, minGap = 56) => Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plotWidth / minGap))));
