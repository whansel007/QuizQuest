// ============================================================
// Question validation
// ------------------------------------------------------------
// These checks validate STRUCTURE only: required fields, valid answer
// keys, no duplicate options, known source ids, no near-duplicate of a
// question already in the bank, and (for maths variations) formulas
// that parse and produce usable values. They do NOT prove a question
// is educationally correct - that is what the professor's review is for.
// Type-specific rules live in formats.js.
// ============================================================

const { TYPES, cleanTyped, validateTyped } = require('./formats');

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const LIMITS = { stemMin: 10, stemMax: 600, explanationMax: 1500 };
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
    ...cleanTyped(r),
    stem: typeof r.stem === 'string' ? r.stem.trim() : '',
    explanation: typeof r.explanation === 'string' ? r.explanation.trim() : '',
    difficulty: typeof r.difficulty === 'string' ? r.difficulty.trim().toLowerCase() : '',
    sourceIds: Array.isArray(r.sourceIds) ? r.sourceIds.filter((s) => typeof s === 'string') : [],
  };
}

// Returns { q, errors, warnings, samples }. errors block saving; warnings
// are shown to the reviewer but don't block. samples = preview instances
// for maths variations.
//   allowedSourceIds: Set of passage ids the question may cite
//   requireSource:    AI drafts must cite a source; manual ones get a warning
//   existingStems:    [{ id, stem }] already in the bank (for duplicate checks)
//   ignoreId:         skip this question id in the duplicate check (when editing)
function validateQuestion(raw, { allowedSourceIds, requireSource = true, existingStems = [], ignoreId = null } = {}) {
  const q = clean(raw);
  const errors = [];
  const warnings = [];
  if (raw?.type !== undefined && !TYPES.includes(raw.type)) errors.push('Unknown question format.');

  if (q.stem.length < LIMITS.stemMin) errors.push('Question text is missing or too short.');
  if (q.stem.length > LIMITS.stemMax) errors.push(`Question text is longer than ${LIMITS.stemMax} characters.`);
  if (!q.explanation) errors.push('An explanation is required.');
  if (q.explanation.length > LIMITS.explanationMax) errors.push('Explanation is too long.');
  if (!DIFFICULTIES.includes(q.difficulty)) errors.push('Difficulty must be easy, medium or hard.');

  const samples = validateTyped(q, errors, warnings);

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
  if (q.type === 'mcq') {
    const ans = q.options[q.answerIndex];
    if (ans && ans.length > 3 && normalise(q.stem).includes(normalise(ans))) {
      warnings.push('The correct option appears in the question text - check it is not giving the answer away.');
    }
  }

  return { q, errors, warnings, samples };
}

module.exports = { validateQuestion, similarity, normalise, DIFFICULTIES, LIMITS };
