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
// A period filter (last 7 days / 30 days / all time) scopes everything.
// Days and weeks follow the class's time zone (default Singapore), so an
// answer at 7am on Tuesday counts on Tuesday.
// ============================================================

const { TYPE_LABELS } = require('./formats');
const { DAY, DEFAULT_TZ, isValidTimeZone, localDate, instantOf, mondayOf } = require('./time');

const RANGES = { '7d': 7, '30d': 30, all: null };
const MIN_N = 3; // first attempts before a question can be "commonly missed"
const LOW_N = 5; // trend points / per-question figures from fewer answers are flagged
const MAX_WEEKS = 12; // all-time trend shows at most this many recent weeks
const DIFFICULTIES = ['easy', 'medium', 'hard'];
// "Possibly confusing": slow (top quarter of question times) AND mostly wrong
const CONFUSING = { slowQuantile: 0.75, maxAccuracy: 0.5 };

function quantile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function rate(list) {
  const correct = list.filter((a) => a.correct).length;
  return { n: list.length, correct, accuracy: list.length ? correct / list.length : null };
}

// ---------------- pieces ----------------

// Accuracy per topic and activity, bucketed by day (7-day view) or week
function trend(attempts, topics, { range, since, now, tz }) {
  const bucket = range === '7d' ? 'day' : 'week';
  const step = bucket === 'day' ? 1 : 7;
  const align = bucket === 'day' ? (d) => d : mondayOf;
  const last = align(localDate(now, tz));
  let first = align(localDate(range === 'all' ? Math.min(now, ...attempts.map((a) => a.at)) : since, tz));
  if (range === 'all') first = Math.max(first, last - (MAX_WEEKS - 1) * 7 * DAY);
  const points = [];
  for (let date = first; date <= last; date += step * DAY) {
    const start = instantOf(date, tz);
    const end = instantOf(date + step * DAY, tz);
    const list = attempts.filter((a) => a.at >= start && a.at < end && a.at >= since);
    const confirmed = list.filter((a) => !a.needsReview);
    points.push({
      start,
      answers: list.length,
      students: new Set(list.map((a) => a.studentId)).size,
      topics: Object.fromEntries(topics.map((t) => [t.id, rate(confirmed.filter((a) => a.topicId === t.id))])),
    });
  }
  return { bucket, lowN: LOW_N, topics: topics.map((t) => ({ id: t.id, name: t.name })), points };
}

// Every live question should carry a topic, a learning outcome from that
// topic, and a difficulty. Rejected questions are ignored.
function tagCheck(db, courseId, topics) {
  const issues = [];
  const qs = db.questions.filter((q) => q.courseId === courseId && q.status !== 'rejected');
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
  const perStudent = [...Map.groupBy(timed, (a) => a.studentId).values()].map((mine) => mean(mine.map((a) => a.ms)));
  return { n: timed.length, students: perStudent.length, meanMs: mean(perStudent), medianMs: quantile(timed.map((a) => a.ms).sort((x, y) => x - y), 0.5) };
}

const currentVersion = (q) => q.versions.find((x) => x.v === q.publishedVersion) || q.versions.at(-1);

// Time and accuracy per question, with the "possibly confusing" flag:
// slower than most questions AND mostly answered wrongly, on enough answers.
function timeByQuestion(db, attempts, topics) {
  const out = [];
  for (const [qid, list] of Map.groupBy(attempts, (a) => a.questionId)) {
    const q = db.questions.find((x) => x.id === qid);
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
  for (const q of out) {
    q.confusing = Boolean(slowMs !== null && q.n >= LOW_N && q.meanMs >= slowMs && q.accuracy.n && q.accuracy.accuracy < CONFUSING.maxAccuracy);
  }
  return { questions: out.sort((a, b) => b.meanMs - a.meanMs), slowMs, maxAccuracy: CONFUSING.maxAccuracy, minN: LOW_N };
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

function context(db, classId, now, range) {
  const cls = db.classes.find((c) => c.id === classId);
  const tz = isValidTimeZone(cls.settings.timezone) ? cls.settings.timezone : DEFAULT_TZ;
  const topics = db.topics.filter((t) => t.courseId === cls.courseId);
  const enrolled = db.enrolments.filter((e) => e.classId === classId).map((e) => e.studentId);
  const days = RANGES[range];
  // whole local days: "last 7 days" = today and the 6 days before it
  const today = localDate(now, tz);
  const since = days ? instantOf(today - (days - 1) * DAY, tz) : -Infinity;
  const prevSince = days ? instantOf(today - (2 * days - 1) * DAY, tz) : null;
  const classAttempts = db.attempts.filter((a) => a.classId === classId && enrolled.includes(a.studentId));
  return { cls, tz, topics, enrolled, since, prevSince, classAttempts, attempts: classAttempts.filter((a) => a.at >= since) };
}

// ---------------- the dashboard ----------------

function classAnalytics(db, classId, now = Date.now(), { range = 'all' } = {}) {
  const { cls, tz, topics, enrolled, since, prevSince, classAttempts, attempts } = context(db, classId, now, range);
  const confirmed = attempts.filter((a) => !a.needsReview);
  const sessions = db.sessions.filter((s) => s.classId === classId);
  const courseQs = db.questions.filter((x) => x.courseId === cls.courseId);
  const outcomeOf = new Map(courseQs.map((q) => [q.id, q.outcomeId]));

  const participation = {
    enrolled: enrolled.length,
    ...activity(attempts, sessions, since, Infinity),
    active7d: new Set(classAttempts.filter((a) => a.at > now - 7 * DAY).map((a) => a.studentId)).size,
    worldAttempts: attempts.filter((a) => a.context === 'world').length,
    awaitingMarking: attempts.length - confirmed.length,
  };
  // the same window just before this one, for "vs previous" changes
  const previous = prevSince === null ? null : activity(classAttempts, sessions, prevSince, since);

  const byTopic = topics.map((t) => {
    const all = attempts.filter((a) => a.topicId === t.id);
    const list = all.filter((a) => !a.needsReview);
    const answered = all.filter((a) => !a.timedOut).map((a) => a.ms).sort((x, y) => x - y);
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
        const mine = list.filter((a) => outcomeOf.get(a.questionId) === o.id);
        return {
          outcomeId: o.id,
          text: o.text,
          first: rate(mine.filter((a) => a.first)),
          retry: rate(mine.filter((a) => !a.first)),
          awaitingMarking: all.filter((a) => a.needsReview && outcomeOf.get(a.questionId) === o.id).length,
          published: courseQs.filter((q) => q.outcomeId === o.id && q.status === 'published').length,
        };
      }),
    };
  });

  // Per-question view: commonly missed (enough first attempts to mean something)
  const qStats = [];
  for (const q of courseQs) {
    const list = confirmed.filter((a) => a.questionId === q.id);
    if (!list.length) continue;
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
      versionsAttempted: [...new Set(list.map((a) => a.version))].sort(),
      first: rate(list.filter((a) => a.first)),
      retry: rate(list.filter((a) => !a.first)),
      topWrong,
      openReports: q.reports.filter((r) => !r.resolved).length,
    });
  }
  const commonlyMissed = qStats
    .filter((s) => s.first.n >= MIN_N)
    .sort((a, b) => a.first.accuracy - b.first.accuracy)
    .slice(0, 5);

  // Opt-in only: per-student participation points
  let points = null;
  if (cls.settings.participation?.enabled) {
    points = enrolled.map((sid) => ({
      studentId: sid,
      name: db.users.find((u) => u.id === sid).name,
      points: db.participation.filter((p) => p.classId === classId && p.studentId === sid).length,
    }));
  }

  return {
    class: { id: cls.id, name: cls.name, settings: cls.settings },
    range,
    timezone: tz,
    participation,
    previous,
    byTopic,
    commonlyMissed,
    minN: MIN_N,
    trend: trend(classAttempts, topics, { range, since, now, tz }),
    tags: tagCheck(db, cls.courseId, topics),
    time: timeByQuestion(db, attempts, topics),
    openReports: courseQs.reduce((n, q) => n + q.reports.filter((r) => !r.resolved).length, 0),
    points,
  };
}

// ---------------- one question in detail ----------------
// How the class answered one question in the period: option choices,
// first vs retry accuracy, time, and reports (without reporter names).
// Choice counts use the CURRENT version only, since options may have
// changed between versions.
function questionInsights(db, classId, questionId, now = Date.now(), { range = 'all' } = {}) {
  const { cls, topics, attempts: inRange } = context(db, classId, now, range);
  const q = db.questions.find((x) => x.id === questionId && x.courseId === cls.courseId);
  if (!q) return null;
  const v = currentVersion(q);
  const type = v.type || 'mcq';
  const topic = topics.find((t) => t.id === q.topicId);
  const all = inRange.filter((a) => a.questionId === q.id);
  const confirmed = all.filter((a) => !a.needsReview);
  const current = all.filter((a) => a.version === v.v && !a.timedOut);

  let answers = null;
  if (type === 'mcq' || type === 'tf' || type === 'multi') {
    const correct = new Set(type === 'multi' ? v.answerIndexes : [v.answerIndex]);
    const counts = v.options.map(() => 0);
    for (const a of current) {
      const picks = type === 'multi' ? a.choices || [] : [a.choice];
      for (const i of picks) if (Number.isInteger(i) && i >= 0 && i < counts.length) counts[i]++;
    }
    answers = { kind: 'options', multi: type === 'multi', answered: current.length, options: v.options.map((text, i) => ({ text, count: counts[i], correct: correct.has(i) })) };
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

  return {
    questionId: q.id,
    stem: v.stem,
    type: TYPE_LABELS[type],
    topic: topic?.name || null,
    outcome: topic?.outcomes.find((o) => o.id === q.outcomeId)?.text || null,
    difficulty: v.difficulty || null,
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
    reports: q.reports.map((r) => ({ reason: r.reason, at: r.at, resolved: r.resolved })).reverse(),
    range,
  };
}

module.exports = { classAnalytics, questionInsights, isValidTimeZone, RANGES, DEFAULT_TZ };
