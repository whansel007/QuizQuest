// F10: the arena draw order (public/hero-lab/game-config.js ARENA_DRAW_ORDER)
// and the render loop that follows it (public/hero-lab/world.js drawScene).
// Run: npm run test:mobile:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARENA_DRAW_ORDER } from '../../public/hero-lab/game-config.js';

const worldSource = readFileSync(new URL('../../public/hero-lab/world.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const below = (lower, upper) => {
  const a = ARENA_DRAW_ORDER.indexOf(lower), b = ARENA_DRAW_ORDER.indexOf(upper);
  assert.ok(a >= 0, `${lower} is a layer`); assert.ok(b >= 0, `${upper} is a layer`);
  assert.ok(a < b, `${lower} is drawn below ${upper}`);
};
// Body of a top-level function in world.js (up to the next top-level "}").
const functionBody = (name) => {
  const start = worldSource.indexOf(`\nfunction ${name}(`);
  assert.ok(start >= 0, `world.js defines ${name}`);
  return worldSource.slice(start, worldSource.indexOf('\n}\n', start));
};

test('draw order: a frozen list of unique layer ids', () => {
  assert.ok(Object.isFrozen(ARENA_DRAW_ORDER));
  assert.equal(new Set(ARENA_DRAW_ORDER).size, ARENA_DRAW_ORDER.length);
});

test('draw order: ground, rings, aim lines, shadows, enemies, heroes, effects, reticle, HUD', () => {
  const required = ['ground', 'campfireRings', 'aimLines', 'shadows', 'enemies', 'heroes', 'effects', 'aimReticle', 'hud'];
  for (let i = 1; i < required.length; i++) below(required[i - 1], required[i]);
  assert.equal(ARENA_DRAW_ORDER.at(-1), 'hud');
});

test('draw order: aim lines are under the hero sprites; the end reticle is above enemies', () => {
  below('aimLines', 'heroes');
  below('aimLines', 'shadows');
  below('aimLines', 'enemies');
  below('enemies', 'aimReticle');
  below('effects', 'aimReticle');
});

test('draw order: area markers and the Engineer laser keep their depth (above enemies, below heroes)', () => {
  below('enemies', 'worldMarkers');
  below('worldMarkers', 'heroes');
  assert.match(functionBody('paintWorldMarkersLayer'), /drawEngineerEffects\(/);
  assert.match(functionBody('paintWorldMarkersLayer'), /areaEffects/);
});

test('render loop: drawScene paints exactly the configured layers, in order', () => {
  assert.match(functionBody('drawScene'), /for \(const layerId of ARENA_DRAW_ORDER\)/);
  const painters = worldSource.slice(worldSource.indexOf('const ARENA_LAYERS = Object.freeze({'));
  const keys = [...painters.slice(0, painters.indexOf('});')).matchAll(/^\s+(\w+): /gm)].map((m) => m[1]);
  assert.deepEqual(keys, [...ARENA_DRAW_ORDER]);
});

test('render loop: the hero-origin aim lines and the reticle are in their layers', () => {
  const aimLines = functionBody('paintAimLinesLayer');
  assert.match(aimLines, /drawRangerAimGuides\(\)/); // Ranger bow line and Dead Aim line
  assert.match(aimLines, /drawTouchAimLine\(\)/);
  assert.match(functionBody('paintAimReticleLayer'), /drawTouchAimReticle\(\)/);
  // the line pass draws no reticle and the reticle pass draws no line
  assert.doesNotMatch(functionBody('drawTouchAimLine'), /arc\(/);
  assert.doesNotMatch(functionBody('drawTouchAimReticle'), /lineTo\(/);
  // nothing else calls the aim passes (they cannot leak into another layer)
  assert.equal(worldSource.match(/drawTouchAimLine\(\);/g).length, 1);
  assert.equal(worldSource.match(/drawTouchAimReticle\(\);/g).length, 1);
  assert.equal(worldSource.match(/drawRangerAimGuides\(\);/g).length, 1);
});
