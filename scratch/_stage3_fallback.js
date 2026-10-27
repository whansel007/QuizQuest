// Stage 3 extras:
//   - a missing/failed talent icon falls back to TALENT_FALLBACK_EMOJI with ONE
//     console warning per path (never a crash)
//   - the I card follows the hero's type colour (magic = purple) and its slot
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let ok = 0, fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok++; console.log(`  ${PASS} ${label}`); }
  else { fail++; console.log(`  ${FAIL} ${label} ${detail}`); }
}

const BASE = 'http://127.0.0.1:3000';
const MAGIC_COLOUR = 'rgb(123, 79, 216)';

(async () => {
  const { GAME_CONFIG } = await import('../public/hero-lab/game-config.js');
  const { TALENT_FALLBACK_EMOJI } = await import('../config/tuning.js');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const warnings = [];
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'warning' && msg.text().includes('talent icon failed')) warnings.push(msg.text());
    // Ignore Chromium's own network log line for the aborted request; only JS
    // exceptions and app-level errors matter here.
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) errors.push(msg.text());
  });
  // Every talent icon request fails.
  await page.route('**/assets/icons/*-talent.svg', (route) => route.abort());

  const r = await page.request.post(`${BASE}/api/login`, { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: 'World', exact: true }).click();
  await page.waitForSelector('.hero-preview .talent-row', { timeout: 15000 });
  await page.waitForTimeout(900);

  console.log('\n=== fallback emoji when the icon cannot load ===');
  const first = await page.evaluate(() => {
    const badge = document.querySelector('.hero-preview .talent-badge');
    return { text: badge.textContent.trim(), hasSvg: Boolean(badge.querySelector('svg')), hero: badge.dataset.hero };
  });
  check('badge shows the fallback emoji instead of an icon', first.hasSvg === false && first.text.length > 0, JSON.stringify(first));
  check('the emoji is the configured one for that hero', first.text === TALENT_FALLBACK_EMOJI[first.hero], `${first.text} vs ${TALENT_FALLBACK_EMOJI[first.hero]}`);
  check('one console warning per failed path', warnings.length === 1, `${warnings.length}: ${warnings[0] || ''}`);

  // Hovering the same hero again must not warn twice.
  const chip = page.locator('.hero-chip').filter({ has: page.locator(`.hero-chip-name`) }).first();
  await chip.hover();
  await page.locator('.hero-preview').hover();
  await chip.hover();
  await page.waitForTimeout(300);
  check('re-rendering the same badge does not warn again', warnings.length === 1, `${warnings.length}`);
  check('no page errors from the failed icon', errors.length === 0, errors[0] || '');

  console.log('\n=== I card: magic hero uses the purple badge and its own slot ===');
  const game = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const gameErrors = [];
  game.on('pageerror', (err) => gameErrors.push(String(err)));
  await game.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await game.goto(`${BASE}/hero-lab/world.html?heroId=electromancer&create=1`);
  await game.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 20000 });
  await game.waitForTimeout(900);
  await game.keyboard.press('KeyI');
  await game.waitForTimeout(300);

  const card = await game.evaluate(() => {
    const badge = document.querySelector('#stat-talent-badge .talent-badge');
    return {
      name: document.querySelector('#stat-talent-name').textContent.trim(),
      desc: document.querySelector('#stat-talent-description').textContent.trim(),
      chip: document.querySelector('#stat-talent-key').textContent.trim(),
      bg: badge ? getComputedStyle(badge).backgroundColor : '',
      hasSvg: Boolean(badge && badge.querySelector('svg')),
      hero: badge?.dataset.hero || '',
    };
  });
  check('I card hero is the Electromancer', card.hero === 'electromancer', card.hero);
  check('I card shows the Overload talent', card.name === GAME_CONFIG.heroes.electromancer.talent.name, card.name);
  check('I card description matches config', card.desc === GAME_CONFIG.heroes.electromancer.talent.description, card.desc);
  check('I card chip is Q (ultimate talent)', card.chip === 'Q', card.chip);
  check('magic hero badge is the purple skill colour', card.bg === MAGIC_COLOUR, card.bg);
  check('I card badge loaded its icon', card.hasSvg);
  await game.screenshot({ path: 'scratch/_stage3_icard_magic.png' });

  console.log(`\npage errors: ${gameErrors.length}`);
  check('no page errors on the magic hero page', gameErrors.length === 0, gameErrors[0] || '');

  await browser.close();
  console.log(`\n${ok} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
