// signup.spec.js
// E2E tests for creating a student account from the login page.
import { test, expect } from '@playwright/test';
import { openTab, registerStudent, signIn } from './helpers.js';

test('should create a student account and sign the student in', async ({ page }) => {
  // a new email every run, so the account never exists yet
  const email = `new.student.${Date.now()}@example.com`;

  await page.goto('/');
  // The registration is one request, and it can come back with no answer at
  // all: the browser reuses a connection the server has just closed and the
  // POST never lands. The request is then made again, exactly as the sign-in
  // helper does. A retry can come back with "that email already exists" -
  // the first request DID land and only its answer was lost - so the account
  // is signed into instead.
  const existed = await registerStudent(page, {
    name: 'New Student',
    email,
    done: page.getByRole('button', { name: 'Log out' }),
  });
  if (existed) await signIn(page, { email, password: 'longenough' });

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
  const already = page.getByText('An account with this email already exists. Sign in instead.');
  await page.goto('/');
  await registerStudent(page, {
    name: 'Copy Cat',
    email: 'student01@quizquest.demo',
    done: already,
  });
  await expect(already).toBeVisible();
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
