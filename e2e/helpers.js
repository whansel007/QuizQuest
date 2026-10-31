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

// A student account of this test's own.
//
// A CI retry replays the test against the same server and the same data, so
// a test that needs an account of its own makes a new one every attempt. A
// shared account would arrive at the second attempt already holding the
// first attempt's answers, reports and enrolments, and the "no history yet"
// checks would be measuring the past instead of the test.
//
// Creating an account is a request of its own, so the wait is for the
// "Log out" button that only appears once the account exists: reloading the
// tab while the sign-up is still in flight would cancel it, and whatever the
// test did next would find no such account.
export async function signUpStudent(page, name) {
  const email = `${name.toLowerCase().replace(/\s+/g, '.')}.${crypto.randomUUID().slice(0, 8)}@example.com`;
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a student account' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.locator('#signup-password').fill('longenough');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible();
  return email;
}

// Put a student account into one of the professor's classes, through the
// professor's own session. The account has to exist already and the class has
// to be one the professor owns.
export async function enrolStudent(teacherPage, email, className) {
  const token = await apiToken(teacherPage);
  const response = await teacherPage.request.post('/api/classes/enrol', {
    headers: { Authorization: `Bearer ${token}` },
    data: { email, className },
  });
  const body = await response.text();
  expect(response.status(), `the student joins ${className}: ${body}`).toBe(201);
}

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
  // Sometimes the request never reaches the server: the browser reuses a
  // connection the server has just closed, and the sign-in comes back as
  // "Could not reach the server". Nothing is half done at this point - no
  // session, no data - so the sign-in is simply done again, which is what
  // the app asks the user to do.
  //
  // Two things have to be right for that retry to work. The app empties the
  // password field when a sign-in fails, so the password has to be typed
  // again - a retry with an empty field only earns "Enter your password."
  // And typing in the field clears the error message, so the alert read
  // after the retry always belongs to the retry and never to the attempt
  // before it.
  const signedIn = page.getByRole('button', { name: 'Log out' });
  const offline = page.getByRole('alert').filter({ hasText: 'Could not reach the server' });
  // The wait is generous: a sign-in that has to be tried again can take a
  // while on a busy machine, and the default ten seconds would fail the test
  // for a server that was about to answer.
  await expect(signedIn.or(offline).first()).toBeVisible({ timeout: 30_000 });
  for (let attempt = 0; attempt < 3 && await offline.first().isVisible(); attempt++) {
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(signedIn.or(offline).first()).toBeVisible({ timeout: 30_000 });
  }
  await expect(signedIn).toBeVisible();
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
  // The question arrives after the session starts, and its format decides how
  // it is answered: a choice question shows options, a numeric one a number
  // box, a written one a text area. Wait for one of them to be on screen
  // before choosing, or the wrong branch waits for ever - a numeric question
  // never grows an options list. The question counter can appear before the
  // answer control, so this waits for the control itself rather than for the
  // page to settle. WebKit is the slowest engine here, so the wait is 30s.
  await expect.poll(async () => {
    if (await written.isVisible()) answerKind = 'written';
    else if (await numeric.isVisible()) answerKind = 'numeric';
    else if (await choice.isVisible()) answerKind = 'choice';
    else answerKind = null;
    return answerKind;
  }, { message: 'A supported answer control should appear before answering', timeout: 30_000 }).toBeTruthy();

  if (answerKind === 'written') await written.fill('Latency measures travel delay, while bandwidth describes transfer capacity.');
  else if (answerKind === 'numeric') await numeric.fill('13');
  else await choice.click();
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
  // other, whatever the marker turns out to be. The marker is a UUID slice
  // rather than a clock reading, so two drafts made in the same millisecond
  // still differ.
  const marker = crypto.randomUUID().slice(0, 8);
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
