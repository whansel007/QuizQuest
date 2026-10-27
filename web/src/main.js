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
import './app.css';

createApp(App).mount('#app');
