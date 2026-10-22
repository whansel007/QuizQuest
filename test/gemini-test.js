const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createQuota, dayKey, nextDay } = require('../src/quiz/gemini-quota');
const { generateJson } = require('../src/quiz/gemini');
const success = () =>
  new Response(
    JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }],
      usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 5, totalTokenCount: 25 },
    }),
  );
function clock() {
  let time = Date.parse('2026-10-15T12:00:00Z');
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms;
    },
    advance: (ms) => {
      time += ms;
    },
  };
}
function env(t) {
  const old = { key: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL, fallback: process.env.GEMINI_FALLBACK_MODEL };
  process.env.GEMINI_API_KEY = 'test-secret';
  process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
  process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.1-flash-lite';
  t.after(() => {
    for (const [k, v] of Object.entries({ GEMINI_API_KEY: old.key, GEMINI_MODEL: old.model, GEMINI_FALLBACK_MODEL: old.fallback })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}
test('shared RPM, TPM and RPD reservations persist across restart and both models', async () => {
  const c = clock(),
    directory = path.resolve('tmp/gemini-quota-tests');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `ledger-${Date.now()}.json`);
  const q = createQuota({ ...c, file, rpm: 2, tpm: 100, rpd: 3 });
  await q.reserve({ tokens: 60, model: 'gemini-3.5-flash-lite' });
  await q.reserve({ tokens: 60, model: 'gemini-3.1-flash-lite' });
  assert.ok(c.now() >= Date.parse('2026-10-15T12:01:00Z'), 'TPM must wait even when model changes');
  const reload = createQuota({ ...c, file, rpm: 2, tpm: 100, rpd: 3 });
  await reload.reserve({ tokens: 20, model: 'gemini-3.5-flash-lite' });
  await assert.rejects(reload.reserve({ tokens: 1, model: 'gemini-3.1-flash-lite' }), (e) => e.code === 'DAILY_QUOTA');
  assert.equal(reload.snapshot().events.length, 3);
  assert.equal(fs.readFileSync(file, 'utf8').includes('test-secret'), false);
});
test('daily reset follows Pacific midnight including daylight saving time', () => {
  const summer = Date.parse('2026-07-15T06:59:00Z'),
    winter = Date.parse('2026-12-15T07:59:00Z');
  assert.equal(dayKey(summer), dayKey(summer - 60000));
  assert.notEqual(dayKey(summer), dayKey(summer + 60000));
  assert.equal(nextDay(summer), Date.parse('2026-07-15T07:00:00Z'));
  assert.equal(nextDay(winter), Date.parse('2026-12-15T08:00:00Z'));
});

test('simultaneous consumers share reservations and cannot overrun the daily budget', async () => {
  const c = clock(), quota = createQuota({ ...c, rpd: 4 });
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => quota.reserve({
    tokens: 100, model: index % 2 ? 'gemini-3.1-flash-lite' : 'gemini-3.5-flash-lite',
  })));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 4);
  assert.ok(results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'DAILY_QUOTA'));
  const events = quota.snapshot().events;
  assert.equal(events.length, 4);
  assert.equal(new Set(events.map((e) => e.id)).size, 4);
  assert.ok(events.every((e, i) => !i || e.at - events[i - 1].at >= 4050));
});
test('429 respects server cooldown without switching models and counts every attempt', async (t) => {
  env(t);
  const c = clock(),
    q = createQuota({ ...c });
  let calls = 0;
  const models = [];
  const result = await generateJson({
    ...c,
    quota: q,
    prompt: 'test',
    fetchImpl: async (url) => {
      models.push(url);
      calls++;
      if (calls === 1)
        return new Response(
          JSON.stringify({ error: { details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '6s' }] } }),
          { status: 429, headers: { 'retry-after': '6' } },
        );
      return success();
    },
  });
  assert.equal(result.json.ok, true);
  assert.equal(calls, 2);
  assert.equal(new Set(models).size, 1);
  assert.equal(q.snapshot().events.length, 2);
  assert.ok(c.now() >= Date.parse('2026-10-15T12:00:06Z'));
});
test('daily provider quota blocks fallback and future consumers until reset', async (t) => {
  env(t);
  const c = clock(),
    q = createQuota({ ...c });
  let calls = 0;
  await assert.rejects(
    generateJson({
      ...c,
      quota: q,
      prompt: 'test',
      fetchImpl: async () => {
        calls++;
        return new Response(
          JSON.stringify({
            error: {
              details: [
                {
                  '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
                  violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }],
                },
              ],
            },
          }),
          { status: 429 },
        );
      },
    }),
    (e) => e.code === 'DAILY_QUOTA',
  );
  assert.equal(calls, 1);
  await assert.rejects(q.reserve({ tokens: 1, model: 'gemini-3.1-flash-lite' }), (e) => e.code === 'DAILY_QUOTA');
});
test('configured fallback handles unavailable primary; paid models and incomplete output fail closed', async (t) => {
  env(t);
  const c = clock(),
    q = createQuota({ ...c }),
    models = [];
  const r = await generateJson({
    ...c,
    quota: q,
    prompt: 'test',
    fetchImpl: async (url) => {
      models.push(url);
      return models.length === 1 ? new Response('{}', { status: 503 }) : success();
    },
  });
  assert.equal(r.model, 'gemini-3.1-flash-lite');
  assert.equal(models.length, 2);
  assert.equal(q.snapshot().events.length, 2);
  process.env.GEMINI_MODEL = 'gemini-3.5-pro';
  await assert.rejects(generateJson({ quota: q, prompt: 'test' }), (e) => e.code === 'MODEL_CONFIG');
  process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
  await assert.rejects(
    generateJson({
      ...c,
      quota: q,
      prompt: 'test',
      fetchImpl: async () =>
        new Response(JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"ok":' }] } }] })),
    }),
    (e) => e.code === 'INCOMPLETE',
  );
});
test('OCR counts image tokens before generation and preserves schema-based consumers', async (t) => {
  env(t);
  const c = clock(),
    q = createQuota({ ...c }),
    operations = [];
  const schema = { type: 'OBJECT', properties: { ok: { type: 'BOOLEAN' } }, required: ['ok'] };
  const result = await generateJson({
    ...c,
    quota: q,
    parts: [{ text: 'Transcribe' }, { inline_data: { mime_type: 'image/png', data: 'AA==' } }],
    schema,
    fetchImpl: async (url, opts) => {
      operations.push(url);
      const body = JSON.parse(opts.body);
      if (url.endsWith('countTokens')) {
        assert.equal(body.generateContentRequest.model, 'models/gemini-3.5-flash-lite');
        return new Response('{"totalTokens":1000}');
      }
      assert.deepEqual(body.generationConfig.responseSchema, schema);
      return success();
    },
  });
  assert.equal(result.json.ok, true);
  assert.equal(operations.length, 2);
  assert.equal(q.snapshot().events.length, 2);
});

test('a transient Windows ledger rename failure retries storage without repeating inference', async (t) => {
  env(t);
  const c = clock(),
    directory = path.resolve('tmp/gemini-quota-tests');
  fs.mkdirSync(directory, { recursive: true });
  const q = createQuota({ ...c, file: path.join(directory, `rename-${Date.now()}.json`) });
  const original = fs.promises.rename;
  let renames = 0,
    calls = 0;
  fs.promises.rename = async (...args) => {
    if (++renames === 1) throw Object.assign(new Error('File temporarily busy'), { code: 'EPERM' });
    return original(...args);
  };
  try {
    const r = await generateJson({
      ...c,
      quota: q,
      prompt: 'test',
      fetchImpl: async () => {
        calls++;
        return success();
      },
    });
    assert.equal(r.json.ok, true);
    assert.equal(calls, 1);
    assert.ok(renames >= 3);
  } finally {
    fs.promises.rename = original;
  }
});

test('a non-JSON upstream 503 retains its status and uses the configured fallback',async t=>{
  env(t);const c=clock(),quota=createQuota({...c});let calls=0;
  const r=await generateJson({...c,quota,prompt:'test',fetchImpl:async()=>++calls===1?new Response('<html>busy</html>',{status:503}):success()});
  assert.equal(r.model,'gemini-3.1-flash-lite');assert.equal(calls,2);
});
