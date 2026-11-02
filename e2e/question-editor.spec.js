// question-editor.spec.js
// E2E test for the professor's question editor: a new question is written in
// the "Question editor" form, saved as a draft, found under "Needs review"
// and then approved and published from its card.
import { test, expect } from '@playwright/test';
import { signIn, openTab, TEACHER } from './helpers.js';

test('should write a question in the editor and publish it from the bank', async ({ page }) => {
  // The editor fills a dozen fields and the bank redraws the whole list after
  // every save, so the journey takes a while on the slower engines.
  test.slow();
  await signIn(page, TEACHER);
  await openTab(page, 'Question bank');

  // the bank is open, waiting on the "Needs review" filter
  await expect(page.getByRole('heading', { name: 'Question bank', exact: true })).toBeVisible();
  const statuses = page.locator('.bank-status');
  await expect(statuses.getByRole('button', { name: /^Needs review \(/ })).toHaveAttribute('aria-pressed', 'true');

  // "+ New question" opens the editor form
  await page.getByRole('button', { name: '+ New question', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Question editor' });
  await expect(editor).toBeVisible();
  await expect(editor.getByRole('heading', { name: 'New question' })).toBeVisible();

  // Every question needs its own wording: the bank refuses a question that
  // looks like one it already holds, and a CI retry replays the test against
  // the same server and the same data. The marker is a random phrase rather
  // than a clock reading, so two attempts never read alike.
  const marker = crypto.randomUUID().replace(/-/g, '').slice(0, 12).match(/.{1,4}/g).join(' ');
  const stem = `Which protocol carries data without guaranteeing delivery? Editor check ${marker}`;

  // The topic and the learning outcome have to match the course exactly, or
  // the server files the question under a brand new topic and outcome.
  await editor.getByLabel('Topic', { exact: true }).fill('Networking basics');
  await editor.getByLabel('Learning outcome', { exact: true }).fill('Distinguish common protocols and their purpose');
  await editor.getByLabel('Format', { exact: true }).selectOption('mcq');
  await editor.getByLabel('Question', { exact: true }).fill(stem);
  for (const [i, text] of ['TCP', 'UDP', 'DNS', 'ARP'].entries()) {
    await editor.getByLabel(`Option ${i + 1}`, { exact: true }).fill(text);
  }
  // the right answer starts on the first option, so the second one is picked
  // on purpose
  await editor.getByLabel('Option 2 is correct', { exact: true }).check();
  await editor.getByLabel('Explanation shown after answering', { exact: true }).fill('UDP is connectionless and does not guarantee delivery, which suits live games.');
  await editor.getByLabel('Intended difficulty', { exact: true }).selectOption('easy');

  // the structure has to pass before the question can be saved
  await editor.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(editor.getByText('Structure checks pass.', { exact: true })).toBeVisible();

  // saving remounts the whole view, so the editor goes away again
  await editor.getByRole('button', { name: 'Save as draft', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Saved');
  await expect(editor).toHaveCount(0);

  // the new draft is waiting in the review list
  const card = page.locator('.qcard').filter({ hasText: stem });
  await expect(card).toBeVisible({ timeout: 30_000 });
  const cardId = await card.getAttribute('id');
  await expect(card.locator('.badge.draft')).toHaveText('draft');
  // the option that was marked in the editor is the one marked on the card
  const marked = card.locator('.answer-options li').filter({ hasText: '✓ Correct' });
  await expect(marked).toHaveCount(1);
  await expect(marked).toContainText('UDP');

  // approving publishes the question
  await card.getByRole('button', { name: 'Approve & publish', exact: true }).click();
  await expect(page.locator('#toast')).toHaveText('Published');

  // it has left "Needs review" ...
  await expect(page.locator('#' + cardId)).toHaveCount(0);
  // ... and is live under "Published"
  await statuses.getByRole('button', { name: /^Published \(/ }).click();
  const live = page.locator('#' + cardId);
  await expect(live).toBeVisible();
  await expect(live.locator('.badge.published')).toHaveText('published');
});
