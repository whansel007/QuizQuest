// ============================================================
// Kingdom block blueprints (web/src/student/kingdom/voxels.js)
// ------------------------------------------------------------
// The scene is cosmetic, but a blueprint that spills off its plot or
// a draw order that's wrong would show up as buildings poking through
// each other, so those rules are checked here.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');

let V;
test.before(async () => {
  V = await import('../web/src/student/kingdom/voxels.js');
});

const BUILDINGS = ['library', 'workshop', 'garden', 'tower'];

test('every block stays on its own plot and above ground', () => {
  for (const id of [...BUILDINGS, 'castle']) {
    const p = V.PLOTS[id];
    for (let lvl = 0; lvl <= 3; lvl++) {
      for (const b of V.blocks(id, lvl)) {
        assert.ok(b.x >= p.x && b.x < p.x + p.size && b.y >= p.y && b.y < p.y + p.size, `${id} L${lvl} block ${b.key} is off its plot`);
        assert.ok(b.z >= 0, `${id} L${lvl} block ${b.key} is underground`);
      }
    }
  }
});

test('plots never overlap, so buildings cannot grow into each other', () => {
  const ids = Object.keys(V.PLOTS).filter((id) => id !== 'scenery');
  const scenery = V.blocks('scenery', 0);
  for (const [i, a] of ids.entries()) {
    const A = V.PLOTS[a];
    for (const b of ids.slice(i + 1)) {
      const B = V.PLOTS[b];
      const apart = A.x + A.size <= B.x || B.x + B.size <= A.x || A.y + A.size <= B.y || B.y + B.size <= A.y;
      assert.ok(apart, `${a} and ${b} overlap`);
    }
    for (const s of scenery) assert.ok(!(s.x >= A.x && s.x < A.x + A.size && s.y >= A.y && s.y < A.y + A.size), `scenery ${s.key} is on the ${a} plot`);
  }
});

test('each level adds blocks; an empty plot has none', () => {
  for (const id of BUILDINGS) {
    assert.equal(V.blocks(id, 0).length, 0, `${id} level 0 should be an empty plot`);
    for (let lvl = 1; lvl <= 3; lvl++) assert.ok(V.blocks(id, lvl).length > V.blocks(id, lvl - 1).length, `${id} L${lvl} adds nothing`);
  }
  assert.ok(V.blocks('castle', 0).length > 0, 'the castle starts as a tent');
});

test('render hides covered faces and draws back to front', () => {
  // a 2x1x2 stack: the lower-left block has its top and +x side covered
  const list = [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]].map(([x, y, z]) => ({ x, y, z, c: '#808080' }));
  const out = V.render(list, new Set(list.map((v) => `${v.x},${v.y},${v.z}`)));
  const at = (x, z) => out.find((v) => v.x === x && v.z === z);
  assert.equal(at(0, 0).faces.length, 1, 'only the +y face of the hidden corner shows');
  assert.equal(at(1, 1).faces.length, 3);
  const sums = out.map((v) => v.x + v.y + v.z);
  assert.deepEqual(sums, [...sums].sort((a, b) => a - b));
  assert.equal(V.shade('#808080', 0.5), '#404040');
});
