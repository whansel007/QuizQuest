// E2E journey for two students meeting in the same Campfire Defense lobby.
import { test, expect } from '@playwright/test';
import { signIn, openTab } from './helpers.js';

const HOST = { email: 'student01@quizquest.demo', name: 'Student 01' };
const GUEST = { email: 'student02@quizquest.demo', name: 'Student 02' };

test('two students share a Campfire Defense lobby through its room code', async ({ browser, page, baseURL }) => {
  // Two browsers and a shared socket room: give it room.
  test.slow();
  // A separate browser context keeps each student's login session independent.
  const guestContext = await browser.newContext({ baseURL });
  const guest = await guestContext.newPage();

  try {
    await signIn(page, HOST);
    await openTab(page, 'World');
    const hostHero = page.locator('.hero-chip[aria-disabled="false"]').first();
    await expect(hostHero).toBeVisible();
    const hostHeroName = (await hostHero.locator('.hero-chip-name').innerText()).trim();
    await hostHero.click();
    await expect(hostHero).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'HOST LOBBY' }).click();

    // Wait for the server-created room code before the second student joins.
    const hostGame = page.frameLocator('iframe[title="Campfire Defense"]');
    const hostCode = hostGame.locator('#room-code-value');
    await expect(hostGame.locator('#room-code-corner')).toBeVisible({ timeout: 15000 });
    await expect(hostCode).toHaveText(/^[A-Z]{4}$/);
    const code = (await hostCode.innerText()).trim();

    await signIn(guest, GUEST);
    await openTab(guest, 'World');
    const guestHero = guest.locator('.hero-chip[aria-disabled="false"]').first();
    await expect(guestHero).toBeVisible();
    const guestHeroName = (await guestHero.locator('.hero-chip-name').innerText()).trim();
    await guestHero.click();
    await expect(guestHero).toHaveAttribute('aria-pressed', 'true');
    await guest.getByRole('textbox', { name: 'Room code' }).fill(code);
    await guest.getByRole('button', { name: 'JOIN', exact: true }).click();

    // The lobby stays idle: no wave or countdown is started during this journey.
    const guestGame = guest.frameLocator('iframe[title="Campfire Defense"]');
    await expect(guestGame.locator('#room-code-corner')).toBeVisible({ timeout: 15000 });
    await expect(guestGame.locator('#room-code-value')).toHaveText(code);

    // Both clients must render the same two server-reported room members.
    for (const game of [hostGame, guestGame]) {
      const roster = game.locator('#player-roster');
      await expect(roster.locator('.roster-row')).toHaveCount(2, { timeout: 15000 });
      const hostRow = roster.locator('.roster-row').filter({ hasText: HOST.name });
      const guestRow = roster.locator('.roster-row').filter({ hasText: GUEST.name });
      await expect(hostRow).toHaveCount(1);
      await expect(guestRow).toHaveCount(1);
      await expect(hostRow.locator('.roster-name')).toHaveText(HOST.name);
      await expect(guestRow.locator('.roster-name')).toHaveText(GUEST.name);
      await expect(hostRow.locator('.roster-hero')).toContainText(hostHeroName);
      await expect(guestRow.locator('.roster-hero')).toContainText(guestHeroName);
    }
  } finally {
    await guestContext.close();
  }
});
