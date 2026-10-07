// ============================================================
// Headless test: proves a tag actually fires, without a browser.
// ------------------------------------------------------------
// It boots a real server on a random free port (port 0), then uses
// socket.io-client (the same library browsers use) to fake TWO
// players. It presses their keys and waits until both circles have
// driven into each other, then checks the server emitted the expected
// 'tag' event. Run with:  npm test
// ============================================================

const io = require('socket.io-client');
const { start, RADIUS, SPEED } = require('../server');

// Small helper: sleep for ms milliseconds
function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Small helper: resolve the promise the first time an event fires
function once(emitter, event) {
  return new Promise((r) => emitter.once(event, r));
}

// Open a fake browser connection to the real server and JOIN.
// Resolves with { socket, welcomeMessage } once the server says hello.
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
  // Boot a throwaway server on a random port (clean-up at the end)
  const srv = start(0, { dataFile: null }); // in-memory quiz DB: don't touch data/
  await once(srv.httpServer, 'listening');
  const port = srv.httpServer.address().port;

  // Player A and B join. A connects first => gets P1 => becomes IT.
  const a = await connect(port);
  const b = await connect(port);
  const slotA = a.msg.slot;
  const slotB = b.msg.slot;
  const expectedTagger = slotA; // first to join is IT

  // Register the event we expect before sending input
  const tag = once(a.s, 'tag');

  // Both players hold their keys towards each other along the middle
  // row. Slots 1 and 2 spawn at x=200 and x=700 on y=300, so they
  // will close the gap and collide.
  if (slotA < slotB) {
    a.s.emit('input', { up: false, down: false, left: false, right: true });
    b.s.emit('input', { up: false, down: false, left: true, right: false });
  } else {
    a.s.emit('input', { up: false, down: false, left: true, right: false });
    b.s.emit('input', { up: false, down: false, left: false, right: true });
  }

  // Longest possible travel: one player is on the far side. Compute the
  // wall-clock time that would need, then wait up to that + 4s slack.
  const maxDist = 2 * (900 - 200) - 2 * RADIUS;
  const travelTime = Math.ceil((maxDist / SPEED) * 1000);
  const res = await Promise.race([tag, wait(travelTime + 4000)]);
  if (!res) throw new Error('no tag event within timeout');

  // The IT player (slotA) should be the tagger, slotB the victim
  const ok = res.tagger === expectedTagger && res.victim === slotB;
  console.log('tag event:', res, ok ? 'PASS' : 'FAIL');
  if (!ok) throw new Error('tagger/victim wrong');

  // Tear everything down and exit with the right status code
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