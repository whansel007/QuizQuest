// Responsive harness (Stage 1 of docs/mobile/NOTES.md).
//
// For every screen in ROUTES and every viewport in VIEWPORTS it:
//   1. asserts the page never scrolls sideways
//      (document.scrollingElement.scrollWidth <= clientWidth + 1);
//   2. lists every visible element whose box pokes past the viewport edge
//      while no ancestor clips or scrolls it - these are what cause sideways
//      scrolling, and they fail the test;
//   3. saves a screenshot to docs/mobile/screenshots/<screen>__<w>x<h>.jpg;
//   4. lists visible interactive elements smaller than 44x44 px (a report,
//      not a failure) in docs/mobile/HARNESS-REPORT.md.
//
// Phones and tablets (below 1200 px) run as touch devices, the way Chrome
// DevTools device mode emulates them; 1200 px and up run as a desktop.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PASSWORD, STUDENT, TEACHER } from '../../e2e/helpers.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SHOTS = path.join(ROOT, 'docs/mobile/screenshots');
const REPORT_JSON = path.join(ROOT, 'docs/mobile/harness-results.json');
const REPORT_MD = path.join(ROOT, 'docs/mobile/HARNESS-REPORT.md');

export const VIEWPORTS = [
  [360, 740], [375, 667], [390, 844], [412, 915], [667, 375], [740, 360],
  [768, 1024], [820, 1180], [1024, 768], [1200, 800], [1440, 900],
  ...(process.env.MOBILE_SMALL ? [[320, 568]] : []),
];
const ONLY = process.env.MOBILE_VIEWPORT; // e.g. "375x667" to run one size

// The measurement runs inside the page. It returns the page's scroll widths,
// the overflowing elements and the small tap targets.
function measure() {
  const vw = document.documentElement.clientWidth;
  const scroller = document.scrollingElement;
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3) : [];
    if (cls.length) s += `.${cls.join('.')}`;
    const parent = el.parentElement;
    if (parent && !el.id) {
      const pcls = typeof parent.className === 'string' ? parent.className.trim().split(/\s+/)[0] : '';
      s = `${parent.tagName.toLowerCase()}${parent.id ? `#${parent.id}` : pcls ? `.${pcls}` : ''} > ${s}`;
    }
    return s;
  };
  const visible = (el, style) => {
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  // An element cannot widen the page if an ancestor clips or scrolls it, or
  // if it is position: fixed inside a clipping fixed layer.
  const contained = (el) => {
    for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox !== 'visible') return true;
    }
    return false;
  };
  // Text or a control cut off at the viewport edge by a clipping ancestor
  // (overflow hidden/clip) rather than a scroll container: it is unreadable or
  // unreachable even though the page itself does not scroll sideways.
  const clipper = (el) => {
    for (let a = el.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const ox = getComputedStyle(a).overflowX;
      if (ox === 'auto' || ox === 'scroll') return null;
      if (ox === 'hidden' || ox === 'clip') return a;
    }
    return null;
  };
  // The nearest parent that clips in either axis without scrolling in either.
  const clips = (v) => v === 'hidden' || v === 'clip';
  const boxClipper = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const scrolls = [cs.overflowX, cs.overflowY].some((v) => v === 'auto' || v === 'scroll');
      if (scrolls) return null;
      // a visually-hidden wrapper (1 px box, clip-path) hides on purpose
      const ar = a.getBoundingClientRect();
      if (cs.clipPath !== 'none' || ar.width <= 1 || ar.height <= 1) return null;
      if (clips(cs.overflowX) || clips(cs.overflowY)) return { el: a, x: clips(cs.overflowX), y: clips(cs.overflowY) };
    }
    return null;
  };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const clipped = [];
  const overflow = [];
  const small = [];
  for (const el of document.body.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    if (!visible(el, style)) continue;
    if (el.closest('[aria-hidden="true"]') && !el.matches('button, a, input, select, textarea')) {
      // decorative layers still count for overflow, never for tap targets
    }
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !contained(el) && style.position !== 'fixed') {
      overflow.push({ el: describe(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
    }
    const meaningful = (ownText(el) || el.matches('button, a[href], input, select, textarea'))
      && !el.closest('[aria-hidden="true"], .sr-only, .visually-hidden, [inert]') && style.clipPath === 'none' && r.width > 2 && r.height > 2;
    if (meaningful && (r.right > vw + 2 || r.left < -2) && r.top < innerHeight && r.bottom > 0 && clipper(el)) {
      clipped.push({ el: describe(el), left: Math.round(r.left), right: Math.round(r.right), text: (el.textContent || '').trim().slice(0, 30) });
    } else if (meaningful) {
      // cut off (in either direction) by a parent that clips without scrolling
      const box = boxClipper(el);
      if (box) {
        const b = box.el.getBoundingClientRect();
        const top = box.y ? b.top : -Infinity, bottom = box.y ? b.bottom : Infinity;
        const left = box.x ? b.left : -Infinity, right = box.x ? b.right : Infinity;
        const shownH = Math.max(0, Math.min(r.bottom, bottom) - Math.max(r.top, top));
        const shownW = Math.max(0, Math.min(r.right, right) - Math.max(r.left, left));
        if (shownH * shownW < r.width * r.height * 0.75) clipped.push({ el: describe(el), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), by: describe(box.el), text: (el.textContent || '').trim().slice(0, 30) });
      }
    }
    const interactive = el.matches('button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], summary, [tabindex]:not([tabindex="-1"])');
    if (interactive && !el.disabled && style.pointerEvents !== 'none' && !el.closest('[inert]')) {
      // a checkbox inside its label: the label is the target
      const label = el.matches('input[type="checkbox"], input[type="radio"]') ? el.closest('label') : null;
      const box = (label || el).getBoundingClientRect();
      if ((box.width < 44 || box.height < 44) && box.right > 0 && box.left < vw && box.bottom > 0 && box.top < innerHeight) {
        small.push({ el: describe(el), w: Math.round(box.width), h: Math.round(box.height), text: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40) });
      }
    }
  }
  // Keep only the outermost offenders: a too-wide card drags its children with it.
  const roots = overflow.filter((o, i) => !overflow.some((p, j) => j < i && o.el.startsWith(p.el)));
  return { vw, scrollWidth: scroller.scrollWidth, clientWidth: scroller.clientWidth, overflow: roots.slice(0, 25), overflowCount: overflow.length, clipped: clipped.slice(0, 25), small };
}

// Wait until the page has painted its fonts and two more frames.
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

// The shared e2e sign-in waits for a visible "Log out" button, but on a phone
// the professor's Log out lives inside the closed navigation drawer. This
// waits for the signed-in shell instead.
async function signInAt(page, email) {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Email' }).fill(email);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.locator('#login-password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.teacher-app, main#main.main-student').first()).toBeVisible({ timeout: 30_000 });
}

async function openStudentTab(page, name) {
  const tab = page.locator('#tabs').getByRole('button', { name, exact: true });
  // phones: the tabs live in the drawer behind the menu button
  const toggle = page.locator('[data-testid="nav-menu"]:visible, [data-testid="nav-peek"]:visible').first();
  if (!(await tab.isVisible()) && await toggle.count()) {
    await toggle.click();
    await expect(page.getByTestId('nav-drawer')).toBeVisible();
  }
  await tab.focus();
  await tab.click();
}

// Each screen: how to reach it from the previous screen of its group, and the
// element that says it is ready. `setup` failures are reported, not thrown, so
// one broken screen never hides the rest of the matrix.
const ROUTES = {
  public: [
    { name: 'login', setup: async (page) => { await page.goto('/'); await expect(page.getByRole('textbox', { name: 'Email' })).toBeVisible(); } },
    { name: 'signup', setup: async (page) => { await page.getByRole('button', { name: 'Create an account' }).click(); await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible(); } },
  ],
  student: [
    { name: 'student-kingdom', setup: async (page) => { await expect(page.locator('.town-canvas, .kingdom-page, main#main').first()).toBeVisible(); } },
    { name: 'student-kingdom-intro', optional: true, setup: async (page) => {
      const skip = page.getByRole('button', { name: 'Skip' });
      if (!(await skip.isVisible())) throw new Error('no intro on screen');
    } },
    { name: 'student-kingdom-buildings', optional: true, setup: async (page) => {
      const skip = page.getByRole('button', { name: 'Skip' });
      if (await skip.isVisible()) await skip.click();
      const list = page.locator('button[aria-controls="town-building-list"]');
      await list.click();
      await page.locator('.town-list-entry').first().click();
      await expect(page.locator('.town-modal-close')).toBeVisible();
    } },
    { name: 'student-practice', setup: async (page) => {
      const close = page.locator('.town-modal-close');
      if (await close.isVisible()) await close.click();
      await openStudentTab(page, 'Quiz');
      await expect(page.getByRole('button', { name: 'Start practice' })).toBeVisible();
    } },
    { name: 'student-quiz-question', optional: true, setup: async (page) => {
      await page.getByRole('button', { name: 'Start practice' }).click();
      await expect(page.getByText(/Question \d+ of \d+/).first()).toBeVisible();
    } },
    { name: 'student-nav-drawer', optional: true, setup: async (page) => {
      const toggle = page.locator('[data-testid="nav-menu"]:visible, [data-testid="nav-peek"]:visible').first();
      if (!(await toggle.count())) throw new Error('desktop nav: no drawer at this width');
      await toggle.click();
      await expect(page.getByTestId('nav-drawer')).toBeVisible();
      // focus moves into the drawer, onto the current page's tab
      await expect(page.locator('#s-drawer nav#tabs button[aria-current="page"]')).toBeFocused();
    } },
    { name: 'student-progress', setup: async (page) => { await openStudentTab(page, 'My Progress'); await expect(page.locator('main#main.main-progress')).toBeVisible(); } },
    { name: 'student-world', setup: async (page) => {
      await openStudentTab(page, 'Campfire Run');
      await expect(page.locator('.hero-selector, .hero-lab-page').first()).toBeVisible();
      // measure the page once the hero sprite has replaced its emoji placeholder
      await page.locator('.hero-preview-art canvas.hero-icon').waitFor({ timeout: 15_000 }).catch(() => {});
    } },
    { name: 'student-summon', setup: async (page) => { await openStudentTab(page, 'Summon'); await expect(page.getByRole('button', { name: 'History' })).toBeVisible(); } },
    { name: 'student-summon-history', optional: true, setup: async (page) => {
      await page.getByRole('button', { name: 'History' }).click();
      await expect(page.getByRole('heading', { name: 'Summon History' })).toBeVisible();
    } },
  ],
  teacher: [
    ['teacher-analytics', 'Analytics'], ['teacher-to-review', 'To review'], ['teacher-classes', 'Classes & Roster'],
    ['teacher-question-bank', 'Question bank'], ['teacher-ai-drafting', 'AI drafting'], ['teacher-evaluation', 'Evaluation'],
    ['teacher-settings', 'Settings'],
  ].map(([name, label]) => ({ name, setup: async (page) => {
    const tab = page.locator('#tabs').getByRole('button', { name: new RegExp(`^${label.replace(/[&]/g, '\\$&')}`) });
    if (!(await tab.isVisible())) await page.getByRole('button', { name: 'Open navigation' }).click();
    await tab.click();
    await expect(page.locator('.t-topbar-page')).toHaveText(label);
  } })),
};

const results = [];

for (const [w, h] of VIEWPORTS) {
  if (ONLY && ONLY !== `${w}x${h}`) continue;
  for (const group of Object.keys(ROUTES)) {
    test(`${group} @ ${w}x${h}`, async ({ browser }) => {
      const touch = w < 1200;
      const context = await browser.newContext({
        viewport: { width: w, height: h }, deviceScaleFactor: 1,
        isMobile: touch && w < 1024, hasTouch: touch, reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      if (group !== 'public') await signInAt(page, group === 'student' ? STUDENT.email : TEACHER.email);
      for (const route of ROUTES[group]) {
        const entry = { route: route.name, viewport: `${w}x${h}`, touch };
        try {
          await route.setup(page);
        } catch (err) {
          if (route.optional) { entry.skipped = String(err.message || err).split('\n')[0]; results.push(entry); continue; }
          entry.setupError = String(err.message || err).split('\n')[0];
        }
        await settle(page);
        const m = await page.evaluate(measure);
        Object.assign(entry, m);
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: path.join(SHOTS, `${route.name}__${w}x${h}.jpg`), type: 'jpeg', quality: 70 });
        results.push(entry);
        expect.soft(entry.setupError, `${route.name} @ ${w}x${h} opens`).toBeUndefined();
        expect.soft(m.scrollWidth, `${route.name} @ ${w}x${h}: no horizontal scroll; offenders: ${JSON.stringify(m.overflow.slice(0, 6))}`).toBeLessThanOrEqual(m.clientWidth + 1);
        expect.soft(m.overflow, `${route.name} @ ${w}x${h}: nothing pokes past the viewport`).toEqual([]);
        expect.soft(m.clipped, `${route.name} @ ${w}x${h}: no text or control is cut off at the edge`).toEqual([]);
      }
      await context.close();
    });
  }
}

test.afterAll(() => {
  if (!results.length) return;
  let previous = [];
  try { previous = JSON.parse(fs.readFileSync(REPORT_JSON, 'utf8')); } catch { /* first run */ }
  const key = (r) => `${r.route}@${r.viewport}`;
  const merged = new Map(previous.map((r) => [key(r), r]));
  for (const r of results) merged.set(key(r), r);
  const all = [...merged.values()].sort((a, b) => key(a).localeCompare(key(b)));
  fs.writeFileSync(REPORT_JSON, JSON.stringify(all, null, 1));
  const failing = all.filter((r) => r.setupError || r.scrollWidth > r.clientWidth + 1 || r.overflow?.length || r.clipped?.length);
  const lines = ['# Responsive harness report', '', `Generated by tests/mobile/responsive.spec.mjs on ${new Date().toISOString()}.`, '',
    `Screens x viewports measured: ${all.filter((r) => !r.skipped).length}. Failing: ${failing.length}. Skipped optional screens: ${all.filter((r) => r.skipped).length}.`, ''];
  if (failing.length) {
    lines.push('## Failures', '');
    for (const r of failing) lines.push(`- **${r.route} @ ${r.viewport}**: scrollWidth ${r.scrollWidth} / clientWidth ${r.clientWidth}${r.setupError ? `; setup: ${r.setupError}` : ''}${r.overflow?.length ? `; offenders: ${r.overflow.slice(0, 5).map((o) => `\`${o.el}\` (${o.left}..${o.right})`).join(', ')}` : ''}${r.clipped?.length ? `; clipped: ${r.clipped.slice(0, 5).map((o) => `\`${o.el}\` "${o.text}" (${o.left}..${o.right})`).join(', ')}` : ''}`);
    lines.push('');
  }
  lines.push('## Tap targets smaller than 44x44 px (touch viewports only)', '', 'Reported, not failed. Grouped by element; the justification column is filled in by hand in NOTES.md.', '');
  const smallMap = new Map();
  for (const r of all) {
    if (!r.touch || !r.small) continue;
    for (const s of r.small) {
      const k = `${r.route} | ${s.el}`;
      const cur = smallMap.get(k) || { route: r.route, el: s.el, text: s.text, sizes: new Set(), viewports: new Set() };
      cur.sizes.add(`${s.w}x${s.h}`); cur.viewports.add(r.viewport);
      smallMap.set(k, cur);
    }
  }
  lines.push('| Screen | Element | Label | Sizes | Viewports |', '|---|---|---|---|---|');
  for (const s of smallMap.values()) lines.push(`| ${s.route} | \`${s.el.replace(/\|/g, '\\|')}\` | ${s.text.replace(/\|/g, '\\|').replace(/\s+/g, ' ')} | ${[...s.sizes].slice(0, 3).join(', ')} | ${s.viewports.size} |`);
  fs.writeFileSync(REPORT_MD, `${lines.join('\n')}\n`);
});
