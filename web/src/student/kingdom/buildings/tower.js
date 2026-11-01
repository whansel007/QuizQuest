import {
  BLUE, CREAM, DARK_WOOD, GOLD, INK, LAVENDER, LEAF, ROSE, WOOD,
  archDoor, archWindow, banner, circle, cone, crenellations, dish, dome, ellipse,
  flag, gable, gear, glow, groundShadow, poly, radioWaves, rect, sparkle,
  squareWindow, stroke,
} from '../town-art.js';
import { drawBuildingStages } from '../town-art.js';

export const layout = { x: 585, y: 545, w: 110, h: 80, art: { w: 150, h: 180 }, door: { x: 640, y: 652 } };

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


export const stages = [towerStage1, towerStage2, towerStage3];
export function draw(g, level, W, H, footprintW) { drawBuildingStages(g, stages, level, W, H, footprintW); }
