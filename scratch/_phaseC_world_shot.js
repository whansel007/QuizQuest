const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
(async () => {
  const BASE = 'http://127.0.0.1:3000';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const r = await page.request.post(`${BASE}/api/login`, { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: 'World', exact: true }).click();
  await page.waitForSelector('.hero-preview', { timeout: 20000 });
  await page.waitForTimeout(800);
  const box = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.hero-row-cards')];
    const a = rows[0].getBoundingClientRect();
    const b = rows[rows.length - 1].getBoundingClientRect();
    return { x: Math.max(0, Math.round(a.x) - 24), y: Math.max(0, Math.round(a.y) - 40), width: Math.round(a.width) + 48, height: Math.round(b.bottom - a.top) + 70 };
  });
  await page.screenshot({ path: 'scratch/_phaseC_world.png', clip: box });
  console.log(JSON.stringify(box));
  await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
