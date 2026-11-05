// ============================================================
// Professor workspace: responsive browser tests (375 px to 1200 px).
// Uses the dev-only fixture (scripts/seed-prof-responsive.js) on its own
// in-memory server and the shared harness (tests/prof-responsive/).
//   pnpm test:prof-responsive        (builds first)
//   node --test test/browser-prof-responsive.test.cjs   (uses dist/)
// Waits are for conditions only; viewports are fixed per test.
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const playwright = require('playwright');
const H = require('../tests/prof-responsive/harness.cjs');
const J = require('../tests/prof-responsive/jitter.cjs');

let srv, base, browser;
test.before(async () => {
  ({ srv, base } = await H.startServer());
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
});
test.after(async () => { await browser?.close(); srv?.io.close(); srv?.httpServer.close(); });

async function professor(t, width, height, { probe = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-SG' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  if (probe) await J.installProbe(page);
  t.after(async () => { await ctx.close(); assert.deepEqual(errors, [], 'no unhandled browser errors'); });
  await H.signIn(page, base);
  return page;
}
const overflowOf = (page) => page.evaluate(() => document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth);

test('Classes & Roster and To review fit 320px and 375px (no page-level overflow)', async (t) => {
  const page = await professor(t, 320, 800);
  for (const width of [320, 375]) {
    await page.setViewportSize({ width, height: 800 });
    for (const tab of ['Classes & Roster', 'To review']) {
      await H.openTab(page, tab);
      const overflow = await overflowOf(page);
      assert.ok(overflow <= 1, `${tab} overflows ${width}px by ${overflow}px`);
    }
  }
});

test('all seven tabs: no page-level overflow and nothing outside the viewport at every required width', async (t) => {
  const page = await professor(t, 1200, 900);
  for (const [width, height] of H.VIEWPORTS) {
    await page.setViewportSize({ width, height });
    for (const [, tab] of H.TABS) {
      await H.openTab(page, tab);
      const r = await H.audit(page);
      assert.ok(r.overflow <= 1, `${tab} overflows ${width}x${height} by ${r.overflow}px`);
      assert.deepEqual(r.offenders, [], `${tab} at ${width}x${height}: elements outside the viewport`);
      assert.deepEqual(r.overlaps, [], `${tab} at ${width}x${height}: overlapping controls`);
      assert.ok(r.sticky.share <= 0.3, `${tab} at ${width}x${height}: sticky bars cover ${Math.round(r.sticky.share * 100)}%`);
      if (width < 768) assert.equal(r.smallTargetCount, 0, `${tab} at ${width}x${height}: tap targets under 44px: ${JSON.stringify(r.smallTargets.filter((x) => !x.inline).slice(0, 5))}`);
    }
  }
});

// fits the screen, scrolls inside when taller, primary action reachable
async function modalFits(page, selector) {
  return page.evaluate((s) => {
    const card = document.querySelector(s);
    const r = card.getBoundingClientRect();
    const fits = r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1;
    const scrolls = card.scrollHeight <= card.clientHeight + 1 || ['auto', 'scroll'].includes(getComputedStyle(card).overflowY);
    const primary = card.querySelector('button[type="submit"]') || [...card.querySelectorAll('button')].at(-1);
    const p = primary.getBoundingClientRect();
    const reachable = p.top >= Math.max(0, r.top) - 1 && p.bottom <= Math.min(r.bottom, innerHeight) + 1;
    return { fits, scrolls, reachable };
  }, selector);
}

test('modals and the question dialog fit 375x667 and 667x375 and scroll inside', async (t) => {
  for (const [width, height] of [[375, 667], [667, 375]]) {
    const page = await professor(t, width, height);
    const where = `${width}x${height}`;
    await H.openTab(page, 'Classes & Roster');
    await page.getByRole('button', { name: '+ Create Class' }).click();
    assert.deepEqual(await modalFits(page, '.modal-overlay .modal-card'), { fits: true, scrolls: true, reachable: true }, `create dialog at ${where}`);
    await page.locator('.modal-overlay').getByRole('button', { name: 'Cancel' }).click();
    await page.locator('.class-card').first().getByRole('button', { name: 'Rename' }).click();
    assert.deepEqual(await modalFits(page, '.modal-overlay .modal-card'), { fits: true, scrolls: true, reachable: true }, `rename dialog at ${where}`);
    await page.locator('.modal-overlay').getByRole('button', { name: 'Cancel' }).click();
    await page.locator('.class-card').filter({ hasText: 'Evening Cohort' }).getByRole('button', { name: /Manage Roster/ }).click();
    await page.locator('.sub-tab-btn', { hasText: 'Join Codes' }).click();
    await page.getByRole('button', { name: /Generate (First )?Join Code/ }).first().click();
    assert.deepEqual(await modalFits(page, '.modal-overlay .modal-card'), { fits: true, scrolls: true, reachable: true }, `join-code dialog at ${where}`);
    await page.locator('.modal-overlay').getByRole('button', { name: 'Cancel' }).click();
    await H.openTab(page, 'Analytics');
    await page.locator('#dash-time table .linklike').first().click();
    await page.locator('dialog.insight[open]').waitFor();
    const d = await modalFits(page, 'dialog.insight[open]');
    assert.ok(d.fits && d.scrolls, `question dialog at ${where}: ${JSON.stringify(d)}`);
    await page.keyboard.press('Escape');
  }
});

test('sticky bars never cover a section jump, a focused control or the end of the page (Analytics, To review)', async (t) => {
  for (const [width, height] of [[375, 667], [740, 360], [991, 900], [1200, 900]]) {
    const page = await professor(t, width, height);
    await H.openTab(page, 'Analytics');
    for (const a of await H.checkAnchors(page)) assert.ok(a.ok, `Analytics ${width}x${height}: ${a.id} lands under the bars (${a.top} < ${a.cover})`);
    assert.deepEqual(await H.checkFocusCover(page, 30), [], `Analytics ${width}x${height}: focus under a sticky bar`);
    assert.ok((await H.checkPageEnd(page)).ok, `Analytics ${width}x${height}: end of page reachable`);
    await H.openTab(page, 'To review');
    assert.deepEqual(await H.checkFocusCover(page, 30), [], `To review ${width}x${height}: focus under a sticky bar`);
    assert.ok((await H.checkPageEnd(page)).ok, `To review ${width}x${height}: end of page reachable`);
  }
});

test('the drawer opens and closes, and resizing across 992px leaves no half-open drawer', async (t) => {
  const page = await professor(t, 991, 800, { probe: true });
  const state = () => page.evaluate(() => {
    const side = document.querySelector('#t-sidebar');
    return { open: document.querySelector('.teacher-app').classList.contains('drawer-open'), scrim: !!document.querySelector('.t-scrim'), visibility: getComputedStyle(side).visibility };
  });
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await menu.click();
  await page.locator('.teacher-app.drawer-open').waitFor();
  await page.keyboard.press('Escape');
  await H.waitDrawerClosed(page);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Open navigation', 'Escape returns focus to the menu button');
  await menu.click();
  await page.locator('.t-scrim').click({ position: { x: 900, y: 400 } });
  await H.waitDrawerClosed(page);
  // open, then grow past 992 and shrink back: the drawer is shut, not stale
  await menu.click();
  await page.locator('.teacher-app.drawer-open').waitFor();
  await J.resizeTo(page, 1100, 800);
  await J.settle(page, 400);
  assert.deepEqual(await state(), { open: false, scrim: false, visibility: 'visible' }, 'beside the content at 1100px');
  await J.resizeTo(page, 991, 800);
  await J.settle(page, 400);
  assert.deepEqual(await state(), { open: false, scrim: false, visibility: 'hidden' }, 'shut again at 991px');
  await H.openTab(page, 'Question bank'); // the drawer still works afterwards
});

test('no layout keeps moving after a resize stops, and no ResizeObserver errors (Analytics, drawer)', async (t) => {
  const page = await professor(t, 1212, 900, { probe: true });
  await H.openTab(page, 'Analytics');
  for (const bp of [1200, 992, 768]) {
    for (const w of J.steps(bp, 6)) await J.resizeTo(page, w, 900);
    const r = await J.settle(page);
    assert.deepEqual(r.late, [], `metrics still changing more than 300ms after the steps around ${bp}px`);
    assert.deepEqual(r.errors, [], 'no ResizeObserver loop errors');
  }
  for (let i = 0; i < 10; i++) { await page.setViewportSize({ width: 993, height: 800 }); await page.setViewportSize({ width: 991, height: 800 }); }
  let r = await J.settle(page);
  assert.deepEqual(r.late, [], 'rapid back-and-forth across 992px settles');
  await J.resizeTo(page, 375, 667);
  await J.resizeTo(page, 375, 600);
  r = await J.settle(page);
  assert.deepEqual(r.late, [], 'a height-only change settles');
  // the drawer, open across 992px
  await J.resizeTo(page, 991, 800);
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.locator('.teacher-app.drawer-open').waitFor();
  for (const w of [1000, 985, 1000, 985]) await J.resizeTo(page, w, 800);
  r = await J.settle(page);
  assert.deepEqual(r.late, [], 'the drawer settles after resizes across 992px');
  assert.deepEqual(r.errors, []);
});

test('tab, class, filters, search text, an open dialog, its input and the reading position survive resizing', async (t) => {
  const page = await professor(t, 1200, 800, { probe: true });
  const s = await J.checkStatePreserved(page);
  for (const c of s.checks) assert.ok(c.pass, `${c.name} ${c.detail}`);
});
