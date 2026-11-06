// Kingdom town collision and reachability (docs/mobile/fixes/F2.md).
//
// Runs breadth-first search on the REAL walk grid (the colliders and the walk
// zones KingdomTown.vue walks with) from the spawn point, and checks that every
// door, every path tile and every tile of open-looking ground can be reached,
// and that props only block the base of their drawing.
import { describe, expect, it } from 'vitest';
import {
  TOWN_AVATAR_RADIUS, TOWN_PATH_WIDTH, TOWN_PLAZA, TOWN_PROP_COLLIDER_RATIOS, TOWN_ROADS, TOWN_TILE_SIZE, TOWN_TRAIL_WIDTH,
  TOWN_WIDTH,
} from '../../../../../config/tuning.js';
import {
  ART_HEADROOM, TOWN_BUILDINGS, TOWN_CAMPS, TOWN_GAP, TOWN_MAP_PROPS, TOWN_SIGN_SPOT, TOWN_TRAILS, TOWN_WALK_ZONES,
  WORLD_HEIGHT, WORLD_TOP, makeEdgeTrees,
} from '../town-scene.js';
import {
  TOWN_FOOTPRINT_SCALE, TOWN_SPAWN, canStandAt, cellCentre, cellOf, circleHitsRect, makeTownObstacles, makeWalkGrid,
  nearestWalkableCell, propCollider, searchFrom,
} from '../town-collision.js';

const obstacles = makeTownObstacles();
const grid = makeWalkGrid(obstacles);
const { cols, rows, blocked } = grid;
const footprint = TOWN_AVATAR_RADIUS * TOWN_FOOTPRINT_SCALE;
const spawnCell = cellOf(TOWN_SPAWN.x, TOWN_SPAWN.y, cols);
const reach = searchFrom(spawnCell, grid);
const reachable = (cell) => reach[cell] !== -1;
const fmt = ({ x, y }) => `(${x}, ${y})`;

// ---- what the town LOOKS like, independent of the walk zones ------------------

// Where each drawing is placed (kingdom/town-scene.js placeArt / buildTownObjects).
const ART_SIZE = { house: [84, 92], well: [60, 70], barter: [96, 80], sign: [70, 90] };
const placed = (o, aw, ah) => ({ x: o.x + o.w / 2 - aw / 2, y: o.y + o.h + 8 - ah, w: aw, h: ah });
const drawings = [
  ...TOWN_BUILDINGS.map((b) => placed(b, b.art.w, b.art.h + ART_HEADROOM)),
  ...TOWN_CAMPS.map((d) => placed(d, d.art.w, d.art.h)),
  ...TOWN_MAP_PROPS.filter((p) => p.type !== 'flowers').map((p) => (ART_SIZE[p.type] ? placed(p, ...ART_SIZE[p.type]) : { x: p.x, y: p.y, w: p.w, h: p.h })),
];
const forest = makeEdgeTrees();
const inBox = (x, y, b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax; const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// A drawn road, trail or the plaza under this point.
function onPath(x, y) {
  if (inBox(x, y, TOWN_PLAZA)) return true;
  const lanes = [...TOWN_ROADS.map((line) => [line, TOWN_PATH_WIDTH]), ...TOWN_TRAILS.map((line) => [line, TOWN_TRAIL_WIDTH])];
  return lanes.some(([line, width]) => line.slice(1).some((point, i) => distanceToSegment(x, y, line[i], point) < width / 2));
}
// The avatar's footprint at (x, y) would touch a collider.
const touchesCollider = (x, y) => obstacles.some((o) => (o.type === 'rect' ? circleHitsRect(x, y, footprint, o) : Math.hypot(x - o.x, y - o.y) < footprint + o.r));
// Visible open ground: not under the forest ring or a drawing, and the avatar fits.
const looksOpen = (x, y) => !forest.some((t) => inBox(x, y, t)) && !drawings.some((d) => inBox(x, y, d)) && !touchesCollider(x, y);

// The open ground a player would see as one connected area with the spawn
// (4-neighbour flood fill over open-looking cells, ignoring the walk zones).
function visibleArea() {
  const seen = new Uint8Array(cols * rows);
  const open = (i) => { const c = cellCentre(i, cols); return looksOpen(c.x, c.y) || onPath(c.x, c.y) && !touchesCollider(c.x, c.y); };
  const queue = [spawnCell];
  seen[spawnCell] = 1;
  while (queue.length) {
    const at = queue.pop();
    const x = at % cols; const y = Math.floor(at / cols);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const next = ny * cols + nx;
      if (seen[next] || !open(next)) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return [...seen.keys()].filter((i) => seen[i]);
}

describe('town walk grid: reachability from the spawn (BFS on the real collision grid)', () => {
  it('the spawn point is walkable', () => {
    expect(canStandAt(TOWN_SPAWN.x, TOWN_SPAWN.y, TOWN_AVATAR_RADIUS, obstacles)).toBe(true);
    expect(blocked[spawnCell]).toBe(0);
  });

  it('reaches every door, and the avatar can stand on every door point', () => {
    const doors = [...TOWN_BUILDINGS, ...TOWN_CAMPS].map((t) => ({ id: t.id, ...t.door }));
    expect(doors.length).toBe(7);
    const failures = doors.filter((d) => {
      const cell = nearestWalkableCell(cellOf(d.x, d.y, cols), grid);
      return !canStandAt(d.x, d.y, TOWN_AVATAR_RADIUS, obstacles) || cell < 0 || !reachable(cell);
    }).map((d) => `${d.id} ${fmt(d)}`);
    expect(failures, `unreachable doors: ${failures.join(', ')}`).toEqual([]);
  });

  it('reaches every path tile (roads, the plaza and the trail north) the avatar fits on', () => {
    const unreachable = [];
    for (let i = 0; i < cols * rows; i += 1) {
      const c = cellCentre(i, cols);
      if (!onPath(c.x, c.y) || touchesCollider(c.x, c.y)) continue;
      if (blocked[i] || !reachable(i)) unreachable.push(fmt(c));
    }
    expect(unreachable, `unreachable path tiles: ${unreachable.join(' ')}`).toEqual([]);
  });

  it('reaches every tile of open-looking ground connected to the spawn (no invisible walls)', () => {
    const area = visibleArea();
    expect(area.length).toBeGreaterThan(400);
    const unreachable = area.filter((i) => blocked[i] || !reachable(i)).map((i) => fmt(cellCentre(i, cols)));
    expect(unreachable, `open-looking but unreachable tiles: ${unreachable.join(' ')}`).toEqual([]);
  });

  it('has no walkable pocket cut off from the spawn', () => {
    const pockets = [];
    for (let i = 0; i < cols * rows; i += 1) if (!blocked[i] && !reachable(i)) pockets.push(fmt(cellCentre(i, cols)));
    expect(pockets, `walkable but unreachable cells: ${pockets.join(' ')}`).toEqual([]);
  });

  it('the grid covers the whole world', () => {
    expect(cols * TOWN_TILE_SIZE).toBe(TOWN_WIDTH);
    expect(rows * TOWN_TILE_SIZE).toBe(WORLD_HEIGHT);
  });
});

describe('the gap in the north tree line (the F2 blocker beside the BATTLES sign)', () => {
  const northRow = forest.filter((t) => Math.abs(t.y + t.h - TOWN_WALK_ZONES[0].y) < 8);

  it('spans the whole visible opening between the canopies either side', () => {
    // no north-row tree is drawn inside the gap...
    for (const t of northRow) expect(t.x + t.w * 0.04 > TOWN_GAP.x + TOWN_GAP.w || t.x + t.w * 0.96 < TOWN_GAP.x).toBe(true);
    // ...and the gap reaches the trees on both sides (within 2 px)
    const centre = (t) => t.x + t.w / 2;
    const west = Math.max(...northRow.filter((t) => centre(t) < TOWN_GAP.x).map((t) => centre(t) + t.w * 0.46));
    const east = Math.min(...northRow.filter((t) => centre(t) > TOWN_GAP.x + TOWN_GAP.w).map((t) => centre(t) - t.w * 0.46));
    expect(TOWN_GAP.x - west).toBeLessThanOrEqual(2);
    expect(east - (TOWN_GAP.x + TOWN_GAP.w)).toBeLessThanOrEqual(2);
  });

  it('lets the avatar walk straight up beside the sign, through the gap, into the clearing', () => {
    // x = 446: right of the trail, left of the sign post (the reported spot)
    const x = TOWN_SIGN_SPOT.x - 22;
    const stops = [];
    for (let y = 230; y >= -60; y -= 2) if (!canStandAt(x, y, TOWN_AVATAR_RADIUS, obstacles)) stops.push(y);
    expect(stops, `blocked at x=${x}, y=${stops.join(',')}`).toEqual([]);
  });
});

describe('prop colliders block only the base of the drawing', () => {
  it('trees: 40% of the sprite width x 20% of its height at the bottom centre (TOWN_PROP_COLLIDER_RATIOS)', () => {
    expect(TOWN_PROP_COLLIDER_RATIOS.tree).toEqual({ w: 0.4, h: 0.2 });
    for (const p of TOWN_MAP_PROPS.filter((q) => q.type === 'tree')) {
      const c = propCollider(p);
      expect(c.w).toBeCloseTo(p.w * 0.4);
      expect(c.h).toBeCloseTo(p.h * 0.2);
      expect(c.x + c.w / 2).toBeCloseTo(p.x + p.w / 2);
      expect(c.y + c.h).toBeCloseTo(p.y + p.h);
    }
  });

  it('every prop collider lies inside its drawing, in the lower 60% of it', () => {
    for (const p of TOWN_MAP_PROPS) {
      const c = propCollider(p);
      if (!c) { expect(p.type).toBe('flowers'); continue; }
      const art = ART_SIZE[p.type] ? placed(p, ...ART_SIZE[p.type]) : { x: p.x, y: p.y, w: p.w, h: p.h };
      const box = c.type === 'rect' ? c : { x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r };
      const label = `${p.type} at ${fmt(p)}`;
      expect(box.x, label).toBeGreaterThanOrEqual(art.x);
      expect(box.x + box.w, label).toBeLessThanOrEqual(art.x + art.w);
      expect(box.y + box.h, label).toBeLessThanOrEqual(art.y + art.h);
      expect(box.y, label).toBeGreaterThanOrEqual(art.y + art.h * 0.4);
    }
  });

  it('houses block the drawn wall, not the margin beside it', () => {
    for (const p of TOWN_MAP_PROPS.filter((q) => q.type === 'house')) {
      const c = propCollider(p);
      expect(c.w).toBeCloseTo(56); // drawHouse: the wall is 56 px wide, centred
      expect(c.x).toBeCloseTo(p.x + 4);
      expect(c.y + c.h).toBeCloseTo(p.y + p.h);
    }
  });

  it('the BATTLES sign blocks only its post, at the post\'s foot', () => {
    const sign = TOWN_MAP_PROPS.find((p) => p.type === 'sign');
    const c = propCollider(sign);
    expect(c.type).toBe('circle');
    expect(c.r).toBeLessThanOrEqual(5); // drawTrailSign: a 5 px post
    expect(c.x).toBeCloseTo(sign.x + sign.w / 2);
    // the post's foot is 4 px below the footprint's front edge
    expect(Math.abs(c.y - (sign.y + sign.h + 4))).toBeLessThanOrEqual(3);
  });

  it('no prop collider sits on a path tile the avatar could otherwise use', () => {
    const onIt = [];
    for (const p of TOWN_MAP_PROPS) {
      const c = propCollider(p);
      if (!c) continue;
      const box = c.type === 'rect' ? c : { x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r };
      for (let x = box.x; x <= box.x + box.w; x += 2) for (let y = box.y; y <= box.y + box.h; y += 2) if (onPath(x, y)) onIt.push(`${p.type} ${fmt(p)}`);
    }
    expect([...new Set(onIt)]).toEqual([]);
  });
});
