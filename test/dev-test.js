const test = require('node:test');
const assert = require('node:assert/strict');
const { availableApiPort, hasSeededDemoAccounts, supportsCurrentHeroLab } = require('../scripts/dev');

test('the local launcher moves the API to the next available port', async () => {
  const checked = [];
  const port = await availableApiPort(3000, async (candidate) => {
    checked.push(candidate);
    return candidate === 3002;
  });
  assert.equal(port, 3002);
  assert.deepEqual(checked, [3000, 3001, 3002]);
});

test('the local launcher reports when its API port range is exhausted', async () => {
  await assert.rejects(
    availableApiPort(64000, async () => false),
    /No free API port found from 64000 to 64099\./,
  );
});

test('the local launcher only reuses an API that serves the seeded test account', () => {
  assert.equal(hasSeededDemoAccounts([{ id: 's-01', email: 'student01@quizquest.demo' }]), true);
  assert.equal(hasSeededDemoAccounts([{ id: 's-01', email: 'real@example.org' }]), false);
  assert.equal(hasSeededDemoAccounts([]), false);
});

test('the local launcher rejects an API that cannot accept the current hero roster', () => {
  assert.equal(supportsCurrentHeroLab({ heroLabHeroes: ['sheriff', 'fairy'] }), false);
  assert.equal(supportsCurrentHeroLab({ heroLabHeroes: ['sheriff', 'fairy', 'engineer'] }), true);
});
