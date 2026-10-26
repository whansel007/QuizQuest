// Screenshot the static Stage-1 preview page (file://) for visual verification.
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 1400 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('file:///C:/Users/William/Documents/GitHub/QuizQuest/public/hero-lab/icon-preview.html');
  await page.waitForTimeout(400);

  const stats = await page.evaluate(() => ({
    swatches: document.querySelectorAll('.swatch').length,
    chosen: document.querySelectorAll('.swatch.chosen').length,
    alts: document.querySelectorAll('.swatch:not(.chosen)').length,
    svgs: document.querySelectorAll('.swatch svg').length,
    // every inline SVG must actually paint something (non-empty path data)
    empty: [...document.querySelectorAll('.swatch svg path')].filter((p) => !p.getAttribute('d') || !p.getAttribute('d').length).length,
  }));
  console.log('stats', JSON.stringify(stats));

  await page.screenshot({ path: 'scratch/_preview_top.png' });
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.screenshot({ path: 'scratch/_preview_mid.png' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: 'scratch/_preview_end.png' });
  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
