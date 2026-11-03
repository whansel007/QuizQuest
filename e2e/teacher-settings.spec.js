// teacher-settings.spec.js
// E2E tests for the professor's Settings tab: the subject guidance and the
// semester dates are saved on the server, and every test puts back what it
// found.
//
// The per-class settings - the trading switch, the analytics time zone and
// the trade log - moved to the class management page, where each class
// carries its own. They are tested in class-settings.spec.js.
//
// The server these tests run against is a throwaway one with its own seeded
// data file, so nothing in the repository's data is touched. Still, each
// test reads the current value first and writes it back at the end, so a
// test never leaves the course in a state it did not find.
import { test, expect } from '@playwright/test';
import { signIn, openTab, teacherCourse, TEACHER } from './helpers.js';

// How long a poll that asks the server for the course may wait.
//
// expect.poll gives up at the expect timeout, which is 10s here - but one
// call to teacherCourse can take up to three eight-second requests when the
// server drops the connection twice, which is exactly the case the helper's
// retries exist for. A poll on the default budget would give up while the
// helper was still trying, and report a failure for a value that was about
// to arrive. Every poll that asks the server gets this budget instead.
const POLL_TIMEOUT = 30_000;

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
  }, { timeout: POLL_TIMEOUT }).toEqual({ promptConfig: 'E2E: use SI units.', coverageTarget: Number(originalCoverage) });

  // ---- semester dates ----
  await starts.fill('2026-01-05');
  await page.getByRole('button', { name: 'Save dates' }).click();
  await expect(page.locator('#toast')).toHaveText('Semester dates saved');
  await expect(starts).toHaveValue('2026-01-05');
  await expect.poll(async () => ((await teacherCourse(page)).semester), { timeout: POLL_TIMEOUT }).toEqual({ start: '2026-01-05' });

  // ---- a semester that ends before it starts is refused ----
  await ends.fill('2025-12-01');
  await page.getByRole('button', { name: 'Save dates' }).click();
  await expect(page.locator('#toast')).toHaveText('The semester must end after it starts.');
  await expect(page.locator('#toast')).toHaveAttribute('class', /bad/);
  // and the dates the course had are still the ones it has
  await expect.poll(async () => ((await teacherCourse(page)).semester), { timeout: POLL_TIMEOUT }).toEqual({ start: '2026-01-05' });

  // ---- clearing the dates ----
  // the end box first: it is only editable while a start is set
  await ends.fill('');
  await starts.fill('');
  // with no start the button offers to clear the dates instead of saving them
  await expect(page.getByRole('button', { name: 'Clear dates' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save dates' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear dates' }).click();
  await expect(page.locator('#toast')).toHaveText('Semester dates cleared');
  await expect.poll(async () => ((await teacherCourse(page)).semester), { timeout: POLL_TIMEOUT }).toBeNull();

  // ---- put the settings back ----
  // the start date first: it brings the end box back with it
  await starts.fill(originalStart);
  if (originalStart) await ends.fill(originalEnd);
  await guidance.fill(originalGuidance);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Saved');
  // With no start the button clears the dates instead of saving them. The
  // course can be left without a semester by an attempt that died before it
  // could put one back, and CI replays the test against that same course -
  // so the button to press is read from the date that was found, not
  // assumed.
  await page.getByRole('button', { name: originalStart ? 'Save dates' : 'Clear dates' }).click();
  await expect(page.locator('#toast')).toHaveText(originalStart ? 'Semester dates saved' : 'Semester dates cleared');
  await expect.poll(async () => {
    const course = await teacherCourse(page);
    return { promptConfig: course.promptConfig, semester: course.semester };
  }, { timeout: POLL_TIMEOUT }).toEqual({
    promptConfig: originalGuidance,
    semester: originalStart ? { start: originalStart } : null,
  });
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
  await expect.poll(async () => ((await teacherCourse(page)).semester?.start), { timeout: POLL_TIMEOUT }).toBe('2025-03-03');

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
  await expect.poll(async () => ((await teacherCourse(page)).semester?.start), { timeout: POLL_TIMEOUT }).toBe(originalStart || undefined);
});
