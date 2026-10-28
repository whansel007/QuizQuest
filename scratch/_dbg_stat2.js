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
  await page.waitForTimeout(900);
  const rooms = server.heroLab.rooms.list();
  console.log('rooms:', rooms.length, rooms.map((x) => x.id));
  const room = rooms.find((c) => c.playerCount() > 0);
  const player = [...room.players.values()][0];
  const heroRef = player.hero;
  player.hero.attack = 13.2;
  for (let i = 0; i < 6; i += 1) {
    await new Promise((res) => setTimeout(res, 150));
    const now = room.players.get(player.id);
    console.log(i, 'samePlayer', now === player, 'sameHero', now?.hero === heroRef, 'attack', now?.hero?.attack, 'phase', room.phase());
  }
  await browser.close(); server.io.close(); server.httpServer.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
