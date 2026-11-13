<script setup>
// ============================================================
// STUDENT: the walkable kingdom town canvas
// Castle plaza in the centre, one building at each compass point, a
// forest edge with a gap in the north-west tree line, and beyond it the
// clearing where the Duel and Campfire Run camps wait. The camera
// stays on the town until the player walks through the gap, then
// pans smoothly north (and back).
// ============================================================
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { drawAvatarCosmetics, loadOwnedHeroVisuals, loadPlayerVisuals, tintedPlayerFrames } from './avatar.js';
import { INK, drawFlame } from './kingdom/town-art.js';
import {
  PALETTE, TOWN_BUILDINGS, TOWN_CAMPS, TOWN_MAP_PROPS, TOWN_SIGN_SPOT, TOWN_TRAILS, TOWN_VIEW_TOP, TOWN_WALK_ZONES,
  WORLD_TOP, buildTownObjects, createForestPattern, createGroundLayer, makeEdgeTrees,
} from './kingdom/town-scene.js';
import { TOWN_SPAWN, buildGrid, canStandAt, findPath, inZone, makeTownObstacles } from './kingdom/town-collision.js';
import { EMOTES, heroLine } from './kingdom/town-voices.js';
import { BUILDING_LAYOUT } from './kingdom/buildings/index.js';
import { playSound, setAudioOptions, warmUpAudio } from '../../../public/hero-lab/arena-audio.js';
import { MOBILE_STICK_DEAD_ZONE } from '../../../public/hero-lab/game-config.js';
import { stickVector, vectorToDirections, pinchZoom } from '../../../public/hero-lab/touch-controls.js';
import { MOBILE_TOWN_ZOOM, MOBILE_TOWN_ZOOM_MIN, MOBILE_TOWN_ZOOM_MAX, MOBILE_TOWN_STICK_RADIUS, canvasDpr, isTouchDevice } from '../mobile-config.js';
import {
  TOWN_AVATAR_RADIUS, TOWN_DESTINATIONS, TOWN_DOOR_RADIUS, TOWN_GREET_RADIUS,
  TOWN_HEIGHT, TOWN_HERO_AVATAR_RADIUS, TOWN_HERO_HOP_HEIGHT, TOWN_HERO_HOPS_PER_SECOND,
  TOWN_HERO_REDUCED_MOTION_HOP_HEIGHT, TOWN_HERO_REDUCED_MOTION_PAUSE_MAX_MS, TOWN_HERO_REDUCED_MOTION_PAUSE_MIN_MS,
  TOWN_HERO_WANDER_PAUSE_MAX_MS, TOWN_HERO_WANDER_PAUSE_MIN_MS, TOWN_HERO_WALK_SPEED, TOWN_MAX_HEROES,
  TOWN_NORTH_HEIGHT, TOWN_PATH_WIDTH, TOWN_PLAZA, TOWN_ROADS, TOWN_TILE_SIZE,
  TOWN_TRAIL_WIDTH, TOWN_WALK_SPEED, TOWN_WIDTH,
} from '../../../config/tuning.js';

const props = defineProps({
  buildings: { type: Array, required: true },
  castleLevel: { type: Number, required: true },
  avatarColor: { type: String, required: true },
  avatarVisual: { type: Object, default: () => ({ hat: null }) },
  heroes: { type: Array, default: () => [] },
  // intro spotlight: 'castle' | 'buildings' | 'north' | null
  highlight: { type: String, default: null },
  // true while a dialog or the intro owns the keyboard
  paused: { type: Boolean, default: false },
  muted: { type: Boolean, default: false },
  volume: { type: Number, default: 0.55 },
});
const emit = defineEmits(['interact']);
const frame = ref(null);
const canvas = ref(null);

// The town camera frames TOWN_VIEW_TOP above the tree line, so the tallest
// upgrades on the northern row stay inside the view.
const ZONES = {
  town: { x: 0, y: TOWN_VIEW_TOP, w: TOWN_WIDTH, h: TOWN_HEIGHT - TOWN_VIEW_TOP },
  north: { x: 0, y: WORLD_TOP, w: TOWN_WIDTH, h: TOWN_NORTH_HEIGHT },
};
const NAMES = { castle: 'Castle', duel: 'Duel', campfire: 'Campfire Run' };

// ---- map data --------------------------------------------------------------

const buildings = TOWN_BUILDINGS;
const destinations = TOWN_CAMPS;
const targets = [...buildings, ...destinations];
const mapProps = TOWN_MAP_PROPS.map((p, index) => ({ ...p, id: `prop-${index}` }));
const edgeTrees = makeEdgeTrees();

// Building and camp footprints, and each prop's base only (trees block their
// trunk, never the canopy): see kingdom/town-collision.js.
const obstacles = makeTownObstacles(targets, mapProps);

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax; const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function onRoad(x, y, margin = 0) {
  if (x > TOWN_PLAZA.x - margin && x < TOWN_PLAZA.x + TOWN_PLAZA.w + margin && y > TOWN_PLAZA.y - margin && y < TOWN_PLAZA.y + TOWN_PLAZA.h + margin) return true;
  const lanes = [...TOWN_ROADS.map((line) => [line, TOWN_PATH_WIDTH]), ...TOWN_TRAILS.map((line) => [line, TOWN_TRAIL_WIDTH])];
  return lanes.some(([line, width]) => line.slice(1).some((point, i) => distanceToSegment(x, y, line[i], point) < width / 2 + margin));
}

// ---- runtime state ---------------------------------------------------------

const keys = new Set();
const player = { x: TOWN_SPAWN.x, y: TOWN_SPAWN.y, facing: -1, path: [], waypoint: 0, moving: false };
const wanderers = [];
let reducedMotion = false;
let playerFrames = null;
let playerVisuals = null;
let playerCrop = [479, 387, 642, 707];
let playerIdleClip = ['open', 'open', 'open', 'open', 'open', 'open', 'open', 'open', 'open', 'open', 'closed', 'open', 'closed'];
let playerIdleFps = 5;
let playerAnimationOffset = Math.random() * 2600;
let ctx;
let raf = 0;
let observer;
let lastFrame = 0;
let groundLayer;
let forestPattern;
let objectCanvases = [];
const artCache = new Map();
// world y of each building's drawn top, refreshed whenever its art changes
const buildingTops = {};
let promptHit = null;
let zone = 'town';
const camera = { x: 0, y: 0, ready: false };
const view = { scale: 1, dpr: 1, width: 0, height: 0 };
let speech = null; // { heroId, text, until, kind }
let nextAmbientAt = 0;
let emote = null; // { glyph, start, until }
let lastHopSoundAt = 0;
let walkGrid;
let wanderGrid;

const wheelOpen = ref(false);
// The scene's focus ring shows only when the student tabs onto the canvas,
// and fades once they start playing; clicks and programmatic focus never
// draw a frame round the town.
const focusRing = ref(false);
let tabbedAt = -Infinity;
const wheelIndex = ref(0);
const wheelPos = ref({ x: 0, y: 0 });
const wheelButtons = ref([]);

watch(() => props.avatarColor, (color) => {
  if (playerVisuals) playerFrames = tintedPlayerFrames(playerVisuals, color);
});
watch(() => [props.muted, props.volume], () => setAudioOptions({ volume: props.volume, mute: props.muted }), { immediate: true });
const levelKey = computed(() => `${props.castleLevel}|${props.buildings.map((p) => `${p.id}:${p.lvl}`).join(',')}`);
watch(levelKey, () => { if (ctx) makeObjectCanvases(); });
watch(() => props.paused, (paused) => { if (paused) { keys.clear(); closeWheel(); } });

function levelOf(id) {
  if (id === 'castle') return props.castleLevel;
  return props.buildings.find((p) => p.id === id)?.lvl || 0;
}

// ---- drawing setup ---------------------------------------------------------

// The static town drawings are shared with the sign-in showcase
// (kingdom/town-scene.js); only the levels come from this student.
function makeObjectCanvases() {
  objectCanvases = buildTownObjects(levelOf, artCache, edgeTrees);
  for (const item of objectCanvases) if (item.top !== undefined) buildingTops[item.id] = item.top;
}

// ---- collision and paths ---------------------------------------------------

// Keys, the stick and tap-to-move (the walk grid) all use this one test.
function canStand(x, y, radius = TOWN_AVATAR_RADIUS) {
  return canStandAt(x, y, radius, obstacles);
}

// Heroes keep to the town grass, away from doors; they may cross a road.
function canWanderStand(x, y) {
  if (!inZone(x, y, TOWN_WALK_ZONES[0]) || !canStand(x, y, TOWN_HERO_AVATAR_RADIUS)) return false;
  return targets.every((t) => Math.hypot(x - t.door.x, y - t.door.y) >= 34);
}


// ---- interaction -----------------------------------------------------------

function targetAt(x, y) {
  return targets.find((t) => x >= t.x - 10 && x <= t.x + t.w + 10 && y >= t.y - (t.art.h - t.h) && y <= t.y + t.h + 10);
}

function setDestination(x, y, target = null) {
  const goal = target ? target.door : { x, y };
  player.path = findPath(player.x, player.y, goal.x, goal.y, walkGrid);
  player.waypoint = 0;
}

function closestTarget() {
  let close = null;
  let distance = TOWN_DOOR_RADIUS;
  for (const t of targets) {
    const d = Math.hypot(player.x - t.door.x, player.y - t.door.y);
    if (d <= distance) { distance = d; close = t; }
  }
  return close;
}

function closestHero() {
  let close = null;
  let distance = TOWN_GREET_RADIUS;
  for (const hero of wanderers) {
    const d = Math.hypot(player.x - hero.x, player.y - hero.y);
    if (d <= distance) { distance = d; close = hero; }
  }
  return close;
}

function greet(hero, time = performance.now()) {
  hero.path = [];
  hero.moving = false;
  hero.pauseUntil = time + 3800;
  hero.facing = player.x < hero.x ? -1 : 1;
  const text = heroLine(hero.id, 'greet', speech?.heroId === hero.id ? speech.text : '');
  speech = { heroId: hero.id, name: hero.hero.name, text, until: time + 3800, kind: 'greet' };
  nextAmbientAt = Math.max(nextAmbientAt, time + 6000);
  playSound('townGreet');
}

function interact() {
  const target = closestTarget();
  if (target) { playSound('townOpen'); emit('interact', target.id); return true; }
  const hero = closestHero();
  if (hero) { greet(hero); return true; }
  return false;
}

function worldPoint(event) {
  const rect = canvas.value.getBoundingClientRect();
  const s = view.scale / view.dpr;
  return { x: (event.clientX - rect.left) / s + camera.x, y: (event.clientY - rect.top) / s + camera.y };
}

// ---- touch screens (docs/mobile/NOTES.md, Stage 2) ----------------------------
// Tap-to-move stays the main control; a tap is decided on release so a
// two-finger pinch (zoom 1.0x whole map .. 2.2x) never sends the avatar off.
// The game's virtual stick is an optional alternative (toggle, remembered).
const touchTown = isTouchDevice();
let townScale = null; // CSS px per world px on touch; null = the default zoom
const townPointers = new Map();
let townPinch = null;
const STICK_KEY = 'qq-town-stick';
const stickOn = ref(false);
try { stickOn.value = touchTown && localStorage.getItem(STICK_KEY) === '1'; } catch { /* optional */ }
const stickKnob = ref({ x: 0, y: 0 });
let stickPointer = null;
let stickCenter = null;
function townScaleLimits(rect) {
  const fit = Math.min(rect.width / TOWN_WIDTH, rect.height / ZONES.town.h);
  // Landscape: 1.4x the "whole map" scale. Portrait phones never start
  // further out than the old readable view (1.4x fit would shrink the town).
  const readable = Math.min(rect.height / ZONES.town.h, rect.width / 520);
  const preferred = Math.max(fit * MOBILE_TOWN_ZOOM, readable);
  return { preferred, min: fit * MOBILE_TOWN_ZOOM_MIN, max: Math.max(fit * MOBILE_TOWN_ZOOM_MAX, preferred) };
}
function applyTownScale(scale) {
  const rect = frame.value?.getBoundingClientRect();
  if (!rect) return;
  const limits = townScaleLimits(rect);
  townScale = Math.max(limits.min, Math.min(limits.max, scale));
  view.scale = townScale * view.dpr;
}
function toggleStick() {
  stickOn.value = !stickOn.value;
  try { localStorage.setItem(STICK_KEY, stickOn.value ? '1' : '0'); } catch { /* optional */ }
  canvas.value?.focus({ preventScroll: true });
}
function setStickKeys(dirs) {
  for (const key of ['w', 'a', 's', 'd']) keys.delete(key);
  if (dirs.up) keys.add('w');
  if (dirs.down) keys.add('s');
  if (dirs.left) keys.add('a');
  if (dirs.right) keys.add('d');
}
function onStickDown(event) {
  if (props.paused || stickPointer !== null) return;
  event.preventDefault();
  warmUpAudio();
  stickPointer = event.pointerId;
  try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* fine */ }
  const rect = event.currentTarget.getBoundingClientRect();
  stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  player.path = []; // the stick takes over from a tap destination
  onStickMove(event);
}
function onStickMove(event) {
  if (event.pointerId !== stickPointer) return;
  const v = stickVector(event.clientX - stickCenter.x, event.clientY - stickCenter.y, MOBILE_TOWN_STICK_RADIUS, MOBILE_STICK_DEAD_ZONE);
  stickKnob.value = { x: v.knobX, y: v.knobY };
  setStickKeys(vectorToDirections(v.x, v.y));
}
function onStickUp(event) {
  if (event.pointerId !== stickPointer) return;
  stickPointer = null;
  stickKnob.value = { x: 0, y: 0 };
  setStickKeys({});
}
function onTownPointerMove(event) {
  const pointer = townPointers.get(event.pointerId);
  if (!pointer) return;
  pointer.x = event.clientX; pointer.y = event.clientY;
  if (townPinch && townPointers.size >= 2) {
    const [a, b] = [...townPointers.values()];
    applyTownScale(pinchZoom(townPinch.scale, townPinch.distance, Math.hypot(a.x - b.x, a.y - b.y), 0, Infinity));
  }
}
function onTownPointerUp(event) {
  const pointer = townPointers.get(event.pointerId);
  if (!pointer) return;
  townPointers.delete(event.pointerId);
  if (townPointers.size < 2) townPinch = null;
  if (event.type === 'pointercancel' || pointer.pinched) return;
  if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) >= 12) return;
  tapTown(event);
}

function onPointerDown(event) {
  warmUpAudio();
  focusRing.value = false;
  canvas.value?.focus({ preventScroll: true });
  if (props.paused) return;
  closeWheel();
  if (touchTown && event.pointerType === 'touch') {
    try { canvas.value.setPointerCapture(event.pointerId); } catch { /* fine */ }
    townPointers.set(event.pointerId, { x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, pinched: false });
    if (townPointers.size === 2) {
      const [a, b] = [...townPointers.values()];
      a.pinched = true; b.pinched = true;
      townPinch = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), scale: townScale ?? view.scale / view.dpr };
    }
    return;
  }
  tapTown(event);
}

// Walk to the tapped point, or open the door / greet the hero under it.
function tapTown(event) {
  if (props.paused) return;
  const point = worldPoint(event);
  if (promptHit && point.x >= promptHit.x && point.x <= promptHit.x + promptHit.w && point.y >= promptHit.y && point.y <= promptHit.y + promptHit.h) {
    interact();
    return;
  }
  const target = targetAt(point.x, point.y);
  setDestination(point.x, point.y, target || null);
}

const MOVE_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

function onKeyDown(event) {
  const el = event.target;
  if (event.key === 'Tab') tabbedAt = performance.now();
  if (el instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
  if (props.paused) return;
  const key = event.key.toLowerCase();
  if (wheelOpen.value) { onWheelKey(event, key); return; }
  // let a focused button keep Enter/Space for itself
  if (el instanceof HTMLElement && el.tagName === 'BUTTON' && (key === 'enter' || key === ' ')) return;
  warmUpAudio();
  focusRing.value = false;
  if (MOVE_KEYS.includes(key)) {
    event.preventDefault();
    keys.add(key);
    player.path = [];
  } else if (key === 'e' || key === 'enter') {
    if (interact()) event.preventDefault();
  } else if (key === 'z' && !event.repeat) {
    event.preventDefault();
    openWheel();
  }
}
function onCanvasFocus() { focusRing.value = performance.now() - tabbedAt < 400; }
function onKeyUp(event) { keys.delete(event.key.toLowerCase()); }
function onBlur() { keys.clear(); }

// ---- emote wheel -----------------------------------------------------------

function screenOf(x, y) {
  const s = view.scale / view.dpr;
  return { x: (x - camera.x) * s, y: (y - camera.y) * s };
}

async function openWheel() {
  if (props.paused) return;
  keys.clear();
  player.path = [];
  const at = screenOf(player.x, player.y - TOWN_AVATAR_RADIUS * 1.6);
  const rect = frame.value.getBoundingClientRect();
  wheelPos.value = { x: Math.max(96, Math.min(rect.width - 96, at.x)), y: Math.max(106, Math.min(rect.height - 96, at.y)) };
  wheelIndex.value = 0;
  wheelOpen.value = true;
  await nextTick();
  wheelButtons.value[0]?.focus({ preventScroll: true });
}
function closeWheel() {
  if (!wheelOpen.value) return;
  wheelOpen.value = false;
  canvas.value?.focus({ preventScroll: true });
}
function chooseEmote(index) {
  const choice = EMOTES[index];
  if (!choice) return;
  const now = performance.now();
  emote = { glyph: choice.glyph, label: choice.label, start: now, until: now + 2400 };
  // Nearby heroes answer with the same emote, like a little town-wide wave.
  const responseRange = 260;
  wanderers.forEach((hero, index) => {
    if (Math.hypot(hero.x - player.x, hero.y - player.y) > responseRange) return;
    const delay = 120 + index * 90;
    hero.emote = { glyph: choice.glyph, start: now + delay, until: now + delay + 2100 };
    hero.pauseUntil = Math.max(hero.pauseUntil, now + delay + 650);
    hero.path = [];
    hero.moving = false;
  });
  playSound('townEmote');
  closeWheel();
}
function onWheelKey(event, key) {
  const count = EMOTES.length;
  if (key === 'escape' || key === 'z') { event.preventDefault(); event.stopPropagation(); closeWheel(); return; }
  if (/^[1-9]$/.test(key) && Number(key) <= count) { event.preventDefault(); chooseEmote(Number(key) - 1); return; }
  const step = ['arrowright', 'arrowdown', 'd', 's'].includes(key) ? 1 : ['arrowleft', 'arrowup', 'a', 'w'].includes(key) ? -1 : 0;
  if (step) {
    event.preventDefault();
    wheelIndex.value = (wheelIndex.value + step + count) % count;
    wheelButtons.value[wheelIndex.value]?.focus({ preventScroll: true });
  }
}

// ---- wandering heroes ------------------------------------------------------

function heroPause() {
  const min = reducedMotion ? TOWN_HERO_REDUCED_MOTION_PAUSE_MIN_MS : TOWN_HERO_WANDER_PAUSE_MIN_MS;
  const max = reducedMotion ? TOWN_HERO_REDUCED_MOTION_PAUSE_MAX_MS : TOWN_HERO_WANDER_PAUSE_MAX_MS;
  return min + Math.random() * (max - min);
}

// Resting spots are on the grass, never on a road or the plaza, so heroes
// never park in a lane or a doorway.
function heroRestPoint() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const x = 60 + Math.random() * (TOWN_WIDTH - 120);
    const y = 60 + Math.random() * (TOWN_HEIGHT - 110);
    if (!onRoad(x, y, 14) && canWanderStand(x, y)) return { x, y };
  }
  return null;
}

function chooseHeroDestination(hero, time) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const target = heroRestPoint();
    if (!target || Math.hypot(target.x - hero.x, target.y - hero.y) > 420) continue;
    const path = findPath(hero.x, hero.y, target.x, target.y, wanderGrid);
    if (path.length) {
      hero.path = path;
      hero.waypoint = 0;
      hero.pauseUntil = 0;
      return true;
    }
  }
  hero.pauseUntil = time + 800;
  return false;
}

async function initializeWanderers(time) {
  wanderers.length = 0;
  const roster = props.heroes.slice(0, TOWN_MAX_HEROES);
  if (!roster.length) return;
  let records = new Map();
  try { records = (await loadOwnedHeroVisuals(roster.map((hero) => hero.id))).heroes; }
  catch (error) { console.warn('[Town hero sprites] Could not load the wandering party.', error); }
  for (const hero of roster) {
    const record = records.get(hero.id);
    const spawn = heroRestPoint();
    if (!spawn) continue;
    wanderers.push({
      id: hero.id, hero, visual: record?.visual || null, frames: record?.frames || {},
      x: spawn.x, y: spawn.y, facing: Math.random() < 0.5 ? -1 : 1, path: [], waypoint: 0, moving: false,
      animationOffset: Math.random() * 1000, hopOffset: Math.random() * 1000, pauseUntil: time + heroPause(),
    });
  }
}

// Heroes never hard-block one another or the player: crowded heroes ease
// apart instead, so nobody gets trapped or shoved along forever.
function separate(hero, other, minDistance, share) {
  const dx = hero.x - other.x; const dy = hero.y - other.y;
  const d = Math.hypot(dx, dy) || 0.01;
  if (d >= minDistance) return;
  const push = (minDistance - d) * share;
  const nx = hero.x + (dx / d) * push; const ny = hero.y + (dy / d) * push;
  if (canStand(nx, ny, TOWN_HERO_AVATAR_RADIUS) && inZone(nx, ny, TOWN_WALK_ZONES[0])) { hero.x = nx; hero.y = ny; }
}

function updateWanderers(time, dt) {
  for (const hero of wanderers) {
    if (time < hero.pauseUntil) { hero.moving = false; }
    else {
      if (!hero.path.length || hero.waypoint >= hero.path.length) {
        hero.moving = false;
        chooseHeroDestination(hero, time);
      }
      const point = hero.path[hero.waypoint];
      if (point) {
        const dx = point.x - hero.x;
        const dy = point.y - hero.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 3) {
          hero.waypoint += 1;
          if (hero.waypoint >= hero.path.length) {
            hero.path = [];
            hero.moving = false;
            hero.pauseUntil = time + heroPause();
          }
        } else {
          const step = Math.min(distance, TOWN_HERO_WALK_SPEED * dt);
          hero.x += (dx / distance) * step;
          hero.y += (dy / distance) * step;
          hero.moving = step > 0;
          hero.facing = dx < -0.5 ? -1 : dx > 0.5 ? 1 : hero.facing;
        }
      }
    }
  }
  for (let i = 0; i < wanderers.length; i += 1) {
    for (let j = i + 1; j < wanderers.length; j += 1) {
      separate(wanderers[i], wanderers[j], 28, 0.08);
      separate(wanderers[j], wanderers[i], 28, 0.08);
    }
    separate(wanderers[i], player, 26, 0.12);
  }
}

// ---- per-frame drawing -----------------------------------------------------

function wrapText(g, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (g.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

function visibleWorld() {
  return { x: camera.x, y: camera.y, w: view.width / view.scale, h: view.height / view.scale, s: view.scale / view.dpr };
}

// Bubbles stay inside the visible area and below the top HUD strip.
function clampBubble(x, y, w, h) {
  const v = visibleWorld();
  const topInset = (view.width / view.dpr < 600 ? 130 : 150) / v.s;
  return {
    x: Math.max(v.x + 8, Math.min(v.x + v.w - w - 8, x)),
    y: Math.max(v.y + topInset, Math.min(v.y + v.h - h - 60 / v.s, y)),
  };
}

function speechBubbleOverlapsHero(box, hero, width, height) {
  const radius = TOWN_HERO_AVATAR_RADIUS;
  const heroBox = {
    x: hero.x - radius * 1.2,
    y: hero.y - radius * 3.15 - TOWN_HERO_HOP_HEIGHT,
    w: radius * 2.4,
    h: radius * 3.15 + 6 + TOWN_HERO_HOP_HEIGHT,
  };
  return box.x < heroBox.x + heroBox.w
    && box.x + width > heroBox.x
    && box.y < heroBox.y + heroBox.h
    && box.y + height > heroBox.y;
}

function drawSpeech(g, time) {
  if (!speech || time > speech.until) { speech = null; return; }
  const hero = wanderers.find((h) => h.id === speech.heroId);
  if (!hero) { speech = null; return; }
  g.font = '700 12px Nunito, Trebuchet MS, sans-serif';
  const lines = wrapText(g, speech.text, 170);
  const width = Math.max(...lines.map((l) => g.measureText(l).width)) + 22;
  const nameH = speech.kind === 'greet' ? 15 : 0;
  const height = lines.length * 15 + 14 + nameH;
  const tipY = hero.y - TOWN_HERO_AVATAR_RADIUS * 3.2;
  let box = clampBubble(hero.x - width / 2, tipY - height - 8, width, height);
  let pointer = 'bottom';
  if (speechBubbleOverlapsHero(box, hero, width, height)) {
    // At the top edge there may not be enough room above the sprite. Move the
    // bubble below it instead of letting the viewport clamp push it over the
    // character's face.
    const below = clampBubble(hero.x - width / 2, hero.y + 16, width, height);
    if (!speechBubbleOverlapsHero(below, hero, width, height)) {
      box = below;
      pointer = 'top';
    }
  }
  g.fillStyle = PALETTE.paper; g.strokeStyle = INK; g.lineWidth = 2.5;
  g.beginPath(); g.roundRect(box.x, box.y, width, height, 9); g.fill(); g.stroke();
  const tipX = Math.max(box.x + 12, Math.min(box.x + width - 12, hero.x));
  if (pointer === 'bottom' && box.y + height <= tipY) {
    g.beginPath(); g.moveTo(tipX - 6, box.y + height - 1); g.lineTo(tipX, box.y + height + 7); g.lineTo(tipX + 6, box.y + height - 1); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(tipX - 6, box.y + height); g.lineTo(tipX, box.y + height + 7); g.lineTo(tipX + 6, box.y + height); g.stroke();
  } else if (pointer === 'top') {
    g.beginPath(); g.moveTo(tipX - 6, box.y + 1); g.lineTo(tipX, box.y - 7); g.lineTo(tipX + 6, box.y + 1); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(tipX - 6, box.y); g.lineTo(tipX, box.y - 7); g.lineTo(tipX + 6, box.y); g.stroke();
  }
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
  if (nameH) {
    g.font = '800 10px ui-monospace, Cascadia Code, monospace';
    g.fillStyle = '#6A4E8F';
    g.fillText(speech.name.toUpperCase(), box.x + width / 2, box.y + 12);
    g.fillStyle = INK;
  }
  g.font = '700 12px Nunito, Trebuchet MS, sans-serif';
  lines.forEach((line, i) => g.fillText(line, box.x + width / 2, box.y + 14 + nameH + i * 15));
}

function updateAmbientSpeech(time) {
  if (!wanderers.length) return;
  if (!nextAmbientAt) nextAmbientAt = time + 4000 + Math.random() * 4000;
  if (speech || time < nextAmbientAt) return;
  const v = visibleWorld();
  const onScreen = wanderers.filter((h) => inZone(h.x, h.y, v));
  if (onScreen.length) {
    const hero = onScreen[Math.floor(Math.random() * onScreen.length)];
    speech = { heroId: hero.id, name: hero.hero.name, text: heroLine(hero.id, 'ambient'), until: time + 3200, kind: 'ambient' };
  }
  nextAmbientAt = time + 8000 + Math.random() * 6000;
}

function drawWanderingHero(g, actor, time) {
  const radius = TOWN_HERO_AVATAR_RADIUS;
  const hop = actor.moving ? Math.abs(Math.sin(((time + actor.hopOffset) / 1000) * Math.PI * TOWN_HERO_HOPS_PER_SECOND)) * (reducedMotion ? TOWN_HERO_REDUCED_MOTION_HOP_HEIGHT : TOWN_HERO_HOP_HEIGHT) : 0;
  g.fillStyle = 'rgba(35,56,47,.22)';
  g.beginPath(); g.ellipse(actor.x, actor.y + 2, radius * 1.15, radius * .38, 0, 0, Math.PI * 2); g.fill();
  const frameName = playerIdleClip[Math.floor(((time + actor.animationOffset) / 1000) * playerIdleFps) % playerIdleClip.length];
  const sprite = actor.frames[frameName] || actor.frames.open;
  g.save();
  g.translate(actor.x, actor.y - hop);
  if (actor.facing < 0) g.scale(-1, 1);
  if (sprite && actor.visual) {
    const crop = actor.visual.crop.open;
    const h = radius * 3.15;
    const w = h * crop[2] / crop[3];
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(sprite, ...crop, -w / 2, -h, w, h);
  } else {
    g.font = '40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
    g.fillText(actor.hero.emoji || '🐱', 0, 0);
  }
  g.restore();
}

function drawAvatar(g, time) {
  const r = TOWN_AVATAR_RADIUS;
  const hopPhase = Math.abs(Math.sin(time * .018));
  const hop = player.moving ? hopPhase * (reducedMotion ? 1.5 : 4) : 0;
  if (player.moving && hopPhase < 0.12 && time - lastHopSoundAt > 340) {
    lastHopSoundAt = time;
    playSound('townHop', { pitchVariance: 0.05 });
  }
  const frameName = playerIdleClip[Math.floor(((time + playerAnimationOffset) / 1000) * playerIdleFps) % playerIdleClip.length];
  const sprite = playerFrames?.[player.moving ? 'open' : frameName];
  const spriteHeight = r * 3.15;
  const spriteWidth = spriteHeight * playerCrop[2] / playerCrop[3];
  // Keep the contact shadow anchored to the world position while the sprite hops.
  g.fillStyle = 'rgba(35,56,47,.2)';
  g.beginPath(); g.ellipse(player.x, player.y + 3, r * 1.16, r * .4, 0, 0, Math.PI * 2); g.fill();
  if (sprite) {
    g.save();
    g.translate(player.x, player.y - hop);
    g.scale(player.facing, 1);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(sprite, 0, 0, sprite.width, sprite.height, -spriteWidth / 2, -spriteHeight, spriteWidth, spriteHeight);
    g.restore();
    drawAvatarCosmetics(g, {
      left: player.x - spriteWidth / 2,
      top: player.y - hop - spriteHeight,
      width: spriteWidth,
      height: spriteHeight,
      facing: player.facing,
      hatId: props.avatarVisual?.hat,
      accessoryId: props.avatarVisual?.accessory,
    });
    return;
  }
  // Small vector fallback while the player frames decode.
  g.save();
  g.translate(player.x, player.y - hop);
  g.fillStyle = '#F6E5B4'; g.strokeStyle = INK; g.lineWidth = 4; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(-r * .76, -r * .48); g.lineTo(-r * .8, -r * 1.54); g.lineTo(-r * .1, -r * .96); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(r * .76, -r * .48); g.lineTo(r * .8, -r * 1.54); g.lineTo(r * .1, -r * .96); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#FFF8E4';
  g.beginPath(); g.arc(0, -r * .18, r, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = INK;
  g.beginPath(); g.ellipse(-r * .34, -r * .2, 2.3, 3.2, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(r * .34, -r * .2, 2.3, 3.2, 0, 0, Math.PI * 2); g.fill();
  g.restore();
  // Bounds that match the sprite's proportions around the fallback head
  // (head circle about 94% of the crop width), so cosmetics sit the same way.
  const fallbackWidth = (r * 2) / 0.94;
  const fallbackHeight = fallbackWidth * playerCrop[3] / playerCrop[2];
  drawAvatarCosmetics(g, {
    left: player.x - fallbackWidth / 2,
    top: player.y - hop + r * .82 - fallbackHeight,
    width: fallbackWidth,
    height: fallbackHeight,
    facing: player.facing,
    hatId: props.avatarVisual?.hat,
    accessoryId: props.avatarVisual?.accessory,
  });
}

function drawEmoteBubble(g, glyph, x, y, age, remaining) {
  const pop = reducedMotion ? 1 : Math.min(1, age / 160) * (1 + 0.15 * Math.max(0, 1 - age / 320));
  const fade = Math.min(1, remaining / 300);
  g.save();
  g.globalAlpha = fade;
  g.translate(x, y); g.scale(pop, pop);
  g.fillStyle = PALETTE.paper; g.strokeStyle = INK; g.lineWidth = 2.5;
  // Draw the pointer first so the round bubble hides its base cleanly.
  g.beginPath(); g.moveTo(-6, 15); g.lineTo(0, 28); g.lineTo(6, 15); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.arc(0, 0, 21, 0, Math.PI * 2); g.fill(); g.stroke();
  g.font = '24px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
  g.fillText(glyph, 0, 1);
  g.restore();
}

function drawEmote(g, time) {
  if (emote && time > emote.until) emote = null;
  if (emote && time >= emote.start) {
    drawEmoteBubble(g, emote.glyph, player.x, player.y - TOWN_AVATAR_RADIUS * 3.2 - 26,
      time - emote.start, emote.until - time);
  }
  for (const hero of wanderers) {
    if (!hero.emote) continue;
    if (time > hero.emote.until) { hero.emote = null; continue; }
    if (time < hero.emote.start) continue;
    drawEmoteBubble(g, hero.emote.glyph, hero.x, hero.y - TOWN_HERO_AVATAR_RADIUS * 3.2 - 26,
      time - hero.emote.start, hero.emote.until - time);
  }
}

function targetPrompt(t) {
  if (t.kind === 'destination') {
    return t.id === 'duel'
      ? { title: 'Duel', line: 'Press E or click to start a quiz battle' }
      : { title: 'Campfire Run', line: 'Press E or click to defend the campfire' };
  }
  const plot = props.buildings.find((p) => p.id === t.id);
  const name = plot?.def.name || NAMES[t.id] || t.id;
  return { title: `${name} · Lv ${levelOf(t.id)}/3`, line: 'Press E or click to open' };
}

function drawPrompt(g, time) {
  promptHit = null;
  const target = closestTarget();
  const bob = reducedMotion ? 0 : Math.sin(time / 230) * 2;
  if (target) {
    const { title, line } = targetPrompt(target);
    // wide enough for both lines, whichever is longer
    g.font = '700 11.5px Nunito, Trebuchet MS, sans-serif';
    const lineWidth = g.measureText(line).width;
    g.font = '700 15px Georgia, "Palatino Linotype", serif';
    const width = Math.max(200, g.measureText(title).width + 30, lineWidth + 30);
    const anchorY = buildingTops[target.id] ?? target.y + target.h + 8 - target.art.h;
    const box = clampBubble(target.door.x - width / 2, anchorY - 54 - bob, width, 48);
    g.fillStyle = PALETTE.paper; g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.roundRect(box.x, box.y, width, 48, 8); g.fill(); g.stroke();
    g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(title, box.x + width / 2, box.y + 16);
    g.font = '700 11.5px Nunito, Trebuchet MS, sans-serif';
    g.fillText(line, box.x + width / 2, box.y + 34);
    promptHit = { x: box.x, y: box.y, w: width, h: 48 };
    return;
  }
  const hero = closestHero();
  if (hero && !(speech?.kind === 'greet' && speech.heroId === hero.id)) {
    const label = `E · Greet ${hero.hero.name}`;
    g.font = '800 12px Nunito, Trebuchet MS, sans-serif';
    const width = g.measureText(label).width + 22;
    const box = clampBubble(hero.x - width / 2, hero.y - TOWN_HERO_AVATAR_RADIUS * 3.2 - 34 - bob, width, 26);
    g.fillStyle = '#254937'; g.strokeStyle = INK; g.lineWidth = 2.5;
    g.beginPath(); g.roundRect(box.x, box.y, width, 26, 13); g.fill(); g.stroke();
    g.fillStyle = '#FFF8E4'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, box.x + width / 2, box.y + 13.5);
    promptHit = { x: box.x, y: box.y, w: width, h: 26 };
  }
}

function drawAffordableArrows(g, time) {
  for (const plot of props.buildings) {
    if (!plot.cost || !plot.affordable) continue;
    const b = BUILDING_LAYOUT[plot.id];
    if (!b) continue;
    const x = b.x + b.w / 2;
    // the arrow's tip is 13px above y and its base 7px below: base rests just over the roof
    const y = (buildingTops[plot.id] ?? b.y) - 10 - (reducedMotion ? 0 : Math.abs(Math.sin(time / 180)) * 4);
    g.fillStyle = PALETTE.gold; g.strokeStyle = INK; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x, y - 13); g.lineTo(x - 9, y - 3); g.lineTo(x - 4, y - 3); g.lineTo(x - 4, y + 7); g.lineTo(x + 4, y + 7); g.lineTo(x + 4, y - 3); g.lineTo(x + 9, y - 3); g.closePath(); g.fill(); g.stroke();
  }
}

// Intro spotlight: a dashed gold ring under the things being explained.
function drawHighlight(g, time) {
  if (!props.highlight) return;
  const pulse = reducedMotion ? 0 : Math.sin(time / 260) * 4;
  const rings = [];
  if (props.highlight === 'castle') rings.push([640, 360, 150, 105]);
  if (props.highlight === 'garden') {
    const b = BUILDING_LAYOUT.garden;
    rings.push([b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 26, b.h / 2 + 26]);
  }
  if (props.highlight === 'buildings') for (const id of ['garden', 'tower', 'library', 'workshop']) {
    const b = BUILDING_LAYOUT[id];
    rings.push([b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 26, b.h / 2 + 26]);
  }
  // the gap in the north-west tree line, with the BATTLES sign beside it
  if (props.highlight === 'north') rings.push([TOWN_SIGN_SPOT.x - 30, TOWN_SIGN_SPOT.y - 74, 74, 54]);
  g.save();
  g.setLineDash([10, 8]);
  g.lineDashOffset = reducedMotion ? 0 : -time / 40;
  for (const [x, y, rx, ry] of rings) {
    g.strokeStyle = 'rgba(35,56,47,.55)'; g.lineWidth = 8;
    g.beginPath(); g.ellipse(x, y, rx + pulse, ry + pulse, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = PALETTE.gold; g.lineWidth = 4;
    g.beginPath(); g.ellipse(x, y, rx + pulse, ry + pulse, 0, 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

// ---- collider debug overlay (?debug=colliders) -------------------------------
// Off unless the page URL carries debug=colliders (comma lists allowed). Draws
// the walk zones, the blocked pathfinding cells, every collider, the door
// zones, the sprite boxes of the props and the player's footprint, so a
// collider bigger than its drawing shows at a glance. Never drawn otherwise.
const debugColliders = (() => {
  try { return (new URLSearchParams(window.location.search).get('debug') || '').split(',').includes('colliders'); }
  catch { return false; }
})();

function drawColliderDebug(g) {
  const v = visibleWorld();
  g.save();
  g.lineWidth = 1.5;
  // blocked pathfinding cells (the grid tap-to-move uses)
  if (walkGrid) {
    g.fillStyle = 'rgba(220,40,40,.26)';
    const { cols, rows, blocked } = walkGrid;
    for (let i = 0; i < cols * rows; i += 1) {
      if (!blocked[i]) continue;
      const x = (i % cols) * TOWN_TILE_SIZE; const y = WORLD_TOP + Math.floor(i / cols) * TOWN_TILE_SIZE;
      if (x + TOWN_TILE_SIZE < v.x || x > v.x + v.w || y + TOWN_TILE_SIZE < v.y || y > v.y + v.h) continue;
      g.fillRect(x + 1, y + 1, TOWN_TILE_SIZE - 2, TOWN_TILE_SIZE - 2);
    }
  }
  // walk zones: the avatar's centre must stay inside one of these
  g.strokeStyle = '#2f7bff'; g.setLineDash([8, 5]);
  for (const z of TOWN_WALK_ZONES) g.strokeRect(z.x, z.y, z.w, z.h);
  // sprite boxes of the placed props (to compare with their colliders)
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.setLineDash([3, 3]);
  for (const item of objectCanvases) if (!String(item.id).startsWith('edge-')) g.strokeRect(item.x, item.y, item.w, item.h);
  g.setLineDash([]);
  // colliders
  g.fillStyle = 'rgba(255,0,200,.30)'; g.strokeStyle = '#ff00c8';
  for (const o of obstacles) {
    g.beginPath();
    if (o.type === 'rect') g.rect(o.x, o.y, o.w, o.h);
    else g.arc(o.x, o.y, o.r, 0, Math.PI * 2);
    g.fill(); g.stroke();
  }
  // door zones (E / tap opens within TOWN_DOOR_RADIUS of the door point)
  g.strokeStyle = '#ffd400'; g.fillStyle = 'rgba(255,212,0,.16)';
  for (const t of targets) {
    g.beginPath(); g.arc(t.door.x, t.door.y, TOWN_DOOR_RADIUS, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#ffd400'; g.beginPath(); g.arc(t.door.x, t.door.y, 3, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,212,0,.16)';
  }
  // the player's footprint and any tap-to-move route
  g.strokeStyle = '#00e5ff'; g.lineWidth = 2;
  g.beginPath(); g.arc(player.x, player.y, TOWN_AVATAR_RADIUS * 0.8, 0, Math.PI * 2); g.stroke();
  if (player.path.length) {
    g.beginPath(); g.moveTo(player.x, player.y);
    for (const p of player.path.slice(player.waypoint)) g.lineTo(p.x, p.y);
    g.stroke();
  }
  g.restore();
}

// ---- camera ----------------------------------------------------------------

function cameraTarget() {
  const v = visibleWorld();
  const z = ZONES[zone];
  const x = v.w >= z.w ? z.x + z.w / 2 - v.w / 2 : Math.max(z.x, Math.min(z.x + z.w - v.w, player.x - v.w / 2));
  const y = v.h >= z.h ? z.y + z.h / 2 - v.h / 2 : Math.max(z.y, Math.min(z.y + z.h - v.h, player.y - v.h / 2));
  return { x, y };
}

function updateCamera(dt) {
  if (player.y < -14) zone = 'north';
  else if (player.y > 14) zone = 'town';
  const target = cameraTarget();
  if (!camera.ready) { Object.assign(camera, target, { ready: true }); return; }
  const k = 1 - Math.exp(-dt * (reducedMotion ? 14 : 4.2));
  camera.x += (target.x - camera.x) * k;
  camera.y += (target.y - camera.y) * k;
  if (Math.abs(target.x - camera.x) < 0.05) camera.x = target.x;
  if (Math.abs(target.y - camera.y) < 0.05) camera.y = target.y;
}

// ---- main loop -------------------------------------------------------------

function tick(time) {
  if (!ctx || !canvas.value) return;
  const dt = lastFrame ? Math.min((time - lastFrame) / 1000, 0.05) : 0;
  lastFrame = time;

  let dx = 0; let dy = 0;
  if (!props.paused && !wheelOpen.value) {
    dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
    dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  }
  const magnitude = Math.hypot(dx, dy) || 1;
  if (dx || dy) { dx /= magnitude; dy /= magnitude; }
  else if (!props.paused && player.path.length && player.waypoint < player.path.length) {
    const point = player.path[player.waypoint];
    dx = point.x - player.x; dy = point.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 3) { player.waypoint += 1; if (player.waypoint >= player.path.length) player.path = []; dx = 0; dy = 0; }
    else { dx /= distance; dy /= distance; }
  }
  let moved = false;
  if (dt > 0 && (dx || dy)) {
    const step = TOWN_WALK_SPEED * dt;
    const nx = player.x + dx * step;
    const ny = player.y + dy * step;
    if (canStand(nx, player.y)) { player.x = nx; moved = true; }
    if (canStand(player.x, ny)) { player.y = ny; moved = true; }
    player.facing = dx < -0.05 ? -1 : dx > 0.05 ? 1 : player.facing;
  }
  player.moving = moved;
  updateWanderers(time, dt);
  updateAmbientSpeech(time);
  updateCamera(dt);

  const s = view.scale;
  ctx.setTransform(s, 0, 0, s, -camera.x * s, -camera.y * s);
  const v = visibleWorld();
  ctx.fillStyle = forestPattern || PALETTE.forest;
  ctx.fillRect(v.x - 4, v.y - 4, v.w + 8, v.h + 8);
  if (groundLayer) ctx.drawImage(groundLayer, 0, WORLD_TOP);
  drawHighlight(ctx, time);

  const drawables = [
    ...objectCanvases,
    ...wanderers.map((actor) => ({ id: actor.id, sortY: actor.y, actor })),
    { id: 'player', sortY: player.y, player: true },
  ];
  drawables.sort((a, b) => a.sortY - b.sortY);
  const margin = 120;
  for (const item of drawables) {
    if (item.player) drawAvatar(ctx, time);
    else if (item.actor) drawWanderingHero(ctx, item.actor, time);
    else if (item.x + item.w > v.x - margin && item.x < v.x + v.w + margin && item.y + item.h > v.y - margin && item.y < v.y + v.h + margin) {
      ctx.drawImage(item.canvas, item.x, item.y, item.w, item.h);
      if (item.id === 'campfire') drawFlame(ctx, TOWN_DESTINATIONS.campfire.flame.x, TOWN_DESTINATIONS.campfire.flame.y, time, reducedMotion);
    }
  }
  if (debugColliders) drawColliderDebug(ctx);
  drawAffordableArrows(ctx, time);
  drawSpeech(ctx, time);
  drawEmote(ctx, time);
  drawPrompt(ctx, time);
  raf = requestAnimationFrame(tick);
}

// Show the whole town on desktop; on narrow portrait screens zoom in a little
// and let the camera follow the player across the town instead.
function resize() {
  if (!frame.value || !canvas.value) return;
  // touch devices cap the backing store's pixel ratio (MOBILE_MAX_DPR)
  const dpr = canvasDpr();
  const rect = frame.value.getBoundingClientRect();
  canvas.value.width = Math.round(rect.width * dpr);
  canvas.value.height = Math.round(rect.height * dpr);
  ctx = canvas.value.getContext('2d', { alpha: false });
  const fit = Math.min(rect.width / TOWN_WIDTH, rect.height / ZONES.town.h);
  const readable = Math.min(rect.height / ZONES.town.h, rect.width / 520);
  let cssScale = Math.max(fit, readable);
  if (touchTown) {
    // follow camera at MOBILE_TOWN_ZOOM; a pinch picks another zoom that survives resizes
    const limits = townScaleLimits(rect);
    cssScale = Math.max(limits.min, Math.min(limits.max, townScale ?? limits.preferred));
    townScale = cssScale;
  }
  Object.assign(view, { dpr, scale: cssScale * dpr, width: canvas.value.width, height: canvas.value.height });
  forestPattern = createForestPattern(ctx);
  camera.ready = false;
}

onMounted(async () => {
  reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  walkGrid = buildGrid((x, y) => canStand(x, y));
  wanderGrid = buildGrid(canWanderStand);
  groundLayer = createGroundLayer();
  try {
    playerVisuals = await loadPlayerVisuals();
    playerIdleClip = playerVisuals.config.IDLE_CLIP;
    playerIdleFps = playerVisuals.config.IDLE_FPS;
    playerCrop = playerVisuals.visual.crop.open;
    playerFrames = tintedPlayerFrames(playerVisuals, props.avatarColor);
    playerAnimationOffset = Math.random() * playerVisuals.config.TIME_MS_PER_SECOND;
  } catch (error) { console.warn('[Town player sprite] Could not load player visuals.', error); }
  await initializeWanderers(performance.now());
  // The student can leave the town while it is still loading, and then the
  // frame is gone: there is nothing left to observe, listen to or draw.
  if (!frame.value) return;
  resize();
  makeObjectCanvases();
  observer = new ResizeObserver(resize);
  observer.observe(frame.value);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  // Read-only test hook, only with ?debug=colliders (tests/mobile/town-walk.e2e.mjs).
  if (debugColliders) {
    window.__qqTown = {
      player: () => ({ x: player.x, y: player.y, moving: player.moving }),
      camera: () => ({ x: camera.x, y: camera.y }),
      view: () => { const w = visibleWorld(); return { ...w, cssWidth: view.width / view.dpr, cssHeight: view.height / view.dpr }; },
      doors: () => targets.map((t) => ({ id: t.id, x: t.door.x, y: t.door.y })),
      route: (x, y) => findPath(player.x, player.y, x, y, walkGrid).map((p) => ({ x: p.x, y: p.y })),
      nearDoor: () => closestTarget()?.id ?? null,
      walkZones: () => TOWN_WALK_ZONES.map((z) => ({ ...z })),
      zone: () => zone,
    };
  }
  raf = requestAnimationFrame(tick);
});
onUnmounted(() => {
  cancelAnimationFrame(raf);
  observer?.disconnect();
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  keys.clear();
  if (debugColliders) delete window.__qqTown;
});

defineExpose({ openEmotes: openWheel, focus: () => canvas.value?.focus({ preventScroll: true }) });
</script>

<template>
  <div class="town-shell">
    <div ref="frame" class="town-frame">
      <canvas
        ref="canvas"
        class="town-canvas"
        tabindex="0"
        aria-label="Walk around your kingdom town. Use WASD or arrow keys, or click the ground to move. Press E near a door or a hero, Z for emotes. Walk north-west through the gap in the trees by the sign to reach the battle camps."
        :class="{ 'focus-ring': focusRing }"
        @pointerdown="onPointerDown"
        @pointermove="onTownPointerMove"
        @pointerup="onTownPointerUp"
        @pointercancel="onTownPointerUp"
        @focus="onCanvasFocus"
        @blur="focusRing = false"
      />
      <div v-if="wheelOpen" class="emote-wheel" :style="{ left: `${wheelPos.x}px`, top: `${wheelPos.y}px` }" role="menu" aria-label="Choose an emote">
        <button
          v-for="(e, i) in EMOTES"
          :key="e.id"
          :ref="(el) => { wheelButtons[i] = el; }"
          class="emote-choice"
          :class="{ active: wheelIndex === i }"
          type="button"
          role="menuitem"
          :aria-label="`${e.label} (${i + 1})`"
          :title="e.label"
          :style="{ '--angle': `${(i / EMOTES.length) * 360 - 90}deg` }"
          @focus="wheelIndex = i"
          @click="chooseEmote(i)"
        ><span aria-hidden="true">{{ e.glyph }}</span><kbd aria-hidden="true">{{ i + 1 }}</kbd></button>
        <button class="emote-cancel" type="button" aria-label="Close emotes" title="Close (Esc)" @click="closeWheel">×</button>
      </div>
      <!-- touch screens: the optional move stick (tap-to-move stays the main control) -->
      <template v-if="touchTown">
        <button class="town-stick-toggle" type="button" :aria-pressed="stickOn ? 'true' : 'false'" :aria-label="stickOn ? 'Hide the move stick' : 'Show a move stick'" data-testid="town-stick-toggle" @click="toggleStick"><span aria-hidden="true">🕹️</span></button>
        <div v-if="stickOn" class="town-stick" aria-hidden="true" data-testid="town-stick" @pointerdown="onStickDown" @pointermove="onStickMove" @pointerup="onStickUp" @pointercancel="onStickUp">
          <span class="town-stick-knob" :style="{ transform: `translate(${stickKnob.x}px, ${stickKnob.y}px)` }"></span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.town-shell { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; background: #2f5e3e; }
.town-frame { position: relative; width: 100%; height: 100%; overflow: hidden; background: #2f5e3e; }
.town-canvas { display: block; width: 100%; height: 100%; outline: none; cursor: crosshair; touch-action: none; }
/* touch: optional move stick (translucent, dark ink outline, no filters) */
.town-stick-toggle { position: absolute; z-index: 3; left: max(10px, env(safe-area-inset-left)); bottom: calc(118px + env(safe-area-inset-bottom)); display: grid; place-items: center; width: 44px; height: 44px; padding: 0; background: rgb(255 248 228 / 88%); border: 2px solid #23382f; border-radius: 50%; box-shadow: 0 3px 0 rgb(35 56 47 / 40%); font-size: 20px; cursor: pointer; }
.town-stick-toggle[aria-pressed="true"] { background: #f2d37f; }
.town-stick { position: absolute; z-index: 3; left: max(14px, env(safe-area-inset-left)); bottom: calc(172px + env(safe-area-inset-bottom)); display: grid; place-items: center; width: 104px; height: 104px; background: rgb(29 51 41 / 30%); border: 2px solid rgb(16 16 24 / 70%); border-radius: 50%; touch-action: none; }
.town-stick-knob { width: 44px; height: 44px; background: rgb(242 186 85 / 80%); border: 2px solid #101018; border-radius: 50%; pointer-events: none; }
@media (orientation: landscape) and (max-height: 520px) {
  .town-stick-toggle { bottom: calc(64px + env(safe-area-inset-bottom)); }
  .town-stick { bottom: calc(64px + env(safe-area-inset-bottom)); left: calc(max(10px, env(safe-area-inset-left)) + 54px); }
}
/* Focus arriving by Tab gets a quiet parchment ring inset from the edge;
   mouse, touch and programmatic focus draw no frame round the scene. */
.town-canvas.focus-ring { outline: 3px dashed rgb(255 248 228 / 80%); outline-offset: -8px; }
.emote-wheel { position: absolute; z-index: 3; width: 0; height: 0; }
.emote-wheel::before { content: ""; position: absolute; left: -78px; top: -78px; width: 156px; height: 156px; border-radius: 50%; background: rgb(35 56 47 / 72%); border: 3px solid #23382f; box-shadow: 0 5px 0 rgb(35 56 47 / 40%); }
.emote-choice { position: absolute; left: -22px; top: -22px; display: grid; place-items: center; width: 44px; height: 44px; padding: 0; color: #23382f; background: #fbf2d8; border: 2px solid #23382f; border-radius: 50%; box-shadow: 0 3px 0 #7a6545; font-size: 22px; cursor: pointer; transform: rotate(var(--angle)) translate(56px) rotate(calc(-1 * var(--angle))); }
.emote-choice kbd { position: absolute; right: -4px; bottom: -4px; min-width: 16px; padding: 0 3px; color: #23382f; background: #f2ba55; border: 1.5px solid #23382f; border-radius: 4px; font: 800 9px/14px ui-monospace, monospace; }
.emote-choice.active, .emote-choice:focus-visible, .emote-choice:hover { background: #f2ba55; outline: 3px solid #fff8e4; outline-offset: 1px; }
.emote-cancel { position: absolute; left: -16px; top: -16px; width: 32px; height: 32px; padding: 0; color: #fff8e4; background: #254937; border: 2px solid #fff8e4; border-radius: 50%; font-size: 20px; line-height: 1; cursor: pointer; }
.emote-cancel:focus-visible, .emote-cancel:hover { outline: 3px solid #f2ba55; outline-offset: 2px; }
@media (prefers-reduced-motion: no-preference) { .emote-wheel { animation: wheel-pop .14s ease-out; } }
@keyframes wheel-pop { from { transform: scale(.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
</style>
