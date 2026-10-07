// ============================================================
// QuizQuest World - multiplayer co-op on top of Circle Tag's engine
// ------------------------------------------------------------
// Same model as server.js's tag game: browsers send held keys, the
// server owns positions and broadcasts snapshots. New here:
//   - one world per CLASS (Socket.IO room), so classes never mix
//   - sign-in required: the socket handshake carries the same token
//     as the REST API, checked before anything else happens
//   - resource nodes: walk up, press E, answer a question -> resources
//   - a co-op raid boss: answer questions near it to deal damage;
//     everyone who landed a hit shares the victory reward
// Questions come from the class's published bank and are graded by
// the SAME services as practice sessions (src/quiz/api.js), so answer
// keys never reach the browser and coin rules (first correct per
// question, daily caps) apply here too. Co-op only: no PvP, no chat
// (just a few emotes), which keeps moderation out of the prototype.
// ============================================================

const crypto = require('crypto');
const { RESOURCES } = require('../quiz/economy');

const W = { w: 960, h: 576, tile: 48, radius: 18, speed: 220, tickHz: 30 };
const BOSS = { radius: 46, range: 125, baseHp: 60, hpPerPlayer: 40, damage: 10, respawnMs: 30000, rewardCoins: 25, rewardRes: { crystal: 2 } };
const NODES = { count: 7, range: 48, respawnMs: 15000, yield: 3 };
const CHALLENGE_TTL = 60000;
const WRONG_COOLDOWN = 4000;
const EMOTES = ['👋', '👍', '🎉', '😮', '💪'];

const rid = () => crypto.randomUUID().slice(0, 8);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function attachWorld(io, services) {
  const nsp = io.of('/world');
  const worlds = new Map(); // classId -> world
  // userId -> time until which they can't start a new question. Kept per
  // student (not per socket) so it survives leaving and rejoining.
  const cooldowns = new Map();
  const cooldown = (userId) => {
    const t = Date.now();
    for (const [u, until] of cooldowns) if (until < t) cooldowns.delete(u); // forget expired ones
    cooldowns.set(userId, t + WRONG_COOLDOWN);
  };

  // ---- auth: same token as the REST API, students only ----
  nsp.use((socket, next) => {
    const user = services.authenticate(socket.handshake.auth && socket.handshake.auth.token);
    if (!user || user.role !== 'student') return next(new Error('Please sign in as a student.'));
    socket.data.user = user;
    socket.data.token = socket.handshake.auth.token;
    next();
  });

  function randomSpot(world, minFromBoss, minFromNodes) {
    for (let i = 0; i < 100; i++) {
      const p = { x: 40 + Math.random() * (W.w - 80), y: 40 + Math.random() * (W.h - 80) };
      if (dist(p, world.boss) < minFromBoss) continue;
      if (world.nodes.some((n) => dist(n, p) < minFromNodes)) continue;
      return p;
    }
    return { x: 60, y: 60 };
  }

  function spawnNode(world) {
    const types = Object.keys(RESOURCES);
    world.nodes.push({ id: rid(), type: types[Math.floor(Math.random() * types.length)], ...randomSpot(world, 170, 90), claimedBy: null });
  }

  function spawnBoss(world) {
    const hp = Math.max(BOSS.baseHp, BOSS.hpPerPlayer * world.players.size);
    Object.assign(world.boss, { hp, maxHp: hp, alive: true, respawnAt: null, raidId: rid(), contributors: new Set() });
  }

  function getWorld(classId) {
    let w = worlds.get(classId);
    if (!w) {
      w = { classId, players: new Map(), nodes: [], timers: [], boss: { x: W.w / 2, y: W.h / 2 } };
      spawnBoss(w);
      for (let i = 0; i < NODES.count; i++) spawnNode(w);
      worlds.set(classId, w);
    }
    return w;
  }

  // Walking away from (or letting expire) an unanswered question counts as
  // a miss, so leaving and rejoining can't be used to re-roll questions.
  function release(world, p) {
    if (p.challenge) {
      cooldown(p.userId);
      const ch = p.challenge;
      // Record an abandoned/expired challenge as a miss, as documented.
      services.answerQuestion({ user: { id: p.userId }, cls: services.classOf(world.classId), q: ch.q, v: ch.v, instance: ch.instance, submission: {}, servedAt: ch.servedAt, timerSec: CHALLENGE_TTL / 1000, context: 'world' })
        .then(() => services.save()).catch((err) => console.error('[world] could not record abandoned challenge:', err.message));
    }
    if (p.challenge && p.challenge.nodeId) {
      const n = world.nodes.find((x) => x.id === p.challenge.nodeId);
      if (n && n.claimedBy === p.userId) n.claimedBy = null;
    }
    p.challenge = null;
  }

  function leave(socket) {
    const { classId } = socket.data;
    const world = classId && worlds.get(classId);
    if (!world) return;
    const p = world.players.get(socket.id);
    if (p) release(world, p);
    world.players.delete(socket.id);
    socket.leave('class:' + classId);
    socket.data.classId = null;
    if (!world.players.size) {
      world.timers.forEach(clearTimeout);
      worlds.delete(classId); // an empty world resets
    }
  }

  nsp.on('connection', (socket) => {
    const user = socket.data.user;
    const notice = (text) => socket.emit('notice', text);
    // The token is checked at the handshake; re-check before anything that
    // earns rewards, so signing out (or expiry) ends World access too.
    const stillSignedIn = () => {
      if (services.authenticate(socket.data.token)) return true;
      socket.emit('kicked', 'You were signed out. Sign in again to rejoin.');
      socket.disconnect(true);
      return false;
    };
    // async handlers: never let an exception kill the socket or leak details
    const safe = (fn) => async (...args) => {
      try {
        await fn(...args);
      } catch (err) {
        console.error('[world]', err && err.stack);
        notice('Something went wrong. Please try again.');
      }
    };

    socket.on('join', safe((payload) => {
      if (!stillSignedIn()) return;
      const { classId } = payload || {};
      if (typeof classId !== 'string' || !services.isEnrolled(user.id, classId)) return notice('You are not in that class.');
      // One connection per student: a second tab replaces the first. Kick
      // BEFORE fetching the world - kicking the last player deletes it.
      for (const [sid, other] of worlds.get(classId)?.players || []) {
        if (other.userId === user.id && sid !== socket.id) {
          nsp.sockets.get(sid)?.emit('kicked', 'You joined from another tab.');
          nsp.sockets.get(sid)?.disconnect(true);
        }
      }
      leave(socket);
      const world = getWorld(classId);
      const look = services.look(user.id);
      const spot = randomSpot(world, 170, 0);
      world.players.set(socket.id, { socketId: socket.id, userId: user.id, name: user.name, pet: look.pet.emoji, petName: look.pet.name, move: look.pet.move, item: look.item?.emoji || null, ...spot, keys: {}, challenge: null, lastInteract: 0, emote: null });
      socket.data.classId = classId;
      socket.join('class:' + classId);
      world.dirty = true; // make sure the newcomer gets a snapshot even if nothing moved
      socket.emit('welcome', { you: socket.id, arena: { w: W.w, h: W.h }, tile: W.tile, radius: W.radius, boss: { radius: BOSS.radius, range: BOSS.range }, nodeRange: NODES.range, resources: RESOURCES, emotes: EMOTES });
    }));

    socket.on('input', (keys) => {
      const p = worlds.get(socket.data.classId)?.players.get(socket.id);
      if (!p || !keys || typeof keys !== 'object') return;
      p.keys = { up: keys.up === true, down: keys.down === true, left: keys.left === true, right: keys.right === true };
    });

    socket.on('emote', (e) => {
      const p = worlds.get(socket.data.classId)?.players.get(socket.id);
      if (p && EMOTES.includes(e)) p.emote = { e, until: Date.now() + 2500 };
    });

    // Press E near a node or the boss -> get a question
    socket.on('interact', safe(() => {
      if (!stillSignedIn()) return;
      const world = worlds.get(socket.data.classId);
      const p = world?.players.get(socket.id);
      if (!p) return;
      const t = Date.now();
      if (t - p.lastInteract < 500) return;
      p.lastInteract = t;
      if (p.challenge) return socket.emit('challenge', p.challenge.public);
      if (p.grading) return; // previous answer still being graded; its result comes first
      if (t < (cooldowns.get(user.id) || 0)) return notice('Catch your breath for a moment…');

      let kind = null;
      let node = null;
      node = world.nodes.filter((n) => !n.claimedBy && dist(n, p) <= NODES.range).sort((a, b) => dist(a, p) - dist(b, p))[0];
      if (node) kind = 'gather';
      else if (world.boss.alive && dist(world.boss, p) <= BOSS.range) kind = 'attack';
      if (!kind) return notice('Walk up to a resource or the boss, then press E.');

      const cls = services.classOf(world.classId);
      const pick = services.pickChallenge(user, cls);
      if (!pick) return notice('Your class has no auto-graded questions published yet.');
      const id = rid();
      if (node) node.claimedBy = user.id;
      const label = kind === 'gather' ? `Gather ${RESOURCES[node.type].emoji} ${RESOURCES[node.type].name}` : `${p.petName} attacks!`;
      p.challenge = { id, kind, nodeId: node?.id || null, q: pick.q, v: pick.v, instance: pick.instance, servedAt: t, public: { id, kind, label, question: pick.view, ttlMs: CHALLENGE_TTL } };
      socket.emit('challenge', p.challenge.public);
    }));

    socket.on('answer', safe(async (payload) => {
      const { id, submission } = payload || {};
      if (!stillSignedIn()) return;
      const world = worlds.get(socket.data.classId);
      const p = world?.players.get(socket.id);
      if (p?.lastResult?.id === id) return socket.emit('result', p.lastResult);
      if (!p || !p.challenge || p.challenge.id !== id) return;
      const ch = p.challenge;
      p.challenge = null; // one submission per challenge
      const cls = services.classOf(world.classId);
      p.grading = true;
      p.keys = {};
      let result;
      try {
        ({ result } = await services.answerQuestion({ user, cls, q: ch.q, v: ch.v, instance: ch.instance, submission: submission || {}, servedAt: ch.servedAt, timerSec: CHALLENGE_TTL / 1000, context: 'world' }));
      } catch (err) {
        const node = world.nodes.find((n) => n.id === ch.nodeId);
        if (node?.claimedBy === user.id) node.claimedBy = null;
        socket.emit('expired');
        throw err;
      } finally {
        p.grading = false;
      }

      const effect = {};
      if (ch.kind === 'gather') {
        const node = world.nodes.find((n) => n.id === ch.nodeId);
        if (node && node.claimedBy === user.id) {
          if (result.correct) {
            const r = services.grantResources(user.id, { [node.type]: NODES.yield }, 'Gathered in the World', `gather:${node.id}`);
            effect.resources = r.granted;
            effect.capped = r.capped;
            world.nodes.splice(world.nodes.indexOf(node), 1);
            const h = setTimeout(() => {
              world.timers = world.timers.filter((x) => x !== h); // don't let finished timers pile up
              if (worlds.get(world.classId) === world) spawnNode(world);
            }, NODES.respawnMs);
            world.timers.push(h);
          } else node.claimedBy = null;
        }
      } else if (ch.kind === 'attack' && result.correct && world.boss.alive) {
        const b = world.boss;
        b.hp = Math.max(0, b.hp - BOSS.damage);
        b.contributors.add(user.id);
        effect.damage = BOSS.damage;
        nsp.to('class:' + world.classId).emit('hit', { by: p.name, pet: p.pet, move: p.move, dmg: BOSS.damage });
        if (b.hp === 0) {
          b.alive = false;
          b.respawnAt = Date.now() + BOSS.respawnMs;
          const names = [];
          for (const uid of b.contributors) {
            services.award(uid, BOSS.rewardCoins, 'Raid victory: Fog of Confusion', `raid:${b.raidId}:${uid}`);
            services.grantResources(uid, BOSS.rewardRes, 'Raid victory', `raidres:${b.raidId}:${uid}`);
            names.push(services.userName(uid));
            // tell each hero's screen its new totals
            for (const other of world.players.values()) {
              if (other.userId === uid) nsp.sockets.get(other.socketId)?.emit('balances', services.balances(uid));
            }
          }
          nsp.to('class:' + world.classId).emit('raidWon', { heroes: names, coins: BOSS.rewardCoins, resources: BOSS.rewardRes });
        }
      }
      if (!result.correct) cooldown(user.id);
      services.save();
      p.lastResult = { id, kind: ch.kind, ...result, effect, balances: services.balances(user.id) };
      socket.emit('result', p.lastResult);
    }));

    socket.on('leave', () => leave(socket));
    socket.on('disconnect', () => leave(socket));
  });

  // ---------- the world loop: move, expire, respawn, broadcast ----------
  const loop = setInterval(() => {
    const t = Date.now();
    const step = W.speed / W.tickHz;
    for (const world of worlds.values()) {
      for (const p of world.players.values()) {
        const dx = (p.keys.right ? 1 : 0) - (p.keys.left ? 1 : 0);
        const dy = (p.keys.down ? 1 : 0) - (p.keys.up ? 1 : 0);
        if ((dx || dy) && !p.challenge && !p.grading) {
          const len = Math.hypot(dx, dy); // normalise so diagonal isn't faster
          p.x = Math.min(W.w - W.radius, Math.max(W.radius, p.x + (dx / len) * step));
          p.y = Math.min(W.h - W.radius, Math.max(W.radius, p.y + (dy / len) * step));
          // the boss is solid: push players back out of its body
          const d = dist(p, world.boss);
          const min = BOSS.radius + W.radius;
          if (world.boss.alive && d < min && d > 0) {
            p.x = world.boss.x + ((p.x - world.boss.x) / d) * min;
            p.y = world.boss.y + ((p.y - world.boss.y) / d) * min;
          }
        }
        if (p.challenge && t - p.challenge.servedAt > CHALLENGE_TTL + 3000) {
          release(world, p);
          nsp.sockets.get(p.socketId)?.emit('expired');
        }
        if (p.emote && p.emote.until < t) p.emote = null;
      }
      if (!world.boss.alive && world.boss.respawnAt <= t) {
        spawnBoss(world);
        nsp.to('class:' + world.classId).emit('notice', 'The Fog of Confusion has returned!');
      }
      const snapshot = {
        players: [...world.players.values()].map((p) => ({ id: p.socketId, name: p.name, pet: p.pet, item: p.item, x: Math.round(p.x), y: Math.round(p.y), emote: p.emote?.e || null, busy: !!p.challenge })),
        nodes: world.nodes.map((n) => ({ id: n.id, type: n.type, x: Math.round(n.x), y: Math.round(n.y), claimed: !!n.claimedBy })),
        // respawn countdown in whole seconds, so an idle world's snapshot really is unchanged
        boss: { x: world.boss.x, y: world.boss.y, hp: world.boss.hp, maxHp: world.boss.maxHp, alive: world.boss.alive, respawnIn: world.boss.alive ? 0 : Math.ceil(Math.max(0, world.boss.respawnAt - t) / 1000) * 1000 },
      };
      // Nothing moved or changed since the last tick? Don't resend it.
      // (Newcomers still get a snapshot: joining marks the world dirty.)
      const json = JSON.stringify(snapshot);
      if (json === world.lastSnapshot && !world.dirty) continue;
      world.lastSnapshot = json;
      world.dirty = false;
      nsp.to('class:' + world.classId).emit('state', snapshot);
    }
  }, 1000 / W.tickHz);

  return {
    stop: () => {
      clearInterval(loop);
      for (const w of worlds.values()) w.timers.forEach(clearTimeout);
    },
    worlds,
    cooldowns,
  };
}

module.exports = { attachWorld, W, BOSS, NODES };
