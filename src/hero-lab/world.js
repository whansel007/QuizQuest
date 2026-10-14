const HEROES = {
  flamekeeper: { name: 'Flamekeeper', emoji: '🧙' },
  ranger: { name: 'Ranger', emoji: '🏹' },
  guardian: { name: 'Guardian', emoji: '🛡️' },
};

const W = { width: 800, height: 500, radius: 24, speed: 220, tickHz: 30 };
const SPAWNS = [
  { x: 200, y: 250 },
  { x: 600, y: 250 },
  { x: 400, y: 150 },
  { x: 400, y: 350 },
];
const MOVEMENT_KEYS = ['up', 'down', 'left', 'right'];
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function attachHeroLab(io) {
  const nsp = io.of('/hero-lab');
  const players = new Map();

  nsp.on('connection', (socket) => {
    socket.on('join', (payload) => {
      const hero = HEROES[payload?.heroId];
      if (!hero) return socket.emit('notice', 'Choose a valid hero to join the field.');

      const existing = players.get(socket.id);
      const index = existing
        ? [...players.keys()].indexOf(socket.id) % SPAWNS.length
        : players.size % SPAWNS.length;
      const spawn = SPAWNS[index];
      players.set(socket.id, {
        id: socket.id,
        heroId: payload.heroId,
        name: hero.name,
        emoji: hero.emoji,
        x: spawn.x,
        y: spawn.y,
        aim: { x: 1, y: 0 },
        keys: {},
      });
      socket.emit('welcome', { you: socket.id, arena: { width: W.width, height: W.height } });
      broadcastState();
    });

    socket.on('input', (input) => {
      const player = players.get(socket.id);
      if (!player || !input || typeof input !== 'object') return;
      player.keys = Object.fromEntries(MOVEMENT_KEYS.map((key) => [key, input[key] === true]));
    });

    socket.on('aim', (aim) => {
      const player = players.get(socket.id);
      if (!player || !Number.isFinite(aim?.x) || !Number.isFinite(aim?.y)) return;
      const length = Math.hypot(aim.x, aim.y);
      if (length > 0) player.aim = { x: aim.x / length, y: aim.y / length };
    });

    socket.on('fire', (mode) => {
      const player = players.get(socket.id);
      if (!player || !['primary', 'secondary'].includes(mode)) return;
      socket.emit('fired', {
        mode,
        hero: player.name,
        position: { x: player.x, y: player.y },
        aim: { ...player.aim },
        timestamp: Date.now(),
      });
    });

    socket.on('disconnect', () => {
      if (players.delete(socket.id)) broadcastState();
    });
  });

  function snapshot() {
    return {
      players: [...players.values()].map(({ id, heroId, name, emoji, x, y, aim }) => ({
        id, heroId, name, emoji, x: Math.round(x), y: Math.round(y), aim: { ...aim },
      })),
    };
  }

  function broadcastState() {
    nsp.emit('state', snapshot());
  }

  const loop = setInterval(() => {
    const step = W.speed / W.tickHz;
    for (const player of players.values()) {
      const dx = Number(player.keys.right) - Number(player.keys.left);
      const dy = Number(player.keys.down) - Number(player.keys.up);
      if (!dx && !dy) continue;
      const length = Math.hypot(dx, dy);
      player.x = clamp(player.x + (dx / length) * step, W.radius, W.width - W.radius);
      player.y = clamp(player.y + (dy / length) * step, W.radius, W.height - W.radius);
    }
    broadcastState();
  }, 1000 / W.tickHz);

  return { stop: () => clearInterval(loop), players };
}

module.exports = { attachHeroLab, W };
