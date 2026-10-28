// Groups on the dashboard's time and accuracy panel
const test = require('node:test');
const assert = require('node:assert/strict');
const zones = import('../web/src/teacher/charts/time-zones.mjs');

const opts = { slowMs: 20000, maxAccuracy: 0.5, lowN: 5 };
const q = (meanMs, accuracy, extra = {}) => ({ n: 8, meanMs, accuracy, flagged: false, ...extra });

test('each question lands in one plainly named group', async () => {
  const { zoneOf } = await zones;
  assert.equal(zoneOf(q(25000, 0.3, { flagged: true }), opts), 'reread', 'the server flag wins');
  assert.equal(zoneOf(q(8000, 0.3), opts), 'quickWrong');
  assert.equal(zoneOf(q(25000, 0.8), opts), 'slowRight');
  assert.equal(zoneOf(q(20000, 0.5), opts), 'slowRight', 'the lines belong to "slow" and "mostly right"');
  assert.equal(zoneOf(q(8000, 0.9), opts), 'fine');
  assert.equal(zoneOf(q(25000, 0.1, { n: 4 }), opts), 'few', 'too few answers to place it');
  assert.equal(zoneOf(q(25000, null), opts), 'few', 'all answers awaiting marking');
  // too few questions to know what is slow: only right / wrong
  assert.equal(zoneOf(q(25000, 0.2), { ...opts, slowMs: null }), 'wrong');
  assert.equal(zoneOf(q(25000, 0.9), { ...opts, slowMs: null }), 'right');
});

test('group counts come in reading order, worth-a-look first', async () => {
  const { zoneCounts } = await zones;
  const counts = zoneCounts([q(8000, 0.9), q(25000, 0.3, { flagged: true }), q(8000, 0.9), q(8000, 0.2), q(1, 1, { n: 1 })], opts);
  assert.deepEqual(counts.map((z) => [z.id, z.count]), [['reread', 1], ['quickWrong', 1], ['fine', 2], ['few', 1]]);
  assert.ok(counts.every((z) => z.label && z.hint && z.action), 'each group says what to do');
  assert.deepEqual(counts.filter((z) => z.act).map((z) => z.id), ['reread', 'quickWrong'], 'only the wrong groups ask for action');
});

test('chart labels are cut at a word and never run long', async () => {
  const { shortLabel } = await zones;
  assert.equal(shortLabel('What does DNS do?'), 'What does DNS do?');
  assert.equal(shortLabel('Why is UDP often chosen for live online games?', 32), 'Why is UDP often chosen for…');
  assert.ok(shortLabel('x'.repeat(80), 20).length <= 20);
});
