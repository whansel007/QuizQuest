// Hero Lab socket entry point. All game state lives in Room instances (see
// ./room.js); this file only authenticates sockets and routes each socket's
// intents to the single room it joined. Every room broadcasts through its own
// Socket.IO room, so players in room A never see events from room B.
const { GAME_CONFIG } = require('../../public/hero-lab/game-config.js');
const { JOIN_FAILURE_LIMIT, JOIN_FAILURE_WINDOW_S } = require('../../config/tuning.js');
const { createRoomManager } = require('./rooms');

const ARENA_CONFIG = {
  width: GAME_CONFIG.arena.width,
  height: GAME_CONFIG.arena.height,
  radius: GAME_CONFIG.arena.playerRadius,
  tickHz: GAME_CONFIG.arena.tickHz,
};

function attachHeroLab(io, services = null) {
  const nsp = io.of('/hero-lab');

  // Standalone Hero Lab remains available without a QuizQuest session. The
  // signed-in app supplies its token so saved kingdom levels can be applied.
  nsp.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next();
    const user = services?.authenticate(token);
    if (!user || user.role !== 'student') return next(new Error('Please sign in as a student.'));
    socket.data.user = user;
    socket.data.token = token;
    next();
  });

  const manager = createRoomManager({ io, services });

  nsp.on('connection', (socket) => {
    const safe = (event, handler) => (...args) => {
      try {
        return handler(...args);
      } catch (error) {
        console.error(`[Hero Lab] ${event} failed:`, error && error.stack || error);
        socket.emit('notice', 'The game could not complete that action. Please rejoin the World.');
      }
    };
    const roomOf = () => socket.data.heroLabRoom || null;

    socket.on('join', safe('join', (payload) => {
      if (roomOf()) return;

      const now = Date.now();
      const failures = (socket.data.joinFailures || []).filter((at) => now - at < JOIN_FAILURE_WINDOW_S * 1000);
      socket.data.joinFailures = failures;
      if (failures.length >= JOIN_FAILURE_LIMIT) {
        socket.emit('join_error', { code: 'rate_limited', message: 'Too many failed attempts. Wait a minute and try again.' });
        return;
      }

      let room = null;
      let error = null;
      if (payload?.trialTicket) {
        room = manager.findTrialByTicket(payload.trialTicket);
        if (!room) error = { code: 'trial_expired', message: 'This workshop trial has expired. Return to the Workshop to start another.' };
      } else if (payload?.create) {
        room = manager.create();
        if (!room) error = { code: 'server_full', message: 'All rooms are busy right now. Try again shortly.' };
      } else if (payload?.roomCode) {
        room = manager.findByCode(payload.roomCode);
        if (!room) error = { code: 'not_found', message: 'Room not found' };
      } else {
        // Sandbox: no code and no create request lands in the shared dev room.
        room = manager.getDefaultRoom();
      }

      if (!room) {
        failures.push(now);
        socket.emit('join_error', error);
        return;
      }

      socket.join(room.id);
      const result = room.join(socket, payload);
      if (!result.ok) {
        socket.leave(room.id);
        failures.push(now);
        socket.emit('join_error', { code: result.code, message: result.message });
        return;
      }
      socket.data.heroLabRoom = room;
      socket.data.joinFailures = [];
    }));

    socket.on('input', safe('input', (input) => roomOf()?.input(socket, input)));
    socket.on('primary_hold', safe('primary_hold', (held) => roomOf()?.primaryHold(socket, held)));
    socket.on('milestone_choice', safe('milestone_choice', (choice) => roomOf()?.milestoneChoice(socket, choice)));
    socket.on('aim', safe('aim', (aim) => roomOf()?.aim(socket, aim)));
    socket.on('fire', safe('fire', (mode, target) => roomOf()?.fire(socket, mode, target)));
    socket.on('skill', safe('skill', (target) => roomOf()?.skill(socket, target)));
    socket.on('ultimate', safe('ultimate', () => roomOf()?.ultimate(socket)));
    socket.on('cancel_targeting', safe('cancel_targeting', () => roomOf()?.cancelTargeting(socket)));
    socket.on('buff_vote', safe('buff_vote', (cardId) => roomOf()?.castBuffVote(socket, cardId)));
    socket.on('start_run', safe('start_run', () => {
      const room = roomOf();
      if (!room) return;
      const result = room.startRun(socket);
      if (!result.ok) socket.emit('start_rejected', result);
    }));
    socket.on('swap_hero', safe('swap_hero', (heroId) => {
      const room = roomOf();
      if (!room) return;
      const result = room.swapHero(socket, heroId);
      if (!result.ok) socket.emit('swap_rejected', result);
    }));
    socket.on('spawn_trial_enemy', safe('spawn_trial_enemy', (enemyId) => {
      const room = roomOf();
      if (!room) return;
      const result = room.spawnTrialEnemy?.(socket, enemyId);
      if (result && !result.ok) socket.emit('trial_spawn_rejected', result);
    }));
    socket.on('summon_trial_wave', safe('summon_trial_wave', () => {
      const room = roomOf();
      if (!room) return;
      const result = room.summonTrialWave?.(socket);
      if (result && !result.ok) socket.emit('trial_spawn_rejected', result);
    }));

    // Debug actions are available to seeded demo accounts and the standalone
    // Hero Lab page.
    const isDebugSocket = () => Boolean(
      socket.handshake.auth?.debug === true || services?.isDebugUser?.(socket.data.user),
    );
    socket.on('debug_set_tower', safe('debug_set_tower', (level) => {
      if (!isDebugSocket()) return;
      roomOf()?.debugSetTower?.(level, socket.id);
    }));
    socket.on('debug_set_samurai_stacks', safe('debug_set_samurai_stacks', (stacks) => {
      if (!isDebugSocket()) return;
      roomOf()?.debugSetSamuraiStacks?.(stacks, socket.id);
    }));
    socket.on('debug_ranger', safe('debug_ranger', ({ action, x, y } = {}) => {
      if (!isDebugSocket()) return;
      roomOf()?.debugRangerAction?.(action, socket.id, x, y);
    }));
    socket.on('debug_turret', safe('debug_turret', ({ action, x, y } = {}) => {
      if (!isDebugSocket()) return;
      if (action === 'place') roomOf()?.debugPlaceTurret?.(socket.id, x, y);
      else if (['expire', 'damage'].includes(action)) roomOf()?.debugTurretAction?.(action, socket.id);
    }));
    socket.on('debug_spawn_at', safe('debug_spawn_at', ({ type, x, y } = {}) => {
      if (!isDebugSocket()) return;
      roomOf()?.debugSpawnAt?.(type, x, y);
    }));
    socket.on('debug_add_stat_card', safe('debug_add_stat_card', (cardId) => {
      if (!isDebugSocket()) return;
      roomOf()?.debugAddStatCard?.(cardId, socket.id);
    }));
    socket.on('debug_monster_effect', safe('debug_monster_effect', ({ effect, target } = {}) => {
      if (!isDebugSocket()) return;
      roomOf()?.applyDebugMonsterEffect?.(effect, target);
    }));

    socket.on('disconnect', () => {
      const room = roomOf();
      socket.data.heroLabRoom = null;
      if (room) room.leave(socket);
    });
  });

  // Compatibility handle: the default room's collections stay reachable so
  // existing diagnostics and tests keep working after the room refactor.
  const handle = {
    stop: () => manager.stop(),
    rooms: manager,
    createRoom: (options) => manager.create(options),
  };
  for (const key of ['players', 'projectiles', 'monsters', 'campfire']) {
    Object.defineProperty(handle, key, {
      enumerable: true,
      get() {
        const room = manager.peekDefaultRoom();
        return room ? room[key] : null;
      },
    });
  }
  return handle;
}

module.exports = { attachHeroLab, ARENA_CONFIG, W: ARENA_CONFIG };
