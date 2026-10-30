// question-bank.spec.js
// E2E tests for the professor's question bank: reviewing a draft question
// and publishing it so students can practise with it.
import { test, expect } from '@playwright/test';
import { signIn, openTab, createDraftQuestion, TEACHER } from './helpers.js';

test('should list draft questions that need review', async ({ page }) => {
  await signIn(page, TEACHER);
  // The bank seeds one draft, but approving it (the test below) takes it out
  // of the review list, and a CI retry replays this test against the same
  // server and the same data. So the test makes the draft it reviews.
  const draft = await createDraftQuestion(page);

  // a professor lands on the dashboard, so open the question bank
  await openTab(page, 'Question bank');

  // the question bank opens on the "Needs review" filter, showing drafts
  await expect(page.getByRole('button', { name: /Needs review/ })).toHaveAttribute('aria-pressed', 'true');
  const card = page.locator('#qcard-' + draft.id);
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Approve & publish' })).toBeVisible();
});

test('should publish a draft question when it is approved', async ({ page }) => {
  await signIn(page, TEACHER);
  const draft = await createDraftQuestion(page);

  await openTab(page, 'Question bank');

  await page.locator('#qcard-' + draft.id).getByRole('button', { name: 'Approve & publish' }).click();
  await expect(page.locator('#toast')).toHaveText('Published');

  // the question is live now: it has left "Needs review" and is listed under
  // "Published" with its new status
  await page.locator('.bank-status').getByRole('button', { name: /^Published \(/ }).click();
  const card = page.locator('#qcard-' + draft.id);
  await expect(card).toBeVisible();
  await expect(card.locator('.badge.published')).toHaveText('published');
});
