// ============================================================
// Minimal Gemini client shared by drafting, transcription and
// short-answer grading.
// ------------------------------------------------------------
// - The API key is read from process.env only. It is never logged,
//   stored, or sent to browsers.
// - Errors carry the HTTP status only, never the response body.
// - Callers must not put student identities in prompts.
// ============================================================

const TIMEOUT_MS = 45000;

const enabled = () => Boolean(process.env.GEMINI_API_KEY);
const model = () => process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// parts: [{ text }] or [{ inline_data: { mime_type, data } }]
async function generateJson({ system, parts, schema, maxOutputTokens = 4096, temperature = 0.3 }) {
  if (!enabled()) throw Object.assign(new Error('Gemini is not configured'), { code: 'NO_KEY' });
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model())}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens, temperature },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error('Gemini HTTP ' + res.status);
  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return { json: JSON.parse(raw), raw, model: model() };
}

module.exports = { generateJson, enabled, model };
