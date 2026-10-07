// The full quiz API suite again, this time stored in the Supabase schema
// (PGlite) instead of memory, ending with a reload-and-compare check.
process.env.QQ_STORE = 'pglite';
require('./quiz-test.js');
