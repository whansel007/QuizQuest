// Visual probe: bombardier ultimate flow (targeting -> confirm -> telegraph ->
// detonation) plus explosion visuals. Screenshots land in scratch/.
// Usage: node scratch/_vis_ult.js   (needs the Node server on :3000)
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const BASE = 'http://127.0.0.1:3000';
const OUT = __dirname;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERROR:', m.text()); });

  const response = await page.request.post(`${BASE}/api/login`, { data: { userId: 's-01' } });
  const body = await response.json();
  const token = body.token || body.accessToken || (body.user && body.user.token);
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);

  await page.goto(`${BASE}/hero-lab/world.html?heroId=bombardier&create=1`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 15000 });
  await page.waitForTimeout(800);

  // Centre of the arena in world coordinates.
  const canvas = await page.evaluate(() => {
    const c = document.querySelector('#world');
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  const cx = canvas.x + canvas.w * 0.5;
  const cy = canvas.y + canvas.h * 0.55;

  // 1. Cast the ultimate -> targeting mode.
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(400);
  const targeting = await page.evaluate(() => {
    const me = window.__qqMe?.();
    return document.querySelector('#targeting-hint')?.hidden === false;
  });
  console.log('targeting hint visible:', targeting);
  await page.screenshot({ path: `${OUT}/_vis_ult_1_targeting.png` });

  // Move the pointer over the arena (aim circle follows it), then confirm with
  // a RIGHT-click first to see the current confirm path.
  await page.mouse.move(cx, cy);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/_vis_ult_2_aim.png` });

  await page.mouse.click(cx, cy, { button: 'right' });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/_vis_ult_3_telegraph.png` });

  // Wait for the detonation frame.
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/_vis_ult_4_detonation.png` });

  // Let it finish and check the HUD cooldown state.
  await page.waitForTimeout(1200);
  const hud = await page.evaluate(() => {
    const q = document.querySelector('.ability[data-ability="ultimate"] .ability-circle');
    const cs = getComputedStyle(q);
    return { fill: cs.getPropertyValue('--fill'), background: cs.background.slice(0, 120), ready: q.classList.contains('ready') };
  });
  console.log('ultimate HUD after cast:', JSON.stringify(hud));
  await page.screenshot({ path: `${OUT}/_vis_ult_5_cooldown.png` });

  // 2. Primary fire during targeting (second cast) — what happens today?
  await page.waitForTimeout(500);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(300);
  await page.mouse.move(cx + 60, cy - 40);
  await page.mouse.click(cx + 60, cy - 40, { button: 'left' });
  await page.waitForTimeout(400);
  const afterLeft = await page.evaluate(() => {
    const q = document.querySelector('.ability[data-ability="ultimate"] .ability-circle');
    return {
      targeting: document.querySelector('#targeting-hint')?.hidden === false,
      ultimateFill: getComputedStyle(q).getPropertyValue('--fill'),
      weaponFill: getComputedStyle(document.querySelector('.ability[data-ability="weapon"] .ability-circle')).getPropertyValue('--fill'),
    };
  });
  console.log('after LEFT-click during targeting:', JSON.stringify(afterLeft));
  await page.screenshot({ path: `${OUT}/_vis_ult_6_leftclick.png` });

  await browser.close();
})().catch((e) => { console.error('PROBE FAILED:', e); process.exit(1); });
