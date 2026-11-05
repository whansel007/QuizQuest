// ============================================================
// Kingdom town collision: the colliders, the "can the avatar stand here"
// test and the pathfinding grid. KingdomTown.vue walks with these (keys,
// stick and tap-to-move all use the same canStand test and grid), and the
// reachability test imports them (web/src/student/kingdom/__tests__).
// ============================================================
import { TOWN_AVATAR_RADIUS, TOWN_PROP_COLLIDER_RATIOS, TOWN_SIGN_POST_RADIUS, TOWN_TILE_SIZE, TOWN_WIDTH } from '../../../../config/tuning.js';
import { TOWN_BUILDINGS, TOWN_CAMPS, TOWN_MAP_PROPS, TOWN_WALK_ZONES, WORLD_HEIGHT, WORLD_TOP } from './town-scene.js';

// Where the avatar appears when the town opens.
export const TOWN_SPAWN = Object.freeze({ x: 690, y: 446 });
// The avatar's hitbox is its ground footprint: a circle this share of its radius.
export const TOWN_FOOTPRINT_SCALE = 0.8;

const footprintRect = (o) => ({ type: 'rect', x: o.x, y: o.y, w: o.w, h: o.h });

// The rectangle a prop blocks: a share of its layout box (TOWN_PROP_COLLIDER_RATIOS),
// centred and resting on the box's bottom edge, so only the base of the drawing
// is solid. For trees and rocks the layout box is the sprite itself; for houses
// and the well it is the ground footprint the drawing stands on.
export function baseRect(p, ratios) {
  const w = p.w * ratios.w; const h = p.h * ratios.h;
  return { type: 'rect', x: p.x + (p.w - w) / 2, y: p.y + p.h - h, w, h };
}

// The collider of one map prop, or null when it does not block (flowers).
export function propCollider(p) {
  if (p.type === 'flowers') return null;
  // The sign is a single post. drawTrailSign stands it 4 px below the art's
  // usual ground line, i.e. its foot is 4 px below the footprint's front edge.
  if (p.type === 'sign') return { type: 'circle', x: p.x + p.w / 2, y: p.y + p.h + 4 - TOWN_SIGN_POST_RADIUS / 2, r: TOWN_SIGN_POST_RADIUS };
  const ratios = TOWN_PROP_COLLIDER_RATIOS[p.type];
  return ratios ? baseRect(p, ratios) : footprintRect(p);
}

// Every collider in the town: building and camp footprints, then the props.
// Edge trees are decorative (outside the walk zones) and have none.
export function makeTownObstacles(targets = [...TOWN_BUILDINGS, ...TOWN_CAMPS], props = TOWN_MAP_PROPS) {
  return [...targets.map(footprintRect), ...props.map(propCollider).filter(Boolean)];
}

export function circleHitsRect(x, y, r, rect) {
  const nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  return ((x - nx) ** 2 + (y - ny) ** 2) < r ** 2;
}
export const inZone = (x, y, z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;

// True when an avatar of `radius` can stand with its feet at (x, y).
export function canStandAt(x, y, radius, obstacles, zones = TOWN_WALK_ZONES) {
  if (!zones.some((z) => inZone(x, y, z))) return false;
  const r = radius * TOWN_FOOTPRINT_SCALE;
  for (const obstacle of obstacles) {
    if (obstacle.type === 'rect' ? circleHitsRect(x, y, r, obstacle) : Math.hypot(x - obstacle.x, y - obstacle.y) < r + obstacle.r) return false;
  }
  return true;
}

// ---- pathfinding grid --------------------------------------------------------

// A cell is open when an avatar can stand at its centre (the same canWalk
// test the keys and the stick move with).
export function buildGrid(canWalk) {
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

export function nearestWalkableCell(index, grid) {
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

export const cellOf = (x, y, cols) => Math.floor((y - WORLD_TOP) / TOWN_TILE_SIZE) * cols + Math.floor(x / TOWN_TILE_SIZE);
export const cellCentre = (i, cols) => ({ x: (i % cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2, y: WORLD_TOP + Math.floor(i / cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2 });

// The eight grid neighbours; a diagonal step may not cut a blocked corner.
export const GRID_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Breadth-first search from one cell; returns the predecessor array
// (-1 = unreachable). findPath and the reachability test share it.
export function searchFrom(start, grid, stopAt = -1) {
  const { cols, rows, blocked } = grid;
  const size = cols * rows;
  const prev = new Int32Array(size).fill(-1);
  const queue = new Int32Array(size);
  let head = 0; let tail = 0;
  queue[tail++] = start;
  prev[start] = start;
  while (head < tail && (stopAt < 0 || prev[stopAt] === -1)) {
    const at = queue[head++];
    const x = at % cols; const y = Math.floor(at / cols);
    for (const [dx, dy] of GRID_STEPS) {
      const nx = x + dx; const ny = y + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const next = ny * cols + nx;
      if (blocked[next] || prev[next] !== -1) continue;
      if (dx && dy && (blocked[y * cols + nx] || blocked[ny * cols + x])) continue;
      prev[next] = at;
      queue[tail++] = next;
    }
  }
  return prev;
}

export function findPath(startX, startY, targetX, targetY, grid) {
  const { cols } = grid;
  const start = nearestWalkableCell(cellOf(startX, startY, cols), grid);
  const goal = nearestWalkableCell(cellOf(targetX, targetY, cols), grid);
  if (start < 0 || goal < 0) return [];
  const prev = searchFrom(start, grid, goal);
  if (prev[goal] === -1) return [];
  const route = [];
  for (let at = goal; at !== start; at = prev[at]) route.push(cellCentre(at, cols));
  route.reverse();
  route.push(grid.canWalk(targetX, targetY) ? { x: targetX, y: targetY } : cellCentre(goal, cols));
  return route;
}

// The player's walk grid, built from the real colliders.
export function makeWalkGrid(obstacles = makeTownObstacles(), radius = TOWN_AVATAR_RADIUS) {
  return buildGrid((x, y) => canStandAt(x, y, radius, obstacles));
}
