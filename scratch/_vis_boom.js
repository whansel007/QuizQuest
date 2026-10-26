// Catch the explosion detonation frame: sample the canvas every animation
// frame after confirming the airstrike and record the ring-band colors over
// time, so the exact detonation frame is captured.
// Usage: node scratch/_vis_boom.js   (needs the Node server on :3000)
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const BASE = 'http://127.0.0.1:3000';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

  const response = await page.request.post(`${BASE}/api/login`, { data: { userId: 's-01' } });
  const body = await response.json();
  const token = body.token || body.accessToken || (body.user && body.user.token);
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);

  await page.goto(`${BASE}/hero-lab/world.html?heroId=bombardier&create=1`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 15000 });
  await page.waitForTimeout(800);

  const geom = await page.evaluate(() => {
    const c = document.querySelector('#world');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const tx = Math.round(geom.x + geom.w * 0.5);
  const ty = Math.round(geom.y + geom.h * 0.62);

  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(300);
  await page.mouse.move(tx, ty);
  await page.mouse.click(tx, ty, { button: 'right' });

  // Sample the ring band (full radius 280 world = 187 screen px) every frame
  // for 1.2s; keep the frame with the most non-floor pixels in the band.
  const trace = await page.evaluate(async ({ tx, ty }) => {
    const c = document.querySelector('#world');
    const ctx = c.getContext('2d');
    const scale = c.width / 1920;
    const R = 280 * scale;
    const px = tx * (c.width / c.getBoundingClientRect().width);
    const py = ty * (c.width / c.getBoundingClientRect().width);
    const frames = [];
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const t = performance.now() - t0;
        let nonFloor = 0; let dark = 0; let yellow = 0; let red = 0;
        for (let deg = 0; deg < 360; deg += 3) {
          const a = (deg * Math.PI) / 180;
          for (let dr = -8; dr <= 8; dr += 2) {
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

  console.log('t(ms)  nonFloor  dark  yellow  red');
  for (const f of trace) {
    if (f.nonFloor > 40 || f.dark > 5 || f.yellow > 5) console.log(`${String(f.t).padStart(5)}  ${String(f.nonFloor).padStart(8)}  ${String(f.dark).padStart(4)}  ${String(f.yellow).padStart(6)}  ${String(f.red).padStart(3)}`);
  }

  // Now re-run the cast and screenshot at the detonation peak (~660ms).
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(250);
  await page.mouse.move(tx, ty);
  await page.mouse.click(tx, ty, { button: 'right' });
  await page.waitForTimeout(660);
  await page.screenshot({ path: `${__dirname}/_vis_boom_detonation.png` });
  console.log('saved _vis_boom_detonation.png');

  await browser.close();
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
