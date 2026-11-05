// F10: the touch aim line is drawn UNDER the hero sprite (docs/mobile/fixes/F10.md).
//
// Arena sandbox (/hero-lab/world.html, no login) as a 667 x 375 touch phone.
// The test holds an aim drag on the E button and compares a screenshot taken
// before the drag with one taken while aiming: inside the hero sprite's
// bounding box, no pixel may turn aim-line coloured, while
// the line itself is still visible above the hero.
// Run: npm run test:mobile -- aim-line-layer
import { test, expect } from '@playwright/test';

const PHONE = { viewport: { width: 667, height: 375 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
// Guardian: a grey helmet under a blue (#4aaeff) aim line, so the two never
// look alike. E is a 'dir' ability, and dragging it sends nothing until release.
const HERO = 'guardian';

function recordSocket() {
  window.__sent = [];
  let real;
  const wrap = (...args) => {
    const socket = real(...args);
    const emit = socket.emit.bind(socket);
    socket.emit = (name, ...data) => { window.__sent.push([name, ...data]); return emit(name, ...data); };
    socket.on('state', (snapshot) => { window.__state = snapshot; });
    return socket;
  };
  Object.defineProperty(window, 'io', { configurable: true, get: () => (real ? wrap : undefined), set: (value) => { real = value; } });
}

async function openArena(page, heroId) {
  await page.addInitScript(recordSocket);
  await page.goto(`/hero-lab/world.html?heroId=${heroId}`);
  await expect(page.locator('html')).toHaveClass(/touch-mode/);
  await expect.poll(() => page.evaluate(() => (window.__state?.players?.length || 0)), { timeout: 20_000 }).toBe(1);
  const briefing = page.locator('#join-briefing');
  if (await briefing.isVisible()) await briefing.click();
  await expect(briefing).toBeHidden();
  // the hero sprites are rasterised (the lobby icon is made from the same cache)
  await expect(page.locator('#lobby-hero-icon img.hero-ui-sprite')).toBeAttached();
}

const nextFrames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

// Pixel analysis in the page (it has canvas). Rebuilds the hero sprite's alpha
// at its on-screen rect from the same image and config the game uses, then
// counts pixels that turned aim-line coloured between the two screenshots.
async function analyse(page, before, after) {
  return page.evaluate(async ({ before, after, heroId }) => {
    const [tc, gc] = await Promise.all([import('/hero-lab/touch-controls.js'), import('/hero-lab/game-config.js')]);
    const config = await (await fetch('/hero-lab/hero-visuals.json')).json();
    const visual = config.HERO_VISUALS[heroId];
    const sprite = new Image();
    sprite.src = encodeURI(`${config.assetBase}${visual.frames.open}`);
    await sprite.decode();
    const w = innerWidth, h = innerHeight;
    const arena = { width: gc.GAME_CONFIG.arena.width, height: gc.GAME_CONFIG.arena.height };
    const base = tc.cameraBaseScale(w, h, { baseW: gc.MOBILE_VIEW_BASE_W, baseH: gc.MOBILE_VIEW_BASE_H, maxBaseScale: gc.MOBILE_VIEW_MAX_BASE_SCALE });
    const zoom = tc.clampZoom(Number(sessionStorage.getItem('hero-lab-touch-zoom')) || gc.MOBILE_DEFAULT_ZOOM,
      tc.minZoomForArena(w, h, arena, base), gc.MOBILE_ZOOM_MAX);
    const hero = window.__state.players[0];
    // the hero has not moved, so the follow camera sits on it (clamped to the arena)
    const camera = { ...tc.clampCameraCenter(hero.x, hero.y, w, h, base * zoom, arena), scale: base * zoom };
    const centre = tc.worldToScreen(hero.x, hero.y, camera, w, h);
    const sizeWorld = config.SPRITE_BASE_PX * (visual.scale || 1);
    const spriteW = sizeWorld * (sprite.naturalWidth / sprite.naturalHeight) * camera.scale;
    const spriteH = sizeWorld * camera.scale;
    const anchor = visual.anchor || { x: 0.5, y: 0.5 };

    const pixels = async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const c = new OffscreenCanvas(w, h).getContext('2d');
      c.drawImage(bitmap, 0, 0);
      return c.getImageData(0, 0, w, h).data;
    };
    const maskCtx = new OffscreenCanvas(w, h).getContext('2d');
    maskCtx.drawImage(sprite, centre.x - spriteW * anchor.x, centre.y - spriteH * anchor.y, spriteW, spriteH);
    const mask = maskCtx.getImageData(0, 0, w, h).data;
    const alpha = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[(y * w + x) * 4 + 3] / 255);
    // the sprite's bounding box: its drawn (non-transparent) pixels
    let left = w, top = h, right = -1, bottom = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (alpha(x, y) < 0.5) continue;
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    const [a, b] = await Promise.all([pixels(before), pixels(after)]);
    const line = gc.HERO_FX_COLORS[heroId].primary;
    const [lr, lg, lb] = [1, 3, 5].map((i) => parseInt(line.slice(i, i + 2), 16));
    const aimColoured = (d, i) => Math.hypot(d[i] - lr, d[i + 1] - lg, d[i + 2] - lb) < 60;
    const turnedAimColoured = (x, y) => { const i = (y * w + x) * 4; return aimColoured(b, i) && !aimColoured(a, i); };
    let inBox = 0, aboveHero = 0;
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) if (turnedAimColoured(x, y)) inBox += 1;
    // the line runs straight up from the hero: it must still show above the box
    const cx = Math.round(centre.x);
    for (let y = 0; y < top; y++) for (let x = cx - 3; x <= cx + 3; x++) if (turnedAimColoured(x, y)) aboveHero += 1;
    return { inBox, aboveHero, box: { left, top, right, bottom } };
  }, { before: before.toString('base64'), after: after.toString('base64'), heroId: HERO });
}

test.describe('touch aim line layer (667 x 375 landscape)', () => {
  test.use(PHONE);

  test('the aim line is drawn under the hero sprite, its end above the floor', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await openArena(page, HERO);
    await nextFrames(page);
    const before = await page.screenshot();

    const e = await page.getByTestId('ability-skill').locator('.ability-circle').boundingBox();
    const start = { x: e.x + e.width / 2, y: e.y + e.height / 2 };
    const cdp = await page.context().newCDPSession(page);
    const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    await touch('touchStart', [{ ...start, id: 1 }]);
    for (let i = 1; i <= 10; i++) await touch('touchMove', [{ x: start.x, y: start.y - 8 * i, id: 1 }]);
    await expect(page.getByTestId('ability-skill')).toHaveClass(/aiming/);
    await nextFrames(page);

    const result = await analyse(page, before, await page.screenshot());
    expect(result.box.right - result.box.left).toBeGreaterThan(20); // the sprite was found on screen
    expect(result.aboveHero, 'the aim line is visible above the hero').toBeGreaterThan(20);
    expect(result.inBox, `aim-line pixels inside the hero sprite's box ${JSON.stringify(result.box)}`).toBe(0);

    await touch('touchEnd', []);
    expect(await page.evaluate(() => window.__sent.filter(([name]) => name === 'skill').length)).toBe(1);
    expect(errors).toEqual([]);
  });
});
