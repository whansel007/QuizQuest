// Playwright: end-to-end tests (Week 10c). Run with `pnpm test:e2e`.
// Playwright builds the app and starts one server per browser (Chromium on
// 4173, Firefox on 4174, WebKit on 4175), each with its own fresh copy of
// the demo data - never Supabase or your data/db.json. So every browser
// starts from the same data: e.g. the one seeded draft question can be
// approved in each browser. The servers stop when the tests finish.
// See the report afterwards with `pnpm exec playwright show-report`.
import { defineConfig, devices } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

const run = Date.now();
const browsers = [
  { name: 'chromium', device: 'Desktop Chrome', port: 4173 },
  { name: 'firefox', device: 'Desktop Firefox', port: 4174 },
  { name: 'webkit', device: 'Desktop Safari', port: 4175 },
];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // tests in one browser share that browser's server and data
  // The HTML report is for local runs; CI reads the plain list instead.
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    trace: 'on-first-retry',
  },
  projects: browsers.map((b) => ({
    name: b.name,
    use: { ...devices[b.device], baseURL: `http://localhost:${b.port}` },
  })),
  webServer: browsers.map((b, i) => ({
    // the first server builds the Vue app; the others reuse that build
    command: i === 0 ? 'pnpm build && node server.js' : 'node server.js',
    url: `http://localhost:${b.port}`,
    reuseExistingServer: false,
    timeout: 120 * 1000,
    env: {
      PORT: String(b.port),
      QUIZ_DATA_FILE: path.join(os.tmpdir(), `quizquest-e2e-${run}-${b.name}.json`),
      SUPABASE_URL: '',
      NODE_ENV: 'test',
    },
  })),
});
