// ============================================================
// Tiny JSON-file store
// ------------------------------------------------------------
// Stand-in for the Supabase database in the proposal. The whole DB is
// one object in memory, written to disk shortly after changes. Fine for a
// single-process demo; NOT for production (no concurrency, no row-level
// security - access rules are enforced in api.js instead).
// Pass file = null for a purely in-memory store (used by tests).
// If the file on disk was written by an older version of the app, it is
// renamed to *.bak.json and a fresh demo database is seeded.
// ============================================================

const fs = require('fs');
const path = require('path');
const { seed, SCHEMA } = require('./seed');

const SAVE_DELAY = 250; // ms; worst case on a hard crash is losing this much

function createStore(file) {
  let db = null;
  if (file && fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (db.schema !== SCHEMA) {
      const backup = file.replace(/\.json$/, '') + `.v${db.schema || 1}.bak.json`;
      fs.renameSync(file, backup);
      console.log(`[store] data file is from an older version; moved it to ${path.basename(backup)} and re-seeded the demo data.`);
      db = null;
    }
  }
  if (!db) db = seed();

  function flush() {
    if (!file) return;
    clearTimeout(timer);
    timer = null;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // write-then-rename so a crash mid-write can't leave half a file
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }

  // save() is called after every change. Serialising the whole DB each
  // time blocks the event loop (and the World's game loop), so changes
  // within SAVE_DELAY are batched into one write. On Ctrl+C / shutdown
  // the pending write is flushed first.
  let timer = null;
  function save() {
    if (!file || timer) return;
    timer = setTimeout(flush, SAVE_DELAY);
  }
  if (file) {
    for (const sig of ['SIGINT', 'SIGTERM']) {
      process.once(sig, () => {
        if (timer) flush();
        process.exit(130);
      });
    }
    process.once('exit', () => timer && flush());
  }

  flush();
  return { db, save, flush };
}

module.exports = { createStore };
