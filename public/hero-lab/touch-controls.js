// ============================================================
// Campfire Run - touch control logic (docs/mobile/NOTES.md, Stage 4)
// ============================================================
// PURE functions only: no DOM, no sockets, no globals, so every rule here is
// unit tested in tests/mobile/touch-logic.unit.test.mjs. world.js owns the
// thin DOM/canvas layer that feeds pointer events in and sends the SAME
// socket messages the keyboard and mouse send. All tuning numbers come from
// MOBILE_* constants in game-config.js and are passed in by the caller.

// ---- left stick -------------------------------------------------------------

// Thumb offset (px from the stick base) -> normalised vector. Inside the dead
// zone the output is zero; beyond the radius it is clamped to length 1. The
// knob position (px, clamped to the radius) is returned for drawing.
export function stickVector(dx, dy, radius, deadZone) {
  const length = Math.hypot(dx, dy);
  const clamped = length > radius ? radius / length : 1;
  const knobX = dx * clamped, knobY = dy * clamped;
  const magnitude = Math.min(1, length / radius);
  if (magnitude <= deadZone || length === 0) return { x: 0, y: 0, magnitude: 0, knobX, knobY };
  // rescale so movement starts from 0 just outside the dead zone
  const scaled = (magnitude - deadZone) / (1 - deadZone);
  return { x: (dx / length) * scaled, y: (dy / length) * scaled, magnitude: scaled, knobX, knobY };
}

// The server takes digital movement (the same { up, down, left, right }
// booleans as WASD), so the stick picks one of 8 directions: 45 degree
// sectors centred on the axes and the diagonals.
export function vectorToDirections(x, y) {
  const none = { up: false, down: false, left: false, right: false };
  if (Math.hypot(x, y) < 1e-6) return none;
  const sector = ((Math.round(Math.atan2(y, x) / (Math.PI / 4)) % 8) + 8) % 8; // 0 = right, 2 = down
  return {
    right: sector === 7 || sector === 0 || sector === 1,
    down: sector === 1 || sector === 2 || sector === 3,
    left: sector === 3 || sector === 4 || sector === 5,
    up: sector === 5 || sector === 6 || sector === 7,
  };
}

// ---- ability buttons ----------------------------------------------------------

// A press is a TAP when released within tapMs having moved less than
// tapMovePx; anything longer or further is a HOLD (aim mode).
export function classifyPress(durationMs, movedPx, { tapMs, tapMovePx }) {
  return durationMs <= tapMs && movedPx < tapMovePx ? 'tap' : 'hold';
}

// Releasing within cancelRadius of the button centre - after the thumb has
// left it to aim - cancels: nothing is sent and no cooldown is spent.
export function inCancelZone(dx, dy, cancelRadius) {
  return Math.hypot(dx, dy) <= cancelRadius;
}

export function releaseOutcome({ dragged, dx, dy }, cancelRadius) {
  if (dragged && inCancelZone(dx, dy, cancelRadius)) return 'cancel';
  return 'fire';
}

// Drag vector (from the button centre) -> aim. The direction is the drag's;
// for point-targeted abilities the drag length maps linearly onto the
// ability's real range (dragRadius px = full range).
export function aimFromDrag(dx, dy, { type, range = 0 }, dragRadius) {
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return null;
  const dir = { x: dx / length, y: dy / length };
  const fraction = Math.min(1, length / dragRadius);
  return { dir, distance: type === 'point' || type === 'special' ? range * fraction : range, fraction };
}

// World point for an aim, clamped to the arena.
export function aimPoint(hero, aim, arena) {
  return {
    x: clamp(hero.x + aim.dir.x * aim.distance, 0, arena.width),
    y: clamp(hero.y + aim.dir.y * aim.distance, 0, arena.height),
  };
}

// AUTO-AIM for a tap: the nearest enemy within range of the hero, else the
// hero's last aim direction, else the way the hero faces. Returns
// { dir, target } where target is the enemy (or null).
export function autoAim(hero, enemies, range, lastAim, facing) {
  let best = null, bestD = Infinity;
  for (const enemy of enemies || []) {
    if (!enemy || enemy.hp <= 0 || enemy.dead) continue;
    const d = Math.hypot(enemy.x - hero.x, enemy.y - hero.y);
    if (d <= range && d < bestD) { best = enemy; bestD = d; }
  }
  if (best) {
    const len = Math.max(1e-6, bestD);
    return { dir: { x: (best.x - hero.x) / len, y: (best.y - hero.y) / len }, target: best, distance: bestD };
  }
  const fallback = unit(lastAim) || unit(facing) || { x: 1, y: 0 };
  return { dir: fallback, target: null, distance: range };
}

// Default Bombardier reticle when Q is only tapped: the centre of the densest
// group of enemies (most neighbours within blastRadius), or null.
export function densestCluster(enemies, blastRadius) {
  let best = null, bestCount = 0;
  const list = (enemies || []).filter((e) => e && !(e.hp <= 0) && !e.dead);
  for (const a of list) {
    let count = 0, sx = 0, sy = 0;
    for (const b of list) {
      if (Math.hypot(a.x - b.x, a.y - b.y) <= blastRadius) { count += 1; sx += b.x; sy += b.y; }
    }
    if (count > bestCount) { bestCount = count; best = { x: sx / count, y: sy / count }; }
  }
  return best;
}

// ---- Bombardier Targeted Bombing --------------------------------------------
// The server opens a windowMs targeting window on 'ultimate' and spends the
// cooldown only on a confirm ('fire' 'secondary' {x,y}); 'cancel_targeting'
// or the timeout close it for free. This reducer is the client side of that:
// it returns the next state and the socket messages to send.
//   state: { phase: 'idle' | 'aiming' | 'open', openedAt, point }
//   events: press, drag {point}, release {outcome, point}, arenaTap {point},
//           cancel, tick {now}
export function bombardierInitial() { return { phase: 'idle', openedAt: 0, point: null }; }

export function bombardierReduce(state, event, { windowMs }) {
  const emits = [];
  switch (event.type) {
    case 'press':
      if (state.phase === 'idle') {
        emits.push(['ultimate']);
        return { state: { phase: 'aiming', openedAt: event.now, point: event.defaultPoint || null, dragged: false }, emits };
      }
      // pressing Q again while open behaves like a new hold on the open window
      return { state: { ...state, phase: 'aiming', dragged: false }, emits };
    case 'drag':
      if (state.phase !== 'aiming') return { state, emits };
      return { state: { ...state, point: event.point, dragged: true }, emits };
    case 'release':
      if (state.phase !== 'aiming') return { state, emits };
      if (event.outcome === 'cancel') {
        emits.push(['cancel_targeting']);
        return { state: bombardierInitial(), emits };
      }
      if (state.dragged && state.point) {
        emits.push(['fire', 'secondary', state.point]);
        return { state: bombardierInitial(), emits };
      }
      // a tap (no drag): the window stays open for an arena tap
      return { state: { ...state, phase: 'open' }, emits };
    case 'arenaTap':
      if (state.phase !== 'open' && state.phase !== 'aiming') return { state, emits };
      emits.push(['fire', 'secondary', event.point]);
      return { state: bombardierInitial(), emits };
    case 'cancel':
      if (state.phase === 'idle') return { state, emits };
      emits.push(['cancel_targeting']);
      return { state: bombardierInitial(), emits };
    case 'tick':
      // the server closes the window by itself at the timeout; the client
      // just forgets it (no message, no cooldown)
      if (state.phase !== 'idle' && event.now - state.openedAt >= windowMs) return { state: bombardierInitial(), emits };
      return { state, emits };
    default:
      return { state, emits };
  }
}

export function bombardierWindowLeft(state, now, windowMs) {
  if (state.phase === 'idle') return 0;
  return Math.max(0, Math.min(1, 1 - (now - state.openedAt) / windowMs));
}

// ---- camera, zoom and pinch ---------------------------------------------------

// Base scale (CSS px per world px) at zoom 1: about baseW x baseH world px are
// visible (640 x 360 on a 667 x 375 phone), never magnified past maxBaseScale.
export function cameraBaseScale(viewW, viewH, { baseW, baseH, maxBaseScale }) {
  return Math.min(maxBaseScale, viewW / baseW, viewH / baseH);
}

// The smallest zoom shows the whole arena (letterboxed if the shapes differ).
export function minZoomForArena(viewW, viewH, arena, baseScale) {
  return Math.min(viewW / arena.width, viewH / arena.height) / baseScale;
}

export function clampZoom(zoom, min, max) {
  return Math.max(min, Math.min(max, zoom));
}

export function pinchZoom(startZoom, startDistance, distance, min, max) {
  if (!(startDistance > 0)) return clampZoom(startZoom, min, max);
  return clampZoom(startZoom * (distance / startDistance), min, max);
}

// Keep the view inside the arena: the centre is clamped so no area outside
// the arena shows; an axis that is larger than the arena is centred.
export function clampCameraCenter(x, y, viewW, viewH, scale, arena) {
  const halfW = viewW / (2 * scale), halfH = viewH / (2 * scale);
  const cx = halfW * 2 >= arena.width ? arena.width / 2 : clamp(x, halfW, arena.width - halfW);
  const cy = halfH * 2 >= arena.height ? arena.height / 2 : clamp(y, halfH, arena.height - halfH);
  return { x: cx, y: cy };
}

// Soft follow: lerp toward the target, frame-rate independent (lerp is the
// fraction covered per 60 Hz frame).
export function followCamera(camera, target, lerp, dtSeconds) {
  const k = 1 - Math.pow(1 - lerp, Math.max(0, dtSeconds) * 60);
  return { x: camera.x + (target.x - camera.x) * k, y: camera.y + (target.y - camera.y) * k };
}

// Screen (CSS px inside the canvas box) <-> world.
export function screenToWorld(sx, sy, camera, viewW, viewH) {
  return { x: camera.x + (sx - viewW / 2) / camera.scale, y: camera.y + (sy - viewH / 2) / camera.scale };
}
export function worldToScreen(wx, wy, camera, viewW, viewH) {
  return { x: (wx - camera.x) * camera.scale + viewW / 2, y: (wy - camera.y) * camera.scale + viewH / 2 };
}

// HUD text and bar scale for short screens.
export function hudScale(viewportHeight, { min, referenceHeight, max }) {
  return clamp(viewportHeight / referenceHeight, min, max);
}

// ---- helpers ------------------------------------------------------------------
export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function unit(v) {
  if (!v) return null;
  const length = Math.hypot(v.x, v.y);
  return length > 1e-6 ? { x: v.x / length, y: v.y / length } : null;
}

// Truncate a player name for the compact touch party list.
export function shortName(name, max) {
  const text = String(name || '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
