// ============================================================
// Supabase-backed store
// ------------------------------------------------------------
// Drop-in replacement for the JSON file store (src/quiz/store.js): it
// gives the app the same { db, save } pair, so the domain code is
// unchanged. On startup every table is read into memory; after changes,
// save() batches them and writes ONLY the rows that changed (upsert) or
// disappeared (delete).
//
// Stepping stone, not the final design (see PROTOTYPE.md): run exactly
// ONE server instance against a project, because each instance keeps its
// own copy in memory. The long-term design queries Postgres per request.
//
// The secret key gives full database access. It is read from the server
// environment only, and must never be sent to the browser or committed.
// ============================================================

const { TABLES, keyOf, toTables, fromTables, orderOf } = require('./schema');
const { seed, SCHEMA } = require('../quiz/seed');

const SAVE_DELAY = 250; // ms; batch changes like the file store does
const BATCH = 500; // rows per upsert request
const PAGE = 1000; // rows per read request (Supabase's default max)

// --- adapter: the only code that talks to supabase-js -------------
// Errors carry Postgres' code + message but never row contents (some
// error details echo the failing row, which may hold student text).
function supabaseAdapter(client) {
  const fail = (what, error) => Object.assign(new Error(`${what} failed: ${[error.code, error.message].filter(Boolean).join(' ')}`), { code: error.code });
  return {
    async selectAll(table, orderBy) {
      const out = [];
      let total = null;
      while (total === null || out.length < total) {
        let q = client.from(table).select('*', { count: 'exact' });
        for (const c of orderBy) q = q.order(c, { ascending: true });
        const { data, error, count } = await q.range(out.length, out.length + PAGE - 1);
        if (error) throw fail(`Reading ${table}`, error);
        total = count ?? 0;
        if (!data.length) break;
        out.push(...data);
      }
      if (total !== null && out.length < total) throw new Error(`Reading ${table} returned ${out.length} of ${total} rows.`);
      return out;
    },
    async upsert(table, rows, key) {
      const { error } = await client.from(table).upsert(rows, { onConflict: key.join(',') });
      if (error) throw fail(`Saving ${table}`, error);
    },
    async remove(table, key, rows) {
      if (key.length === 1) {
        for (let i = 0; i < rows.length; i += BATCH) {
          const { error } = await client.from(table).delete().in(key[0], rows.slice(i, i + BATCH).map((r) => r[key[0]]));
          if (error) throw fail(`Deleting from ${table}`, error);
        }
        return;
      }
      for (const r of rows) {
        const { error } = await client.from(table).delete().match(Object.fromEntries(key.map((k) => [k, r[k]])));
        if (error) throw fail(`Deleting from ${table}`, error);
      }
    },
  };
}

// --- the store ------------------------------------------------------
async function createSyncedStore({ adapter, seedData = seed, saveDelay = SAVE_DELAY, logger = console }) {
  // Which object got which seq (creation order), and the next free one
  const seqs = new WeakMap();
  const nextSeq = Object.fromEntries(TABLES.map((t) => [t.table, 1]));
  const seqOf = (table, obj) => {
    if (!seqs.has(obj)) seqs.set(obj, nextSeq[table]++);
    return seqs.get(obj);
  };

  const meta = await adapter.selectAll('app_meta', ['key']);
  const schemaRow = meta.find((r) => r.key === 'schema');
  let db;
  let fresh = false;
  if (!schemaRow) {
    // No marker: only seed an EMPTY project, never over existing rows
    // (e.g. a seed that crashed half way, or someone else's tables).
    const users = await adapter.selectAll('users', ['seq']);
    if (users.length) throw new Error('The Supabase project has QuizQuest rows but no schema marker (an interrupted first start?). Run `npm run db:reset -- --confirm` to wipe and re-seed the synthetic demo data.');
    db = seedData();
    fresh = true;
  } else if (schemaRow.value !== SCHEMA) {
    throw new Error(`The Supabase data is schema v${schemaRow.value}; this app expects v${SCHEMA}. Apply the latest migration, or run \`npm run db:reset -- --confirm\` to re-seed the synthetic demo data.`);
  } else {
    const tables = {};
    await Promise.all(TABLES.map(async (spec) => {
      tables[spec.table] = await adapter.selectAll(spec.table, orderOf(spec));
    }));
    db = fromTables(tables, (table, obj, row) => {
      seqs.set(obj, row.seq);
      nextSeq[table] = Math.max(nextSeq[table], row.seq + 1);
    });
    db.schema = SCHEMA;
  }

  // What the database holds right now, per table: row key -> row JSON.
  // A fresh project holds nothing, so the first flush writes everything.
  const snapshot = Object.fromEntries(TABLES.map((t) => [t.table, new Map()]));
  if (!fresh) {
    const now = toTables(db, seqOf);
    for (const spec of TABLES) for (const row of now[spec.table]) snapshot[spec.table].set(keyOf(spec, row), JSON.stringify(row));
  }

  // Write the differences. Tables go in foreign-key order; a table that
  // fails keeps its old snapshot, so the next flush retries it.
  async function writeChanges() {
    const now = toTables(db, seqOf);
    const changes = TABLES.map((spec) => {
      const before = snapshot[spec.table];
      const seen = new Map();
      const upserts = [];
      for (const row of now[spec.table]) {
        const k = keyOf(spec, row);
        const json = JSON.stringify(row);
        seen.set(k, json);
        if (before.get(k) !== json) upserts.push(row);
      }
      const deletes = [...before.keys()].filter((k) => !seen.has(k)).map((k) => Object.fromEntries(spec.key.map((col, i) => [col, k.split('\u0001')[i]])));
      return { spec, seen, upserts, deletes };
    });
    const failed = [];
    for (const c of changes) {
      try {
        for (let i = 0; i < c.upserts.length; i += BATCH) await adapter.upsert(c.spec.table, c.upserts.slice(i, i + BATCH), c.spec.key);
      } catch (err) {
        failed.push(c.spec.table);
        logger.error('[supabase]', err.message);
        c.failed = true;
      }
    }
    for (const c of [...changes].reverse()) {
      if (c.failed || !c.deletes.length) continue;
      try {
        await adapter.remove(c.spec.table, c.spec.key, c.deletes);
      } catch (err) {
        failed.push(c.spec.table);
        logger.error('[supabase]', err.message);
        c.failed = true;
      }
    }
    for (const c of changes) if (!c.failed) snapshot[c.spec.table] = c.seen;
    return failed;
  }

  // One flush at a time; changes made during a flush trigger another.
  let timer = null;
  let running = null;
  let again = false;
  let retryMs = 0;
  function flush() {
    clearTimeout(timer);
    timer = null;
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          const failed = await writeChanges();
          if (failed.length) {
            // back off and retry (network blip, Supabase paused...)
            retryMs = Math.min(30000, retryMs ? retryMs * 2 : 2000);
            if (!timer) timer = setTimeout(flush, retryMs);
            break;
          }
          retryMs = 0;
        } while (again);
      } finally {
        running = null;
      }
    })();
    return running;
  }
  function save() {
    if (!timer) timer = setTimeout(flush, saveDelay);
  }

  if (fresh) {
    logger.log('[supabase] empty project: writing the synthetic demo data...');
    const failed = await writeChanges();
    if (failed.length) throw new Error(`Could not write the demo data to Supabase (${failed.join(', ')}). Check that the migration in supabase/migrations has been applied.`);
    await adapter.upsert('app_meta', [{ key: 'schema', value: SCHEMA }], ['key']);
  }

  // Flush pending writes before the process exits (Ctrl+C / host shutdown)
  function handleSignals() {
    for (const sig of ['SIGINT', 'SIGTERM']) {
      process.once(sig, async () => {
        const stop = setTimeout(() => process.exit(130), 5000);
        try {
          await flush();
        } finally {
          clearTimeout(stop);
          process.exit(130);
        }
      });
    }
  }

  return { db, save, flush, handleSignals, pending: () => Boolean(timer || running) };
}

// Read the connection settings from the environment and load the store.
// SUPABASE_SECRET_KEY: the project's secret key (sb_secret_...) or the
// legacy service_role key. Never the publishable/anon key: with row level
// security on, that key can read nothing (and the app would think the
// database is empty).
async function connectSupabaseStore(env = process.env) {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example).');
  if (key.startsWith('sb_publishable_') || jwtRole(key) === 'anon') {
    throw new Error('SUPABASE_SECRET_KEY is a publishable/anon key. The server needs the secret (service role) key; keep it server-side only.');
  }
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const store = await createSyncedStore({ adapter: supabaseAdapter(client) });
  store.handleSignals();
  return store;
}

// Legacy Supabase keys are JWTs whose payload says which role they are
function jwtRole(key) {
  try {
    return JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')).role;
  } catch {
    return null;
  }
}

module.exports = { createSyncedStore, supabaseAdapter, connectSupabaseStore };
