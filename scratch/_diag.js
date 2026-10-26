const { chromium } = require('playwright');
const BASE = 'http://localhost:3000';
(async () => {
  console.error('launching...');
  const browser = await chromium.launch({ args: ['--no-sandbox','--disable-background-timer-throttling','--disable-renderer-backgrounding'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('PAGEERROR', String(e).slice(0,200)));
  page.on('console', m => { if(m.type()==='error') console.error('CONSOLE', m.text().slice(0,200)); });
  console.error('goto...');
  await page.goto(`${BASE}/hero-lab/world.html?heroId=sheriff&profiler=1`, { waitUntil: 'load' });
  console.error('waiting for hooks...');
  await page.waitForFunction(() => window.__heroLabKillTest && window.__heroLabPerf, null, { timeout: 15000 });
  console.error('hooks present');
  const info = await page.evaluate(() => {
    window.__heroLabKillTest.clearEffects();
    window.__heroLabKillTest.simulateKills(5);
    const renderMs = window.__heroLabKillTest.measureRender(10);
    return { renderMs, counts: window.__heroLabKillTest.counts() };
  });
  console.error('diag result', JSON.stringify(info));
  await browser.close();
  console.log('DONE');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
