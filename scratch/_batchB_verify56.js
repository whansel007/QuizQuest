// Verify Batch B items 5 & 6: unified player roster (top-left) + room code (top-right).
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

  // Login + enter the hero-lab world as Sheriff (solo lobby, creates a room).
  const r = await page.request.post('http://127.0.0.1:3000/api/login', { data: { userId: 's-01' } });
  const token = (await r.json()).token;
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
  await page.goto('http://127.0.0.1:3000/hero-lab/world.html?heroId=sheriff&create=1');
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 15000 });
  await page.waitForTimeout(1000);

  // 1. Room code is top-right.
  const roomCodeCorner = await page.$('#room-code-corner');
  check('#room-code-corner exists', !!roomCodeCorner);
  const cornerHidden = await roomCodeCorner.getAttribute('hidden');
  check('room code corner is visible', cornerHidden === null);
  const cornerBox = await roomCodeCorner.boundingBox();
  check('room code corner is in the top-right (x > 800)', cornerBox && cornerBox.x > 800, `x=${cornerBox?.x}`);
  check('room code corner is at the top (y < 80)', cornerBox && cornerBox.y < 80, `y=${cornerBox?.y}`);

  // 2. No old player-list element.
  const oldList = await page.$('#player-list');
  check('old #player-list is gone', !oldList);

  // 3. No old #team-health or #downed-list.
  const oldTeamHealth = await page.$('#team-health');
  const oldDownList = await page.$('#downed-list');
  check('old #team-health is gone', !oldTeamHealth);
  check('old #downed-list is gone', !oldDownList);

  // 4. Player roster is inside #hero-hud (top-left).
  const roster = await page.$('#player-roster');
  check('#player-roster exists', !!roster);
  const rosterHidden = await roster.getAttribute('hidden');
  check('roster is visible', rosterHidden === null);
  const rosterBox = await roster.boundingBox();
  check('roster is top-left (x < 100)', rosterBox && rosterBox.x < 100, `x=${rosterBox?.x}`);
  check('roster is top-left (y < 200)', rosterBox && rosterBox.y < 200, `y=${rosterBox?.y}`);

  // 5. Roster has exactly one row (solo — local player).
  const rows = await page.$$('.roster-row');
  check('roster has exactly 1 row (solo)', rows.length === 1, `count=${rows.length}`);

  // 6. The row is marked .me and has a crown (host).
  const meRow = await roster.$('.roster-row.me');
  check('local player row has .me class', !!meRow);
  const crown = await meRow.$('.roster-crown');
  check('host row has crown', !!crown);
  const crownText = await crown.textContent();
  check('crown is 👑', crownText === '👑', crownText);

  // 7. The row has an HP bar (health track + fill) and HP value.
  const hpTrack = await meRow.$('.roster-hp-track');
  const hpFill = await meRow.$('.roster-hp-fill');
  const hpValue = await meRow.$('.roster-hp-value');
  check('row has HP track', !!hpTrack);
  check('row has HP fill', !!hpFill);
  check('row has HP value text', !!hpValue);
  const hpText = await hpValue.textContent();
  check('HP value shows hp/maxHp format', /^\d+\/\d+$/.test(hpText), hpText);

  // 8. Name is truncated display name (Sheriff's name is "Sheriff", ≤ 12 chars, so no ellipsis).
  const nameEl = await meRow.$('.roster-name');
  const nameText = await nameEl.textContent();
  check('name shows the display name', nameText.length > 0, nameText);
  check('name is ≤ 12 chars (no truncation needed)', nameText.length <= 12, nameText);

  // 9. Copy room code.
  await page.click('#room-code');
  await page.waitForTimeout(200);
  const copiedVisible = await page.$eval('#room-code-copied', (el) => !el.hidden);
  check('Copied! shows after click', copiedVisible);
  const copiedText = await page.$eval('#room-code-copied', (el) => el.textContent.trim());
  check('Copied! text is correct', copiedText === 'Copied!', copiedText);

  // 10. Room code value is non-empty.
  const codeValue = await page.$eval('#room-code-value', (el) => el.textContent.trim());
  check('room code value is 4 chars', codeValue.length === 4, codeValue);

  // 11. No overlap between room code (top-right) and wave counter (top-center).
  const waveHud = await page.$('#wave-hud');
  const waveBox = await waveHud.boundingBox();
  check('wave counter is top-center (x < 600)', waveBox && waveBox.x < 600 && waveBox.x > 300, `x=${waveBox?.x}`);
  check('no overlap (room code x > wave x + wave w)', cornerBox.x > waveBox.x + waveBox.width, `corner.x=${cornerBox.x} wave.right=${waveBox.x + waveBox.width}`);

  console.log(`\n${ok}/${ok + fail} checks passed`);
  await page.screenshot({ path: 'scratch/_batchB_items56.png' });
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('FAILED:', e); process.exit(1); });
