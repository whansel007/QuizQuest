// practice.spec.js
// E2E tests for the student's practice loop: start a session, answer a
// question, see the verdict and the explanation, and reach the summary.
import { test, expect } from '@playwright/test';
import { signIn, signUpStudent, openTab, answerCurrentQuestion, answerWholeSession, STUDENT } from './helpers.js';

test('a student starts a practice session and answers a question', async ({ page }) => {
  await signIn(page, STUDENT);
  await openTab(page, 'Practice');
  await expect(page.getByRole('region', { name: 'Practice setup', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Quiz details and settings', exact: true })).toBeVisible();

  // The shortest session the professor allows is 5 questions.
  await page.getByLabel('Length').selectOption('5');
  await page.getByRole('button', { name: 'Start practice' }).click();

  await expect(page.getByText(/Question 1 of 5/)).toBeVisible();
  await answerCurrentQuestion(page);

  // The server explains the answer and lets the student move on.
  await expect(page.getByRole('button', { name: /Next question|See results/ })).toBeVisible();
});

test('the summary offers the way back to practice and to the progress page', async ({ page }) => {
  // This one answers a whole five-question session, so it needs longer than
  // the default budget on WebKit, the slowest engine.
  test.slow();
  await signIn(page, STUDENT);
  await openTab(page, 'Practice');
  await page.getByLabel('Length').selectOption('5');
  await page.getByRole('button', { name: 'Start practice' }).click();

  await answerWholeSession(page);
  await page.getByRole('button', { name: 'See results' }).click();
  await expect(page.getByText(/Session complete|The Fog of Confusion is defeated/)).toBeVisible();

  await page.getByRole('button', { name: 'View my progress' }).click();
  await expect(page.getByRole('heading', { name: 'My Progress' })).toBeVisible();
  await expect(page.getByText('Recent sessions')).toBeVisible();
});

test('a student who is not enrolled in any class is told how to join one', async ({ page }) => {
  // A brand-new account has no class yet.
  await signUpStudent(page, 'No Class Yet');

  await openTab(page, 'Practice');
  await expect(page.getByRole('heading', { name: 'Join a class to begin', exact: true })).toBeVisible();
  await expect(page.getByText('Enter the join code your professor gave you. Your practice questions and progress will appear here.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '+ Join Class' })).toBeVisible();
});
