// ============================================================
// The guard rails in the browser: the professor ticks the AI
// drafts in the question bank and rewrites them in one style.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const playwright = require('playwright');
const { start } = require('../server');

let srv, browser, base;
let sequence = 0;
const classifications = new Map();

const REPORT = [
  '## Network behaviour',
  'Latency measures the delay packets experience between two points, while bandwidth measures how much data a link can carry per second.',
  'A link with plenty of capacity can still delay a call, because travel time and transfer capacity are different properties.',
  'Routers forward packets towards another network; switches connect devices inside one local network.',
  '### Worked reasoning',
  'A queueing delay grows once the arrival rate of packets stays above the rate the link can serve.',
].join('\n');

// The duplicate check masks numbers and compares word sets, so every draft
// needs its own wording.
const stems = [
  'A video call has enough capacity but the replies arrive late. Which property explains the delay?',
  'Packets keep arriving at a link faster than it can serve them. What happens to the waiting packets?',
  'A packet must leave the local network. Which device forwards it towards its destination?',
  'A laptop and a desktop sit side by side and must exchange packets. Which device links them?',
  'A link carries 100 megabits each second, yet a file takes a long time to arrive. What is the likely cause?',
  'Offices in different cities join their networks. Which device sits at the boundary between them?',
  'A router joins two networks. What does it use to decide where each packet goes next?',
  'Throughput on a link improves, yet a remote file still arrives slowly. Which other property should be measured?',
];

const ai = async ({ prompt }) => {
  if (prompt.startsWith('Independently')) {
    const d = JSON.parse(prompt.slice(prompt.indexOf('\n') + 1));
    return {
      json: {
        applicationSupported: true,
        limitation: '',
        checks: d.questions.map((question, index) => ({
          index,
          correct: true,
          oneCorrect: true,
          questionValid: true,
          unambiguous: true,
          explanationSupported: true,
          statementTruth: null,
          cognitiveStyle: classifications.get(question.stem) || 'application',
          reasoningSteps: ['read the scenario givens', 'apply the rule to them', 'choose the justified answer'],
          answerableWithoutScenario: false,
          outcomeAligned: true,
          difficultyAppropriate: true,
          scenarioGrounded: true,
          aligned: true,
          duplicate: false,
          fitsConfiguration: true,
          unsupportedClaims: [],
          answerIndex: ['mcq', 'tf'].includes(question.type) ? 0 : -1,
          answerIndexes: [],
          numericAnswer: null,
          evidence: question.sourceIds.map((id) =>
            d.evidenceAnchors
              ? { passageId: id, quoteId: d.evidenceAnchors.find((a) => a.passageId === id).id }
              : { passageId: id, quote: d.sources.find((s) => s.passageId === id).text.slice(0, 50) },
          ),
        })),
      },
    };
  }
  return { json: { markdown: REPORT, insufficient: false } };
};

test.before(async () => {
  srv = start(0, {
    dataFile: null,
    authoringAI: ai,
    authoringDrafter: async (ctx) => {
      const items = [];
      for (const [type, count] of Object.entries(ctx.quantities || {})) {
        for (let i = 0; i < count; i += 1) {
          const n = sequence++;
          const stem = stems[n % stems.length];
          const item = {
            type,
            stem,
            explanation: 'Latency measures travel delay, while bandwidth describes transfer capacity.',
            difficulty: 'medium',
            sourceIds: [ctx.chunks[0].passageId],
          };
          if (type === 'mcq') Object.assign(item, { options: ['Latency', 'Bandwidth', 'Routing', 'Switching'], answerIndex: 0 });
          if (type === 'short')
            Object.assign(item, {
              answerMode: 'text',
              modelAnswer: 'Latency measures travel delay, while bandwidth describes capacity.',
              keyPoints: ['Latency measures travel delay', 'Bandwidth describes capacity'],
            });
          // The drafter is asked for a style; the mock drafts in that style.
          classifications.set(stem, n % 2 ? 'conceptual' : 'application');
          items.push(item);
        }
      }
      return { items };
    },
  });
  await new Promise((r) => srv.httpServer.once('listening', r));
  base = `http://localhost:${srv.httpServer.address().port}`;
  browser = await playwright.chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
});
test.after(async () => {
  await browser?.close();
  srv?.io.close();
});

// The demo accounts hide behind Tools and version + the Konami code.
async function pickDemo(page, name) {
  await page.getByRole('button', { name: 'Tools and version' }).click();
  for (const key of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter'])
    await page.keyboard.press(key);
  await page.getByRole('heading', { name: 'Test accounts' }).waitFor();
  await page.getByRole('button', { name, exact: false }).click();
  await page.getByRole('button', { name: 'Switch user', exact: true }).waitFor();
}

// Creates real AI drafts through the API, so the question bank shows
// genuine rewritable questions rather than a stubbed list.
async function seedDrafts(topicNames = ['Networking basics']) {
  const login = await (
    await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 't-a' }) })
  ).json();
  const auth = { 'content-type': 'application/json', authorization: 'Bearer ' + login.token };
  const analysis = await (
    await fetch(base + '/api/teacher/courses/c-comp/authoring', { method: 'POST', headers: auth, body: JSON.stringify({ kind: 'report' }) })
  ).json();
  for (let i = 0; i < 100; i += 1) {
    const job = srv.quiz.db.courses.find((c) => c.id === 'c-comp').authoringJobs.find((j) => j.id === analysis.id);
    if (job && job.status !== 'queued' && job.status !== 'running') break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await fetch(base + '/api/teacher/courses/c-comp/authoring/' + analysis.id + '/review', {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ markdown: REPORT, reportRevision: 0 }),
  });
  const created = [];
  for (const name of topicNames) {
    const topic = srv.quiz.db.topics.find((t) => t.courseId === 'c-comp' && t.name === name);
    const generation = await (
      await fetch(base + '/api/teacher/courses/c-comp/authoring', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          kind: 'generation',
          analysisId: analysis.id,
          reportRevision: 1,
          topicId: topic.id,
          outcomeId: topic.outcomes[0].id,
          assessmentStyle: 'both',
          quantities: { mcq: 2 },
        }),
      })
    ).json();
    let job = null;
    for (let i = 0; i < 200; i += 1) {
      job = srv.quiz.db.courses.find((c) => c.id === 'c-comp').authoringJobs.find((j) => j.id === generation.id);
      if (job && job.status !== 'queued' && job.status !== 'running') {
        assert.equal(job.status, 'complete', job.message);
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    created.push(...srv.quiz.db.questions.filter((q) => q.generationId === job.result.generationId));
  }
  return created;
}

const topicId = (name) => srv.quiz.db.topics.find((t) => t.courseId === 'c-comp' && t.name === name).id;

async function openBank(t) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-SG' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(async () => {
    await page.screenshot({ path: 'tmp/guard-rails-bank.png', fullPage: true });
    await page.close();
    assert.deepEqual(errors, [], 'no unhandled browser errors');
  });
  await page.goto(base);
  await pickDemo(page, 'Prof. Demo A');
  await page.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();
  await page.getByRole('heading', { name: 'Question bank' }).waitFor();
  return page;
}

test('the professor ticks drafts in the question bank and rewrites them in one style', async (t) => {
  const drafts = await seedDrafts();
  assert.equal(drafts.length, 2, 'two AI drafts to rewrite');

  const page = await openBank(t);
  const boxes = page.getByRole('checkbox', { name: /^Rewrite this / });
  assert.equal(await boxes.count(), 2, 'only the AI drafts can be rewritten');
  assert.equal(await page.getByRole('checkbox', { name: 'Select every rewritable question on this page' }).count(), 1, 'the toolbar appears');

  await boxes.first().check();
  await boxes.nth(1).check();
  await page.getByText('2 selected').waitFor();
  await page.getByLabel('Rewrite as').selectOption('conceptual');

  let payload = null;
  await page.route('**/api/teacher/questions/regenerate', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ id: 'job-1', count: 2 }) });
  });
  await page.getByRole('button', { name: 'Rewrite selected' }).click();
  await page.getByText('2 replacements queued. Your original drafts are kept.').waitFor();
  assert.equal(payload.assessmentStyle, 'conceptual', 'the chosen style is sent');
  assert.equal(payload.ids.length, 2, 'both ticked questions are sent');
  assert.deepEqual([...payload.ids].sort(), drafts.map((q) => q.id).sort());

  // The drafts that were rewritten are still in the bank, untouched.
  await page.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();
  await page.getByRole('heading', { name: 'Question bank' }).waitFor();
  const cards = await page.locator('[id^="qcard-"]').evaluateAll((els) => els.map((e) => e.id));
  for (const q of drafts) assert.ok(cards.includes('qcard-' + q.id), 'the rewritten draft is still listed');
  for (const q of drafts) {
    const card = page.locator('#qcard-' + q.id);
    await card.waitFor();
    assert.match(await card.innerText(), /draft/, 'the original draft is kept');
  }
});

test('a rewrite is refused when the ticked questions come from different topics', async (t) => {
  await seedDrafts(['Networking basics', 'Cyber hygiene']);

  const page = await openBank(t);
  const button = page.getByRole('button', { name: 'Rewrite selected' });
  assert.equal(await button.isDisabled(), true, 'nothing ticked, nothing to rewrite');

  // One draft from each topic: the rewrite has to be refused, with a reason.
  await page.getByLabel('Filter by topic').selectOption(topicId('Cyber hygiene'));
  await page.getByRole('checkbox', { name: /^Rewrite this / }).first().check();
  await page.getByLabel('Filter by topic').selectOption(topicId('Networking basics'));
  await page.getByRole('checkbox', { name: /^Rewrite this / }).first().check();
  await page.getByText('Select questions from one topic and learning outcome').waitFor();
  assert.equal(await button.isDisabled(), true, 'a mixed selection cannot be rewritten');

  // Back to one topic: the button comes back.
  await page.getByRole('checkbox', { name: /^Rewrite this / }).first().uncheck();
  await page.getByText('Select questions from one topic and learning outcome').waitFor({ state: 'detached' });
  assert.equal(await button.isEnabled(), true, 'a single topic can be rewritten');
});
