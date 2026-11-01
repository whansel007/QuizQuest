// ============================================================
// Shared canvas drawing primitives and town props: houses, trees,
// destinations and the northern battle camps. Building art lives in
// ./buildings so each building's upgrade stages stay together. Drawings
// use local canvas pixels; KingdomTown places the resulting canvases in
// world space.
// ============================================================

export const INK = '#23382F';
export const SHADOW = 'rgba(35,56,47,.22)';
export const CREAM = '#FFF4C9';
export const GOLD = '#F2BA55';
export const ROSE = '#D86F6B';
export const LAVENDER = '#8062A9';
export const LEAF = '#7FAE58';
export const BLUE = '#6DB8CF';
export const WOOD = '#9E6238';
export const DARK_WOOD = '#6B4128';

// ---- small drawing helpers ------------------------------------------------

export function shape(g, fill, draw, line = 3) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.fillStyle = fill;
  g.strokeStyle = INK;
  g.lineWidth = line;
  g.beginPath();
  draw();
  if (fill) g.fill();
  if (line) g.stroke();
}
export const rect = (g, x, y, w, h, fill, r = 3, line = 3) => shape(g, fill, () => g.roundRect(x, y, w, h, r), line);
export const circle = (g, x, y, r, fill, line = 3) => shape(g, fill, () => g.arc(x, y, r, 0, Math.PI * 2), line);
export const ellipse = (g, x, y, rx, ry, fill, line = 3, rot = 0) => shape(g, fill, () => g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2), line);
export function poly(g, points, fill, line = 3) {
  shape(g, fill, () => {
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) g.lineTo(points[i][0], points[i][1]);
    g.closePath();
  }, line);
}
export function stroke(g, points, color = INK, width = 3) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) g.lineTo(points[i][0], points[i][1]);
  g.stroke();
}
export function groundShadow(g, cx, gy, rx, ry = 8) {
  g.fillStyle = SHADOW;
  g.beginPath();
  g.ellipse(cx, gy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}
export function glow(g, x, y, r, color) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
export function sparkle(g, x, y, r, fill = GOLD, line = 1.5) {
  poly(g, [[x, y - r], [x + r * 0.3, y - r * 0.3], [x + r, y], [x + r * 0.3, y + r * 0.3], [x, y + r], [x - r * 0.3, y + r * 0.3], [x - r, y], [x - r * 0.3, y - r * 0.3]], fill, line);
}
export const gable = (g, x, y, w, h, fill, over = 8) => poly(g, [[x - over, y], [x + w / 2, y - h], [x + w + over, y]], fill);
export const cone = (g, cx, y, w, h, fill) => poly(g, [[cx - w / 2 - 4, y], [cx, y - h], [cx + w / 2 + 4, y]], fill);
export function dome(g, cx, y, w, h, fill) {
  shape(g, fill, () => { g.moveTo(cx - w / 2, y); g.bezierCurveTo(cx - w / 2, y - h * 1.3, cx + w / 2, y - h * 1.3, cx + w / 2, y); g.closePath(); });
}
export function archDoor(g, cx, gy, w, h, fill = '#8A5336') {
  shape(g, fill, () => {
    g.moveTo(cx - w / 2, gy);
    g.lineTo(cx - w / 2, gy - h + w / 2);
    g.arc(cx, gy - h + w / 2, w / 2, Math.PI, 0);
    g.lineTo(cx + w / 2, gy);
    g.closePath();
  });
  g.fillStyle = GOLD;
  g.beginPath(); g.arc(cx + w * 0.26, gy - h * 0.42, 2.2, 0, Math.PI * 2); g.fill();
}
export function archWindow(g, cx, y, w, h, fill = CREAM) {
  shape(g, fill, () => {
    g.moveTo(cx - w / 2, y + h);
    g.lineTo(cx - w / 2, y + w / 2);
    g.arc(cx, y + w / 2, w / 2, Math.PI, 0);
    g.lineTo(cx + w / 2, y + h);
    g.closePath();
  }, 2.5);
}
export function squareWindow(g, x, y, w, h, fill = CREAM) {
  rect(g, x, y, w, h, fill, 2, 2.5);
  stroke(g, [[x + w / 2, y + 1], [x + w / 2, y + h - 1]], INK, 1.5);
  stroke(g, [[x + 1, y + h / 2], [x + w - 1, y + h / 2]], INK, 1.5);
}
export function flag(g, x, y, color, h = 22) {
  stroke(g, [[x, y], [x, y - h]], INK, 2.5);
  poly(g, [[x, y - h], [x + 16, y - h + 5], [x, y - h + 11]], color, 2);
}
export function banner(g, x, y, w, h, color) {
  poly(g, [[x, y], [x + w, y], [x + w, y + h], [x + w / 2, y + h - 6], [x, y + h]], color, 2);
  sparkle(g, x + w / 2, y + h * 0.42, 4, GOLD, 1);
}
export function crenellations(g, x, y, w, fill, size = 8) {
  const count = Math.max(2, Math.round(w / (size * 1.8)));
  const step = w / count;
  for (let i = 0; i < count; i += 1) rect(g, x + i * step + step * 0.12, y - size, step * 0.76, size + 2, fill, 1, 2.5);
}
export function gear(g, x, y, r, fill = '#9FB0B5') {
  shape(g, fill, () => {
    const teeth = 8;
    for (let i = 0; i < teeth * 2; i += 1) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 ? r : r * 1.28;
      const a2 = a + Math.PI / (teeth * 2);
      if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      g.lineTo(x + Math.cos(a2) * rr, y + Math.sin(a2) * rr);
    }
    g.closePath();
  }, 2.5);
  circle(g, x, y, r * 0.4, '#5E6E74', 2);
}
export function radioWaves(g, x, y, count, color = LAVENDER) {
  for (let i = 1; i <= count; i += 1) {
    g.strokeStyle = color;
    g.globalAlpha = 0.85 - i * 0.18;
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y, 6 + i * 6, -Math.PI * 0.8, -Math.PI * 0.2); g.stroke();
  }
  g.globalAlpha = 1;
}
export function dish(g, x, y, r, facing = 1) {
  ellipse(g, x, y, r * 0.45, r, '#D5DEE2', 2.5, facing * 0.5);
  stroke(g, [[x, y], [x + facing * r * 0.9, y - r * 0.2]], INK, 2);
  circle(g, x + facing * r * 0.9, y - r * 0.2, 2, GOLD, 1.5);
}

// ---- level 0: a staked plot with scaffolding over a faint plan ------------

export function scaffold(g, W, H, fw) {
  const cx = W / 2; const gy = H - 8;
  const left = cx - fw / 2 + 6; const right = cx + fw / 2 - 6;
  for (const x of [left, cx, right]) stroke(g, [[x, gy], [x, gy - 70]], WOOD, 4);
  for (const y of [gy - 26, gy - 56]) stroke(g, [[left - 6, y], [right + 6, y]], '#C9A66B', 5);
  stroke(g, [[left, gy - 2], [cx, gy - 56]], 'rgba(107,65,40,.8)', 2.5);
  stroke(g, [[right, gy - 2], [cx, gy - 56]], 'rgba(107,65,40,.8)', 2.5);
  // plan sign
  stroke(g, [[cx - fw / 2 + 24, gy], [cx - fw / 2 + 24, gy - 28]], DARK_WOOD, 3);
  rect(g, cx - fw / 2 + 8, gy - 44, 32, 20, '#F7E7B5', 2, 2);
  sparkle(g, cx - fw / 2 + 24, gy - 34, 5, GOLD, 1.2);
}

// ---- houses, trees, rocks, flowers ---------------------------------------

const HOUSE_STYLES = [
  { wall: '#FFF1CF', roof: ROSE },
  { wall: '#E7F0D0', roof: '#4F86AE' },
  { wall: '#F7DDB9', roof: '#638F4B' },
  { wall: '#EFE3F2', roof: LAVENDER },
  { wall: '#FBE9C9', roof: '#B96448' },
];

export function drawHouse(g, variant, W, H) {
  const cx = W / 2; const gy = H - 8;
  const style = HOUSE_STYLES[variant % HOUSE_STYLES.length];
  const flip = variant % 2 ? -1 : 1;
  groundShadow(g, cx, gy, 36, 6);
  rect(g, cx + flip * 12 - 4, gy - 76, 9, 20, '#A55A3F', 2, 2.5);
  rect(g, cx - 28, gy - 40, 56, 40, style.wall, 3);
  gable(g, cx - 28, gy - 40, 56, 32, style.roof, 6);
  rect(g, cx - flip * 12 - 7, gy - 24, 14, 24, '#8A5336', 3, 2.5);
  squareWindow(g, cx + flip * 12 - 7, gy - 28, 14, 13);
  circle(g, cx, gy - 52, 4.5, CREAM, 2);
}

export function drawTree(g, W, H, kind = 'round') {
  const cx = W / 2; const gy = H - 4;
  groundShadow(g, cx, gy - 2, W * 0.34, 5);
  if (kind === 'pine') {
    rect(g, cx - 5, gy - 18, 10, 18, WOOD, 2, 2.5);
    const greens = ['#2F5E3E', '#3B7048', '#4A8352'];
    for (let i = 0; i < 3; i += 1) {
      const base = gy - 14 - i * (H * 0.22);
      const w = W * (0.48 - i * 0.1);
      poly(g, [[cx - w, base], [cx, base - H * 0.36], [cx + w, base]], greens[i]);
    }
    return;
  }
  rect(g, cx - W * 0.1, gy - H * 0.46, W * 0.2, H * 0.46, WOOD, 4);
  const greens = ['#467747', '#6E9C4B', '#91B95E'];
  [[cx, gy - H * 0.72, W * 0.3], [cx - W * 0.2, gy - H * 0.56, W * 0.26], [cx + W * 0.2, gy - H * 0.56, W * 0.26]]
    .forEach(([x, y, r], i) => circle(g, x, y, r, greens[i]));
  g.fillStyle = '#B9D77B';
  g.beginPath(); g.arc(cx - W * 0.08, gy - H * 0.76, 4, 0, Math.PI * 2); g.fill();
}

export function drawRock(g, W, H) {
  groundShadow(g, W / 2, H - 4, W * 0.45, 5);
  poly(g, [[3, H - 5], [W * 0.12, H * 0.5], [W * 0.38, 6], [W * 0.7, H * 0.2], [W - 3, H * 0.55], [W * 0.9, H - 5]], '#AAB6A0');
  stroke(g, [[W * 0.38, H * 0.28], [W * 0.5, H * 0.55], [W * 0.72, H * 0.34]], 'rgba(35,56,47,.45)', 2);
}

export function drawFlowers(g, W, H) {
  for (let i = 0; i < 5; i += 1) {
    const x = 4 + i * (W - 8) / 4;
    const y = H * (0.38 + (i % 2) * 0.25);
    stroke(g, [[x, H - 2], [x, y]], '#39724A', 2);
    g.fillStyle = [ROSE, GOLD, LAVENDER][i % 3];
    g.strokeStyle = INK; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}

export function drawWell(g, W, H) {
  const cx = W / 2; const gy = H - 6;
  groundShadow(g, cx, gy, 24, 5);
  rect(g, cx - 18, gy - 20, 36, 20, '#C9D3D6', 4);
  ellipse(g, cx, gy - 20, 18, 5, '#3D6E92', 2);
  stroke(g, [[cx - 15, gy - 20], [cx - 15, gy - 48]], WOOD, 4);
  stroke(g, [[cx + 15, gy - 20], [cx + 15, gy - 48]], WOOD, 4);
  poly(g, [[cx - 24, gy - 46], [cx, gy - 60], [cx + 24, gy - 46]], '#B96448');
}

// The tower's future barter corner: a request board beside a vintage radio.
// The notes are blank on purpose; trading is not live yet.
export function drawBarterCorner(g, W, H) {
  const gy = H - 6;
  groundShadow(g, W / 2, gy, W * 0.45, 5);
  stroke(g, [[10, gy], [10, gy - 52]], DARK_WOOD, 4);
  stroke(g, [[52, gy], [52, gy - 52]], DARK_WOOD, 4);
  rect(g, 4, gy - 56, 54, 34, '#C9A66B', 3);
  poly(g, [[0, gy - 56], [31, gy - 68], [62, gy - 56]], '#8A5336');
  [[10, gy - 50, CREAM], [27, gy - 52, '#FDE3B0'], [41, gy - 48, '#E9DDFB'], [16, gy - 36, '#DDEFC9']].forEach(([x, y, fill]) => {
    rect(g, x, y, 12, 11, fill, 1, 1.5);
    circle(g, x + 6, y + 1, 1.6, ROSE, 1);
  });
  // radio on a crate
  rect(g, W - 30, gy - 14, 26, 14, '#C9A66B', 2, 2.5);
  rect(g, W - 30, gy - 34, 26, 20, '#8A5336', 6, 2.5);
  circle(g, W - 22, gy - 24, 5, '#E8CB7A', 1.5);
  for (const y of [gy - 28, gy - 24, gy - 20]) stroke(g, [[W - 14, y], [W - 8, y]], INK, 1.2);
  stroke(g, [[W - 10, gy - 34], [W - 4, gy - 52]], INK, 2);
  radioWaves(g, W - 4, gy - 50, 2, GOLD);
}

export function drawTrailSign(g, W, H) {
  const cx = W / 2; const gy = H - 4;
  groundShadow(g, cx, gy, 14, 4);
  stroke(g, [[cx, gy], [cx, gy - 52]], DARK_WOOD, 5);
  poly(g, [[cx - 30, gy - 60], [cx + 18, gy - 60], [cx + 30, gy - 49], [cx + 18, gy - 38], [cx - 30, gy - 38]], '#C9A66B');
  g.fillStyle = INK;
  g.font = '800 10px Nunito, Trebuchet MS, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('BATTLES', cx - 4, gy - 49);
  // the arrow points north toward the clearing
  poly(g, [[cx - 6, gy - 70], [cx, gy - 80], [cx + 6, gy - 70]], GOLD, 2);
}

// ---- northern clearing: Duel and Campfire Run camps -----------------------

function signBoard(g, cx, gy, title, subtitle, width = 132) {
  stroke(g, [[cx - width / 2 + 12, gy], [cx - width / 2 + 12, gy - 46]], DARK_WOOD, 5);
  stroke(g, [[cx + width / 2 - 12, gy], [cx + width / 2 - 12, gy - 46]], DARK_WOOD, 5);
  rect(g, cx - width / 2, gy - 84, width, 44, '#F7E7B5', 6);
  g.fillStyle = INK;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 16px Georgia, "Palatino Linotype", serif';
  g.fillText(title, cx, gy - 70, width - 12);
  g.font = '700 11px Nunito, Trebuchet MS, sans-serif';
  g.fillText(subtitle, cx, gy - 52, width - 12);
}

// Both camps are laid out from the left edge of their canvas: the sign first,
// then the pack or the fire, so nothing can be drawn past the canvas edge.
const CAMP_SIGN_W = 160;
const CAMP_SIGN_X = 8 + CAMP_SIGN_W / 2;

export function drawDuelCamp(g, W, H) {
  const gy = H - 10;
  ellipse(g, W / 2, gy - 18, W * 0.46, 26, '#C9A66B', 0);
  signBoard(g, CAMP_SIGN_X, gy - 30, 'Duel', 'A one-on-one quiz battle', CAMP_SIGN_W);
  // the travel pack resting on a stump, to the right of the sign
  const px = CAMP_SIGN_W + 45;
  ellipse(g, px, gy - 6, 26, 8, '#9E6238');
  rect(g, px - 26, gy - 22, 52, 18, '#B57A48', 4);
  rect(g, px - 20, gy - 84, 40, 62, '#B96448', 12);
  rect(g, px - 22, gy - 92, 44, 26, '#9E4E36', 10);
  rect(g, px - 18, gy - 108, 36, 14, BLUE, 7);
  stroke(g, [[px - 12, gy - 66], [px - 12, gy - 26]], '#6B3A26', 3);
  stroke(g, [[px + 12, gy - 66], [px + 12, gy - 26]], '#6B3A26', 3);
  rect(g, px - 6, gy - 50, 12, 14, '#E3B862', 3, 2);
  circle(g, px, gy - 70, 3, GOLD, 1.5);
  // a rolled quiz scroll leaning on the pack
  g.save(); g.translate(px + 32, gy - 34); g.rotate(0.35);
  rect(g, -5, -20, 10, 40, '#F7E7B5', 4, 2);
  g.restore();
}

// The fire's centre in this canvas; TOWN_DESTINATIONS.campfire.flame must
// point at the same spot in the world (art x + CAMPFIRE_FIRE_X).
export const CAMPFIRE_FIRE_X = CAMP_SIGN_W + 40;

export function drawCampfireCamp(g, W, H) {
  const gy = H - 10;
  const fx = CAMPFIRE_FIRE_X;
  ellipse(g, W / 2, gy - 18, W * 0.46, 26, '#C9A66B', 0);
  signBoard(g, CAMP_SIGN_X, gy - 30, 'Campfire Run', 'Defend the campfire', CAMP_SIGN_W);
  // log seats either side of the fire
  rect(g, fx - 49, gy - 6, 30, 10, WOOD, 5, 2.5);
  rect(g, fx + 19, gy - 6, 30, 10, WOOD, 5, 2.5);
  // stone ring and crossed logs; the flames are drawn live each frame
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ellipse(g, fx + Math.cos(a) * 22, gy - 26 + Math.sin(a) * 8, 6, 4.5, '#AAB6A0', 2);
  }
  stroke(g, [[fx - 15, gy - 22], [fx + 15, gy - 32]], INK, 8);
  stroke(g, [[fx - 15, gy - 22], [fx + 15, gy - 32]], WOOD, 5);
  stroke(g, [[fx + 15, gy - 22], [fx - 15, gy - 32]], INK, 8);
  stroke(g, [[fx + 15, gy - 22], [fx - 15, gy - 32]], DARK_WOOD, 5);
}

// Animated flame for the campfire camp (world-space, drawn every frame).
export function drawFlame(g, x, y, time, still = false) {
  const t = still ? 0 : time / 160;
  glow(g, x, y - 16, 34, 'rgba(242,186,85,.45)');
  const layers = [['#EF7137', 18, 34], [GOLD, 12, 25], ['#FFF1B8', 6, 14]];
  for (const [color, w, h] of layers) {
    const sway = Math.sin(t + w) * 2.5;
    const lift = Math.sin(t * 1.7 + h) * 2;
    shape(g, color, () => {
      g.moveTo(x - w, y);
      g.quadraticCurveTo(x - w, y - h * 0.6, x + sway, y - h - lift);
      g.quadraticCurveTo(x + w, y - h * 0.6, x + w, y);
      g.closePath();
    }, color === '#EF7137' ? 2.5 : 0);
  }
}

// Draw a building's selected upgrade stage to a local canvas layer. Unbuilt
// plots show a faded preview of stage one underneath shared scaffolding.
export function drawBuildingStages(g, stages, level, W, H, footprintW) {
  if (level <= 0) {
    const plan = document.createElement('canvas');
    plan.width = W; plan.height = H;
    stages[0](plan.getContext('2d'), W, H);
    g.save();
    g.globalAlpha = 0.38;
    if ('filter' in g) g.filter = 'grayscale(0.7)';
    g.drawImage(plan, 0, 0);
    g.restore();
    scaffold(g, W, H, footprintW);
    return;
  }
  stages[Math.min(stages.length, level) - 1](g, W, H);
}
