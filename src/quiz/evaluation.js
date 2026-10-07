// ============================================================
// Prototype evaluation metrics (per course)
// ------------------------------------------------------------
// The proposal says the prototype will be judged on:
//   - question acceptance / editing rates
//   - total preparation time
//   - recommendation behaviour
//   - student usability
// This module computes those from what the app already records.
// Everything is descriptive: small synthetic samples, no control
// group, so nothing here shows that learning improved.
// ============================================================

const { topicStats } = require('./adaptive');

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const ratio = (a, b) => (b ? a / b : null);

function courseEvaluation(db, courseId) {
  const qs = db.questions.filter((q) => q.courseId === courseId);
  const classIds = db.classes.filter((c) => c.courseId === courseId).map((c) => c.id);

  // ---- drafting: acceptance / editing, by where the question came from
  const origins = [...new Set(qs.map((q) => q.origin))];
  const drafting = origins.map((origin) => {
    const list = qs.filter((q) => q.origin === origin);
    const decided = list.filter((q) => q.reviewedAt);
    const approved = decided.filter((q) => q.status === 'published' || q.status === 'withdrawn');
    const rejected = decided.filter((q) => q.status === 'rejected');
    const edited = approved.filter((q) => (q.editCount || 0) > 0);
    const discarded = db.generationLog.filter((g) => g.courseId === courseId && (g.provider === origin || (origin === 'ai' && g.provider === 'gemini'))).reduce((n, g) => n + g.rejected.length, 0);
    return {
      origin,
      total: list.length,
      pending: list.filter((q) => q.status === 'draft').length,
      approved: approved.length,
      rejected: rejected.length,
      acceptanceRate: ratio(approved.length, approved.length + rejected.length),
      editedBeforeApproval: edited.length,
      editRate: ratio(edited.length, approved.length),
      discardedByChecks: discarded,
      medianReviewHours: median(decided.map((q) => (q.reviewedAt - q.createdAt) / 3600000)),
    };
  });

  // ---- preparation time: editor time the browser reported, per question
  const prep = origins.map((origin) => {
    const list = qs.filter((q) => q.origin === origin && q.prepSeconds > 0);
    const published = qs.filter((q) => q.origin === origin && q.status === 'published');
    const total = list.reduce((n, q) => n + q.prepSeconds, 0);
    return { origin, questionsTimed: list.length, totalMinutes: total / 60, medianSeconds: median(list.map((q) => q.prepSeconds)), minutesPerPublished: ratio(total / 60, published.length) };
  });

  // ---- recommendation behaviour
  const sessions = db.sessions.filter((s) => classIds.includes(s.classId));
  const adaptive = sessions.filter((s) => s.mode === 'adaptive');
  const topicOf = (qid) => db.questions.find((q) => q.id === qid)?.topicId;
  const shares = adaptive.filter((s) => s.items.length).map((s) => s.items.filter((i) => s.plan.weakTopicIds.includes(topicOf(i.qid))).length / s.items.length);
  // Follow-up: accuracy in a focus topic before the session vs. in the
  // student's next completed session that included that topic.
  const changes = [];
  for (const s of adaptive.filter((x) => x.completedAt)) {
    for (const t of s.plan.weakTopicIds) {
      const before = topicStats(db.attempts.filter((a) => a.studentId === s.studentId && a.classId === s.classId && a.at < s.createdAt), [{ id: t, name: t }])[0];
      const next = sessions
        .filter((x) => x.studentId === s.studentId && x.classId === s.classId && x.completedAt && x.createdAt > s.completedAt)
        .sort((a, b) => a.createdAt - b.createdAt)
        .find((x) => x.items.some((i) => topicOf(i.qid) === t));
      if (!next || before.accuracy === null) continue;
      const items = next.items.filter((i) => topicOf(i.qid) === t && i.result);
      if (!items.length) continue;
      changes.push(items.filter((i) => i.result.correct).length / items.length - before.accuracy);
    }
  }
  const recommendation = {
    sessions: sessions.length,
    broad: sessions.filter((s) => s.mode === 'broad').length,
    adaptive: adaptive.length,
    meanWeakShare: shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null,
    shortageNotices: sessions.filter((s) => (s.plan.notes || []).some((n) => /bank|not enough/.test(n))).length,
    followUps: changes.length,
    meanAccuracyChange: changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null,
  };

  // ---- usability: completion, duration, and the 3-face survey
  const started = sessions.filter((s) => s.mode !== 'seed');
  const done = started.filter((s) => s.completedAt);
  const feedback = started.filter((s) => s.feedback);
  const usability = {
    started: started.length,
    completed: done.length,
    completionRate: ratio(done.length, started.length),
    medianMinutes: median(done.map((s) => (s.completedAt - s.createdAt) / 60000)),
    ratings: { 1: 0, 2: 0, 3: 0, ...Object.fromEntries([1, 2, 3].map((r) => [r, feedback.filter((s) => s.feedback.rating === r).length])) },
    comments: feedback.filter((s) => s.feedback.comment).slice(-8).reverse().map((s) => ({ comment: s.feedback.comment, rating: s.feedback.rating, at: s.feedback.at })),
  };

  return { drafting, prep, recommendation, usability };
}

module.exports = { courseEvaluation };
