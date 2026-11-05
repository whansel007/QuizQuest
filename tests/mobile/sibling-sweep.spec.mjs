// F11 (docs/mobile/FIXES.md): the sweep for sibling bugs, kept as a
// regression test. On every student page (and the Summon History sheet), at
// phone, tablet and tall viewports:
//   - no visible control is covered at its centre by another element;
//   - no two controls or text boxes overlap (unless one contains the other);
//   - html and body are never the app's light default behind the immersive
//     pages (overscroll, tall screens, a collapsing phone toolbar).
//
// Run: npm run test:mobile -- sibling-sweep
import { test, expect } from '@playwright/test';
import { newStudentPage, openStudentTab, settle } from './helpers.mjs';

// Runs in the page; rootSel limits it to an open overlay.
function scan(rootSel) {
  const root = (rootSel && document.querySelector(rootSel)) || document;
  const vw = document.documentElement.clientWidth, vh = innerHeight;
  const desc = (el) => { let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : []; if (c.length) s += '.' + c.join('.'); const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24); return t ? `${s} "${t}"` : s; };
  const visible = (el) => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const inView = (r) => r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh;
  const out = { covered: [], overlaps: [], uneven: [], bg: {} };
  const interactive = [...root.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], summary')].filter((el) => visible(el) && !el.closest('[inert], [aria-hidden="true"]') && getComputedStyle(el).pointerEvents !== 'none');
  for (const el of interactive) {
    const r = el.getBoundingClientRect();
    if (!inView(r)) continue;
    const label = el.matches('input[type=checkbox], input[type=radio]') ? el.closest('label') : null;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (hit && hit !== el && !el.contains(hit) && !(label && label.contains(hit)) && !hit.contains(el)) out.covered.push(`${desc(el)} under ${desc(hit)}`);
  }
  // overlaps among interactive controls and text leaves (not nested)
  const leaves = [...interactive, ...[...root.querySelectorAll('h1,h2,h3,h4,p,span,strong,small,em,label,li,time')].filter((el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !el.closest('button, a, [aria-hidden="true"], .sr-only'))];
  const boxes = leaves.map((el) => [el, el.getBoundingClientRect()]).filter(([, r]) => r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, ra] = boxes[i], [b, rb] = boxes[j];
    if (a.contains(b) || b.contains(a)) continue;
    const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
    if (w > 2 && h > 2) out.overlaps.push(`${desc(a)} x ${desc(b)} (${Math.round(w)}x${Math.round(h)})`);
  }
  // uneven siblings in one row
  for (const parent of (rootSel ? root.querySelectorAll('*') : document.querySelectorAll('main *'))) {
    const kids = [...parent.children].filter((k) => visible(k) && typeof k.className === 'string' && k.className.trim());
    if (kids.length < 3) continue;
    const cls = kids[0].className.trim().split(/\s+/)[0];
    const same = kids.filter((k) => k.className.trim().split(/\s+/)[0] === cls);
    if (same.length < 3) continue;
    const rows = new Map();
    for (const k of same) { const r = k.getBoundingClientRect(); const key = Math.round(r.top / 4); rows.set(key, [...(rows.get(key) || []), r.height]); }
    for (const hs of rows.values()) if (hs.length >= 2 && Math.max(...hs) - Math.min(...hs) > 2) { out.uneven.push(`${desc(parent)} > .${cls}: heights ${hs.map(Math.round).join('/')}`); break; }
  }
  const main = document.querySelector('main#main');
  out.bg = { html: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor, main: getComputedStyle(main).backgroundColor + ' ' + getComputedStyle(main).backgroundImage.slice(0, 30), docH: document.scrollingElement.scrollHeight, vh };
  return out;
}

const PAGES = [['kingdom', null], ['practice', 'Quiz'], ['progress', 'My Progress'], ['world', 'Campfire Run'], ['pets', 'Summon'], ['history', 'History']];
// the page's own theme behind the immersive scenes
const THEME = { kingdom: 'rgb(47, 94, 62)', world: 'rgb(50, 83, 62)', pets: 'rgb(27, 49, 84)', history: 'rgb(27, 49, 84)' };

for (const [w, h] of [[360, 640], [375, 667], [412, 915], [667, 375], [740, 360], [768, 1024], [820, 1180], [960, 1440]]) {
  test(`no covered controls, overlaps or stray backgrounds @ ${w}x${h}`, async ({ browser }) => {
    const { context, page } = await newStudentPage(browser, w, h);
    for (const [name, tab] of PAGES) {
      if (name === 'history') {
        await page.locator('.summon-bottom-bar').getByRole('button', { name: 'History', exact: true }).click();
        await expect(page.getByTestId('summon-modal')).toBeVisible();
        await expect(page.locator('.history-state[role=status]')).toHaveCount(0);
      } else if (tab) {
        await openStudentTab(page, tab);
        await expect(page.locator(`main#main.main-${name === 'pets' ? 'summon' : name}`)).toBeVisible();
      }
      // immersive pages show the top bar for a moment on arrival, then tuck it away
      await expect(page.locator('header#top.student-immersive-nav:not(.student-nav-hidden)')).toHaveCount(0, { timeout: 5000 });
      // the storybook page-turn between the Kingdom and its games has finished
      await expect(page.locator('.screen-wipe .sheet')).toHaveCount(0);
      if (name === 'world') await page.locator('.hero-preview-art canvas.hero-icon').waitFor({ timeout: 15_000 });
      await settle(page);
      const r = await page.evaluate(scan, name === 'history' ? '.story-modal' : null);
      expect.soft(r.covered, `${name} @ ${w}x${h}: covered controls`).toEqual([]);
      expect.soft(r.overlaps, `${name} @ ${w}x${h}: overlapping boxes`).toEqual([]);
      expect.soft(r.uneven, `${name} @ ${w}x${h}: uneven siblings in a row`).toEqual([]);
      if (THEME[name]) {
        expect.soft(r.bg.html, `${name}: html background`).toBe(THEME[name]);
        expect.soft(r.bg.body, `${name}: body background`).toBe(THEME[name]);
      }
      if (name === 'history') await page.keyboard.press('Escape');
    }
    await context.close();
  });
}
