// F7 (docs/mobile/FIXES.md): on tablets the login panel and the forest scene
// have a clear gutter - when side by side their boxes never intersect and are
// at least 24 px apart - and the page never scrolls sideways.
//
// Run: npm run test:mobile -- login-tablet
import { test, expect } from '@playwright/test';
import { deviceFor, settle, sweep } from './helpers.mjs';

async function measure(page) {
  return page.evaluate(() => {
    const r = (s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b && { x: b.left, right: b.right, y: b.top, bottom: b.bottom }; };
    const el = document.scrollingElement;
    return { panel: r('.qq-form-col'), scene: r('.qq-preview-side'), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
}

function expectGutter(m, label) {
  expect(m.panel && m.scene, `${label}: panel and scene`).toBeTruthy();
  expect(m.scrollWidth, `${label}: no sideways scroll`).toBeLessThanOrEqual(m.clientWidth + 1);
  const sideBySide = m.scene.x > m.panel.x && m.scene.y < m.panel.bottom && m.scene.bottom > m.panel.y;
  if (!sideBySide) return false;
  expect(m.scene.x - m.panel.right, `${label}: gutter between panel and scene`).toBeGreaterThanOrEqual(24);
  return true;
}

for (const [w, h] of [[768, 1024], [820, 1180], [912, 1368], [1024, 768], [1180, 820]]) {
  test(`login: clear gutter @ ${w}x${h}`, async ({ browser }) => {
    const context = await browser.newContext(deviceFor(w, h));
    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await settle(page);
    expect(expectGutter(await measure(page), `${w}x${h}`), `${w}x${h} is side by side`).toBe(true);
    await context.close();
  });
}

test('login: clear gutter from 700 to 1100 px (sweep 8 px)', async ({ browser }) => {
  const context = await browser.newContext(deviceFor(700, 1000));
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible();
  for (const w of sweep(700, 1100)) {
    await page.setViewportSize({ width: w, height: 1000 });
    await settle(page);
    const sideBySide = expectGutter(await measure(page), `${w}x1000`);
    // 761 px and up the two sit side by side; narrower, the forest is a band on top
    expect(sideBySide, `${w}: side by side`).toBe(w > 760);
  }
  await context.close();
});
