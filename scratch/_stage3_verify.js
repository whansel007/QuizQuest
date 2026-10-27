// Verify Stage 3: hero talents on the selection page.
//   3.1 talent data lives in game-config.js ({ name, icon, description, linkedSlot })
//   3.2 the World-page preview shows a badge + name/description + key chip
//   3.3 the I card shows the same entry and the same badge
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; console.log(`  ${PASS} ${label}`); }
  else { fail++; console.log(`  ${FAIL} ${label} ${detail}`); }
}

const BASE = 'http://127.0.0.1:3000';
// Mirrors config/tuning.js: physical/magic skill shades + the key chip labels.
const EXPECTED_COLOR = { physical: 'rgb(30, 120, 200)', magic: 'rgb(123, 79, 216)' };
const EXPECTED_CHIP = { 'skill': 'E', 'ultimate': 'Q', 'primary': 'M1', 'skill+ultimate': 'E + Q' };

(async () => {
  const { GAME_CONFIG } = await import('../public/hero-lab/game-config.js');
  const talents = Object.fromEntries(Object.entries(GAME_CONFIG.heroes).map(([id, hero]) => [id, { ...hero.talent, type: hero.type }]));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const r = await page.request.post(`${BASE}/api/login`, { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: 'World', exact: true }).click();
  await page.waitForSelector('.hero-preview', { timeout: 15000 });
  await page.waitForTimeout(700);

  console.log('\n=== 3.2 World page: talent row structure ===');
  const structure = await page.evaluate(() => {
    const row = document.querySelector('.hero-preview .talent-row');
    const badge = row?.querySelector('.talent-badge');
    const heading = document.querySelector('.hero-preview .talent-heading');
    const name = row?.querySelector('.talent-name');
    const desc = row?.querySelector('.talent-desc');
    const chip = row?.querySelector('.talent-key');
    const rect = badge?.getBoundingClientRect();
    return {
      hasRow: Boolean(row),
      heading: heading?.textContent?.trim() || '',
      badge: badge ? {
        w: Math.round(rect.width), h: Math.round(rect.height),
        radius: getComputedStyle(badge).borderRadius,
        bg: getComputedStyle(badge).backgroundColor,
        border: getComputedStyle(badge).borderTopWidth,
        hasSvg: Boolean(badge.querySelector('svg')),
        svgColor: badge.querySelector('svg') ? getComputedStyle(badge.querySelector('svg')).color : '',
        svgFill: badge.querySelector('svg path') ? getComputedStyle(badge.querySelector('svg path')).fill : '',
      } : null,
      name: name?.textContent?.trim() || '',
      desc: desc?.textContent?.trim() || '',
      chip: chip?.textContent?.trim() || '',
      chipTitle: chip?.getAttribute('title') || '',
      descLines: desc ? Math.round(desc.getBoundingClientRect().height / parseFloat(getComputedStyle(desc).lineHeight)) : 0,
    };
  });

  check('a talent row exists under the stat line', structure.hasRow);
  check('the row is headed "Talent"', structure.heading === 'Talent', structure.heading);
  check('badge is TALENT_BADGE_SIZE (44px) square', structure.badge && structure.badge.w === 44 && structure.badge.h === 44, JSON.stringify(structure.badge));
  check('badge is round', structure.badge && structure.badge.radius === '50%', structure.badge?.radius);
  check('badge has the thick near-black outline (4px)', structure.badge && structure.badge.border === '4px', structure.badge?.border);
  check('badge renders the SVG talent icon', structure.badge && structure.badge.hasSvg);
  check('the icon is white (currentColor -> #fff)', structure.badge && structure.badge.svgFill === 'rgb(255, 255, 255)', structure.badge?.svgFill);
  check('the description fits two lines at most', structure.descLines <= 2, `${structure.descLines} lines`);

  console.log('\n=== 3.2 every hero: name, description, chip, badge colour ===');
  const chips = await page.locator('.hero-chip').all();
  check('all six heroes are listed', chips.length === 6, `${chips.length}`);
  const seen = {};
  for (const chip of chips) {
    const heroId = await chip.evaluate((el) => el.querySelector('.hero-chip-name').textContent.trim());
    await chip.hover();
    await page.waitForTimeout(120);
    const info = await page.evaluate(() => {
      const row = document.querySelector('.hero-preview .talent-row');
      return {
        name: row.querySelector('.talent-name').textContent.trim(),
        desc: row.querySelector('.talent-desc').textContent.trim(),
        chip: row.querySelector('.talent-key').textContent.trim(),
        title: row.querySelector('.talent-key').getAttribute('title'),
        bg: getComputedStyle(row.querySelector('.talent-badge')).backgroundColor,
        hasSvg: Boolean(row.querySelector('.talent-badge svg')),
        badgeHero: row.querySelector('.talent-badge').dataset.hero,
        descLines: Math.round(row.querySelector('.talent-desc').getBoundingClientRect().height / parseFloat(getComputedStyle(row.querySelector('.talent-desc')).lineHeight)),
      };
    });
    const id = Object.keys(talents).find((key) => GAME_CONFIG.heroes[key] && idMatches(key, heroId));
    seen[heroId] = info;
    const want = talents[id];
    check(`${heroId}: talent name`, info.name === want.name, `${info.name} != ${want.name}`);
    check(`${heroId}: description from config`, info.desc === want.description, info.desc);
    check(`${heroId}: key chip ${EXPECTED_CHIP[want.linkedSlot.join('+')]}`, info.chip === EXPECTED_CHIP[want.linkedSlot.join('+')], info.chip);
    check(`${heroId}: chip tooltip`, /Works with your .+ button/.test(info.title || ''), String(info.title));
    check(`${heroId}: badge uses the ${want.type} skill colour`, info.bg === EXPECTED_COLOR[want.type], info.bg);
    check(`${heroId}: badge icon loaded`, info.hasSvg);
    check(`${heroId}: badge belongs to this hero`, info.badgeHero === id, `${info.badgeHero} vs ${id}`);
    check(`${heroId}: description <= 2 lines`, info.descLines <= 2, `${info.descLines}`);
  }

  console.log('\n=== 3.2 hover is preview only, click selects ===');
  const firstName = Object.values(seen)[0]?.name;
  await page.locator('.hero-chip').first().hover();
  await page.waitForTimeout(100);
  await page.locator('.hero-chip').last().hover();
  await page.waitForTimeout(120);
  const lastHover = await page.locator('.hero-preview .talent-name').textContent();
  check('hovering another hero changes the talent row', lastHover.trim() !== firstName, lastHover);
  await page.locator('.hero-preview').hover();
  await page.waitForTimeout(150);
  const afterLeave = await page.locator('.hero-preview .talent-name').textContent();
  const selectedName = await page.locator('.hero-chip.selected .hero-chip-name').textContent();
  check('leaving reverts to the selected hero', talents[Object.keys(talents).find((k) => GAME_CONFIG.heroes[k] && idMatches(k, selectedName.trim()))]?.name === afterLeave.trim(), `${afterLeave.trim()} vs ${selectedName.trim()}`);

  console.log('\n=== layout still fits 1280x720 ===');
  const fit = await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight,
    innerH: window.innerHeight,
    previewBottom: Math.round(document.querySelector('.hero-preview').getBoundingClientRect().bottom),
  }));
  check('page does not scroll at 1280x720', fit.scrollH <= fit.innerH + 1, `${fit.scrollH} > ${fit.innerH}`);
  check('preview panel stays inside the viewport', fit.previewBottom <= fit.innerH, `${fit.previewBottom}`);

  await page.screenshot({ path: 'scratch/_stage3_world.png' });

  console.log('\n=== 3.3 I card shows the same talent ===');
  const game = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  game.on('pageerror', (err) => errors.push(String(err)));
  await game.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await game.goto(`${BASE}/hero-lab/world.html?heroId=sheriff&create=1`);
  await game.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 20000 });
  await game.waitForTimeout(900);
  await game.keyboard.press('KeyI');
  await game.waitForTimeout(300);

  const card = await game.evaluate(() => {
    const badge = document.querySelector('#stat-talent-badge .talent-badge');
    const rect = badge?.getBoundingClientRect();
    return {
      hidden: document.querySelector('#stats-panel').hidden,
      name: document.querySelector('#stat-talent-name').textContent.trim(),
      desc: document.querySelector('#stat-talent-description').textContent.trim(),
      chip: document.querySelector('#stat-talent-key').textContent.trim(),
      title: document.querySelector('#stat-talent-key').getAttribute('title'),
      badge: badge ? {
        w: Math.round(rect.width), h: Math.round(rect.height),
        bg: getComputedStyle(badge).backgroundColor,
        hasSvg: Boolean(badge.querySelector('svg')),
        fill: badge.querySelector('svg path') ? getComputedStyle(badge.querySelector('svg path')).fill : '',
      } : null,
    };
  });
  check('I card is open', card.hidden === false);
  check('I card shows the same talent name', card.name === talents.sheriff.name, card.name);
  check('I card shows the same description text as the World page', card.desc === talents.sheriff.description, card.desc);
  check('I card shows the same key chip (E)', card.chip === 'E', card.chip);
  check('I card chip has the tooltip', /Works with your skill button/.test(card.title || ''), String(card.title));
  check('I card uses the same 44px badge', card.badge && card.badge.w === 44 && card.badge.h === 44, JSON.stringify(card.badge));
  check('I card badge uses the physical skill colour', card.badge && card.badge.bg === EXPECTED_COLOR.physical, card.badge?.bg);
  check('I card badge shows the icon', card.badge && card.badge.hasSvg);
  await game.screenshot({ path: 'scratch/_stage3_icard.png' });

  console.log(`\nconsole/page errors: ${errors.length}`);
  if (errors.length) console.log(errors.slice(0, 6).join('\n'));
  check('no console or page errors', errors.length === 0);

  await browser.close();
  console.log(`\n${ok} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });

// The chip label is the hero NAME; map it back to the hero id.
function idMatches(heroId, label) {
  const names = { sheriff: 'Sheriff', guardian: 'Guardian', pilot: 'Pilot', bombardier: 'Bombardier', bubbles: 'Bubbles', electromancer: 'Electromancer' };
  return names[heroId] === label;
}
