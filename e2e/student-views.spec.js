// student-views.spec.js
// E2E smoke tests for the student's game views: the World lobby, the
// Kingdom and the summon shop. Each view has to open and show its own
// content, so a broken view is caught before the demo.
import { test, expect } from '@playwright/test';
import { signIn, openTab, STUDENT } from './helpers.js';

test('the World tab picks a hero and opens a lobby with a room code', async ({ page }) => {
  // It waits for the server to hand out a room code: give it room.
  test.slow();
  await signIn(page, STUDENT);
  await openTab(page, 'World');
  await expect(page.getByRole('heading', { name: 'The Clearing', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Choose your hero', exact: true })).toBeVisible();

  // Only the heroes the student owns can be picked.
  const hero = page.locator('.hero-chip[aria-disabled="false"]').first();
  await expect(hero).toBeVisible();
  await hero.click();
  await expect(hero).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'HOST LOBBY', exact: true }).click();
  const frame = page.frameLocator('iframe[title="Campfire Defense"]');
  // The room code is static markup in the arena document
  // (public/hero-lab/world.html:41), so until that document is parsed the
  // locator matches nothing at all and the failure reads "element(s) not
  // found" rather than anything about the code. Give the document its own
  // budget: on a loaded runner the iframe's navigation queues behind the
  // sprite sheets the World tab is downloading.
  await expect(frame.locator('#room-code-corner')).toBeAttached({ timeout: 30000 });
  await expect(frame.locator('#room-code-value')).toHaveText(/^[A-Z]{4}$/, { timeout: 30000 });
});

test('the Kingdom tab shows the town and its buildings', async ({ page }) => {
  await signIn(page, STUDENT);
  await openTab(page, 'Kingdom');
  await expect(page.getByRole('heading', { name: /Your Kingdom.*Storybook Town/ })).toBeVisible();

  // Dismiss the first-visit tour before opening the town's building list.
  const skipTour = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skipTour.count()) await skipTour.click();
  await page.getByRole('button', { name: 'Buildings', exact: true }).click();
  const buildings = page.getByRole('region', { name: 'Your buildings', exact: true });
  await expect(buildings.getByRole('button')).toHaveCount(5);
  for (const name of ['Castle', 'Garden', 'Tower', 'Library', 'Workshop']) {
    await expect(buildings.getByRole('button', { name: new RegExp(name) })).toBeVisible();
  }
});

test('the Summon tab shows its banner and drop rates', async ({ page }) => {
  await signIn(page, STUDENT);
  await openTab(page, 'Summon');
  await expect(page.getByRole('heading', { name: 'Summon', exact: true })).toBeVisible();
  await expect(page.locator('.summon-banner')).toBeVisible();

  await page.getByRole('button', { name: 'Details', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Summon Details', exact: true });
  await expect(details).toBeVisible();
  await expect(details.locator('.detail-rate')).toHaveCount(3);
  await expect(details.getByText('Kingdom resources', { exact: true })).toBeVisible();
  const percentages = details.locator('.detail-rate strong');
  await expect(percentages).toHaveCount(3);
  for (const percentage of await percentages.all()) await expect(percentage).toHaveText(/^\d+%$/);
});
