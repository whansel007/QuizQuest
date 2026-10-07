// ============================================================
// Test helper: the Supabase schema running in PGlite (Postgres compiled
// to WebAssembly, in-process). Lets the tests apply the real migration
// and exercise the Supabase store without a Supabase account.
// The adapter mirrors what supabase-js/PostgREST does: rows go in and
// come out as JSON (timestamps as ISO strings, arrays as JSON arrays).
// ============================================================

const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS = path.join(__dirname, '..', '..', 'supabase', 'migrations');

async function openPglite() {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite();
  for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    await pg.exec(fs.readFileSync(path.join(MIGRATIONS, file), 'utf8'));
  }
  return pg;
}

// calls: optional array that records every write, for assertions
function pgliteAdapter(pg, { calls = null, failOnce = null } = {}) {
  return {
    async selectAll(table, orderBy) {
      const { rows } = await pg.query(`select to_jsonb(t) as r from ${table} t order by ${orderBy.join(', ')}`);
      return rows.map((x) => x.r);
    },
    async upsert(table, rows, key) {
      if (failOnce && failOnce.table === table && !failOnce.done) {
        failOnce.done = true;
        throw new Error(`Saving ${table} failed: simulated outage`);
      }
      calls?.push({ op: 'upsert', table, n: rows.length });
      const cols = Object.keys(rows[0]).filter((c) => !key.includes(c));
      await pg.query(
        `insert into ${table} select * from jsonb_populate_recordset(null::${table}, $1::jsonb)
         on conflict (${key.join(', ')}) do update set ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}`,
        [JSON.stringify(rows)],
      );
    },
    async remove(table, key, rows) {
      calls?.push({ op: 'delete', table, n: rows.length });
      for (const r of rows) await pg.query(`delete from ${table} where ${key.map((k, i) => `${k} = $${i + 1}`).join(' and ')}`, key.map((k) => r[k]));
    },
  };
}

// Compare two db objects the way the app sees them: field order and
// "null vs not set" on entity fields don't matter.
function normalize(db) {
  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null).map(([k, v]) => [k, ['outcomes', 'versions', 'reports'].includes(k) ? v.map(strip) : v]));
  const plain = JSON.parse(JSON.stringify(db));
  return Object.fromEntries(Object.entries(plain).filter(([k]) => k !== 'schema').map(([k, list]) => [k, list.map(strip)]));
}

// Silent logger that remembers errors, so tests can assert there were none
const quiet = () => {
  const errors = [];
  return { errors, log() {}, error: (...a) => errors.push(a.join(' ')) };
};

module.exports = { openPglite, pgliteAdapter, normalize, quiet };
