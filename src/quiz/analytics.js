// ============================================================
// Professor analytics for ONE class
// ------------------------------------------------------------
// Every rate comes with its denominator, and first attempts are kept
// separate from retries (a retry right after seeing the explanation
// says less about understanding). Low accuracy is a prompt to
// investigate - student difficulty, an ambiguous question, or a gap in
// teaching - never an automatic grade or label.
// ============================================================

const { TYPE_LABELS } = require('./formats');

const DAY = 86400000;

function quantile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function rate(list) {
  const correct = list.filter((a) => a.correct).length;
  return { n: list.length, correct, accuracy: list.length ? correct / list.length : null };
}

function classAnalytics(db, classId, now = Date.now()) {
  const cls = db.classes.find((c) => c.id === classId);
  const topics = db.topics.filter((t) => t.courseId === cls.courseId);
  const enrolled = db.enrolments.filter((e) => e.classId === classId).map((e) => e.studentId);
  const attempts = db.attempts.filter((a) => a.classId === classId && enrolled.includes(a.studentId));
  const sessions = db.sessions.filter((s) => s.classId === classId);

  const active = new Set(attempts.map((a) => a.studentId));
  const active7 = new Set(attempts.filter((a) => a.at > now - 7 * DAY).map((a) => a.studentId));
  const participation = {
    enrolled: enrolled.length,
    activeEver: active.size,
    active7d: active7.size,
    sessionsCompleted: sessions.filter((s) => s.completedAt).length,
    attempts: attempts.length,
    worldAttempts: attempts.filter((a) => a.context === 'world').length,
  };

  const byTopic = topics.map((t) => {
    const list = attempts.filter((a) => a.topicId === t.id);
    const answered = list.filter((a) => !a.timedOut).map((a) => a.ms).sort((x, y) => x - y);
    return {
      topicId: t.id,
      name: t.name,
      first: rate(list.filter((a) => a.first)),
      retry: rate(list.filter((a) => !a.first)),
      students: new Set(list.map((a) => a.studentId)).size,
      medianMs: quantile(answered, 0.5),
      p75Ms: quantile(answered, 0.75),
      timeouts: list.filter((a) => a.timedOut).length,
    };
  });

  // Per-question view: commonly missed (enough first attempts to mean something)
  const MIN_N = 3;
  const qStats = [];
  for (const q of db.questions.filter((x) => x.courseId === cls.courseId)) {
    const list = attempts.filter((a) => a.questionId === q.id);
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

  return { class: { id: cls.id, name: cls.name, settings: cls.settings }, participation, byTopic, commonlyMissed, minN: MIN_N, points };
}

module.exports = { classAnalytics };
