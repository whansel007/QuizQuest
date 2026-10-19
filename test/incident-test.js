const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { createAuthoring } = require('../src/quiz/authoring');
const { generateJson } = require('../src/quiz/gemini');
const { createQuota } = require('../src/quiz/gemini-quota');
const { toTables, fromTables } = require('../src/db/schema');
async function settled(job) {
  while (['queued', 'running'].includes(job.status)) await new Promise((r) => setTimeout(r, 5));
}
test('failed calls spend a lifetime budget, duplicate resumes share a job, restart requires explicit resume', async () => {
  const db = seed(), course = db.courses.find((c) => c.id === 'c-comp');
  let requests = 0;
  const provider = async () => { requests++; throw new Error('mock failure'); };
  const options = { db, persist: async () => {}, ai: provider };
  const queue = createAuthoring(options);
  let job = queue.start(course, 'report', {}, 't-a');
  job.requestBudget = 2;
  for (let i = 0; i < 10; i++) assert.equal(queue.start(course, 'report', {}, 't-a'), job);
  await settled(job);
  assert.equal(requests, 1);
  job.status = 'running'; // saved interrupted work from a prior process
  const restoredDb=fromTables(toTables(db,()=>1)), restoredCourse=restoredDb.courses.find(c=>c.id===course.id);
  const restored = createAuthoring({...options,db:restoredDb});
  job=restoredCourse.authoringJobs.find(j=>j.id===job.id);
  assert.equal(job.status, 'interrupted');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(requests, 1, 'recovery does not automatically infer');
  for (let i = 0; i < 10; i++) restored.resume(restoredCourse, job.id);
  await settled(job);
  assert.equal(requests, 2);
  assert.equal(job.calls, 2);
  assert.throws(() => restored.resume(restoredCourse, job.id), /request budget/);
  assert.equal(restored.start(restoredCourse, 'report', {}, 't-a'), job, 'reposting cannot reset the budget');
});
test('transport retries are bounded, charged individually and linked to a job', async (t) => {
  const old = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'mock-only';
  t.after(() => { if (old === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = old; });
  let requests = 0, charges = 0, time = Date.now();
  const quota = createQuota({ now: () => time, sleep: async (ms) => { time += ms; } });
  await assert.rejects(generateJson({
    prompt: 'test', maxAttempts: Infinity, quota,
    requestContext: { jobId: 'job-test', kind: 'generation', courseId: 'c-test', stage:'verification', batch:2 },
    onAttempt: async () => { charges++; }, sleep: async () => {},
    fetchImpl: async () => { requests++; return new Response('{}', { status: 500 }); },
  }), (e) => e.code === 'AI_FAILED');
  assert.equal(requests, 3);
  assert.equal(charges, 3);
  assert.ok(quota.snapshot().events.every((e) => e.context.jobId === 'job-test'));
  assert.ok(quota.snapshot().events.every((e) => e.context.stage==='verification' && e.context.batch===2));
  const blockedQuota=createQuota();
  await assert.rejects(generateJson({
    prompt:'test',quota:blockedQuota,
    onAttempt:async()=>{throw Object.assign(new Error('budget exhausted'),{code:'JOB_BUDGET'});},
    fetchImpl:async()=>{throw new Error('must not send');},
  }), e=>e.code==='JOB_BUDGET');
  assert.equal(blockedQuota.snapshot().events.length,1,'accounting rejection is never retried');
  assert.equal(blockedQuota.snapshot().events[0].status,'not_sent');
});
