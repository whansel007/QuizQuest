const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.goto('http://localhost:3000/hero-lab/world.html?heroId=sheriff&profiler=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__heroLabKillTest, null, { timeout: 20000 });
  const r = await p.evaluate(() => {
    const k = window.__heroLabKillTest;
    k.clearEffects();
    k.simulateKills(40);
    const afterSim = k.counts();
    const t0 = k.measureRenderMedian(60, 5);
    const afterMeasure = k.counts();
    return { afterSim, afterMeasure, t0 };
  });
  console.log(JSON.stringify(r));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
