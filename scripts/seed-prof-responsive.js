#!/usr/bin/env node
// ============================================================
// DEV-ONLY fixture: a populated professor workspace for the responsive
// checks (docs/mobile/PROF-NOTES.md). Never runs on its own: the browser
// harness calls enrichForProfResponsive() on its in-memory test server, or
// you run this file by hand to write a separate demo data file:
//
//   node scripts/seed-prof-responsive.js            -> data/prof-responsive.json
//   QUIZ_DATA_FILE=data/prof-responsive.json node server.js
//
// All names, emails and answers are made up. It refuses to run with
// NODE_ENV=production or when SUPABASE_URL is set, and never overwrites
// data/db.json.
//
// What it adds for Prof. Demo A (t-a), on top of the normal seed:
//   - a second course with a 60+ character title, so the professor has 2
//   - 10 more topics (one with a 60-character name, one long unbroken string)
//   - 3 more classes (one with a long name, one archived) -> 5 active classes
//   - 34 more students (40 in total), a few with long names and emails
//   - 70+ more questions across published / draft / rejected / withdrawn,
//     with student reports on some
//   - practice history in every class (analytics, trends, class comparison)
//   - short answers waiting for marking in three classes
//   - materials (passages), AI generation log entries, adaptive sessions
//     with usability ratings and comments (Evaluation)
// ============================================================
const path = require('path');
const fs = require('fs');

const DAY = 86400000;
const LONG_COURSE = 'Foundations of Applied Data Science and Responsible Computing';
const LONG_TOPIC = 'Encryption, hashing and digital signatures in everyday systems';
const UNBROKEN = 'Supercalifragilistic_unbroken_identifier_string_for_wrapping_checks_2026';
const LONG_CLASS = 'Computing - Evening Cohort for Working Adults (Part-time) 2026';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const enriched = new WeakSet(); // enrich each database once
function enrichForProfResponsive(db, now = Date.now()) {
  if (enriched.has(db)) return db;
  enriched.add(db);
  const rand = mulberry32(20261105);
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];

  // ---- second course for t-a, with a long title
  db.courses.push({ id: 'c-long', title: LONG_COURSE, teacherIds: ['t-a'], coverageTarget: 4, promptConfig: 'Prefer realistic case studies.', semester: { start: db.courses[0].semester?.start } });

  // ---- topics
  const newTopics = [
    ['tp-alg', 'c-comp', 'Algorithms and flowcharts', 4],
    ['tp-enc', 'c-comp', LONG_TOPIC, 5],
    ['tp-db', 'c-comp', 'Databases and SQL', 6],
    ['tp-web', 'c-comp', 'How the web works', 7],
    ['tp-ai', 'c-comp', 'AI ethics and bias', 8],
    ['tp-str', 'c-comp', UNBROKEN, 9],
    ['tp-hw', 'c-comp', 'Hardware and operating systems', 10],
    ['tp-ds1', 'c-long', 'Data collection and cleaning', 1],
    ['tp-ds2', 'c-long', 'Visualising distributions and spotting misleading charts', 2],
    ['tp-ds3', 'c-long', 'Privacy, consent and anonymisation', 3],
  ];
  for (const [id, courseId, name, week] of newTopics) {
    db.topics.push({ id, courseId, name, week, outcomes: [
      { id: `lo-${id}-1`, text: `Explain the key ideas of ${name.toLowerCase()}` },
      { id: `lo-${id}-2`, text: `Apply ${name.toLowerCase()} to a short worked scenario with realistic constraints` },
    ] });
  }

  // ---- classes
  db.classes.push(
    { id: 'cl-d', courseId: 'c-comp', name: LONG_CLASS, description: 'Evening cohort. Long description to check wrapping in class cards: ' + UNBROKEN, teacherIds: ['t-a'], settings: { tradingEnabled: true, participation: { enabled: false } } },
    { id: 'cl-e', courseId: 'c-long', name: 'Data Science - Studio 1', teacherIds: ['t-a'], settings: { tradingEnabled: false, participation: { enabled: false } } },
    { id: 'cl-f', courseId: 'c-comp', name: 'Computing - Tutorial Group Z (last term)', teacherIds: ['t-a'], archivedAt: now - 20 * DAY, settings: { tradingEnabled: true, participation: { enabled: false } } },
  );

  // ---- students: 13..46 (34 more, 46 in total)
  const longNames = { 21: 'Student 21 Alexandria Constantinople-Wolfeschlegelstein', 22: 'Student 22 Maximiliana Bartholomew-Featherstonehaugh', 30: 'Student 30 ' + UNBROKEN };
  const extra = [];
  for (let n = 13; n <= 46; n++) {
    const id = 's-' + String(n).padStart(2, '0');
    const name = longNames[n] || 'Student ' + String(n).padStart(2, '0');
    const email = n === 22 ? 'maximiliana.bartholomew-featherstonehaugh.evening.cohort@example.test' : `student${n}@example.test`;
    db.users.push({ id, name, role: 'student', email });
    extra.push(id);
  }
  const enrol = (classId, ids) => ids.forEach((studentId) => db.enrolments.push({ classId, studentId }));
  enrol('cl-a', extra.slice(0, 8)); // Group A: 6 + 8 = 14
  enrol('cl-c', extra.slice(8, 14)); // Group C: 4 + 6 = 10
  enrol('cl-d', extra.slice(14, 28)); // Evening: 14
  enrol('cl-e', extra.slice(28, 34)); // Studio: 6
  enrol('cl-f', extra.slice(0, 3)); // archived class keeps its roster

  // ---- materials
  for (const [id, courseId, name] of newTopics) {
    db.passages.push({ id: `p-${id}`, courseId, topicId: id, outcomeId: `lo-${id}-1`, title: `Lecture notes: ${name}`, text: `${name}. These dummy notes describe the topic in plain words so drafting has something to retrieve. ${'Each paragraph adds a realistic sentence about the topic and its examples. '.repeat(6)}`, createdBy: 't-a', createdAt: now - 25 * DAY });
  }
  db.passages.push({ id: 'p-long-title', courseId: 'c-comp', topicId: 'tp-str', outcomeId: 'lo-tp-str-1', title: 'Scanned handout ' + UNBROKEN + '.pdf', text: 'Short scanned handout used to stress long file names.', createdBy: 't-a', createdAt: now - 3 * DAY });

  // ---- questions: 6 per new topic, mixed statuses and origins
  const genIds = [];
  const STATUSES = ['published', 'published', 'published', 'draft', 'rejected', 'withdrawn'];
  for (const [topicId, courseId, name] of newTopics) {
    STATUSES.forEach((status, i) => {
      const id = `q-pr-${topicId}-${i}`;
      const ai = i % 2 === 1;
      const generationId = ai ? `gen-pr-${topicId}` : null;
      if (ai && !genIds.includes(generationId)) genIds.push(generationId);
      const short = i === 2 && courseId === 'c-comp';
      const stem = i === 0
        ? `Which statement best describes ${name.toLowerCase()} when it is applied in a busy organisation with many teams and competing priorities?`
        : `Question ${i + 1} on ${name}: choose the most accurate option.`;
      const version = short
        ? { type: 'short', stem: `In two sentences, explain one risk of ignoring ${name.toLowerCase()}.`, modelAnswer: 'A short model answer that names the risk and its consequence.', keyPoints: ['names a concrete risk', 'explains the consequence'], explanation: 'Any clear risk with a consequence earns the mark.', difficulty: 'medium' }
        : { type: 'mcq', stem, options: ['A plausible but incomplete answer', 'The correct answer with its reason', 'A common misconception', 'An unrelated idea ' + (topicId === 'tp-str' ? UNBROKEN : '')], answerIndex: 1, explanation: 'The second option names the idea and why it holds.', difficulty: pick(['easy', 'medium', 'hard']) };
      const decided = status !== 'draft';
      db.questions.push({
        id, courseId, topicId, outcomeId: `lo-${topicId}-${(i % 2) + 1}`, status, origin: ai ? 'ai' : 'manual', generationId,
        createdAt: now - (20 - i) * DAY, createdBy: 't-a', publishedVersion: status === 'published' || status === 'withdrawn' ? 1 : null,
        reports: [], editCount: i % 3 === 0 ? 1 : 0, prepSeconds: ai ? 60 + Math.floor(rand() * 120) : 240 + Math.floor(rand() * 400),
        reviewedAt: decided ? now - (19 - i) * DAY : null, reviewedBy: decided ? 't-a' : null,
        versions: [{ v: 1, warnings: i === 3 ? ['The distractor "A common misconception" may be too close to the answer.'] : [], editedAt: now - (20 - i) * DAY, editedBy: 't-a', publishedAt: decided ? now - (19 - i) * DAY : undefined, sourceIds: [`p-${topicId}`], ...version }],
      });
    });
  }
  // open student reports on a few published questions
  const reported = db.questions.filter((q) => q.id.startsWith('q-pr-') && q.status === 'published' && q.courseId === 'c-comp').slice(0, 4);
  reported.forEach((q, i) => q.reports.push({ id: `r-pr-${i}`, studentId: extra[i], reason: i === 1 ? 'The options read the same to me: ' + UNBROKEN : 'Two of the options look correct, the wording is confusing for this one.', category: 'ambiguous', at: now - (i + 1) * DAY, resolved: false }));

  // ---- AI generation log
  genIds.forEach((gid, i) => {
    const topicId = gid.replace('gen-pr-', '');
    const topic = db.topics.find((t) => t.id === topicId);
    db.generationLog.push({
      id: gid, courseId: topic.courseId, topicId, outcomeId: `lo-${topicId}-1`, count: 3, format: 'mcq', focus: i % 3 === 0 ? 'misconceptions' : '',
      passageIds: [`p-${topicId}`], chunkCount: 3, provider: 'gemini', model: 'gemini-demo', calls: 1 + (i % 2), at: now - (10 + i) * DAY, by: 't-a', ok: i !== 4,
      createdQuestionIds: db.questions.filter((q) => q.generationId === gid).map((q) => q.id),
      rejected: i % 2 ? [{ stem: 'A rejected draft whose answer was not in the material ' + (topicId === 'tp-str' ? UNBROKEN : ''), reason: 'Answer not supported by the retrieved material.' }] : [],
      error: i === 4 ? 'The model reply could not be read as questions.' : undefined,
    });
  });

  // ---- practice history: every active class, all c-comp topics
  const publishedOf = (courseId) => db.questions.filter((q) => q.courseId === courseId && q.status === 'published' && q.versions[0].type === 'mcq');
  const rosterOf = (classId) => db.enrolments.filter((e) => e.classId === classId).map((e) => e.studentId);
  function practise(classId, courseId, daysAgoList, skill) {
    const bank = publishedOf(courseId);
    for (const studentId of rosterOf(classId)) {
      const ability = skill + (rand() - 0.5) * 0.3;
      for (const daysAgo of daysAgoList) {
        const start = now - daysAgo * DAY - Math.floor(rand() * 8) * 3600000;
        const items = [...bank].sort(() => rand() - 0.5).slice(0, 8);
        const adaptive = daysAgo % 2 === 0;
        const session = { id: `ses-pr-${classId}-${studentId}-${daysAgo}`, studentId, classId, courseId, createdAt: start, timerSec: 0, mode: adaptive ? 'adaptive' : 'broad', plan: { weakTopicIds: adaptive ? [items[0].topicId] : [], notes: [] }, items: [], cursor: items.length, npc: { name: 'Fog of Confusion', emoji: '👾', maxHp: 50, hp: 0 }, completedAt: null };
        let t = start;
        for (const q of items) {
          const v = q.versions[0];
          const correct = rand() < Math.min(0.95, Math.max(0.1, ability - (q.topicId === 'tp-enc' ? 0.35 : 0)));
          const wrong = v.options.map((_, i) => i).filter((i) => i !== v.answerIndex);
          const choice = correct ? v.answerIndex : wrong[Math.floor(rand() * wrong.length)];
          const ms = 5000 + Math.floor(rand() * 40000);
          t += ms + 1500;
          const first = !db.attempts.some((a) => a.studentId === studentId && a.questionId === q.id);
          db.attempts.push({ id: `at-${session.id}-${q.id}`, sessionId: session.id, studentId, classId, courseId, questionId: q.id, version: 1, topicId: q.topicId, type: 'mcq', choice, correct, score: correct ? 1 : 0, ms, timedOut: false, first, context: 'practice', at: t });
          session.items.push({ qid: q.id, v: 1, servedAt: t - ms, result: { correct, choice } });
        }
        session.completedAt = t;
        if (rand() < 0.35) {
          const rating = 1 + Math.floor(rand() * 3);
          const comments = ['', 'Fun, but the timer felt short on my phone.', 'I liked the explanations after each question.', 'Some questions were confusing; the options read the same: ' + UNBROKEN, 'Please add more questions on databases.'];
          session.feedback = { rating, comment: pick(comments), at: t };
        }
        db.sessions.push(session);
      }
    }
  }
  practise('cl-a', 'c-comp', [12, 7, 3], 0.72);
  practise('cl-c', 'c-comp', [11, 6, 2], 0.55);
  practise('cl-d', 'c-comp', [13, 9, 4, 1], 0.62);
  practise('cl-e', 'c-long', [10, 5, 2], 0.6);

  // ---- short answers waiting for marking (three classes)
  const shortQs = db.questions.filter((q) => q.courseId === 'c-comp' && q.status === 'published' && q.versions[0].type === 'short');
  const answers = [
    'UDP does not wait for lost packets, so the game gets the newest position faster.',
    'Because TCP resends lost data, which adds delay; a game cares about fresh updates more than every packet arriving.',
    'Not sure. I think it is faster? ' + UNBROKEN,
    'If you ignore it, attackers can read data in transit and the organisation could face fines and lose trust with its customers, which in a long answer like this one keeps going to check that the card wraps neatly on a narrow phone screen.',
  ];
  let k = 0;
  for (const classId of ['cl-a', 'cl-c', 'cl-d']) {
    for (const studentId of rosterOf(classId).slice(0, 5)) {
      const q = shortQs[k % shortQs.length];
      const at = now - (k + 1) * 3600000;
      db.attempts.push({ id: `at-pr-short-${k}`, sessionId: null, studentId, classId, courseId: 'c-comp', questionId: q.id, version: 1, topicId: q.topicId, type: 'short', text: answers[k % answers.length], coveredPoints: k % 2 ? [0] : [], method: 'keywords', correct: false, score: 0, needsReview: true, ms: 40000, timedOut: false, first: true, context: 'practice', at });
      k++;
    }
  }
  return db;
}

module.exports = { enrichForProfResponsive, LONG_COURSE, LONG_TOPIC, UNBROKEN, LONG_CLASS };

if (require.main === module) {
  if (process.env.NODE_ENV === 'production' || process.env.SUPABASE_URL) {
    console.error('seed-prof-responsive is a dev-only fixture: refusing to run with NODE_ENV=production or SUPABASE_URL set.');
    process.exit(1);
  }
  const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'data', 'prof-responsive.json'));
  if (path.basename(out) === 'db.json') {
    console.error('Refusing to overwrite db.json: pass another file name.');
    process.exit(1);
  }
  const { seed } = require('../src/quiz/seed');
  const db = enrichForProfResponsive(seed());
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(db));
  console.log(`Wrote ${out}: ${db.users.length} users, ${db.classes.length} classes, ${db.topics.length} topics, ${db.questions.length} questions.`);
  console.log(`Run it with: QUIZ_DATA_FILE=${path.relative(process.cwd(), out)} node server.js`);
}
