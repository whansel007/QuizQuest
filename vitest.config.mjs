// Vitest: unit tests for functions, component tests and integration tests
// for the Vue components (Week 10a/10b). Only *.spec.js files inside
// __tests__ folders run here: the older node:test suites in test/ keep
// running with `pnpm test`, and the Playwright E2E tests live in e2e/.
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom', // a browser-like DOM so Vue components can mount
    include: ['src/**/__tests__/*.spec.js', 'web/src/**/__tests__/*.spec.js'],
  },
});
