// Touch smoke test for Campfire Run (docs/mobile/NOTES.md, Stage 5).
//
// Uses the arena sandbox (/hero-lab/world.html, no login) as a 667 x 375
// landscape phone with touch, and drives real multi-touch through the Chrome
// DevTools Protocol (Input.dispatchTouchEvent). The page's socket is wrapped
// before it loads so the test can read exactly which messages the touch
// controls send, and the hero's position from the server's state.
// Run: npm run test:mobile -- touch-smoke
import { test, expect } from '@playwright/test';

const PHONE = { viewport: { width: 667, height: 375 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

// Record every message the page sends and the latest state the server sends back.
function recordSocket() {
  window.__sent = [];
  let real;
  const wrap = (...args) => {
    const socket = real(...args);
    const emit = socket.emit.bind(socket);
    socket.emit = (name, ...data) => { window.__sent.push([name, ...data]); return emit(name, ...data); };
    socket.on('welcome', (welcome) => { window.__me = welcome?.id ?? welcome?.playerId ?? null; });
    socket.on('state', (snapshot) => { window.__state = snapshot; });
    return socket;
  };
  Object.defineProperty(window, 'io', { configurable: true, get: () => (real ? wrap : undefined), set: (value) => { real = value; } });
}

async function openArena(page, heroId) {
  await page.addInitScript(recordSocket);
  await page.goto(`/hero-lab/world.html?heroId=${heroId}`);
  await expect(page.locator('html')).toHaveClass(/touch-mode/);
  // joined: the server sent our id and a state that contains us
  await expect.poll(() => page.evaluate(() => Boolean(window.__state?.players?.some((p) => p.id === window.__me) || (window.__state?.players?.length && window.__sent.some(([n]) => n === 'join')))), { timeout: 20_000 }).toBe(true);
  const briefing = page.locator('#join-briefing');
  if (await briefing.isVisible()) await briefing.click();
  await expect(briefing).toBeHidden();
}

const me = (page) => page.evaluate(() => {
  const players = window.__state?.players || [];
  return players.find((p) => p.id === window.__me) || players[0] || null;
});
const sent = (page, name) => page.evaluate((n) => window.__sent.filter(([m]) => m === n), name);
const clearSent = (page) => page.evaluate(() => { window.__sent.length = 0; });

// Multi-touch through CDP: each finger is { x, y, id }.
async function touchSession(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  return {
    start: (points) => send('touchStart', points),
    move: (points) => send('touchMove', points),
    end: (points = []) => send('touchEnd', points),
    // one finger from a to b in small steps
    async drag(a, b, { id = 1, steps = 8 } = {}) {
      await send('touchStart', [{ ...a, id }]);
      for (let i = 1; i <= steps; i++) await send('touchMove', [{ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps, id }]);
    },
  };
}

async function centerOf(page, selector) {
  const box = await page.locator(selector).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.describe('touch controls in the arena (667 x 375 landscape)', () => {
  test.use(PHONE);

  test('dragging the left stick moves the hero', async ({ page }) => {
    await openArena(page, 'sheriff');
    const before = await me(page);
    const touch = await touchSession(page);
    await touch.drag({ x: 110, y: 270 }, { x: 190, y: 270 });
    // the stick sends the same digital movement WASD sends: right
    await expect.poll(async () => (await sent(page, 'input')).some(([, input]) => input.right && !input.left)).toBe(true);
    await expect.poll(async () => (await me(page)).x - before.x, { timeout: 10_000 }).toBeGreaterThan(30);
    await touch.end();
    await expect.poll(async () => (await sent(page, 'input')).at(-1)?.[1]).toEqual({ up: false, down: false, left: false, right: false });
  });

  test('tapping E sends the skill message', async ({ page }) => {
    await openArena(page, 'sheriff');
    await clearSent(page);
    const e = await centerOf(page, '[data-testid="ability-skill"] .ability-circle');
    const touch = await touchSession(page);
    await touch.start([{ ...e, id: 1 }]);
    await touch.end();
    await expect.poll(async () => (await sent(page, 'skill')).length).toBe(1);
    // auto-aim sent an aim vector first
    expect((await sent(page, 'aim')).length).toBeGreaterThan(0);
  });

  test('hold, drag and release on M1 fires in the dragged direction', async ({ page }) => {
    await openArena(page, 'sheriff');
    await clearSent(page);
    const m1 = await centerOf(page, '[data-testid="ability-weapon"] .ability-circle');
    const touch = await touchSession(page);
    await touch.drag(m1, { x: m1.x, y: m1.y - 80 }, { steps: 10 });
    await expect.poll(async () => (await sent(page, 'primary_hold')).some(([, held]) => held === true)).toBe(true);
    // the latest aim points up (the drag direction)
    await expect.poll(async () => { const aim = (await sent(page, 'aim')).at(-1)?.[1]; return aim ? aim.y < 0 && Math.abs(aim.y) > Math.abs(aim.x) : false; }).toBe(true);
    await touch.end();
    expect((await sent(page, 'fire')).some(([, mode]) => mode === 'primary')).toBe(true);
    await expect.poll(async () => (await sent(page, 'primary_hold')).at(-1)?.[1]).toBe(false);
  });

  test('releasing inside the cancel zone sends nothing', async ({ page }) => {
    await openArena(page, 'sheriff');
    await clearSent(page);
    const q = await centerOf(page, '[data-testid="ability-ultimate"] .ability-circle');
    const touch = await touchSession(page);
    await touch.drag(q, { x: q.x - 70, y: q.y - 40 });
    await expect(page.locator('[data-testid="ability-ultimate"]')).toHaveClass(/aiming/);
    // drag back onto the button, then let go
    for (let i = 1; i <= 6; i++) await touch.move([{ x: q.x - 70 + 70 * i / 6, y: q.y - 40 + 40 * i / 6, id: 1 }]);
    await expect(page.locator('[data-testid="ability-ultimate"]')).toHaveClass(/cancel-armed/);
    await touch.end();
    await expect(page.locator('[data-testid="ability-ultimate"]')).not.toHaveClass(/aiming/);
    expect(await sent(page, 'ultimate')).toEqual([]);
  });

  test('Bombardier: tap Q, then tap the arena to confirm', async ({ page }) => {
    await openArena(page, 'bombardier');
    await clearSent(page);
    const q = await centerOf(page, '[data-testid="ability-ultimate"] .ability-circle');
    const touch = await touchSession(page);
    await touch.start([{ ...q, id: 1 }]);
    await touch.end();
    await expect.poll(async () => (await sent(page, 'ultimate')).length).toBe(1);
    await expect(page.getByTestId('touch-cancel')).toBeVisible();
    await touch.start([{ x: 470, y: 120, id: 2 }]);
    await touch.end();
    await expect.poll(async () => (await sent(page, 'fire')).filter(([, mode]) => mode === 'secondary').length).toBe(1);
    const [, , point] = (await sent(page, 'fire')).find(([, mode]) => mode === 'secondary');
    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    await expect(page.getByTestId('touch-cancel')).toBeHidden();
  });

  test('Bombardier: the Cancel button backs out without confirming', async ({ page }) => {
    await openArena(page, 'bombardier');
    await clearSent(page);
    const q = await centerOf(page, '[data-testid="ability-ultimate"] .ability-circle');
    const touch = await touchSession(page);
    await touch.start([{ ...q, id: 1 }]);
    await touch.end();
    await expect(page.getByTestId('touch-cancel')).toBeVisible();
    const cancel = await centerOf(page, '[data-testid="touch-cancel"]');
    await touch.start([{ ...cancel, id: 2 }]);
    await touch.end();
    await expect.poll(async () => (await sent(page, 'cancel_targeting')).length).toBe(1);
    expect((await sent(page, 'fire')).filter(([, mode]) => mode === 'secondary')).toEqual([]);
  });

  test('a two-finger pinch on the arena changes the zoom and casts nothing', async ({ page }) => {
    await openArena(page, 'sheriff');
    await clearSent(page);
    const zoom = () => page.evaluate(() => Number(sessionStorage.getItem('hero-lab-touch-zoom') || 1));
    const before = await zoom();
    const touch = await touchSession(page);
    await touch.start([{ x: 400, y: 180, id: 1 }, { x: 480, y: 180, id: 2 }]);
    for (let i = 1; i <= 8; i++) await touch.move([{ x: 400 - 8 * i, y: 180, id: 1 }, { x: 480 + 8 * i, y: 180, id: 2 }]);
    await touch.end();
    await expect.poll(zoom).toBeGreaterThan(before + 0.3);
    for (const name of ['fire', 'skill', 'ultimate']) expect(await sent(page, name)).toEqual([]);
  });

  test('portrait shows the rotate prompt; landscape hides it', async ({ page }) => {
    await openArena(page, 'sheriff');
    await expect(page.getByTestId('rotate-overlay')).toBeHidden();
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByTestId('rotate-overlay')).toBeVisible();
    await page.setViewportSize({ width: 667, height: 375 });
    await expect(page.getByTestId('rotate-overlay')).toBeHidden();
  });

  test('the stats panel is hidden on touch and opens from the menu', async ({ page }) => {
    await openArena(page, 'sheriff');
    await expect(page.getByTestId('stats-panel')).toBeHidden();
    await expect(page.locator('#info-button')).toBeHidden();
    await page.getByTestId('touch-menu').tap();
    await page.getByTestId('touch-menu-sheet').getByRole('button', { name: /Information/ }).tap();
    await expect(page.getByTestId('stats-panel')).toBeVisible();
  });
});
