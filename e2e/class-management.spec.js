// class-management.spec.js
// E2E tests for the professor's Classes & Roster tab: creating a class
// through the custom modal, giving it a join code, revoking that code, and
// archiving and restoring the class.
import { test, expect } from '@playwright/test';
import { signIn, openTab, apiToken, PASSWORD, TEACHER, STUDENT } from './helpers.js';

// Archive the classes a previous attempt left behind.
//
// CI replays this file against the same server and the same data, so a run
// that died before it could archive its class leaves an *active* E2E class
// behind. An active class stays in the professor's list for good, and the
// roster builds its "add to another class" dropdown from that list - so one
// leftover changes what a later spec sees, and the later spec fails for a
// reason that has nothing to do with it. They are archived here, before the
// counts are read, so every attempt starts from the same place.
async function archiveLeftovers(page) {
  const leftovers = page.locator('.class-card').filter({ hasText: 'E2E Class' });
  for (let guard = 0; guard < 20 && (await leftovers.count()) > 0; guard += 1) {
    const card = leftovers.first();
    // the card's own name, so the wait below cannot be satisfied by a
    // different card that happens to share the words
    const name = (await card.getByRole('heading', { level: 3 }).innerText()).trim();
    await card.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.locator('.class-card').filter({ hasText: name })).toHaveCount(0);
  }
}

// Open the tab and wait for the class grid.
//
// The grid is only in the DOM once /api/classes has answered, and how many
// cards are on it depends on what the earlier tests left behind (a CI retry
// replays this file against the same server and the same data), so the counts
// are read from the page and never assumed. Two counts come back: the active
// classes on show, and all the classes there are, archived ones included - a
// retry can leave an archived class behind.
async function openClassManagement(page) {
  // The reduced-motion setting is turned on for the test. The sign-in
  // buttons slide under the pointer, and Playwright waits for a moving
  // element to settle before it clicks: on WebKit that wait is long enough
  // to eat the whole test's time. With the animation off the sign-in is
  // quick and steady.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, TEACHER);
  await openTab(page, 'Classes & Roster');
  await expect(page.getByRole('heading', { name: 'Class Management' })).toBeVisible();
  await expect(page.locator('.class-card').first()).toBeVisible();
  // what a failed attempt left behind is put away first, so the counts
  // below and every later spec see the same grid
  await archiveLeftovers(page);
  const active = await page.locator('.class-card').count();

  const showArchived = page.getByRole('checkbox', { name: 'Show archived classes' });
  await showArchived.check();
  const counter = page.getByText(/Showing \d+ (active|total) classes/);
  await expect(counter).toHaveText(/Showing \d+ total classes/);
  const total = Number((await counter.innerText()).match(/Showing (\d+)/)[1]);
  await showArchived.uncheck();
  return { active, total };
}

// Create a class through the modal and return its id.
//
// The modal is a plain div, with no role="dialog" and no native dialog box,
// so it is found by its own class. The app opens the new class straight
// away, so the flow ends in the detail view.
async function createClass(page, name) {
  await page.getByRole('button', { name: '+ Create Class' }).click();
  const modal = page.locator('.modal-card');
  await expect(modal.getByRole('heading', { name: 'Create New Class Group' })).toBeVisible();
  await modal.getByLabel('Course').selectOption('c-comp');
  await modal.getByLabel('Class Name').fill(name);
  await modal.getByLabel('Description (Optional)').fill('A class the end-to-end tests made.');
  await modal.getByRole('button', { name: 'Create Class', exact: true }).click();
  await expect(page.locator('#toast')).toContainText(`Class "${name}" created successfully!`);
  // the new class's detail view is open, with its name as the heading
  await expect(page.getByRole('heading', { name, level: 2, exact: true })).toBeVisible();
  const idLine = await page.getByText(/ID: cl-/).first().innerText();
  return idLine.match(/ID: (cl-[a-z0-9]+)/)[1];
}

test('a professor creates a class, gives it a join code and revokes the code', async ({ page }) => {
  test.slow(); // a sign-in and a handful of round trips
  const { active } = await openClassManagement(page);
  const name = `E2E Class ${crypto.randomUUID().slice(0, 8)}`;
  const classId = await createClass(page, name);

  // back to the grid, where the new card sits with the course it belongs to
  await page.getByRole('button', { name: '← Back to all classes' }).click();
  const card = page.locator('.class-card').filter({ hasText: name });
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('heading', { level: 3 })).toHaveText(name);
  await expect(card.getByText('Intro to Computing (demo)', { exact: true })).toBeVisible();
  // a class made just now has nobody in it and no codes yet
  await expect(card.getByText('0 Students')).toBeVisible();
  await expect(card.getByText('0 Active Codes')).toBeVisible();
  await expect(page.getByText(`Showing ${active + 1} active classes`, { exact: true })).toBeVisible();

  // --- a join code for the new class ---
  await card.getByRole('button', { name: 'Manage Roster & Codes →' }).click();
  await page.getByRole('button', { name: /^Join Codes \(\d+\)$/ }).click();
  await page.getByRole('button', { name: '+ Generate Join Code' }).click();
  const modal = page.locator('.modal-card');
  await expect(modal.getByRole('heading', { name: 'Generate Student Join Code' })).toBeVisible();
  await modal.getByRole('button', { name: 'Generate Code', exact: true }).click();

  await expect(page.locator('#toast')).toContainText('New join code generated: QQ-');
  const code = (await page.locator('.code-badge-large').innerText()).trim();
  expect(code).toMatch(/^QQ-[23456789A-HJ-NP-Z]{5}$/);

  const row = page.getByRole('row').filter({ hasText: code });
  await expect(row).toHaveCount(1);
  await expect(row.locator('.code-badge-table')).toHaveText(code);
  await expect(row.getByRole('cell').nth(1)).toHaveText('0 / 20');
  await expect(row.locator('.badge.good')).toHaveText('Active');

  // --- revoking it ---
  // The revoke asks first with the browser's own confirm box, so the dialog
  // has to be answered: with no listener the browser dismisses it, the app
  // takes that as "no" and nothing is revoked.
  page.on('dialog', (d) => d.accept());
  await row.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.locator('#toast')).toContainText('Join code revoked.');

  // The code is still listed, but it is dead now: no revoke button, no copy
  // button, and a dash where the button was.
  await expect(row.locator('.badge.bad')).toHaveText('Revoked');
  await expect(row.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Copy' })).toHaveCount(0);
  await expect(row.getByText('—')).toBeVisible();
  await expect(row.locator('.code-badge-table')).toHaveText(code);
  await expect(page.getByRole('button', { name: 'Join Codes (0)', exact: true })).toBeVisible();

  // And the green banner that said "share this code with your students" is
  // gone with it. It used to stay on screen with a live Copy Code button,
  // so the professor could copy and hand out a code that no longer works.
  await expect(page.getByText('New Join Code Generated:')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy Code' })).toHaveCount(0);

  // the server agrees the code is revoked
  const token = await apiToken(page);
  const response = await page.request.get(`/api/classes/${classId}/join-codes`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.text();
  expect(response.ok(), body).toBe(true);
  const record = JSON.parse(body).find((c) => c.code === code);
  expect(record, 'the revoked code is still listed').toBeTruthy();
  expect(record.revoked, 'the code is marked revoked on the server').toBe(true);

  // and a student cannot redeem it any more: this is the request the
  // student's "Join Class" form makes, and a revoked code is refused before
  // the class and the student's own enrolments are even looked at.
  const login = await page.request.post('/api/login', {
    data: { email: STUDENT.email, password: PASSWORD },
  });
  const loginBody = await login.text();
  expect(login.ok(), loginBody).toBe(true);
  const studentToken = JSON.parse(loginBody).token;
  const redeem = await page.request.post('/api/classes/join', {
    headers: { Authorization: `Bearer ${studentToken}` },
    data: { code },
  });
  const redeemBody = await redeem.text();
  expect(redeem.status(), redeemBody).toBe(404);
  expect(JSON.parse(redeemBody).error).toBe('Invalid or revoked join code.');

  // --- putting the class away ---
  // A class that is still active stays in the professor's list for good, and
  // the roster offers every active class the professor owns that the student
  // is not in - so a class left behind here would quietly change what a later
  // spec sees. Archiving it takes it out of that list again. (An archived
  // class is still on the grid when "Show archived classes" is ticked, which
  // is why the counts in the other test are read from the page and never
  // assumed.)
  await page.getByRole('button', { name: 'Archive Class', exact: true }).click();
  await expect(page.locator('#toast')).toContainText(`Class "${name}" archived.`);
});

test('an archived class leaves the grid and can be restored', async ({ page }) => {
  test.slow();
  const { active, total } = await openClassManagement(page);
  const name = `E2E Class ${crypto.randomUUID().slice(0, 8)}`;
  await createClass(page, name);

  await page.getByRole('button', { name: '← Back to all classes' }).click();
  const card = page.locator('.class-card').filter({ hasText: name });
  await expect(card).toHaveCount(1);
  await expect(page.getByText(`Showing ${active + 1} active classes`, { exact: true })).toBeVisible();

  // archiving is a toggle and asks nothing
  await card.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.locator('#toast')).toContainText(`Class "${name}" archived.`);

  // an archived class is hidden while archived classes are not shown
  await expect(card).toHaveCount(0);
  await expect(page.getByText(`Showing ${active} active classes`, { exact: true })).toBeVisible();

  // and it comes back, marked as archived, when they are shown
  await page.getByRole('checkbox', { name: 'Show archived classes' }).check();
  await expect(page.getByText(`Showing ${total + 1} total classes`, { exact: true })).toBeVisible();
  await expect(card).toHaveCount(1);
  await expect(card).toHaveClass(/archived/);
  await expect(card.getByText('Archived', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();

  // restoring puts it back into the ordinary list
  await card.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.locator('#toast')).toContainText(`Class "${name}" restored.`);
  await expect(card.getByText('Archived', { exact: true })).toHaveCount(0);
  await expect(card.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
  await expect(page.getByText(`Showing ${total + 1} total classes`, { exact: true })).toBeVisible();

  // and it is put away again at the end, for the reason given in the test
  // above: an active class the professor owns stays in the list that the
  // roster's "add to another class" dropdown is built from.
  await card.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.locator('#toast')).toContainText(`Class "${name}" archived.`);
});
