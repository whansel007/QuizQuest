// ============================================================
// QuizQuest - browser app (professor + student views)
// ------------------------------------------------------------
// Same philosophy as the Circle Tag client: this file is a SCREEN.
// It never decides if an answer is right or how many coins you get;
// it sends what you clicked and shows what the server says.
// All text is inserted with textContent (via el()), never innerHTML,
// so pasted course material can't inject markup.
// ============================================================

const main = document.getElementById('main');
const tabsEl = document.getElementById('tabs');
const whoEl = document.getElementById('who');
const toastEl = document.getElementById('toast');

// Per-tab login, so two tabs can be a professor and a student side by side
const S = {
  token: sessionStorage.getItem('qq-token'),
  me: null,
  tab: null,
  courseId: null,
  classId: null,
  qFilter: 'draft',
};

// ---------- tiny helpers ----------
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k === 'value') n.value = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.append(kid instanceof Node ? kid : String(kid));
  }
  return n;
}
// Like node.replaceChildren, but skips null/false (which would otherwise
// be rendered as the text "null")
function fill(node, ...kids) {
  node.replaceChildren(...kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
}
const pct = (x) => (x === null || x === undefined ? '-' : Math.round(x * 100) + '%');
const secs = (ms) => (ms === null || ms === undefined ? '-' : (ms / 1000).toFixed(1) + 's');
const when = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const reqId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

let toastTimer = null;
function toast(msg, bad) {
  toastEl.textContent = msg;
  toastEl.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.className = ''), 3200);
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && S.token) {
    signOut();
    throw new Error('Session expired, please sign in again.');
  }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

// Wrap an async click handler: disable the button and report errors
function action(fn) {
  return async (e) => {
    const btn = e && e.currentTarget;
    if (btn) btn.disabled = true;
    try {
      await fn(e);
    } catch (err) {
      toast(err.message, true);
    } finally {
      if (btn && btn.isConnected) btn.disabled = false;
    }
  };
}

function meter(x) {
  return el('div', { class: 'meter', title: pct(x) }, el('div', { style: `width:${Math.round((x || 0) * 100)}%` }));
}

// ============================================================
// Shell: login, header, tabs
// ============================================================
const TABS = {
  teacher: [['review', 'Question bank'], ['content', 'Source material'], ['generate', 'AI drafting'], ['analytics', 'Analytics']],
  student: [['practice', 'Practice'], ['pets', 'Pets & shop']],
};

function signOut() {
  if (S.token) api('POST', '/api/logout').catch(() => {});
  sessionStorage.removeItem('qq-token');
  Object.assign(S, { token: null, me: null, tab: null, courseId: null, classId: null });
  render();
}

async function boot() {
  if (S.token) {
    try {
      S.me = await api('GET', '/api/me');
    } catch {
      S.token = null;
    }
  }
  render();
}

function render() {
  fill(tabsEl);
  fill(whoEl);
  fill(main);
  if (!S.me) return renderLogin();
  const tabs = TABS[S.me.role];
  S.tab = S.tab || tabs[0][0];
  for (const [id, label] of tabs) {
    tabsEl.append(el('button', { 'aria-current': S.tab === id ? 'page' : null, onclick: () => ((S.tab = id), render()) }, label));
  }
  whoEl.append(el('span', {}, S.me.name), el('button', { class: 'btn small', onclick: signOut }, 'Switch user'));
  const view = { review: viewReview, content: viewContent, generate: viewGenerate, analytics: viewAnalytics, practice: viewPractice, pets: viewPets }[S.tab];
  view().catch((err) => main.append(el('div', { class: 'note bad' }, err.message)));
}

async function renderLogin() {
  const users = await api('GET', '/api/demo-users');
  const group = (role, title) =>
    el('div', { class: 'panel' },
      el('h3', {}, title),
      el('div', { class: 'login-grid' },
        users.filter((u) => u.role === role).map((u) =>
          el('button', {
            onclick: action(async () => {
              const r = await api('POST', '/api/login', { userId: u.id });
              S.token = r.token;
              sessionStorage.setItem('qq-token', r.token);
              S.me = r.user;
              render();
            }),
          }, el('b', {}, u.name), el('span', { class: 'small muted' }, u.note)))));
  main.append(
    el('div', { class: 'panel' },
      el('h2', {}, 'Pick a demo user'),
      el('p', { class: 'muted' }, 'This prototype uses synthetic accounts with no passwords. The real build would use proper sign-in, with professor access assigned by an administrator. Tip: open a second browser tab to be a professor and a student at the same time.')),
    group('teacher', 'Professors'),
    group('student', 'Students'));
}

// Teachers: shared course/class picker data
let teacherCourses = null;
async function loadCourses(force) {
  if (!teacherCourses || force) teacherCourses = await api('GET', '/api/teacher/courses');
  if (!S.courseId || !teacherCourses.some((c) => c.id === S.courseId)) S.courseId = teacherCourses[0]?.id;
  return teacherCourses;
}
const currentCourse = () => teacherCourses.find((c) => c.id === S.courseId);
function coursePicker(onChange) {
  if (teacherCourses.length < 2) return el('span', { class: 'badge plain' }, currentCourse().title);
  return el('select', { style: 'width:auto', onchange: (e) => ((S.courseId = e.target.value), onChange()) },
    teacherCourses.map((c) => el('option', { value: c.id, selected: c.id === S.courseId }, c.title)));
}

// topic + learning outcome selects that stay in sync
function topicOutcomeFields(course, init = {}) {
  const topicSel = el('select', {}, course.topics.map((t) => el('option', { value: t.id, selected: t.id === init.topicId }, t.name)));
  const loSel = el('select');
  const syncOutcomes = () => {
    const t = course.topics.find((x) => x.id === topicSel.value);
    fill(loSel, ...t.outcomes.map((o) => el('option', { value: o.id, selected: o.id === init.outcomeId }, o.text)));
  };
  topicSel.addEventListener('change', syncOutcomes);
  syncOutcomes();
  return {
    topicSel,
    loSel,
    nodes: [el('div', { class: 'field grow' }, el('label', {}, 'Topic'), topicSel), el('div', { class: 'field grow' }, el('label', {}, 'Learning outcome'), loSel)],
  };
}

// ============================================================
// PROFESSOR: question bank & review
// ============================================================
async function viewReview() {
  await loadCourses();
  const course = currentCourse();
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
    fill(list, ...(shown.length ? shown.map((q) => questionCard(q, course, passages, refresh)) : [el('p', { class: 'muted' }, 'Nothing here.')]));
  };
  const refresh = () => viewReviewRerender();

  main.append(
    el('div', { class: 'row', style: 'margin-bottom:14px' },
      el('h2', { class: 'grow', style: 'margin:0' }, 'Question bank'),
      coursePicker(refresh),
      el('button', { class: 'btn primary', onclick: () => fill(editorSlot, questionEditor(course, passages, null, refresh, () => fill(editorSlot))) }, '+ New question')),
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
function viewReviewRerender() {
  fill(main);
  loadCourses(true).then(viewReview).catch((err) => toast(err.message, true));
}

function questionCard(q, course, passages, refresh) {
  const topic = course.topics.find((t) => t.id === q.topicId);
  const outcome = topic?.outcomes.find((o) => o.id === q.outcomeId);
  const v = q.latest;
  const slot = el('div');
  const setStatus = (a) => action(async () => {
    await api('POST', `/api/teacher/questions/${q.id}/status`, { action: a });
    toast({ approve: 'Published', reject: 'Rejected', withdraw: 'Withdrawn from practice', republish: 'Published again' }[a]);
    refresh();
  });
  const totalAttempts = q.versions.reduce((n, x) => n + x.attempts, 0);
  const card = el('div', { class: 'panel qcard' },
    el('div', { class: 'meta' },
      el('span', { class: 'badge ' + q.status }, q.status),
      el('span', { class: 'badge plain' }, { manual: 'written by hand', template: 'offline drafter', ai: 'Gemini draft', custom: 'drafted' }[q.origin] || q.origin),
      el('span', { class: 'badge plain' }, v.difficulty),
      el('span', { class: 'badge plain' }, `v${v.v}${q.publishedVersion && q.publishedVersion !== v.v ? ` (live: v${q.publishedVersion})` : ''}`),
      el('span', { class: 'small muted' }, `${topic?.name} → ${outcome?.text}`)),
    el('div', { style: 'font-weight:650' }, v.stem),
    el('ol', { type: 'A' }, v.options.map((o, i) => el('li', { class: i === v.answerIndex ? 'correct' : null }, o, i === v.answerIndex ? '  ✓' : ''))),
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
          refresh();
        }) }, 'Mark resolved'))),
    el('div', { class: 'actions' },
      ['draft', 'rejected'].includes(q.status) ? el('button', { class: 'btn good', onclick: setStatus('approve') }, 'Approve & publish') : null,
      q.status === 'draft' ? el('button', { class: 'btn bad', onclick: setStatus('reject') }, 'Reject') : null,
      q.status === 'published' ? el('button', { class: 'btn bad', onclick: setStatus('withdraw') }, 'Withdraw') : null,
      q.status === 'withdrawn' ? el('button', { class: 'btn', onclick: setStatus('republish') }, 'Publish again') : null,
      el('button', { class: 'btn', onclick: () => fill(slot, questionEditor(course, passages, q, refresh, () => fill(slot))) }, 'Edit')),
    slot);
  return card;
}

function questionEditor(course, passages, q, refresh, close) {
  const v = q ? q.latest : { stem: '', options: ['', '', '', ''], answerIndex: 0, explanation: '', difficulty: 'medium', sourceIds: [] };
  const to = topicOutcomeFields(course, q || {});
  if (q) {
    to.topicSel.disabled = true;
    to.loSel.disabled = true;
  }
  const stem = el('textarea', { rows: 2 }, v.stem);
  const radioName = 'ans-' + Math.random().toString(36).slice(2);
  const optInputs = v.options.map((o) => el('input', { type: 'text', value: o }));
  const radios = v.options.map((_, i) => el('input', { type: 'radio', name: radioName, checked: i === v.answerIndex, 'aria-label': 'Correct answer' }));
  const expl = el('textarea', { rows: 2 }, v.explanation);
  const diff = el('select', {}, ['easy', 'medium', 'hard'].map((d) => el('option', { value: d, selected: d === v.difficulty }, d)));
  const srcBoxes = passages.map((p) => el('label', { style: 'font-weight:400;color:inherit' }, el('input', { type: 'checkbox', value: p.id, checked: v.sourceIds.includes(p.id) }), ' ', p.title));
  const willVersion = q && q.versions.at(-1).publishedAt;

  const payload = () => ({
    topicId: to.topicSel.value,
    outcomeId: to.loSel.value,
    stem: stem.value,
    options: optInputs.map((i) => i.value),
    answerIndex: radios.findIndex((r) => r.checked),
    explanation: expl.value,
    difficulty: diff.value,
    sourceIds: srcBoxes.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value),
  });
  const saveBtn = (label, publish, primary) => el('button', { class: 'btn' + (primary ? ' primary' : ''), onclick: action(async () => {
    if (q) await api('PUT', `/api/teacher/questions/${q.id}`, payload());
    else await api('POST', `/api/teacher/courses/${course.id}/questions`, { ...payload(), publish });
    toast('Saved');
    refresh();
  }) }, label);

  return el('div', { class: 'panel', style: 'border-color:var(--accent)' },
    el('h3', {}, q ? 'Edit question' : 'New question'),
    willVersion ? el('div', { class: 'note small' }, `This version has been published, so saving creates v${q.latest.v + 1}. Attempts on earlier versions are kept as they were.`) : null,
    el('div', { class: 'row top' }, to.nodes),
    el('div', { class: 'field' }, el('label', {}, 'Question'), stem),
    el('label', {}, 'Options (select the correct one)'),
    optInputs.map((inp, i) => el('div', { class: 'opt-row' }, radios[i], inp)),
    el('div', { class: 'field' }, el('label', {}, 'Explanation shown after answering'), expl),
    el('div', { class: 'row top' },
      el('div', { class: 'field' }, el('label', {}, 'Intended difficulty'), diff),
      el('div', { class: 'field grow' }, el('label', {}, 'Source passages'), srcBoxes.length ? srcBoxes : el('span', { class: 'small muted' }, 'No passages yet'))),
    el('div', { class: 'row' },
      q ? saveBtn('Save', false, true) : [saveBtn('Save as draft', false, false), saveBtn('Save & publish', true, true)],
      el('button', { class: 'btn', onclick: close }, 'Cancel')));
}

// ============================================================
// PROFESSOR: source material
// ============================================================
async function viewContent() {
  await loadCourses();
  const course = currentCourse();
  const passages = await api('GET', `/api/teacher/courses/${course.id}/passages`);
  const to = topicOutcomeFields(course);
  const title = el('input', { type: 'text', placeholder: 'e.g. Week 3 notes: protocols' });
  const text = el('textarea', { rows: 8, placeholder: 'Paste lecture notes or text copied from a text-based PDF. Only paste material you are authorised to use, and no student information.' });
  const counter = el('span', { class: 'small muted' }, '0 / 20000');
  const preview = el('div');
  text.addEventListener('input', () => {
    counter.textContent = `${text.value.length} / 20000`;
    fill(preview);
  });

  const showPreview = () => {
    // Normalise whitespace so the professor sees exactly what gets stored
    const clean = text.value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    text.value = clean;
    const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
    const defs = sentences.filter((s) => /^(?:(?:A|An|The)\s+)?[A-Za-z0-9][A-Za-z0-9\- ]{0,40}?\s+(is|are|means)\s+/.test(s));
    fill(preview, el('div', { class: 'panel', style: 'background:var(--bg)' },
      el('h3', {}, 'Preview'),
      el('p', { class: 'small muted' }, `${clean.split(/\s+/).filter(Boolean).length} words, ${sentences.length} sentences. ${defs.length} definition-style sentence(s) found (the offline drafter uses these).`),
      clean.split('\n\n').map((para) => el('p', { style: 'white-space:pre-wrap' }, para)),
      el('button', { class: 'btn primary', onclick: action(async () => {
        await api('POST', `/api/teacher/courses/${course.id}/passages`, { title: title.value, topicId: to.topicSel.value, outcomeId: to.loSel.value, text: clean });
        toast('Passage saved');
        fill(main);
        viewContent();
      }) }, 'Looks right - save passage')));
  };

  main.append(
    el('div', { class: 'row', style: 'margin-bottom:14px' }, el('h2', { class: 'grow', style: 'margin:0' }, 'Source material'), coursePicker(() => ((main.innerHTML = ''), viewContent()))),
    el('div', { class: 'panel' },
      el('h3', {}, 'Add a passage'),
      el('p', { class: 'small muted' }, 'Passages are stored separately from questions and are treated as reference content only: instructions inside them are never followed. Scanned PDFs and diagrams are out of scope for this prototype.'),
      el('div', { class: 'field' }, el('label', {}, 'Title'), title),
      el('div', { class: 'row top' }, to.nodes),
      el('div', { class: 'field' }, el('label', {}, 'Text'), text, counter),
      el('button', { class: 'btn', onclick: showPreview }, 'Preview'),
      preview),
    course.topics.map((t) => {
      const mine = passages.filter((p) => p.topicId === t.id);
      return el('div', { class: 'panel' },
        el('h3', {}, t.name, ' ', el('span', { class: 'badge plain' }, `${mine.length} passage(s)`)),
        mine.map((p) => el('details', { style: 'margin:8px 0' },
          el('summary', {}, el('b', {}, p.title), ' ', el('span', { class: 'small muted' }, `· ${t.outcomes.find((o) => o.id === p.outcomeId)?.text} · cited by ${p.usedBy} question(s)`)),
          el('p', { class: 'small', style: 'white-space:pre-wrap;margin-top:6px' }, p.text),
          el('button', { class: 'btn small bad', onclick: action(async () => {
            await api('DELETE', `/api/teacher/passages/${p.id}`);
            toast('Passage deleted');
            fill(main);
            viewContent();
          }) }, 'Delete passage'))));
    }));
}

// ============================================================
// PROFESSOR: AI drafting
// ============================================================
async function viewGenerate() {
  await loadCourses();
  const course = currentCourse();
  const [coverage, history] = await Promise.all([api('GET', `/api/teacher/courses/${course.id}/coverage`), api('GET', `/api/teacher/courses/${course.id}/generations`)]);
  const to = topicOutcomeFields(course);
  const count = el('select', {}, [1, 2, 3, 4, 5].map((n) => el('option', { value: n, selected: n === 3 }, n)));
  const result = el('div');
  const rerender = () => {
    fill(main);
    loadCourses(true).then(viewGenerate);
  };

  const run = (force) => action(async () => {
    fill(result, el('p', { class: 'muted' }, 'Drafting…'));
    const r = await api('POST', `/api/teacher/courses/${course.id}/generate`, { topicId: to.topicSel.value, outcomeId: to.loSel.value, count: Number(count.value), force });
    fill(result, 
      r.cached
        ? el('div', { class: 'note' }, 'These exact inputs were drafted before, so nothing new was generated (saves cost and avoids duplicates). ',
          el('button', { class: 'btn small', onclick: run(true) }, 'Generate anyway'))
        : el('div', { class: r.created.length ? 'note good' : 'note warn' }, `${r.created.length} draft(s) added to the review queue.`),
      r.rejected.length
        ? el('div', { class: 'note warn' }, el('b', {}, `${r.rejected.length} item(s) failed the structure checks and were discarded:`),
          el('ul', {}, r.rejected.map((x) => el('li', { class: 'small' }, `"${x.stem.slice(0, 90)}" - ${x.errors.join(' ')}`))))
        : null,
      r.created.length ? el('button', { class: 'btn primary', onclick: () => ((S.tab = 'review'), (S.qFilter = 'draft'), render()) }, 'Review drafts →') : null);
  });

  main.append(
    el('div', { class: 'row', style: 'margin-bottom:14px' }, el('h2', { class: 'grow', style: 'margin:0' }, 'AI drafting'), coursePicker(rerender)),
    el('div', { class: 'panel' },
      el('div', { class: 'note small' }, el('b', {}, 'Drafter: '), course.drafter, '. ',
        course.drafter.startsWith('Offline') ? 'Set GEMINI_API_KEY in the server environment to use Gemini. ' : '',
        'The drafter only sees the few retrieved passages - never student names, grades or tools. Structure checks run in code; correctness is your call during review.'),
      el('div', { class: 'row top' }, to.nodes, el('div', { class: 'field' }, el('label', {}, 'Batch size'), count)),
      el('button', { class: 'btn primary', onclick: run(false) }, 'Draft questions'),
      result),
    el('div', { class: 'panel' },
      el('h3', {}, 'Coverage'),
      el('p', { class: 'small muted' }, `Target: ${course.coverageTarget} published questions per learning outcome. Generate where there are gaps, rather than after every student answer.`),
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
        el('thead', {}, el('tr', {}, ['When', 'Outcome', 'Drafter', 'Passages', 'Kept', 'Discarded'].map((h) => el('th', {}, h)))),
        el('tbody', {}, history.map((g) => el('tr', {},
          el('td', {}, when(g.at)),
          el('td', {}, course.topics.flatMap((t) => t.outcomes).find((o) => o.id === g.outcomeId)?.text),
          el('td', {}, g.provider + (g.model ? ` (${g.model})` : '')),
          el('td', {}, g.passageIds.length),
          el('td', {}, g.ok || g.createdQuestionIds.length ? g.createdQuestionIds.length : el('span', { class: 'badge rejected' }, g.error || 'none')),
          el('td', {}, g.rejected.length))))))
        : el('p', { class: 'muted small' }, 'Nothing generated yet.')));
}

// ============================================================
// PROFESSOR: analytics
// ============================================================
async function viewAnalytics() {
  await loadCourses();
  const classes = teacherCourses.flatMap((c) => c.classes);
  if (!S.classId || !classes.some((c) => c.id === S.classId)) S.classId = classes[0]?.id;
  if (!S.classId) return main.append(el('p', {}, 'You have no classes.'));
  const a = await api('GET', `/api/teacher/classes/${S.classId}/analytics`);
  const tile = (v, l) => el('div', { class: 'tile' }, el('div', { class: 'v' }, v), el('div', { class: 'l' }, l));
  const frac = (r) => (r.n ? `${pct(r.accuracy)} (${r.correct}/${r.n})` : '-');

  main.append(
    el('div', { class: 'row', style: 'margin-bottom:14px' },
      el('h2', { class: 'grow', style: 'margin:0' }, 'Analytics'),
      el('select', { style: 'width:auto', onchange: (e) => ((S.classId = e.target.value), (main.innerHTML = ''), viewAnalytics()) },
        classes.map((c) => el('option', { value: c.id, selected: c.id === S.classId }, c.name)))),
    el('div', { class: 'tiles' },
      tile(`${a.participation.activeEver} / ${a.participation.enrolled}`, 'students who have practised'),
      tile(`${a.participation.active7d} / ${a.participation.enrolled}`, 'active in the last 7 days'),
      tile(a.participation.sessionsCompleted, 'sessions completed'),
      tile(a.participation.attempts, 'answers submitted')),
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
        el('div', { class: 'row' },
          el('div', { class: 'grow', style: 'font-weight:600' }, q.stem),
          el('span', { class: 'badge ' + q.status }, q.status)),
        el('div', { class: 'small muted' },
          `${q.topic} · first attempts ${frac(q.first)} · retries ${frac(q.retry)} · versions answered: ${q.versionsAttempted.map((v) => 'v' + v).join(', ')}`),
        q.topWrong ? el('div', { class: 'small' }, 'Most chosen wrong answer: ', el('b', {}, `"${q.topWrong.option}"`), ` (${q.topWrong.count}x)`) : null,
        q.openReports ? el('div', { class: 'small', style: 'color:var(--bad)' }, `${q.openReports} open student report(s) - see Question bank → Reported`) : null))
        : el('p', { class: 'muted small' }, 'Not enough data yet.')),
    el('p', { class: 'small muted' }, 'These are practice indicators to support teaching judgement. They are not grades, and the platform does not label individual students.'));
}

// ============================================================
// STUDENT: practice home, quiz, summary
// ============================================================
let home = null;
async function loadHome() {
  home = await api('GET', '/api/student/home');
  if (!S.classId || !home.classes.some((c) => c.id === S.classId)) S.classId = home.classes[0]?.id;
  return home;
}

function walletBadge() {
  return el('span', { class: 'badge', title: `Earned today: ${home.wallet.earnedToday}/${home.wallet.dailyCap}` }, `🪙 ${home.wallet.balance}`);
}

async function viewPractice() {
  await loadHome();
  if (!S.classId) return main.append(el('p', {}, 'You are not enrolled in any class.'));
  const prog = await api('GET', `/api/student/classes/${S.classId}/progress`);
  const o = home.options;
  const length = el('select', {}, o.lengths.map((n) => el('option', { value: n, selected: n === 8 }, `${n} questions`)));
  const timer = el('select', {}, o.timers.map((t) => el('option', { value: t, selected: t === 0 }, t ? `${t}s per question` : 'Untimed')));
  const acc = el('select', {}, o.accommodation.map((m) => el('option', { value: m }, m === 1 ? 'Standard time' : `Extra time x${m}`)));
  const pet = home.catalog.pets.find((p) => p.id === home.inventory.equippedPet);

  main.append(
    el('div', { class: 'row', style: 'margin-bottom:14px' },
      el('h2', { class: 'grow', style: 'margin:0' }, 'Practice'),
      home.classes.length > 1
        ? el('select', { style: 'width:auto', onchange: (e) => ((S.classId = e.target.value), (main.innerHTML = ''), viewPractice()) }, home.classes.map((c) => el('option', { value: c.id, selected: c.id === S.classId }, c.name)))
        : el('span', { class: 'badge plain' }, home.classes[0].name),
      walletBadge()),
    el('div', { class: 'panel' },
      el('div', { class: 'row top' },
        el('div', { style: 'font-size:48px' }, pet.emoji),
        el('div', { class: 'grow' },
          el('h3', {}, 'Start a session'),
          el('p', { class: 'small muted' }, `Your ${pet.name} attacks the Fog of Confusion each time you answer correctly. The timer is optional and is just for practice.`),
          el('div', { class: 'row' },
            el('div', { class: 'field' }, el('label', {}, 'Length'), length),
            el('div', { class: 'field' }, el('label', {}, 'Timer'), timer),
            el('div', { class: 'field' }, el('label', {}, 'Accommodation'), acc)),
          el('button', { class: 'btn primary', onclick: action(async () => {
            const r = await api('POST', '/api/student/sessions', { classId: S.classId, length: Number(length.value), timerSec: Number(timer.value), accommodation: Number(acc.value) });
            runQuiz(r.id);
          }) }, 'Start practice')))),
    el('div', { class: 'panel' },
      el('h3', {}, 'Your practice indicator'),
      el('p', { class: 'small muted' }, `Accuracy on your most recent ${prog.window} different questions per topic. It is a rough guide for what to practise next, not a measure of mastery or a grade.`),
      el('div', { class: 'grid' }, prog.topics.map((t) => el('div', { class: 'tile' },
        el('div', { style: 'font-weight:700' }, t.name),
        t.n ? [el('div', { class: 'v' }, pct(t.accuracy)), meter(t.accuracy), el('div', { class: 'l', style: 'margin-top:4px' }, `${t.correct} of ${t.n} recent question(s) · ${t.bank} in bank`)]
          : el('div', { class: 'l' }, `Not practised yet · ${t.bank} in bank`))))),
    prog.sessions.length ? el('div', { class: 'panel' },
      el('h3', {}, 'Recent sessions'),
      el('table', {}, el('tbody', {}, prog.sessions.map((s) => el('tr', {}, el('td', {}, when(s.at)), el('td', {}, `${s.correct} / ${s.total} correct`)))))) : null);
}

// Renders a live session until it finishes
async function runQuiz(sid) {
  let state = await api('GET', `/api/student/sessions/${sid}`);
  const inv = home.inventory;
  const pet = home.catalog.pets.find((p) => p.id === inv.equippedPet);
  const item = home.catalog.items.find((i) => i.id === inv.equippedItem);
  let countdown = null;

  // --- battle arena (persists across questions) ---
  const petSprite = el('span', { class: 'sprite' }, pet.emoji, item ? el('span', { class: 'hat' }, item.emoji) : null);
  const npcSprite = el('span', { class: 'sprite' }, state.npc.emoji);
  const hpBar = el('div', { style: `width:${(state.npc.hp / state.npc.maxHp) * 100}%` });
  const npcBox = el('div', { class: 'fighter' }, npcSprite, el('div', { class: 'name' }, state.npc.name), el('div', { class: 'hp' }, hpBar));
  const arena = el('div', { class: 'arena' }, el('div', { class: 'fighter' }, petSprite, el('div', { class: 'name' }, `Your ${pet.name}`)), npcBox);
  const body = el('div', { class: 'panel' });
  const notes = state.notes.length ? el('div', { class: 'note small' }, state.notes.join(' ')) : null;

  fill(main, arena, notes || '', body);

  const replay = (node, cls) => {
    node.classList.remove(cls);
    void node.offsetWidth; // restart CSS animation
    node.classList.add(cls);
  };

  async function showQuestion() {
    state = await api('GET', `/api/student/sessions/${sid}`);
    if (state.done) return showSummary();
    const q = state.question;
    let locked = false;
    const timerEl = el('span', { class: 'timer' });
    const optButtons = q.options.map((text, i) => el('button', { onclick: () => submit(i) }, el('b', {}, 'ABCDE'[i] + '. '), text));
    const feedback = el('div');

    async function submit(choice) {
      if (locked) return;
      locked = true;
      clearInterval(countdown);
      optButtons.forEach((b) => (b.disabled = true));
      if (choice !== null) optButtons[choice].classList.add('picked');
      let r;
      try {
        r = await api('POST', `/api/student/sessions/${sid}/answer`, { index: q.index, choice });
      } catch (err) {
        toast(err.message, true);
        locked = false;
        optButtons.forEach((b) => (b.disabled = false));
        return;
      }
      optButtons[r.answerIndex].classList.add('right');
      if (r.choice !== null && !r.correct) optButtons[r.choice].classList.add('wrong');
      hpBar.style.width = `${(r.npc.hp / r.npc.maxHp) * 100}%`;
      if (r.attack) {
        replay(petSprite, 'lunge');
        setTimeout(() => {
          replay(npcSprite, 'shake');
          npcBox.append(el('span', { class: 'dmg' }, `-${r.attack.damage}`));
          if (r.npc.hp <= 0) npcSprite.classList.add('defeated');
        }, 250);
      } else {
        replay(npcSprite, 'wobble');
      }
      const reportBox = el('div');
      fill(feedback, 
        el('div', { class: 'note ' + (r.correct ? 'good' : 'bad'), style: 'margin-top:14px' },
          el('b', {}, r.correct ? `Correct! ${pet.name} used ${r.attack.move}.` : r.timedOut ? 'Time is up.' : 'Not quite.'), ' ', r.explanation),
        r.sources.length ? el('div', { class: 'small muted' }, 'From: ', r.sources.map((s) => s.title).join(', ')) : null,
        r.rewards.length ? el('div', { class: 'small' }, r.rewards.map((x) => `+${x.granted} 🪙 ${x.reason}`).join(' · ')) : null,
        el('div', { class: 'row', style: 'margin-top:12px' },
          el('button', { class: 'btn primary', onclick: showQuestion }, r.done ? 'See results' : 'Next question →'),
          el('button', { class: 'btn small', onclick: () => fill(reportBox, reportForm(q.questionId, reportBox)) }, 'Report a problem with this question')),
        reportBox);
    }

    fill(body, 
      el('div', { class: 'quiz-head' },
        el('span', { class: 'small muted' }, `Question ${q.index + 1} of ${state.total} · `, el('span', { class: 'badge plain' }, q.topic)),
        timerEl),
      el('div', { class: 'stem' }, q.stem),
      el('div', { class: 'options' }, optButtons),
      feedback);

    if (q.remainingMs !== null) {
      const deadline = Date.now() + q.remainingMs;
      const tick = () => {
        const left = Math.max(0, deadline - Date.now());
        timerEl.textContent = `⏱ ${Math.ceil(left / 1000)}s`;
        timerEl.classList.toggle('low', left < 10000);
        if (left <= 0) submit(null);
      };
      tick();
      countdown = setInterval(tick, 250);
    }
  }

  async function showSummary() {
    const s = await api('GET', `/api/student/sessions/${sid}/summary`);
    home.wallet = s.wallet;
    fill(body, 
      el('h2', {}, s.npc.hp <= 0 ? 'The Fog of Confusion is defeated! 🎉' : 'Session complete'),
      el('p', {}, `${s.correct} of ${s.total} correct · +${s.coins} 🪙 earned this session · balance ${s.wallet.balance} 🪙`),
      el('table', {}, el('tbody', {}, Object.entries(s.byTopic).map(([name, t]) => el('tr', {}, el('td', {}, name), el('td', {}, `${t.correct} / ${t.n}`))))),
      el('div', { class: 'spacer' }),
      s.wallet.earnedToday >= s.wallet.dailyCap ? el('div', { class: 'note warn small' }, 'You reached today\'s coin cap. You can keep practising; coins reset tomorrow.') : null,
      el('div', { class: 'row' },
        el('button', { class: 'btn primary', onclick: () => render() }, 'Back to practice'),
        el('button', { class: 'btn', onclick: () => ((S.tab = 'pets'), render()) }, 'Visit pets & shop')));
  }

  showQuestion();
}

function reportForm(questionId, box) {
  const reason = el('textarea', { rows: 2, maxlength: 300, placeholder: 'What seems wrong? e.g. two answers look correct, a typo, the explanation disagrees with the notes' });
  return el('div', { class: 'panel', style: 'margin-top:10px;background:var(--bg)' },
    el('label', {}, 'Report this question to your professor'),
    reason,
    el('div', { class: 'row', style: 'margin-top:8px' },
      el('button', { class: 'btn small primary', onclick: action(async () => {
        const r = await api('POST', `/api/student/questions/${questionId}/report`, { reason: reason.value });
        fill(box, el('div', { class: 'note good small' }, r.already ? 'You already reported this question.' : 'Thanks, your professor will review it.'));
      }) }, 'Send report'),
      el('button', { class: 'btn small', onclick: () => fill(box) }, 'Cancel')));
}

// ============================================================
// STUDENT: pets, shop, coin history
// ============================================================
async function viewPets() {
  await loadHome();
  const ledger = await api('GET', '/api/student/ledger');
  const { inventory: inv, catalog } = home;
  const owns = (id) => inv.pets.some((p) => p.id === id);
  const refresh = () => {
    fill(main);
    viewPets();
  };
  const equip = (body) => action(async () => {
    await api('POST', '/api/student/equip', body);
    refresh();
  });
  const odds = catalog.eggOdds;
  const total = Object.values(odds).reduce((a, b) => a + b, 0);
  const eggResult = el('div');

  main.append(
    el('div', { class: 'row', style: 'margin-bottom:14px' }, el('h2', { class: 'grow', style: 'margin:0' }, 'Pets & shop'), walletBadge()),
    el('div', { class: 'note small' },
      `Coins have no cash or academic value. You earn ${home.rules.firstCorrect} for the first correct answer to each question, ${home.rules.sessionComplete} for finishing a session of ${home.rules.minSessionForBonus}+ questions, and ${home.rules.milestone} once per topic when your practice indicator reaches ${pct(home.rules.milestoneAccuracy)}. Up to ${home.wallet.dailyCap} per day (${home.wallet.earnedToday} earned today).`),
    el('div', { class: 'panel' },
      el('h3', {}, 'Collection'),
      el('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(130px,1fr))' },
        catalog.pets.map((p) => {
          const mine = inv.pets.find((x) => x.id === p.id);
          return el('div', { class: 'pet-card' + (mine ? '' : ' locked') + (inv.equippedPet === p.id ? ' equipped' : '') },
            el('div', { class: 'sprite' }, p.emoji),
            el('div', { style: 'font-weight:700' }, mine ? p.name : '???'),
            el('div', { class: 'rarity ' + p.rarity }, p.rarity),
            mine && mine.dupes ? el('div', { class: 'small muted' }, `+${mine.dupes} duplicate(s)`) : null,
            mine ? (inv.equippedPet === p.id ? el('div', { class: 'small muted' }, 'Equipped') : el('button', { class: 'btn small', onclick: equip({ petId: p.id }) }, 'Equip'))
              : p.price ? el('button', { class: 'btn small', onclick: action(async () => {
                await api('POST', '/api/student/shop/buy', { itemId: p.id, requestId: reqId() });
                toast(`${p.name} joined your team!`);
                refresh();
              }) }, `Buy ${p.price} 🪙`) : el('div', { class: 'small muted' }, 'Egg only'));
        }))),
    el('div', { class: 'row top' },
      el('div', { class: 'panel grow', style: 'min-width:260px' },
        el('h3', {}, `🥚 Mystery egg - ${catalog.eggCost} 🪙`),
        el('p', { class: 'small muted' }, 'Odds are fixed and shown before you open:'),
        el('table', {}, el('tbody', {}, Object.entries(odds).map(([r, w]) => el('tr', {},
          el('td', {}, el('span', { class: 'rarity ' + r }, r)),
          el('td', {}, `${((w / total) * 100).toFixed(0)}%`),
          el('td', { class: 'small muted' }, catalog.pets.filter((p) => p.rarity === r).map((p) => p.name).join(', ')))))),
        el('p', { class: 'small muted', style: 'margin-top:8px' }, `A duplicate refunds ${catalog.duplicateRefund} 🪙.`),
        el('button', { class: 'btn primary', disabled: home.wallet.balance < catalog.eggCost, onclick: action(async () => {
          const r = await api('POST', '/api/student/shop/egg', { requestId: reqId() });
          fill(eggResult, el('div', { class: 'note good', style: 'margin-top:10px;font-size:16px' }, `${r.pet.emoji} ${r.pet.name} (${r.pet.rarity})`, r.duplicatePet ? ` - duplicate, +${catalog.duplicateRefund} 🪙 back` : ' - new!'));
          setTimeout(refresh, 1600);
        }) }, 'Open an egg'),
        eggResult),
      el('div', { class: 'panel grow', style: 'min-width:260px' },
        el('h3', {}, 'Accessories'),
        catalog.items.map((it) => {
          const mine = inv.items.includes(it.id);
          return el('div', { class: 'row', style: 'padding:6px 0' },
            el('span', { style: 'font-size:26px' }, it.emoji),
            el('span', { class: 'grow' }, it.name),
            mine
              ? (inv.equippedItem === it.id ? el('button', { class: 'btn small', onclick: equip({ itemId: null }) }, 'Take off') : el('button', { class: 'btn small', onclick: equip({ itemId: it.id }) }, 'Wear'))
              : el('button', { class: 'btn small', onclick: action(async () => {
                await api('POST', '/api/student/shop/buy', { itemId: it.id, requestId: reqId() });
                refresh();
              }) }, `${it.price} 🪙`));
        }))),
    el('div', { class: 'panel' },
      el('h3', {}, 'Coin history'),
      ledger.length ? el('div', { class: 'table-wrap' }, el('table', {}, el('tbody', {}, ledger.map((t) => el('tr', {},
        el('td', { class: 'small muted' }, when(t.at)),
        el('td', {}, t.reason),
        el('td', { style: `text-align:right;font-weight:700;color:var(--${t.amount >= 0 ? 'good' : 'bad'})` }, (t.amount >= 0 ? '+' : '') + t.amount))))))
        : el('p', { class: 'muted small' }, 'No coins yet - finish a practice session to earn some.')));
}

boot();
