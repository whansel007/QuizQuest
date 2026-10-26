// Pixel probe: sample the telegraph ring colors straight off the game canvas.
// Arena is 1920x1080 drawn into a 1280x720 canvas (scale 2/3), and the canvas
// fills the viewport, so screen px == canvas px.
// Usage: node scratch/_vis_pixels.js   (needs the Node server on :3000)
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

  const canvas = await page.evaluate(() => {
    const c = document.querySelector('#world');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const tx = Math.round(canvas.x + canvas.w * 0.5);   // confirm target (screen)
  const ty = Math.round(canvas.y + canvas.h * 0.55);
  const scale = canvas.w / 1920;
  const ringR = Math.round(280 * scale);              // airstrike circleRadius

  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(300);
  await page.mouse.move(tx, ty);
  await page.mouse.click(tx, ty, { button: 'right' });
  await page.waitForTimeout(300);

  const report = await page.evaluate(({ tx, ty, ringR }) => {
    const c = document.querySelector('#world');
    const ctx = c.getContext('2d');
    const dpr = c.width / c.getBoundingClientRect().width;
    const px = tx * dpr, py = ty * dpr, R = ringR * dpr;
    const counts = new Map();
    for (let deg = 0; deg < 360; deg += 1) {
      const a = (deg * Math.PI) / 180;
      for (let dr = -6; dr <= 6; dr++) {
        const x = Math.round(px + Math.cos(a) * (R + dr));
        const y = Math.round(py + Math.sin(a) * (R + dr));
        if (x < 0 || y < 0 || x >= c.width || y >= c.height) continue;
        const d = ctx.getImageData(x, y, 1, 1).data;
        const key = `${d[0]},${d[1]},${d[2]}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
    return { dpr, canvas: [c.width, c.height], top };
  }, { tx, ty, ringR });

  console.log('dpr:', report.dpr, 'canvas:', report.canvas.join('x'));
  console.log('top colors in the telegraph ring band (rgb: pixel count):');
  for (const [k, v] of report.top) console.log(`  rgb(${k}): ${v}`);

  await page.screenshot({ path: `${__dirname}/_vis_pixels.png` });
  await browser.close();
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
