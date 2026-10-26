// Verification probe for the five follow-up fixes:
//  1. Amber highlight buttons turn bright gold (#ffd34f) when ready + all
//     skill/ultimate buttons breathe the ready-glow when ready.
//  2. Login wrench/version panel readable in light AND dark mode.
//  3. Explosion (detonation) no longer leaves a static black border.
//  4. Cooldown fill is a clockwise conic sweep.
//  5. Left-click (primary fire) confirms the Bombardier ultimate first.
// Usage: node scratch/_fixes_verify.js   (needs the Node server on :3000)
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const BASE = 'http://127.0.0.1:3000';
const OUT = __dirname;
const READY_GOLD = '#ffd34f';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

// Expected amber-highlight (non-weapon) slot per hero, from ABILITY_BTN_HIGHLIGHT.
const HERO_HIGHLIGHT = {
  sheriff: 'skill', pilot: 'ultimate', guardian: 'ultimate',
  bombardier: 'primary', bubbles: 'skill', electromancer: 'ultimate',
};

async function login(page) {
  const response = await page.request.post(`${BASE}/api/login`, { data: { userId: 's-01' } });
  const body = await response.json();
  const token = body.token || body.accessToken || (body.user && body.user.token);
  if (!token) throw new Error(`login failed: ${JSON.stringify(body).slice(0, 200)}`);
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
}

async function enterWorld(page, heroId) {
  await page.goto(`${BASE}/hero-lab/world.html?heroId=${heroId}&create=1`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 15000 });
  await page.waitForTimeout(700);
}

function hudState(page) {
  return page.evaluate(() => {
    const out = { slots: {}, root: {} };
    const root = getComputedStyle(document.documentElement);
    out.root.readyColor = root.getPropertyValue('--ready-highlight-color').trim();
    out.root.glowPeriod = root.getPropertyValue('--ready-glow-period').trim();
    for (const el of document.querySelectorAll('.ability[data-ability]')) {
      const circle = el.querySelector('.ability-circle');
      const cs = getComputedStyle(circle);
      out.slots[el.dataset.ability] = {
        fill: (circle.style.getPropertyValue('--fill-color') || '').trim(),
        fillPct: (circle.style.getPropertyValue('--fill') || '').trim(),
        ready: circle.classList.contains('ready'),
        highlightReady: el.classList.contains('highlight-ready'),
        animation: cs.animationName,
        backgroundImage: cs.backgroundImage.slice(0, 60),
      };
    }
    return out;
  });
}

(async () => {
  const browser = await chromium.launch();
  const warnings = [];
  const pageErrors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(`${m.type()}: ${m.text()}`); });
  await login(page);

  // ============ 1. HUD: ready glow, gold ready fill, sweep (per hero) ============
  // Fresh page load per hero: a brand-new room starts with every ability
  // ready, which makes the ready-state checks deterministic (no swap races).
  for (const heroId of ['sheriff', 'guardian', 'pilot', 'bombardier', 'bubbles', 'electromancer']) {
    await enterWorld(page, heroId);
    const hud = await hudState(page);
    const hl = HERO_HIGHLIGHT[heroId];
    for (const slot of ['weapon', 'skill', 'ultimate']) {
      const s = hud.slots[slot];
      const isHl = slot === hl;
      const label = `${heroId} ${slot}`;
      // Ready state at load (fresh hero in the lobby).
      check(`${label} is ready at load`, s.ready === true, `fill=${s.fillPct}`);
      if (isHl && slot !== 'weapon') {
        check(`${label} (amber) turns gold when ready`,
          s.highlightReady === true && s.fill.toLowerCase() === READY_GOLD,
          `highlightReady=${s.highlightReady} fill=${s.fill}`);
      }
      if (slot === 'weapon') {
        // The weapon re-arms between shots: it must NOT strobe to gold.
        check(`${label} (weapon) never gets highlight-ready`,
          s.highlightReady === false && s.fill.toLowerCase() !== READY_GOLD,
          `highlightReady=${s.highlightReady} fill=${s.fill}`);
        check(`${label} (weapon) has no ready glow`, !s.animation.includes('ready-glow'), s.animation);
      } else {
        check(`${label} breathes ready-glow when ready`,
          s.ready ? s.animation.includes('ready-glow') : true, `animation=${s.animation}`);
      }
    }
  }
  const rootVars = await page.evaluate(() => ({
    c: getComputedStyle(document.documentElement).getPropertyValue('--ready-highlight-color').trim(),
    p: getComputedStyle(document.documentElement).getPropertyValue('--ready-glow-period').trim(),
  }));
  check('root --ready-highlight-color is #ffd34f', rootVars.c === READY_GOLD, rootVars.c);
  check('root --ready-glow-period is 1s (1000ms)', rootVars.p === '1s' || rootVars.p === '1000ms', rootVars.p);

  // ============ 2. Bombardier: M1 confirms, explosion border, sweep live ============
  await enterWorld(page, 'bombardier');
  const geom = await page.evaluate(() => {
    const r = document.querySelector('#world').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const tx = Math.round(geom.x + geom.w * 0.5);
  const ty = Math.round(geom.y + geom.h * 0.62);

  // -- cast the ultimate, then confirm with LEFT click (primary fire) --
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(450);
  const hintBefore = await page.evaluate(() => !document.querySelector('#targeting-hint')?.hidden);
  check('targeting hint visible after Q', hintBefore === true);

  const beforeLeft = await hudState(page);
  await page.mouse.move(tx, ty);
  await page.mouse.click(tx, ty, { button: 'left' });
  await page.waitForTimeout(300);
  const afterLeft = await hudState(page);
  check('LEFT-click confirms the strike (hint hides)',
    afterLeft.slots.ultimate.fillPct !== beforeLeft.slots.ultimate.fillPct,
    `ult fill ${beforeLeft.slots.ultimate.fillPct} -> ${afterLeft.slots.ultimate.fillPct}`);
  check('LEFT-click starts the ultimate cooldown',
    parseFloat(afterLeft.slots.ultimate.fillPct) < 90,
    `ult fill=${afterLeft.slots.ultimate.fillPct}`);
  check('LEFT-click does NOT fire the weapon',
    parseFloat(afterLeft.slots.weapon.fillPct) >= 99,
    `weapon fill=${afterLeft.slots.weapon.fillPct}`);
  check('cooling ultimate renders the conic sweep',
    afterLeft.slots.ultimate.backgroundImage.startsWith('conic-gradient'),
    afterLeft.slots.ultimate.backgroundImage);

  // -- per-frame ring-band sampling of the detonation (fix 3) --
  // The bright ring travels 0.6R -> 1.0R during the 200ms detonation, so the
  // sampling window spans the whole travel path (R-70 .. R+8) to catch it.
  const trace = await page.evaluate(async ({ tx, ty }) => {
    const c = document.querySelector('#world');
    const ctx = c.getContext('2d');
    const scale = c.width / 1920;
    const R = 280 * scale;
    const k = c.width / c.getBoundingClientRect().width;
    const px = tx * k, py = ty * k;
    const frames = [];
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const t = performance.now() - t0;
        let nonFloor = 0, dark = 0, yellow = 0, red = 0;
        for (let deg = 0; deg < 360; deg += 3) {
          const a = (deg * Math.PI) / 180;
          for (let dr = -70; dr <= 8; dr += 3) {
            const x = Math.round(px + Math.cos(a) * (R + dr));
            const y = Math.round(py + Math.sin(a) * (R + dr));
            if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
            const d = ctx.getImageData(x, y, 1, 1).data;
            const r = d[0], g = d[1], b = d[2];
            const floor = g > 140 && g > r + 30 && g > b + 30;
            if (!floor) nonFloor++;
            if (r < 110 && g < 110 && b < 110) dark++;
            if (r > 200 && g > 150 && b < 110) yellow++;
            if (r > 180 && g < 110 && b < 110) red++;
          }
        }
        frames.push({ t: Math.round(t), nonFloor, dark, yellow, red });
        if (t < 1200) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    return frames;
  }, { tx, ty });

  console.log('\n  ring-band trace (t ms | nonFloor dark yellow red):');
  for (const f of trace) {
    if (f.nonFloor > 40 || f.dark > 5 || f.yellow > 5) {
      console.log(`  ${String(f.t).padStart(5)} | ${String(f.nonFloor).padStart(8)} ${String(f.dark).padStart(4)} ${String(f.yellow).padStart(6)} ${String(f.red).padStart(3)}`);
    }
  }
  // Detonation window: the telegraph's full-radius under-stroke reads as a
  // constant dark ring (dark > 50); once it disappears the detonation has
  // begun. Deriving the window from the trace keeps it timing-robust.
  const lastTelegraph = Math.max(0, ...trace.filter((f) => f.dark > 50).map((f) => f.t));
  const boom = trace.filter((f) => f.t > lastTelegraph + 30);
  const maxDark = Math.max(0, ...boom.map((f) => f.dark));
  const maxYellow = Math.max(0, ...boom.map((f) => f.yellow));
  const blackRingFrames = boom.filter((f) => f.dark > 100 && f.yellow === 0).length;
  console.log(`  (telegraph ended ~t=${lastTelegraph}ms; detonation frames: ${boom.length})`);
  check('detonation shows the bright ring (yellow > 30 somewhere)', maxYellow > 30, `maxYellow=${maxYellow}`);
  check('no all-black ring frames during detonation', blackRingFrames === 0, `frames=${blackRingFrames}`);
  check('dark ring pixels stay low (was ~250-289 before the fix)', maxDark < 150, `maxDark=${maxDark}`);
  await page.screenshot({ path: `${OUT}/_fixes_detonation.png` });

  // -- right-click confirm still works (regression) on a fresh page --
  await enterWorld(page, 'bombardier');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(450);
  await page.mouse.move(tx, ty);
  await page.mouse.click(tx, ty, { button: 'right' });
  await page.waitForTimeout(300);
  const afterRight = await hudState(page);
  check('RIGHT-click still confirms the strike',
    parseFloat(afterRight.slots.ultimate.fillPct) < 90,
    `ult fill=${afterRight.slots.ultimate.fillPct}`);

  // ============ 3. Sweep direction screenshot (freeze the HUD loop first) ============
  const sweepInfo = await page.evaluate(async () => {
    // Stop the rAF-driven HUD refresh so the forced styles survive, letting the
    // in-flight frame finish first.
    const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    await new Promise((r) => setTimeout(r, 250));
    const rects = {};
    for (const el of document.querySelectorAll('.ability[data-ability]')) {
      const circle = el.querySelector('.ability-circle');
      circle.style.transition = 'none';
      circle.style.setProperty('--fill', '25%');
      circle.style.setProperty('--fill-color', '#ff0000');
      circle.classList.remove('ready', 'ready-pulse', 'locked');
      el.classList.remove('highlight-ready');
      const r = circle.getBoundingClientRect();
      rects[el.dataset.ability] = { cx: r.x + r.width / 2, cy: r.y + r.height / 2, inner: r.width / 2 - 4 };
    }
    window.__origRaf = orig;
    return rects;
  });
  await page.screenshot({ path: `${OUT}/_fixes_sweep.png` });
  const fs = require('node:fs');
  fs.writeFileSync(`${OUT}/_fixes_sweep_points.json`, JSON.stringify(sweepInfo, null, 2));
  console.log('\nsweep screenshot saved (_fixes_sweep.png); sample points in _fixes_sweep_points.json');

  // ============ 4. Login wrench panel: light + dark ============
  const panelColors = async (colorScheme) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/`);
    await p.waitForSelector('.qq-link[aria-label="Tools and version"]', { timeout: 15000 });
    await p.click('.qq-link[aria-label="Tools and version"]');
    await p.waitForSelector('.qq-debug-panel', { timeout: 8000 });
    const colors = await p.evaluate(() => {
      const panel = document.querySelector('.qq-debug-panel');
      const cs = getComputedStyle(panel);
      return { bg: cs.backgroundColor, color: cs.color };
    });
    await ctx.close();
    return colors;
  };
  const light = await panelColors('light');
  const dark = await panelColors('dark');
  console.log(`\nlogin panel light: bg=${light.bg} text=${light.color}`);
  console.log(`login panel dark:  bg=${dark.bg} text=${dark.color}`);

  const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (fg, bg) => {
    const a = fg[3] ?? 1, b = bg[3] ?? 1;
    const comp = (f, b, af, ab) => f.slice(0, 3).map((v, i) => v * af + b[i] * (1 - af) * ab);
    const fgc = comp(fg, bg, a, b), bgc = b >= 1 ? bg.slice(0, 3) : bg.slice(0, 3).map((v, i) => v * b + 255 * (1 - b));
    const l1 = lum(fgc), l2 = lum(bgc);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  // Composite the translucent panel over the backdrop: light page -> white base, dark page -> black base.
  const over = (base) => (fg) => fg.slice(0, 3).map((v, i) => v * (fg[3] ?? 1) + base[i] * (1 - (fg[3] ?? 1)));
  const lightContrast = contrast(parse(light.color), [...over([255, 255, 255])(parse(light.bg)), 1]);
  const darkContrast = contrast(parse(dark.color), [...over([0, 0, 0])(parse(dark.bg)), 1]);
  check('login panel text readable in LIGHT mode (>=4.5:1)', lightContrast >= 4.5, `${lightContrast.toFixed(1)}:1`);
  check('login panel text readable in DARK mode (>=4.5:1)', darkContrast >= 4.5, `${darkContrast.toFixed(1)}:1`);
  check('dark-mode panel is NOT white-on-white', lum(parse(dark.color)) > 0.4 && lum(over([0, 0, 0])(parse(dark.bg))) < 0.1,
    `textLum=${lum(parse(dark.color)).toFixed(2)} bgLum=${lum(over([0, 0, 0])(parse(dark.bg))).toFixed(3)}`);

  await browser.close();

  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
  if (pageErrors.length) console.log('PAGE ERRORS:', pageErrors);
  if (warnings.length) console.log('CONSOLE WARNINGS/ERRORS:', warnings.slice(0, 10));
  const failed = results.filter((r) => !r.ok);
  if (failed.length || pageErrors.length) {
    console.log('FAILED:', failed.map((f) => f.name).join(' | ') || '(page errors)');
    process.exit(1);
  }
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
