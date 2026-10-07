// ============================================================
// Shared helpers for every view
// ------------------------------------------------------------
// Same philosophy as the Circle Tag client: the browser is a SCREEN.
// It never decides if an answer is right or what it earns; it sends
// what you clicked and shows what the server says.
// All text is inserted with textContent (via el()), never innerHTML,
// so pasted course material or student text can't inject markup.
// ============================================================

// Per-tab login, so two tabs can be a professor and a student side by side
export const S = {
  token: sessionStorage.getItem('qq-token'),
  me: null,
  tab: null,
  courseId: null,
  classId: null,
  qFilter: 'draft',
};

// main.js fills these in (avoids circular imports)
export const hooks = { render: () => {}, signOut: () => {}, cleanup: null };

// Each render gets a fresh container inside #main. Views grab it
// synchronously (const main = root()) BEFORE their first await, so a
// slow, superseded render (double-clicked tab, quick tab switch) writes
// into a detached container instead of stacking a second copy of the page.
const mainEl = document.getElementById('main');
export let main = mainEl; // live binding: the current view's container
export const root = () => main;
export function freshRoot() {
  const r = document.createElement('div');
  mainEl.replaceChildren(r);
  main = r;
  return r;
}
const toastEl = document.getElementById('toast');

// Accessibility: tie each form label to its control (screen readers
// otherwise announce selects/inputs without a name). Views build
// ".field > label + control"; this links them as they appear.
let labelSeq = 0;
new MutationObserver(() => {
  for (const label of mainEl.querySelectorAll('.field > label:not([for])')) {
    const control = label.parentElement.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea');
    if (!control) continue;
    if (!control.id) control.id = 'f' + ++labelSeq;
    label.htmlFor = control.id;
  }
}).observe(mainEl, { childList: true, subtree: true });

export function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k === 'value') n.value = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  add(n, ...kids);
  return n;
}
// DOM append/replaceChildren would print arrays as "[object HTMLDivElement]"
// and null as "null"; these flatten and skip empties.
const clean = (kids) => kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false).map((k) => (k instanceof Node ? k : String(k)));
export function fill(node, ...kids) {
  node.replaceChildren(...clean(kids));
}
export function add(node, ...kids) {
  node.append(...clean(kids));
}

export const pct = (x) => (x === null || x === undefined ? '-' : Math.round(x * 100) + '%');
export const secs = (ms) => (ms === null || ms === undefined ? '-' : (ms / 1000).toFixed(1) + 's');
export const when = (t) => new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
export const reqId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

let toastTimer = null;
export function toast(msg, bad) {
  toastEl.textContent = msg;
  toastEl.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.className = ''), 3400);
}

export async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && S.token) {
    hooks.signOut();
    throw new Error('Session expired, please sign in again.');
  }
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status, data });
  return data;
}

// Authenticated file download (e.g. CSV export)
export async function download(path, filename) {
  const res = await fetch(path, { headers: { authorization: 'Bearer ' + S.token } });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = el('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Show "in progress" text in a box while fn runs; on failure replace it
// with the error (instead of leaving "Loading…" up forever).
export async function withProgress(box, text, fn) {
  fill(box, el('p', { class: 'muted small' }, text));
  try {
    return await fn();
  } catch (err) {
    fill(box, el('div', { class: 'note bad small' }, err.message));
    err.shown = true;
    throw err;
  }
}

// Wrap an async click handler: disable the button and report errors
export function action(fn) {
  return async (e) => {
    const btn = e && e.currentTarget;
    if (btn) btn.disabled = true;
    try {
      await fn(e);
    } catch (err) {
      if (!err.shown) toast(err.message, true);
    } finally {
      if (btn && btn.isConnected) btn.disabled = false;
    }
  };
}

export function meter(x) {
  return el('div', { class: 'meter', title: pct(x) }, el('div', { style: `width:${Math.round((x || 0) * 100)}%` }));
}

export function heading(title, ...right) {
  return el('div', { class: 'row', style: 'margin-bottom:14px' }, el('h2', { class: 'grow', style: 'margin:0' }, title), right);
}

// Re-run the current view from scratch
export function rerender() {
  hooks.render();
}

export const fmtBundle = (b, catalog) => Object.entries(b || {}).filter(([, v]) => v).map(([k, v]) => `${v} ${catalog[k]?.emoji || k}`).join(' + ') || 'nothing';
