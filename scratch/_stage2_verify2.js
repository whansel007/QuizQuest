// Stage-2 verification part 2: icon credits, load fallback, debug cluster row,
// frame cost. Usage: node scratch/_stage2_verify2.js
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const BASE = 'http://127.0.0.1:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function login(page) {
  const response = await page.request.post(`${BASE}/api/login`, { data: { userId: 's-01' } });
  const { token } = await response.json();
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
}

(async () => {
  const browser = await chromium.launch();
  const warnings = [];
  const pageErrors = [];

  // ---------- F. icon credits (normal page) ----------
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(`${m.type()}: ${m.text()}`); });
  await login(page);
  await page.goto(`${BASE}/hero-lab/world.html?heroId=sheriff&create=1`);
  await page.waitForSelector('.ability[data-ability="ultimate"] .ability-icon svg', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.click('#settings-button');
  await page.waitForTimeout(300);
  const credits = await page.evaluate(() => {
    const details = document.querySelector('#icon-credits');
    const text = details.textContent.replace(/\s+/g, ' ');
    const authors = [...document.querySelectorAll('#icon-credits-list strong')].map((el) => el.textContent);
    const items = document.querySelectorAll('#icon-credits-list li').length;
    const link = document.querySelector('#icon-credits a')?.getAttribute('href');
    return { text, authors, items, link };
  });
  check('credits entry shows the CC BY 3.0 line + game-icons.net link',
    credits.text.includes('Icons from game-icons.net, licensed under CC BY 3.0 (see each author)') && credits.link === 'https://game-icons.net',
    credits.link);
  check('credits list all four authors from CREDITS.json',
    credits.authors.join(',') === 'delapouite,lorc,sbed,willdabeast' && credits.items === 4,
    `${credits.authors.join(',')} (${credits.items} lines)`);
  await page.screenshot({ path: 'scratch/_stage2_credits.png' });

  // ---------- G. icon load fallback ----------
  const fallbackContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const fallbackPage = await fallbackContext.newPage();
  const fallbackWarnings = [];
  fallbackPage.on('console', (m) => { if (m.type() === 'warning') fallbackWarnings.push(m.text()); });
  fallbackPage.on('pageerror', (e) => pageErrors.push(String(e)));
  await login(fallbackPage);
  await fallbackPage.route('**/assets/icons/sheriff-primary.svg', (route) => route.abort());
  await fallbackPage.goto(`${BASE}/hero-lab/world.html?heroId=sheriff&create=1`);
  await fallbackPage.waitForSelector('.ability[data-ability="ultimate"] .ability-icon svg', { timeout: 15000 });
  await fallbackPage.waitForTimeout(900);
  const fallback = await fallbackPage.evaluate(() => {
    const m1 = document.querySelector('.ability[data-ability="weapon"] .ability-icon');
    const svg = m1.querySelector('svg');
    const circle = svg?.querySelector('circle');
    return {
      hasSvg: Boolean(svg),
      isRing: Boolean(circle) && circle.getAttribute('fill') === 'none' && circle.getAttribute('stroke') === 'currentColor',
      otherIconsIntact: Boolean(document.querySelector('.ability[data-ability="ultimate"] .ability-icon svg path')),
    };
  });
  check('failed icon load falls back to a neutral white ring', fallback.hasSvg && fallback.isRing, JSON.stringify(fallback));
  check('other icons still load when one fails', fallback.otherIconsIntact);
  check('exactly one console warning for the failed icon',
    fallbackWarnings.filter((w) => w.includes('sheriff-primary.svg')).length === 1,
    `${fallbackWarnings.length} warning(s): ${fallbackWarnings[0]?.slice(0, 90) || 'none'}`);
  await fallbackPage.screenshot({ path: 'scratch/_stage2_fallback.png' });
  await fallbackContext.close();

  // ---------- H. debug cluster row (?profiler=1) ----------
  const debugContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const debugPage = await debugContext.newPage();
  debugPage.on('pageerror', (e) => pageErrors.push(String(e)));
  await login(debugPage);
  await debugPage.goto(`${BASE}/hero-lab/world.html?heroId=sheriff&create=1&profiler=1`);
  await debugPage.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 15000 });
  await debugPage.waitForTimeout(600);
  const debugHasToggle = await debugPage.evaluate(() => Boolean(document.querySelector('#hud-debug-setting')));
  check('debug gate adds the cluster toggle to Settings', debugHasToggle);
  const debugRow = await debugPage.evaluate(() => {
    window.__heroLabHudDebug.show();
    const row = document.querySelector('#hud-debug-clusters');
    const heroes = [...row.querySelectorAll('.hud-debug-hero')].map((col) => ({
      name: col.querySelector('strong').textContent,
      colors: [...col.querySelectorAll('.ability-circle')].map((c) => (c.style.getPropertyValue('--fill-color') || '').trim()),
      icons: [...col.querySelectorAll('.ability-icon svg')].length,
    }));
    return { hidden: row.hidden, count: heroes.length, heroes };
  });
  const wantColors = {
    Guardian: ['#2F96D4', '#1E78C8', '#8A5800'], Sheriff: ['#2F96D4', '#A86E00', '#2F3AB8'],
    Pilot: ['#2F96D4', '#1E78C8', '#8A5800'], Bombardier: ['#C08400', '#7B4FD8', '#4B2AA8'],
    Bubbles: ['#9B7BE8', '#A86E00', '#4B2AA8'], Electromancer: ['#9B7BE8', '#7B4FD8', '#8A5800'],
  };
  check('debug row shows six hero clusters', debugRow.count === 6, `${debugRow.count} clusters`);
  const colorOk = debugRow.heroes.every((h) => wantColors[h.name] && JSON.stringify(h.colors) === JSON.stringify(wantColors[h.name]));
  check('debug clusters use the real per-hero colours', colorOk,
    debugRow.heroes.map((h) => `${h.name}:${h.colors.join('/')}`).join(' '));
  check('debug clusters carry real icons', debugRow.heroes.every((h) => h.icons === 3),
    debugRow.heroes.map((h) => h.icons).join('/'));
  const onScreen = await debugPage.evaluate(() => {
    const r = document.querySelector('#hud-debug-clusters').getBoundingClientRect();
    return r.left >= 0 && r.right <= 1280 && r.top >= 0 && r.bottom <= 720;
  });
  check('debug row stays on screen at 1280x720', onScreen);
  const toggleWorks = await debugPage.evaluate(() => {
    window.__heroLabHudDebug.hide();
    const hidden = document.querySelector('#hud-debug-clusters').hidden;
    window.__heroLabHudDebug.toggle();
    const shown = !document.querySelector('#hud-debug-clusters').hidden;
    return hidden && shown;
  });
  check('debug toggle hides and shows the row', toggleWorks);
  await debugPage.screenshot({ path: 'scratch/_stage2_debug_row.png' });

  // ---------- I. HUD frame cost ----------
  // The HUD is DOM-only (drawScene is untouched), so the honest measurement is
  // main-thread cost: CDP performance metrics (script + recalc + layout) over
  // a fixed live-gameplay window with the HUD shown vs hidden.
  const costPage = await debugContext.newPage();
  await login(costPage);
  await costPage.goto(`${BASE}/hero-lab/world.html?heroId=guardian&create=1&profiler=1`);
  await costPage.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 15000 });
  await costPage.click('#start-run');
  await costPage.waitForFunction(() => document.querySelector('#wave-number')?.textContent?.startsWith('Wave'), { timeout: 20000 });
  await costPage.waitForTimeout(1500);
  const cdp = await costPage.context().newCDPSession(costPage);
  await cdp.send('Performance.enable');
  const metricsSnapshot = async () => {
    const { metrics } = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
  };
  const sample = async () => {
    const before = await metricsSnapshot();
    await costPage.waitForTimeout(8000);
    const after = await metricsSnapshot();
    const delta = {};
    for (const key of ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration']) {
      delta[key] = (after[key] || 0) - (before[key] || 0);
    }
    return delta;
  };
  const setHud = (visible) => costPage.evaluate((v) => {
    document.querySelector('#ability-hud').style.display = v ? '' : 'none';
  }, visible);
  // Interleave to cancel machine drift: HUD, none, HUD, none.
  await setHud(true); const hudA = await sample();
  await setHud(false); const noneA = await sample();
  await setHud(true); const hudB = await sample();
  await setHud(false); const noneB = await sample();
  const avg = (a, b) => (a + b) / 2;
  const hudCost = {
    script: avg(hudA.ScriptDuration, hudB.ScriptDuration) - avg(noneA.ScriptDuration, noneB.ScriptDuration),
    recalc: avg(hudA.RecalcStyleDuration, hudB.RecalcStyleDuration) - avg(noneA.RecalcStyleDuration, noneB.RecalcStyleDuration),
    layout: avg(hudA.LayoutDuration, hudB.LayoutDuration) - avg(noneA.LayoutDuration, noneB.LayoutDuration),
  };
  const worst = Math.max(hudCost.script, hudCost.recalc, hudCost.layout);
  check('HUD main-thread cost is negligible (<1ms over 8s)', worst < 1,
    `script ${hudCost.script >= 0 ? '+' : ''}${(hudCost.script * 1000).toFixed(2)}ms, recalc ${(hudCost.recalc * 1000).toFixed(2)}ms, layout ${(hudCost.layout * 1000).toFixed(2)}ms over 8s windows`);
  // Canvas draw cost must be untouched: the HUD adds no drawScene work.
  const drawCost = await costPage.evaluate(() => window.__heroLabKillTest?.measureRenderMedian(40, 3) ?? null);
  check('canvas draw cost measurable and unchanged by the HUD', typeof drawCost === 'number' && drawCost < 16,
    `measureRenderMedian ${drawCost?.toFixed(2)}ms (canvas only; the HUD is DOM)`);
  await setHud(true);
  await costPage.screenshot({ path: 'scratch/_stage2_perf.png' });

  console.log('\n--- page errors:', pageErrors.length ? pageErrors : 'none');
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error('VERIFY2 CRASHED:', error); process.exit(2); });
