// ============================================================
// Professor analytics for ONE class
// ------------------------------------------------------------
// Every rate comes with its denominator, and first attempts are kept
// separate from retries (a retry right after seeing the explanation
// says less about understanding). Low accuracy is a prompt to
// investigate - student difficulty, an ambiguous question, or a gap in
// teaching - never an automatic grade or label.
// ============================================================

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
    const first = list.filter((a) => a.first);
    const v = q.versions.find((x) => x.v === q.publishedVersion) || q.versions.at(-1);
    // Which wrong option is most popular? Often reveals a misconception
    // or an ambiguous distractor. Counted on the CURRENT version only,
    // since options may have changed between versions.
    const wrongCounts = {};
    for (const a of list) if (!a.correct && a.choice !== null && a.version === v.v) wrongCounts[a.choice] = (wrongCounts[a.choice] || 0) + 1;
    const topWrong = Object.entries(wrongCounts).sort((x, y) => y[1] - x[1])[0];
    qStats.push({
      questionId: q.id,
      stem: v.stem,
      topic: topics.find((t) => t.id === q.topicId)?.name,
      status: q.status,
      versionsAttempted: [...new Set(list.map((a) => a.version))].sort(),
      first: rate(first),
      retry: rate(list.filter((a) => !a.first)),
      topWrong: topWrong ? { option: v.options[Number(topWrong[0])], count: topWrong[1] } : null,
      openReports: q.reports.filter((r) => !r.resolved).length,
    });
  }
  const commonlyMissed = qStats
    .filter((s) => s.first.n >= MIN_N)
    .sort((a, b) => a.first.accuracy - b.first.accuracy)
    .slice(0, 5);

  return { class: { id: cls.id, name: cls.name }, participation, byTopic, commonlyMissed, minN: MIN_N };
}

module.exports = { classAnalytics };
