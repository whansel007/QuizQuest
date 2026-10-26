// Stage 1 icon selection: renders candidate SVGs from the game-icons.net
// library as white silhouettes at 44px on the REAL Stage-2 button colors, so
// each candidate can be judged exactly as it will appear in the HUD.
// Usage: node scratch/_icons_sheet.js [heroId]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const LIB = path.join(__dirname, '..', 'public', 'hero-lab', 'game-icons.net.svg', 'icons', 'ffffff', '000000', '1x1');

// Stage 2 color rules (type family by slot, amber for Sheriff's skill, hero
// medium type color for the talent badge).
const BTN_COLORS = {
  physical: { primary: '#2F96D4', skill: '#1E78C8', ultimate: '#2F3AB8' },
  magic: { primary: '#9B7BE8', skill: '#7B4FD8', ultimate: '#4B2AA8' },
  highlight: { primary: '#D99A00', skill: '#C48400', ultimate: '#A86E00' },
};

const HEROES = {
  sheriff: {
    name: 'Sheriff (physical)', type: 'physical', highlightSkill: true,
    slots: {
      primary: ['delapouite/revolver', 'skoll/revolver', 'skoll/colt-m1911', 'john-colburn/pistol-gun', 'delapouite/saber-and-pistol', 'lorc/crossed-pistols'],
      skill: ['delapouite/dynamite', 'delapouite/time-dynamite'],
      ultimate: ['delapouite/crosshair', 'skoll/bullseye', 'lorc/crosshair-arrow'],
      talent: ['lorc/stopwatch', 'skoll/stopwatch', 'lorc/hourglass', 'lorc/empty-hourglass', 'delapouite/quick-man'],
    },
  },
  guardian: {
    name: 'Guardian (physical)', type: 'physical',
    slots: {
      primary: ['delapouite/shield-bash', 'delapouite/shield-impact', 'delapouite/roman-shield', 'delapouite/american-shield', 'delapouite/spiked-shield'],
      skill: ['lorc/winged-shield', 'delapouite/charging', 'lorc/sprint', 'delapouite/boulder-dash', 'lorc/fire-dash'],
      ultimate: ['delapouite/charging-bull', 'skoll/mounted-knight', 'delapouite/black-knight-helm', 'delapouite/knight-banner', 'delapouite/rhinoceros-horn'],
      talent: ['various-artists/infinity', 'lorc/over-infinity', 'lorc/sprint'],
    },
  },
  pilot: {
    name: 'Pilot (physical)', type: 'physical',
    slots: {
      primary: ['sbed/shotgun', 'delapouite/sawed-off-shotgun', 'delapouite/shotgun-rounds', 'lorc/triple-shells'],
      skill: ['delapouite/running-shoe', 'lorc/sprint', 'darkzaitzev/running-ninja', 'lorc/fire-dash'],
      ultimate: ['delapouite/battle-mech', 'lorc/missile-mech', 'lorc/robot-golem', 'delapouite/tracked-robot', 'delapouite/mecha-head'],
      talent: ['lorc/syringe', 'sbed/pulse', 'sbed/syringe'],
      mechPrimary: ['lorc/mailed-fist', 'lorc/fulguro-punch', 'delapouite/high-punch', 'lorc/punch-blast', 'delapouite/armor-punch'],
      mechSkill: ['delapouite/rocket-thruster', 'lorc/jetpack', 'sbed/jet-pack', 'delapouite/jet-fighter'],
    },
  },
  bombardier: {
    name: 'Bombardier (magic)', type: 'magic',
    slots: {
      primary: ['lorc/grenade', 'delapouite/falling-bomb', 'delapouite/inferno-bomb', 'lorc/cluster-bomb', 'lorc/flash-grenade', 'delapouite/holy-hand-grenade'],
      skill: ['lorc/land-mine', 'lorc/mantrap', 'lorc/mine-explosion', 'lorc/grease-trap'],
      ultimate: ['lorc/bombing-run', 'delapouite/missile-launcher', 'delapouite/convergence-target', 'delapouite/multiple-targets', 'lorc/archery-target'],
      talent: ['lorc/spiky-explosion', 'lorc/bright-explosion', 'lorc/explosion-rays', 'sbed/blast', 'lorc/fireball'],
    },
  },
  bubbles: {
    name: 'Bubbles (magic)', type: 'magic',
    slots: {
      primary: ['lorc/bubbles', 'lorc/foam', 'delapouite/soap', 'lorc/spray', 'delapouite/liquid-soap', 'lorc/boiling-bubbles'],
      skill: ['lorc/bubble-field', 'delapouite/chat-bubble', 'seregacthtuf/thought-bubble'],
      ultimate: ['lorc/rolling-energy', 'lorc/rolling-bomb', 'delapouite/speedometer', 'lorc/bubble-field'],
      talent: ['lorc/burst-blob', 'delapouite/party-popper', 'skoll/laser-burst', 'lorc/goo-explosion', 'delapouite/ice-pop'],
    },
  },
  electromancer: {
    name: 'Electromancer (magic)', type: 'magic',
    slots: {
      primary: ['lorc/concentration-orb', 'lorc/unstable-orb', 'lorc/frozen-orb', 'lorc/triorb', 'delapouite/dragon-orb', 'sbed/electric', 'lorc/plasma-bolt'],
      skill: ['lorc/static', 'lorc/static-waves', 'lorc/tesla-coil', 'sbed/tesla', 'caro-asercion/tesla-coil', 'lorc/static-guard'],
      ultimate: ['willdabeast/chain-lightning', 'lorc/lightning-arc', 'lorc/lightning-storm', 'lorc/tesla-coil'],
      talent: ['priorblue/battery-100', 'sbed/battery-pack', 'delapouite/heart-battery', 'lorc/circuitry', 'lorc/power-lightning', 'delapouite/power-ring'],
    },
  },
};

const SLOT_LABELS = { primary: 'M1 primary', skill: 'E skill', ultimate: 'Q ultimate', talent: 'talent badge', mechPrimary: 'mech M1', mechSkill: 'mech E' };

function cleanSvg(file) {
  let svg = fs.readFileSync(path.join(LIB, `${file}.svg`), 'utf8');
  // Drop the full-canvas background rect these exports carry.
  svg = svg.replace(/<path d="M0 0h512v512H0z"\/>/, '');
  // Force a pure white silhouette: strip existing fills, group-fill the rest.
  svg = svg.replace(/fill="[^"]*"/g, '');
  svg = svg.replace('<svg ', '<svg fill="#fff" width="44" height="44" ');
  return svg;
}

function slotColor(hero, slot) {
  if (slot === 'talent') return BTN_COLORS[hero.type].skill;
  if (slot === 'skill' && hero.highlightSkill) return BTN_COLORS.highlight.skill;
  return BTN_COLORS[hero.type][slot] || BTN_COLORS[hero.type].skill;
}

function heroSection(id, hero) {
  const rows = Object.entries(hero.slots).map(([slot, files]) => {
    const cells = files.map((file) => {
      const author = file.split('/')[0];
      return `<figure class="cell">
        <div class="swatch" style="background:${slotColor(hero, slot)}">${cleanSvg(file)}</div>
        <figcaption>${file.split('/')[1]}<span>${author}</span></figcaption>
      </figure>`;
    }).join('');
    return `<div class="slot"><h3>${SLOT_LABELS[slot] || slot} <em>${slotColor(hero, slot)}</em></h3><div class="row">${cells}</div></div>`;
  }).join('');
  return `<section id="hero-${id}"><h2>${hero.name}</h2>${rows}</section>`;
}

(async () => {
  const only = process.argv[2];
  const ids = only && HEROES[only] ? [only] : Object.keys(HEROES);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 13px system-ui, sans-serif; background: #14181d; color: #e8eef2; margin: 0; padding: 16px; }
    h2 { font-size: 17px; margin: 18px 0 6px; color: #fff; }
    h3 { font-size: 12px; margin: 10px 0 4px; color: #aebac2; font-weight: 600; }
    h3 em { color: #6f7d88; font-style: normal; font-weight: 400; }
    .row { display: flex; flex-wrap: wrap; gap: 10px; }
    .cell { margin: 0; width: 108px; text-align: center; }
    .swatch { width: 64px; height: 64px; margin: 0 auto; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
    figcaption { font-size: 10px; line-height: 1.25; margin-top: 3px; color: #cdd8e0; word-break: break-word; }
    figcaption span { display: block; color: #7d8b96; }
  </style></head><body>${ids.map((id) => heroSection(id, HEROES[id])).join('')}</body></html>`;
  const out = path.join(__dirname, `_icons_sheet${only ? `_${only}` : ''}.html`);
  fs.writeFileSync(out, html);

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`file://${out}`);
  await page.waitForTimeout(400);
  for (const id of ids) {
    const el = await page.$(`#hero-${id}`);
    if (el) await el.screenshot({ path: path.join(__dirname, `_icons_${id}.png`) });
  }
  await browser.close();
  console.log('sheets written:', ids.map((id) => `scratch/_icons_${id}.png`).join(', '));
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
