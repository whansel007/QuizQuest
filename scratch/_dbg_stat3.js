const { start } = require('../server');
(async () => {
  const server = start(0, { dataFile: null });
  await new Promise((r) => server.httpServer.once('listening', r));
  const rooms = server.heroLab.rooms;
  const room = rooms.getDefaultRoom();
  const { io: connect } = require('socket.io-client');
  const BASE = `http://127.0.0.1:${server.httpServer.address().port}`;
  const socket = connect(`${BASE}/hero-lab`, { transports: ['websocket'] });
  socket.on('connect', () => socket.emit('join', { heroId: 'pilot', create: true }));
  socket.once('welcome', async () => {
    const player = [...room.players.values()][0];
    const hero = player.hero;
    let proto = Object.getPrototypeOf(hero);
    const chain = [];
    while (proto && proto !== Object.prototype) {
      const d = Object.getOwnPropertyDescriptor(proto, 'attack');
      chain.push({ name: proto.constructor?.name, attack: d ? (d.get ? 'getter' : 'value') : null, set: d ? Boolean(d.set) : null });
      proto = Object.getPrototypeOf(proto);
    }
    console.log('own descriptor:', JSON.stringify(Object.getOwnPropertyDescriptor(hero, 'attack')));
    console.log('prototype chain:', JSON.stringify(chain));
    hero.attack = 13.2;
    console.log('after assign:', hero.attack);
    await new Promise((r) => setTimeout(r, 300));
    console.log('after 300ms:', hero.attack);
    socket.disconnect(); server.io.close(); server.httpServer.close(); process.exit(0);
  });
})().catch((e) => { console.error(e); process.exit(1); });
