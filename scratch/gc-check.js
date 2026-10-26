// STEP 2E/3 check: run ten mass kills back to back in a real browser page and
// watch JS heap + per-round draw cost. A leak shows as monotonic heap growth;
// healthy pooling shows a sawtooth (allocate, collect, allocate).
const path = require('path');
const { chromium } = require('playwright');
const { start } = require(path.resolve(__dirname, '..', 'server'));
const { io: connect } = require('socket.io-client');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = start(0, { dataFile: null });
  await new Promise((r) => server.httpServer.once('listening', r));
  const base = `http://localhost:${server.httpServer.address().port}`;

  const socket = connect(`${base}/hero-lab`, { transports: ['websocket'], forceNew: true });
  await new Promise((res, rej) => { socket.once('connect', res); socket.once('connect_error', rej); });
  socket.emit('join', { heroId: 'sheriff', create: true });
  const code = await new Promise((resolve) => {
    const h = (w) => { socket.off('welcome', h); resolve(w.room.code); };
    socket.on('welcome', h);
  });
  const room = server.heroLab.rooms.findByCode(code);
  room.startRunNow();
  await sleep(1200);

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`${base}/hero-lab/world.html?heroId=sheriff&room=${code}&profiler=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__heroLabPerf, null, { timeout: 20000 });
  await sleep(1500);

  const rounds = [];
  for (let i = 0; i < 10; i += 1) {
    room.debugSpawnEnemies(40);
    await sleep(700);
    await page.evaluate(() => window.__heroLabPerf.reset());
    room.debugKillAll();
    await sleep(900);
    const stats = await page.evaluate(() => {
      const trace = window.__heroLabPerf.exportTrace();
      const draws = trace.frames.map((f) => f.draw).filter(Number.isFinite).sort((a, b) => a - b);
      const mem = performance.memory;
      return {
        drawAvgMs: draws.length ? Math.round((draws.reduce((a, b) => a + b, 0) / draws.length) * 100) / 100 : null,
        drawWorstMs: draws.length ? Math.round(draws[draws.length - 1] * 100) / 100 : null,
        heapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
      };
    });
    rounds.push({ round: i + 1, ...stats });
  }

  console.log(JSON.stringify({ rounds, heapGrowthMb: rounds[9].heapMb - rounds[0].heapMb }, null, 2));
  await browser.close();
  socket.disconnect();
  server.io.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
