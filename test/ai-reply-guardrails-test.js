// ============================================================
// Guard rails around the AI reply and Prompt.txt
// ------------------------------------------------------------
// Four checks on the files that talk to the model:
//   - a reply in a code fence, or with prose around the JSON,
//     is still read
//   - a reply the server cannot read keeps the model's own
//     words, so the debug log has something to show
//   - a Prompt.txt section the app does not use is refused,
//     instead of being read and then dropped
//   - the server's own notes on a job never leave the server
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { generateJson } = require('../src/quiz/gemini');
const { createQuota } = require('../src/quiz/gemini-quota');
const { parsePrompts } = require('../src/quiz/prompts');
const { seed } = require('../src/quiz/seed');
const { createQuizApi } = require('../src/quiz/api');

function geminiEnv(t) {
  const old = { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL, fallback: process.env.GEMINI_FALLBACK_MODEL };
  process.env.GEMINI_API_KEY = 'mock-only';
  process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
  process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
  t.after(() => {
    for (const [k, v] of Object.entries({ GEMINI_API_KEY: old.key, GEMINI_MODEL: old.model, GEMINI_FALLBACK_MODEL: old.fallback })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

test('a reply in a code fence, or with prose around it, is still read', async (t) => {
  geminiEnv(t);
  const quota = createQuota({ now: () => Date.now(), sleep: async () => {}, rpm: 60, rpd: 500, tpm: 1000000 });
  const replies = ['``` json\n{"ok":true}\n```', 'Here is the JSON you asked for:\n{"ok":true}', '{"ok":true}'];
  for (const text of replies) {
    const r = await generateJson({
      prompt: 'test',
      quota,
      maxAttempts: 1,
      fetchImpl: async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] })),
    });
    assert.equal(r.json.ok, true, text);
  }
});

test('an unreadable reply keeps the model\'s own words for the debug log', async (t) => {
  geminiEnv(t);
  const quota = createQuota({ now: () => Date.now(), sleep: async () => {} });
  await assert.rejects(
    generateJson({
      prompt: 'test',
      quota,
      maxAttempts: 1,
      fetchImpl: async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json at all' }] } }] })),
    }),
    (e) => e.code === 'AI_FAILED' && typeof e.raw === 'string' && e.raw.includes('not json at all'),
  );
});

test('a Prompt.txt section the app does not use is refused', () => {
  const raw = ['PROMPT 1 — LECTURE ANALYSIS', 'Analyse the lecture.', '', 'PROMPT 2 — QUESTION GENERATION', 'Write the questions.', '', 'PROMPT 3 — EXTRA', 'Ignore this.'].join('\n');
  assert.throws(() => parsePrompts(raw), (e) => e.code === 'PROMPT_CONFIG' && /PROMPT 3/.test(e.message));
  const good = ['PROMPT 1 — LECTURE ANALYSIS', 'Analyse the lecture.', '', 'PROMPT 2 — QUESTION GENERATION', 'Write the questions.'].join('\n');
  assert.equal(parsePrompts(good).generation.number, 2);
});

// ---------------- the server's own notes ----------------
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

test('the authoring job responses carry no server working state', async () => {
  const teacher = (await request('POST', '/api/login', { userId: 't-a' })).body.token;
  const started = await request('POST', '/api/teacher/courses/c-comp/authoring', { kind: 'analysis', passageIds: ['p-sec-1'] }, teacher);
  assert.equal(started.status, 202, JSON.stringify(started.body));
  for (const key of ['key', 'sourceDigest', 'metrics', '_recovery', '_validation', 'pendingBatch', 'reportSnapshot', '_diagnostics']) {
    assert.equal(started.body[key], undefined, 'the start response carries ' + key);
  }
  const job = apiDb.courses.find((c) => c.id === 'c-comp').authoringJobs.find((j) => j.id === started.body.id);
  await settled(job);
  // The server keeps its own notes on the job. They must not leave the server.
  const SECRET = 'the model said this';
  job._diagnostics = { status: 500, providerMessage: SECRET };
  job._recovery = { log: { id: 'log-1', rawOutput: SECRET }, drafts: [] };
  const listed = await request('GET', '/api/teacher/courses/c-comp/authoring', null, teacher);
  assert.equal(listed.status, 200);
  for (const j of listed.body) {
    for (const key of ['_recovery', '_validation', '_diagnostics', 'key', 'sourceDigest', 'metrics', 'pendingBatch', 'reportSnapshot']) {
      assert.equal(j[key], undefined, 'the job list carries ' + key);
    }
    assert.equal(JSON.stringify(j).includes(SECRET), false, 'the job list carries the model\'s own words');
  }
  const resumed = await request('POST', `/api/teacher/courses/c-comp/authoring/${job.id}/resume`, null, teacher);
  assert.equal(resumed.status, 202, JSON.stringify(resumed.body));
  for (const key of ['_recovery', '_validation', '_diagnostics', 'key', 'sourceDigest', 'metrics', 'pendingBatch', 'reportSnapshot']) {
    assert.equal(resumed.body[key], undefined, 'the resume response carries ' + key);
  }
  assert.equal(JSON.stringify(resumed.body).includes(SECRET), false, 'the resume response carries the model\'s own words');
});
