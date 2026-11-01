import {
  BLUE, CREAM, DARK_WOOD, GOLD, INK, LAVENDER, LEAF, ROSE, WOOD,
  archDoor, archWindow, banner, circle, cone, crenellations, dish, dome, ellipse,
  flag, gable, gear, glow, groundShadow, poly, radioWaves, rect, sparkle,
  squareWindow, stroke,
} from '../town-art.js';
import { drawBuildingStages } from '../town-art.js';

export const layout = { x: 95, y: 250, w: 190, h: 95, art: { w: 230, h: 200 }, door: { x: 190, y: 370 } };

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

// Library: shelves, books, scrolls and soft glyph light

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


export const stages = [libraryStage1, libraryStage2, libraryStage3];
export function draw(g, level, W, H, footprintW) { drawBuildingStages(g, stages, level, W, H, footprintW); }
