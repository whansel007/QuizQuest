// F6 (docs/mobile/FIXES.md): on the Campfire Run entry page the campfire is
// centred in the clearing S, the hero stands on the same baseline, fully
// inside S and clear of the hero selector, and choosing another hero never
// moves the campfire.
//
// Run: npm run test:mobile -- campfire-scene
import { test, expect } from '@playwright/test';
import { newStudentPage, openStudentTab, settle } from './helpers.mjs';

const GAP = 12; // SCENE_SELECTOR_GAP_PX
const BASE = 193 / 220; // CAMPFIRE_BASE_RATIO

async function openCampfireRun(page) {
  await openStudentTab(page, 'Campfire Run');
  await page.locator('.hero-preview-art canvas.hero-icon').waitFor({ timeout: 15_000 });
  await expect(page.getByTestId('campfire-scene')).toHaveClass(/composed/);
}

// Measures the scene: S (from the page's own boxes, not the component's
// variables), the campfire, and the hero sprite's visible pixels.
function measureScene() {
  const rect = (el) => el.getBoundingClientRect();
  const scene = rect(document.querySelector('[data-testid="campfire-scene"]'));
  const selector = rect(document.querySelector('[data-testid="hero-selector"]'));
  let top = scene.top;
  for (const panel of document.querySelectorAll('.room-entry, .kingdom-preview, .hero-preview')) {
    const r = rect(panel);
    if (r.bottom > scene.top && r.top < scene.bottom && r.bottom < selector.top) top = Math.max(top, r.bottom + 12);
  }
  const S = { left: scene.left, right: scene.right, top, bottom: Math.min(scene.bottom, selector.top - 12) };
  const fire = rect(document.querySelector('[data-testid="scene-campfire"] .campfire-art'));
  // the hero's visible extent: the opaque pixels of its sprite canvas
  const canvas = document.querySelector('.hero-preview-art canvas.hero-icon');
  const c = rect(canvas);
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width, maxX = -1, minY = canvas.height, maxY = -1;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] > 40) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  const sx = c.width / canvas.width, sy = c.height / canvas.height;
  const hero = { left: c.left + minX * sx, right: c.left + (maxX + 1) * sx, top: c.top + minY * sy, bottom: c.top + (maxY + 1) * sy };
  return { S, selectorTop: selector.top, fire: { left: fire.left, right: fire.right, top: fire.top, bottom: fire.bottom, width: fire.width, height: fire.height }, hero, vw: document.documentElement.clientWidth };
}

for (const [w, h] of [[360, 640], [412, 915], [960, 1440], [768, 1024], [667, 375], [1024, 768], [1280, 800], [1440, 900]]) {
  test(`F6: campfire centred, hero on its baseline and inside the clearing @ ${w}x${h}`, async ({ browser }) => {
    const { context, page } = await newStudentPage(browser, w, h);
    await openCampfireRun(page);
    await settle(page);
    // let the sprite's first frames draw, then measure
    await expect.poll(() => page.evaluate(() => {
      const cv = document.querySelector('.hero-preview-art canvas.hero-icon');
      return cv && cv.getContext('2d').getImageData(0, cv.height - 1, cv.width, 1).data.length > 0 && cv.width > 1;
    })).toBe(true);
    const m = await page.evaluate(measureScene);
    const sw = m.S.right - m.S.left;
    const sCentre = (m.S.left + m.S.right) / 2;
    const fireCentre = (m.fire.left + m.fire.right) / 2;
    expect(Math.abs(fireCentre - sCentre), `campfire centre ${fireCentre} vs S centre ${sCentre}`).toBeLessThanOrEqual(sw * 0.02);
    const fireBase = m.fire.top + m.fire.height * BASE;
    expect(Math.abs(m.hero.bottom - fireBase), `hero feet ${m.hero.bottom} vs campfire base ${fireBase}`).toBeLessThanOrEqual(4);
    // the whole hero inside S, 12 px or more above the selector
    expect(m.hero.top, 'hero top inside S').toBeGreaterThanOrEqual(m.S.top - 0.5);
    expect(m.hero.left, 'hero left inside S').toBeGreaterThanOrEqual(m.S.left - 0.5);
    expect(m.hero.right, 'hero right inside S').toBeLessThanOrEqual(m.S.right + 0.5);
    expect(m.selectorTop - m.hero.bottom, 'gap between hero and selector').toBeGreaterThanOrEqual(GAP - 0.5);
    // the campfire too, and nothing past the viewport's sides
    expect(m.fire.top, 'campfire inside S').toBeGreaterThanOrEqual(m.S.top - 0.5);
    expect(m.selectorTop - fireBase, 'campfire clear of the selector').toBeGreaterThanOrEqual(GAP - 0.5);
    for (const b of [m.fire, m.hero]) { expect(b.left).toBeGreaterThanOrEqual(0); expect(b.right).toBeLessThanOrEqual(m.vw + 0.5); }
    // side by side when S is wide enough, otherwise the hero in front, centred
    if (sw >= 480 + 24) expect(m.hero.left, 'hero beside the campfire').toBeGreaterThanOrEqual(m.fire.right - m.fire.width * 0.25);
    if (sw < 480) expect(Math.abs((m.hero.left + m.hero.right) / 2 - sCentre), 'hero centred in front').toBeLessThanOrEqual(sw * 0.06);

    // choosing another owned hero never moves the campfire
    const chips = page.locator('.hero-chip:not(.locked)');
    if (await chips.count() > 1) {
      // in the scene's own coordinates (picking a chip may scroll the page)
      const firePos = () => page.evaluate(() => {
        const s = document.querySelector('[data-testid="campfire-scene"]').getBoundingClientRect();
        const f = document.querySelector('[data-testid="scene-campfire"]').getBoundingClientRect();
        return [f.left - s.left, f.top - s.top, f.width, f.height].map((v) => Math.round(v * 10) / 10).join(',');
      });
      const fireBefore = await firePos();
      await chips.nth(1).click();
      await settle(page);
      await expect.poll(firePos).toBe(fireBefore);
    }
    await context.close();
  });
}
