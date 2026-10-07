<script setup>
// ============================================================
// STUDENT: the multiplayer World (client)
// ------------------------------------------------------------
// The Circle Tag client grown up. Same two loops:
//   input loop  - held keys are sent on change; the server moves you
//   render loop - requestAnimationFrame paints the latest snapshot
// Plus: press E near a resource node or the boss to get a question.
// The question arrives WITHOUT its answer; the server grades it.
// ============================================================
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { io } from 'socket.io-client';
import { S } from '../api.js';
import { toast, fmtBundle } from '../ui.js';
import Heading from '../components/Heading.vue';
import { store, loadHome, updateBalances } from './home.js';
import ClassPicker from './ClassPicker.vue';
import WalletBadge from './WalletBadge.vue';
import ResourceBadge from './ResourceBadge.vue';
import QuestionForm from './QuestionForm.vue';
import ResultBlock from './ResultBlock.vue';

const error = ref('');
const loaded = ref(false);
const canvas = ref(null);
const status = ref('Connecting…');
const feed = ref([]); // newest first, max 8
const emotes = ref([]);
const interactDisabled = ref(false);
// the side panel: intro text, a question, or a message
const panelMsg = ref('Walk up to a resource (🪵 💎 🌿) or the boss and press E. Correct answers gather supplies or damage the boss for everyone.');
const challenge = ref(null); // { id, label, question, result: null | { r, extra } }
const challengeKey = ref(0);
const form = ref(null);

let alive = true;
let socket = null;
let formActive = false; // a question is on screen and not yet answered
let challengeId = null;
let world = null; // welcome message: arena, ranges, catalog
let state = { players: [], nodes: [], boss: null };
let me = null;
let floaters = []; // floating damage numbers
let raf = 0;
let feedSeq = 0;
const keys = { up: false, down: false, left: false, right: false };

const log = (text) => {
  feed.value = [{ id: ++feedSeq, text }, ...feed.value].slice(0, 8);
};
function showMessage(text) {
  form.value?.destroy();
  formActive = false;
  challenge.value = null;
  panelMsg.value = text;
}
const releaseKeys = () => Object.keys(keys).forEach((key) => { keys[key] = false; });

// --- input: same mapping as the tag client; ignore typing in inputs ---
const CODE_TO_KEY = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
const setKey = (name, pressed) => {
  if (keys[name] === pressed) return;
  keys[name] = pressed;
  if (socket?.connected) socket.emit('input', keys);
};
const typing = (e) => e.target.closest && e.target.closest('input, textarea, select');
const onDown = (e) => {
  if (typing(e) || !socket?.connected || formActive) return;
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
const interact = () => socket?.connected && socket.emit('interact');
const emote = (e) => socket?.emit('emote', e);
const PADS = [['up', '▲'], ['left', '◀'], ['right', '▶'], ['down', '▼']];
function padDown(e, name) {
  e.preventDefault();
  setKey(name, true);
}

function connect() {
  // --- the realtime pipe (token proves who we are; server checks class) ---
  socket = io('/world', { auth: { token: S.token } });
  socket.on('connect', () => {
    status.value = 'Joining class…';
    socket.emit('join', { classId: S.classId });
  });
  socket.on('disconnect', () => {
    me = null;
    state = { players: [], nodes: [], boss: null };
    releaseKeys();
    challengeId = null;
    interactDisabled.value = true;
    showMessage('Disconnected. Rejoin the World to continue.');
    if (!status.value.includes('signed out') && !status.value.includes('another tab')) status.value = 'Disconnected. Reconnecting when possible…';
  });
  socket.on('connect_error', (err) => (status.value = 'Could not connect: ' + err.message));
  socket.on('welcome', (w) => {
    world = w;
    me = w.you;
    status.value = 'Connected. WASD / arrows to move, E to interact.';
    emotes.value = w.emotes;
  });
  socket.on('state', (s) => (state = s));
  socket.on('notice', (t) => toast(t));
  socket.on('kicked', (t) => (status.value = t));
  socket.on('hit', (h) => {
    log(`${h.pet} ${h.by} used ${h.move}: -${h.dmg}`);
    if (state.boss) floaters.push({ x: state.boss.x + (Math.random() * 40 - 20), y: state.boss.y - 40, text: `-${h.dmg}`, born: performance.now() });
  });
  socket.on('raidWon', (r) => {
    log(`🎉 Raid won by ${r.heroes.join(', ')}!`);
    toast(`Raid victory! Everyone who landed a hit gets ${r.coins} 🪙 + ${fmtBundle(r.resources, store.home.catalog.resources)}`);
  });
  socket.on('expired', () => showMessage('That question timed out. Press E to try again.'));

  // A question for me: render it with the shared question UI
  socket.on('challenge', (ch) => {
    if (challengeId === ch.id && formActive) return; // duplicate interact
    releaseKeys();
    socket.emit('input', keys);
    form.value?.destroy();
    challenge.value = { id: ch.id, label: ch.label, question: ch.question, result: null };
    challengeKey.value++;
    formActive = true;
    challengeId = ch.id;
  });
  socket.on('balances', updateBalances); // e.g. after a raid victory
  socket.on('result', (r) => {
    updateBalances(r.balances);
    if (!formActive || r.id !== challengeId || !challenge.value) return; // a result for a question no longer on screen
    form.value?.showResult(r);
    const fx = r.effect;
    const extra = fx?.resources && Object.keys(fx.resources).length
      ? { cls: 'small', text: `Gathered ${fmtBundle(fx.resources, store.home.catalog.resources)}${fx.capped ? ' (daily cap reached)' : ''}` }
      : fx?.damage ? { cls: 'small', text: `Hit for ${fx.damage}!` } : !r.correct ? { cls: 'small muted', text: 'Catch your breath for a few seconds, then try again.' } : null;
    challenge.value.result = { r, extra };
    formActive = false;
  });
}
const answer = (id) => (submission) => socket.emit('answer', { id, submission });
const closeResult = () => showMessage('Press E near a resource or the boss for another question.');

// --- render loop ---
const near = (a, b, r) => Math.hypot(a.x - b.x, a.y - b.y) <= r;
function draw() {
  raf = requestAnimationFrame(draw);
  const cv = canvas.value;
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width;
  const H = cv.height;
  const tile = world?.tile || 48;
  // On a phone the 960px canvas is shown at ~300px; scale text labels up
  // (to a limit) so names and hints stay readable.
  const scale = Math.min(2.5, Math.max(1, W / (cv.clientWidth || W)));
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
    interactDisabled.value = !hint || formActive; // no re-render unless it changes
    if (hint) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(W / 2 - txt(90), H - txt(40), txt(180), txt(28));
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${txt(14)}px system-ui, sans-serif`;
      ctx.fillText(hint, W / 2, H - txt(26));
    }
  }
}

onMounted(async () => {
  try {
    await loadHome();
  } catch (err) {
    if (alive) error.value = err.message;
    return;
  }
  // Left the tab while loading: don't open a socket, key listeners or a
  // render loop nobody can clean up.
  if (!alive) return;
  loaded.value = true;
  if (!S.classId) return;
  await nextTick();
  if (!alive) return;
  connect();
  addEventListener('keydown', onDown);
  addEventListener('keyup', onUp);
  addEventListener('blur', onBlur);
  draw();
});

// Leaving the tab: stop everything this view started
onUnmounted(() => {
  alive = false;
  form.value?.destroy();
  cancelAnimationFrame(raf);
  removeEventListener('keydown', onDown);
  removeEventListener('keyup', onUp);
  removeEventListener('blur', onBlur);
  socket?.disconnect();
});
</script>

<template>
  <div v-if="error" class="note bad">{{ error }}</div>
  <template v-else-if="loaded">
    <p v-if="!S.classId">You are not enrolled in any class.</p>
    <template v-else>
      <Heading title="World"><ClassPicker /><WalletBadge /><ResourceBadge /></Heading>
      <div class="row top world-wrap">
        <div class="grow" style="min-width: min(300px, 100%)">
          <canvas ref="canvas" width="960" height="576" class="world" tabindex="0" aria-label="Class world. Move with WASD or arrow keys, press E to interact."></canvas>
          <div class="row" style="margin-top: 8px"><span class="small muted">{{ status }}</span></div>
          <div class="row" style="margin-top: 8px; justify-content: space-between">
            <div class="dpad">
              <button v-for="[name, label] in PADS" :key="name" class="btn" :class="'pad-' + name" :aria-label="'move ' + name" @pointerdown="padDown($event, name)" @pointerup="setKey(name, false)" @pointerleave="setKey(name, false)" @pointercancel="setKey(name, false)">{{ label }}</button>
            </div>
            <div>
              <button class="btn primary" :disabled="interactDisabled" @click="interact">Interact (E)</button>
              <div style="margin-top: 8px">
                <div class="row">
                  <button v-for="e in emotes" :key="e" class="btn small" :aria-label="'emote ' + e" @click="emote(e)">{{ e }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="world-side">
          <div class="panel world-panel">
            <template v-if="challenge">
              <div class="quiz-head"><b>{{ challenge.label }}</b><span class="badge plain">{{ challenge.question.topic }}</span></div>
              <QuestionForm :key="challengeKey" ref="form" :q="challenge.question" :submit="answer(challenge.id)" />
              <div v-if="challenge.result">
                <ResultBlock :r="challenge.result.r">
                  <div v-if="challenge.result.extra" :class="challenge.result.extra.cls">{{ challenge.result.extra.text }}</div>
                </ResultBlock>
                <button class="btn small" style="margin-top: 8px" @click="closeResult">Close</button>
              </div>
            </template>
            <p v-else class="muted small">{{ panelMsg }}</p>
          </div>
          <div class="panel">
            <h3>Happening now</h3>
            <ul class="feed">
              <li v-for="f in feed" :key="f.id">{{ f.text }}</li>
            </ul>
          </div>
          <p class="small muted">Everyone here is in your class. Co-op only: answer correctly near the boss to help defeat it together. Coins follow the usual rules (first correct answer per question, daily cap).</p>
        </div>
      </div>
    </template>
  </template>
</template>
