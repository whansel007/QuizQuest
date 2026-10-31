// ============================================================
// Screen wipes between student screens (rendered by ScreenWipe.vue,
// mounted once in App.vue).
// ------------------------------------------------------------
// A wipe always runs in this order:
//   1. cover   - the sheet (or the telescope lens) closes over the viewport
//   2. covered - the screen is fully hidden; the callback / setTab runs here
//   3. reveal  - after Vue has rendered and the browser has painted the new
//                screen, the sheet moves off it
// so the student never sees a blank frame or the swap itself.
//
// Safety: a second wipe while one is still covering is ignored (returns
// false); a slow callback holds the cover for at most HOLD_LIMIT_MS; and a
// failsafe timer always returns the overlay to idle, so an interrupted or
// failed transition can never leave controls blocked.
// ============================================================
import { nextTick, reactive } from 'vue';
import { setTab } from './api.js';
import { playCue } from './sound.js';

const TIMING = {
  page: { cover: 260, reveal: 260 },
  telescope: { cover: 460, reveal: 520 },
  reduced: { cover: 110, reveal: 130 }, // a short fade instead of a sweep
};
const HOLD_LIMIT_MS = 3000;

/** Read-only state for ScreenWipe.vue. phase: 'idle' | 'cover' | 'covered' | 'reveal'. */
export const wipeState = reactive({ phase: 'idle', variant: 'page', reduced: false, coverMs: 0, revealMs: 0, run: 0 });

let run = 0;
let failsafe = null;
// ScreenWipe reports when its cover animation really finished, so a busy
// main thread (a slow first render) does not make the sheet snap shut.
let coverEnded = null;
const COVER_GRACE_MS = 350;
/** Called by ScreenWipe.vue on the cover animation's end. Not for other callers. */
export function notifyCoverEnd(id) {
  if (id === run) coverEnded?.();
}

export function prefersReducedMotion() {
  try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); }
  catch { return false; }
}

/** True while any part of a wipe is on screen. */
export const isWiping = () => wipeState.phase !== 'idle';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Two animation frames: the new screen has been laid out and painted. The
// timeout keeps a background tab (no rAF) from stalling the reveal.
const painted = () => new Promise((resolve) => {
  let done = false;
  const finish = () => { if (!done) { done = true; resolve(); } };
  try { requestAnimationFrame(() => requestAnimationFrame(finish)); } catch { /* no rAF */ }
  setTimeout(finish, 120);
});

function finish(mine) {
  if (mine !== undefined && mine !== run) return;
  clearTimeout(failsafe);
  failsafe = null;
  wipeState.phase = 'idle';
}

/**
 * Covers the screen, runs `callback` while it is fully covered, then reveals.
 * With prefers-reduced-motion it is a short fade (and no whoosh). Resolves to
 * false when it was ignored (another wipe is covering) or the callback threw;
 * the screen is revealed either way.
 * @param {() => (void|Promise<void>)} callback
 * @param {{ variant?: 'page'|'telescope', sound?: boolean }} [options]
 */
export async function wipe(callback, { variant = 'page', sound = true } = {}) {
  if (wipeState.phase === 'cover' || wipeState.phase === 'covered') return false;
  const mine = ++run;
  const reduced = prefersReducedMotion();
  const timing = reduced ? TIMING.reduced : (TIMING[variant] || TIMING.page);
  Object.assign(wipeState, { phase: 'cover', variant: TIMING[variant] ? variant : 'page', reduced, coverMs: timing.cover, revealMs: timing.reveal, run: mine });
  clearTimeout(failsafe);
  failsafe = setTimeout(() => finish(mine), timing.cover + HOLD_LIMIT_MS + timing.reveal + 800);
  if (sound && !reduced && variant !== 'telescope') playCue('whoosh');

  const coverAnimation = new Promise((resolve) => { coverEnded = resolve; });
  await wait(timing.cover);
  // the animation normally ends with the timer; give a lagging one a moment
  await Promise.race([coverAnimation, wait(COVER_GRACE_MS)]);
  coverEnded = null;
  if (mine !== run) return false;
  wipeState.phase = 'covered';

  let ok = true;
  try {
    await Promise.race([Promise.resolve().then(() => callback?.()), wait(HOLD_LIMIT_MS)]);
  } catch (err) {
    ok = false;
    console.warn('Screen transition: the destination could not be opened.', err);
  }
  if (mine !== run) return ok;
  await nextTick();
  await painted();
  if (mine !== run) return ok;

  wipeState.phase = 'reveal';
  if (sound && variant === 'telescope') playCue('summonArrive');
  await wait(timing.reveal);
  finish(mine);
  return ok;
}

/**
 * Wipes to a student tab: covers, runs `onCovered` (optional), calls setTab, reveals.
 * @param {string} tab e.g. 'kingdom' | 'practice' | 'world' | 'pets'
 * @param {{ variant?: 'page'|'telescope', sound?: boolean, onCovered?: () => (void|Promise<void>) }} [options]
 */
export function wipeTo(tab, { onCovered, ...options } = {}) {
  return wipe(async () => {
    try { await onCovered?.(); } finally { setTab(tab); }
  }, options);
}

/** Drops any wipe on screen immediately (e.g. on sign-out). */
export function cancelWipe() {
  run++;
  finish();
}
