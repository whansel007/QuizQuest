// material-library.spec.js
// E2E tests for the professor's Source material library: archiving a note,
// showing the archived material again, restoring it, and editing its
// metadata.
//
// The library lives inside AI drafting, under a disclosure, and the passage
// rows are disclosures of their own - so this file opens both.
import { test, expect } from '@playwright/test';
import { signIn, openTab, apiToken, TEACHER } from './helpers.js';

const TOPIC_ID = 'tp-net';
const COURSE_ID = 'c-comp';

// A note of this test's own, so the seeded material is never touched: a
// retry that dies half way through must not leave the demo's material
// archived.
async function createNote(page, title) {
  const token = await apiToken(page);
  const response = await page.request.post(`/api/teacher/courses/${COURSE_ID}/passages`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      topicId: TOPIC_ID,
      outcomeId: 'lo-net-1',
      title,
      text: 'A note the end-to-end tests create, so there is always one waiting to be archived.',
      origin: 'paste',
      confirmNoPersonalData: true,
    },
  });
  const body = await response.text();
  expect(response.ok(), `the note is created: ${body}`).toBe(true);
  return JSON.parse(body);
}

// Sign in, open AI drafting on the topic the note belongs to, and unfold
// the material library. Safe to call again: the library keeps its open
// state across the remount a save causes.
async function openLibrary(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page, TEACHER);
  await openTab(page, 'AI drafting');
  const topic = page.getByRole('combobox', { name: 'Weekly topic' });
  await expect(topic).toBeVisible();
  await topic.selectOption(TOPIC_ID);
  const library = page.locator('details.panel').filter({ hasText: 'Material library' });
  const summary = library.locator('summary');
  if ((await library.getAttribute('open')) === null) await summary.click();
  await expect(page.getByRole('checkbox', { name: 'Show archived material' })).toBeVisible();
}

// The row of one passage: the disclosure that holds its title, its text and
// its buttons.
function row(page, title) {
  return page.getByText(title, { exact: true }).locator('xpath=ancestor::details[1]');
}

test('a professor archives a note, shows the archived material, restores it and edits its title', async ({ page }) => {
  await openLibrary(page);
  const title = `E2E archive note ${crypto.randomUUID().slice(0, 8)}`;
  await createNote(page, title);
  await page.getByRole('button', { name: 'Refresh material library' }).click();

  // The note is in the library.
  const note = page.getByText(title, { exact: true });
  await expect(note).toBeVisible();

  // Archive it. The buttons are inside the passage's own disclosure.
  await row(page, title).locator('summary').click();
  await row(page, title).getByRole('button', { name: 'Archive passage' }).click();
  await expect(page.getByText(`Archived "${title}".`)).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);

  // Ask for the archived material: the note comes back, marked as archived.
  await page.getByRole('checkbox', { name: 'Show archived material' }).check();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(row(page, title).locator('.badge')).toHaveText('archived');

  // And it can be restored.
  await row(page, title).locator('summary').click();
  await row(page, title).getByRole('button', { name: 'Restore passage' }).click();
  await expect(page.getByText(`Restored "${title}".`)).toBeVisible();
  await expect(row(page, title).locator('.badge')).toHaveCount(0);
  await expect(row(page, title).getByRole('button', { name: 'Archive passage' })).toHaveCount(0);

  // Edit the metadata: the modal opens on the note's own title.
  await row(page, title).locator('summary').click();
  await row(page, title).getByRole('button', { name: 'Edit metadata' }).click();
  const modal = page.locator('.modal-card');
  await expect(modal.getByRole('heading', { name: 'Edit material' })).toBeVisible();
  await expect(modal.locator('#edit-passage-title')).toHaveValue(title);
  const renamed = `${title} renamed`;
  await modal.locator('#edit-passage-title').fill(renamed);
  await modal.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(`Saved "${renamed}".`)).toBeVisible();
  await expect(page.getByText(renamed, { exact: true })).toBeVisible();
});
