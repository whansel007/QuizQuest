// ============================================================
// STUDENT: the multiplayer World (client)
// ------------------------------------------------------------
// The Circle Tag client grown up. Same two loops:
//   input loop  - held keys are sent on change; the server moves you
//   render loop - requestAnimationFrame paints the latest snapshot
// Plus: press E near a resource node or the boss to get a question.
// The question arrives WITHOUT its answer; the server grades it.
// ============================================================

import { S, el, fill, add, toast, heading, main, hooks, fmtBundle, root } from './core.js';
import { home, loadHome, studentClassPicker, resourceBadge, walletBadge, updateBalances } from './student.js';
import { questionForm, resultBlock } from './qui.js';

export async function viewWorld() {
  const main = root(); // this render's own container (see core.js)
  await loadHome();
  // A newer render replaced us while loading (e.g. a double-clicked tab):
  // don't open a socket, key listeners or a render loop nobody can clean up.
  if (!main.isConnected) return;
  if (!S.classId) return add(main, el('p', {}, 'You are not enrolled in any class.'));

  const canvas = el('canvas', { width: 960, height: 576, class: 'world', tabindex: 0, 'aria-label': 'Class world. Move with WASD or arrow keys, press E to interact.' });
  const ctx = canvas.getContext('2d');
  const status = el('span', { class: 'small muted' }, 'Connecting…');
  const panel = el('div', { class: 'panel world-panel' }, el('p', { class: 'muted small' }, 'Walk up to a resource (🪵 💎 🌿) or the boss and press E. Correct answers gather supplies or damage the boss for everyone.'));
  const feed = el('ul', { class: 'feed' });
  const interactBtn = el('button', { class: 'btn primary', onclick: () => socket.connected && socket.emit('interact') }, 'Interact (E)');

  let world = null; // welcome message: arena, ranges, catalog
  let state = { players: [], nodes: [], boss: null };
  let me = null;
  let floaters = []; // floating damage numbers
  const keys = { up: false, down: false, left: false, right: false };

  const log = (text) => {
    feed.prepend(el('li', {}, text));
    while (feed.children.length > 8) feed.lastChild.remove();
  };

  // --- the realtime pipe (token proves who we are; server checks class) ---
  const socket = io('/world', { auth: { token: S.token } }); // eslint-disable-line no-undef
  socket.on('connect', () => {
    status.textContent = 'Joining class…';
    socket.emit('join', { classId: S.classId });
  });
  socket.on('disconnect', () => {
    me = null;
    state = { players: [], nodes: [], boss: null };
    Object.keys(keys).forEach((key) => { keys[key] = false; });
    panel.form?.destroy();
    panel.form = null;
    panel.challengeId = null;
    interactBtn.disabled = true;
    fill(panel, el('p', { class: 'muted small' }, 'Disconnected. Rejoin the World to continue.'));
    if (!status.textContent.includes('signed out') && !status.textContent.includes('another tab')) status.textContent = 'Disconnected. Reconnecting when possible…';
  });
  socket.on('connect_error', (err) => (status.textContent = 'Could not connect: ' + err.message));
  socket.on('welcome', (w) => {
    world = w;
    me = w.you;
    status.textContent = 'Connected. WASD / arrows to move, E to interact.';
    fill(emotes, w.emotes.map((e) => el('button', { class: 'btn small', onclick: () => socket.emit('emote', e), 'aria-label': 'emote ' + e }, e)));
  });
  socket.on('state', (s) => (state = s));
  socket.on('notice', (t) => toast(t));
  socket.on('kicked', (t) => (status.textContent = t));
  socket.on('hit', (h) => {
    log(`${h.pet} ${h.by} used ${h.move}: -${h.dmg}`);
    if (state.boss) floaters.push({ x: state.boss.x + (Math.random() * 40 - 20), y: state.boss.y - 40, text: `-${h.dmg}`, born: performance.now() });
  });
  socket.on('raidWon', (r) => {
    log(`🎉 Raid won by ${r.heroes.join(', ')}!`);
    toast(`Raid victory! Everyone who landed a hit gets ${r.coins} 🪙 + ${fmtBundle(r.resources, home.catalog.resources)}`);
  });
  socket.on('expired', () => {
    panel.form?.destroy();
    panel.form = null;
    fill(panel, el('p', { class: 'muted small' }, 'That question timed out. Press E to try again.'));
  });

  // A question for me: render it with the shared question UI
  socket.on('challenge', (ch) => {
    if (panel.challengeId === ch.id && panel.form) return;
    Object.keys(keys).forEach((key) => { keys[key] = false; });
    socket.emit('input', keys);
    panel.form?.destroy();
    const result = el('div');
    const form = questionForm(ch.question, (submission) => socket.emit('answer', { id: ch.id, submission }));
    fill(panel,
      el('div', { class: 'quiz-head' }, el('b', {}, ch.label), el('span', { class: 'badge plain' }, ch.question.topic)),
      form.node, result);
    panel.result = result;
    panel.form = form;
    panel.challengeId = ch.id;
  });
  socket.on('balances', updateBalances); // e.g. after a raid victory
  socket.on('result', (r) => {
    updateBalances(r.balances);
    if (!panel.form || r.id !== panel.challengeId) return; // a result for a question no longer on screen
    panel.form.showResult(r);
    const extra = r.effect?.resources && Object.keys(r.effect.resources).length
      ? el('div', { class: 'small' }, `Gathered ${fmtBundle(r.effect.resources, home.catalog.resources)}${r.effect.capped ? ' (daily cap reached)' : ''}`)
      : r.effect?.damage ? el('div', { class: 'small' }, `Hit for ${r.effect.damage}!`) : !r.correct ? el('div', { class: 'small muted' }, 'Catch your breath for a few seconds, then try again.') : null;
    fill(panel.result, resultBlock(r, { extra }), el('button', { class: 'btn small', style: 'margin-top:8px', onclick: () => fill(panel, el('p', { class: 'muted small' }, 'Press E near a resource or the boss for another question.')) }, 'Close'));
    panel.form = null;
  });

  // --- input: same mapping as the tag client; ignore typing in inputs ---
  const CODE_TO_KEY = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
  const setKey = (name, pressed) => {
    if (keys[name] === pressed) return;
    keys[name] = pressed;
    if (socket.connected) socket.emit('input', keys);
  };
  const typing = (e) => e.target.closest && e.target.closest('input, textarea, select');
  const onDown = (e) => {
    if (typing(e) || !socket.connected || panel.form) return;
    const name = CODE_TO_KEY[e.code];
    if (name) {
      e.preventDefault();
      setKey(name, true);
    } else if (e.code === 'KeyE' && !e.repeat) socket.emit('interact');
  };
  const onUp = (e) => {
    const name = CODE_TO_KEY[e.code];
    if (name) setKey(name, false);
  };
  const onBlur = () => Object.keys(keys).forEach((k) => setKey(k, false));
  addEventListener('keydown', onDown);
  addEventListener('keyup', onUp);
  addEventListener('blur', onBlur);

  // On-screen D-pad for touch screens
  const pad = (name, label) => el('button', { class: 'btn pad-' + name, 'aria-label': 'move ' + name,
    onpointerdown: (e) => (e.preventDefault(), setKey(name, true)), onpointerup: () => setKey(name, false), onpointerleave: () => setKey(name, false), onpointercancel: () => setKey(name, false) }, label);
  const dpad = el('div', { class: 'dpad' }, pad('up', '▲'), pad('left', '◀'), pad('right', '▶'), pad('down', '▼'));
  const emotes = el('div', { class: 'row' });

  // --- render loop ---
  let raf = 0;
  const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) <= r;
  function draw() {
    raf = requestAnimationFrame(draw);
    const W = canvas.width;
    const H = canvas.height;
    const tile = world?.tile || 48;
    // On a phone the 960px canvas is shown at ~300px; scale text labels up
    // (to a limit) so names and hints stay readable.
    const scale = Math.min(2.5, Math.max(1, W / (canvas.clientWidth || W)));
    const txt = (px) => Math.round(px * scale);
    // checkerboard grass - the grid from Circle Tag, now as terrain
    for (let x = 0; x < W; x += tile) {
      for (let y = 0; y < H; y += tile) {
        ctx.fillStyle = ((x + y) / tile) % 2 ? '#3f7d3a' : '#468a40';
        ctx.fillRect(x, y, tile, tile);
      }
    }
    if (!world) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const self = state.players.find((p) => p.id === me);

    // resource nodes
    for (const n of state.nodes) {
      ctx.globalAlpha = n.claimed ? 0.45 : 1;
      ctx.font = '30px serif';
      ctx.fillText(world.resources[n.type].emoji, n.x, n.y);
      ctx.globalAlpha = 1;
      if (self && !n.claimed && near(self, n, world.nodeRange)) {
        ctx.strokeStyle = '#fff';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.arc(n.x, n.y, 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // the boss
    const b = state.boss;
    if (b) {
      if (b.alive) {
        if (self && near(self, b, world.boss.range)) {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.beginPath();
          ctx.arc(b.x, b.y, world.boss.range, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.font = '84px serif';
        ctx.fillText('👾', b.x, b.y);
        const bw = 140;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(b.x - bw / 2, b.y - 70, bw, 10);
        ctx.fillStyle = '#e5484d';
        ctx.fillRect(b.x - bw / 2, b.y - 70, (bw * b.hp) / b.maxHp, 10);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${txt(12)}px system-ui, sans-serif`;
        ctx.fillText(`Fog of Confusion ${b.hp}/${b.maxHp}`, b.x, b.y - 74 - txt(8));
      } else {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${txt(14)}px system-ui, sans-serif`;
        ctx.fillText(`Boss returns in ${Math.ceil(b.respawnIn / 1000)}s`, b.x, b.y);
      }
    }

    // players
    for (const p of state.players) {
      if (p.id === me) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, world.radius + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.font = '32px serif';
      ctx.fillText(p.pet, p.x, p.y);
      if (p.item) {
        ctx.font = '18px serif';
        ctx.fillText(p.item, p.x, p.y - 22);
      }
      ctx.font = `bold ${txt(12)}px system-ui, sans-serif`;
      ctx.fillStyle = '#fff';
      ctx.fillText(p.name + (p.busy ? ' ✎' : ''), p.x, p.y + 20 + txt(8));
      if (p.emote) {
        ctx.font = '22px serif';
        ctx.fillText(p.emote, p.x + 22, p.y - 26);
      }
    }

    // floating damage numbers
    const t = performance.now();
    floaters = floaters.filter((f) => t - f.born < 900);
    for (const f of floaters) {
      const k = (t - f.born) / 900;
      ctx.globalAlpha = 1 - k;
      ctx.fillStyle = '#ffd166';
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.fillText(f.text, f.x, f.y - k * 40);
      ctx.globalAlpha = 1;
    }

    // context hint
    if (self) {
      const nodeNear = state.nodes.some((n) => !n.claimed && near(self, n, world.nodeRange));
      const bossNear = b?.alive && near(self, b, world.boss.range);
      const hint = nodeNear ? 'Press E to gather' : bossNear ? 'Press E to attack' : '';
      if (interactBtn.disabled !== (!hint || !!panel.form)) interactBtn.disabled = !hint || !!panel.form; // DOM write only on change
      if (hint) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(W / 2 - txt(90), H - txt(40), txt(180), txt(28));
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${txt(14)}px system-ui, sans-serif`;
        ctx.fillText(hint, W / 2, H - txt(26));
      }
    }
  }
  draw();

  // Leaving the tab: stop everything this view started
  hooks.cleanup = () => {
    panel.form?.destroy();
    cancelAnimationFrame(raf);
    removeEventListener('keydown', onDown);
    removeEventListener('keyup', onUp);
    removeEventListener('blur', onBlur);
    socket.disconnect();
  };

  add(main,
    heading('World', studentClassPicker(), walletBadge(), resourceBadge()),
    el('div', { class: 'row top world-wrap' },
      el('div', { class: 'grow', style: 'min-width:min(300px, 100%)' },
        canvas,
        el('div', { class: 'row', style: 'margin-top:8px' }, status),
        el('div', { class: 'row', style: 'margin-top:8px;justify-content:space-between' }, dpad, el('div', {}, interactBtn, el('div', { style: 'margin-top:8px' }, emotes)))),
      el('div', { class: 'world-side' },
        panel,
        el('div', { class: 'panel' }, el('h3', {}, 'Happening now'), feed),
        el('p', { class: 'small muted' }, 'Everyone here is in your class. Co-op only: answer correctly near the boss to help defeat it together. Coins follow the usual rules (first correct answer per question, daily cap).'))));
}
