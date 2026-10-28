const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const { start } = require('../server');
(async () => {
  const server = start(0, { dataFile: null });
  await new Promise((r) => server.httpServer.once('listening', r));
  const BASE = `http://127.0.0.1:${server.httpServer.address().port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const r = await page.request.post(`${BASE}/api/login`, { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto(`${BASE}/hero-lab/world.html?heroId=pilot&create=1&profiler=1`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 20000 });
  await page.waitForTimeout(800);
  const room = server.heroLab.rooms.list().find((c) => [...c.players.values()].some((m) => m.heroId === 'pilot'));
  const player = [...room.players.values()][0];
  room.startRunNow();
  await page.waitForTimeout(700);
  const cd = player.hero.cooldowns.ultimate;
  cd.readyAt = Date.now() + cd.durationMs;
  cd.cutThisCycleMs = 0;
  player.pilotMechReady = false;
  room.debugSpawnEnemies(1, 40);
  console.log('killed', room.debugKillAll());
  await page.waitForTimeout(300);
  console.log('after kill: readyIn', cd.readyAt - Date.now(), 'mechReadyFlag', player.pilotMechReady, 'mechUntil-now', player.hero.mechUntil - Date.now());
  cd.readyAt = Date.now() - 1;
  for (let i = 0; i < 12; i += 1) {
    await page.waitForTimeout(60);
    const st = await page.evaluate(() => window.__heroLabKillTest?.aboveHero?.() || null);
    console.log(i, 'flag', player.pilotMechReady, 'readyIn', cd.readyAt - Date.now(), 'clientReady', JSON.stringify(st?.ready));
  }
  await browser.close(); server.io.close(); server.httpServer.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
