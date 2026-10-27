// ============================================================
// Prompt.txt: the professor's instructions for Gemini
// ------------------------------------------------------------
// Prompt.txt (repository root) is the authoritative wording for the
// two Gemini authoring steps:
//   PROMPT 1 - lecture analysis    -> knowledge report (authoring.js)
//   PROMPT 2 - question generation -> question drafting (generator.js)
// It is read on the server only and re-read when the file changes.
//
// QuizQuest adds its own rules after each prompt (schemas, citations,
// safety, the professor's per-batch settings). Where they disagree, the
// rules say so explicitly instead of silently dropping either side.
//
// A missing or malformed file stops AI authoring with a clear error;
// there is no built-in replacement wording.
// ============================================================

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DEFAULT_FILE = path.join(__dirname, '..', '..', 'Prompt.txt');
const SECTIONS = { 1: 'analysis', 2: 'generation' };
// "PROMPT 1 — LECTURE ANALYSIS" (em dash, en dash or hyphen)
const HEADING = /^PROMPT\s+(\d+)\s*[—–-]+\s*(\S.*)$/;
const MAX_SECTION = 8000; // characters; keeps every request well inside its token budget

let cache = null; // { file, mtimeMs, size, prompts }

function promptError(message) {
  return Object.assign(new Error(message), { code: 'PROMPT_CONFIG', status: 500, retryable: false });
}

function parsePrompts(raw) {
  const text = String(raw).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const found = {};
  let current = null;
  for (const line of text.split('\n')) {
    const m = line.trim().match(HEADING);
    if (m) {
      if (found[m[1]]) throw promptError(`Prompt.txt has two "PROMPT ${m[1]}" sections. Keep one, then try again.`);
      current = found[m[1]] = { title: m[2].trim(), lines: [] };
    } else if (current) current.lines.push(line);
  }
  const prompts = {};
  for (const [n, key] of Object.entries(SECTIONS)) {
    if (!found[n]) throw promptError(`Prompt.txt is missing its "PROMPT ${n} — ..." section. Restore it, then try again.`);
    const body = found[n].lines.join('\n').trim().replace(/\n{3,}/g, '\n\n');
    if (!body) throw promptError(`PROMPT ${n} in Prompt.txt is empty. Add its instructions, then try again.`);
    if (body.length > MAX_SECTION) throw promptError(`PROMPT ${n} in Prompt.txt is longer than ${MAX_SECTION} characters. Shorten it, then try again.`);
    prompts[key] = {
      number: Number(n),
      title: found[n].title,
      text: body,
      digest: crypto.createHash('sha256').update(body).digest('hex').slice(0, 16),
    };
  }
  return prompts;
}

// Returns { analysis, generation }, each { number, title, text, digest }.
// The path is only logged on the server, never put in a user-facing message.
function loadPrompts(file = process.env.QUIZQUEST_PROMPT_FILE || DEFAULT_FILE) {
  let stat, raw;
  try {
    stat = fs.statSync(file);
    if (cache && cache.file === file && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.prompts;
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    console.error('[prompts] cannot read', file, e.code || e.message);
    throw promptError('Prompt.txt could not be read on the server, so AI drafting is paused. Restore the file, then try again.');
  }
  const prompts = parsePrompts(raw);
  cache = { file, mtimeMs: stat.mtimeMs, size: stat.size, prompts };
  return prompts;
}

// The professor's prompt, quoted so the model can tell it apart from the
// QuizQuest rules that follow it and the course material after those.
function professorPrompt(p) {
  return `PROFESSOR INSTRUCTIONS (Prompt.txt, PROMPT ${p.number} — ${p.title}):\n<<<\n${p.text}\n>>>`;
}

module.exports = { loadPrompts, parsePrompts, professorPrompt, DEFAULT_FILE };
