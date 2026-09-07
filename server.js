const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const ARENA = { w: 900, h: 600 };
const RADIUS = 24;
const SPEED = 280;
const COLORS = ['#ff5252', '#448aff', '#00c853', '#ffd740'];
const TAG_COOLDOWN = 1000;
const SPAWNS = [
  { x: 200, y: 300 },
  { x: ARENA.w - 200, y: 300 },
  { x: 200, y: 150 },
  { x: ARENA.w - 200, y: 450 },
];
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function start(port) {
  const players = new Map();
  const taken = new Set();
  let currentIt = null;
  let cooldownUntil = 0;

  const publicDir = path.join(__dirname, 'public');
  const httpServer = http.createServer((req, res) => {
    const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const file = path.join(publicDir, urlPath);
    if (!file.startsWith(publicDir)) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });

  const io = new Server(httpServer, { cors: { origin: '*' } });

  function freeSlot() {
    for (let i = 1; i <= COLORS.length; i++) {
      if (!taken.has(i)) return i;
    }
    return null;
  }

  function online() {
    return [...players.values()];
  }

  io.on('connection', (socket) => {
    socket.on('join', () => {
      if (players.has(socket.id)) return;
      const slot = freeSlot();
      if (!slot) {
        socket.emit('full');
        return;
      }
      const spawn = SPAWNS[slot - 1];
      const p = { id: socket.id, slot, color: COLORS[slot - 1], x: spawn.x, y: spawn.y, keys: {} };
      players.set(socket.id, p);
      taken.add(slot);
      if (currentIt === null) currentIt = slot;
      socket.emit('welcome', { slot, color: p.color, arena: ARENA, radius: RADIUS, it: currentIt === slot });
      socket.emit('lobby', { count: players.size });
    });

    socket.on('input', (keys) => {
      const p = players.get(socket.id);
      if (p) p.keys = keys || {};
    });

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

  setInterval(() => {
    const list = online();
    const step = SPEED / 60;
    for (const p of list) {
      const dx = (p.keys.right ? 1 : 0) - (p.keys.left ? 1 : 0);
      const dy = (p.keys.down ? 1 : 0) - (p.keys.up ? 1 : 0);
      if (dx || dy) {
        const len = Math.hypot(dx, dy);
        p.x = Math.min(ARENA.w - RADIUS, Math.max(RADIUS, p.x + (dx / len) * step));
        p.y = Math.min(ARENA.h - RADIUS, Math.max(RADIUS, p.y + (dy / len) * step));
      }
    }

    const now = Date.now();
    if (list.length >= 2 && now >= cooldownUntil && currentIt !== null) {
      outer: for (let a = 0; a < list.length; a++) {
        for (let b = a + 1; b < list.length; b++) {
          const A = list[a];
          const B = list[b];
          const d = Math.hypot(B.x - A.x, B.y - A.y);
          if (d < RADIUS * 2) {
            let tagger = null;
            let victim = null;
            if (currentIt === A.slot) {
              tagger = A;
              victim = B;
            } else if (currentIt === B.slot) {
              tagger = B;
              victim = A;
            }
            if (tagger) {
              currentIt = victim.slot;
              cooldownUntil = now + TAG_COOLDOWN;
              const nx = d ? (B.x - A.x) / d : 1;
              const ny = d ? (B.y - A.y) / d : 0;
              const push = (RADIUS * 2 - d) / 2;
              for (const [p, dir] of [
                [A, -1],
                [B, 1],
              ]) {
                p.x = Math.min(ARENA.w - RADIUS, Math.max(RADIUS, p.x + nx * dir * push));
                p.y = Math.min(ARENA.h - RADIUS, Math.max(RADIUS, p.y + ny * dir * push));
              }
              io.emit('tag', { tagger: tagger.slot, victim: victim.slot });
              break outer;
            }
          }
        }
      }
    }

    io.emit('state', {
      players: list.map((p) => ({
        slot: p.slot,
        color: p.color,
        x: Math.round(p.x),
        y: Math.round(p.y),
        it: p.slot === currentIt,
      })),
    });
  }, 1000 / 60);

  httpServer.listen(port);
  return { io, httpServer };
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  start(port);
  console.log('listening on http://localhost:' + port);
}

module.exports = { start, ARENA, RADIUS, SPEED };
