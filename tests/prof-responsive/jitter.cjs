// ============================================================
// Resize-jitter instrumentation (dev/test only). Installs a probe in the
// page that snapshots the layout metrics that can bounce after a resize:
//   document scroll width/height, the sticky bars (top bar, Analytics
//   toolbar and section bar), the drawn width of every chart (its SVG
//   viewBox, i.e. the width useWidth() measured), the section bar's label
//   mode (.compact), and the sidebar/drawer state and transform.
// It also records ResizeObserver loop errors (window error events and
// console messages).
//
// settle(page) watches every animation frame for 1.5 s after the viewport
// stopped changing and returns when each metric last changed. Reflow at a
// breakpoint is expected; a change after 300 ms is bouncing.
// ============================================================

const PROBE = () => {
  if (window.__qqProbe) return;
  const errors = [];
  // when the web fonts finished loading (performance.now() time)
  // (fonts.ready resolves early when nothing is loading yet, so the last
  // loadingdone event is used: the moment a held-back font really arrived)
  document.fonts?.addEventListener?.('loadingdone', () => { window.__qqFontsAt = performance.now(); });
  window.addEventListener('error', (e) => { if (/ResizeObserver/.test(e.message || '')) errors.push(e.message); });
  const q = (s) => document.querySelector(s);
  const box = (el) => {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}`;
  };
  function metrics() {
    const se = document.scrollingElement;
    const side = q('#t-sidebar');
    const cs = side && getComputedStyle(side);
    return {
      scroll: `${se.scrollWidth}x${se.scrollHeight}`,
      topbar: box(q('header#top.t-topbar')),
      toolbar: box(q('.dash-toolbar')),
      nav: box(q('.dash-nav')),
      navMode: q('.dash-nav')?.classList.contains('compact') ? 'compact' : 'full',
      charts: [...document.querySelectorAll('.teacher-app .viz svg')].map((s) => s.getAttribute('viewBox')?.split(' ')[2]).join(','),
      drawer: side ? `${q('.teacher-app')?.classList.contains('drawer-open') ? 'open' : 'closed'}|${cs.transform}|${cs.visibility}` : null,
      collapsed: q('.teacher-app')?.classList.contains('nav-collapsed') || false,
      resizing: document.documentElement.classList.contains('is-resizing'),
    };
  }
  // every frame for `ms`: when each metric changed, relative to the start
  function observe(ms = 1500, marks = [0, 50, 100, 250, 500, 1000]) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      let prev = metrics();
      const changes = [];
      const samples = {};
      const tick = () => {
        const t = performance.now() - t0;
        const now = metrics();
        for (const k of Object.keys(now)) if (now[k] !== prev[k]) changes.push({ t: Math.round(t), key: k, from: prev[k], to: now[k] });
        prev = now;
        for (const m of marks) if (!samples[m] && t >= m) samples[m] = now;
        if (t < ms) requestAnimationFrame(tick);
        else resolve({ changes, samples, final: now, t0, fontsAt: window.__qqFontsAt ?? null });
      };
      requestAnimationFrame(tick);
    });
  }
  window.__qqProbe = { errors, metrics, observe };
};

async function installProbe(page) {
  await page.addInitScript(PROBE);
  page.__roErrors = [];
  page.on('console', (m) => { if (/ResizeObserver/.test(m.text())) page.__roErrors.push(m.text()); });
  page.on('pageerror', (e) => { if (/ResizeObserver/.test(e.message)) page.__roErrors.push(e.message); });
}

// Watch 1.5 s after the last resize. `late` = changes after 300 ms.
async function settle(page, ms = 1500) {
  const r = await page.evaluate((m) => window.__qqProbe.observe(m), ms);
  const errors = [...(await page.evaluate(() => window.__qqProbe.errors.splice(0))), ...page.__roErrors.splice(0)];
  return { ...r, late: r.changes.filter((c) => c.t > 300), errors };
}

// Width steps of 1 px within `span` px on each side of a breakpoint, down then up.
function steps(bp, span = 12) {
  const down = [];
  for (let w = bp + span; w >= bp - span; w--) down.push(w);
  return [...down, ...[...down].reverse()];
}

async function resizeTo(page, width, height) {
  await page.setViewportSize({ width, height });
  // one frame, so the resize event and the observers have run
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
}

module.exports = { installProbe, settle, steps, resizeTo };

// ---- state kept across a resize sweep ---------------------------------
const SWEEP = [1200, 991, 767, 575, 430, 375, 768, 992, 1200];
const H = require('./harness.cjs');

// Resizes through SWEEP (height kept) and returns { ok, checks: [...] }.
// Analytics: class picker, the section in view, scroll kept (not reset to the top)
// Question bank: topic and status filters
// Classes & Roster: search text, an open Create dialog and the name typed in it
async function checkStatePreserved(page, height = 800) {
  const checks = [];
  const sweep = async () => { for (const w of SWEEP) await resizeTo(page, w, height); await settle(page, 400); };
  const ok = (name, pass, detail = '') => checks.push({ name, pass, detail });

  await H.openTab(page, 'Analytics');
  const cls = page.getByLabel('Class', { exact: true });
  const other = await cls.locator('option').nth(1).getAttribute('value');
  await cls.selectOption(other);
  await page.waitForFunction(() => !document.querySelector('.sk') && document.querySelector('#dash-overview .tb-list'));
  await page.click('.dash-nav [data-section="dash-missed"]');
  await page.waitForFunction(() => new Promise((r) => { const y = scrollY; requestAnimationFrame(() => requestAnimationFrame(() => r(Math.abs(scrollY - y) < 0.5 && scrollY > 0))); }));
  await page.waitForFunction(() => document.querySelector('.dash-nav [aria-current="location"]')?.dataset.section === 'dash-missed');
  const sectionBefore = 'dash-missed';
  await sweep();
  ok('Analytics: selected class kept', (await cls.inputValue()) === other);
  const y = await page.evaluate(() => scrollY);
  ok('Analytics: scroll not reset to the top', y > 400, `scrollY ${Math.round(y)}`);
  // the section the professor was reading is still on screen
  const missedTop = await page.evaluate(() => Math.round(document.querySelector('#dash-missed h3').getBoundingClientRect().top));
  const vh = await page.evaluate(() => innerHeight);
  ok('Analytics: same section in view', missedTop >= 0 && missedTop < vh, `${sectionBefore} heading at ${missedTop}px of ${vh}`);
  ok('Analytics: tab kept', (await page.locator('#tabs [aria-current="page"]').textContent()).includes('Analytics'));

  await H.openTab(page, 'Question bank');
  const topic = page.locator('.bank-filters select');
  const tval = await topic.locator('option').nth(2).getAttribute('value');
  await topic.selectOption(tval);
  await page.locator('.bank-status button', { hasText: 'Published' }).click();
  await sweep();
  ok('Question bank: topic filter kept', (await topic.inputValue()) === tval);
  ok('Question bank: status filter kept', (await page.locator('.bank-status button[aria-pressed="true"]').textContent()).includes('Published'));

  await H.openTab(page, 'Classes & Roster');
  await page.getByLabel('Search classes').fill('Evening');
  await page.getByRole('button', { name: '+ Create Class' }).click();
  await page.locator('#new-class-name').fill('Responsive check group');
  await sweep();
  ok('Classes: Create dialog still open', await page.locator('.modal-overlay .modal-card').isVisible());
  ok('Classes: typed class name kept', (await page.locator('#new-class-name').inputValue()) === 'Responsive check group');
  ok('Classes: search text kept', (await page.getByLabel('Search classes').inputValue()) === 'Evening');
  await page.locator('.modal-overlay').getByRole('button', { name: 'Cancel' }).click();
  return { ok: checks.every((c) => c.pass), checks };
}

module.exports.checkStatePreserved = checkStatePreserved;
module.exports.SWEEP = SWEEP;
