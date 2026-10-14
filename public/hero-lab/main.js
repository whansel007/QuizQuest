import { HEROES } from './hero.js';

const canvas = document.querySelector('#world');
const context = canvas.getContext('2d');
const heroList = document.querySelector('#hero-list');
const worldMessage = document.querySelector('#world-message');
const connectionStatus = document.querySelector('#connection-status');
const heroDetails = document.querySelector('#hero-details');
const heroStats = document.querySelector('#hero-stats');
const actions = document.querySelector('#actions');
const actionLog = document.querySelector('#action-log');
const fullscreenBtn = document.querySelector('#fullscreen-btn');
const testAiBtn = document.querySelector('#test-ai-btn');
const socket = window.io('/hero-lab');

// --- NVIDIA API Configuration ---
// Put your NVIDIA API key here (e.g. 'nvapi-...'), or put NVIDIA_API_KEY=nvapi-... in .env
const NVIDIA_API_KEY = '';

const keys = { up: false, down: false, left: false, right: false };
const codeToKey = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
const actionButtons = [
  { slot: 'weapon', label: 'Test weapon' },
  { slot: 'skill', label: 'Test skill (E)' },
  { slot: 'ultimate', label: 'Test ultimate (Q)' },
  { slot: 'talent', label: 'Test talent' },
];

let selectedHero = null;
let me = null;
let state = { players: [] };

async function testAi() {
  console.log('[AI] Requesting multiple choice question from NVIDIA (deepseek-ai/deepseek-v4.1-flash)...');
  try {
    const res = await fetch('/api/hero-lab/test-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: NVIDIA_API_KEY || undefined,
        prompt: 'Make a multiple choice question about what AI is.',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('[AI] Request failed:', data.error || data);
      return;
    }
    console.log('[AI] Model answer:\n' + data.answer);
  } catch (err) {
    console.error('[AI] Error calling AI endpoint:', err);
  }
}

if (testAiBtn) testAiBtn.addEventListener('click', testAi);

socket.on('connect', () => {
  connectionStatus.textContent = 'Connected to the Hero Lab server. Choose a hero to join.';
  if (selectedHero) socket.emit('join', { heroId: selectedHero.id });
});
socket.on('connect_error', (error) => {
  connectionStatus.textContent = `Could not connect to the server: ${error.message}`;
});
socket.on('disconnect', () => {
  me = null;
  state = { players: [] };
  releaseKeys();
  connectionStatus.textContent = 'Disconnected from the server. Reconnecting…';
});
socket.on('welcome', (welcome) => {
  me = welcome.you;
  connectionStatus.textContent = 'Connected. Movement and aim are sent to the server.';
});
socket.on('state', (snapshot) => {
  state = snapshot;
});
socket.on('notice', (message) => {
  connectionStatus.textContent = message;
});
socket.on('fired', (result) => {
  console.log(`[Weapon] ${result.mode === 'primary' ? 'Primary' : 'Secondary'} fire status:`, result);
  addListItem(actionLog, `${result.hero} activated ${result.mode} fire (${selectedHero?.weapon.name || 'weapon'})`);
  trimActionLog();
});

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    if (canvas.requestFullscreen) {
      canvas.requestFullscreen().catch((err) => console.error('Fullscreen request failed:', err));
    } else if (canvas.webkitRequestFullscreen) {
      canvas.webkitRequestFullscreen();
    }
  } else if (document.exitFullscreen) {
    document.exitFullscreen().catch((err) => console.error('Exit fullscreen failed:', err));
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}

function addListItem(list, text) {
  const item = document.createElement('li');
  item.textContent = text;
  list.append(item);
}

function trimActionLog() {
  while (actionLog.children.length > 8) actionLog.firstElementChild.remove();
}

function releaseKeys() {
  let changed = false;
  for (const key of Object.keys(keys)) {
    if (keys[key]) changed = true;
    keys[key] = false;
  }
  if (changed && socket.connected) socket.emit('input', keys);
}

function selectHero(hero) {
  selectedHero = hero;
  worldMessage.textContent = `Playing as ${hero.emoji} ${hero.name}. Movement and aim are server-driven. Open another tab at /hero-lab to see multiplayer state.`;
  canvas.hidden = false;
  if (fullscreenBtn) fullscreenBtn.hidden = false;
  heroDetails.hidden = false;
  heroStats.replaceChildren();
  actionLog.replaceChildren();
  addListItem(actionLog, `${hero.name} joining the server's test world…`);
  [
    `HP: ${hero.hp} / ${hero.maxHp}`,
    `Attack: ${hero.attack}`,
    `Defense: ${hero.defense}`,
    `Weapon: ${hero.weapon.name}`,
    `Skill (E): ${hero.skill.name}`,
    `Ultimate (Q): ${hero.ultimate.name}`,
    `Talent: ${hero.talent.name}`,
    `Buff slots: ${hero.buffs.length} / ${hero.buffSlots} used`,
  ].forEach((stat) => addListItem(heroStats, stat));
  if (socket.connected) socket.emit('join', { heroId: hero.id });
}

function testAction(slot) {
  if (!selectedHero) return;
  addListItem(actionLog, selectedHero.use(slot));
  trimActionLog();
}

function fireWeapon(mode) {
  if (selectedHero && socket.connected) socket.emit('fire', mode);
}

for (const hero of HEROES) {
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = `${hero.emoji} ${hero.name}`;
  button.addEventListener('click', () => selectHero(hero));
  item.append(button, ` — HP ${hero.maxHp}, attack ${hero.attack}, defense ${hero.defense}`);
  heroList.append(item);
}

for (const { slot, label } of actionButtons) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', () => testAction(slot));
  actions.append(button, ' ');
}

function onPointerMove(event) {
  if (!selectedHero || !socket.connected || !me) return;
  const player = state.players.find((candidate) => candidate.id === me);
  if (!player) return;
  const rect = canvas.getBoundingClientRect();
  const pointer = {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
  socket.emit('aim', { x: pointer.x - player.x, y: pointer.y - player.y });
}

function onKeyDown(event) {
  if (!selectedHero || event.target.closest?.('input, textarea, select')) return;
  const key = codeToKey[event.code];
  if (key) {
    if (!keys[key]) {
      keys[key] = true;
      if (socket.connected) socket.emit('input', keys);
    }
    event.preventDefault();
  } else if (event.code === 'KeyE' && !event.repeat) {
    testAction('skill');
  } else if (event.code === 'KeyQ' && !event.repeat) {
    testAction('ultimate');
  } else if (event.code === 'KeyF' && !event.repeat) {
    toggleFullscreen();
  }
}

function onKeyUp(event) {
  const key = codeToKey[event.code];
  if (key && keys[key]) {
    keys[key] = false;
    if (socket.connected) socket.emit('input', keys);
  }
}

function onPointerDown(event) {
  if (!selectedHero) return;
  onPointerMove(event);
  if (event.button === 0) fireWeapon('primary');
  else if (event.button === 2) {
    event.preventDefault();
    fireWeapon('secondary');
  }
}

function draw() {
  requestAnimationFrame(draw);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#888';
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

  for (const player of state.players) {
    const center = { x: player.x, y: player.y };
    const tip = { x: center.x + player.aim.x * 48, y: center.y + player.aim.y * 48 };
    context.strokeStyle = player.id === me ? '#222' : '#777';
    context.fillStyle = context.strokeStyle;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(center.x, center.y);
    context.lineTo(tip.x, tip.y);
    context.stroke();

    const angle = Math.atan2(player.aim.y, player.aim.x);
    context.beginPath();
    context.moveTo(tip.x, tip.y);
    context.lineTo(tip.x - 12 * Math.cos(angle - Math.PI / 6), tip.y - 12 * Math.sin(angle - Math.PI / 6));
    context.lineTo(tip.x - 12 * Math.cos(angle + Math.PI / 6), tip.y - 12 * Math.sin(angle + Math.PI / 6));
    context.closePath();
    context.fill();

    if (player.id === me) {
      context.strokeStyle = '#1683ff';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(center.x, center.y, 23, 0, Math.PI * 2);
      context.stroke();
    }
    context.font = '32px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#222';
    context.fillText(player.emoji, center.x, center.y);
    context.font = '12px sans-serif';
    context.fillText(player.name, center.x, center.y + 30);
  }
}

canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('dblclick', toggleFullscreen);
if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  if (fullscreenBtn) fullscreenBtn.textContent = document.fullscreenElement === canvas ? 'Exit fullscreen' : 'Fullscreen';
});
addEventListener('keydown', onKeyDown);
addEventListener('keyup', onKeyUp);
addEventListener('blur', releaseKeys);
requestAnimationFrame(draw);
