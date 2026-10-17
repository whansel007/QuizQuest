import { HEROES } from './hero.js';
import { Fireball, Projectile } from './projectile.js';

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
let state = { players: [], projectiles: [], monsters: [], campfire: null };
const clientProjectiles = new Map();
const particles = [];
const damageTexts = [];
let projectileSeq = 0;
let lastTime = performance.now();

async function testAi() {
  console.log('[AI] Requesting multiple choice question from NVIDIA (deepseek-ai/deepseek-v4.1-flash)...');
  try {
    const res = await fetch('/api/hero-lab/test-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
  state = { players: [], projectiles: [], monsters: [], campfire: null };
  clientProjectiles.clear();
  releaseKeys();
  connectionStatus.textContent = 'Disconnected from the server. Reconnecting…';
});
socket.on('welcome', (welcome) => {
  me = welcome.you;
  connectionStatus.textContent = 'Connected. Movement and aim are sent to the server.';
});
socket.on('state', (snapshot) => {
  state = snapshot;
  if (Array.isArray(snapshot.projectiles)) {
    for (const proj of snapshot.projectiles) {
      addOrUpdateProjectile(proj);
    }
  }
});
socket.on('notice', (message) => {
  connectionStatus.textContent = message;
});
socket.on('projectile_spawn', (proj) => {
  addOrUpdateProjectile(proj);
});
socket.on('fired', (result) => {
  console.log(`[Weapon] ${result.mode === 'primary' ? 'Primary' : 'Secondary'} fire status:`, result);
  addListItem(actionLog, `${result.hero} activated ${result.mode} fire (${selectedHero?.weapon.name || 'weapon'})`);
  trimActionLog();
});
socket.on('hit', (hit) => {
  damageTexts.push({
    x: hit.x + (Math.random() - 0.5) * 10,
    y: hit.y - 12,
    text: `-${hit.damage}`,
    alpha: 1,
    vy: -35,
    color: '#ffdd00',
  });
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 60;
    particles.push({
      x: hit.x,
      y: hit.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1.5 + Math.random() * 2,
      color: Math.random() > 0.4 ? '#ff3b30' : '#ffea00',
      alpha: 1,
      decay: 0.05 + Math.random() * 0.05,
    });
  }
});
socket.on('monster_killed', (data) => {
  damageTexts.push({
    x: data.x,
    y: data.y - 20,
    text: '💀 +10',
    alpha: 1,
    vy: -25,
    color: '#a7ffeb',
  });
  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 40 + Math.random() * 90;
    particles.push({
      x: data.x,
      y: data.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 2.5,
      color: Math.random() > 0.5 ? '#81c784' : '#4caf50',
      alpha: 1,
      decay: 0.04 + Math.random() * 0.04,
    });
  }
});

function addOrUpdateProjectile(data) {
  if (clientProjectiles.has(data.id)) {
    const existing = clientProjectiles.get(data.id);
    existing.x += (data.x - existing.x) * 0.4;
    existing.y += (data.y - existing.y) * 0.4;
    existing.vx = data.vx;
    existing.vy = data.vy;
    return;
  }
  const projectile = new Fireball({
    id: data.id,
    x: data.x,
    y: data.y,
    vx: data.vx,
    vy: data.vy,
    radius: data.radius || 10,
    color: data.color || '#ff2d20',
    createdAt: data.createdAt || Date.now(),
  });
  clientProjectiles.set(data.id, projectile);
  // Muzzle spark flash
  for (let i = 0; i < 6; i++) {
    const angle = Math.atan2(data.vy, data.vx) + (Math.random() - 0.5) * 0.9;
    const speed = 40 + Math.random() * 80;
    particles.push({
      x: data.x,
      y: data.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1.5 + Math.random() * 2,
      color: Math.random() > 0.4 ? '#ffea00' : '#ff3b30',
      alpha: 1,
      decay: 0.05 + Math.random() * 0.04,
    });
  }
}

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
  if (slot === 'weapon') fireWeapon('primary');
}

function getPointerCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function fireWeapon(mode, customAim) {
  if (!selectedHero) return;
  const player = state.players.find((candidate) => candidate.id === me);
  const aim = customAim || player?.aim || selectedHero.aim || { x: 1, y: 0 };

  // The hero delegates firing to its weapon object
  const fireResult = selectedHero.fire(mode);

  let projectileId = null;
  if (fireResult?.projectile) {
    projectileSeq += 1;
    projectileId = `proj_${me || 'local'}_${projectileSeq}_${Date.now()}`;
    const pConfig = fireResult.projectile;
    const speed = pConfig.speed || 550;
    const startX = (player ? player.x : selectedHero.position.x) + aim.x * 24;
    const startY = (player ? player.y : selectedHero.position.y) + aim.y * 24;
    addOrUpdateProjectile({
      id: projectileId,
      x: startX,
      y: startY,
      vx: aim.x * speed,
      vy: aim.y * speed,
      radius: pConfig.radius || 10,
      color: pConfig.color || '#ff2d20',
      createdAt: Date.now(),
    });
  }

  if (socket.connected) {
    socket.emit('fire', { mode, aim, projectileId });
  } else {
    addListItem(actionLog, `${fireResult.hero} activated ${fireResult.mode} fire (${selectedHero.weapon.name})`);
    trimActionLog();
  }
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
  const pointer = getPointerCoordinates(event);
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
  const pointer = getPointerCoordinates(event);
  const player = state.players.find((candidate) => candidate.id === me);
  let aim = null;
  if (player) {
    const dx = pointer.x - player.x;
    const dy = pointer.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 0) {
      aim = { x: dx / distance, y: dy / distance };
      if (socket.connected) socket.emit('aim', { x: dx, y: dy });
    }
  }
  if (event.button === 0) {
    fireWeapon('primary', aim);
  } else if (event.button === 2) {
    event.preventDefault();
    fireWeapon('secondary', aim);
  }
}

function draw(timestamp) {
  requestAnimationFrame(draw);
  const currentTime = timestamp || performance.now();
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
  lastTime = currentTime;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#888';
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

  // 1. Draw Campfire in the middle
  const cf = state.campfire || { x: 400, y: 250, radius: 28, hp: 100, maxHp: 100 };
  if (cf) {
    if (cf.hp > 0) {
      const glowRadius = 90 + Math.sin(currentTime * 0.005) * 8;
      const fireGlow = context.createRadialGradient(cf.x, cf.y, 10, cf.x, cf.y, glowRadius);
      fireGlow.addColorStop(0, 'rgba(255, 120, 20, 0.22)');
      fireGlow.addColorStop(0.5, 'rgba(255, 70, 0, 0.08)');
      fireGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = fireGlow;
      context.beginPath();
      context.arc(cf.x, cf.y, glowRadius, 0, Math.PI * 2);
      context.fill();

      // Ambient rising fire embers
      if (Math.random() < 0.25) {
        particles.push({
          x: cf.x + (Math.random() - 0.5) * 24,
          y: cf.y + (Math.random() - 0.5) * 12,
          vx: (Math.random() - 0.5) * 15,
          vy: -25 - Math.random() * 25,
          radius: 1.5 + Math.random() * 1.5,
          color: Math.random() > 0.4 ? '#ffea00' : '#ff4500',
          alpha: 0.9,
          decay: 0.03 + Math.random() * 0.03,
        });
      }
    }

    // Base ring of stones
    context.beginPath();
    context.arc(cf.x, cf.y, cf.radius, 0, Math.PI * 2);
    context.fillStyle = cf.hp > 0 ? '#3e2723' : '#2b2b2b';
    context.fill();
    context.strokeStyle = cf.hp > 0 ? '#ff7043' : '#555';
    context.lineWidth = 2;
    context.stroke();

    // Campfire flame or smoke
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    if (cf.hp > 0) {
      const flameSize = 36 + Math.sin(currentTime * 0.009) * 3;
      context.font = `${flameSize}px sans-serif`;
      context.fillText('🔥', cf.x, cf.y - 2);
    } else {
      context.font = '32px sans-serif';
      context.fillText('💨', cf.x, cf.y - 2);
    }

    // Campfire Health Bar
    const barWidth = 64;
    const barHeight = 7;
    const barX = cf.x - barWidth / 2;
    const barY = cf.y - cf.radius - 18;
    context.fillStyle = '#111';
    context.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
    const hpRatio = Math.max(0, cf.hp / cf.maxHp);
    context.fillStyle = hpRatio > 0.5 ? '#4caf50' : hpRatio > 0.25 ? '#ff9800' : '#f44336';
    context.fillRect(barX, barY, barWidth * hpRatio, barHeight);
    context.font = 'bold 11px sans-serif';
    context.fillStyle = '#222';
    context.fillText(cf.hp > 0 ? `Campfire: ${cf.hp}/${cf.maxHp}` : 'Campfire Extinguished!', cf.x, barY - 9);
  }

  // 2. Draw Zombie Monsters
  if (Array.isArray(state.monsters)) {
    for (const monster of state.monsters) {
      // Monster shadow
      context.beginPath();
      context.ellipse(monster.x, monster.y + 16, 12, 5, 0, 0, Math.PI * 2);
      context.fillStyle = 'rgba(0, 0, 0, 0.2)';
      context.fill();

      // Zombie emoji
      context.font = '28px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(monster.emoji || '🧟', monster.x, monster.y);

      // Monster health bar
      const mBarW = 28;
      const mBarH = 4;
      const mBarX = monster.x - mBarW / 2;
      const mBarY = monster.y - 20;
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      context.fillRect(mBarX - 1, mBarY - 1, mBarW + 2, mBarH + 2);
      const mHpRatio = Math.max(0, monster.hp / monster.maxHp);
      context.fillStyle = mHpRatio > 0.4 ? '#4caf50' : '#e53935';
      context.fillRect(mBarX, mBarY, mBarW * mHpRatio, mBarH);
    }
  }

  // 3. Draw players
  for (const player of state.players) {
    const center = { x: player.x, y: player.y };
    const tip = { x: center.x + player.aim.x * 48, y: center.y + player.aim.y * 48 };
    context.strokeStyle = player.id === me ? '#222' : '#777';
    context.fillStyle = context.strokeStyle;

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

  // 4. Update and draw projectiles (glowing red fireballs)
  for (const [id, p] of clientProjectiles.entries()) {
    p.update(dt, canvas);

    if (Math.random() < 0.6) {
      particles.push({
        x: p.x + (Math.random() - 0.5) * 6,
        y: p.y + (Math.random() - 0.5) * 6,
        vx: -p.vx * 0.08 + (Math.random() - 0.5) * 20,
        vy: -p.vy * 0.08 + (Math.random() - 0.5) * 20,
        radius: 1.5 + Math.random() * 2,
        color: Math.random() > 0.3 ? '#ff3b30' : '#ffa000',
        alpha: 0.9,
        decay: 0.04 + Math.random() * 0.03,
      });
    }

    if (p.dead) {
      const edgeX = Math.max(0, Math.min(canvas.width, p.x));
      const edgeY = Math.max(0, Math.min(canvas.height, p.y));
      for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 70;
        particles.push({
          x: edgeX,
          y: edgeY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2 + Math.random() * 2,
          color: Math.random() > 0.5 ? '#ff2825' : '#ffc107',
          alpha: 1,
          decay: 0.05 + Math.random() * 0.05,
        });
      }
      clientProjectiles.delete(id);
      continue;
    }

    p.draw(context);
  }

  // 5. Update and draw embers/sparks
  for (let i = particles.length - 1; i >= 0; i--) {
    const part = particles[i];
    part.x += part.vx * dt;
    part.y += part.vy * dt;
    part.alpha -= part.decay;
    if (part.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }
    context.save();
    context.globalAlpha = Math.max(0, part.alpha);
    context.fillStyle = part.color;
    context.beginPath();
    context.arc(part.x, part.y, part.radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  // 6. Update and draw floating damage numbers
  for (let i = damageTexts.length - 1; i >= 0; i--) {
    const dtObj = damageTexts[i];
    dtObj.y += dtObj.vy * dt;
    dtObj.alpha -= 1.6 * dt;
    if (dtObj.alpha <= 0) {
      damageTexts.splice(i, 1);
      continue;
    }
    context.save();
    context.globalAlpha = Math.max(0, dtObj.alpha);
    context.font = 'bold 13px sans-serif';
    context.fillStyle = dtObj.color || '#ffea00';
    context.textAlign = 'center';
    context.fillText(dtObj.text, dtObj.x, dtObj.y);
    context.restore();
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
