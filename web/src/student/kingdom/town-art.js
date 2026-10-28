// ============================================================
// Kingdom town art: purpose-drawn canvas illustrations for the
// buildings (three upgrade stages each), houses, trees, props and
// the northern battle camps. Every drawing works in local canvas
// pixels with the ground line near the bottom edge; KingdomTown
// places each canvas so that ground line sits on the footprint.
// ============================================================

export const INK = '#23382F';
const SHADOW = 'rgba(35,56,47,.22)';
const CREAM = '#FFF4C9';
const GOLD = '#F2BA55';
const ROSE = '#D86F6B';
const LAVENDER = '#8062A9';
const LEAF = '#7FAE58';
const BLUE = '#6DB8CF';
const WOOD = '#9E6238';
const DARK_WOOD = '#6B4128';

// ---- small drawing helpers ------------------------------------------------

function shape(g, fill, draw, line = 3) {
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
const rect = (g, x, y, w, h, fill, r = 3, line = 3) => shape(g, fill, () => g.roundRect(x, y, w, h, r), line);
const circle = (g, x, y, r, fill, line = 3) => shape(g, fill, () => g.arc(x, y, r, 0, Math.PI * 2), line);
const ellipse = (g, x, y, rx, ry, fill, line = 3, rot = 0) => shape(g, fill, () => g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2), line);
function poly(g, points, fill, line = 3) {
  shape(g, fill, () => {
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) g.lineTo(points[i][0], points[i][1]);
    g.closePath();
  }, line);
}
function stroke(g, points, color = INK, width = 3) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) g.lineTo(points[i][0], points[i][1]);
  g.stroke();
}
function groundShadow(g, cx, gy, rx, ry = 8) {
  g.fillStyle = SHADOW;
  g.beginPath();
  g.ellipse(cx, gy, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
}
function glow(g, x, y, r, color) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}
function sparkle(g, x, y, r, fill = GOLD, line = 1.5) {
  poly(g, [[x, y - r], [x + r * 0.3, y - r * 0.3], [x + r, y], [x + r * 0.3, y + r * 0.3], [x, y + r], [x - r * 0.3, y + r * 0.3], [x - r, y], [x - r * 0.3, y - r * 0.3]], fill, line);
}
const gable = (g, x, y, w, h, fill, over = 8) => poly(g, [[x - over, y], [x + w / 2, y - h], [x + w + over, y]], fill);
const cone = (g, cx, y, w, h, fill) => poly(g, [[cx - w / 2 - 4, y], [cx, y - h], [cx + w / 2 + 4, y]], fill);
function dome(g, cx, y, w, h, fill) {
  shape(g, fill, () => { g.moveTo(cx - w / 2, y); g.bezierCurveTo(cx - w / 2, y - h * 1.3, cx + w / 2, y - h * 1.3, cx + w / 2, y); g.closePath(); });
}
function archDoor(g, cx, gy, w, h, fill = '#8A5336') {
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
function archWindow(g, cx, y, w, h, fill = CREAM) {
  shape(g, fill, () => {
    g.moveTo(cx - w / 2, y + h);
    g.lineTo(cx - w / 2, y + w / 2);
    g.arc(cx, y + w / 2, w / 2, Math.PI, 0);
    g.lineTo(cx + w / 2, y + h);
    g.closePath();
  }, 2.5);
}
// An arched window filled with colourful book spines: the library's tell.
function shelfWindow(g, cx, y, w, h) {
  archWindow(g, cx, y, w, h, '#5C4A6E');
  const colors = [ROSE, GOLD, BLUE, LEAF, '#F7E7B5', LAVENDER];
  const shelfY = [y + h * 0.45, y + h - 3];
  shelfY.forEach((sy, row) => {
    const books = Math.max(3, Math.floor(w / 5));
    for (let i = 0; i < books; i += 1) {
      const bw = (w - 6) / books;
      const bh = h * 0.3 - (i % 2) * 2;
      g.fillStyle = colors[(i + row * 2) % colors.length];
      g.fillRect(cx - w / 2 + 3 + i * bw, sy - bh, bw - 1, bh);
    }
    stroke(g, [[cx - w / 2 + 2, sy], [cx + w / 2 - 2, sy]], INK, 1.5);
  });
}
function squareWindow(g, x, y, w, h, fill = CREAM) {
  rect(g, x, y, w, h, fill, 2, 2.5);
  stroke(g, [[x + w / 2, y + 1], [x + w / 2, y + h - 1]], INK, 1.5);
  stroke(g, [[x + 1, y + h / 2], [x + w - 1, y + h / 2]], INK, 1.5);
}
function flag(g, x, y, color, h = 22) {
  stroke(g, [[x, y], [x, y - h]], INK, 2.5);
  poly(g, [[x, y - h], [x + 16, y - h + 5], [x, y - h + 11]], color, 2);
}
function banner(g, x, y, w, h, color) {
  poly(g, [[x, y], [x + w, y], [x + w, y + h], [x + w / 2, y + h - 6], [x, y + h]], color, 2);
  sparkle(g, x + w / 2, y + h * 0.42, 4, GOLD, 1);
}
function crenellations(g, x, y, w, fill, size = 8) {
  const count = Math.max(2, Math.round(w / (size * 1.8)));
  const step = w / count;
  for (let i = 0; i < count; i += 1) rect(g, x + i * step + step * 0.12, y - size, step * 0.76, size + 2, fill, 1, 2.5);
}
function gear(g, x, y, r, fill = '#9FB0B5') {
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
function radioWaves(g, x, y, count, color = LAVENDER) {
  for (let i = 1; i <= count; i += 1) {
    g.strokeStyle = color;
    g.globalAlpha = 0.85 - i * 0.18;
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y, 6 + i * 6, -Math.PI * 0.8, -Math.PI * 0.2); g.stroke();
  }
  g.globalAlpha = 1;
}
function dish(g, x, y, r, facing = 1) {
  ellipse(g, x, y, r * 0.45, r, '#D5DEE2', 2.5, facing * 0.5);
  stroke(g, [[x, y], [x + facing * r * 0.9, y - r * 0.2]], INK, 2);
  circle(g, x + facing * r * 0.9, y - r * 0.2, 2, GOLD, 1.5);
}

// ---- Library (west): shelves, books, scrolls and soft glyph light ---------

const LIB = { wall: '#EDE0BE', shade: '#D9C79C', roof: '#4F86AE', roofDark: '#3D6E92' };

function libraryStage1(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 92);
  rect(g, cx - 70, gy - 72, 140, 72, LIB.wall, 4);
  rect(g, cx - 70, gy - 10, 140, 10, LIB.shade, 2, 2);
  gable(g, cx - 70, gy - 72, 140, 50, LIB.roof, 10);
  stroke(g, [[cx - 80, gy - 72], [cx + 80, gy - 72]], INK, 3);
  circle(g, cx, gy - 92, 11, CREAM, 2.5);
  sparkle(g, cx, gy - 92, 7, LAVENDER, 1.2);
  shelfWindow(g, cx - 46, gy - 60, 28, 38);
  shelfWindow(g, cx + 46, gy - 60, 28, 38);
  archDoor(g, cx, gy - 4, 30, 46);
  rect(g, cx - 22, gy - 5, 44, 6, LIB.shade, 2, 2);
  // open-book plaque above the door
  poly(g, [[cx - 14, gy - 58], [cx, gy - 54], [cx, gy - 46], [cx - 14, gy - 50]], CREAM, 2);
  poly(g, [[cx + 14, gy - 58], [cx, gy - 54], [cx, gy - 46], [cx + 14, gy - 50]], CREAM, 2);
}

function libraryStage2(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx - 10, gy, 102);
  // reading tower on the left, then the widened hall
  const tx = cx - 80;
  rect(g, tx - 23, gy - 128, 46, 128, LIB.wall, 4);
  dome(g, tx, gy - 128, 56, 30, LIB.roofDark);
  sparkle(g, tx, gy - 170, 7, GOLD);
  glow(g, tx, gy - 98, 18, 'rgba(187,166,230,.75)');
  circle(g, tx, gy - 98, 10, '#E9DDFB', 2.5);
  sparkle(g, tx, gy - 98, 6, LAVENDER, 1.2);
  shelfWindow(g, tx, gy - 66, 22, 34);
  rect(g, cx - 62, gy - 80, 124, 80, LIB.wall, 4);
  rect(g, cx - 62, gy - 10, 124, 10, LIB.shade, 2, 2);
  gable(g, cx - 62, gy - 80, 124, 52, LIB.roof, 9);
  circle(g, cx, gy - 102, 11, CREAM, 2.5);
  sparkle(g, cx, gy - 102, 7, LAVENDER, 1.2);
  shelfWindow(g, cx - 38, gy - 66, 28, 40);
  shelfWindow(g, cx + 38, gy - 66, 28, 40);
  archDoor(g, cx, gy - 4, 30, 48);
  // scroll basket by the door
  rect(g, cx + 66, gy - 18, 16, 18, '#C9A66B', 3, 2);
  for (const dx of [-4, 0, 4]) ellipse(g, cx + 74 + dx, gy - 22, 3, 6, '#F7E7B5', 1.5);
}

function libraryStage3(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 104);
  for (const side of [-1, 1]) {
    const tx = cx + side * 80;
    rect(g, tx - 22, gy - 140, 44, 140, LIB.wall, 4);
    dome(g, tx, gy - 140, 54, 30, LIB.roofDark);
    sparkle(g, tx, gy - 182, 7, GOLD);
    shelfWindow(g, tx, gy - 116, 20, 30);
    shelfWindow(g, tx, gy - 62, 22, 34);
    banner(g, tx - 9, gy - 82, 18, 16, LAVENDER);
  }
  rect(g, cx - 58, gy - 96, 116, 96, LIB.wall, 4);
  rect(g, cx - 58, gy - 10, 116, 10, LIB.shade, 2, 2);
  gable(g, cx - 58, gy - 96, 116, 58, LIB.roof, 8);
  glow(g, cx, gy - 116, 26, 'rgba(187,166,230,.8)');
  circle(g, cx, gy - 116, 15, '#E9DDFB', 3);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    stroke(g, [[cx, gy - 116], [cx + Math.cos(a) * 14, gy - 116 + Math.sin(a) * 14]], LAVENDER, 1.5);
  }
  sparkle(g, cx, gy - 116, 6, GOLD, 1.2);
  shelfWindow(g, cx - 34, gy - 78, 24, 40);
  shelfWindow(g, cx + 34, gy - 78, 24, 40);
  archDoor(g, cx, gy - 4, 36, 56);
  rect(g, cx - 26, gy - 5, 52, 6, LIB.shade, 2, 2);
  // a few books floating in their own glow
  [[cx - 40, gy - 172, -0.3, ROSE], [cx + 2, gy - 186, 0.15, BLUE], [cx + 42, gy - 170, 0.35, GOLD]].forEach(([x, y, rot, color]) => {
    glow(g, x, y, 14, 'rgba(255,241,184,.8)');
    g.save(); g.translate(x, y); g.rotate(rot);
    rect(g, -9, -6, 18, 12, color, 2, 2);
    stroke(g, [[0, -6], [0, 6]], INK, 1.5);
    g.restore();
  });
}

// ---- Workshop (east): training gym for physical heroes --------------------

const WS = { wall: '#F2A76C', shade: '#D98A52', roof: '#B96448', metal: '#9FB0B5' };

function punchingBag(g, x, gy, h = 82) {
  stroke(g, [[x + 16, gy], [x + 16, gy - h]], DARK_WOOD, 5);
  stroke(g, [[x + 16, gy - h], [x - 6, gy - h]], DARK_WOOD, 5);
  stroke(g, [[x - 2, gy - h], [x - 2, gy - h + 14]], INK, 2);
  rect(g, x - 11, gy - h + 14, 18, 36, ROSE, 8);
  stroke(g, [[x - 11, gy - h + 22], [x + 7, gy - h + 22]], INK, 1.5);
}
function strawTarget(g, x, gy) {
  stroke(g, [[x - 10, gy], [x, gy - 30]], DARK_WOOD, 4);
  stroke(g, [[x + 10, gy], [x, gy - 30]], DARK_WOOD, 4);
  circle(g, x, gy - 40, 18, '#E8CB7A');
  circle(g, x, gy - 40, 11, '#FFF8E4', 2);
  circle(g, x, gy - 40, 5, ROSE, 2);
}
function shieldRack(g, x, gy) {
  rect(g, x - 18, gy - 34, 36, 6, WOOD, 2, 2);
  stroke(g, [[x - 15, gy], [x - 15, gy - 34]], DARK_WOOD, 4);
  stroke(g, [[x + 15, gy], [x + 15, gy - 34]], DARK_WOOD, 4);
  poly(g, [[x - 11, gy - 28], [x - 1, gy - 28], [x - 1, gy - 16], [x - 6, gy - 9], [x - 11, gy - 16]], BLUE, 2);
  stroke(g, [[x + 7, gy - 4], [x + 7, gy - 32]], '#C9D3D6', 3);
  stroke(g, [[x + 3, gy - 12], [x + 11, gy - 12]], INK, 2);
}
function fence(g, x1, x2, gy, h = 16) {
  for (let x = x1; x <= x2; x += 13) stroke(g, [[x, gy], [x, gy - h]], WOOD, 4);
  stroke(g, [[x1, gy - h * 0.7], [x2, gy - h * 0.7]], WOOD, 3);
}
function barnDoor(g, cx, gy, w, h) {
  rect(g, cx - w / 2, gy - h, w, h, '#7A4A2E', 3);
  stroke(g, [[cx, gy - h + 2], [cx, gy - 2]], INK, 2);
  stroke(g, [[cx - w / 2 + 3, gy - h + 3], [cx - 3, gy - 3]], '#5B3A26', 2.5);
  stroke(g, [[cx + w / 2 - 3, gy - h + 3], [cx + 3, gy - 3]], '#5B3A26', 2.5);
}

function workshopStage1(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx + 12, gy, 96);
  rect(g, cx - 60, gy - 66, 120, 66, WS.wall, 4);
  for (const x of [cx - 40, cx + 40]) stroke(g, [[x, gy - 64], [x, gy - 2]], WS.shade, 3);
  gable(g, cx - 60, gy - 66, 120, 40, WS.roof, 10);
  gear(g, cx, gy - 82, 9);
  barnDoor(g, cx, gy, 44, 44);
  squareWindow(g, cx - 52, gy - 52, 18, 18);
  squareWindow(g, cx + 34, gy - 52, 18, 18);
  punchingBag(g, cx + 86, gy);
}

function workshopStage2(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 118);
  // fenced training yard on the left, weapon rack on the right
  fence(g, 10, cx - 68, gy - 2);
  strawTarget(g, cx - 106, gy - 4);
  punchingBag(g, cx - 84, gy - 2, 70);
  shieldRack(g, cx + 90, gy - 3);
  rect(g, cx - 64, gy - 74, 128, 74, WS.wall, 4);
  for (const x of [cx - 32, cx + 32]) stroke(g, [[x, gy - 72], [x, gy - 2]], WS.shade, 3);
  rect(g, cx + 30, gy - 132, 18, 40, '#A55A3F', 2);
  gable(g, cx - 64, gy - 74, 128, 44, WS.roof, 10);
  gear(g, cx + 39, gy - 138, 10);
  gear(g, cx, gy - 92, 9);
  barnDoor(g, cx, gy, 46, 48);
  squareWindow(g, cx - 56, gy - 56, 18, 18);
  squareWindow(g, cx + 38, gy - 56, 18, 18);
}

function workshopStage3(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 124);
  // pilot's mech gantry over the yard, with the bag hanging from its beam
  stroke(g, [[12, gy], [12, gy - 112]], '#6F8288', 5);
  stroke(g, [[cx - 72, gy], [cx - 72, gy - 112]], '#6F8288', 5);
  stroke(g, [[8, gy - 112], [cx - 66, gy - 112]], '#6F8288', 6);
  stroke(g, [[12, gy - 70], [cx - 72, gy - 104]], '#8E9EA6', 2.5);
  stroke(g, [[30, gy - 112], [30, gy - 92]], INK, 2);
  poly(g, [[22, gy - 92], [38, gy - 92], [42, gy - 80], [34, gy - 84], [26, gy - 84], [18, gy - 80]], '#C9D3D6', 2);
  stroke(g, [[cx - 94, gy - 112], [cx - 94, gy - 86]], INK, 2);
  rect(g, cx - 103, gy - 86, 18, 36, ROSE, 8);
  fence(g, 10, cx - 76, gy - 2);
  strawTarget(g, cx + 100, gy - 4);
  rect(g, cx - 66, gy - 104, 132, 104, WS.wall, 4);
  stroke(g, [[cx - 66, gy - 54], [cx + 66, gy - 54]], WS.shade, 3);
  // saw-tooth gym roof
  const teeth = 3; const tw = 132 / teeth;
  for (let i = 0; i < teeth; i += 1) {
    const x = cx - 66 + i * tw;
    poly(g, [[x - 2, gy - 104], [x + tw * 0.7, gy - 136], [x + tw * 0.7, gy - 104]], WS.roof);
    rect(g, x + tw * 0.7 - 1, gy - 136, tw * 0.3, 32, '#BFE1EC', 1, 2.5);
  }
  gear(g, cx + 38, gy - 80, 15);
  shieldRack(g, cx - 34, gy - 58);
  barnDoor(g, cx, gy, 50, 48);
  squareWindow(g, cx + 36, gy - 40, 20, 20);
  squareWindow(g, cx - 56, gy - 40, 18, 20);
}

// ---- Garden (north): celestial garden, fountain and telescope -------------

const GARDEN = { lawn: '#9CC86E', hedge: '#4F8A4A', hedgeLight: '#6EA451', path: '#E6D3A3', stone: '#C9D3D6' };

function flowerBed(g, x, y, w) {
  ellipse(g, x, y, w / 2, 7, '#8A6A45', 2);
  const colors = [ROSE, GOLD, LAVENDER, '#FFF8E4'];
  for (let i = 0; i < 5; i += 1) {
    const fx = x - w / 2 + 5 + i * (w - 10) / 4;
    g.fillStyle = colors[i % colors.length];
    g.strokeStyle = INK; g.lineWidth = 1.2;
    g.beginPath(); g.arc(fx, y - 4 - (i % 2) * 3, 3.2, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}
function fountain(g, cx, gy, tiers) {
  ellipse(g, cx, gy, 24 + tiers * 3, 9 + tiers, GARDEN.stone);
  ellipse(g, cx, gy - 2, 19 + tiers * 3, 6 + tiers, BLUE, 2);
  let top = gy;
  for (let t = 1; t < tiers; t += 1) {
    const y = gy - 14 * t;
    stroke(g, [[cx, top - 2], [cx, y]], INK, 5);
    stroke(g, [[cx, top - 2], [cx, y]], GARDEN.stone, 2.5);
    ellipse(g, cx, y, 14 - t * 3, 5, GARDEN.stone, 2.5);
    ellipse(g, cx, y - 1, 10 - t * 3, 3, BLUE, 1.5);
    top = y;
  }
  // water jet and droplets
  g.strokeStyle = '#BFE6F2'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx, top - 3); g.quadraticCurveTo(cx - 8, top - 22, cx - 14, top - 6); g.stroke();
  g.beginPath(); g.moveTo(cx, top - 3); g.quadraticCurveTo(cx + 8, top - 22, cx + 14, top - 6); g.stroke();
  if (tiers >= 3) sparkle(g, cx, top - 18, 6, GOLD);
}
function telescope(g, x, gy, size = 1) {
  const s = size;
  stroke(g, [[x, gy - 26 * s], [x - 12 * s, gy]], DARK_WOOD, 3);
  stroke(g, [[x, gy - 26 * s], [x + 12 * s, gy]], DARK_WOOD, 3);
  stroke(g, [[x, gy - 26 * s], [x, gy]], DARK_WOOD, 3);
  g.save(); g.translate(x, gy - 28 * s); g.rotate(-0.65);
  rect(g, -10 * s, -6 * s, 40 * s, 12 * s, '#C8963E', 4, 2.5);
  rect(g, 28 * s, -8 * s, 8 * s, 16 * s, '#E3B862', 2, 2.5);
  rect(g, -16 * s, -3.5 * s, 7 * s, 7 * s, '#6F8288', 2, 2);
  g.restore();
}
function starLantern(g, x, gy, h = 42) {
  stroke(g, [[x, gy], [x, gy - h]], INK, 3);
  glow(g, x, gy - h - 6, 15, 'rgba(255,233,160,.8)');
  sparkle(g, x, gy - h - 6, 7, GOLD, 1.5);
}
function gardenPlot(g, cx, gy, hedgeH, gateArch) {
  // lawn seen from above, enclosed by hedges with a south gate
  rect(g, cx - 82, gy - 92, 164, 90, GARDEN.lawn, 12);
  rect(g, cx - 84, gy - 98, 168, hedgeH, GARDEN.hedge, 8);
  rect(g, cx - 86, gy - 96, 14, 94, GARDEN.hedge, 7);
  rect(g, cx + 72, gy - 96, 14, 94, GARDEN.hedge, 7);
  // stone path from the gate to the fountain
  rect(g, cx - 10, gy - 44, 20, 42, GARDEN.path, 4, 2);
  rect(g, cx - 86, gy - hedgeH * 0.7, 70, hedgeH * 0.7 + 2, GARDEN.hedgeLight, 7);
  rect(g, cx + 16, gy - hedgeH * 0.7, 70, hedgeH * 0.7 + 2, GARDEN.hedgeLight, 7);
  if (gateArch) {
    g.strokeStyle = INK; g.lineWidth = 7;
    g.beginPath(); g.arc(cx, gy - 22, 22, Math.PI, 0); g.stroke();
    g.strokeStyle = '#5E9A50'; g.lineWidth = 4;
    g.beginPath(); g.arc(cx, gy - 22, 22, Math.PI, 0); g.stroke();
    stroke(g, [[cx - 22, gy - 22], [cx - 22, gy]], INK, 4);
    stroke(g, [[cx + 22, gy - 22], [cx + 22, gy]], INK, 4);
    sparkle(g, cx, gy - 48, 7, GOLD);
  }
}

function gardenStage1(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 90);
  gardenPlot(g, cx, gy, 16, false);
  flowerBed(g, cx - 50, gy - 56, 34);
  flowerBed(g, cx - 46, gy - 26, 26);
  fountain(g, cx, gy - 52, 1);
  telescope(g, cx + 48, gy - 30, 0.9);
}

function gardenStage2(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 92);
  gardenPlot(g, cx, gy, 20, true);
  starLantern(g, cx - 72, gy - 92);
  starLantern(g, cx + 72, gy - 92);
  flowerBed(g, cx - 50, gy - 60, 34);
  flowerBed(g, cx - 48, gy - 30, 30);
  flowerBed(g, cx + 42, gy - 64, 26);
  fountain(g, cx, gy - 54, 2);
  // raised round platform with a railing for the telescope
  ellipse(g, cx + 48, gy - 22, 22, 8, '#D8C392');
  stroke(g, [[cx + 28, gy - 22], [cx + 28, gy - 32], [cx + 68, gy - 32], [cx + 68, gy - 22]], INK, 2);
  telescope(g, cx + 48, gy - 24, 1.1);
}

function gardenStage3(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 94);
  gardenPlot(g, cx, gy, 22, true);
  // observatory pavilion at the back of the garden
  const ox = cx - 46;
  rect(g, ox - 26, gy - 128, 52, 34, '#E9DDFB', 3);
  dome(g, ox, gy - 128, 58, 28, '#5C6FA8');
  rect(g, ox - 4, gy - 160, 8, 30, '#2E3E66', 1, 2);
  g.save(); g.translate(ox + 2, gy - 150); g.rotate(-0.8);
  rect(g, -4, -5, 26, 10, '#C8963E', 3, 2);
  g.restore();
  archWindow(g, ox, gy - 120, 14, 24, '#FFE7A3');
  for (const x of [cx - 76, cx + 76]) starLantern(g, x, gy - 92);
  for (const x of [cx - 76, cx + 76]) starLantern(g, x, gy - 6, 34);
  flowerBed(g, cx - 50, gy - 66, 30);
  flowerBed(g, cx - 50, gy - 32, 34);
  flowerBed(g, cx + 50, gy - 74, 28);
  fountain(g, cx, gy - 54, 3);
  ellipse(g, cx + 50, gy - 24, 24, 9, '#D8C392');
  stroke(g, [[cx + 28, gy - 24], [cx + 28, gy - 34], [cx + 72, gy - 34], [cx + 72, gy - 24]], INK, 2);
  telescope(g, cx + 50, gy - 26, 1.25);
  // constellation sparkles above the garden
  const stars = [[cx + 8, gy - 150], [cx + 34, gy - 138], [cx + 58, gy - 152], [cx + 74, gy - 130]];
  g.strokeStyle = 'rgba(128,98,169,.55)'; g.lineWidth = 1.5;
  g.beginPath(); stars.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  stars.forEach(([x, y]) => sparkle(g, x, y, 5, GOLD, 1.2));
}

// ---- Tower (south): broadcast tower --------------------------------------

const TW = { stone: '#C9B8DD', shade: '#A58FC4', roof: LAVENDER };

function lattice(g, cx, bottom, top, wb, wt) {
  stroke(g, [[cx - wb, bottom], [cx - wt, top]], INK, 3.5);
  stroke(g, [[cx + wb, bottom], [cx + wt, top]], INK, 3.5);
  const steps = 4;
  for (let i = 0; i < steps; i += 1) {
    const y1 = bottom + (top - bottom) * (i / steps);
    const y2 = bottom + (top - bottom) * ((i + 1) / steps);
    const w1 = wb + (wt - wb) * (i / steps);
    const w2 = wb + (wt - wb) * ((i + 1) / steps);
    stroke(g, [[cx - w1, y1], [cx + w2, y2]], '#5E6E74', 2);
    stroke(g, [[cx + w1, y1], [cx - w2, y2]], '#5E6E74', 2);
  }
}
function antennaTop(g, cx, y, prongs = 1) {
  if (prongs === 1) stroke(g, [[cx, y], [cx, y - 18]], INK, 2.5);
  else for (const dx of [-8, 0, 8]) stroke(g, [[cx + dx * 0.4, y], [cx + dx, y - 16 - (dx ? 0 : 4)]], INK, 2.5);
  glow(g, cx, y - 20, 9, 'rgba(239,113,55,.7)');
  circle(g, cx, y - 20, 3.5, '#EF7137', 1.5);
}
function towerBase(g, cx, gy, w, h) {
  rect(g, cx - w / 2, gy - h, w, h, TW.stone, 4);
  for (let row = 1; row < 3; row += 1) stroke(g, [[cx - w / 2 + 2, gy - h * row / 3], [cx + w / 2 - 2, gy - h * row / 3]], TW.shade, 2);
  rect(g, cx - w / 2 - 4, gy - h - 7, w + 8, 9, TW.shade, 2, 2.5);
}

function towerStage1(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 62);
  lattice(g, cx, gy - 54, gy - 122, 15, 4);
  antennaTop(g, cx, gy - 122);
  dish(g, cx + 10, gy - 92, 11, 1);
  radioWaves(g, cx, gy - 142, 2);
  towerBase(g, cx, gy, 90, 50);
  archDoor(g, cx, gy - 2, 24, 36);
  archWindow(g, cx - 30, gy - 40, 12, 16);
  archWindow(g, cx + 30, gy - 40, 12, 16);
}

function towerStage2(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 66);
  lattice(g, cx, gy - 100, gy - 146, 12, 4);
  antennaTop(g, cx, gy - 146);
  dish(g, cx + 10, gy - 122, 11, 1);
  dish(g, cx - 10, gy - 112, 10, -1);
  radioWaves(g, cx, gy - 166, 3);
  towerBase(g, cx, gy, 94, 50);
  towerBase(g, cx, gy - 56, 64, 40);
  circle(g, cx, gy - 78, 9, CREAM, 2.5);
  sparkle(g, cx, gy - 78, 5, LAVENDER, 1);
  archDoor(g, cx, gy - 2, 24, 36);
  archWindow(g, cx - 32, gy - 40, 12, 16);
  archWindow(g, cx + 32, gy - 40, 12, 16);
}

function towerStage3(g, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 70);
  lattice(g, cx, gy - 132, gy - 152, 9, 4);
  antennaTop(g, cx, gy - 152, 3);
  flag(g, cx + 26, gy - 132, GOLD, 26);
  towerBase(g, cx, gy, 100, 50);
  towerBase(g, cx, gy - 56, 70, 36);
  // upper broadcast cabin with a balcony rail
  rect(g, cx - 28, gy - 128, 56, 30, '#E9DDFB', 3);
  cone(g, cx, gy - 128, 56, 8, TW.roof);
  squareWindow(g, cx - 18, gy - 122, 14, 14, '#FFE7A3');
  squareWindow(g, cx + 4, gy - 122, 14, 14, '#FFE7A3');
  stroke(g, [[cx - 38, gy - 98], [cx + 38, gy - 98]], INK, 3);
  for (let x = cx - 36; x <= cx + 36; x += 9) stroke(g, [[x, gy - 98], [x, gy - 106]], INK, 1.8);
  stroke(g, [[cx - 38, gy - 106], [cx + 38, gy - 106]], INK, 2);
  dish(g, cx + 40, gy - 116, 12, 1);
  dish(g, cx - 40, gy - 116, 12, -1);
  dish(g, cx + 16, gy - 146, 9, 1);
  radioWaves(g, cx, gy - 172, 3);
  circle(g, cx, gy - 74, 9, CREAM, 2.5);
  sparkle(g, cx, gy - 74, 5, LAVENDER, 1);
  archDoor(g, cx, gy - 2, 26, 38);
  archWindow(g, cx - 34, gy - 40, 12, 16);
  archWindow(g, cx + 34, gy - 40, 12, 16);
}

// ---- Castle (centre) -----------------------------------------------------

const CASTLE = { wall: '#EBDDB8', shade: '#D6C394', roof: ROSE, trim: GOLD };

function turret(g, x, gy, h, roofed) {
  rect(g, x - 15, gy - h, 30, h, CASTLE.wall, 3);
  if (roofed) cone(g, x, gy - h, 30, 30, CASTLE.roof);
  else crenellations(g, x - 15, gy - h, 30, CASTLE.wall, 7);
  archWindow(g, x, gy - h + (roofed ? 12 : 16), 10, 14, '#FFE7A3');
}

export function drawCastle(g, stage, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 112, 10);
  // the keep behind the curtain wall grows with the castle level
  const keepH = stage >= 2 ? 150 : 120;
  rect(g, cx - 42, gy - keepH, 84, keepH - 60, CASTLE.wall, 3);
  crenellations(g, cx - 42, gy - keepH, 84, CASTLE.wall, 8);
  if (stage >= 2) {
    archWindow(g, cx - 20, gy - keepH + 14, 12, 18, '#FFE7A3');
    archWindow(g, cx + 20, gy - keepH + 14, 12, 18, '#FFE7A3');
  }
  if (stage >= 3) {
    rect(g, cx - 20, gy - 200, 40, 52, CASTLE.wall, 3);
    cone(g, cx, gy - 200, 40, 36, CASTLE.roof);
    stroke(g, [[cx - 18, gy - 152], [cx + 18, gy - 152]], CASTLE.trim, 3);
    archWindow(g, cx, gy - 190, 12, 18, '#FFE7A3');
    flag(g, cx, gy - 236, GOLD, 30);
  }
  const towerH = stage >= 2 ? 128 : 100;
  for (const side of [-1, 1]) turret(g, cx + side * 92, gy, towerH, stage >= 1);
  if (stage >= 2) for (const side of [-1, 1]) flag(g, cx + side * 92, gy - towerH - 30, side < 0 ? ROSE : LAVENDER, 18);
  // curtain wall and gatehouse
  rect(g, cx - 77, gy - 70, 154, 70, CASTLE.wall, 3);
  crenellations(g, cx - 77, gy - 70, 154, CASTLE.wall, 8);
  rect(g, cx - 77, gy - 10, 154, 10, CASTLE.shade, 2, 2);
  rect(g, cx - 28, gy - 84, 56, 84, CASTLE.wall, 3);
  crenellations(g, cx - 28, gy - 84, 56, CASTLE.wall, 8);
  archDoor(g, cx, gy, 34, 50, '#6B4128');
  for (const x of [cx - 8, cx, cx + 8]) stroke(g, [[x, gy - 40], [x, gy - 4]], 'rgba(35,56,47,.55)', 2);
  stroke(g, [[cx - 14, gy - 22], [cx + 14, gy - 22]], 'rgba(35,56,47,.55)', 2);
  if (stage >= 1) {
    banner(g, cx - 62, gy - 62, 18, 30, ROSE);
    banner(g, cx + 44, gy - 62, 18, 30, ROSE);
  }
  if (stage >= 3) {
    banner(g, cx - 10, gy - 80, 20, 24, LAVENDER);
    stroke(g, [[cx - 77, gy - 70], [cx + 77, gy - 70]], CASTLE.trim, 3);
  } else {
    squareWindow(g, cx - 8, gy - 74, 16, 14, '#FFE7A3');
  }
}

// ---- level 0: a staked plot with scaffolding over a faint plan ------------

function scaffold(g, W, H, fw) {
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

const BUILDING_STAGES = {
  library: [libraryStage1, libraryStage2, libraryStage3],
  workshop: [workshopStage1, workshopStage2, workshopStage3],
  garden: [gardenStage1, gardenStage2, gardenStage3],
  tower: [towerStage1, towerStage2, towerStage3],
};

// level 0 = not built yet: a faint plan of stage 1 under scaffolding
export function drawBuilding(g, id, level, W, H, footprintW) {
  const stages = BUILDING_STAGES[id];
  if (!stages) return;
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

export function drawDuelCamp(g, W, H) {
  const cx = W / 2; const gy = H - 10;
  ellipse(g, cx, gy - 18, W * 0.46, 26, '#C9A66B', 0);
  signBoard(g, cx - 50, gy - 30, 'Duel', 'A one-on-one quiz battle', 150);
  // the travel pack resting on a stump
  ellipse(g, cx + 52, gy - 6, 26, 8, '#9E6238');
  rect(g, cx + 26, gy - 22, 52, 18, '#B57A48', 4);
  rect(g, cx + 32, gy - 84, 40, 62, '#B96448', 12);
  rect(g, cx + 30, gy - 92, 44, 26, '#9E4E36', 10);
  rect(g, cx + 34, gy - 108, 36, 14, BLUE, 7);
  stroke(g, [[cx + 40, gy - 66], [cx + 40, gy - 26]], '#6B3A26', 3);
  stroke(g, [[cx + 64, gy - 66], [cx + 64, gy - 26]], '#6B3A26', 3);
  rect(g, cx + 46, gy - 50, 12, 14, '#E3B862', 3, 2);
  circle(g, cx + 52, gy - 70, 3, GOLD, 1.5);
  // a rolled quiz scroll leaning on the pack
  g.save(); g.translate(cx + 84, gy - 34); g.rotate(0.35);
  rect(g, -5, -20, 10, 40, '#F7E7B5', 4, 2);
  g.restore();
}

export function drawCampfireCamp(g, W, H) {
  const cx = W / 2; const gy = H - 10;
  ellipse(g, cx, gy - 18, W * 0.46, 26, '#C9A66B', 0);
  signBoard(g, cx - 52, gy - 30, 'Campfire Run', 'Defend the campfire', 150);
  // log seats
  rect(g, cx + 8, gy - 6, 30, 10, WOOD, 5, 2.5);
  rect(g, cx + 76, gy - 6, 30, 10, WOOD, 5, 2.5);
  // stone ring and crossed logs; the flames are drawn live each frame
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    ellipse(g, cx + 57 + Math.cos(a) * 22, gy - 26 + Math.sin(a) * 8, 6, 4.5, '#AAB6A0', 2);
  }
  stroke(g, [[cx + 42, gy - 22], [cx + 72, gy - 32]], INK, 8);
  stroke(g, [[cx + 42, gy - 22], [cx + 72, gy - 32]], WOOD, 5);
  stroke(g, [[cx + 72, gy - 22], [cx + 42, gy - 32]], INK, 8);
  stroke(g, [[cx + 72, gy - 22], [cx + 42, gy - 32]], DARK_WOOD, 5);
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
