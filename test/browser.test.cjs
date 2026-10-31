const test = require('node:test');
const assert = require('node:assert/strict');
const playwright = require('playwright');
const { start } = require('../server');
let srv, browser, base;
test.before(async () => {
  // DIST_DIR lets parallel builds test their own output (default: dist/)
  srv = start(0, { dataFile: null, distDir: process.env.DIST_DIR ? require('path').resolve(process.env.DIST_DIR) : undefined });
  await new Promise((r) => srv.httpServer.once('listening', r));
  base = `http://localhost:${srv.httpServer.address().port}`;
  // BROWSER=webkit|firefox runs the same tests in another engine (default chromium);
  // BROWSER_CHANNEL=msedge|chrome uses an installed Chromium-based browser instead
  const engine = playwright[process.env.BROWSER || 'chromium'];
  if (!engine) throw new Error(`Unknown BROWSER ${process.env.BROWSER}: use chromium, firefox or webkit`);
  browser = await engine.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
});
test.after(async () => { await browser?.close(); srv?.io.close(); });
async function pageFor(t, name, viewport = { width: 1280, height: 900 }, options = {}) {
  // a Singapore locale everywhere, so dates read the same in every engine
  const page = await browser.newPage({ viewport, locale: 'en-SG', ...options });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], 'no unhandled browser errors'); });
  // Open the hidden demo account picker through Tools + Konami code.
  await page.goto(base);
  await unlockTestAccounts(page);
  await page.getByRole('button', { name, exact: false }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).waitFor();
  if (name.startsWith('Prof.')) await page.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();
  else await openStudentTab(page, 'Practice'); // students land in their Kingdom
  return page;
}
// The Kingdom is immersive, so the student menu is tucked away: focusing a
// tab brings it down (as it does for keyboard users), then it can be clicked.
async function openStudentTab(page, name) {
  const tab = page.locator('#tabs').getByRole('button', { name, exact: true });
  await tab.focus();
  await tab.click();
}

test('student reports survive a failed submission and show a professor response in My Progress', async (t) => {
  const page = await pageFor(t, 'Student 01');
  await page.getByRole('button', { name: 'Start practice', exact: true }).click();
  await page.locator('.quiz-head').waitFor();
  const choices = page.locator('.options button');
  if (await choices.count()) {
    await choices.first().click();
    if (await page.getByRole('button', { name: 'Submit answer' }).count()) await page.getByRole('button', { name: 'Submit answer' }).click();
  } else {
    if (await page.getByLabel('Numeric answer').count()) await page.getByLabel('Numeric answer').fill('42');
    else await page.getByLabel('Written answer').fill('My practice answer.');
    await page.getByRole('button', { name: 'Submit answer' }).click();
  }
  await page.getByRole('button', { name: 'Report a problem', exact: true }).click();
  await page.getByLabel('Problem category').selectOption('ambiguous');
  const reason = 'Browser workflow: the wording could be clearer.';
  await page.getByLabel('Report this question to your professor').fill(reason);
  await page.route('**/api/student/questions/*/report', (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"Please retry this report."}',
  }), { times: 1 });
  await page.getByRole('button', { name: 'Send report', exact: true }).click();
  await page.getByRole('alert').getByText('Please retry this report.').waitFor();
  assert.equal(await page.getByLabel('Report this question to your professor').inputValue(), reason);
  await page.getByRole('button', { name: 'Send report', exact: true }).click();
  await page.getByText(/Report sent\. You can follow/).waitFor();
  await page.locator('#tabs').getByRole('button', { name: 'My Progress', exact: true }).click();
  await page.getByRole('heading', { name: 'My Progress', exact: true }).waitFor();
  await page.getByText(reason, { exact: false }).waitFor();

  const professor = await pageFor(t, 'Prof. Demo A');
  await professor.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();
  await professor.getByRole('button', { name: /^Reported \(/ }).click();
  const report = professor.locator('.qcard .note').filter({ hasText: reason });
  await report.getByLabel('Professor response (optional, visible to the student)').fill('I checked the notes and clarified the question.');
  await report.getByRole('button', { name: 'Mark resolved', exact: true }).click();
  await professor.getByText('Report resolved. The student can see the status in My Progress.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Refresh progress', exact: true }).click();
  await page.getByLabel('Report status', { exact: true }).selectOption('resolved');
  await page.getByText('I checked the notes and clarified the question.', { exact: false }).waitFor();
  if (process.env.QA_SCREENSHOTS) await page.screenshot({ path: require('node:path').join(process.env.QA_SCREENSHOTS, 'Progress-desktop.png'), fullPage: true });
});

test('My Progress handles empty history, a failed load and narrow screens', async (t) => {
  const page = await pageFor(t, 'Student 12', { width: 390, height: 844 });
  await page.route('**/api/student/classes/*/reports', (route) => route.fulfill({
    status: 503, contentType: 'application/json', body: '{"error":"Progress temporarily unavailable."}',
  }), { times: 1 });
  await page.locator('#tabs').getByRole('button', { name: 'My Progress', exact: true }).click();
  await page.getByRole('alert').waitFor();
  await page.getByRole('button', { name: 'Refresh progress', exact: true }).click();
  await page.getByText('No completed practice sessions yet.', { exact: true }).waitFor();
  await page.getByText('You have not reported any questions in this class.', { exact: true }).waitFor();
  assert.equal(await page.getByText('Not practised yet', { exact: true }).count(), 3);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  if (process.env.QA_SCREENSHOTS) await page.screenshot({ path: require('node:path').join(process.env.QA_SCREENSHOTS, 'Progress-empty-mobile.png'), fullPage: true });
});
async function unlockTestAccounts(page) {
  await page.getByRole('button', { name: 'Tools and version' }).click();
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter']) {
    await page.keyboard.press(key);
  }
  await page.getByRole('heading', { name: 'Test accounts' }).waitFor();
}
test('switching professors refreshes course data and visits every teacher view', async (t) => {
  const page = await pageFor(t, 'Prof. Demo A');
  await page.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();
  await page.getByRole('heading', { name: 'Question bank', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await unlockTestAccounts(page); // the demo accounts are hidden again after signing out
  await page.getByRole('button', { name: 'Prof. Demo B' }).click();
  for (const name of ['Question bank', 'AI drafting', 'Analytics', 'Evaluation', 'Settings']) {
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
  await page.locator('#tabs').getByRole('button', { name: 'Summon' }).click();
  // the tab is still "Summon" but the view it opens is Hero Summon
  await page.getByRole('heading', { name: 'Hero Summon', exact: true }).waitFor();
  release();
  await page.waitForResponse((r) => r.url().endsWith('/api/student/sessions'));
  await page.waitForTimeout(100);
  assert.equal(await page.getByRole('heading', { name: 'Hero Summon', exact: true }).count(), 1);
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
test('signing in with email and password', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.goto(base);
  // step 1: email (checked in the browser before moving on)
  await page.getByLabel('Email', { exact: true }).fill('not-an-email');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('alert').getByText("That doesn't look like an email address.").waitFor();
  await page.getByLabel('Email', { exact: true }).fill('prof.a@quizquest.demo');
  await page.getByLabel('Email', { exact: true }).press('Enter');
  // step 2: password, with the email shown on a chip
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('wrong-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  assert.equal(await password.getAttribute('type'), 'text', 'the password can be shown');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('alert').getByText('Email or password is incorrect.').waitFor();
  assert.equal(await password.inputValue(), '', 'a failed attempt clears the password');
  // "Change" goes back to the email step, keeping the email
  await page.getByRole('button', { name: 'Change email (prof.a@quizquest.demo)' }).click();
  assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), 'prof.a@quizquest.demo');
  await page.getByRole('button', { name: 'Continue' }).click();
  await password.fill('quizquest');
  await password.press('Enter');
  // professors land on Classes & Roster
  await page.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();
  await page.getByRole('heading', { name: 'Question bank', exact: true }).waitFor();
});
test('the sign-up form does not steal the focus from the field being typed in', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.goto(base);
  // Slow the slide right down, so the focus lands while the card is still
  // moving in and the app still has its eye on the name field.
  await page.addStyleTag({ content: '.qq-step-enter-active { transition-duration: 2s !important; }' });
  await page.getByRole('button', { name: 'Create a student account' }).click();
  const name = page.locator('#signup-name');
  const password = page.locator('#signup-password');
  await name.waitFor({ state: 'attached' });
  // The user starts typing in the password field before the card settles.
  await page.evaluate(() => document.querySelector('#signup-password').focus());
  await page.waitForTimeout(3000);
  assert.equal(
    await page.evaluate(() => document.activeElement.id),
    'signup-password',
    'the focus stays in the field the user is typing in',
  );
  await password.fill('longenough');
  assert.equal(await name.inputValue(), '', 'the password never lands in the name field');
});
test('the Konami debug menu exposes test accounts and fills the sign-in form', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.goto(base);
  assert.equal(await page.getByRole('button', { name: 'Test accounts' }).count(), 0, 'the account picker is not exposed in the normal sign-in view');
  await unlockTestAccounts(page);
  assert.ok(page.url().endsWith('#test-accounts'));
  await page.getByRole('button', { name: 'Fill the sign-in form with student03@quizquest.demo' }).click();
  await page.getByRole('button', { name: 'Change email (student03@quizquest.demo)' }).waitFor();
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('quizquest');
  await password.press('Enter');
  // students land in their Kingdom; signed in once the menu offers Log out
  await page.getByRole('button', { name: 'Log out', exact: true }).waitFor();
  await openStudentTab(page, 'Practice');
  await page.getByRole('region', { name: 'Practice setup', exact: true }).waitFor();
});
test('an unavailable API shows a useful error and the debug account list can be retried', async (t) => {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.route('**/api/demo-users', (r) => r.fulfill({ status: 500, contentType: 'text/plain', body: 'AggregateError ECONNREFUSED' }), { times: 1 });
  await page.goto(base);
  await page.getByRole('button', { name: 'Tools and version' }).click();
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter']) await page.keyboard.press(key);
  await page.getByText('The server could not reach the API. Check the API terminal, restart local development, and retry.').waitFor();
  await page.getByRole('button', { name: 'Retry loading demo accounts' }).click();
  await page.getByRole('button', { name: 'Student 01' }).waitFor();
});

test('hero lab picks a hero and hands off to the arena', async (t) => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  t.after(() => page.close());
  await page.goto(`${base}/hero-lab`);
  await page.getByRole('heading', { name: 'Choose your hero' }).waitFor();
  assert.deepEqual(errors, [], 'the picker loads its hero list without errors');
  // The picker offers each hero as a link into the arena, so the cards are
  // anchors, not buttons.
  const cards = page.locator('#hero-list a');
  await cards.first().waitFor();
  // The roster is the source of truth: the picker must offer every hero the
  // game ships. Reading it from the roster means a new hero cannot slip in
  // unnoticed and a removed one cannot linger in the picker.
  const { HEROES } = await import('../public/hero-lab/hero-list.js');
  assert.equal(await cards.count(), HEROES.length);
  for (const hero of HEROES) {
    assert.ok(await cards.filter({ hasText: hero.name }).count(), `${hero.name} is offered`);
  }
  await cards.filter({ hasText: 'Sheriff' }).click();
  await page.waitForURL(/\/hero-lab\/world\?heroId=sheriff/);
  const canvas = page.locator('canvas#world');
  await canvas.waitFor();
  assert.equal(await canvas.getAttribute('aria-label'), 'Hero Lab World game arena');
  // the arena picks up the hero it was handed, rather than booting blind
  await page.waitForFunction(() => document.querySelector('#hero-name')?.textContent?.includes('Sheriff'));
  assert.deepEqual(errors, [], 'the arena starts without errors');
});

test('Engineer E toggles turret placement and primary fire confirms it', async (t) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  t.after(() => page.close());
  await page.goto(`${base}/hero-lab/world?heroId=engineer`);
  await page.waitForFunction(() => document.querySelector('#hero-name')?.textContent?.includes('Engineer'));

  const room = srv.heroLab.rooms.peekDefaultRoom();
  const player = room.snapshot().players.find((candidate) => candidate.heroId === 'engineer');
  assert.ok(player, 'the arena has joined as Engineer');
  const canvas = page.locator('#world');
  const box = await canvas.boundingBox();
  const target = { x: player.x + 100, y: player.y };
  await page.mouse.move(box.x + target.x * box.width / 1920, box.y + target.y * box.height / 1080);
  const readRegion = () => page.evaluate(({ x, y }) => {
    const ctx = document.querySelector('#world').getContext('2d');
    return [...ctx.getImageData(Math.round(x) - 24, Math.round(y) - 20, 48, 40).data];
  }, target);
  await page.waitForTimeout(100);
  const before = await readRegion();
  await page.locator('.ability[data-ability="skill"]').click();
  const targetingHint = page.locator('#targeting-hint');
  await targetingHint.waitFor({ state: 'visible' });
  assert.match(await targetingHint.textContent(), /Primary fire to place/);
  await page.keyboard.press('e');
  await targetingHint.waitFor({ state: 'hidden' });
  assert.equal(room.snapshot().turrets.some((candidate) => candidate.ownerId === player.id), false,
    'pressing E again cancels without placing a turret');

  await page.keyboard.press('e');
  await targetingHint.waitFor({ state: 'visible' });
  await page.mouse.move(box.x + target.x * box.width / 1920, box.y + target.y * box.height / 1080);
  await page.mouse.click(box.x + target.x * box.width / 1920, box.y + target.y * box.height / 1080);

  const deadline = Date.now() + 2000;
  let turret;
  while (Date.now() < deadline) {
    turret = room.snapshot().turrets.find((candidate) => candidate.ownerId === player.id);
    if (turret) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert.ok(turret, 'primary fire confirms an owned turret at the cursor');
  await page.waitForTimeout(100);
  const after = await readRegion();
  const changedPixels = before.reduce((count, value, index) => count + (value !== after[index] ? 1 : 0), 0);
  assert.ok(changedPixels > 40, 'placing the turret changes pixels at its arena location');
  assert.deepEqual(errors, [], 'the Engineer arena has no browser errors');
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
  await openStudentTab(page, 'Practice'); // students land in their Kingdom
  await page.getByRole('button', { name: 'Resume practice' }).click();
  await page.locator('.quiz-head').waitFor();
  assert.equal(s.items[0].servedAt, served);
  assert.equal(s.timerSec, 30);
});
test('student and teacher screens fit 320px and 390px viewports', async (t) => {
  const page = await pageFor(t, 'Student 02', { width: 320, height: 800 });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    // each tab, and what shows its page has opened
    const pages = {
      Practice: () => page.getByRole('region', { name: 'Practice setup', exact: true }),
      'My Progress': () => page.getByRole('heading', { name: 'My Progress', exact: true }),
      World: () => page.getByRole('heading', { name: 'The Clearing', exact: true }),
      Kingdom: () => page.getByRole('heading', { name: /^Your Kingdom/ }),
      Summon: () => page.getByRole('heading', { name: 'Summon', exact: true }),
    };
    for (const [name, opened] of Object.entries(pages)) {
      await openStudentTab(page, name);
      await opened().waitFor();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${name} overflows ${width}px by ${overflow}px`);
      if (process.env.QA_SCREENSHOTS && width === 320) await page.screenshot({ path: require('node:path').join(process.env.QA_SCREENSHOTS, name.replace(/\W+/g, '-') + '.png'), fullPage: true });
    }
  }
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await unlockTestAccounts(page);
  await page.getByRole('button', { name: 'Prof. Demo A' }).click();
  await page.setViewportSize({ width: 320, height: 800 });
  for (const name of ['Question bank', 'AI drafting', 'Analytics', 'Evaluation', 'Settings']) {
    // on a phone the teacher menu is a drawer behind the menu button
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
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

test('a summon with a lost response reuses its purchase key', async (t) => {
  const page = await pageFor(t, 'Student 02');
  srv.quiz.db.ledger.push({ id: 'test-funds', studentId: 's-02', amount: 200, kind: 'refund', refKey: 'test-funds', at: Date.now() });
  await page.locator('#tabs').getByRole('button', { name: 'Summon' }).click();
  // the new x1 control carries its cost beneath the label
  const open = page.getByRole('button', { name: /^Summon ×1(?!0)/ });
  await open.waitFor();
  let body;
  await page.route('**/hero-summon', async (route) => {
    body = route.request().postDataJSON();
    await route.fetch();
    await route.abort();
  }, { times: 1 });
  await open.click();
  await page.locator('.summon-toast[role="alert"]').waitFor();
  const spent = srv.quiz.db.ledger.filter((r) => r.refKey?.startsWith('hero-summon:s-02:') && r.kind === 'spend').length;
  const response = page.waitForResponse((r) => r.url().endsWith('/hero-summon'));
  await open.click();
  const r = await response;
  assert.deepEqual(r.request().postDataJSON(), body);
  assert.equal((await r.json()).repeat, true);
  assert.equal(srv.quiz.db.ledger.filter((r) => r.refKey?.startsWith('hero-summon:s-02:') && r.kind === 'spend').length, spent);
});

test('kingdom builds drop new blocks in place and the summon reveal hands over the hero', async (t) => {
  const page = await pageFor(t, 'Student 03');
  const R = require('../src/quiz/rewards');
  R.inventory(srv.quiz.db, 's-03').resources = { wood: 40, crystal: 40, herb: 40 };
  await openStudentTab(page, 'Kingdom');
  // The town is a canvas, so this test goes after what the kingdom says and
  // does rather than how it is drawn: the Buildings list opens a building's
  // panel, and building it spends resources on the server.
  await page.getByRole('heading', { name: /^Your Kingdom/ }).waitFor();
  await page.getByRole('button', { name: 'Buildings', exact: true }).click();
  await page.locator('#town-building-list').getByRole('button', { name: /Library/ }).click();
  const panel = page.getByRole('dialog', { name: 'Library' });
  await panel.getByText(/Level 0 \//).waitFor();
  await panel.getByRole('button', { name: /^Build · / }).click();
  await panel.getByText(/Level 1 \//).waitFor();
  assert.ok(R.inventory(srv.quiz.db, 's-03').resources.wood < 40, 'building spends wood');
  await panel.getByRole('button', { name: 'Close', exact: true }).click();

  srv.quiz.db.ledger.push({ id: 'test-funds-3', studentId: 's-03', amount: 100, kind: 'refund', refKey: 'test-funds-3', at: Date.now() });
  // The Summon tab now summons heroes, not eggs: pin the pull to one hero.
  // 'bubbles' is not a starter (sheriff + electromancer are), so it is a real new hero.
  const draw = R.drawHeroSummon;
  R.drawHeroSummon = (pity) => ({
    prize: { kind: 'hero', rarity: 'epic', hero: R.HERO_CATALOG.find((h) => h.id === 'bubbles') },
    pity: { totalPulls: pity.totalPulls + 1, sinceHero: 0, sinceEpic: 0 },
  });
  t.after(() => { R.drawHeroSummon = draw; });
  await page.locator('#tabs').getByRole('button', { name: 'Summon' }).click();
  await page.getByRole('button', { name: /^Summon ×1(?!0)/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.click(); // skip the wobble
  await dialog.getByRole('heading', { name: /Bubbles/ }).waitFor();
  await dialog.getByText('New hero!', { exact: true }).waitFor();
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
  await dialog.waitFor({ state: 'detached' });
  // the pulled hero appears in the lazy-loaded summon journal
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByRole('heading', { name: 'Summon History' }).waitFor();
  await page.getByText('Bubbles', { exact: true }).first().waitFor();
  await page.getByText('NEW', { exact: true }).waitFor();
});

test('PDF upload extracts text locally and saves reviewed source material', async (t) => {
  const page = await pageFor(t, 'Prof. Demo A');
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting' }).click();
  await page.getByText('Material library · Notes, images & older files',{exact:true}).click();
  // This panel reads the file in the browser and saves a note. The upload
  // panel above is the one that uploads to the server, so the two must not
  // be mistaken for each other.
  await page.locator('b', { hasText: 'read in your browser' }).waitFor();
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

test('"Add material" creates a new topic with a typed learning outcome', async (t) => {
  const page = await pageFor(t, 'Prof. Demo A');
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting' }).click();
  await page.getByText('Material library · Notes, images & older files',{exact:true}).click();
  const panel = page.locator('.panel', { has: page.getByRole('heading', { name: 'Add notes or transcribe images', exact: true }) });
  await panel.getByLabel('Title').fill('Cloud notes');
  await panel.getByLabel('Topic', { exact: true }).selectOption({ label: '+ New topic…' });
  await panel.getByLabel('Week').fill('9');
  await panel.getByLabel('New topic name').fill('Cloud computing');
  await panel.getByLabel('Learning outcome for the new topic').fill('Explain what cloud computing offers');
  await panel.getByLabel('Text', { exact: true }).fill('Cloud computing rents computing resources over the internet.');
  await panel.getByRole('button', { name: 'Preview', exact: true }).click();
  await panel.getByRole('checkbox', { name: /I confirm/ }).check();
  await panel.getByRole('button', { name: 'Save passage' }).click();
  await page.getByText('Passage saved to the new topic Week 9 · Cloud computing').waitFor();
  const topic = srv.quiz.db.topics.find((x) => x.name === 'Cloud computing');
  // later tests share this server and expect the seeded weeks only
  t.after(() => {
    const { passages } = srv.quiz.db;
    for (let i = passages.length - 1; i >= 0; i--) if (passages[i].topicId === topic.id) passages.splice(i, 1);
    srv.quiz.db.topics.splice(srv.quiz.db.topics.indexOf(topic), 1);
    srv.quiz.services.save();
  });
  assert.equal(topic.week, 9);
  assert.deepEqual(topic.outcomes.map((o) => o.text), ['Explain what cloud computing offers']);
  assert.ok(srv.quiz.db.passages.some((p) => p.title === 'Cloud notes' && p.topicId === topic.id && p.outcomeId === topic.outcomes[0].id));
  // the new outcome is now offered in the list
  await page.getByText('Material library · Notes, images & older files',{exact:true}).click();
  await page.locator('.panel', { has: page.getByRole('heading', { name: 'Add notes or transcribe images', exact: true }) }).getByLabel('Learning outcome', { exact: true }).locator('option', { hasText: 'Explain what cloud computing offers' }).waitFor({ state: 'attached' });
});

test('the material library lists the files of a topic, not only its notes', async (t) => {
  const page = await pageFor(t, 'Prof. Demo A');
  // A lecture file uploaded for Week 2, the way the upload panel does it.
  const login = await (
    await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 't-a' }) })
  ).json();
  const auth = { 'content-type': 'application/json', authorization: 'Bearer ' + login.token };
  const upload = await fetch(base + '/api/teacher/courses/c-comp/import', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      topicId: 'tp-net', outcomeId: 'lo-net-1', confirmNoPersonalData: true, origin: 'pdf',
      documentId: 'e'.repeat(64), fileName: 'week2.pdf', title: 'week2.pdf · Page 1',
      text: 'Routers forward packets towards another network.',
    }),
  });
  assert.equal(upload.status, 201);
  t.after(() => {
    const { passages } = srv.quiz.db;
    for (let i = passages.length - 1; i >= 0; i--) if (passages[i].fileName === 'week2.pdf') passages.splice(i, 1);
    srv.quiz.services.save();
  });
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting' }).click();
  await page.getByLabel('Weekly topic').selectOption('tp-net');
  await page.getByText('Material library · Notes, images & older files', { exact: true }).click();
  // The topic counts the file it uses and lists it.
  const heading = page.getByRole('heading', { name: /Week 2 · Networking basics/ });
  await heading.waitFor();
  assert.match(await heading.innerText(), /1 file\(s\)/, 'the topic counts the file it uses');
  const topic = page.locator('.panel', { has: heading });
  await topic.getByText('week2.pdf', { exact: false }).first().waitFor();
  assert.equal(await page.getByText('No material in this topic yet.').count(), 0, 'the topic is not empty');
  // The file is in a topic, so it is not waiting to be moved into one.
  const unsorted = page.locator('.panel', { has: page.getByRole('heading', { name: /Files not in a topic/ }) });
  if (await unsorted.count()) assert.equal(await unsorted.getByText('week2.pdf', { exact: false }).count(), 0);
});

test('dashboard: very low accuracy is flagged, commonly missed means under 60%, and empty comparisons stay quiet', async (t) => {
  const page = await pageFor(t, 'Prof. Demo A');
  await page.locator('#tabs').getByRole('button', { name: 'Analytics', exact: true }).click();
  const attention = page.locator('.panel', { has: page.getByRole('heading', { name: 'Needs attention' }) });
  // the seeded video-call question: 0 of 5 right on first attempts (earlier
  // tests answer at random, so others may join it). One question opens
  // straight away; several go to their list.
  const lowest = attention.getByRole('button', { name: /\d+ questions? under 25% correct on first attempts/ });
  const one = /^1 question /.test(await lowest.innerText());
  await lowest.click();
  if (one) {
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
  } else await page.waitForFunction(() => document.activeElement?.closest('#dash-missed'));
  // Group A is far behind Group C on a topic (class names, no students)
  await attention.getByRole('button', { name: /^.+: \d+% correct here vs \d+% in Computing - Tutorial Group C$/ }).waitFor();
  // the comparison explanation opens from a button, not only on hover
  const info = page.getByRole('button', { name: 'How the answers submitted comparison works' });
  await info.click();
  assert.equal(await info.getAttribute('aria-expanded'), 'true');
  await page.getByText(/counted up to the same time of day|in the 30 days before\./).first().waitFor();
  await info.click();
  assert.equal(await info.getAttribute('aria-expanded'), 'false');
  await page.locator('.dash-nav, nav').getByRole('button', { name: 'Commonly missed' }).first().click();
  const missed = page.locator('#dash-missed');
  await missed.getByText(/^Questions under 60% correct on first attempts/).waitFor();
  const firsts = await missed.locator('.small.muted').filter({ hasText: 'first attempts' }).allInnerTexts();
  for (const line of firsts.filter((l) => l.includes(' · first attempts '))) assert.ok(Number(line.match(/first attempts (\d+)%/)[1]) < 60, line);
  // 50% is no longer "mostly right": the time table's groups use the 60% line
  const time = page.locator('#dash-time');
  await time.getByRole('columnheader', { name: 'Correct (all answers)' }).waitFor();
  const https = time.locator('tr', { hasText: 'What does HTTPS add to HTTP?' });
  // 50% is under the 60% "mostly right" line, so this question is in a *wrong*
  // group. Which one depends on whether it lands above the slow threshold, so
  // accept both: "Worth rereading" is the slow-and-wrong group, and its own hint
  // reads "slow and often wrong".
  assert.match(await https.innerText(), /often wrong|Worth rereading/i);
  // downloads are named by what they hold, for whom and when
  const download = page.waitForEvent('download');
  await missed.getByRole('button', { name: 'Download CSV' }).click();
  // the month is three letters for most of the year but four in September:
  // the short form of September is "Sept" in the en-SG locale
  assert.match((await download).suggestedFilename(), /^Commonly missed questions - Computing - Tutorial Group A - All topics - last 30 days to \d{1,2} \w{3,4} \d{4}\.csv$/);
  // no World answers yet: no "(0 in World)" and no empty Practice vs World panel
  assert.equal(await page.getByText('(0 in World)').count(), 0);
  assert.equal(await page.getByRole('heading', { name: 'Practice vs World' }).count(), 0);
  // the seeded previous period is empty, so the tiles say "up from 0" instead of "+120"
  await page.getByText(/^▲ up from 0 in the 30 days before/).first().waitFor();
});

test('dashboard: "This semester" uses the dates set in Settings', async (t) => {
  const course = srv.quiz.db.courses.find((c) => c.id === 'c-comp');
  const seeded = { ...course.semester };
  t.after(() => { course.semester = seeded; srv.quiz.services.save(); });
  const page = await pageFor(t, 'Prof. Demo A');
  const tabs = page.locator('#tabs');
  await tabs.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByLabel('Period').selectOption('semester');
  // the semester start moves with the date, so the month can be "Sept" too
  await page.getByText(/students who practised \(this semester, from \d{1,2} \w{3,4} \d{4}\)/).waitFor();
  // the comparison says before what
  await page.getByText(/in the \d+ days before the semester/).first().waitFor();
  // without dates the dashboard stays put and points to Settings
  await tabs.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Semester starts').fill('');
  await page.getByRole('button', { name: 'Clear dates' }).click();
  await page.getByText('Semester dates cleared').waitFor();
  // the remembered "This semester" falls back to 30 days, and says why
  await tabs.getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByText(/students who practised \(last 30 days\)/).waitFor();
  await page.getByText('This course has no semester dates yet.').waitFor();
  await page.getByLabel('Period').selectOption('semester');
  await page.getByText('This course has no semester dates yet.').waitFor();
  await page.getByText(/students who practised \(last 30 days\)/).waitFor();
  await page.getByRole('button', { name: 'Set when the semester starts in Settings' }).click();
  await page.getByLabel('Semester starts').fill(seeded.start);
  await page.getByRole('button', { name: 'Save dates' }).click();
  await page.getByText('Semester dates saved').waitFor();
  assert.deepEqual(course.semester, { start: seeded.start });
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
  // group cards: one per group, counts add up to every question; a card
  // filters the table to its questions and says what to do
  const cards = page.getByRole('group', { name: 'Question groups' }).getByRole('button');
  const counts = (await cards.locator('.zc-n').allInnerTexts()).map(Number);
  assert.equal(counts.reduce((x, y) => x + y, 0), total);
  assert.ok((await cards.allInnerTexts()).every((c) => c.includes('What to do:')));
  const group = cards.first();
  const inGroup = counts[0];
  const groupName = (await group.locator('.zc-label').innerText()).replace(/^⚠ /, '');
  await group.click();
  assert.equal(await group.getAttribute('aria-pressed'), 'true');
  await page.waitForFunction((n) => document.querySelectorAll('#dash-time tbody tr').length === n, Math.min(inGroup, 10));
  assert.ok((await page.locator('#dash-time tbody td:nth-child(2)').allInnerTexts()).every((g) => g.replace(/^⚠ /, '') === groupName));
  await page.locator('#dash-time').getByRole('button', { name: `Show all ${total} questions` }).click();
  assert.equal(await group.getAttribute('aria-pressed'), 'false');
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

  // keyboard: the heatmap is one tab stop, arrows move inside
  const heat = page.getByRole('img', { name: /Answers by day and time/ });
  await heat.focus();
  await page.getByText(/^Mon 00:00–03:00: \d+ answers$/).waitFor();
  await page.keyboard.press('ArrowDown');
  await page.getByText(/^Tue 00:00–03:00: \d+ answers$/).waitFor();
  assert.equal(await page.locator('.heat-cell[tabindex], .viz .hit[tabindex]').count(), 0, 'no per-point tab stops');
});

test('dashboard: a refused or failed period never locks the page, and marks already made stand', async (t) => {
  const db = srv.quiz.db;
  const ids = ['at-race-0', 'at-race-1'];
  ids.forEach((id, i) => db.attempts.push({ id, sessionId: null, studentId: `s-0${i + 1}`, classId: 'cl-a', courseId: 'c-comp', questionId: 'q-x3', version: 1, topicId: 'tp-net', type: 'short', text: `race answer ${i}`, correct: false, score: 0, ms: 20000, timedOut: false, first: true, context: 'practice', at: Date.now() - 1000 * (i + 1), needsReview: true }));
  t.after(() => {
    for (const id of ids) db.attempts.splice(db.attempts.findIndex((a) => a.id === id), 1);
  });

  const page = await pageFor(t, 'Prof. Demo A');
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
});

test('dashboard: placeholders while loading, tile trends, and a sticky section bar', async (t) => {
  const page = await pageFor(t, 'Prof. Demo A');
  // placeholders hold the layout until the numbers arrive
  let release;
  const held = new Promise((r) => (release = r));
  await page.route('**/analytics?**', async (r) => { await held; await r.continue(); });
  await page.locator('#tabs').getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Loading analytics' }).waitFor();
  assert.ok(await page.locator('.dash-skeleton .tile').count() >= 4);
  release();
  await page.getByRole('heading', { name: 'Needs attention' }).waitFor();
  await page.unroute('**/analytics?**');

  // tiles carry the period's shape
  await page.locator('.tiles').getByRole('img', { name: /^Answers per week, last 30 days: [\d, ]+/ }).waitFor();

  // the section bar stays in view and marks where you are
  const nav = page.getByRole('navigation', { name: 'Dashboard sections' });
  assert.equal(await nav.getByRole('button', { name: 'Overview' }).getAttribute('aria-current'), 'location');
  await nav.getByRole('button', { name: 'Commonly missed' }).click();
  await page.waitForFunction(() => document.querySelector('[data-section="dash-missed"]')?.getAttribute('aria-current') === 'location');
  // beside the teacher sidebar the page toolbar (pickers + section bar) sticks to the top
  const navBox = await nav.boundingBox();
  const toolbarBox = await page.locator('.dash-toolbar').boundingBox();
  assert.ok(Math.abs(toolbarBox.y) < 2, 'the toolbar is stuck to the top of the window');
  assert.ok(navBox.y >= toolbarBox.y && navBox.y + navBox.height <= toolbarBox.y + toolbarBox.height + 1, 'the section bar is inside the stuck toolbar');
  const heading = await page.getByRole('heading', { name: 'Commonly missed questions' }).boundingBox();
  assert.ok(heading.y >= navBox.y + navBox.height, 'the heading is not hidden under the bar');
});

test('with reduced motion, nothing keeps looping (the shortened animations would flicker)', async (t) => {
  const page = await pageFor(t, 'Student 04', undefined, { reducedMotion: 'reduce' });
  const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName || a.constructor.name));
  const settle = () => page.waitForTimeout(300);
  // the summon screen idles with a wiggling callout; ready buildings bob their arrows
  await page.locator('#tabs').getByRole('button', { name: 'Summon' }).click();
  await page.getByRole('button', { name: /^Summon ×1(?!0)/ }).waitFor();
  await settle();
  assert.deepEqual(await running(), [], 'Summon');
  const R = require('../src/quiz/rewards');
  R.inventory(srv.quiz.db, 's-04').resources = { wood: 40, crystal: 40, herb: 40 };
  await openStudentTab(page, 'Kingdom');
  await page.getByRole('heading', { name: /^Your Kingdom/ }).waitFor();
  await page.getByRole('button', { name: 'Buildings', exact: true }).click();
  await page.locator('#town-building-list').getByText(/ready/).first().waitFor();
  await settle();
  assert.deepEqual(await running(), [], 'Kingdom with buildings ready to upgrade');
});

test('weekly topics: narrow the dashboard, follow a next step, and add a topic for uploads', async (t) => {
  const page = await pageFor(t, 'Prof. Demo A');
  await page.locator('#tabs').getByRole('button', { name: 'Analytics', exact: true }).click();
  const weeks = page.locator('#dash-weeks');
  await weeks.getByRole('heading', { name: 'Weekly topics' }).waitFor();
  assert.deepEqual(await weeks.locator('tbody tr td:first-child').allInnerTexts(), ['1', '2', '3']);
  // a topic narrows every section, and the filter shows it
  await weeks.getByRole('button', { name: 'Show only Networking basics on the dashboard' }).click();
  await page.getByText('Showing Week 2 · Networking basics only', { exact: false }).waitFor();
  assert.equal(await page.getByLabel('Weekly topic').inputValue(), 'tp-net');
  await page.waitForFunction(() => document.querySelectorAll('#dash-topics tbody tr:not(.subrow)').length === 1);
  assert.deepEqual(await weeks.locator('tbody tr td:first-child').allInnerTexts(), ['2'], 'Weekly topics follows the topic filter');
  assert.equal(await page.getByText(/Weakest topic/).count(), 0, 'no "weakest topic" when only one topic is shown');
  assert.ok((await page.locator('#dash-time tbody').innerText()).split('\n').every((line) => !/Data representation|Cyber hygiene/.test(line)));
  // the outcomes of the chosen topic are open; Week 2's draft is one click away
  await page.locator('#dash-topics').getByText('Describe how data moves across a network', { exact: true }).waitFor();
  await weeks.getByRole('button', { name: 'Review 1 draft' }).click();
  await page.getByRole('heading', { name: 'Question bank', exact: true }).waitFor();
  assert.equal(await page.getByLabel('Filter by topic').inputValue(), 'tp-net');
  assert.equal(await page.getByRole('button', { name: /^Needs review/ }).getAttribute('aria-pressed'), 'true');
  // back on the dashboard, "Show all topics" clears the filter
  await page.locator('#tabs').getByRole('button', { name: 'Analytics', exact: true }).click();
  await page.getByRole('button', { name: 'Show all topics' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#dash-topics tbody tr:not(.subrow)').length === 3);
  assert.equal(await weeks.locator('tbody tr').count(), 3);
  // Source material's topic table follows its topic filter too
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting', exact: true }).click();
  await page.getByRole('heading',{name:'Manage topics & learning outcomes',exact:true}).waitFor(); // always open
  await page.getByLabel('Weekly topic').selectOption('tp-sec');
  await page.getByRole('heading', { name: 'Upload Materials' }).waitFor();
  // The upload panel says what uploading a file actually does, so it cannot
  // be mistaken for the browser-side file inputs in the material library.
  await page.locator('p', { hasText: 'Uploaded files are kept with this topic' }).waitFor();
  await page.getByRole('heading',{name:'Manage topics & learning outcomes',exact:true}).waitFor(); // always open
  await page.getByRole('button',{name:'Edit Cyber hygiene',exact:true}).waitFor();
  assert.deepEqual(await page.locator('.topic-table tbody tr:not(.subrow) td:first-child').allInnerTexts(), ['3']);
  await page.getByRole('button',{name:'Show all topics',exact:true}).click();
  await page.waitForFunction(() => document.querySelectorAll('.topic-table tbody tr:not(.subrow)').length === 3);
  // Source material: add Week 4; uploads then go into it
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting', exact: true }).click();
  await page.getByRole('heading',{name:'Manage topics & learning outcomes',exact:true}).waitFor(); // always open
  await page.getByRole('button', { name: '+ Add topic' }).click();
  assert.equal(await page.getByLabel('Week', { exact: true }).inputValue(), '4', 'suggests the week after the latest');
  await page.getByLabel('Topic name').fill('Operating systems');
  await page.getByLabel('First learning outcome (optional)').fill('Explain what an operating system manages');
  await page.getByRole('button', { name: 'Add topic', exact: true }).click();
  await page.getByText('Added Week 4 · Operating systems', {exact:true}).waitFor();
  await page.getByRole('heading', { name: 'Upload Materials' }).waitFor();
  assert.equal(await page.getByLabel('Weekly topic').inputValue(), srv.quiz.db.topics.find((x) => x.name === 'Operating systems').id);
  assert.equal(srv.quiz.db.topics.find((x) => x.name === 'Operating systems').week, 4);
  // the new topic was never used, so it can be deleted again (keeps later tests unchanged)
  await page.getByRole('heading',{name:'Manage topics & learning outcomes',exact:true}).waitFor(); // always open
  await page.getByRole('button', { name: 'Edit Operating systems' }).click();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Delete topic' }).click();
  await page.getByRole('button', { name: 'Edit Operating systems' }).waitFor({ state: 'detached' });
  assert.ok(!srv.quiz.db.topics.some((x) => x.name === 'Operating systems'));
});

test('a student with no classes joins one with the code their professor generated', async (t) => {
  // A teacher generates a code. Set up over the API so this test stays about
  // the student-facing half, which is what was reported as unreachable.
  const teacher = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'prof.a@quizquest.demo', password: 'quizquest' }),
  }).then((r) => r.json());
  const auth = { 'content-type': 'application/json', authorization: `Bearer ${teacher.token}` };
  const [cls] = await fetch(`${base}/api/classes`, { headers: auth }).then((r) => r.json());
  const { code } = await fetch(`${base}/api/classes/${cls.id}/join-codes`, { method: 'POST', headers: auth, body: '{}' }).then((r) => r.json());
  assert.match(code, /^QQ-[2-9A-HJ-NP-Z]{5}$/, 'the generated code has the shape the student form advertises');

  // A brand-new account, enrolled in nothing at all.
  const email = `joiner.${Date.now()}@example.com`;
  await fetch(`${base}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Joiner', email, password: 'longenough' }),
  }).then((r) => r.json());

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-SG' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(async () => { await page.close(); assert.deepEqual(errors, [], 'no unhandled browser errors'); });
  await page.goto(base);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Email', { exact: true }).press('Enter');
  await page.getByLabel('Password', { exact: true }).fill('longenough');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('#tabs').getByRole('button', { name: 'Practice', exact: true }).waitFor();
  await openStudentTab(page, 'Practice');

  // With no classes the picker still offers the way in.
  await page.getByText('No class enrolled').waitFor();
  await page.getByRole('button', { name: '+ Join Class' }).click();
  await page.getByLabel('Class Join Code').fill(code);
  await page.getByRole('button', { name: 'Join Class', exact: true }).click();
  await page.getByText(`Successfully enrolled in ${cls.name}!`).waitFor();

  // The class is theirs now, on every view that offers the picker.
  await page.getByText(cls.name, { exact: false }).first().waitFor();
  await page.locator('#tabs').getByRole('button', { name: 'My Progress', exact: true }).click();
  await page.getByRole('heading', { name: 'My Progress', exact: true }).waitFor();
  await page.getByText(cls.name, { exact: false }).first().waitFor();

  // The same code cannot be spent twice by the same student.
  await page.getByRole('button', { name: '+ Join Class' }).click();
  await page.getByLabel('Class Join Code').fill(code);
  await page.getByRole('button', { name: 'Join Class', exact: true }).click();
  await page.getByText('You are already enrolled in this class.').waitFor();
});
