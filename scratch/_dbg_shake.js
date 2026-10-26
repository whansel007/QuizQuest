// Debug verification for the own-attack camera shake (hit kick + kill kick).
// Uses only the ?profiler=1 harness API. Decay is linear at SHAKE_DECAY = 1.8/s,
// so 450ms between scenarios fully zeroes trauma (worst case 0.6 -> 333ms).
// Part 2 proves the RENDERED canvas moves: it diffs a background-only corner
// strip of #world between a trauma-0 draw and a post-kill draw.
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('http://localhost:3000/hero-lab/world.html?heroId=sheriff&profiler=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__heroLabKillTest, null, { timeout: 20000 });
  const out = await p.evaluate(async () => {
    const k = window.__heroLabKillTest;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const waitDecay = () => sleep(450);
    const results = {};
    const snap = (label) => { results[label] = k.shake(); };

    // ---- Part 1: magnitude ladder (trauma -> px at the current calibration) ----
    k.simulateHits(1, 40, 'other-player');
    snap('otherPlayerHit');
    await waitDecay();

    k.simulateHits(1, 12);
    snap('weakHit');
    await waitDecay();

    k.simulateHits(1, 40);
    snap('strongHit');
    await waitDecay();

    k.simulateHits(1, 40);
    await sleep(50);
    k.simulateHits(1, 40);
    snap('rapidHits');
    await waitDecay();

    k.simulateHits(1, 40);
    await sleep(150);
    k.simulateHits(1, 40);
    snap('spacedHits');
    await waitDecay();

    k.simulateKills(1);
    snap('singleKill');
    await sleep(400);
    snap('singleKillDecayed');

    k.simulateKills(40);
    snap('massKill');
    await sleep(1200);
    snap('massKillDecayed');

    // ---- Part 2: rendered motion proof ----
    const canvas = document.querySelector('#world');
    const ctx = canvas.getContext('2d');
    // A corner strip far from the kill point (400,300): background checkerboard
    // only, so any pixel change can only come from the camera translate.
    const grabStrip = () => Array.from(ctx.getImageData(0, 4, 256, 1).data);
    const diffCount = (a, c) => { let d = 0; for (let i = 0; i < a.length; i += 1) if (a[i] !== c[i]) d += 1; return d; };

    await waitDecay();
    k.measureRender(1); // one draw at trauma 0
    const baseline = grabStrip();
    results.readoutSane = baseline.some((v) => v !== 0);

    // A kill sets trauma ~0.39 -> ~3px translate. smoothShakeNoise can pass
    // through ~0, so retry with fresh timestamps until the strip moves.
    let moved = 0;
    let attempts = 0;
    for (let i = 0; i < 10 && moved === 0; i += 1) {
      await waitDecay();
      k.simulateKills(1);
      k.measureRender(1); // draw immediately, before decay
      moved = diffCount(baseline, grabStrip());
      attempts += 1;
    }
    results.renderedPixelDiff = { differingBytes: moved, attempts };

    // Mass kill at the trauma cap -> largest translate; prove the strip still
    // moves and nothing throws.
    await waitDecay();
    k.simulateKills(40);
    k.measureRender(1);
    results.massPixelDiff = { differingBytes: diffCount(baseline, grabStrip()) };
    return results;
  });
  console.log(JSON.stringify({ out, errs }, null, 2));
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
