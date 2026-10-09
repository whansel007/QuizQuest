// ============================================================
// Later-stage gamification: resources, kingdoms, trading and
// (optional) participation points
// ------------------------------------------------------------
// Same rules as coins: everything is computed on the server, every
// grant has a unique refKey (no double pays), and earning is capped
// per day. Resources and buildings are cosmetic: no cash value and
// no academic value. Participation points are the one exception: they
// are OFF unless a professor turns them on for a class, and they count
// completed practice, never correctness.
// ============================================================

const crypto = require('crypto');
const { inventory } = require('./rewards');
// local days/weeks (app time zone, Singapore by default), not UTC
const { dayKey, weekKey } = require('./time');

const RESOURCES = {
  wood: { name: 'Wood', emoji: '🪵' },
  crystal: { name: 'Crystal', emoji: '💎' },
  herb: { name: 'Herb', emoji: '🌿' },
};
const RESOURCE_DAILY_CAP = 60; // units earned per local day (see time.js)

// Each building has 3 levels; cost of reaching level 1, 2, 3
const BUILDINGS = {
  library: { name: 'Library', emoji: '📚', costs: [{ wood: 5 }, { wood: 8, crystal: 3 }, { wood: 12, crystal: 6, herb: 4 }] },
  workshop: { name: 'Workshop', emoji: '🛠️', costs: [{ wood: 6 }, { wood: 8, herb: 3 }, { wood: 10, crystal: 5, herb: 5 }] },
  garden: { name: 'Garden', emoji: '🌷', costs: [{ herb: 5 }, { herb: 8, wood: 3 }, { herb: 12, crystal: 4, wood: 4 }] },
  tower: { name: 'Tower', emoji: '🗼', costs: [{ crystal: 4 }, { crystal: 7, wood: 4 }, { crystal: 10, wood: 6, herb: 6 }] },
};

const TRADE = { maxOpenPerStudent: 3, maxUnitsPerSide: 20, maxCompletedPerDay: 5 };
const PARTICIPATION = { minQuestions: 5, weeklyCap: 3 };

const newId = (p) => p + '-' + crypto.randomUUID().slice(0, 8);
function resources(db, studentId) {
  const inv = inventory(db, studentId);
  inv.resources = inv.resources || { wood: 0, crystal: 0, herb: 0 };
  return inv.resources;
}

// Validate an untrusted {wood: n, ...} object
function bundle(raw, { min = 1, max = TRADE.maxUnitsPerSide } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  let total = 0;
  for (const [k, v] of Object.entries(raw)) {
    // own keys only: "__proto__" / "constructor" must not count as resources
    if (!Object.hasOwn(RESOURCES, k)) return null;
    if (!Number.isInteger(v) || v < 0) return null;
    if (v > 0) out[k] = v;
    total += v;
  }
  return total >= min && total <= max ? out : null;
}

const has = (res, b) => Object.entries(b).every(([k, v]) => (res[k] || 0) >= v);
function apply(res, b, sign) {
  for (const [k, v] of Object.entries(b)) res[k] = (res[k] || 0) + sign * v;
}
function log(db, studentId, kind, delta, reason, refKey, at) {
  db.resourceLog.push({ id: newId('rl'), studentId, kind, delta, reason, refKey, at });
}

function earnedToday(db, studentId, now) {
  const d = dayKey(now);
  let n = 0;
  for (const e of db.resourceLog) {
    if (e.studentId === studentId && e.kind === 'earn' && dayKey(e.at) === d) n += Object.values(e.delta).reduce((a, b) => a + b, 0);
  }
  return n;
}

// Grant resources, capped per day, once per refKey. Returns the granted bundle.
function grantResources(db, studentId, b, reason, refKey, now = Date.now()) {
  if (db.resourceLog.some((e) => e.refKey === refKey)) return { granted: {}, duplicate: true };
  let room = Math.max(0, RESOURCE_DAILY_CAP - earnedToday(db, studentId, now));
  const granted = {};
  for (const [k, v] of Object.entries(b)) {
    const g = Math.min(v, room);
    if (g > 0) granted[k] = g;
    room -= g;
  }
  apply(resources(db, studentId), granted, 1);
  log(db, studentId, 'earn', granted, reason, refKey, now);
  return { granted, capped: Object.values(granted).reduce((a, x) => a + x, 0) < Object.values(b).reduce((a, x) => a + x, 0) };
}

// ---------------- kingdom ----------------
function kingdom(db, studentId) {
  let k = db.kingdoms.find((x) => x.studentId === studentId);
  if (!k) {
    k = { studentId, buildings: Object.fromEntries(Object.keys(BUILDINGS).map((b) => [b, 0])) };
    db.kingdoms.push(k);
  }
  return k;
}
const castleLevel = (k) => Math.min(...Object.values(k.buildings)); // castle grows when every building does

function build(db, studentId, buildingId, requestId, now = Date.now()) {
  const refKey = `build:${studentId}:${requestId}`;
  const k = kingdom(db, studentId);
  if (db.resourceLog.some((e) => e.refKey === refKey)) return { ok: true, duplicate: true, kingdom: k };
  if (typeof buildingId !== 'string' || !Object.hasOwn(BUILDINGS, buildingId)) return { ok: false, error: 'Unknown building.' };
  const def = BUILDINGS[buildingId];
  const level = k.buildings[buildingId];
  if (level >= def.costs.length) return { ok: false, error: `${def.name} is already at max level.` };
  const cost = def.costs[level];
  const res = resources(db, studentId);
  if (!has(res, cost)) return { ok: false, error: 'Not enough resources.' };
  apply(res, cost, -1);
  k.buildings[buildingId] = level + 1;
  log(db, studentId, 'spend', Object.fromEntries(Object.entries(cost).map(([r, v]) => [r, -v])), `Built ${def.name} level ${level + 1}`, refKey, now);
  return { ok: true, kingdom: k };
}

// ---------------- trading ----------------
// Offers are posted to the whole class (no targeting a specific
// classmate). The offered resources are held in escrow so they can't
// be spent twice, and are refunded on cancel.
function createTrade(db, { cls, studentId, give, want, now = Date.now() }) {
  if (!cls.settings.tradingEnabled) return { ok: false, error: 'Trading is turned off for this class.' };
  const g = bundle(give);
  const w = bundle(want);
  if (!g || !w) return { ok: false, error: `Each side must be 1-${TRADE.maxUnitsPerSide} resources.` };
  const open = db.trades.filter((t) => t.fromId === studentId && t.status === 'open').length;
  if (open >= TRADE.maxOpenPerStudent) return { ok: false, error: `You can have at most ${TRADE.maxOpenPerStudent} open offers.` };
  const res = resources(db, studentId);
  if (!has(res, g)) return { ok: false, error: 'You do not have those resources.' };
  const trade = { id: newId('tr'), classId: cls.id, fromId: studentId, give: g, want: w, status: 'open', createdAt: now };
  apply(res, g, -1);
  log(db, studentId, 'escrow', Object.fromEntries(Object.entries(g).map(([k, v]) => [k, -v])), 'Trade offer (held)', `escrow:${trade.id}`, now);
  db.trades.push(trade);
  return { ok: true, trade };
}

function completedToday(db, studentId, now) {
  const d = dayKey(now);
  return db.trades.filter((t) => t.status === 'accepted' && dayKey(t.acceptedAt) === d && (t.fromId === studentId || t.acceptedBy === studentId)).length;
}

function acceptTrade(db, { cls, trade, studentId, now = Date.now() }) {
  if (!cls.settings.tradingEnabled) return { ok: false, error: 'Trading is turned off for this class.' };
  if (trade.status !== 'open') return { ok: false, error: 'This offer is no longer open.' };
  if (trade.fromId === studentId) return { ok: false, error: 'You cannot accept your own offer.' };
  for (const who of [studentId, trade.fromId]) {
    if (completedToday(db, who, now) >= TRADE.maxCompletedPerDay) return { ok: false, error: 'Daily trade limit reached. Try again tomorrow.' };
  }
  const mine = resources(db, studentId);
  if (!has(mine, trade.want)) return { ok: false, error: 'You do not have what they want.' };
  apply(mine, trade.want, -1);
  apply(mine, trade.give, 1);
  apply(resources(db, trade.fromId), trade.want, 1);
  trade.status = 'accepted';
  trade.acceptedBy = studentId;
  trade.acceptedAt = now;
  const net = {}; // acceptor's change: + what they got, - what they paid
  for (const [k, v] of Object.entries(trade.give)) net[k] = (net[k] || 0) + v;
  for (const [k, v] of Object.entries(trade.want)) net[k] = (net[k] || 0) - v;
  log(db, studentId, 'trade', net, 'Trade completed', `trade:${trade.id}:b`, now);
  log(db, trade.fromId, 'trade', trade.want, 'Trade completed', `trade:${trade.id}:a`, now);
  return { ok: true, trade };
}

function cancelTrade(db, { trade, reason = 'Trade offer cancelled', now = Date.now() }) {
  if (trade.status !== 'open') return { ok: false, error: 'This offer is no longer open.' };
  apply(resources(db, trade.fromId), trade.give, 1);
  trade.status = 'cancelled';
  trade.closedAt = now;
  log(db, trade.fromId, 'refund', trade.give, reason, `refund:${trade.id}`, now);
  return { ok: true, trade };
}

// ---------------- participation points (opt-in per class) ----------------
function awardParticipation(db, { cls, studentId, session, now = Date.now() }) {
  if (!cls.settings.participation?.enabled) return null;
  if (session.items.length < PARTICIPATION.minQuestions) return null;
  if (db.participation.some((p) => p.sessionId === session.id)) return null;
  const wk = weekKey(now);
  const thisWeek = db.participation.filter((p) => p.studentId === studentId && p.classId === cls.id && p.week === wk).length;
  if (thisWeek >= PARTICIPATION.weeklyCap) return { capped: true };
  db.participation.push({ id: newId('pp'), studentId, classId: cls.id, sessionId: session.id, week: wk, at: now });
  return { point: 1 };
}

module.exports = { RESOURCES, BUILDINGS, TRADE, PARTICIPATION, RESOURCE_DAILY_CAP, resources, bundle, grantResources, earnedToday, kingdom, castleLevel, build, createTrade, acceptTrade, cancelTrade, awardParticipation, weekKey };
