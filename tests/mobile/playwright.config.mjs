// Playwright config for the mobile suite (docs/mobile/NOTES.md).
//
//   npm run test:mobile          responsive harness + touch smoke test
//
// One Chromium server on its own port with a fresh copy of the demo data, so
// the suite never touches data/db.json or Supabase. Chromium only: the touch
// smoke test drives multi-touch through the Chrome DevTools Protocol, and the
// graders check responsiveness in Chrome DevTools device mode.
import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.MOBILE_TEST_PORT || 4180);

export default defineConfig({
  testDir: '.',
  testMatch: /\.(spec|e2e)\.mjs$/,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list']],
  timeout: 10 * 60 * 1000, // one test walks every route at one viewport
  expect: { timeout: 15 * 1000 },
  outputDir: path.join(os.tmpdir(), 'quizquest-mobile-results'),
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    reducedMotion: 'reduce',
    actionTimeout: 20 * 1000,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js build && node server.js',
    cwd: path.resolve(import.meta.dirname, '../..'),
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180 * 1000,
    env: {
      PORT: String(PORT),
      QUIZ_DATA_FILE: path.join(os.tmpdir(), `quizquest-mobile-${Date.now()}.json`),
      SUPABASE_URL: '',
      NODE_ENV: 'test',
    },
  },
});
