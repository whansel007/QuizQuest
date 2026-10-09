// ============================================================
// Kingdom voxels: block blueprints + isometric projection
// ------------------------------------------------------------
// Every building is a pile of 1x1x1 blocks. A blueprint says which
// blocks a building has at a given level; the view diffs two levels to
// know which blocks are new (they drop in) or would be added by the
// next upgrade (shown as ghosts). Purely cosmetic, computed in the
// browser from the levels the server reports.
// ============================================================

export const C = {
  grass: '#7cbf5c',
  dirt: '#8a6a45',
  plot: '#a98b5e',
  path: '#e4d6b4',
  stone: '#b9b4aa',
  stoneDark: '#8f8a80',
  white: '#f4f1ea',
  roof: '#4a7766',
  window: '#2d3142',
  gold: '#e2b23c',
  wood: '#b07a45',
  woodDark: '#7a4d2a',
  brick: '#c0533f',
  cloth: '#efe3c4',
  clothDark: '#c94f4f',
  crystal: '#8fdcef',
  crystalDeep: '#46a7cc',
  leaf: '#5fa845',
  leafDark: '#3f7f33',
  pink: '#f28bb0',
  yellow: '#f5cf47',
  water: '#5fb4e8',
  book: '#4d5bd6',
};

// --- a tiny builder: box() fills a cuboid, later calls overwrite earlier ones
function builder() {
  const m = new Map();
  const set = (x, y, z, c) => m.set(`${x},${y},${z}`, { x, y, z, c });
  return {
    m,
    box(x, y, z, w, d, h, c) {
      for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) for (let k = 0; k < h; k++) set(x + i, y + j, z + k, c);
    },
    set,
    // windows along the two faces the viewer sees (max x and max y), skipping corners
    windows(x, y, z, w, d, c = C.window) {
      for (let i = 1; i < d - 1; i += 2) set(x + w - 1, y + i, z, c);
      for (let i = 1; i < w - 1; i += 2) set(x + i, y + d - 1, z, c);
    },
  };
}

// Blueprints draw inside a local footprint; level 0 = empty plot.
const BLUEPRINTS = {
  // 6x6, tall crystal spire
  tower(b, lvl) {
    if (lvl >= 1) {
      b.box(1, 1, 0, 4, 4, 2, C.stone);
      b.set(4, 2, 0, C.woodDark);
      b.box(2, 2, 2, 2, 2, 1, C.crystal);
    }
    if (lvl >= 2) {
      b.box(2, 2, 2, 2, 2, 5, C.white);
      b.set(3, 2, 4, C.window);
      b.set(2, 3, 5, C.window);
      b.box(2, 2, 7, 2, 2, 1, C.crystal);
    }
    if (lvl >= 3) {
      b.box(1, 1, 7, 4, 4, 1, C.stone);
      for (const [x, y] of [[1, 1], [4, 1], [1, 4], [4, 4]]) b.set(x, y, 8, C.stone);
      b.box(2, 2, 8, 2, 2, 2, C.crystal);
      b.set(3, 3, 10, C.crystalDeep);
      b.set(3, 3, 11, C.crystalDeep);
    }
  },
  // 6x6, two-storey hall with a blue banner
  library(b, lvl) {
    if (lvl >= 1) {
      b.box(0, 0, 0, 6, 6, 1, C.stone);
      b.box(1, 1, 1, 4, 4, 2, C.white);
      b.set(2, 4, 1, C.woodDark);
      b.set(2, 4, 2, C.woodDark);
      b.set(4, 2, 2, C.window);
      b.box(1, 1, 3, 4, 4, 1, C.roof);
    }
    if (lvl >= 2) {
      b.box(1, 1, 3, 4, 4, 2, C.white);
      b.windows(1, 1, 4, 4, 4);
      b.box(0, 0, 5, 6, 6, 1, C.roof);
      b.box(1, 1, 6, 4, 4, 1, C.roof);
    }
    if (lvl >= 3) {
      b.box(2, 2, 7, 2, 2, 1, C.roof);
      b.set(2, 2, 8, C.gold);
      b.set(4, 5, 4, C.book);
      b.set(4, 5, 3, C.book);
      b.set(5, 4, 4, C.book);
      b.set(5, 4, 3, C.book);
    }
  },
  // 6x6, timber shed that grows a loft and a crane
  workshop(b, lvl) {
    if (lvl >= 1) {
      b.box(0, 0, 0, 6, 6, 1, C.woodDark);
      b.box(1, 1, 1, 4, 3, 2, C.wood);
      b.set(3, 3, 1, C.woodDark);
      b.box(1, 1, 3, 4, 3, 1, C.brick);
    }
    if (lvl >= 2) {
      b.box(4, 1, 4, 1, 1, 2, C.stoneDark);
      b.box(1, 5, 1, 3, 1, 1, C.woodDark);
      b.box(1, 5, 2, 2, 1, 1, C.wood);
    }
    if (lvl >= 3) {
      b.box(1, 1, 3, 4, 3, 2, C.wood);
      b.set(4, 2, 4, C.window);
      b.set(2, 3, 4, C.window);
      b.box(0, 0, 5, 6, 5, 1, C.brick);
      b.box(4, 1, 6, 1, 1, 1, C.stoneDark);
      b.box(5, 5, 1, 1, 1, 5, C.woodDark);
      b.box(3, 5, 5, 2, 1, 1, C.woodDark);
      b.set(3, 5, 4, C.gold);
    }
  },
  // 6x6, hedges, then trees, then a fountain
  garden(b, lvl) {
    if (lvl >= 1) {
      b.box(0, 0, 0, 6, 1, 1, C.leafDark);
      b.box(0, 0, 0, 1, 6, 1, C.leafDark);
      b.box(5, 0, 0, 1, 6, 1, C.leafDark);
      b.box(0, 5, 0, 2, 1, 1, C.leafDark);
      b.box(4, 5, 0, 2, 1, 1, C.leafDark);
      b.set(2, 2, 0, C.pink);
      b.set(3, 4, 0, C.yellow);
      b.set(4, 2, 0, C.pink);
    }
    if (lvl >= 2) {
      b.box(1, 1, 1, 1, 1, 2, C.woodDark);
      b.box(0, 0, 3, 3, 3, 2, C.leaf);
      b.set(1, 1, 5, C.leaf);
    }
    if (lvl >= 3) {
      b.box(2, 2, 0, 3, 3, 1, C.stone);
      b.set(3, 3, 0, C.water);
      b.set(3, 3, 1, C.stone);
      b.set(3, 3, 2, C.water);
      b.box(4, 0, 1, 1, 1, 1, C.woodDark);
      b.box(3, 0, 2, 3, 2, 2, C.leafDark);
      b.set(1, 4, 1, C.pink);
    }
  },
  // 10x10, a tent that becomes a three-tier castle (castle level = lowest building level)
  castle(b, lvl) {
    if (lvl === 0) {
      b.box(3, 3, 0, 4, 4, 1, C.cloth);
      b.box(4, 3, 1, 2, 4, 1, C.cloth);
      b.set(4, 6, 0, C.woodDark);
      b.box(5, 3, 2, 1, 1, 2, C.woodDark);
      b.set(6, 3, 3, C.clothDark);
      return;
    }
    b.box(0, 0, 0, 10, 10, 1, C.stoneDark);
    b.box(1, 1, 1, 8, 8, 1, C.stone);
    b.box(2, 2, 2, 6, 6, 2, C.white);
    b.windows(2, 2, 3, 6, 6);
    b.set(4, 7, 2, C.woodDark);
    b.set(5, 7, 2, C.woodDark);
    b.box(1, 1, 4, 8, 8, 1, C.roof);
    if (lvl === 1) {
      b.box(2, 2, 5, 6, 6, 1, C.roof);
      b.set(4, 4, 6, C.gold);
      return;
    }
    b.box(3, 3, 5, 4, 4, 2, C.white);
    b.windows(3, 3, 6, 4, 4);
    b.box(2, 2, 7, 6, 6, 1, C.roof);
    if (lvl === 2) {
      b.box(3, 3, 8, 4, 4, 1, C.roof);
      b.set(4, 4, 9, C.gold);
      return;
    }
    b.box(4, 4, 8, 2, 2, 2, C.white);
    b.set(5, 4, 9, C.window);
    b.set(4, 5, 9, C.window);
    b.box(3, 3, 10, 4, 4, 1, C.roof);
    b.box(4, 4, 11, 2, 2, 1, C.roof);
    b.set(4, 4, 12, C.gold);
    b.set(5, 5, 12, C.gold);
    for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
      b.box(x, y, 1, 2, 2, 2, C.white);
      b.box(x, y, 3, 2, 2, 1, C.roof);
    }
  },
};

// Trees and rocks in the empty corners; always there, never rebuilt
BLUEPRINTS.scenery = (b) => {
  for (const [x, y, h] of [[2, 2, 1], [4, 3, 1], [25, 2, 2], [2, 25, 2], [24, 24, 1], [26, 23, 2]]) {
    b.box(x, y, 0, 1, 1, h, C.woodDark);
    b.box(x - (h > 1 ? 1 : 0), y - (h > 1 ? 1 : 0), h, h > 1 ? 3 : 1, h > 1 ? 3 : 1, h > 1 ? 2 : 1, h > 1 ? C.leaf : C.leafDark);
  }
  for (const [x, y] of [[6, 2], [22, 26], [1, 21]]) b.set(x, y, 0, C.stone);
  b.set(5, 24, 0, C.pink);
  b.set(24, 5, 0, C.yellow);
};

export const MAP = 28;
// Where each footprint sits on the map: the castle in the middle and a
// building on each edge, so nothing stands straight behind the castle.
export const PLOTS = {
  tower: { x: 1, y: 11, size: 6 },
  library: { x: 11, y: 1, size: 6 },
  workshop: { x: 11, y: 21, size: 6 },
  garden: { x: 21, y: 11, size: 6 },
  castle: { x: 9, y: 9, size: 10 },
  scenery: { x: 0, y: 0, size: MAP },
};
// path ring round the castle, then a short path out to each plot
export const PATHS = [[8, 8, 12, 12], [7, 13, 1, 2], [13, 7, 2, 1], [13, 20, 2, 1], [20, 13, 1, 2]];

// All blocks of one building at one level, in map coordinates.
export function blocks(id, lvl) {
  const b = builder();
  BLUEPRINTS[id]?.(b, lvl);
  const { x, y } = PLOTS[id];
  return [...b.m.values()].map((v) => ({ ...v, x: v.x + x, y: v.y + y, id, key: `${id}:${v.x + x},${v.y + y},${v.z}` }));
}

// ---------- projection ----------
// x runs down-right, y down-left, z up. Viewer looks from +x,+y,+z.
export const S = 12;
const COS = Math.cos(Math.PI / 6);
export const iso = (x, y, z) => [(x - y) * COS * S, ((x + y) / 2 - z) * S];
const pts = (list) => list.map(([x, y, z]) => iso(x, y, z).map((n) => +n.toFixed(2)).join(',')).join(' ');

// Hex colour scaled toward black (faces away from the light are darker)
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

// The three faces of block (x,y,z) a viewer can see
export function faces({ x, y, z, c }) {
  return {
    top: { points: pts([[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]]), fill: c },
    left: { points: pts([[x, y + 1, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]]), fill: shade(c, 0.82) },
    right: { points: pts([[x + 1, y, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x + 1, y, z + 1]]), fill: shade(c, 0.66) },
  };
}

// A flat rectangle lying on the ground (plots, paths)
export const flat = (x, y, w, d, z = 0) => pts([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]]);

// Visible faces of a block list, back to front. `solid` is the set of
// keys that hide a neighbour's face (so a block that is still falling
// into place doesn't punch a hole in the one below it).
export function render(list, solid) {
  const at = (x, y, z) => solid.has(`${x},${y},${z}`);
  const out = [];
  for (const v of list) {
    const f = faces(v);
    const shown = [];
    if (!at(v.x + 1, v.y, v.z)) shown.push(f.right);
    if (!at(v.x, v.y + 1, v.z)) shown.push(f.left);
    if (!at(v.x, v.y, v.z + 1)) shown.push(f.top);
    if (shown.length) out.push({ ...v, faces: shown });
  }
  // blocks with the same x+y+z never overlap on screen, so this order is exact
  return out.sort((a, b) => a.x + a.y + a.z - (b.x + b.y + b.z) || a.z - b.z);
}
