const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const joinBtn = document.getElementById('joinBtn');
const overlay = document.getElementById('overlay');
const banner = document.getElementById('banner');
const statusEl = document.getElementById('status');
const youLabel = document.getElementById('youLabel');

let socket = null;
let mySlot = null;
let myColor = null;
let world = { arena: { w: 900, h: 600 }, radius: 24 };
let state = { players: [] };
let bannerTimer = null;

const keys = { up: false, down: false, left: false, right: false };

function setKey(name, pressed) {
  if (keys[name] === pressed) return;
  keys[name] = pressed;
  if (socket) socket.emit('input', keys);
}

addEventListener('keydown', (e) => {
  const map = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  const name = map[e.code];
  if (name) {
    e.preventDefault();
    setKey(name, true);
  }
});

addEventListener('keyup', (e) => {
  const map = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };
  const name = map[e.code];
  if (name) setKey(name, false);
});

addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  if (socket) socket.emit('input', keys);
});

function showBanner(text) {
  banner.textContent = text;
  banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => banner.classList.remove('show'), 1400);
}

joinBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  statusEl.textContent = 'Connecting...';
  socket = io();
  socket.on('connect', () => socket.emit('join'));
  socket.on('welcome', (msg) => {
    mySlot = msg.slot;
    myColor = msg.color;
    world = msg;
    canvas.width = msg.arena.w;
    canvas.height = msg.arena.h;
    youLabel.innerHTML =
      '<span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' +
      msg.color + ';vertical-align:middle;"></span> You are P' + msg.slot;
    statusEl.textContent = 'Use WASD or arrow keys to move.';
  });
  socket.on('lobby', (msg) => {
    statusEl.textContent =
      msg.count < 2 ? 'Waiting for another player to join...' : 'Go! Tag the other circle.';
  });
  socket.on('state', (s) => {
    state = s;
  });
  socket.on('tag', (t) => {
    showBanner('P' + t.tagger + ' TAGGED P' + t.victim);
  });
  socket.on('full', () => {
    statusEl.textContent = 'Room is full.';
    joinBtn.style.display = 'block';
    overlay.style.display = 'flex';
  });
});

function draw() {
  requestAnimationFrame(draw);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

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

  for (const p of state.players) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, world.radius, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    if (p.it) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('P' + p.slot, p.x, p.y + world.radius + 16);
    if (p.slot === mySlot) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
draw();
