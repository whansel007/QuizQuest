// Phase C - server-side verification.
//
// Covers the four changes whose behaviour lives in src/hero-lab/room.js:
//   1. Bubbles' trap refund is 50 % of the TOTAL cooldown (not of what is left)
//   2. Pilot emits the same cooldown-refund popup as Sheriff, plus a mech_ready
//      event when Mech Suit comes back
//   3. Breaking a lobby training dummy fires kill talents (and nothing else)
//   4. The Campfire Heart card replenishes HP by the same amount its max grew
//
// Run: node scratch/_phaseC_server.js
const { io: connect } = require('socket.io-client');
const { start } = require('../server');

let pass = 0;
let fail = 0;
function check(label, ok, detail) {
  if (ok) { pass += 1; console.log(`  PASS  ${label}`); }
  else { fail += 1; console.log(`  FAIL  ${label}${detail === undefined ? '' : ` -> ${JSON.stringify(detail)}`}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs = 4000, stepMs = 40) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = fn();
    if (value) return value;
    await sleep(stepMs);
  }
  return null;
}

const server = start(0, { dataFile: null });

function join(heroId, create) {
  return new Promise((resolve, reject) => {
    const base = `http://localhost:${server.httpServer.address().port}`;
    const socket = connect(`${base}/hero-lab`, { transports: ['websocket'] });
    const events = { refunds: [], pilotRefunds: [], mechReady: [], sheriffRefunds: [] };
    socket.on('pilot_cooldown_refund', (e) => events.pilotRefunds.push(e));
    socket.on('mech_ready', (e) => events.mechReady.push(e));
    socket.on('sheriff_cooldown_refund', (e) => events.sheriffRefunds.push(e));
    socket.on('connect_error', reject);
    socket.on('connect', () => socket.emit('join', { heroId, create }));
    socket.once('welcome', (welcome) => {
      const room = server.heroLab.rooms.findByCode(welcome.room.code);
      resolve({ socket, room, events, playerId: welcome.you });
    });
  });
}

async function run() {
  await new Promise((r) => server.httpServer.once('listening', r));

  // ---------------------------------------------------------------- 1. Bubbles
  {
    console.log('\n[1] Bubbles - trap kill refunds 50% of the TOTAL cooldown');
    const { socket, room, playerId } = await join('bubbles', true);
    room.startRunNow();
    await waitFor(() => room.phase() === 'running');

    const player = room.players.get(playerId);
    const cooldown = player.hero.cooldowns.skill;
    const fraction = player.hero.spec.bubbleTrap.killCooldownRefundFraction;

    // Park a finisher-range enemy right in front of the hero so the trap latches
    // on immediately and detonates on it.
    const spawned = room.debugSpawnEnemies(1, 40);
    check('an enemy spawned to trap', spawned === 1, spawned);
    const victim = [...room.monsters.values()].find((m) => !m.isDummy);
    victim.x = player.x + 60;
    victim.y = player.y;
    victim.hp = 40; // <= finisherDamage (44)

    socket.emit('aim', { x: 1, y: 0 });
    await sleep(60);
    socket.emit('skill');
    await sleep(80);
    const totalMs = cooldown.durationMs;
    check('the skill went on its full cooldown', cooldown.readyAt - Date.now() > totalMs * 0.9,
      { remaining: cooldown.readyAt - Date.now(), totalMs });

    // Age the cooldown so the kill lands mid-cycle (~8.5 s left). With 8.5 s left
    // the OLD rule (half of the remainder) would cut ~4.25 s while the new rule
    // cuts a flat 7 s - the two are then far enough apart to tell apart.
    cooldown.readyAt = Date.now() + 9000;
    const readyAtBeforeKill = cooldown.readyAt;

    const died = await waitFor(() => victim.dead || !room.monsters.has(victim.id), 3000);
    check('the trapped enemy died to the trap', Boolean(died));
    await sleep(120);

    const cut = readyAtBeforeKill - cooldown.readyAt;
    const expected = totalMs * fraction;
    const remainingAtKill = readyAtBeforeKill - Date.now();
    check(`the refund is ${Math.round(fraction * 100)}% of the TOTAL cooldown`, Math.abs(cut - expected) <= 30,
      { cut, expected, totalMs, remainingAtKill });
    check('the refund is a fraction of the total, not of the remainder',
      cut > remainingAtKill * 0.5 + 500, { cut, oldRuleWouldCut: remainingAtKill * 0.5, remainingAtKill });

    socket.disconnect();
    await sleep(120);
  }

  // ------------------------------------------------------------------ 2. Pilot
  {
    console.log('\n[2] Pilot - refund popup on kill + robot bounce when Mech Suit is back');
    const { socket, room, events, playerId } = await join('pilot', true);
    room.startRunNow();
    await waitFor(() => room.phase() === 'running');
    const player = room.players.get(playerId);
    const cooldown = player.hero.cooldowns.ultimate;

    // Put the ultimate on cooldown the way a real cast would.
    cooldown.readyAt = Date.now() + cooldown.durationMs;
    cooldown.cutThisCycleMs = 0;
    player.pilotMechReady = false;
    const beforeReadyAt = cooldown.readyAt;

    room.debugSpawnEnemies(1, 40);
    const killed = room.debugKillAll();
    check('a kill was registered', killed >= 1, killed);
    await sleep(150);

    check('a pilot_cooldown_refund event was emitted', events.pilotRefunds.length === 1, events.pilotRefunds);
    const refund = events.pilotRefunds[0] || {};
    check('the refund is 1s per kill', refund.refundMs === 1000, refund.refundMs);
    check('the refund carried the hero position', typeof refund.x === 'number' && typeof refund.y === 'number', refund);
    check('the refund actually shortened the ultimate', beforeReadyAt - cooldown.readyAt === 1000,
      { before: beforeReadyAt, after: cooldown.readyAt });

    // mech_ready: the ultimate is off cooldown and the mech is not up.
    check('no mech_ready while the ultimate is still cooling', events.mechReady.length === 0, events.mechReady);
    cooldown.readyAt = Date.now() - 1;
    const bounce = await waitFor(() => events.mechReady.length > 0, 3000);
    check('mech_ready fires once Mech Suit is back', Boolean(bounce), events.mechReady);
    await sleep(200);
    check('mech_ready fires only once', events.mechReady.length === 1, events.mechReady.length);
    check('pilotMechReady is now set', player.pilotMechReady === true, player.pilotMechReady);

    socket.disconnect();
    await sleep(120);
  }

  // ------------------------------------------------- 3. Dummies fire talents
  {
    console.log('\n[3] Lobby dummies - breaking one fires kill talents, nothing else');
    const { socket, room, events, playerId } = await join('sheriff', true);
    const player = room.players.get(playerId);
    await waitFor(() => room.dummyCount() > 0, 3000);
    const dummies = room.dummyCount();
    check('the lobby has training dummies', dummies === 4, dummies);

    const cooldown = player.hero.cooldowns.skill;
    cooldown.readyAt = Date.now() + 8000;
    const beforeReadyAt = cooldown.readyAt;
    const killsBefore = player.kills || 0;
    const waveBefore = room.debugInfo().wave;

    const broken = room.debugKillDummies();
    check('all four dummies broke', broken === 4, broken);
    await sleep(150);

    check('each dummy kill fired the Sheriff talent', events.sheriffRefunds.length === 4, events.sheriffRefunds.length);
    const cut = beforeReadyAt - cooldown.readyAt;
    check('four dummy kills cut 4 x 400ms off Dynamite', cut === 1600, { cut, perKill: cut / 4 });
    check('dummies still do not count as kills', (player.kills || 0) === killsBefore, { before: killsBefore, after: player.kills });
    check('dummies do not advance the wave', room.debugInfo().wave === waveBefore, room.debugInfo().wave);

    socket.disconnect();
    await sleep(120);
  }

  // ------------------------------------------------------ 4. Campfire Heart card
  {
    console.log('\n[4] Campfire Heart - max HP and current HP grow by the same amount');
    const { socket, room, playerId } = await join('sheriff', true);
    room.startRunNow();
    await waitFor(() => room.phase() === 'running');

    let sawCard = false;
    let partial = null;
    let full = null;

    // The vote offers a random subset of the five stat cards, so keep clearing
    // waves until Campfire Heart is actually on the ballot - twice, once from
    // half HP (the replenishment is visible) and once from full HP (clamped).
    for (let attempt = 0; attempt < 24 && !(partial && full); attempt += 1) {
      room.clearWave();
      await waitFor(() => room.breakInfo()?.phase === 'rest', 3000);
      room.skipBreakPhase();
      const phase = await waitFor(() => {
        const info = room.breakInfo();
        return info && (info.phase === 'vote' || info.phase === 'dawn') ? info : null;
      }, 3000);
      if (!phase) continue;
      if (phase.phase === 'dawn') { room.skipBreakPhase(); await sleep(120); continue; }

      // Start from half HP the first time, from full HP the second time.
      const maxBefore = room.campfire.maxHp;
      const hpBefore = partial ? maxBefore : Math.round(maxBefore * 0.5);
      room.campfire.hp = hpBefore;

      room.castBuffVote({ id: playerId }, 'campfire');
      await sleep(180);

      const maxAfter = room.campfire.maxHp;
      const hpAfter = room.campfire.hp;
      if (maxAfter > maxBefore) {
        sawCard = true;
        const measured = { maxBefore, maxAfter, hpBefore, hpAfter, added: maxAfter - maxBefore };
        if (!partial) partial = measured;
        else if (!full) full = measured;
      } else {
        // Campfire Heart was not on this ballot; finish the vote and move on.
        for (const id of ['maxHp', 'attack', 'defense', 'speed']) room.castBuffVote({ id: playerId }, id);
        await sleep(180);
      }
      room.skipBreakPhase();
      await sleep(150);
    }

    check('Campfire Heart came up on the ballot', sawCard);
    if (partial) {
      check('max HP grew by 25% of its previous value',
        Math.abs(partial.added - partial.maxBefore * 0.25) < 0.01, partial);
      check('current HP grew by exactly the same amount as max HP',
        Math.abs(partial.hpAfter - (partial.hpBefore + partial.added)) < 0.01, partial);
    } else {
      check('current HP grew by exactly the same amount as max HP', false, 'card never drawn');
    }
    if (full) {
      check('at full HP the replenishment is clamped to the new maximum',
        Math.abs(full.hpAfter - full.maxAfter) < 0.01, full);
    }

    socket.disconnect();
    await sleep(120);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  server.io.close();
  server.httpServer.close();
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error('PROBE CRASHED', error);
  try { server.io.close(); server.httpServer.close(); } catch { /* ignore */ }
  process.exit(1);
});
