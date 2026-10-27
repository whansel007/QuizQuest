// Verify Batch B items 8 & 9:
//   8. Sheriff Quick Draw refund now shows a clock-emoji popup above the hero
//      (the old "-0.4s" HUD label is gone).
//   9. The "?" how-to-play button is fused into the I-key hero info card.
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
  await page.goto(`${base}/hero-lab/world.html?heroId=sheriff&create=1`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 20000 });
  await page.waitForTimeout(1200);

  console.log('\n=== Item 9: how-to-play fused into the I-key info card ===');

  const briefingButton = await page.$('#briefing-button');
  check('old "?" #briefing-button is removed', !briefingButton);

  const label = await page.$('.cooldown-refund-label');
  check('old ".cooldown-refund-label" element is removed', !label);

  // The one-time onboarding overlay must still exist (unchanged behaviour).
  const joinBriefing = await page.$('#join-briefing');
  check('#join-briefing onboarding overlay still exists', !!joinBriefing);

  // Info card starts closed.
  let panelHidden = await page.$eval('#stats-panel', (el) => el.hidden);
  check('info card starts hidden', panelHidden === true);

  // Press I -> opens.
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(250);
  panelHidden = await page.$eval('#stats-panel', (el) => el.hidden);
  check('pressing I opens the info card', panelHidden === false);
  const expanded = await page.$eval('#info-button', (el) => el.getAttribute('aria-expanded'));
  check('info button reports aria-expanded=true', expanded === 'true', expanded);

  const howto = await page.$('#howto-card');
  check('#howto-card exists (How to play card)', !!howto);
  const howtoText = howto ? await howto.textContent() : '';
  check('how-to heading present', /How to play/i.test(howtoText), howtoText.slice(0, 60));
  check('how-to lead "Defend the campfire!"', /Defend the campfire!/i.test(howtoText));
  check('tip: green ring heals', /green ring to heal/i.test(howtoText));
  check('tip: momentum damage', /\+20% damage/i.test(howtoText));
  check('tip: controls', /WASD move/i.test(howtoText));
  const tipCount = await page.$$eval('#howto-card .briefing-tip', (els) => els.length);
  check('all 3 how-to tips are present', tipCount === 3, `count=${tipCount}`);

  // Two STACKED cards: How to play on TOP, stats BELOW.
  const howtoBox = await page.$eval('#howto-card', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const statsBox = await page.$eval('#stats-card', (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  check('How to play card sits ABOVE the stats card', howtoBox.y + howtoBox.h <= statsBox.y + 1,
    `howtoBottom=${Math.round(howtoBox.y + howtoBox.h)} statsTop=${Math.round(statsBox.y)}`);
  check('both cards share the same left edge', Math.abs(howtoBox.x - statsBox.x) < 2,
    `${Math.round(howtoBox.x)} vs ${Math.round(statsBox.x)}`);
  check('both cards fit inside 1280x720', howtoBox.y >= 0 && statsBox.y + statsBox.h <= 720,
    `top=${Math.round(howtoBox.y)} bottom=${Math.round(statsBox.y + statsBox.h)}`);

  // The stats are still there too (a second card, not replaced).
  const statHealth = await page.$eval('#stat-health', (el) => el.textContent);
  check('stats still render in the lower card', /\d+\s*\/\s*\d+/.test(statHealth), statHealth);

  // Close button closes both.
  await page.click('#info-close');
  await page.waitForTimeout(180);
  panelHidden = await page.$eval('#stats-panel', (el) => el.hidden);
  check('close button closes both cards', panelHidden === true);

  // Esc also closes.
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(180);
  panelHidden = await page.$eval('#stats-panel', (el) => el.hidden);
  check('Esc closes both cards', panelHidden === true);

  // Press I again -> closes.
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(200);
  panelHidden = await page.$eval('#stats-panel', (el) => el.hidden);
  check('pressing I again closes the cards', panelHidden === true);

  // The one-time join briefing tells the player I brings it back.
  const joinText = await page.$eval('#join-briefing', (el) => el.textContent);
  check('join briefing mentions "Press I any time"', /Press I any time/i.test(joinText));

  console.log('\n=== Item 8: Quick Draw clock popup above the hero ===');

  // Find the live room + the local player id.
  let room = null;
  for (const candidate of server.heroLab.rooms.list()) {
    if (candidate.playerCount() > 0) room = candidate;
  }
  if (!room) {
    // Fall back: scan known room codes from the page's room-code HUD.
    const code = await page.$eval('#room-code-value', (el) => el.textContent.trim());
    room = server.heroLab.rooms.findByCode(code);
  }
  check('found the live room', !!room);
  const playerId = room ? [...room.players.keys()][0] : null;
  check('found the local player id', !!playerId, String(playerId));

  // Sample the canvas for sheriff-highlight pixels (#fff1b8) above the hero.
  async function highlightPixels() {
    return page.evaluate(() => {
      const canvas = document.querySelector('#world');
      if (!canvas) return -1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return -1;
      const w = canvas.width, h = canvas.height;
      // The hero sits near the canvas centre; look at the band above it.
      const x0 = Math.max(0, Math.floor(w * 0.35));
      const x1 = Math.min(w, Math.floor(w * 0.65));
      const y0 = Math.max(0, Math.floor(h * 0.25));
      const y1 = Math.min(h, Math.floor(h * 0.52));
      const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
      let hits = 0;
      for (let i = 0; i < data.length; i += 4) {
        const rr = data[i], gg = data[i + 1], bb = data[i + 2];
        // #fff1b8 = 255,241,184 — allow a small tolerance.
        if (rr > 235 && gg > 215 && gg < 252 && bb > 150 && bb < 215) hits++;
      }
      return hits;
    });
  }

  const before = await highlightPixels();
  check('canvas is readable', before >= 0, `before=${before}`);

  // Fire a real refund broadcast at the page's player.
  server.io.of('/hero-lab').emit('sheriff_cooldown_refund', {
    playerId, x: 0, y: 0, refundMs: 400, sourceAbility: 'primary',
  });
  await page.waitForTimeout(220);
  const during = await highlightPixels();

  check('clock popup paints highlight pixels above the hero', during > before + 20, `before=${before} during=${during}`);

  // The popup must expire (SHERIFF_REFUND_POPUP_MS = 800 ms).
  await page.waitForTimeout(1100);
  const after = await highlightPixels();
  check('popup fades away after ~800 ms', after <= before + 20, `before=${before} after=${after}`);

  await page.screenshot({ path: 'scratch/_batchB_items89.png' });

  check('no page errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  console.log(`\n${fail === 0 ? '\x1b[32mALL PASS\x1b[0m' : '\x1b[31mFAILURES\x1b[0m'}: ${ok} passed, ${fail} failed`);
  await browser.close();
  server.io.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
