// professor-enrol.spec.js
// E2E tests for professor-led enrolment: the professor adds a student to a
// class by email and class name, and the student then has that class.
import { test, expect } from '@playwright/test';
import { signIn, signUpStudent, openTab, TEACHER } from './helpers.js';

test('a professor enrols a student by email and class name', async ({ page }) => {
  test.slow(); // two sign-ins
  const student = await page.context().newPage();
  const email = await signUpStudent(student, 'Added By Prof');

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
  const email = await signUpStudent(student, 'Dropdown Pick');
  await student.close();

  await signIn(page, TEACHER);
  await openTab(page, 'Classes & Roster');
  const enrol = page.getByRole('form', { name: 'Enrol a student' });
  await enrol.getByLabel('Student email').fill(email);
  await enrol.getByLabel('Class name').fill('Computing - Tutorial Group A');
  await enrol.getByRole('button', { name: 'Enrol student' }).click();
  await expect(page.getByText('Added Dropdown Pick to Computing - Tutorial Group A.')).toBeVisible();

  await page.getByRole('button', { name: 'Manage Roster & Codes →' }).first().click();
  // The roster keeps the students from earlier attempts: a CI retry replays
  // the test against the same server and the same data, so the student of the
  // attempt before is still in Group A. The email is unique, the name is
  // not, so the row is picked by its email.
  const row = page.getByRole('row').filter({ hasText: email });
  await row.getByRole('button', { name: /^Dropdown Pick/ }).click();
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
  const email = await signUpStudent(student, 'Roster Add');
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
