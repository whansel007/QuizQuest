// F8 (docs/mobile/FIXES.md): every quiz topic chip has the same width and
// height at every width, nothing overflows a chip, the count reads "N Q(s)",
// and choosing or clearing a topic never changes any chip's size.
//
// Run: npm run test:mobile -- quiz-topics
import { test, expect } from '@playwright/test';
import { newStudentPage, openStudentTab, settle, sweep } from './helpers.mjs';

const CHIP_HEIGHT = 64; // TOPIC_CHIP_HEIGHT_PX

const chipBoxes = (page) => page.getByTestId('topic-chip').evaluateAll((chips) => chips.map((chip) => {
  const r = chip.getBoundingClientRect();
  const inner = [...chip.querySelectorAll('.practice-topic-name, .practice-topic-meta, input')].map((el) => el.getBoundingClientRect());
  return {
    w: Math.round(r.width * 10) / 10,
    h: Math.round(r.height * 10) / 10,
    // every part of the chip stays inside it
    contained: inner.every((b) => b.left >= r.left - 0.5 && b.right <= r.right + 0.5 && b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5),
    count: chip.querySelector('.practice-topic-meta').textContent.trim(),
    countFits: (() => { const m = chip.querySelector('.practice-topic-meta'); return m.scrollWidth <= m.clientWidth + 1; })(),
    // the count sits at the chip's right edge (inside its padding)
    countRight: r.right - chip.querySelector('.practice-topic-meta').getBoundingClientRect().right,
  };
}));

for (const kind of ['touch', 'desktop']) {
  test(`quiz topic chips are all one size from 320 to 1440 px (${kind}, sweep 8 px)`, async ({ browser }) => {
    const device = kind === 'touch' ? { hasTouch: true, isMobile: true } : { hasTouch: false, isMobile: false };
    const { context, page } = await newStudentPage(browser, 320, 900, device);
    await openStudentTab(page, 'Quiz');
    await expect(page.getByTestId('topic-chip').first()).toBeVisible();
    for (const w of sweep(320, 1440)) {
      await page.setViewportSize({ width: w, height: 900 });
      await settle(page);
      const chips = await chipBoxes(page);
      expect(chips.length, `${w}: chips shown`).toBeGreaterThan(1);
      for (const c of chips) {
        // identical up to sub-pixel rounding of the shared-out grid width
        expect(Math.abs(c.w - chips[0].w), `${w}: same width`).toBeLessThanOrEqual(0.5);
        expect(c.h, `${w}: fixed height`).toBe(CHIP_HEIGHT);
        expect(c.contained, `${w}: nothing overflows the chip`).toBe(true);
        expect(c.count, `${w}: count text`).toMatch(/^\d+ Q\(s\)$/);
        expect(c.countFits, `${w}: count on one line, uncut`).toBe(true);
        expect(c.countRight, `${w}: count right-aligned`).toBeLessThanOrEqual(16);
      }
    }
    await context.close();
  });
}

for (const [w, h] of [[360, 740], [768, 1024], [1280, 800]]) {
  test(`choosing a topic never resizes a chip @ ${w}x${h}`, async ({ browser }) => {
    const { context, page } = await newStudentPage(browser, w, h);
    await openStudentTab(page, 'Quiz');
    const chip = page.getByTestId('topic-chip').filter({ has: page.locator('input:not([disabled])') }).first();
    await expect(chip).toBeVisible();
    // the full name for hover and the spoken count stay available
    await expect(chip).toHaveAttribute('title', /.+/);
    await expect(chip.locator('.sr-only')).toHaveText(/^\d+ questions?$/);
    const before = JSON.stringify(await chipBoxes(page));
    await chip.click();
    await settle(page);
    expect(JSON.stringify(await chipBoxes(page)), 'sizes after clearing a topic').toBe(before);
    await chip.click();
    await settle(page);
    expect(JSON.stringify(await chipBoxes(page)), 'sizes after choosing it again').toBe(before);
    await context.close();
  });
}
