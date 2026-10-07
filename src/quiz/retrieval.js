// ============================================================
// Retrieval: which bits of course material go to the drafter?
// ------------------------------------------------------------
// Long material (e.g. a whole PDF chapter) is split into ~700
// character chunks on sentence boundaries. Chunks are ranked with
// BM25 (classic keyword relevance) against the learning outcome,
// topic name and any focus keywords, plus a boost for chunks whose
// passage is TAGGED with the same outcome/topic. Only the top few
// chunks are sent, which keeps prompts small and on-topic.
// ============================================================

const STOP = new Set('a an and are as at be by for from has have in is it its of on or that the this to was were which with can will what when how why who into than then them they their there these those such not use used using each other more most also may be been being per via'.split(' '));
const CHUNK_CHARS = 700;

function terms(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => w.replace(/(ing|ed|es|s)$/, '')) // crude stemming: "packets" ~ "packet"
    .filter((w) => w.length > 1);
}

function chunkPassage(p) {
  const sentences = p.text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let cur = '';
  for (const sent of sentences) {
    if (cur && cur.length + sent.length > CHUNK_CHARS) {
      chunks.push(cur);
      cur = '';
    }
    cur += (cur ? ' ' : '') + sent;
  }
  if (cur) chunks.push(cur);
  return chunks.map((text, idx) => ({ passageId: p.id, title: p.title, topicId: p.topicId, outcomeId: p.outcomeId, idx, text }));
}

function bm25(chunks, query, k1 = 1.2, b = 0.75) {
  const docs = chunks.map((c) => terms(c.text));
  const avg = docs.reduce((n, d) => n + d.length, 0) / (docs.length || 1);
  const df = new Map();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) || 0) + 1);
  const q = [...new Set(terms(query))];
  return docs.map((d) => {
    const tf = new Map();
    for (const t of d) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (docs.length - df.get(t) + 0.5) / (df.get(t) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / avg)));
    }
    return score;
  });
}

// Returns the chosen chunks, best first, each with a score and a reason.
function retrieve(passages, { topicId, outcomeId, outcomeText, topicName, focus = '' }, { maxChunks = 4, maxChars = 3500 } = {}) {
  const chunks = passages.flatMap(chunkPassage);
  if (!chunks.length) return [];
  const query = [outcomeText, topicName, focus, focus].join(' '); // focus counts double
  const kw = bm25(chunks, query);
  const top = Math.max(...kw, 1e-9);
  const scored = chunks.map((c, i) => {
    const tag = c.outcomeId === outcomeId ? 1 : c.topicId === topicId ? 0.5 : 0;
    const why = [tag === 1 ? 'tagged with this outcome' : tag ? 'tagged with this topic' : null, kw[i] > 0 ? 'keyword match' : null].filter(Boolean);
    // Relevance first, tags as a boost: a tagged chunk with no matching
    // words still qualifies, but can't outrank a chunk that matches the
    // outcome or the professor's focus keywords.
    return { ...c, score: Number((tag * 0.5 + kw[i] / top).toFixed(3)), keyword: kw[i], tag, why };
  });
  const out = [];
  let chars = 0;
  for (const c of scored.filter((x) => x.tag > 0 || (focus && x.keyword > 0)).sort((a, b) => b.score - a.score)) {
    if (out.length >= maxChunks || chars + c.text.length > maxChars) continue;
    out.push(c);
    chars += c.text.length;
  }
  return out;
}

module.exports = { retrieve, chunkPassage, bm25, terms };
