const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
(async () => {
  const base = 'http://127.0.0.1:3000';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const r = await page.request.post(`${base}/api/login`, { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto(`${base}/`);
  await page.getByRole('button', { name: 'World', exact: true }).click();
  await page.waitForSelector('.hero-preview-art', { timeout: 15000 });
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const art = document.querySelector('.hero-preview-art');
    const icon = art.querySelector('*');
    const a = art.getBoundingClientRect();
    const i = icon.getBoundingClientRect();
    const card = document.querySelector('.hero-preview').getBoundingClientRect();
    return {
      art: { x: a.x, y: a.y, w: a.width, h: a.height },
      icon: { x: i.x, y: i.y, w: i.width, h: i.height },
      card: { x: card.x, y: card.y, w: card.width, h: card.height },
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await page.locator('.hero-preview-art').screenshot({ path: 'scratch/_preview_art.png' });
  await page.locator('.hero-preview').screenshot({ path: 'scratch/_preview_card.png' });
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
