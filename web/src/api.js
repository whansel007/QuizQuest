// ============================================================
// Session state + the axios client for the QuizQuest API
// ------------------------------------------------------------
// Same philosophy as before the Vue port: the browser is a SCREEN.
// It never decides if an answer is right or what it earns; it sends
// what you clicked and shows what the server says.
//
// Vue templates escape text by default ({{ }}), so pasted course
// material or student text can't inject markup. Never use v-html.
// ============================================================

import axios from 'axios';
import { reactive } from 'vue';

// Per-tab login, so two tabs can be a professor and a student side by side
const saved = () => {
  try {
    return sessionStorage.getItem('qq-token');
  } catch {
    return null;
  }
};

// Dashboard preferences (period, auto-refresh) remembered in this browser.
// A convenience only: storage may be blocked, and then defaults apply.
const DASH_KEY = 'qq-dashboard';
export function dashPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(DASH_KEY));
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}
export function saveDashPrefs(changes) {
  try {
    localStorage.setItem(DASH_KEY, JSON.stringify({ ...dashPrefs(), ...changes }));
  } catch {
    // storage blocked: the choice lasts until the tab is closed
  }
}
// The same rules as the server's parsePeriod, so a bad range is caught
// before it is sent (or restored from an older save): null when fine.
const DAY = 86400000;
const MAX_CUSTOM_DAYS = 366;
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !Number.isNaN(Date.parse(d)) && new Date(Date.parse(d)).toISOString().slice(0, 10) === d;
export function customPeriodError(from, to) {
  if (!isDate(from) || !isDate(to)) return 'Pick a valid start and end date.';
  const days = (Date.parse(to) - Date.parse(from)) / DAY + 1;
  if (days < 1) return 'The start date must be on or before the end date.';
  if (days > MAX_CUSTOM_DAYS) return `Pick at most ${MAX_CUSTOM_DAYS} days.`;
  return null;
}
function savedPeriod() {
  const p = dashPrefs();
  if (['7d', '30d', 'semester', 'all'].includes(p.range)) return { range: p.range, from: null, to: null };
  if (p.range === 'custom' && !customPeriodError(p.from, p.to)) return { range: 'custom', from: p.from, to: p.to };
  return { range: '30d', from: null, to: null };
}
// ?range=... for the analytics endpoints
export const periodQuery = () => (S.range === 'custom' ? `range=custom&from=${S.from}&to=${S.to}` : `range=${S.range}`);
// ...plus &topic=... when the dashboard is narrowed to one weekly topic
export const dashQuery = () => periodQuery() + (S.topicId ? `&topic=${encodeURIComponent(S.topicId)}` : '');

export const S = reactive({
  token: saved(),
  me: null,
  tab: null,
  courseId: null,
  classId: null,
  qFilter: 'draft',
  qReviewMode: 'list', // Question bank: 'list' or 'cards' (kept across the remount after a save)
  // Weekly topic shared by Source material, AI drafting, Question bank and
  // Analytics, so moving between them keeps the same week ('' = all topics)
  topicId: '',
  // Analytics period: '7d' | '30d' | 'semester' | 'all' | 'custom' (from/to:
  // local dates; the semester's dates come from the course's settings)
  ...savedPeriod(),
  focusQuestionId: null, // Question bank scrolls to (and highlights) this question once
  draftTarget: null, // AI drafting opens with this { topicId, outcomeId } once
  // bump to remount the current view (replaces the old rerender())
  viewKey: 0,
});

export function rerender() {
  S.viewKey++;
}
export function setTab(id) {
  S.tab = id;
  rerender();
}

const http = axios.create({ headers: { 'content-type': 'application/json' } });

// Attach this tab's token, and remember which token the request was sent
// with: a response that arrives after the user switched must be ignored.
// synchronous: read the token at call time (signOut clears it right after
// sending /api/logout, which still needs the old token).
http.interceptors.request.use((config) => {
  config.qqToken = S.token;
  if (S.token) config.headers.Authorization = 'Bearer ' + S.token;
  return config;
}, null, { synchronous: true });

async function errorBody(data) {
  // Blob downloads (CSV export) carry their JSON error as a Blob
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    try {
      return JSON.parse(await data.text());
    } catch {
      return {};
    }
  }
  return data && typeof data === 'object' ? data : {};
}

http.interceptors.response.use(
  (res) => {
    if (res.config.qqToken !== S.token) throw new Error('The active user changed.');
    return res;
  },
  async (err) => {
    if (axios.isCancel(err)) throw Object.assign(new Error('Cancelled.'), { name: 'AbortError' });
    if (['ECONNABORTED', 'ETIMEDOUT'].includes(err.code)) throw new Error('The request timed out. Refresh progress before retrying; the server may still be processing it.');
    if (!err.response) throw new Error('Could not reach the server. Check your connection and try again.');
    const { config, status } = err.response;
    if (config.qqToken !== S.token) throw new Error('The active user changed.');
    if (status === 401 && config.qqToken) {
      clearSession();
      throw new Error('Session expired, please sign in again.');
    }
    const data = await errorBody(err.response.data);
    const contentType = err.response.headers?.['content-type'] || '';
    const message = data.error || (status >= 500 && !contentType.includes('json')
      ? 'The server could not reach the API. Check the API terminal, restart local development, and retry.'
      : 'Request failed');
    throw Object.assign(new Error(message), { status, data });
  },
);

// api('POST', '/api/...', body) -> parsed JSON, or throws Error(message)
// `options.signal` (an AbortSignal) cancels the request with an AbortError.
export async function api(method, url, data, options = {}) {
  const res = await http.request({ method, url, data, signal: options.signal, timeout: options.timeout });
  return res.data;
}

// One key for an action until its success is acknowledged by the browser,
// so retrying after a lost response can't buy (or build) twice.
export const reqId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());
export function retryablePost(path, body = {}) {
  let requestId = reqId();
  return async () => {
    const result = await api('POST', path, { ...body, requestId });
    requestId = reqId();
    return result;
  };
}

// Authenticated file download (e.g. CSV export)
export async function download(path, filename) {
  const res = await http.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function clearSession() {
  try {
    sessionStorage.removeItem('qq-token');
  } catch {
    // storage blocked: the token only lived in memory anyway
  }
  Object.assign(S, { token: null, me: null, tab: null, courseId: null, classId: null, qFilter: 'draft', qReviewMode: 'list', topicId: '', ...savedPeriod(), focusQuestionId: null, draftTarget: null });
  rerender();
}

// credentials: { email, password }, or { userId } for the demo picker
export async function signIn(credentials) {
  startSession(await api('POST', '/api/login', credentials));
}

// { name, email, password } -> a new student account, signed in
export async function signUp(details) {
  startSession(await api('POST', '/api/register', details));
}

function startSession(r) {
  S.token = r.token;
  try {
    sessionStorage.setItem('qq-token', r.token);
  } catch {
    // fine: this tab stays signed in until it is closed
  }
  S.me = r.user;
  // Signing in, students land in their Kingdom (their home hub). A reload
  // restores the session without this, so an open practice can be resumed.
  if (r.user?.role === 'student') S.tab = 'kingdom';
  rerender();
}

export function signOut() {
  if (S.token) api('POST', '/api/logout').catch(() => {});
  clearSession();
}

// On page load: resume this tab's session if the token is still valid
export async function restoreSession() {
  if (!S.token) return;
  try {
    S.me = await api('GET', '/api/me');
  } catch {
    clearSession();
  }
}
