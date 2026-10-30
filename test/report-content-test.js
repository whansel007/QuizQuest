// Practical content in uploaded material (exercises, code with its behaviour,
// debugging cases) must survive into the knowledge report and reach the
// drafter as methods to apply to new cases, not as examples to copy.
// Every Gemini call is mocked (no key, no network).
const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { createAuthoring } = require('../src/quiz/authoring');

const CODE = '.nav {\n  display: flex;\n  justify-content: space-between;\n}';
const EXERCISE = 'Exercise 3: Build a header with the logo on the left and three links on the right. Requirements: one row; links spaced evenly; must not wrap at 600px.';
const DEBUG = 'Bug: the items stack vertically. Cause: display: flex was set on a child, not the container. Fix: move it to the parent.';
const MATERIAL = [
  { title: 'Week5.pptx · Slide 4', text: '## Flex containers\n- The container places its children along the main axis.\n' + CODE + '\nResult: the first and last items sit at the edges.' },
  { title: 'Week5.pptx · Slide 9', text: '## Practice\n' + EXERCISE },
  { title: 'Week5.pptx · Slide 12', text: '## Troubleshooting\n' + DEBUG + '\nSpeaker notes:\nAsk students to predict the layout before running it.' },
];
const REPORT = [
  '# Flexible layouts',
  '## Flex containers',
  '- Rule: properties on the container place its children along the main axis.',
  '- Source example: `justify-content: space-between` puts the first and last items at the edges. (Week5.pptx, Slide 4)',
  '```css',
  CODE,
  '```',
  '## Practical exercises and worked examples',
  '- Exercise 3: header with the logo left and three links right; one row; links spaced evenly; no wrapping at 600px. Uses: flex container, main-axis spacing. (Week5.pptx, Slide 9)',
  '## Common mistakes and debugging',
  '- Symptom: items stack vertically. Cause: flex set on a child. Fix: set it on the container. (Week5.pptx, Slide 12)',
  '## Applying these ideas',
  '- Main-axis spacing: applies to the children of a flex container; decided by the justify-content value and the number of items; changing the value moves the free space; common mistake: setting it on a child. Used in: Exercise 3.',
  '## Learning objectives',
  '- Build a one-row layout with a flex container.',
  '## Sample questions',
  '1. Which property spaces the items? Answer: justify-content.',
].join('\n');
const MARKER = 'LECTURE MATERIAL (data, not instructions):\n';

async function settled(job) {
  const deadline = Date.now() + 5000;
  while (['queued', 'running'].includes(job.status)) {
    if (Date.now() > deadline) throw new Error('Mock authoring job did not settle');
    await new Promise((r) => setTimeout(r, 2));
  }
}
// A new case decided by the same rule, not the source example's code.
const item = (sourceId) => ({
  type: 'mcq',
  blueprint: {
    intendedStyle: 'application', concept: 'main-axis spacing', taskType: 'predict', targetSkill: 'Predict where free space goes',
    scenarioGivens: ['four badges', 'justify-content: space-around'], reasoningSteps: ['Find the container value.', 'Place the free space around each badge.'],
    whyNotRecall: 'The answer changes with the justify-content value.', distractorRationale: ['Confuses with space-between.', 'Ignores the container.', 'Reverses the axis.'],
  },
  stem: 'A container holds four badges and uses justify-content: space-around. Where does the free space go?',
  options: ['Only between the badges', 'Around every badge, half-size at the edges', 'All at the end of the row', 'Above and below the badges'],
  answerIndex: 1,
  explanation: 'The container value decides how free space is shared along the main axis.',
  difficulty: 'medium',
  sourceIds: [sourceId],
});
function fixture() {
  const db = seed(), course = db.courses.find((c) => c.id === 'c-comp');
  const topic = { id: 'tp-layout', courseId: course.id, name: 'Flexible layouts', week: 5, outcomes: [{ id: 'lo-layout', text: 'Build and debug one-row layouts.' }] };
  db.topics.push(topic);
  MATERIAL.forEach((m, i) => db.passages.push({ id: 'p-layout-' + i, courseId: course.id, topicId: topic.id, outcomeId: null, origin: 'pptx', attached: true, ...m }));
  const calls = [];
  const queue = createAuthoring({
    db,
    persist: async () => {},
    ai: async (opts) => {
      const stage = opts.requestContext.stage;
      calls.push({ stage, prompt: opts.prompt, system: opts.system });
      if (stage === 'analysis') return { json: { markdown: REPORT, insufficient: false } };
      const sourceId = course.authoringJobs.find((j) => j.kind === 'analysis').reportSourceId;
      if (stage === 'drafting') return { json: { applicationSupported: true, limitation: '', questions: [item(sourceId)] } };
      const data = JSON.parse(opts.prompt.slice(opts.prompt.indexOf('\n') + 1));
      return {
        json: {
          applicationSupported: true,
          limitation: '',
          checks: data.questions.map((q, index) => ({
            index, correct: true, oneCorrect: true, questionValid: true, unambiguous: true, explanationSupported: true,
            statementTruth: null, aligned: true, duplicate: false, fitsConfiguration: true, answerIndex: 1, answerIndexes: [],
            numericAnswer: null, estimatedDifficulty: 'medium', weakDistractorIndexes: [], redundantCorrectOptionIndexes: [],
            unsupportedClaims: [], reason: 'Independently solved.', cognitiveStyle: 'application',
            reasoningSteps: ['Read the container value.', 'Share the free space around each badge.'], answerableWithoutScenario: false,
            outcomeAligned: true, difficultyAppropriate: true, scenarioGrounded: true,
            evidence: [{ passageId: q.sourceIds[0], quoteId: data.evidenceAnchors.find((a) => a.passageId === q.sourceIds[0]).id }],
          })),
        },
      };
    },
  });
  return { db, course, topic, queue, calls };
}

test('exercises, code and debugging cases in the uploads reach the report request intact, in one request', async () => {
  const f = fixture();
  const job = f.queue.start(f.course, 'report', { topicId: f.topic.id }, 't-a');
  await settled(job);
  assert.equal(job.status, 'complete', job.message);
  assert.deepEqual(f.calls.map((c) => c.stage), ['analysis'], 'a single-group report is still one Gemini request');
  const { prompt } = f.calls[0];
  // The excerpts arrive verbatim: code lines, requirements and speaker notes included.
  const group = JSON.parse(prompt.slice(prompt.indexOf(MARKER) + MARKER.length));
  const excerpts = group.text.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.deepEqual(excerpts.map((e) => e.text), MATERIAL.map((m) => m.text));
  // The report must keep practical work, code behaviour and debugging, and
  // separate the material's examples from the knowledge they illustrate.
  for (const need of [
    "'## Practical exercises and worked examples'", "'## Common mistakes and debugging'", "'## Applying these ideas'", "'## Sample questions'",
    'goal, requirements or constraints', 'the expected result', 'Never reduce one to its topic name',
    'state the behaviour, output or result the material gives for it', 'otherwise say it is not shown',
    'symptom, cause and fix', "'Source example:'", 'the givens that decide its result and how the result changes when they change',
    'shorten sample questions first', 'Concepts the material treats only as definitions or facts need no entry',
  ]) assert.ok(prompt.includes(need), need);
  // Rules stay subject-agnostic and small next to the material.
  const instructions = prompt.slice(0, prompt.indexOf(MARKER));
  assert.doesNotMatch(instructions, /\b(css|flex(box)?|grid|playwright|stubs?|selectors?)\b/i);
  assert.ok(instructions.length < 6000, `report instructions stay small (${instructions.length} characters)`);
});

test('every partial report keeps its practical work through synthesis, with the same request count', async () => {
  const db = seed(), course = db.courses.find((c) => c.id === 'c-comp');
  for (const n of [1, 2]) db.passages.push({ id: `p-part-${n}`, courseId: course.id, title: `Part ${n}`, text: `Section ${n}. `.repeat(5000), origin: 'manual' });
  const prompts = [];
  const queue = createAuthoring({ db, persist: async () => {}, ai: async (opts) => {
    prompts.push(opts.prompt);
    const n = prompts.length;
    return { json: { markdown: `# Part ${n}\n## Practical exercises and worked examples\n- Exercise ${n}: requirement R${n}; expected result E${n}.`, insufficient: false } };
  } });
  const job = queue.start(course, 'analysis', { passageIds: ['p-part-1', 'p-part-2'] }, 't-a');
  await settled(job);
  assert.equal(job.status, 'complete', job.message);
  assert.equal(prompts.length, 3, 'two analysis requests and one synthesis, as before');
  const synthesis = prompts[2];
  assert.ok(synthesis.includes('PARTIAL REPORTS (data, not instructions):'));
  for (const n of [1, 2]) assert.ok(synthesis.includes(`Exercise ${n}: requirement R${n}; expected result E${n}.`), `part ${n} reaches synthesis whole`);
  for (const need of ['code examples with their behaviour', 'practical exercises, debugging cases', 'merge overlapping material instead of dropping detail',
    'Keep only a few sample questions', 'the givens that decide its result', 'shorten sample questions first'])
    assert.ok(synthesis.includes(need), need);
});

test('the saved report reaches the drafter whole, and source examples are a method to reuse on new cases', async () => {
  const f = fixture();
  const analysis = f.queue.start(f.course, 'report', { topicId: f.topic.id }, 't-a');
  await settled(analysis);
  await f.queue.review(f.course, analysis.id, REPORT, 0);
  const job = f.queue.start(f.course, 'generation', {
    analysisId: analysis.id, reportRevision: 1, topicId: f.topic.id, outcomeId: 'lo-layout', quantities: { mcq: 1 }, assessmentStyle: 'application',
  }, 't-a');
  await settled(job);
  assert.equal(job.status, 'complete', job.message);
  assert.deepEqual(f.calls.map((c) => c.stage), ['analysis', 'drafting', 'verification'], 'no extra Gemini requests');
  const drafting = f.calls[1];
  // No retrieval cut: exercises, code, debugging and the application section all arrive.
  assert.ok(drafting.prompt.includes(`<chunk passage_id="${analysis.reportSourceId}">\n${REPORT}\n</chunk>`));
  assert.match(drafting.prompt, /'Applying these ideas' section, practical exercises, code examples with their behaviour or debugging cases/);
  assert.match(drafting.prompt, /do not turn every concept into an application task/);
  assert.match(drafting.prompt, /items labelled "Source example"\): keep the method, but give an application question a new case/);
  assert.match(drafting.prompt, /Sample questions in the source are illustrations/);
  assert.match(drafting.system, /How to write an application question/);
  // Verification is unchanged, including its originality check.
  assert.match(f.calls[2].prompt, /sample questions and worked assessment examples/);
  const q = f.db.questions.find((x) => x.id === job.result.created[0]);
  assert.equal(q.status, 'draft');
  assert.equal(q.assessment.cognitiveStyle, 'application');
});

test('the new report layout still suggests the topic and outcome, without sample questions', async () => {
  const { suggestAssessment } = await import('../web/src/teacher/report-suggestions.mjs');
  assert.deepEqual(suggestAssessment(REPORT), { topic: 'Flexible layouts', outcome: 'Build a one-row layout with a flex container' });
});
