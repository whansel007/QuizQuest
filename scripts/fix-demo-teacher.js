// Check (and optionally repair) the demo professor account in the live
// Supabase project.
//
// Why this exists
// ---------------
// The demo passwordless sign-in only works for a "seeded demo user": an id
// in SEEDED_DEMO_USER_IDS (src/quiz/api.js:69) whose email ends with
// "@quizquest.demo" (src/quiz/api.js:70). Both professors are seeded ids
// (t-a and t-b), so if one of them has stopped appearing in
// GET /api/demo-users, the only thing that can have changed is its email.
//
// That is what happened to Prof. Demo A on the live project: `t-a` is a
// seeded id, but its email no longer ends with @quizquest.demo and its
// password is no longer the shared demo password, so the account is skipped
// by the demo picker and by the passwordless login. Prof. Demo B still
// works.
//
// CAREFUL: `t-a` is now somebody's OWN account, not a demo account. Its
// email is a real address and its password is that person's own. Restoring
// the demo email would take their login away. Read the report first, and
// ask that person before running this with --confirm.
//
// Restoring one field on one row is a lot less destructive than
// `pnpm db:reset --confirm`, which deletes every row in the project and
// re-seeds. This script changes one row, and prints exactly what it did.
//
// Usage
// -----
//   node --env-file-if-exists=.env scripts/fix-demo-teacher.js
//       -> report only. Changes nothing.
//
//   node --env-file-if-exists=.env scripts/fix-demo-teacher.js --confirm
//       -> restore t-a's email to prof.a@quizquest.demo.
//
//   ... --confirm --reset-password
//       -> also set t-a's password to the shared demo password, for the
//          case where the password was changed as well as the email.
//
// The email and the password hash live in the row's `extra` jsonb column
// (src/db/schema.js:163-167), so the update rewrites `extra` with only the
// one field changed and everything else kept as it was.

const { createClient } = require('@supabase/supabase-js');
const { projectUrl } = require('../src/db/supabase-store');
const P = require('../src/quiz/passwords');

const args = process.argv.slice(2);
const confirm = args.includes('--confirm');
const resetPassword = args.includes('--reset-password');
const DEMO_TEACHER_ID = 't-a';
const DEMO_TEACHER_EMAIL = 'prof.a@quizquest.demo';

(async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SECRET_KEY in .env (see .env.example).');
    process.exit(1);
  }
  const client = createClient(projectUrl(url), key, { auth: { persistSession: false, autoRefreshSession: false } });

  const { data: row, error } = await client.from('users').select('id, name, role, extra').eq('id', DEMO_TEACHER_ID).maybeSingle();
  if (error) {
    console.error(`Reading ${DEMO_TEACHER_ID} failed: ${error.message}`);
    process.exit(1);
  }
  if (!row) {
    console.error(`No row with id "${DEMO_TEACHER_ID}" in the users table.`);
    console.error('That is a different problem: the account was removed, not renamed. A reseed would be needed.');
    process.exit(1);
  }

  const extra = row.extra || {};
  const email = extra.email || null;
  const hash = extra.passwordHash || null;
  const passwordIsDemo = hash ? P.verifyPassword(P.DEMO_PASSWORD, hash) : false;

  console.log(`\nLive demo professor check (${DEMO_TEACHER_ID})\n`);
  console.log(`  id:       ${row.id}`);
  console.log(`  name:     ${row.name}`);
  console.log(`  role:     ${row.role}`);
  console.log(`  email:    ${email}`);
  console.log(`  password: ${hash ? (passwordIsDemo ? 'the shared demo password' : 'CHANGED - not the demo password') : 'no hash stored'}`);
  console.log(`  in the demo picker: ${String(email || '').endsWith('@quizquest.demo')}`);

  // ---------------------------------------------------------- the demo scope
  // What the professor account that still works owns. This is the content
  // the live demo can actually show, so it is worth knowing before the room.
  const { data: courses } = await client.from('courses').select('id, title, teacher_ids');
  const { data: topics } = await client.from('topics').select('id, course_id');
  const { data: classes } = await client.from('classes').select('id, name, teacher_ids');
  const teacherIds = (courses || []).flatMap((c) => c.teacher_ids || []);
  const classTeacherIds = (classes || []).flatMap((c) => c.teacher_ids || []);
  console.log('\nWhat the live data holds:');
  for (const c of courses || []) {
    const own = topics.filter((t) => t.course_id === c.id).length;
    const ownedClasses = (classes || []).filter((cl) => (cl.teacher_ids || []).some((t) => teacherIds.includes(t)) && (c.teacher_ids || []).some((t) => (cl.teacher_ids || []).includes(t)));
    console.log(`  course "${c.title}" - ${own} topic(s), ${ownedClasses.length} class(es)`);
  }
  console.log(`  classes in total: ${(classes || []).length}, across ${(courses || []).length} course(s)`);
  console.log(`  teacher ids on courses: ${[...new Set(teacherIds)].join(', ') || 'none'}`);
  console.log(`  teacher ids on classes: ${[...new Set(classTeacherIds)].join(', ') || 'none'}`);

  const emailOk = email === DEMO_TEACHER_EMAIL;
  if (emailOk && passwordIsDemo && !resetPassword) {
    console.log('\nNothing to do: the account is already a working demo account.');
    return;
  }

  const nextExtra = { ...extra, email: DEMO_TEACHER_EMAIL };
  if (resetPassword) nextExtra.passwordHash = P.hashPassword(P.DEMO_PASSWORD);

  if (!confirm) {
    console.log('\nWhat would change:');
    console.log(`  users.extra.email for ${DEMO_TEACHER_ID}: ${email} -> ${DEMO_TEACHER_EMAIL}`);
    if (resetPassword) console.log('  users.extra.passwordHash: set to the shared demo password');
    if (!emailOk) {
      console.log(`\n  NOTE: ${DEMO_TEACHER_ID} currently belongs to "${row.name}". Changing its email takes away`);
      console.log('  that account\'s login. Ask them first.');
    }
    console.log('\nNothing was written. Re-run with --confirm to apply it.');
    return;
  }

  const { error: writeError } = await client
    .from('users')
    .update({ extra: nextExtra })
    .eq('id', DEMO_TEACHER_ID);
  if (writeError) {
    console.error(`\nThe update failed: ${writeError.message}`);
    process.exit(1);
  }
  console.log('\nDone: t-a is a demo account again. It will appear in /api/demo-users at the next server start.');
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
