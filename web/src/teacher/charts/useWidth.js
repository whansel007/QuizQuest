// Measure an element's width so charts draw at real pixel size (text stays
// readable instead of being scaled down with a viewBox on phones).
import { ref, onMounted, onUnmounted } from 'vue';

export function useWidth(el, fallback = 600) {
  const width = ref(fallback);
  let ro = null;
  let frame = 0;
  onMounted(() => {
    width.value = el.value?.clientWidth || fallback;
    if (typeof ResizeObserver === 'undefined') return;
    // redraw on the next frame, not inside the observer: a redraw that nudges
    // the layout (a scrollbar appearing) would otherwise loop, and Safari
    // reports that as an error
    ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (w) width.value = w;
      });
    });
    ro.observe(el.value);
  });
  onUnmounted(() => {
    ro?.disconnect();
    cancelAnimationFrame(frame);
  });
  return width;
}

// Show every nth x label so labels never collide
const labelEvery = (count, plotWidth, minGap) => Math.max(1, Math.ceil(count / Math.max(1, Math.floor(plotWidth / minGap))));
// labels: pass the x labels so the gap fits the longest (about 6px per character at 11px)
export const labelStep = (count, plotWidth, minGap = 56, labels = []) =>
  labelEvery(count, plotWidth, Math.max(minGap, 10 + 6 * Math.max(0, ...labels.map((l) => String(l).length))));
