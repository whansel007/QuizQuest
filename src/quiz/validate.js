// ============================================================
// Question validation
// ------------------------------------------------------------
// These checks validate STRUCTURE only: required fields, a valid
// answer index, no duplicate options, known source ids, and no
// near-duplicate of a question already in the bank. They do NOT
// prove a question is educationally correct - that is what the
// professor's review step is for.
// ============================================================

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const LIMITS = { stemMin: 10, stemMax: 500, optionMax: 200, explanationMax: 1000, minOptions: 3, maxOptions: 5 };
const DUPLICATE_THRESHOLD = 0.8; // word-overlap ratio treated as "obviously the same question"

// lowercase, strip punctuation, collapse spaces - used for comparisons only
function normalise(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Jaccard similarity of the two word sets (0 = nothing shared, 1 = identical)
function similarity(a, b) {
  const A = new Set(normalise(a).split(' ').filter(Boolean));
  const B = new Set(normalise(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  return shared / (A.size + B.size - shared);
}

// Coerce an untrusted object (LLM output or form body) into our shape.
// Unknown keys are dropped so nothing unexpected gets stored.
function clean(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    stem: typeof r.stem === 'string' ? r.stem.trim() : '',
    options: Array.isArray(r.options) ? r.options.map((o) => (typeof o === 'string' ? o.trim() : '')) : [],
    answerIndex: Number.isInteger(r.answerIndex) ? r.answerIndex : -1,
    explanation: typeof r.explanation === 'string' ? r.explanation.trim() : '',
    difficulty: typeof r.difficulty === 'string' ? r.difficulty.trim().toLowerCase() : '',
    sourceIds: Array.isArray(r.sourceIds) ? r.sourceIds.filter((s) => typeof s === 'string') : [],
  };
}

// Returns { q, errors, warnings }. errors block saving; warnings are shown
// to the reviewer but don't block.
//   allowedSourceIds: Set of passage ids the question may cite
//   requireSource:    AI drafts must cite a source; manual ones get a warning
//   existingStems:    [{ id, stem }] already in the bank (for duplicate checks)
//   ignoreId:         skip this question id in the duplicate check (when editing)
function validateQuestion(raw, { allowedSourceIds, requireSource = true, existingStems = [], ignoreId = null } = {}) {
  const q = clean(raw);
  const errors = [];
  const warnings = [];

  if (q.stem.length < LIMITS.stemMin) errors.push('Question text is missing or too short.');
  if (q.stem.length > LIMITS.stemMax) errors.push(`Question text is longer than ${LIMITS.stemMax} characters.`);

  if (q.options.length < LIMITS.minOptions || q.options.length > LIMITS.maxOptions) {
    errors.push(`Needs between ${LIMITS.minOptions} and ${LIMITS.maxOptions} options.`);
  }
  if (q.options.some((o) => !o)) errors.push('Every option needs text.');
  if (q.options.some((o) => o.length > LIMITS.optionMax)) errors.push(`Options must be under ${LIMITS.optionMax} characters.`);
  const seen = new Set();
  for (const o of q.options) {
    const n = normalise(o);
    if (n && seen.has(n)) {
      errors.push(`Duplicate option: "${o}".`);
      break;
    }
    seen.add(n);
  }

  if (q.answerIndex < 0 || q.answerIndex >= q.options.length) errors.push('Correct answer must point at one of the options.');

  if (!q.explanation) errors.push('An explanation is required.');
  if (q.explanation.length > LIMITS.explanationMax) errors.push('Explanation is too long.');

  if (!DIFFICULTIES.includes(q.difficulty)) errors.push('Difficulty must be easy, medium or hard.');

  if (allowedSourceIds) {
    const unknown = q.sourceIds.filter((id) => !allowedSourceIds.has(id));
    if (unknown.length) errors.push('Cites a source passage that does not exist: ' + unknown.join(', '));
  }
  if (!q.sourceIds.length) {
    if (requireSource) errors.push('Must cite at least one source passage.');
    else warnings.push('No source passage cited.');
  }

  for (const e of existingStems) {
    if (e.id === ignoreId) continue;
    if (similarity(e.stem, q.stem) >= DUPLICATE_THRESHOLD) {
      errors.push('Looks like a duplicate of an existing question: "' + e.stem.slice(0, 80) + '"');
      break;
    }
  }

  // Answer-giveaway hint: correct option text appears verbatim in the stem
  const ans = q.options[q.answerIndex];
  if (ans && ans.length > 3 && normalise(q.stem).includes(normalise(ans))) {
    warnings.push('The correct option appears in the question text - check it is not giving the answer away.');
  }

  return { q, errors, warnings };
}

module.exports = { validateQuestion, similarity, normalise, DIFFICULTIES, LIMITS };
