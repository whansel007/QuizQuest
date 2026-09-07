const io = require('socket.io-client');
const { start, RADIUS, SPEED } = require('../server');

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function once(emitter, event) {
  return new Promise((r) => emitter.once(event, r));
}

function connect(port, slot) {
  return new Promise((resolve, reject) => {
    const s = io('http://localhost:' + port, { transports: ['websocket'] });
    s.on('connect', () => s.emit('join', {}));
    s.on('welcome', (msg) => resolve({ s, msg }));
    s.on('error', reject);
    setTimeout(() => reject(new Error('join timeout')), 3000);
  });
}

async function main() {
  const srv = start(0);
  await once(srv.httpServer, 'listening');
  const port = srv.httpServer.address().port;

  const a = await connect(port);
  const b = await connect(port);
  const slotA = a.msg.slot;
  const slotB = b.msg.slot;
  const expectedTagger = slotA; // first to join is IT

  const tag = once(a.s, 'tag');

  if (slotA < slotB) {
    a.s.emit('input', { up: false, down: false, left: false, right: true });
    b.s.emit('input', { up: false, down: false, left: true, right: false });
  } else {
    a.s.emit('input', { up: false, down: false, left: true, right: false });
    b.s.emit('input', { up: false, down: false, left: false, right: true });
  }

  const maxDist = 2 * (900 - 200) - 2 * RADIUS;
  const travelTime = Math.ceil((maxDist / SPEED) * 1000);
  const res = await Promise.race([tag, wait(travelTime + 4000)]);
  if (!res) throw new Error('no tag event within timeout');

  const ok = res.tagger === expectedTagger && res.victim === slotB;
  console.log('tag event:', res, ok ? 'PASS' : 'FAIL');
  if (!ok) throw new Error('tagger/victim wrong');

  a.s.close();
  b.s.close();
  srv.io.close();
  srv.httpServer.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('TEST FAIL:', err.message);
  process.exit(1);
});
