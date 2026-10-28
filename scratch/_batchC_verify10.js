// Verify Batch C item 10: World page two-side layout at 1280x720.
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; console.log(`  ${PASS} ${label}`); }
  else { fail++; console.log(`  ${FAIL} ${label} ${detail}`); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const r = await page.request.post('http://127.0.0.1:3000/api/login', { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto('http://127.0.0.1:3000/');
  await page.waitForSelector('nav#tabs', { timeout: 20000 });
  // Tabs are state-driven (no hash routing): click "World".
  await page.getByRole('button', { name: 'World', exact: true }).click();
  await page.waitForSelector('.world-sides', { timeout: 20000 });
  await page.waitForTimeout(600);

  // --- no scrolling at 1280x720 ---
  const scroll = await page.evaluate(() => ({
    h: document.documentElement.scrollHeight,
    vh: window.innerHeight,
    w: document.documentElement.scrollWidth,
    vw: window.innerWidth,
  }));
  check('page does not scroll vertically at 1280x720', scroll.h <= scroll.vh + 1, `h=${scroll.h} vh=${scroll.vh}`);
  check('page does not scroll horizontally at 1280x720', scroll.w <= scroll.vw + 1, `w=${scroll.w} vw=${scroll.vw}`);

  // --- two sides side by side ---
  const left = await page.$eval('.world-sides > .world-side:nth-child(1)', (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const right = await page.$eval('.world-sides > .world-side:nth-child(2)', (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  check('left side is left of the right side', left.x + left.w <= right.x + 2, `leftEnd=${Math.round(left.x + left.w)} rightStart=${Math.round(right.x)}`);
  check('sides sit side by side (same row)', Math.abs(left.y - right.y) < 4, `ly=${Math.round(left.y)} ry=${Math.round(right.y)}`);
  const total = left.w + right.w;
  const leftPct = Math.round((left.w / total) * 100);
  check('left column is ~42% of the two sides', leftPct >= 38 && leftPct <= 46, `left=${leftPct}%`);

  // --- header / intro / tip above both ---
  const heading = await page.$('h1, h2');
  const headingBox = await heading.boundingBox();
  check('page header is above both sides', headingBox.y + headingBox.height <= left.y + 2, `headerBottom=${Math.round(headingBox.y + headingBox.height)} sidesTop=${Math.round(left.y)}`);
  const introText = await page.$eval('.hero-lab-intro', (el) => el.textContent.trim());
  const introLines = await page.$eval('.hero-lab-intro', (el) => {
    const cs = getComputedStyle(el);
    return Math.round(el.getBoundingClientRect().height / parseFloat(cs.lineHeight || '24'));
  });
  check('intro is at most two lines', introLines <= 2, `lines=${introLines} (${introText.length} chars)`);
  check('intro drops the Library/Workshop/Garden explanation', !/Library or Workshop level|each Garden level/i.test(introText), introText.slice(0, 80));
  const tip = await page.$eval('.hero-lab-tip', (el) => el.textContent.trim());
  check('tip line present', /Move to deal more damage/i.test(tip) && /Heal at the campfire/i.test(tip), tip);

  // --- left: room entry ---
  check('CREATE LOBBY button present', !!(await page.$('.room-entry .btn.primary')));
  const orJoin = await page.$eval('.room-or', (el) => el.textContent.trim().toLowerCase());
  check('"or join" label present', orJoin.includes('join'), orJoin);
  check('4-letter code input present', !!(await page.$('#room-code-input')));
  const codeMax = await page.$eval('#room-code-input', (el) => el.getAttribute('maxlength'));
  check('code input is limited to 4 chars', codeMax === '4', codeMax);
  const joinBtn = await page.$('.room-actions .btn:not(.primary)');
  check('JOIN button present', !!joinBtn);
  const roomText = await page.$eval('.room-entry', (el) => el.textContent);
  check('room code text says TOP-RIGHT', /top-right corner/i.test(roomText), roomText.replace(/\s+/g, ' ').slice(0, 120));
  check('no "top-left corner" text remains', !/top-left corner/i.test(roomText));
  check('"Pick a hero below" text removed', !/Pick a hero below/i.test(roomText));

  // --- left: kingdom tiles, one row of four ---
  const tiles = await page.$$eval('.kingdom-tile', (els) => els.map((el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, text: el.textContent.replace(/\s+/g, ' ').trim() }; }));
  check('exactly 4 kingdom tiles', tiles.length === 4, `count=${tiles.length}`);
  check('tiles are on ONE row', tiles.every((t) => Math.abs(t.y - tiles[0].y) < 2), tiles.map((t) => Math.round(t.y)).join(','));
  check('tiles are equal width', Math.max(...tiles.map((t) => t.w)) - Math.min(...tiles.map((t) => t.w)) < 2, tiles.map((t) => Math.round(t.w)).join(','));
  check('every tile is at least 100px wide', tiles.every((t) => t.w >= 100), tiles.map((t) => Math.round(t.w)).join(','));
  check('Library tile shows +N% magic ATK', tiles.some((t) => /Library/.test(t.text) && /%\s*magic ATK/.test(t.text)), tiles.map((t) => t.text).join(' | '));
  check('Workshop tile shows +N% physical ATK', tiles.some((t) => /Workshop/.test(t.text) && /%\s*physical ATK/.test(t.text)));
  check('Garden tile shows +N% campfire HP', tiles.some((t) => /Garden/.test(t.text) && /%\s*campfire HP/.test(t.text)));
  check('Tower tile says No combat bonus yet', tiles.some((t) => /Tower/.test(t.text) && /No combat bonus yet/i.test(t.text)));
  check('Tower tile is dimmed', await page.$eval('.kingdom-tile.tower', (el) => Number(getComputedStyle(el).opacity) < 0.8));
  check('tile icons come from BUILDING_ICONS', tiles.some((t) => t.text.includes('📚')) && tiles.some((t) => t.text.includes('🔨')) && tiles.some((t) => t.text.includes('🌱')) && tiles.some((t) => t.text.includes('🗼')));
  check('tiles show Lv x/3', tiles.every((t) => /Lv \d\/3/.test(t.text)), tiles.map((t) => t.text).join(' | '));

  // --- detail area max 2 lines ---
  const detailLines = await page.$$eval('.kingdom-detail > span', (els) => els.map((el) => {
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || 16;
    return Math.round(el.getBoundingClientRect().height / lh);
  }));
  check('detail area is at most 2 lines total', detailLines.reduce((a, b) => a + b, 0) <= 2, `lines=${detailLines.join('+')}`);
  const detailText = await page.$eval('.kingdom-detail', (el) => el.textContent.replace(/\s+/g, ' '));
  check('detail names the selected hero and its attack bonus', /receives/i.test(detailText) && /physical attack|magic attack|no matching/i.test(detailText), detailText.slice(0, 110));
  check('Garden detail has real computed numbers', /Garden: \+\d+ HP\/player · \d+ solo · \d+ with 4 players at Lv\d/.test(detailText), detailText.slice(0, 160));

  // --- right: hero preview on top, selector at bottom ---
  const preview = await page.$('.hero-preview');
  check('hero preview panel exists', !!preview);
  const previewBox = await preview.boundingBox();
  const selectorBox = await (await page.$('.hero-selector')).boundingBox();
  check('hero preview is ABOVE the selector', previewBox.y + previewBox.height <= selectorBox.y + 2, `previewBottom=${Math.round(previewBox.y + previewBox.height)} selectorTop=${Math.round(selectorBox.y)}`);
  check('hero preview is in the right column', previewBox.x >= right.x - 2, `previewX=${Math.round(previewBox.x)} rightX=${Math.round(right.x)}`);

  const emojiSize = await page.$eval('.hero-preview-art .hero-icon', (el) => parseFloat(getComputedStyle(el).fontSize));
  check('preview emoji is ~160px', emojiSize >= 150 && emojiSize <= 170, `${emojiSize}px`);
  const previewText = await page.$eval('.hero-preview', (el) => el.textContent.replace(/\s+/g, ' '));
  check('preview shows the hero name', previewText.length > 0);
  check('preview shows type with icon', /✦|🌀/.test(previewText), previewText.slice(0, 80));
  check('preview shows rarity label', /[A-Za-z]+★/.test(previewText), previewText.slice(0, 80));
  check('preview shows the stat line', /HP \d+/.test(previewText) && /Attack \d+/.test(previewText) && /Defense \d+/.test(previewText) && /Speed \d+/.test(previewText), previewText.slice(0, 140));

  // --- selector: two labeled rows grouped by type ---
  const rows = await page.$$eval('.hero-row', (els) => els.map((el) => ({
    label: el.querySelector('.hero-row-label').textContent.trim(),
    chips: [...el.querySelectorAll('.hero-chip')].map((c) => c.textContent.replace(/\s+/g, ' ').trim()),
  })));
  check('selector has exactly 2 rows', rows.length === 2, `count=${rows.length}`);
  check('row 1 is Physical with the ✦ icon', /✦/.test(rows[0].label) && /Physical/i.test(rows[0].label), rows[0].label);
  check('row 2 is Magic with the 🌀 icon', /🌀/.test(rows[1].label) && /Magic/i.test(rows[1].label), rows[1].label);
  check('Physical row holds Guardian/Sheriff/Pilot', ['Guardian', 'Sheriff', 'Pilot'].every((n) => rows[0].chips.some((c) => c.includes(n))), rows[0].chips.join(' | '));
  check('Magic row holds Bombardier/Bubbles/Electromancer', ['Bombardier', 'Bubbles', 'Electromancer'].every((n) => rows[1].chips.some((c) => c.includes(n))), rows[1].chips.join(' | '));
  const chipText = rows.flatMap((r) => r.chips).join(' | ');
  check('chips show no stat text', !/HP \d/.test(chipText), chipText.slice(0, 120));
  check('chips show Owned or a lock', /Owned|🔒/.test(chipText), chipText.slice(0, 120));

  // --- preselection ---
  const selectedCount = await page.$$eval('.hero-chip.selected', (els) => els.length);
  check('a hero is preselected', selectedCount === 1, `count=${selectedCount}`);
  const selectedName = await page.$eval('.hero-chip.selected .hero-chip-name', (el) => el.textContent.trim());
  const previewName = await page.$eval('.hero-preview-name', (el) => el.textContent.trim());
  check('preview shows the selected hero on load', selectedName === previewName, `${selectedName} vs ${previewName}`);

  // --- hover preview reverts on leave ---
  const chips = await page.$$('.hero-chip');
  let hoverTarget = null;
  for (const chip of chips) {
    const name = await chip.$eval('.hero-chip-name', (el) => el.textContent.trim());
    if (name !== selectedName) { hoverTarget = chip; break; }
  }
  if (hoverTarget) {
    const hoverName = await hoverTarget.$eval('.hero-chip-name', (el) => el.textContent.trim());
    await hoverTarget.hover();
    await page.waitForTimeout(150);
    const afterHover = await page.$eval('.hero-preview-name', (el) => el.textContent.trim());
    check('hovering another hero updates the preview', afterHover === hoverName, `${afterHover} vs ${hoverName}`);
    await page.mouse.move(640, 12);
    await page.waitForTimeout(200);
    const afterLeave = await page.$eval('.hero-preview-name', (el) => el.textContent.trim());
    check('preview returns to the selected hero on mouse leave', afterLeave === selectedName, `${afterLeave} vs ${selectedName}`);
  }

  // --- clicking selects, never enters a room ---
  if (hoverTarget) {
    await hoverTarget.click();
    await page.waitForTimeout(250);
    const nowSelected = await page.$eval('.hero-chip.selected .hero-chip-name', (el) => el.textContent.trim());
    check('clicking a hero selects it', nowSelected === (await hoverTarget.$eval('.hero-chip-name', (el) => el.textContent.trim())), nowSelected);
    check('clicking a hero does not enter a room', !(await page.$('.hero-lab-frame')));
  }

  // --- kingdom tile highlight follows the selected/hovered hero type ---
  const highlighted = await page.$$eval('.kingdom-tile.relevant .kingdom-tile-name', (els) => els.map((e) => e.textContent.trim()));
  const selType = await page.evaluate(() => {
    const chip = document.querySelector('.hero-chip.selected .hero-chip-name');
    const row = chip.closest('.hero-row');
    return row.querySelector('.hero-row-label').textContent.includes('Physical') ? 'physical' : 'magic';
  });
  check('Garden is always highlighted', highlighted.includes('Garden'), highlighted.join(','));
  check(`the matching ${selType} tile is highlighted`, highlighted.includes(selType === 'physical' ? 'Workshop' : 'Library'), highlighted.join(','));
  check('the other attack tile is NOT highlighted', !highlighted.includes(selType === 'physical' ? 'Library' : 'Workshop'), highlighted.join(','));
  check('Tower is never highlighted', !highlighted.includes('Tower'), highlighted.join(','));

  // --- demo footer kept ---
  const footer = await page.$eval('footer', (el) => el.textContent);
  check('demo-build footer still present', /Demo build/i.test(footer), footer.slice(0, 60));

  // --- stacks below 900px ---
  await page.setViewportSize({ width: 860, height: 720 });
  await page.waitForTimeout(350);
  const stackedLeft = await page.$eval('.world-sides > .world-side:nth-child(1)', (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width }; });
  const stackedRight = await page.$eval('.world-sides > .world-side:nth-child(2)', (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width }; });
  check('below 900px the sides stack (right starts below left)', stackedRight.y >= stackedLeft.y + stackedLeft.w * 0, `leftY=${Math.round(stackedLeft.y)} rightY=${Math.round(stackedRight.y)}`);
  check('stacked: right side starts below the left side', stackedRight.y > stackedLeft.y, `leftY=${Math.round(stackedLeft.y)} rightY=${Math.round(stackedRight.y)}`);
  check('stacked: both sides share the left edge', Math.abs(stackedLeft.x - stackedRight.x) < 2, `${stackedLeft.x} vs ${stackedRight.x}`);

  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'scratch/_batchC_world.png' });

  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

  console.log(`\n${fail === 0 ? '\x1b[32mALL PASS\x1b[0m' : '\x1b[31mFAILURES\x1b[0m'}: ${ok} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
