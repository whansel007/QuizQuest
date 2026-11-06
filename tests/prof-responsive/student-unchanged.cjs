#!/usr/bin/env node
// ============================================================
// Student pages unchanged? Compares a layout fingerprint (every element's
// tag, classes and rounded box) of the sign-in page and the student tabs
// between two builds of the app: a checkout of main and this branch.
//   node tests/prof-responsive/student-unchanged.cjs <main-checkout> [this-checkout]
// Both checkouts need a fresh `pnpm build`. Reduced motion is on, so
// animations do not move boxes between the two captures.
// ============================================================
const path = require('node:path');
const { chromium } = require('playwright');

const [mainDir, thisDir = path.join(__dirname, '..', '..')] = process.argv.slice(2).map((p) => path.resolve(p));
const TABS = ['Quiz', 'My Progress', 'Campfire Run', 'Summon', 'Kingdom'];
const SIZES = [[375, 667], [768, 900], [1200, 900]];

async function serve(dir) {
  const { start } = require(path.join(dir, 'server.js'));
  const srv = start(0, { dataFile: null, distDir: path.join(dir, 'dist') });
  await new Promise((r) => srv.httpServer.once('listening', r));
  return { srv, base: `http://localhost:${srv.httpServer.address().port}` };
}

function fingerprint() {
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE'].includes(el.tagName) || el.closest('canvas, svg')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    out.push(`${el.tagName}.${[...el.classList].sort().join('.')} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return out;
}

async function capture(browser, base, [w, h]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce', locale: 'en-SG' });
  const shots = {};
  await page.goto(base);
  await page.waitForLoadState('networkidle');
  shots['sign-in'] = await page.evaluate(fingerprint);
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 's-02' }) });
  const { token } = await res.json();
  await page.evaluate((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto(base);
  await page.waitForLoadState('networkidle');
  for (const tab of TABS) {
    // the immersive student menu is tucked away: focusing a tab brings it
    // down (as for keyboard users), then it can be clicked (test/browser.test.cjs)
    const btn = page.locator('#tabs').getByRole('button', { name: tab, exact: true });
    await btn.focus();
    await btn.click();
    await page.waitForFunction((t) => [...document.querySelectorAll('#tabs button[aria-current="page"]')].some((b) => b.textContent.trim() === t), tab);
    await page.waitForLoadState('networkidle');
    // focus back off the menu, so it tucks away the same way on both builds
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(Math.round(page.viewportSize().width / 2), page.viewportSize().height - 5);
    await page.waitForTimeout(1800); // the menu tucks away 1.6 s after leaving it (App.vue timer); a fixed wait only in this comparison script
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    shots[tab] = await page.evaluate(fingerprint);
  }
  await page.close();
  return shots;
}

(async () => {
  const browser = await chromium.launch();
  const a = await serve(mainDir);
  const b = await serve(thisDir);
  let same = 0, differ = 0;
  for (const size of SIZES) {
    const [x, y] = [await capture(browser, a.base, size), await capture(browser, b.base, size)];
    for (const k of Object.keys(x)) {
      const onlyA = x[k].filter((l) => !y[k]?.includes(l));
      const onlyB = (y[k] || []).filter((l) => !x[k].includes(l));
      if (!onlyA.length && !onlyB.length) { same++; console.log(`${size.join('x').padEnd(9)} ${k.padEnd(14)} identical (${x[k].length} boxes)`); }
      else { differ++; console.log(`${size.join('x').padEnd(9)} ${k.padEnd(14)} DIFFERS: ${onlyA.length} only on main, ${onlyB.length} only here\n   main: ${onlyA.slice(0, 3).join(' | ')}\n   here: ${onlyB.slice(0, 3).join(' | ')}`); }
    }
  }
  await browser.close();
  for (const s of [a, b]) { s.srv.io.close(); s.srv.httpServer.close(); }
  console.log(`\n${same} identical, ${differ} different`);
  process.exit(differ ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
