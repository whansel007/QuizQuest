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
  const room = server.heroLab.rooms.list().find((c) => c.playerCount() > 0);
  const player = [...room.players.values()][0];
  const hero = player.hero;
  let value = hero.attack;
  let writes = 0;
  Object.defineProperty(hero, 'attack', {
    configurable: true,
    get() { return value; },
    set(next) {
      writes += 1;
      if (writes <= 3) console.log('WRITE', next, (new Error().stack || '').split('\n').slice(1, 5).join(' | '));
      value = next;
    },
  });
  hero.attack = 13.2;
  console.log('assigned, now', hero.attack, 'writes', writes);
  await new Promise((res) => setTimeout(res, 600));
  console.log('after 600ms', hero.attack, 'writes', writes);
  await browser.close(); server.io.close(); server.httpServer.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
