// STEP 3 re-measurement: 4 players (3 headless sockets + 1 real browser page)
// + 40 enemies + a one-tick mass kill (Bombardier-ultimate / Electromancer-chain
// scale). Reports server tick and network cost around the kill, plus the
// browser client's per-frame draw cost measured by the in-page profiler.
//
// Note on headless: Chromium throttles requestAnimationFrame, so rAF *deltas*
// are scheduling artifacts. The profiler's per-frame `draw` value is timed with
// performance.now() around drawScene and is the reliable client cost signal.
const path = require('path');
const { chromium } = require('playwright');
const { start } = require(path.resolve(__dirname, '..', 'server'));
const { io: connect } = require('socket.io-client');

const HEROES = ['sheriff', 'electromancer', 'bombardier', 'guardian'];

function waitFor(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { socket.off(event, h); reject(new Error(`timeout ${event}`)); }, timeoutMs);
    function h(p) { clearTimeout(t); socket.off(event, h); resolve(p); }
    socket.on(event, h);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = start(0, { dataFile: null });
  await new Promise((r) => server.httpServer.once('listening', r));
  const base = `http://localhost:${server.httpServer.address().port}`;

  // 1. The first headless player creates the room; the rest join by code.
  const sockets = [];
  const first = connect(`${base}/hero-lab`, { transports: ['websocket'], forceNew: true });
  first.on('connect_error', (e) => console.error('connect_error', String(e)));
  await new Promise((res, rej) => { first.once('connect', res); first.once('connect_error', rej); });
  const welcomePromise = waitFor(first, 'welcome');
  first.emit('join', { heroId: HEROES[0], create: true });
  const welcome = await welcomePromise;
  const code = welcome.room.code;
  const room = server.heroLab.rooms.findByCode(code);
  sockets.push(first);
  for (let i = 1; i < 3; i += 1) {
    const socket = connect(`${base}/hero-lab`, { transports: ['websocket'], forceNew: true });
    socket.on('connect_error', (e) => console.error('connect_error', String(e)));
    await new Promise((res, rej) => { socket.once('connect', res); socket.once('connect_error', rej); });
    socket.emit('join', { heroId: HEROES[i], roomCode: code });
    sockets.push(socket);
  }

  // 2. The fourth player is a real browser page (the measured client).
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  await page.goto(`${base}/hero-lab/world.html?heroId=${HEROES[3]}&room=${code}&profiler=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__heroLabPerf && window.__heroLabKillTest, null, { timeout: 20000 });

  // 3. Wait until all four players are in the room, then start the run.
  for (let i = 0; i < 40 && room.playerCount() < 4; i += 1) await sleep(250);
  const players = room.playerCount();
  room.startRunNow();
  await sleep(1500);

  // 4. Baseline (run going, no stress enemies yet).
  const base0 = room.debugInfo();
  const bytesT0 = base0.bytesSent;
  const t0 = Date.now();

  // 5. Stress: 40 enemies.
  const spawned = room.debugSpawnEnemies(40);
  await sleep(1800);
  const stressed = room.debugInfo();
  const bytesT1 = stressed.bytesSent;
  const t1 = Date.now();

  // 6. Mass kill: every enemy dies in one tick. Reset the profiler window so
  //    the trace covers only the kill burst, then read it back.
  await page.evaluate(() => window.__heroLabPerf.reset());
  const killed = room.debugKillAll();
  await sleep(1500);
  const afterKill = room.debugInfo();
  const bytesT2 = afterKill.bytesSent;
  const t2 = Date.now();

  // 7. Worst case: three mass kills back to back.
  const killRounds = [];
  for (let round = 0; round < 3; round += 1) {
    room.debugSpawnEnemies(40);
    await sleep(900);
    await page.evaluate(() => window.__heroLabPerf.reset());
    const roundKilled = room.debugKillAll();
    await sleep(1200);
    const info = room.debugInfo();
    const trace = await page.evaluate(() => window.__heroLabPerf.exportTrace());
    const frames = trace.frames.filter((f) => Number.isFinite(f.draw));
    const draws = frames.map((f) => f.draw).sort((a, b) => a - b);
    const deltas = frames.map((f) => f.ms).sort((a, b) => a - b);
    // Worst frame by draw cost, with its rAF delta alongside: a big delta with
    // a small draw is headless scheduling noise, not render cost.
    const worstDraw = frames.reduce((a, b) => (b.draw > a.draw ? b : a), frames[0]);
    const quality = await page.evaluate(() => window.__heroLabKillTest.quality());
    killRounds.push({
      killed: roundKilled,
      frames: frames.length,
      drawAvgMs: draws.length ? Math.round((draws.reduce((a, b) => a + b, 0) / draws.length) * 100) / 100 : null,
      drawWorstMs: draws.length ? Math.round(draws[draws.length - 1] * 100) / 100 : null,
      drawP95Ms: draws.length ? Math.round(draws[Math.floor(draws.length * 0.95)] * 100) / 100 : null,
      deltaAvgMs: deltas.length ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100 : null,
      deltaWorstMs: deltas.length ? Math.round(deltas[deltas.length - 1] * 100) / 100 : null,
      worstDrawFrame: worstDraw ? { drawMs: Math.round(worstDraw.draw * 100) / 100, deltaMs: Math.round(worstDraw.ms * 100) / 100 } : null,
      quality,
    });
  }

  const result = {
    players,
    spawned,
    killed,
    tickIntervalMs: Math.round((1000 / 30) * 100) / 100,
    baseline: { tickAvgMs: base0.tickAvgMs, tickWorstMs: base0.tickWorstMs, bytesSent: base0.bytesSent },
    stressed40Enemies: { tickAvgMs: stressed.tickAvgMs, tickWorstMs: stressed.tickWorstMs, bytesSent: stressed.bytesSent },
    massKillTick: { tickAvgMs: afterKill.tickAvgMs, tickWorstMs: afterKill.tickWorstMs, bytesSent: afterKill.bytesSent },
    bytesPerSecond: {
      baselineToStressed: Math.round((bytesT1 - bytesT0) / Math.max(1, (t1 - t0) / 1000)),
      stressedToMassKill: Math.round((bytesT2 - bytesT1) / Math.max(1, (t2 - t1) / 1000)),
    },
    killRounds,
    pageErrors,
  };
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  for (const socket of sockets) socket.disconnect();
  server.io.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
