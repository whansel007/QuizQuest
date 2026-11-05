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
// professor workspace responsive rules (all under .teacher-app); after
// app.css so they win ties with the shell rules they refine
import './teacher/teacher-responsive.css';

createApp(App).mount('#app');
