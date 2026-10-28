// ============================================================
// Design and voice guidance in the AI question prompts
// ------------------------------------------------------------
// The brand book says what the game should feel like. This file
// is injected into the AI question prompts so what Gemini writes
// sounds like the game, and it is read on every prompt so the
// team can change the wording without a rebuild or a restart.
//
// The teacher-facing knowledge report deliberately does NOT get
// the game voice: the brand book keeps teacher pages calm and
// conventional.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildUserPrompt, geminiDraft } = require('../src/quiz/generator');
const designGuidance = require('../src/quiz/design-guidance');
const { createAuthoring } = require('../src/quiz/authoring');
const { seed } = require('../src/quiz/seed');

const CTX = {
  course: { title: 'Computing' },
  topic: { name: 'Networks' },
  outcome: { text: 'Explain what latency measures' },
  count: 2,
  format: 'mcq',
  chunks: [{ passageId: 'p1', text: 'Latency measures delay; bandwidth measures capacity.' }],
};

async function settled(j) {
  const deadline = Date.now() + 6000;
  while (['queued', 'running'].includes(j.status)) {
    if (Date.now() > deadline) throw new Error('Job did not settle');
    await new Promise((r) => setTimeout(r, 5));
  }
  return j;
}

// Runs a body with the guidance file pointed somewhere else, then puts the
// environment back the way it was.
function withGuidanceFile(file, body) {
  const before = process.env.DESIGN_GUIDANCE_FILE;
  process.env.DESIGN_GUIDANCE_FILE = file;
  try {
    return body();
  } finally {
    if (before === undefined) delete process.env.DESIGN_GUIDANCE_FILE;
    else process.env.DESIGN_GUIDANCE_FILE = before;
  }
}

test('the guidance file ships with the app and has real content', () => {
  assert.ok(fs.existsSync(designGuidance.DEFAULT_FILE), 'prompts/design-guidance.md should be in the repo');
  const text = designGuidance.designGuidance();
  assert.ok(text.length > 50, 'the guidance file should not be empty');
  assert.match(text, /campfire|adventurer/i, 'the guidance should come from the brand book');
});

test('the question prompt carries the guidance, and the format rules survive it', () => {
  const prompt = buildUserPrompt(CTX);
  assert.ok(prompt.includes(designGuidance.designGuidance()), 'the guidance should be in the prompt verbatim');
  assert.match(prompt, /DESIGN AND VOICE GUIDANCE/);
  // The guidance is style only - the hard rules are still there.
  assert.match(prompt, /type "mcq": exactly 4 options/);
  assert.match(prompt, /SOURCE CHUNKS:/);
});

test('the guidance comes after the material, so it is not buried under it', () => {
  const prompt = buildUserPrompt(CTX);
  assert.ok(
    prompt.indexOf('DESIGN AND VOICE GUIDANCE') > prompt.indexOf('SOURCE CHUNKS:'),
    'the guidance should be the last thing in the prompt',
  );
});

test('the guidance says what it does not override, so it cannot outrank the professor', () => {
  // The prompt rules settle their own order. This block is appended after
  // them, so on its own it says which side wins: it fills the gaps and
  // overrides none of them.
  const block = designGuidance.guidanceBlock();
  assert.match(block, /never overrides/i, 'the block should state its own limits');
  assert.match(block, /professor instructions/i, 'the professor instructions in Prompt.txt should be named');
  assert.match(block, /subject guidance/i, 'the instructor subject guidance should be named');
  assert.match(block, /fills the gap/i, 'the block should say what it does instead');
  // And the promise is kept in the prompt that actually goes to Gemini.
  assert.ok(buildUserPrompt(CTX).includes(block));
});

test('Gemini is actually sent the guidance with the question prompt', async () => {
  let sent = '';
  await geminiDraft(CTX, async (opts) => {
    sent = opts.parts[0].text;
    return { json: { questions: [] }, raw: '', model: 'test' };
  });
  assert.match(sent, /DESIGN AND VOICE GUIDANCE/);
  assert.ok(sent.includes(designGuidance.designGuidance()));
});

test('a missing guidance file leaves the prompt exactly as it was, and does not throw', () => {
  const missing = path.join(os.tmpdir(), 'quizquest-no-such-guidance.md');
  assert.equal(designGuidance.designGuidance(missing), '');
  assert.equal(designGuidance.guidanceBlock(missing), '');
  withGuidanceFile(missing, () => {
    const prompt = buildUserPrompt(CTX);
    assert.doesNotMatch(prompt, /DESIGN AND VOICE GUIDANCE/);
    assert.match(prompt, /SOURCE CHUNKS:/, 'the prompt is otherwise unchanged');
  });
});

test('an edit to the guidance file takes effect on the next prompt, with no restart', () => {
  const file = path.join(os.tmpdir(), 'quizquest-guidance-test.md');
  fs.writeFileSync(file, 'Speak like a pirate.');
  try {
    withGuidanceFile(file, () => {
      assert.match(buildUserPrompt(CTX), /Speak like a pirate/);
      fs.writeFileSync(file, 'Speak like a squirrel.');
      assert.match(buildUserPrompt(CTX), /Speak like a squirrel/, 'the file is read every time');
    });
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test('the teacher-facing knowledge report keeps the calm, conventional voice', async () => {
  const db = seed();
  const course = db.courses.find((c) => c.id === 'c-comp');
  const topic = db.topics.find((t) => t.courseId === course.id);
  const passages = db.passages.filter((p) => p.courseId === course.id && p.topicId === topic.id);
  let prompt = '';
  const run = createAuthoring({
    db,
    persist: async () => {},
    ai: async (opts) => {
      prompt = opts.prompt || '';
      return { json: { markdown: '## Concepts\n' + 'A short report of the lecture. '.repeat(10), insufficient: false }, metrics: {} };
    },
  });
  const job = run.start(course, 'analysis', { passageIds: passages.map((p) => p.id) }, 't-a');
  await settled(job);
  assert.equal(job.status, 'complete', 'the report should have been drafted');
  assert.ok(prompt.length > 0, 'the report should have been drafted');
  assert.doesNotMatch(prompt, /DESIGN AND VOICE GUIDANCE/, 'the game voice is for the student-facing questions');
});
