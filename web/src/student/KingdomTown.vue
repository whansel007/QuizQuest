<script setup>
// ============================================================
// STUDENT: the walkable kingdom town canvas
// Castle plaza in the centre, one building at each compass point, a
// forest edge with a gap in the north tree line, and beyond it the
// clearing where the Duel and Campfire Run camps wait. The camera
// stays on the town until the player walks through the gap, then
// pans smoothly north (and back).
// ============================================================
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { loadOwnedHeroVisuals, loadPlayerVisuals, tintedPlayerFrames } from './avatar.js';
import {
  INK, drawBarterCorner, drawBuilding, drawCampfireCamp, drawCastle, drawDuelCamp, drawFlame, drawFlowers,
  drawHouse, drawRock, drawTrailSign, drawTree, drawWell,
} from './kingdom/town-art.js';
import { EMOTES, heroLine } from './kingdom/town-voices.js';
import { AVATAR_COSMETIC_BY_ID } from '../../../config/avatar-cosmetics.js';
import { playSound, setAudioOptions, warmUpAudio } from '../../../public/hero-lab/arena-audio.js';
import {
  BUILDING_LAYOUT, TOWN_AVATAR_RADIUS, TOWN_DESTINATIONS, TOWN_DOOR_RADIUS, TOWN_GRASS_COLOR, TOWN_GREET_RADIUS,
  TOWN_HEIGHT, TOWN_HERO_AVATAR_RADIUS, TOWN_HERO_HOP_HEIGHT, TOWN_HERO_HOPS_PER_SECOND,
  TOWN_HERO_REDUCED_MOTION_HOP_HEIGHT, TOWN_HERO_REDUCED_MOTION_PAUSE_MAX_MS, TOWN_HERO_REDUCED_MOTION_PAUSE_MIN_MS,
  TOWN_HERO_WANDER_PAUSE_MAX_MS, TOWN_HERO_WANDER_PAUSE_MIN_MS, TOWN_HERO_WALK_SPEED, TOWN_MAX_HEROES,
  TOWN_NORTH_HEIGHT, TOWN_PATH_WIDTH, TOWN_PLAZA, TOWN_PROP_LAYOUT, TOWN_ROADS, TOWN_TILE_SIZE, TOWN_TRAILS,
  TOWN_TRAIL_WIDTH, TOWN_WALK_SPEED, TOWN_WALK_ZONES, TOWN_WIDTH,
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

const WORLD_TOP = -TOWN_NORTH_HEIGHT;
const WORLD_HEIGHT = TOWN_HEIGHT + TOWN_NORTH_HEIGHT;
const ZONES = {
  town: { x: 0, y: 0, w: TOWN_WIDTH, h: TOWN_HEIGHT },
  north: { x: 0, y: WORLD_TOP, w: TOWN_WIDTH, h: TOWN_NORTH_HEIGHT },
};
const ART_RES = 2; // object art is drawn at 2x so it stays crisp when scaled up
const PALETTE = {
  grass: TOWN_GRASS_COLOR, clearing: '#76A853', road: '#D8C392', roadEdge: '#9A8052',
  plaza: '#E2D1A4', plazaEdge: '#9A8052', trail: '#C9A66B', trailEdge: '#94743F',
  paper: '#FBF2D8', gold: '#F2BA55', forest: '#2F5E3E',
};
const NAMES = { castle: 'Castle', duel: 'Duel', campfire: 'Campfire Run' };

// ---- map data --------------------------------------------------------------

const buildings = Object.entries(BUILDING_LAYOUT).map(([id, layout]) => ({ id, kind: 'building', ...layout }));
const destinations = Object.entries(TOWN_DESTINATIONS).map(([id, layout]) => ({ id, kind: 'destination', ...layout }));
const targets = [...buildings, ...destinations];
const mapProps = TOWN_PROP_LAYOUT.map((p, index) => ({ ...p, id: `prop-${index}` }));

let seed = 0x2f61;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };

// A decorative ring of trees frames the town and the clearing; they sit
// outside the walk zones, so they need no hitbox.
function makeEdgeTrees() {
  const trees = [];
  const add = (cx, baseY, kind) => {
    // a few fixed sizes, so the trees share a handful of cached drawings
    const size = Math.floor(random() * 3);
    const w = (kind === 'pine' ? 56 : 62) + size * 7;
    const h = (kind === 'pine' ? 96 : 92) + size * 8;
    trees.push({ id: `edge-${trees.length}`, type: 'tree', kind, x: cx - w / 2, y: baseY - h, w, h, decorative: true });
  };
  for (let x = -20; x <= TOWN_WIDTH + 20; x += 52) {
    if (x > 690 && x < 800) continue; // the gap in the north tree line
    add(x + random() * 10, 36 + random() * 4, random() < 0.5 ? 'pine' : 'round');
    add(x + 20 + random() * 10, TOWN_HEIGHT + 34 + random() * 6, random() < 0.4 ? 'pine' : 'round');
    add(x + random() * 10, WORLD_TOP + 118 + random() * 6, 'pine');
  }
  for (let y = WORLD_TOP + 150; y <= TOWN_HEIGHT + 20; y += 48) {
    const inClearing = y < 0;
    add(inClearing ? 120 + random() * 10 : 4 + random() * 8, y, random() < 0.6 ? 'pine' : 'round');
    add(inClearing ? 1160 - random() * 10 : 1276 - random() * 8, y + 20, random() < 0.6 ? 'pine' : 'round');
    if (inClearing) {
      add(40 + random() * 20, y + 10, 'pine');
      add(1240 - random() * 20, y + 30, 'pine');
    }
  }
  return trees;
}
const edgeTrees = makeEdgeTrees();

const footprintRect = (o) => ({ type: 'rect', x: o.x, y: o.y, w: o.w, h: o.h });
const obstacles = [
  ...targets.map(footprintRect),
  ...mapProps.filter((p) => p.type !== 'flowers').map((p) => {
    // Trees are solid at the trunk; the canopy can overlap the walking space.
    if (p.type === 'tree') return { type: 'rect', x: p.x + p.w * 0.38, y: p.y + p.h * 0.72, w: p.w * 0.24, h: p.h * 0.26 };
    if (p.type === 'rock') return { type: 'circle', x: p.x + p.w / 2, y: p.y + p.h * 0.6, r: Math.max(p.w, p.h) * 0.36 };
    if (p.type === 'sign') return { type: 'circle', x: p.x + p.w / 2, y: p.y + p.h - 4, r: 7 };
    return footprintRect(p);
  }),
];

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
const player = { x: 690, y: 446, facing: -1, path: [], waypoint: 0, moving: false };
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

function offscreen(width, height) {
  const result = document.createElement('canvas');
  result.width = Math.ceil(width);
  result.height = Math.ceil(height);
  return result;
}

function strokeLine(g, points, width, color) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

function createForestPattern() {
  const tile = offscreen(180, 180);
  const g = tile.getContext('2d');
  g.fillStyle = PALETTE.forest;
  g.fillRect(0, 0, 180, 180);
  const greens = ['#284F35', '#356640', '#3E7349'];
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 26; i += 1) {
    const x = r() * 180; const y = r() * 180; const rad = 16 + r() * 18;
    g.fillStyle = greens[i % greens.length];
    for (const [ox, oy] of [[0, 0], [180, 0], [-180, 0], [0, 180], [0, -180]]) {
      g.beginPath(); g.arc(x + ox, y + oy, rad, 0, Math.PI * 2); g.fill();
    }
  }
  return ctx.createPattern(tile, 'repeat');
}

function createGroundLayer() {
  const layer = offscreen(TOWN_WIDTH, WORLD_HEIGHT);
  const g = layer.getContext('2d');
  g.translate(0, -WORLD_TOP);
  g.fillStyle = PALETTE.grass;
  g.fillRect(0, 0, TOWN_WIDTH, TOWN_HEIGHT);
  g.fillStyle = PALETTE.clearing;
  g.fillRect(0, WORLD_TOP, TOWN_WIDTH, TOWN_NORTH_HEIGHT);
  // A light scattering of tiny grass tufts gives the lawn texture without
  // making the walkable paths busy. The fixed seed keeps the map calm.
  let grassSeed = 0x51a7;
  const grassRandom = () => { grassSeed = (grassSeed * 1664525 + 1013904223) >>> 0; return grassSeed / 0x100000000; };
  const bladeColors = ['#5F984C', '#6EA451', '#A2C66B', '#B4CC70'];
  for (let tuft = 0; tuft < 620; tuft += 1) {
    const x = 8 + grassRandom() * (TOWN_WIDTH - 16);
    const y = WORLD_TOP + 8 + grassRandom() * (WORLD_HEIGHT - 16);
    const bladeCount = 2 + Math.floor(grassRandom() * 3);
    g.globalAlpha = 0.28 + grassRandom() * 0.26;
    for (let blade = 0; blade < bladeCount; blade += 1) {
      const bx = x + (blade - (bladeCount - 1) / 2) * 3.1;
      const lean = (grassRandom() - 0.5) * 4;
      const height = 3 + grassRandom() * 4;
      g.fillStyle = bladeColors[Math.floor(grassRandom() * bladeColors.length)];
      g.beginPath();
      g.moveTo(bx - 1.7, y + 1.5);
      g.lineTo(bx + lean, y - height);
      g.lineTo(bx + 1.7, y + 1.5);
      g.closePath();
      g.fill();
    }
  }
  g.globalAlpha = 1;

  // Packed-earth trail north, then stone roads, then the castle plaza on top
  // so every road meets the plaza cleanly.
  for (const line of TOWN_TRAILS) strokeLine(g, line, TOWN_TRAIL_WIDTH + 6, PALETTE.trailEdge);
  for (const line of TOWN_TRAILS) strokeLine(g, line, TOWN_TRAIL_WIDTH, PALETTE.trail);
  g.setLineDash([3, 14]);
  for (const line of TOWN_TRAILS) strokeLine(g, line, 3, 'rgba(111,82,45,.35)');
  g.setLineDash([]);
  for (const line of TOWN_ROADS) strokeLine(g, line, TOWN_PATH_WIDTH + 8, PALETTE.roadEdge);
  for (const line of TOWN_ROADS) strokeLine(g, line, TOWN_PATH_WIDTH, PALETTE.road);
  const p = TOWN_PLAZA;
  g.fillStyle = PALETTE.plazaEdge;
  g.beginPath(); g.roundRect(p.x - 4, p.y - 4, p.w + 8, p.h + 8, 22); g.fill();
  g.fillStyle = PALETTE.plaza;
  g.beginPath(); g.roundRect(p.x, p.y, p.w, p.h, 18); g.fill();
  // quiet cobbles on the plaza and roads
  g.strokeStyle = 'rgba(111,91,59,.18)';
  g.lineWidth = 2;
  for (let y = p.y + 16; y < p.y + p.h - 8; y += 22) {
    for (let x = p.x + 12 + ((y / 22) % 2) * 14; x < p.x + p.w - 16; x += 28) {
      g.beginPath(); g.roundRect(x, y, 20, 13, 5); g.stroke();
    }
  }
  for (const line of TOWN_ROADS) {
    line.slice(1).forEach((point, i) => {
      const [ax, ay] = line[i];
      const length = Math.hypot(point[0] - ax, point[1] - ay);
      const nx = -(point[1] - ay) / length; const ny = (point[0] - ax) / length;
      for (let d = 18; d < length - 6; d += 30) {
        const cx = ax + (point[0] - ax) * d / length; const cy = ay + (point[1] - ay) * d / length;
        g.beginPath(); g.moveTo(cx - nx * TOWN_PATH_WIDTH / 2, cy - ny * TOWN_PATH_WIDTH / 2); g.lineTo(cx + nx * TOWN_PATH_WIDTH / 2, cy + ny * TOWN_PATH_WIDTH / 2); g.stroke();
      }
    });
  }
  return layer;
}

function artFor(key, w, h, draw) {
  if (artCache.has(key)) return artCache.get(key);
  const layer = offscreen(w * ART_RES, h * ART_RES);
  const g = layer.getContext('2d');
  g.scale(ART_RES, ART_RES);
  draw(g);
  artCache.set(key, layer);
  return layer;
}

// How far down the canvas the drawing actually starts (its first solid row),
// so prompts and upgrade arrows sit just above the building, not above the
// empty top of a tall canvas. The faint plan under level-0 scaffolding is
// ignored, so there they sit on the scaffolding. Measured once per drawing.
const artTops = new WeakMap();
function drawnTop(art) {
  if (artTops.has(art)) return artTops.get(art);
  let top = 0;
  try {
    const { data, width, height } = art.getContext('2d').getImageData(0, 0, art.width, art.height);
    top = height;
    for (let y = 0; y < height && top === height; y += 1) {
      for (let x = 3; x < width * 4; x += 16) if (data[y * width * 4 + x] > 160) { top = y; break; }
    }
  } catch { top = 0; }
  const result = top / ART_RES;
  artTops.set(art, result);
  return result;
}
// world y of each building's drawn top, refreshed whenever its art changes
const buildingTops = {};

function placeArt(object, art, aw, ah) {
  // the drawing's ground line (8px above its bottom) sits on the footprint's front edge
  const x = object.x + object.w / 2 - aw / 2;
  const y = object.y + object.h + 8 - ah;
  buildingTops[object.id] = y + drawnTop(art);
  return { id: object.id, canvas: art, x, y, w: aw, h: ah, sortY: object.y + object.h };
}

function makeObjectCanvases() {
  const list = [];
  for (const b of buildings) {
    const level = levelOf(b.id);
    const { w, h } = b.art;
    const art = artFor(`${b.id}:${level}`, w, h, (g) => (b.id === 'castle' ? drawCastle(g, level, w, h) : drawBuilding(g, b.id, level, w, h, b.w)));
    list.push(placeArt(b, art, w, h));
  }
  for (const d of destinations) {
    const { w, h } = d.art;
    const art = artFor(`camp:${d.id}`, w, h, (g) => (d.id === 'duel' ? drawDuelCamp(g, w, h) : drawCampfireCamp(g, w, h)));
    list.push(placeArt(d, art, w, h));
  }
  for (const p of mapProps) {
    let item;
    if (p.type === 'house') item = placeArt(p, artFor(`house:${p.variant}`, 84, 92, (g) => drawHouse(g, p.variant, 84, 92)), 84, 92);
    else if (p.type === 'well') item = placeArt(p, artFor('well', 60, 70, (g) => drawWell(g, 60, 70)), 60, 70);
    else if (p.type === 'barter') item = placeArt(p, artFor('barter', 96, 80, (g) => drawBarterCorner(g, 96, 80)), 96, 80);
    else if (p.type === 'sign') item = placeArt(p, artFor('sign', 70, 90, (g) => drawTrailSign(g, 70, 90)), 70, 90);
    else {
      const draw = p.type === 'tree' ? (g) => drawTree(g, p.w, p.h) : p.type === 'rock' ? (g) => drawRock(g, p.w, p.h) : (g) => drawFlowers(g, p.w, p.h);
      const art = artFor(`${p.type}:${p.w}x${p.h}`, p.w, p.h, draw);
      item = { id: p.id, canvas: art, x: p.x, y: p.y, w: p.w, h: p.h, sortY: p.type === 'flowers' ? p.y : p.y + p.h };
    }
    list.push(item);
  }
  for (const t of edgeTrees) {
    const w = Math.round(t.w); const h = Math.round(t.h);
    const art = artFor(`edge:${t.kind}:${w}x${h}`, w, h, (g) => drawTree(g, w, h, t.kind));
    list.push({ id: t.id, canvas: art, x: t.x, y: t.y, w, h, sortY: t.y + t.h });
  }
  objectCanvases = list;
}

// ---- collision and paths ---------------------------------------------------

function circleHitsRect(x, y, r, rect) {
  const nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  return ((x - nx) ** 2 + (y - ny) ** 2) < r ** 2;
}
const inZone = (x, y, z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;

function canStand(x, y, radius = TOWN_AVATAR_RADIUS) {
  if (!TOWN_WALK_ZONES.some((z) => inZone(x, y, z))) return false;
  // keep the hitbox to the sprite's ground footprint: a flat ellipse at the feet
  const r = radius * 0.8;
  for (const obstacle of obstacles) {
    if (obstacle.type === 'rect' ? circleHitsRect(x, y, r, obstacle) : Math.hypot(x - obstacle.x, y - obstacle.y) < r + obstacle.r) return false;
  }
  return true;
}

// Heroes keep to the town grass, away from doors; they may cross a road.
function canWanderStand(x, y) {
  if (!inZone(x, y, TOWN_WALK_ZONES[0]) || !canStand(x, y, TOWN_HERO_AVATAR_RADIUS)) return false;
  return targets.every((t) => Math.hypot(x - t.door.x, y - t.door.y) >= 34);
}

function buildGrid(canWalk) {
  const cols = Math.floor(TOWN_WIDTH / TOWN_TILE_SIZE);
  const rows = Math.floor(WORLD_HEIGHT / TOWN_TILE_SIZE);
  const blocked = new Uint8Array(cols * rows);
  for (let i = 0; i < blocked.length; i += 1) {
    const x = (i % cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2;
    const y = WORLD_TOP + Math.floor(i / cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2;
    blocked[i] = canWalk(x, y) ? 0 : 1;
  }
  return { cols, rows, blocked, canWalk };
}

function nearestWalkableCell(index, grid) {
  const { cols, rows, blocked } = grid;
  if (index >= 0 && index < blocked.length && !blocked[index]) return index;
  const cx = index % cols;
  const cy = Math.floor(index / cols);
  for (let radius = 1; radius < 6; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = cx + dx; const y = cy + dy;
        const candidate = y * cols + x;
        if (x >= 0 && x < cols && y >= 0 && y < rows && !blocked[candidate]) return candidate;
      }
    }
  }
  return -1;
}

const cellOf = (x, y, cols) => Math.floor((y - WORLD_TOP) / TOWN_TILE_SIZE) * cols + Math.floor(x / TOWN_TILE_SIZE);
const cellCentre = (i, cols) => ({ x: (i % cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2, y: WORLD_TOP + Math.floor(i / cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2 });

function findPath(startX, startY, targetX, targetY, grid) {
  const { cols, rows, blocked } = grid;
  const size = cols * rows;
  const start = nearestWalkableCell(cellOf(startX, startY, cols), grid);
  const goal = nearestWalkableCell(cellOf(targetX, targetY, cols), grid);
  if (start < 0 || goal < 0) return [];
  const prev = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  let head = 0; let tail = 0;
  queue[tail++] = start;
  prev[start] = start;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (head < tail && prev[goal] === -1) {
    const at = queue[head++];
    const x = at % cols; const y = Math.floor(at / cols);
    for (const [dx, dy] of dirs) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const next = ny * cols + nx;
      if (blocked[next] || prev[next] !== -1) continue;
      if (dx && dy && (blocked[y * cols + nx] || blocked[ny * cols + x])) continue;
      prev[next] = at;
      queue[tail++] = next;
    }
  }
  if (prev[goal] === -1) return [];
  const route = [];
  for (let at = goal; at !== start; at = prev[at]) route.push(cellCentre(at, cols));
  route.reverse();
  route.push(grid.canWalk(targetX, targetY) ? { x: targetX, y: targetY } : cellCentre(goal, cols));
  return route;
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

function onPointerDown(event) {
  warmUpAudio();
  canvas.value?.focus({ preventScroll: true });
  if (props.paused) return;
  closeWheel();
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
  if (el instanceof HTMLElement && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
  if (props.paused) return;
  const key = event.key.toLowerCase();
  if (wheelOpen.value) { onWheelKey(event, key); return; }
  // let a focused button keep Enter/Space for itself
  if (el instanceof HTMLElement && el.tagName === 'BUTTON' && (key === 'enter' || key === ' ')) return;
  warmUpAudio();
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
  const box = clampBubble(hero.x - width / 2, tipY - height - 8, width, height);
  g.fillStyle = PALETTE.paper; g.strokeStyle = INK; g.lineWidth = 2.5;
  g.beginPath(); g.roundRect(box.x, box.y, width, height, 9); g.fill(); g.stroke();
  const tipX = Math.max(box.x + 12, Math.min(box.x + width - 12, hero.x));
  if (box.y + height <= tipY) {
    g.beginPath(); g.moveTo(tipX - 6, box.y + height - 1); g.lineTo(tipX, box.y + height + 7); g.lineTo(tipX + 6, box.y + height - 1); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(tipX - 6, box.y + height); g.lineTo(tipX, box.y + height + 7); g.lineTo(tipX + 6, box.y + height); g.stroke();
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

function drawAvatarHat(g, x, y, radius) {
  const cosmetic = AVATAR_COSMETIC_BY_ID[props.avatarVisual?.hat];
  if (!cosmetic || cosmetic.slot !== 'hat') return;
  g.save();
  g.font = Math.round(radius * 1.35) + 'px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(cosmetic.renderValue, x, y);
  g.restore();
}

function drawAvatarAccessory(g, x, y, radius) {
  const cosmetic = AVATAR_COSMETIC_BY_ID[props.avatarVisual?.accessory];
  if (!cosmetic || cosmetic.slot !== 'accessory' || cosmetic.anchor !== 'badge') return;
  g.save();
  g.fillStyle = '#fff8e4';
  g.strokeStyle = INK;
  g.lineWidth = 1.5;
  g.beginPath(); g.arc(x, y, radius * .72, 0, Math.PI * 2); g.fill(); g.stroke();
  g.font = Math.round(radius * .94) + 'px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(cosmetic.renderValue, x, y + 1);
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
    drawAvatarHat(g, player.x, player.y - hop - spriteHeight * 0.82, r);
    drawAvatarAccessory(g, player.x + r * .7, player.y - hop - r * 1.15, r);
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
  drawAvatarHat(g, player.x, player.y - hop - r * 1.35, r);
  drawAvatarAccessory(g, player.x + r * .7, player.y - hop - r * .58, r);
}

function drawEmote(g, time) {
  if (!emote || time > emote.until) { emote = null; return; }
  const age = time - emote.start;
  const pop = reducedMotion ? 1 : Math.min(1, age / 160) * (1 + 0.15 * Math.max(0, 1 - age / 320));
  const fade = Math.min(1, (emote.until - time) / 300);
  const x = player.x; const y = player.y - TOWN_AVATAR_RADIUS * 3.2 - 26;
  g.save();
  g.globalAlpha = fade;
  g.translate(x, y); g.scale(pop, pop);
  g.fillStyle = PALETTE.paper; g.strokeStyle = INK; g.lineWidth = 2.5;
  g.beginPath(); g.arc(0, 0, 21, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(-6, 18); g.lineTo(0, 28); g.lineTo(6, 18); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = PALETTE.paper; g.fillRect(-7, 14, 14, 6);
  g.font = '24px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
  g.fillText(emote.glyph, 0, 1);
  g.restore();
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
  if (props.highlight === 'buildings') for (const id of ['garden', 'tower', 'library', 'workshop']) {
    const b = BUILDING_LAYOUT[id];
    rings.push([b.x + b.w / 2, b.y + b.h / 2, b.w / 2 + 26, b.h / 2 + 26]);
  }
  if (props.highlight === 'north') rings.push([772, 72, 72, 52]);
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
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = frame.value.getBoundingClientRect();
  canvas.value.width = Math.round(rect.width * dpr);
  canvas.value.height = Math.round(rect.height * dpr);
  ctx = canvas.value.getContext('2d', { alpha: false });
  const fit = Math.min(rect.width / TOWN_WIDTH, rect.height / TOWN_HEIGHT);
  const readable = Math.min(rect.height / TOWN_HEIGHT, rect.width / 520);
  Object.assign(view, { dpr, scale: Math.max(fit, readable) * dpr, width: canvas.value.width, height: canvas.value.height });
  forestPattern = createForestPattern();
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
  resize();
  makeObjectCanvases();
  observer = new ResizeObserver(resize);
  observer.observe(frame.value);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  raf = requestAnimationFrame(tick);
});
onUnmounted(() => {
  cancelAnimationFrame(raf);
  observer?.disconnect();
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
  window.removeEventListener('blur', onBlur);
  keys.clear();
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
        aria-label="Walk around your kingdom town. Use WASD or arrow keys, or click the ground to move. Press E near a door or a hero, Z for emotes. Walk north through the gap in the trees to reach the battle camps."
        @pointerdown="onPointerDown"
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
    </div>
  </div>
</template>

<style scoped>
.town-shell { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; background: #2f5e3e; }
.town-frame { position: relative; width: 100%; height: 100%; overflow: hidden; background: #2f5e3e; }
.town-canvas { display: block; width: 100%; height: 100%; outline: none; cursor: crosshair; touch-action: none; }
.town-canvas:focus-visible { outline: 4px solid #f2ba55; outline-offset: -6px; }
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
