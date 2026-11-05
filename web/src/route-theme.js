// ============================================================
// QuizQuest - a page paints html and body in its own theme colour
// (docs/mobile/FIXES.md, F4 and F11)
// ============================================================
// Immersive student pages fill the viewport with a scene, but the document
// behind them kept the app's light background, which showed on overscroll,
// below a 100svh scene once the phone toolbar collapses, and mid-resize.
// While the page is mounted it adds a class to <html>; mobile.css gives that
// class the page's colour. Leaving the page removes it again.
import { onMounted, onUnmounted } from 'vue';

export function useRouteTheme(className) {
  onMounted(() => document.documentElement.classList.add(className));
  onUnmounted(() => document.documentElement.classList.remove(className));
}
