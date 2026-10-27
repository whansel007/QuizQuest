// Phase C - client-side verification.
//
// Covers the five changes that only exist in the browser:
//   5. Stats are rounded to one decimal (12 * 1.1 = 13.200000000000001 -> 13.2)
//   6. Kingdom upgrades render as a list, one per line
//   7. The talent badge icon is visually centred
//   8. Pilot shows the cooldown-refund popup above the hero on a kill
//   9. Pilot bounces a robot above the hero when Mech Suit is ready
//
// Plus the World-page hero selector: equal-width grid cells, centred content,
// star rating under each hero's name.
//
// Run: node scratch/_phaseC_client.js   (starts its own server on a free port)
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { start } = require('../server');

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
let ok = 0;
let fail = 0;
function check(label, cond, detail = '') {
  if (cond) { ok += 1; console.log(`  ${PASS} ${label}`); }
  else { fail += 1; console.log(`  ${FAIL} ${label} ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { GAME_CONFIG } = await import('../public/hero-lab/game-config.js');
  const rarityStars = GAME_CONFIG.arenaTuning.gachaReveal.rarityStars;
  const rarityOf = GAME_CONFIG.heroSummon.rarities;

  const server = start(0, { dataFile: null });
  await new Promise((r) => server.httpServer.once('listening', r));
  const BASE = `http://127.0.0.1:${server.httpServer.address().port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });

  const r = await page.request.post(`${BASE}/api/login`, { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);

  // ------------------------------------------------ 5-6. World page selector
  await page.goto(`${BASE}/`);
  await page.getByRole('button', { name: 'World', exact: true }).click();
  await page.waitForSelector('.hero-preview', { timeout: 20000 });
  await page.waitForTimeout(600);

  console.log('\n[5] Hero selector - equal-width grid cells, centred, stars under the name');
  const rows = await page.evaluate(() => [...document.querySelectorAll('.hero-row-cards')].map((row) => {
    const style = getComputedStyle(row);
    const chips = [...row.querySelectorAll('.hero-chip')].map((chip) => {
      const rect = chip.getBoundingClientRect();
      const name = chip.querySelector('.hero-chip-name');
      const stars = chip.querySelector('.hero-chip-stars');
      const body = chip.querySelector('.hero-chip-body');
      const nameRect = name?.getBoundingClientRect();
      const starsRect = stars?.getBoundingClientRect();
      return {
        hero: chip.dataset.hero || chip.getAttribute('data-hero') || '',
        x: +rect.x.toFixed(1), w: +rect.width.toFixed(1),
        stars: stars ? stars.textContent.trim() : null,
        starCount: stars ? (stars.textContent.match(/★/g) || []).length : 0,
        starsUnderName: Boolean(nameRect && starsRect && starsRect.top >= nameRect.bottom - 1),
        starsAlign: stars ? getComputedStyle(stars).textAlign : '',
        bodyJustify: body ? getComputedStyle(body).justifyItems : '',
        nameAlign: name ? getComputedStyle(name).textAlign : '',
        label: chip.getAttribute('aria-label') || '',
      };
    });
    return { display: style.display, template: style.gridTemplateColumns, chips };
  }));

  check('at least one hero row rendered', rows.length > 0, rows.length);
  for (const [index, row] of rows.entries()) {
    const label = `row ${index + 1}`;
    check(`${label} is a grid`, row.display === 'grid', row.display);
    const widths = row.chips.map((c) => c.w);
    const spread = Math.max(...widths) - Math.min(...widths);
    check(`${label} gives every button the same width`, spread <= 1, widths);
    check(`${label} has one column per hero`, row.template.split(' ').length === row.chips.length,
      { columns: row.template, heroes: row.chips.length });
    check(`${label} centres the name and stars`, row.chips.every((c) => c.bodyJustify === 'center'), row.chips.map((c) => c.bodyJustify));
    check(`${label} puts the stars under the name`, row.chips.every((c) => c.starsUnderName), row.chips.map((c) => c.starsUnderName));
    check(`${label} shows a star rating on every hero`, row.chips.every((c) => c.starCount > 0), row.chips.map((c) => c.stars));
  }

  // Rarity -> star count, straight from game-config.js.
  const starReport = await page.evaluate(() => [...document.querySelectorAll('.hero-chip')].map((chip) => ({
    name: chip.querySelector('.hero-chip-name')?.textContent?.trim() || '',
    stars: (chip.querySelector('.hero-chip-stars')?.textContent?.match(/★/g) || []).length,
  })));
  const byName = Object.fromEntries(Object.keys(GAME_CONFIG.heroes).map((id) => [id.charAt(0).toUpperCase() + id.slice(1), id]));
  let starsOk = true;
  const starDetail = [];
  for (const entry of starReport) {
    const heroId = byName[entry.name];
    const rarity = heroId ? String(rarityOf[heroId]).toLowerCase() : null;
    const expected = rarity ? rarityStars[rarity] : null;
    if (expected === null || expected === undefined) { starsOk = false; starDetail.push({ name: entry.name, heroId, rarity }); continue; }
    if (entry.stars !== expected) { starsOk = false; starDetail.push({ name: entry.name, rarity, expected, got: entry.stars }); }
  }
  check('each hero shows exactly its rarity in stars', starsOk, starDetail);

  console.log('\n[5b] Hero cards are coloured by rarity');
  const RARITY_COLOR = { common: 'rgb(125, 135, 156)', rare: 'rgb(79, 141, 247)', epic: 'rgb(245, 200, 76)' };
  const painted = await page.evaluate(() => [...document.querySelectorAll('.hero-chip')].map((chip) => {
    const style = getComputedStyle(chip);
    const stars = chip.querySelector('.hero-chip-stars');
    return {
      name: chip.querySelector('.hero-chip-name')?.textContent?.trim() || '',
      rarity: [...chip.classList].find((c) => c.startsWith('rarity-')) || '',
      border: style.borderTopColor,
      glow: style.boxShadow !== 'none',
      outline: style.outlineStyle !== 'none' && style.outlineWidth !== '0px',
      selected: chip.classList.contains('selected'),
      starColor: stars ? getComputedStyle(stars).color : '',
    };
  }));
  check('every card carries a rarity class', painted.every((c) => c.rarity.startsWith('rarity-')), painted);
  const wrongBorder = painted.filter((c) => c.border !== RARITY_COLOR[c.rarity.replace('rarity-', '')]);
  check('each card border uses its tier colour', wrongBorder.length === 0, wrongBorder);
  const wrongGlow = painted.filter((c) => c.glow !== (c.rarity === 'rarity-rare' || c.rarity === 'rarity-epic'));
  check('rare and epic cards glow, common does not', wrongGlow.length === 0, wrongGlow);
  const wrongStars = painted.filter((c) => c.rarity === 'rarity-epic' && c.starColor !== RARITY_COLOR.epic);
  check('epic stars are tinted gold', wrongStars.length === 0, wrongStars);
  const selectedChip = painted.find((c) => c.selected);
  check('the selected card keeps its tier colour and is marked by an outline',
    !selectedChip || (selectedChip.border === RARITY_COLOR[selectedChip.rarity.replace('rarity-', '')] && selectedChip.outline),
    selectedChip);

  // ------------------------------------------- 6-9. In-arena HUD and feedback
  // Sheriff is used for the stat/badge checks: Pilot rewrites its own attack
  // every tick (Mech Suit form), so an injected stat would not stick.
  await page.goto(`${BASE}/hero-lab/world.html?heroId=sheriff&create=1&profiler=1`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 20000 });
  await page.waitForTimeout(800);

  let room = null;
  for (let attempt = 0; attempt < 40 && !room; attempt += 1) {
    room = server.heroLab.rooms.list().find((candidate) => candidate.playerCount() > 0);
    if (!room) await sleep(100);
  }
  let player = room ? [...room.players.values()][0] : null;
  check('the probe can reach the live room', Boolean(player), Boolean(player));

  console.log('\n[6] Stats are rounded to one decimal');
  player.hero.attack = 13.200000000000001;
  player.hero.defense = 4.400000000000001;
  player.hero.speed = 7.000000000000001;
  await page.keyboard.press('KeyI');
  await page.waitForTimeout(700);
  const stats = await page.evaluate(() => ({
    attack: document.querySelector('#stat-attack')?.textContent?.trim(),
    defense: document.querySelector('#stat-defense')?.textContent?.trim(),
    speed: document.querySelector('#stat-speed')?.textContent?.trim(),
    cardVisible: !document.querySelector('#stats-panel')?.hidden,
  }));
  check('the info panel is open', stats.cardVisible, stats.cardVisible);
  check('attack 13.200000000000001 shows as 13.2', stats.attack === '13.2', stats.attack);
  check('defense 4.400000000000001 shows as 4.4', stats.defense === '4.4', stats.defense);
  check('speed 7.000000000000001 drops the trailing .0', stats.speed === '7', stats.speed);

  console.log('\n[7] Kingdom upgrades render as a list');
  const noBonuses = await page.evaluate(() => {
    const list = document.querySelector('#building-bonus-list');
    return {
      tag: list?.tagName,
      items: [...(list?.querySelectorAll('li') || [])].map((li) => li.textContent.trim()),
    };
  });
  check('the upgrades block is a real list', noBonuses.tag === 'UL', noBonuses.tag);
  check('with no bonuses it says "None" once', noBonuses.items.length === 1 && noBonuses.items[0] === 'None', noBonuses.items);

  player.hero.buildingBonuses = { attackPercent: 0.1, campfireMaxHpPercent: 0.05 };
  await page.waitForTimeout(700);
  const withBonuses = await page.evaluate(() => {
    const list = document.querySelector('#building-bonus-list');
    const items = [...(list?.querySelectorAll('li') || [])];
    const rects = items.map((li) => { const b = li.getBoundingClientRect(); return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), text: li.textContent.trim() }; });
    return {
      tag: list?.tagName,
      items: rects,
      label: document.querySelector('#building-bonus-stat')?.textContent?.trim(),
      title: document.querySelector('#building-bonus-stat')?.getAttribute('title'),
      display: items[0] ? getComputedStyle(items[0]).display : '',
    };
  });
  check('two bonuses produce two list items', withBonuses.items.length === 2, withBonuses.items);
  check('the items are separate list rows', withBonuses.display === 'list-item', withBonuses.display);
  check('the two bonuses sit on different lines',
    withBonuses.items.length === 2 && withBonuses.items[1].top >= withBonuses.items[0].bottom - 1, withBonuses.items);
  check('the attack bonus names the physical building',
    withBonuses.items[0]?.text.includes('Workshop') && withBonuses.items[0]?.text.includes('+10%'), withBonuses.items[0]);
  check('the campfire bonus is its own line',
    withBonuses.items[1]?.text.includes('Garden') && withBonuses.items[1]?.text.includes('+5%'), withBonuses.items[1]);
  check('the collapsed label is still "🏰 Upgrades"', withBonuses.label === '🏰 Upgrades', withBonuses.label);
  check('the tooltip keeps the one-line summary', String(withBonuses.title || '').includes('Workshop'), withBonuses.title);

  console.log('\n[8] Talent badge is centred');
  const badgeBox = await page.evaluate(() => {
    const badge = document.querySelector('#stat-talent-badge .talent-badge');
    const rect = badge.getBoundingClientRect();
    return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
  });
  const badgeShot = path.join(__dirname, '_phaseC_badge.png');
  await page.screenshot({ path: badgeShot, clip: badgeBox });
  const ink = JSON.parse(execFileSync('C:/Python314/python.exe', [path.join(__dirname, '_phaseC_ink.py'), badgeShot], { encoding: 'utf8' }));
  check('the badge icon ink is horizontally centred', Math.abs(ink.dx) <= 2, ink);
  check('the badge icon ink is vertically centred', Math.abs(ink.dy) <= 2, ink);

  console.log('\n[9] Pilot feedback above the hero');
  await page.goto(`${BASE}/hero-lab/world.html?heroId=pilot&create=1&profiler=1`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 20000 });
  await page.waitForTimeout(800);
  let pilotRoom = null;
  for (let attempt = 0; attempt < 40 && !pilotRoom; attempt += 1) {
    pilotRoom = server.heroLab.rooms.list().find((candidate) => [...candidate.players.values()].some((member) => member.heroId === 'pilot'));
    if (!pilotRoom) await sleep(100);
  }
  player = pilotRoom ? [...pilotRoom.players.values()][0] : null;
  check('the pilot room is live', Boolean(player) && player.heroId === 'pilot', player?.heroId);
  // Enemies can only be spawned inside a run.
  pilotRoom.startRunNow();
  await page.waitForTimeout(700);
  check('the pilot run is live', pilotRoom.phase() === 'running', pilotRoom.phase());

  const cooldown = player.hero.cooldowns.ultimate;
  cooldown.readyAt = Date.now() + cooldown.durationMs;
  cooldown.cutThisCycleMs = 0;
  player.pilotMechReady = false;
  pilotRoom.debugSpawnEnemies(1, 40);
  const killed = pilotRoom.debugKillAll();
  await page.waitForTimeout(400);

  const afterKill = await page.evaluate(() => window.__heroLabKillTest?.aboveHero?.() || null);
  check('the probe can read the above-hero feedback', Boolean(afterKill), afterKill);
  check('a cooldown-refund popup was raised', (afterKill?.refunds || []).length === 1, afterKill?.refunds);
  check('the popup totals 1s per kill (merged into one number)',
    (afterKill?.refunds || [])[0]?.totalMs === 1000 * killed, { popup: afterKill?.refunds?.[0], killed });
  await page.screenshot({ path: path.join(__dirname, '_phaseC_pilot_popup.png') });
  const ringPulse = await page.evaluate(() => document.querySelector('#ability-hud .ability[data-ability="ultimate"] .ability-circle')?.classList.contains('cooldown-refund-pulse'));
  check('the Mech Suit button pulses to link the popup', ringPulse === true, ringPulse);

  // Re-arm the edge: the tick may have already flipped the flag while the
  // popup screenshot was being taken.
  player.pilotMechReady = false;
  cooldown.readyAt = Date.now() - 1;
  // Poll instead of waiting a fixed time: the bounce only lives 800ms and a
  // screenshot costs a few hundred, so catch it as early as possible.
  let afterReady = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    afterReady = await page.evaluate(() => window.__heroLabKillTest?.aboveHero?.() || null);
    if ((afterReady?.ready || []).some((entry) => entry.emoji === '🤖')) break;
    await page.waitForTimeout(30);
  }
  const bounce = (afterReady?.ready || []).find((entry) => entry.emoji === '🤖');
  check('a robot bounces above the hero when Mech Suit is back', Boolean(bounce), afterReady?.ready);
  check('the bounce is fresh', Boolean(bounce) && bounce.ageMs < 1500, bounce?.ageMs);
  // The bounce lives 800ms and a screenshot costs a few hundred, so this shot
  // is illustrative only - the state assertion above is the real check.
  await page.screenshot({ path: path.join(__dirname, '_phaseC_pilot_ready.png') });

  await page.screenshot({ path: path.join(__dirname, '_phaseC_pilot.png') });

  const realErrors = errors.filter((text) => !/net::ERR_FAILED|Failed to load resource/.test(text));
  check('no page errors', realErrors.length === 0, realErrors);

  await browser.close();
  server.io.close();
  server.httpServer.close();
  console.log(`\n${ok} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((error) => {
  console.error('PROBE CRASHED', error);
  process.exit(1);
});
