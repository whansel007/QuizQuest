// ============================================================
// Adaptive question selection
// ------------------------------------------------------------
// 1. Work out a "practice indicator" per topic from the student's
//    most recent attempts on DISTINCT questions (retrying the same
//    question doesn't inflate it).
// 2. Until every topic has a few attempts, sample broadly
//    (round-robin, least-practised topics first).
// 3. After that: ~70% of slots for general coverage across all topics,
//    ~30% focused on weaker topics. Inside the focus slots, questions
//    that share a learning outcome with one the student recently got
//    wrong come first. These weights are a starting point for the
//    team to test, not a validated recipe.
// 4. Avoid recently-seen questions when alternatives exist, and
//    DISCLOSE gaps instead of generating unreviewed replacements.
// ============================================================

const ADAPTIVE = {
  weakShare: 0.3,          // share of slots given to weaker topics (the rest is general)
  recentWindow: 10,        // distinct questions per topic that count towards the indicator
  minPerTopic: 3,          // attempts needed in EVERY topic before adapting
  weakBelow: 0.75,         // topic accuracy below this counts as "weaker"
  avoidRecent: 15,         // don't repeat any of the last N questions seen if avoidable
};

// Per-topic stats for one student in one class.
// attempts must be pre-filtered to (studentId, classId).
function topicStats(attempts, topics) {
  const byTime = attempts.filter((a) => !a.needsReview).sort((a, b) => b.at - a.at);
  const latestPerQuestion = new Map(); // qid -> most recent attempt
  for (const a of byTime) if (!latestPerQuestion.has(a.questionId)) latestPerQuestion.set(a.questionId, a);

  return topics.map((t) => {
    const recent = [...latestPerQuestion.values()].filter((a) => a.topicId === t.id).slice(0, ADAPTIVE.recentWindow);
    const correct = recent.filter((a) => a.correct).length;
    const missedIds = recent.filter((a) => !a.correct).map((a) => a.questionId);
    const answered = recent.filter((a) => !a.timedOut);
    const ms = answered.map((a) => a.ms).sort((x, y) => x - y);
    return {
      topicId: t.id,
      name: t.name,
      n: recent.length,
      correct,
      accuracy: recent.length ? correct / recent.length : null,
      medianMs: ms.length ? ms[Math.floor(ms.length / 2)] : null,
      missedIds, // questions whose latest attempt was wrong, newest first
    };
  });
}

function shuffle(arr, rand) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Take `count` questions from a pool, unseen ones first.
function takeFrom(pool, count, recent, used, rand) {
  const avail = pool.filter((q) => !used.has(q.id));
  const fresh = shuffle(avail.filter((q) => !recent.has(q.id)), rand);
  const stale = shuffle(avail.filter((q) => recent.has(q.id)), rand);
  const picked = [...fresh, ...stale].slice(0, count);
  picked.forEach((q) => used.add(q.id));
  return { picked, repeats: picked.filter((q) => recent.has(q.id)).length };
}

// Weak-topic questions that share a learning outcome with one the
// student got wrong. The missed question itself is left out: the aim
// is a similar question, not the same one again.
function similarToMissed(bank, stats, weakTopicIds) {
  const missed = new Set(stats.filter((s) => weakTopicIds.includes(s.topicId)).flatMap((s) => s.missedIds || []));
  const outcomes = new Set(bank.filter((q) => missed.has(q.id) && q.outcomeId).map((q) => q.outcomeId));
  return bank.filter((q) => weakTopicIds.includes(q.topicId) && outcomes.has(q.outcomeId) && !missed.has(q.id));
}

// bank: published questions [{id, topicId, outcomeId}]; stats: from topicStats()
// recentIds: question ids, newest first. Returns the plan + disclosures.
function planSession({ bank, topics, stats, recentIds, length, rand = Math.random }) {
  const notes = [];
  const recent = new Set([...new Set(recentIds)].slice(0, ADAPTIVE.avoidRecent));
  const used = new Set();
  const topicsWithQs = topics.filter((t) => bank.some((q) => q.topicId === t.id));
  const missingTopics = topics.filter((t) => !topicsWithQs.includes(t));
  if (missingTopics.length) notes.push(`No published questions are available for: ${missingTopics.map((t) => t.name).join(', ')}. These topics are not covered in this session.`);

  if (bank.length < length) {
    notes.push(`The question bank currently has ${bank.length} published question(s), so this session is shorter than requested. No unreviewed questions were substituted.`);
    length = bank.length;
  }

  const statOf = (id) => stats.find((s) => s.topicId === id);
  const ready = topicsWithQs.length > 0 && topicsWithQs.every((t) => (statOf(t.id)?.n || 0) >= ADAPTIVE.minPerTopic);
  let picked = [];
  let repeats = 0;
  let mode;
  let weakTopicIds = [];

  if (!ready) {
    // BROAD: deal questions round-robin, least-practised topics first
    mode = 'broad';
    const order = [...topicsWithQs].sort((a, b) => (statOf(a.id)?.n || 0) - (statOf(b.id)?.n || 0) || rand() - 0.5);
    let guard = 0;
    while (picked.length < length && guard++ < length * order.length + 10) {
      for (const t of order) {
        if (picked.length >= length) break;
        const r = takeFrom(bank.filter((q) => q.topicId === t.id), 1, recent, used, rand);
        picked.push(...r.picked);
        repeats += r.repeats;
      }
    }
    notes.push('Broad practice: sampling all topics until there is enough history to personalise.');
  } else {
    // ADAPTIVE: weaker topics get ~30% of slots, similar-to-missed first
    mode = 'adaptive';
    const ranked = topicsWithQs.map((t) => statOf(t.id)).sort((a, b) => a.accuracy - b.accuracy);
    weakTopicIds = ranked.filter((s) => s.accuracy < ADAPTIVE.weakBelow).map((s) => s.topicId);
    if (!weakTopicIds.length) weakTopicIds = [ranked[0].topicId]; // nothing weak: focus on the lowest
    if (weakTopicIds.length === ranked.length && ranked.length > 1) {
      weakTopicIds = ranked.slice(0, Math.ceil(ranked.length / 2)).map((s) => s.topicId); // everything weak: lowest half
    }
    const weakPool = bank.filter((q) => weakTopicIds.includes(q.topicId));
    const otherPool = bank.filter((q) => !weakTopicIds.includes(q.topicId));
    const weakSlots = otherPool.length ? Math.round(length * ADAPTIVE.weakShare) : length;

    const sim = takeFrom(similarToMissed(bank, stats, weakTopicIds), weakSlots, recent, used, rand);
    const w = takeFrom(weakPool, weakSlots - sim.picked.length, recent, used, rand);
    w.picked.unshift(...sim.picked);
    const o = takeFrom(otherPool, length - w.picked.length, recent, used, rand);
    picked = [...w.picked, ...o.picked];
    repeats = sim.repeats + w.repeats + o.repeats;
    if (w.picked.length < weakSlots) {
      notes.push('There were not enough published questions in your focus topics, so more questions come from other topics.');
    }
    if (picked.length < length) {
      // other pool ran out too: top up from whatever is left
      const r = takeFrom(bank, length - picked.length, recent, used, rand);
      picked.push(...r.picked);
      repeats += r.repeats;
    }
    const names = weakTopicIds.map((id) => topics.find((t) => t.id === id)?.name).join(', ');
    notes.push(`Focused practice: about ${Math.round(ADAPTIVE.weakShare * 100)}% of questions from ${names}, including ones similar to questions you got wrong. The rest give broader coverage.`);
  }

  if (repeats) notes.push(`${repeats} question(s) repeat from your recent practice because the bank is small.`);
  return { questionIds: shuffle(picked, rand).map((q) => q.id), mode, weakTopicIds, notes };
}

module.exports = { ADAPTIVE, topicStats, planSession, similarToMissed };
