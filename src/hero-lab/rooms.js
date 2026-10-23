// RoomManager owns the set of live Hero Lab rooms. A room is created lazily,
// ticks only while it has players, and is destroyed once it has been empty for
// ROOM_EMPTY_TTL_S seconds.
const {
  ROOM_EMPTY_TTL_S, ROOM_MAX_ACTIVE, ROOM_SWEEP_INTERVAL_MS,
  ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH,
} = require('../../config/tuning.js');
const { createRoom } = require('./room');

function randomCode() {
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function createRoomManager({ io, services = null, log = console.log } = {}) {
  const rooms = new Map();
  let defaultRoom = null;
  let sequence = 0;

  function findByCode(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return null;
    for (const room of rooms.values()) {
      if (!room.isDestroyed() && room.code === normalized) return room;
    }
    return null;
  }

  function uniqueCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = randomCode();
      if (!findByCode(code)) return code;
    }
    return null;
  }

  function create({ code = null, isDefault = false } = {}) {
    if (rooms.size >= ROOM_MAX_ACTIVE) {
      log(`[Hero Lab] room refused: ${ROOM_MAX_ACTIVE} active rooms`);
      return null;
    }
    const roomCode = isDefault ? code : (code || uniqueCode());
    if (!isDefault && !roomCode) {
      log('[Hero Lab] room refused: no free code');
      return null;
    }
    // A code belongs to exactly one live room; it becomes available again only
    // after that room is destroyed.
    if (!isDefault && findByCode(roomCode)) {
      log(`[Hero Lab] room refused: code ${roomCode} is already in use`);
      return null;
    }
    sequence += 1;
    const id = `room-${sequence}`;
    const room = createRoom({ io, services, id, code: roomCode, isDefault });
    rooms.set(id, room);
    if (isDefault) defaultRoom = room;
    log(`[Hero Lab] room created ${id}${roomCode ? ` code=${roomCode}` : ''}`);
    return room;
  }

  function get(id) {
    const room = rooms.get(id);
    return room && !room.isDestroyed() ? room : null;
  }

  function getDefaultRoom() {
    const current = peekDefaultRoom();
    return current || create({ isDefault: true });
  }

  function peekDefaultRoom() {
    return defaultRoom && !defaultRoom.isDestroyed() ? defaultRoom : null;
  }

  function destroy(room, reason = 'manual') {
    if (!room || room.isDestroyed()) return;
    room.destroy();
    rooms.delete(room.id);
    if (defaultRoom === room) defaultRoom = null;
    log(`[Hero Lab] room destroyed ${room.id}${room.code ? ` code=${room.code}` : ''} (${reason})`);
  }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const room of [...rooms.values()]) {
      if (room.occupancy() > 0) continue;
      if (now - room.emptySince() >= ROOM_EMPTY_TTL_S * 1000) destroy(room, 'ttl');
    }
  }, ROOM_SWEEP_INTERVAL_MS);
  if (typeof sweep.unref === 'function') sweep.unref();

  function stop() {
    clearInterval(sweep);
    for (const room of [...rooms.values()]) destroy(room, 'shutdown');
  }

  return {
    create,
    get,
    findByCode,
    getDefaultRoom,
    peekDefaultRoom,
    destroy,
    stop,
    list: () => [...rooms.values()],
    get size() { return rooms.size; },
  };
}

module.exports = { createRoomManager, randomCode };
