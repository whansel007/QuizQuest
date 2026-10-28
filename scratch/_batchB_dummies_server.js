const { io: connect } = require('socket.io-client');
const { start } = require('../server');
const assert = require('assert/strict');

const server = start(0, { dataFile: null });
server.httpServer.once('listening', async () => {
  const base = `http://localhost:${server.httpServer.address().port}`;
  const socket = connect(`${base}/hero-lab`, { transports: ['websocket'] });

  socket.on('connect', () => {
    socket.emit('join', { heroId: 'electromancer', create: true });
  });

  socket.on('welcome', (welcome) => {
    setTimeout(() => {
      const room = server.heroLab.rooms.findByCode(welcome.room.code);
      const dummies = [...room.monsters.values()].filter((m) => m.isDummy);
      console.log('dummy count:', dummies.length);
      assert.equal(dummies.length, 4, 'expected 4 dummies');

      // Cluster checks.
      for (const d of dummies) {
        const dist = Math.hypot(d.x - room.campfire.x, d.y - room.campfire.y);
        assert.ok(dist >= 180 && dist <= 320, `dummy ${d.id} distance ${dist} not in 180-320`);
      }

      // Spacing checks.
      for (let i = 0; i < dummies.length; i++) {
        const a = dummies[i];
        let min = Infinity;
        for (let j = 0; j < dummies.length; j++) {
          if (i === j) continue;
          const b = dummies[j];
          min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y));
        }
        assert.ok(min >= 60, `dummy ${a.id} closest neighbour ${min} < 60`);
        assert.ok(min <= 120, `dummy ${a.id} closest neighbour ${min} > 120`);
      }

      // Hero distance.
      const player = room.players.get(welcome.you);
      for (const d of dummies) {
        const dist = Math.hypot(d.x - player.x, d.y - player.y);
        assert.ok(dist >= 80, `dummy ${d.id} too close to hero ${dist}`);
      }

      // Chain Lightning: should be able to hit all 4 dummies.
      socket.emit('ultimate');
      setTimeout(() => {
        const after = [...room.monsters.values()].filter((m) => m.isDummy);
        console.log('after chain:', after.map((m) => ({ id: m.id, hp: m.hp })));
        // All dummies should have taken damage (hp < 300) and none died.
        assert.ok(after.length === 4 && after.every((m) => m.hp < 300 && m.hp > 0), 'all 4 dummies hit by chain');
        socket.disconnect();
        server.io.close();
        server.httpServer.close();
        console.log('ALL DUMMY CHECKS PASSED');
      }, 600);
    }, 800);
  });
});
