// e2e/helpers.js
// Shared helpers for the end-to-end tests: signing in, moving between the
// tabs of the app shell and answering a practice question.
import { expect } from '@playwright/test';

export const PASSWORD = 'quizquest';
export const TEACHER = { email: 'prof.a@quizquest.demo', name: 'Prof. Demo A' };
export const STUDENT = { email: 'student01@quizquest.demo', name: 'Student 01' };

// What the server says after an answer: right, wrong, partly right, or the
// clock ran out.
const VERDICT = /Correct!|Not quite\.|Partly right|Time is up|No answer given/;

export async function signIn(page, { email, password = PASSWORD }) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#login-password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Switch user' })).toBeVisible();
}

export async function openTab(page, name) {
  await page.locator('#tabs').getByRole('button', { name, exact: true }).click();
}

// Answer the question on screen, whatever format it is in, and wait for the
// server's verdict. A wrong answer is fine: the point is the round trip.
export async function answerCurrentQuestion(page) {
  const written = page.getByLabel('Written answer');
  const numeric = page.getByLabel('Numeric answer');
  const submit = page.getByRole('button', { name: 'Submit answer' });
  if (await written.count()) await written.fill('Latency measures travel delay, while bandwidth describes transfer capacity.');
  else if (await numeric.count()) await numeric.fill('13');
  else await page.locator('.options button').first().click();
  if (await submit.count()) await submit.click();
  await expect(page.getByText(VERDICT)).toBeVisible();
}

// Answer every question of the running session. The last answer offers
// "See results" instead of "Next question".
export async function answerWholeSession(page) {
  const counter = page.getByText(/Question \d+ of \d+/).first();
  await expect(counter).toBeVisible();
  const total = Number((await counter.innerText()).match(/of (\d+)/)[1]);
  for (let i = 1; i <= total; i++) {
    await expect(page.getByText(`Question ${i} of ${total}`)).toBeVisible();
    await answerCurrentQuestion(page);
    if (i < total) await page.getByRole('button', { name: /Next question/ }).click();
  }
}
