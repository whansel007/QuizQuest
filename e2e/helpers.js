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
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
}

export async function openTab(page, name) {
  // On immersive student tabs (Kingdom, World, Summon) the menu is tucked
  // away; focusing a tab brings it down, as it does for keyboard users.
  const tab = page.locator('#tabs').getByRole('button', { name, exact: true });
  await tab.focus();
  await tab.click();
}

// Answer the question on screen, whatever format it is in, and wait for the
// server's verdict. A wrong answer is fine: the point is the round trip.
export async function answerCurrentQuestion(page) {
  const written = page.getByLabel('Written answer');
  const numeric = page.getByLabel('Numeric answer');
  const choice = page.locator('.options button').first();
  const submit = page.getByRole('button', { name: 'Submit answer' });
  let answerKind;
  // Wait for QuestionForm to mount before choosing a format; the question counter can appear first.
  await expect.poll(async () => {
    if (await written.isVisible()) answerKind = 'written';
    else if (await numeric.isVisible()) answerKind = 'numeric';
    else if (await choice.isVisible()) answerKind = 'choice';
    else answerKind = null;
    return answerKind;
  }, { message: 'A supported answer control should appear before answering', timeout: 10_000 }).toBeTruthy();

  if (answerKind === 'written') await written.fill('Latency measures travel delay, while bandwidth describes transfer capacity.');
  else if (answerKind === 'numeric') await numeric.fill('13');
  else await choice.click();
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
