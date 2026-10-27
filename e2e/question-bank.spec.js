// question-bank.spec.js
// E2E tests for the professor's question bank: reviewing a draft question
// and publishing it so students can practise with it.
import { test, expect } from '@playwright/test';

test('should list draft questions that need review', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill('prof.a@quizquest.demo');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#login-password').fill('quizquest');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // a professor lands on the dashboard, so open the question bank
  await page.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();

  // the question bank opens on the "Needs review" filter, showing drafts
  await expect(page.getByRole('button', { name: /Needs review/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Approve & publish' }).first()).toBeVisible();
});

test('should publish a draft question when it is approved', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill('prof.a@quizquest.demo');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#login-password').fill('quizquest');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await page.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();

  await page.getByRole('button', { name: 'Approve & publish' }).first().click();
  await expect(page.getByText('Published', { exact: true })).toBeVisible();
});
