// Transcription errors keep their cause so the upload's AI step can skip one
// declined image but stop on quota or configuration problems.
const test = require('node:test');
const assert = require('node:assert/strict');
const gemini = require('../src/quiz/gemini');
const { transcribe } = require('../src/quiz/vision');

const original = { enabled: gemini.enabled, generateJson: gemini.generateJson };
test.afterEach(() => Object.assign(gemini, original));
const failWith = (props) => {
  gemini.enabled = () => true;
  gemini.generateJson = async () => {
    throw Object.assign(new Error(props.message || 'failed'), props);
  };
  return transcribe({ imageBase64: 'AAAA', mimeType: 'image/png', mode: 'diagram' });
};

test('a declined image is a 422 naming the finish reason', async () => {
  const r = await failWith({ code: 'INCOMPLETE', finishReason: 'RECITATION' });
  assert.equal(r.status, 422);
  assert.match(r.body.error, /declined or could not finish this image \(RECITATION\)/);
});

test('quota, configuration and timeout errors keep distinct statuses', async () => {
  const quota = await failWith({ status: 429, code: 'DAILY_QUOTA', message: 'The shared daily AI quota is exhausted.', retryAt: 123 });
  assert.deepEqual([quota.status, quota.body.retryAt], [429, 123]);
  assert.match(quota.body.error, /daily AI quota/);
  assert.equal((await failWith({ code: 'MODEL_CONFIG', message: 'Configure Gemini' })).status, 503);
  const timeout = await failWith({ code: 'AI_FAILED', cause: Object.assign(new Error('t'), { name: 'TimeoutError' }) });
  assert.equal(timeout.status, 504);
  assert.equal((await failWith({ code: 'AI_FAILED' })).status, 502);
});
