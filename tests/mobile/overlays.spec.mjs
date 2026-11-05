// F1 (docs/mobile/FIXES.md): every overlay's close control is fully on
// screen, is the topmost element at its centre (nothing such as the top bar
// or the corner menu button covers it) and closes the overlay when tapped.
//
// Run: npm run test:mobile -- overlays
import { test, expect } from '@playwright/test';
import { deviceFor, newStudentPage, openStudentTab, settle } from './helpers.mjs';

const VIEWPORTS = [[360, 640], [375, 667], [412, 915], [667, 375], [768, 1024], [820, 1180]];

// The close control must be inside the viewport and be what a tap at its
// centre lands on; then tapping it must close the overlay.
async function expectClosable(page, label, close, overlay) {
  await expect(close, `${label}: close control visible`).toBeVisible();
  await settle(page);
  const result = await close.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    const describe = (n) => (n ? `${n.tagName.toLowerCase()}${n.id ? `#${n.id}` : ''}${typeof n.className === 'string' && n.className ? `.${n.className.trim().split(/\s+/).join('.')}` : ''}` : 'nothing');
    return {
      inside: r.left >= 0 && r.top >= 0 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5,
      box: [r.left, r.top, r.right, r.bottom].map(Math.round),
      topmost: Boolean(hit && (hit === el || el.contains(hit))),
      hit: describe(hit),
    };
  });
  expect(result.inside, `${label}: close box ${result.box} inside the viewport`).toBe(true);
  expect(result.topmost, `${label}: close control is topmost at its centre (got ${result.hit})`).toBe(true);
  await close.tap();
  await expect(overlay, `${label}: closed by its close control`).toBeHidden();
}

for (const [w, h] of VIEWPORTS) {
  test(`student overlays close cleanly @ ${w}x${h}`, async ({ browser }) => {
    const { context, page } = await newStudentPage(browser, w, h);
    const notOpened = [];

    // Kingdom: every building panel (the Castle panel holds the avatar
    // wardrobe; the Tower panel holds trades)
    const list = page.locator('button[aria-controls="town-building-list"]');
    await expect(list).toBeVisible();
    const entries = await page.locator('.town-list-entry').count() || (await list.click(), await page.locator('.town-list-entry').count());
    for (let i = 0; i < entries; i++) {
      if (!(await page.locator('.town-list-entry').first().isVisible())) await list.click();
      const entry = page.locator('.town-list-entry').nth(i);
      const name = (await entry.locator('b').textContent()).trim();
      await entry.click();
      await expectClosable(page, `building panel ${name}`, page.getByTestId('town-modal-close'), page.getByTestId('town-modal'));
    }
    // the backdrop and Esc close it too
    if (!(await page.locator('.town-list-entry').first().isVisible())) await list.click();
    await page.locator('.town-list-entry').first().click();
    await expect(page.getByTestId('town-modal')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('town-modal')).toBeHidden();

    // the phone navigation drawer
    const menu = page.locator('[data-testid="nav-menu"]:visible, [data-testid="nav-peek"]:visible').first();
    if (await menu.count()) {
      await menu.tap();
      await expectClosable(page, 'nav drawer', page.getByTestId('nav-close'), page.getByTestId('nav-drawer'));
    } else notOpened.push('nav drawer (desktop nav at this width)');

    // Quiz: the join-a-class dialog
    await openStudentTab(page, 'Quiz');
    const join = page.getByRole('button', { name: '+ Join Class' });
    if (await join.isVisible().catch(() => false)) {
      await join.click();
      await expectClosable(page, 'join class', page.getByTestId('join-class-cancel'), page.getByTestId('join-class-modal'));
    } else notOpened.push('join class (no button)');

    // Summon: History, Details and a single pull's reveal
    await openStudentTab(page, 'Summon');
    for (const name of ['History', 'Details']) {
      const button = page.locator('.summon-bottom-bar').getByRole('button', { name, exact: true });
      if (!(await button.count())) { notOpened.push(`Summon ${name} (hidden by the server config)`); continue; }
      await button.click();
      await expectClosable(page, `Summon ${name}`, page.getByTestId('summon-modal-close'), page.getByTestId('summon-modal'));
      await button.click();
      await expect(page.getByTestId('summon-modal')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByTestId('summon-modal'), `Summon ${name}: Esc closes`).toBeHidden();
    }
    const pull = page.locator('.summon-actions .pull-one');
    if (await pull.isEnabled()) {
      await pull.click();
      const reveal = page.getByTestId('prize-reveal');
      await expect(reveal).toBeVisible({ timeout: 20_000 });
      // a tap catches the falling star; then Continue closes the reveal
      const cont = page.getByTestId('prize-continue');
      if (!(await cont.isVisible())) await reveal.click({ position: { x: 10, y: 10 } });
      await expectClosable(page, 'summon reveal', cont, reveal);
    } else notOpened.push('summon reveal (not enough coins)');

    test.info().annotations.push({ type: 'not opened', description: notOpened.join('; ') || 'none' });
    await context.close();
  });
}

// In-run overlays, in the arena sandbox (no login). Campfire Run asks to be
// played in landscape on phones, so phones in portrait only see the rotate
// prompt (portrait tablets too); the in-run overlays are checked in landscape:
// the 667 x 375 phone and the 768 x 1024 and 820 x 1180 tablets turned sideways.
for (const [w, h] of [[667, 375], [1024, 768], [1180, 820]]) {
  test(`in-run overlays close cleanly @ ${w}x${h}`, async ({ browser }) => {
    const context = await browser.newContext(deviceFor(w, h));
    const page = await context.newPage();
    await page.goto('/hero-lab/world.html?heroId=sheriff');
    await expect(page.locator('html')).toHaveClass(/touch-mode/);
    const briefing = page.locator('#join-briefing');
    await page.waitForFunction(() => document.querySelector('#hero-hud') && !document.querySelector('#hero-hud').hidden, null, { timeout: 20_000 }).catch(() => {});
    if (await briefing.isVisible()) await briefing.click();
    const menuButton = page.getByTestId('touch-menu');
    await expect(menuButton).toBeVisible();
    for (const [item, panel, close] of [['settings', '#settings-panel', '#settings-close'], ['info', '#stats-panel', '#info-close']]) {
      await menuButton.tap();
      await expect(page.getByTestId('touch-menu-sheet')).toBeVisible();
      await page.locator(`[data-touch-menu="${item}"]`).tap();
      await expectClosable(page, `in-run ${item}`, page.locator(close), page.locator(panel));
    }
    await menuButton.tap();
    await expectClosable(page, 'in-run menu', page.locator('[data-touch-menu="close"]'), page.getByTestId('touch-menu-sheet'));
    await context.close();
  });
}
