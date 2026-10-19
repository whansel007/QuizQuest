// ============================================================
// Small shared helpers for every view: formatting, toast, actions
// ============================================================

import { reactive } from 'vue';

export const pct = (x) => (x === null || x === undefined ? '-' : Math.round(x * 100) + '%');
export const secs = (ms) => (ms === null || ms === undefined ? '-' : (ms / 1000).toFixed(1) + 's');
// Times use Singapore's clock (the server's default APP_TIMEZONE), whatever the
// browser's own zone or language. Analytics passes the class's zone instead.
export const APP_TZ = 'Asia/Singapore';
export const when = (t, timeZone = APP_TZ) => new Date(t).toLocaleString('en-SG', { dateStyle: 'medium', timeStyle: 'short', timeZone });
export const clockTime = (t, timeZone = APP_TZ) => new Date(t).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', timeZone });
export const fmtBundle = (b, catalog) => Object.entries(b || {}).filter(([, v]) => v).map(([k, v]) => `${v} ${catalog[k]?.emoji || k}`).join(' + ') || 'nothing';

// One toast for the whole app (rendered by App.vue)
export const toastState = reactive({ msg: '', bad: false, show: false });
let toastTimer = null;
export function toast(msg, bad) {
  Object.assign(toastState, { msg, bad: !!bad, show: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastState.show = false), 3400);
}

// Wrap an async click handler: disable the clicked button while it runs
// and toast any error. Use as a handler, e.g.
//   const onSave = action(async () => { ... });   <button @click="onSave">
// For the same behaviour as a component, see components/AsyncButton.vue.
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
