// Natural-state screenshot: Sheriff lobby HUD with gold ready skill + ready glow.
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const r = await page.request.post('http://127.0.0.1:3000/api/login', { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto('http://127.0.0.1:3000/hero-lab/world.html?heroId=sheriff&create=1');
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const state = await page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('.ability[data-ability]')) {
      const c = el.querySelector('.ability-circle');
      out[el.dataset.ability] = {
        fill: c.style.getPropertyValue('--fill-color'),
        ready: c.classList.contains('ready'),
        gold: el.classList.contains('highlight-ready'),
        glow: getComputedStyle(c).animationName,
      };
    }
    return out;
  });
  console.log(JSON.stringify(state, null, 1));
  await page.locator('#ability-hud').screenshot({ path: 'scratch/_fixes_glow.png' });
  await browser.close();
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
