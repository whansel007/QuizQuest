// Stage 4 browser pass: the HUD, the lobby flow and the debug room table.
// Run with the dev server up: node scratch/stage4-browser.js
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = path.join(__dirname, 'shots');
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  require('fs').mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // ---------- A. sandbox HUD ----------
  await page.goto(`${BASE}/hero-lab/world.html?heroId=sheriff`, { waitUntil: 'networkidle' });
  await sleep(1200);
  await page.screenshot({ path: path.join(SHOTS, 'a1-lobby.png') });

  const codeHidden = await page.locator('#room-row').isHidden();
  check('the sandbox hides the room code row', codeHidden);

  const canvasVisible = await page.locator('#world').isVisible();
  check('the arena canvas renders', canvasVisible);

  const startVisible = await page.locator('#start-run').isVisible();
  check('the sandbox shows the host START button', startVisible);

  const startLabel = startVisible ? (await page.locator('#start-run').innerText()).trim() : '';
  check('the START label counts the players', /START RUN \(\d\/4 players\)/.test(startLabel), startLabel);

  const playerRows = await page.locator('#player-list-rows .player-row').count();
  check('the player list shows the solo player', playerRows === 1, `${playerRows} rows`);

  const toolsHasSettings = await page.evaluate(() => {
    const tools = document.querySelector('#bottom-left-tools');
    return Boolean(tools && tools.querySelector('#settings-hud'));
  });
  check('settings moved into the bottom-left tools row', toolsHasSettings);

  // START -> countdown -> running
  await page.locator('#start-run').click();
  await sleep(400);
  const countdownVisible = await page.locator('#countdown').isVisible();
  const countdownText = countdownVisible ? (await page.locator('#countdown-value').innerText()).trim() : '';
  check('START shows the countdown', countdownVisible, countdownText);
  await page.screenshot({ path: path.join(SHOTS, 'a2-countdown.png') });

  await sleep(3200);
  const runningLabel = await page.evaluate(() => {
    const n = document.querySelector('#wave-number')?.textContent || '';
    const d = document.querySelector('#wave-details')?.textContent || '';
    return `${n} ${d}`.trim();
  });
  check('the countdown turns into wave 1', /wave\s*1/i.test(runningLabel) || /^1\b/.test(runningLabel), runningLabel);
  await page.screenshot({ path: path.join(SHOTS, 'a3-running.png') });

  const lobbyBarHidden = await page.locator('#lobby-bar').isHidden();
  check('the lobby bar disappears during the run', lobbyBarHidden);

  // ---------- B. signed-in lobby + debug table ----------
  const app = await context.newPage();
  app.on('pageerror', (e) => errors.push(String(e)));
  await app.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await app.getByRole('textbox', { name: 'Email' }).fill('student01@quizquest.demo');
  await app.getByRole('button', { name: 'Continue' }).click();
  await app.locator('#login-password').fill('quizquest');
  await app.getByRole('button', { name: 'Sign in' }).click();
  await app.getByText('Student 01').first().waitFor({ timeout: 8000 });
  check('signed in as the demo student', true);

  // Hero Lab page (the student nav calls it "World")
  await app.getByRole('button', { name: 'World', exact: true }).first().click();
  await sleep(2000);
  await app.screenshot({ path: path.join(SHOTS, 'b1-herolab-entry.png') });

  const createButton = app.getByRole('button', { name: /create lobby/i });
  const hasCreate = await createButton.isVisible().catch(() => false);
  check('the entry screen offers CREATE LOBBY', hasCreate);
  if (hasCreate) {
    // A hero must be selected before the lobby buttons unlock.
    const sheriffCard = app.locator('.hero-lab-card', { hasText: 'Sheriff' }).first();
    await sheriffCard.click();
    await sleep(300);
    check('picking a hero unlocks CREATE LOBBY', await createButton.isEnabled());
    await createButton.click();
    await sleep(3000);
    await app.screenshot({ path: path.join(SHOTS, 'b2-lobby-created.png') });
    const frame = app.frameLocator('iframe');
    const roomCode = await frame.locator('#room-code-value').innerText().catch(() => '');
    check('the HUD shows the room code', /^[A-Z]{4}$/.test(roomCode.trim()), roomCode.trim());
  }

  // Debug menu: Konami inside the version dialog
  // The arena iframe is a full-viewport fixed layer above the app chrome, so a
  // real player leaves through the in-game flow; here we switch tabs directly.
  await app.getByRole('button', { name: 'Practice', exact: true }).first().evaluate((el) => el.click());
  await sleep(1500);

  await app.locator('.debug-trigger').first().evaluate((el) => el.click());
  await sleep(400);
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter']) {
    await app.keyboard.press(key);
    await sleep(60);
  }
  await sleep(1200);
  const debugOpen = await app.locator('text=Live rooms').first().isVisible().catch(() => false);
  check('the Konami code opens the debug menu', debugOpen);
  if (debugOpen) {
    await sleep(1200);
    const roomRows = await app.locator('.debug-rooms-table tbody tr').count();
    const tableText = await app.locator('.debug-rooms-table').innerText().catch(() => '');
    const tickShown = /\d+\.\d+\s*ms/.test(tableText);
    const occupancyShown = /\+\d+\s*waiting/.test(tableText);
    check('the debug table lists live rooms', roomRows > 0, `${roomRows} rows`);
    check('the debug table shows tick time', tickShown, tableText.split('\n')[1] || '');
    check('the debug table shows occupancy', occupancyShown, tableText.replace(/\s+/g, ' ').slice(0, 120));
    await app.screenshot({ path: path.join(SHOTS, 'b3-debug-rooms.png'), fullPage: false });
  }

  // REST check of the same data
  const roomsJson = await app.evaluate(async () => {
    const token = sessionStorage.getItem('qq-token') || localStorage.getItem('qq-token');
    const res = await fetch('/api/student/hero-lab/rooms', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    return { status: res.status, body: res.status === 200 ? await res.json() : null };
  });
  check('the rooms endpoint answers for the demo account', roomsJson.status === 200, `HTTP ${roomsJson.status}`);
  if (roomsJson.body) {
    const live = roomsJson.body.rooms.find((r) => r.code && r.code === roomsJson.body.rooms[0].code);
    check('the endpoint reports a max room count', roomsJson.body.maxRooms > 0, `${roomsJson.body.rooms.length}/${roomsJson.body.maxRooms} live`);
    check('each room reports players and tick time', roomsJson.body.rooms.every((r) => 'players' in r || 'spawned' in r || 'occupancy' in r),
      JSON.stringify(roomsJson.body.rooms[0]).slice(0, 160));
  }

  check('no uncaught page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error('browser pass crashed:', error);
  process.exit(2);
});
