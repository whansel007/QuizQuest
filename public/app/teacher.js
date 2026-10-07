// ============================================================
// PROFESSOR views
// ============================================================

import { S, el, fill, add, api, action, toast, pct, secs, when, meter, heading, main, rerender, download, fmtBundle, root, withProgress } from './core.js';

let courses = null;
let coursesToken = null;
export async function loadCourses(force) {
  if (!courses || force || coursesToken !== S.token) {
    const token = S.token;
    courses = await api('GET', '/api/teacher/courses');
    coursesToken = token;
  }
  if (!S.courseId || !courses.some((c) => c.id === S.courseId)) S.courseId = courses[0]?.id;
  return courses;
}
const currentCourse = () => courses.find((c) => c.id === S.courseId);
function coursePicker() {
  if (courses.length < 2) return el('span', { class: 'badge plain' }, currentCourse().title);
  return el('select', { style: 'width:auto', onchange: (e) => ((S.courseId = e.target.value), rerender()) },
    courses.map((c) => el('option', { value: c.id, selected: c.id === S.courseId }, c.title)));
}
function classPicker(classes) {
  if (!S.classId || !classes.some((c) => c.id === S.classId)) S.classId = classes[0]?.id;
  return el('select', { style: 'width:auto', onchange: (e) => ((S.classId = e.target.value), rerender()) },
    classes.map((c) => el('option', { value: c.id, selected: c.id === S.classId }, c.name)));
}

// topic + learning outcome selects that stay in sync
function topicOutcomeFields(course, init = {}) {
  const topicSel = el('select', {}, course.topics.map((t) => el('option', { value: t.id, selected: t.id === init.topicId }, t.name)));
  const loSel = el('select');
  const syncOutcomes = () => {
    const t = course.topics.find((x) => x.id === topicSel.value);
    fill(loSel, t.outcomes.map((o) => el('option', { value: o.id, selected: o.id === init.outcomeId }, o.text)));
  };
  topicSel.addEventListener('change', syncOutcomes);
  syncOutcomes();
  return {
    topicSel,
    loSel,
    nodes: [el('div', { class: 'field grow' }, el('label', {}, 'Topic'), topicSel), el('div', { class: 'field grow' }, el('label', {}, 'Learning outcome'), loSel)],
  };
}

const ORIGIN = { manual: 'written by hand', template: 'offline drafter', ai: 'Gemini draft', custom: 'drafted' };

// ============================================================
// Question bank & review
// ============================================================
export async function viewReview() {
  const main = root(); // this render's own container (see core.js)
  await loadCourses();
  if (!main.isConnected) return;
  const course = currentCourse();
  if (!course) return add(main, el('p', {}, 'You have no assigned courses.'));
  const [questions, passages] = await Promise.all([api('GET', `/api/teacher/courses/${course.id}/questions`), api('GET', `/api/teacher/courses/${course.id}/passages`)]);
  const filters = [
    ['draft', 'Needs review', (q) => q.status === 'draft'],
    ['reported', 'Reported', (q) => q.reports.some((r) => !r.resolved)],
    ['published', 'Published', (q) => q.status === 'published'],
    ['withdrawn', 'Withdrawn', (q) => q.status === 'withdrawn'],
    ['rejected', 'Rejected', (q) => q.status === 'rejected'],
  ];
  const editorSlot = el('div');
  const list = el('div');
  const draw = () => {
    const f = filters.find((x) => x[0] === S.qFilter);
    const shown = questions.filter(f[2]);
    fill(list, shown.length ? shown.map((q) => questionCard(q, course, passages)) : el('p', { class: 'muted' }, 'Nothing here.'));
  };

  add(main,
    heading('Question bank', coursePicker(),
      el('button', { class: 'btn primary', onclick: () => fill(editorSlot, questionEditor(course, passages, null, () => fill(editorSlot))) }, '+ New question')),
    el('p', { class: 'muted small' }, 'AI-drafted questions stay drafts until you approve them. Editing a published question creates a new version, so earlier attempts still point at the wording students actually saw.'),
    editorSlot,
    el('div', { class: 'chips' },
      filters.map(([id, label, fn]) =>
        el('button', { 'aria-pressed': S.qFilter === id ? 'true' : 'false', onclick: (e) => {
          S.qFilter = id;
          e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
          e.currentTarget.setAttribute('aria-pressed', 'true');
          draw();
        } }, `${label} (${questions.filter(fn).length})`))),
    list);
  draw();
}

// Type-specific answer display for a version (teacher sees everything)
function answerView(q) {
  const v = q.latest;
  const type = v.type || 'mcq';
  if (type === 'mcq' || type === 'tf') return el('ol', { type: 'A' }, v.options.map((o, i) => el('li', { class: i === v.answerIndex ? 'correct' : null }, o, i === v.answerIndex ? '  ✓' : '')));
  if (type === 'multi') return el('ol', { type: 'A' }, v.options.map((o, i) => el('li', { class: v.answerIndexes.includes(i) ? 'correct' : null }, o, v.answerIndexes.includes(i) ? '  ✓' : '')));
  if (type === 'numeric') return el('p', {}, 'Answer: ', el('b', {}, `${v.answer}${v.unit ? ' ' + v.unit : ''}`), v.tolerance ? ` (± ${v.tolerance})` : ' (exact)');
  if (type === 'short') {
    return el('div', { class: 'small', style: 'margin:8px 0' },
      el('div', {}, el('b', {}, 'Model answer: '), v.modelAnswer),
      el('div', {}, el('b', {}, 'Key points: '), el('ul', { style: 'margin:2px 0' }, v.keyPoints.map((k) => el('li', {}, k)))));
  }
  if (type === 'param') {
    return el('div', { class: 'small', style: 'margin:8px 0' },
      el('div', {}, el('b', {}, 'Variables: '), v.variables.map((x) => `${x.name} ∈ [${x.min}..${x.max}] step ${x.step}`).join(', ')),
      el('div', {}, el('b', {}, 'Answer: '), el('code', {}, v.answerExpr), v.decimals ? ` (rounded to ${v.decimals} dp)` : ''),
      el('div', {}, el('b', {}, 'Common-mistake distractors: '), v.distractorExprs.map((d) => el('code', { style: 'margin-right:8px' }, d))),
      v.constraint ? el('div', {}, el('b', {}, 'Constraint: '), el('code', {}, v.constraint)) : null,
      q.sample ? el('div', { class: 'panel', style: 'background:var(--bg);margin-top:8px;padding:10px' },
        el('div', { class: 'muted' }, 'Example a student might see:'),
        el('div', { style: 'font-weight:600' }, q.sample.stem),
        el('ol', { type: 'A', style: 'margin:4px 0' }, q.sample.options.map((o, i) => el('li', { class: i === q.sample.answerIndex ? 'correct' : null }, o)))) : null);
  }
  return null;
}

function questionCard(q, course, passages) {
  const topic = course.topics.find((t) => t.id === q.topicId);
  const outcome = topic?.outcomes.find((o) => o.id === q.outcomeId);
  const v = q.latest;
  const slot = el('div');
  const setStatus = (a) => action(async () => {
    await api('POST', `/api/teacher/questions/${q.id}/status`, { action: a });
    toast({ approve: 'Published', reject: 'Rejected', withdraw: 'Withdrawn from practice', republish: 'Published again' }[a]);
    rerender();
  });
  const totalAttempts = q.versions.reduce((n, x) => n + x.attempts, 0);
  return el('div', { class: 'panel qcard' },
    el('div', { class: 'meta' },
      el('span', { class: 'badge ' + q.status }, q.status),
      el('span', { class: 'badge' }, q.typeLabel),
      el('span', { class: 'badge plain' }, ORIGIN[q.origin] || q.origin),
      el('span', { class: 'badge plain' }, v.difficulty),
      el('span', { class: 'badge plain' }, `v${v.v}${q.publishedVersion && q.publishedVersion !== v.v ? ` (live: v${q.publishedVersion})` : ''}`),
      el('span', { class: 'small muted' }, `${topic?.name} → ${outcome?.text}`)),
    el('div', { style: 'font-weight:650' }, v.stem),
    answerView(q),
    el('div', { class: 'small' }, el('b', {}, 'Explanation: '), v.explanation),
    el('div', { class: 'small muted' }, 'Source: ', q.sources.length ? q.sources.map((s) => s.title).join(', ') : v.sourceIds.length ? 'source removed' : 'none cited'),
    totalAttempts ? el('div', { class: 'small muted' }, `${totalAttempts} attempt(s) across ${q.versions.filter((x) => x.attempts).length} version(s)`) : null,
    v.warnings?.length ? el('div', { class: 'note warn small', style: 'margin-top:8px' }, v.warnings.join(' ')) : null,
    q.reports.filter((r) => !r.resolved).map((r) =>
      el('div', { class: 'note bad small', style: 'margin-top:8px' },
        el('b', {}, 'Student report: '), r.reason, ' ',
        el('button', { class: 'btn small', onclick: action(async () => {
          await api('POST', `/api/teacher/questions/${q.id}/reports/${r.id}/resolve`);
          toast('Report marked resolved');
          rerender();
        }) }, 'Mark resolved'))),
    el('div', { class: 'actions' },
      ['draft', 'rejected'].includes(q.status) ? el('button', { class: 'btn good', onclick: setStatus('approve') }, 'Approve & publish') : null,
      q.status === 'draft' ? el('button', { class: 'btn bad', onclick: setStatus('reject') }, 'Reject') : null,
      q.status === 'published' ? el('button', { class: 'btn bad', onclick: setStatus('withdraw') }, 'Withdraw') : null,
      q.status === 'withdrawn' ? el('button', { class: 'btn', onclick: setStatus('republish') }, 'Publish again') : null,
      el('button', { class: 'btn', onclick: () => fill(slot, questionEditor(course, passages, q, () => fill(slot))) }, 'Edit')),
    slot);
}

// ---------- the editor: one form, fields depend on the format ----------
function questionEditor(course, passages, q, close) {
  const openedAt = Date.now(); // preparation-time metric
  const v = q ? q.latest : { type: 'mcq', stem: '', options: ['', '', '', ''], answerIndex: 0, explanation: '', difficulty: 'medium', sourceIds: [] };
  const to = topicOutcomeFields(course, q || {});
  if (q) {
    to.topicSel.disabled = true;
    to.loSel.disabled = true;
  }
  const typeSel = el('select', {}, course.formats.all.map((t) => el('option', { value: t, selected: t === (v.type || 'mcq') }, course.formats.labels[t])));
  const stem = el('textarea', { rows: 2 }, v.stem);
  const expl = el('textarea', { rows: 2 }, v.explanation);
  const diff = el('select', {}, ['easy', 'medium', 'hard'].map((d) => el('option', { value: d, selected: d === v.difficulty }, d)));
  const srcBoxes = passages.map((p) => el('label', { style: 'font-weight:400;color:inherit' }, el('input', { type: 'checkbox', value: p.id, checked: v.sourceIds.includes(p.id) }), ' ', p.title));
  const typeSlot = el('div');
  const checkOut = el('div');

  // --- per-type field builders; each returns { node, read() }
  let current = null;
  const builders = {
    mcq: () => optionsBuilder(false),
    multi: () => optionsBuilder(true),
    tf: () => {
      const name = 'tf-' + Math.random().toString(36).slice(2);
      const radios = ['True', 'False'].map((label, i) => el('label', { style: 'font-weight:400;color:inherit;margin-right:16px;display:inline' }, el('input', { type: 'radio', name, checked: (v.answerIndex ?? 0) === i }), ' ', label));
      return { node: el('div', { class: 'field' }, el('label', {}, 'The statement is…'), radios), read: () => ({ answerIndex: radios.findIndex((r) => r.querySelector('input').checked) }) };
    },
    numeric: () => {
      const ans = el('input', { type: 'text', value: v.answer ?? '' });
      const tol = el('input', { type: 'text', value: v.tolerance ?? 0 });
      const unit = el('input', { type: 'text', value: v.unit || '', placeholder: 'e.g. ms, kg (optional)' });
      return {
        node: el('div', { class: 'row top' }, el('div', { class: 'field' }, el('label', {}, 'Correct answer'), ans), el('div', { class: 'field' }, el('label', {}, 'Accepted ± tolerance'), tol), el('div', { class: 'field' }, el('label', {}, 'Unit'), unit)),
        // empty box -> null (not 0), so the server rejects a missing answer
        read: () => ({ answer: ans.value.trim() === '' ? null : Number(ans.value), tolerance: Number(tol.value || 0), unit: unit.value }),
      };
    },
    short: () => {
      const model = el('textarea', { rows: 2 }, v.modelAnswer || '');
      const kps = el('textarea', { rows: 3, placeholder: 'One key point per line' }, (v.keyPoints || []).join('\n'));
      return {
        node: el('div', {},
          el('div', { class: 'field' }, el('label', {}, 'Model answer (shown to students after they answer)'), model),
          el('div', { class: 'field' }, el('label', {}, 'Key points a good answer must cover (one per line, 1-6)'), kps),
          el('p', { class: 'small muted' }, course.geminiEnabled ? 'Answers are graded by Gemini against these key points (provisional; you can override in Analytics → Answers to mark).' : 'Without Gemini, answers are graded by keyword coverage of these key points (provisional; you can override in Analytics → Answers to mark).')),
        read: () => ({ modelAnswer: model.value, keyPoints: kps.value.split('\n').map((s) => s.trim()).filter(Boolean) }),
      };
    },
    param: () => {
      const rows = el('div');
      const addVar = (x = { name: '', min: 1, max: 10, step: 1 }) => {
        const inputs = ['name', 'min', 'max', 'step'].map((k) => el('input', { type: 'text', value: x[k], placeholder: k, 'aria-label': k, style: 'max-width:110px' }));
        const row = el('div', { class: 'opt-row' }, inputs, el('button', { class: 'btn small', onclick: () => row.remove() }, '✕'));
        row.read = () => ({ name: inputs[0].value.trim(), min: Number(inputs[1].value), max: Number(inputs[2].value), step: Number(inputs[3].value) });
        rows.append(row);
      };
      (v.variables?.length ? v.variables : [{ name: 'a', min: 1, max: 10, step: 1 }]).forEach(addVar);
      const ans = el('input', { type: 'text', value: v.answerExpr || '', placeholder: 'e.g. (a + b) / 2' });
      const dis = el('textarea', { rows: 3, placeholder: 'One formula per line, each modelling a common mistake, e.g. a + b' }, (v.distractorExprs || []).join('\n'));
      const con = el('input', { type: 'text', value: v.constraint || '', placeholder: 'optional, e.g. a != b && b > 0' });
      const dec = el('input', { type: 'text', value: v.decimals ?? 2, style: 'max-width:80px' });
      const unit = el('input', { type: 'text', value: v.unit || '', style: 'max-width:120px' });
      return {
        node: el('div', {},
          el('p', { class: 'small muted' }, 'Write the question with placeholders like {a}. Each student gets fresh values; the server computes the answer and the distractors. Allowed: + - * / ^ ( ), sqrt, abs, round, min, max, floor, ceil. The explanation may use {answer} and the variables.'),
          el('label', {}, 'Variables (name, min, max, step)'), rows,
          el('button', { class: 'btn small', onclick: () => addVar(), style: 'margin-bottom:10px' }, '+ variable'),
          el('div', { class: 'field' }, el('label', {}, 'Answer formula'), ans),
          el('div', { class: 'field' }, el('label', {}, 'Distractor formulas (2-4)'), dis),
          el('div', { class: 'row top' }, el('div', { class: 'field grow' }, el('label', {}, 'Constraint'), con), el('div', { class: 'field' }, el('label', {}, 'Decimals'), dec), el('div', { class: 'field' }, el('label', {}, 'Unit'), unit))),
        read: () => ({ variables: [...rows.children].map((r) => r.read()), answerExpr: ans.value, distractorExprs: dis.value.split('\n').map((s) => s.trim()).filter(Boolean), constraint: con.value, decimals: Number(dec.value), unit: unit.value }),
      };
    },
  };

  function optionsBuilder(multi) {
    const list = el('div');
    const name = 'ans-' + Math.random().toString(36).slice(2);
    const correct = multi ? new Set(v.answerIndexes || []) : new Set([v.answerIndex ?? 0]);
    const start = v.options && (v.type === 'mcq' || v.type === 'multi') ? v.options : ['', '', '', ''];
    const addOpt = (text, isRight) => {
      const mark = el('input', { type: multi ? 'checkbox' : 'radio', name, checked: isRight, 'aria-label': 'Correct answer' });
      const input = el('input', { type: 'text', value: text });
      const row = el('div', { class: 'opt-row' }, mark, input, el('button', { class: 'btn small', onclick: () => list.children.length > 3 && row.remove() }, '✕'));
      row.read = () => ({ text: input.value, right: mark.checked });
      list.append(row);
    };
    start.forEach((o, i) => addOpt(o, correct.has(i)));
    return {
      node: el('div', {},
        el('label', {}, multi ? 'Options (tick every correct one)' : 'Options (select the correct one)'), list,
        el('button', { class: 'btn small', style: 'margin-bottom:10px', onclick: () => list.children.length < (multi ? 6 : 5) && addOpt('', false) }, '+ option')),
      read: () => {
        const rows = [...list.children].map((r) => r.read());
        const options = rows.map((r) => r.text);
        return multi ? { options, answerIndexes: rows.map((r, i) => (r.right ? i : -1)).filter((i) => i >= 0) } : { options, answerIndex: rows.findIndex((r) => r.right) };
      },
    };
  }

  const stemLabel = el('label');
  const drawType = () => {
    stemLabel.textContent = typeSel.value === 'tf' ? 'Statement' : 'Question';
    current = builders[typeSel.value]();
    fill(typeSlot, current.node);
    fill(checkOut);
  };
  typeSel.addEventListener('change', drawType);
  drawType();

  const payload = () => ({
    type: typeSel.value,
    topicId: to.topicSel.value,
    outcomeId: to.loSel.value,
    stem: stem.value,
    explanation: expl.value,
    difficulty: diff.value,
    sourceIds: srcBoxes.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value),
    ...current.read(),
    prepSeconds: (Date.now() - openedAt) / 1000,
  });
  const check = action(async () => {
    const r = await api('POST', `/api/teacher/courses/${course.id}/questions/check`, { ...payload(), id: q?.id });
    fill(checkOut,
      r.errors.length ? el('div', { class: 'note bad small' }, el('b', {}, 'Fix before saving: '), r.errors.join(' ')) : el('div', { class: 'note good small' }, 'Structure checks pass.'),
      r.warnings.length ? el('div', { class: 'note warn small' }, r.warnings.join(' ')) : null,
      r.samples?.length ? el('div', { class: 'panel', style: 'background:var(--bg)' },
        el('div', { class: 'small muted' }, 'Sample variations students could get:'),
        r.samples.map((s) => el('div', { style: 'margin-top:8px' }, el('div', { style: 'font-weight:600' }, s.stem), el('div', { class: 'small' }, s.options.map((o, i) => (i === s.answerIndex ? `[${o} ✓]` : o)).join('   ·   '))))) : null);
  });
  const saveBtn = (label, publish, primary) => el('button', { class: 'btn' + (primary ? ' primary' : ''), onclick: action(async () => {
    if (q) await api('PUT', `/api/teacher/questions/${q.id}`, payload());
    else await api('POST', `/api/teacher/courses/${course.id}/questions`, { ...payload(), publish });
    toast('Saved');
    rerender();
  }) }, label);
  const willVersion = q && q.versions.at(-1).publishedAt;
  const frozenTags = q && q.versions.some((v) => v.publishedAt || v.attempts);
  if (frozenTags) {
    to.topicSel.disabled = true;
    to.loSel.disabled = true;
    to.topicSel.title = to.loSel.title = 'Published tags are fixed to preserve history. Create a new question to change the learning outcome.';
  }

  return el('div', { class: 'panel', style: 'border-color:var(--accent)' },
    el('h3', {}, q ? 'Edit question' : 'New question'),
    willVersion ? el('div', { class: 'note small' }, `This version has been published, so saving creates v${q.latest.v + 1}. Attempts on earlier versions are kept as they were.`) : null,
    el('div', { class: 'row top' }, to.nodes, el('div', { class: 'field' }, el('label', {}, 'Format'), typeSel)),
    el('div', { class: 'field' }, stemLabel, stem),
    typeSlot,
    el('div', { class: 'field' }, el('label', {}, 'Explanation shown after answering'), expl),
    el('div', { class: 'row top' },
      el('div', { class: 'field' }, el('label', {}, 'Intended difficulty'), diff),
      el('div', { class: 'field grow' }, el('label', {}, 'Source passages'), srcBoxes.length ? srcBoxes : el('span', { class: 'small muted' }, 'No passages yet'))),
    checkOut,
    el('div', { class: 'row' },
      el('button', { class: 'btn', onclick: check }, 'Check'),
      q ? saveBtn('Save', false, true) : [saveBtn('Save as draft', false, false), saveBtn('Save & publish', true, true)],
      el('button', { class: 'btn', onclick: close }, 'Cancel')));
}

// ============================================================
// Source material: paste, PDF, scans & diagrams
// ============================================================
let pdfjs = null;
async function loadPdfJs() {
  if (!pdfjs) {
    pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  }
  return pdfjs;
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = reject;
  r.readAsDataURL(blob);
});

export async function viewContent() {
  const main = root(); // this render's own container (see core.js)
  await loadCourses();
  if (!main.isConnected) return;
  const course = currentCourse();
  if (!course) return add(main, el('p', {}, 'You have no assigned courses.'));
  const passages = await api('GET', `/api/teacher/courses/${course.id}/passages`);
  const to = topicOutcomeFields(course);
  const title = el('input', { type: 'text', placeholder: 'e.g. Week 3 notes: protocols' });
  const text = el('textarea', { rows: 10, placeholder: 'Paste lecture notes here, or import a PDF / image below. Only use material you are authorised to use, and no student information.' });
  const counter = el('span', { class: 'small muted' }, '0 / 100000');
  const preview = el('div');
  const importOut = el('div');
  const confirm = el('input', { type: 'checkbox' });
  let origin = 'paste';
  text.addEventListener('input', () => {
    counter.textContent = `${text.value.length} / 100000`;
    fill(preview);
  });
  const appendText = (t, how) => {
    text.value = (text.value.trim() ? text.value.trim() + '\n\n' : '') + t.trim();
    origin = how;
    text.dispatchEvent(new Event('input'));
  };

  // --- PDF: extract the text layer in the browser; flag pages without one
  const pdfInput = el('input', { type: 'file', accept: 'application/pdf' });
  pdfInput.addEventListener('change', action(async () => {
    const file = pdfInput.files[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) throw new Error('PDF is larger than 25 MB.');
    const pages = await withProgress(importOut, 'Reading PDF…', async () => {
      const lib = await loadPdfJs();
      const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
      const out = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        // rebuild lines: pdf.js gives text runs with end-of-line markers
        const t = tc.items.map((it) => it.str + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
        out.push({ n: i, text: t, page });
      }
      return out;
    });
    if (!title.value) title.value = file.name.replace(/\.pdf$/i, '').slice(0, 120);
    const boxes = pages.map((p) => {
      const scanned = p.text.length < 30;
      const cb = el('input', { type: 'checkbox', checked: !scanned });
      const row = el('div', { class: 'opt-row small' }, cb,
        el('span', { class: 'grow' }, `Page ${p.n}: `, scanned ? el('span', { class: 'badge draft' }, 'no text layer - looks scanned') : `${p.text.length} characters - "${p.text.slice(0, 70)}…"`),
        scanned ? el('button', { class: 'btn small', disabled: !course.geminiEnabled, title: course.geminiEnabled ? '' : 'Needs GEMINI_API_KEY on the server', onclick: action(async () => {
          const vp = p.page.getViewport({ scale: 2 });
          const canvas = el('canvas', { width: Math.floor(vp.width), height: Math.floor(vp.height) });
          await p.page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
          const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
          const r = await api('POST', `/api/teacher/courses/${course.id}/transcribe`, { imageBase64: await toBase64(blob), mimeType: 'image/png', mode: 'text' });
          p.text = r.text;
          cb.checked = true;
          if (r.containsPersonalData) toast('The model flagged possible personal data on this page - please check before saving.', true);
          toast(`Page ${p.n} transcribed - included below when you click "Add selected pages"`);
        }) }, 'Transcribe with AI') : null);
      row.page = p;
      row.cb = cb;
      return row;
    });
    fill(importOut, el('div', { class: 'panel', style: 'background:var(--bg)' },
      el('div', { class: 'small muted' }, `${pages.length} page(s). Untick pages you don't want (e.g. title or reference pages).`),
      boxes,
      el('button', { class: 'btn primary small', style: 'margin-top:8px', onclick: () => {
        const chosen = boxes.filter((b) => b.cb.checked && b.page.text.trim()).map((b) => b.page.text);
        appendText(chosen.join('\n\n'), 'pdf');
        fill(importOut, el('div', { class: 'note good small' }, `Added ${chosen.length} page(s) to the text box - review it below.`));
      } }, 'Add selected pages')));
  }));

  // --- Image of a scanned page or a diagram -> Gemini -> editable text
  const imgInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp' });
  const imgMode = el('select', { style: 'width:auto' }, el('option', { value: 'text' }, 'Transcribe text (scanned page)'), el('option', { value: 'diagram' }, 'Describe a diagram'));
  const imgBtn = el('button', { class: 'btn', disabled: !course.geminiEnabled, onclick: action(async () => {
    const file = imgInput.files[0];
    if (!file) throw new Error('Choose an image first.');
    if (file.size > 4 * 1024 * 1024) throw new Error('Image is larger than 4 MB.');
    const r = await withProgress(importOut, 'Transcribing…', async () => api('POST', `/api/teacher/courses/${course.id}/transcribe`, { imageBase64: await toBase64(file), mimeType: file.type, mode: imgMode.value }));
    appendText(imgMode.value === 'diagram' ? `[Diagram description]\n${r.text}` : r.text, imgMode.value === 'diagram' ? 'diagram' : 'scan');
    fill(importOut,
      el('div', { class: 'note good small' }, 'Added the AI transcription to the text box. Check it carefully against the original - it is a suggestion, not a copy.'),
      r.containsPersonalData ? el('div', { class: 'note bad small' }, 'The model flagged possible personal data in this image. Remove it before saving.') : null);
  }) }, 'Transcribe');

  const showPreview = () => {
    // Normalise whitespace so the professor sees exactly what gets stored
    const clean = text.value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    text.value = clean;
    const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
    const defs = sentences.filter((s) => /^(?:(?:A|An|The)\s+)?[A-Za-z0-9][A-Za-z0-9\- ]{0,40}?\s+(is|are|means)\s+/.test(s));
    fill(preview, el('div', { class: 'panel', style: 'background:var(--bg)' },
      el('h3', {}, 'Preview'),
      el('p', { class: 'small muted' }, `${clean.split(/\s+/).filter(Boolean).length} words, ${sentences.length} sentences, about ${Math.max(1, Math.ceil(clean.length / 700))} retrieval chunk(s). ${defs.length} definition-style sentence(s) found (the offline drafter uses these).`),
      el('div', { style: 'max-height:320px;overflow:auto' }, clean.split('\n\n').slice(0, 40).map((para) => el('p', { style: 'white-space:pre-wrap' }, para))),
      el('label', { style: 'font-weight:400;color:inherit;margin:10px 0' }, confirm, ' I confirm this is authorised course material and contains no student personal data.'),
      el('button', { class: 'btn primary', onclick: action(async () => {
        await api('POST', `/api/teacher/courses/${course.id}/passages`, { title: title.value, topicId: to.topicSel.value, outcomeId: to.loSel.value, text: clean, origin, confirmNoPersonalData: confirm.checked });
        toast('Passage saved');
        rerender();
      }) }, 'Save passage')));
  };

  add(main,
    heading('Source material', coursePicker()),
    el('div', { class: 'panel' },
      el('h3', {}, 'Add material'),
      el('p', { class: 'small muted' }, 'Material is stored separately from questions and treated as reference content only: instructions inside it are never followed. Long documents are split into chunks so drafting only uses the relevant parts.'),
      el('div', { class: 'field' }, el('label', {}, 'Title'), title),
      el('div', { class: 'row top' }, to.nodes),
      el('div', { class: 'row top', style: 'margin-bottom:12px' },
        el('div', { class: 'panel grow', style: 'margin:0;min-width:240px' }, el('b', {}, '📄 Text-based PDF'), el('p', { class: 'small muted' }, 'Text is extracted in your browser. Scanned pages are detected and can be transcribed.'), pdfInput),
        el('div', { class: 'panel grow', style: 'margin:0;min-width:240px' }, el('b', {}, '🖼️ Scan or diagram image'),
          el('p', { class: 'small muted' }, course.geminiEnabled ? 'Gemini suggests text; you review it before saving.' : 'Needs GEMINI_API_KEY on the server (no offline OCR).'),
          imgInput, el('div', { class: 'row', style: 'margin-top:6px' }, imgMode, imgBtn))),
      importOut,
      el('div', { class: 'field' }, el('label', {}, 'Text'), text, counter),
      el('button', { class: 'btn', onclick: showPreview }, 'Preview'),
      preview),
    course.topics.map((t) => {
      const mine = passages.filter((p) => p.topicId === t.id);
      return el('div', { class: 'panel' },
        el('h3', {}, t.name, ' ', el('span', { class: 'badge plain' }, `${mine.length} passage(s)`)),
        mine.map((p) => el('details', { style: 'margin:8px 0' },
          el('summary', {}, el('b', {}, p.title), ' ', el('span', { class: 'small muted' }, `· ${t.outcomes.find((o) => o.id === p.outcomeId)?.text} · ${p.text.length} chars${p.origin && p.origin !== 'paste' ? ' · from ' + p.origin : ''} · cited by ${p.usedBy} question(s)`)),
          el('p', { class: 'small', style: 'white-space:pre-wrap;margin-top:6px;max-height:240px;overflow:auto' }, p.text),
          el('button', { class: 'btn small bad', onclick: action(async () => {
            await api('DELETE', `/api/teacher/passages/${p.id}`);
            toast('Passage deleted');
            rerender();
          }) }, 'Delete passage'))));
    }));
}

// ============================================================
// AI drafting
// ============================================================
export async function viewGenerate() {
  const main = root(); // this render's own container (see core.js)
  await loadCourses();
  if (!main.isConnected) return;
  const course = currentCourse();
  if (!course) return add(main, el('p', {}, 'You have no assigned courses.'));
  const [coverage, history] = await Promise.all([api('GET', `/api/teacher/courses/${course.id}/coverage`), api('GET', `/api/teacher/courses/${course.id}/generations`)]);
  const to = topicOutcomeFields(course);
  const count = el('select', {}, [1, 2, 3, 4, 5].map((n) => el('option', { value: n, selected: n === 3 }, n)));
  const format = el('select', {}, course.formats.all.map((f) => {
    const ok = course.formats.drafter.includes(f);
    return el('option', { value: f, disabled: !ok }, course.formats.labels[f] + (ok ? '' : ' (needs Gemini)'));
  }));
  const focus = el('input', { type: 'text', placeholder: 'optional, e.g. latency bandwidth' });
  const result = el('div');

  const run = (force) => action(async () => {
    const r = await withProgress(result, 'Drafting…', () => api('POST', `/api/teacher/courses/${course.id}/generate`, { topicId: to.topicSel.value, outcomeId: to.loSel.value, count: Number(count.value), format: format.value, focus: focus.value, force }));
    fill(result,
      r.cached
        ? el('div', { class: 'note' }, 'These exact inputs were drafted before, so nothing new was generated (saves cost and avoids duplicates). ', el('button', { class: 'btn small', onclick: run(true) }, 'Generate anyway'))
        : el('div', { class: r.created.length ? 'note good' : 'note warn' }, `${r.created.length} draft(s) added to the review queue.`),
      r.rejected.length
        ? el('div', { class: 'note warn' }, el('b', {}, `${r.rejected.length} item(s) failed the structure checks and were discarded:`),
          el('ul', {}, r.rejected.map((x) => el('li', { class: 'small' }, `"${x.stem.slice(0, 90)}" - ${x.errors.join(' ')}`))))
        : null,
      r.retrieved?.length ? el('details', { class: 'small', style: 'margin-bottom:10px' },
        el('summary', {}, `Material sent to the drafter (${r.retrieved.length} chunk(s))`),
        el('table', {}, el('tbody', {}, r.retrieved.map((c) => el('tr', {}, el('td', {}, c.title), el('td', { class: 'muted' }, c.why.join(', ')), el('td', {}, c.score), el('td', { class: 'muted' }, `"${c.preview}…"`)))))) : null,
      r.created.length ? el('button', { class: 'btn primary', onclick: () => ((S.tab = 'review'), (S.qFilter = 'draft'), rerender()) }, 'Review drafts →') : null);
  });

  add(main,
    heading('AI drafting', coursePicker()),
    el('div', { class: 'panel' },
      el('div', { class: 'note small' }, el('b', {}, 'Drafter: '), course.drafter, '. ',
        course.geminiEnabled ? '' : 'Set GEMINI_API_KEY in the server environment to use Gemini and unlock every format. ',
        'The drafter only sees the retrieved chunks - never student names, grades or tools. Structure checks (and maths sampling) run in code; correctness is your call during review.'),
      el('div', { class: 'row top' }, to.nodes),
      el('div', { class: 'row top' },
        el('div', { class: 'field' }, el('label', {}, 'Format'), format),
        el('div', { class: 'field' }, el('label', {}, 'Batch size'), count),
        el('div', { class: 'field grow' }, el('label', {}, 'Focus keywords'), focus)),
      el('button', { class: 'btn primary', onclick: run(false) }, 'Draft questions'),
      result),
    el('div', { class: 'panel' },
      el('h3', {}, 'Coverage'),
      el('p', { class: 'small muted' }, `Target: ${course.coverageTarget} published questions per learning outcome (change it in Settings). Generate where there are gaps, rather than after every student answer.`),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['Topic', 'Learning outcome', 'Published', 'Drafts', 'Passages', ''].map((h) => el('th', {}, h)))),
        el('tbody', {}, coverage.map((c) => el('tr', {},
          el('td', {}, c.topic),
          el('td', {}, c.outcome),
          el('td', {}, `${c.published} / ${c.target}`),
          el('td', {}, c.drafts),
          el('td', {}, c.passages),
          el('td', {}, c.gap ? el('button', { class: 'btn small', onclick: () => {
            to.topicSel.value = c.topicId;
            to.topicSel.dispatchEvent(new Event('change'));
            to.loSel.value = c.outcomeId;
            count.value = String(Math.min(5, c.gap));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } }, `Fill gap (${c.gap})`) : el('span', { class: 'badge published' }, 'covered')))))))),
    el('div', { class: 'panel' },
      el('h3', {}, 'Generation log'),
      history.length ? el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['When', 'Outcome', 'Format', 'Drafter', 'Chunks', 'Kept', 'Discarded'].map((h) => el('th', {}, h)))),
        el('tbody', {}, history.map((g) => el('tr', {},
          el('td', {}, when(g.at)),
          el('td', {}, course.topics.flatMap((t) => t.outcomes).find((o) => o.id === g.outcomeId)?.text),
          el('td', {}, course.formats.labels[g.format || 'mcq']),
          el('td', {}, g.provider + (g.model ? ` (${g.model})` : '')),
          el('td', {}, g.chunkCount ?? g.passageIds.length),
          el('td', {}, g.ok || g.createdQuestionIds.length ? g.createdQuestionIds.length : el('span', { class: 'badge rejected' }, g.error || 'none')),
          el('td', {}, g.rejected.length))))))
        : el('p', { class: 'muted small' }, 'Nothing generated yet.')));
}

// ============================================================
// Analytics (+ free-response marking, participation)
// ============================================================
export async function viewAnalytics() {
  const main = root(); // this render's own container (see core.js)
  await loadCourses();
  const classes = courses.flatMap((c) => c.classes);
  if (!classes.length) return add(main, el('p', {}, 'You have no classes.'));
  const picker = classPicker(classes);
  const [a, marking] = await Promise.all([api('GET', `/api/teacher/classes/${S.classId}/analytics`), api('GET', `/api/teacher/classes/${S.classId}/marking`)]);
  const tile = (v, l) => el('div', { class: 'tile' }, el('div', { class: 'v' }, v), el('div', { class: 'l' }, l));
  const frac = (r) => (r.n ? `${pct(r.accuracy)} (${r.correct}/${r.n})` : '-');

  add(main,
    heading('Analytics', picker),
    el('div', { class: 'tiles' },
      tile(`${a.participation.activeEver} / ${a.participation.enrolled}`, 'students who have practised'),
      tile(`${a.participation.active7d} / ${a.participation.enrolled}`, 'active in the last 7 days'),
      tile(String(a.participation.sessionsCompleted), 'sessions completed'),
      tile(String(a.participation.attempts), `answers submitted (${a.participation.worldAttempts} in World)`)),
    marking.length ? el('div', { class: 'panel', style: 'border-color:var(--warn)' },
      el('h3', {}, `Answers to mark (${marking.length})`),
      el('p', { class: 'small muted' }, 'Free-response answers get a provisional automatic mark. Confirm or change it; marking an answer correct pays the usual first-correct coins. Answers are shown without student names.'),
      marking.map((m) => el('div', { style: 'padding:10px 0;border-bottom:1px solid var(--line)' },
        el('div', { style: 'font-weight:600' }, m.stem),
        el('div', { class: 'small muted' }, 'Key points: ', m.keyPoints.map((k, i) => (m.coveredPoints.includes(i) ? `✓ ${k}` : `○ ${k}`)).join(' · ')),
        el('div', { class: 'panel', style: 'background:var(--bg);margin:6px 0;padding:10px;white-space:pre-wrap' }, m.text || '(blank)'),
        el('div', { class: 'row' },
          el('span', { class: 'small' }, `Auto (${m.method}): `, el('b', {}, m.autoCorrect ? 'correct' : 'not correct'), ` · ${pct(m.score)} of key points`),
          el('button', { class: 'btn small good', onclick: action(async () => {
            await api('POST', `/api/teacher/attempts/${m.attemptId}/mark`, { correct: true });
            rerender();
          }) }, 'Mark correct'),
          el('button', { class: 'btn small bad', onclick: action(async () => {
            await api('POST', `/api/teacher/attempts/${m.attemptId}/mark`, { correct: false });
            rerender();
          }) }, 'Mark not correct'))))) : null,
    el('div', { class: 'panel' },
      el('h3', {}, 'By topic'),
      el('p', { class: 'small muted' }, 'First attempts are a student\'s first ever answer to a question; retries are later answers (often after seeing the explanation). Response time is context, not a measure of ability.'),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['Topic', 'First-attempt accuracy', '', 'Retry accuracy', 'Students', 'Median / p75 time', 'Timeouts'].map((h) => el('th', {}, h)))),
        el('tbody', {}, a.byTopic.map((t) => el('tr', {},
          el('td', {}, t.name),
          el('td', {}, frac(t.first)),
          el('td', { style: 'width:120px' }, meter(t.first.accuracy)),
          el('td', {}, frac(t.retry)),
          el('td', {}, t.students),
          el('td', {}, `${secs(t.medianMs)} / ${secs(t.p75Ms)}`),
          el('td', {}, t.timeouts))))))),
    el('div', { class: 'panel' },
      el('h3', {}, 'Commonly missed questions'),
      el('p', { class: 'small muted' }, `Lowest first-attempt accuracy, questions with at least ${a.minN} first attempts. Low accuracy is a reason to look closer: it can mean a difficult concept, an ambiguous question, or a gap in coverage.`),
      a.commonlyMissed.length ? a.commonlyMissed.map((q) => el('div', { style: 'padding:10px 0;border-bottom:1px solid var(--line)' },
        el('div', { class: 'row' }, el('div', { class: 'grow', style: 'font-weight:600' }, q.stem), el('span', { class: 'badge plain' }, q.type), el('span', { class: 'badge ' + q.status }, q.status)),
        el('div', { class: 'small muted' }, `${q.topic} · first attempts ${frac(q.first)} · retries ${frac(q.retry)} · versions answered: ${q.versionsAttempted.map((v) => 'v' + v).join(', ')}`),
        q.topWrong ? el('div', { class: 'small' }, 'Most chosen wrong answer: ', el('b', {}, `"${q.topWrong.option}"`), ` (${q.topWrong.count}x)`) : null,
        q.openReports ? el('div', { class: 'small', style: 'color:var(--bad)' }, `${q.openReports} open student report(s) - see Question bank → Reported`) : null))
        : el('p', { class: 'muted small' }, 'Not enough data yet.')),
    a.points ? el('div', { class: 'panel' },
      el('div', { class: 'row' }, el('h3', { class: 'grow' }, 'Participation points'),
        el('button', { class: 'btn small', onclick: action(() => download(`/api/teacher/classes/${S.classId}/participation.csv`, `participation-${S.classId}.csv`)) }, 'Download CSV')),
      el('p', { class: 'small muted' }, 'One point per completed practice session of 5+ questions (max 3 per week), regardless of score. Turned on in Settings.'),
      el('table', {}, el('tbody', {}, a.points.map((p) => el('tr', {}, el('td', {}, p.name), el('td', {}, p.points)))))) : null,
    el('p', { class: 'small muted' }, 'These are practice indicators to support teaching judgement. They are not grades, and the platform does not label individual students.'));
}

// ============================================================
// Evaluation: is the prototype doing its job?
// ============================================================
export async function viewEvaluation() {
  const main = root(); // this render's own container (see core.js)
  await loadCourses();
  if (!main.isConnected) return;
  const course = currentCourse();
  if (!course) return add(main, el('p', {}, 'You have no assigned courses.'));
  const ev = await api('GET', `/api/teacher/courses/${course.id}/evaluation`);
  const n = (x, d = 1) => (x === null || x === undefined ? '-' : Number(x).toFixed(d));
  const r = ev.recommendation;
  const u = ev.usability;
  const totalRatings = u.ratings[1] + u.ratings[2] + u.ratings[3];

  add(main,
    heading('Prototype evaluation', coursePicker()),
    el('div', { class: 'note small' }, 'The measures the proposal commits to. All descriptive: small samples and no control group, so none of this shows that learning improved.'),
    el('div', { class: 'panel' },
      el('h3', {}, 'Question drafting: acceptance and editing'),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['Source', 'Total', 'Pending', 'Approved', 'Rejected', 'Acceptance', 'Edited before approval', 'Discarded by checks', 'Median review time'].map((h) => el('th', {}, h)))),
        el('tbody', {}, ev.drafting.map((d) => el('tr', {},
          el('td', {}, ORIGIN[d.origin] || d.origin), el('td', {}, d.total), el('td', {}, d.pending), el('td', {}, d.approved), el('td', {}, d.rejected),
          el('td', {}, pct(d.acceptanceRate)), el('td', {}, d.approved ? `${d.editedBeforeApproval} (${pct(d.editRate)})` : '-'), el('td', {}, d.discardedByChecks),
          el('td', {}, d.medianReviewHours === null ? '-' : `${n(d.medianReviewHours)} h`))))))),
    el('div', { class: 'panel' },
      el('h3', {}, 'Preparation time'),
      el('p', { class: 'small muted' }, 'Time with the question editor open (capped at 1 hour per save). Hand-written baseline in the demo data is synthetic.'),
      el('div', { class: 'table-wrap' }, el('table', {},
        el('thead', {}, el('tr', {}, ['Source', 'Questions timed', 'Total minutes', 'Median per question', 'Minutes per published question'].map((h) => el('th', {}, h)))),
        el('tbody', {}, ev.prep.map((p) => el('tr', {},
          el('td', {}, ORIGIN[p.origin] || p.origin), el('td', {}, p.questionsTimed), el('td', {}, n(p.totalMinutes)),
          el('td', {}, p.medianSeconds === null ? '-' : `${Math.round(p.medianSeconds)} s`), el('td', {}, n(p.minutesPerPublished)))))))),
    el('div', { class: 'panel' },
      el('h3', {}, 'Recommendation behaviour'),
      el('div', { class: 'tiles' },
        el('div', { class: 'tile' }, el('div', { class: 'v' }, `${r.adaptive} / ${r.sessions}`), el('div', { class: 'l' }, `sessions personalised (${r.broad} broad)`)),
        el('div', { class: 'tile' }, el('div', { class: 'v' }, pct(r.meanWeakShare)), el('div', { class: 'l' }, 'of personalised questions from focus topics (target 70%)')),
        el('div', { class: 'tile' }, el('div', { class: 'v' }, String(r.shortageNotices)), el('div', { class: 'l' }, 'sessions that disclosed a small bank')),
        el('div', { class: 'tile' }, el('div', { class: 'v' }, r.meanAccuracyChange === null ? '-' : `${r.meanAccuracyChange >= 0 ? '+' : ''}${Math.round(r.meanAccuracyChange * 100)} pts`), el('div', { class: 'l' }, `focus-topic accuracy, next session vs before (n=${r.followUps})`)))),
    el('div', { class: 'panel' },
      el('h3', {}, 'Student usability'),
      el('div', { class: 'tiles' },
        el('div', { class: 'tile' }, el('div', { class: 'v' }, pct(u.completionRate)), el('div', { class: 'l' }, `sessions completed (${u.completed}/${u.started})`)),
        el('div', { class: 'tile' }, el('div', { class: 'v' }, u.medianMinutes === null ? '-' : `${n(u.medianMinutes)} min`), el('div', { class: 'l' }, 'median session length')),
        el('div', { class: 'tile' }, el('div', { class: 'v' }, `😕 ${u.ratings[1]} · 😐 ${u.ratings[2]} · 🙂 ${u.ratings[3]}`), el('div', { class: 'l' }, `end-of-session ratings (n=${totalRatings})`))),
      u.comments.length ? el('div', {}, el('b', { class: 'small' }, 'Recent comments (anonymous)'), el('ul', {}, u.comments.map((c) => el('li', { class: 'small' }, ['', '😕', '😐', '🙂'][c.rating], ' ', c.comment)))) : el('p', { class: 'small muted' }, 'No comments yet.')));
}

// ============================================================
// Settings: subject guidance, coverage, class toggles, trade log
// ============================================================
export async function viewSettings() {
  const main = root(); // this render's own container (see core.js)
  await loadCourses(true);
  if (!main.isConnected) return;
  const course = currentCourse();
  if (!course) return add(main, el('p', {}, 'You have no assigned courses.'));
  const guidance = el('textarea', { rows: 3, maxlength: 1000 }, course.promptConfig);
  const target = el('input', { type: 'number', min: 1, max: 50, value: course.coverageTarget, style: 'max-width:100px' });

  const classPanels = await Promise.all(course.classes.map(async (cl) => {
    const trades = await api('GET', `/api/teacher/classes/${cl.id}/trades`);
    const toggle = (label, key, checked, help) => el('label', { style: 'font-weight:400;color:inherit;margin:8px 0' },
      el('input', { type: 'checkbox', checked, onchange: action(async (e) => {
        const box = e.target;
        try {
          await api('PUT', `/api/teacher/classes/${cl.id}/settings`, { [key]: box.checked });
        } catch (err) {
          box.checked = !box.checked; // failed: show the setting as it really is
          throw err;
        }
        toast('Saved');
        rerender();
      }) }), ' ', el('b', {}, label), el('div', { class: 'small muted', style: 'margin-left:24px' }, help));
    return el('div', { class: 'panel' },
      el('h3', {}, cl.name),
      toggle('Allow resource trading between classmates', 'tradingEnabled', cl.settings.tradingEnabled, 'Students post offers to the whole class (no private targeting), with limits on open offers, size and daily trades. Turning this off refunds every open offer.'),
      toggle('Award participation points', 'participationEnabled', !!cl.settings.participation?.enabled, 'Needs team decision (proposal §5). One point per completed session of 5+ questions, max 3/week, regardless of score. Points are visible to students and exportable as CSV. Off by default.'),
      el('details', { style: 'margin-top:10px' },
        el('summary', {}, `Trade log (${trades.length})`),
        trades.length ? el('div', { class: 'table-wrap' }, el('table', {}, el('tbody', {}, trades.map((t) => el('tr', {},
          el('td', { class: 'small muted' }, when(t.createdAt)),
          el('td', {}, t.from),
          el('td', {}, `${fmtBundle(t.give, RES)} for ${fmtBundle(t.want, RES)}`),
          el('td', {}, el('span', { class: 'badge ' + (t.status === 'accepted' ? 'published' : t.status === 'open' ? 'draft' : 'plain') }, t.status)),
          el('td', {}, t.acceptedByName || '')))))) : el('p', { class: 'small muted' }, 'No trades yet.')));
  }));

  add(main,
    heading('Settings', coursePicker()),
    el('div', { class: 'panel' },
      el('h3', {}, 'Subject guidance for AI drafting'),
      el('p', { class: 'small muted' }, 'Added to every drafting prompt for this course (e.g. "use SI units", "prefer applied scenarios"). It is the per-subject "skill" from proposal §6.'),
      guidance,
      el('div', { class: 'row', style: 'margin-top:10px' },
        el('label', { style: 'margin:0' }, 'Coverage target per learning outcome'), target,
        el('button', { class: 'btn primary', onclick: action(async () => {
          await api('PUT', `/api/teacher/courses/${course.id}/settings`, { promptConfig: guidance.value, coverageTarget: Number(target.value) });
          toast('Saved');
          await loadCourses(true);
        }) }, 'Save'))),
    classPanels);
}
const RES = { wood: { emoji: '🪵' }, crystal: { emoji: '💎' }, herb: { emoji: '🌿' } };
