// ============================================================
// Guard rails around the AI reply and Prompt.txt
// ------------------------------------------------------------
// Three checks on the files that talk to the model:
//   - a reply in a code fence, or with prose around the JSON,
//     is still read
//   - a reply the server cannot read keeps the model's own
//     words, so the debug log has something to show
//   - a Prompt.txt section the app does not use is refused,
//     instead of being read and then dropped
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateJson } = require('../src/quiz/gemini');
const { createQuota } = require('../src/quiz/gemini-quota');
const { parsePrompts } = require('../src/quiz/prompts');

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
