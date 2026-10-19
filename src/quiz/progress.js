// Student-facing progress uses the same confirmed, distinct-question window
// as adaptive selection. Retries replace an earlier answer; they do not add weight.
const { ADAPTIVE, topicStats } = require('./adaptive');

function studentProgress(db, studentId, cls) {
  const topics = db.topics.filter((t) => t.courseId === cls.courseId);
  const mine = db.attempts.filter((a) => a.studentId === studentId && a.classId === cls.id);
  const bank = db.questions.filter((q) => q.courseId === cls.courseId && q.status === 'published');
  const rows = topicStats(mine, topics).map((s) => ({
    ...s,
    bank: bank.filter((q) => q.topicId === s.topicId).length,
    // Small samples are disclosed before suggesting a topic needs attention.
    status: s.n < ADAPTIVE.minPerTopic ? 'building' : s.accuracy < ADAPTIVE.weakBelow ? 'focus' : 'steady',
    awaitingMarking: mine.filter((a) => a.topicId === s.topicId && a.needsReview).length,
  }));

  // Read marks from attempts so a professor's later correction is reflected here.
  const sessions = db.sessions
    .filter((s) => s.studentId === studentId && s.classId === cls.id && s.completedAt)
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, 5)
    .map((s) => {
      const answers = mine.filter((a) => a.sessionId === s.id);
      const marked = answers.filter((a) => !a.needsReview);
      return {
        id: s.id, at: s.completedAt, total: answers.length,
        marked: marked.length, correct: marked.filter((a) => a.correct).length,
        awaitingMarking: answers.length - marked.length,
      };
    });

  const counted = rows.reduce((sum, t) => sum + t.n, 0);
  const correct = rows.reduce((sum, t) => sum + t.correct, 0);
  return {
    topics: rows, sessions, window: ADAPTIVE.recentWindow, minPerTopic: ADAPTIVE.minPerTopic, weakBelow: ADAPTIVE.weakBelow,
    awaitingMarking: mine.filter((a) => a.needsReview).length,
    indicator: { n: counted, correct, accuracy: counted ? correct / counted : null },
  };
}

module.exports = { studentProgress };
