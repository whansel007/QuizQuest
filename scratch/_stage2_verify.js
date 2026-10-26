// Stage-2 HUD restyle verification (headless Chromium, 1280x720).
// Usage: node scratch/_stage2_verify.js   (needs the Node server on :3000)
const { chromium } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:3000';
const ICON_DIR = path.join(__dirname, '..', 'public', 'hero-lab', 'assets', 'icons');
const EXPECTED = {
  sheriff: { type: 'physical', m1: '#2F96D4', e: '#A86E00', q: '#2F3AB8' },
  guardian: { type: 'physical', m1: '#2F96D4', e: '#1E78C8', q: '#8A5800' },
  pilot: { type: 'physical', m1: '#2F96D4', e: '#1E78C8', q: '#8A5800' },
  bombardier: { type: 'magic', m1: '#C08400', e: '#7B4FD8', q: '#4B2AA8' },
  bubbles: { type: 'magic', m1: '#9B7BE8', e: '#A86E00', q: '#4B2AA8' },
  electromancer: { type: 'magic', m1: '#9B7BE8', e: '#7B4FD8', q: '#8A5800' },
};
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function login(page) {
  const response = await page.request.post(`${BASE}/api/login`, { data: { userId: 's-01' } });
  const body = await response.json();
  const token = body.token || body.accessToken || (body.user && body.user.token);
  if (!token) throw new Error(`login failed: ${JSON.stringify(body).slice(0, 200)}`);
  await page.addInitScript((t) => sessionStorage.setItem('qq-token', t), token);
}

// Load world.html as the given hero in a fresh room and wait for the HUD.
async function enterWorld(page, heroId, extra = '') {
  await page.goto(`${BASE}/hero-lab/world.html?heroId=${heroId}&create=1${extra}`);
  await page.waitForSelector('#ability-hud .ability[data-ability="ultimate"] .ability-icon svg', { timeout: 15000 });
  await page.waitForTimeout(600);
}

async function hudGeometry(page) {
  return page.evaluate(() => {
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
    const q = (s) => document.querySelector(s);
    const m1 = q('.ability[data-ability="weapon"]');
    const e = q('.ability[data-ability="skill"]');
    const ult = q('.ability[data-ability="ultimate"]');
    const circle = (el) => rect(el.querySelector('.ability-circle'));
    const key = (el) => rect(el.querySelector('.ability-key'));
    const hud = rect(q('#ability-hud'));
    return {
      m1: circle(m1), e: circle(e), q: circle(ult),
      m1Key: key(m1), eKey: key(e), qKey: key(ult),
      hud,
      keys: [m1, e, ult].map((el) => el.querySelector('.ability-key').textContent.trim()),
      m1Border: getComputedStyle(m1.querySelector('.ability-circle')).border,
      m1Radius: getComputedStyle(m1.querySelector('.ability-circle')).borderRadius,
      icons: [m1, e, ult].map((el) => {
        const svg = el.querySelector('.ability-icon svg');
        const cs = svg ? getComputedStyle(svg) : null;
        const ds = svg ? [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d') || '').sort() : [];
        return { hasSvg: Boolean(svg), ds, color: cs?.color, svgBox: svg ? svg.getAttribute('viewBox') : null };
      }),
      keyShadow: getComputedStyle(q('.ability-key')).textShadow,
      keyColor: getComputedStyle(q('.ability-key')).color,
      keyWeight: getComputedStyle(q('.ability-key')).fontWeight,
      toastBottom: getComputedStyle(q('#toast-stack')).bottom,
    };
  });
}

async function hudColors(page) {
  return page.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('.ability[data-ability]')) {
      const circle = el.querySelector('.ability-circle');
      out[el.dataset.ability] = {
        fill: (circle.style.getPropertyValue('--fill-color') || '').trim(),
        ready: circle.classList.contains('ready'),
        fillPct: (circle.style.getPropertyValue('--fill') || '').trim(),
      };
    }
    out.heroName = document.querySelector('#hero-name')?.textContent;
    return out;
  });
}

// Swap the lobby hero and wait for the HUD to follow.
async function swapHero(page, heroId) {
  await page.evaluate((id) => {
    const select = document.querySelector('#lobby-hero');
    select.value = id;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, heroId);
  await page.waitForFunction(() => document.querySelector('#hero-name')?.textContent, { timeout: 8000 });
  await page.waitForTimeout(700);
}

(async () => {
  const browser = await chromium.launch();
  const warnings = [];
  const pageErrors = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') warnings.push(`${m.type()}: ${m.text()}`); });
  await login(page);

  // ---------- A. geometry (Sheriff, lobby) ----------
  await enterWorld(page, 'sheriff');
  const g = await hudGeometry(page);
  check('M1 circle is 56px', Math.abs(g.m1.w - 56) < 0.6 && Math.abs(g.m1.h - 56) < 0.6, `${g.m1.w}x${g.m1.h}`);
  check('E circle is 70px', Math.abs(g.e.w - 70) < 0.6 && Math.abs(g.e.h - 70) < 0.6, `${g.e.w}x${g.e.h}`);
  check('Q circle is 88px', Math.abs(g.q.w - 88) < 0.6 && Math.abs(g.q.h - 88) < 0.6, `${g.q.w}x${g.q.h}`);
  check('outline is 4px #101018', /4px solid rgb\(16, 16, 24\)/.test(g.m1Border), g.m1Border);
  check('circles are round', g.m1Radius === '50%', g.m1Radius);
  const gapX = g.q.left - g.m1.right;
  check('M1-Q horizontal gap 10-14px', gapX >= 10 && gapX <= 14, `${gapX.toFixed(1)}px`);
  check('E centred over Q', Math.abs((g.e.x + g.e.w / 2) - (g.q.x + g.q.w / 2)) < 0.6, `E centre ${(g.e.x + g.e.w / 2).toFixed(1)} vs Q centre ${(g.q.x + g.q.w / 2).toFixed(1)}`);
  check('M1 and Q share a baseline', Math.abs(g.m1.bottom - g.q.bottom) < 0.6, `M1 ${g.m1.bottom.toFixed(1)} vs Q ${g.q.bottom.toFixed(1)}`);
  const eClearance = g.q.top - g.eKey.bottom;
  check('E label clears Q by >=22px', eClearance >= 22, `${eClearance.toFixed(1)}px`);
  const circleGap = g.q.top - g.e.bottom;
  check('E circle sits above Q circle', circleGap > 0, `${circleGap.toFixed(1)}px`);
  check('key labels are M1/E/Q', g.keys.join(',') === 'M1,E,Q', g.keys.join(','));
  check('key labels are bold white', g.keyColor === 'rgb(255, 255, 255)' && Number(g.keyWeight) >= 700, `${g.keyColor} w${g.keyWeight}`);
  check('key labels have a dark outline', /rgb\(16, 16, 24\)/.test(g.keyShadow), g.keyShadow.slice(0, 90));
  check('cluster fully on screen at 1280x720', g.hud.left >= 0 && g.hud.top >= 0 && g.hud.right <= 1280 && g.hud.bottom <= 720,
    `hud ${g.hud.left.toFixed(0)},${g.hud.top.toFixed(0)} ${g.hud.right.toFixed(0)}x${g.hud.bottom.toFixed(0)}`);
  check('toast stack clears the cluster', parseFloat(g.toastBottom) >= g.hud.h + 16, `toast bottom ${g.toastBottom}, cluster ${g.hud.h.toFixed(0)}px`);

  // ---------- B. icons are white inline SVGs from the mapped files ----------
  const sourcePaths = {};
  for (const hero of Object.keys(EXPECTED)) {
    for (const slot of ['primary', 'skill', 'ultimate']) {
      const file = `${hero}-${slot}.svg`;
      sourcePaths[file] = fs.readFileSync(path.join(ICON_DIR, file), 'utf8').match(/ d="([^"]+)"/g).map((s) => s.slice(4, -1)).sort();
    }
  }
  const iconOk = g.icons.every((i) => i.hasSvg && i.ds.length > 0 && i.color === 'rgb(255, 255, 255)');
  check('all three icons are inline white SVGs', iconOk, g.icons.map((i) => `${i.hasSvg ? 'svg' : 'MISSING'}:${i.color}`).join(' '));
  const sheriffPaths = g.icons.map((i) => i.ds);
  const expectSheriff = ['sheriff-primary.svg', 'sheriff-skill.svg', 'sheriff-ultimate.svg'].map((f) => sourcePaths[f]);
  check('Sheriff icons match the mapped files', JSON.stringify(sheriffPaths) === JSON.stringify(expectSheriff),
    `paths ${sheriffPaths.map((p) => p.length).join('/')} vs ${expectSheriff.map((p) => p.length).join('/')}`);

  // ---------- C. colours per hero (lobby swap) ----------
  for (const [heroId, want] of Object.entries(EXPECTED)) {
    await swapHero(page, heroId);
    const c = await hudColors(page);
    const slot = { weapon: c.weapon?.fill, skill: c.skill?.fill, ultimate: c.ultimate?.fill };
    // The Sheriff's Dynamite is ready at spawn, which forces the ready gold;
    // its base amber is verified separately while the skill is cooling.
    const wantSkill = heroId === 'sheriff' && c.skill.ready ? '#ffd34f' : want.e;
    const ok = slot.weapon === want.m1 && slot.skill === wantSkill && slot.ultimate === want.q;
    check(`${heroId} (${want.type}) slot colours`, ok, `M1 ${slot.weapon} E ${slot.skill} Q ${slot.ultimate} | want ${want.m1} ${wantSkill} ${want.q}`);
  }

  // ---------- D. cooldown fill + ready state (in-game, Sheriff) ----------
  await swapHero(page, 'sheriff');
  await page.click('#start-run');
  await page.waitForFunction(() => document.querySelector('#wave-number')?.textContent?.startsWith('Wave'), { timeout: 20000 });
  await page.waitForTimeout(1200);
  const readySheriff = await hudColors(page);
  check('Sheriff E is ready at spawn (gold + ready class)', readySheriff.skill.fill === '#ffd34f' && readySheriff.skill.ready,
    `fill ${readySheriff.skill.fill} ready=${readySheriff.skill.ready} pct=${readySheriff.skill.fillPct}`);
  const glowRunning = await page.evaluate(() => {
    const el = document.querySelector('.ability[data-ability="skill"]');
    return el.classList.contains('sheriff-skill-ready')
      && getComputedStyle(el.querySelector('.ability-circle')).animationName;
  });
  check('Sheriff ready glow animation runs on the amber button', glowRunning === 'dynamite-ready-glow', String(glowRunning));
  // Cast the skill: the fill must drain below 100% and the ready class must drop.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true })));
  await page.waitForTimeout(900);
  const cooling = await hudColors(page);
  const fillPct = parseFloat(cooling.skill.fillPct);
  check('cooldown fill drains after casting E', Number.isFinite(fillPct) && fillPct < 95 && !cooling.skill.ready,
    `fill ${cooling.skill.fillPct} ready=${cooling.skill.ready}`);
  check('Sheriff E is amber while cooling (highlight family)', cooling.skill.fill === '#A86E00', cooling.skill.fill);
  await page.screenshot({ path: 'scratch/_stage2_sheriff_cd.png' });
  // Wait for it to come back (Sheriff skill cooldown) and confirm the ready return.
  await page.waitForFunction(() => {
    const c = document.querySelector('.ability[data-ability="skill"] .ability-circle');
    return c.classList.contains('ready');
  }, { timeout: 30000 });
  const backReady = await hudColors(page);
  check('E returns to ready with a full fill', backReady.skill.ready && parseFloat(backReady.skill.fillPct) >= 99.5,
    `pct ${backReady.skill.fillPct}`);

  // ---------- E. Pilot mech swap (fresh session: hero swaps are lobby-only) ----------
  const pilotPage = await context.newPage();
  pilotPage.on('pageerror', (e) => pageErrors.push(String(e)));
  await enterWorld(pilotPage, 'pilot');
  const pilotBase = await hudColors(pilotPage);
  const pilotBaseIcons = await pilotPage.evaluate(() => [...document.querySelectorAll('.ability[data-ability]')].map((el) => el.querySelector('.ability-icon svg')?.innerHTML.length || 0));
  await pilotPage.click('#start-run');
  await pilotPage.waitForFunction(() => document.querySelector('#wave-number')?.textContent?.startsWith('Wave'), { timeout: 20000 });
  await pilotPage.waitForTimeout(1200);
  const pilotRunBase = await hudColors(pilotPage);
  check('Pilot base colours: blue M1/E, amber Q (ultimate highlight)',
    pilotRunBase.weapon.fill === '#2F96D4' && pilotRunBase.skill.fill === '#1E78C8' && pilotRunBase.ultimate.fill === '#8A5800',
    `M1 ${pilotRunBase.weapon.fill} E ${pilotRunBase.skill.fill} Q ${pilotRunBase.ultimate.fill}`);
  await pilotPage.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ', bubbles: true })));
  await pilotPage.waitForTimeout(1500);
  const mech = await pilotPage.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('.ability[data-ability]')) {
      const circle = el.querySelector('.ability-circle');
      out[el.dataset.ability] = {
        fill: (circle.style.getPropertyValue('--fill-color') || '').trim(),
        iconLen: el.querySelector('.ability-icon svg')?.innerHTML.length || 0,
      };
    }
    return out;
  });
  const mechIconChanged = mech.weapon.iconLen !== pilotBaseIcons[0] && mech.skill.iconLen !== pilotBaseIcons[1];
  check('Pilot mech swaps the M1 and E icons', mechIconChanged, `M1 ${pilotBaseIcons[0]}->${mech.weapon.iconLen}, E ${pilotBaseIcons[1]}->${mech.skill.iconLen}`);
  check('Pilot mech moves M1 to amber and Q back to blue',
    mech.weapon.fill === '#C08400' && mech.ultimate.fill === '#2F3AB8',
    `M1 ${mech.weapon.fill} Q ${mech.ultimate.fill}`);
  await pilotPage.screenshot({ path: 'scratch/_stage2_pilot_mech.png' });
  // Mech Suit lasts 12s: confirm it swaps back afterwards.
  await pilotPage.waitForFunction(() => {
    const c = document.querySelector('.ability[data-ability="weapon"] .ability-circle');
    return (c.style.getPropertyValue('--fill-color') || '').trim() === '#2F96D4';
  }, { timeout: 20000 });
  const afterMech = await hudColors(pilotPage);
  check('mech swap reverts when the Mech Suit ends',
    afterMech.weapon.fill === '#2F96D4' && afterMech.ultimate.fill === '#8A5800',
    `M1 ${afterMech.weapon.fill} Q ${afterMech.ultimate.fill}`);
  await pilotPage.close();

  console.log('\n--- page errors:', pageErrors.length ? pageErrors : 'none');
  console.log('--- console warnings/errors:', warnings.length ? warnings.slice(0, 6) : 'none');
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => { console.error('VERIFY CRASHED:', error); process.exit(2); });
