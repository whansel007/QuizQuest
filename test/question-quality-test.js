// Question-quality rules: concept coverage, difficulty labels, distractors,
// explanations and the application downgrade under "Both". Gemini is mocked
// throughout; nothing here calls a real model.
const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { createAuthoring } = require('../src/quiz/authoring');
const { generate, buildUserPrompt, geminiDraft } = require('../src/quiz/generator');
const { sameConcept, planOf, TASK_TYPES, COVERAGE_GUIDE } = require('../src/quiz/assessment');
const { toTables, fromTables } = require('../src/db/schema');
const designGuidance = require('../src/quiz/design-guidance');

const REPORT = '# Week 10 Testing Fundamentals\nA unit test checks one unit in isolation. toBe compares with Object.is, so two separate objects with the same contents are not toBe-equal; toEqual compares contents recursively. A mock replaces a dependency so the unit can be tested in isolation. Arrange, act, assert structures a test. A failing assertion reports the expected and received values.';
const blueprint = (concept, taskType, intendedStyle = 'conceptual') => ({
  intendedStyle, concept, taskType, targetSkill: concept, scenarioGivens: [], reasoningSteps: [], whyNotRecall: '', distractorRationale: [],
});
const mcq = (stem, concept, taskType, extra = {}) => ({
  type: 'mcq', stem, options: ['First option text', 'Second option text', 'Third option text', 'Fourth option text'], answerIndex: 0,
  explanation: 'Supported by the saved report on matchers.', difficulty: 'medium', blueprint: blueprint(concept, taskType), ...extra,
});

// --- generate() with a mocked drafter and verifier -----------------------
function direct({ count = 2, rounds, existing = [] }) {
  const db = seed(), course = db.courses.find((c) => c.id === 'c-comp');
  const topic = db.topics.find((t) => t.courseId === course.id), outcome = topic.outcomes[0];
  for (const q of existing) db.questions.push({ courseId: course.id, topicId: topic.id, outcomeId: outcome.id, publishedVersion: null, reports: [], ...q });
  const prompts = [];
  let round = 0;
  return generate({
    db, course, topic, outcome, count, format: 'mixed', quantities: { mcq: count }, providerName: 'test', userId: 't-a', batchSize: 10, force: true,
    sourceChunks: [{ passageId: 'p-report', title: 'Report', text: REPORT, idx: 0, score: 1, why: [] }],
    assessment: { topic: topic.name, learningOutcome: outcome.text, style: 'conceptual' },
    drafter: async (ctx) => { prompts.push(ctx); return { items: rounds[round++].map((q) => ({ ...q, sourceIds: ['p-report'] })) }; },
    batchVerifier: async (qs) => qs.map(() => null),
  }).then((r) => ({ r, db, prompts }));
}

test('concept labels match on their content words, not on wording', () => {
  assert.ok(sameConcept('toBe vs toEqual', 'Difference between toBe() and toEqual()'));
  assert.ok(sameConcept('Arrange-Act-Assert', 'arrange act assert pattern'));
  assert.ok(!sameConcept('jest mock functions', 'jest mock timers'));
  assert.ok(!sameConcept('unit testing', 'integration testing'));
  assert.ok(!sameConcept('', ''), 'a missing label never matches');
  assert.deepEqual(planOf({ blueprint: { intendedStyle: 'application', concept: '  toBe vs toEqual ', taskType: 'predict', extra: 1 } }),
    { intendedStyle: 'application', concept: 'toBe vs toEqual', taskType: 'predict' });
  assert.deepEqual(planOf({ blueprint: { taskType: 'invent' } }), {}, 'unknown task types are dropped');
});

test('a second question on the same concept in one batch is rejected and refilled with a new concept', async () => {
  const { r, db, prompts } = await direct({ count: 2, rounds: [
    [mcq('Which matcher should check that two separately built objects hold the same data?', 'toBe vs toEqual', 'decide'),
      mcq('An adventurer compares two fresh objects with toBe. Why does the assertion fail?', 'Difference between toBe() and toEqual()', 'decide')],
    [mcq('Which part of a test sets up the objects the unit needs before it runs?', 'arrange act assert', 'classify')],
  ] });
  assert.equal(r.status, 200);
  assert.equal(r.body.created.length, 2);
  assert.match(r.body.rejected[0].errors[0], /repeats the concept "Difference between toBe\(\) and toEqual\(\)"/);
  assert.match(JSON.stringify(prompts[1].validationFeedback), /Choose a different concept/, 'the drafter is told why');
  const saved = r.body.created.map((id) => db.questions.find((q) => q.id === id).assessment);
  assert.deepEqual(saved.map((a) => [a.concept, a.taskType, a.intendedStyle]), [['toBe vs toEqual', 'decide', 'conceptual'], ['arrange act assert', 'classify', 'conceptual']]);
  const restored = fromTables(toTables(db, () => 1)).questions.find((q) => q.id === r.body.created[0]);
  assert.equal(restored.assessment.concept, 'toBe vs toEqual', 'the concept survives the database round trip');
});

test('larger batches may revisit a concept once, through a different task type', async () => {
  const items = [
    mcq('Which matcher should check that two separately built objects hold the same data?', 'toBe vs toEqual', 'decide'),
    mcq('Predict the result when toEqual compares two fresh objects with identical nested fields.', 'toBe vs toEqual', 'predict'),
    mcq('Which statement explains why identical-looking arrays fail an identity comparison here?', 'toBe vs toEqual', 'explain'),
    mcq('Which matcher compares the two objects in this failing assertion message correctly?', 'toBe vs toEqual', 'decide'),
    mcq('What does a mock replace when a unit is tested in isolation from its database?', 'mocking dependencies', 'explain'),
    mcq('Which step of a test calls the function whose behaviour is being checked?', 'arrange act assert', 'classify'),
  ];
  const { r } = await direct({ count: 6, rounds: [items, [], []] });
  assert.equal(r.body.created.length, 4, 'a third question on one concept is rejected, as is a repeated task type');
  assert.deepEqual(r.body.rejected.map((x) => x.stem.slice(0, 21)), ['Which statement expla', 'Which matcher compare']);
});

test('earlier questions block the same concept and task type, but not a rejected or a different task', async () => {
  const old = (id, stem, concept, taskType, status = 'draft') => ({ id, status, assessment: { concept, taskType }, versions: [{ v: 1, type: 'mcq', stem, sourceIds: ['p-report'] }] });
  const { r, prompts } = await direct({ count: 3, rounds: [[
    mcq('Which matcher should a quest log use to compare two separately built item lists?', 'toBe vs toEqual', 'decide'),
    mcq('Predict whether toEqual passes for two fresh objects with identical nested fields.', 'toBe vs toEqual', 'predict'),
    mcq('Which statement best explains what a mock replaces in a unit test of the guild ledger?', 'mocking dependencies', 'explain'),
  ], [], []], existing: [
    old('q-old1', 'Choose the right matcher for comparing two separately constructed objects.', 'toBe vs toEqual', 'decide'),
    old('q-old2', 'Why do we mock dependencies?', 'mocking dependencies', 'explain', 'rejected'),
  ] });
  assert.equal(r.body.created.length, 2);
  assert.match(r.body.rejected[0].errors[0], /existing question already assesses "toBe vs toEqual" with a decide task/);
  const prompt = buildUserPrompt({ ...prompts[0], chunks: prompts[0].chunks });
  assert.match(prompt, /\[toBe vs toEqual \/ decide\] Choose the right matcher/, 'the drafter sees covered concepts');
  assert.match(prompt, /Why do we mock dependencies\? \(rejected by the professor\)/);
});

test('drafting prompt defines difficulty, forbids reusing sample questions and asks for concept and task type', async () => {
  const db = seed(), course = db.courses.find((c) => c.id === 'c-comp'), topic = db.topics.find((t) => t.courseId === course.id);
  const ctx = { course, topic, outcome: topic.outcomes[0], count: 2, format: 'mcq', chunks: [{ passageId: 'p', text: REPORT }], sourceKind: 'report',
    existingStems: ['An unrelated stem from another week.'], assessment: { style: 'both' }, quantities: { mcq: 2 } };
  const prompt = buildUserPrompt(ctx);
  assert.match(prompt, /HARD: analyse, debug, evaluate alternatives or combine two or more concepts/);
  assert.match(prompt, /never the wording, length or number of options/);
  assert.match(prompt, /Sample questions in the source are illustrations/);
  assert.match(prompt, /Do not repeat these existing stems: \["An unrelated stem/, 'without related questions the old list is kept');
  let sent;
  await geminiDraft(ctx, async (opts) => { sent = opts; return { json: { questions: [] } }; });
  const bp = sent.schema.properties.questions.items.properties.blueprint;
  assert.deepEqual(bp.properties.taskType.enum, TASK_TYPES);
  assert.ok(['concept', 'taskType'].every((k) => bp.required.includes(k)));
  assert.ok(sent.system.includes(COVERAGE_GUIDE));
  assert.match(sent.system, /every option must be a separate judgement about the same scenario/);
});

test('design guidance keeps the adventure frame light and still comes last', () => {
  const text = designGuidance.designGuidance();
  assert.doesNotMatch(text, /One idea per question/);
  assert.match(text, /one skill per question/);
  assert.match(text, /only says who is doing the\s+task/);
});

// --- the authoring queue's verifier ---------------------------------------
async function settled(job) { const until = Date.now() + 5000; while (['queued', 'running'].includes(job.status)) { if (Date.now() > until) throw new Error('Mock job timed out'); await new Promise((r) => setTimeout(r, 2)); } }
async function queued({ style = 'conceptual', count = 1, draft, decision }) {
  const db = seed(), course = db.courses.find((c) => c.id === 'c-comp');
  const prompts = [];
  let round = 0;
  const queue = createAuthoring({ db, persist: async () => {}, ai: async (opts) => {
    const stage = opts.requestContext.stage;
    if (stage === 'analysis') return { json: { markdown: REPORT, insufficient: false } };
    const sourceId = course.authoringJobs.find((j) => j.kind === 'analysis').reportSourceId;
    if (stage === 'drafting') return { json: { questions: (draft(round++) || []).map((q) => ({ ...q, sourceIds: [sourceId] })), applicationSupported: true, limitation: '' } };
    prompts.push(opts.prompt);
    const data = JSON.parse(opts.prompt.slice(opts.prompt.indexOf('\n') + 1));
    return { json: { applicationSupported: true, limitation: '', checks: data.questions.map((q, index) => decision({
      index, correct: true, oneCorrect: true, questionValid: true, unambiguous: true, explanationSupported: true, statementTruth: null,
      aligned: true, duplicate: false, fitsConfiguration: true, outcomeAligned: true, difficultyAppropriate: true, scenarioGrounded: true,
      cognitiveStyle: 'conceptual', answerableWithoutScenario: true, reasoningSteps: ['Recall the rule.'], answerIndex: 0, answerIndexes: [],
      numericAnswer: null, unsupportedClaims: [], reason: 'Independently solved.', estimatedDifficulty: q.difficulty, weakDistractorIndexes: [],
      evidence: [{ passageId: q.sourceIds[0], quoteId: data.evidenceAnchors[0].id }],
    }, q)) } };
  } });
  const analysis = queue.start(course, 'report', {}, 't-a'); await settled(analysis);
  await queue.review(course, analysis.id, REPORT, 0);
  const job = queue.start(course, 'generation', { analysisId: analysis.id, reportRevision: 1, topicText: 'Week 10 Testing Fundamentals', learningOutcome: 'Choose and justify Jest matchers and test structure.', assessmentStyle: style, quantities: { mcq: count } }, 't-a');
  await settled(job);
  const created = (job.result.created || []).map((id) => db.questions.find((q) => q.id === id));
  return { job, db, created, prompts, rejected: job.result.rejected || [] };
}
const hard = mcq('Two fresh objects with identical nested fields are compared with toBe in the guild ledger test. What is reported?', 'toBe vs toEqual', 'predict', { difficulty: 'hard' });

test('a label above the verified difficulty is lowered in code, with a warning and no retry', async () => {
  const f = await queued({ draft: () => [hard], decision: (v) => ({ ...v, estimatedDifficulty: 'medium' }) });
  assert.equal(f.job.status, 'complete', f.job.message);
  assert.equal(f.job.calls, 2, 'one draft and one verification call');
  const v = f.created[0].versions[0];
  assert.equal(v.difficulty, 'medium');
  assert.match(v.warnings.join(' '), /Drafted as hard, but the independent check judged its reasoning demand medium/);
  const up = await queued({ draft: () => [{ ...hard, difficulty: 'medium' }], decision: (v) => ({ ...v, estimatedDifficulty: 'hard' }) });
  assert.equal(up.created[0].versions[0].difficulty, 'medium', 'a label is never raised');
  const missing = await queued({ draft: () => [hard], decision: ({ estimatedDifficulty, ...v }) => v });
  assert.equal(missing.created[0].versions[0].difficulty, 'hard', 'no estimate leaves the label alone');
});

test('the verifier is asked for difficulty, weak distractors and concept-level duplicates', async () => {
  const f = await queued({ draft: () => [hard], decision: (v) => v });
  const prompt = f.prompts[0];
  assert.doesNotMatch(prompt, /Distinct applications of a concept are allowed/);
  assert.match(prompt, /the same concept assessed through the same kind of task in a new story is a duplicate/);
  assert.match(prompt, /estimatedDifficulty from the reasoning YOU needed/);
  assert.match(prompt, /weakDistractorIndexes/);
});

test('implausible distractors are flagged for the professor, never the answer itself', async () => {
  const f = await queued({ draft: () => [hard], decision: (v) => ({ ...v, weakDistractorIndexes: [0, 2, 3, 9] }) });
  assert.equal(f.job.status, 'complete', f.job.message);
  assert.match(f.created[0].versions[0].warnings.join(' '), /Check options C, D: the independent check found these distractors too easy to rule out/);
});

test('an unsupported explanation now fails for every format, not only True/False', async () => {
  const f = await queued({ draft: (round) => round === 0 ? [hard] : [], decision: (v) => ({ ...v, explanationSupported: false, unsupportedClaims: [] }) });
  assert.equal(f.created.length, 0);
  assert.match(f.rejected[0].errors.join(' '), /The explanation includes claims the source does not support/);
});

test('under Both, a would-be application question that is really recall is sent back when it is the missing style', async () => {
  const recall = { ...mcq('A guild scribe is writing tests. Which matcher compares object contents rather than identity?', 'toBe vs toEqual', 'classify'), blueprint: blueprint('toBe vs toEqual', 'classify', 'application') };
  const concept = mcq('Why does a unit test replace the database with a mock?', 'mocking dependencies', 'explain');
  const real = { ...mcq('This guild test compares two fresh quest objects with toBe and fails. Which change makes it pass, and why?', 'toBe vs toEqual', 'diagnose'), blueprint: blueprint('toBe vs toEqual', 'diagnose', 'application') };
  const isApplication = (q) => q.stem.includes('fresh quest objects');
  const decision = (v, q) => isApplication(q) || q.stem.includes('guild scribe')
    ? { ...v, cognitiveStyle: 'application', answerableWithoutScenario: !isApplication(q), reasoningSteps: ['Read the failing assertion.', 'Apply the identity rule to the two objects.'] }
    : v;
  const f = await queued({ style: 'both', count: 2, draft: (round) => round === 0 ? [concept, recall] : [real], decision });
  assert.equal(f.job.status, 'complete', f.job.message);
  assert.match(f.rejected[0].errors.join(' '), /conceptual recall inside a scenario/, 'the downgraded draft, not the sound conceptual one, is sent back');
  assert.deepEqual(f.created.map((q) => q.assessment.cognitiveStyle).sort(), ['application', 'conceptual']);

  const kept = await queued({ style: 'both', count: 3, draft: () => [concept, real, { ...recall, blueprint: blueprint('mock assertions', 'classify', 'application'), stem: 'A guild scribe is writing tests. Which tool stands in for a dependency?' }], decision });
  assert.equal(kept.job.status, 'complete', kept.job.message);
  const downgraded = kept.created.find((q) => q.assessment.intendedStyle === 'application' && q.assessment.cognitiveStyle === 'conceptual');
  assert.match(downgraded.versions[0].warnings.join(' '), /Drafted as application, but it can be answered without using the scenario details/);
});
