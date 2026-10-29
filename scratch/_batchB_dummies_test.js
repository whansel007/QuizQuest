const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const r = await page.request.post('http://127.0.0.1:3000/api/login', { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto('http://127.0.0.1:3000/hero-lab/world.html?heroId=electromancer&create=1');
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 15000 });
  await page.waitForTimeout(1500);

  // Count dummies in the lobby.
  const dummiesBefore = await page.evaluate(() => {
    const s = window.__qqState || window.state;
    if (!s) return null;
    return s.monsters?.filter((m) => m.isDummy).length;
  });
  console.log('dummies before:', dummiesBefore);

  // Fire primary at nearest dummy.
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(1000);

  const dummiesAfter = await page.evaluate(() => {
    const s = window.__qqState || window.state;
    if (!s) return null;
    return s.monsters?.filter((m) => m.isDummy).length;
  });
  console.log('dummies after shot:', dummiesAfter);

  await page.screenshot({ path: 'scratch/_batchB_dummies.png' });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
