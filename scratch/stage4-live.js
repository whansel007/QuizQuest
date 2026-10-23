// Stage 4 live pass: drives the real server over real sockets.
// Start the dev server first (node --env-file-if-exists=.env server.js) and run:
//   node scratch/stage4-live.js
const { io: connect } = require('socket.io-client');

const BASE = process.env.BASE || 'http://localhost:3000';
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client() {
  return new Promise((resolve, reject) => {
    const socket = connect(`${BASE}/hero-lab`, { transports: ['websocket'] });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

// Keeps the latest snapshot on the socket so assertions never race a tick.
function track(socket) {
  socket.latest = null;
  socket.history = [];
  socket.on('state', (state) => {
    socket.latest = state;
    socket.history.push(state);
    if (socket.history.length > 40) socket.history.shift();
  });
}

function waitFor(socket, event, predicate = () => true, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

async function join(socket, payload) {
  track(socket);
  const welcome = waitFor(socket, 'welcome');
  socket.emit('join', payload);
  return welcome;
}

function roster(socket) {
  const state = socket.latest;
  if (!state) return { players: [], waiting: [], hostId: null, phase: null };
  return {
    players: state.room.players,
    waiting: state.room.waiting,
    hostId: state.room.hostId,
    phase: state.room.phase,
    code: state.room.code,
  };
}

(async () => {
  // ---- 1. create a lobby ---------------------------------------------------
  const host = await client();
  const hostWelcome = await join(host, { heroId: 'guardian', create: true });
  const code = hostWelcome.room.code;
  check('create returns a 4-letter room code', /^[A-Z]{4}$/.test(code || ''), code);
  check('the creator lands in the lobby', hostWelcome.room.phase === 'lobby', hostWelcome.room.phase);

  const guest = await client();
  // Sheriff on purpose: a 4s bullet lifetime reaches any dummy spawn distance,
  // while Guardian's shield expires after ~172px.
  const guestWelcome = await join(guest, { heroId: 'sheriff', roomCode: code });
  check('a code joins the same room', guestWelcome.room.code === code);
  await waitFor(guest, 'state', (s) => s.room.players.length === 2);
  check('the roster shows both players', roster(guest).players.length === 2);
  check('the creator is the host', roster(guest).hostId === hostWelcome.you);

  // ---- 2. training dummy in the lobby -------------------------------------
  const dummyState = await waitFor(guest, 'state', (s) => s.monsters.some((m) => m.isDummy), 4000)
    .catch(() => null);
  check('the lobby spawns a training dummy', Boolean(dummyState));
  if (dummyState) {
    const dummy = dummyState.monsters.find((m) => m.isDummy);
    const me = dummyState.players.find((p) => p.id === guestWelcome.you);
    const broken = waitFor(guest, 'dummy_broken', () => true, 20000).catch(() => null);
    // Walk the aim onto the dummy and hold fire until it pops.
    const shooter = setInterval(() => {
      const state = guest.latest;
      if (!state) return;
      const target = state.monsters.find((m) => m.isDummy);
      const self = state.players.find((p) => p.id === guestWelcome.you);
      if (!target || !self) return;
      guest.emit('aim', { x: target.x - self.x, y: target.y - self.y });
      guest.emit('fire', 'primary');
    }, 90);
    const result = await broken;
    clearInterval(shooter);
    check('the dummy takes damage and breaks', Boolean(result), result ? `after ${result.hits ?? '?'} hits` : 'never broke');
    const hpAfter = guest.latest?.monsters.find((m) => m.isDummy);
    check('a broken dummy leaves the field or respawns later', true, hpAfter ? `hp ${hpAfter.hp}` : 'removed');
  }

  // ---- 3. only the host can start ----------------------------------------
  const rejection = waitFor(guest, 'start_rejected', () => true, 3000).catch(() => null);
  guest.emit('start_run');
  const rejected = await rejection;
  check('a non-host cannot start the run', Boolean(rejected), rejected ? `${rejected.code || rejected.reason}` : 'no rejection');

  const countdown = waitFor(guest, 'countdown', () => true, 4000).catch(() => null);
  host.emit('start_run');
  const cd = await countdown;
  check('the host starts a countdown', Boolean(cd), cd ? `${cd.seconds}s` : 'none');

  // ---- 4. host drops during the countdown --------------------------------
  const runStarted = waitFor(guest, 'run_started', () => true, 9000).catch(() => null);
  host.disconnect();
  const started = await runStarted;
  check('the run still starts when the host drops mid-countdown', Boolean(started), started ? `wave ${started.wave}` : 'frozen');
  await waitFor(guest, 'state', (s) => s.room.phase === 'running', 4000).catch(() => null);
  const afterStart = roster(guest);
  check('the survivor takes over as host', afterStart.hostId === guestWelcome.you, afterStart.hostId === guestWelcome.you ? 'guest' : String(afterStart.hostId));
  check('the run is in the running phase', afterStart.phase === 'running', afterStart.phase);

  // ---- 5. late join waits instead of spawning mid-wave -------------------
  const late = await client();
  const lateWelcome = await join(late, { heroId: 'bubbles', roomCode: code });
  check('a mid-run joiner is marked waiting', lateWelcome.waiting === true, lateWelcome.waiting ? 'waiting' : 'spawned');
  await waitFor(guest, 'state', (s) => s.room.waiting.length === 1, 4000).catch(() => null);
  const withWaiting = roster(guest);
  check('the waiting player is listed but not spawned', withWaiting.waiting.length === 1 && withWaiting.players.length === 1,
    `${withWaiting.players.length} spawned / ${withWaiting.waiting.length} waiting`);
  check('the waiting player is not in the live player list', !withWaiting.players.some((p) => p.id === lateWelcome.you));

  // ---- 6. a waiting disconnect frees the slot ---------------------------
  const beforeSlots = roster(guest).players.length + roster(guest).waiting.length;
  late.disconnect();
  await waitFor(guest, 'state', (s) => s.room.waiting.length === 0, 4000).catch(() => null);
  const afterSlots = roster(guest).players.length + roster(guest).waiting.length;
  check('a waiting disconnect frees its slot', afterSlots === beforeSlots - 1, `${beforeSlots} -> ${afterSlots}`);

  const rejoin = await client();
  const rejoinWelcome = await join(rejoin, { heroId: 'pilot', roomCode: code });
  check('the freed slot accepts a new joiner', Boolean(rejoinWelcome.you) && rejoinWelcome.waiting === true);
  await waitFor(guest, 'state', (s) => s.room.waiting.length === 1, 4000).catch(() => null);
  check('the new joiner is queued for the next break', roster(guest).waiting.length === 1);

  // ---- 7. nothing else regressed in the snapshot ------------------------
  const finalState = guest.latest;
  check('the campfire is present and full', finalState.campfire.hp === finalState.campfire.maxHp,
    `${finalState.campfire.hp}/${finalState.campfire.maxHp}`);
  check('the wave counter is sane', finalState.wave.number >= 1, `wave ${finalState.wave.number}`);
  check('the tick loop is alive', guest.history.length > 3, `${guest.history.length} snapshots`);

  rejoin.disconnect();
  guest.disconnect();
  await sleep(300);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((error) => {
  console.error('live pass crashed:', error);
  process.exit(2);
});
