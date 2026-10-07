// ============================================================
// Rewards, wallet and pets
// ------------------------------------------------------------
// Everything that changes a student's coins happens HERE, on the
// server. The browser never says "give me 10 coins" - it submits an
// answer, and the server decides whether that answer earns anything.
//
// Anti-farming rules:
//   - coins for a correct answer are paid ONCE per question, ever
//     (repeating an easy question earns nothing after the first time)
//   - every ledger entry has a unique refKey; the same refKey can never
//     be paid twice (protects against double-submits / retries)
//   - a daily cap limits total earned coins
// Coins have no cash or academic value.
// ============================================================

const crypto = require('crypto');

const REWARDS = {
  firstCorrect: 10,       // first time a student gets a given question right
  sessionComplete: 20,    // finishing every question in a session...
  minSessionForBonus: 5,  // ...that has at least this many questions
  milestone: 30,          // topic practice indicator reaches the target (once per topic)
  milestoneAccuracy: 0.8,
  milestoneMinN: 5,
  dailyCap: 150,          // max coins EARNED per UTC day (purchases don't count)
  eggCost: 50,
  duplicateRefund: 20,    // drawing a pet you already own refunds this much
};

// The pet collection. Starter is free; commons can be bought directly;
// rares and epics only come from eggs whose odds are disclosed below.
const PETS = [
  { id: 'chick', name: 'Chick', emoji: '🐣', rarity: 'starter', move: 'Peck' },
  { id: 'fox', name: 'Fox', emoji: '🦊', rarity: 'common', price: 60, move: 'Pounce' },
  { id: 'turtle', name: 'Turtle', emoji: '🐢', rarity: 'common', price: 60, move: 'Shell Bash' },
  { id: 'owl', name: 'Owl', emoji: '🦉', rarity: 'rare', move: 'Wise Gust' },
  { id: 'octopus', name: 'Octopus', emoji: '🐙', rarity: 'rare', move: 'Ink Splash' },
  { id: 'dragon', name: 'Dragon', emoji: '🐉', rarity: 'epic', move: 'Fire Breath' },
  { id: 'unicorn', name: 'Unicorn', emoji: '🦄', rarity: 'epic', move: 'Rainbow Beam' },
];
const ITEMS = [
  { id: 'tophat', name: 'Top hat', emoji: '🎩', price: 40 },
  { id: 'crown', name: 'Crown', emoji: '👑', price: 90 },
  { id: 'shades', name: 'Sunglasses', emoji: '🕶️', price: 40 },
];
// Disclosed to students before they spend anything. Out of 1000.
const EGG_ODDS = { common: 600, rare: 300, epic: 100 };

const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

function balance(db, studentId) {
  let total = 0;
  for (const t of db.ledger) if (t.studentId === studentId) total += t.amount;
  return total;
}

function earnedOnDay(db, studentId, when) {
  const d = dayKey(when);
  let total = 0;
  for (const t of db.ledger) {
    if (t.studentId === studentId && t.kind === 'earn' && dayKey(t.at) === d) total += t.amount;
  }
  return total;
}

// Pay out coins, respecting refKey uniqueness and the daily cap.
// Returns { granted, capped, duplicate }.
function award(db, studentId, amount, reason, refKey, now = Date.now()) {
  if (db.ledger.some((t) => t.refKey === refKey)) return { granted: 0, capped: false, duplicate: true };
  const room = Math.max(0, REWARDS.dailyCap - earnedOnDay(db, studentId, now));
  const granted = Math.min(amount, room);
  // Still record a zero-value entry so the refKey is "used" and an
  // explanation shows up in the student's history.
  db.ledger.push({ id: 'tx-' + crypto.randomUUID().slice(0, 8), studentId, kind: 'earn', amount: granted, reason: granted < amount ? reason + ' (daily cap reached)' : reason, refKey, at: now });
  return { granted, capped: granted < amount, duplicate: false };
}

// Spend coins. requestId comes from the client so a double-click on
// "Buy" can't charge twice: same requestId = same purchase.
function spend(db, studentId, amount, reason, refKey, now = Date.now()) {
  const prev = db.ledger.find((t) => t.refKey === refKey);
  if (prev) return { ok: true, duplicate: true };
  if (balance(db, studentId) < amount) return { ok: false, error: 'Not enough coins.' };
  db.ledger.push({ id: 'tx-' + crypto.randomUUID().slice(0, 8), studentId, kind: 'spend', amount: -amount, reason, refKey, at: now });
  return { ok: true, duplicate: false };
}

function inventory(db, studentId) {
  let inv = db.inventory.find((i) => i.studentId === studentId);
  if (!inv) {
    inv = { studentId, pets: [{ id: 'chick', dupes: 0 }], items: [], equippedPet: 'chick', equippedItem: null };
    db.inventory.push(inv);
  }
  return inv;
}

// Random rarity from the disclosed odds, then a uniform pick inside it.
function drawPet(rand = (n) => crypto.randomInt(n)) {
  let roll = rand(1000);
  let rarity = 'epic';
  for (const [r, weight] of Object.entries(EGG_ODDS)) {
    if (roll < weight) {
      rarity = r;
      break;
    }
    roll -= weight;
  }
  const pool = PETS.filter((p) => p.rarity === rarity);
  return pool[rand(pool.length)];
}

module.exports = { REWARDS, PETS, ITEMS, EGG_ODDS, balance, earnedOnDay, award, spend, inventory, drawPet };
