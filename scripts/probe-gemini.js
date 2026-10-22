// Explicit live probe: prints model metadata and usage, never credentials.
const gemini = require('../src/quiz/gemini');
async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured.');
  const headers = { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'content-type': 'application/json' };
  const base = 'https://generativelanguage.googleapis.com/v1beta';
  const list = await fetch(base + '/models?pageSize=1000', { headers, signal: AbortSignal.timeout(30000) });
  const data = list.ok ? await list.json() : {};
  console.log(
    JSON.stringify({
      check: 'catalogue',
      status: list.status,
      models: data.models
        ?.filter((m) => /gemini-3\.(5|1)-flash-lite/.test(m.name))
        .map((m) => ({
          name: m.name,
          methods: m.supportedGenerationMethods,
          inputTokenLimit: m.inputTokenLimit,
          outputTokenLimit: m.outputTokenLimit,
        })),
    }),
  );
  if (!list.ok) return;
  const names = [process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.1-flash-lite'];
  for (const name of [...new Set(names)]) {
    const started = Date.now();
    const previous = process.env.GEMINI_MODEL;
    try {
      process.env.GEMINI_MODEL = name;
      const result = await gemini.generateJson({ prompt: 'Return JSON only: {"ok":true}', maxOutputTokens: 256 });
      console.log(
        JSON.stringify({
          check: 'inference',
          requestedModel: name,
          model: result.model,
          status: 200,
          elapsedMs: Date.now() - started,
          usage: result.usage,
          answer: result.json,
        }),
      );
    } finally {
      if (previous === undefined) delete process.env.GEMINI_MODEL;
      else process.env.GEMINI_MODEL = previous;
    }
  }
}
main().catch((e) => {
  console.error(e.name, e.message);
  process.exitCode = 1;
});
