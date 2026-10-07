// `npm run db:reset -- --confirm`
// Deletes EVERY QuizQuest row in the Supabase project from .env and
// writes fresh synthetic demo data. Stop the server first. Refuses to run
// without --confirm, because it cannot be undone.
const { createClient } = require('@supabase/supabase-js');
const { TABLES } = require('../src/db/schema');
const { connectSupabaseStore, projectUrl } = require('../src/db/supabase-store');

(async () => {
  if (!process.argv.includes('--confirm')) {
    console.log('This deletes ALL QuizQuest data in the Supabase project set in .env and re-seeds the synthetic demo data.');
    console.log('Stop the server first, then run:  npm run db:reset -- --confirm');
    process.exit(1);
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example).');
  const client = createClient(projectUrl(url), key, { auth: { persistSession: false, autoRefreshToken: false } });
  // children before parents (foreign keys), the marker first
  for (const table of ['app_meta', ...TABLES.map((t) => t.table).reverse()]) {
    const keyCol = table === 'app_meta' ? 'key' : TABLES.find((t) => t.table === table).key[0];
    const { error } = await client.from(table).delete().not(keyCol, 'is', null);
    if (error) throw new Error(`Clearing ${table} failed: ${error.message}`);
  }
  await connectSupabaseStore(); // sees an empty project and seeds it
  console.log('Done: fresh synthetic demo data is in Supabase.');
  process.exit(0);
})().catch((err) => {
  console.error('[db:reset]', err.message);
  process.exit(1);
});
