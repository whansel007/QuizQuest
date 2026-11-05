// ============================================================
// Professor workspace responsive harness (see docs/mobile/PROF-NOTES.md).
// Shared by the audit script (audit.cjs: report + screenshots) and the
// browser tests (test/browser-prof-responsive.test.cjs).
//
// - startServer(): an in-memory server (never data/db.json or Supabase)
//   filled by the dev-only fixture scripts/seed-prof-responsive.js
// - signIn(): Prof. Demo A, through the demo login route
// - openTab(): through the sidebar, or the drawer below 992px
// - audit(): the page-level checks, run inside the page
// Waits are for conditions, never fixed sleeps.
// ============================================================
const path = require('node:path');
const { start } = require('../../server');
const { enrichForProfResponsive } = require('../../scripts/seed-prof-responsive');

const ROOT = path.join(__dirname, '..', '..');

// [width, height]: both sides of every transition (430, 576, 768, 992, 1200)
// plus two short landscape phones
const VIEWPORTS = [
  [375, 667], [430, 932], [431, 900], [575, 900], [576, 900], [767, 900], [768, 900],
  [991, 900], [992, 900], [1199, 900], [1200, 900], [667, 375], [740, 360],
];
const SCREENSHOT_WIDTHS = [375, 430, 576, 768, 992, 1200];

// id, label (as in App.vue), and what says the page has its data
const TABS = [
  ['analytics', 'Analytics', () => !!document.querySelector('#dash-overview .tb-list') && !document.querySelector('.sk')],
  ['todo', 'To review', () => !!document.querySelector('[data-testid="marking-item"], [data-testid="todo-empty"]')],
  ['classes', 'Classes & Roster', () => !!document.querySelector('.class-card')],
  ['review', 'Question bank', () => !!document.querySelector('.bank-results .qcard, .bank-results .t-empty, .bank-cards')],
  ['generate', 'AI drafting', () => !!document.querySelector('[data-testid="generate-page"]') && !document.querySelector('.sk')],
  ['evaluation', 'Evaluation', () => !!document.querySelector('[data-testid="evaluation-page"]') && !!document.querySelector('main#main table')],
  ['settings', 'Settings', () => !!document.querySelector('[data-testid="settings-page"]') && !!document.querySelector('main#main textarea')],
];

// An offline stand-in for the AI drafter, so "Draft questions" works without
// a network and shows its retrieved-material details.
let drafted = 0;
async function offlineDrafter(ctx) {
  return {
    items: Array.from({ length: ctx.count }, () => ({
      type: 'mcq',
      stem: `Offline draft ${++drafted}: which statement about ${ctx.topic.name} is supported by the notes?`,
      options: ['A statement the notes contradict', 'The statement the notes support', 'An unrelated statement', 'A partly true statement'],
      answerIndex: 1,
      explanation: 'The retrieved notes support the second statement.',
      difficulty: 'medium',
      sourceIds: [ctx.chunks[0].passageId],
    })),
  };
}

async function startServer() {
  const srv = start(0, { dataFile: null, drafter: offlineDrafter, distDir: process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : undefined });
  await new Promise((r) => srv.httpServer.once('listening', r));
  enrichForProfResponsive(srv.quiz.db);
  return { srv, base: `http://localhost:${srv.httpServer.address().port}` };
}

// Console messages and failed requests are collected per page
function watch(page) {
  const log = { errors: [], warnings: [], failed: [] };
  page.on('pageerror', (e) => log.errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') log.errors.push(m.text());
    else if (m.type() === 'warning') log.warnings.push(m.text());
  });
  page.on('requestfailed', (r) => log.failed.push(`${r.method()} ${new URL(r.url()).pathname} ${r.failure()?.errorText || ''}`));
  page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) log.failed.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`); });
  return log;
}

async function signIn(page, base, userId = 't-a') {
  const res = await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) });
  if (!res.ok) throw new Error('demo login failed: ' + res.status);
  const { token } = await res.json();
  await page.addInitScript((t) => { try { sessionStorage.setItem('qq-token', t); } catch { /* ignore */ } }, token);
  await page.goto(base);
  await page.locator('.teacher-app').waitFor();
  return token;
}

const drawerMode = (page) => page.evaluate(() => innerWidth < 992);

async function openTab(page, label) {
  const tab = TABS.find(([id, l]) => l === label || id === label);
  if (await drawerMode(page)) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.locator('.teacher-app.drawer-open').waitFor();
  }
  await page.locator('#tabs').getByRole('button', { name: tab[1], exact: true }).click();
  await waitDrawerClosed(page);
  await waitReady(page, tab[1]);
}

// closed means hidden: the drawer stays visible until its slide-out ends
async function waitDrawerClosed(page) {
  await page.waitForFunction(() => {
    const app = document.querySelector('.teacher-app');
    const side = document.querySelector('#t-sidebar');
    return !app.classList.contains('drawer-open') && (innerWidth >= 992 || getComputedStyle(side).visibility === 'hidden');
  });
}

async function waitReady(page, label) {
  const tab = TABS.find(([id, l]) => l === label || id === label);
  await page.waitForFunction(tab[2], null, { timeout: 15000 });
  // web fonts and one frame of layout
  await page.evaluate(() => document.fonts?.ready);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

// ---- the in-page checks -------------------------------------------------
// Returns { overflow, offenders, clipped, overlaps, smallTargets, sticky }.
function auditInPage(opts) {
  const vw = document.documentElement.clientWidth;
  const vh = innerHeight;
  const sel = (el) => {
    if (!el || el === document.body) return 'body';
    const tid = el.getAttribute('data-testid');
    if (tid) return `[data-testid="${tid}"]`;
    let s = el.tagName.toLowerCase();
    if (el.id) return s + '#' + el.id;
    const cls = [...el.classList].filter((c) => !/^(v-|router)/.test(c)).slice(0, 3);
    if (cls.length) s += '.' + cls.join('.');
    if (!cls.length && !el.id && el.parentElement) s = sel(el.parentElement).replace(/(".*")$/, '') + ' > ' + s;
    const label = el.getAttribute('aria-label') || (['BUTTON', 'H2', 'H3', 'H4', 'A', 'LABEL', 'SUMMARY'].includes(el.tagName) ? el.textContent.trim().slice(0, 28) : '');
    return label ? `${s}("${label.replace(/\s+/g, ' ')}")` : s;
  };
  const shown = (el) => el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : el.offsetParent !== null;
  // a box that clips or scrolls sideways contains its children
  const clipsX = (el) => {
    const o = getComputedStyle(el).overflowX;
    return o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip';
  };
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      // the page shell clipping is what hides problems, so it does not count as a container
      if (p.matches('main#main, .teacher-app')) continue;
      if (clipsX(p)) return p;
    }
    return null;
  };
  const isSrOnly = (el) => { const r = el.getBoundingClientRect(); return r.width <= 1 && r.height <= 1; };
  const root = document.querySelector('.teacher-app');
  const all = [...root.querySelectorAll('*')].filter((el) => shown(el) && !isSrOnly(el));

  // 1. page-level overflow, and the outermost elements that stick out
  const se = document.scrollingElement;
  const overflow = se.scrollWidth - se.clientWidth;
  const offenders = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    if (inScroller(el)) continue;
    if (getComputedStyle(el).position === 'fixed' && el.closest('.t-sidebar')) continue;
    offenders.push({ el, s: sel(el), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
  }
  const outer = offenders.filter((o) => !offenders.some((p) => p.el !== o.el && p.el.contains(o.el)));

  // 2. text clipped by a hidden overflow (not a scroll region, not an ellipsis with a title)
  const clipped = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!['hidden', 'clip'].includes(cs.overflowX) && !['hidden', 'clip'].includes(cs.overflowY)) continue;
    if (!el.textContent.trim()) continue;
    const overX = el.scrollWidth > el.clientWidth + 1 && ['hidden', 'clip'].includes(cs.overflowX);
    const overY = el.scrollHeight > el.clientHeight + 2 && ['hidden', 'clip'].includes(cs.overflowY) && !cs.webkitLineClamp?.match(/\d/);
    if (!overX && !overY) continue;
    const ellipsis = cs.textOverflow === 'ellipsis' || /\d/.test(cs.webkitLineClamp || '');
    const titled = !!(el.title || el.closest('[title]') || el.closest('[aria-label]'));
    if (ellipsis && titled) continue;
    clipped.push({ s: sel(el), how: overX ? 'x' : 'y', ellipsis, titled, by: Math.round(overX ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight) });
  }

  // 3. overlapping controls and headings
  const CONTROL = 'button, input:not([type="hidden"]), select, textarea, a[href], summary, h2, h3, h4, [role="button"]';
  const controls = all.filter((el) => el.matches(CONTROL) && !el.closest('.dash-nav-short, .modal-overlay:not(.audit-open)'));
  const boxes = controls.map((el) => ({ el, r: el.getBoundingClientRect() })).filter((b) => b.r.width > 0 && b.r.height > 0);
  const overlaps = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      // label wrapping an input, or the control inside the same label
      if (a.el.closest('label') && a.el.closest('label') === b.el.closest('label')) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      // a control scrolled under a sticky bar is the sticky check's business
      const stuck = (el) => { for (let p = el; p; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === 'sticky' || pos === 'fixed') return p; } return null; };
      if (w > 2 && h > 2 && stuck(a.el) === stuck(b.el)) {
        // only when both share a scroll container (otherwise one is scrolled under the other)
        if (inScroller(a.el) !== inScroller(b.el)) continue;
        overlaps.push({ a: sel(a.el), b: sel(b.el), w: Math.round(w), h: Math.round(h) });
      }
    }
  }

  // 4. touch targets below 768px
  const smallTargets = [];
  if (vw < 768) {
    const TARGET = 'button, a[href], input:not([type="hidden"]), select, textarea, summary, [role="button"]';
    for (const el of all.filter((e) => e.matches(TARGET))) {
      let r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      let note = '';
      // a checkbox or radio is hit through its label
      if (el.matches('input[type="checkbox"], input[type="radio"]') && el.closest('label')) { r = el.closest('label').getBoundingClientRect(); note = 'via label'; }
      // a link or link-button inside running text (WCAG 2.5.8 inline exception)
      const inline = el.matches('a, .linklike') && getComputedStyle(el).display.startsWith('inline') && /\S/.test((el.parentElement?.textContent || '').replace(el.textContent, ''));
      if (r.width >= 43.5 && r.height >= 43.5) continue;
      smallTargets.push({ s: sel(el), w: Math.round(r.width), h: Math.round(r.height), inline, note });
    }
  }

  // 5. sticky / fixed bars: their combined height
  const bars = all.filter((el) => {
    const p = getComputedStyle(el).position;
    if (p !== 'sticky' && p !== 'fixed') return false;
    if (el.closest('.t-sidebar, table') || el.classList.contains('t-scrim') || el.closest('.modal-overlay, dialog')) return false;
    const r = el.getBoundingClientRect();
    return r.width > vw * 0.5 && r.height > 0 && r.height < vh;
  }).filter((el, _, xs) => !xs.some((p) => p !== el && p.contains(el) && getComputedStyle(p).position === getComputedStyle(el).position));
  const stickyTotal = bars.reduce((n, el) => n + el.getBoundingClientRect().height, 0);

  return {
    vw, vh, overflow,
    offenders: outer.slice(0, 12).map(({ el, ...o }) => o),
    clipped: clipped.slice(0, 20),
    overlaps: overlaps.slice(0, 20),
    smallTargets: smallTargets.slice(0, 40),
    smallTargetCount: smallTargets.filter((t) => !t.inline).length,
    sticky: { bars: bars.map(sel), total: Math.round(stickyTotal), share: +(stickyTotal / vh).toFixed(2) },
  };
}

async function audit(page) {
  return page.evaluate(auditInPage, {});
}

// The bottom of the page must not sit under a sticky or fixed bar, and the
// last control must be reachable.
async function checkPageEnd(page) {
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
  await page.waitForFunction(() => Math.abs(scrollY + innerHeight - document.scrollingElement.scrollHeight) < 2 || document.scrollingElement.scrollHeight <= innerHeight);
  const res = await page.evaluate(() => {
    const main = document.querySelector('main#main');
    const last = [...main.querySelectorAll('button, a[href], input, select, textarea, p, td, li')].filter((el) => el.checkVisibility?.() && el.getBoundingClientRect().height > 0).at(-1);
    if (!last) return { ok: true };
    const r = last.getBoundingClientRect();
    const hit = document.elementFromPoint(Math.min(innerWidth - 2, r.left + Math.min(10, r.width / 2)), Math.min(innerHeight - 2, r.top + r.height / 2));
    const covered = hit && !last.contains(hit) && !hit.contains(last) && hit.closest('[style*="sticky"], .t-topbar, .dash-toolbar, .dash-nav, .sticky-actions');
    return { ok: r.bottom <= innerHeight + 1 && !covered, bottom: Math.round(r.bottom), vh: innerHeight, covered: covered ? covered.className : null };
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  return res;
}

// Analytics: every section-bar jump lands with its heading below the sticky bars.
async function checkAnchors(page) {
  const ids = await page.$$eval('.dash-nav [data-section]', (bs) => bs.map((b) => b.dataset.section));
  const out = [];
  for (const id of ids) {
    await page.click(`.dash-nav [data-section="${id}"]`);
    // the smooth scroll has ended when two frames in a row agree
    await page.waitForFunction(() => new Promise((r) => { const y = scrollY; requestAnimationFrame(() => requestAnimationFrame(() => r(Math.abs(scrollY - y) < 0.5))); }), null, { timeout: 5000 });
    const r = await page.evaluate((sid) => {
      const el = document.getElementById(sid);
      const head = (el.closest('.t-section') || el).querySelector('h3, h4') || el;
      const top = head.getBoundingClientRect().top;
      const bars = [...document.querySelectorAll('header#top.t-topbar, .dash-toolbar, .dash-nav')].filter((b) => ['sticky', 'fixed'].includes(getComputedStyle(b).position) && b.checkVisibility());
      const cover = Math.max(0, ...bars.map((b) => b.getBoundingClientRect().bottom));
      const atEnd = Math.abs(scrollY + innerHeight - document.scrollingElement.scrollHeight) < 2;
      return { id: sid, top: Math.round(top), cover: Math.round(cover), ok: top >= cover - 1 || (atEnd && top >= cover - 1) };
    }, id);
    out.push(r);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return out;
}

// The focused element after a keyboard Tab must not sit under a sticky bar.
async function checkFocusCover(page, steps = 25) {
  const bad = [];
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('main#main')?.setAttribute('tabindex', '-1'); document.querySelector('main#main')?.focus(); });
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.closest('.t-sidebar, header#top')) return null;
      const box = el.getBoundingClientRect();
      // an element taller than the screen cannot be fully shown anyway
      if (box.height > innerHeight / 2) return null;
      const bars = [...document.querySelectorAll('header#top.t-topbar, .dash-toolbar, .dash-nav, .sticky-actions')].filter((b) => ['sticky', 'fixed'].includes(getComputedStyle(b).position) && b.checkVisibility() && !b.contains(el) && !el.contains(b));
      const hit = bars.find((b) => { const r = b.getBoundingClientRect(); return box.top < r.bottom - 1 && box.bottom > r.top + 1 && box.left < r.right && box.right > r.left; });
      // focus that leaves the control entirely out of sight (a tall field partly in view is normal)
      const off = box.bottom < 1 || box.top > innerHeight - 1;
      return hit || off ? `${el.tagName.toLowerCase()}("${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}") at ${Math.round(box.top)}-${Math.round(box.bottom)}${hit ? ' under ' + (hit.id || hit.className) : ' off screen'}` : null;
    });
    if (r) bad.push(r);
  }
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  return bad;
}

module.exports = { waitDrawerClosed, ROOT, VIEWPORTS, SCREENSHOT_WIDTHS, TABS, startServer, watch, signIn, openTab, waitReady, audit, auditInPage, checkPageEnd, checkAnchors, checkFocusCover };
