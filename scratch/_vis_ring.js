// Precise ring probe: at each stage of the bombardier ultimate, find the
// dashed circle on the canvas by scanning for its stroke colors, report its
// centre/radius/colors, and screenshot.
// Usage: node scratch/_vis_ring.js   (needs the Node server on :3000)
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const BASE = 'http://127.0.0.1:3000';

// Scan the canvas for pixels close to a target color; return their bbox and
// the mean radius from the bbox centre.
const FIND = `(target, tol) => {
  const c = document.querySelector('#world');
  const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height).data;
  const pts = [];
  for (let y = 0; y < c.height; y += 2) {
    for (let x = 0; x < c.width; x += 2) {
      const i = (y * c.width + x) * 4;
      if (Math.abs(img[i] - target[0]) <= tol && Math.abs(img[i+1] - target[1]) <= tol && Math.abs(img[i+2] - target[2]) <= tol) {
        pts.push([x, y]);
      }
    }
  }
  if (!pts.length) return null;
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const [x, y] of pts) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let r = 0; for (const [x, y] of pts) r += Math.hypot(x - cx, y - cy);
  return { count: pts.length, bbox: [minX, minY, maxX, maxY], center: [Math.round(cx), Math.round(cy)], meanR: Math.round(r / pts.length) };
}`;

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
  const ty = Math.round(geom.y + geom.h * 0.55);

  const find = (color, tol) => page.evaluate(`(${FIND})(${JSON.stringify(color)}, ${tol})`);

  const stages = [];
  const shot = async (label) => {
    const yellow = await find([255, 201, 60], 30);   // telegraph/telegraph-detonation yellow #FFC93C
    const orange = await find([255, 189, 88], 25);   // aiming circle #ffbd58
    const hint = await page.evaluate(() => document.querySelector('#targeting-hint')?.hidden === false);
    stages.push({ label, hint, yellow, orange });
    await page.screenshot({ path: `${__dirname}/_vis_ring_${label}.png` });
    console.log(label, JSON.stringify({ hint, yellow, orange }));
  };

  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(300);
  await shot('1_targeting');

  await page.mouse.move(tx, ty);
  await page.waitForTimeout(150);
  await shot('2_aim');

  await page.mouse.click(tx, ty, { button: 'right' });
  await page.waitForTimeout(200);
  await shot('3_telegraph_early');

  await page.waitForTimeout(500);
  await shot('4_detonation');

  await page.waitForTimeout(700);
  await shot('5_after');

  await page.waitForTimeout(1500);
  await shot('6_later');

  await browser.close();
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
