const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { createAuthoring } = require('../src/quiz/authoring');
const { trimRedundantOptions } = require('../src/quiz/assessment');
const { toTables, fromTables } = require('../src/db/schema');

const report = '# Supported principles\nA controlled comparison changes one factor while holding other conditions constant. Association alone does not establish causation. Independent observations strengthen evidence. Sample question: Does an association prove a causal relationship? No.';
const stems = [
  'Why is controlling competing explanations necessary when interpreting observations?',
  'How does independent corroboration affect confidence in an explanation?',
  'Association by itself establishes a causal effect.',
  'Holding other conditions constant helps isolate a treatment effect.',
  'Which conclusions follow from the controlled comparison described in the report?',
  'Select the defensible interpretations of independently collected observations.',
  'Explain the distinction between a measured association and an established cause.',
  'Describe the purpose of holding relevant conditions constant during an experiment.',
];
const types = ['mcq', 'mcq', 'tf', 'tf', 'multi', 'multi', 'short', 'short'];
function item(i, sourceId) {
  const type = types[i];
  return { type, stem: stems[i], difficulty: 'medium', sourceIds: [sourceId],
    explanation: 'The report distinguishes controlled comparisons from association alone.',
    blueprint: { intendedStyle: 'application', concept: 'Evidence', taskType: 'interpret' },
    ...(['mcq','multi'].includes(type) ? { options: ['Controls help isolate an effect', 'Independent evidence increases confidence', 'Association establishes every cause', 'The observations rule out any competing cause'] } : {}),
    ...(['mcq','tf'].includes(type) ? { answerIndex: type === 'tf' && i === 2 ? 1 : 0 } : {}),
    ...(type === 'multi' ? { answerIndexes: [0, 1] } : {}),
    ...(type === 'short' ? { answerMode: 'text', modelAnswer: 'Control competing conditions before inferring a causal effect.', keyPoints: ['Control competing conditions', 'Distinguish association from causation'] } : {}),
  };
}
async function settled(j) {
  const until = Date.now() + 5000;
  while (['queued','running'].includes(j.status)) {
    if (Date.now() > until) throw Error('Mock job timeout');
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}
async function fixture({ count = 8, decision = v => v, draft, persist = async () => {} } = {}) {
  const db = seed(), course = db.courses.find(c => c.id === 'c-comp');
  const requests = [];
  let drafts = 0;
  const provider = async opts => {
    requests.push(opts);
    if (opts.requestContext.stage === 'analysis') return { json: { markdown: report, insufficient: false } };
    const sourceId = course.authoringJobs.find(j => j.kind === 'analysis').reportSourceId;
    if (opts.requestContext.stage === 'drafting') {
      const questions = draft ? draft(drafts++, sourceId) : Array.from({ length: count }, (_, i) => item(i, sourceId));
      return { json: { questions, applicationSupported: true, limitation: '' } };
    }
    const data = JSON.parse(opts.prompt.slice(opts.prompt.indexOf('\n') + 1));
    return { json: { applicationSupported: true, limitation: '', checks: data.questions.map((q, index) => {
      const falseStatement = q.stem === stems[2];
      return decision({ index, correct: true, questionValid: true, unambiguous: true, oneCorrect: true,
        explanationSupported: true, statementTruth: q.type === 'tf' ? !falseStatement : null,
        aligned: true, outcomeAligned: true, scenarioGrounded: true, fitsConfiguration: true, duplicate: false,
        estimatedDifficulty: 'easy', difficultyAppropriate: false, cognitiveStyle: 'application',
        answerableWithoutScenario: true, reasoningSteps: ['Recall the supported principle.'],
        weakDistractorIndexes: q.type === 'mcq' ? [3] : [], redundantCorrectOptionIndexes: [],
        answerIndex: q.type === 'tf' && falseStatement ? 1 : q.type === 'mcq' || q.type === 'tf' ? 0 : -1,
        answerIndexes: q.type === 'multi' ? [0, 1] : [], numericAnswer: null,
        unsupportedClaims: [], reason: 'The answer is supported; cognitive demand is limited.',
        evidence: [{ passageId: sourceId, quoteId: data.evidenceAnchors[0].id }],
      }, q);
    }) } };
  };
  const queue = createAuthoring({ db, persist: () => persist(db, course), ai: provider });
  const a = queue.start(course, 'report', {}, 't-a'); await settled(a);
  await queue.review(course, a.id, report, 0);
  const quantities = types.slice(0, count).reduce((out, type) => ({ ...out, [type]: (out[type] || 0) + 1 }), {});
  const raw = { analysisId: a.id, reportRevision: 1, topicText: 'Evidence', learningOutcome: 'Interpret evidence and controlled comparisons.', assessmentStyle: 'application', quantities };
  const job = queue.start(course, 'generation', raw, 't-a');
  return { db, course, queue, job, requests };
}

test('eight valid questions across four formats survive moderate issues in one draft/check pair', async () => {
  const f = await fixture(); await settled(f.job);
  assert.equal(f.job.status, 'complete', f.job.message);
  assert.equal(f.job.calls, 2);
  assert.equal(f.job.result.created.length, 8);
  const qs = f.db.questions.filter(q => q.generationId === f.job.result.generationId);
  assert.deepEqual(qs.map(q => q.versions[0].type), types);
  assert.ok(qs.every(q => q.versions[0].difficulty === 'easy' && q.assessment.cognitiveStyle === 'conceptual'));
  assert.ok(qs.every(q => q.versions[0].warnings.length));
});

test('critical ambiguity, wrong keys and serious sample duplication still require replacement', async t => {
  for (const failure of ['unambiguous', 'key', 'duplicate']) await t.test(failure, async () => {
    let checks = 0;
    const f = await fixture({ count: 1, draft: (round, source) => [{ ...item(round ? 1 : 0, source),
      ...(!round && failure === 'duplicate' ? { stem: 'Does an association prove a causal relationship?' } : {}) }],
      decision: v => checks++ ? v : { ...v, ...(failure === 'key' ? { answerIndex: 1 } : { [failure]: failure === 'duplicate' }) } });
    await settled(f.job);
    assert.equal(f.job.status, 'complete', f.job.message);
    assert.equal(f.job.calls, 4);
    assert.equal(f.job.result.created.length, 1);
    assert.equal(f.job.result.rejected.length, 1);
  });
});

test('sample vocabulary and principles can support a different verified task without replacement', async () => {
  const f = await fixture({ count: 1, draft: (_, source) => [{ ...item(0, source),
    stem: 'What additional controls would distinguish a causal relationship from an observed association?' }] });
  await settled(f.job);
  assert.equal(f.job.status, 'complete');
  assert.equal(f.job.calls, 2);
  const prompt = f.requests.find(r => r.requestContext.stage === 'verification').prompt;
  assert.match(prompt, /sample questions and worked assessment examples/);
  assert.match(prompt, /not just the same concept, taskType, source principle or vocabulary/);
});

test('high word overlap uses the semantic verdict; exact repeated questions still cannot fill slots', async () => {
  const first = 'Which evidence supports the causal claim when the comparison controls temperature and light?';
  const second = 'Which evidence supports the causal claim when the comparison does not control temperature and light?';
  const f = await fixture({ count: 2, draft: (_, source) => [
    { ...item(0, source), stem: first }, { ...item(1, source), stem: second, answerIndex: 1 },
  ], decision: (v, q) => ({ ...v, answerIndex: q.stem === second ? 1 : 0 }) });
  await settled(f.job);
  assert.equal(f.job.status, 'complete', f.job.message);
  assert.equal(f.job.calls, 2);
  const repeated = await fixture({ count: 2, draft: (_, source) => [item(0, source), item(0, source)] });
  await settled(repeated.job);
  assert.equal(repeated.job.result.created.length, 1);
  assert.ok(repeated.job.result.rejected.some(r => r.errors.some(e => /duplicate/.test(e))));
});

test('only the final two requests are allocated to a draft and its verification', async () => {
  const f = await fixture({ count: 1 });
  f.job.calls = 16; f.job.requestBudget = 18;
  await settled(f.job);
  assert.equal(f.job.status, 'complete');
  assert.equal(f.job.calls, 18);
  assert.deepEqual(f.requests.filter(r => r.requestContext.kind === 'generation').map(r => [r.requestContext.stage, r.maxAttempts]), [['drafting', 1], ['verification', 1]]);
});

test('one remaining request is not wasted on an unverifiable fresh draft', async () => {
  const f = await fixture({ count: 1 });
  f.job.calls = 17; f.job.requestBudget = 18;
  await settled(f.job);
  assert.equal(f.job.status, 'failed');
  assert.equal(f.job.calls, 17);
  assert.match(f.job.message, /request budget/);
  assert.equal(f.requests.filter(r => r.requestContext.kind === 'generation').length, 0);
});

test('repeating an unchanged critical failure reuses the rejection instead of another verification', async () => {
  const f = await fixture({ count: 1, decision: v => ({ ...v, unambiguous: false }) });
  await settled(f.job);
  assert.equal(f.job.status, 'failed');
  assert.equal(f.job.result.created.length, 0);
  assert.equal(f.requests.filter(r => r.requestContext.stage === 'verification').length, 1);
  assert.equal(f.job.calls, 4, 'three bounded drafts plus one check');
});

test('a checked partial batch resumes after restart without inference even at its budget limit', async () => {
  let snapshot;
  const f = await fixture({ count: 2, persist: async (db, course) => {
    const j = course.authoringJobs.find(j => j.kind === 'generation');
    if (!snapshot && j?.pendingBatch?.verification && j.result.created?.length === 1) {
      snapshot = toTables(db, () => 1);
      throw Error('Simulated storage interruption after first saved question');
    }
  } });
  f.job.calls = 16; f.job.requestBudget = 18;
  await settled(f.job);
  assert.ok(snapshot);
  const db = fromTables(snapshot), course = db.courses.find(c => c.id === f.course.id);
  let inference = 0;
  const queue = createAuthoring({ db, persist: async () => {}, ai: async () => { inference++; throw Error('Must reuse verification'); } });
  const job = course.authoringJobs.find(j => j.id === f.job.id);
  const survivor = structuredClone(db.questions.find(q => q.id === job.result.created[0]));
  queue.resume(course, job.id); await settled(job);
  assert.equal(job.status, 'complete', job.message);
  assert.equal(inference, 0);
  assert.equal(job.calls, 18);
  assert.equal(job.result.created.length, 2);
  assert.deepEqual(db.questions.find(q => q.id === survivor.id), survivor);
  assert.equal(db.generationLog.find(g => g.id === job.result.generationId).calls, 1, 'replay consumes no drafting quota');
});

test('safe multi-select correction remaps keys; unsafe reductions and label references only warn', () => {
  const q = { type: 'multi', stem: 'Select all supported propositions.', explanation: 'Each is evaluated independently.',
    options: ['Controls isolate effects', 'Controls separate effects', 'Independent accounts corroborate', 'Association proves causation', 'Every condition is irrelevant'], answerIndexes: [0, 1, 2] };
  assert.deepEqual(trimRedundantOptions(q, [1]), { options: [q.options[0], ...q.options.slice(2)], answerIndexes: [0, 1] });
  assert.equal(trimRedundantOptions({ ...q, answerIndexes: [0, 1] }, [1]), null);
  assert.equal(trimRedundantOptions({ ...q, stem: 'Select exactly three supported propositions.' }, [1]), null);
  assert.equal(trimRedundantOptions({ ...q, explanation: 'Options A and B express the same rule.' }, [1]), null);
  assert.equal(trimRedundantOptions(q, [4, 99]), null, 'wrong or invalid indexes cannot be removed');
});
