const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('http://localhost:3000/hero-lab/world.html?heroId=sheriff&profiler=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__heroLabKillTest, null, { timeout: 20000 });
  const out = await p.evaluate(async () => {
    const k = window.__heroLabKillTest;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await sleep(800);
    k.clearEffects();
    k.simulateKills(40);
    const afterBurst = k.counts();
    const quality = k.quality();
    // Draw cost of the burst slate (entities alive right after the burst).
    const burstDraw = k.measureRenderMedian(40, 3);
    return { afterBurst, quality, burstDraw };
  });
  console.log(JSON.stringify({ out, errs }, null, 2));
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
