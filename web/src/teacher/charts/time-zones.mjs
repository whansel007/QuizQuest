// ============================================================
// Which group a question falls in, by time and accuracy. The two lines are
// the server's: "slow" = the slowest quarter of questions, "often wrong"
// = under maxAccuracy (60%), "mostly right" = maxAccuracy or more. "Worth rereading" is exactly the server's
// "possibly confusing" flag. With too few questions to know what is slow
// (slowMs null), questions are only split into mostly right / often wrong.
// Each group says what it likely means (hint) and what to do (action);
// `act` marks the groups that ask the professor to do something.
// ============================================================

export const ZONE_ORDER = ['reread', 'quickWrong', 'slowRight', 'fine', 'wrong', 'right', 'few'];
export const ZONES = {
  reread: { act: true, label: 'Worth rereading', hint: 'slow and often wrong, which often points to unclear wording or a hard concept', action: 'Reread the question and its answer key. If both are clear, the concept may need reteaching.' },
  quickWrong: { act: true, label: 'Quick but often wrong', hint: 'answered fast but often wrong, which can mean a tempting wrong option or a common misconception', action: 'Open it and look at the most chosen wrong answer: that is the misconception to address in class.' },
  slowRight: { label: 'Slow but mostly right', hint: 'takes thought, but most students get there', action: 'Usually nothing to fix. If it was meant to be quick, check it is not longer to read than it needs to be.' },
  fine: { label: 'Quick and mostly right', hint: 'no sign of trouble', action: 'Nothing to do.' },
  wrong: { act: true, label: 'Often wrong', hint: 'too few questions yet to tell what counts as slow', action: 'Open it to see the most chosen wrong answer, and check the wording.' },
  right: { label: 'Mostly right', hint: 'too few questions yet to tell what counts as slow', action: 'Nothing to do.' },
  few: { label: 'Not enough answers', hint: 'too few answers yet (or still awaiting marking) to place it', action: 'Nothing yet: wait for more answers, or mark the ones waiting.' },
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
