// Shared storybook art for avatar cosmetics (hats and pins).
//
// This is the one render definition for every view that shows the player's
// cat: the Castle mirror, the walkable Kingdom, World, Duel/Practice, and the
// Campfire Run party list. The Vue app imports it from web/src/student/avatar.js
// and Hero Lab pages import it directly, so a cosmetic looks the same in all of
// them. Prices, names and ownership stay in config/avatar-cosmetics-data.json
// and on the server: this file only knows how to draw an allowlisted ID.
//
// Each art entry is drawn as vector paths in a 100-unit design box centered on
// (0, 0), with a warm dark-ink outline and the brand palette. Placement is
// proportional to the cropped player sprite bounds:
//   anchor   named point on the sprite (COSMETIC_ANCHORS), as fractions of
//            the sprite's width and height
//   scale    width of the 100-unit design box, as a fraction of sprite width
//   offsetX/offsetY  nudges from the anchor, as fractions of width / height
//   seatY    design-box point that sits on the anchor (a hat's brim line)

const INK = '#23382F';
const INK_WIDTH = 4.6; // design units: about 2.3px when a cosmetic is 50px wide
const C = Object.freeze({
  page: '#FFF8E4',
  parchment: '#FBF2D8',
  cream: '#F3E3BC',
  gold: '#F2BA55',
  goldDeep: '#D99A36',
  ember: '#EF7137',
  leaf: '#7FAE58',
  leafDeep: '#5E8C41',
  blue: '#6DB8CF',
  glass: '#CDE7EC',
  lavender: '#8062A9',
  lilac: '#9A7DC2',
  rose: '#D86F6B',
  roseDeep: '#B9534F',
  forest: '#32533E',
  pine: '#254937',
  pineLight: '#4C7A5D',
  earth: '#7A6545',
  bark: '#B5854E',
  barkDeep: '#93683A',
  acorn: '#9A7446',
  acornDeep: '#6E512F',
});

// Points on the cropped cat sprite (a round head with two ears). `head` is
// the crown of the head between the ears; `badge` sits on the lower right rim
// of the face, mirrored when the cat faces left.
export const COSMETIC_ANCHORS = Object.freeze({
  head: Object.freeze({ x: 0.5, y: 0.19 }),
  badge: Object.freeze({ x: 0.82, y: 0.84 }),
});

// The tallest hat (the wizard hat) rises about this far above the top of the
// sprite, as a fraction of sprite height. Views that fit the cat tightly in a
// canvas (the mirror) reserve this much room so hats are never clipped.
export const COSMETIC_HEADROOM = 0.15;

// --- small drawing helpers -------------------------------------------------

function inked(g, fill, build, width = INK_WIDTH) {
  g.beginPath();
  build();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = width;
  g.strokeStyle = INK;
  g.stroke();
}

// Outline only the silhouette of overlapping shapes (flower petals): stroke a
// double-width line first, then fill over the inner half.
function silhouette(g, fill, build) {
  g.beginPath();
  build();
  g.lineWidth = INK_WIDTH * 2;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = fill;
  g.fill();
}

function line(g, color, width, build) {
  g.beginPath();
  build();
  g.lineWidth = width;
  g.strokeStyle = color;
  g.stroke();
}

function starPath(g, x, y, outer, inner, points = 5) {
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 ? inner : outer;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  }
  g.closePath();
}

function roundedRect(g, x, y, width, height, radius) {
  g.moveTo(x + radius, y);
  g.arcTo(x + width, y, x + width, y + height, radius);
  g.arcTo(x + width, y + height, x, y + height, radius);
  g.arcTo(x, y + height, x, y, radius);
  g.arcTo(x, y, x + width, y, radius);
  g.closePath();
}

function flowerPath(g, x, y, radius) {
  for (let i = 0; i < 5; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const px = x + Math.cos(angle) * radius * 0.55;
    const py = y + Math.sin(angle) * radius * 0.55;
    g.moveTo(px + radius * 0.5, py);
    g.arc(px, py, radius * 0.5, 0, Math.PI * 2);
  }
}

// A crescent: the part of circle 1 not covered by circle 2 (center offset by
// dx, dy from circle 1). The circles must intersect.
function crescentPath(g, r1, dx, dy, r2) {
  const d = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const theta = Math.atan2(dy, dx);
  const phi = Math.acos(a / r1);
  const p1 = [Math.cos(theta + phi) * r1, Math.sin(theta + phi) * r1];
  const p2 = [Math.cos(theta - phi) * r1, Math.sin(theta - phi) * r1];
  g.moveTo(p1[0], p1[1]);
  g.arc(0, 0, r1, theta + phi, theta - phi + Math.PI * 2);
  g.arc(dx, dy, r2, Math.atan2(p2[1] - dy, p2[0] - dx), Math.atan2(p1[1] - dy, p1[0] - dx), true);
  g.closePath();
}

function pinBacking(g) {
  inked(g, C.page, () => g.arc(0, 0, 40, 0, Math.PI * 2));
  line(g, C.cream, 4, () => g.arc(0, 0, 33, 0, Math.PI * 2));
}

// --- hats --------------------------------------------------------------------
// Hats share a brim line at design y = 26 (their seatY), so a hat rests on the
// head anchor no matter its scale.

function drawRibbon(g) {
  g.rotate(-0.1);
  inked(g, C.roseDeep, () => { g.moveTo(-6, 10); g.lineTo(-22, 40); g.lineTo(-14, 36); g.lineTo(-9, 44); g.lineTo(5, 12); g.closePath(); });
  inked(g, C.roseDeep, () => { g.moveTo(6, 10); g.lineTo(24, 38); g.lineTo(15, 36); g.lineTo(11, 44); g.lineTo(-3, 12); g.closePath(); });
  inked(g, C.rose, () => { g.moveTo(-4, 6); g.bezierCurveTo(-20, -24, -50, -22, -44, 4); g.bezierCurveTo(-40, 22, -20, 22, -4, 12); g.closePath(); });
  inked(g, C.rose, () => { g.moveTo(4, 6); g.bezierCurveTo(20, -24, 50, -22, 44, 4); g.bezierCurveTo(40, 22, 20, 22, 4, 12); g.closePath(); });
  line(g, C.roseDeep, 3.5, () => { g.moveTo(-10, 8); g.quadraticCurveTo(-24, 2, -34, 6); g.moveTo(10, 8); g.quadraticCurveTo(24, 2, 34, 6); });
  line(g, C.page, 3.5, () => { g.moveTo(-36, -4); g.quadraticCurveTo(-32, -12, -24, -12); g.moveTo(26, -11); g.quadraticCurveTo(33, -10, 36, -3); });
  inked(g, C.rose, () => roundedRect(g, -9, -2, 18, 18, 6));
}

function drawTopHat(g) {
  inked(g, C.pine, () => g.ellipse(0, 26, 44, 9, 0, 0, Math.PI * 2));
  inked(g, C.forest, () => { g.moveTo(-25, 25); g.lineTo(-22, -36); g.quadraticCurveTo(0, -42, 22, -36); g.lineTo(25, 25); g.quadraticCurveTo(0, 31, -25, 25); g.closePath(); });
  inked(g, C.gold, () => { g.moveTo(-24.3, 8); g.quadraticCurveTo(0, 13, 24.3, 8); g.lineTo(25, 24); g.quadraticCurveTo(0, 30, -25, 24); g.closePath(); });
  inked(g, C.pineLight, () => g.ellipse(0, -37, 22, 5, 0, 0, Math.PI * 2));
  line(g, C.pineLight, 4, () => { g.moveTo(-15, -28); g.lineTo(-16, 2); });
}

function drawCrown(g) {
  inked(g, C.gold, () => { g.moveTo(-34, 26); g.lineTo(-38, -20); g.lineTo(-17, 2); g.lineTo(0, -30); g.lineTo(17, 2); g.lineTo(38, -20); g.lineTo(34, 26); g.quadraticCurveTo(0, 32, -34, 26); g.closePath(); });
  inked(g, C.goldDeep, () => { g.moveTo(-35.2, 12); g.quadraticCurveTo(0, 18, 35.2, 12); g.lineTo(34, 26); g.quadraticCurveTo(0, 32, -34, 26); g.closePath(); });
  for (const [x, y] of [[-38, -20], [0, -30], [38, -20]]) inked(g, C.page, () => g.arc(x, y, 5, 0, Math.PI * 2), 3.5);
  inked(g, C.rose, () => g.arc(0, 20, 5.5, 0, Math.PI * 2), 3.5);
  inked(g, C.blue, () => g.arc(-20, 19, 4, 0, Math.PI * 2), 3.5);
  inked(g, C.blue, () => g.arc(20, 19, 4, 0, Math.PI * 2), 3.5);
}

function drawCowboy(g) {
  inked(g, C.bark, () => { g.moveTo(-25, 16); g.quadraticCurveTo(-30, -22, -13, -28); g.quadraticCurveTo(-5, -22, 0, -20); g.quadraticCurveTo(5, -22, 13, -28); g.quadraticCurveTo(30, -22, 25, 16); g.closePath(); });
  line(g, C.barkDeep, 3.5, () => { g.moveTo(0, -20); g.quadraticCurveTo(-3, -8, 0, 2); });
  inked(g, C.earth, () => { g.moveTo(-25.5, 3); g.quadraticCurveTo(0, 9, 25.5, 3); g.lineTo(25.5, 12); g.quadraticCurveTo(0, 18, -25.5, 12); g.closePath(); }, 3.5);
  inked(g, C.bark, () => { g.moveTo(-50, 6); g.quadraticCurveTo(-46, 26, -20, 26); g.quadraticCurveTo(0, 30, 20, 26); g.quadraticCurveTo(46, 26, 50, 6); g.quadraticCurveTo(40, 18, 24, 15); g.quadraticCurveTo(0, 11, -24, 15); g.quadraticCurveTo(-40, 18, -50, 6); g.closePath(); });
}

function drawWizard(g) {
  inked(g, C.lavender, () => g.ellipse(0, 26, 46, 9, 0, 0, Math.PI * 2));
  inked(g, C.lilac, () => { g.moveTo(-25, 24); g.quadraticCurveTo(-14, -8, 4, -30); g.quadraticCurveTo(14, -44, 30, -46); g.quadraticCurveTo(19, -36, 18, -20); g.quadraticCurveTo(20, 0, 25, 24); g.quadraticCurveTo(0, 30, -25, 24); g.closePath(); });
  inked(g, C.gold, () => { g.moveTo(-22.5, 12); g.quadraticCurveTo(0, 18, 22, 12); g.lineTo(25, 24); g.quadraticCurveTo(0, 30, -25, 24); g.closePath(); }, 3.5);
  inked(g, C.gold, () => starPath(g, 2, -4, 8.5, 3.8), 3);
  g.fillStyle = C.page;
  for (const [x, y, r] of [[-9, -14, 2.2], [11, -24, 1.8], [-14, 4, 1.6]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
}

function drawFlowerCrown(g) {
  line(g, INK, 13, () => { g.moveTo(-44, 28); g.quadraticCurveTo(0, 6, 44, 28); });
  line(g, C.leafDeep, 6.5, () => { g.moveTo(-44, 28); g.quadraticCurveTo(0, 6, 44, 28); });
  for (const [x, y, angle] of [[-30, 25, -0.9], [-8, 13, -0.3], [16, 13, 0.35], [36, 27, 0.9]]) {
    g.save(); g.translate(x, y); g.rotate(angle);
    inked(g, C.leaf, () => g.ellipse(0, 8, 5, 9, 0, 0, Math.PI * 2), 3.5);
    g.restore();
  }
  const flowers = [[-40, 26, 10, C.rose], [-21, 18, 11, C.gold], [0, 13, 13, C.page], [21, 18, 11, C.blue], [40, 26, 10, C.rose]];
  for (const [x, y, radius, fill] of flowers) {
    silhouette(g, fill, () => flowerPath(g, x, y, radius));
    inked(g, fill === C.gold ? C.ember : C.gold, () => g.arc(x, y, radius * 0.3, 0, Math.PI * 2), 3);
  }
}

function drawAcornCap(g) {
  const cap = () => {
    g.moveTo(-36, 24); g.quadraticCurveTo(-38, -14, 0, -18); g.quadraticCurveTo(38, -14, 36, 24);
    for (let i = 0; i < 6; i += 1) {
      const x0 = 36 - i * 12;
      g.quadraticCurveTo(x0 - 6, 32, x0 - 12, 24);
    }
    g.closePath();
  };
  inked(g, C.earth, () => { g.moveTo(-3, -16); g.quadraticCurveTo(-3, -30, 7, -37); g.lineTo(12, -33); g.quadraticCurveTo(4, -27, 4, -16); g.closePath(); }, 3.5);
  g.save();
  g.beginPath(); cap(); g.fillStyle = C.acorn; g.fill(); g.clip();
  line(g, C.acornDeep, 2.6, () => {
    for (let k = -60; k <= 60; k += 11) { g.moveTo(k - 20, 34); g.lineTo(k + 20, -22); g.moveTo(k + 20, 34); g.lineTo(k - 20, -22); }
  });
  g.restore();
  g.beginPath(); cap(); g.lineWidth = INK_WIDTH; g.strokeStyle = INK; g.stroke();
}

function drawTricorn(g) {
  inked(g, C.pine, () => { g.moveTo(-50, 22); g.quadraticCurveTo(-48, -16, -22, -14); g.quadraticCurveTo(0, -32, 22, -14); g.quadraticCurveTo(48, -16, 50, 22); g.quadraticCurveTo(26, 10, 0, 18); g.quadraticCurveTo(-26, 10, -50, 22); g.closePath(); });
  line(g, C.gold, 4, () => { g.moveTo(-44, 14); g.quadraticCurveTo(-42, -9, -21, -8); g.quadraticCurveTo(0, -25, 21, -8); g.quadraticCurveTo(42, -9, 44, 14); });
  inked(g, C.rose, () => flowerPath(g, 24, 2, 13), 3.5);
  inked(g, C.gold, () => g.arc(24, 2, 4, 0, Math.PI * 2), 3);
}

// --- pins --------------------------------------------------------------------

function drawStarPin(g) {
  pinBacking(g);
  inked(g, C.gold, () => starPath(g, 0, 2, 27, 12));
}

function drawLeafPin(g) {
  pinBacking(g);
  inked(g, C.leaf, () => { g.moveTo(-20, 22); g.quadraticCurveTo(-26, -14, 22, -24); g.quadraticCurveTo(22, 16, -20, 22); g.closePath(); });
  line(g, INK, 3, () => { g.moveTo(-24, 26); g.quadraticCurveTo(-2, 4, 14, -15); });
}

function drawHeartPin(g) {
  pinBacking(g);
  inked(g, C.gold, () => { g.moveTo(0, 24); g.bezierCurveTo(-36, 2, -24, -28, 0, -11); g.bezierCurveTo(24, -28, 36, 2, 0, 24); g.closePath(); });
  line(g, C.page, 3.5, () => { g.moveTo(-17, -6); g.quadraticCurveTo(-15, -14, -8, -14); });
}

function drawMoonPin(g) {
  pinBacking(g);
  inked(g, C.gold, () => crescentPath(g, 25, 12, -9, 21));
  inked(g, C.lavender, () => starPath(g, 15, 13, 8, 3.5), 3);
}

function drawMushroomPin(g) {
  pinBacking(g);
  inked(g, C.cream, () => { g.moveTo(-8, 2); g.quadraticCurveTo(-10, 20, -12, 26); g.quadraticCurveTo(0, 30, 12, 26); g.quadraticCurveTo(10, 20, 8, 2); g.closePath(); });
  inked(g, C.rose, () => { g.moveTo(-29, 6); g.quadraticCurveTo(-29, -26, 0, -26); g.quadraticCurveTo(29, -26, 29, 6); g.quadraticCurveTo(0, 13, -29, 6); g.closePath(); });
  for (const [x, y, r] of [[-13, -9, 5], [7, -16, 4], [16, -2, 3.6]]) inked(g, C.page, () => g.arc(x, y, r, 0, Math.PI * 2), 2.6);
}

function drawFeatherPin(g) {
  pinBacking(g);
  g.save();
  g.rotate(0.62);
  inked(g, C.blue, () => { g.moveTo(0, -31); g.quadraticCurveTo(17, -10, 7, 20); g.quadraticCurveTo(0, 26, -7, 20); g.quadraticCurveTo(-15, -8, 0, -31); g.closePath(); });
  line(g, INK, 2.6, () => {
    g.moveTo(0, -12); g.lineTo(9, -18); g.moveTo(0, -2); g.lineTo(10, -8); g.moveTo(0, 8); g.lineTo(-9, 2);
    g.moveTo(0, -4); g.lineTo(-10, -11);
  });
  line(g, INK, 3.4, () => { g.moveTo(0, -26); g.lineTo(0, 32); });
  g.restore();
}

function drawFireflyPin(g) {
  pinBacking(g);
  inked(g, C.glass, () => { g.moveTo(-15, -12); g.lineTo(-17, 20); g.quadraticCurveTo(-17, 27, -10, 27); g.lineTo(10, 27); g.quadraticCurveTo(17, 27, 17, 20); g.lineTo(15, -12); g.closePath(); });
  inked(g, C.earth, () => roundedRect(g, -18, -23, 36, 11, 3), 3.5);
  inked(g, C.gold, () => g.arc(1, 8, 8, 0, Math.PI * 2), 3);
  g.fillStyle = C.page;
  g.beginPath(); g.arc(-1.5, 5.5, 2.6, 0, Math.PI * 2); g.fill();
  line(g, C.page, 2.6, () => { g.moveTo(-10, -6); g.lineTo(-10, 18); });
}

const art = (slot, anchor, scale, draw, extra = {}) => Object.freeze({
  slot, anchor, scale, offsetX: 0, offsetY: 0, seatY: slot === 'hat' ? 26 : 0, draw, ...extra,
});

// Keyed by the catalog ID. Only IDs listed here (and in the server catalog)
// are ever drawn; anything else is ignored.
export const COSMETIC_ART = Object.freeze({
  hat_ribbon: art('hat', 'head', 0.44, drawRibbon),
  hat_top_hat: art('hat', 'head', 0.42, drawTopHat),
  hat_crown: art('hat', 'head', 0.44, drawCrown),
  hat_cowboy: art('hat', 'head', 0.5, drawCowboy),
  hat_wizard: art('hat', 'head', 0.48, drawWizard),
  hat_flower_crown: art('hat', 'head', 0.62, drawFlowerCrown, { offsetY: 0.02 }),
  hat_acorn_cap: art('hat', 'head', 0.4, drawAcornCap),
  hat_tricorn: art('hat', 'head', 0.52, drawTricorn),
  accessory_star_pin: art('accessory', 'badge', 0.28, drawStarPin),
  accessory_leaf_pin: art('accessory', 'badge', 0.28, drawLeafPin),
  accessory_heart_pin: art('accessory', 'badge', 0.28, drawHeartPin),
  accessory_moon_pin: art('accessory', 'badge', 0.28, drawMoonPin),
  accessory_mushroom_pin: art('accessory', 'badge', 0.28, drawMushroomPin),
  accessory_feather_pin: art('accessory', 'badge', 0.28, drawFeatherPin),
  accessory_firefly_pin: art('accessory', 'badge', 0.28, drawFireflyPin),
});

export function cosmeticArt(id, slot) {
  const entry = typeof id === 'string' && Object.hasOwn(COSMETIC_ART, id) ? COSMETIC_ART[id] : null;
  return entry && (!slot || entry.slot === slot) ? entry : null;
}

// Start every cosmetic from a clean, opaque paint state so a caller's fade,
// shadow, dash or translucent fill can never leak into the art. A caller that
// fades the whole character on purpose passes the same `alpha` here.
function resetPaint(g, alpha) {
  g.globalAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  g.globalCompositeOperation = 'source-over';
  g.shadowColor = 'transparent';
  g.shadowBlur = 0;
  g.shadowOffsetX = 0;
  g.shadowOffsetY = 0;
  if ('filter' in g) g.filter = 'none';
  g.setLineDash?.([]);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.miterLimit = 10;
}

// Draw one cosmetic centered in a square (a wardrobe button or roster mark).
export function drawCosmeticIcon(g, id, { x, y, size, alpha = 1 } = {}) {
  const entry = cosmeticArt(id);
  if (!entry || !(size > 0)) return false;
  g.save();
  resetPaint(g, alpha);
  g.translate(x, y);
  g.scale(size / 104, size / 104);
  entry.draw(g);
  g.restore();
  return true;
}

function drawOnAvatar(g, entry, { left, top, width, height, facing, alpha }) {
  const anchor = COSMETIC_ANCHORS[entry.anchor] || COSMETIC_ANCHORS.head;
  const flip = facing < 0 ? -1 : 1;
  const fx = flip < 0 ? 1 - anchor.x - entry.offsetX : anchor.x + entry.offsetX;
  const unit = (entry.scale * width) / 100;
  g.save();
  resetPaint(g, alpha);
  g.translate(left + width * fx, top + height * (anchor.y + entry.offsetY));
  g.scale(unit * flip, unit);
  g.translate(0, -entry.seatY);
  entry.draw(g);
  g.restore();
}

// Draw the equipped hat and pin over the player's cat. The bounds are the
// cropped sprite as drawn on screen (any hop offset already applied). Pass
// facing = -1 when the sprite is mirrored.
export function drawAvatarCosmetics(g, { left, top, width, height, hatId, accessoryId, facing = 1, alpha = 1 }) {
  if (!(width > 0) || !(height > 0)) return;
  const hat = cosmeticArt(hatId, 'hat');
  if (hat) drawOnAvatar(g, hat, { left, top, width, height, facing, alpha });
  const accessory = cosmeticArt(accessoryId, 'accessory');
  if (accessory) drawOnAvatar(g, accessory, { left, top, width, height, facing, alpha });
}
