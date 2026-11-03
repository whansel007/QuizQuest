// End-to-end: a student's report is counted on the professor's Analytics
// dashboard, which links to the To review page, where the professor answers
// it without opening the Question bank.
import { test, expect } from '@playwright/test';
import { signIn, signUpStudent, enrolStudent, openTab, answerCurrentQuestion, TEACHER } from './helpers.js';

test('a professor reaches a student report from the dashboard and resolves it on To review', async ({ browser }, testInfo) => {
  // Two signed-in browsers and a report round trip: give it room.
  test.slow();
  const baseURL = testInfo.project.use.baseURL;
  const studentContext = await browser.newContext({ baseURL });
  const professorContext = await browser.newContext({ baseURL });

  try {
    const studentPage = await studentContext.newPage();
    const professorPage = await professorContext.newPage();
    // A marker of this attempt's own, so a CI retry (same server, same data)
    // finds this report and not the one the first attempt left behind.
    const reason = `To review journey ${crypto.randomUUID().slice(0, 8)}: the wording is unclear.`;
    const response = 'Thanks, I reworded the question.';

    // A fresh student: the server refuses a second open report on the same
    // question and version, so a shared account would break on a retry.
    const email = await signUpStudent(studentPage, 'Review Report Student');
    await signIn(professorPage, TEACHER);
    await enrolStudent(professorPage, email, 'Computing - Tutorial Group A');
    await studentPage.reload();

    await test.step('student submits a report', async () => {
      await openTab(studentPage, 'Quiz');
      await studentPage.getByLabel('Length', { exact: true }).selectOption('5');
      await studentPage.getByRole('button', { name: 'Start practice', exact: true }).click();
      await answerCurrentQuestion(studentPage);
      await studentPage.getByRole('button', { name: 'Report a problem', exact: true }).click();
      await studentPage.getByLabel('Problem category', { exact: true }).selectOption('typo');
      await studentPage.getByLabel('Report this question to your professor').fill(reason);
      await studentPage.getByRole('button', { name: 'Send report', exact: true }).click();
      await expect(studentPage.getByText('Report sent. You can follow its status in My Progress.')).toBeVisible();
    });

    await test.step('Needs attention on the dashboard leads to the report on To review', async () => {
      // the dashboard loaded before the report was sent: open it afresh
      await professorPage.reload();
      await openTab(professorPage, 'Analytics');
      // the dashboard only counts reports; the list itself is on To review
      await expect(professorPage.getByRole('heading', { name: /^Open student reports/ })).toHaveCount(0);
      await professorPage.getByRole('button', { name: /^\d+ open student reports?$/ }).click();
      await expect(professorPage.getByRole('heading', { name: 'To review', exact: true })).toBeVisible();
      await expect(professorPage.getByRole('heading', { name: /^Open student reports \(\d+\)$/ })).toBeVisible();
      const mine = professorPage.getByRole('listitem').filter({ hasText: reason });
      await expect(mine).toBeVisible();
      // the category the student picked, and no student name or email
      await expect(mine.getByText('Typo or formatting problem')).toBeVisible();
      await expect(mine).not.toContainText('class not recorded');
      await expect(mine).not.toContainText(email);
      await expect(mine).not.toContainText('Review Report Student');
    });

    await test.step('another class does not list it, but points to it', async () => {
      // the student is in Group A: Group C's list doesn't have the report...
      await professorPage.getByLabel('Class', { exact: true }).selectOption({ label: 'Computing - Tutorial Group C' });
      await expect(professorPage.getByRole('heading', { name: 'To review', exact: true })).toBeVisible();
      await expect(professorPage.getByRole('listitem').filter({ hasText: reason })).toHaveCount(0);
      // ...and says Group A has open reports; following that comes back to it
      await professorPage.getByRole('button', { name: /^Computing - Tutorial Group A \(\d+\)$/ }).click();
      await expect(professorPage.getByLabel('Class', { exact: true })).toHaveValue('cl-a');
      await expect(professorPage.getByRole('listitem').filter({ hasText: reason })).toBeVisible();
    });

    await test.step('professor resolves it in place', async () => {
      const mine = professorPage.getByRole('listitem').filter({ hasText: reason });
      await mine.getByLabel('Your response (optional, the student sees it)').fill(response);
      await mine.getByRole('button', { name: 'Mark resolved', exact: true }).click();
      await expect(professorPage.getByText('Report resolved. The student can see the status in My Progress.', { exact: true })).toBeVisible();
      // it leaves the list straight away, and the page stays where it is
      await expect(professorPage.getByRole('listitem').filter({ hasText: reason })).toHaveCount(0);
      await expect(professorPage.getByRole('heading', { name: 'To review', exact: true })).toBeVisible();
    });

    await test.step('student sees the reply', async () => {
      await studentPage.bringToFront();
      await openTab(studentPage, 'My Progress');
      await studentPage.getByRole('button', { name: 'Refresh progress', exact: true }).click();
      await studentPage.getByLabel('Report status', { exact: true }).selectOption('resolved');
      const theirs = studentPage.locator('.pg-report').filter({ hasText: reason });
      await expect(theirs.getByText(response, { exact: false })).toBeVisible();
    });
  } finally {
    await Promise.all([studentContext.close(), professorContext.close()]);
  }
});
