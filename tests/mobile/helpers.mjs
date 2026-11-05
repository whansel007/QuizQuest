// Shared helpers for the mobile fix tests (docs/mobile/FIXES.md).
import { expect } from '@playwright/test';
import { PASSWORD, STUDENT } from '../../e2e/helpers.js';

// Phones and tablets (below 1200 px) run as touch devices, the way Chrome
// DevTools device mode emulates them; 1200 px and up run as a desktop.
export function deviceFor(w, h) {
  const touch = w < 1200;
  return { viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: touch && w < 1024, hasTouch: touch, reducedMotion: 'reduce' };
}

export async function newStudentPage(browser, w, h) {
  const context = await browser.newContext(deviceFor(w, h));
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
  }
  await tab.click();
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
