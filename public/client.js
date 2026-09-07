// ============================================================
// QuizQuest - browser client
// ------------------------------------------------------------
// This file runs INSIDE the browser tab. It has NO game logic of
// its own. Two jobs only:
//   1. Tell the server which keys you are holding
//   2. Paint whatever the server says the world looks like
// Everything else lives on the server. The client is a dumb screen
// with a keyboard, and that is by design.
// ============================================================

// Grab our HTML elements once at the top
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d'); // the 2D painting API
const joinBtn = document.getElementById('joinBtn');
const overlay = document.getElementById('overlay');
const banner = document.getElementById('banner');
const statusEl = document.getElementById('status');
const youLabel = document.getElementById('youLabel');

// What WE know about ourselves + the world. The server is the truth;
// these are just cached copies we use for drawing.
let socket = null;    // the realtime pipe (created on Join click)
let mySlot = null;    // our player number (P1? P2?)
let myColor = null;
let world = { arena: { w: 900, h: 600 }, radius: 24 }; // arena size etc (from server)
let state = { players: [] }; // the latest snapshot the server broadcast
let bannerTimer = null;      // handles auto-hiding the "TAGGED" text

// Our keyboard state. We only send the CURRENT held keys, never our
// position. The server moves us where the keys say we want to go.
const keys = { up: false, down: false, left: false, right: false };

// Update one key, and if it actually changed, tell the server.
// Sending on change (not every frame) = tiny bandwidth.
function setKey(name, pressed) {
  if (keys[name] === pressed) return;
  keys[name] = pressed;
  if (socket) socket.emit('input', keys);
}

// Map physical keys (both WASD and arrows) to our four directions.
// e.code is layout-independent: on AZERTY keyboards WASD moves but the
// arrows stay put, forcing people onto WASD if needed.
const CODE_TO_KEY = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

addEventListener('keydown', (e) => {
  const name = CODE_TO_KEY[e.code];
  if (name) {
    e.preventDefault(); // stop arrows from scrolling the page
    setKey(name, true);
  }
});

addEventListener('keyup', (e) => {
  const name = CODE_TO_KEY[e.code];
  if (name) setKey(name, false);
});

// If the tab loses focus (user clicks away / switches window), release
// every key. Otherwise the server would keep moving our circle forever,
// because no keyup event arrives in a background tab.
addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  if (socket) socket.emit('input', keys);
});

// Flash the big "P1 TAGGED P2" text above the arena for 1.4 seconds
function showBanner(text) {
  banner.textContent = text;
  banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => banner.classList.remove('show'), 1400);
}

// ============================================================
// The life of the app after clicking Join:
//   1. create the socket
//   2. once connected, ask the server to JOIN the game
//   3. register handlers for every message the server can send us
// ============================================================
joinBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  statusEl.textContent = 'Connecting...';

  socket = io(); // eslint-disable-line no-undef  (loaded via socket.io.js)

  // 'connect' fires when the realtime pipe is open. Now we may join.
  socket.on('connect', () => socket.emit('join'));

  // The server assigned us a slot/color and told us the arena rules.
  socket.on('welcome', (msg) => {
    mySlot = msg.slot;
    myColor = msg.color;
    world = msg; // arena dims + radius come from the server, not hardcoded
    canvas.width = msg.arena.w;
    canvas.height = msg.arena.h;
    youLabel.innerHTML =
      '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' +
      msg.color + ';vertical-align:middle;"></span> You are P' + msg.slot;
    statusEl.textContent = 'Use WASD or arrow keys to move.';
  });

  // Room count changed (someone joined / left). Drives the wait text.
  socket.on('lobby', (msg) => {
    statusEl.textContent =
      msg.count < 2 ? 'Waiting for another player to join...' : 'Go! Tag the other circle.';
  });

  // The 60fps world snapshot. We just store it; draw() paints it.
  socket.on('state', (s) => {
    state = s;
  });

  // Someone got tagged. Banner text is built from the server's verdict.
  socket.on('tag', (t) => {
    showBanner('P' + t.tagger + ' TAGGED P' + t.victim);
  });

  // All 4 slots taken -> show the Join button again with a message
  socket.on('full', () => {
    statusEl.textContent = 'Room is full.';
    joinBtn.style.display = 'block';
    overlay.style.display = 'flex';
  });
});

// ============================================================
// The RENDER LOOP: requestAnimationFrame runs (~60x/second) forever.
// Each frame we repaint the WHOLE canvas from the latest server state.
// If no state has arrived yet, we draw an empty grid.
// ============================================================
function draw() {
  requestAnimationFrame(draw); // schedule the next frame first
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background grid - purely cosmetic, shows the 900x600 coordinate space
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 1;
  for (let x = 0; x < world.arena.w; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, world.arena.h);
    ctx.stroke();
  }
  for (let y = 0; y < world.arena.h; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(world.arena.w, y);
    ctx.stroke();
  }

  // Paint every circle the server told us about
  for (const p of state.players) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, world.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    // The current IT gets a yellow dashed ring
    if (p.it) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Small "P1" label under each circle
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('P' + p.slot, p.x, p.y + world.radius + 16);
    // Your own circle gets a solid white outline so you can find
    // yourself instantly among the crowd
    if (p.slot === mySlot) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
draw(); // start the render loop