const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
(async () => {
  const BASE = 'http://127.0.0.1:3000';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const r = await page.request.post(`${BASE}/api/login`, { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto(`${BASE}/hero-lab/world.html?heroId=sheriff&create=1`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 20000 });
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(600);
  await page.locator('#stat-talent-badge .talent-badge').screenshot({ path: 'scratch/_badge_icard.png' });
  const box = await page.evaluate(() => {
    const b = document.querySelector('#stat-talent-badge .talent-badge');
    const r = b.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  console.log('badge box', JSON.stringify(box));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
