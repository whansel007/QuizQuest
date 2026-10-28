// ============================================================
// Guard rails: rewriting AI drafts in bulk
// ------------------------------------------------------------
// The professor ticks the drafts they want rewritten and asks for
// the style the replacements should be written in. One job covers
// the whole batch, every question keeps its format, and the drafts
// that were replaced are never deleted or rejected.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { createAuthoring } = require('../src/quiz/authoring');
const { createQuizApi } = require('../src/quiz/api');
const http = require('node:http');

const REPORT = [
  'At a constant production rate of 2 units per minute, total output equals rate multiplied by duration.',
  'The assumption of a constant rate must be supplied and justified before any projection is made.',
  'A longer duration increases total output proportionally while the rate stays constant.',
].join(' ');

// Distinct stems and explanations: the duplicate check masks numbers and
// compares word sets, so each question needs its own wording, not a numbered
// copy of the last one.
const DRAFTS = {
  mcq: [
    {
      stem: 'A hypothetical workshop runs at 2 units per minute for 5 minutes. What output follows?',
      explanation: 'Each of the 5 minutes adds 2 units, so the total is 10 units.',
      options: ['10 units', '2 units', '5 units', '7 units'],
      answerIndex: 0,
    },
    {
      stem: 'A hypothetical tank fills at 2 units per minute for 5 minutes. What is the total output?',
      explanation: 'The fill rate is 2 units a minute across 5 minutes, which gives 10 units.',
      options: ['10 units', '2 units', '5 units', '7 units'],
      answerIndex: 0,
    },
    {
      stem: 'A hypothetical assembly line packs 2 units per minute for 5 minutes. How many units are packed?',
      explanation: 'Packing 2 units a minute for 5 minutes yields 10 packed units.',
      options: ['10 units', '2 units', '5 units', '7 units'],
      answerIndex: 0,
    },
    {
      stem: 'A hypothetical filling station adds 2 units per minute for 5 minutes. What is the final level?',
      explanation: 'The level rises by 2 units each minute, so after 5 minutes it stands 10 units higher.',
      options: ['10 units', '2 units', '5 units', '7 units'],
      answerIndex: 0,
    },
    {
      stem: 'A hypothetical pump moves 2 units per minute for 5 minutes. How much is transferred?',
      explanation: 'Moving 2 units a minute for 5 minutes transfers 10 units in total.',
      options: ['10 units', '2 units', '5 units', '7 units'],
      answerIndex: 0,
    },
    {
      stem: 'A hypothetical press stamps 2 units per minute for 5 minutes. How many are stamped?',
      explanation: 'Stamping proceeds at 2 units a minute, and 5 minutes of work produces 10 stamps.',
      options: ['10 units', '2 units', '5 units', '7 units'],
      answerIndex: 0,
    },
  ],
  short: [
    {
      stem: 'Compare how the roles of rate and duration differ in the production model.',
      explanation: 'Rate sets the size of each step and duration sets how many steps run.',
      modelAnswer: 'Rate sets the size of each step and duration sets how many steps run.',
      keyPoints: ['Rate sets the size of each step', 'Duration sets how many steps run'],
    },
    {
      stem: 'State the assumption that lets total output scale with duration.',
      explanation: 'The constant-rate assumption is what lets a measured rate be carried forward.',
      modelAnswer: 'The constant-rate assumption, which must be supplied and justified.',
      keyPoints: ['The constant-rate assumption must be supplied', 'It is what lets the rate be carried forward'],
    },
    {
      stem: 'Explain why the length of a run only matters when the rate is known to be steady.',
      explanation: 'Without a steady rate, a longer run may add fewer steps than the elapsed minutes suggest.',
      modelAnswer: 'The run length only scales the output while the rate is steady.',
      keyPoints: ['A steady rate makes the output proportional to the elapsed minutes', 'A changing rate breaks that proportionality'],
    },
    {
      stem: 'Describe the difference between the rate of production and the accumulated output.',
      explanation: 'One measures each minute; the other totals every minute that has passed.',
      modelAnswer: 'The rate is per minute, while the accumulated output is the running total.',
      keyPoints: ['The rate is measured per minute', 'The accumulated output totals the minutes so far'],
    },
    {
      stem: 'Identify the justification a projection needs before the measured rate is carried forward.',
      explanation: 'The assumption that the rate holds steady has to be supplied and defended.',
      modelAnswer: 'The steady-rate assumption must be supplied and justified.',
      keyPoints: ['The steady-rate assumption has to be supplied', 'It has to be defended before projecting'],
    },
    {
      stem: 'Compare a constant rate with a rate that changes part way through a run.',
      explanation: 'A changing rate breaks the proportionality between elapsed time and output.',
      modelAnswer: 'A constant rate keeps elapsed time and output proportional; a changing rate does not.',
      keyPoints: ['A constant rate keeps output proportional to elapsed time', 'A rate that changes breaks that proportionality'],
    },
  ],
};

async function settled(job) {
  const until = Date.now() + 5000;
  while (['queued', 'running'].includes(job.status)) {
    if (Date.now() > until) throw new Error('Mock job timed out');
    await new Promise((r) => setTimeout(r, 2));
  }
}

// Builds a course with AI drafts in two different topics, and a mock that
// drafts and verifies questions without calling Gemini.
async function fixture({ quantities = { mcq: 1, short: 1 } } = {}) {
  const db = seed();
  const course = db.courses.find((c) => c.id === 'c-comp');
  const topicA = db.topics.find((t) => t.courseId === course.id && t.name === 'Networking basics');
  const topicB = db.topics.find((t) => t.courseId === course.id && t.name === 'Cyber hygiene');
  const stages = [];
  const draftingPrompts = [];
  const used = { mcq: 0, short: 0 };
  let drafted = 0;

  const ai = async (opts) => {
    const stage = opts.requestContext.stage;
    stages.push(stage);
    if (stage === 'analysis') return { json: { markdown: '# Report\n' + REPORT, insufficient: false } };
    if (stage === 'drafting') {
      draftingPrompts.push(opts.prompt);
      const slots = JSON.parse(opts.prompt.match(/remaining slots\): (.*)/)[1]);
      const sourceId = course.authoringJobs.find((j) => j.kind === 'analysis').reportSourceId;
      const items = Object.entries(slots).flatMap(([type, n]) =>
        Array.from({ length: n }, () => {
          const draft = DRAFTS[type][used[type]++ % DRAFTS[type].length];
          drafted += 1;
          const q = { type, stem: draft.stem, explanation: draft.explanation, difficulty: 'medium', sourceIds: [sourceId] };
          if (type === 'mcq') Object.assign(q, { options: draft.options, answerIndex: draft.answerIndex });
          if (type === 'short') Object.assign(q, { answerMode: 'text', modelAnswer: draft.modelAnswer, keyPoints: draft.keyPoints });
          return q;
        }),
      );
      return { json: { questions: items, applicationSupported: true, limitation: '' } };
    }
    // verification
    const data = JSON.parse(opts.prompt.slice(opts.prompt.indexOf('\n') + 1));
    // The drafter follows the style it was asked for, and the verifier
    // agrees with it.
    const requested = (opts.prompt.match(/"style":"(conceptual|application|both)"/) || [])[1] || 'both';
    return {
      json: {
        applicationSupported: true,
        limitation: '',
        checks: data.questions.map((q, index) => {
          const style = requested === 'both' ? (index % 2 ? 'conceptual' : 'application') : requested;
          const anchor = (data.evidenceAnchors || []).find((a) => a.passageId === q.sourceIds[0]);
          return {
            index,
            correct: true,
            oneCorrect: true,
            questionValid: true,
            unambiguous: true,
            explanationSupported: true,
            statementTruth: q.type === 'tf' ? true : null,
            aligned: true,
            duplicate: false,
            fitsConfiguration: true,
            outcomeAligned: true,
            difficultyAppropriate: true,
            scenarioGrounded: true,
            cognitiveStyle: style,
            answerableWithoutScenario: style !== 'application',
            reasoningSteps:
              style === 'application'
                ? ['Identify the supported rule and the scenario givens.', 'Apply the rule to the givens to reach the answer.']
                : ['Recall the supported relationship.'],
            answerIndex: ['mcq', 'tf'].includes(q.type) ? 0 : -1,
            answerIndexes: q.type === 'multi' ? [0, 1] : [],
            numericAnswer: null,
            unsupportedClaims: [],
            reason: 'Source-supported reasoning from the supplied hypothetical givens.',
            evidence: anchor ? [{ passageId: q.sourceIds[0], quoteId: anchor.id }] : [],
          };
        }),
      },
    };
  };

  const queue = createAuthoring({ db, persist: async () => {}, ai });
  const analysis = queue.start(course, 'report', {}, 't-a');
  await settled(analysis);
  await queue.review(course, analysis.id, '# Report\n' + REPORT, 0);

  async function draft(topic, outcome) {
    const job = queue.start(
      course,
      'generation',
      { analysisId: analysis.id, reportRevision: 1, topicId: topic.id, outcomeId: outcome.id, assessmentStyle: 'both', quantities },
      't-a',
    );
    await settled(job);
    assert.equal(job.status, 'complete', job.message);
    return db.questions.filter((q) => q.generationId === job.result.generationId);
  }

  const inA = await draft(topicA, topicA.outcomes[0]);
  // The second topic is only needed by the test that mixes topics.
  let inB = null;
  const draftsInB = async () => (inB ||= await draft(topicB, topicB.outcomes[0]));
  return { db, course, queue, stages, draftingPrompts, inA, draftsInB, ai };
}

test('a batch rewrite is one job that keeps every format and the professor\'s chosen style', async () => {
  const f = await fixture();
  assert.equal(f.inA.length, 2, 'two drafts to rewrite');
  const [mcq, short] = f.inA;

  const job = f.queue.regenerateMany(f.course, f.inA, 't-a', 'application');
  assert.equal(job.input.count, 2, 'one replacement per selected question');
  assert.deepEqual(job.input.quantities, { mcq: 1, short: 1 }, 'each question keeps its own format');
  assert.equal(job.input.assessmentStyle, 'application', 'the professor chooses the style');
  assert.deepEqual([...job.replaces].sort(), [mcq.id, short.id].sort(), 'the job records what it replaces');
  assert.equal(job.status, 'queued');

  const draftsBefore = f.db.questions.filter((q) => q.status === 'draft').length;
  await settled(job);
  assert.equal(job.status, 'complete', job.message);
  assert.equal(job.result.created.length, 2, 'both replacements are drafted');
  assert.ok(f.draftingPrompts.at(-1).includes('"style":"application"'), 'the drafter is told the chosen style');
  assert.equal(mcq.status, 'draft', 'a rewritten draft is never deleted or rejected');
  assert.equal(short.status, 'draft');
  assert.equal(
    f.db.questions.filter((q) => q.status === 'draft').length,
    draftsBefore + 2,
    'the originals stay in the bank next to the replacements',
  );
});

test('one question rewritten on its own keeps the style it already had, unless a new one is asked for', async () => {
  const f = await fixture();
  const [first, second] = f.inA;
  const own = first.assessment.cognitiveStyle;

  const kept = f.queue.regenerate(f.course, first, 't-a');
  assert.equal(kept.input.assessmentStyle, own, 'a single rewrite preserves the original task style');
  await settled(kept);
  assert.equal(kept.status, 'complete', kept.message);

  const forced = f.queue.regenerate(f.course, second, 't-a', 'application');
  assert.equal(forced.input.assessmentStyle, 'application', 'an explicit choice wins');
  await settled(forced);
  assert.equal(forced.status, 'complete', forced.message);
  assert.ok(f.draftingPrompts.at(-1).includes('"style":"application"'));
});

test('a batch rewrite needs one topic, one learning outcome and a style', async () => {
  const f = await fixture();
  const inB = await f.draftsInB();
  assert.throws(
    () => f.queue.regenerateMany(f.course, [f.inA[0], inB[0]], 't-a', 'application'),
    (e) => e.status === 400 && /one topic and learning outcome/.test(e.message),
    'questions from two topics cannot be rewritten together',
  );
  assert.throws(
    () => f.queue.regenerateMany(f.course, f.inA, 't-a'),
    (e) => e.status === 400 && /assessment style/.test(e.message),
    'a batch rewrite needs the style to write in',
  );
  assert.throws(
    () => f.queue.regenerateMany(f.course, [], 't-a', 'application'),
    (e) => e.status === 400,
    'an empty selection is refused',
  );
  assert.throws(
    () => f.queue.regenerateMany(f.course, [...f.inA, ...inB, ...f.inA], 't-a', 'application'),
    (e) => e.status === 400,
    'a batch is bounded',
  );
});

test('the same rewrite asked for twice shares one job', async () => {
  const f = await fixture();
  const first = f.queue.regenerateMany(f.course, f.inA, 't-a', 'application');
  const again = f.queue.regenerateMany(f.course, f.inA, 't-a', 'application');
  assert.equal(again.id, first.id, 'a repeated request does not draft twice');
  await settled(first);
  assert.equal(f.db.questions.filter((q) => q.generationId === first.result.generationId).length, 2);
});

test('the rewrite endpoint is teacher-only, course-scoped and answers with the job', async (t) => {
  const f = await fixture();
  const api = createQuizApi({
    store: { db: f.db, save() {}, async flush() {}, pending: () => false },
    authoringAI: f.ai,
  });
  const server = http.createServer((req, res) => api.handle(req, res));
  await new Promise((r) => server.listen(0, r));
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, path, body, token) => {
    const r = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: r.status, body: await r.json() };
  };

  const teacher = (await request('POST', '/api/login', { userId: 't-a' })).body.token;
  const student = (await request('POST', '/api/login', { userId: 's-01' })).body.token;
  const ids = f.inA.map((q) => q.id);

  assert.equal((await request('POST', '/api/teacher/questions/regenerate', { ids })).status, 401);
  assert.equal((await request('POST', '/api/teacher/questions/regenerate', { ids }, student)).status, 403);
  assert.equal((await request('POST', '/api/teacher/questions/regenerate', { ids: [] }, teacher)).status, 400);

  const other = f.db.courses.find((c) => c.id === 'c-stats');
  const foreign = f.db.questions.find((q) => q.courseId === other.id);
  assert.equal((await request('POST', '/api/teacher/questions/regenerate', { ids: [foreign.id] }, teacher)).status, 404);

  const ok = await request('POST', '/api/teacher/questions/regenerate', { ids, assessmentStyle: 'application' }, teacher);
  assert.equal(ok.status, 202);
  assert.equal(ok.body.count, 2);
  const job = f.db.courses.find((c) => c.id === 'c-comp').authoringJobs.find((j) => j.id === ok.body.id);
  assert.equal(job.input.assessmentStyle, 'application');
  assert.equal(job.input.count, 2);
});
