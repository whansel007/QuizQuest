// ============================================================
// Kingdom town scene: the map layout and the shared static layers
// (forest pattern, ground with roads and trails, placed building and
// prop drawings). The walkable KingdomTown and the sign-in showcase
// both draw the town from here, so they always show the same place.
// ============================================================
import {
  BUILDING_LAYOUT, TOWN_DESTINATIONS, TOWN_GRASS_COLOR, TOWN_HEIGHT, TOWN_NORTH_HEIGHT, TOWN_PATH_WIDTH,
  TOWN_PLAZA, TOWN_PROP_LAYOUT, TOWN_ROADS, TOWN_TRAIL_WIDTH, TOWN_WIDTH,
} from '../../../../config/tuning.js';
import {
  drawBarterCorner, drawBuilding, drawCampfireCamp, drawCastle, drawDuelCamp, drawFlowers, drawHouse, drawRock,
  drawTrailSign, drawTree, drawWell,
} from './town-art.js';

export const WORLD_TOP = -TOWN_NORTH_HEIGHT;
export const WORLD_HEIGHT = TOWN_HEIGHT + TOWN_NORTH_HEIGHT;
// Object art is drawn at 2x so it stays crisp when scaled up.
export const ART_RES = 2;
// Extra canvas height above every building and the castle. The tuning art
// sizes fit the first stages; flags, antennae, floating books and the
// observatory of fully upgraded buildings rise above them.
export const ART_HEADROOM = 48;
// The town camera frames a little forest above the north tree line, so the
// tallest upgrade on the northern row (the Garden observatory) is never
// cut by the top edge of the view.
export const TOWN_VIEW_TOP = -44;
export const PALETTE = {
  grass: TOWN_GRASS_COLOR, clearing: '#76A853', road: '#D8C392', roadEdge: '#9A8052',
  plaza: '#E2D1A4', plazaEdge: '#9A8052', trail: '#C9A66B', trailEdge: '#94743F',
  paper: '#FBF2D8', gold: '#F2BA55', forest: '#2F5E3E',
};

// ---- map layout --------------------------------------------------------------

// The way out of town is a gap in the north tree line on the west side,
// above the Library road and close to the Duel camp, well away from the
// Campfire Run on the east of the clearing. A trail leaves the plaza's west
// edge, climbs through the gap and forks: a short spur to the Duel, a long
// path across the clearing to the Campfire Run.
export const TOWN_GAP = { x: 386, w: 48 };
const GAP_X = TOWN_GAP.x + TOWN_GAP.w / 2;
export const TOWN_TRAILS = [
  [[512, 330], [GAP_X, 330], [GAP_X, -232]],
  [[GAP_X, -232], [430, -296]],
  [[GAP_X, -232], [640, -214], [860, -250], [1010, -294]],
];
// Walkable zones: the town, the gap in the northern tree line, the clearing.
export const TOWN_WALK_ZONES = [
  { x: 28, y: 40, w: 1224, h: 662 },
  { x: TOWN_GAP.x, y: -70, w: TOWN_GAP.w, h: 120 },
  { x: 150, y: -600, w: 980, h: 560 },
];
// The BATTLES sign stands beside the gap, in place of the corner tree.
const NORTH_SIGN = { x: 436, y: 150 };
export const TOWN_SIGN_SPOT = { x: NORTH_SIGN.x + 32, y: NORTH_SIGN.y };
export const TOWN_MAP_PROPS = TOWN_PROP_LAYOUT
  .filter((p) => !(p.type === 'tree' && p.x === 432 && p.y === 140))
  .map((p) => (p.type === 'sign' ? { ...p, ...NORTH_SIGN } : p));

export const TOWN_BUILDINGS = Object.entries(BUILDING_LAYOUT).map(([id, layout]) => ({ id, kind: 'building', ...layout }));
export const TOWN_CAMPS = Object.entries(TOWN_DESTINATIONS).map(([id, layout]) => ({ id, kind: 'destination', ...layout }));

// A decorative ring of trees frames the town and the clearing; they sit
// outside the walk zones, so they need no hitbox. Seeded, so every view of
// the town grows the same forest.
export function makeEdgeTrees() {
  let seed = 0x2f61;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  const trees = [];
  const add = (cx, baseY, kind) => {
    // a few fixed sizes, so the trees share a handful of cached drawings
    const size = Math.floor(random() * 3);
    const w = (kind === 'pine' ? 56 : 62) + size * 7;
    const h = (kind === 'pine' ? 96 : 92) + size * 8;
    trees.push({ id: `edge-${trees.length}`, type: 'tree', kind, x: cx - w / 2, y: baseY - h, w, h, decorative: true });
  };
  for (let x = -20; x <= TOWN_WIDTH + 20; x += 52) {
    const inGap = x > GAP_X - 50 && x < GAP_X + 50; // the gap in the north tree line
    const northX = x + random() * 10; const northY = 36 + random() * 4; const northKind = random() < 0.5 ? 'pine' : 'round';
    if (!inGap) add(northX, northY, northKind);
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

// ---- static layers -----------------------------------------------------------

export function offscreen(width, height) {
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

export function createForestPattern(ctx) {
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

// The lawn, clearing, trails, roads and plaza, drawn once. The layer's
// top-left is world (0, WORLD_TOP).
export function createGroundLayer() {
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

// ---- placed object drawings ----------------------------------------------------

// How far down the canvas the drawing actually starts (its first solid row),
// so prompts and upgrade arrows sit just above the building, not above the
// empty top of a tall canvas. The faint plan under level-0 scaffolding is
// ignored, so there they sit on the scaffolding. Measured once per drawing.
const artTops = new WeakMap();
export function drawnTop(art) {
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

function artFor(cache, key, w, h, draw) {
  if (cache.has(key)) return cache.get(key);
  const layer = offscreen(w * ART_RES, h * ART_RES);
  const g = layer.getContext('2d');
  g.scale(ART_RES, ART_RES);
  draw(g);
  cache.set(key, layer);
  return layer;
}

// The drawing's ground line (8px above its bottom) sits on the footprint's
// front edge; `top` is the world y of the first drawn row.
function placeArt(object, art, aw, ah) {
  const x = object.x + object.w / 2 - aw / 2;
  const y = object.y + object.h + 8 - ah;
  return { id: object.id, canvas: art, x, y, w: aw, h: ah, sortY: object.y + object.h, top: y + drawnTop(art) };
}

// Every static drawing in the town, placed in world space and ready to sort
// by sortY with the moving characters. `levelOf(id)` gives each building's
// and the castle's level; `cache` (a Map) keeps drawings between calls.
export function buildTownObjects(levelOf, cache = new Map(), edgeTrees = makeEdgeTrees()) {
  const list = [];
  for (const b of TOWN_BUILDINGS) {
    const level = levelOf(b.id);
    const w = b.art.w; const h = b.art.h + ART_HEADROOM;
    const art = artFor(cache, `${b.id}:${level}`, w, h, (g) => (b.id === 'castle' ? drawCastle(g, level, w, h) : drawBuilding(g, b.id, level, w, h, b.w)));
    list.push(placeArt(b, art, w, h));
  }
  for (const d of TOWN_CAMPS) {
    const { w, h } = d.art;
    const art = artFor(cache, `camp:${d.id}`, w, h, (g) => (d.id === 'duel' ? drawDuelCamp(g, w, h) : drawCampfireCamp(g, w, h)));
    list.push(placeArt(d, art, w, h));
  }
  TOWN_MAP_PROPS.forEach((p, index) => {
    const id = `prop-${index}`;
    let item;
    if (p.type === 'house') item = placeArt({ ...p, id }, artFor(cache, `house:${p.variant}`, 84, 92, (g) => drawHouse(g, p.variant, 84, 92)), 84, 92);
    else if (p.type === 'well') item = placeArt({ ...p, id }, artFor(cache, 'well', 60, 70, (g) => drawWell(g, 60, 70)), 60, 70);
    else if (p.type === 'barter') item = placeArt({ ...p, id }, artFor(cache, 'barter', 96, 80, (g) => drawBarterCorner(g, 96, 80)), 96, 80);
    else if (p.type === 'sign') item = placeArt({ ...p, id }, artFor(cache, 'sign', 70, 90, (g) => drawTrailSign(g, 70, 90)), 70, 90);
    else {
      const draw = p.type === 'tree' ? (g) => drawTree(g, p.w, p.h) : p.type === 'rock' ? (g) => drawRock(g, p.w, p.h) : (g) => drawFlowers(g, p.w, p.h);
      const art = artFor(cache, `${p.type}:${p.w}x${p.h}`, p.w, p.h, draw);
      item = { id, canvas: art, x: p.x, y: p.y, w: p.w, h: p.h, sortY: p.type === 'flowers' ? p.y : p.y + p.h };
    }
    list.push(item);
  });
  for (const t of edgeTrees) {
    const w = Math.round(t.w); const h = Math.round(t.h);
    const art = artFor(cache, `edge:${t.kind}:${w}x${h}`, w, h, (g) => drawTree(g, w, h, t.kind));
    list.push({ id: t.id, canvas: art, x: t.x, y: t.y, w, h, sortY: t.y + t.h });
  }
  return list;
}
