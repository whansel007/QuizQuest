// professor-enrol.spec.js
// E2E tests for professor-led enrolment: the professor adds a student to a
// class by email and class name, and the student then has that class.
import { test, expect } from '@playwright/test';
import { signIn, openTab, TEACHER } from './helpers.js';

// A fresh account, so the seeded rosters other tests rely on stay as they are.
async function newStudent(page, name) {
  const email = `${name.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@example.com`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a student account' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.locator('#signup-password').fill('longenough');
  await page.getByRole('button', { name: 'Create account' }).click();
  return email;
}

test('a professor enrols a student by email and class name', async ({ page }) => {
  test.slow(); // two sign-ins
  const student = await page.context().newPage();
  const email = await newStudent(student, 'Added By Prof');

  await signIn(page, TEACHER);
  await openTab(page, 'Classes & Roster');
  const form = page.getByRole('form', { name: 'Enrol a student' });
  await form.getByLabel('Student email').fill(email);
  await form.getByLabel('Class name').fill('Computing - Tutorial Group C');
  await form.getByRole('button', { name: 'Enrol student' }).click();
  await expect(page.getByText('Added Added By Prof to Computing - Tutorial Group C.')).toBeVisible();

  // The student has the class: practice is available.
  await student.reload();
  await openTab(student, 'Practice');
  await expect(student.getByRole('button', { name: 'Start practice' })).toBeVisible();
});

test("clicking a student in the roster offers the professor's other classes in a dropdown", async ({ page }) => {
  test.slow();
  const student = await page.context().newPage();
  const email = await newStudent(student, 'Dropdown Pick');
  await student.close();

  await signIn(page, TEACHER);
  await openTab(page, 'Classes & Roster');
  const enrol = page.getByRole('form', { name: 'Enrol a student' });
  await enrol.getByLabel('Student email').fill(email);
  await enrol.getByLabel('Class name').fill('Computing - Tutorial Group A');
  await enrol.getByRole('button', { name: 'Enrol student' }).click();
  await expect(page.getByText('Added Dropdown Pick to Computing - Tutorial Group A.')).toBeVisible();

  await page.getByRole('button', { name: 'Manage Roster & Codes →' }).first().click();
  await page.getByRole('button', { name: /^Dropdown Pick/ }).click();
  const form = page.getByRole('form', { name: 'Add Dropdown Pick to another class' });
  // Group A is already theirs, so only Group C is offered
  await expect(form.getByRole('option', { name: 'Computing - Tutorial Group A' })).toHaveCount(0);
  await form.getByLabel('Add to class').selectOption({ label: 'Computing - Tutorial Group C' });
  await form.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Added Dropdown Pick to Computing - Tutorial Group C.')).toBeVisible();
  // the profile stays open and now lists both classes, with nothing left to add
  await expect(page.getByText('Already in all of your active classes.')).toBeVisible();
});

test("a class's roster adds a student by email, and refuses an unknown one", async ({ page }) => {
  test.slow();
  const student = await page.context().newPage();
  const email = await newStudent(student, 'Roster Add');
  await student.close();

  await signIn(page, TEACHER);
  await openTab(page, 'Classes & Roster');
  await page.getByRole('button', { name: 'Manage Roster & Codes →' }).first().click();
  const form = page.getByRole('form', { name: 'Add a student to this class' });

  await form.getByLabel('Add a student by email').fill('nobody.here@example.com');
  await form.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByText('No account uses this email. The student needs to sign up first.')).toBeVisible();

  await form.getByLabel('Add a student by email').fill(email);
  await form.getByRole('button', { name: 'Add student' }).click();
  await expect(page.getByRole('cell', { name: email })).toBeVisible();
});
