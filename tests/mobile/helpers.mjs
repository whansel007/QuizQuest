// Shared helpers for the mobile fix tests (docs/mobile/FIXES.md).
import { expect } from '@playwright/test';
import { PASSWORD, STUDENT } from '../../e2e/helpers.js';

// Phones and tablets (below 1200 px) run as touch devices, the way Chrome
// DevTools device mode emulates them; 1200 px and up run as a desktop.
export function deviceFor(w, h) {
  const touch = w < 1200;
  return { viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: touch && w < 1024, hasTouch: touch, reducedMotion: 'reduce' };
}

export async function newStudentPage(browser, w, h, device = {}) {
  const context = await browser.newContext({ ...deviceFor(w, h), ...device });
  // the first-visit Kingdom tour opens a moment after the town loads and
  // would take the first Esc; mark it seen so every test starts the same way
  await context.addInitScript((email) => {
    try { for (const id of ['s-01', email]) localStorage.setItem(`qq-kingdom-intro-seen:${id}`, '1'); } catch { /* storage blocked */ }
  }, STUDENT.email);
  const page = await context.newPage();
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill(STUDENT.email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('main#main.main-student').first()).toBeVisible({ timeout: 30_000 });
  await dismissIntro(page);
  return { context, page };
}

// The first-visit Kingdom tour: skip it once it has had a chance to appear.
export async function dismissIntro(page) {
  const skip = page.locator('.town-intro').getByRole('button', { name: 'Skip' });
  await page.locator('.kingdom-screen, main#main:not(.main-kingdom)').first().waitFor();
  if (await skip.isVisible().catch(() => false)) await skip.click();
}

export async function openStudentTab(page, name) {
  const tab = page.locator('#tabs').getByRole('button', { name, exact: true });
  const toggle = page.locator('[data-testid="nav-menu"]:visible, [data-testid="nav-peek"]:visible').first();
  if (!(await tab.isVisible()) && await toggle.count()) {
    await toggle.click();
    await expect(page.getByTestId('nav-drawer')).toBeVisible();
  } else if (await page.locator('header#top.student-nav-hidden').count()) {
    // the wide-screen top bar is tucked away: a pointer at the top edge brings it back
    await page.mouse.move(page.viewportSize().width / 2, 4);
    await expect(page.locator('header#top.student-nav-hidden')).toHaveCount(0);
  }
  const revealed = await page.locator('header#top.student-immersive-nav:not(.student-nav-hidden)').count();
  await tab.click({ timeout: 8000 });
  // a pointer left at the top edge would hold the top bar open on the next page
  if (revealed) { const { width, height } = page.viewportSize(); await page.mouse.move(width / 2, height / 2); }
  // the drawer closes on a choice
  if (await page.getByTestId('nav-drawer').count()) await expect(page.getByTestId('nav-drawer')).toBeHidden();
}

// Fonts loaded and two frames painted.
export async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

// Bounding boxes of the visible elements matching each selector.
export function boxes(page, selector) {
  return page.locator(selector).evaluateAll((els) => els.filter((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }).map((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; }));
}

export const intersects = (a, b, slack = 0) => a.x < b.right - slack && b.x < a.right - slack && a.y < b.bottom - slack && b.y < a.bottom - slack;

// A sweep from `from` to `to` in `step` px.
export const sweep = (from, to, step = 8) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
