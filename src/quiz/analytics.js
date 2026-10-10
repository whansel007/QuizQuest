// ============================================================
// Professor analytics for ONE class
// ------------------------------------------------------------
// Every rate comes with its denominator, and first attempts are kept
// separate from retries (a retry right after seeing the explanation
// says less about understanding). Low accuracy is a prompt to
// investigate - student difficulty, an ambiguous question, or a gap in
// teaching - never an automatic grade or label. Nothing here names or
// ranks individual students (opt-in participation points aside).
//
// Short answers still waiting for the professor's mark are left out of
// every accuracy figure (their automatic mark is only provisional) and
// counted separately as "awaiting marking".
//
// A period (last 7 / 30 days, all time, or custom dates) scopes
// everything. Days and weeks follow the class's time zone (default
// Singapore), so an answer at 7am on Tuesday counts on Tuesday.
// ============================================================

const { TYPE_LABELS } = require('./formats');
const { DAY, DEFAULT_TZ, isValidTimeZone, localDate, instantOf, mondayOf, weekdayHour } = require('./time');

const RANGES = { '7d': 7, '30d': 30, all: null, custom: null };
const MAX_CUSTOM_DAYS = 366;
const MIN_N = 3; // first attempts before a question can be "commonly missed"
const LOW_N = 5; // trend points / per-question figures from fewer answers are flagged
const MAX_WEEKS = 12; // all-time trend shows at most this many recent weeks
const DAILY_BUCKETS_UP_TO = 14; // periods up to this many days chart per day, longer per week
const DIFFICULTIES = ['easy', 'medium', 'hard'];
// "Possibly confusing": slow (top quarter of question times) AND mostly wrong
const CONFUSING = { slowQuantile: 0.75, maxAccuracy: 0.5 };
// Difficulty tag vs results: easy should mostly be right, hard mostly not
const DIFFICULTY_CHECK = { minN: 5, easyBelow: 0.5, hardAbove: 0.85 };
// A wrong option almost nobody picks isn't working as a distractor
const UNUSED = { minAnswers: 20, maxShare: 0.05 }; // with fewer answers, an unpicked option is often chance
const BLOCK_HOURS = 3; // "when students practise": 8 blocks of 3 hours

function quantile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function rate(list) {
  const correct = list.filter((a) => a.correct).length;
  return { n: list.length, correct, accuracy: list.length ? correct / list.length : null };
}
const group = (list, key) => Map.groupBy(list, key);
const currentVersion = (q) => q.versions.find((x) => x.v === q.publishedVersion) || q.versions.at(-1);

// ---------------- the period ----------------
// parsePeriod(query) -> { range, from, to } or { error }
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// a real calendar date: Date.parse would roll 2026-02-30 over to 2 March
const isDate = (d) => DATE_RE.test(d || '') && !Number.isNaN(Date.parse(d)) && new Date(Date.parse(d)).toISOString().slice(0, 10) === d;
function parsePeriod(get) {
  const range = get('range') || 'all';
  if (!Object.hasOwn(RANGES, range)) return { error: 'Unknown period.' };
  if (range !== 'custom') return { range };
  const from = get('from');
  const to = get('to');
  if (!isDate(from) || !isDate(to)) return { error: 'Pick a valid start and end date.' };
  const days = (Date.parse(to) - Date.parse(from)) / DAY + 1;
  if (days < 1) return { error: 'The start date must be on or before the end date.' };
  if (days > MAX_CUSTOM_DAYS) return { error: `Pick at most ${MAX_CUSTOM_DAYS} days.` };
  return { range, from, to };
}

function context(db, classId, now, period) {
  const cls = db.classes.find((c) => c.id === classId);
  const tz = isValidTimeZone(cls.settings.timezone) ? cls.settings.timezone : DEFAULT_TZ;
  const topics = db.topics.filter((t) => t.courseId === cls.courseId);
  const enrolled = db.enrolments.filter((e) => e.classId === classId).map((e) => e.studentId);
  const today = localDate(now, tz);
  const last7 = instantOf(today - 6 * DAY, tz); // today and the 6 days before it
  // windows are whole local days: "last 7 days" = today and the 6 days before it
  let since = -Infinity;
  let until = Infinity;
  let days = null;
  if (period.range === 'custom') {
    const first = Date.parse(period.from);
    const last = Date.parse(period.to);
    days = (last - first) / DAY + 1;
    since = instantOf(first, tz);
    until = instantOf(last + DAY, tz);
  } else if (RANGES[period.range]) {
    days = RANGES[period.range];
    since = instantOf(today - (days - 1) * DAY, tz);
  }
  // the window of the same length just before, for "vs previous" changes.
  // While the period is still running (it includes now), the previous one is
  // cut at the same point: Thursday 9am is compared with last Thursday 9am,
  // not with a whole day the current period hasn't had yet.
  let prev = null;
  if (days !== null) {
    const prevSince = instantOf(localDate(since, tz) - days * DAY, tz);
    const running = now < until;
    prev = { since: prevSince, until: running ? Math.min(since, prevSince + (now - since)) : since, partial: running };
  }
  const enrolledSet = new Set(enrolled);
  const classAttempts = db.attempts.filter((a) => a.classId === classId && enrolledSet.has(a.studentId));
  return {
    cls, tz, topics, enrolled, since, until, days, prev, last7, classAttempts,
    attempts: classAttempts.filter((a) => a.at >= since && a.at < until),
    bucket: days !== null && days <= DAILY_BUCKETS_UP_TO ? 'day' : 'week',
  };
}

// ---------------- pieces ----------------

// Accuracy per topic and activity, bucketed by day or week
function trend(classAttempts, topics, { range, since, until, now, tz, bucket }) {
  const step = bucket === 'day' ? 1 : 7;
  const align = bucket === 'day' ? (d) => d : mondayOf;
  const last = align(localDate(Math.min(now, until - 1), tz));
  let earliest = now;
  if (range === 'all') for (const a of classAttempts) if (a.at < earliest) earliest = a.at;
  let first = align(localDate(range === 'all' ? earliest : since, tz));
  // all time: at most the last MAX_WEEKS weeks are charted (tiles/tables still cover everything)
  const capped = range === 'all' && first < last - (MAX_WEEKS - 1) * 7 * DAY;
  if (capped) first = last - (MAX_WEEKS - 1) * 7 * DAY;
  const points = [];
  for (let date = first; date <= last; date += step * DAY) {
    const start = instantOf(date, tz);
    const end = instantOf(date + step * DAY, tz);
    const list = classAttempts.filter((a) => a.at >= start && a.at < end && a.at >= since && a.at < until);
    const confirmed = list.filter((a) => !a.needsReview);
    const byTopic = group(confirmed, (a) => a.topicId);
    points.push({
      start,
      // only part of this day/week counts: it began before the period, or
      // hasn't finished yet (today, this week), so its count looks low
      partial: start < since || end > Math.min(until, now),
      answers: list.length,
      students: new Set(list.map((a) => a.studentId)).size,
      topics: Object.fromEntries(topics.map((t) => [t.id, rate(byTopic.get(t.id) || [])])),
    });
  }
  return { bucket, lowN: LOW_N, capped, maxWeeks: MAX_WEEKS, topics: topics.map((t) => ({ id: t.id, name: t.name })), points };
}

// Every live question should carry a topic, a learning outcome from that
// topic, and a difficulty. Rejected questions are ignored.
function tagCheck(courseQs, topics) {
  const issues = [];
  const qs = courseQs.filter((q) => q.status !== 'rejected');
  for (const q of qs) {
    const v = q.versions.at(-1);
    const topic = topics.find((t) => t.id === q.topicId);
    const missing = [];
    if (!topic) missing.push('topic');
    if (!topic || !topic.outcomes.some((o) => o.id === q.outcomeId)) missing.push('learning outcome');
    if (!DIFFICULTIES.includes(v.difficulty)) missing.push('difficulty');
    if (missing.length) issues.push({ questionId: q.id, stem: v.stem, status: q.status, missing });
  }
  return { total: qs.length, complete: qs.length - issues.length, issues };
}

// Average time per answer: each student counts once (the average of their
// own times), so one student answering many times can't skew it.
// Timed-out answers have no answering time. Class-level figures only.
function timing(list) {
  const timed = list.filter((a) => !a.timedOut && Number.isFinite(a.ms));
  const perStudent = [...group(timed, (a) => a.studentId).values()].map((mine) => mean(mine.map((a) => a.ms)));
  return { n: timed.length, students: perStudent.length, meanMs: mean(perStudent), medianMs: quantile(timed.map((a) => a.ms).sort((x, y) => x - y), 0.5) };
}

// Time and accuracy per question, with the "possibly confusing" flag:
// slower than most questions AND mostly answered wrongly, on enough answers.
function timeByQuestion(questionsById, byQuestion, topics) {
  const out = [];
  for (const [qid, list] of byQuestion) {
    const q = questionsById.get(qid);
    if (!q) continue;
    const t = timing(list);
    if (!t.n) continue;
    const v = currentVersion(q);
    out.push({
      questionId: qid, stem: v.stem, type: TYPE_LABELS[v.type || 'mcq'], topic: topics.find((x) => x.id === q.topicId)?.name,
      ...t, accuracy: rate(list.filter((a) => !a.needsReview)),
    });
  }
  const enough = out.filter((q) => q.n >= LOW_N);
  const slowMs = quantile(enough.map((q) => q.meanMs).sort((x, y) => x - y), CONFUSING.slowQuantile);
  // "mostly wrong" needs enough MARKED answers: unmarked short answers count
  // towards the time but not the accuracy
  for (const q of out) {
    q.confusing = Boolean(slowMs !== null && q.n >= LOW_N && q.meanMs >= slowMs && q.accuracy.n >= LOW_N && q.accuracy.accuracy < CONFUSING.maxAccuracy);
  }
  return { questions: out.sort((a, b) => b.meanMs - a.meanMs), slowMs, maxAccuracy: CONFUSING.maxAccuracy, minN: LOW_N };
}

// How often each option of a fixed-option question was picked, current
// version only (options may have changed between versions)
function optionCounts(v, list) {
  const type = v.type || 'mcq';
  if (!['mcq', 'tf', 'multi'].includes(type)) return null;
  const current = list.filter((a) => a.version === v.v && !a.timedOut);
  const counts = v.options.map(() => 0);
  for (const a of current) {
    for (const i of type === 'multi' ? a.choices || [] : [a.choice]) if (Number.isInteger(i) && i >= 0 && i < counts.length) counts[i]++;
  }
  const correct = new Set(type === 'multi' ? v.answerIndexes : [v.answerIndex]);
  return { answered: current.length, multi: type === 'multi', options: v.options.map((text, i) => ({ text, count: counts[i], correct: correct.has(i) })) };
}
// wrong options picked by almost nobody, once there are enough answers
const rarelyChosen = (oc) => (oc && oc.answered >= UNUSED.minAnswers ? oc.options.filter((o) => !o.correct && o.count / oc.answered < UNUSED.maxShare) : []);

// Question quality beyond tags: difficulty tag vs results, unused options
function quality(courseQs, byQuestion, topics) {
  const difficulty = [];
  const unusedOptions = [];
  for (const q of courseQs) {
    const list = byQuestion.get(q.id);
    if (!list) continue;
    const v = currentVersion(q);
    // first attempts only: a retry right after the explanation says little about difficulty
    const r = rate(list.filter((a) => !a.needsReview && a.first));
    const meta = { questionId: q.id, stem: v.stem, type: TYPE_LABELS[v.type || 'mcq'], topic: topics.find((t) => t.id === q.topicId)?.name };
    if (r.n >= DIFFICULTY_CHECK.minN) {
      if (v.difficulty === 'easy' && r.accuracy < DIFFICULTY_CHECK.easyBelow) difficulty.push({ ...meta, tagged: 'easy', accuracy: r, verdict: 'harder than tagged' });
      if (v.difficulty === 'hard' && r.accuracy > DIFFICULTY_CHECK.hardAbove) difficulty.push({ ...meta, tagged: 'hard', accuracy: r, verdict: 'easier than tagged' });
    }
    if (v.type !== 'tf') {
      const oc = optionCounts(v, list);
      const rare = rarelyChosen(oc);
      if (rare.length) unusedOptions.push({ ...meta, answered: oc.answered, options: rare.map((o) => ({ text: o.text, count: o.count })) });
    }
  }
  return { difficulty, unusedOptions, difficultyCheck: DIFFICULTY_CHECK, unused: UNUSED };
}

// When the class practises: answers per weekday x 3-hour block, local time
function whenPractised(attempts, tz) {
  const counts = Array.from({ length: 7 }, () => Array(24 / BLOCK_HOURS).fill(0));
  for (const a of attempts) {
    const { weekday, hour } = weekdayHour(a.at, tz);
    counts[weekday][Math.floor(hour / BLOCK_HOURS)]++;
  }
  return { blockHours: BLOCK_HOURS, counts };
}

// Practice sessions vs the multiplayer World, overall and per topic
function contexts(confirmed, topics) {
  const split = (list) => ({ practice: rate(list.filter((a) => a.context !== 'world')), world: rate(list.filter((a) => a.context === 'world')) });
  const byTopic = group(confirmed, (a) => a.topicId);
  return { ...split(confirmed), byTopic: topics.map((t) => ({ topicId: t.id, name: t.name, ...split(byTopic.get(t.id) || []) })) };
}

// Who answered, how many sessions and answers - for the tiles
function activity(attempts, sessions, from, to) {
  const inWindow = attempts.filter((a) => a.at >= from && a.at < to);
  return {
    activeEver: new Set(inWindow.map((a) => a.studentId)).size,
    sessionsCompleted: sessions.filter((s) => s.completedAt && s.completedAt >= from && s.completedAt < to).length,
    attempts: inWindow.length,
  };
}

// ---------------- the dashboard ----------------

function classAnalytics(db, classId, now = Date.now(), period = { range: 'all' }) {
  const ctx = context(db, classId, now, period);
  const { cls, tz, topics, enrolled, since, until, prev, last7, classAttempts, attempts } = ctx;
  const confirmed = attempts.filter((a) => !a.needsReview);
  const sessions = db.sessions.filter((s) => s.classId === classId);
  const courseQs = db.questions.filter((x) => x.courseId === cls.courseId);
  const questionsById = new Map(courseQs.map((q) => [q.id, q]));
  const outcomeOf = new Map(courseQs.map((q) => [q.id, q.outcomeId]));
  // group once, look up many times (this runs on every auto-refresh)
  const byQuestion = group(attempts, (a) => a.questionId);
  const confirmedByQuestion = group(confirmed, (a) => a.questionId);
  const byTopic = group(attempts, (a) => a.topicId);

  const participation = {
    enrolled: enrolled.length,
    ...activity(attempts, sessions, since, until),
    active7d: new Set(classAttempts.filter((a) => a.at >= last7).map((a) => a.studentId)).size,
    worldAttempts: attempts.filter((a) => a.context === 'world').length,
    awaitingMarking: attempts.length - confirmed.length,
    allTimeAttempts: classAttempts.length,
  };
  // partial: both sides stop at the same point of the period (it is still running)
  const previous = prev && { ...activity(classAttempts, sessions, prev.since, prev.until), partial: prev.partial };

  const topicRows = topics.map((t) => {
    const all = byTopic.get(t.id) || [];
    const list = all.filter((a) => !a.needsReview);
    const answered = all.filter((a) => !a.timedOut).map((a) => a.ms).sort((x, y) => x - y);
    const byOutcome = group(all, (a) => outcomeOf.get(a.questionId));
    return {
      topicId: t.id,
      name: t.name,
      first: rate(list.filter((a) => a.first)),
      retry: rate(list.filter((a) => !a.first)),
      all: rate(list),
      awaitingMarking: all.length - list.length,
      students: new Set(all.map((a) => a.studentId)).size,
      medianMs: quantile(answered, 0.5),
      p75Ms: quantile(answered, 0.75),
      timeouts: all.filter((a) => a.timedOut).length,
      // learning outcomes inside the topic, with how many questions cover each
      outcomes: t.outcomes.map((o) => {
        const mineAll = byOutcome.get(o.id) || [];
        const mine = mineAll.filter((a) => !a.needsReview);
        return {
          outcomeId: o.id,
          text: o.text,
          first: rate(mine.filter((a) => a.first)),
          retry: rate(mine.filter((a) => !a.first)),
          awaitingMarking: mineAll.length - mine.length,
          published: courseQs.filter((q) => q.outcomeId === o.id && q.status === 'published').length,
        };
      }),
    };
  });

  // Per-question view: commonly missed (enough first attempts to mean something)
  const qStats = [];
  for (const q of courseQs) {
    const list = confirmedByQuestion.get(q.id);
    if (!list) continue;
    const v = currentVersion(q);
    // Most popular wrong option often reveals a misconception or an
    // ambiguous distractor. Only meaningful for fixed-option questions,
    // counted on the CURRENT version since options may have changed.
    let topWrong = null;
    if (v.type === 'mcq' || v.type === 'tf' || v.type === undefined) {
      const counts = {};
      for (const a of list) if (!a.correct && Number.isInteger(a.choice) && a.version === v.v) counts[a.choice] = (counts[a.choice] || 0) + 1;
      const top = Object.entries(counts).sort((x, y) => y[1] - x[1])[0];
      if (top) topWrong = { option: v.options[Number(top[0])], count: top[1] };
    }
    qStats.push({
      questionId: q.id,
      stem: v.stem,
      type: TYPE_LABELS[v.type || 'mcq'],
      topic: topics.find((t) => t.id === q.topicId)?.name,
      status: q.status,
      versionsAttempted: [...new Set(list.map((a) => a.version))].sort((x, y) => x - y),
      first: rate(list.filter((a) => a.first)),
      retry: rate(list.filter((a) => !a.first)),
      topWrong,
      openReports: q.reports.filter((r) => !r.resolved).length,
    });
  }
  // lowest first-attempt accuracy first; ties: more evidence first
  const commonlyMissed = qStats
    .filter((s) => s.first.n >= MIN_N)
    .sort((a, b) => a.first.accuracy - b.first.accuracy || b.first.n - a.first.n);

  // Opt-in only: per-student participation points
  let points = null;
  if (cls.settings.participation?.enabled) {
    points = enrolled.map((sid) => ({
      name: db.users.find((u) => u.id === sid).name,
      points: db.participation.filter((p) => p.classId === classId && p.studentId === sid).length,
    }));
  }

  return {
    class: { id: cls.id, name: cls.name, settings: cls.settings },
    range: period.range,
    from: period.from || null,
    to: period.to || null,
    days: ctx.days,
    timezone: tz,
    participation,
    previous,
    byTopic: topicRows,
    commonlyMissed,
    minN: MIN_N,
    trend: trend(classAttempts, topics, { range: period.range, since, until, now, tz, bucket: ctx.bucket }),
    tags: tagCheck(courseQs, topics),
    quality: quality(courseQs, byQuestion, topics),
    time: timeByQuestion(questionsById, byQuestion, topics),
    when: whenPractised(attempts, tz),
    contexts: contexts(confirmed, topics),
    openReports: courseQs.reduce((n, q) => n + q.reports.filter((r) => !r.resolved).length, 0),
    points,
  };
}

// ---------------- several classes of one course, side by side ----------------
function courseComparison(db, classIds, now = Date.now(), period = { range: 'all' }) {
  return classIds.map((id) => {
    const { cls, topics, enrolled, since, until, attempts } = context(db, id, now, period);
    const confirmed = attempts.filter((a) => !a.needsReview);
    const byTopic = group(confirmed, (a) => a.topicId);
    return {
      classId: cls.id,
      name: cls.name,
      enrolled: enrolled.length,
      ...activity(attempts, db.sessions.filter((s) => s.classId === id), since, until),
      accuracy: rate(confirmed),
      topics: topics.map((t) => ({ topicId: t.id, name: t.name, accuracy: rate(byTopic.get(t.id) || []) })),
    };
  });
}

// ---------------- one question in detail ----------------
// How the class answered one question in the period: option choices,
// first vs retry accuracy, time, and reports (without reporter names).
function questionInsights(db, classId, questionId, now = Date.now(), period = { range: 'all' }) {
  const { cls, topics, attempts: inRange } = context(db, classId, now, period);
  const q = db.questions.find((x) => x.id === questionId && x.courseId === cls.courseId);
  if (!q) return null;
  const v = currentVersion(q);
  const type = v.type || 'mcq';
  const topic = topics.find((t) => t.id === q.topicId);
  const all = inRange.filter((a) => a.questionId === q.id);
  const confirmed = all.filter((a) => !a.needsReview);
  const current = all.filter((a) => a.version === v.v && !a.timedOut);

  let answers;
  const oc = optionCounts(v, all);
  if (oc) {
    const rare = new Set(rarelyChosen(oc).map((o) => o.text));
    answers = { kind: 'options', ...oc, options: oc.options.map((o) => ({ ...o, rarelyChosen: type !== 'tf' && rare.has(o.text) })), unused: UNUSED };
  } else if (type === 'numeric') {
    const wrong = new Map();
    for (const a of current) if (!a.correct && Number.isFinite(a.value)) wrong.set(a.value, (wrong.get(a.value) || 0) + 1);
    answers = {
      kind: 'numeric', answered: current.length, answer: v.answer, tolerance: v.tolerance, unit: v.unit || '',
      commonWrong: [...wrong].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([value, count]) => ({ value, count })),
    };
  } else if (type === 'short') {
    answers = {
      kind: 'keyPoints', answered: current.length,
      keyPoints: (v.keyPoints || []).map((text, i) => ({ text, covered: current.filter((a) => (a.coveredPoints || []).includes(i)).length })),
    };
  } else {
    answers = { kind: 'varies', answered: current.length }; // maths templates: options differ per student
  }

  const r = rate(confirmed.filter((a) => a.first));
  let difficultyVerdict = null;
  if (r.n >= DIFFICULTY_CHECK.minN) {
    if (v.difficulty === 'easy' && r.accuracy < DIFFICULTY_CHECK.easyBelow) difficultyVerdict = 'harder than tagged';
    if (v.difficulty === 'hard' && r.accuracy > DIFFICULTY_CHECK.hardAbove) difficultyVerdict = 'easier than tagged';
  }

  return {
    questionId: q.id,
    stem: v.stem,
    type: TYPE_LABELS[type],
    topic: topic?.name || null,
    outcome: topic?.outcomes.find((o) => o.id === q.outcomeId)?.text || null,
    difficulty: v.difficulty || null,
    difficultyVerdict,
    status: q.status,
    version: v.v,
    olderVersionAnswers: all.filter((a) => a.version !== v.v).length,
    first: rate(confirmed.filter((a) => a.first)),
    retry: rate(confirmed.filter((a) => !a.first)),
    awaitingMarking: all.length - confirmed.length,
    timeouts: all.filter((a) => a.timedOut).length,
    time: timing(all),
    answers,
    explanation: v.explanation || '',
    reports: q.reports.map((x) => ({ reason: x.reason, at: x.at, resolved: x.resolved })).reverse(),
    range: period.range,
  };
}

module.exports = { classAnalytics, courseComparison, questionInsights, parsePeriod, isValidTimeZone, RANGES, DEFAULT_TZ };
