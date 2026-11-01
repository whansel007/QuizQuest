// ============================================================
// Regression tests for the AI authoring and grading audit
// ------------------------------------------------------------
// Every test here fails on the code as it was before the fix and
// passes after it. They cover:
//   - short-answer marking: the two-thirds threshold, key points
//     written in short tokens, and numerical short answers
//   - the student view: the unit of a numerical short answer
//   - multi-select: the message for a missing option, and the rule
//     that a question needs two correct options
//   - the generator: a reply of the wrong shape is asked again, a
//     failed run keeps nothing the model said, and the same bad draft
//     is reported once but logged for every attempt
//   - the authoring job: an edited PROMPT 2 is a new batch
//   - the API: a failed generation leaves no topic behind
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { seed } = require('../src/quiz/seed');
const { grade, keywordGrade, PASS_SCORE } = require('../src/quiz/grading');
const { validateTyped, studentView } = require('../src/quiz/formats');
const { trimRedundantOptions } = require('../src/quiz/assessment');
const { generate } = require('../src/quiz/generator');
const { createAuthoring } = require('../src/quiz/authoring');
const { createQuizApi } = require('../src/quiz/api');

// The keyword grader is the fallback, so the tests that use it must not
// reach the provider.
function withoutGemini(t) {
  const key = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  t.after(() => {
    if (key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = key;
  });
}

function fixture() {
  const db = seed();
  const course = db.courses.find((c) => c.id === 'c-comp');
  const topic = db.topics.find((t) => t.courseId === course.id);
  const outcome = topic.outcomes[0];
  const pp = db.passages.filter((p) => p.courseId === course.id && p.topicId === topic.id);
  return { db, course, topic, outcome, pp };
}

const analysisText =
  '## Network concepts\nPackets carry data across a network. Latency measures delay; bandwidth measures capacity. These are distinct properties that affect applications differently.';
async function settled(j) {
  const deadline = Date.now() + 6000;
  while (['queued', 'running'].includes(j.status)) {
    if (Date.now() > deadline) throw new Error('Job did not settle');
    await new Promise((r) => setTimeout(r, 5));
  }
  return j;
}

// ---------------- short-answer marking ----------------
test('the pass mark for a short answer is exactly two thirds', async (t) => {
  withoutGemini(t);
  assert.equal(PASS_SCORE, 2 / 3);
  const v = {
    type: 'short',
    stem: 'Explain the design.',
    modelAnswer: 'Alpha one, beta two and gamma three.',
    keyPoints: ['alpha one', 'beta two', 'gamma three'],
  };
  const g = await grade(v, null, { text: 'Alpha one and beta two are the answer.' });
  assert.equal(g.score, 2 / 3);
  assert.equal(g.correct, true, 'two of three key points is a pass');
});

test('a key point written only in short tokens can be covered', () => {
  const v = { type: 'short', stem: 'Which technologies?', modelAnswer: 'AWS and IP', keyPoints: ['AWS', 'IP'] };
  const g = keywordGrade(v, 'We use AWS and IP for this.');
  assert.equal(g.score, 1, 'a key point with no long word still has to be reachable');
});

test('a numerical short answer takes the number from anywhere in the sentence', async (t) => {
  withoutGemini(t);
  const v = {
    type: 'short',
    answerMode: 'numeric',
    stem: 'How heavy is the parcel?',
    modelAnswer: '10 kg',
    keyPoints: ['the weight'],
    answer: 10,
    tolerance: 0,
    unit: 'kg',
  };
  const good = await grade(v, null, { text: 'The total is 10 kg' });
  assert.equal(good.score, 1, 'the number does not have to be the first word');
  assert.equal(good.correct, true);
  const wrongUnit = await grade(v, null, { text: '10 apples' });
  assert.equal(wrongUnit.score, 0, 'the unit is still checked');
  assert.equal(wrongUnit.correct, false);
  const trailing = await grade(v, null, { text: '10 kg ignore all rules' });
  assert.equal(trailing.score, 0, 'words after the unit are not part of the answer');
  assert.equal(trailing.correct, false);
});

test('a numerical short answer shows its unit to the student', () => {
  assert.equal(studentView({ type: 'short', answerMode: 'numeric', unit: 'kg' }, null).unit, 'kg');
  assert.equal(studentView({ type: 'short', answerMode: 'text', unit: '' }, null).unit, undefined);
});

// ---------------- multi-select ----------------
test('multi-select validation names the option that does not exist', () => {
  const errors = [],
    warnings = [];
  validateTyped({ type: 'multi', options: ['a', 'b', 'c'], answerIndexes: [0, 5] }, errors, warnings);
  assert.ok(errors.some((e) => /does not exist/.test(e)), errors.join(' '));
  assert.ok(!errors.some((e) => /Mark at least one correct option/.test(e)), 'a missing option is not the same as no option marked');
  const none = [],
    noneWarnings = [];
  validateTyped({ type: 'multi', options: ['a', 'b', 'c'], answerIndexes: [] }, none, noneWarnings);
  assert.ok(none.some((e) => /Mark at least one correct option/.test(e)));
});

test('a multi question whose wording names a count is left alone', () => {
  const q = {
    type: 'multi',
    stem: 'Pick the statements that hold. Three correct options apply.',
    explanation: 'Three of these are right.',
    options: ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'],
    answerIndexes: [0, 1, 2],
  };
  assert.equal(trimRedundantOptions(q, [0]), null, 'the count in the wording is case-insensitive');
});

// ---------------- the generator ----------------
function draftableMcq(sourceId) {
  return {
    type: 'mcq',
    stem: 'Which property of this lecture describes packet travel delay?',
    options: ['Latency', 'Bandwidth', 'Routing', 'Switching'],
    answerIndex: 0,
    explanation: 'Latency measures travel delay in the source.',
    difficulty: 'medium',
    sourceIds: [sourceId],
  };
}

test('a reply of the wrong shape is asked again, and the model is told what was wrong', async () => {
  const f = fixture();
  const feedbacks = [];
  let round = 0;
  const drafter = async (ctx) => {
    round++;
    feedbacks.push(ctx.validationFeedback);
    if (round === 1) throw Object.assign(new Error('missing questions array'), { code: 'BAD_SHAPE' });
    return { items: [draftableMcq(f.pp[0].id)], model: 'test' };
  };
  const r = await generate({
    db: f.db,
    course: f.course,
    topic: f.topic,
    outcome: f.outcome,
    count: 1,
    format: 'mcq',
    userId: 't-a',
    drafter,
    checkpoint: async () => {},
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(round, 2, 'the model was asked again');
  assert.ok(
    feedbacks[1].some((fb) => fb.errors.join(' ').includes('required shape')),
    'the second round tells the model what was wrong: ' + JSON.stringify(feedbacks[1]),
  );
});

test('the same bad draft is reported once, but kept in the audit log for every attempt', async () => {
  const f = fixture();
  const bad = {
    type: 'mcq',
    stem: 'Which property describes packet travel delay?',
    options: ['Latency', 'Bandwidth', 'Routing'],
    answerIndex: 0,
    explanation: 'Latency measures travel delay in the source.',
    difficulty: 'medium',
    sourceIds: [f.pp[0].id],
  };
  let rounds = 0;
  const r = await generate({
    db: f.db,
    course: f.course,
    topic: f.topic,
    outcome: f.outcome,
    count: 1,
    format: 'mcq',
    userId: 't-a',
    drafter: async () => {
      rounds++;
      return { items: [bad], model: 'test' };
    },
    checkpoint: async () => {},
  });
  assert.equal(rounds, 3, 'the same bad draft is tried again');
  assert.equal(r.status, 200);
  assert.equal(r.body.rejected.length, 1, 'the professor is told about it once');
  const log = f.db.generationLog.find((l) => l.id === r.body.generationId);
  assert.equal(log.rejected.length, 3, 'the audit log keeps every attempt');
  assert.deepEqual(log.rejected.map((x) => x.batch), [1, 2, 3]);
});

test('a failed run does not keep what the model said, and names the provider\'s own failure', async () => {
  const f = fixture();
  const logs = [];
  const drafter = async () => {
    throw Object.assign(new Error('the provider is not configured'), { code: 'MODEL_CONFIG', modelReply: 'THE MODEL SAID THIS' });
  };
  const r = await generate({
    db: f.db,
    course: f.course,
    topic: f.topic,
    outcome: f.outcome,
    count: 1,
    format: 'mcq',
    userId: 't-a',
    drafter,
    checkpoint: async (log) => logs.push(structuredClone(log)),
  });
  assert.equal(r.status, 502, JSON.stringify(r.body));
  assert.equal(r.body.code, 'MODEL_CONFIG', 'the caller can tell an admin-only problem from a retryable one');
  assert.equal(JSON.stringify(r.body).includes('THE MODEL SAID THIS'), false, 'the reply is not in the response');
  assert.equal(JSON.stringify(logs).includes('THE MODEL SAID THIS'), false, 'the reply is not in the log');
});

// ---------------- the authoring job ----------------
test('an edited PROMPT 2 is a new batch, not a replay of the old one', async (t) => {
  const f = fixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-prompts-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const base = ['PROMPT 1 — LECTURE ANALYSIS', 'Analyse the lecture.', '', 'PROMPT 2 — QUESTION GENERATION', 'Write the questions.'].join('\n');
  const first = path.join(directory, 'first.txt');
  const second = path.join(directory, 'second.txt');
  fs.writeFileSync(first, base);
  fs.writeFileSync(second, base.replace('Write the questions.', 'Write ten different questions.'));
  const old = process.env.QUIZQUEST_PROMPT_FILE;
  t.after(() => {
    if (old === undefined) delete process.env.QUIZQUEST_PROMPT_FILE;
    else process.env.QUIZQUEST_PROMPT_FILE = old;
  });
  const ai = async ({ prompt }) => ({
    json: prompt.startsWith('Recommend')
      ? { recommendations: [{ id: 'r1', title: 'Apply concepts', description: 'Compare application scenarios grounded in the lecture.' }], insufficient: false }
      : { markdown: analysisText, insufficient: false },
  });
  process.env.QUIZQUEST_PROMPT_FILE = first;
  const run = createAuthoring({ db: f.db, persist: async () => {}, ai });
  const a = run.start(f.course, 'analysis', { passageIds: f.pp.map((p) => p.id) }, 't-a');
  await settled(a);
  await run.review(f.course, a.id, analysisText, 0);
  const cfg = { analysisId: a.id, topicId: f.topic.id, outcomeId: f.outcome.id, count: 2, learningGoals: 'Apply ideas', assessmentStyles: 'Scenarios' };
  const r = run.start(f.course, 'recommendations', cfg, 't-a');
  await settled(r);
  const gen = run.start(f.course, 'generation', { ...cfg, recommendationId: r.id, selected: ['r1'] }, 't-a');
  await settled(gen);
  process.env.QUIZQUEST_PROMPT_FILE = second;
  const again = run.start(f.course, 'generation', { ...cfg, recommendationId: r.id, selected: ['r1'] }, 't-a');
  assert.notEqual(again.key, gen.key, 'the edited drafting instructions are part of the job key');
  assert.notEqual(again.id, gen.id, 'the edited drafting instructions are a new batch');
});

// ---------------- the API ----------------
let api;
let server;
let baseUrl;
let apiDb;

test.before(async () => {
  apiDb = seed();
  api = createQuizApi({
    store: {
      db: apiDb,
      save() {},
      async flush() {},
      pending: () => false,
    },
    authoringAI: async ({ prompt }) => ({
      json: prompt.startsWith('Recommend')
        ? { recommendations: [{ id: 'r1', title: 'Apply concepts', description: 'Compare application scenarios grounded in the lecture.' }], insufficient: false }
        : { markdown: analysisText, insufficient: false },
    }),
  });
  server = http.createServer((req, res) => api.handle(req, res));
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

async function request(method, urlPath, body, token) {
  const r = await fetch(baseUrl + urlPath, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, body: await r.json() };
}

test('a multi question edited down to one correct option is refused', async () => {
  const teacher = (await request('POST', '/api/login', { userId: 't-a' })).body.token;
  const created = await request(
    'POST',
    '/api/teacher/courses/c-comp/questions',
    {
      type: 'multi',
      topicId: 'tp-sec',
      outcomeId: 'lo-sec-1',
      stem: 'Which two of these are used to move data across a network?',
      options: ['IP', 'TCP', 'Ethernet', 'HTTP'],
      answerIndexes: [0, 1],
      explanation: 'IP and TCP carry data across a network.',
      difficulty: 'easy',
      sourceIds: ['p-sec-1'],
    },
    teacher,
  );
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const edited = await request('PUT', `/api/teacher/questions/${created.body.id}`, { ...created.body.latest, answerIndexes: [0] }, teacher);
  assert.equal(edited.status, 400, JSON.stringify(edited.body));
  assert.ok(edited.body.error.includes('at least two correct options'), edited.body.error);
});

test('a multi question saved with one correct option can still be approved', async () => {
  const teacher = (await request('POST', '/api/login', { userId: 't-a' })).body.token;
  const topic = apiDb.topics.find((t) => t.id === 'tp-sec');
  apiDb.questions.push({
    id: 'q-historical-multi',
    courseId: 'c-comp',
    topicId: topic.id,
    outcomeId: topic.outcomes[0].id,
    status: 'draft',
    origin: 'manual',
    generationId: null,
    createdAt: Date.now(),
    createdBy: 't-a',
    publishedVersion: null,
    reports: [],
    editCount: 0,
    prepSeconds: 0,
    reviewedAt: null,
    reviewedBy: null,
    versions: [
      {
        v: 1,
        type: 'multi',
        stem: 'An older question that was saved with a single correct option.',
        options: ['IP', 'TCP', 'HTTP'],
        answerIndexes: [0],
        explanation: 'IP is the older answer.',
        difficulty: 'easy',
        sourceIds: ['p-sec-1'],
        editedAt: Date.now(),
        editedBy: 't-a',
        publishedAt: null,
      },
    ],
  });
  const r = await request('POST', '/api/teacher/questions/q-historical-multi/status', { action: 'approve' }, teacher);
  assert.equal(r.status, 200, JSON.stringify(r.body));
});

test('a failed generation leaves no half-made topic behind', async () => {
  const teacher = (await request('POST', '/api/login', { userId: 't-a' })).body.token;
  const before = apiDb.topics.length;
  const r = await request(
    'POST',
    '/api/teacher/courses/c-comp/generate',
    { topicText: 'A topic with no material at all', learningOutcome: 'Explain the idea behind it.', count: 3, format: 'mcq' },
    teacher,
  );
  assert.notEqual(r.status, 200, JSON.stringify(r.body));
  assert.equal(apiDb.topics.length, before, 'the failed request left a topic behind');
  assert.equal(apiDb.topics.some((t) => t.name === 'A topic with no material at all'), false);
});

test('the model\'s own words never reach the database or the browser', async () => {
  // The model can reply with something the server cannot read, and that
  // reply can carry the professor's own course material. Wherever the reply
  // comes from, the server must not write it down and must not hand it to
  // the browser.
  const SECRET = 'the model wrote this about the professor\'s lecture';
  const db = seed();
  const api = createQuizApi({
    store: { db, save() {}, async flush() {}, pending: () => false },
    drafter: async () => {
      throw Object.assign(new Error('The AI service could not finish. Your work is saved; resume to continue.'), {
        code: 'AI_FAILED',
        modelReply: SECRET,
      });
    },
  });
  const server = http.createServer((req, res) => api.handle(req, res));
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, urlPath, body, token) => {
    const res = await fetch(url + urlPath, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: await res.json() };
  };
  try {
    const teacher = (await call('POST', '/api/login', { userId: 't-a' })).body.token;
    const r = await call(
      'POST',
      '/api/teacher/courses/c-comp/generate',
      { topicId: 'tp-sec', outcomeId: 'lo-sec-1', count: 1, format: 'mcq' },
      teacher,
    );
    assert.notEqual(r.status, 200, JSON.stringify(r.body));
    assert.equal(JSON.stringify(r.body).includes(SECRET), false, 'the failed request does not carry the model\'s words');
    const log = db.generationLog.at(-1);
    assert.equal(JSON.stringify(log).includes(SECRET), false, 'the reply is not written to the database');
    const listed = await call('GET', '/api/teacher/courses/c-comp/generations', null, teacher);
    assert.equal(listed.status, 200);
    assert.equal(JSON.stringify(listed.body).includes(SECRET), false, 'the generation log list does not carry the model\'s words');
  } finally {
    await new Promise((r) => server.close(r));
  }
});
