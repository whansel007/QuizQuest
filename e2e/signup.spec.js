// signup.spec.js
// E2E tests for creating a student account from the login page.
import { test, expect } from '@playwright/test';
import { openTab } from './helpers.js';

test('should create a student account and sign the student in', async ({ page }) => {
  // a new email every run, so the account never exists yet
  const email = `new.student.${Date.now()}@example.com`;

  await page.goto('/');
  await page.getByRole('button', { name: 'Create a student account' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('New Student');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.locator('#signup-password').fill('longenough');
  await page.getByRole('button', { name: 'Create account' }).click();

  // A brand-new student is signed in and lands in the classless Kingdom home hub.
  await expect(page.getByText('New Student')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find your party', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Join a class in Practice', exact: true })).toBeVisible();
  // students land in their Kingdom, so open the practice tab, which says how
  // to join a class
  await openTab(page, 'Practice');
  await expect(page.getByRole('heading', { name: 'Join a class to begin', exact: true })).toBeVisible();
});

test('should refuse an email that already has an account', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a student account' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Copy Cat');
  await page.getByRole('textbox', { name: 'Email' }).fill('student01@quizquest.demo');
  await page.locator('#signup-password').fill('longenough');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('An account with this email already exists. Sign in instead.')).toBeVisible();
});

test('should ask for a longer password', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a student account' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Short Pass');
  await page.getByRole('textbox', { name: 'Email' }).fill('short.pass@example.com');
  await page.locator('#signup-password').fill('abc');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use a password of at least 8 characters.')).toBeVisible();
});
