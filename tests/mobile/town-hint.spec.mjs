// F9 (docs/mobile/FIXES.md): on touch screens the Kingdom hint sits in the
// bottom row, to the right of the Emote and sound buttons, overlapping
// nothing, letting taps through, and using the short text when it is narrow.
//
// Run: npm run test:mobile -- town-hint
import { test, expect } from '@playwright/test';
import { boxes, intersects, newStudentPage, settle } from './helpers.mjs';

const LONG = 'Tap the ground to walk · tap a building to open';
const SHORT = 'Tap to walk · tap a building';

for (const [w, h] of [[360, 640], [375, 667], [412, 915], [667, 375], [740, 360], [768, 1024], [320, 568]]) {
  test(`town hint beside the Emote and sound buttons @ ${w}x${h}`, async ({ browser }) => {
    const { context, page } = await newStudentPage(browser, w, h);
    const hint = page.getByTestId('town-hint');
    await expect(hint).toBeVisible();
    await settle(page);
    const [emote] = await boxes(page, '[data-testid="town-emote"]');
    const [sound] = await boxes(page, '[data-testid="town-sound"]');
    const [box] = await boxes(page, '[data-testid="town-hint"]');
    // one row: the hint to the right of both buttons, centred with them
    expect(box.x, 'hint right of the Emote button').toBeGreaterThanOrEqual(emote.right);
    expect(box.x, 'hint right of the sound button').toBeGreaterThanOrEqual(sound.right);
    const mid = (b) => b.y + b.h / 2;
    expect(Math.abs(mid(box) - mid(sound)), 'hint vertically centred with the buttons').toBeLessThanOrEqual(2);
    expect(Math.abs(mid(emote) - mid(sound)), 'buttons on one row').toBeLessThanOrEqual(2);
    for (const b of [emote, sound]) expect(intersects(box, b), 'hint overlaps a button').toBe(false);
    // inside the viewport, at most two lines
    expect(box.right).toBeLessThanOrEqual(w + 0.5);
    expect(box.bottom).toBeLessThanOrEqual(h + 0.5);
    const lines = await hint.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight) - 0.4));
    expect(lines, 'at most two lines').toBeLessThanOrEqual(2);
    // the old separate floating hint is gone
    await expect(page.locator('.town-controls-hud')).toBeHidden();
    // taps go through the hint to the ground
    expect(await hint.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    const centre = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="town-actions"]') === null, { x: box.x + box.w / 2, y: box.y + box.h / 2 });
    expect(centre, 'a tap on the hint reaches the town').toBe(true);
    // clear of the virtual stick and its toggle
    for (const other of await boxes(page, '.town-stick-toggle, .town-stick')) expect(intersects(box, other), 'hint overlaps the stick').toBe(false);
    // short text when the room is under 140 px
    await expect(hint).toHaveText(box.w < 140 ? SHORT : LONG);
    await context.close();
  });
}

test('desktop keeps its keyboard hints and no touch hint', async ({ browser }) => {
  const { context, page } = await newStudentPage(browser, 1280, 800);
  await expect(page.locator('.town-controls-hud')).toBeVisible();
  await expect(page.getByTestId('town-hint')).toBeHidden();
  await context.close();
});
