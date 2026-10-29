// login.spec.js
// E2E tests for signing in: the whole app (Vue page, Node API, data store)
// from the user's point of view. Uses the seeded demo accounts, which all
// have the password "quizquest".
import { test, expect } from '@playwright/test';

test('should successfully log in a student with valid credentials', async ({ page }) => {
  // setup
  await page.goto('/');
  // actions
  await page.getByRole('textbox', { name: 'Email' }).fill('student01@quizquest.demo');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#login-password').fill('quizquest');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Students now land in their Kingdom home hub after sign-in.
  await expect(page.getByText('Student 01')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  await expect(page.locator('#tabs').getByRole('button', { name: 'Kingdom', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('should log a professor in to the question bank', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill('prof.a@quizquest.demo');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#login-password').fill('quizquest');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Prof. Demo A')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Question bank' })).toBeVisible();
});

test('should show an error for a wrong password', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill('student02@quizquest.demo');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#login-password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
});

test('should not continue with an invalid email address', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill('not-an-email');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText("That doesn't look like an email address.")).toBeVisible();
});

test('should sign the user out with Log out', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill('student03@quizquest.demo');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#login-password').fill('quizquest');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // students land in the Kingdom, where the menu is tucked away until focused
  const logout = page.getByRole('button', { name: 'Log out' });
  await logout.focus();
  await logout.click();
  await expect(page.getByRole('heading', { name: 'Log in to your account' })).toBeVisible();
});
