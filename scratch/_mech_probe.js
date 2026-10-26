// Isolate the Pilot mech flag: join as pilot over a raw socket, start a run,
// cast the ultimate and print the broadcast player fields.
const { io } = require('C:/Users/William/Documents/GitHub/QuizQuest/node_modules/.pnpm/socket.io-client@4.8.4/node_modules/socket.io-client');

(async () => {
  const login = await fetch('http://127.0.0.1:3000/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 's-01' }),
  });
  const { token } = await login.json();
  const socket = io('http://127.0.0.1:3000/hero-lab', { auth: { token }, transports: ['websocket'] });
  let me = null;
  socket.on('welcome', (w) => { me = w.you; console.log('welcome, hero =', me.heroId); });
  socket.on('connect', () => socket.emit('join', { heroId: 'pilot', create: true }));
  socket.on('state', (state) => {
    const p = state.players.find((c) => c.id === me);
    if (!p) return;
    if (!global.lastLog || Date.now() - global.lastLog > 1000) {
      global.lastLog = Date.now();
      console.log(`mech=${p.mech} ultFill=${p.abilities?.ultimate ? (100 - (p.abilities.ultimate.remainingMs / p.abilities.ultimate.durationMs) * 100).toFixed(0) + '%' : '?'} weapon=${p.abilities?.weapon?.name} skill=${p.abilities?.skill?.name} phase=${state.room?.phase}`);
    }
  });
  await new Promise((r) => setTimeout(r, 1500));
  console.log('--- start_run');
  socket.emit('start_run');
  await new Promise((r) => setTimeout(r, 6000));
  console.log('--- ultimate');
  socket.emit('ultimate');
  await new Promise((r) => setTimeout(r, 4000));
  console.log('--- done');
  socket.close();
  process.exit(0);
})();
