// ============================================================
// QuizQuest - Circle Tag server
// ------------------------------------------------------------
// This file replaces what "express + static pages" gave you.
//
// In a static Express app you had:
//     GET /page  -> browser asks, server replies, connection closes.
// That is "request/response": the browser does the talking.
//
// Here the model is inverted: a WebSocket is a two-way pipe
// that STAYS OPEN. The server can push messages to the browser
// (game state, 60x a second) without the browser asking.
//
// Think of the server as the single referee that owns the truth:
//     - who is connected
//     - where every circle is
//     - who is "IT"
// The browsers are just screens that paint whatever the server says.
// ============================================================

// "http" and "fs"/"path" do the same job express.static used to do
// for us: serve the index.html and client.js files. We keep the copy
// here so the WHOLE server is one dependency lighter (no express).
const http = require('http');
const fs = require('fs');
const path = require('path');
// Socket.IO is the realtime layer. It manages the persistent two-way
// pipe with every connected browser and gives us "rooms" and events.
const { Server } = require('socket.io');
// The quiz app's JSON API (/api/*). See src/quiz/api.js and PROTOTYPE.md.
const { createQuizApi } = require('./src/quiz/api');
// The multiplayer World (/world Socket.IO namespace), built on the same
// ideas as this file's tag game. See src/world/world.js.
const { attachWorld } = require('./src/world/world');

// --- Game constants (the "rules" of our world) ----------------
// The arena is a fixed 900x600 coordinate grid. Every player shares
// these coordinates, which is what makes positions comparable.
const ARENA = { w: 900, h: 600 };
const RADIUS = 24;          // circle radius in px. Two circles touch
                            // when their centers are < 2*RADIUS apart.
const SPEED = 280;          // px per second a circle can move
const COLORS = ['#ff5252', '#448aff', '#00c853', '#ffd740']; // P1..P4
const TAG_COOLDOWN = 1000;  // ms to ignore collisions right after a tag
                            // (stops the banner flickering every frame)
const SPAWNS = [
  // Where each player starts, so they don't spawn on top of each other
  { x: 200, y: 300 },
  { x: ARENA.w - 200, y: 300 },
  { x: 200, y: 150 },
  { x: ARENA.w - 200, y: 450 },
];
// Tiny mime lookup so the plain http server knows what each file is.
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

// start(port) boots the whole game. Calling it with port 0 (used by
// the test) makes the OS pick a free port. If server.js is run directly
// it uses process.env.PORT (Render injects that) or 3000 locally.
// opts.dataFile: where the quiz app keeps its JSON database (null = in-memory).
// opts.store: an already-loaded store (e.g. the Supabase one) instead of a file.
function start(port, opts = {}) {
  const quiz = createQuizApi(opts.store ? { store: opts.store } : { dataFile: opts.dataFile !== undefined ? opts.dataFile : path.join(__dirname, 'data', 'db.json') });
  // ------ Live game state (in-memory, lives ONLY while running) ---
  // players: socket.id -> player object. This is the "database" of
  // the live game. Unlike Mongo it is volatile: if the server restarts,
  // everyone is disconnected and the board resets. Mongo is for things
  // that must survive (scores); this Map is for things that must be
  // fast (20 updates per frame, no disk I/O allowed).
  const players = new Map();
  const taken = new Set();   // which player slots (1-4) are occupied
  let currentIt = null;      // which slot is "IT" right now (null = nobody)
  let cooldownUntil = 0;     // timestamp after which collisions count again

  // ------ Serve the static files (the part you already know) ------
  // The quiz app is the Vue build in dist/ (`npm run build`); Circle Tag
  // still lives in public/ at /tag.
  const publicDir = path.join(__dirname, 'public');
  const heroLabDir = path.join(publicDir, 'hero-lab');
  const distDir = opts.distDir || path.join(__dirname, 'dist');
  const TAG = { '/tag': path.join(publicDir, 'index.html'), '/client.js': path.join(publicDir, 'client.js') };
  const httpServer = http.createServer(async (req, res) => {
    // JSON API for the quiz app. A thrown error here must never take the
    // whole server (and everyone's game) down, so it becomes a 500.
    try {
      if (await quiz.handle(req, res)) return;
    } catch (err) {
      console.error('[http] unhandled error:', err && err.message);
      if (!res.headersSent) res.writeHead(500);
      return res.end();
    }
    const pathname = req.url.split('?')[0];
    const isHeroLabPath = pathname === '/hero-lab' || pathname.startsWith('/hero-lab/');
    const file = TAG[pathname] || (isHeroLabPath
      ? path.resolve(heroLabDir, pathname === '/hero-lab' ? 'index.html' : '.' + pathname.slice('/hero-lab'.length))
      : path.join(distDir, pathname === '/' ? 'index.html' : pathname));
    if (isHeroLabPath && file !== heroLabDir && !file.startsWith(heroLabDir + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    // Guard against path traversal attempts like GET /../server.js
    // (the trailing separator stops a sibling folder like "dist-old" matching)
    if (!TAG[pathname] && !isHeroLabPath && !file.startsWith(distDir + path.sep)) {
      res.writeHead(403);
      return res.end();
    }
    if (pathname === '/' && !fs.existsSync(file)) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('The Vue app has not been built yet. Run `npm run build` (or use `npm run dev` and open http://localhost:5173).');
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        // Basic hardening: only load scripts/styles from this server
        // ('wasm-unsafe-eval' lets the PDF reader decode some scanned-image formats)
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(data);
    });
  });

  // ------ Attach Socket.IO to the same HTTP server ------
  // Socket.IO listens on the SAME port as the static files. The browser
  // loads index.html over HTTP, then upgrades that page to the persistent
  // realtime channel. One port for everything.
  const io = new Server(httpServer, { cors: { origin: '*' } });
  // The quiz World lives on its own namespace ('/world'); tag keeps '/'
  const world = attachWorld(io, quiz.services);

  // Smallest free slot (1..4). Slot = the player's identity: P1, P2...
  function freeSlot() {
    for (let i = 1; i <= COLORS.length; i++) {
      if (!taken.has(i)) return i;
    }
    return null;
  }

  // Shortcut: all players currently connected, as an array
  function online() {
    return [...players.values()];
  }

  // ------ Wiring up realtime events (the NEW mental model) ------
  // "connection" fires every time ANY browser opens a socket to us.
  // Each one gets its own `socket` object = its own private pipe.
  io.on('connection', (socket) => {
    // The browser clicks "Join" -> client.js emits 'join'.
    // NOTE: connecting the socket and JOINING the game are two events.
    // Connecting just means the pipe exists; joining means we assign
    // a slot, a color, a starting position.
    socket.on('join', () => {
      if (players.has(socket.id)) return; // already joined, ignore
      const slot = freeSlot();
      if (!slot) {
        socket.emit('full'); // 4 players already -> tell them politely
        return;
      }
      const spawn = SPAWNS[slot - 1];
      // Build the player record the game loop will act on every frame
      const p = { id: socket.id, slot, color: COLORS[slot - 1], x: spawn.x, y: spawn.y, keys: {} };
      players.set(socket.id, p);
      taken.add(slot);
      // First player in an empty room becomes IT by default
      if (currentIt === null) currentIt = slot;
      // Tell THIS browser who it is (individual, not everyone)
      socket.emit('welcome', { slot, color: p.color, arena: ARENA, radius: RADIUS, it: currentIt === slot });
      // Tell everyone how many people are in (used for "waiting for player 2")
      socket.emit('lobby', { count: players.size });
    });

    // The browser sends its held keys. We do NOT trust the browser to
    // say "I am at x:400 y:300" - that would let a cheater teleport.
    // Instead the browser says "I am holding Right" and WE compute the
    // position. This is "server-authoritative" movement.
    socket.on('input', (keys) => {
      const p = players.get(socket.id);
      if (p) p.keys = keys || {};
    });

    // Browser tab closed / lost network. Remove the player, free the
    // slot, and if IT left, pass IT to someone still in the room.
    socket.on('disconnect', () => {
      const p = players.get(socket.id);
      if (p) {
        players.delete(socket.id);
        taken.delete(p.slot);
        if (currentIt === p.slot) {
          const rest = online();
          currentIt = rest.length ? rest[0].slot : null;
        }
        socket.broadcast.emit('lobby', { count: players.size });
      }
    });
  });

  // ------- THE GAME LOOP ---------------------------------------
  // setInterval runs ~60x per second. One full "tick" of the world:
  //   1. move every player according to their held keys
  //   2. check collisions -> decide if a tag happened
  //   3. broadcast the honest new world state to everyone
  // This is the whole game. Everything below is that cycle.
  const loop = setInterval(() => {
    const list = online();
    const step = SPEED / 60; // distance covered in ONE frame (1/60 s)

    // 1) MOVE ------------------------------------------------
    for (const p of list) {
      // direction: -1 / 0 / +1 on each axis from the held keys
      const dx = (p.keys.right ? 1 : 0) - (p.keys.left ? 1 : 0);
      const dy = (p.keys.down ? 1 : 0) - (p.keys.up ? 1 : 0);
      if (dx || dy) {
        const len = Math.hypot(dx, dy); // normalise so diagonal isn't faster
        // clamp inside the arena walls: min/max keep the center inside
        p.x = Math.min(ARENA.w - RADIUS, Math.max(RADIUS, p.x + (dx / len) * step));
        p.y = Math.min(ARENA.h - RADIUS, Math.max(RADIUS, p.y + (dy / len) * step));
      }
    }

    // 2) COLLIDE / TAG ---------------------------------------
    const now = Date.now();
    // Need >=2 players, IT must exist, and the cooldown must have passed
    if (list.length >= 2 && now >= cooldownUntil && currentIt !== null) {
      outer: // label so we can "break outer" after one tag per frame
      for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const A = list[a];
          const B = list[b];
          const d = Math.hypot(B.x - A.x, B.y - A.y);
          // Classic circle collision test: centers closer than the
          // sum of radii (= 2*RADIUS) means the circles overlap.
          if (d < RADIUS * 2) {
            let tagger = null;
            let victim = null;
            // Only IT can tag. If IT collided with somebody, that
            // somebody becomes the new IT (tag = pass the role on).
            if (currentIt === A.slot) {
              tagger = A;
              victim = B;
            } else if (currentIt === B.slot) {
              tagger = B;
              victim = A;
            }
            if (tagger) {
              currentIt = victim.slot;
              // Start the no-retag grace period
              cooldownUntil = now + TAG_COOLDOWN;
              // Push the overlapping circles apart so they don't sit
              // glued together and re-trigger next frame.
              const nx = d ? (B.x - A.x) / d : 1; // unit vector A->B
              const ny = d ? (B.y - A.y) / d : 0;
              const push = (RADIUS * 2 - d) / 2;  // overlap amount, half each
              for (const [p, dir] of [
                [A, -1], // A moves backwards (away from B)
                [B, 1],  // B moves forwards
              ]) {
                p.x = Math.min(ARENA.w - RADIUS, Math.max(RADIUS, p.x + nx * dir * push));
                p.y = Math.min(ARENA.h - RADIUS, Math.max(RADIUS, p.y + ny * dir * push));
              }
              // Tell every browser: "P{tagger} TAGGED P{victim}"
              io.emit('tag', { tagger: tagger.slot, victim: victim.slot });
              break outer; // one tag per tick is enough
            }
          }
        }
      }
    }

    // 3) BROADCAST STATE --------------------------------------
    // The single source of truth, sent to every browser each frame.
    // Browsers do no simulation - they just paint this. Rounding to
    // whole pixels keeps the packet small for over-the-internet play.
    io.emit('state', {
      players: list.map((p) => ({
        slot: p.slot,
        color: p.color,
        x: Math.round(p.x),
        y: Math.round(p.y),
        it: p.slot === currentIt,
      })),
    });
  }, 1000 / 60); // 60 ticks per second

  // Stop the game loop when the server shuts down (lets tests exit cleanly)
  httpServer.on('close', () => {
    clearInterval(loop);
    world.stop();
  });
  httpServer.listen(port);
  return { io, httpServer, quiz, world };
}

// If run directly (`npm run dev` / `node server.js`) this is the entry
// point. The check also lets the test file `require('./server')` and
// call start() itself to boot its own throwaway server on port 0.
if (require.main === module) {
  const port = process.env.PORT || 3000;
  (async () => {
    // Data lives in Supabase when SUPABASE_URL is set (see .env.example),
    // otherwise in data/db.json. QUIZ_DATA_FILE points a second copy at
    // separate demo data.
    let opts = {};
    let where = 'data/db.json';
    if (process.env.SUPABASE_URL) {
      const { connectSupabaseStore } = require('./src/db/supabase-store');
      opts = { store: await connectSupabaseStore() };
      where = 'Supabase';
    } else if (process.env.QUIZ_DATA_FILE) {
      opts = { dataFile: process.env.QUIZ_DATA_FILE };
      where = process.env.QUIZ_DATA_FILE;
    }
    start(port, opts);
    console.log(`QuizQuest API on http://localhost:${port}  (data: ${where}; Circle Tag at /tag)`);
  })().catch((err) => {
    // Startup errors are configuration problems; the message says what to fix
    console.error('[startup]', err.message);
    // exitCode instead of process.exit(): exiting while network handles are
    // still closing crashes Node on Windows (UV_HANDLE_CLOSING assertion)
    process.exitCode = 1;
    setTimeout(() => process.exit(1), 2000).unref();
  });
}

// What the headless test imports so it can run the real game loop
module.exports = { start, ARENA, RADIUS, SPEED };