// ============================================================
// QuizQuest - Vue entry point
// ============================================================
import { createApp } from 'vue';
import App from './App.vue';
// Bundled fonts, used app-wide (served by the app itself, so the
// server's Content-Security-Policy needs no outside font host)
import '@fontsource/fredoka/latin-500.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
// Bootstrap utilities provide layout helpers without its global Reboot or
// component defaults, which would change QuizQuest's established visual design.
import 'bootstrap/dist/css/bootstrap-utilities.css';
import './app.css';
import './mobile.css';
// professor workspace responsive rules (all under .teacher-app); after
// app.css and mobile.css so they win ties with the shell rules they refine
import './teacher/teacher-responsive.css';

// --app-vh: 1% of the visible height. iOS Safari's 100vh ignores its own
// toolbar and the soft keyboard; visualViewport reports what is really
// visible. CSS uses dvh/svh first and this as the fallback.
function syncViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty('--app-vh', `${height / 100}px`);
}
syncViewportHeight();
window.visualViewport?.addEventListener('resize', syncViewportHeight);
// When the soft keyboard opens over a written or numeric answer, keep the
// answer box and its Submit button above the keyboard. The visual viewport
// shrinks when the keyboard opens; the block marked data-keyboard-keep is
// scrolled so its bottom edge (the Submit button) sits at the visible bottom.
let keyboardOpenHeight = window.visualViewport?.height || 0;
window.visualViewport?.addEventListener('resize', () => {
  const height = window.visualViewport.height;
  const shrank = height < keyboardOpenHeight - 80;
  keyboardOpenHeight = height;
  const field = document.activeElement;
  if (!shrank || !field?.matches?.('input, textarea')) return;
  field.closest('[data-keyboard-keep]')?.scrollIntoView({ block: 'end', behavior: 'smooth' });
});
window.addEventListener('resize', syncViewportHeight);

createApp(App).mount('#app');
