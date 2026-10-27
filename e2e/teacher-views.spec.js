// teacher-views.spec.js
// E2E smoke tests for the professor's views: every tab has to open and
// show its own content, so a broken panel is caught before the demo.
import { test, expect } from '@playwright/test';
import { signIn, openTab, TEACHER } from './helpers.js';

test('the Analytics tab opens the dashboard for the course', async ({ page }) => {
  await signIn(page, TEACHER);
  await openTab(page, 'Analytics');
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  // The report controls are there, so the professor can pick the period and
  // print the class report.
  await expect(page.getByLabel('Period')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print report' })).toBeVisible();
});

test('the Evaluation tab opens the prototype questionnaire', async ({ page }) => {
  await signIn(page, TEACHER);
  await openTab(page, 'Evaluation');
  await expect(page.getByRole('heading', { name: 'Prototype evaluation' })).toBeVisible();
});

test('the Settings tab opens the course settings', async ({ page }) => {
  await signIn(page, TEACHER);
  await openTab(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
});

test('the AI drafting tab opens for a professor', async ({ page }) => {
  await signIn(page, TEACHER);
  await openTab(page, 'AI drafting');
  await expect(page.getByRole('heading', { name: 'AI drafting' })).toBeVisible();
});
