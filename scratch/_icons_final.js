// Finalist inspection: renders the close-call candidates at 88px (2x display
// size) so fine detail vs bold silhouette is obvious before picking.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const LIB = path.join(__dirname, '..', 'public', 'hero-lab', 'game-icons.net.svg', 'icons', 'ffffff', '000000', '1x1');
const SIZE = 88;

const GROUPS = [
  ['Sheriff primary', '#2F96D4', ['delapouite/revolver', 'skoll/colt-m1911', 'lorc/crossed-pistols', 'john-colburn/pistol-gun']],
  ['Guardian primary', '#2F96D4', ['delapouite/roman-shield', 'delapouite/shield-impact', 'delapouite/spiked-shield', 'delapouite/shield-bash']],
  ['Guardian skill', '#1E78C8', ['lorc/winged-shield', 'delapouite/charging', 'delapouite/boulder-dash', 'lorc/fire-dash']],
  ['Guardian ultimate', '#2F3AB8', ['delapouite/charging-bull', 'skoll/mounted-knight', 'delapouite/black-knight-helm', 'delapouite/knight-banner']],
  ['Guardian talent', '#1E78C8', ['various-artists/infinity', 'lorc/over-infinity']],
  ['Bubbles skill', '#7B4FD8', ['lorc/bubble-field', 'delapouite/chat-bubble', 'seregacthtuf/thought-bubble']],
  ['Bubbles ultimate', '#4B2AA8', ['lorc/rolling-energy', 'lorc/rolling-bomb', 'delapouite/speedometer', 'lorc/boiling-bubbles']],
  ['Bubbles talent', '#7B4FD8', ['lorc/burst-blob', 'delapouite/party-popper', 'lorc/goo-explosion', 'delapouite/ice-pop']],
  ['Electro primary', '#9B7BE8', ['lorc/unstable-orb', 'lorc/concentration-orb', 'sbed/electric', 'lorc/triorb']],
  ['Electro skill', '#7B4FD8', ['lorc/static', 'delapouite/knocked-out-stars', 'lorc/static-waves', 'lorc/tesla-coil']],
  ['Electro ultimate', '#4B2AA8', ['willdabeast/chain-lightning', 'lorc/lightning-arc', 'lorc/lightning-storm', 'lorc/tesla-coil']],
  ['Electro talent', '#7B4FD8', ['sbed/battery-pack', 'priorblue/battery-100', 'lorc/power-lightning', 'lorc/circuitry']],
];

function cleanSvg(file) {
  let svg = fs.readFileSync(path.join(LIB, `${file}.svg`), 'utf8');
  svg = svg.replace(/<path d="M0 0h512v512H0z"\/>/, '');
  svg = svg.replace(/fill="[^"]*"/g, '');
  svg = svg.replace('<svg ', `<svg fill="#fff" width="${SIZE}" height="${SIZE}" `);
  return svg;
}

const sections = GROUPS.map(([label, color, files]) => `
  <div class="group"><h3>${label} <em>${color}</em></h3><div class="row">
  ${files.map((f) => `<figure class="cell">
    <div class="swatch" style="background:${color}">${cleanSvg(f)}</div>
    <figcaption>${f.split('/')[1]}<span>${f.split('/')[0]}</span></figcaption>
  </figure>`).join('')}
  </div></div>`).join('');

(async () => {
  const out = path.join(__dirname, '_icons_final.html');
  fs.writeFileSync(out, `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 14px system-ui, sans-serif; background: #14181d; color: #e8eef2; margin: 0; padding: 18px; }
    h3 { font-size: 13px; margin: 16px 0 6px; color: #aebac2; } h3 em { color: #6f7d88; font-style: normal; }
    .row { display: flex; flex-wrap: wrap; gap: 14px; }
    .cell { margin: 0; width: 150px; text-align: center; }
    .swatch { width: 112px; height: 112px; margin: 0 auto; border-radius: 16px; display: flex; align-items: center; justify-content: center; }
    figcaption { font-size: 11px; margin-top: 4px; color: #cdd8e0; word-break: break-word; }
    figcaption span { display: block; color: #7d8b96; }
  </style></head><body>${sections}</body></html>`);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  await page.goto(`file://${out}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, '_icons_final.png'), fullPage: true });
  await browser.close();
  console.log('written: scratch/_icons_final.png');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
