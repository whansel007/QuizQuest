const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoom } = require('../src/hero-lab/room');

function makeIo(events) {
  const namespace = {
    emit: (event, payload) => events.push({ event, payload }),
    to: () => ({ emit: (event, payload) => events.push({ event, payload }) }),
  };
  return { of: () => namespace };
}

test('Engineer skill places a turret through the normal room action', (t) => {
  const events = [];
  const room = createRoom({ io: makeIo(events), id: 'engineer-test', log: () => {} });
  t.after(() => room.destroy());
  const socket = { id: 'engineer-player', data: {}, emit: (event, payload) => events.push({ event, payload }) };
  const joined = room.join(socket, { heroId: 'engineer' });
  assert.equal(joined.ok, true);
  const player = room.snapshot().players.find((candidate) => candidate.id === socket.id);
  assert.equal(player.heroId, 'engineer');

  room.skill(socket, { x: player.x + 100, y: player.y });

  const turret = room.snapshot().turrets.find((candidate) => candidate.ownerId === socket.id);
  assert.ok(turret, 'the skill creates an owned turret in the authoritative game state');
  assert.equal(turret.ammo, undefined, 'turrets have no ammunition limit');
  assert.ok(turret.remainingMs <= 30000 && turret.remainingMs > 29800,
    'new turrets start with a 30-second lifespan');
  assert.ok(events.some(({ event }) => event === 'turret_deployed'), 'placement broadcasts the deployed event');
  const remainingMs = room.snapshot().players.find((candidate) => candidate.id === socket.id).abilities.skill.remainingMs;
  assert.ok(remainingMs <= 18000 && remainingMs > 17900,
    'successful placement starts the 18-second skill cooldown');
});
