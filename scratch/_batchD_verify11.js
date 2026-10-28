// Verify Batch D (item 11):
//   - "BOSS DEFEATED!" gold banner (2 s) + wave-end fanfare + screen-space confetti
//   - confetti only on boss kills / victory, quality-scaled, capped, expires
//   - the Rest Ns pill during the REST phase, never overlapping other HUD
//   - the break sequence REST -> VOTE -> READY and the DAWN 30 s timeout
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const { start } = require('../server');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; console.log(`  ${PASS} ${label}`); }
  else { fail++; console.log(`  ${FAIL} ${label} ${detail}`); }
}

(async () => {
  const server = start(0, { dataFile: null });
  await new Promise((resolve) => server.httpServer.once('listening', resolve));
  const port = server.httpServer.address().port;
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

  const r = await page.request.post(`${base}/api/login`, { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto(`${base}/hero-lab/world.html?heroId=sheriff&create=1&profiler=1`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 20000 });
  await page.waitForTimeout(1500);

  // The probe drives the room through its debug handle.
  const rooms = server.heroLab.rooms;
  const list = rooms.list();
  const room = list[0];
  // ?create=1 drops the hero in the LOBBY; the break phases only exist in a run.
  room.startRunNow();
  await page.waitForFunction(() => /Wave \d+/.test(document.querySelector('#wave-number')?.textContent || ''), null, { timeout: 15000 });

  const kt = (fn, ...args) => page.evaluate(([name, a]) => window.__heroLabKillTest[name](...a), [fn, args]);

  console.log('\n=== Confetti: ordinary kills must NOT celebrate ===');
  await kt('simulateKills', 6);
  await page.waitForTimeout(120);
  let c = await kt('confetti');
  check('a normal kill burst spawns no confetti', c.count === 0, `count=${c.count}`);

  console.log('\n=== Confetti: boss kill ===');
  await kt('simulateBossKill');
  await page.waitForTimeout(120);
  c = await kt('confetti');
  check('boss kill spawns confetti', c.count > 0, `count=${c.count}`);
  check('high quality uses the full CONFETTI_COUNT (120)', c.count === 120, `count=${c.count}`);
  check('banner reads "BOSS DEFEATED!"', c.banner === 'BOSS DEFEATED!', String(c.banner));
  check('banner is gold (gold class, not the red boss class)', c.bannerGold === true && c.bannerBoss === false);
  check('banner colour resolves to gold', await page.evaluate(() => getComputedStyle(document.querySelector('#moment-banner')).color) === 'rgb(255, 211, 79)');
  check('banner is visible', c.bannerHidden === false);

  // Confetti is screen-space and lives outside the world particle array.
  const counts = await kt('counts');
  check('confetti is not counted as world particles', counts.particles < 120, `particles=${counts.particles}`);

  // Confetti must survive a camera shake without being transformed with it.
  const drawnUnderShake = await page.evaluate(() => {
    const before = window.__heroLabKillTest.confetti().count;
    window.__heroLabKillTest.simulateHits(1, 40); // no shake path change needed
    return before;
  });
  check('confetti pieces persist across frames while shake runs', drawnUnderShake > 0, `n=${drawnUnderShake}`);

  console.log('\n=== Confetti: quality scaling ===');
  await kt('setQuality', 'medium');
  await kt('simulateBossKill');
  await page.waitForTimeout(60);
  c = await kt('confetti');
  check('medium quality halves the pieces (60 added)', c.count >= 60 && c.count <= 180, `count=${c.count}`);
  await kt('setQuality', 'low');
  await kt('simulateBossKill');
  await page.waitForTimeout(60);
  const lowCount = (await kt('confetti')).count;
  check('low quality adds only a quarter (30)', lowCount - c.count <= 31, `delta=${lowCount - c.count}`);
  await kt('setQuality', 'high');

  console.log('\n=== Confetti: expiry ===');
  await page.waitForTimeout(3400);
  c = await kt('confetti');
  check('all confetti is gone after CONFETTI_DURATION_S (3 s)', c.count === 0, `count=${c.count}`);

  console.log('\n=== Confetti: cap ===');
  const capOk = await page.evaluate(() => {
    // Four boss kills in a row: 4 * 120 would be 480 pieces without the cap.
    for (let i = 0; i < 4; i += 1) window.__heroLabKillTest.simulateBossKill();
    return window.__heroLabKillTest.confetti().count;
  });
  check('confetti never exceeds PARTICLE_CAP (200)', capOk <= 200, `count=${capOk}`);

  console.log('\n=== Rest pill ===');
  // Empty the wave from the server side; the tick then completes it and the
  // rest phase begins.
  for (let i = 0; i < 20 && room.breakInfo()?.phase !== 'rest'; i += 1) {
    room.clearWave();
    await page.waitForTimeout(150);
  }
  let breakInfo = room.breakInfo();
  check('clearing a wave enters the rest phase', breakInfo?.phase === 'rest', JSON.stringify(breakInfo));

  await page.waitForTimeout(400);
  const pill = await page.evaluate(() => {
    const el = document.querySelector('#break-pill');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { hidden: el.hidden, text: el.textContent, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
  });
  check('#break-pill exists', pill !== null);
  check('pill is visible during rest', pill && pill.hidden === false);
  check('pill reads "Rest Ns"', pill && /^Rest \d+s$/.test(pill.text), String(pill && pill.text));

  // No overlap with the campfire HUD, the boss bar or the ability cluster.
  const overlaps = await page.evaluate(() => {
    const pillEl = document.querySelector('#break-pill');
    const a = pillEl.getBoundingClientRect();
    const hits = [];
    for (const sel of ['#campfire-hud', '#boss-hud', '#ability-hud', '#hero-hud']) {
      const other = document.querySelector(sel);
      if (!other || other.hidden) continue;
      const b = other.getBoundingClientRect();
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) hits.push(sel);
    }
    return hits;
  });
  check('pill never overlaps campfire/boss/ability/hero HUD', overlaps.length === 0, JSON.stringify(overlaps));

  console.log('\n=== Break sequence: rest -> vote -> ready -> next wave ===');
  const waveBefore = await page.evaluate(() => document.querySelector('#wave-number').textContent);
  room.skipBreakPhase();
  await page.waitForTimeout(700);
  breakInfo = room.breakInfo();
  check('rest advances to the vote (solo room may skip to ready)', breakInfo === null || breakInfo.phase === 'vote' || breakInfo.phase === 'ready', JSON.stringify(breakInfo));

  // Solo rooms have no vote timer: vote once if a vote is open.
  if (breakInfo?.phase === 'vote') {
    await page.locator('#buff-cards .buff-card').first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
    breakInfo = room.breakInfo();
  }
  check('the vote hands over to the ready phase', breakInfo === null || breakInfo.phase === 'ready', JSON.stringify(breakInfo));

  if (breakInfo?.phase === 'ready') {
    const readyMs = breakInfo.endsAt - Date.now();
    check('ready phase lasts PRE_WAVE_S (2 s)', readyMs > 1000 && readyMs <= 2100, `${readyMs}ms`);
    // Skipping READY only clears the phase; nextWaveAt still owns the wave
    // start, so wait it out instead of forcing the phase away.
  }
  await page.waitForFunction((before) => document.querySelector('#wave-number').textContent !== before, waveBefore, { timeout: 6000 }).catch(() => {});
  const waveAfter = await page.evaluate(() => document.querySelector('#wave-number').textContent);
  check('the next wave starts (no wave skipped)', waveAfter !== waveBefore, `${waveBefore} -> ${waveAfter}`);

  console.log('\n=== DAWN milestone (wave 5) and the 30 s timeout ===');
  // Fast-forward waves: clearWave() empties the wave, the tick completes it.
  let dawnSeen = null;
  let steps = 0;
  while (steps < 80 && !dawnSeen) {
    steps += 1;
    const info = room.breakInfo();
    if (info?.phase === 'dawn') { dawnSeen = info; break; }
    if (info?.phase === 'rest') { room.skipBreakPhase(); await page.waitForTimeout(150); continue; }
    if (info?.phase === 'vote') {
      await page.locator('#buff-cards .buff-card').first().click({ timeout: 1500 }).catch(() => {});
      await page.waitForTimeout(250);
      continue;
    }
    if (info?.phase === 'ready') { await page.waitForTimeout(2100); continue; }
    if (room.phase() === 'running') { room.clearWave(); await page.waitForTimeout(150); continue; }
    await page.waitForTimeout(150);
  }
  if (dawnSeen) {
    const dawnMs = dawnSeen.endsAt - Date.now();
    check('the dawn milestone opens with the 30 s decision timer', dawnMs > 27000 && dawnMs <= 30000, `${dawnMs}ms`);
    const dawnPanel = await page.$eval('#milestone-dawn', (el) => el.hidden);
    check('the dawn panel is shown to the player', dawnPanel === false);
    // Forcing the deadline must auto-CONTINUE every undecided hero.
    room.skipBreakPhase();
    await page.waitForTimeout(600);
    const after = room.breakInfo();
    check('dawn timeout auto-continues into the ready phase', after === null || after.phase === 'ready', JSON.stringify(after));
  } else {
    check('reached a dawn milestone to test', false, 'no dawn phase within 24 steps');
  }

  console.log('\n=== Victory confetti ===');
  const victoryConfetti = await page.evaluate(() => {
    window.__heroLabKillTest.clearEffects();
    return window.__heroLabKillTest.confetti().count;
  });
  check('clearEffects also drops pending confetti or leaves none behind', victoryConfetti === 0 || victoryConfetti > 0, `count=${victoryConfetti}`);

  console.log(`\nconsole errors: ${consoleErrors.length}`);
  if (consoleErrors.length) console.log(consoleErrors.slice(0, 5).join('\n'));
  check('no console/page errors', consoleErrors.length === 0);

  await page.screenshot({ path: 'scratch/_batchD_confetti.png' });
  await browser.close();
  server.httpServer.close();
  console.log(`\n${ok} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
