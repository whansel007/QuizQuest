// One tab stop per chart: arrow keys move between its points (Home/End
// jump to the ends), so keyboard users don't tab through every point to get
// past it. The chart announces the point it lands on through a live region;
// the table view under each chart remains the full screen-reader route.
//   const next = stepKey(e, active, rows.length); if (next !== null) active = next;
export function stepKey(e, index, count) {
  if (!count) return null;
  const at = index ?? -1;
  const next = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: count - 1 }[e.key];
  if (next === undefined) return null;
  e.preventDefault();
  return Math.max(0, Math.min(count - 1, next));
}
