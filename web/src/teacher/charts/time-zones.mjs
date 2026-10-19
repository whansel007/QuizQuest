// ============================================================
// Where a question sits on the time x accuracy chart. The two lines are
// the server's: "slow" = the slowest quarter of questions, "mostly wrong"
// = under maxAccuracy. "Worth rereading" is exactly the server's
// "possibly confusing" flag. With too few questions to know what is slow
// (slowMs null), questions are only split into mostly right / wrong.
// ============================================================

export const ZONE_ORDER = ['reread', 'quickWrong', 'slowRight', 'fine', 'wrong', 'right', 'few'];
export const ZONES = {
  reread: { label: 'Worth rereading', hint: 'slow and mostly wrong, which often points to unclear wording or a hard concept' },
  quickWrong: { label: 'Quick but mostly wrong', hint: 'answered fast but often wrong, which can mean a tempting wrong option or a common misconception' },
  slowRight: { label: 'Slow but mostly right', hint: 'takes thought, but most students get there' },
  fine: { label: 'Quick and mostly right', hint: 'no sign of trouble' },
  wrong: { label: 'Mostly wrong', hint: 'too few questions yet to tell what counts as slow' },
  right: { label: 'Mostly right', hint: 'too few questions yet to tell what counts as slow' },
  few: { label: 'Not enough answers', hint: 'too few answers yet (or still awaiting marking) to place it' },
};

// q: { n, meanMs, accuracy (0..1 or null), flagged }
export function zoneOf(q, { slowMs, maxAccuracy, lowN }) {
  if (q.flagged) return 'reread';
  if (q.n < lowN || q.accuracy === null || q.accuracy === undefined) return 'few';
  const wrong = q.accuracy < maxAccuracy;
  if (slowMs === null || slowMs === undefined) return wrong ? 'wrong' : 'right';
  const slow = q.meanMs >= slowMs;
  if (wrong) return slow ? 'reread' : 'quickWrong';
  return slow ? 'slowRight' : 'fine';
}

// [{ id, label, hint, count }] in reading order, only zones that have questions
export function zoneCounts(questions, opts) {
  const counts = {};
  for (const q of questions) {
    const z = zoneOf(q, opts);
    counts[z] = (counts[z] || 0) + 1;
  }
  return ZONE_ORDER.filter((id) => counts[id]).map((id) => ({ id, ...ZONES[id], count: counts[id] }));
}

// "Why is UDP often chosen for live online games?" -> "Why is UDP often chosen for…"
export function shortLabel(text, max = 32) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '') + '…';
}
