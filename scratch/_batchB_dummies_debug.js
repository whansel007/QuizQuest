const { io: connect } = require('socket.io-client');
const { start } = require('../server');

const server = start(0, { dataFile: null });
server.httpServer.once('listening', async () => {
  const base = `http://localhost:${server.httpServer.address().port}`;
  const socket = connect(`${base}/hero-lab`, { transports: ['websocket'] });
  socket.on('connect', () => {
    console.log('connected');
    socket.emit('join', { heroId: 'sheriff', create: true });
  });

  socket.on('welcome', (welcome) => {
    console.log('welcome, room', welcome.room.code);
    const room = server.heroLab.rooms.findByCode(welcome.room.code);
    setTimeout(() => {
      console.log('initial dummies:', room.dummyCount(), 'monsters:', [...room.monsters.values()].filter(m => m.isDummy).length);
      const dummy = [...room.monsters.values()].find((m) => m.isDummy);
      dummy.hp = 1;
      const player = room.players.get(welcome.you);
      player.x = dummy.x - 90;
      player.y = dummy.y;
      player.aim = { x: 1, y: 0 };
      player.hero.aim = { x: 1, y: 0 };
      socket.emit('fire', 'primary');
      console.log('fired at dummy');
    }, 500);

    socket.on('dummy_broken', () => {
      const room2 = server.heroLab.rooms.findByCode(welcome.room.code);
      console.log('dummy broken. liveDummyCount:', room2.dummyCount(), 'monsters:', [...room2.monsters.values()].filter(m => m.isDummy).length);
      setTimeout(() => {
        const room3 = server.heroLab.rooms.findByCode(welcome.room.code);
        console.log('after 3.5s: liveDummyCount:', room3.dummyCount(), 'monsters:', [...room3.monsters.values()].filter(m => m.isDummy).length);
        socket.disconnect();
        server.io.close();
        server.httpServer.close();
      }, 3500);
    });
  });
});
