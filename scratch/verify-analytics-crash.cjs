// Adversarial check: is Analytics blank because of the ZONES[q.zone] crash?
const playwright = require('playwright');
const { start } = require('../server');
const { unlockTestAccounts } = require('../test/support/accounts.cjs');

(async () => {
  const srv = start(0, { dataFile: null });
  await new Promise((r) => srv.httpServer.once('listening', r));
  const base = `http://localhost:${srv.httpServer.address().port}`;
  const db = srv.quiz.db;
  const ids = Array.from({ length: 6 }, (_, i) => `vrf-${i}`);
  ids.forEach((id, i) => db.attempts.push({ id, sessionId: null, studentId: `s-0${i + 1}`, classId: 'cl-a', courseId: 'c-comp', questionId: 'q-x3', version: 1, topicId: 'tp-net', type: 'short', text: `marking answer ${i}`, correct: false, score: 0, ms: 20000, timedOut: false, first: true, context: 'practice', at: Date.now() - 1000 * (i + 1), needsReview: true }));

  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-SG' });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()); });
  const resp = [];
  page.on('response', (r) => { if (/\/(analytics|marking)/.test(r.url())) resp.push(r.status() + ' ' + r.url().replace(base, '')); });

  await page.goto(base);
  await unlockTestAccounts(page);
  await page.getByRole('button', { name: 'Prof. Demo A', exact: false }).click();
  await page.getByRole('button', { name: 'Switch user', exact: true }).waitFor();
  await page.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();
  await page.locator('#tabs').getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.waitForTimeout(4000);

  const dom = await page.evaluate(() => ({
    heads: [...document.querySelectorAll('h1,h2,h3,h4')].map((e) => e.tagName + ':' + e.textContent.trim().slice(0, 40)),
    marking: document.querySelectorAll('#dash-marking').length,
    dashTime: document.querySelectorAll('#dash-time').length,
    bodyTail: document.body.innerText.slice(-260).replace(/\s+/g, ' '),
  }));
  console.log('RESPONSES:', resp);
  console.log('ERRORS:', errs);
  console.log('DOM:', JSON.stringify(dom, null, 1));
  await browser.close();
  srv.io.close();
  process.exit(0);
})();