// Suggests the assessment topic and learning outcome from a knowledge report:
// its title, and the items under its "Learning objectives/outcomes" heading.
// Plain functions so they can be tested without a browser.
const clean = (s) => s.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim();
// Source citations such as "(Week4.pptx · Slide 3, Slide 4)" belong in the report, not the outcome.
// Matches a bracketed group (one level of nesting, as in "Week4 (1).pptx") that names a file or slide/page.
const CITATION = /\s*\((?=(?:[^()]|\([^()]*\))*?(?:\.(?:pptx?|pdf|docx?|md|txt|csv)\b|\b(?:Slides?|Pages?|Sections?)\s+\d))(?:[^()]|\([^()]*\))*\)/gi;

export function suggestAssessment(markdown = '') {
  const lines = String(markdown).split('\n');
  const h1 = lines.find((l) => /^#\s+\S/.test(l));
  let topic = h1 ? clean(h1.replace(/^#\s+/, '')) : '';
  // "Comprehensive Knowledge Report: Cascading Style Sheets" -> the subject
  const colon = topic.indexOf(':');
  if (colon > 0 && /report|notes|summary|overview/i.test(topic.slice(0, colon))) topic = topic.slice(colon + 1).trim();
  const start = lines.findIndex((l) => /^#{1,6}\s.*learning\s+(objectives|outcomes|goals)/i.test(l));
  const items = [];
  if (start >= 0)
    for (const l of lines.slice(start + 1)) {
      if (/^#{1,6}\s/.test(l)) break;
      const item = l.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*\S)/);
      if (item) items.push(clean(item[1].replace(CITATION, '')).replace(/[.;]$/, ''));
    }
  return { topic: topic.slice(0, 160), outcome: items.join('; ').slice(0, 2000) };
}

// Groups a report's source excerpts by file name for a short "Made from" line.
export function sourceSummary(passageIds = [], names = {}) {
  const counts = new Map();
  for (const id of passageIds) {
    const name = names[id] || 'other material';
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts].map(([name, n]) => `${name} (${n} excerpt${n === 1 ? '' : 's'})`).join(', ');
}
