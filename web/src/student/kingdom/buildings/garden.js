import {
  BLUE, CREAM, DARK_WOOD, GOLD, INK, LAVENDER, LEAF, ROSE, WOOD,
  archDoor, archWindow, banner, circle, cone, crenellations, dish, dome, ellipse,
  flag, gable, gear, glow, groundShadow, poly, radioWaves, rect, sparkle,
  squareWindow, stroke,
} from '../town-art.js';
import { drawBuildingStages } from '../town-art.js';

export const layout = { x: 500, y: 70, w: 170, h: 95, art: { w: 190, h: 170 }, door: { x: 585, y: 190 } };

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
  // Bring the rear hedge back over the pavilion so the observatory reads as
  // sitting behind the hedge instead of being pasted on top of it.
  rect(g, cx - 84, gy - 98, 168, 22, GARDEN.hedge, 8);
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


export const stages = [gardenStage1, gardenStage2, gardenStage3];
export function draw(g, level, W, H, footprintW) { drawBuildingStages(g, stages, level, W, H, footprintW); }
