// teacher-settings.spec.js
// E2E tests for the professor's Settings tab: the subject guidance, the
// semester dates and the per-class trading switch are saved on the server,
// and every test puts back what it found.
//
// The server these tests run against is a throwaway one with its own seeded
// data file, so nothing in the repository's data is touched. Still, each
// test reads the current value first and writes it back at the end, so a
// test never leaves the course in a state it did not find.
import { test, expect } from '@playwright/test';
import { signIn, openTab, apiToken, TEACHER } from './helpers.js';

// The one class of the demo course these tests touch.
const CLASS_ID = 'cl-a';
const CLASS_NAME = 'Computing - Tutorial Group A';

// The professor's own course, as the server holds it, so a test can check
// what was really stored instead of trusting the toast.
// Playwright's request context does not resolve a relative URL against the
// page, so the URL is made absolute first.
async function teacherCourse(page) {
  const url = new URL('/api/teacher/courses', page.url()).href;
  const headers = { Authorization: `Bearer ${await apiToken(page)}` };
  // The server closes connections it has kept open for a few seconds, so a
  // request can land on one the server has just dropped and never be
  // answered. A timeout and another try keep that from hanging the test.
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await page.request.get(url, { headers, timeout: 8000 });
      break;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  expect(response.ok(), `the course list comes back: ${response.status()}`).toBe(true);
  const courses = await response.json();
  expect(courses.length, 'the professor has a course').toBeGreaterThan(0);
  return courses[0];
}

// The trading switch of one class, as the server holds it.
async function tradingOnServer(page) {
  const course = await teacherCourse(page);
  return course.classes.find((c) => c.id === CLASS_ID).settings.tradingEnabled;
}

// Sign in as the professor. The sign-in changes nothing until it is through,
// so a click that never lands on a busy machine is simply tried again rather
// than failing the test.
async function signInTeacher(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await signIn(page, TEACHER);
      return;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

// Click a tab in the sidebar. The click can wait for the page to settle for a
// long time on a busy machine, and the tab can be opened again, so that is
// tried again rather than failing the test.
async function clickTab(page, name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await openTab(page, name);
      return;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

// Open the Settings tab and wait for its panels. The view only draws them
// after the course list has come back, so an earlier locator matches nothing.
async function openSettings(page) {
  await clickTab(page, 'Settings');
  await expect(page.getByLabel('Subject guidance for AI drafting')).toBeVisible({ timeout: 30_000 });
}

// The trading switch of one class. Every class has a switch with the same
// name, so it is scoped to the panel of the class the test means.
function tradingCheckbox(page) {
  return page
    .locator('.panel')
    .filter({ has: page.getByRole('heading', { name: CLASS_NAME }) })
    .getByRole('checkbox', { name: 'Allow resource trading between classmates' });
}

test('should save the subject guidance and the semester dates, and put them back', async ({ page }) => {
  // the course list is asked for several times over
  test.slow();
  await signInTeacher(page);
  await openSettings(page);

  const guidance = page.getByLabel('Subject guidance for AI drafting');
  const coverage = page.getByLabel('Coverage target per learning outcome');
  const starts = page.getByLabel('Semester starts');
  const ends = page.getByLabel('Ends (optional)');

  // what the course holds now, so the test can put it back at the end
  const originalGuidance = await guidance.inputValue();
  const originalCoverage = await coverage.inputValue();
  const originalStart = await starts.inputValue();
  const originalEnd = await ends.inputValue();

  // ---- subject guidance ----
  await guidance.fill('E2E: use SI units.');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Saved');
  await expect.poll(async () => {
    const course = await teacherCourse(page);
    // the same button posts the coverage target as well, which must not move
    return { promptConfig: course.promptConfig, coverageTarget: course.coverageTarget };
  }).toEqual({ promptConfig: 'E2E: use SI units.', coverageTarget: Number(originalCoverage) });

  // ---- semester dates ----
  await starts.fill('2026-01-05');
  await page.getByRole('button', { name: 'Save dates' }).click();
  await expect(page.locator('#toast')).toHaveText('Semester dates saved');
  await expect(starts).toHaveValue('2026-01-05');
  await expect.poll(async () => (await teacherCourse(page)).semester).toEqual({ start: '2026-01-05' });

  // ---- a semester that ends before it starts is refused ----
  await ends.fill('2025-12-01');
  await page.getByRole('button', { name: 'Save dates' }).click();
  await expect(page.locator('#toast')).toHaveText('The semester must end after it starts.');
  await expect(page.locator('#toast')).toHaveAttribute('class', /bad/);
  // and the dates the course had are still the ones it has
  await expect.poll(async () => (await teacherCourse(page)).semester).toEqual({ start: '2026-01-05' });

  // ---- clearing the dates ----
  // the end box first: it is only editable while a start is set
  await ends.fill('');
  await starts.fill('');
  // with no start the button offers to clear the dates instead of saving them
  await expect(page.getByRole('button', { name: 'Clear dates' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save dates' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear dates' }).click();
  await expect(page.locator('#toast')).toHaveText('Semester dates cleared');
  await expect.poll(async () => (await teacherCourse(page)).semester).toBeNull();

  // ---- put the settings back ----
  // the start date first: it brings the end box back with it
  await starts.fill(originalStart);
  if (originalStart) await ends.fill(originalEnd);
  await guidance.fill(originalGuidance);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Save dates' }).click();
  await expect(page.locator('#toast')).toHaveText('Semester dates saved');
  await expect.poll(async () => {
    const course = await teacherCourse(page);
    return { promptConfig: course.promptConfig, semester: course.semester };
  }).toEqual({ promptConfig: originalGuidance, semester: { start: originalStart } });
});

test('should turn classmate trading off for a class and back on again', async ({ page }) => {
  // the page is loaded twice here, once more than the other tests need
  test.slow();
  await signInTeacher(page);
  await openSettings(page);

  const trading = tradingCheckbox(page);
  await expect(trading).toBeVisible();
  // whatever the class starts with, the test puts it back at the end
  const wasEnabled = await trading.isChecked();

  if (wasEnabled) await trading.uncheck();
  else await trading.check();
  await expect(page.locator('#toast')).toHaveText('Saved');
  await expect.poll(() => tradingOnServer(page)).toBe(!wasEnabled);

  // a fresh page proves the switch was stored, not just drawn
  await page.reload();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await openSettings(page);
  const tradingAgain = tradingCheckbox(page);
  await expect(tradingAgain).toBeVisible();
  if (wasEnabled) await expect(tradingAgain).not.toBeChecked();
  else await expect(tradingAgain).toBeChecked();

  // and back to what the class had
  if (wasEnabled) await tradingAgain.check();
  else await tradingAgain.uncheck();
  await expect(page.locator('#toast')).toHaveText('Saved');
  await expect.poll(() => tradingOnServer(page)).toBe(wasEnabled);
});

test('should use the semester dates from Settings on the Analytics dashboard', async ({ page }) => {
  // the dashboard loads a whole class report, so it needs more room
  test.slow();
  await signInTeacher(page);
  await openSettings(page);

  const starts = page.getByLabel('Semester starts');
  const ends = page.getByLabel('Ends (optional)');
  const originalStart = await starts.inputValue();
  const originalEnd = await ends.inputValue();

  // a start date of its own, so the dashboard cannot be showing another one
  await ends.fill('');
  await starts.fill('2025-03-03');
  await page.getByRole('button', { name: 'Save dates' }).click();
  await expect(page.locator('#toast')).toHaveText('Semester dates saved');
  await expect.poll(async () => (await teacherCourse(page)).semester?.start).toBe('2025-03-03');

  // "This semester" on the dashboard runs from the date set in Settings
  await clickTab(page, 'Analytics');
  await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
  await page.getByLabel('Period').selectOption('semester');
  await expect(page.locator('#dash-overview').getByText(/this semester, from .*2025/).first()).toBeVisible();

  // put the dates back
  await openSettings(page);
  await expect(starts).toBeVisible();
  // the start date first: it brings the end box back with it
  await starts.fill(originalStart);
  if (originalStart) await ends.fill(originalEnd);
  // with no start the button clears the dates instead of saving them
  await page.getByRole('button', { name: originalStart ? 'Save dates' : 'Clear dates' }).click();
  await expect(page.locator('#toast')).toHaveText(originalStart ? 'Semester dates saved' : 'Semester dates cleared');
  await expect.poll(async () => (await teacherCourse(page)).semester?.start).toBe(originalStart || undefined);
});
