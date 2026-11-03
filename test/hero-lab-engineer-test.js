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
  const snapshot = room.snapshot();
  const player = snapshot.players.find((candidate) => candidate.id === socket.id);
  assert.equal(player.heroId, 'engineer');

  // A turret may not stand within 110px of the campfire, and the snap search
  // can only reach 60px past the aimed point. A target beside the fire is
  // therefore refused outright, and the hero spawns on a ring around the fire
  // at a random angle - so aiming to the side made this test fail about one
  // run in seven. Aim away from the fire instead: the spot is then legal
  // whatever angle the hero spawned on.
  const awayX = player.x - snapshot.campfire.x;
  const awayY = player.y - snapshot.campfire.y;
  const fromFire = Math.hypot(awayX, awayY) || 1;
  room.skill(socket, { x: player.x + (awayX / fromFire) * 100, y: player.y + (awayY / fromFire) * 100 });

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

test('the Engineer skill refuses a placement that would stand on the campfire', (t) => {
  const events = [];
  const room = createRoom({ io: makeIo(events), id: 'engineer-refuse-test', log: () => {} });
  t.after(() => room.destroy());
  const socket = { id: 'engineer-refuse-player', data: {}, emit: (event, payload) => events.push({ event, payload }) };
  room.join(socket, { heroId: 'engineer' });
  const campfire = room.snapshot().campfire;

  // The fire is the one place a turret may never stand: the exclusion zone
  // is wider than the snap search, so a placement aimed at the fire itself
  // has nowhere legal to go and the game refuses it. This is the rule the
  // placement test above has to aim around.
  room.skill(socket, { x: campfire.x, y: campfire.y });

  assert.equal(room.snapshot().turrets.find((candidate) => candidate.ownerId === socket.id), undefined,
    'no turret is placed next to the campfire');
  assert.equal(events.some(({ event }) => event === 'turret_deployed'), false,
    'a refused placement broadcasts nothing');
  assert.ok(events.some(({ event }) => event === 'engineer_place_failed'),
    'the player is told the placement failed');
});
