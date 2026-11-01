// join-class.spec.js
// E2E test for the enrolment flow: a professor generates a join code and a
// new student redeems it to get into the class.
import { test, expect } from '@playwright/test';
import { signIn, signUpStudent, openTab, TEACHER } from './helpers.js';

test('a professor generates a join code and a new student enrols with it', async ({ page }) => {
  // Two sign-ins and a code round trip: give it room on WebKit.
  test.slow();
  // --- the professor makes a code ---
  await signIn(page, TEACHER);
  await openTab(page, 'Classes & Roster');
  await expect(page.getByRole('heading', { name: 'Class Management' })).toBeVisible();
  await page.getByRole('button', { name: 'Manage Roster & Codes →' }).first().click();
  await page.getByRole('button', { name: /Join Codes/ }).click();
  await page.getByRole('button', { name: '+ Generate Join Code' }).click();
  await page.getByRole('button', { name: 'Generate Code' }).click();

  const code = (await page.locator('.code-badge-large').innerText()).trim();
  expect(code).toMatch(/^QQ-[23456789A-HJ-NP-Z]{5}$/);

  // --- a new student redeems it ---
  const student = await page.context().newPage();
  await signUpStudent(student, 'Joiner');

  await openTab(student, 'Practice');
  await student.getByRole('button', { name: '+ Join Class' }).click();
  await student.getByLabel('Class Join Code').fill(code);
  await student.getByRole('button', { name: 'Join Class', exact: true }).click();

  await expect(student.getByText('Successfully enrolled in')).toBeVisible();
  // The class is now the student's class, so practice is available.
  await expect(student.getByRole('button', { name: 'Start practice' })).toBeVisible();
});

test('a wrong join code is refused with a clear message', async ({ page }) => {
  await signUpStudent(page, 'Wrong Code');

  await openTab(page, 'Practice');
  await page.getByRole('button', { name: '+ Join Class' }).click();
  await page.getByLabel('Class Join Code').fill('QQ-00000');
  await page.getByRole('button', { name: 'Join Class', exact: true }).click();
  await expect(page.getByText('Invalid or revoked join code.')).toBeVisible();
});
