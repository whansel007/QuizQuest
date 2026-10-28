<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { loadOwnedHeroVisuals, loadPlayerVisuals, tintedPlayerFrames } from './avatar.js';
import {
  BUILDING_LAYOUT, TOWN_AVATAR_RADIUS, TOWN_DOOR_RADIUS, TOWN_HEIGHT,
  TOWN_GRASS_COLOR, TOWN_HERO_AVATAR_RADIUS, TOWN_HERO_HOP_HEIGHT, TOWN_HERO_HOPS_PER_SECOND,
  TOWN_HERO_MIN_PLAYER_DISTANCE, TOWN_HERO_REDUCED_MOTION_HOP_HEIGHT, TOWN_HERO_REDUCED_MOTION_PAUSE_MAX_MS,
  TOWN_HERO_REDUCED_MOTION_PAUSE_MIN_MS, TOWN_HERO_WANDER_PAUSE_MAX_MS, TOWN_HERO_WANDER_PAUSE_MIN_MS,
  TOWN_HERO_WANDER_RADIUS, TOWN_HERO_WALK_SPEED, TOWN_MAX_HEROES,
  TOWN_PATH_WIDTH, TOWN_PROP_LAYOUT, TOWN_TILE_SIZE, TOWN_WALK_SPEED, TOWN_WIDTH,
} from '../../../config/tuning.js';

const props = defineProps({
  buildings: { type: Object, required: true },
  castleLevel: { type: Number, required: true },
  avatarColor: { type: String, required: true },
  heroes: { type: Array, default: () => [] },
});
const emit = defineEmits(['interact']);
const frame = ref(null);
const canvas = ref(null);
const affordability = computed(() => props.buildings);

const INK = '#23382F';
const PALETTE = {
  grass: TOWN_GRASS_COLOR, grassLight: '#91BB67', path: '#D8C392', pathEdge: '#9A8052',
  forest: '#32533E', paper: '#FBF2D8', gold: '#F2BA55', ember: '#EF7137',
  blue: '#6DB8CF', leaf: '#91B95E', lavender: '#8062A9', rose: '#D86F6B',
};
const BUILDING_COLORS = {
  library: { wall: '#86C9DB', roof: '#548CB0', trim: '#F6D16B' },
  workshop: { wall: '#F2A76C', roof: '#B96448', trim: '#F6D16B' },
  garden: { wall: '#98C76D', roof: '#638F4B', trim: '#F2BA55' },
  tower: { wall: '#BAA1D0', roof: '#8062A9', trim: '#F6D16B' },
  castle: { wall: '#F5D478', roof: '#D86F6B', trim: '#FFF1B8' },
};
const buildings = Object.entries(BUILDING_LAYOUT).map(([id, layout]) => ({ id, ...layout }));
const propsOnMap = TOWN_PROP_LAYOUT.map((p, index) => ({ ...p, id: `prop-${index}` }));
const obstacles = [
  ...buildings.map((b) => ({ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h })),
  ...propsOnMap.map((p) => ({ type: 'circle', x: p.x + p.w / 2, y: p.y + p.h * 0.68, r: Math.max(p.w, p.h) * (p.type === 'tree' ? 0.32 : 0.38) })),
];
const keys = new Set();
const player = { x: 720, y: 518, facing: 1, path: [], waypoint: 0, moving: false };
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
let objectCanvases = new Map();
let bubbleHit = null;
let inputTarget = null;

watch(() => props.avatarColor, (color) => {
  if (playerVisuals) playerFrames = tintedPlayerFrames(playerVisuals, color);
});

function offscreen(width, height) {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
}

function createGroundLayer() {
  const layer = offscreen(TOWN_WIDTH, TOWN_HEIGHT);
  const g = layer.getContext('2d');
  g.fillStyle = PALETTE.grass;
  g.fillRect(0, 0, TOWN_WIDTH, TOWN_HEIGHT);
  g.fillStyle = PALETTE.grassLight;
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 17; col += 1) {
      const x = 22 + col * 78 + ((row % 2) * 29);
      const y = 26 + row * 72;
      g.globalAlpha = ((row + col) % 3 === 0) ? 0.2 : 0.11;
      g.beginPath();
      g.ellipse(x, y, 2.5, 1.4, 0.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  // A light scattering of tiny triangular grass tufts gives the lawn texture
  // without making the walkable paths busy. The fixed seed keeps the map calm
  // and consistent between renders.
  let grassSeed = 0x51a7;
  const grassRandom = () => { grassSeed = (grassSeed * 1664525 + 1013904223) >>> 0; return grassSeed / 0x100000000; };
  const bladeColors = ['#5F984C', '#6EA451', '#A2C66B', '#B4CC70'];
  for (let tuft = 0; tuft < 310; tuft += 1) {
    const x = 8 + grassRandom() * (TOWN_WIDTH - 16);
    const y = 8 + grassRandom() * (TOWN_HEIGHT - 16);
    const bladeCount = 2 + Math.floor(grassRandom() * 3);
    g.globalAlpha = 0.3 + grassRandom() * 0.28;
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

  // The cross-shaped stone path has a narrow ink-colored edge and flat fill.
  const castle = BUILDING_LAYOUT.castle;
  const library = BUILDING_LAYOUT.library;
  const workshop = BUILDING_LAYOUT.workshop;
  const garden = BUILDING_LAYOUT.garden;
  const tower = BUILDING_LAYOUT.tower;
  const half = TOWN_PATH_WIDTH / 2;
  g.fillStyle = PALETTE.pathEdge;
  g.fillRect(castle.door.x - half - 4, library.door.y - 7, TOWN_PATH_WIDTH + 8, castle.door.y - library.door.y + 14);
  g.fillRect(castle.door.x - half - 4, castle.door.y - half - 4, TOWN_PATH_WIDTH + 8, garden.door.y - castle.door.y + TOWN_PATH_WIDTH + 8);
  g.fillRect(workshop.door.x - 4, workshop.door.y - half - 4, castle.x + castle.w - workshop.door.x + 8, TOWN_PATH_WIDTH + 8);
  g.fillRect(tower.door.x - 4, tower.door.y - half - 4, castle.x + 8 - tower.door.x, TOWN_PATH_WIDTH + 8);
  g.fillStyle = PALETTE.path;
  g.fillRect(castle.door.x - half, library.door.y, TOWN_PATH_WIDTH, castle.door.y - library.door.y);
  g.fillRect(castle.door.x - half, castle.door.y - half, TOWN_PATH_WIDTH, garden.door.y - castle.door.y + TOWN_PATH_WIDTH);
  g.fillRect(workshop.door.x, workshop.door.y - half, castle.x + castle.w - workshop.door.x, TOWN_PATH_WIDTH);
  g.fillRect(tower.door.x, tower.door.y - half, castle.x - tower.door.x, TOWN_PATH_WIDTH);

  // Quiet stepping-stone seams are drawn once with the ground and path.
  g.strokeStyle = 'rgba(111, 91, 59, .19)';
  g.lineWidth = 2;
  for (let y = library.door.y + 22; y < castle.door.y - 6; y += 34) {
    g.beginPath(); g.moveTo(castle.door.x - half, y); g.lineTo(castle.door.x + half, y); g.stroke();
  }
  for (let x = tower.door.x + 30; x < castle.x - 5; x += 42) {
    g.beginPath(); g.moveTo(x, tower.door.y - half); g.lineTo(x, tower.door.y + half); g.stroke();
  }
  for (let x = castle.door.x + 26; x < garden.door.x - 8; x += 42) {
    g.beginPath(); g.moveTo(x, castle.door.y - half); g.lineTo(x, castle.door.y + half); g.stroke();
  }
  for (let x = castle.x + castle.w + 6; x < workshop.door.x - 4; x += 42) {
    g.beginPath(); g.moveTo(x, workshop.door.y - half); g.lineTo(x, workshop.door.y + half); g.stroke();
  }
  return layer;
}

function drawBuilding(g, building) {
  const { w, h, id } = building;
  const c = BUILDING_COLORS[id];
  const line = 4;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // Hard shadow, with no blur or filter.
  g.fillStyle = '#4F6541';
  g.strokeStyle = INK;
  g.lineWidth = line;
  g.beginPath();
  g.roundRect(10, 16, w - 20, h - 23, 10);
  g.fill(); g.stroke();

  const isCastle = id === 'castle';
  const roofH = isCastle ? h * 0.34 : h * 0.36;
  g.fillStyle = c.wall;
  g.beginPath();
  g.roundRect(8, roofH, w - 16, h - roofH - 8, 8);
  g.fill(); g.stroke();
  g.fillStyle = c.roof;
  g.beginPath();
  g.moveTo(3, roofH + 5);
  g.lineTo(w / 2, 5);
  g.lineTo(w - 3, roofH + 5);
  g.closePath(); g.fill(); g.stroke();

  if (isCastle) {
    g.fillStyle = c.wall;
    for (let i = 0; i < 3; i += 1) {
      const bx = w * 0.19 + i * w * 0.25;
      g.beginPath(); g.rect(bx, 2, w * 0.17, roofH * 0.45); g.fill(); g.stroke();
    }
    g.fillStyle = c.trim;
    g.fillRect(w / 2 - 4, 15, 8, 13);
    g.strokeRect(w / 2 - 4, 15, 8, 13);
  } else {
    // Front-facing round windows and a clear sign plaque.
    g.fillStyle = '#FFF4C9';
    g.strokeStyle = INK;
    g.lineWidth = 3;
    for (const wx of [w * 0.26, w * 0.74]) {
      g.beginPath(); g.roundRect(wx - 9, roofH + 18, 18, 23, 9); g.fill(); g.stroke();
    }
    g.fillStyle = c.trim;
    g.fillRect(w * 0.36, roofH + 3, w * 0.28, 8);
    g.strokeRect(w * 0.36, roofH + 3, w * 0.28, 8);
  }

  // The door is placed on the side facing the central castle.
  g.fillStyle = '#8A5336';
  g.strokeStyle = INK;
  g.lineWidth = 3;
  const doorW = isCastle ? w * 0.19 : w * 0.2;
  const doorH = h * 0.33;
  const doorSide = building.door.side;
  let dx = (w - doorW) / 2;
  let dy = h - doorH - 8;
  if (doorSide === 'west') { dx = 8; dy = h * 0.52; }
  if (doorSide === 'east') { dx = w - doorW - 8; dy = h * 0.52; }
  if (doorSide === 'north') { dx = (w - doorW) / 2; dy = roofH + 17; }
  g.beginPath(); g.roundRect(dx, dy, doorW, doorH, [7, 7, 0, 0]); g.fill(); g.stroke();
  g.fillStyle = c.trim;
  g.beginPath(); g.arc(dx + doorW * 0.77, dy + doorH * 0.57, 2.5, 0, Math.PI * 2); g.fill();
}

function drawProp(g, prop) {
  g.lineWidth = 4;
  g.lineJoin = 'round';
  g.strokeStyle = INK;
  if (prop.type === 'tree') {
    // Trunk behind overlapping, outlined leaf clumps.
    g.fillStyle = '#9E6238';
    g.beginPath(); g.roundRect(prop.w * 0.39, prop.h * 0.49, prop.w * 0.22, prop.h * 0.47, 5); g.fill(); g.stroke();
    const greens = ['#467747', '#6E9C4B', '#91B95E'];
    for (const [i, [cx, cy, r]] of [[0, [prop.w * .5, prop.h * .26, prop.w * .28]], [1, [prop.w * .3, prop.h * .41, prop.w * .25]], [2, [prop.w * .7, prop.h * .42, prop.w * .25]]]) {
      g.fillStyle = greens[i];
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.fillStyle = '#B9D77B';
    g.beginPath(); g.arc(prop.w * .42, prop.h * .23, 4, 0, Math.PI * 2); g.fill();
  } else if (prop.type === 'rock') {
    g.fillStyle = '#AAB6A0';
    g.beginPath();
    g.moveTo(3, prop.h - 2); g.lineTo(prop.w * .12, prop.h * .48); g.lineTo(prop.w * .38, 4);
    g.lineTo(prop.w * .7, prop.h * .17); g.lineTo(prop.w - 3, prop.h * .55); g.lineTo(prop.w * .9, prop.h - 2);
    g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(35,56,47,.45)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(prop.w * .38, prop.h * .25); g.lineTo(prop.w * .5, prop.h * .54); g.lineTo(prop.w * .72, prop.h * .32); g.stroke();
  } else {
    for (let i = 0; i < 5; i += 1) {
      const x = 4 + i * (prop.w - 8) / 4;
      const y = prop.h * (.38 + (i % 2) * .25);
      g.strokeStyle = '#39724A'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, prop.h); g.lineTo(x, y); g.stroke();
      g.fillStyle = [PALETTE.rose, PALETTE.gold, PALETTE.lavender][i % 3];
      g.strokeStyle = INK; g.lineWidth = 1.5;
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.stroke();
    }
  }
}

function makeObjectCanvases() {
  objectCanvases = new Map();
  for (const object of [...buildings, ...propsOnMap]) {
    const layer = offscreen(object.w + 12, object.h + 18);
    const g = layer.getContext('2d');
    g.translate(6, 5);
    if (object.id.startsWith('prop-')) drawProp(g, object);
    else drawBuilding(g, object);
    objectCanvases.set(object.id, { canvas: layer, object, x: object.x - 6, y: object.y - 5, sortY: object.y + object.h });
  }
}

function circleHitsRect(x, y, r, rect) {
  const nx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const ny = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  return ((x - nx) ** 2 + (y - ny) ** 2) < r ** 2;
}

function canStand(x, y, ignoreHeroId = null) {
  if (x < TOWN_AVATAR_RADIUS || y < TOWN_AVATAR_RADIUS || x > TOWN_WIDTH - TOWN_AVATAR_RADIUS || y > TOWN_HEIGHT - TOWN_AVATAR_RADIUS) return false;
  for (const obstacle of obstacles) {
    if (obstacle.type === 'rect' ? circleHitsRect(x, y, TOWN_AVATAR_RADIUS, obstacle) : Math.hypot(x - obstacle.x, y - obstacle.y) < TOWN_AVATAR_RADIUS + obstacle.r) return false;
  }
  return wanderers.every((hero) => hero.id === ignoreHeroId || Math.hypot(x - hero.x, y - hero.y) >= TOWN_HERO_MIN_PLAYER_DISTANCE);
}

function canWanderStand(hero, x, y) {
  if (!canStand(x, y, hero.id) || Math.hypot(x - player.x, y - player.y) < TOWN_HERO_MIN_PLAYER_DISTANCE) return false;
  return buildings.every((building) => Math.hypot(x - building.door.x, y - building.door.y) >= TOWN_DOOR_RADIUS + TOWN_HERO_AVATAR_RADIUS);
}

function nearestWalkableCell(index, cols, rows, blocked) {
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

function findPath(startX, startY, targetX, targetY, canWalk = canStand) {
  const cols = Math.floor(TOWN_WIDTH / TOWN_TILE_SIZE);
  const rows = Math.floor(TOWN_HEIGHT / TOWN_TILE_SIZE);
  const size = cols * rows;
  const blocked = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    const x = (i % cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2;
    const y = Math.floor(i / cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2;
    blocked[i] = canWalk(x, y) ? 0 : 1;
  }
  let start = Math.floor(startY / TOWN_TILE_SIZE) * cols + Math.floor(startX / TOWN_TILE_SIZE);
  let goal = Math.floor(targetY / TOWN_TILE_SIZE) * cols + Math.floor(targetX / TOWN_TILE_SIZE);
  start = nearestWalkableCell(start, cols, rows, blocked);
  goal = nearestWalkableCell(goal, cols, rows, blocked);
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
  for (let at = goal; at !== start; at = prev[at]) route.push({ x: (at % cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2, y: Math.floor(at / cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2 });
  route.reverse();
  const targetIsWalkable = canWalk(targetX, targetY);
  route.push(targetIsWalkable ? { x: targetX, y: targetY } : { x: (goal % cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2, y: Math.floor(goal / cols) * TOWN_TILE_SIZE + TOWN_TILE_SIZE / 2 });
  return route;
}

function buildingAt(x, y) {
  return buildings.find((b) => x >= b.x - 8 && x <= b.x + b.w + 8 && y >= b.y - 8 && y <= b.y + b.h + 8);
}

function setDestination(x, y, building = null) {
  const goal = building ? building.door : { x: Math.max(TOWN_AVATAR_RADIUS, Math.min(TOWN_WIDTH - TOWN_AVATAR_RADIUS, x)), y: Math.max(TOWN_AVATAR_RADIUS, Math.min(TOWN_HEIGHT - TOWN_AVATAR_RADIUS, y)) };
  player.path = findPath(player.x, player.y, goal.x, goal.y);
  player.waypoint = 0;
}

function closestDoor() {
  let close = null;
  let distance = TOWN_DOOR_RADIUS;
  for (const b of buildings) {
    const d = Math.hypot(player.x - b.door.x, player.y - b.door.y);
    if (d <= distance) { distance = d; close = b; }
  }
  return close;
}

function interact() {
  const door = closestDoor();
  if (door) emit('interact', door.id);
}

function eventPoint(event) {
  const rect = canvas.value.getBoundingClientRect();
  const scale = Math.max(rect.width / TOWN_WIDTH, rect.height / TOWN_HEIGHT);
  const offsetX = (rect.width - TOWN_WIDTH * scale) / 2;
  const offsetY = (rect.height - TOWN_HEIGHT * scale) / 2;
  return { x: (event.clientX - rect.left - offsetX) / scale, y: (event.clientY - rect.top - offsetY) / scale };
}

function onPointerDown(event) {
  canvas.value?.focus({ preventScroll: true });
  const point = eventPoint(event);
  if (bubbleHit && point.x >= bubbleHit.x && point.x <= bubbleHit.x + bubbleHit.w && point.y >= bubbleHit.y && point.y <= bubbleHit.y + bubbleHit.h) {
    interact();
    return;
  }
  const building = buildingAt(point.x, point.y);
  setDestination(point.x, point.y, building || null);
}

function onKeyDown(event) {
  if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) return;
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    event.preventDefault();
    keys.add(key);
    player.path = [];
  }
  if (key === 'e' || key === 'enter') {
    const nearby = closestDoor();
    if (nearby) { event.preventDefault(); emit('interact', nearby.id); }
  }
}
function onKeyUp(event) { keys.delete(event.key.toLowerCase()); }
function onBlur() { keys.clear(); }

function heroPause() {
  const min = reducedMotion ? TOWN_HERO_REDUCED_MOTION_PAUSE_MIN_MS : TOWN_HERO_WANDER_PAUSE_MIN_MS;
  const max = reducedMotion ? TOWN_HERO_REDUCED_MOTION_PAUSE_MAX_MS : TOWN_HERO_WANDER_PAUSE_MAX_MS;
  return min + Math.random() * (max - min);
}

function heroWanderPoint() {
  const castle = BUILDING_LAYOUT.castle;
  const angle = Math.random() * Math.PI * 2;
  const radius = 70 + Math.random() * (TOWN_HERO_WANDER_RADIUS - 70);
  return { x: castle.x + castle.w / 2 + Math.cos(angle) * radius, y: castle.y + castle.h / 2 + Math.sin(angle) * radius };
}

function chooseHeroDestination(hero, time) {
  for (let attempt = 0; attempt < 70; attempt += 1) {
    const target = heroWanderPoint();
    if (!canWanderStand(hero, target.x, target.y)) continue;
    const path = findPath(hero.x, hero.y, target.x, target.y, (x, y) => canWanderStand(hero, x, y));
    if (path.length) {
      hero.path = path;
      hero.waypoint = 0;
      hero.pauseUntil = 0;
      return true;
    }
  }
  hero.pauseUntil = time + 600;
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
    const actor = {
      id: hero.id, hero, visual: record?.visual || null, frames: record?.frames || {},
      x: 0, y: 0, facing: 1, path: [], waypoint: 0, moving: false,
      animationOffset: Math.random() * 1000, hopOffset: Math.random() * 1000, pauseUntil: time + heroPause(),
    };
    let spawn = null;
    for (let attempt = 0; attempt < 140 && !spawn; attempt += 1) {
      const candidate = heroWanderPoint();
      if (canWanderStand(actor, candidate.x, candidate.y)) spawn = candidate;
    }
    if (!spawn) {
      for (let y = 40; y < TOWN_HEIGHT - 40 && !spawn; y += TOWN_TILE_SIZE) {
        for (let x = 40; x < TOWN_WIDTH - 40 && !spawn; x += TOWN_TILE_SIZE) {
          if (canWanderStand(actor, x, y)) spawn = { x, y };
        }
      }
    }
    if (!spawn) continue;
    actor.x = spawn.x; actor.y = spawn.y;
    wanderers.push(actor);
  }
}

function updateWanderers(time, dt) {
  for (const hero of wanderers) {
    if (time < hero.pauseUntil) { hero.moving = false; continue; }
    if (!hero.path.length || hero.waypoint >= hero.path.length) {
      hero.moving = false;
      if (!chooseHeroDestination(hero, time)) continue;
    }
    const point = hero.path[hero.waypoint];
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
      continue;
    }
    const vx = dx / distance;
    const vy = dy / distance;
    const step = TOWN_HERO_WALK_SPEED * dt;
    const oldX = hero.x;
    const oldY = hero.y;
    const nx = hero.x + vx * step;
    const ny = hero.y + vy * step;
    if (canWanderStand(hero, nx, hero.y)) hero.x = nx;
    if (canWanderStand(hero, hero.x, ny)) hero.y = ny;
    if (hero.x !== oldX || hero.y !== oldY) {
      hero.moving = true;
      hero.facing = vx < -0.05 ? -1 : vx > 0.05 ? 1 : hero.facing;
    } else if (step > 0) {
      hero.path = [];
      hero.waypoint = 0;
      hero.pauseUntil = time + 350;
      hero.moving = false;
    }
  }
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
  const hop = player.moving ? Math.abs(Math.sin(time * .018)) * 4 : 0;
  const frame = playerIdleClip[Math.floor(((time + playerAnimationOffset) / 1000) * playerIdleFps) % playerIdleClip.length];
  const sprite = playerFrames?.[player.moving ? 'open' : frame];
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
  g.strokeStyle = INK; g.lineWidth = 1.7;
  g.beginPath(); g.moveTo(0, 1); g.lineTo(0, 4); g.moveTo(0, 4); g.quadraticCurveTo(-3, 7, -6, 4); g.moveTo(0, 4); g.quadraticCurveTo(3, 7, 6, 4); g.stroke();
  g.restore();
}

function drawBubble(g, time) {
  bubbleHit = null;
  const b = closestDoor();
  if (!b) return;
  let title;
  let prompt;
  if (b.id === 'castle') {
    title = `Castle Lv ${props.castleLevel}/3`;
    prompt = 'Press E or click to learn';
  } else {
    const plot = affordability.value.find((p) => p.id === b.id);
    title = `${plot?.def.name || b.id} Lv ${plot?.lvl || 0}/3`;
    prompt = 'Press E or click to upgrade';
  }
  const width = Math.max(198, Math.min(274, title.length * 9.2));
  const x = Math.max(8, Math.min(TOWN_WIDTH - width - 8, b.x + b.w / 2 - width / 2));
  const y = Math.max(8, b.y - 56 - Math.sin(time / 230) * 2);
  g.fillStyle = PALETTE.paper; g.strokeStyle = INK; g.lineWidth = 3;
  g.beginPath(); g.roundRect(x, y, width, 48, 8); g.fill(); g.stroke();
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 16px Georgia, "Palatino Linotype", serif';
  g.fillText(title, x + width / 2, y + 16);
  g.font = '600 12px Trebuchet MS, sans-serif';
  g.fillText(prompt, x + width / 2, y + 35);
  g.beginPath(); g.moveTo(b.door.x - 7, y + 48); g.lineTo(b.door.x, y + 56); g.lineTo(b.door.x + 7, y + 48); g.closePath(); g.fill(); g.stroke();
  bubbleHit = { id: b.id, x, y, w: width, h: 54 };
}

function drawAffordableArrows(g, time) {
  for (const plot of affordability.value) {
    if (!plot.cost || !plot.affordable) continue;
    const b = BUILDING_LAYOUT[plot.id];
    const x = b.x + b.w / 2;
    const y = b.y - 18 - Math.sin(time / 150) * 5;
    g.fillStyle = PALETTE.gold; g.strokeStyle = INK; g.lineWidth = 3; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x, y - 13); g.lineTo(x - 9, y - 3); g.lineTo(x - 4, y - 3); g.lineTo(x - 4, y + 7); g.lineTo(x + 4, y + 7); g.lineTo(x + 4, y - 3); g.lineTo(x + 9, y - 3); g.closePath(); g.fill(); g.stroke();
  }
}

function tick(time) {
  if (!ctx || !canvas.value) return;
  const dt = lastFrame ? Math.min((time - lastFrame) / 1000, 0.05) : 0;
  lastFrame = time;
  if (groundLayer) ctx.drawImage(groundLayer, 0, 0);

  let dx = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
  let dy = Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
  const magnitude = Math.hypot(dx, dy) || 1;
  if (dx || dy) { dx /= magnitude; dy /= magnitude; player.moving = true; player.facing = dx < 0 ? -1 : dx > 0 ? 1 : player.facing; }
  else if (player.path.length && player.waypoint < player.path.length) {
    const point = player.path[player.waypoint];
    dx = point.x - player.x; dy = point.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 3) { player.waypoint += 1; if (player.waypoint >= player.path.length) player.path = []; }
    else { dx /= distance; dy /= distance; player.moving = true; player.facing = dx < 0 ? -1 : dx > 0 ? 1 : player.facing; }
  }
  if ((keys.size || player.moving) && dt > 0 && (dx || dy)) {
    const step = TOWN_WALK_SPEED * dt;
    const nx = player.x + dx * step;
    const ny = player.y + dy * step;
    if (canStand(nx, player.y)) player.x = nx;
    if (canStand(player.x, ny)) player.y = ny;
  }
  player.moving = Boolean(dx || dy);
  updateWanderers(time, dt);

  const drawables = [
    ...objectCanvases.values(),
    ...wanderers.map((actor) => ({ id: actor.id, sortY: actor.y, actor })),
    { id: 'mayor', sortY: player.y, player: true },
  ];
  drawables.sort((a, b) => a.sortY - b.sortY);
  for (const item of drawables) {
    if (item.player) drawAvatar(ctx, time);
    else if (item.actor) drawWanderingHero(ctx, item.actor, time);
    else ctx.drawImage(item.canvas, item.x, item.y);
  }
  drawAffordableArrows(ctx, time);
  drawBubble(ctx, time);
  raf = requestAnimationFrame(tick);
}

function resize() {
  if (!frame.value || !canvas.value) return;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const rect = frame.value.getBoundingClientRect();
  canvas.value.width = Math.round(rect.width * dpr);
  canvas.value.height = Math.round(rect.height * dpr);
  ctx = canvas.value.getContext('2d', { alpha: false });
  const scale = Math.max(canvas.value.width / TOWN_WIDTH, canvas.value.height / TOWN_HEIGHT);
  const offsetX = (canvas.value.width - TOWN_WIDTH * scale) / 2;
  const offsetY = (canvas.value.height - TOWN_HEIGHT * scale) / 2;
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
}

onMounted(async () => {
  groundLayer = createGroundLayer();
  makeObjectCanvases();
  try {
    playerVisuals = await loadPlayerVisuals();
    playerIdleClip = playerVisuals.config.IDLE_CLIP;
    playerIdleFps = playerVisuals.config.IDLE_FPS;
    playerCrop = playerVisuals.visual.crop.open;
    playerFrames = tintedPlayerFrames(playerVisuals, props.avatarColor);
    playerAnimationOffset = Math.random() * playerVisuals.config.TIME_MS_PER_SECOND;
  } catch (error) { console.warn('[Town player sprite] Could not load player visuals.', error); }
  reducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  await initializeWanderers(performance.now());
  resize();
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
</script>

<template>
  <div class="town-shell">
    <div ref="frame" class="town-frame">
      <canvas
        ref="canvas"
        class="town-canvas"
        tabindex="0"
        aria-label="Walk around the kingdom town. Use WASD or arrow keys, or click the ground to move. Stand near a door and press E to open it."
        @pointerdown="onPointerDown"
      />
    </div>
  </div>
</template>

<style scoped>
.town-shell { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; background: #7fae58; }
.town-frame { width: 100%; height: 100%; overflow: hidden; background: #7fae58; }
.town-canvas { display: block; width: 100%; height: 100%; outline: none; cursor: crosshair; touch-action: none; }
.town-canvas:focus-visible { outline: 4px solid #f2ba55; outline-offset: -6px; }
</style>
