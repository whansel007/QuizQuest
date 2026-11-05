#!/usr/bin/env node
// ============================================================
// Resize-jitter sweeps (Stage 3). Writes docs/mobile/prof-jitter-<label>.md/.json
//   node tests/prof-responsive/jitter-sweep.cjs --label before
// Sweeps:
//   a  1 px steps within 12 px of 1200, 992, 768, 576 and 430, down then up,
//      on Analytics; each step watched 250 ms (a change after 120 ms there is
//      a bounce), each sweep ends with a 1.5 s window
//   b  across 992 with the drawer open, the sidebar collapsed and expanded
//   c  height only, 667 -> 600 -> 667 at 375 wide (a mobile browser bar)
//   d  a late webfont (fonts held back 4 s) on Analytics
//   e  ten rapid back-and-forth resizes across 992 and 768
// A metric that changes more than 300 ms after the last resize counts as
// layout that keeps moving after the viewport stopped.
// ============================================================
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const H = require('./harness.cjs');
const J = require('./jitter.cjs');

const label = (() => { const i = process.argv.indexOf('--label'); return i > 0 ? process.argv[i + 1] : 'run'; })();
const results = [];
const add = (sweep, detail, r, extra = {}) => {
  results.push({ sweep, detail, late: r.late, errors: r.errors, samples: r.samples, ...extra });
  console.log(`${sweep.padEnd(4)} ${detail.padEnd(48)} late ${String(r.late.length).padStart(3)}  RO errors ${r.errors.length}${extra.note ? '  ' + extra.note : ''}`);
};

async function newPage(browser, base, width, height, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'en-SG' });
  const page = await ctx.newPage();
  await J.installProbe(page);
  if (opts.slowFonts) await page.route(/\.woff2?$/, async (route) => { await new Promise((r) => setTimeout(r, 4000)); await route.continue(); });
  await H.signIn(page, base);
  return { ctx, page };
}

(async () => {
  const { srv, base } = await H.startServer();
  const browser = await chromium.launch({ headless: true });
  try {
    // ---- a: width steps around each breakpoint, on Analytics
    {
      const { ctx, page } = await newPage(browser, base, 1212, 900);
      await H.openTab(page, 'Analytics');
      for (const bp of [1200, 992, 768, 576, 430]) {
        let bounces = 0;
        const where = [];
        for (const w of J.steps(bp)) {
          await J.resizeTo(page, w, 900);
          const r = await page.evaluate(() => window.__qqProbe.observe(250, []));
          const late = r.changes.filter((c) => c.t > 120 && c.key !== 'resizing'); // is-resizing clears at 150 ms by design
          if (late.length) { bounces++; where.push(`${w}px: ${[...new Set(late.map((c) => c.key))].join('+')}`); }
        }
        const r = await J.settle(page);
        add('a', `steps around ${bp}px (${J.steps(bp).length} resizes)`, r, { bounces, where: where.slice(0, 10), note: bounces ? `${bounces} steps still moving after 120 ms` : '' });
      }
      await ctx.close();
    }
    // ---- b: across 992 with the drawer open / sidebar collapsed / expanded
    {
      const { ctx, page } = await newPage(browser, base, 991, 800);
      await H.openTab(page, 'Analytics');
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await page.locator('.teacher-app.drawer-open').waitFor();
      await J.resizeTo(page, 1100, 800);
      let r = await J.settle(page);
      const wide = await page.evaluate(() => ({ open: document.querySelector('.teacher-app').classList.contains('drawer-open'), scrim: !!document.querySelector('.t-scrim'), bodyOverflow: getComputedStyle(document.body).overflow, focus: document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName }));
      add('b', 'drawer open at 991, resized to 1100', r, { state: wide, note: `drawer-open class ${wide.open ? 'KEPT' : 'cleared'}, scrim ${wide.scrim ? 'kept' : 'gone'}` });
      await J.resizeTo(page, 991, 800);
      r = await J.settle(page);
      const back = await page.evaluate(() => { const s = document.querySelector('#t-sidebar'); return { open: document.querySelector('.teacher-app').classList.contains('drawer-open'), transform: getComputedStyle(s).transform, visibility: getComputedStyle(s).visibility }; });
      add('b', 'then back to 991', r, { state: back, note: back.open ? 'drawer reappears OPEN (stale)' : 'drawer closed' });
      if (back.open) { await page.keyboard.press('Escape'); await H.waitDrawerClosed(page); }
      for (const collapsed of [true, false]) {
        await J.resizeTo(page, 1200, 800);
        const isCollapsed = await page.evaluate(() => document.querySelector('.teacher-app').classList.contains('nav-collapsed'));
        if (isCollapsed !== collapsed) await page.locator('.t-collapse').click();
        await J.settle(page, 600);
        for (const w of [991, 1200, 991, 1200]) await J.resizeTo(page, w, 800);
        r = await J.settle(page);
        add('b', `sidebar ${collapsed ? 'collapsed' : 'expanded'}: 1200 <-> 991 twice`, r);
      }
      if (await page.evaluate(() => document.querySelector('.teacher-app').classList.contains('nav-collapsed'))) await page.locator('.t-collapse').click();
      await ctx.close();
    }
    // ---- c: height only
    {
      const { ctx, page } = await newPage(browser, base, 375, 667);
      await H.openTab(page, 'Analytics');
      await page.evaluate(() => window.scrollTo(0, 1200));
      for (const h of [600, 667, 600, 667]) {
        await J.resizeTo(page, 375, h);
        const r = await J.settle(page);
        add('c', `height to ${h} at 375 wide`, r, { scrollY: await page.evaluate(() => scrollY) });
      }
      await ctx.close();
    }
    // ---- d: late webfont
    {
      // Analytics is the professor's first tab; watch from the first paint,
      // while the fonts are still held back, and count what moves after they land
      const { ctx, page } = await newPage(browser, base, 1100, 800, { slowFonts: true });
      const r = await J.settle(page, 6000);
      const fontsAt = r.fontsAt === null ? null : Math.round(r.fontsAt - r.t0);
      // the text reflows as the font file arrives, a little before loadingdone fires
      const after = fontsAt === null ? [] : r.changes.filter((c) => c.t > fontsAt - 400);
      const settledLate = after.length ? after.filter((c) => c.t > after[0].t + 300) : [];
      add('d', `fonts held back 4 s (landed at +${fontsAt} ms), watched 6 s`, { ...r, late: settledLate }, { afterFonts: after.length, navModeChanges: after.filter((c) => c.key === 'navMode').length, note: `${after.length} changes in the frames after the fonts landed, ${after.filter((c) => c.key === 'navMode').length} label-mode toggles` });
      await ctx.close();
    }
    // ---- e: rapid back and forth
    {
      const { ctx, page } = await newPage(browser, base, 993, 800);
      await H.openTab(page, 'Analytics');
      for (const [a, b] of [[993, 991], [769, 767]]) {
        for (let i = 0; i < 10; i++) { await page.setViewportSize({ width: a, height: 800 }); await page.setViewportSize({ width: b, height: 800 }); }
        const r = await J.settle(page);
        add('e', `10 x ${a} <-> ${b}, no waits`, r);
      }
      await ctx.close();
    }
    // ---- f: state survives a sweep 1200 -> 375 -> 1200
    {
      const { ctx, page } = await newPage(browser, base, 1200, 800);
      const s = await J.checkStatePreserved(page);
      for (const c of s.checks) console.log(`f    ${c.name.padEnd(48)} ${c.pass ? 'kept' : 'LOST'} ${c.detail}`);
      results.push({ sweep: 'f', detail: 'state across 1200 -> 375 -> 1200', late: [], errors: [], note: s.checks.filter((c) => !c.pass).map((c) => c.name).join('; ') || 'all kept', checks: s.checks });
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.io.close();
    srv.httpServer.close();
  }
  const out = path.join(H.ROOT, 'docs', 'mobile', `prof-jitter-${label}`);
  fs.writeFileSync(out + '.json', JSON.stringify(results, null, 1));
  let md = `# Professor resize-jitter sweeps: ${label}\n\nGenerated by \`node tests/prof-responsive/jitter-sweep.cjs --label ${label}\` (Chromium, fixture data, Analytics).\n"Late" = metric changes more than 300 ms after the last resize; "bounces" = 1 px steps where a metric was still changing 120-250 ms after that step.\n\n| Sweep | What | Late changes | Bounces | RO errors | Note |\n|---|---|---|---|---|---|\n`;
  for (const r of results) md += `| ${r.sweep} | ${r.detail} | ${r.late.length} | ${r.bounces ?? '-'} | ${r.errors.length} | ${r.note || ''} |\n`;
  const lates = results.filter((r) => r.late.length || r.where?.length);
  if (lates.length) {
    md += `\n## Details\n`;
    for (const r of lates) md += `\n### ${r.sweep}: ${r.detail}\n${r.late.slice(0, 8).map((c) => `- +${c.t} ms ${c.key}: ${c.from} -> ${c.to}`).join('\n')}${r.where?.length ? '\n- bouncing steps: ' + r.where.join('; ') : ''}\n`;
  }
  fs.writeFileSync(out + '.md', md);
  console.log('report:', path.relative(H.ROOT, out + '.md'));
})().catch((e) => { console.error(e); process.exit(1); });
