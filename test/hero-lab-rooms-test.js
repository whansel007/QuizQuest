// Stage 1: rooms are independent. Two clients in two rooms must never see each
// other's players or events, and an empty room must stop ticking.
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { start } = require('../server');

let server;
let base;

test.before(async () => {
  server = start(0, { dataFile: null });
  await new Promise((resolve) => server.httpServer.once('listening', resolve));
  base = `http://localhost:${server.httpServer.address().port}`;
});

test.after(() => {
  server?.io.close();
});

function connectClient() {
  return new Promise((resolve, reject) => {
    const socket = connect(`${base}/hero-lab`, { transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function waitFor(socket, event, predicate = () => true, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timeout);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

test('two rooms never share players or broadcasts', async (t) => {
  const roomA = server.heroLab.rooms.getDefaultRoom();
  const roomB = server.heroLab.createRoom();
  assert.ok(roomA && roomB, 'the manager can hold more than one room');
  assert.notEqual(roomA.id, roomB.id);

  const first = await connectClient();
  const second = await connectClient();
  t.after(() => { first.disconnect(); second.disconnect(); });

  const seenByFirst = [];
  const seenBySecond = [];
  const waveStartsForFirst = [];
  const waveStartsForSecond = [];
  first.on('state', (state) => seenByFirst.push(state));
  second.on('state', (state) => seenBySecond.push(state));
  first.on('wave_start', (event) => waveStartsForFirst.push(event));
  second.on('wave_start', (event) => waveStartsForSecond.push(event));

  const firstWelcome = waitFor(first, 'welcome');
  first.emit('join', { heroId: 'sheriff' });
  const { you: firstId } = await firstWelcome;
  await waitFor(first, 'state', (state) => state.players.some((player) => player.id === firstId));
  roomA.startRunNow();

  const secondWelcome = waitFor(second, 'welcome');
  second.emit('join', { heroId: 'guardian', roomCode: roomB.code });
  const { you: secondId } = await secondWelcome;
  await waitFor(second, 'state', (state) => state.players.some((player) => player.id === secondId));
  roomB.startRunNow();

  // Let several ticks land in both rooms.
  await new Promise((resolve) => setTimeout(resolve, 400));

  assert.ok(seenByFirst.length > 0 && seenBySecond.length > 0, 'both rooms keep ticking');
  for (const state of seenByFirst) {
    assert.deepEqual(state.players.map((player) => player.id), [firstId], 'room A only ever sees its own player');
  }
  for (const state of seenBySecond) {
    assert.deepEqual(state.players.map((player) => player.id), [secondId], 'room B only ever sees its own player');
  }

  assert.equal(waveStartsForFirst.length, 1, 'room A started exactly one wave');
  assert.equal(waveStartsForSecond.length, 1, 'room B started exactly one wave');
  assert.equal(roomA.playerCount(), 1);
  assert.equal(roomB.playerCount(), 1);
  assert.equal(roomA.id !== roomB.id, true);

  // Killing the campfire in one room must not end the other room's run.
  const secondEnded = [];
  second.on('game_over', (event) => secondEnded.push(event));
  roomA.campfire.hp = 0;
  await waitFor(first, 'game_over', () => true);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.deepEqual(secondEnded, [], 'a loss in room A never reaches room B');
  assert.equal(roomB.playerCount(), 1);
});

test('a room stops ticking when its last player leaves', async (t) => {
  const room = server.heroLab.createRoom();
  const client = await connectClient();
  t.after(() => client.disconnect());

  const welcome = waitFor(client, 'welcome');
  client.emit('join', { heroId: 'pilot', roomCode: room.code });
  await welcome;
  await waitFor(client, 'state', (state) => state.players.length === 1);
  assert.equal(room.emptySince(), 0, 'an occupied room is not marked empty');

  client.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.equal(room.playerCount(), 0);
  assert.ok(room.emptySince() > 0, 'the room records when it became empty so the manager can reap it');
});

// ---------------------------------------------------------------------------
// Stage 2: codes, capacity, late join, host migration and reconnect grace.
// ---------------------------------------------------------------------------

async function loginAs(userId) {
  const response = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }),
  });
  assert.equal(response.status, 200);
  return (await response.json()).token;
}

function connectWithToken(token) {
  return new Promise((resolve, reject) => {
    const socket = connect(`${base}/hero-lab`, { transports: ['websocket'], auth: token ? { token } : {} });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function emitJoin(socket, payload) {
  const welcome = waitFor(socket, 'welcome');
  const failure = waitFor(socket, 'join_error').catch(() => null);
  socket.emit('join', payload);
  return Promise.race([welcome, failure]);
}

test('created rooms get a four-consonant code that another browser can use', async (t) => {
  const host = await connectClient();
  t.after(() => host.disconnect());
  const hostWelcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  const code = hostWelcome.room?.code;
  assert.match(code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/, 'codes are four consonants, no vowels and no Y');
  assert.equal(hostWelcome.waiting, false);

  const guest = await connectClient();
  t.after(() => guest.disconnect());
  const guestWelcome = await emitJoin(guest, { heroId: 'pilot', roomCode: code.toLowerCase() });
  assert.equal(guestWelcome.waiting, false, 'the lobby lets a guest walk straight in');
  assert.equal(guestWelcome.room.code, code);
  assert.equal(guestWelcome.room.phase, 'lobby');

  const room = server.heroLab.rooms.findByCode(code);
  assert.ok(room, 'the code resolves to the room');
  assert.equal(room.occupancy(), 2);
  assert.equal(room.playerCount(), 2);
});

test('joining a missing room fails clearly and is rate limited after five tries', async (t) => {
  const client = await connectClient();
  t.after(() => client.disconnect());
  const codes = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await emitJoin(client, { heroId: 'sheriff', roomCode: 'ZZZZ' });
    codes.push(result?.code);
  }
  assert.deepEqual(codes.slice(0, 5), ['not_found', 'not_found', 'not_found', 'not_found', 'not_found']);
  assert.equal(codes[5], 'rate_limited', 'the sixth failed attempt in a minute is throttled');
});

test('a full room rejects the fifth player', async (t) => {
  const host = await connectClient();
  t.after(() => host.disconnect());
  const { room } = await emitJoin(host, { heroId: 'sheriff', create: true });
  const guests = [];
  for (const heroId of ['pilot', 'guardian', 'bubbles']) {
    const guest = await connectClient();
    guests.push(guest);
    t.after(() => guest.disconnect());
    await emitJoin(guest, { heroId, roomCode: room.code });
  }
  const extra = await connectClient();
  t.after(() => extra.disconnect());
  const result = await emitJoin(extra, { heroId: 'electromancer', roomCode: room.code });
  assert.equal(result.code, 'full');
  assert.match(result.message, /Room is full \(4\/4\)/);
});

// The break is now REST -> VOTE -> READY. Tests do not wait out the 8 s rest:
// they wait for the rest phase to open, then skip it.
async function openVote(host, room) {
  await waitFor(host, 'state', (state) => state.break?.phase === 'rest', 5000);
  room.skipBreakPhase();
  return waitFor(host, 'state', (state) => state.buffVote?.cards?.length === 3, 8000);
}

test('a late joiner spectates, then spawns at the break with the run buffs applied', async (t) => {
  const host = await connectClient();
  t.after(() => host.disconnect());
  const hostWelcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  const liveRoom = server.heroLab.rooms.findByCode(hostWelcome.room.code);
  liveRoom.startRunNow();

  // Clear wave 1 so the rest runs, skip it, then pick a card in the vote.
  liveRoom.clearWave();
  const vote = await openVote(host, liveRoom);
  const card = vote.buffVote.cards[0];
  host.emit('buff_vote', card.id);
  const afterVote = await waitFor(host, 'state', (state) => !state.buffVote && state.activeBuffs.length === 1, 8000);
  const waveBefore = afterVote.wave.number;

  const guest = await connectClient();
  t.after(() => guest.disconnect());
  const guestWelcome = await emitJoin(guest, { heroId: 'sheriff', roomCode: hostWelcome.room.code });
  assert.equal(guestWelcome.waiting, true);

  const spectating = await waitFor(guest, 'state', (state) => state.room?.waiting?.some((entry) => entry.id === guestWelcome.you), 4000);
  assert.equal(spectating.players.some((player) => player.id === guestWelcome.you), false, 'a waiting player is not in the arena');
  assert.equal(spectating.room.players.length, 1);

  // Wave 2 starts after the break; clear it so the next break spawns the guest.
  await waitFor(guest, 'state', (state) => state.wave.number > waveBefore, 9000);
  liveRoom.clearWave();
  const spawned = await waitFor(guest, 'state', (state) => state.players.some((player) => player.id === guestWelcome.you), 6000);

  assert.equal(spawned.wave.number, waveBefore + 1, 'the guest spawns during the break, not mid-wave');
  assert.equal(spawned.room.waiting.length, 0);
  const guestPlayer = spawned.players.find((player) => player.id === guestWelcome.you);
  const hostPlayer = spawned.players.find((player) => player.id === hostWelcome.you);
  assert.equal(guestPlayer.invulnerable, true, 'a late joiner spawns with brief invulnerability');
  assert.equal(guestPlayer.attack, hostPlayer.attack, 'the same hero has the same buffed attack');
  assert.equal(guestPlayer.maxHp, hostPlayer.maxHp, 'the same hero has the same buffed max HP');
  assert.equal(guestPlayer.defense, hostPlayer.defense);
  assert.equal(guestPlayer.speed, hostPlayer.speed);
  assert.equal(guestPlayer.wavesReached, waveBefore + 1);
  assert.equal(guestPlayer.wavesParticipated, 0, 'participation starts at the wave they spawned for');
});

test('the host role moves to the longest-present player', async (t) => {
  const host = await connectClient();
  const guest = await connectClient();
  t.after(() => { host.disconnect(); guest.disconnect(); });
  const hostWelcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  const guestWelcome = await emitJoin(guest, { heroId: 'pilot', roomCode: hostWelcome.room.code });
  const room = server.heroLab.rooms.findByCode(hostWelcome.room.code);
  assert.equal(room.hostId(), host.id);
  room.spawnWaitingPlayers();
  await waitFor(guest, 'state', (state) => state.players.some((player) => player.id === guestWelcome.you), 4000);

  const changed = waitFor(guest, 'host_changed', () => true, 4000);
  host.disconnect();
  const event = await changed;
  assert.equal(event.hostId, guest.id);
  assert.equal(room.hostId(), guest.id);
});

test('a signed-in hero waits for its owner to reconnect', async (t) => {
  const token = await loginAs('s-02');
  const first = await connectWithToken(token);
  const welcome = await emitJoin(first, { heroId: 'sheriff', create: true });
  const room = server.heroLab.rooms.findByCode(welcome.room.code);
  const originalId = welcome.you;
  assert.equal(room.playerCount(), 1);
  // Grace only applies to a live run; the lobby frees the slot immediately.
  room.startRunNow();

  first.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(room.playerCount(), 1, 'the hero stays behind during the grace period');
  assert.equal(room.players.get(originalId)?.disconnected, true);

  const second = await connectWithToken(token);
  t.after(() => second.disconnect());
  const resumed = await emitJoin(second, { heroId: 'sheriff', roomCode: welcome.room.code });
  assert.notEqual(resumed.you, originalId, 'the reconnected socket gets a new id');
  assert.equal(resumed.waiting, false);
  assert.equal(room.playerCount(), 1, 'reconnecting resumes the hero instead of adding a second one');
  const state = await waitFor(second, 'state', (snapshot) => snapshot.players.length === 1, 4000);
  assert.equal(state.players[0].id, resumed.you);
  assert.equal(state.players[0].disconnected, false);
  // a signed-in hero carries its student's name, not the hero's
  assert.equal(state.players[0].name, server.quiz.db.users.find((u) => u.id === 's-02').name);
});

// ---------------------------------------------------------------------------
// Stage 3: lobby, countdown, training dummy and hero swap.
// ---------------------------------------------------------------------------

test('the lobby spawns heroes on the ring with a dummy and no enemies', async (t) => {
  const host = await connectClient();
  t.after(() => host.disconnect());
  const welcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  const room = server.heroLab.rooms.findByCode(welcome.room.code);

  const state = await waitFor(host, 'state', (snapshot) => snapshot.room?.phase === 'lobby', 4000);
  assert.equal(state.room.phase, 'lobby');
  assert.equal(state.wave.number, 0, 'no wave has started');
  assert.equal(state.wave.enemiesRemaining, 0, 'the dummy is not an enemy');
  assert.equal(state.monsters.filter((monster) => monster.isDummy).length, 4);
  assert.equal(state.monsters.filter((monster) => !monster.isDummy).length, 0);
  assert.equal(state.campfire.hp, state.campfire.maxHp);

  const player = state.players[0];
  const dummy = state.monsters.find((monster) => monster.isDummy);
  const fromCampfire = Math.hypot(dummy.x - state.campfire.x, dummy.y - state.campfire.y);
  assert.ok(fromCampfire >= 180 && fromCampfire <= 320, `dummy sits 180-320 px from the campfire (was ${fromCampfire})`);
  assert.ok(Math.hypot(dummy.x - player.x, dummy.y - player.y) >= 80, 'the dummy keeps clear of heroes');
  assert.equal(dummy.emoji, '🎯');
  assert.equal(dummy.hp, 300);
  assert.equal(dummy.scale, 1.2);
  assert.equal(room.phase(), 'lobby');
});

test('only the host starts the run, and the countdown opens wave 1', async (t) => {
  const host = await connectClient();
  const guest = await connectClient();
  t.after(() => { host.disconnect(); guest.disconnect(); });
  const hostWelcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  await emitJoin(guest, { heroId: 'pilot', roomCode: hostWelcome.room.code });
  const room = server.heroLab.rooms.findByCode(hostWelcome.room.code);

  const rejected = waitFor(guest, 'start_rejected', () => true, 3000);
  guest.emit('start_run');
  assert.equal((await rejected).code, 'not_host');
  assert.equal(room.phase(), 'lobby', 'a guest cannot start the run');

  const countdown = waitFor(host, 'countdown', () => true, 3000);
  host.emit('start_run');
  const started = await countdown;
  assert.equal(started.seconds, 3);
  assert.equal(room.phase(), 'countdown');

  const running = await waitFor(host, 'state', (snapshot) => snapshot.room?.phase === 'running', 6000);
  assert.equal(running.wave.number, 1, 'the run starts at wave 1');
  assert.equal(running.monsters.filter((monster) => monster.isDummy).length, 0, 'the dummy is gone once the run starts');
  assert.ok(running.players.every((player) => player.hp === player.maxHp));
});

test('the dummy takes damage and talents but never counts as a kill', async (t) => {
  const host = await connectClient();
  t.after(() => host.disconnect());
  const welcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  const room = server.heroLab.rooms.findByCode(welcome.room.code);
  const kills = [];
  host.on('monster_killed', (event) => kills.push(event));

  const state = await waitFor(host, 'state', (snapshot) => snapshot.room?.phase === 'lobby', 4000);
  const dummy = state.monsters.find((monster) => monster.isDummy);
  const player = room.players.get(welcome.you);
  player.x = dummy.x - 90;
  player.y = dummy.y;
  player.aim = { x: 1, y: 0 };
  player.hero.aim = { x: 1, y: 0 };

  const hit = waitFor(host, 'hit', (event) => event.enemyType === 'dummy', 4000);
  host.emit('fire', 'primary');
  const damage = await hit;
  assert.ok(damage.damage > 0);
  const after = await waitFor(host, 'state', (snapshot) => {
    const target = snapshot.monsters.find((monster) => monster.id === dummy.id);
    return target && target.hp < 300;
  }, 4000);
  assert.equal(after.monsters.find((monster) => monster.id === dummy.id).hp < 300, true);
  assert.equal(room.players.get(welcome.you).kills, 0, 'dummy damage is not a kill');
  assert.deepEqual(kills, [], 'no kill event fires for the dummy');
  assert.equal(room.monsters.get(dummy.id)?.isDummy, true);
});

test('a broken dummy comes back after three seconds', async (t) => {
  const host = await connectClient();
  t.after(() => host.disconnect());
  const welcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  const room = server.heroLab.rooms.findByCode(welcome.room.code);
  await waitFor(host, 'state', (snapshot) => snapshot.room?.phase === 'lobby', 4000);

  const broken = waitFor(host, 'dummy_broken', () => true, 4000);
  const dummy = [...room.monsters.values()].find((monster) => monster.isDummy);
  dummy.hp = 1;
  const player = room.players.get(welcome.you);
  player.x = dummy.x - 90;
  player.y = dummy.y;
  player.aim = { x: 1, y: 0 };
  player.hero.aim = { x: 1, y: 0 };
  host.emit('fire', 'primary');
  await broken;
  assert.equal(room.dummyCount(), 3);

  const respawned = await waitFor(host, 'state', (snapshot) => snapshot.monsters.filter((monster) => monster.isDummy && monster.hp === 300).length === 4, 6000);
  assert.equal(respawned.monsters.filter((monster) => monster.isDummy).length, 4);
});

test('heroes can swap in the lobby but not once the run starts', async (t) => {
  const host = await connectClient();
  t.after(() => host.disconnect());
  const welcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  const room = server.heroLab.rooms.findByCode(welcome.room.code);
  await waitFor(host, 'state', (snapshot) => snapshot.room?.phase === 'lobby', 4000);

  const swapped = waitFor(host, 'hero_swapped', () => true, 4000);
  host.emit('swap_hero', 'bubbles');
  const event = await swapped;
  assert.equal(event.heroId, 'bubbles');
  const player = room.players.get(welcome.you);
  assert.equal(player.heroId, 'bubbles');
  assert.equal(player.hero.name, 'Bubbles');
  assert.equal(player.hero.hp, player.hero.maxHp);

  room.startRunNow();
  const rejected = waitFor(host, 'swap_rejected', () => true, 3000);
  host.emit('swap_hero', 'sheriff');
  assert.equal((await rejected).code, 'locked');
  assert.equal(room.players.get(welcome.you).heroId, 'bubbles');
});

// ---------------------------------------------------------------------------
// Stage 4: edge cases, lifecycle and the debug view.
// ---------------------------------------------------------------------------

test('a waiting player cannot vote and cannot stall the vote', async (t) => {
  const host = await connectClient();
  t.after(() => host.disconnect());
  const welcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  const room = server.heroLab.rooms.findByCode(welcome.room.code);
  room.startRunNow();
  room.clearWave();
  const vote = await openVote(host, room);

  const guest = await connectClient();
  t.after(() => guest.disconnect());
  const guestWelcome = await emitJoin(guest, { heroId: 'pilot', roomCode: welcome.room.code });
  assert.equal(guestWelcome.waiting, true, 'the guest waits for the next break');

  guest.emit('buff_vote', vote.buffVote.cards[0].id);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const afterGuest = room.snapshot();
  assert.equal(afterGuest.buffVote.voteCount, 0, 'a waiting player has no vote');

  const applied = waitFor(host, 'state', (state) => !state.buffVote && state.lastBuff, 5000);
  host.emit('buff_vote', vote.buffVote.cards[0].id);
  assert.equal((await applied).lastBuff.id, vote.buffVote.cards[0].id);
});

test('a disconnect during the countdown never freezes the room', async (t) => {
  const host = await connectClient();
  const guest = await connectClient();
  t.after(() => { host.disconnect(); guest.disconnect(); });
  const hostWelcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  await emitJoin(guest, { heroId: 'pilot', roomCode: hostWelcome.room.code });
  const room = server.heroLab.rooms.findByCode(hostWelcome.room.code);

  const countdown = waitFor(host, 'countdown', () => true, 3000);
  host.emit('start_run');
  await countdown;
  assert.equal(room.phase(), 'countdown');

  // The host vanishes mid-countdown: the guest inherits the room and the run
  // still begins on schedule.
  const changed = waitFor(guest, 'host_changed', () => true, 3000);
  host.disconnect();
  assert.equal((await changed).hostId, guest.id);
  const running = await waitFor(guest, 'state', (state) => state.room?.phase === 'running', 6000);
  assert.equal(running.wave.number, 1);
  assert.equal(running.players.length, 1);
  assert.equal(room.hostId(), guest.id);
});

test('a room code is reusable only after its room is destroyed', async (t) => {
  const room = server.heroLab.createRoom();
  const code = room.code;
  assert.equal(server.heroLab.rooms.findByCode(code), room);
  assert.equal(server.heroLab.rooms.create({ code }), null, 'a live room keeps its code');

  server.heroLab.rooms.destroy(room);
  assert.equal(server.heroLab.rooms.findByCode(code), null);
  const replacement = server.heroLab.rooms.create({ code });
  t.after(() => server.heroLab.rooms.destroy(replacement));
  assert.equal(replacement.code, code, 'the code is free again');
});

test('the debug endpoint lists live rooms with occupancy and tick time', async (t) => {
  const token = await loginAs('s-01');
  const room = server.heroLab.createRoom();
  t.after(() => server.heroLab.rooms.destroy(room));

  const client = await connectClient();
  t.after(() => client.disconnect());
  await emitJoin(client, { heroId: 'sheriff', roomCode: room.code });
  await new Promise((resolve) => setTimeout(resolve, 250));

  const response = await fetch(`${base}/api/student/hero-lab/rooms`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  const entry = body.rooms.find((item) => item.id === room.id);
  assert.ok(entry, 'the room appears in the debug list');
  assert.equal(entry.code, room.code);
  assert.equal(entry.phase, 'lobby');
  assert.equal(entry.players, 1);
  assert.equal(entry.waiting, 0);
  assert.ok(entry.tickMs > 0, 'a live room reports its tick cost');
  assert.ok(body.maxRooms > 0);
});

test('leaving at the dawn milestone hands the room to the next player', async (t) => {
  const host = await connectClient();
  const guest = await connectClient();
  t.after(() => { host.disconnect(); guest.disconnect(); });
  const hostWelcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  const guestWelcome = await emitJoin(guest, { heroId: 'pilot', roomCode: hostWelcome.room.code });
  const room = server.heroLab.rooms.findByCode(hostWelcome.room.code);
  room.startRunNow();

  assert.equal(room.openMilestone(), true);
  await waitFor(guest, 'milestone_dawn', () => true, 3000);
  assert.equal(room.snapshot().dawn.decisionsRemaining, 2, 'both heroes must decide');

  // The host walks away at dawn: the guest inherits the room and keeps playing.
  const changed = waitFor(guest, 'host_changed', () => true, 3000);
  const result = waitFor(host, 'run_result', () => true, 3000);
  const left = waitFor(host, 'left_room', () => true, 3000);
  host.emit('milestone_choice', 'leave');
  assert.equal((await changed).hostId, guestWelcome.you);
  assert.equal((await result).reason, 'milestone');
  await left;
  assert.equal(room.playerCount(), 1, 'the slot is freed immediately');
  assert.equal(room.hostId(), guestWelcome.you);

  guest.emit('milestone_choice', 'continue');
  await new Promise((resolve) => setTimeout(resolve, 200));
  const after = room.snapshot();
  assert.equal(after.dawn, null, 'the milestone closes');
  assert.equal(after.gameEnded, false, 'the run continues for the remaining hero');
  assert.equal(after.room.phase, 'running');
  assert.equal(after.players.length, 1);
  assert.equal(room.debugInfo().wave, 1, 'the wave counter is untouched');
});

test('a downed solo hero respawns on the ring at half health with a shield', async (t) => {
  const host = await connectClient();
  t.after(() => host.disconnect());
  const welcome = await emitJoin(host, { heroId: 'sheriff', create: true });
  const room = server.heroLab.rooms.findByCode(welcome.room.code);
  room.startRunNow();
  const player = room.players.get(welcome.you);
  const campfireBefore = room.snapshot().campfire.hp;

  player.hero.hp = 0;
  const downed = await waitFor(host, 'hero_downed', () => true, 4000);
  assert.equal(downed.playerId, welcome.you);
  assert.equal(downed.solo, true, 'a lone hero uses the short solo timer');
  assert.equal(downed.durationMs, 6000);
  const downedState = room.snapshot();
  assert.equal(downedState.players[0].downed, true);
  assert.ok(downedState.campfire.hp < campfireBefore, 'dying alone costs the campfire health');

  // Fast-forward the timer instead of waiting the full six seconds.
  player.respawnRemainingMs = 30;
  await waitFor(host, 'hero_respawn', () => true, 5000);
  const after = room.snapshot();
  const me = after.players[0];
  assert.equal(me.downed, false);
  assert.ok(Math.abs(me.hp - me.maxHp / 2) <= 1, `respawns at half health (${me.hp}/${me.maxHp})`);
  assert.equal(me.invulnerable, true, 'the respawn shield is up');
  const distance = Math.hypot(me.x - after.campfire.x, me.y - after.campfire.y);
  assert.ok(distance > 0, 'the hero is placed on the respawn ring, not on the fire');
});
