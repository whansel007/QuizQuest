// class-settings.spec.js
// E2E tests for the per-class settings. They used to sit on the Settings
// page, one panel per class; they now sit with the class they are about, on
// the class management page: the professor finds the class with the search
// box, opens its settings, and the trading switch, the analytics time zone
// and the trade log are there.
//
// Every test that changes a setting reads the value first and writes it back
// at the end, so a test never leaves the class in a state it did not find.
import { test, expect } from '@playwright/test';
import { signIn, openTab, teacherCourse, apiToken, TEACHER } from './helpers.js';

// The one class of the demo course these tests touch.
const CLASS_ID = 'cl-a';
const CLASS_NAME = 'Computing - Tutorial Group A';
// A second class of the same course: it shares the course, not the name, so
// the search can tell the two apart.
const OTHER_CLASS_ID = 'cl-c';
const OTHER_CLASS_NAME = 'Computing - Tutorial Group C';
const COURSE_TITLE = 'Intro to Computing (demo)';

// How long a poll that asks the server may wait. See teacher-settings.spec.js.
const POLL_TIMEOUT = 30_000;

// The settings panel of the class that is open.
const classSettings = (page) => page.getByRole('region', { name: 'Class settings' });

// The trading switch of one class, as the server holds it.
async function tradingOnServer(page) {
  const course = await teacherCourse(page);
  return course.classes.find((c) => c.id === CLASS_ID).settings.tradingEnabled;
}

// The time zone of one class, as the server holds it. A class that has never
// had a time zone holds nothing at all, and the app falls back to Singapore.
async function zoneOnServer(page) {
  const course = await teacherCourse(page);
  return course.classes.find((c) => c.id === CLASS_ID).settings.timezone;
}

// The trades of one class, as the server holds them. The professor may only
// read the log of a class he teaches, so the request goes out with his own
// token.
async function tradesOnServer(page, classId) {
  const url = new URL(`/api/teacher/classes/${classId}/trades`, page.url()).href;
  const headers = { Authorization: `Bearer ${await apiToken(page)}` };
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await page.request.get(url, { headers, timeout: 8000 });
      break;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  expect(response.ok(), `the trade log comes back: ${response.status()}`).toBe(true);
  return response.json();
}

// Sign in as the professor and open the class management tab.
async function openClassManagement(page) {
  // The reduced-motion setting is turned on for the test. The sign-in
  // buttons slide under the pointer, and Playwright waits for a moving
  // element to settle before it clicks: on WebKit that wait is long enough
  // to eat the whole test's time.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, TEACHER);
  await openTab(page, 'Classes & Roster');
  await expect(page.getByRole('heading', { name: 'Class Management' })).toBeVisible();
  await expect(page.locator('.class-card').first()).toBeVisible();
}

// Open the class management tab again, for a page that is already signed in.
// A reload keeps the session, so there is no second sign-in to do.
async function reopenClassManagement(page) {
  await openTab(page, 'Classes & Roster');
  await expect(page.getByRole('heading', { name: 'Class Management' })).toBeVisible();
  await expect(page.locator('.class-card').first()).toBeVisible();
}

// Open the settings of one class, from its card on the grid.
async function openClassSettings(page, className) {
  const card = page.locator('.class-card').filter({ hasText: className });
  await expect(card).toHaveCount(1);
  await card.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(classSettings(page)).toBeVisible();
}

test('the search box finds a class, and says when it finds nothing', async ({ page }) => {
  test.slow();
  await openClassManagement(page);

  const search = page.getByLabel('Search classes');
  await expect(search).toBeVisible();

  // a name that matches one class narrows the grid down to that class
  await search.fill(OTHER_CLASS_NAME);
  await expect(page.locator('.class-card')).toHaveCount(1);
  await expect(page.locator('.class-card').first()).toContainText(OTHER_CLASS_NAME);
  await expect(page.getByText('1 match', { exact: true })).toBeVisible();

  // the course finds every class of that course
  await search.fill(COURSE_TITLE);
  await expect(page.locator('.class-card').first()).toBeVisible();
  expect(await page.locator('.class-card').count()).toBeGreaterThan(1);
  await expect(page.getByText(/^\d+ matches?$/)).toBeVisible();

  // a name that matches nothing says so, instead of showing an empty grid
  await search.fill('no class is called this');
  await expect(page.locator('.class-card')).toHaveCount(0);
  await expect(page.getByText('No class matches "no class is called this".', { exact: true })).toBeVisible();

  // and clearing it brings the whole grid back
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.class-card').first()).toBeVisible();
  await expect(page.getByText('1 match', { exact: true })).toHaveCount(0);
});

test('a class that is archived is still found by the search', async ({ page }) => {
  test.slow();
  await openClassManagement(page);

  // a class of this test's own, archived again before the test ends
  const name = `E2E Class Settings ${crypto.randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: '+ Create Class' }).click();
  const modal = page.locator('.modal-card');
  await expect(modal.getByRole('heading', { name: 'Create New Class Group' })).toBeVisible();
  await modal.getByLabel('Course').selectOption('c-comp');
  await modal.getByLabel('Class Name').fill(name);
  await modal.getByRole('button', { name: 'Create Class', exact: true }).click();
  await expect(page.locator('#toast')).toContainText(`Class "${name}" created successfully!`);
  await page.getByRole('button', { name: '← Back to all classes' }).click();

  const card = page.locator('.class-card').filter({ hasText: name });
  await expect(card).toHaveCount(1);

  // archived, it leaves the grid - but the search still knows it is there
  await card.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.locator('#toast')).toContainText(`Class "${name}" archived.`);
  await expect(page.locator('.class-card').filter({ hasText: name })).toHaveCount(0);

  // so the page says where the class went instead of showing nothing
  await page.getByLabel('Search classes').fill(name);
  await expect(page.locator('.class-card')).toHaveCount(0);
  await expect(page.getByText(/1 archived class matches too/)).toBeVisible();

  // and ticking "Show archived classes" brings it back
  await page.getByRole('checkbox', { name: 'Show archived classes' }).check();
  await expect(page.locator('.class-card').filter({ hasText: name })).toHaveCount(1);
});

test('a class trading switch is turned off and back on again', async ({ page }) => {
  // the page is loaded twice here, once more than the other tests need
  test.slow();
  await openClassManagement(page);
  await openClassSettings(page, CLASS_NAME);

  const trading = classSettings(page).getByRole('checkbox', { name: 'Allow resource trading between classmates' });
  await expect(trading).toBeVisible();
  // whatever the class starts with, the test puts it back at the end
  const wasEnabled = await trading.isChecked();

  if (wasEnabled) await trading.uncheck();
  else await trading.check();
  await expect(page.locator('#toast')).toHaveText('Saved');
  await expect.poll(() => tradingOnServer(page), { timeout: POLL_TIMEOUT }).toBe(!wasEnabled);

  // a fresh page proves the switch was stored, not just drawn
  await page.reload();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await reopenClassManagement(page);
  await openClassSettings(page, CLASS_NAME);
  const tradingAgain = classSettings(page).getByRole('checkbox', { name: 'Allow resource trading between classmates' });
  await expect(tradingAgain).toBeVisible();
  if (wasEnabled) await expect(tradingAgain).not.toBeChecked();
  else await expect(tradingAgain).toBeChecked();

  // and back to what the class had
  if (wasEnabled) await tradingAgain.check();
  else await tradingAgain.uncheck();
  await expect(page.locator('#toast')).toHaveText('Saved');
  await expect.poll(() => tradingOnServer(page), { timeout: POLL_TIMEOUT }).toBe(wasEnabled);
});

test('the class settings hold the analytics time zone and the trade log', async ({ page }) => {
  test.slow();
  await openClassManagement(page);
  await openClassSettings(page, CLASS_NAME);

  // ---- the time zone the analytics dashboard reads ----
  const zone = page.getByLabel('Time zone for analytics');
  await expect(zone).toBeVisible();
  // what the class has now, so the test can put it back at the end
  const originalZone = await zone.inputValue();

  await zone.selectOption('Europe/London');
  await expect(page.locator('#toast')).toHaveText('Saved');
  await expect.poll(() => zoneOnServer(page), { timeout: POLL_TIMEOUT }).toBe('Europe/London');
  // the box shows what the server now holds
  await expect(zone).toHaveValue('Europe/London');

  // and back to what the class had
  await zone.selectOption(originalZone);
  await expect(page.locator('#toast')).toHaveText('Saved');
  await expect.poll(() => zoneOnServer(page), { timeout: POLL_TIMEOUT }).toBe(originalZone);

  // ---- the trade log ----
  // it is behind a button, and the button says how many trades there are
  const tradeLog = page.getByRole('button', { name: /trade log/i });
  await expect(tradeLog).toBeVisible();
  await expect(tradeLog).toHaveText(/View trade log \(\d+\)/);
  await tradeLog.click();
  await expect(page.getByRole('button', { name: 'Hide trade log' })).toBeVisible();
  // the log itself is either empty or a table of trades
  await expect(page.getByText('No trades yet.').or(page.locator('.table-wrap'))).toBeVisible();

  // and it can be put away again
  await page.getByRole('button', { name: 'Hide trade log' }).click();
  await expect(page.getByRole('button', { name: /View trade log/ })).toBeVisible();
});

test('the trade log belongs to the class that is open, not to the one before it', async ({ page }) => {
  test.slow();
  await openClassManagement(page);
  await openClassSettings(page, CLASS_NAME);

  // The log is the one of the class that is open. The count on the button is
  // read from the server, so the test says what it means rather than what the
  // seed happens to hold today.
  const firstTrades = await tradesOnServer(page, CLASS_ID);
  const tradeLog = page.getByRole('button', { name: /trade log/i });
  await expect(tradeLog).toHaveText(`View trade log (${firstTrades.length})`);

  // open it: the log of this class is on screen
  await tradeLog.click();
  await expect(page.getByRole('button', { name: 'Hide trade log' })).toBeVisible();
  await expect(page.getByText('No trades yet.').or(page.locator('.table-wrap'))).toBeVisible();

  // back to the grid, and take the other class of the same course
  await page.getByRole('button', { name: /Back to all classes/ }).click();
  await expect(page.locator('.class-card').first()).toBeVisible();
  const other = page.locator('.class-card').filter({ hasText: OTHER_CLASS_NAME });
  await expect(other).toHaveCount(1);
  await other.getByRole('button', { name: /Manage Roster & Codes/ }).click();
  await expect(classSettings(page)).toBeVisible();

  // The log is now the new class's: the old one is closed, and the count on
  // the button is the new class's count. Without the reset the first class's
  // trades would still be on screen, under the second class's name.
  const otherTrades = await tradesOnServer(page, OTHER_CLASS_ID);
  await expect(page.getByRole('button', { name: /trade log/i })).toHaveText(`View trade log (${otherTrades.length})`);
  await expect(page.getByRole('button', { name: 'Hide trade log' })).toHaveCount(0);
});
