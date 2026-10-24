// Batch A verification (items 1-4). Run with the dev server up:
//   node scratch/_dbg_batch_a.js
const { chromium } = require('playwright');

const BASE = 'http://localhost:3000/hero-lab/world.html?heroId=sheriff&profiler=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  const out = {};

  // ---- Settings migration (item 3) --------------------------------------
  // Simulate an old (v1) saved profile: shakeIntensity 100, no version.
  await page.addInitScript(() => {
    localStorage.setItem('hero-lab-settings', JSON.stringify({ shakeIntensity: 100, screenShake: true }));
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__heroLabKillTest, null, { timeout: 20000 });
  await sleep(1200); // let the socket join so `me` is a real id
  out.migration = await page.evaluate(() => {
    const k = window.__heroLabKillTest;
    return { migratedFromOld100: k.shake().intensity };
  });

  // ---- Item 1: Thorns flash cadence + merged numbers ---------------------
  out.thorns = await page.evaluate(async () => {
    const k = window.__heroLabKillTest;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    k.clearEffects();
    // 30 aura ticks on ONE enemy, ~30ms apart (server tick rate). Count flash
    // STARTS (the until-value moving forward), not frames where a flash is
    // still active.
    let thornsFlashes = 0;
    let prev = 0;
    const thornsStartedAt = performance.now();
    for (let i = 0; i < 30; i += 1) {
      k.simulateHits(1, 0.34, undefined, { targetId: 't_thorns', sourceAbility: 'thorns' });
      const until = k.flashUntil('t_thorns');
      if (until > prev) { thornsFlashes += 1; prev = until; }
      await sleep(30);
    }
    const thornsElapsedMs = performance.now() - thornsStartedAt;
    const numbersAfterThorns = k.counts().numbers;
    // 30 normal hits on ONE enemy, ~30ms apart.
    k.clearEffects();
    let normalFlashes = 0;
    prev = 0;
    const normalStartedAt = performance.now();
    for (let i = 0; i < 30; i += 1) {
      k.simulateHits(1, 12, undefined, { targetId: 't_normal', sourceAbility: 'weapon' });
      const until = k.flashUntil('t_normal');
      if (until > prev) { normalFlashes += 1; prev = until; }
      await sleep(30);
    }
    const normalElapsedMs = performance.now() - normalStartedAt;
    // A normal hit well outside the cooldown must flash instantly.
    await sleep(300);
    const before = k.flashUntil('t_normal');
    k.simulateHits(1, 12, undefined, { targetId: 't_normal', sourceAbility: 'weapon' });
    const instantFlash = k.flashUntil('t_normal') > before;
    return {
      thornsFlashes, thornsElapsedMs: Math.round(thornsElapsedMs),
      thornsFlashesPerSecond: +(thornsFlashes / (thornsElapsedMs / 1000)).toFixed(2),
      normalFlashes, normalElapsedMs: Math.round(normalElapsedMs),
      numbersAfterThorns, instantFlash,
    };
  });

  // ---- Item 2: rings visible on the floor + telegraph render cost ---------
  out.rings = await page.evaluate(async () => {
    const k = window.__heroLabKillTest;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const canvas = document.querySelector('#world');
    const ctx = canvas.getContext('2d');
    const scale = canvas.width / 1920;
    const cf = { x: 960 * scale, y: 540 * scale };
    // Force one draw so the rings are on the canvas, then sample the annulus
    // around the heal ring (radius 150 world px). The stroke is blended with
    // the floor by the pulse alpha, so detect "clearly not floor green"
    // (blue channel at/above red) rather than the pure stroke color.
    k.measureRender(1);
    await sleep(50);
    const rMin = Math.floor(146 * scale), rMax = Math.ceil(154 * scale);
    const box = Math.ceil(rMax * 2);
    const data = ctx.getImageData(Math.floor(cf.x - rMax), Math.floor(cf.y - rMax), box, box).data;
    let mint = 0, floorGreen = 0, bestBlueMinusRed = -999;
    for (let y = 0; y < box; y += 1) {
      for (let x = 0; x < box; x += 1) {
        const i = (y * box + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const d = Math.hypot(x - rMax, y - rMax);
        if (d < rMin || d > rMax) continue;
        if (b - r > bestBlueMinusRed) bestBlueMinusRed = b - r;
        if (b >= r && g > 180) mint += 1;
        else if (b < r - 20) floorGreen += 1;
      }
    }
    // Render cost with both permanent rings + 4 simultaneous telegraphs. The
    // telegraphs use a long duration so they cannot expire mid-measurement.
    k.clearEffects();
    k.simulateAreaEffects(4, 130, 'enemy', 60000);
    const withTelegraphs = k.measureRenderMedian(60, 5);
    k.clearEffects();
    const ringsOnly = k.measureRenderMedian(60, 5);
    return { mintPixels: mint, floorPixels: floorGreen, bestBlueMinusRed, withTelegraphsMs: withTelegraphs, ringsOnlyMs: ringsOnly };
  });

  // ---- Item 3: shake ladder at 50/100/200% + the 40px cap ------------------
  out.shake = await page.evaluate(async () => {
    const k = window.__heroLabKillTest;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const result = {};
    for (const pct of [50, 100, 200]) {
      k.setShakeIntensity(pct);
      k.clearEffects();
      await sleep(700); // let trauma decay to 0
      k.simulateKills(1);
      result[`killAt${pct}`] = k.shake();
      await sleep(700);
      k.clearEffects();
      k.simulateKills(40); // mass kill -> trauma cap 0.6
      result[`massAt${pct}`] = k.shake();
      await sleep(900);
    }
    return result;
  });

  // ---- Item 4: perf overlay only inside Settings ---------------------------
  out.perf = await page.evaluate(async () => {
    const k = window.__heroLabKillTest;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const overlay = document.querySelector('#perf-overlay');
    const settingsPanel = document.querySelector('#settings-panel');
    const settingsButton = document.querySelector('#settings-button');
    const perfSetting = document.querySelector('#perf-setting');
    const rowText = () => (overlay && overlay.querySelector('div') ? overlay.querySelectorAll('div')[1]?.textContent || '' : '');
    const snap = () => ({
      perfVisible: window.__heroLabPerf ? window.__heroLabPerf.isVisible() : null,
      overlayDisplay: overlay ? overlay.style.display : 'missing',
      mountedInSettings: Boolean(document.querySelector('#perf-mount') && document.querySelector('#perf-mount').contains(overlay)),
      rowHasText: /frame/.test(overlay ? overlay.textContent : ''),
    });
    const initial = snap();
    // Open Settings: overlay must stay hidden until its own toggle is checked.
    settingsButton.click();
    await sleep(50);
    const settingsOpen = snap();
    perfSetting.click();
    await sleep(700); // let one overlay update land
    const statsOn = snap();
    // Close Settings: overlay must hide with it.
    settingsButton.click();
    await sleep(50);
    const settingsClosed = snap();
    return { initial, settingsOpen, statsOn, settingsClosed, settingsPanelHidden: settingsPanel.hidden };
  });

  out.pageErrors = errs;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
