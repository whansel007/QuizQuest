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

// A question's open reports that belong to one class: sent from that class,
// or old reports whose class can't be worked out (those show for every class
// of the course, so none is lost). Used by To review and the dashboard counts.
function openReportsForClass(db, q, classId) {
  return q.reports.filter((r) => {
    if (r.resolved) return false;
    const from = reportContext(db, q, r).classId;
    return from === classId || from === null;
  });
}

// The To review list for one class: its open reports, newest first, and how
// many are waiting in the professor's other classes of the same course (so
// the page can point there). Like the Question bank, a report never says who
// sent it. Classes of the course taught by someone else are left out here;
// the Question bank's Reported filter still shows every report.
function openReports(db, cls, teacherId) {
  const courseQs = db.questions.filter((q) => q.courseId === cls.courseId);
  const items = courseQs
    .flatMap((q) => openReportsForClass(db, q, cls.id).map((r) => {
      const context = reportContext(db, q, r);
      return {
        id: r.id,
        questionId: q.id,
        topic: db.topics.find((t) => t.id === q.topicId)?.name || null,
        stem: context.stem,
        version: context.version,
        category: r.category || 'other',
        reason: r.reason,
        at: r.at,
        classKnown: context.classId !== null,
      };
    }))
    .sort((x, y) => y.at - x.at);
  const otherClasses = db.classes
    .filter((c) => c.courseId === cls.courseId && c.id !== cls.id && !c.archivedAt && c.teacherIds.includes(teacherId))
    .map((c) => ({
      id: c.id,
      name: c.name,
      // only reports sent from that class: the unplaced ones are already in this list
      count: courseQs.reduce((n, q) => n + q.reports.filter((r) => !r.resolved && reportContext(db, q, r).classId === c.id).length, 0),
    }))
    .filter((c) => c.count);
  return { items, otherClasses };
}

module.exports = { reportContext, studentReports, openReports, openReportsForClass };
