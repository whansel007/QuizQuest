const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 1 });
  await page.goto('file:///C:/Users/William/Documents/GitHub/QuizQuest/public/hero-lab/icon-preview.html');
  await page.waitForTimeout(300);
  const el = await page.evaluateHandle(() => {
    const secs = [...document.querySelectorAll('section.hero')];
    return secs.find((s) => s.querySelector('h2').textContent.includes('Bombardier'));
  });
  await el.asElement().scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'scratch/_preview_bomb.png' });
  await browser.close();
  console.log('ok');
})();
