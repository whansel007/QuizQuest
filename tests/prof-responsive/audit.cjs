#!/usr/bin/env node
// ============================================================
// Professor workspace responsive audit: every tab at every required
// viewport, with populated fixture data, plus the interactive states that
// change layout (drawer, modals, editor, sub-tabs, card mode, retrieved
// material, question dialog). Writes:
//   docs/mobile/prof-audit-<label>.json   raw results
//   docs/mobile/prof-audit-<label>.md     tab x viewport table + issues
//   docs/mobile/screenshots/prof/<label>/ screenshots (with --shots)
//
//   pnpm build
//   node tests/prof-responsive/audit.cjs --label before --shots
//   node tests/prof-responsive/audit.cjs --label after --shots
//   node tests/prof-responsive/audit.cjs --tabs analytics,todo --widths 375,992
// ============================================================
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const H = require('./harness.cjs');

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const label = opt('label', 'run');
const shots = args.includes('--shots');
const tabFilter = opt('tabs', '') ? opt('tabs').split(',') : null;
const widthFilter = opt('widths', '') ? opt('widths').split(',').map(Number) : null;
const DOCS = path.join(H.ROOT, 'docs', 'mobile');
const SHOT_DIR = path.join(DOCS, 'screenshots', 'prof', label);

const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Small touch targets that are acceptable, with the reason (reported, not failed)
function targetExceptions(t) {
  if (t.inline) return 'inline link in running text (WCAG 2.5.8 inline exception)';
  if (/input\[type|checkbox|radio/.test(t.s) && t.note === 'via label') return null;
  return null;
}

function issuesOf(r) {
  const out = [];
  if (r.overflow > 1) out.push(`page overflows by ${r.overflow}px`);
  for (const o of r.offenders) out.push(`outside viewport: ${o.s} (left ${o.left}, right ${o.right}, width ${o.width})`);
  for (const c of r.clipped) out.push(`clipped text (${c.how}, ${c.by}px${c.ellipsis ? ', ellipsis without title' : ''}): ${c.s}`);
  for (const o of r.overlaps) out.push(`overlap ${o.w}x${o.h}: ${o.a} / ${o.b}`);
  const small = r.smallTargets.filter((t) => !targetExceptions(t));
  if (small.length) out.push(`${small.length} tap targets under 44px: ` + small.slice(0, 8).map((t) => `${t.s} ${t.w}x${t.h}`).join('; '));
  if (r.sticky.share > 0.3) out.push(`sticky bars cover ${Math.round(r.sticky.share * 100)}% of the height (${r.sticky.bars.join(' + ')})`);
  if (r.end && !r.end.ok) out.push(`end of page not reachable: last element bottom ${r.end.bottom} of ${r.end.vh}${r.end.covered ? ' under ' + r.end.covered : ''}`);
  for (const a of r.anchors || []) if (!a.ok) out.push(`anchor ${a.id} lands under sticky bars (top ${a.top} < ${a.cover})`);
  for (const f of r.focus || []) out.push(`focus under sticky bar: ${f}`);
  for (const e of r.log?.errors || []) out.push(`console error: ${e.slice(0, 160)}`);
  for (const e of r.log?.warnings || []) out.push(`console warning: ${e.slice(0, 160)}`);
  for (const e of r.log?.failed || []) out.push(`failed request: ${e}`);
  return out;
}

async function modalFit(page, selector = '.modal-overlay .modal-card') {
  return page.evaluate((s) => {
    const card = document.querySelector(s);
    if (!card) return { ok: false, missing: true };
    const r = card.getBoundingClientRect();
    const fits = r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1;
    const cs = getComputedStyle(card);
    const scroller = card.scrollHeight > card.clientHeight + 1 ? ['auto', 'scroll'].includes(cs.overflowY) : true;
    card.scrollTop = card.scrollHeight;
    const submit = card.querySelector('button[type="submit"], .btn.primary') || card.querySelector('button');
    const sr = submit?.getBoundingClientRect();
    const reachable = !!sr && sr.top >= Math.max(0, r.top) - 1 && sr.bottom <= Math.min(r.bottom, innerHeight) + 1;
    const close = [...card.querySelectorAll('button')].find((b) => /close|cancel/i.test(b.getAttribute('aria-label') || b.textContent));
    card.scrollTop = 0;
    const cr = close?.getBoundingClientRect();
    return { ok: fits && scroller && reachable, fits, scroller, reachable, closeVisibleAtTop: !!cr && cr.bottom <= innerHeight && cr.top >= 0, h: Math.round(r.height), vh: innerHeight };
  }, selector);
}

// The interactive states, at one viewport. Each returns an audit plus extras.
async function states(page, vp) {
  const out = [];
  const record = async (name, extra = {}) => {
    const r = await H.audit(page);
    out.push({ state: name, ...r, ...extra, issues: [] });
    out.at(-1).issues = issuesOf(out.at(-1));
    if (extra.modal && !extra.modal.ok) out.at(-1).issues.push(`modal does not fit/scroll: ${JSON.stringify(extra.modal)}`);
    if (shots) await page.screenshot({ path: path.join(SHOT_DIR, `state-${slug(name)}-${vp[0]}x${vp[1]}.jpg`), type: 'jpeg', quality: 60 });
  };
  const step = async (name, fn) => {
    try { await fn(); } catch (e) {
      out.push({ state: name + ' (could not run)', vw: vp[0], vh: vp[1], overflow: 0, offenders: [], clipped: [], overlaps: [], smallTargets: [], sticky: { bars: [], total: 0, share: 0 }, issues: ['state could not be exercised: ' + e.message.split(String.fromCharCode(10))[0]] });
      await page.screenshot({ path: path.join(DOCS, 'screenshots', 'prof', 'debug-' + slug(name) + '-' + vp[0] + '.png') }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
    }
  };
  // drawer
  if (vp[0] < 992) await step('drawer', async () => {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.locator('.teacher-app.drawer-open').waitFor();
    await page.waitForFunction(() => { const s = document.querySelector('#t-sidebar'); return s && getComputedStyle(s).transform === 'none'; });
    const fit = await page.evaluate(() => { const s = document.querySelector('#t-sidebar').getBoundingClientRect(); const last = [...document.querySelectorAll('#t-sidebar button')].at(-1).getBoundingClientRect(); return { fits: s.right <= innerWidth && s.left >= 0, lastReachable: last.bottom <= innerHeight || document.querySelector('#t-sidebar').scrollHeight > document.querySelector('#t-sidebar').clientHeight }; });
    await record('drawer open', { drawer: fit });
    await page.keyboard.press('Escape');
    await H.waitDrawerClosed(page);
  });
  // Analytics: the question dialog
  await step('analytics dialog', async () => {
  await H.openTab(page, 'Analytics');
  await page.locator('#dash-time table .linklike, .missed-title').first().click();
  await page.locator('dialog.insight[open]').waitFor();
  await record('analytics question dialog', { modal: await modalFit(page, 'dialog.insight[open]') });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog.insight[open]'));
  });
  // Classes
  await step('classes', async () => { // create / rename modals, sub-tabs, code modal
  await H.openTab(page, 'Classes & Roster');
  await page.getByRole('button', { name: '+ Create Class' }).click();
  await page.locator('.modal-overlay').waitFor();
  await record('classes create modal', { modal: await modalFit(page) });
  await page.locator('.modal-overlay').getByRole('button', { name: 'Cancel' }).click();
  await page.locator('.class-card').first().getByRole('button', { name: 'Rename' }).click();
  await page.locator('.modal-overlay').waitFor();
  await record('classes rename modal', { modal: await modalFit(page) });
  await page.locator('.modal-overlay').getByRole('button', { name: 'Cancel' }).click();
  await page.locator('.class-card').filter({ hasText: 'Evening Cohort' }).getByRole('button', { name: /Manage Roster/ }).click();
  await page.locator('.teacher-roster-table').waitFor();
  await record('classes roster');
  await page.locator('.sub-tab-btn', { hasText: 'Join Codes' }).click();
  await page.getByRole('button', { name: /Generate (First )?Join Code/ }).first().click();
  await page.locator('.modal-overlay').waitFor();
  await record('classes code modal', { modal: await modalFit(page) });
  await page.locator('.modal-overlay').getByRole('button', { name: 'Cancel' }).click();
  await page.locator('.sub-tab-btn', { hasText: 'Class Settings' }).click();
  await page.getByRole('region', { name: 'Class settings' }).waitFor();
  await record('classes class settings');
  await page.getByRole('button', { name: '← Back to all classes' }).click();
  });
  // Question bank: card mode and the editor
  await step('question bank', async () => {
  await H.openTab(page, 'Question bank');
  await page.getByRole('button', { name: /^Review as cards/ }).click();
  await page.locator('.bank-cards').waitFor();
  await record('question bank cards');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await page.locator('.bank-results').waitFor();
  await page.getByRole('button', { name: /^Published/ }).first().click();
  await page.locator('.qcard').first().waitFor();
  await page.locator('.qcard').first().getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('.qcard .editor, .qcard form, .qcard .question-editor').first().waitFor().catch(() => {});
  await record('question bank editor');
  });
  // AI drafting
  await step('ai drafting', async () => { // run a draft, open the retrieved material
  await H.openTab(page, 'AI drafting');
  const draft = page.getByRole('button', { name: 'Draft questions', exact: true });
  if (await draft.count()) {
    await draft.click();
    const summary = page.locator('summary', { hasText: 'Material sent to the drafter' });
    await summary.waitFor({ timeout: 15000 });
    await summary.click();
    await record('ai drafting retrieved material');
  }
  await page.locator('details.panel > summary', { hasText: 'Material library' }).click();
  await page.waitForFunction(() => document.querySelector('details.panel[open]'));
  await record('ai drafting material library');
  await page.locator('details.panel > summary', { hasText: 'Material library' }).click();
  });
  return out;
}

(async () => {
  const { srv, base } = await H.startServer();
  const browser = await chromium.launch({ headless: true });
  fs.mkdirSync(DOCS, { recursive: true });
  if (shots) fs.mkdirSync(SHOT_DIR, { recursive: true });
  const results = [];
  const viewports = H.VIEWPORTS.filter(([w]) => !widthFilter || widthFilter.includes(w));
  const stateViewports = new Set(['375x667', '667x375', '430x932', '768x900', '991x900', '992x900']);
  try {
    for (const vp of viewports) {
      const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, locale: 'en-SG', deviceScaleFactor: 1, hasTouch: vp[0] < 992, isMobile: false });
      const page = await ctx.newPage();
      const log = H.watch(page);
      await H.signIn(page, base);
      for (const [id, name] of H.TABS) {
        if (tabFilter && !tabFilter.includes(id)) continue;
        log.errors.length = log.warnings.length = log.failed.length = 0;
        await H.openTab(page, name);
        const r = await H.audit(page);
        r.end = await H.checkPageEnd(page);
        if (id === 'analytics') r.anchors = await H.checkAnchors(page);
        r.focus = await H.checkFocusCover(page, id === 'analytics' || id === 'todo' ? 40 : 20);
        r.log = { errors: [...log.errors], warnings: [...log.warnings], failed: [...log.failed] };
        const rec = { tab: name, viewport: `${vp[0]}x${vp[1]}`, ...r };
        rec.issues = issuesOf(rec);
        results.push(rec);
        console.log(`${rec.viewport.padEnd(8)} ${name.padEnd(18)} ${rec.issues.length ? 'FAIL ' + rec.issues.length : 'pass'}`);
        if (shots && H.SCREENSHOT_WIDTHS.includes(vp[0]) && (vp[0] !== 430 || vp[1] === 932) && (vp[0] !== 375 || vp[1] === 667)) {
          await page.screenshot({ path: path.join(SHOT_DIR, `${slug(name)}-${vp[0]}.jpg`), fullPage: true, type: 'jpeg', quality: 60 });
        }
      }
      if (!tabFilter && stateViewports.has(`${vp[0]}x${vp[1]}`)) {
        log.errors.length = log.warnings.length = log.failed.length = 0;
        for (const s of await states(page, vp)) {
          const rec = { tab: 'state: ' + s.state, viewport: `${vp[0]}x${vp[1]}`, ...s, log: { errors: [...log.errors], warnings: [], failed: [...log.failed] } };
          rec.issues = [...new Set([...s.issues, ...issuesOf(rec)])];
          results.push(rec);
          console.log(`${rec.viewport.padEnd(8)} ${rec.tab.padEnd(40)} ${rec.issues.length ? 'FAIL ' + rec.issues.length : 'pass'}`);
        }
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
    srv.io.close();
    srv.httpServer.close();
  }
  fs.writeFileSync(path.join(DOCS, `prof-audit-${label}.json`), JSON.stringify(results, null, 1));
  // the report: a tab x viewport grid, then the issues
  const tabs = [...new Set(results.map((r) => r.tab))];
  const vps = [...new Set(results.map((r) => r.viewport))];
  let md = `# Professor responsive audit: ${label}\n\nGenerated by \`node tests/prof-responsive/audit.cjs --label ${label}\` on ${new Date().toISOString().slice(0, 10)} (Chromium, fixture data).\n\n`;
  md += `| Tab / state | ${vps.join(' | ')} |\n|---|${vps.map(() => '---').join('|')}|\n`;
  for (const t of tabs) md += `| ${t} | ${vps.map((v) => { const r = results.find((x) => x.tab === t && x.viewport === v); return r ? (r.issues.length ? `FAIL (${r.issues.length})` : 'pass') : ''; }).join(' | ')} |\n`;
  const failing = results.filter((r) => r.issues.length);
  md += `\n${results.length - failing.length} of ${results.length} checks pass.\n\n## Issues\n`;
  for (const r of failing) md += `\n### ${r.tab} @ ${r.viewport}\n${r.issues.map((i) => `- ${i}`).join('\n')}\n`;
  const exceptions = results.flatMap((r) => r.smallTargets.filter((t) => targetExceptions(t)).map((t) => `${r.tab} @ ${r.viewport}: ${t.s} ${t.w}x${t.h} - ${targetExceptions(t)}`));
  if (exceptions.length) md += `\n## Tap-target exceptions (reported, not failed)\n${[...new Set(exceptions)].slice(0, 60).map((e) => `- ${e}`).join('\n')}\n`;
  fs.writeFileSync(path.join(DOCS, `prof-audit-${label}.md`), md);
  console.log(`\n${results.length - failing.length}/${results.length} pass. Report: docs/mobile/prof-audit-${label}.md`);
})().catch((e) => { console.error(e); process.exit(1); });
