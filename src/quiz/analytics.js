// ============================================================
// Professor analytics for ONE class
// ------------------------------------------------------------
// Every rate comes with its denominator, and first attempts are kept
// separate from retries (a retry right after seeing the explanation
// says less about understanding). Low accuracy is a prompt to
// investigate - student difficulty, an ambiguous question, or a gap in
// teaching - never an automatic grade or label.
//
// Short answers still waiting for the professor's mark are left out of
// every accuracy figure (their automatic mark is only provisional) and
// counted separately as "awaiting marking".
//
// A period filter (last 7 days / 30 days / all time) scopes everything:
// tiles, tables, trends and response times.
// ============================================================

const { TYPE_LABELS } = require('./formats');

const DAY = 86400000;
const RANGES = { '7d': 7, '30d': 30, all: null };
const MIN_N = 3; // first attempts before a question can be "commonly missed"
const LOW_N = 5; // trend points / averages from fewer answers are flagged
const MAX_WEEKS = 12; // all-time trend shows at most this many recent weeks
const DIFFICULTIES = ['easy', 'medium', 'hard'];

function quantile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function rate(list) {
  const correct = list.filter((a) => a.correct).length;
  return { n: list.length, correct, accuracy: list.length ? correct / list.length : null };
}

// UTC day / Monday-week boundaries (the same day keys the rewards use)
const dayStart = (t) => Math.floor(t / DAY) * DAY;
const weekStart = (t) => {
  const d = new Date(dayStart(t));
  return d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY;
};

// Accuracy per topic and activity, bucketed by day (7-day view) or week
function trend(attempts, topics, { range, since, now }) {
  const bucket = range === '7d' ? 'day' : 'week';
  const size = bucket === 'day' ? DAY : 7 * DAY;
  const startOf = bucket === 'day' ? dayStart : weekStart;
  let first = startOf(range === 'all' ? Math.min(now, ...attempts.map((a) => a.at)) : since);
  const last = startOf(now);
  if (range === 'all') first = Math.max(first, last - (MAX_WEEKS - 1) * size);
  const points = [];
  for (let start = first; start <= last; start += size) {
    const list = attempts.filter((a) => a.at >= start && a.at < start + size && a.at >= since);
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

// Average time students spend on each question. Time is measured by the
// server from serving the question to receiving the answer; timed-out
// answers have no answering time and are left out. Each student counts
// once (the average of their own times), so one student answering many
// times can't skew it. Only class-level figures are returned: no names
// or per-student times.
function timeByQuestion(db, attempts, topics) {
  const timed = attempts.filter((a) => !a.timedOut && Number.isFinite(a.ms));
  const out = [];
  for (const [qid, list] of Map.groupBy(timed, (a) => a.questionId)) {
    const q = db.questions.find((x) => x.id === qid);
    if (!q) continue;
    const v = q.versions.find((x) => x.v === q.publishedVersion) || q.versions.at(-1);
    const perStudent = [...Map.groupBy(list, (a) => a.studentId).values()].map((mine) => mean(mine.map((a) => a.ms)));
    out.push({
      questionId: qid, stem: v.stem, type: TYPE_LABELS[v.type || 'mcq'], topic: topics.find((t) => t.id === q.topicId)?.name,
      n: list.length, students: perStudent.length, meanMs: mean(perStudent), medianMs: quantile(list.map((a) => a.ms).sort((x, y) => x - y), 0.5),
    });
  }
  return out.sort((a, b) => b.meanMs - a.meanMs);
}

function classAnalytics(db, classId, now = Date.now(), { range = 'all' } = {}) {
  const cls = db.classes.find((c) => c.id === classId);
  const topics = db.topics.filter((t) => t.courseId === cls.courseId);
  const enrolled = db.enrolments.filter((e) => e.classId === classId).map((e) => e.studentId);
  const days = RANGES[range];
  // whole UTC days: "last 7 days" = today and the 6 days before it
  const since = days ? dayStart(now) - (days - 1) * DAY : -Infinity;
  const classAttempts = db.attempts.filter((a) => a.classId === classId && enrolled.includes(a.studentId));
  const attempts = classAttempts.filter((a) => a.at >= since);
  const confirmed = attempts.filter((a) => !a.needsReview);
  const sessions = db.sessions.filter((s) => s.classId === classId);

  const participation = {
    enrolled: enrolled.length,
    activeEver: new Set(attempts.map((a) => a.studentId)).size, // in the selected period
    active7d: new Set(classAttempts.filter((a) => a.at > now - 7 * DAY).map((a) => a.studentId)).size,
    sessionsCompleted: sessions.filter((s) => s.completedAt && s.completedAt >= since).length,
    attempts: attempts.length,
    worldAttempts: attempts.filter((a) => a.context === 'world').length,
    awaitingMarking: attempts.length - confirmed.length,
  };

  const byTopic = topics.map((t) => {
    const all = attempts.filter((a) => a.topicId === t.id);
    const list = all.filter((a) => !a.needsReview);
    const answered = all.filter((a) => !a.timedOut).map((a) => a.ms).sort((x, y) => x - y);
    return {
      topicId: t.id,
      name: t.name,
      first: rate(list.filter((a) => a.first)),
      retry: rate(list.filter((a) => !a.first)),
      awaitingMarking: all.length - list.length,
      students: new Set(all.map((a) => a.studentId)).size,
      medianMs: quantile(answered, 0.5),
      p75Ms: quantile(answered, 0.75),
      timeouts: all.filter((a) => a.timedOut).length,
    };
  });

  // Per-question view: commonly missed (enough first attempts to mean something)
  const qStats = [];
  for (const q of db.questions.filter((x) => x.courseId === cls.courseId)) {
    const list = confirmed.filter((a) => a.questionId === q.id);
    if (!list.length) continue;
    const v = q.versions.find((x) => x.v === q.publishedVersion) || q.versions.at(-1);
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
    participation,
    byTopic,
    commonlyMissed,
    minN: MIN_N,
    trend: trend(classAttempts, topics, { range, since, now }),
    tags: tagCheck(db, cls.courseId, topics),
    timeByQuestion: timeByQuestion(db, attempts, topics),
    points,
  };
}

module.exports = { classAnalytics, RANGES };
