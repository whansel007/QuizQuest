// ============================================================
// STUDENT: pets, shop, history
// ============================================================

import { el, fill, add, api, action, toast, pct, when, heading, main, rerender, reqId, root, retryablePost } from './core.js';
import { home, loadHome, walletBadge } from './student.js';

export async function viewPets() {
  const main = root(); // this render's own container (see core.js)
  await loadHome();
  const ledger = await api('GET', '/api/student/ledger');
  const { inventory: inv, catalog } = home;
  const equip = (body) => action(async () => {
    await api('POST', '/api/student/equip', body);
    rerender();
  });
  const odds = catalog.eggOdds;
  const total = Object.values(odds).reduce((a, b) => a + b, 0);
  const eggResult = el('div');
  const openEgg = retryablePost('/api/student/shop/egg');

  add(main,
    heading('Pets & shop', walletBadge()),
    el('div', { class: 'note small' },
      `Coins have no cash or academic value. You earn ${home.rules.firstCorrect} for the first correct answer to each question, ${home.rules.sessionComplete} for finishing a session of ${home.rules.minSessionForBonus}+ questions, and ${home.rules.milestone} once per topic when your practice indicator reaches ${pct(home.rules.milestoneAccuracy)}. Raid victories in the World pay too. Up to ${home.wallet.dailyCap} per day (${home.wallet.earnedToday} earned today).`),
    el('div', { class: 'panel' },
      el('h3', {}, 'Collection'),
      el('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(130px,1fr))' },
        catalog.pets.map((p) => {
          const mine = inv.pets.find((x) => x.id === p.id);
          const buy = retryablePost('/api/student/shop/buy', { itemId: p.id });
          return el('div', { class: 'pet-card' + (mine ? '' : ' locked') + (inv.equippedPet === p.id ? ' equipped' : '') },
            el('div', { class: 'sprite' }, p.emoji),
            el('div', { style: 'font-weight:700' }, mine ? p.name : '???'),
            el('div', { class: 'rarity ' + p.rarity }, p.rarity),
            mine ? el('div', { class: 'small muted' }, `Move: ${p.move}`) : null,
            mine && mine.dupes ? el('div', { class: 'small muted' }, `+${mine.dupes} duplicate(s)`) : null,
            mine ? (inv.equippedPet === p.id ? el('div', { class: 'small muted' }, 'Equipped') : el('button', { class: 'btn small', onclick: equip({ petId: p.id }) }, 'Equip'))
              : p.price ? el('button', { class: 'btn small', onclick: action(async () => {
                await buy();
                toast(`${p.name} joined your team!`);
                rerender();
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
          const r = await openEgg();
          fill(eggResult, el('div', { class: 'note good', style: 'margin-top:10px;font-size:16px' }, `${r.pet.emoji} ${r.pet.name} (${r.pet.rarity})`, r.duplicatePet ? ` - duplicate, +${catalog.duplicateRefund} 🪙 back` : ' - new!'));
          setTimeout(() => main.isConnected && rerender(), 1600); // only if still on this tab
        }) }, 'Open an egg'),
        eggResult),
      el('div', { class: 'panel grow', style: 'min-width:260px' },
        el('h3', {}, 'Accessories'),
        catalog.items.map((it) => {
          const mine = inv.items.includes(it.id);
          const buy = retryablePost('/api/student/shop/buy', { itemId: it.id });
          return el('div', { class: 'row', style: 'padding:6px 0' },
            el('span', { style: 'font-size:26px' }, it.emoji),
            el('span', { class: 'grow' }, it.name),
            mine
              ? (inv.equippedItem === it.id ? el('button', { class: 'btn small', onclick: equip({ itemId: null }) }, 'Take off') : el('button', { class: 'btn small', onclick: equip({ itemId: it.id }) }, 'Wear'))
              : el('button', { class: 'btn small', onclick: action(async () => {
                await buy();
                rerender();
              }) }, `${it.price} 🪙`));
        }))),
    el('div', { class: 'row top' },
      el('div', { class: 'panel grow', style: 'min-width:300px' },
        el('h3', {}, 'Coin history'),
        ledger.coins.length ? el('div', { class: 'table-wrap' }, el('table', {}, el('tbody', {}, ledger.coins.map((t) => el('tr', {},
          el('td', { class: 'small muted' }, when(t.at)),
          el('td', {}, t.reason),
          el('td', { style: `text-align:right;font-weight:700;color:var(--${t.amount >= 0 ? 'good' : 'bad'})` }, (t.amount >= 0 ? '+' : '') + t.amount))))))
          : el('p', { class: 'muted small' }, 'No coins yet - finish a practice session to earn some.')),
      el('div', { class: 'panel grow', style: 'min-width:300px' },
        el('h3', {}, 'Resource history'),
        ledger.resources.length ? el('div', { class: 'table-wrap' }, el('table', {}, el('tbody', {}, ledger.resources.map((t) => el('tr', {},
          el('td', { class: 'small muted' }, when(t.at)),
          el('td', {}, t.reason),
          el('td', { style: 'text-align:right' }, Object.entries(t.delta).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${catalog.resources[k].emoji}`).join(' ')))))))
          : el('p', { class: 'muted small' }, 'No resources yet. Complete sessions or gather in the World.'))));
}
