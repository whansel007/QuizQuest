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
  'A printer and a scanner share one office network. Which device lets them reach each other?',
  'A branch office link is saturated at noon and calls lag. What should be checked first?',
  'Two hosts on separate networks cannot reach each other. Which device is missing between them?',
  'A queue at a busy link keeps growing every minute. What does that say about arrival and service rates?',
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
          // The drafter is asked for a style; the mock drafts in that style
          // (alternating for Both).
          const style = ctx.assessment?.style;
          classifications.set(stem, ['conceptual', 'application'].includes(style) ? style : n % 2 ? 'conceptual' : 'application');
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
  await page.getByRole('button', { name: 'Log out', exact: true }).waitFor();
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

// After a batch, "Rewrite drafts" leads straight to the rewrite toolbar, and a
// real rewrite (no stubbed request) adds replacements in the chosen style.
test('after a batch, Rewrite drafts opens the toolbar and a real rewrite adds replacements in the chosen style', async (t) => {
  const login = await (
    await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 't-a' }) })
  ).json();
  const auth = { 'content-type': 'application/json', authorization: 'Bearer ' + login.token };
  const course = () => srv.quiz.db.courses.find((c) => c.id === 'c-comp');
  const settled = async (find, what) => {
    for (let i = 0; i < 300; i += 1) {
      const job = find();
      if (job && !['queued', 'running'].includes(job.status)) return job;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(what + ' did not finish');
  };
  // A saved knowledge report for the default weekly topic (Week 1).
  const report = await (
    await fetch(base + '/api/teacher/courses/c-comp/authoring', { method: 'POST', headers: auth, body: JSON.stringify({ kind: 'report', topicId: 'tp-data' }) })
  ).json();
  await settled(() => course().authoringJobs.find((j) => j.id === report.id), 'The report');
  await fetch(base + `/api/teacher/courses/c-comp/authoring/${report.id}/review`, { method: 'PUT', headers: auth, body: JSON.stringify({ markdown: REPORT, reportRevision: 0 }) });

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'en-SG' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  t.after(async () => {
    await page.close();
    assert.deepEqual(errors, [], 'no unhandled browser errors');
  });
  await page.goto(base);
  await pickDemo(page, 'Prof. Demo A');
  await page.locator('#tabs').getByRole('button', { name: 'AI drafting', exact: true }).click();
  await page.getByText('Report saved', { exact: true }).waitFor();

  // Generate a batch of two in the UI, as the professor would.
  await page.getByRole('spinbutton', { name: 'MCQ quantity', exact: true }).fill('2');
  await page.getByLabel('Assessment Style', { exact: true }).selectOption('both');
  await page.getByRole('button', { name: 'Generate questions', exact: true }).click();
  const status = page.locator('.gen-status');
  await status.getByText('2 questions saved to the Question Bank').waitFor({ timeout: 20000 });
  const panel = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Review and publish' }) });
  await panel.getByText('Not the mix you wanted?').waitFor();
  assert.equal(await panel.getByRole('button', { name: 'Rewrite drafts', exact: true }).count(), 1, 'the results panel offers the rewrite');
  await page.screenshot({ path: 'tmp/rewrite-after-batch.png', fullPage: true });
  const batch = course().authoringJobs.filter((j) => j.kind === 'generation' && j.input.topicId === 'tp-data').at(-1);
  const originals = [...batch.result.created];
  assert.equal(originals.length, 2);

  // The floating status's Rewrite drafts opens the bank on the toolbar.
  await status.getByRole('button', { name: 'Rewrite drafts', exact: true }).click();
  await page.getByRole('heading', { name: 'Question bank' }).waitFor();
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Rewrite AI drafts');
  assert.ok(await page.getByRole('group', { name: 'Rewrite AI drafts' }).evaluate((el) => el.classList.contains('flash')), 'the toolbar is highlighted');
  await page.getByText('Tick the AI drafts to change, choose a style and rewrite them together.').waitFor();
  assert.equal(await page.getByLabel('Filter by topic').inputValue(), 'tp-data', 'the bank opens on the batch topic');
  await page.screenshot({ path: 'tmp/rewrite-bar-focus.png' });

  // Tick both drafts, ask for Application and send the real request.
  const boxes = page.getByRole('checkbox', { name: /^Rewrite this / });
  assert.equal(await boxes.count(), 2);
  await boxes.first().check();
  await boxes.nth(1).check();
  await page.getByLabel('Rewrite as').selectOption('application');
  await page.getByRole('button', { name: 'Rewrite selected' }).click();
  await page.getByText('2 replacements queued. Your original drafts are kept.').waitFor();
  const rewrite = await settled(
    () => course().authoringJobs.find((j) => Array.isArray(j.replaces) && originals.every((id) => j.replaces.includes(id))),
    'The rewrite',
  );
  assert.equal(rewrite.status, 'complete', rewrite.message);
  assert.equal(rewrite.input.assessmentStyle, 'application');
  const replacements = rewrite.result.created.map((id) => srv.quiz.db.questions.find((q) => q.id === id));
  assert.equal(replacements.length, 2, 'one replacement per ticked draft');
  for (const q of replacements) {
    assert.equal(q.status, 'draft');
    assert.equal(q.assessment.cognitiveStyle, 'application', 'replacements are in the chosen style');
    assert.equal(q.topicId, 'tp-data', 'replacements stay in the same topic');
  }
  for (const id of originals) assert.equal(srv.quiz.db.questions.find((q) => q.id === id).status, 'draft', 'originals are kept');

  // The bank lists the replacements, labelled Application, beside the originals.
  await page.locator('#tabs').getByRole('button', { name: 'Question bank', exact: true }).click();
  await page.getByRole('heading', { name: 'Question bank' }).waitFor();
  for (const q of replacements) assert.match(await page.locator('#qcard-' + q.id).innerText(), /Application/);
  for (const id of originals) await page.locator('#qcard-' + id).waitFor();
  await page.screenshot({ path: 'tmp/rewrite-result.png', fullPage: true });
});
