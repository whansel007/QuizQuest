// ============================================================
// Student question UI for every format (used by Practice and World)
// ------------------------------------------------------------
// questionForm(q, onSubmit) returns:
//   node          the question, ready to insert
//   submitEmpty() submit "no answer" (timer ran out)
//   showResult(r) reveal the server's verdict on the options/inputs
// Number keys 1-5 pick an option; Enter submits typed answers.
// ============================================================

import { el, fill, toast } from './core.js';

const LETTERS = 'ABCDEF';

export function questionForm(q, onSubmit) {
  let locked = false;
  let onKey = null; // page-level keyboard shortcut listener, attached only while answerable
  const listen = (on) => onKey && (on ? document.addEventListener('keydown', onKey) : document.removeEventListener('keydown', onKey));
  const submit = (sub) => {
    if (locked) return;
    locked = true;
    listen(false);
    disable();
    onSubmit(sub);
  };
  const unlock = () => {
    locked = false;
    enable();
    listen(true);
  };

  let optButtons = [];
  let body;
  let disable = () => {};
  let enable = () => {};
  let keyHandler = null;

  if (q.type === 'mcq' || q.type === 'tf') {
    optButtons = q.options.map((text, i) => el('button', { onclick: () => {
      optButtons[i].classList.add('picked');
      submit({ choice: i });
    } }, el('b', {}, LETTERS[i] + '. '), text));
    body = el('div', { class: 'options' + (q.type === 'tf' ? ' two' : '') }, optButtons);
    disable = () => optButtons.forEach((b) => (b.disabled = true));
    enable = () => optButtons.forEach((b) => (b.disabled = false));
    keyHandler = (e) => {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < optButtons.length) optButtons[i].click();
    };
  } else if (q.type === 'multi') {
    const picked = new Set();
    optButtons = q.options.map((text, i) => {
      const box = el('b', {}, '☐ ');
      return el('button', { 'aria-pressed': 'false', onclick: (e) => {
        if (picked.has(i)) picked.delete(i);
        else picked.add(i);
        box.textContent = picked.has(i) ? '☑ ' : '☐ ';
        e.currentTarget.setAttribute('aria-pressed', String(picked.has(i)));
        e.currentTarget.classList.toggle('picked', picked.has(i));
      } }, box, text);
    });
    const go = el('button', { class: 'btn primary', onclick: () => (picked.size ? submit({ choices: [...picked] }) : toast('Tick at least one option first.')) }, 'Submit answer');
    body = el('div', {}, el('p', { class: 'small muted' }, 'Select all that apply.'), el('div', { class: 'options' }, optButtons), el('div', { style: 'margin-top:10px' }, go));
    disable = () => [...optButtons, go].forEach((b) => (b.disabled = true));
    enable = () => [...optButtons, go].forEach((b) => (b.disabled = false));
    keyHandler = (e) => {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < optButtons.length) optButtons[i].click();
      if (e.key === 'Enter') go.click();
    };
  } else if (q.type === 'numeric') {
    const input = el('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Your answer', style: 'max-width:220px' });
    const go = el('button', { class: 'btn primary', onclick: () => (input.value.trim() ? submit({ value: input.value.trim() }) : toast('Type a number first.')) }, 'Submit answer');
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go.click());
    body = el('div', { class: 'row' }, input, q.unit ? el('span', {}, q.unit) : null, go);
    disable = () => [input, go].forEach((b) => (b.disabled = true));
    enable = () => [input, go].forEach((b) => (b.disabled = false));
    setTimeout(() => input.focus(), 0);
  } else if (q.type === 'short') {
    const text = el('textarea', { rows: 4, maxlength: 1000, placeholder: 'Write your answer in a few sentences.' });
    const go = el('button', { class: 'btn primary', onclick: () => (text.value.trim() ? submit({ text: text.value }) : toast('Write an answer first.')) }, 'Submit answer');
    body = el('div', {},
      text,
      el('p', { class: 'small muted', style: 'margin-top:4px' }, 'Marked against key points; your professor may review the mark. Please don\'t include personal information.'),
      go);
    disable = () => [text, go].forEach((b) => (b.disabled = true));
    enable = () => [text, go].forEach((b) => (b.disabled = false));
  }

  if (keyHandler) {
    onKey = (e) => {
      if (!node.isConnected) return listen(false); // view was replaced without answering
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      keyHandler(e);
    };
    listen(true);
  }

  const node = el('div', {}, el('div', { class: 'stem' }, q.stem), body);

  function showResult(r) {
    const rv = r.reveal || {};
    // Mark options with text as well as colour, so the result doesn't
    // depend on telling green from red (and screen readers hear it).
    const mark = (b, cls, text) => {
      if (!b) return;
      b.classList.add(cls);
      b.append(el('span', { class: 'mark' }, text));
    };
    if ((q.type === 'mcq' || q.type === 'tf') && rv.answerIndex !== undefined) {
      mark(optButtons[rv.answerIndex], 'right', ' ✓ correct answer');
      if (Number.isInteger(rv.choice) && !r.correct) mark(optButtons[rv.choice], 'wrong', ' ✗ your answer');
    }
    if (q.type === 'multi') {
      optButtons.forEach((b, i) => {
        if (rv.answerIndexes.includes(i)) mark(b, 'right', rv.choices.includes(i) ? ' ✓ correct' : ' ✓ correct (missed)');
        else if (rv.choices.includes(i)) mark(b, 'wrong', ' ✗ not correct');
      });
    }
    if (q.type === 'numeric') {
      add2(el('div', { class: 'small', style: 'margin-top:8px' }, 'Answer: ', el('b', {}, `${rv.answer}${rv.unit ? ' ' + rv.unit : ''}`), rv.tolerance ? ` (accepted within ±${rv.tolerance})` : ''));
    }
    if (q.type === 'short') {
      add2(el('div', { class: 'panel', style: 'margin-top:10px;background:var(--bg)' },
        el('div', { class: 'small' }, el('b', {}, 'Key points: ')),
        el('ul', { style: 'margin:4px 0 8px' }, (rv.keyPoints || []).map((k, i) => el('li', { class: 'small' }, (rv.coveredPoints || []).includes(i) ? '✓ ' : '○ ', k))),
        el('div', { class: 'small' }, el('b', {}, 'Model answer: '), rv.modelAnswer),
        rv.feedback ? el('div', { class: 'small', style: 'margin-top:6px' }, rv.feedback) : null));
    }
  }
  function add2(n) {
    node.append(n);
  }

  return {
    node,
    submitEmpty: () => submit({}),
    showResult,
    unlock,
    destroy: () => listen(false), // for callers that discard an unanswered question
  };
}

// The explanation / rewards block shown after an answer
export function resultBlock(r, { correctText = 'Correct!', extra = null } = {}) {
  const title = r.timedOut ? 'Time is up.' : r.blank ? 'No answer given.' : r.correct ? correctText : r.reveal?.partial ? `Partly right (${Math.round(r.reveal.partial * 100)}%).` : 'Not quite.';
  const box = el('div');
  fill(box,
    el('div', { class: 'note ' + (r.correct ? 'good' : 'bad'), style: 'margin-top:14px' },
      el('b', {}, title), ' ', r.explanation,
      r.provisional ? el('div', { class: 'small', style: 'margin-top:4px' }, 'This mark is provisional - your professor may review it.') : null),
    r.sources?.length ? el('div', { class: 'small muted' }, 'From: ', r.sources.map((s) => s.title).join(', ')) : null,
    r.rewards?.length ? el('div', { class: 'small' }, r.rewards.map((x) => `+${x.granted} 🪙 ${x.reason}`).join(' · ')) : null,
    extra);
  return box;
}
