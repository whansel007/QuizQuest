// End-to-end journeys for student progress and professor report replies.
import { test, expect } from '@playwright/test';
import { signIn, openTab, answerCurrentQuestion, STUDENT, TEACHER } from './helpers.js';

test('a student sees completed practice reflected in topic progress', async ({ page }) => {
  // It answers a whole five-question session and then checks every topic, so
  // it needs longer than the default budget on WebKit, the slowest engine.
  test.slow();
  // Student 12 is seeded into Tutorial Group C with no attempts or sessions.
  await signIn(page, { email: 'student12@quizquest.demo', name: 'Student 12' });
  const baselineResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/student/classes/cl-c/progress') && response.request().method() === 'GET');
  await openTab(page, 'My Progress');
  const baseline = await (await baselineResponse).json();
  expect(baseline.indicator).toMatchObject({ n: 0, correct: 0, accuracy: null });
  expect(baseline.topics.every((topic) => topic.n === 0)).toBe(true);
  expect(baseline.sessions).toHaveLength(0);

  await openTab(page, 'Practice');
  await page.getByLabel('Length', { exact: true }).selectOption('5');
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await expect(page.getByText('Question 1 of 5')).toBeVisible();

  // Pair each server grade with the question topic shown on screen. Provisional
  // written answers appear in session history but do not enter accuracy yet.
  const expectedByTopic = new Map();
  for (let index = 0; index < 5; index++) {
    const topicName = (await page.locator('.quiz-topic').innerText()).trim();
    const answerResponse = page.waitForResponse((response) =>
      /\/api\/student\/sessions\/[^/]+\/answer$/.test(response.url()) && response.request().method() === 'POST');
    await answerCurrentQuestion(page);
    const result = await (await answerResponse).json();
    if (!result.provisional) {
      const expected = expectedByTopic.get(topicName) || { n: 0, correct: 0 };
      expected.n++;
      if (result.correct) expected.correct++;
      expectedByTopic.set(topicName, expected);
    }

    if (index < 4) {
      await page.getByRole('button', { name: /Next question/ }).click();
      await expect(page.getByText(`Question ${index + 2} of 5`)).toBeVisible();
    }
  }

  await page.getByRole('button', { name: 'See results', exact: true }).click();
  await expect(page.getByText(/Session complete|The Fog of Confusion is defeated/)).toBeVisible();
  const progressResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/student/classes/cl-c/progress') && response.request().method() === 'GET');
  await page.getByRole('button', { name: 'View my progress', exact: true }).click();
  const progress = await (await progressResponse).json();

  const confirmed = [...expectedByTopic.values()].reduce((sum, topic) => sum + topic.n, 0);
  expect(confirmed).toBeGreaterThan(0);
  expect(progress.indicator.n).toBe(confirmed);
  expect(progress.indicator.correct).toBe([...expectedByTopic.values()].reduce((sum, topic) => sum + topic.correct, 0));
  expect(progress.sessions).toHaveLength(1);
  expect(progress.sessions[0]).toMatchObject({ total: 5, marked: confirmed, awaitingMarking: 5 - confirmed });
  for (const topic of progress.topics) {
    const expected = expectedByTopic.get(topic.name) || { n: 0, correct: 0 };
    expect(topic.n, `${topic.name} counted questions`).toBe(expected.n);
    expect(topic.correct, `${topic.name} correct answers`).toBe(expected.correct);
    expect(topic.accuracy, `${topic.name} accuracy`).toBe(expected.n ? expected.correct / expected.n : null);

    const card = page.locator('.pg-topic').filter({ hasText: topic.name });
    await expect(card.getByRole('heading', { name: topic.name, exact: true })).toBeVisible();
    if (expected.n) {
      await expect(card.getByText(`${expected.correct} / ${expected.n} counted questions correct`, { exact: true })).toBeVisible();
      await expect(card.locator('.pg-pct')).toHaveText(`${Math.round((expected.correct / expected.n) * 100)}%`);
    } else {
      await expect(card.getByText('No confirmed answers for this topic.', { exact: true })).toBeVisible();
    }
  }
  await expect(page.getByRole('heading', { name: 'My Progress', exact: true })).toBeVisible();
  await expect(page.getByText('Recent sessions', { exact: true })).toBeVisible();
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
    const reason = `Progress journey ${Date.now()}: please clarify this question.`;
    const response = 'I checked the source notes and clarified the wording.';

    await signIn(studentPage, STUDENT);
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

    await signIn(professorPage, TEACHER);
    await openTab(professorPage, 'Question bank');
    await professorPage.getByRole('button', { name: /^Reported \(/ }).click();
    const report = professorPage.locator('.qcard .note').filter({ hasText: reason });
    await expect(report).toBeVisible();
    await report.getByLabel('Professor response (optional, visible to the student)').fill(response);
    await report.getByRole('button', { name: 'Mark resolved', exact: true }).click();
    await expect(professorPage.getByText('Report resolved. The student can see the status in My Progress.', { exact: true })).toBeVisible();

    await studentPage.getByRole('button', { name: 'Refresh progress', exact: true }).click();
    await studentPage.getByLabel('Report status', { exact: true }).selectOption('resolved');
    await expect(studentPage.getByText(response, { exact: false })).toBeVisible();
    await expect(studentPage.locator('.pg-report').filter({ hasText: reason }).getByText('Resolved', { exact: true })).toBeVisible();
  } finally {
    await Promise.all([studentContext.close(), professorContext.close()]);
  }
});
