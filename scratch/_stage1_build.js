// Stage 1 deliverable builder: copy + clean chosen icons, write CREDITS.json,
// generate the static icon-preview.html (chosen + 2 alternates per slot).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = 'C:/Users/William/Documents/GitHub/QuizQuest';
const LIB = join(root, 'public/hero-lab/game-icons.net.svg/icons/ffffff/000000/1x1');
const OUT = join(root, 'public/hero-lab/assets/icons');

// ---------------------------------------------------------------- selection
// slot: primary (M1), skill (E), ultimate (Q), talent, plus pilot mech pair.
const ICONS = [
  // hero, slot, ability, chosen [author/file], alternates [author/file]x2
  ['sheriff', 'primary', 'Revolver', ['delapouite', 'revolver'], [['lorc', 'crossed-pistols'], ['john-colburn', 'pistol-gun']]],
  ['sheriff', 'skill', 'Dynamite', ['delapouite', 'dynamite'], [['lorc', 'time-bomb'], ['lorc', 'fire-bomb']]],
  ['sheriff', 'ultimate', 'Bullet Rush', ['lorc', 'bullets'], [['delapouite', 'bullet-impacts'], ['delapouite', 'heavy-bullets']]],
  ['sheriff', 'talent', 'Quick Draw', ['lorc', 'stopwatch'], [['lorc', 'hourglass'], ['lorc', 'clockwork']]],

  ['pilot', 'primary', 'Scattershot', ['delapouite', 'sawed-off-shotgun'], [['sbed', 'shotgun'], ['delapouite', 'shotgun-rounds']]],
  ['pilot', 'skill', 'Dash', ['lorc', 'sprint'], [['delapouite', 'running-shoe'], ['lorc', 'jetpack']]],
  ['pilot', 'ultimate', 'Mech Suit', ['delapouite', 'battle-mech'], [['lorc', 'missile-mech'], ['delapouite', 'mecha-head']]],
  ['pilot', 'talent', 'Adrenaline', ['delapouite', 'health-capsule'], [['lorc', 'syringe'], ['lorc', 'energise']]],
  ['pilot', 'mechPrimary', 'Mech Punch', ['delapouite', 'armor-punch'], [['lorc', 'mailed-fist'], ['lorc', 'fulguro-punch']]],
  ['pilot', 'mechSkill', 'Impact Dash', ['delapouite', 'rocket-thruster'], [['lorc', 'punch-blast'], ['lorc', 'jetpack']]],

  ['guardian', 'primary', 'Shield Bash', ['delapouite', 'roman-shield'], [['delapouite', 'shield-impact'], ['delapouite', 'spiked-shield']]],
  ['guardian', 'skill', 'Shield Rush', ['delapouite', 'boulder-dash'], [['lorc', 'fire-dash'], ['delapouite', 'charging']]],
  ['guardian', 'ultimate', 'Unbreakable Charge', ['delapouite', 'charging-bull'], [['skoll', 'mounted-knight'], ['delapouite', 'black-knight-helm']]],
  ['guardian', 'talent', 'Unstoppable', ['delapouite', 'upgrade'], [['delapouite', 'armor-upgrade'], ['delapouite', 'swords-power']]],

  ['bombardier', 'primary', 'Blast Bomb', ['lorc', 'rolling-bomb'], [['lorc', 'grenade'], ['lorc', 'cluster-bomb']]],
  ['bombardier', 'skill', 'Proximity Trap', ['lorc', 'land-mine'], [['lorc', 'grease-trap'], ['lorc', 'time-trap']]],
  ['bombardier', 'ultimate', 'Targeted Bombing', ['delapouite', 'falling-bomb'], [['lorc', 'bombing-run'], ['delapouite', 'stealth-bomber']]],
  ['bombardier', 'talent', 'Demolitionist', ['lorc', 'spiky-explosion'], [['lorc', 'bright-explosion'], ['lorc', 'crowned-explosion']]],

  ['bubbles', 'primary', 'Bubble Spray', ['lorc', 'bubbles'], [['lorc', 'bubble-field'], ['lorc', 'boiling-bubbles']]],
  ['bubbles', 'skill', 'Bubble Trap', ['lorc', 'boiling-bubbles'], [['lorc', 'bubble-field'], ['delapouite', 'chat-bubble']]],
  ['bubbles', 'ultimate', 'Bubble Rush', ['lorc', 'rolling-energy'], [['lorc', 'rolling-bomb'], ['lorc', 'big-wave']]],
  ['bubbles', 'talent', 'Finisher', ['lorc', 'goo-explosion'], [['lorc', 'burst-blob'], ['delapouite', 'party-popper']]],

  ['electromancer', 'primary', 'Lightning Orb', ['sbed', 'electric'], [['lorc', 'unstable-orb'], ['lorc', 'concentration-orb']]],
  ['electromancer', 'skill', 'Stun Field', ['lorc', 'unstable-orb'], [['lorc', 'static'], ['delapouite', 'knocked-out-stars']]],
  ['electromancer', 'ultimate', 'Chain Lightning', ['willdabeast', 'chain-lightning'], [['lorc', 'lightning-arc'], ['lorc', 'lightning-storm']]],
  ['electromancer', 'talent', 'Overload', ['lorc', 'power-lightning'], [['sbed', 'battery-pack'], ['priorblue', 'battery-100']]],
];

const HERO_ORDER = ['sheriff', 'pilot', 'guardian', 'bombardier', 'bubbles', 'electromancer'];
const HERO_NAMES = { sheriff: 'Sheriff', pilot: 'Pilot', guardian: 'Guardian', bombardier: 'Bombardier', bubbles: 'Bubbles', electromancer: 'Electromancer' };
const HERO_TYPE = { sheriff: 'physical', pilot: 'physical', guardian: 'physical', bombardier: 'magic', bubbles: 'magic', electromancer: 'magic' };
const SLOT_LABEL = { primary: 'M1', skill: 'E', ultimate: 'Q', talent: 'Talent', mechPrimary: 'Mech M1', mechSkill: 'Mech E' };
const SLOT_ORDER = ['primary', 'skill', 'ultimate', 'talent', 'mechPrimary', 'mechSkill'];

// Stage-2 button colours the preview must match exactly.
const BTN_COLORS = {
  physical: { primary: '#2F96D4', skill: '#1E78C8', ultimate: '#2F3AB8' },
  magic: { primary: '#9B7BE8', skill: '#7B4FD8', ultimate: '#4B2AA8' },
  highlight: { primary: '#D99A00', skill: '#C48400', ultimate: '#A86E00' },
};
// Slots that sit on the amber highlight family. Pilot's mech M1 punch is
// highlighted while the Mech Suit is up (see ABILITY_BTN_HIGHLIGHT_MECH).
const BTN_HIGHLIGHT = {
  sheriff: ['skill'], pilot: ['ultimate'], guardian: ['ultimate'],
  bombardier: ['primary'], bubbles: ['skill'], electromancer: ['ultimate'],
};
const slotColor = (hero, slot) => {
  if (slot === 'talent') return BTN_COLORS[HERO_TYPE[hero]].skill;
  if (hero === 'pilot' && slot === 'mechPrimary') return BTN_COLORS.highlight.primary;
  if (slot === 'mechSkill') return BTN_COLORS[HERO_TYPE[hero]].skill;
  const family = (BTN_HIGHLIGHT[hero] || []).includes(slot) ? 'highlight' : HERO_TYPE[hero];
  return BTN_COLORS[family][slot];
};

// ------------------------------------------------------------------ cleaning
function clean(svgText) {
  let out = svgText;
  // drop the solid background rect the library bakes in
  out = out.replace(/<path d="M0 0h512v512H0z"\/>/, '');
  // white silhouette -> currentColor so the caller controls the tint
  out = out.replace(/fill="#fff"/g, 'fill="currentColor"');
  if (!out.includes('viewBox="0 0 512 512"')) throw new Error('missing viewBox');
  if (out.includes('M0 0h512v512H0z')) throw new Error('background rect survived');
  if (!out.includes('fill="currentColor"')) throw new Error('no currentColor fill');
  return out.trim();
}

const readLib = (author, file) => readFileSync(join(LIB, author, file + '.svg'), 'utf8');

// ------------------------------------------------------------------- write
mkdirSync(OUT, { recursive: true });

const credits = {
  source: 'game-icons.net',
  sourceUrl: 'https://game-icons.net/',
  license: 'CC BY 3.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/3.0/',
  attribution: 'Icons made by {author} from game-icons.net',
  libraryPath: 'public/hero-lab/game-icons.net.svg/icons/ffffff/000000/1x1/<author>/<file>.svg',
  note: 'Copies here have the library background rect removed and the silhouette fill set to currentColor; viewBox is unchanged (0 0 512 512).',
  icons: {},
};

for (const [hero, slot, ability, [ca, cf], alts] of ICONS) {
  const cleaned = clean(readLib(ca, cf));
  const name = `${hero}-${slot}.svg`;
  writeFileSync(join(OUT, name), cleaned + '\n');
  credits.icons[name] = {
    hero, slot, ability,
    author: ca,
    originalFile: `${cf}.svg`,
    originalPath: `game-icons.net.svg/icons/ffffff/000000/1x1/${ca}/${cf}.svg`,
    license: 'CC BY 3.0',
  };
}
writeFileSync(join(OUT, 'CREDITS.json'), JSON.stringify(credits, null, 2) + '\n');

// ------------------------------------------------------------- preview page
const swatch = (author, file, color, chosen, label) => {
  const body = clean(readLib(author, file)).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return `<div class="swatch${chosen ? ' chosen' : ''}">
      <div class="disc" style="background:${color}">
        <svg viewBox="0 0 512 512" width="44" height="44" style="color:#fff" aria-hidden="true">${body}</svg>
      </div>
      <div class="cap"><b>${label}</b><span>${file}.svg</span><span class="auth">${author}</span></div>
    </div>`;
};

const sections = HERO_ORDER.map((hero) => {
  const rows = SLOT_ORDER.filter((s) => ICONS.some((i) => i[0] === hero && i[1] === s)).map((slot) => {
    const entry = ICONS.find((i) => i[0] === hero && i[1] === slot);
    const [, , ability, [ca, cf], alts] = entry;
    const color = slotColor(hero, slot);
    const hl = (BTN_HIGHLIGHT[hero] || []).includes(slot);
    const hlMech = hero === 'pilot' && slot === 'mechPrimary';
    const tag = hl ? 'amber highlight' : hlMech ? 'amber while in mech' : '';
    return `<div class="row">
        <div class="rowhead">
          <span class="key">${SLOT_LABEL[slot]}</span>
          <span class="ability">${ability}</span>
          ${tag ? `<span class="tag">${tag}</span>` : ''}
        </div>
        <div class="swatches">
          ${swatch(ca, cf, color, true, 'CHOSEN')}
          ${alts.map(([aa, af]) => swatch(aa, af, color, false, 'alt')).join('\n          ')}
        </div>
      </div>`;
  }).join('\n');
  return `<section class="hero">
      <h2>${HERO_NAMES[hero]} <span class="type ${HERO_TYPE[hero]}">${HERO_TYPE[hero]}</span></h2>
      ${rows}
    </section>`;
}).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>QuizQuest ability icons &mdash; Stage 1 candidates</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 28px 64px; background: #101018; color: #e8e8f0;
         font: 14px/1.45 "Segoe UI", system-ui, sans-serif; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .sub { color: #a0a0b8; margin: 0 0 28px; max-width: 860px; }
  .sub code { background: #1c1c28; padding: 1px 5px; border-radius: 4px; }
  section.hero { margin: 0 0 34px; }
  h2 { font-size: 17px; margin: 0 0 12px; display: flex; align-items: center; gap: 10px; }
  .type { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; padding: 2px 8px; border-radius: 999px; }
  .type.physical { background: #2F96D4; color: #fff; }
  .type.magic { background: #7B4FD8; color: #fff; }
  .row { display: flex; align-items: flex-start; gap: 18px; padding: 12px 14px; border: 1px solid #24243a;
         border-radius: 10px; margin-bottom: 10px; background: #15151f; }
  .rowhead { width: 210px; flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .key { font-weight: 700; font-size: 12px; background: #2a2a40; color: #fff; border-radius: 6px; padding: 3px 8px; }
  .ability { font-weight: 600; }
  .tag { font-size: 11px; color: #ffd479; border: 1px solid #6a5220; border-radius: 999px; padding: 1px 8px; }
  .swatches { display: flex; gap: 26px; flex-wrap: wrap; }
  .swatch { width: 130px; text-align: center; }
  .disc { width: 60px; height: 60px; margin: 0 auto 7px; border-radius: 50%; display: flex;
          align-items: center; justify-content: center; box-shadow: inset 0 0 0 4px #101018; }
  .swatch.chosen .disc { outline: 3px solid #fff; outline-offset: 2px; }
  .cap { font-size: 11px; color: #b8b8cc; word-break: break-word; }
  .cap b { display: block; font-size: 10px; letter-spacing: .06em; color: #fff; }
  .swatch.chosen .cap b { color: #7dffb0; }
  .cap .auth { display: block; color: #8a8aa4; }
  footer { margin-top: 40px; color: #8a8aa4; font-size: 12px; max-width: 860px; }
</style>
</head>
<body>
<h1>Ability icon candidates &mdash; Stage 1</h1>
<p class="sub">White silhouette at the real 44&nbsp;px button size on the Stage-2 button colours
(<code>M1</code> smallest/lightest, <code>E</code> medium, <code>Q</code> biggest/darkest). Slots tagged
<b>amber highlight</b> sit on the highlight family instead of the hero&rsquo;s type family: Sheriff&rsquo;s
<code>E</code>, Pilot&rsquo;s <code>Q</code> (and his mech <code>M1</code> punch while the Mech Suit is up),
Guardian&rsquo;s <code>Q</code>, Bombardier&rsquo;s <code>M1</code>, Bubbles&rsquo; <code>E</code> and
Electromancer&rsquo;s <code>Q</code>. Each slot shows the <b>CHOSEN</b> icon outlined in white
plus two alternates. Chosen files live in <code>assets/icons/&lt;heroId&gt;-&lt;slot&gt;.svg</code>;
provenance for every icon is in <code>assets/icons/CREDITS.json</code>.</p>
${sections}
<footer>All icons from game-icons.net, licensed CC BY 3.0 &mdash; credit: &ldquo;Icons made by
{author}&rdquo;. The Settings icon-credits entry is generated from CREDITS.json in Stage 2.</footer>
</body>
</html>
`;
writeFileSync(join(root, 'public/hero-lab/icon-preview.html'), html);

console.log(`wrote ${ICONS.length} icons to assets/icons`);
console.log(`chosen files: ${ICONS.map(([h, s]) => h + '-' + s).join(', ')}`);
