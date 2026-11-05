#!/usr/bin/env node
// Writes docs/mobile/PROF-SCREENSHOTS.md: BEFORE and AFTER screenshots of
// each professor tab side by side at 375, 430, 576, 768, 992 and 1200 px.
//   node tests/prof-responsive/contact-sheet.cjs
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, TABS, SCREENSHOT_WIDTHS } = require('./harness.cjs');

const DIR = path.join(ROOT, 'docs', 'mobile');
const slug = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const img = (label, file) => (fs.existsSync(path.join(DIR, 'screenshots', 'prof', label, file))
  ? `<a href="screenshots/prof/${label}/${file}"><img src="screenshots/prof/${label}/${file}" width="220" alt="${label} ${file}"></a>`
  : '(missing)');

let md = `# Professor workspace: before and after screenshots

Full-page captures from the audit harness (Chromium, fixture data; \`node tests/prof-responsive/audit.cjs --label before|after --shots\`). Click an image for the full size. The 375 px column is 375x667 and the 430 px column 430x932; the others are 900 px high. Interactive states (drawer, dialogs, editor, card mode, retrieved material) are in the same folders as \`state-*.jpg\`.

See [PROF-NOTES.md](PROF-NOTES.md) for what changed and why.
`;
for (const [, tab] of TABS) {
  md += `\n## ${tab}\n\n| Width | Before | After |\n|---|---|---|\n`;
  for (const w of SCREENSHOT_WIDTHS) {
    const file = `${slug(tab)}-${w}.jpg`;
    md += `| ${w} px | ${img('before', file)} | ${img('after', file)} |\n`;
  }
}
md += `\n## Interactive states (375x667 and 667x375)\n\n| State | Before | After |\n|---|---|---|\n`;
const states = fs.readdirSync(path.join(DIR, 'screenshots', 'prof', 'after')).filter((f) => f.startsWith('state-') && /-(375x667|667x375)\.jpg$/.test(f)).sort();
for (const f of states) md += `| ${f.replace(/^state-|\.jpg$/g, '').replace(/-/g, ' ')} | ${img('before', f)} | ${img('after', f)} |\n`;
fs.writeFileSync(path.join(DIR, 'PROF-SCREENSHOTS.md'), md);
console.log('wrote docs/mobile/PROF-SCREENSHOTS.md');
