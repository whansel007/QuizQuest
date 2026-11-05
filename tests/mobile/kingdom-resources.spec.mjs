// F3 (docs/mobile/FIXES.md): the Kingdom's top row never overlaps, and
// below 1024 px the resources collapse into one chip beside the menu button
// that opens a "Your resources" panel.
//
// Run: npm run test:mobile -- kingdom-resources
import { test, expect } from '@playwright/test';
import { boxes, intersects, newStudentPage, openStudentTab, settle, sweep } from './helpers.mjs';

const COLLAPSE_BELOW = 1024;
const HYSTERESIS = 24;

// The title card, the right-hand group (the one chip, or the Castle chip
// and the balance chips), each chip inside it and the menu button.
async function topRow(page) {
  const [title] = await boxes(page, '[data-testid="town-title-hud"]');
  const [right] = await boxes(page, '[data-testid="town-top-right"]');
  const chips = await boxes(page, '[data-testid="resources-chip"], .town-level, .town-balance');
  const [menu] = await boxes(page, '.nav-peek-phone, [data-testid="nav-menu"]');
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  return { title, right, chips, menu, vw };
}

function expectNoOverlap(row, label) {
  expect(row.title, `${label}: title card`).toBeTruthy();
  expect(row.right, `${label}: right-hand group`).toBeTruthy();
  const all = [['title', row.title], ['right group', row.right], ...(row.menu ? [['menu', row.menu]] : [])];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      expect(intersects(all[i][1], all[j][1]), `${label}: ${all[i][0]} overlaps ${all[j][0]}`).toBe(false);
    }
  }
  for (const chip of row.chips) {
    expect(intersects(chip, row.title), `${label}: a chip overlaps the title card`).toBe(false);
    if (row.menu) expect(intersects(chip, row.menu), `${label}: a chip overlaps the menu button`).toBe(false);
    expect(chip.right, `${label}: chip inside the viewport`).toBeLessThanOrEqual(row.vw + 0.5);
  }
}

for (const kind of ['touch', 'desktop']) {
  test(`kingdom top row: no overlap from 320 to 1440 px (${kind}, sweep 8 px)`, async ({ browser }) => {
    const device = kind === 'touch' ? { hasTouch: true, isMobile: true } : { hasTouch: false, isMobile: false };
    const { context, page } = await newStudentPage(browser, 320, 800, device);
    await runSweep(page);
    await context.close();
  });
}

async function runSweep(page) {
  const h = page.viewportSize().height;
  for (const w of sweep(320, 1440)) {
    await page.setViewportSize({ width: w, height: h });
    await settle(page);
    const row = await topRow(page);
    expectNoOverlap(row, `${w}x${h}`);
    const collapsed = await page.getByTestId('resources-chip').isVisible();
    // growing from 320: one chip until the 24 px hysteresis band is passed
    if (w < COLLAPSE_BELOW + HYSTERESIS) expect(collapsed, `${w}: one resources chip`).toBe(true);
    else expect(collapsed, `${w}: the full chips`).toBe(false);
    if (collapsed && row.menu) {
      const chip = (await boxes(page, '[data-testid="resources-chip"]'))[0];
      expect(Math.round(chip.h), `${w}: chip as tall as the menu button`).toBe(Math.round(row.menu.h));
      expect(Math.abs(chip.y - row.menu.y), `${w}: chip on the menu button's row`).toBeLessThanOrEqual(1);
      expect(Math.round(row.menu.x - chip.right), `${w}: 8 px gap to the menu button`).toBe(8);
    }
  }
  // shrinking back: the chips collapse again below 1024
  for (const w of [1440, 1100, 1040, 1023, 900]) {
    await page.setViewportSize({ width: w, height: h });
    await settle(page);
    expectNoOverlap(await topRow(page), `${w}x${h} (shrinking)`);
    expect(await page.getByTestId('resources-chip').isVisible(), `${w} shrinking`).toBe(w < COLLAPSE_BELOW);
  }
}

// The orientations the brief lists, each loaded fresh.
for (const [w, h] of [[667, 375], [740, 360], [1024, 768], [768, 1024]]) {
  test(`kingdom top row: no overlap @ ${w}x${h}`, async ({ browser }) => {
    const { context, page } = await newStudentPage(browser, w, h);
    await settle(page);
    expectNoOverlap(await topRow(page), `${w}x${h}`);
    expect(await page.getByTestId('resources-chip').isVisible()).toBe(w < COLLAPSE_BELOW);
    await context.close();
  });
}

for (const [w, h, mode] of [[375, 667, 'sheet'], [320, 568, 'sheet'], [768, 1024, 'popover'], [667, 375, 'popover']]) {
  test(`resources panel opens, shows live values and closes every way @ ${w}x${h}`, async ({ browser }) => {
    const { context, page } = await newStudentPage(browser, w, h);
    const chip = page.getByTestId('resources-chip');
    const panel = page.getByTestId('resources-panel');
    await expect(chip).toHaveAttribute('aria-expanded', 'false');

    await chip.tap();
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute('role', 'dialog');
    await expect(panel).toHaveAccessibleName('Your resources');
    await expect(chip).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toHaveClass(new RegExp(`as-${mode}`));
    const rows = panel.getByTestId('resources-row');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText('Coins');
    await expect(rows.nth(0)).toContainText('Spend on Summon pulls');
    await expect(panel).toContainText(/Castle level \d+ \/ \d+/);
    // amounts are whole: not clipped and on one line
    const amounts = await panel.locator('.town-resources-amount').evaluateAll((els) => els.map((el) => ({ fits: el.scrollWidth <= el.clientWidth + 1, h: el.getBoundingClientRect().height })));
    for (const a of amounts) { expect(a.fits).toBe(true); expect(a.h).toBeLessThan(30); }
    // the panel fits the viewport (it scrolls inside itself when short)
    const box = await panel.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(w + 0.5);
    expect(box.y + box.height).toBeLessThanOrEqual(h + 0.5);
    // the close button is whole and topmost (F1)
    const close = page.getByTestId('resources-close');
    const hit = await close.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return el === top || el.contains(top); });
    expect(hit).toBe(true);

    // live: a balance change shows at once, with the panel still open
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('qq-debug-kingdom-updated', { detail: { resources: { wood: 12345, crystal: 6, herb: 7 } } })));
    await expect(rows.nth(1)).toContainText('12,345');
    await expect(panel).toBeVisible();

    // close button: focus returns to the chip
    await close.tap();
    await expect(panel).toBeHidden();
    await expect(chip).toBeFocused();
    await expect(chip).toHaveAttribute('aria-expanded', 'false');
    // Esc
    await chip.tap();
    await expect(panel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(chip).toBeFocused();
    // a tap outside (on the town, away from the panel)
    await chip.tap();
    await expect(panel).toBeVisible();
    await page.mouse.click(Math.round(w * 0.2), Math.round(h * 0.3));
    await expect(panel).toBeHidden();
    await chip.tap();
    await expect(panel).toBeVisible();
    if (mode === 'sheet') {
      // the sheet is modal: the menu button steps aside while it is open (F1)
      await expect(page.getByTestId('nav-peek')).toHaveAttribute('inert', '');
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('nav-peek')).not.toHaveAttribute('inert', '');
    } else {
      // a route change (through the menu, which stays usable beside a popover)
      await openStudentTab(page, 'My Progress');
      await expect(page.locator('main#main.main-progress')).toBeVisible();
      // the drawer can be reopened a beat before the page switch settles;
      // retry the navigation itself, not the assertion below
      await expect(async () => {
        await openStudentTab(page, 'Kingdom');
        await expect(page.locator('main#main.main-kingdom')).toBeVisible({ timeout: 2000 });
      }).toPass({ timeout: 20_000 });
      await expect(page.getByTestId('resources-chip')).toBeVisible();
      await expect(page.getByTestId('resources-panel')).toBeHidden();
    }
    await context.close();
  });
}
