// ============================================================
// Tiny JSON-file store
// ------------------------------------------------------------
// Stand-in for the Supabase database in the proposal. The whole DB is
// one object in memory, written to disk after each change. Fine for a
// single-process demo; NOT for production (no concurrency, no row-level
// security - access rules are enforced in api.js instead).
// Pass file = null for a purely in-memory store (used by tests).
// ============================================================

const fs = require('fs');
const path = require('path');
const { seed } = require('./seed');

function createStore(file) {
  let db = null;
  if (file && fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
  } else {
    db = seed();
  }

  function save() {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // write-then-rename so a crash mid-write can't leave half a file
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }

  save();
  return { db, save };
}

module.exports = { createStore };
