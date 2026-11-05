// Kingdom town walk test (docs/mobile/fixes/F2.md).
//
// Drives the avatar with the touch stick (real CDP touches) or the keyboard
// from the spawn point up the north-west trail past the BATTLES sign, through
// the gap in the tree line, to the northern end of the path and to every
// door, and fails if the avatar ever stops moving for more than 0.5 s while
// input is held. It also checks sliding along colliders when pressing
// diagonally, and the camera clamp at the clearing's top edge on a phone.
//
// The page is opened with ?debug=colliders, which draws the collider overlay
// and exposes a read-only window.__qqTown handle (player, camera, route).
// Run: npm run test:mobile -- town-walk
import { test, expect } from '@playwright/test';
import { PASSWORD, STUDENT } from '../../e2e/helpers.js';

const STALL_MS = 500;
const TOWN_DOORS = ['castle', 'garden', 'library', 'tower', 'workshop'];
const CAMP_DOORS = ['duel', 'campfire'];
// Beside the BATTLES sign, right of the trail: open grass where the avatar used
// to stop dead at the tree line (x 434..474 was outside the old 48 px gap).
// x 435..447 also keeps clear of the sign post (x 468).
const SIGN_SIDE = { x: 441, y: 200 };
const atSignSide = (s) => Math.abs(s.x - SIGN_SIDE.x) < 6 && Math.abs(s.y - SIGN_SIDE.y) < 12;

async function openTown(page) {
  // the first-visit tour pauses the town: mark it as seen
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItem(key) {
      return String(key).startsWith('qq-kingdom-intro-seen:') ? '1' : get.call(this, key);
    };
  });
  await page.goto('/?debug=colliders');
  await page.getByRole('textbox', { name: 'Email' }).fill(STUDENT.email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.town-canvas')).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__qqTown));
  await page.locator('.town-canvas').focus();
}

// The next animation frame's player position, page time and camera.
const sample = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => {
  const t = window.__qqTown;
  resolve({ ...t.player(), t: performance.now(), camera: t.camera(), view: t.view(), zone: t.zone(), door: t.nearDoor() });
})));

// ---- input drivers: { set({ up, down, left, right }), release() } -------------

function keyDriver(page) {
  const held = new Set();
  const KEY = { up: 'w', down: 's', left: 'a', right: 'd' };
  return {
    async set(dir) {
      const want = new Set(Object.keys(KEY).filter((d) => dir[d]).map((d) => KEY[d]));
      for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k); }
      for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
    },
    async release() { await this.set({}); },
  };
}

async function stickDriver(page) {
  const toggle = page.getByTestId('town-stick-toggle');
  if ((await toggle.getAttribute('aria-pressed')) !== 'true') await toggle.click();
  const box = await page.getByTestId('town-stick').boundingBox();
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  let down = false;
  let last = '';
  return {
    async set(dir) {
      const dx = (dir.right ? 1 : 0) - (dir.left ? 1 : 0);
      const dy = (dir.down ? 1 : 0) - (dir.up ? 1 : 0);
      const key = `${dx},${dy}`;
      if (key === last) return;
      last = key;
      if (!dx && !dy) { if (down) { await touch('touchEnd', []); down = false; } return; }
      const len = Math.hypot(dx, dy);
      const point = { x: centre.x + (dx / len) * 40, y: centre.y + (dy / len) * 40, id: 1 };
      if (!down) { await touch('touchStart', [{ ...centre, id: 1 }]); down = true; }
      await touch('touchMove', [point]);
    },
    async release() { await this.set({}); },
  };
}

// ---- walking -------------------------------------------------------------------

// Hold `dir` until done(sample) is true; fail on a stall over STALL_MS.
async function hold(page, drive, dir, done, { timeoutMs = 15_000, label = 'hold' } = {}) {
  let s = await sample(page);
  let lastMove = s;
  const start = s.t;
  await drive.set(dir);
  while (!done(s)) {
    s = await sample(page);
    if (Math.hypot(s.x - lastMove.x, s.y - lastMove.y) > 0.01) lastMove = s;
    expect(s.t - lastMove.t, `${label}: stalled at (${s.x.toFixed(1)}, ${s.y.toFixed(1)})`).toBeLessThan(STALL_MS);
    expect(s.t - start, `${label}: timed out at (${s.x.toFixed(1)}, ${s.y.toFixed(1)})`).toBeLessThan(timeoutMs);
  }
  await drive.release();
  return s;
}

// Follow the town's own route (the tap-to-move grid) to a point with 8-way
// input; `arrived(sample)` ends the walk (default: within 10 px of the point).
async function walkTo(page, drive, target, { arrived, label = 'walk' } = {}) {
  const route = await page.evaluate(([x, y]) => window.__qqTown.route(x, y), [target.x, target.y]);
  expect(route.length, `${label}: no route to (${target.x}, ${target.y})`).toBeGreaterThan(0);
  const goal = arrived || ((s) => Math.hypot(s.x - target.x, s.y - target.y) < 10);
  let s = await sample(page);
  let lastMove = s;
  let step = 0; // how far the avatar moved between the last two samples
  const start = s.t;
  for (let i = 0; i < route.length && !goal(s); i += 1) {
    const wp = route[i];
    const last = i === route.length - 1;
    for (;;) {
      const dx = wp.x - s.x; const dy = wp.y - s.y;
      if (goal(s) || Math.hypot(dx, dy) < (last ? 4 : 10)) break;
      // a dead band of about one step, so 8-way input never see-saws round a point
      const band = Math.min(5, Math.max(2, step * 0.6));
      await drive.set({ right: dx > band, left: dx < -band, down: dy > band, up: dy < -band });
      const previous = s;
      s = await sample(page);
      step = Math.hypot(s.x - previous.x, s.y - previous.y);
      if (step > 0.01) lastMove = s;
      expect(s.t - lastMove.t, `${label}: stalled at (${s.x.toFixed(1)}, ${s.y.toFixed(1)}) on the way to (${wp.x}, ${wp.y})`).toBeLessThan(STALL_MS);
      expect(s.t - start, `${label}: timed out`).toBeLessThan(40_000);
    }
  }
  await drive.release();
  return sample(page);
}

async function doors(page) {
  return page.evaluate(() => window.__qqTown.doors());
}

async function walkToDoor(page, drive, door) {
  const s = await walkTo(page, drive, door, { arrived: (q) => q.door === door.id && Math.hypot(q.x - door.x, q.y - door.y) < 20, label: `door ${door.id}` });
  expect(s.door, `standing at the ${door.id} door`).toBe(door.id);
}

// Up the trail beside the sign, through the gap, into the clearing.
async function northThroughGap(page, drive) {
  await walkTo(page, drive, SIGN_SIDE, { arrived: atSignSide, label: 'to the BATTLES sign' });
  const s = await hold(page, drive, { up: true }, (q) => q.y < -60, { label: 'up through the gap beside the sign' });
  expect(s.zone).toBe('north');
  return s;
}

// The avatar's place on screen (CSS px inside the canvas).
const onScreen = (s) => ({ x: (s.x - s.camera.x) * s.view.s, y: (s.y - s.camera.y) * s.view.s });

test.describe('town walk on a phone (412 x 915, touch stick)', () => {
  test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

  test('stick: spawn -> north end of the path -> every door, no stalls; camera clamps at the top edge', async ({ page }) => {
    await openTown(page);
    const drive = await stickDriver(page);
    await northThroughGap(page, drive);
    // the northern end of the trail (the fork), then both camps at its ends
    await walkTo(page, drive, { x: 410, y: -232 }, { label: 'trail fork' });
    const all = await doors(page);
    for (const id of CAMP_DOORS) await walkToDoor(page, drive, all.find((d) => d.id === id));

    // camera clamp at the clearing's top edge: walk up to it and keep pushing
    await walkTo(page, drive, { x: 640, y: -560 }, { label: 'clearing top' });
    // (the walk zone ends at y = -600; a step that would cross it is refused)
    let s = await hold(page, drive, { up: true }, (q) => q.y < -588, { label: 'up to the top edge' });
    const camY = s.camera.y;
    const top = onScreen(s);
    expect(top.y, 'avatar below the top of the canvas').toBeGreaterThan(0);
    expect(top.y, 'avatar above the bottom of the canvas').toBeLessThan(s.view.cssHeight);
    expect(top.x).toBeGreaterThan(0);
    expect(top.x).toBeLessThan(s.view.cssWidth);
    // pushing on: the avatar stays at the zone edge and the camera stays clamped
    await drive.set({ up: true });
    for (let i = 0; i < 20; i += 1) s = await sample(page);
    await drive.release();
    expect(s.y).toBeGreaterThanOrEqual(-600);
    expect(Math.abs(s.camera.y - camY)).toBeLessThan(1);

    // back through the gap and to every town door
    for (const id of TOWN_DOORS) await walkToDoor(page, drive, all.find((d) => d.id === id));
  });
});

test.describe('town walk on a small phone (375 x 667, touch)', () => {
  test.use({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

  test('keys: up beside the sign into the clearing', async ({ page }) => {
    await openTown(page);
    await northThroughGap(page, keyDriver(page));
  });
});

test.describe('town walk on a landscape phone (667 x 375, touch)', () => {
  test.use({ viewport: { width: 667, height: 375 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });

  test('stick: up beside the sign into the clearing', async ({ page }) => {
    await openTown(page);
    await northThroughGap(page, await stickDriver(page));
  });
});

test.describe('town walk on a desktop (1280 x 800, keyboard)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('keys: spawn -> north end of the path -> every door, no stalls', async ({ page }) => {
    await openTown(page);
    const drive = keyDriver(page);
    await northThroughGap(page, drive);
    await walkTo(page, drive, { x: 410, y: -232 }, { label: 'trail fork' });
    const all = await doors(page);
    for (const id of [...CAMP_DOORS, ...TOWN_DOORS]) await walkToDoor(page, drive, all.find((d) => d.id === id));
  });

  test('keys: pressing diagonally into a collider slides along it', async ({ page }) => {
    await openTown(page);
    const drive = keyDriver(page);
    // along the north tree line (the town's top edge), pressing up + right
    const a = await walkTo(page, drive, { x: 720, y: 60 }, { label: 'below the tree line' });
    const b = await hold(page, drive, { up: true, right: true }, (q) => q.x > a.x + 120, { label: 'slide along the tree line' });
    expect(b.y).toBeLessThan(45);
    // under a house, pressing up + left: slides along its wall, then round it
    const c = await walkTo(page, drive, { x: 932, y: 150 }, { label: 'below a house' });
    const d = await hold(page, drive, { up: true, left: true }, (q) => q.y < 80, { label: 'slide round a house' });
    expect(d.x).toBeLessThan(c.x - 30);
  });
});
