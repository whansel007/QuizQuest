// ============================================================
// Supabase store tests (src/db/supabase-store.js)
// ------------------------------------------------------------
// Runs the real migration in PGlite (in-process Postgres). The full API
// suite against this store is in quiz-pglite-test.js; this file covers
// the store's own promises: only changed rows are written, failed writes
// are retried, existing data is never seeded over, and keys are checked.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { openPglite, pgliteAdapter, normalize, quiet } = require('./support/pglite');
const { createSyncedStore, connectSupabaseStore, projectUrl } = require('../src/db/supabase-store');

const open = async (pg, opts = {}) => createSyncedStore({ adapter: pgliteAdapter(pg, opts), logger: opts.logger || quiet(), saveDelay: 10 });

test('an empty project is seeded once; a reload writes nothing', async () => {
  const pg = await openPglite();
  const first = await open(pg);
  assert.ok(first.db.users.length > 0);
  const { rows } = await pg.query("select value from app_meta where key = 'schema'");
  assert.equal(rows.length, 1);
  const calls = [];
  const again = await open(pg, { calls });
  assert.deepEqual(normalize(again.db), normalize(first.db));
  await again.flush();
  assert.deepEqual(calls, []);
});

test('only changed and removed rows are written', async () => {
  const pg = await openPglite();
  await open(pg);
  const calls = [];
  const s = await open(pg, { calls });
  s.db.users.find((u) => u.id === 's-01').name = 'Student 01 (renamed)';
  s.db.passages.splice(0, 1);
  s.db.ledger.push({ id: 'tx-test', studentId: 's-01', kind: 'earn', amount: 5, reason: 'Test', refKey: 'test:1', at: Date.now() });
  await s.flush();
  assert.deepEqual(calls.sort((a, b) => a.table.localeCompare(b.table)), [
    { op: 'upsert', table: 'ledger', n: 1 },
    { op: 'delete', table: 'passages', n: 1 },
    { op: 'upsert', table: 'users', n: 1 },
  ]);
  const reloaded = await open(pg);
  assert.equal(reloaded.db.users.find((u) => u.id === 's-01').name, 'Student 01 (renamed)');
  assert.equal(reloaded.db.passages.length, s.db.passages.length);
  // new rows keep their creation order after a reload
  assert.equal(reloaded.db.ledger.at(-1).id, 'tx-test');
});

test('a failed write is logged without row contents and retried', async () => {
  const pg = await openPglite();
  await open(pg);
  const logger = quiet();
  const failOnce = { table: 'users' };
  const s = await open(pg, { failOnce, logger });
  s.db.users[0].name = 'Secret-looking name';
  await s.flush();
  assert.equal(logger.errors.length, 1);
  assert.ok(!logger.errors[0].includes('Secret-looking'), 'row values are not logged');
  // the store schedules its own retry (2s backoff); flush now instead
  await s.flush();
  assert.equal((await open(pg)).db.users[0].name, 'Secret-looking name');
});

test('NUL characters (e.g. from pasted PDF text) cannot block saves', async () => {
  const pg = await openPglite();
  const logger = quiet();
  const s = await open(pg, { logger });
  s.db.passages[0].text = 'before\u0000after';
  await s.flush();
  assert.deepEqual(logger.errors, []);
  assert.equal((await open(pg)).db.passages[0].text, 'beforeafter');
});

test('authoring checkpoints, reviewed analysis and cached parts survive a real Postgres reload',async()=>{
  const pg=await openPglite(),s=await open(pg);
  const course=s.db.courses[0];
  course.authoringJobs=[{id:'job-persisted',kind:'analysis',status:'running',input:{passageIds:[s.db.passages[0].id]},result:{parts:[{markdown:'A saved analysis excerpt.',insufficient:false}]},reviewedText:'Professor reviewed content',attempts:1}];
  course.analysisCache={'hash-value':{markdown:'A saved analysis excerpt.',insufficient:false}};
  s.save();await s.flush();
  const reload=await open(pg),restored=reload.db.courses.find(c=>c.id===course.id);
  assert.deepEqual(restored.authoringJobs,course.authoringJobs);
  assert.deepEqual(restored.analysisCache,course.analysisCache);
  const {createAuthoring}=require('../src/quiz/authoring');
  createAuthoring({db:reload.db,persist:async()=>{}});
  assert.equal(restored.authoringJobs[0].status,'interrupted');
  assert.equal(restored.authoringJobs[0].reviewedText,'Professor reviewed content');
});

test('saved knowledge report revisions and mixed-format generation survive Postgres reload',async()=>{
  const pg=await openPglite(),s=await open(pg);
  const {createAuthoring}=require('../src/quiz/authoring');
  const course=s.db.courses[0];
  const markdown='# Reviewed knowledge report\nThe professor edits and saves authoritative content before assessments are generated.';
  const run=createAuthoring({db:s.db,persist:async()=>{s.save();await s.flush();},ai:async()=>({json:{markdown,insufficient:false}})});
  const job=run.start(course,'report',{},course.teacherIds[0]);
  const deadline=Date.now()+10000;
  while(['queued','running'].includes(job.status)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,10));
  assert.equal(job.status,'complete',job.message);
  await run.review(course,job.id,markdown,0);
  const first=job.reportSourceId;
  await run.review(course,job.id,markdown+'\nUpdated assessment boundary: 97 units.',1);
  const reloaded=await open(pg),restored=reloaded.db.courses.find(c=>c.id===course.id).authoringJobs.find(j=>j.id===job.id);
  assert.equal(restored.reportRevision,2);
  assert.match(restored.reviewedText,/97 units/);
  assert.equal(reloaded.db.passages.find(p=>p.id===first).text,markdown);
  assert.equal(reloaded.db.passages.find(p=>p.id===restored.reportSourceId).text,restored.reviewedText);
  const result=await pg.query("select count(*)::int as n from passages where origin = 'report'");
  assert.equal(result.rows[0].n,2);
});

test('refuses to seed over unmarked data or load another schema version', async () => {
  const pg = await openPglite();
  await open(pg);
  await pg.query("update app_meta set value = '999' where key = 'schema'");
  await assert.rejects(open(pg), /schema v999/);
  await pg.query("delete from app_meta where key = 'schema'");
  await assert.rejects(open(pg), /no schema marker/);
});

test('the server refuses browser (publishable/anon) keys', async () => {
  await assert.rejects(connectSupabaseStore({}), /SUPABASE_URL and SUPABASE_SECRET_KEY/);
  await assert.rejects(connectSupabaseStore({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'sb_publishable_x' }), /publishable\/anon/);
  const anonJwt = ['e30', Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url'), 'sig'].join('.');
  await assert.rejects(connectSupabaseStore({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: anonJwt }), /publishable\/anon/);
});

test('SUPABASE_URL copied as the REST endpoint is reduced to the project URL', () => {
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(projectUrl('https://abc.supabase.co'), 'https://abc.supabase.co');
    assert.equal(projectUrl('https://abc.supabase.co/'), 'https://abc.supabase.co');
    assert.equal(projectUrl(' https://abc.supabase.co/rest/v1/ '), 'https://abc.supabase.co');
    assert.equal(projectUrl('http://127.0.0.1:54321'), 'http://127.0.0.1:54321');
  } finally {
    console.warn = warn;
  }
  assert.throws(() => projectUrl('abc.supabase.co'), /not a valid URL/);
});

test('class join codes are saved and reloaded like every other table', async () => {
  const pg = await openPglite();
  const s = await open(pg);
  const cls = s.db.classes[0];
  s.db.classJoinCodes.push({ id: '00000000-0000-4000-8000-000000000001', classId: cls.id, codeHash: 'a'.repeat(64), expiresAt: null, usageLimit: 5, usageCount: 0, revoked: false, createdBy: cls.teacherIds?.[0] ?? null, createdAt: Date.now() });
  s.save();
  await s.flush();
  assert.equal(s.pending(), false, 'nothing left waiting to be written');
  const again = await open(pg);
  assert.deepEqual(again.db.classJoinCodes.map((c) => [c.id, c.classId, c.usageLimit, c.revoked]), [['00000000-0000-4000-8000-000000000001', cls.id, 5, false]]);
});
