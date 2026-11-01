// summon.spec.js
// End-to-end tests for the Hero Summon: the single pull, the ten-pull and
// the journal that records them.
//
// The seeded demo student is used on purpose. The debug endpoint that sets
// the coin balance only answers for the synthetic @quizquest.demo accounts,
// and a test that checks what a pull costs needs a known balance to start
// from. The balance is set as an absolute number, so a second run of the
// test starts from the same place.
import { test, expect } from '@playwright/test';
import { signIn, openTab, apiToken, STUDENT } from './helpers.js';

const PULL_COST = 50;
const TEN_PULL_COST = 500;
const START_BALANCE = 1000;

// The coins the Summon tab is showing.
const wallet = (page) => page.locator('.summon-wallet strong');

// The two pull buttons. Their labels are "Summon x1" and "Summon x10" (with a
// multiplication sign), close enough that a name match has to be exact, so
// the class names are what say which is which.
const pullOne = (page) => page.locator('button.pull-one');
const pullTen = (page) => page.locator('button.pull-ten');

// Put the demo student's coin balance where this test wants it, so the checks
// after a pull measure the pull and not whatever the student happened to be
// holding. The debug endpoint sets an absolute balance, not a change.
async function setWallet(page, balance) {
  const token = await apiToken(page);
  const response = await page.request.post('/api/student/debug/wallet', {
    headers: { Authorization: `Bearer ${token}` },
    data: { balance },
  });
  const body = await response.text();
  expect(response.ok(), `the coin balance is set to ${balance}: ${body}`).toBe(true);
  expect(Number(JSON.parse(body).balance)).toBe(balance);
}

// Sign the demo student in, put a known number of coins in the wallet and
// open the Summon tab. The tab asks the server for the balance when it
// opens, so the coins have to be set before the tab is opened.
//
// The reduced-motion setting is turned on for the tab. The app reads it when
// it draws a prize: without it, every reveal waits for a shooting star to
// fall before the prize can be picked up - a second and a half each, and
// fifteen seconds for a ten-pull.
async function openSummonShop(page, balance) {
  await signIn(page, STUDENT);
  await setWallet(page, balance);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openTab(page, 'Summon');
  await expect(page.getByRole('heading', { name: 'Summon', exact: true })).toBeVisible();
}

// The journal: what the student has pulled and what it cost.
async function openJournal(page) {
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const journal = page.getByRole('dialog', { name: 'Summon History' });
  await expect(journal).toBeVisible();
  return journal;
}

// The coin entry for a pull of this size. The journal lists the reason and
// the amount side by side, so the entry is the row that carries both the
// summon as its reason and the cost as its amount. The amount is matched
// from the start, so a fifty coin pull is not confused with a five hundred
// coin one.
function coinEntry(journal, cost) {
  return journal.locator(`xpath=.//li[span[contains(., "Hero Summon")]][strong[starts-with(., "-${cost}")]]`);
}

// Pick the prize up.
//
// The prize covers the screen and something in it is always moving, so
// Playwright's "wait until the element stops moving" check spends several
// seconds on every click in WebKit. The button is the only one in the dialog
// and nothing is on top of it, so the click is forced past that check.
function collectPrize(prize) {
  return prize.getByRole('button', { name: 'Continue' }).click({ force: true });
}

test('a single pull costs 50 coins, shows the prize and is written into the journal', async ({ page }) => {
  await openSummonShop(page, START_BALANCE);

  // The tab opens on the balance the debug endpoint just set.
  await expect(wallet(page)).toHaveText(String(START_BALANCE));
  await expect(pullOne(page)).toHaveText(/50$/);

  await pullOne(page).click();

  // The prize lands in a dialog of its own, and it names what was won.
  const prize = page.getByRole('dialog');
  await expect(prize).toBeVisible();
  await expect(prize.getByRole('heading', { level: 2 })).not.toHaveText(/star is falling/);
  await expect(prize.getByRole('button', { name: 'Continue' })).toBeVisible();

  // The pull was paid for. A duplicate hero is paid back, so the balance can
  // sit above the price - it can never be above the balance from before.
  const after = Number(await wallet(page).innerText());
  expect(after).toBeLessThan(START_BALANCE);
  expect(after).toBeGreaterThanOrEqual(START_BALANCE - PULL_COST);

  // Closing the prize takes the student back to the shop.
  await collectPrize(prize);
  await expect(prize).toBeHidden();

  // The journal records the pull and what it cost. A retry of this test
  // leaves the pull of the attempt before it in the journal as well, so the
  // count is not checked - the entry is what matters.
  const journal = await openJournal(page);
  await journal.getByRole('button', { name: 'Coins', exact: true }).click();
  expect(await coinEntry(journal, PULL_COST).count(), 'the journal holds the pull and its cost').toBeGreaterThan(0);
});

test('a ten-pull shows all ten results and costs 500 coins', async ({ page }) => {
  test.slow(); // ten reveals, one after the other
  await openSummonShop(page, START_BALANCE);

  await expect(wallet(page)).toHaveText(String(START_BALANCE));
  await expect(pullTen(page)).toHaveText(/500$/);

  await pullTen(page).click();

  // Each of the ten results is shown on its own, in turn, and each one says
  // which star of the ten it is.
  const prize = page.getByRole('dialog');
  for (let star = 1; star <= 10; star++) {
    await expect(prize.getByText(`Star ${star} of 10`, { exact: true })).toBeVisible();
    await collectPrize(prize);
  }

  // Then the ten are laid out together.
  const summary = page.getByRole('dialog', { name: 'Your ten discoveries' });
  await expect(summary).toBeVisible();
  await expect(summary.locator('.summary-card')).toHaveCount(10);

  const after = Number(await wallet(page).innerText());
  expect(after).toBeLessThan(START_BALANCE);
  expect(after).toBeGreaterThanOrEqual(START_BALANCE - TEN_PULL_COST);

  await summary.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(summary).toBeHidden();

  // The journal says what the ten-pull cost.
  const journal = await openJournal(page);
  await journal.getByRole('button', { name: 'Coins', exact: true }).click();
  expect(await coinEntry(journal, TEN_PULL_COST).count(), 'the journal holds the ten-pull and its cost').toBeGreaterThan(0);
});
