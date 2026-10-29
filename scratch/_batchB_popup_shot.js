// Capture the Sheriff Quick Draw clock popup mid-flight for visual review.
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const { start } = require('../server');

(async () => {
  const server = start(0, { dataFile: null });
  await new Promise((resolve) => server.httpServer.once('listening', resolve));
  const port = server.httpServer.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const r = await page.request.post(`${base}/api/login`, { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto(`${base}/hero-lab/world.html?heroId=sheriff&create=1`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 20000 });
  await page.waitForTimeout(1200);

  let room = null;
  for (const candidate of server.heroLab.rooms.list()) if (candidate.playerCount() > 0) room = candidate;
  const playerId = [...room.players.keys()][0];

  // Open the info card so both item 8 and item 9 are visible in one shot.
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(150);

  // Two merged refunds so the total reads "-0.8s".
  server.io.of('/hero-lab').emit('sheriff_cooldown_refund', { playerId, x: 0, y: 0, refundMs: 400, sourceAbility: 'primary' });
  await page.waitForTimeout(90);
  server.io.of('/hero-lab').emit('sheriff_cooldown_refund', { playerId, x: 0, y: 0, refundMs: 400, sourceAbility: 'primary' });
  await page.waitForTimeout(180);

  await page.screenshot({ path: 'scratch/_batchB_popup.png' });
  // Tight crop around the hero so the popup is easy to inspect.
  const hero = await page.evaluate(() => {
    const c = document.querySelector('#world');
    const rect = c.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  await page.screenshot({ path: 'scratch/_batchB_popup_crop.png',
    clip: { x: Math.max(0, hero.x - 220), y: Math.max(0, hero.y - 200), width: 440, height: 260 } });

  console.log('captured');
  await browser.close();
  server.io.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
