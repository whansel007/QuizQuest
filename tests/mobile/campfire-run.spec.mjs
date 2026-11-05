// F5 (docs/mobile/FIXES.md): on the Campfire Run entry page the "or"
// separator sits between joining and hosting and overlaps no control at any
// width; under 380 px the code and JOIN stack.
//
// Run: npm run test:mobile -- campfire-run
import { test, expect } from '@playwright/test';
import { boxes, intersects, newStudentPage, openStudentTab, settle, sweep } from './helpers.mjs';

async function openCampfireRun(page) {
  await openStudentTab(page, 'Campfire Run');
  await expect(page.getByTestId('room-separator')).toBeVisible();
  await page.locator('.hero-preview-art canvas.hero-icon').waitFor({ timeout: 15_000 });
}

for (const kind of ['touch', 'desktop']) {
  test(`F5: separator overlaps no control from 320 to 1440 px (${kind}, sweep 8 px)`, async ({ browser }) => {
    const device = kind === 'touch' ? { hasTouch: true, isMobile: true } : { hasTouch: false, isMobile: false };
    const { context, page } = await newStudentPage(browser, 320, 800, device);
    await openCampfireRun(page);
    for (const w of sweep(320, 1440)) {
      await page.setViewportSize({ width: w, height: 800 });
      await settle(page);
      const [sep] = await boxes(page, '[data-testid="room-separator"]');
      const [code] = await boxes(page, '[data-testid="room-code"]');
      const [join] = await boxes(page, '[data-testid="room-join"]');
      const [host] = await boxes(page, '[data-testid="room-host"]');
      for (const [name, b] of [['code input', code], ['JOIN', join], ['HOST LOBBY', host]]) {
        expect(b, `${w}: ${name} shown`).toBeTruthy();
        expect(intersects(sep, b), `${w}: separator overlaps ${name}`).toBe(false);
      }
      // joining above the separator, hosting below it
      expect(sep.y, `${w}: separator below the join row`).toBeGreaterThanOrEqual(Math.max(code.bottom, join.bottom));
      expect(host.y, `${w}: HOST LOBBY below the separator`).toBeGreaterThanOrEqual(sep.bottom);
      // under 380 px the code and JOIN stack as two full-width rows
      if (w < 380) expect(join.y, `${w}: JOIN under the code`).toBeGreaterThanOrEqual(code.bottom);
      else expect(Math.abs(join.y + join.h / 2 - (code.y + code.h / 2)), `${w}: JOIN beside the code`).toBeLessThan(2);
    }
    await context.close();
  });
}
