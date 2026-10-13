// ============================================================
// Password hashing for email + password sign-in
// ------------------------------------------------------------
// scrypt from node:crypto, so no extra dependency. A stored hash is
// "scrypt$<salt hex>$<hash hex>". Only the hash is ever stored; the
// API strips it from every user object it sends to the browser.
//
// Demo accounts: every seeded user gets an email and the shared
// password DEMO_PASSWORD. The demo hash is computed once per process
// (scrypt is deliberately slow and tests build many databases).
// ============================================================

const crypto = require('crypto');

const KEY_LEN = 32;
const PASSWORD_MAX = 200; // scrypt of a huge string is a cheap DoS
const DEMO_PASSWORD = 'quizquest';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string' || password.length > PASSWORD_MAX) return false;
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// A hash to compare against when the email is unknown, so a wrong email
// takes as long as a wrong password (no probing which emails exist)
let dummy = null;
const dummyHash = () => (dummy ||= hashPassword(crypto.randomBytes(16).toString('hex')));

let demo = null;
const demoHash = () => (demo ||= hashPassword(DEMO_PASSWORD));

// Seeded ids -> readable demo emails: t-a -> prof.a@..., s-01 -> student01@...
function demoEmail(user) {
  const tail = user.id.replace(/^[ts]-/, '');
  return (user.role === 'teacher' ? `prof.${tail}` : `student${tail}`) + '@quizquest.demo';
}

// Give users created before passwords existed (older data/db.json files,
// an existing Supabase project) a demo email and password. Returns true
// if anything changed, so the caller can save.
function ensureDemoCredentials(users) {
  let changed = false;
  for (const u of users) {
    if (u.email && u.passwordHash) continue;
    u.email ||= demoEmail(u);
    u.passwordHash ||= demoHash();
    changed = true;
  }
  return changed;
}

const normEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

module.exports = { PASSWORD_MAX, DEMO_PASSWORD, hashPassword, verifyPassword, dummyHash, ensureDemoCredentials, normEmail };
