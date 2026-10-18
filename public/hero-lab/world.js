import { HEROES } from './hero-list.js';
import { Fireball } from './projectiles/fireball.js';
import { EnemyProjectile } from './projectiles/enemy-projectile.js';
import { GAME_CONFIG } from './game-config.js';

const canvas = document.querySelector('#world');
const context = canvas.getContext('2d');
const connectionStatus = document.querySelector('#connection-status');
const waveNumber = document.querySelector('#wave-number');
const waveDetails = document.querySelector('#wave-details');
const heroName = document.querySelector('#hero-name');
const healthFill = document.querySelector('#health-fill');
const healthTrack = document.querySelector('.health-track');
const healthValue = document.querySelector('#health-value');
const infoButton = document.querySelector('#info-button');
const statsPanel = document.querySelector('#stats-panel');
const gameOverOverlay = document.querySelector('#game-over');
const socket = window.io('/hero-lab');
const heroId = new URLSearchParams(location.search).get('heroId');
const selectedHero = HEROES.find((hero) => hero.id === heroId);
if (!selectedHero) location.replace('/hero-lab');

const keys = { up: false, down: false, left: false, right: false };
const codeToKey = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
};
let me = null;
let state = { players: [], projectiles: [], monsters: [], campfire: null, wave: null };
let stateReceivedAt = performance.now();
const clientProjectiles = new Map();
const particles = [];
const damageTexts = [];
let lastTime = performance.now();

socket.on('connect', () => {
  connectionStatus.textContent = 'Joining the field…';
  if (selectedHero) socket.emit('join', { heroId: selectedHero.id });
});
socket.on('connect_error', (error) => {
  connectionStatus.textContent = `Could not connect to the server: ${error.message}`;
});
socket.on('disconnect', () => {
  me = null;
  state = { players: [], projectiles: [], monsters: [], campfire: null, wave: null };
  clientProjectiles.clear();
  releaseKeys();
  connectionStatus.textContent = 'Disconnected from the server. Reconnecting…';
});
socket.on('welcome', (welcome) => {
  me = welcome.you;
  connectionStatus.textContent = 'Connected';
});
socket.on('state', (snapshot) => {
  state = snapshot;
  stateReceivedAt = performance.now();
  if (Array.isArray(snapshot.projectiles)) {
    const active = new Set(snapshot.projectiles.map((projectile) => projectile.id));
    for (const id of clientProjectiles.keys()) {
      if (!active.has(id)) clientProjectiles.delete(id);
    }
    for (const proj of snapshot.projectiles) {
      addOrUpdateProjectile(proj);
    }
  }
});
socket.on('notice', (message) => {
  connectionStatus.textContent = message;
});
socket.on('player_hit', (hit) => {
  if (hit.id !== me) return;
  damageTexts.push({
    x: hit.x,
    y: hit.y - 24,
    text: `-${hit.damage}`,
    alpha: 1,
    vy: -35,
    color: '#ff6161',
  });
});
socket.on('game_over', () => {
  gameOverOverlay.hidden = false;
  setTimeout(() => {
    if (new URLSearchParams(location.search).has('embedded') && window.parent !== window) {
      window.parent.postMessage({ type: 'hero-lab-game-over' }, location.origin);
    } else {
      location.replace('/hero-lab');
    }
  }, 1200);
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
  const ProjectileClass = data.kind === 'enemy' ? EnemyProjectile : Fireball;
  const projectile = new ProjectileClass({
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

function releaseKeys() {
  let changed = false;
  for (const key of Object.keys(keys)) {
    if (keys[key]) changed = true;
    keys[key] = false;
  }
  if (changed && socket.connected) socket.emit('input', keys);
}

function getPointerCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function fireWeapon(mode) {
  if (!me || !socket.connected) return;
  socket.emit('fire', mode);
}

function onPointerMove(event) {
  if (!socket.connected || !me) return;
  const player = state.players.find((candidate) => candidate.id === me);
  if (!player) return;
  const pointer = getPointerCoordinates(event);
  socket.emit('aim', { x: pointer.x - player.x, y: pointer.y - player.y });
}

function onKeyDown(event) {
  if (!me || event.target.closest?.('input, textarea, select')) return;
  const key = codeToKey[event.code];
  if (key) {
    if (!keys[key]) {
      keys[key] = true;
      if (socket.connected) socket.emit('input', keys);
    }
    event.preventDefault();
  } else if (event.code === 'KeyE' && !event.repeat) {
    socket.emit('skill');
  } else if (event.code === 'KeyQ' && !event.repeat) {
    socket.emit('ultimate');
  } else if (event.code === 'KeyI' && !event.repeat) {
    toggleStats();
  }
}

function toggleStats() {
  const open = statsPanel.hidden;
  statsPanel.hidden = !open;
  infoButton.setAttribute('aria-expanded', String(open));
}

infoButton.addEventListener('click', toggleStats);

function updateHud(timestamp = performance.now()) {
  const player = state.players?.find((candidate) => candidate.id === me);
  if (state.wave && waveNumber && waveDetails) {
    waveNumber.textContent = `Wave ${state.wave.number || 1}`;
    if (state.wave.nextWaveInMs > 0) {
      const remaining = Math.max(0, state.wave.nextWaveInMs - (timestamp - stateReceivedAt));
      waveDetails.textContent = remaining > 300
        ? `Wave cleared · Next wave in ${Math.ceil(remaining / 1000)}s`
        : 'Next wave starting…';
    } else {
      waveDetails.textContent = `Enemies left: ${state.wave.enemiesRemaining}`;
    }
  }
  if (!player) return;

  heroName.textContent = `${player.emoji} ${player.name}`;
  const hpRatio = player.maxHp > 0 ? Math.max(0, Math.min(1, player.hp / player.maxHp)) : 0;
  healthFill.style.width = `${hpRatio * 100}%`;
  healthFill.style.background = hpRatio <= .25 ? '#ef5350' : hpRatio <= .55 ? '#ffb74d' : '#64d985';
  healthTrack.setAttribute('aria-valuemax', String(player.maxHp));
  healthTrack.setAttribute('aria-valuenow', String(player.hp));
  healthValue.textContent = `${player.hp} / ${player.maxHp}`;

  const color = GAME_CONFIG.hud[player.type] || GAME_CONFIG.hud.physical;
  document.querySelectorAll('.ability[data-ability]').forEach((element) => {
    const id = element.dataset.ability;
    const data = player.abilities?.[id];
    const circle = element.querySelector('.ability-circle');
    const name = element.querySelector('.ability-name');
    if (!data) return;
    name.textContent = data.name || id;
    element.dataset.type = player.type || 'physical';
    circle.style.setProperty('--fill-color', color);
    const elapsedMs = Math.max(0, timestamp - stateReceivedAt);
    const remaining = Math.max(0, data.remainingMs - elapsedMs);
    const fill = data.durationMs > 0 ? Math.max(0, Math.min(100, (1 - remaining / data.durationMs) * 100)) : 100;
    circle.style.setProperty('--fill', `${fill}%`);
    circle.classList.toggle('ready', remaining <= 0);
  });

  document.querySelector('#stat-health').textContent = `${player.hp} / ${player.maxHp}`;
  document.querySelector('#stat-attack').textContent = String(player.attack);
  document.querySelector('#stat-defense').textContent = String(player.defense);
  document.querySelector('#stat-speed').textContent = String(player.speed);
}

function onKeyUp(event) {
  const key = codeToKey[event.code];
  if (key && keys[key]) {
    keys[key] = false;
    if (socket.connected) socket.emit('input', keys);
  }
}

function onPointerDown(event) {
  if (!me) return;
  const pointer = getPointerCoordinates(event);
  const player = state.players.find((candidate) => candidate.id === me);
  if (player) {
    const dx = pointer.x - player.x;
    const dy = pointer.y - player.y;
    if (socket.connected) socket.emit('aim', { x: dx, y: dy });
  }
  if (event.button === 0) {
    fireWeapon('primary');
  }
}

function draw(timestamp) {
  requestAnimationFrame(draw);
  updateHud(timestamp);
  const currentTime = timestamp || performance.now();
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
  lastTime = currentTime;

  const grassTileSize = 80;
  const grassColors = ['#70a94f', '#79b456'];
  for (let y = 0; y < canvas.height; y += grassTileSize) {
    for (let x = 0; x < canvas.width; x += grassTileSize) {
      context.fillStyle = grassColors[(Math.floor(x / grassTileSize) + Math.floor(y / grassTileSize)) % 2];
      context.fillRect(x, y, grassTileSize, grassTileSize);
    }
  }
  context.strokeStyle = '#456f35';
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

  // 1. Draw Campfire in the middle
  const cf = state.campfire || {
    x: GAME_CONFIG.arena.width / 2,
    y: GAME_CONFIG.arena.height / 2,
    radius: GAME_CONFIG.campfire.radius,
    hp: GAME_CONFIG.campfire.hp,
    maxHp: GAME_CONFIG.campfire.hp,
  };
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

      // Give the pale zombie emoji an opaque backdrop so it reads clearly on grass.
      context.save();
      context.globalAlpha = 1;
      context.globalCompositeOperation = 'source-over';
      context.beginPath();
      context.arc(monster.x, monster.y, 20, 0, Math.PI * 2);
      context.fillStyle = '#426b36';
      context.fill();
      context.strokeStyle = '#294a24';
      context.lineWidth = 2;
      context.stroke();
      context.font = '32px sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(monster.emoji || '🧟', monster.x, monster.y);
      context.restore();

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
addEventListener('keydown', onKeyDown);
addEventListener('keyup', onKeyUp);
addEventListener('blur', releaseKeys);
requestAnimationFrame(draw);
