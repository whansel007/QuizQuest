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
  const info = await page.evaluate(() => {
    const badge = document.querySelector('#stat-talent-badge .talent-badge');
    const host = badge.querySelector('.talent-badge-icon');
    const svg = badge.querySelector('svg');
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    return {
      badge: rect(badge),
      host: rect(host),
      svg: rect(svg),
      hostStyle: { w: host.style.width, h: host.style.height, display: getComputedStyle(host).display, place: getComputedStyle(host).placeItems },
      svgStyle: { w: getComputedStyle(svg).width, h: getComputedStyle(svg).height },
      viewBox: svg.getAttribute('viewBox'),
      pathD: (svg.querySelector('path')?.getAttribute('d') || '').slice(0, 120),
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
