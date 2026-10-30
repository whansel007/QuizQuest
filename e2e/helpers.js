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
  // A test that opens two pages has to say which one it is driving: WebKit
  // stops animating a page that is not in front, and a click waits for the
  // page to settle before it fires. Without this the click waits forever.
  await page.bringToFront();
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
  const options = page.locator('.options button');
  const submit = page.getByRole('button', { name: 'Submit answer' });

  // The question arrives after the session starts, and its format decides how
  // it is answered: a choice question shows options, a numeric one a number
  // box, a written one a text area. Wait for one of them to be on screen
  // before choosing, or the wrong branch waits for ever — a numeric question
  // never grows an options list.
  await expect(written.or(numeric).or(options).first()).toBeVisible({ timeout: 30 * 1000 });

  if (await written.count()) await written.fill('Latency measures travel delay, while bandwidth describes transfer capacity.');
  else if (await numeric.count()) await numeric.fill('13');
  else await options.first().click();
  if (await submit.count()) await submit.click();
  await expect(page.getByText(VERDICT)).toBeVisible();
}

// The signed-in tab's token, so a test can call the app's own API as that
// user. The app keeps the token in sessionStorage and sends it as a bearer
// token, so a test that only needs some data arranged (a class, a draft
// question) does not have to drive the whole screen for it.
export async function apiToken(page) {
  const token = await page.evaluate(() => sessionStorage.getItem('qq-token'));
  expect(token, 'the signed-in tab has a token').toBeTruthy();
  return token;
}

// The question bank seeds exactly one draft question, and approving it (which
// the publish test does) takes it out of the review list. A CI retry replays
// a test against the same server and the same data, so a test that needs a
// draft to review makes its own: the professor creates one through the app's
// own API and the test then reviews that one.
export async function createDraftQuestion(page, { courseId = 'c-comp', topicId = 'tp-net', outcomeId = 'lo-net-2' } = {}) {
  const token = await apiToken(page);
  // Every draft needs its own wording: the bank refuses a question that looks
  // like one it already holds, and a retry would be turned away as a copy of
  // the attempt before it. A short stem keeps the two well clear of each
  // other, whatever the marker turns out to be.
  const marker = Math.random().toString(36).slice(2, 10);
  const stem = `CI retry marker ${marker}`;
  const response = await page.request.post(`/api/teacher/courses/${courseId}/questions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      type: 'mcq',
      stem,
      explanation: 'A draft the end-to-end tests create, so there is always one waiting for review.',
      difficulty: 'easy',
      options: ['Alpha', 'Beta', 'Gamma', 'Delta'],
      answerIndex: 0,
      topicId,
      outcomeId,
      publish: false,
    },
  });
  const body = await response.text();
  expect(response.ok(), `the draft question is created: ${body}`).toBe(true);
  const question = JSON.parse(body);
  expect(question.status, 'the new question is a draft').toBe('draft');
  return { id: question.id, stem };
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
