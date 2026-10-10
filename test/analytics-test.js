// ============================================================
// Analytics dashboard tests (src/quiz/analytics.js + its route)
// ------------------------------------------------------------
// Works on the synthetic seed with a few hand-made attempts added, at a
// fixed "now", so every number below can be worked out by hand.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../src/quiz/seed');
const { classAnalytics, questionInsights, courseComparison, parsePeriod } = require('../src/quiz/analytics');
const { start } = require('../server');

const DAY = 86400000;
const NOW = Date.UTC(2026, 9, 9, 12); // Fri 9 Oct 2026, 12:00 UTC

// A fresh seed (its history is dated relative to NOW) plus helpers
function setup() {
  const db = seed(NOW);
  let n = 0;
  const add = (fields) => {
    const a = { id: `at-test-${++n}`, sessionId: null, studentId: 's-01', classId: 'cl-a', courseId: 'c-comp', questionId: 'q-d1', version: 1, topicId: 'tp-data', type: 'mcq', choice: 1, correct: true, score: 1, ms: 10000, timedOut: false, first: true, context: 'practice', at: NOW - 3600000, ...fields };
    db.attempts.push(a);
    return a;
  };
  return { db, add };
}
const topic = (a, id) => a.byTopic.find((t) => t.topicId === id);

test('answers awaiting marking are left out of accuracy and counted separately', () => {
  const { db } = setup();
  const before = classAnalytics(db, 'cl-a', NOW, { range: 'all' });
  db.attempts.push({ id: 'at-short', sessionId: null, studentId: 's-01', classId: 'cl-a', courseId: 'c-comp', questionId: 'q-x3', version: 1, topicId: 'tp-net', type: 'short', text: 'x', correct: true, score: 1, ms: 20000, timedOut: false, first: true, context: 'practice', at: NOW - 1000, needsReview: true });
  const after = classAnalytics(db, 'cl-a', NOW, { range: 'all' });
  assert.deepEqual(topic(after, 'tp-net').first, topic(before, 'tp-net').first, 'provisional answer did not change accuracy');
  assert.equal(topic(after, 'tp-net').awaitingMarking, 1);
  assert.equal(after.participation.awaitingMarking, 1);
  assert.equal(after.participation.attempts, before.participation.attempts + 1, 'still counted as an answer submitted');
  // once marked, it counts
  db.attempts.at(-1).needsReview = false;
  assert.equal(topic(classAnalytics(db, 'cl-a', NOW, { range: 'all' }), 'tp-net').first.n, topic(before, 'tp-net').first.n + 1);
});

test('the period filter scopes tiles, tables and response times', () => {
  const { db, add } = setup();
  add({ at: NOW - 40 * DAY, ms: 999000 }); // outside 30 days
  const all = classAnalytics(db, 'cl-a', NOW, { range: 'all' });
  const month = classAnalytics(db, 'cl-a', NOW, { range: '30d' });
  const week = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  assert.equal(all.participation.attempts, month.participation.attempts + 1);
  assert.ok(week.participation.attempts < month.participation.attempts, 'the 9-days-ago seed sessions fall outside 7 days');
  const time = (r, id) => r.time.questions.find((q) => q.questionId === id).meanMs;
  assert.ok(time(all, 'q-d1') > time(month, 'q-d1'));
  // trend buckets: exactly 7 days, and they add up to the tile
  assert.equal(week.trend.bucket, 'day');
  assert.equal(week.trend.points.length, 7);
  assert.equal(week.trend.points.reduce((n, p) => n + p.answers, 0), week.participation.attempts);
  assert.equal(month.trend.bucket, 'week');
  assert.equal(month.trend.points.reduce((n, p) => n + p.answers, 0), month.participation.attempts);
});

test('trend points carry their sample size; empty buckets have no accuracy', () => {
  const { db } = setup();
  const week = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  for (const p of week.trend.points) {
    for (const r of Object.values(p.topics)) {
      assert.ok(Number.isInteger(r.n));
      if (r.n === 0) assert.equal(r.accuracy, null);
    }
  }
  assert.ok(week.trend.points.some((p) => p.answers === 0), 'a quiet day is shown as zero, not skipped');
});

test('every seeded question is fully tagged; missing or invalid tags are listed', () => {
  const { db } = setup();
  const ok = classAnalytics(db, 'cl-a', NOW).tags;
  assert.equal(ok.issues.length, 0);
  assert.equal(ok.complete, ok.total);
  const q = (id) => db.questions.find((x) => x.id === id);
  q('q-d1').outcomeId = 'lo-net-1'; // an outcome from a different topic
  q('q-d2').versions.at(-1).difficulty = '';
  q('q-d3').topicId = 'tp-missing';
  q('q-d4').status = 'rejected';
  q('q-d4').outcomeId = null; // rejected questions are ignored
  const bad = classAnalytics(db, 'cl-a', NOW).tags;
  const missing = Object.fromEntries(bad.issues.map((i) => [i.questionId, i.missing]));
  assert.deepEqual(missing, { 'q-d1': ['learning outcome'], 'q-d2': ['difficulty'], 'q-d3': ['topic', 'learning outcome'] });
  assert.equal(bad.total, ok.total - 1);
});

test('average time per question: each student counts once, timed-out answers left out, no names', () => {
  const { db } = setup();
  db.attempts = db.attempts.filter((a) => a.questionId !== 'q-d1');
  let n = 0;
  const at = (studentId, ms, extra = {}) => db.attempts.push({ id: `t${++n}`, sessionId: null, studentId, classId: 'cl-a', courseId: 'c-comp', questionId: 'q-d1', version: 1, topicId: 'tp-data', type: 'mcq', choice: 1, correct: true, score: 1, ms, timedOut: false, first: n === 1, context: 'practice', at: NOW - 1000 * n, ...extra });
  at('s-02', 10000);
  at('s-02', 20000); // s-02 averages 15s
  at('s-03', 40000);
  at('s-03', 90000, { timedOut: true }); // no answering time
  const q = classAnalytics(db, 'cl-a', NOW, { range: 'all' }).time.questions.find((x) => x.questionId === 'q-d1');
  assert.equal(q.n, 3);
  assert.equal(q.students, 2);
  assert.equal(q.meanMs, (15000 + 40000) / 2, 'average of each student average');
  assert.equal(q.medianMs, 20000);
  const json = JSON.stringify(q);
  assert.ok(!/Student|s-0\d/.test(json), 'no student names or ids are sent');
});

test('days follow the class time zone (Singapore by default, UTC+8)', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  // Fri 9 Oct, 01:00 in Singapore = Thu 8 Oct, 17:00 UTC
  add({ at: Date.UTC(2026, 9, 8, 17) });
  const sg = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  assert.equal(sg.timezone, 'Asia/Singapore');
  const day = (r) => r.trend.points.findIndex((p) => p.answers === 1);
  assert.equal(day(sg), 6, 'counted on Friday (today), not Thursday');
  assert.equal(sg.trend.points[0].start, Date.UTC(2026, 9, 2, 16), 'the first day starts at midnight Singapore time');
  db.classes.find((c) => c.id === 'cl-a').settings.timezone = 'UTC';
  const utc = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  assert.equal(day(utc), 5, 'in UTC the same answer is on Thursday');
  db.classes.find((c) => c.id === 'cl-a').settings.timezone = 'Not/AZone';
  assert.equal(classAnalytics(db, 'cl-a', NOW).timezone, 'Asia/Singapore', 'an invalid zone falls back to Singapore');
});

test('tiles compare with the previous period of the same length', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  add({ at: NOW - 1 * DAY, studentId: 's-01' });
  add({ at: NOW - 2 * DAY, studentId: 's-02' });
  add({ at: NOW - 9 * DAY, studentId: 's-03' }); // previous 7 days
  add({ at: NOW - 20 * DAY, studentId: 's-04' }); // neither
  const week = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  assert.equal(week.participation.attempts, 2);
  assert.deepEqual({ attempts: week.previous.attempts, activeEver: week.previous.activeEver }, { attempts: 1, activeEver: 1 });
  assert.equal(classAnalytics(db, 'cl-a', NOW, { range: 'all' }).previous, null, 'no comparison for all time');
});

test('a running period is compared up to the same point, and partial buckets are marked', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  // NOW is Fri 9 Oct 20:00 in Singapore, so "today" has 4 hours left
  add({ at: NOW - 7 * DAY - 3600000, studentId: 's-01' }); // last Friday 19:00: before the same point
  add({ at: NOW - 7 * DAY + 3600000, studentId: 's-02' }); // last Friday 21:00: after it, left out
  const week = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  assert.equal(week.previous.attempts, 1);
  assert.equal(week.previous.partial, true);
  // only today is partial in a 7-day view
  assert.deepEqual(week.trend.points.map((p) => p.partial), [false, false, false, false, false, false, true]);
  // weeks: the first starts before the period, the last isn't over
  const month = classAnalytics(db, 'cl-a', NOW, { range: '30d' });
  assert.equal(month.trend.points[0].partial, true);
  assert.equal(month.trend.points.at(-1).partial, true);
  assert.ok(month.trend.points.slice(1, -1).every((p) => !p.partial));
  // a finished custom period compares whole periods
  const past = classAnalytics(db, 'cl-a', NOW, { range: 'custom', from: '2026-09-28', to: '2026-10-04' });
  assert.equal(past.previous.partial, false);
  assert.ok(past.trend.points.every((p) => !p.partial));
});

test('topics break down into learning outcomes with question coverage', () => {
  const { db } = setup();
  const data = topic(classAnalytics(db, 'cl-a', NOW, { range: 'all' }), 'tp-data');
  assert.deepEqual(data.outcomes.map((o) => o.outcomeId), ['lo-data-1', 'lo-data-2']);
  // outcome first attempts add up to the topic's
  assert.equal(data.outcomes.reduce((n, o) => n + o.first.n, 0), data.first.n);
  const published = (id) => db.questions.filter((q) => q.outcomeId === id && q.status === 'published').length;
  assert.equal(data.outcomes[0].published, published('lo-data-1'));
  assert.equal(data.outcomes[1].published, published('lo-data-2'));
});

test('slow and mostly-wrong questions are flagged as possibly confusing', () => {
  const { db } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  let n = 0;
  const answer = (questionId, ms, correct) => db.attempts.push({ id: `c${++n}`, sessionId: null, studentId: `s-0${(n % 5) + 1}`, classId: 'cl-a', courseId: 'c-comp', questionId, version: 1, topicId: 'tp-data', type: 'mcq', choice: 0, correct, score: correct ? 1 : 0, ms, timedOut: false, first: true, context: 'practice', at: NOW - n * 1000 });
  for (let i = 0; i < 5; i++) answer('q-d1', 60000, i === 0); // slow, 20% right
  for (let i = 0; i < 5; i++) answer('q-d2', 60000, true); // slow but fine
  for (let i = 0; i < 5; i++) answer('q-d3', 5000, false); // wrong but quick
  for (let i = 0; i < 5; i++) answer('q-d4', 5000, true);
  for (let i = 0; i < 2; i++) answer('q-d5', 90000, false); // too few answers to judge
  const { questions } = classAnalytics(db, 'cl-a', NOW, { range: 'all' }).time;
  const flagged = questions.filter((q) => q.confusing).map((q) => q.questionId);
  assert.deepEqual(flagged, ['q-d1']);
  assert.equal(questions.find((q) => q.questionId === 'q-d1').accuracy.accuracy, 0.2);

  // a slow short-answer question with one marked (wrong) answer and five
  // still waiting: 0% of 1 is not "mostly wrong" yet
  const short = (needsReview) => db.attempts.push({ id: `c${++n}`, sessionId: null, studentId: `s-0${(n % 5) + 1}`, classId: 'cl-a', courseId: 'c-comp', questionId: 'q-x3', version: 1, topicId: 'tp-net', type: 'short', text: 'x', correct: false, score: 0, ms: 90000, timedOut: false, first: true, context: 'practice', at: NOW - n * 1000, needsReview });
  for (let i = 0; i < 6; i++) short(i > 0);
  const x3 = () => classAnalytics(db, 'cl-a', NOW, { range: 'all' }).time.questions.find((q) => q.questionId === 'q-x3');
  assert.equal(x3().n, 6);
  assert.equal(x3().accuracy.n, 1);
  assert.equal(x3().confusing, false, 'not enough marked answers');
  for (const a of db.attempts.filter((a) => a.questionId === 'q-x3')) a.needsReview = false;
  assert.equal(x3().confusing, true, 'flagged once enough are marked');
});

test('participation points (opt-in) name students but carry no student ids', () => {
  const { db } = setup();
  db.classes.find((c) => c.id === 'cl-a').settings.participation = { enabled: true };
  const { points } = classAnalytics(db, 'cl-a', NOW, { range: 'all' });
  assert.ok(points.length > 0);
  for (const p of points) assert.deepEqual(Object.keys(p).sort(), ['name', 'points']);
});

test('question detail: option counts on the current version, no student names', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.questionId !== 'q-n2');
  for (const choice of [0, 0, 0, 1, 2]) add({ questionId: 'q-n2', topicId: 'tp-net', choice, correct: choice === 1 });
  add({ questionId: 'q-n2', topicId: 'tp-net', choice: 3, correct: false, version: 0 }); // an older version
  const d = questionInsights(db, 'cl-a', 'q-n2', NOW, { range: 'all' });
  assert.equal(d.answers.kind, 'options');
  assert.deepEqual(d.answers.options.map((o) => o.count), [3, 1, 1, 0]);
  assert.deepEqual(d.answers.options.map((o) => o.correct), [false, true, false, false]);
  assert.equal(d.olderVersionAnswers, 1);
  assert.ok(d.reports.length >= 1 && !('studentId' in d.reports[0]), 'reports without the reporter');
  assert.ok(!/Student \d|s-0\d/.test(JSON.stringify(d)), 'no student names or ids');
  // multi-select counts every pick; numeric lists common wrong values
  add({ questionId: 'q-x1', topicId: 'tp-net', type: 'multi', choices: [0, 2], correct: true });
  add({ questionId: 'q-x1', topicId: 'tp-net', type: 'multi', choices: [0, 1], correct: false });
  assert.deepEqual(questionInsights(db, 'cl-a', 'q-x1', NOW).answers.options.map((o) => o.count), [2, 1, 1, 0]);
  add({ questionId: 'q-x4', type: 'numeric', value: 11, correct: false });
  add({ questionId: 'q-x4', type: 'numeric', value: 11, correct: false });
  add({ questionId: 'q-x4', type: 'numeric', value: 13, correct: true });
  assert.deepEqual(questionInsights(db, 'cl-a', 'q-x4', NOW).answers.commonWrong, [{ value: 11, count: 2 }]);
  // another course's question is not found
  assert.equal(questionInsights(db, 'cl-a', 'q-st1', NOW), null);
});

test('custom periods: validated, whole local days, daily buckets up to 14 days', () => {
  const get = (q) => (k) => q[k];
  assert.deepEqual(parsePeriod(get({ range: 'custom', from: '2026-10-01', to: '2026-10-07' })), { range: 'custom', from: '2026-10-01', to: '2026-10-07' });
  assert.match(parsePeriod(get({ range: 'custom', from: '2026-10-07', to: '2026-10-01' })).error, /on or before/);
  assert.match(parsePeriod(get({ range: 'custom', from: '2025-01-01', to: '2026-10-01' })).error, /at most/);
  assert.match(parsePeriod(get({ range: 'custom', from: 'yesterday', to: '2026-10-01' })).error, /start and end/);
  assert.match(parsePeriod(get({ range: 'custom', from: '2026-02-30', to: '2026-03-05' })).error, /valid/, '30 February is not a date');
  assert.match(parsePeriod(get({ range: '1y' })).error, /Unknown period/);
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  const sg = (month, day, hour) => Date.UTC(2026, month - 1, day, hour - 8); // Singapore wall clock
  add({ at: sg(10, 1, 0) }); // first hour of 1 Oct: in
  add({ at: sg(10, 7, 23) }); // last hour of 7 Oct: in
  add({ at: sg(10, 8, 0) }); // 8 Oct: after the window
  add({ at: sg(9, 30, 12) }); // 30 Sep: the previous 7 days (24-30 Sep)
  add({ at: sg(9, 23, 12) }); // 23 Sep: before both
  const week = classAnalytics(db, 'cl-a', NOW, { range: 'custom', from: '2026-10-01', to: '2026-10-07' });
  assert.equal(week.participation.attempts, 2);
  assert.equal(week.days, 7);
  assert.equal(week.previous.attempts, 1);
  assert.equal(week.trend.bucket, 'day');
  assert.equal(week.trend.points.length, 7);
  const month = classAnalytics(db, 'cl-a', NOW, { range: 'custom', from: '2026-09-01', to: '2026-10-07' });
  assert.equal(month.trend.bucket, 'week');
});

test('difficulty tags are checked against results', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  for (let i = 0; i < 5; i++) add({ questionId: 'q-d1', correct: i === 0 }); // tagged easy, 20% right
  for (let i = 0; i < 5; i++) add({ questionId: 'q-d6', correct: true }); // tagged hard, 100% right
  for (let i = 0; i < 4; i++) add({ questionId: 'q-d4', correct: false }); // easy, wrong, but too few answers
  // retries come after the explanation: they don't make q-d1 look easier
  for (let i = 0; i < 10; i++) add({ questionId: 'q-d1', correct: true, first: false });
  const { difficulty } = classAnalytics(db, 'cl-a', NOW).quality;
  assert.deepEqual(difficulty.map((d) => [d.questionId, d.verdict]), [['q-d1', 'harder than tagged'], ['q-d6', 'easier than tagged']]);
  assert.equal(questionInsights(db, 'cl-a', 'q-d1', NOW).difficultyVerdict, 'harder than tagged');
});

test('wrong options almost nobody picks are flagged (not true/false)', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  // q-n2: options 0..3, answer 1. In 20 answers, option 2 is picked once (5% is the limit: 1/20 is
  // not under it) and option 3 never.
  for (let i = 0; i < 20; i++) add({ questionId: 'q-n2', topicId: 'tp-net', choice: i < 9 ? 0 : i < 19 ? 1 : 2, correct: i >= 9 && i < 19 });
  // q-n1 has only 19 answers: too few to judge, even with unpicked options
  for (let i = 0; i < 19; i++) add({ questionId: 'q-n1', topicId: 'tp-net', choice: 1, correct: true });
  // q-x2 is true/false: never flagged
  for (let i = 0; i < 20; i++) add({ questionId: 'q-x2', topicId: 'tp-sec', type: 'tf', choice: 0, correct: true });
  const { unusedOptions } = classAnalytics(db, 'cl-a', NOW).quality;
  assert.deepEqual(unusedOptions.map((u) => [u.questionId, u.options.map((o) => o.text)]), [['q-n2', ['Too many switches']]]);
  const detail = questionInsights(db, 'cl-a', 'q-n2', NOW).answers.options;
  assert.deepEqual(detail.map((o) => o.rarelyChosen), [false, false, false, true]);
});

test('when students practise: weekday x 3-hour blocks in local time', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  add({ at: Date.UTC(2026, 9, 8, 17) }); // Fri 01:00 Singapore -> Fri 00:00-03:00
  add({ at: Date.UTC(2026, 9, 5, 11) }); // Mon 19:00 Singapore -> Mon 18:00-21:00
  add({ at: Date.UTC(2026, 9, 5, 12) }); // Mon 20:00 Singapore
  const { counts, blockHours } = classAnalytics(db, 'cl-a', NOW).when;
  assert.equal(blockHours, 3);
  assert.equal(counts[4][0], 1, 'Friday, first block');
  assert.equal(counts[0][6], 2, 'Monday 18:00-21:00');
  assert.equal(counts.flat().reduce((a, b) => a + b, 0), 3);
});

test('practice and World accuracy are compared per topic', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  add({ context: 'practice', correct: true });
  add({ context: 'practice', correct: false });
  add({ context: 'world', correct: true });
  add({ context: 'world', correct: true, needsReview: true }); // not confirmed: left out
  const c = classAnalytics(db, 'cl-a', NOW).contexts;
  assert.deepEqual([c.practice.n, c.practice.accuracy, c.world.n, c.world.accuracy], [2, 0.5, 1, 1]);
  assert.equal(c.byTopic.find((t) => t.topicId === 'tp-data').world.n, 1);
});

test('classes of one course are compared side by side', () => {
  const { db } = setup();
  // the demo seed has a second Computing group (C) for the same professor
  const rows = courseComparison(db, ['cl-a', 'cl-c'], NOW, { range: 'all' });
  assert.deepEqual(rows.map((r) => [r.classId, r.enrolled]), [['cl-a', 6], ['cl-c', 4]]);
  const own = (id) => db.attempts.filter((a) => a.classId === id).length;
  assert.deepEqual(rows.map((r) => r.attempts), [own('cl-a'), own('cl-c')]);
  assert.equal(rows[1].activeEver, 3, 'Student 12 has not practised yet');
  assert.ok(!/Student \d|s-\d\d/.test(JSON.stringify(rows)), 'no student names or ids');
});

test('review fixes: local 7 days, all-time trend cap, full commonly-missed list, big classes', () => {
  const { db, add } = setup();
  db.attempts = db.attempts.filter((a) => a.classId !== 'cl-a');
  // "active in the last 7 days" = the same 7 local days as the 7-day period:
  // Sat 3 Oct 08:00 Singapore is inside (today is Fri 9 Oct), Fri 2 Oct 23:00 is not
  add({ studentId: 's-02', at: Date.UTC(2026, 9, 3, 0) });
  add({ studentId: 's-03', at: Date.UTC(2026, 9, 2, 15) });
  const a = classAnalytics(db, 'cl-a', NOW, { range: '7d' });
  assert.equal(a.participation.active7d, a.participation.activeEver);
  assert.equal(a.participation.active7d, 1);
  // all time charts at most 12 weeks, and says so
  add({ at: NOW - 200 * DAY });
  const all = classAnalytics(db, 'cl-a', NOW, { range: 'all' });
  assert.equal(all.trend.capped, true);
  assert.equal(all.trend.points.length, all.trend.maxWeeks);
  assert.equal(all.participation.attempts, 3, 'tiles still count everything');
  // commonly missed lists every question with enough first attempts (the page paginates)
  const full = setup().db;
  const missed = classAnalytics(full, 'cl-a', NOW, { range: 'all' }).commonlyMissed;
  assert.ok(missed.length > 5);
  for (let i = 1; i < missed.length; i++) assert.ok(missed[i - 1].first.accuracy <= missed[i].first.accuracy, 'lowest accuracy first');
  // a big class: 200,000 answers over a year must not overflow the call stack
  const big = setup().db;
  const base = big.attempts.find((x) => x.classId === 'cl-a');
  for (let i = 0; i < 200000; i++) big.attempts.push({ ...base, id: `big${i}`, at: NOW - 365 * DAY + i * 150000 });
  assert.doesNotThrow(() => classAnalytics(big, 'cl-a', NOW, { range: 'all' }));
});

test('the analytics route checks the period and the professor', async () => {
  const srv = start(0, { dataFile: null });
  await new Promise((r) => srv.httpServer.once('listening', r));
  const base = 'http://localhost:' + srv.httpServer.address().port;
  const call = async (token, path) => {
    const res = await fetch(base + path, { headers: token ? { authorization: 'Bearer ' + token } : {} });
    return { status: res.status, body: await res.json() };
  };
  const login = async (userId) => (await (await fetch(base + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) })).json()).token;
  try {
    const prof = await login('t-a');
    const ok = await call(prof, '/api/teacher/classes/cl-a/analytics?range=7d');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.range, '7d');
    assert.equal((await call(prof, '/api/teacher/classes/cl-a/analytics?range=1y')).status, 400);
    assert.equal((await call(await login('t-b'), '/api/teacher/classes/cl-a/analytics?range=7d')).status, 404);
    assert.equal((await call(await login('s-01'), '/api/teacher/classes/cl-a/analytics')).status, 403);
    // question detail: own class only, own course's questions only
    assert.equal((await call(prof, '/api/teacher/classes/cl-a/questions/q-n2/insights?range=30d')).status, 200);
    assert.equal((await call(prof, '/api/teacher/classes/cl-a/questions/q-st1/insights')).status, 404);
    assert.equal((await call(await login('t-b'), '/api/teacher/classes/cl-a/questions/q-n2/insights')).status, 404);
    // time zone setting: validated before anything changes
    const put = (body) => fetch(base + '/api/teacher/classes/cl-a/settings', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + prof }, body: JSON.stringify(body) });
    assert.equal((await put({ timezone: 'Mars/Olympus', tradingEnabled: false })).status, 400);
    assert.equal(srv.quiz.db.classes.find((c) => c.id === 'cl-a').settings.tradingEnabled, true, 'nothing changed');
    assert.equal((await put({ timezone: 'Europe/London' })).status, 200);
    assert.equal((await call(prof, '/api/teacher/classes/cl-a/analytics')).body.timezone, 'Europe/London');
    // custom dates through the API, and their validation
    assert.equal((await call(prof, '/api/teacher/classes/cl-a/analytics?range=custom&from=2026-10-01&to=2026-10-07')).status, 200);
    assert.equal((await call(prof, '/api/teacher/classes/cl-a/analytics?range=custom&from=2026-10-07&to=2026-10-01')).status, 400);
    // class comparison: own course only
    assert.equal((await call(prof, '/api/teacher/courses/c-comp/compare?range=30d')).status, 200);
    assert.equal((await call(await login('t-b'), '/api/teacher/courses/c-comp/compare')).status, 404);
    // cached between changes: an answer slipped into memory without a save
    // is not seen, the next real change (any save) refreshes the numbers
    const url = '/api/teacher/classes/cl-a/analytics?range=all';
    const before = (await call(prof, url)).body.participation.attempts;
    const compared = async () => (await call(prof, '/api/teacher/courses/c-comp/compare?range=all')).body.find((r) => r.classId === 'cl-a').attempts;
    const comparedBefore = await compared();
    srv.quiz.db.attempts.push({ id: 'at-cache', sessionId: null, studentId: 's-01', classId: 'cl-a', courseId: 'c-comp', questionId: 'q-d1', version: 1, topicId: 'tp-data', type: 'mcq', choice: 1, correct: true, score: 1, ms: 1000, timedOut: false, first: true, context: 'practice', at: Date.now() });
    assert.equal((await call(prof, url)).body.participation.attempts, before, 'served from the cache');
    assert.equal(await compared(), comparedBefore, 'class comparison served from the cache too');
    // a change the dashboard doesn't show (a student equipping an item) keeps the cache
    const student = await login('s-01');
    const equip = await fetch(base + '/api/student/equip', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + student }, body: JSON.stringify({ itemId: null }) });
    assert.equal(equip.status, 200);
    assert.equal((await call(prof, url)).body.participation.attempts, before, 'still served from the cache');
    assert.equal((await put({ timezone: 'Asia/Singapore' })).status, 200);
    assert.equal((await call(prof, url)).body.participation.attempts, before + 1, 'refreshed after a change');
    assert.equal(await compared(), comparedBefore + 1, 'comparison refreshed too');
  } finally {
    srv.io.close();
  }
});
