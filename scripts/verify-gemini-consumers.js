// Real OCR + existing provisional short-answer grading, with synthetic text.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { transcribe } = require('../src/quiz/vision');
const { grade } = require('../src/quiz/grading');
const { sharedQuota } = require('../src/quiz/gemini-quota');
async function main() {
  const q = sharedQuota(),
    before = q.snapshot(),
    browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'msedge' });
  const report = {};
  try {
    const page = await browser.newPage({ viewport: { width: 700, height: 240 } });
    await page.setContent(
      '<main style="padding:30px;font:24px Arial"><h2>Network concepts</h2><p>Latency is travel time.</p><p>Bandwidth is transfer capacity.</p></main>',
    );
    const image = await page.screenshot();
    const result = await transcribe({ imageBase64: image.toString('base64'), mimeType: 'image/png', mode: 'text' });
    assert.equal(result.status, 200);
    assert.match(result.body.text, /latency/i);
    assert.match(result.body.text, /bandwidth/i);
    assert.equal(result.body.containsPersonalData, false);
    report.ocr = { ok: true, model: result.body.model, text: result.body.text };
    console.log(JSON.stringify({ step: 'live image transcription', ok: true, model: result.body.model }));
    await new Promise((r) => setTimeout(r, 4200));
    const v = {
      type: 'short',
      stem: 'How do latency and bandwidth differ?',
      modelAnswer: 'Latency is travel delay; bandwidth is transfer capacity.',
      keyPoints: ['Latency measures travel time or delay.', 'Bandwidth measures transfer capacity.'],
    };
    const graded = await grade(v, null, {
      text: 'Latency measures the time data takes to travel. Bandwidth is the transfer capacity of the connection.',
    });
    assert.equal(graded.record.method, 'ai');
    assert.equal(graded.provisional, true);
    assert.equal(graded.correct, true);
    report.shortAnswer = { ok: true, method: graded.record.method, provisional: graded.provisional, score: graded.score };
    console.log(JSON.stringify({ step: 'live short-answer grading', ...report.shortAnswer }));
  } finally {
    await browser.close();
    const ids = new Set(before.events.map((e) => e.id)),
      events = q.snapshot().events.filter((e) => !ids.has(e.id));
    report.api = {
      requests: events.length,
      countTokenRequests: events.filter((e) => e.operation === 'countTokens').length,
      totalTokens: events.reduce((n, e) => n + (e.usage?.totalTokens || 0), 0),
      promptTokens: events.reduce((n, e) => n + (e.usage?.promptTokens || 0), 0),
      outputTokens: events.reduce((n, e) => n + (e.usage?.outputTokens || 0), 0),
    };
    const directory = path.resolve('tmp/gemini-consumers');
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, `evidence-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ file, ...report.api }));
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
