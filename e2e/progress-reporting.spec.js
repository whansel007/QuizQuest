// End-to-end journeys for student progress and professor report replies.
import { test, expect } from '@playwright/test';
import { signIn, signUpStudent, enrolStudent, openTab, answerCurrentQuestion, TEACHER } from './helpers.js';

test('a student sees completed practice reflected in topic progress', async ({ page }) => {
  // It answers a whole five-question session and then checks every topic, so
  // it needs longer than the default budget on WebKit, the slowest engine.
  test.slow();
  // The student is an account of this test's own: a CI retry replays the test
  // against the same server and the same data, and a student who had already
  // practised would start the test with answers already counted, so the "no
  // history yet" checks below would be wrong. A brand-new account starts
  // empty every time.
  const student = await page.context().newPage();
  const email = await signUpStudent(student, 'Progress Student');
  // The student needs a class to practise in, so the professor puts the new
  // account in the tutorial group.
  await signIn(page, TEACHER);
  await enrolStudent(page, email, 'Computing - Tutorial Group C');

  // The student signs in again, so the new class is in the account.
  await student.reload();
  const baselineResponse = student.waitForResponse((response) =>
    response.url().endsWith('/api/student/classes/cl-c/progress') && response.request().method() === 'GET');
  await openTab(student, 'My Progress');
  const baseline = await (await baselineResponse).json();
  expect(baseline.indicator).toMatchObject({ n: 0, correct: 0, accuracy: null });
  expect(baseline.topics.every((topic) => topic.n === 0)).toBe(true);
  expect(baseline.sessions).toHaveLength(0);

  await openTab(student, 'Practice');
  await student.getByLabel('Length', { exact: true }).selectOption('5');
  await student.getByRole('button', { name: 'Start practice', exact: true }).click();
  // The length of the session is read off the counter instead of being
  // assumed: the server can shorten a session when it has no instance of a
  // question to serve, and the counter is what the student is shown.
  const counter = student.getByText(/Question \d+ of \d+/).first();
  await expect(counter).toBeVisible();
  const total = Number((await counter.innerText()).match(/of (\d+)/)[1]);
  await expect(student.getByText(`Question 1 of ${total}`)).toBeVisible();

  // Pair each server grade with the question topic shown on screen. Provisional
  // written answers appear in session history but do not enter accuracy yet.
  const expectedByTopic = new Map();
  for (let index = 0; index < total; index++) {
    const topicName = (await student.locator('.quiz-topic').innerText()).trim();
    const answerResponse = student.waitForResponse((response) =>
      /\/api\/student\/sessions\/[^/]+\/answer$/.test(response.url()) && response.request().method() === 'POST');
    await answerCurrentQuestion(student);
    const result = await (await answerResponse).json();
    if (!result.provisional) {
      const expected = expectedByTopic.get(topicName) || { n: 0, correct: 0 };
      expected.n++;
      if (result.correct) expected.correct++;
      expectedByTopic.set(topicName, expected);
    }

    if (index < total - 1) {
      await student.getByRole('button', { name: /Next question/ }).click();
      await expect(student.getByText(`Question ${index + 2} of ${total}`)).toBeVisible();
    }
  }

  await student.getByRole('button', { name: 'See results', exact: true }).click();
  await expect(student.getByText(/Session complete|The Fog of Confusion is defeated/)).toBeVisible();
  const progressResponse = student.waitForResponse((response) =>
    response.url().endsWith('/api/student/classes/cl-c/progress') && response.request().method() === 'GET');
  await student.getByRole('button', { name: 'View my progress', exact: true }).click();
  const progress = await (await progressResponse).json();

  const confirmed = [...expectedByTopic.values()].reduce((sum, topic) => sum + topic.n, 0);
  expect(confirmed).toBeGreaterThan(0);
  expect(progress.indicator.n).toBe(confirmed);
  expect(progress.indicator.correct).toBe([...expectedByTopic.values()].reduce((sum, topic) => sum + topic.correct, 0));
  expect(progress.sessions).toHaveLength(1);
  expect(progress.sessions[0]).toMatchObject({ total, marked: confirmed, awaitingMarking: total - confirmed });
  for (const topic of progress.topics) {
    const expected = expectedByTopic.get(topic.name) || { n: 0, correct: 0 };
    expect(topic.n, `${topic.name} counted questions`).toBe(expected.n);
    expect(topic.correct, `${topic.name} correct answers`).toBe(expected.correct);
    expect(topic.accuracy, `${topic.name} accuracy`).toBe(expected.n ? expected.correct / expected.n : null);

    const card = student.locator('.pg-topic').filter({ hasText: topic.name });
    await expect(card.getByRole('heading', { name: topic.name, exact: true })).toBeVisible();
    if (expected.n) {
      await expect(card.getByText(`${expected.correct} / ${expected.n} counted questions correct`, { exact: true })).toBeVisible();
      await expect(card.locator('.pg-pct')).toHaveText(`${Math.round((expected.correct / expected.n) * 100)}%`);
    } else {
      await expect(card.getByText('No confirmed answers for this topic.', { exact: true })).toBeVisible();
    }
  }
  await expect(student.getByRole('heading', { name: 'My Progress', exact: true })).toBeVisible();
  await expect(student.getByText('Recent sessions', { exact: true })).toBeVisible();
});

test('a professor resolves a student report and the student refreshes to see the reply', async ({ browser }, testInfo) => {
  // Two signed-in browsers and a report round trip: give it room.
  test.slow();
  const baseURL = testInfo.project.use.baseURL;
  const studentContext = await browser.newContext({ baseURL });
  const professorContext = await browser.newContext({ baseURL });

  try {
    const studentPage = await studentContext.newPage();
    const professorPage = await professorContext.newPage();
    const reason = `Progress journey ${crypto.randomUUID().slice(0, 8)}: please clarify this question.`;
    const response = 'I checked the source notes and clarified the wording.';

    // The student is an account of this test's own. A CI retry replays the
    // test against the same server and the same data, so a shared account
    // would arrive at the second attempt already holding an open report on
    // some question, and the server refuses a second report on the same
    // question and version - which would show the student a different
    // message than the one this test expects. An account of its own starts
    // empty every time.
    const email = await signUpStudent(studentPage, 'Report Student');
    await signIn(professorPage, TEACHER);
    // The student needs a class of this professor's to practise in. The
    // professor's question bank is a course, not a class, so the report is
    // in the bank whichever class of the course the student practises in.
    await enrolStudent(professorPage, email, 'Computing - Tutorial Group A');
    // The class is part of the account now, so the tab reloads to pick it up.
    await studentPage.reload();

    // The three steps are named so a red job says which half of the round
    // trip broke: the student's report, the professor's reply, or the
    // student's refresh.
    await test.step('student submits a report', async () => {
      await openTab(studentPage, 'Practice');
      await studentPage.getByLabel('Length', { exact: true }).selectOption('5');
      await studentPage.getByRole('button', { name: 'Start practice', exact: true }).click();
      await answerCurrentQuestion(studentPage);
      await studentPage.getByRole('button', { name: 'Report a problem', exact: true }).click();
      await studentPage.getByLabel('Problem category', { exact: true }).selectOption('ambiguous');
      await studentPage.getByLabel('Report this question to your professor').fill(reason);
      await studentPage.getByRole('button', { name: 'Send report', exact: true }).click();
      await expect(studentPage.getByText('Report sent. You can follow its status in My Progress.')).toBeVisible();
      await openTab(studentPage, 'My Progress');
      await expect(studentPage.getByText(reason, { exact: false })).toBeVisible();
    });

    await test.step('professor resolves the report', async () => {
      await openTab(professorPage, 'Question bank');
      // The status filter is in the sidebar. The empty list also offers the
      // other statuses as buttons, so the filter is picked from its own group.
      await professorPage.locator('.bank-status').getByRole('button', { name: /^Reported \(/ }).click();
      const report = professorPage.locator('.qcard .note').filter({ hasText: reason });
      await expect(report).toBeVisible();
      await report.getByLabel('Professor response (optional, visible to the student)').fill(response);
      await report.getByRole('button', { name: 'Mark resolved', exact: true }).click();
      await expect(professorPage.getByText('Report resolved. The student can see the status in My Progress.', { exact: true })).toBeVisible();
    });

    await test.step('student refreshes progress to see the reply', async () => {
      await studentPage.bringToFront();
      await studentPage.getByRole('button', { name: 'Refresh progress', exact: true }).click();
      await studentPage.getByLabel('Report status', { exact: true }).selectOption('resolved');
      // The reply is looked up in this student's own report, so an earlier
      // report with the same answer (a retry of this test) cannot get in the way.
      const mine = studentPage.locator('.pg-report').filter({ hasText: reason });
      await expect(mine.getByText(response, { exact: false })).toBeVisible();
      await expect(mine.getByText('Resolved', { exact: true })).toBeVisible();
    });
  } finally {
    await Promise.all([studentContext.close(), professorContext.close()]);
  }
});
