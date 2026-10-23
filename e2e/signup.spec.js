// signup.spec.js
// E2E tests for creating a student account from the login page.
import { test, expect } from '@playwright/test';

test('should create a student account and sign the student in', async ({ page }) => {
  // a new email every run, so the account never exists yet
  const email = `new.student.${Date.now()}@example.com`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('New Student');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.locator('#signup-password').fill('longenough');
  await page.getByRole('button', { name: 'Create account' }).click();

  // a brand-new student is signed in but not in any class yet
  await expect(page.getByText('New Student')).toBeVisible();
  await expect(page.getByText('You are not enrolled in any class.')).toBeVisible();
});

test('should refuse an email that already has an account', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Copy Cat');
  await page.getByRole('textbox', { name: 'Email' }).fill('student01@quizquest.demo');
  await page.locator('#signup-password').fill('longenough');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('An account with this email already exists. Sign in instead.')).toBeVisible();
});

test('should ask for a longer password', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Short Pass');
  await page.getByRole('textbox', { name: 'Email' }).fill('short.pass@example.com');
  await page.locator('#signup-password').fill('abc');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use a password of at least 8 characters.')).toBeVisible();
});
