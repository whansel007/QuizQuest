// student-views.spec.js
// E2E smoke tests for the student's game views: the World lobby, the
// Kingdom and the summon shop. Each view has to open and show its own
// content, so a broken view is caught before the demo.
import { test, expect } from '@playwright/test';
import { signIn, openTab, STUDENT } from './helpers.js';

test('the World tab picks a hero and opens a lobby with a room code', async ({ page }) => {
  await signIn(page, STUDENT);
  await openTab(page, 'World');
  await expect(page.getByRole('heading', { name: 'World' })).toBeVisible();

  // Only the heroes the student owns can be picked.
  const hero = page.locator('.hero-lab-card:not([disabled])').first();
  await expect(hero).toBeVisible();
  await hero.click();
  await expect(page.getByText('Playing as')).toBeVisible();

  await page.getByRole('button', { name: 'CREATE LOBBY' }).click();
  const frame = page.frameLocator('iframe[title="Campfire Defense"]');
  await expect(frame.locator('#room-code-value')).toHaveText(/^[A-Z]{4}$/, { timeout: 15000 });
});

test('the Kingdom tab shows the kingdom and the class market', async ({ page }) => {
  await signIn(page, STUDENT);
  await openTab(page, 'Kingdom');
  await expect(page.getByRole('heading', { name: 'Kingdom' })).toBeVisible();
  await expect(page.getByText('Class market').first()).toBeVisible();
});

test('the Pets & shop tab shows the summon panel and the drop rates', async ({ page }) => {
  await signIn(page, STUDENT);
  await openTab(page, 'Pets & shop');
  await expect(page.getByRole('heading', { name: 'Hero Summon', exact: true })).toBeVisible();
  await expect(page.getByText('Drop rates')).toBeVisible();
});
