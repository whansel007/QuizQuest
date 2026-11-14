import {
  BLUE, CREAM, DARK_WOOD, GOLD, INK, LAVENDER, LEAF, ROSE, WOOD,
  archDoor, archWindow, banner, circle, cone, crenellations, dish, dome, ellipse,
  flag, gable, gear, glow, groundShadow, poly, radioWaves, rect, sparkle,
  squareWindow, stroke,
} from '../town-art.js';

export const layout = { x: 545, y: 290, w: 190, h: 120, art: { w: 230, h: 250 }, door: { x: 640, y: 434 } };

// ---- Castle (centre) -----------------------------------------------------

const CASTLE = { wall: '#EBDDB8', shade: '#D6C394', roof: ROSE };

function turret(g, x, gy, h, roofed) {
  rect(g, x - 15, gy - h, 30, h, CASTLE.wall, 3);
  if (roofed) cone(g, x, gy - h, 30, 30, CASTLE.roof);
  else crenellations(g, x - 15, gy - h, 30, CASTLE.wall, 7);
  archWindow(g, x, gy - h + (roofed ? 12 : 16), 10, 14, '#FFE7A3');
}

export function draw(g, stage, W, H) {
  const cx = W / 2; const gy = H - 8;
  groundShadow(g, cx, gy, 112, 10);
  if (stage >= 3) {
    // Draw the upper tower first so the keep's square parapet sits in front
    // of its base instead of the tower appearing pasted on top of it.
    rect(g, cx - 20, gy - 200, 40, 52, CASTLE.wall, 3);
    cone(g, cx, gy - 200, 40, 36, CASTLE.roof);
    archWindow(g, cx, gy - 190, 12, 18, '#FFE7A3');
    flag(g, cx, gy - 236, GOLD, 30);
  }
  // the keep behind the curtain wall grows with the castle level
  const keepH = stage >= 2 ? 150 : 120;
  rect(g, cx - 42, gy - keepH, 84, keepH - 60, CASTLE.wall, 3);
  crenellations(g, cx - 42, gy - keepH, 84, CASTLE.wall, 8);
  if (stage >= 2) {
    archWindow(g, cx - 20, gy - keepH + 14, 12, 18, '#FFE7A3');
    archWindow(g, cx + 20, gy - keepH + 14, 12, 18, '#FFE7A3');
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
  } else {
    squareWindow(g, cx - 8, gy - 74, 16, 14, '#FFE7A3');
  }
}

