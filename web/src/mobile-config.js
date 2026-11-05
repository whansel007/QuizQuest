// ============================================================
// QuizQuest - mobile tuning for the Vue app (docs/mobile/NOTES.md)
// ============================================================
// The in-run game keeps its own mobile numbers in
// public/hero-lab/game-config.js; these are the app shell's and the
// Kingdom town's.

// The student top bar collapses into a logo + menu button + drawer at this
// width and below. The brief asks for 768 px; 900 also covers portrait
// tablets such as an 820 px iPad Air, whose five tabs plus the account
// controls no longer fit one row. Landscape phones wider than this (a
// 932 x 430 iPhone Pro Max) are caught by the short-height rule.
export const PHONE_NAV_MAX_PX = 900;
export const PHONE_NAV_QUERY = `(max-width: ${PHONE_NAV_MAX_PX}px), (pointer: coarse) and (max-height: 520px)`;

// Modals and overlays become full-screen sheets at this width and below.
export const SHEET_MAX_PX = 600;

// Kingdom town on touch screens: the follow camera starts at this multiple
// of the "whole map fits" scale; pinch zooms between the min and max.
export const MOBILE_TOWN_ZOOM = 1.4;
export const MOBILE_TOWN_ZOOM_MIN = 1.0;
export const MOBILE_TOWN_ZOOM_MAX = 2.2;
export const MOBILE_TOWN_STICK_RADIUS = 44;

// Canvas backing stores on touch devices never exceed this device pixel
// ratio (1.5 on devices reporting fewer than 4 CPU cores).
export const MOBILE_MAX_DPR = 2;
export const MOBILE_LOW_END_DPR = 1.5;
export const MOBILE_LOW_END_CORES = 4;

// Animated backdrops (Summon sky, login preview) on touch devices.
export const MOBILE_BACKDROP_FPS = 20;

export const isTouchDevice = () => Boolean(window.matchMedia?.('(pointer: coarse)').matches);

// The DPR a canvas should use: full on desktop, capped on touch devices.
export function canvasDpr() {
  const raw = Math.max(1, window.devicePixelRatio || 1);
  if (!isTouchDevice()) return raw;
  const cores = navigator.hardwareConcurrency || MOBILE_LOW_END_CORES;
  return Math.min(raw, cores < MOBILE_LOW_END_CORES ? MOBILE_LOW_END_DPR : MOBILE_MAX_DPR);
}

// Kingdom resources (docs/mobile/FIXES.md, F3). Below this width the floating
// coin, resource and Castle chips collapse into one "resources" chip beside
// the menu button; it opens a popover, or a bottom sheet under
// RESOURCES_SHEET_BELOW_PX. Both width toggles use the hysteresis band so a
// window resized across the line does not flip back and forth.
export const RESOURCES_COLLAPSE_BELOW_PX = 1024;
export const RESOURCES_SHEET_BELOW_PX = 600;
export const WIDTH_TOGGLE_HYSTERESIS_PX = 24;
// The Kingdom title card drops the "Buildings" label (keeping its icon and
// accessible name) when it has less room than this.
export const TOWN_TITLE_COMPACT_BELOW_PX = 190;

// Hysteresis for a width-based on/off: once on (below `limit`), it turns off
// only at `limit + band` and up.
export function belowWithHysteresis(width, limit, wasBelow, band = WIDTH_TOGGLE_HYSTERESIS_PX) {
  return wasBelow ? width < limit + band : width < limit;
}

// "9,999", then "10.4k" from 10,000 and "1.2M" from a million (rounded down,
// so the chip never shows more than the student has).
export function abbreviateCount(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (n >= 1e6) return `${Math.floor(n / 1e5) / 10}M`;
  if (n >= 1e4) return `${Math.floor(n / 100) / 10}k`;
  return n.toLocaleString('en-US');
}
