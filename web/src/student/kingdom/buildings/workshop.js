import {
  BLUE, CREAM, DARK_WOOD, GOLD, INK, LAVENDER, LEAF, ROSE, WOOD,
  archDoor, archWindow, banner, circle, cone, crenellations, dish, dome, ellipse,
  flag, gable, gear, glow, groundShadow, poly, radioWaves, rect, sparkle,
  squareWindow, stroke,
} from '../town-art.js';
import { drawBuildingStages } from '../town-art.js';

export const layout = { x: 990, y: 250, w: 200, h: 95, art: { w: 260, h: 190 }, door: { x: 1090, y: 370 } };

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


export const stages = [workshopStage1, workshopStage2, workshopStage3];
export function draw(g, level, W, H, footprintW) { drawBuildingStages(g, stages, level, W, H, footprintW); }
