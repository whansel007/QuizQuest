// ============================================================
// QuizQuest - app shell: sign-in, header, tabs
// ============================================================

import { S, hooks, el, fill, add, api, action, root, freshRoot } from './core.js';
import { viewReview, viewContent, viewGenerate, viewAnalytics, viewEvaluation, viewSettings } from './teacher.js';
import { viewPractice } from './student.js';
import { viewWorld } from './world.js';
import { viewKingdom } from './kingdom.js';
import { viewPets } from './pets.js';

const tabsEl = document.getElementById('tabs');
const whoEl = document.getElementById('who');

const TABS = {
  teacher: [['review', 'Question bank', viewReview], ['content', 'Source material', viewContent], ['generate', 'AI drafting', viewGenerate], ['analytics', 'Analytics', viewAnalytics], ['evaluation', 'Evaluation', viewEvaluation], ['settings', 'Settings', viewSettings]],
  student: [['practice', 'Practice', viewPractice], ['world', 'World', viewWorld], ['kingdom', 'Kingdom', viewKingdom], ['pets', 'Pets & shop', viewPets]],
};

function signOut() {
  if (S.token) api('POST', '/api/logout').catch(() => {});
  sessionStorage.removeItem('qq-token');
  Object.assign(S, { token: null, me: null, tab: null, courseId: null, classId: null });
  render();
}

function render() {
  // let the previous view release sockets, timers and key listeners
  if (hooks.cleanup) {
    hooks.cleanup();
    hooks.cleanup = null;
  }
  fill(tabsEl);
  fill(whoEl);
  const container = freshRoot(); // a stale render can't add to this one
  if (!S.me) return renderLogin();
  const tabs = TABS[S.me.role];
  if (!tabs.some(([id]) => id === S.tab)) S.tab = tabs[0][0];
  for (const [id, label] of tabs) {
    add(tabsEl, el('button', { 'aria-current': S.tab === id ? 'page' : null, onclick: () => ((S.tab = id), render()) }, label));
  }
  add(whoEl, el('span', {}, S.me.name), el('button', { class: 'btn small', onclick: signOut }, 'Switch user'));
  const view = tabs.find(([id]) => id === S.tab)[2];
  view().catch((err) => add(container, el('div', { class: 'note bad' }, err.message)));
}

hooks.render = render;
hooks.signOut = signOut;

async function renderLogin() {
  const main = root(); // this render's own container (see core.js)
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
  add(main,
    el('div', { class: 'panel' },
      el('h2', {}, 'Pick a demo user'),
      el('p', { class: 'muted' }, 'This prototype uses synthetic accounts with no passwords. The real build would use proper sign-in, with professor access assigned by an administrator. Tip: open several browser tabs to be a professor and a few students at once - try the World with two students.')),
    group('teacher', 'Professors'),
    group('student', 'Students'));
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

boot();
