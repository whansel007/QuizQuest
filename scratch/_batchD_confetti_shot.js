const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const { start } = require('../server');
(async () => {
  const server = start(0, { dataFile: null });
  await new Promise((r) => server.httpServer.once('listening', r));
  const port = server.httpServer.address().port;
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const r = await page.request.post(`${base}/api/login`, { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto(`${base}/hero-lab/world.html?heroId=sheriff&create=1&profiler=1`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 20000 });
  const room = server.heroLab.rooms.list()[0];
  room.startRunNow();
  await page.waitForTimeout(1200);
  // Drop the one-time briefing so it does not cover the shot.
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('#join-briefing')?.remove());
  await page.evaluate(() => window.__heroLabKillTest.simulateBossKill());
  await page.waitForTimeout(420);
  await page.screenshot({ path: 'scratch/_batchD_confetti.png' });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'scratch/_batchD_confetti_late.png' });
  // Rest pill shot.
  for (let i = 0; i < 20 && room.breakInfo()?.phase !== 'rest'; i += 1) { room.clearWave(); await page.waitForTimeout(150); }
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'scratch/_batchD_rest_pill.png', clip: { x: 380, y: 0, width: 560, height: 180 } });
  await browser.close(); server.httpServer.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
