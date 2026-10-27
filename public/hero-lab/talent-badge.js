// Round talent badge + key chip, shared by the World-page hero preview (Vue) and
// the in-game I card (plain DOM), so the two places can never disagree.
// The talent entry itself lives in game-config.js (name, icon, description,
// linkedSlot); nothing here hardcodes talent text.
import { ABILITY_ICONS } from './game-config.js';
import {
  BTN_COLORS, BTN_OUTLINE_COLOR, BTN_OUTLINE_WIDTH,
  TALENT_BADGE_SIZE, TALENT_BADGE_ICON_SCALE, TALENT_FALLBACK_EMOJI,
} from '../../config/tuning.js';

const SLOT_KEY_LABEL = Object.freeze({ primary: 'M1', skill: 'E', ultimate: 'Q' });
const SLOT_TIP = Object.freeze({ primary: 'primary fire', skill: 'skill', ultimate: 'ultimate' });

// 'E', 'M1', 'Q' or 'E + Q' from the talent's linkedSlot list.
export function talentKeyLabel(linkedSlot) {
  const slots = Array.isArray(linkedSlot) ? linkedSlot : [linkedSlot].filter(Boolean);
  const labels = slots.map((slot) => SLOT_KEY_LABEL[slot]).filter(Boolean);
  return labels.join(' + ');
}

// "Works with your skill button" / "…your skill and ultimate buttons".
export function talentKeyTooltip(linkedSlot) {
  const slots = Array.isArray(linkedSlot) ? linkedSlot : [linkedSlot].filter(Boolean);
  const words = slots.map((slot) => SLOT_TIP[slot]).filter(Boolean);
  if (words.length === 0) return 'Passive talent';
  if (words.length === 1) return `Works with your ${words[0]} button`;
  return `Works with your ${words.slice(0, -1).join(', ')} and ${words[words.length - 1]} buttons`;
}

// One cache per page load: the SVG is parsed once and cloned per badge.
const iconCache = new Map();
const iconLoadFailed = new Set();

async function loadTalentIcon(path, base) {
  if (iconCache.has(path)) return iconCache.get(path);
  if (iconLoadFailed.has(path)) return null;
  try {
    const response = await fetch(`${base}${path}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const svg = parsed.querySelector('svg');
    if (!svg || parsed.querySelector('parsererror')) throw new Error('not a usable SVG');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.width = '100%';
    svg.style.height = '100%';
    iconCache.set(path, svg);
    return svg;
  } catch (error) {
    iconLoadFailed.add(path);
    // One warning per path, never a crash.
    console.warn(`[hero-lab] talent icon failed to load (${path}): ${error.message}. Showing the fallback emoji.`);
    return null;
  }
}

function showFallbackEmoji(host, heroId, size) {
  host.textContent = TALENT_FALLBACK_EMOJI[heroId] || '✨';
  host.style.fontSize = `${Math.round(size * 0.7)}px`;
  host.style.lineHeight = '1';
}

/**
 * Build the round talent badge.
 * @param {{ heroId: string, type?: string, talent?: object, base?: string, size?: number }} options
 *   base: URL prefix for the icon path ('/hero-lab/' in the Vue app, '' on the
 *   world page, which already lives under /hero-lab/).
 */
export function createTalentBadge({ heroId, type = 'physical', talent = null, base = '', size = TALENT_BADGE_SIZE }) {
  const badge = document.createElement('span');
  badge.className = 'talent-badge';
  badge.dataset.hero = heroId;
  const colour = (BTN_COLORS[type] || BTN_COLORS.physical).skill;
  Object.assign(badge.style, {
    display: 'inline-grid',
    placeItems: 'center',
    // A single grid item sizes its own column, which then sits at the start of
    // the content box — so the icon rendered ~6 px left of centre until the
    // column itself was centred too.
    justifyContent: 'center',
    alignContent: 'center',
    flex: 'none',
    width: `${size}px`,
    height: `${size}px`,
    boxSizing: 'border-box',
    borderRadius: '50%',
    background: colour,
    border: `${BTN_OUTLINE_WIDTH}px solid ${BTN_OUTLINE_COLOR}`,
    color: '#fff',
    overflow: 'hidden',
  });

  const iconHost = document.createElement('span');
  iconHost.className = 'talent-badge-icon';
  const iconSize = Math.round(size * TALENT_BADGE_ICON_SCALE);
  Object.assign(iconHost.style, {
    display: 'grid',
    placeItems: 'center',
    width: `${iconSize}px`,
    height: `${iconSize}px`,
    color: '#fff',
  });
  badge.append(iconHost);

  const path = talent?.icon || ABILITY_ICONS[heroId]?.talent;
  if (!path) {
    showFallbackEmoji(iconHost, heroId, size);
    return badge;
  }
  const cached = iconCache.get(path);
  if (cached) {
    iconHost.append(cached.cloneNode(true));
    return badge;
  }
  // Leave the circle empty while the file loads, then swap in the icon or the
  // fallback emoji.
  loadTalentIcon(path, base).then((svg) => {
    if (!iconHost.isConnected) return;
    if (svg) iconHost.replaceChildren(svg.cloneNode(true));
    else showFallbackEmoji(iconHost, heroId, size);
  });
  return badge;
}
