// Reports are attached to the attempted version, so editing a question later
// cannot change the wording shown in a student's report history.
function reportContext(db, q, report) {
  // New reports already carry their context; only legacy rows need inference.
  const attempt = report.classId && report.version ? null : db.attempts
    .filter((a) => a.studentId === report.studentId && a.questionId === q.id && a.at <= report.at)
    .reverse().sort((a, b) => b.at - a.at)[0];
  const version = report.version ?? attempt?.version ?? null;
  return {
    classId: report.classId ?? attempt?.classId ?? null,
    version,
    stem: report.stem ?? q.versions.find((v) => v.v === version)?.stem ?? 'Question wording unavailable',
  };
}

function studentReports(db, studentId, classId) {
  return db.questions.flatMap((q) => q.reports
    .filter((r) => r.studentId === studentId)
    .map((r) => ({ r, context: reportContext(db, q, r) }))
    .filter(({ context }) => context.classId === classId)
    // Explicitly select safe fields: no answer keys, other reporters or staff IDs.
    .map(({ r, context }) => ({
      id: r.id, questionId: q.id, topic: db.topics.find((t) => t.id === q.topicId)?.name || 'Topic unavailable',
      version: context.version, stem: context.stem, category: r.category || 'other',
      reason: r.reason, at: r.at, resolved: !!r.resolved,
      resolvedAt: r.resolvedAt || null, resolutionNote: r.resolutionNote || '',
    })))
    .sort((a, b) => b.at - a.at);
}

module.exports = { reportContext, studentReports };
