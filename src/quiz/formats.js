// ============================================================
// Question formats
// ------------------------------------------------------------
//   mcq      single correct option
//   multi    "select all that apply" (exact match = correct)
//   tf       true / false
//   numeric  typed number, with a tolerance and optional unit
//   short    free response, graded against key points (provisional,
//            the professor can override - see grading.js)
//   param    maths template: variables are randomised per student,
//            the server computes the answer and "common mistake"
//            distractors from formulas (see mathexpr.js)
//
// Everything a student must not see before answering (answers, key
// points, formulas) stays in the version; studentView() strips it.
// ============================================================

const crypto = require('crypto');
const M = require('./mathexpr');

const TYPES = ['mcq', 'multi', 'tf', 'numeric', 'short', 'param'];
const TYPE_LABELS = { mcq: 'Single answer', multi: 'Select all that apply', tf: 'True / false', numeric: 'Numeric answer', short: 'Short answer', param: 'Maths variation' };
const CHOICE_TYPES = ['mcq', 'tf', 'param']; // answered by picking one option

const s = (v, max = 10000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// Keep only the fields that belong to the type
function cleanTyped(r) {
  const type = TYPES.includes(r.type) ? r.type : 'mcq';
  const out = { type };
  if (type === 'mcq' || type === 'multi') out.options = Array.isArray(r.options) ? r.options.map((o) => s(o, 300)) : [];
  if (type === 'mcq') out.answerIndex = Number.isInteger(r.answerIndex) ? r.answerIndex : -1;
  if (type === 'multi') out.answerIndexes = Array.isArray(r.answerIndexes) ? [...new Set(r.answerIndexes.filter(Number.isInteger))].sort((a, b) => a - b) : [];
  if (type === 'tf') {
    out.options = ['True', 'False'];
    out.answerIndex = r.answerIndex === 0 || r.answerIndex === 1 ? r.answerIndex : -1;
  }
  if (type === 'numeric') {
    out.answer = num(r.answer);
    out.tolerance = r.tolerance === undefined || r.tolerance === '' ? 0 : num(r.tolerance);
    out.unit = s(r.unit, 20);
  }
  if (type === 'short') {
    out.modelAnswer = s(r.modelAnswer, 800);
    out.keyPoints = Array.isArray(r.keyPoints) ? r.keyPoints.map((k) => s(k, 200)).filter(Boolean) : [];
  }
  if (type === 'param') {
    out.variables = Array.isArray(r.variables)
      ? r.variables.slice(0, 8).map((v) => ({ name: s(v && v.name, 12), min: num(v && v.min), max: num(v && v.max), step: num(v && v.step) }))
      : [];
    out.answerExpr = s(r.answerExpr, 300);
    out.distractorExprs = Array.isArray(r.distractorExprs) ? r.distractorExprs.map((d) => s(d, 300)).filter(Boolean) : [];
    out.constraint = s(r.constraint, 300);
    out.decimals = Number.isInteger(r.decimals) ? r.decimals : Number.isInteger(num(r.decimals)) ? num(r.decimals) : 2;
    out.unit = s(r.unit, 20);
  }
  return out;
}

function checkOptions(opts, min, max, errors) {
  if (opts.length < min || opts.length > max) errors.push(`Needs between ${min} and ${max} options.`);
  if (opts.some((o) => !o)) errors.push('Every option needs text.');
  const seen = new Set();
  for (const o of opts) {
    const n = o.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    if (n && seen.has(n)) {
      errors.push(`Duplicate option: "${o}".`);
      break;
    }
    seen.add(n);
  }
}

// ---------- maths templates ----------
const fmt = (x, d) => String(Number(x.toFixed(d)));

function compileParam(q) {
  const ast = {
    answer: M.parse(q.answerExpr),
    distractors: q.distractorExprs.map((d) => M.parse(d)),
    constraint: q.constraint ? M.parse(q.constraint) : null,
  };
  return ast;
}

// One concrete instance: values, rendered stem, options, answerIndex.
// Returns null if no usable instance was found.
function instantiate(q, rand = Math.random, compiled = compileParam(q), maxTries = 40) {
  for (let tries = 0; tries < maxTries; tries++) {
    const scope = Object.create(null);
    for (const v of q.variables) {
      const steps = Math.floor((v.max - v.min) / v.step + 1e-9);
      scope[v.name] = Number((v.min + v.step * Math.floor(rand() * (steps + 1))).toFixed(6));
    }
    try {
      if (compiled.constraint && !M.evaluate(compiled.constraint, scope)) continue;
      const answer = M.evaluate(compiled.answer, scope);
      if (!Number.isFinite(answer)) continue;
      const a = fmt(answer, q.decimals);
      const wrong = [];
      for (const d of compiled.distractors) {
        const x = M.evaluate(d, scope);
        if (!Number.isFinite(x)) continue;
        const f = fmt(x, q.decimals);
        if (f !== a && !wrong.includes(f)) wrong.push(f);
      }
      if (wrong.length < 2) continue;
      const options = wrong.slice(0, 3);
      const answerIndex = Math.floor(rand() * (options.length + 1));
      options.splice(answerIndex, 0, a);
      const fill = (text) => text.replace(/\{(\w+)\}/g, (m, k) => (k === 'answer' ? a : k in scope ? fmt(scope[k], 6) : m));
      return {
        values: { ...scope },
        stem: fill(q.stem),
        explanation: fill(q.explanation || ''),
        options: options.map((o) => (q.unit ? `${o} ${q.unit}` : o)),
        answerIndex,
        answerValue: a,
      };
    } catch {
      // evaluation error (e.g. unknown variable) -> try again, validation reports it
    }
  }
  return null;
}

// "Constrained mathematical validation": parse every formula, check every
// variable is defined, then sample many instances and require that most
// of them produce a usable question with distinct options.
function validateParam(q, errors, warnings) {
  const names = new Set();
  if (!q.variables.length) errors.push('Add at least one variable.');
  for (const v of q.variables) {
    if (!/^[a-z]\w{0,9}$/.test(v.name)) errors.push(`Variable name "${v.name}" must be a short lowercase name like a, b or n1.`);
    if (['answer', 'pi', 'e'].includes(v.name)) errors.push(`The variable name ${v.name} is reserved.`);
    if (names.has(v.name)) errors.push(`Variable "${v.name}" is defined twice.`);
    names.add(v.name);
    if (![v.min, v.max, v.step].every(Number.isFinite) || v.step <= 0 || v.max < v.min) errors.push(`Variable "${v.name}" needs numeric min <= max and a step > 0.`);
    else if ((v.max - v.min) / v.step > 100000) errors.push(`Variable "${v.name}" has too many possible values; use a bigger step.`);
  }
  if (!Number.isInteger(q.decimals) || q.decimals < 0 || q.decimals > 4) errors.push('Decimals must be between 0 and 4.');
  if (q.distractorExprs.length < 2 || q.distractorExprs.length > 4) errors.push('Give 2-4 "common mistake" formulas for distractors.');
  let compiled;
  try {
    compiled = compileParam(q);
  } catch (e) {
    errors.push('Formula error: ' + e.message);
    return [];
  }
  const used = new Set([compiled.answer, ...compiled.distractors, compiled.constraint].filter(Boolean).flatMap((a) => [...M.variables(a)]));
  for (const m of q.stem.matchAll(/\{(\w+)\}/g)) used.add(m[1]);
  for (const u of used) if (!names.has(u)) errors.push(`"${u}" is used but not defined as a variable.`);
  for (const n of names) if (!q.stem.includes(`{${n}}`)) warnings.push(`Variable "${n}" never appears in the question text.`);
  if (errors.length) return [];

  const SAMPLES = 80;
  let ok = 0;
  const samples = [];
  let seed = 0x12345678;
  const sampleRandom = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < SAMPLES; k++) {
    const inst = instantiate(q, sampleRandom, compiled, 1);
    if (inst) {
      ok++;
      if (samples.length < 3) samples.push(inst);
    }
  }
  if (ok / SAMPLES < 0.9) errors.push(`Only ${Math.round((ok / SAMPLES) * 100)}% of sampled values gave a usable question (finite answer, constraint met, at least 2 distinct wrong options). Adjust ranges, constraint or formulas.`);
  return samples;
}

// Type-specific checks; returns preview samples for param questions
function validateTyped(q, errors, warnings) {
  if (q.type === 'mcq') {
    checkOptions(q.options, 3, 5, errors);
    if (q.answerIndex < 0 || q.answerIndex >= q.options.length) errors.push('Correct answer must point at one of the options.');
  } else if (q.type === 'multi') {
    checkOptions(q.options, 3, 6, errors);
    if (!q.answerIndexes.length || q.answerIndexes.some((i) => i < 0 || i >= q.options.length)) errors.push('Mark at least one correct option.');
    if (q.answerIndexes.length >= q.options.length) errors.push('At least one option must be wrong.');
    if (q.answerIndexes.length === 1) warnings.push('Only one option is correct - a single-answer question may be clearer.');
  } else if (q.type === 'tf') {
    if (q.answerIndex < 0) errors.push('Choose whether the statement is true or false.');
  } else if (q.type === 'numeric') {
    if (!Number.isFinite(q.answer)) errors.push('The answer must be a number.');
    if (!Number.isFinite(q.tolerance) || q.tolerance < 0) errors.push('Tolerance must be zero or a positive number.');
    if (q.tolerance === 0 && Number.isFinite(q.answer) && !Number.isInteger(q.answer)) warnings.push('Non-whole answer with zero tolerance: students must match it exactly.');
  } else if (q.type === 'short') {
    if (q.modelAnswer.length < 5) errors.push('A model answer is required.');
    if (!q.keyPoints.length || q.keyPoints.length > 6) errors.push('List 1-6 key points a good answer should cover.');
  } else if (q.type === 'param') {
    return validateParam(q, errors, warnings);
  }
  return [];
}

// ---------- what students see / how answers are graded ----------
function studentView(v, instance) {
  const base = { type: v.type, stem: instance ? instance.stem : v.stem, difficulty: v.difficulty };
  if (v.type === 'mcq' || v.type === 'tf') base.options = v.options;
  if (v.type === 'multi') base.options = v.options;
  if (v.type === 'param') {
    base.type = 'mcq'; // to the student a maths variation is just a choice question
    base.options = instance.options;
  }
  if (v.type === 'numeric') base.unit = v.unit;
  return base;
}

// Fresh values for a maths variation (null for other formats). Validation
// only guarantees ~90% of draws are usable, so try hard; callers must
// still handle null (skip the question) for unlucky templates.
function newInstance(v) {
  if (v.type !== 'param') return null;
  for (let i = 0; i < 5; i++) {
    const inst = instantiate(v, () => crypto.randomInt(1e9) / 1e9);
    if (inst) return inst;
  }
  return null;
}

// Synchronous grading for every type except 'short' (see grading.js).
// Returns { correct, score, record, reveal }.
//   record: what gets stored on the attempt
//   reveal: what the student is shown after answering
function gradeSync(v, instance, sub) {
  if (v.type === 'mcq' || v.type === 'tf' || v.type === 'param') {
    const n = v.type === 'param' ? instance.options.length : v.options.length;
    const choice = Number.isInteger(sub.choice) && sub.choice >= 0 && sub.choice < n ? sub.choice : null;
    const answerIndex = v.type === 'param' ? instance.answerIndex : v.answerIndex;
    const correct = choice === answerIndex;
    return { correct, score: correct ? 1 : 0, record: { choice }, reveal: { answerIndex, choice } };
  }
  if (v.type === 'multi') {
    const picks = Array.isArray(sub.choices) ? [...new Set(sub.choices.filter((i) => Number.isInteger(i) && i >= 0 && i < v.options.length))].sort((a, b) => a - b) : [];
    const right = picks.filter((i) => v.answerIndexes.includes(i)).length;
    const wrongPicks = picks.length - right;
    const correct = right === v.answerIndexes.length && wrongPicks === 0;
    const score = Math.max(0, (right - wrongPicks) / v.answerIndexes.length);
    return { correct, score, record: { choices: picks }, reveal: { answerIndexes: v.answerIndexes, choices: picks, partial: !correct && score > 0 ? score : null } };
  }
  if (v.type === 'numeric') {
    const value = num(typeof sub.value === 'string' ? sub.value.replace(/,/g, '') : sub.value);
    const given = Number.isFinite(value) ? value : null;
    const correct = given !== null && Math.abs(given - v.answer) <= v.tolerance + 1e-9;
    return { correct, score: correct ? 1 : 0, record: { value: given }, reveal: { answer: v.answer, tolerance: v.tolerance, unit: v.unit, value: given } };
  }
  throw new Error('gradeSync does not handle ' + v.type);
}

// Is this submission "no answer" (used for timeouts)?
function isEmpty(v, sub) {
  if (!sub) return true;
  if (CHOICE_TYPES.includes(v.type)) return !Number.isInteger(sub.choice);
  if (v.type === 'multi') return !Array.isArray(sub.choices) || !sub.choices.length;
  if (v.type === 'numeric') return sub.value === null || sub.value === undefined || sub.value === '';
  if (v.type === 'short') return !s(sub.text);
  return true;
}

module.exports = { TYPES, TYPE_LABELS, CHOICE_TYPES, cleanTyped, validateTyped, studentView, newInstance, instantiate, gradeSync, isEmpty };
