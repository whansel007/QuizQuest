// ============================================================
// Student "home" data shared by every student tab: classes, wallet,
// inventory, catalog and rules (GET /api/student/home). Reactive, so
// the wallet/resource badges update wherever they are shown when the
// server reports new totals (e.g. a raid victory in the World).
// ============================================================

import { reactive } from 'vue';
import { S, api } from '../api.js';

export const store = reactive({ home: null });

export async function loadHome() {
  const home = await api('GET', '/api/student/home');
  store.home = home;
  if (!S.classId || !home.classes.some((c) => c.id === S.classId)) S.classId = home.classes[0]?.id;
  return store.home;
}

// b: { wallet: { balance, earnedToday, dailyCap }, resources: { wood, ... } }
export function updateBalances(b) {
  const home = store.home;
  if (!home || !b) return;
  if (b.wallet) Object.assign(home.wallet, b.wallet);
  if (b.resources) home.inventory.resources = { ...b.resources };
}
