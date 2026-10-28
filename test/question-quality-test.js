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
// The verifier never sees the drafted label, so by default the mock returns
// a hard, three-step solve that lowers nothing.
const THREE_STEPS = ['Note both objects are built separately.', 'Recall that toBe compares identity with Object.is.', 'Conclude the identity check fails although the contents match.'];
async function settled(job) { const until = Date.now() + 5000; while (['queued', 'running'].includes(job.status)) { if (Date.now() > until) throw new Error('Mock job timed out'); await new Promise((r) => setTimeout(r, 2)); } }
async function queued({ style = 'conceptual', count = 1, quantities = { mcq: count }, draft, decision }) {
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
      cognitiveStyle: 'conceptual', answerableWithoutScenario: true, reasoningSteps: THREE_STEPS, answerIndex: 0, answerIndexes: [],
      numericAnswer: null, unsupportedClaims: [], reason: 'Independently solved.', estimatedDifficulty: 'hard', weakDistractorIndexes: [],
      evidence: [{ passageId: q.sourceIds[0], quoteId: data.evidenceAnchors[0].id }],
    }, q)) } };
  } });
  const analysis = queue.start(course, 'report', {}, 't-a'); await settled(analysis);
  await queue.review(course, analysis.id, REPORT, 0);
  const job = queue.start(course, 'generation', { analysisId: analysis.id, reportRevision: 1, topicText: 'Week 10 Testing Fundamentals', learningOutcome: 'Choose and justify Jest matchers and test structure.', assessmentStyle: style, quantities }, 't-a');
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

// --- difficulty calibration and application vs recall ----------------------
// The live Week 10 batch labelled a one-line assertion Hard/Application and a
// single click assertion Medium/Application. These replay those drafts
// against verdicts that follow the new rules: copying givens into one
// assertion is one step, and the verifier no longer sees the drafted label.
const { calibrateDifficulty, stepCeiling, STYLE_RULES, APPLICATION_GUIDE, DIFFICULTY_RULES } = require('../src/quiz/assessment');
const { buildVerificationPrompt } = require('../src/quiz/authoring');
const ONE_STEP = ["Write expect(calculateBonus(15)).toBe('High')."];

test('difficulty is the lowest of the label, the estimate and the step ceiling, and is never raised', () => {
  assert.deepEqual([[], ['a'], ['a', 'b'], ['a', 'b', 'c', 'd'], ['a', ' '], undefined].map(stepCeiling), [null, 'easy', 'medium', 'hard', 'easy', null]);
  assert.equal(calibrateDifficulty('hard', { estimatedDifficulty: 'hard', reasoningSteps: ONE_STEP }), 'easy', 'one inference caps an anchored hard estimate');
  assert.equal(calibrateDifficulty('hard', { estimatedDifficulty: 'medium', reasoningSteps: THREE_STEPS }), 'medium');
  assert.equal(calibrateDifficulty('hard', { estimatedDifficulty: 'easy', reasoningSteps: ['a', 'b'] }), 'easy');
  assert.equal(calibrateDifficulty('hard', { estimatedDifficulty: 'hard', reasoningSteps: THREE_STEPS }), null, 'a genuinely hard question keeps its label');
  assert.equal(calibrateDifficulty('easy', { estimatedDifficulty: 'hard', reasoningSteps: THREE_STEPS }), null, 'never raised');
  assert.equal(calibrateDifficulty('hard', {}), null, 'no verdict leaves the label alone');
  assert.equal(calibrateDifficulty('hard', { estimatedDifficulty: 'extreme', reasoningSteps: 'three' }), null, 'malformed verdicts are ignored');
});

test('regression: "Write a Vitest assertion that calculateBonus(15) returns High" is saved as Easy/Conceptual, not Hard/Application', async () => {
  const vitest = {
    type: 'short', answerMode: 'text', difficulty: 'hard', blueprint: blueprint('writing assertions', 'decide', 'application'),
    stem: "The guild's treasurer has calculateBonus(score). Write a Vitest assertion that calculateBonus(15) returns 'High'.",
    modelAnswer: "expect(calculateBonus(15)).toBe('High');", keyPoints: ['Calls calculateBonus(15) inside expect', "Uses toBe('High')"],
    explanation: 'An assertion compares the received value with the expected one.',
  };
  // A verdict that still says hard and application, but whose own steps show
  // a single transcription.
  const f = await queued({ style: 'both', quantities: { short: 1 }, draft: () => [vitest], decision: (v) => ({
    ...v, cognitiveStyle: 'application', answerableWithoutScenario: false, reasoningSteps: ONE_STEP, estimatedDifficulty: 'hard' }) });
  assert.equal(f.job.status, 'complete', f.job.message);
  assert.equal(f.job.calls, 2, 'no extra Gemini call');
  const [q] = f.created, warnings = q.versions[0].warnings.join(' ');
  assert.equal(q.versions[0].difficulty, 'easy');
  assert.equal(q.assessment.cognitiveStyle, 'conceptual');
  assert.match(warnings, /Drafted as hard, but the independent check judged its reasoning demand easy \(1 reasoning step\)/);
  assert.match(warnings, /Drafted as application, but it can be answered without using the scenario details/);
  assert.equal(q.assessment.intendedStyle, 'application', 'the drafter plan is kept for review');
  assert.doesNotMatch(f.prompts[0], /"difficulty":"hard"/, 'the verifier never sees the drafted label');
});

test('regression: a single Playwright click assertion drafted as Medium/Application is saved as Easy/Conceptual', async () => {
  const click = {
    ...mcq("The guild's scout writes a Playwright test that clicks the 'Join quest' button and checks the 'Welcome, adventurer' banner appears. Which line makes that check?",
      'Playwright visibility assertions', 'decide', { difficulty: 'medium', blueprint: blueprint('Playwright visibility assertions', 'decide', 'application') }),
    options: ["await expect(page.getByText('Welcome, adventurer')).toBeVisible();", "await expect(page.getByText('Welcome, adventurer')).toBeHidden();",
      "await page.getByText('Welcome, adventurer').click();", "expect(page.getByText('Welcome, adventurer')).toBeVisible();"],
  };
  const f = await queued({ style: 'both', draft: () => [click], decision: (v) => ({
    ...v, cognitiveStyle: 'application', answerableWithoutScenario: false, reasoningSteps: ['Pick the visibility matcher for the stated banner.'], estimatedDifficulty: 'medium' }) });
  assert.equal(f.job.status, 'complete', f.job.message);
  assert.equal(f.created[0].versions[0].difficulty, 'easy');
  assert.equal(f.created[0].assessment.cognitiveStyle, 'conceptual');
});

test('the same demand gets the same label in MCQ, True/False, Multi-select and Short Answer', async () => {
  const drafts = [
    mcq('Which matcher compares two separately built objects by their contents?', 'content equality', 'classify', { difficulty: 'hard' }),
    { type: 'tf', stem: 'toBe compares two values with Object.is.', answerIndex: 0, explanation: 'The report says toBe compares with Object.is.', difficulty: 'hard', blueprint: blueprint('toBe identity', 'explain') },
    { type: 'multi', stem: 'Select every matcher the report says compares object contents rather than identity.', options: ['toEqual', 'toStrictEqual', 'toBe', 'toBeNull'], answerIndexes: [0, 1],
      explanation: 'toEqual and toStrictEqual compare contents.', difficulty: 'hard', blueprint: blueprint('content matchers', 'classify') },
    { type: 'short', answerMode: 'text', stem: 'State which matcher compares object contents.', modelAnswer: 'toEqual', keyPoints: ['Names toEqual'],
      explanation: 'The report says toEqual compares contents.', difficulty: 'hard', blueprint: blueprint('naming the content matcher', 'explain') },
  ];
  const key = (q) => drafts.find((d) => d.stem === q.stem);
  const verdict = (steps) => (v, q) => ({ ...v, reasoningSteps: steps, estimatedDifficulty: 'hard', statementTruth: q.type === 'tf' ? true : null,
    answerIndex: ['mcq', 'tf'].includes(q.type) ? 0 : -1, answerIndexes: q.type === 'multi' ? key(q).answerIndexes : [] });
  const quantities = { mcq: 1, tf: 1, multi: 1, short: 1 };
  const easy = await queued({ count: 4, quantities, draft: () => drafts, decision: verdict(['Recall the matcher from the report.']) });
  assert.equal(easy.job.status, 'complete', easy.job.message);
  assert.deepEqual(easy.created.map((q) => [q.versions[0].type, q.versions[0].difficulty]).sort(), [['mcq', 'easy'], ['multi', 'easy'], ['short', 'easy'], ['tf', 'easy']]);
  const hardOnes = await queued({ count: 4, quantities, draft: () => drafts, decision: verdict(THREE_STEPS) });
  assert.equal(hardOnes.job.status, 'complete', hardOnes.job.message);
  assert.deepEqual(hardOnes.created.map((q) => q.versions[0].difficulty), ['hard', 'hard', 'hard', 'hard'], 'a three-step hard verdict keeps Hard in every format');
  assert.ok(hardOnes.created.every((q) => !q.versions[0].warnings.some((w) => /Drafted as/.test(w))));
});

test('a genuinely hard diagnosis keeps Hard/Application, and two steps cap a hard label at Medium', async () => {
  const diagnose = mcq("The guild's test expects calculateBonus(15) to return 'High', but it receives 'Medium'. The rule gives 'High' above 10 and the code checks score > 20. Which fix is justified?",
    'boundary bugs in conditions', 'diagnose', { difficulty: 'hard', blueprint: blueprint('boundary bugs in conditions', 'diagnose', 'application') });
  const steps = ['Read the expected and received values from the failure.', 'Compare the stated rule threshold of 10 with the coded threshold of 20.',
    'Trace score 15 through the coded condition to Medium.', 'Conclude the condition, not the test, must change to score > 10.'];
  const application = (reasoningSteps) => (v) => ({ ...v, cognitiveStyle: 'application', answerableWithoutScenario: false, reasoningSteps, estimatedDifficulty: 'hard' });
  const f = await queued({ style: 'application', draft: () => [diagnose], decision: application(steps) });
  assert.equal(f.job.status, 'complete', f.job.message);
  assert.deepEqual([f.created[0].versions[0].difficulty, f.created[0].assessment.cognitiveStyle], ['hard', 'application']);
  assert.deepEqual(f.created[0].versions[0].warnings, []);
  const two = await queued({ style: 'application', draft: () => [diagnose], decision: application(steps.slice(1, 3)) });
  assert.deepEqual([two.created[0].versions[0].difficulty, two.created[0].assessment.cognitiveStyle], ['medium', 'application']);
});

test('prompts tell the drafter and verifier that transcribing givens is recall, and ask for plausible distractors', async () => {
  for (const rules of [STYLE_RULES, DIFFICULTY_RULES]) assert.doesNotMatch(rules, /\n/, 'shared rules stay on one line');
  assert.match(STYLE_RULES, /writing one assertion, call, selector or command whose inputs and expected result the question already states is syntax recall/);
  assert.match(DIFFICULTY_RULES, /writing a single straightforward assertion, call or command from stated inputs and expected results/);
  assert.match(DIFFICULTY_RULES, /copying a given and writing out syntax are not inferences/);
  assert.match(APPLICATION_GUIDE, /draft it as conceptual and easy/);
  assert.match(COVERAGE_GUIDE, /For mcq and multi, write in blueprint.distractorRationale/);
  const db = seed(), course = db.courses.find((c) => c.id === 'c-comp'), topic = db.topics.find((t) => t.courseId === course.id);
  const drafting = buildUserPrompt({ course, topic, outcome: topic.outcomes[0], count: 2, format: 'mixed', chunks: [{ passageId: 'p', text: REPORT }], quantities: { mcq: 1, short: 1 } });
  assert.match(drafting, /never raise a label to meet the mix/);
  assert.match(drafting, /The adventure frame never supplies an option/);
  assert.match(drafting, /single assertion or call whose inputs and expected result the stem already states is easy syntax recall/);
  const verifying = buildVerificationPrompt({ questions: [{ ...hard, sourceIds: ['p'] }], chunks: [], existingStems: [], guidance: '{}' });
  assert.doesNotMatch(verifying, /"difficulty"/);
  assert.match(verifying, /a one-step task stays easy whether it is mcq, tf, multi or short/);
  assert.match(verifying, /a joke or story-only choice, a different kind of answer from the other options/);
  const f = await queued({ draft: () => [hard], decision: (v) => v });
  assert.match(f.prompts[0], /reading the question, restating or copying a given and writing out syntax are not steps/);
});
