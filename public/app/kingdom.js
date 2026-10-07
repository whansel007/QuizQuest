// ============================================================
// STUDENT: kingdom building + class trading
// ------------------------------------------------------------
// Resources come from finishing practice sessions and from gathering
// in the World. They are spent on cosmetic buildings, or traded with
// classmates through open offers (the server holds offered resources
// in escrow, so an offer can always be honoured).
// ============================================================

import { S, el, fill, add, api, action, toast, when, heading, main, rerender, reqId, fmtBundle, root } from './core.js';
import { home, loadHome, studentClassPicker } from './student.js';

export async function viewKingdom() {
  const main = root(); // this render's own container (see core.js)
  await loadHome();
  if (!S.classId) return add(main, el('p', {}, 'You are not enrolled in any class.'));
  const [k, market] = await Promise.all([api('GET', '/api/student/kingdom'), api('GET', `/api/student/classes/${S.classId}/trades`)]);
  const R = k.catalog.resources;
  const resBar = el('div', { class: 'tiles' },
    Object.entries(R).map(([id, d]) => el('div', { class: 'tile' }, el('div', { class: 'v' }, `${d.emoji} ${k.resources[id] || 0}`), el('div', { class: 'l' }, d.name))),
    el('div', { class: 'tile' }, el('div', { class: 'v' }, `${k.earnedToday} / ${k.dailyCap}`), el('div', { class: 'l' }, 'resources earned today (daily cap)')));

  // --- the kingdom map: castle in the middle, four buildings around it
  const castle = ['⛺', '🏠', '🏯', '🏰'][k.castleLevel];
  const plot = (id) => {
    const def = k.catalog.buildings[id];
    const lvl = k.buildings[id];
    const cost = def.costs[lvl];
    const affordable = cost && Object.entries(cost).every(([r, v]) => (k.resources[r] || 0) >= v);
    return el('div', { class: 'plot' + (lvl ? '' : ' empty') },
      el('div', { class: 'sprite' }, lvl ? def.emoji : '🟫'),
      el('div', { style: 'font-weight:700' }, def.name),
      el('div', { class: 'stars', 'aria-label': `level ${lvl} of 3` }, '★'.repeat(lvl) + '☆'.repeat(3 - lvl)),
      cost
        ? el('button', { class: 'btn small' + (affordable ? ' primary' : ''), disabled: !affordable, onclick: action(async () => {
          await api('POST', '/api/student/kingdom/build', { building: id, requestId: reqId() });
          toast(`${def.name} upgraded!`);
          rerender();
        }) }, `${lvl ? 'Upgrade' : 'Build'}: ${fmtBundle(cost, R)}`)
        : el('div', { class: 'small muted' }, 'Max level'));
  };
  const map = el('div', { class: 'kingdom' },
    plot('library'), plot('workshop'),
    el('div', { class: 'castle' }, el('div', { class: 'sprite' }, castle), el('div', { style: 'font-weight:700' }, `Castle level ${k.castleLevel}`), el('div', { class: 'small muted' }, 'Grows when every building does')),
    plot('garden'), plot('tower'));

  // --- trading
  const qty = () => Object.fromEntries(Object.keys(R).map((id) => [id, el('input', { type: 'number', min: 0, max: 20, value: 0, style: 'max-width:70px', 'aria-label': R[id].name })]));
  const give = qty();
  const want = qty();
  const read = (inputs) => Object.fromEntries(Object.entries(inputs).map(([id, i]) => [id, Math.max(0, Math.floor(Number(i.value) || 0))]));
  const offerRow = (t, actions) => el('tr', {},
    el('td', {}, t.from),
    el('td', {}, 'offers ', el('b', {}, fmtBundle(t.give, R))),
    el('td', {}, 'for ', el('b', {}, fmtBundle(t.want, R))),
    el('td', { class: 'small muted' }, when(t.createdAt)),
    el('td', {}, actions));

  const trading = !market.enabled
    ? el('div', { class: 'panel' }, el('h3', {}, 'Class market'), el('p', { class: 'muted' }, 'Your professor has turned trading off for this class.'))
    : el('div', { class: 'panel' },
      el('h3', {}, 'Class market'),
      el('p', { class: 'small muted' }, `Offers are visible to your whole class. Offered resources are held until the offer is taken or you cancel. Max ${market.limits.maxOpenPerStudent} open offers, ${market.limits.maxUnitsPerSide} per side, ${market.limits.maxCompletedPerDay} trades a day. Resources can't be swapped for coins.`),
      market.market.length
        ? el('div', { class: 'table-wrap' }, el('table', {}, el('tbody', {}, market.market.map((t) => offerRow(t,
          el('button', { class: 'btn small primary', disabled: !Object.entries(t.want).every(([r, v]) => (market.resources[r] || 0) >= v), onclick: action(async () => {
            await api('POST', `/api/student/trades/${t.id}/accept`);
            toast('Trade done!');
            rerender();
          }) }, 'Accept'))))))
        : el('p', { class: 'small muted' }, 'No open offers from classmates right now.'),
      market.mine.length ? [el('h3', { style: 'margin-top:14px' }, 'Your open offers'), el('table', {}, el('tbody', {}, market.mine.map((t) => offerRow(t,
        el('button', { class: 'btn small', onclick: action(async () => {
          await api('POST', `/api/student/trades/${t.id}/cancel`);
          toast('Offer cancelled - resources returned');
          rerender();
        }) }, 'Cancel')))))] : null,
      el('h3', { style: 'margin-top:14px' }, 'Post an offer'),
      el('div', { class: 'row top' },
        el('div', { class: 'field' }, el('label', {}, 'I give'), el('div', { class: 'row' }, Object.entries(give).map(([id, i]) => el('span', {}, R[id].emoji, ' ', i)))),
        el('div', { class: 'field' }, el('label', {}, 'I want'), el('div', { class: 'row' }, Object.entries(want).map(([id, i]) => el('span', {}, R[id].emoji, ' ', i))))),
      el('button', { class: 'btn primary', onclick: action(async () => {
        await api('POST', `/api/student/classes/${S.classId}/trades`, { give: read(give), want: read(want) });
        toast('Offer posted');
        rerender();
      }) }, 'Post offer'),
      market.history.length ? el('details', { style: 'margin-top:14px' }, el('summary', {}, 'Your trade history'),
        el('table', {}, el('tbody', {}, market.history.map((t) => el('tr', {},
          el('td', { class: 'small muted' }, when(t.acceptedAt || t.createdAt)),
          el('td', {}, t.mine ? `You offered ${fmtBundle(t.give, R)} for ${fmtBundle(t.want, R)}` : `You gave ${fmtBundle(t.want, R)} to ${t.from} for ${fmtBundle(t.give, R)}`),
          el('td', {}, el('span', { class: 'badge plain' }, t.status))))))) : null);

  add(main,
    heading('Kingdom', studentClassPicker()),
    el('p', { class: 'small muted' }, 'Earn supplies by finishing practice sessions (🪵🪵🌿 each) and by answering questions at resource nodes in the World. Buildings are just for fun: no academic value.'),
    resBar,
    el('div', { class: 'panel' }, map),
    trading);
}
