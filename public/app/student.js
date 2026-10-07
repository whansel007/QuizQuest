// ============================================================
// STUDENT: practice home, quiz session, summary
// ============================================================

import { S, el, fill, add, api, action, toast, pct, when, meter, heading, main, rerender, fmtBundle, hooks, root } from './core.js';
import { questionForm, resultBlock } from './qui.js';

export let home = null;
export async function loadHome() {
  home = await api('GET', '/api/student/home');
  if (!S.classId || !home.classes.some((c) => c.id === S.classId)) S.classId = home.classes[0]?.id;
  return home;
}

// The header badges. They carry data-badge so updateBalances() can
// refresh them in place when the server reports new totals.
const walletText = () => `🪙 ${home.wallet.balance}`;
const walletTitle = () => `Earned today: ${home.wallet.earnedToday}/${home.wallet.dailyCap}`;
const resourceText = () => Object.entries(home.catalog.resources).map(([k, d]) => `${d.emoji} ${home.inventory.resources[k] || 0}`).join('  ');
export function walletBadge() {
  return el('span', { class: 'badge', 'data-badge': 'wallet', title: walletTitle() }, walletText());
}
export function resourceBadge() {
  return el('span', { class: 'badge plain', 'data-badge': 'resources' }, resourceText());
}
// b: { wallet: { balance, earnedToday, dailyCap }, resources: { wood, ... } }
export function updateBalances(b) {
  if (!home || !b) return;
  if (b.wallet) Object.assign(home.wallet, b.wallet);
  if (b.resources) home.inventory.resources = { ...b.resources };
  for (const n of document.querySelectorAll('[data-badge="wallet"]')) {
    n.textContent = walletText();
    n.title = walletTitle();
  }
  for (const n of document.querySelectorAll('[data-badge="resources"]')) n.textContent = resourceText();
}
export function studentClassPicker() {
  return home.classes.length > 1
    ? el('select', { style: 'width:auto', onchange: (e) => ((S.classId = e.target.value), rerender()) }, home.classes.map((c) => el('option', { value: c.id, selected: c.id === S.classId }, c.name)))
    : el('span', { class: 'badge plain' }, home.classes[0].name);
}

export async function viewPractice() {
  const main = root(); // this render's own container (see core.js)
  await loadHome();
  if (!S.classId) return add(main, el('p', {}, 'You are not enrolled in any class.'));
  const prog = await api('GET', `/api/student/classes/${S.classId}/progress`);
  const cls = home.classes.find((c) => c.id === S.classId);
  const o = home.options;
  const length = el('select', {}, o.lengths.map((n) => el('option', { value: n, selected: n === 8 }, `${n} questions`)));
  const timer = el('select', {}, o.timers.map((t) => el('option', { value: t, selected: t === 0 }, t ? `${t}s per question` : 'Untimed')));
  const acc = el('select', {}, o.accommodation.map((m) => el('option', { value: m }, m === 1 ? 'Standard time' : `Extra time x${m}`)));
  const pet = home.catalog.pets.find((p) => p.id === home.inventory.equippedPet);

  add(main,
    heading('Practice', studentClassPicker(), walletBadge(), resourceBadge()),
    el('div', { class: 'panel' },
      el('div', { class: 'row top' },
        el('div', { style: 'font-size:48px' }, pet.emoji),
        el('div', { class: 'grow' },
          el('h3', {}, 'Start a session'),
          el('p', { class: 'small muted' }, `Your ${pet.name} attacks the Fog of Confusion each time you answer correctly. The timer is optional and is just for practice. Tip: number keys pick an answer.`),
          el('div', { class: 'row' },
            el('div', { class: 'field' }, el('label', {}, 'Length'), length),
            el('div', { class: 'field' }, el('label', {}, 'Timer'), timer),
            el('div', { class: 'field' }, el('label', {}, 'Accommodation'), acc)),
          el('button', { class: 'btn primary', onclick: action(async () => {
            const r = await api('POST', '/api/student/sessions', { classId: S.classId, length: Number(length.value), timerSec: Number(timer.value), accommodation: Number(acc.value) });
            runQuiz(r.id);
          }) }, 'Start practice')))),
    cls.participation ? el('div', { class: 'note small' }, `Your professor counts practice participation for this class: ${cls.participation.points} point(s) so far. You get one per completed session of 5+ questions (max ${cls.participation.weeklyCap} a week). Your score doesn't affect it.`) : null,
    prog.awaitingMarking ? el('div', { class: 'note small' }, `${prog.awaitingMarking} of your written answers are waiting for your professor to confirm the mark.`) : null,
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
  fill(main, arena, state.notes.length ? el('div', { class: 'note small' }, state.notes.join(' ')) : null, body);
  // Leaving the tab mid-question must stop the timer, or it would later
  // submit "time's up" for a quiz you can no longer see.
  hooks.cleanup = () => clearInterval(countdown);

  const replay = (node, cls) => {
    node.classList.remove(cls);
    void node.offsetWidth; // restart CSS animation
    node.classList.add(cls);
  };

  let turn = 0;
  async function showQuestion() {
    // A double-clicked "Next" (or held Enter) would run this twice; only
    // the latest call may draw, and any previous timer is stopped first.
    const mine = ++turn;
    clearInterval(countdown);
    state = await api('GET', `/api/student/sessions/${sid}`);
    if (mine !== turn || !body.isConnected) return;
    if (state.done) return showSummary();
    const q = state.question;
    const timerEl = el('span', { class: 'timer' });
    const feedback = el('div');
    const form = questionForm(q, async (submission) => {
      clearInterval(countdown);
      let r;
      try {
        r = await api('POST', `/api/student/sessions/${sid}/answer`, { index: q.index, ...submission });
      } catch (err) {
        toast(err.message, true);
        form.unlock();
        return;
      }
      form.showResult(r);
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
      const next = el('button', { class: 'btn primary', onclick: (e) => ((e.currentTarget.disabled = true), showQuestion()) }, r.done ? 'See results' : 'Next question →');
      fill(feedback,
        resultBlock(r, { correctText: r.attack ? `Correct! ${pet.name} used ${r.attack.move}.` : 'Correct!' }),
        el('div', { class: 'row', style: 'margin-top:12px' },
          next,
          el('button', { class: 'btn small', onclick: () => fill(reportBox, reportForm(q.questionId, reportBox)) }, 'Report a problem with this question')),
        reportBox);
      next.focus();
    });

    fill(body,
      el('div', { class: 'quiz-head' },
        el('span', { class: 'small muted' }, `Question ${q.index + 1} of ${state.total} · `, el('span', { class: 'badge plain' }, q.topic)),
        timerEl),
      form.node,
      feedback);

    if (q.remainingMs !== null) {
      const deadline = Date.now() + q.remainingMs;
      let id = null; // this question's own timer (never another question's)
      const tick = () => {
        const left = Math.max(0, deadline - Date.now());
        timerEl.textContent = `⏱ ${Math.ceil(left / 1000)}s`;
        timerEl.classList.toggle('low', left < 10000);
        if (left <= 0) {
          clearInterval(id);
          form.submitEmpty();
        }
      };
      id = countdown = setInterval(tick, 250);
      tick();
    }
  }

  async function showSummary() {
    const s = await api('GET', `/api/student/sessions/${sid}/summary`);
    home.wallet = s.wallet;
    const fbBox = el('div');
    if (!s.feedbackGiven) {
      const comment = el('input', { type: 'text', maxlength: 300, placeholder: 'Anything that was confusing or annoying? (optional, no personal info)' });
      const rate = (n) => action(async () => {
        await api('POST', `/api/student/sessions/${sid}/feedback`, { rating: n, comment: comment.value });
        fill(fbBox, el('div', { class: 'note good small' }, 'Thanks - this helps improve the app.'));
      });
      fill(fbBox, el('div', { class: 'panel', style: 'background:var(--bg)' },
        el('b', {}, 'How was this session?'),
        el('div', { class: 'row', style: 'margin:8px 0' }, comment),
        el('div', { class: 'row faces' }, [[1, '😕', 'Frustrating'], [2, '😐', 'OK'], [3, '🙂', 'Good']].map(([n, face, label]) => el('button', { class: 'btn', onclick: rate(n), 'aria-label': label, title: label }, face)))));
    }
    fill(body,
      el('h2', {}, s.npc.hp <= 0 ? 'The Fog of Confusion is defeated! 🎉' : 'Session complete'),
      el('p', {}, `${s.correct} of ${s.total} correct · +${s.coins} 🪙 this session · balance ${s.wallet.balance} 🪙`),
      s.resources && Object.keys(s.resources).length ? el('p', {}, `Kingdom supplies: +${fmtBundle(s.resources, home.catalog.resources)}`) : null,
      s.participation?.point ? el('p', { class: 'small' }, '+1 participation point for this class.') : s.participation?.capped ? el('p', { class: 'small muted' }, 'Participation points: weekly maximum already reached.') : null,
      s.provisional ? el('p', { class: 'small muted' }, `${s.provisional} written answer(s) have a provisional mark that your professor may review.`) : null,
      el('table', {}, el('tbody', {}, Object.entries(s.byTopic).map(([name, t]) => el('tr', {}, el('td', {}, name), el('td', {}, `${t.correct} / ${t.n}`))))),
      el('div', { class: 'spacer' }),
      s.wallet.earnedToday >= s.wallet.dailyCap ? el('div', { class: 'note warn small' }, 'You reached today\'s coin cap. You can keep practising; coins reset tomorrow.') : null,
      fbBox,
      el('div', { class: 'row', style: 'margin-top:12px' },
        el('button', { class: 'btn primary', onclick: rerender }, 'Back to practice'),
        el('button', { class: 'btn', onclick: () => ((S.tab = 'kingdom'), rerender()) }, 'Build your kingdom'),
        el('button', { class: 'btn', onclick: () => ((S.tab = 'world'), rerender()) }, 'Enter the World')));
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
