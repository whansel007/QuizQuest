// Unit tests for the pure touch-control logic (public/hero-lab/touch-controls.js).
// Run: npm run test:mobile:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stickVector, vectorToDirections, classifyPress, inCancelZone, releaseOutcome, aimFromDrag, aimPoint,
  autoAim, densestCluster, bombardierInitial, bombardierReduce, bombardierWindowLeft, cameraBaseScale,
  minZoomForArena, clampZoom, pinchZoom, clampCameraCenter, followCamera, screenToWorld, worldToScreen,
  hudScale, shortName,
} from '../../public/hero-lab/touch-controls.js';

const ARENA = { width: 1920, height: 1080 };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('stick: inside the dead zone gives no movement', () => {
  const v = stickVector(56 * 0.1, 0, 56, 0.18);
  assert.deepEqual([v.x, v.y, v.magnitude], [0, 0, 0]);
  assert.deepEqual(vectorToDirections(v.x, v.y), { up: false, down: false, left: false, right: false });
});

test('stick: just past the dead zone starts from zero, full throw gives length 1', () => {
  const edge = stickVector(56 * 0.19, 0, 56, 0.18);
  assert.ok(edge.magnitude > 0 && edge.magnitude < 0.05);
  const full = stickVector(200, 0, 56, 0.18);
  close(full.x, 1); close(full.magnitude, 1);
  close(full.knobX, 56); // knob clamped to the radius
});

test('stick: analog output is normalised and keeps the direction', () => {
  const v = stickVector(30, 40, 50, 0.18);
  close(Math.hypot(v.x, v.y), 1);
  close(v.y / v.x, 40 / 30);
});

test('stick: 8-way sectors map to the WASD booleans', () => {
  const cases = [
    [[1, 0], { right: true }], [[1, 1], { right: true, down: true }], [[0, 1], { down: true }],
    [[-1, 1], { left: true, down: true }], [[-1, 0], { left: true }], [[-1, -1], { left: true, up: true }],
    [[0, -1], { up: true }], [[1, -1], { right: true, up: true }],
    // 20 degrees off the x axis is still pure right; 30 degrees is the diagonal
    [[Math.cos(0.35), Math.sin(0.35)], { right: true }], [[Math.cos(0.5), Math.sin(0.5)], { right: true, down: true }],
  ];
  for (const [[x, y], expected] of cases) {
    assert.deepEqual(vectorToDirections(x, y), { up: false, down: false, left: false, right: false, ...expected }, `${x},${y}`);
  }
});

test('tap versus hold at the 180 ms / 12 px thresholds', () => {
  const t = { tapMs: 180, tapMovePx: 12 };
  assert.equal(classifyPress(180, 11.9, t), 'tap');
  assert.equal(classifyPress(181, 0, t), 'hold');
  assert.equal(classifyPress(50, 12, t), 'hold');
  assert.equal(classifyPress(0, 0, t), 'tap');
});

test('cancel zone: dragging back to the button cancels, a plain tap never does', () => {
  assert.equal(inCancelZone(10, 10, 18), true);
  assert.equal(inCancelZone(13, 13, 18), false);
  assert.equal(releaseOutcome({ dragged: true, dx: 5, dy: -5 }, 18), 'cancel');
  assert.equal(releaseOutcome({ dragged: true, dx: 40, dy: 0 }, 18), 'fire');
  assert.equal(releaseOutcome({ dragged: false, dx: 0, dy: 0 }, 18), 'fire');
});

test('aim: a direction ability keeps the drag direction at full range', () => {
  const aim = aimFromDrag(0, -45, { type: 'dir', range: 300 }, 90);
  assert.deepEqual(aim.dir, { x: 0, y: -1 });
  assert.equal(aim.distance, 300);
});

test('aim: a point ability maps drag length linearly onto its range and clamps', () => {
  const half = aimFromDrag(45, 0, { type: 'point', range: 220 }, 90);
  close(half.distance, 110);
  const over = aimFromDrag(400, 0, { type: 'point', range: 220 }, 90);
  close(over.distance, 220);
  assert.deepEqual(aimPoint({ x: 100, y: 100 }, half, ARENA), { x: 210, y: 100 });
  // never outside the arena
  assert.deepEqual(aimPoint({ x: 1900, y: 5 }, aimFromDrag(90, -90, { type: 'point', range: 300 }, 90), ARENA), { x: 1920, y: 0 });
  assert.equal(aimFromDrag(0, 0, { type: 'dir', range: 1 }, 90), null);
});

test('auto-aim: nearest enemy in range, then the last aim, then facing', () => {
  const hero = { x: 0, y: 0 };
  const enemies = [{ x: 500, y: 0, hp: 5 }, { x: 0, y: 120, hp: 5 }, { x: 60, y: 0, hp: 0 }];
  const near = autoAim(hero, enemies, 300, { x: 1, y: 0 }, { x: -1, y: 0 });
  assert.deepEqual(near.dir, { x: 0, y: 1 });
  assert.equal(near.target, enemies[1]);
  const none = autoAim(hero, enemies, 100, { x: 0, y: -3 }, { x: -1, y: 0 });
  assert.deepEqual(none.dir, { x: 0, y: -1 });
  assert.equal(none.target, null);
  assert.deepEqual(autoAim(hero, [], 100, null, { x: -2, y: 0 }).dir, { x: -1, y: 0 });
  assert.deepEqual(autoAim(hero, [], 100, null, null).dir, { x: 1, y: 0 });
});

test('Bombardier default reticle sits on the densest group', () => {
  const enemies = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1040, y: 20 }, { x: 1010, y: 60 }];
  const c = densestCluster(enemies, 135);
  assert.ok(c.x > 1000 && c.x < 1040);
  assert.equal(densestCluster([], 135), null);
});

const W = { windowMs: 5000 };
const run = (events) => {
  let state = bombardierInitial(); const sent = [];
  for (const event of events) { const r = bombardierReduce(state, event, W); state = r.state; sent.push(...r.emits); }
  return { state, sent };
};

test('Bombardier: hold, drag and release confirms at the dragged point', () => {
  const { state, sent } = run([{ type: 'press', now: 0 }, { type: 'drag', point: { x: 400, y: 300 } }, { type: 'release', outcome: 'fire' }]);
  assert.deepEqual(sent, [['ultimate'], ['fire', 'secondary', { x: 400, y: 300 }]]);
  assert.equal(state.phase, 'idle');
});

test('Bombardier: tap Q then tap the arena confirms there', () => {
  const { state, sent } = run([{ type: 'press', now: 0 }, { type: 'release', outcome: 'fire' }, { type: 'arenaTap', point: { x: 900, y: 500 } }]);
  assert.deepEqual(sent, [['ultimate'], ['fire', 'secondary', { x: 900, y: 500 }]]);
  assert.equal(state.phase, 'idle');
});

test('Bombardier: dragging back to the button or the Cancel button cancels for free', () => {
  assert.deepEqual(run([{ type: 'press', now: 0 }, { type: 'drag', point: { x: 1, y: 1 } }, { type: 'release', outcome: 'cancel' }]).sent, [['ultimate'], ['cancel_targeting']]);
  assert.deepEqual(run([{ type: 'press', now: 0 }, { type: 'release', outcome: 'fire' }, { type: 'cancel' }]).sent, [['ultimate'], ['cancel_targeting']]);
  // nothing to cancel when idle
  assert.deepEqual(run([{ type: 'cancel' }]).sent, []);
});

test('Bombardier: the 5 s window times out without a confirm', () => {
  const { state, sent } = run([{ type: 'press', now: 0 }, { type: 'release', outcome: 'fire' }, { type: 'tick', now: 4999 }]);
  assert.equal(state.phase, 'open');
  const r = bombardierReduce(state, { type: 'tick', now: 5000 }, W);
  assert.equal(r.state.phase, 'idle');
  assert.deepEqual([...sent, ...r.emits], [['ultimate']]);
  close(bombardierWindowLeft({ phase: 'open', openedAt: 0 }, 2500, 5000), 0.5);
  // an arena tap after the timeout does nothing
  assert.deepEqual(bombardierReduce(r.state, { type: 'arenaTap', point: { x: 1, y: 1 } }, W).emits, []);
});

test('pinch zoom follows the finger distance and clamps', () => {
  close(pinchZoom(1, 100, 150, 0.3, 2.5), 1.5);
  close(pinchZoom(1, 100, 1000, 0.3, 2.5), 2.5);
  close(pinchZoom(1, 100, 1, 0.3, 2.5), 0.3);
  close(clampZoom(9, 0.5, 2), 2);
});

test('camera: default view is about 640 x 360 on a 667 x 375 phone; min zoom fits the arena', () => {
  const base = cameraBaseScale(667, 375, { baseW: 640, baseH: 360, maxBaseScale: 1.25 });
  close(667 / base, 640, 1); // visible world width
  const min = minZoomForArena(667, 375, ARENA, base);
  assert.ok(667 / (base * min) >= 1920 - 1 || 375 / (base * min) >= 1080 - 1);
});

test('camera: follow clamps at the arena edges and centres a too-wide view', () => {
  const scale = 1;
  assert.deepEqual(clampCameraCenter(0, 0, 640, 360, scale, ARENA), { x: 320, y: 180 });
  assert.deepEqual(clampCameraCenter(5000, 5000, 640, 360, scale, ARENA), { x: 1600, y: 900 });
  assert.deepEqual(clampCameraCenter(100, 100, 4000, 360, scale, ARENA), { x: 960, y: 180 });
  const moved = followCamera({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.15, 1 / 60);
  close(moved.x, 15);
});

test('screen <-> world round trip under the camera', () => {
  const camera = { x: 800, y: 450, scale: 1.7 };
  for (const [sx, sy] of [[0, 0], [333, 187], [667, 375]]) {
    const w = screenToWorld(sx, sy, camera, 667, 375);
    const s = worldToScreen(w.x, w.y, camera, 667, 375);
    close(s.x, sx); close(s.y, sy);
  }
  assert.deepEqual(screenToWorld(333.5, 187.5, camera, 667, 375), { x: 800, y: 450 });
});

test('HUD scale and short names', () => {
  close(hudScale(375, { min: 0.75, referenceHeight: 600, max: 1 }), 0.75);
  close(hudScale(540, { min: 0.75, referenceHeight: 600, max: 1 }), 0.9);
  close(hudScale(900, { min: 0.75, referenceHeight: 600, max: 1 }), 1);
  assert.equal(shortName('Student 01', 8), 'Student …');
  assert.equal(shortName('Ana', 8), 'Ana');
});
