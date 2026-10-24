// STEP 1 measurement: server tick cost with a crowd of enemies. Starts an
// in-process server, joins a room, starts the run, stress-spawns 40 enemies,
// and reads the room's rolling tick avg/worst from debugInfo().
const path = require('path');
const { start } = require(path.resolve(__dirname, '..', 'server'));
const { io: connect } = require('socket.io-client');

function waitFor(socket, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => { socket.off(event, h); reject(new Error(`timeout ${event}`)); }, timeoutMs);
    function h(p) { clearTimeout(t); socket.off(event, h); resolve(p); }
    socket.on(event, h);
  });
}

(async () => {
  const server = start(0, { dataFile: null });
  await new Promise((r) => server.httpServer.once('listening', r));
  const base = `http://localhost:${server.httpServer.address().port}`;
  const socket = connect(`${base}/hero-lab`, { transports: ['websocket'] });
  socket.on('connect_error', (e) => console.error('connect_error', String(e)));
  socket.on('join_error', (e) => console.error('join_error', JSON.stringify(e)));
  socket.on('connect', () => console.error('connected', socket.id));
  await new Promise((res, rej) => { socket.once('connect', res); socket.once('connect_error', rej); });
  console.error('connected, emitting join');

  socket.emit('join', { heroId: 'sheriff', create: true });
  const welcome = await waitFor(socket, 'welcome', 6000);
  const code = welcome.room.code;
  const room = server.heroLab.rooms.findByCode(code);
  room.startRunNow();

  await new Promise((r) => setTimeout(r, 1300));
  const baseline = room.debugInfo();

  const spawned = room.debugSpawnEnemies(40);
  await new Promise((r) => setTimeout(r, 1600));
  const stressed = room.debugInfo();

  console.log(JSON.stringify({
    spawned,
    tickIntervalMs: Math.round((1000 / 30) * 100) / 100,
    baseline: { tickAvgMs: baseline.tickAvgMs, tickWorstMs: baseline.tickWorstMs, players: baseline.players, phase: baseline.phase },
    stressed: {
      tickAvgMs: stressed.tickAvgMs, tickWorstMs: stressed.tickWorstMs,
      players: stressed.players, wave: stressed.wave, phase: stressed.phase,
      monsters: stressed.campfire ? undefined : undefined,
    },
  }, null, 2));

  socket.disconnect();
  server.io.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
