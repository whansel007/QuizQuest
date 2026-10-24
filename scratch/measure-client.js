// STEP 1 measurement (robust): calibrate the per-unit draw cost of each effect
// entity (particles, death sprites, damage numbers) with a warmed-up median
// run, then isolate each effect's draw contribution with explicit, budget-
// bypassing fills (so the 300-particle cap cannot saturate and hide deltas).
//
// Headless Chromium uses a software 2D canvas, so absolute ms are higher than a
// GPU browser; the RELATIVE cost (and the per-entity calibration) is the signal.
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:3000';
const ITER = Number(process.env.ITER || 60);
const RUNS = Number(process.env.RUNS || 5);

// Per 40-kill burst, from ARENA_TUNING (game-config.js):
//   impactSparks  -> 3..4  particles/kill  (avg 3.5) -> plain arcs
//   deathBurst    -> 6..10 particles/kill  (avg 8)   -> emoji glyphs
//   death sprites -> 1 per kill
//   damage numbers-> 1 per kill (when enabled)
const KILLS = 40;
const SPARKS = Math.round(KILLS * 3.5);     // 140
const DEATHBURST = KILLS * 8;               // 320
const SPRITES = KILLS;                       // 40
const NUMBERS = KILLS;                       // 40

// Each scenario defines the EXACT entity set to draw (budget-bypassing) and the
// toggle state drawScene should honour, so the measured delta is this effect's
// own draw cost and nothing else.
const SCENARIOS = [
  { label: 'ALL ON',         parts: SPARKS + DEATHBURST, plain: false, sprites: SPRITES, numbers: NUMBERS, off: null },
  { label: 'burst OFF',      parts: SPARKS,              plain: false, sprites: 0,       numbers: NUMBERS, off: 'burst' },
  { label: 'numbers OFF',    parts: SPARKS + DEATHBURST, plain: false, sprites: SPRITES, numbers: 0,       off: 'numbers' },
  { label: 'sparks OFF',     parts: DEATHBURST,          plain: false, sprites: SPRITES, numbers: NUMBERS, off: 'sparks' },
  { label: 'sound OFF',      parts: SPARKS + DEATHBURST, plain: false, sprites: SPRITES, numbers: NUMBERS, off: 'sound' },
  { label: 'combo OFF',      parts: SPARKS + DEATHBURST, plain: false, sprites: SPRITES, numbers: NUMBERS, off: 'combo' },
  { label: 'knockback OFF',  parts: SPARKS + DEATHBURST, plain: false, sprites: SPRITES, numbers: NUMBERS, off: 'knockback' },
  { label: 'shake OFF',      parts: SPARKS + DEATHBURST, plain: false, sprites: SPRITES, numbers: NUMBERS, off: 'shake' },
  { label: 'flash OFF',      parts: SPARKS + DEATHBURST, plain: false, sprites: SPRITES, numbers: NUMBERS, off: 'flash' },
  { label: 'ALL OFF',        parts: 0,                   plain: false, sprites: 0,       numbers: 0,       off: 'ALL' },
];

(async () => {
  const log = (m) => process.stderr.write(m + '\n');
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/hero-lab/world.html?heroId=sheriff&profiler=1`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__heroLabKillTest, null, { timeout: 20000 });

  const evalT = (fn, arg) => page.evaluate(fn, arg);

  // --- Calibration: per-entity incremental cost -------------------------
  const calib = await evalT(({ iter, runs }) => {
    const k = window.__heroLabKillTest;
    k.clearEffects();
    const B = k.measureRenderMedian(iter, runs);
    k.fillParticles(250, false);
    const P = k.measureRenderMedian(iter, runs);
    k.fillSprites(40);
    const S = k.measureRenderMedian(iter, runs);
    k.fillNumbers(30);
    const N = k.measureRenderMedian(iter, runs);
    return { B, P, S, N, budget: k.counts().budget };
  }, { iter: ITER, runs: RUNS });
  const particleMs = (calib.P - calib.B) / 250;
  const spriteMs = (calib.S - calib.P) / 40;
  const numberMs = (calib.N - calib.S) / 30;
  log(`budget=${calib.budget}`);
  log(`calib: B=${calib.B.toFixed(3)} P=${calib.P.toFixed(3)} S=${calib.S.toFixed(3)} N=${calib.N.toFixed(3)}`);
  log(`per-unit: particle=${particleMs.toFixed(4)} sprite=${spriteMs.toFixed(4)} number=${numberMs.toFixed(4)}`);

  // --- Realistic budget-capped ALL ON (via the real kill path) -----------
  const realistic = await evalT(({ iter, runs }) => {
    const k = window.__heroLabKillTest;
    k.clearEffects();
    k.simulateKills(40);
    k.freezeLife();
    return { ms: Math.round(k.measureRenderMedian(iter, runs) * 1000) / 1000, counts: k.counts() };
  }, { iter: ITER, runs: RUNS });
  log(`realistic capped ALL ON: ${realistic.ms}ms ${JSON.stringify(realistic.counts)}`);

  // --- Isolated per-effect draw cost -------------------------------------
  async function scenario(s) {
    return evalT((sc) => {
      const t = window.__heroLabPerf;
      for (const key of ['burst', 'numbers', 'sound', 'combo', 'sparks', 'knockback', 'shake', 'flash']) t.toggle(key, true);
      if (sc.off === 'ALL') { for (const key of ['burst', 'numbers', 'sound', 'combo', 'sparks', 'knockback', 'shake', 'flash']) t.toggle(key, false); }
      else if (sc.off) t.toggle(sc.off, false);
      const k = window.__heroLabKillTest;
      k.clearEffects();
      k.fillParticles(sc.parts, sc.plain);
      k.fillSprites(sc.sprites);
      k.fillNumbers(sc.numbers);
      k.freezeLife();
      const renderMs = Math.round(k.measureRenderMedian(60, 5) * 1000) / 1000;
      return { renderMs, counts: k.counts() };
    }, s);
  }

  const results = [];
  for (const sc of SCENARIOS) {
    const r = await scenario(sc);
    results.push({ label: sc.label, ...r });
    log(`  ${sc.label}: ${r.renderMs}ms ${JSON.stringify(r.counts)}`);
  }

  console.log(JSON.stringify({
    calibration: {
      backgroundMs: Math.round(calib.B * 1000) / 1000,
      perParticleMs: Math.round(particleMs * 1e4) / 1e4,
      perSpriteMs: Math.round(spriteMs * 1e4) / 1e4,
      perNumberMs: Math.round(numberMs * 1e4) / 1e4,
      budget: calib.budget,
    },
    realisticCappedAllOn: realistic,
    scenarios: results,
    errors,
  }, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
