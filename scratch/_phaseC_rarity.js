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
  const out = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.hero-chip')];
    return chips.map((chip) => {
      const cls = [...chip.classList].filter((c) => c.startsWith('rarity-'));
      const style = getComputedStyle(chip);
      const stars = chip.querySelector('.hero-chip-stars');
      return {
        name: chip.querySelector('.hero-chip-name')?.textContent?.trim(),
        rarityClass: cls[0] || null,
        border: style.borderTopColor,
        boxShadow: style.boxShadow === 'none' ? 'none' : 'glow',
        starColor: stars ? getComputedStyle(stars).color : null,
      };
    });
  });
  console.log(JSON.stringify(out, null, 2));
  const byRarity = {};
  for (const c of out) (byRarity[c.rarityClass] ||= new Set()).add(c.border);
  console.log('distinct border colours per rarity:', JSON.stringify(Object.fromEntries(Object.entries(byRarity).map(([k, v]) => [k, [...v]]))));
  await browser.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
