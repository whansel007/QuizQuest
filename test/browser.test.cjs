const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { start } = require('../server');
let srv, browser, base;
test.before(async () => {
  // DIST_DIR lets parallel builds test their own output (default: dist/)
  srv = start(0, { dataFile: null, distDir: process.env.DIST_DIR ? require('path').resolve(process.env.DIST_DIR) : undefined });
  await new Promise((r) => srv.httpServer.once('listening', r));
  base = `http://localhost:${srv.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
});
test.after(async () => { await browser?.close(); srv?.io.close(); });
async function pageFor(t, name, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], 'no unhandled browser errors'); });
  await page.goto(base);
  await page.getByRole('button', { name, exact: false }).click();
  await page.getByRole('button', { name: 'Switch user', exact: true }).waitFor();
  return page;
}
test('switching professors refreshes course data and visits every teacher view', async (t) => {
  const page = await pageFor(t, 'Prof. Demo A');
  await page.getByRole('heading', { name: 'Question bank', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Switch user' }).click();
  await page.getByRole('button', { name: 'Prof. Demo B' }).click();
  for (const name of ['Question bank', 'Source material', 'AI drafting', 'Analytics', 'Evaluation', 'Settings']) {
    await page.locator('#tabs').getByRole('button', { name, exact: true }).click();
    await page.locator('main h2').waitFor();
    assert.equal(await page.locator('main').getByText('Not found.', { exact: true }).count(), 0);
  }
  assert.ok(!(await page.locator('main').innerText()).includes('You have no assigned courses'));
});
test('a delayed start cannot replace Pets after navigation', async (t) => {
  const page = await pageFor(t, 'Student 01');
  await page.getByRole('button', { name: 'Start practice' }).waitFor();
  let release, started;
  const held = new Promise((r) => { release = r; });
  const seen = new Promise((r) => { started = r; });
  await page.route('**/api/student/sessions', async (route) => { started(); await held; await route.continue(); });
  await page.getByRole('button', { name: 'Start practice' }).click();
  await seen;
  await page.locator('#tabs').getByRole('button', { name: 'Pets & shop' }).click();
  await page.getByRole('heading', { name: 'Pets & shop' }).waitFor();
  release();
  await page.waitForResponse((r) => r.url().endsWith('/api/student/sessions'));
  await page.waitForTimeout(100);
  assert.equal(await page.getByRole('heading', { name: 'Pets & shop' }).count(), 1);
  assert.equal(await page.locator('.quiz-head').count(), 0);
});
test('practice Next recovers from a failed request and the session finishes', async (t) => {
  const page = await pageFor(t, 'Student 01');
  await page.getByLabel('Length', { exact: true }).selectOption('5');
  await page.getByRole('button', { name: 'Start practice' }).click();
  for (let i = 0; i < 5; i++) {
    await page.locator('.quiz-head').waitFor();
    const choices = page.locator('.options button');
    if (await choices.count()) {
      await choices.first().click();
      if (await page.getByRole('button', { name: 'Submit answer' }).count()) await page.getByRole('button', { name: 'Submit answer' }).click();
    } else if (await page.getByLabel('Numeric answer').count()) {
      await page.getByLabel('Numeric answer').fill('42');
      await page.getByRole('button', { name: 'Submit answer' }).click();
    } else {
      await page.getByLabel('Written answer').fill('My practice answer.');
      await page.getByRole('button', { name: 'Submit answer' }).click();
    }
    const next = page.getByRole('button', { name: /Next question|See results/ });
    await next.waitFor();
    if (i === 0) {
      await page.route(/\/api\/student\/sessions\/ses-[\w-]+$/, (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Temporary outage"}' }), { times: 1 });
      await next.click();
      await page.getByText('Temporary outage', { exact: true }).waitFor();
      assert.equal(await next.isEnabled(), true);
    }
    await next.click();
    if (i < 4) await page.getByText(`Question ${i + 2} of 5`, { exact: false }).waitFor();
  }
  await page.getByRole('button', { name: 'Back to practice' }).waitFor();
});
test('login network errors show a retry button', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route('**/api/demo-users', (r) => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Unavailable"}' }), { times: 1 });
  await page.goto(base);
  await page.getByRole('button', { name: 'Retry sign-in' }).click();
  await page.getByRole('button', { name: 'Student 01' }).waitFor();
});

test('refreshing a timed quiz offers resume without resetting the server deadline', async (t) => {
  const page = await pageFor(t, 'Student 01');
  await page.getByLabel('Timer', { exact: true }).selectOption('30');
  const created = page.waitForResponse((r) => r.url().endsWith('/api/student/sessions') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Start practice' }).click();
  const sid = (await (await created).json()).id;
  await page.locator('.quiz-head').waitFor();
  const s = srv.quiz.db.sessions.find((s) => s.id === sid);
  const served = s.items[0].servedAt;
  await page.reload();
  await page.getByRole('button', { name: 'Resume practice' }).click();
  await page.locator('.quiz-head').waitFor();
  assert.equal(s.items[0].servedAt, served);
  assert.equal(s.timerSec, 30);
});
test('student and teacher screens fit 320px and 390px viewports', async (t) => {
  const page = await pageFor(t, 'Student 02', { width: 320, height: 800 });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const name of ['Practice', 'World', 'Kingdom', 'Pets & shop']) {
      await page.locator('#tabs').getByRole('button', { name, exact: true }).click();
      await page.getByRole('heading', { name, exact: true }).waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${name} overflows ${width}px by ${overflow}px`);
      if (process.env.QA_SCREENSHOTS && width === 320) await page.screenshot({ path: require('node:path').join(process.env.QA_SCREENSHOTS, name.replace(/\W+/g, '-') + '.png'), fullPage: true });
    }
  }
  await page.getByRole('button', { name: 'Switch user' }).click();
  await page.getByRole('button', { name: 'Prof. Demo A' }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  for (const name of ['Question bank', 'Source material', 'AI drafting', 'Analytics', 'Evaluation', 'Settings']) {
    await page.locator('#tabs').getByRole('button', { name, exact: true }).click();
    await page.locator('main h2').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `${name} overflows by ${overflow}px`);
  }
});

test('an answer accepted before a lost response can be retried exactly once', async (t) => {
  const page = await pageFor(t, 'Student 01');
  await page.getByRole('button', { name: 'Start practice' }).click();
  await page.locator('.quiz-head').waitFor();
  let submitted;
  await page.route('**/answer', async (route) => {
    submitted = route.request().postDataJSON();
    await route.fetch(); // server committed; pretend the response was lost
    await route.abort();
  }, { times: 1 });
  if (await page.locator('.options button').count()) {
    await page.locator('.options button').first().click();
    if (await page.getByRole('button', { name: 'Submit answer' }).count()) await page.getByRole('button', { name: 'Submit answer' }).click();
  } else {
    const input = page.getByLabel('Numeric answer');
    if (await input.count()) await input.fill('42');
    else await page.getByLabel('Written answer').fill('My practice answer.');
    await page.getByRole('button', { name: 'Submit answer' }).click();
  }
  await page.getByRole('button', { name: 'Retry answer' }).waitFor();
  const count = srv.quiz.db.attempts.length;
  const response = page.waitForResponse((r) => r.url().endsWith('/answer'));
  await page.getByRole('button', { name: 'Retry answer' }).click();
  const r = await response;
  assert.deepEqual(r.request().postDataJSON(), submitted);
  assert.equal((await r.json()).duplicate, true);
  assert.equal(srv.quiz.db.attempts.length, count);
  await page.getByRole('button', { name: /Next question|See results/ }).waitFor();
});

test('an egg purchase with a lost response reuses its purchase key', async (t) => {
  const page = await pageFor(t, 'Student 02');
  srv.quiz.db.ledger.push({ id: 'test-funds', studentId: 's-02', amount: 200, kind: 'refund', refKey: 'test-funds', at: Date.now() });
  await page.locator('#tabs').getByRole('button', { name: 'Pets & shop' }).click();
  const open = page.getByRole('button', { name: 'Open an egg' });
  await open.waitFor();
  let body;
  await page.route('**/shop/egg', async (route) => {
    body = route.request().postDataJSON();
    await route.fetch();
    await route.abort();
  }, { times: 1 });
  await open.click();
  await page.locator('#toast.bad').waitFor();
  const spent = srv.quiz.db.ledger.filter((r) => r.refKey?.startsWith('egg:s-02:') && r.kind === 'spend').length;
  const response = page.waitForResponse((r) => r.url().endsWith('/shop/egg'));
  await open.click();
  const r = await response;
  assert.deepEqual(r.request().postDataJSON(), body);
  assert.equal((await r.json()).repeat, true);
  assert.equal(srv.quiz.db.ledger.filter((r) => r.refKey?.startsWith('egg:s-02:') && r.kind === 'spend').length, spent);
});

test('kingdom builds drop new blocks in place and the egg reveal hands over the pet', async (t) => {
  const page = await pageFor(t, 'Student 03');
  const R = require('../src/quiz/rewards');
  R.inventory(srv.quiz.db, 's-03').resources = { wood: 40, crystal: 40, herb: 40 };
  await page.locator('#tabs').getByRole('button', { name: 'Kingdom' }).click();
  const scene = page.getByRole('img', { name: /Your kingdom: castle level 0/ });
  await scene.waitFor();
  await page.getByRole('button', { name: /^Build: / }).first().hover();
  assert.ok(await page.locator('.iso .vx.ghost').count() > 0, 'hovering Build previews ghost blocks');
  await page.getByRole('button', { name: /^Build: / }).first().click();
  await page.getByRole('img', { name: /Library level 1/ }).waitFor();
  assert.ok(await page.locator('.iso .vx.drop').count() > 0, 'new blocks drop in without remounting the view');
  assert.equal(await page.locator('.tile .v').first().innerText(), '🪵 35');

  srv.quiz.db.ledger.push({ id: 'test-funds-3', studentId: 's-03', amount: 100, kind: 'refund', refKey: 'test-funds-3', at: Date.now() });
  const draw = R.drawPet;
  R.drawPet = () => R.PETS.find((p) => p.id === 'owl');
  t.after(() => { R.drawPet = draw; });
  await page.locator('#tabs').getByRole('button', { name: 'Pets & shop' }).click();
  await page.getByRole('button', { name: /Open an egg/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.click(); // skip the wobble
  await dialog.getByRole('heading', { name: /Owl/ }).waitFor();
  await dialog.getByRole('button', { name: 'Equip Owl' }).click();
  await dialog.waitFor({ state: 'detached' });
  await page.locator('.pet-card.equipped', { hasText: 'Owl' }).waitFor();
  await page.getByRole('cell', { name: 'Opened an egg' }).waitFor();
});

test('PDF upload extracts text locally and saves reviewed source material', async (t) => {
  const page = await pageFor(t, 'Prof. Demo A');
  await page.locator('#tabs').getByRole('button', { name: 'Source material' }).click();
  // Small valid PDF fixture assembled in memory (no external tool or service).
  const text = 'Network latency is the time required for a packet to reach its destination.';
  const stream = `BT /F1 12 Tf 40 750 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n', offsets = [0];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => String(n).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  await page.locator('input[type=file][accept="application/pdf"]').setInputFiles({ name: 'network-test.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
  await page.getByRole('button', { name: 'Add selected pages' }).click();
  assert.ok((await page.getByLabel('Text', { exact: true }).inputValue()).includes(text));
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('checkbox', { name: /I confirm/ }).check();
  await page.getByRole('button', { name: 'Save passage' }).click();
  await page.getByText('Passage saved', { exact: true }).waitFor();
  assert.ok(srv.quiz.db.passages.some((p) => p.title === 'network-test' && p.text.includes(text)));
});

test('dashboard: period filter, question detail, and a jump to the Question bank', async (t) => {
  const page = await pageFor(t, 'Prof. Demo A');
  await page.locator('#tabs').getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByRole('heading', { name: 'Needs attention' }).waitFor();
  await page.getByRole('img', { name: /Accuracy by topic per week/ }).waitFor();
  // the period filter refetches and the charts switch to days
  await page.getByLabel('Period').selectOption('7d');
  await page.getByRole('img', { name: /Accuracy by topic per day/ }).waitFor();
  // long lists are paged, 10 per page. The total depends on what earlier
  // tests answered (they share the server), so read it from the pager.
  const timePager = page.getByRole('navigation', { name: 'Time and accuracy pages' });
  const count = timePager.getByText(/^Showing \d+–\d+ of \d+ questions$/);
  const total = Number((await count.innerText()).match(/of (\d+)/)[1]);
  assert.ok(total > 10, 'more than one page');
  assert.equal(await count.innerText(), `Showing 1–10 of ${total} questions`);
  assert.equal(await page.locator('#dash-time tbody tr').count(), 10);
  const lastPage = Math.ceil(total / 10);
  await timePager.getByRole('button', { name: `Page ${lastPage}`, exact: true }).click();
  await timePager.getByText(`Showing ${(lastPage - 1) * 10 + 1}–${total} of ${total} questions`).waitFor();
  assert.equal(await page.locator('#dash-time tbody tr').count(), total - (lastPage - 1) * 10);
  assert.equal(await timePager.getByRole('button', { name: 'Next page' }).isDisabled(), true);
  // learning outcomes open under a topic
  await page.getByRole('button', { name: 'Show learning outcomes for Data representation' }).click();
  await page.getByText('Convert between binary, decimal and hexadecimal', { exact: true }).waitFor();
  // question detail opens in a dialog with the answer breakdown
  await page.getByRole('button', { name: /sharp picture but responses feel delayed/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText('✓ correct answer').waitFor();
  assert.equal(await dialog.getByText(/Student \d/).count(), 0, 'no student names');
  await dialog.getByRole('button', { name: 'Open in Question bank' }).click();
  await page.getByRole('heading', { name: 'Question bank', exact: true }).waitFor();
  await page.locator('#qcard-q-n2.flash').waitFor();
  assert.equal(await page.getByRole('button', { name: /^Published/ }).getAttribute('aria-pressed'), 'true');
  // custom dates, section links, and the period is remembered after a reload
  await page.locator('#tabs').getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByLabel('Period').selectOption('custom');
  await page.getByLabel('From', { exact: true }).fill('2026-01-01');
  await page.getByLabel('To', { exact: true }).fill('2026-01-05');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByText('No answers in 1 Jan 2026 to 5 Jan 2026', { exact: false }).waitFor();
  await page.getByRole('navigation', { name: 'Dashboard sections' }).getByRole('button', { name: 'Quality' }).click();
  await page.getByRole('heading', { name: 'Question quality' }).waitFor();
  await page.reload();
  await page.locator('#tabs').getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByRole('heading', { name: 'Needs attention' }).waitFor();
  assert.equal(await page.getByLabel('Period').inputValue(), 'custom');
});

test('dashboard: marking keeps the page in place, background refreshes keep the charts, and a failed refresh says so', async (t) => {
  // six free-response answers waiting for a mark (the demo data has none)
  const db = srv.quiz.db;
  const ids = Array.from({ length: 6 }, (_, i) => `at-mark-${i}`);
  ids.forEach((id, i) => db.attempts.push({ id, sessionId: null, studentId: `s-0${i + 1}`, classId: 'cl-a', courseId: 'c-comp', questionId: 'q-x3', version: 1, topicId: 'tp-net', type: 'short', text: `marking answer ${i}`, correct: false, score: 0, ms: 20000, timedOut: false, first: true, context: 'practice', at: Date.now() - 1000 * (i + 1), needsReview: true }));
  t.after(() => { for (const id of ids) db.attempts.splice(db.attempts.findIndex((a) => a.id === id), 1); });

  const page = await pageFor(t, 'Prof. Demo A');
  await page.locator('#tabs').getByRole('button', { name: 'Analytics', exact: true }).click();
  // earlier tests may have left short answers of their own waiting
  const pending = () => db.attempts.filter((a) => a.classId === 'cl-a' && a.needsReview).length;
  const n = pending();
  await page.getByRole('heading', { name: `Answers to mark (${n})` }).waitFor();
  await page.getByRole('button', { name: 'Show learning outcomes for Data representation' }).click();
  const outcome = page.getByText('Convert between binary, decimal and hexadecimal', { exact: true });
  await outcome.waitFor();
  const line = await page.locator('#dash-trends path.line').first().elementHandle();

  // marking removes the answer in place: no reload, the open topic stays open
  const marking = page.locator('#dash-marking');
  await marking.getByRole('button', { name: 'Mark not correct' }).first().click();
  await page.getByRole('heading', { name: `Answers to mark (${n - 1})` }).waitFor();
  assert.equal(await outcome.isVisible(), true, 'open topic survives marking');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), `Answers to mark (${n - 1})`);
  // the background refresh changed "awaiting marking", so that tile glows; the charts were not redrawn
  await page.locator('.tile.pulse').filter({ hasText: 'awaiting marking' }).waitFor();
  assert.equal(await line.evaluate((e) => e.isConnected), true, 'background refresh keeps the chart');

  // a failed background refresh is reported, and "Try now" recovers
  await page.route('**/analytics?**', (r) => r.abort());
  await marking.getByRole('button', { name: 'Mark not correct' }).first().click();
  const stale = page.getByRole('status').filter({ hasText: "Couldn't refresh" });
  await stale.waitFor();
  await page.unroute('**/analytics?**');
  await stale.getByRole('button', { name: 'Try now' }).click();
  await stale.waitFor({ state: 'detached' });
  assert.equal(ids.filter((id) => db.attempts.find((a) => a.id === id).needsReview).length, 4);

  // a new period redraws the charts
  await page.getByLabel('Period').selectOption('30d');
  await page.waitForFunction((e) => !e.isConnected, line);
});

test('dashboard: printing shows every row and open topic, and charts are one tab stop each', async (t) => {
  const page = await pageFor(t, 'Prof. Demo A');
  await page.locator('#tabs').getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByRole('heading', { name: 'Needs attention' }).waitFor();
  await Promise.all([page.waitForResponse(/analytics\?range=all/), page.getByLabel('Period').selectOption('all')]);
  await page.locator('.refetching').waitFor({ state: 'detached' }); // the all-time numbers are on screen
  const timePager = page.getByRole('navigation', { name: 'Time and accuracy pages' });
  const total = Number((await timePager.getByText(/^Showing/).innerText()).match(/of (\d+)/)[1]);
  const outcome = page.getByText('Convert between binary, decimal and hexadecimal', { exact: true });
  assert.equal(await outcome.count(), 0, 'topics start closed');
  // paper can't turn pages: everything is listed while printing, then back
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await outcome.waitFor();
  assert.equal(await page.locator('#dash-time tbody tr').count(), total);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await outcome.waitFor({ state: 'detached' });
  assert.equal(await page.locator('#dash-time tbody tr').count(), 10);

  // keyboard: Tab lands on the chart once, arrows move, Enter opens the question
  const scatter = page.getByRole('img', { name: /Average time against accuracy/ });
  await scatter.focus();
  const tip = page.locator('#dash-time .viz-tip');
  await tip.waitFor();
  const first = await tip.locator('.t').innerText();
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await tip.locator('.t').innerText(), first, 'moved to the next dot');
  const shown = await tip.locator('.t').innerText();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').getByText(shown, { exact: false }).first().waitFor();
  await page.keyboard.press('Escape');
  // the heatmap is one stop too
  const heat = page.getByRole('img', { name: /Answers by day and time/ });
  await heat.focus();
  await page.getByText(/^Mon 00:00–03:00: \d+ answers$/).waitFor();
  await page.keyboard.press('ArrowDown');
  await page.getByText(/^Tue 00:00–03:00: \d+ answers$/).waitFor();
  assert.equal(await page.locator('.heat-cell[tabindex], .viz .hit[tabindex]').count(), 0, 'no per-point tab stops');
});

test('dashboard: a refused or failed period never locks the page, marks already made stand, and names stay off paper', async (t) => {
  const db = srv.quiz.db;
  const ids = ['at-race-0', 'at-race-1'];
  ids.forEach((id, i) => db.attempts.push({ id, sessionId: null, studentId: `s-0${i + 1}`, classId: 'cl-a', courseId: 'c-comp', questionId: 'q-x3', version: 1, topicId: 'tp-net', type: 'short', text: `race answer ${i}`, correct: false, score: 0, ms: 20000, timedOut: false, first: true, context: 'practice', at: Date.now() - 1000 * (i + 1), needsReview: true }));
  const setting = (participationEnabled) => page.evaluate((on) => fetch('/api/teacher/classes/cl-a/settings', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + sessionStorage.getItem('qq-token') }, body: JSON.stringify({ participationEnabled: on }) }), participationEnabled);
  t.after(async () => {
    for (const id of ids) db.attempts.splice(db.attempts.findIndex((a) => a.id === id), 1);
    await setting(false);
  });

  const page = await pageFor(t, 'Prof. Demo A');
  await setting(true);
  // a custom range the server would refuse (over 366 days), saved by an older version, is ignored
  await page.evaluate(() => localStorage.setItem('qq-dashboard', JSON.stringify({ range: 'custom', from: '2024-01-01', to: '2026-01-01' })));
  await page.reload();
  // ...and if the first load fails anyway, the page offers a way out
  await page.route('**/analytics?**', (r) => r.abort());
  await page.locator('#tabs').getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByRole('button', { name: 'Try again' }).waitFor();
  assert.equal(await page.getByLabel('Period').count(), 0);
  await page.unroute('**/analytics?**');
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByRole('heading', { name: 'Needs attention' }).waitFor();
  assert.equal(await page.getByLabel('Period').inputValue(), '30d');
  // too long a custom range is caught before it is sent or saved
  await page.getByLabel('Period').selectOption('custom');
  await page.getByLabel('From', { exact: true }).fill('2023-01-01');
  await page.getByLabel('To', { exact: true }).fill('2025-01-01');
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByText('Pick at most 366 days.').waitFor();
  assert.notEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('qq-dashboard'))).from, '2023-01-01', 'not saved');

  // a co-teacher marked this one while the list was open: their mark stands
  const item = page.locator('.marking-item').filter({ hasText: 'race answer 0' });
  await item.waitFor();
  const raced = db.attempts.find((a) => a.id === 'at-race-0');
  Object.assign(raced, { needsReview: false, correct: true, score: 1 });
  await item.getByRole('button', { name: 'Mark not correct' }).click();
  await page.getByText('Someone else already marked this answer, so their mark stands.').waitFor();
  await item.waitFor({ state: 'detached' });
  assert.equal(raced.correct, true);

  // participation points (they name students) print only when asked
  const panel = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Participation points' }) });
  await panel.waitFor();
  await page.emulateMedia({ media: 'print' });
  assert.equal(await panel.isVisible(), false);
  assert.equal(await page.getByText('Participation points are left out of this report').isVisible(), true);
  await page.emulateMedia({ media: 'screen' });
  await panel.getByLabel(/Include in printed report/).check();
  await page.emulateMedia({ media: 'print' });
  assert.equal(await panel.isVisible(), true);
});
