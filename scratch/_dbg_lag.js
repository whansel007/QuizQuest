// Headed frame-time measurement: real GPU compositing + real vsync rAF.
// Reports idle and mass-kill-load frame stats plus the direct drawScene cost
// (which isolates the per-frame background blit, since it runs every frame
// regardless of entities).
const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  await p.goto('http://localhost:3000/hero-lab/world.html?heroId=sheriff&profiler=1', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__heroLabKillTest && window.__heroLabPerf, null, { timeout: 20000 });
  await p.waitForTimeout(2000); // join + settle
  const out = await p.evaluate(async () => {
    const k = window.__heroLabKillTest;
    const perf = window.__heroLabPerf;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const stats = () => {
      const frames = perf.exportTrace().frames;
      if (!frames.length) return null;
      const deltas = frames.map((f) => f.ms).sort((a, c) => a - c);
      const draws = frames.map((f) => f.draw).sort((a, c) => a - c);
      const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      const p95 = (a) => a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
      return {
        n: frames.length,
        frameAvgMs: +avg(deltas).toFixed(2),
        frameP95Ms: +p95(deltas).toFixed(2),
        frameWorstMs: +deltas[deltas.length - 1].toFixed(2),
        over16Ms: deltas.filter((d) => d > 16.7).length,
        drawAvgMs: +avg(draws).toFixed(2),
        drawWorstMs: +draws[draws.length - 1].toFixed(2),
      };
    };

    // 1. Steady state (lobby, no enemies): isolates the per-frame background blit.
    perf.reset();
    await sleep(3000);
    const idle = stats();

    // 2. Mass-kill load: 40 kills every 400ms for ~6s (15 bursts).
    perf.reset();
    for (let i = 0; i < 15; i += 1) {
      k.simulateKills(40);
      await sleep(400);
    }
    await sleep(300);
    const mass = stats();

    // 3. Direct drawScene cost with a clean entity slate (background+HUD only).
    k.clearEffects();
    const drawMedian = k.measureRenderMedian(60, 5);

    // 4. HUD probe: measureRender(1) spaced 110ms apart defeats the 100ms HUD
    //    throttle, so each call includes one updateHud. Control: the same calls
    //    spaced 30ms apart stay under the throttle (HUD skipped) -- if that is
    //    cheap, the 110ms cost really is updateHud, not cold-call overhead.
    //    First sample of each probe is discarded (its throttle state depends on
    //    the previous phase).
    let hudSum = 0;
    for (let i = 0; i < 11; i += 1) {
      const cost = k.measureRender(1);
      if (i > 0) hudSum += cost;
      await sleep(110);
    }
    let ctrlSum = 0;
    for (let i = 0; i < 11; i += 1) {
      const cost = k.measureRender(1);
      if (i > 0) ctrlSum += cost;
      await sleep(30);
    }
    const hudInclusiveAvg = hudSum / 10;
    const controlAvg = ctrlSum / 10;

    // 5. Functional check: the dirty-checked HUD must still render real values
    //    (first updateHud after join writes everything; caches start empty).
    const hud = {
      heroName: document.querySelector('#hero-name')?.textContent,
      healthValue: document.querySelector('#health-value')?.textContent,
      waveNumber: document.querySelector('#wave-number')?.textContent,
      waveDetails: document.querySelector('#wave-details')?.textContent,
      campfireValue: document.querySelector('#campfire-value')?.textContent,
      abilityNames: [...document.querySelectorAll('.ability-name')].map((el) => el.textContent),
      healthFillWidth: document.querySelector('#health-fill')?.style.width,
    };
    return { idle, mass, drawMedian, hudInclusiveAvg, controlAvg, hudCostEstimate: +(hudInclusiveAvg - controlAvg).toFixed(2), hud };
  });
  console.log(JSON.stringify({ out, errs }, null, 2));
  await b.close();
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
