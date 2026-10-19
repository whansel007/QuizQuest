// Topic/outcome suggestions and source summaries for the AI drafting page.
const test = require('node:test');
const assert = require('node:assert/strict');

test('suggests the topic from the title and the outcome from learning objectives', async () => {
  const { suggestAssessment } = await import('../web/src/teacher/report-suggestions.mjs');
  const report = [
    '# Comprehensive Knowledge Report: Cascading Style Sheets (CSS)',
    '## 1. Introduction',
    '- not an objective',
    '## 8. Learning Objectives',
    '1. Explain how the **cascade** resolves conflicting rules.',
    '2. Calculate an element\'s total width under `content-box`;',
    '- Choose between Flexbox and Grid for a layout',
    '## 9. Sample Questions',
    '- Which selector wins?',
  ].join('\n');
  assert.deepEqual(suggestAssessment(report), {
    topic: 'Cascading Style Sheets (CSS)',
    outcome: "Explain how the cascade resolves conflicting rules; Calculate an element's total width under content-box; Choose between Flexbox and Grid for a layout",
  });
  assert.deepEqual(suggestAssessment('# Vue.js: reactive pages\nNo objectives here.'), { topic: 'Vue.js: reactive pages', outcome: '' });
  assert.deepEqual(suggestAssessment(''), { topic: '', outcome: '' });
});

test('summarises which files a report was made from', async () => {
  const { sourceSummary } = await import('../web/src/teacher/report-suggestions.mjs');
  assert.equal(sourceSummary(['a', 'b', 'c', 'x'], { a: 'Week4.pptx', b: 'Week4.pptx', c: 'notes.pdf' }), 'Week4.pptx (2 excerpts), notes.pdf (1 excerpt), other material (1 excerpt)');
  assert.equal(sourceSummary([], {}), '');
});

test('suggested outcomes drop source citations', async () => {
  const { suggestAssessment } = await import('../web/src/teacher/report-suggestions.mjs');
  const report = '# Vue.js fundamentals\n## Learning objectives\n- Understand the DOM (Week4Slides (1).pptx · Slide 3, Slide 4)\n- Explain reactivity (Slides 5–9)\n- Compare v-if (conditional) and v-show';
  assert.equal(suggestAssessment(report).outcome, 'Understand the DOM; Explain reactivity; Compare v-if (conditional) and v-show');
});
