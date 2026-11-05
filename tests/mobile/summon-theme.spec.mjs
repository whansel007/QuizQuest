// F4 (docs/mobile/FIXES.md): the Summon page is the blue night sky
// everywhere - html, body, the page root, every corner and the bottom bar -
// at every viewport, and leaving it restores the app background.
//
// Run: npm run test:mobile -- summon-theme
import { test, expect } from '@playwright/test';
import { newStudentPage, openStudentTab, settle } from './helpers.mjs';

const VIEWPORTS = [[360, 640], [375, 667], [412, 915], [412, 968], [667, 375], [768, 1024], [960, 1440], [1280, 800]];

// Green-dominant: hue 70 to 170 degrees with saturation above 25 %.
function isGreen([r, g, b]) {
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2, d = max - min;
  if (d === 0) return false;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r / 255) h = 60 * (((g - b) / 255 / d) % 6);
  else if (max === g / 255) h = 60 * ((b - r) / 255 / d + 2);
  else h = 60 * ((r - g) / 255 / d + 4);
  if (h < 0) h += 360;
  return h >= 70 && h <= 170 && s > 0.25;
}
// Read pixels of a screenshot by decoding it in the page (no PNG library).
async function pixels(page, png, points) {
  return page.evaluate(async ({ data, points }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return points.map(([x, y]) => [...ctx.getImageData(Math.min(img.width - 1, Math.max(0, Math.round(x))), Math.min(img.height - 1, Math.max(0, Math.round(y))), 1, 1).data.slice(0, 3)]);
  }, { data: png.toString('base64'), points });
}
const rgb = (css) => (css.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

for (const [w, h] of VIEWPORTS) {
  test(`summon page shows no green @ ${w}x${h}`, async ({ browser }) => {
    const { context, page } = await newStudentPage(browser, w, h);
    await openStudentTab(page, 'Summon');
    await expect(page.locator('.summon-bottom-bar')).toBeVisible();
    await settle(page);

    const bgs = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
      root: getComputedStyle(document.querySelector('main#main.main-summon')).backgroundImage,
    }));
    for (const key of ['html', 'body']) {
      expect(bgs[key], `${key} background`).not.toBe('rgba(0, 0, 0, 0)');
      expect(isGreen(rgb(bgs[key])), `${key} background ${bgs[key]} is not green`).toBe(false);
    }
    expect(bgs.root, 'page root has the sky gradient').toContain('gradient');

    // pixels: the four corners and the centre of the bottom bar, at the top
    // of the page and scrolled to the bottom (phones scroll the page)
    for (const where of ['top', 'bottom']) {
      if (where === 'bottom') await page.evaluate(() => { document.scrollingElement.scrollTop = 1e6; document.querySelector('.summon-page').scrollTop = 1e6; });
      await settle(page);
      const bar = await page.locator('.summon-bottom-bar').boundingBox();
      // the bar's own background, just above its bottom edge
      const barY = Math.min(h - 2, bar.y + bar.height - 3);
      const names = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'bottom bar'];
      const colors = await pixels(page, await page.screenshot(), [[1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2], [bar.x + bar.width / 2, barY]]);
      const samples = Object.fromEntries(names.map((n, i) => [n, colors[i]]));
      for (const [name, color] of Object.entries(samples)) {
        expect(isGreen(color), `${where}: ${name} pixel rgb(${color}) is not green`).toBe(false);
      }
    }

    // leaving restores the page background
    await openStudentTab(page, 'My Progress');
    await expect(page.locator('main#main.main-progress')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.classList.contains('qq-summon-route'))).toBe(false);
    await context.close();
  });
}
