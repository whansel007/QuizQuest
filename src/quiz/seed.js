// ============================================================
// Demo seed data - ALL SYNTHETIC
// ------------------------------------------------------------
// No real students, staff or grades. Users are "Student 01" etc.
// The course content is short generic computing material written for
// the demo. A few weeks of fake practice history are generated with a
// fixed random seed so the professor dashboard has something to show.
// ============================================================

const { award, inventory, REWARDS } = require('./rewards');
const { grantResources, createTrade } = require('./economy');

// Resources for finishing a practice session (also used by api.js)
const SESSION_RESOURCES = { wood: 2, herb: 1 };

const DAY = 86400000;
const SCHEMA = 2; // bump when the data shape changes; store.js re-seeds old files

// Tiny deterministic PRNG so every fresh seed looks the same
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [id, topicId, outcomeId, difficulty, stem, options, answerIndex, explanation, sourceId]
const QUESTIONS = [
  ['q-d1', 'tp-data', 'lo-data-1', 'easy', 'What is the decimal value of the binary number 1010?', ['8', '10', '12', '5'], 1, '1010 in binary = 8 + 0 + 2 + 0 = 10.', 'p-data-1'],
  ['q-d2', 'tp-data', 'lo-data-1', 'medium', 'How many bits does one hexadecimal digit represent?', ['2', '4', '8', '16'], 1, 'A hex digit has 16 possible values, and 16 = 2^4, so each digit maps to exactly four bits.', 'p-data-1'],
  ['q-d3', 'tp-data', 'lo-data-1', 'medium', 'What is the hexadecimal value FF in decimal?', ['15', '255', '256', '240'], 1, 'F = 15, so FF = 15 x 16 + 15 = 255.', 'p-data-1'],
  ['q-d4', 'tp-data', 'lo-data-1', 'easy', 'How many different values can one byte represent?', ['8', '128', '255', '256'], 3, 'A byte is 8 bits, giving 2^8 = 256 values (0 to 255). 255 is the largest value, not the count.', 'p-data-1'],
  ['q-d5', 'tp-data', 'lo-data-2', 'medium', 'Which encoding is backward compatible with ASCII and uses one to four bytes per character?', ['UTF-8', 'UTF-32', 'EBCDIC', 'Base64'], 0, 'UTF-8 is variable length (1-4 bytes) and the first 128 code points are identical to ASCII.', 'p-data-2'],
  ['q-d6', 'tp-data', 'lo-data-2', 'hard', 'An image uses a colour depth of 8 bits per pixel. How many different colours can each pixel show?', ['8', '64', '256', '16.7 million'], 2, '8 bits give 2^8 = 256 possible values per pixel.', 'p-data-2'],
  ['q-n1', 'tp-net', 'lo-net-1', 'easy', 'Which device forwards packets between different networks?', ['Switch', 'Router', 'Network card', 'Monitor'], 1, 'A router forwards packets between networks; a switch works within one local network.', 'p-net-1'],
  ['q-n2', 'tp-net', 'lo-net-1', 'medium', 'A video call has a sharp picture but responses feel delayed. Which property of the connection is most likely the problem?', ['Low bandwidth', 'High latency', 'Low colour depth', 'Too many switches'], 1, 'Delay is travel time, which is latency. Picture quality depends more on bandwidth, which seems fine here.', 'p-net-1'],
  ['q-n3', 'tp-net', 'lo-net-1', 'medium', 'Which device connects devices within the same local network using MAC addresses?', ['Router', 'Switch', 'DNS server', 'Web server'], 1, 'A switch forwards frames inside a local network using MAC addresses.', 'p-net-1'],
  ['q-n4', 'tp-net', 'lo-net-2', 'easy', 'What does DNS do?', ['Encrypts web traffic', 'Translates domain names into IP addresses', 'Guarantees ordered delivery of packets', 'Assigns MAC addresses to devices'], 1, 'DNS translates human-readable names like example.org into IP addresses.', 'p-net-2'],
  ['q-n5', 'tp-net', 'lo-net-2', 'medium', 'Why is UDP often chosen for live online games?', ['It guarantees every packet arrives', 'It encrypts data automatically', 'It avoids the overhead of guaranteed, ordered delivery', 'It translates domain names'], 2, 'UDP skips delivery guarantees, so late packets are dropped instead of delaying newer data.', 'p-net-2'],
  ['q-n6', 'tp-net', 'lo-net-2', 'medium', 'What does HTTPS add to HTTP?', ['Faster page loads through compression', 'Encryption of traffic using TLS', 'Translation of domain names', 'Guaranteed delivery over UDP'], 1, 'HTTPS is HTTP over TLS, which encrypts traffic between browser and server.', 'p-net-2'],
  ['q-s1', 'tp-sec', 'lo-sec-1', 'easy', "An email asks you to 'verify your account' through a link to a look-alike website. What type of attack is this most likely?", ['Phishing', 'Ransomware', 'Brute-force attack', 'Denial of service'], 0, 'Deceptive messages that trick people into clicking links or revealing details are phishing.', 'p-sec-1'],
  ['q-s2', 'tp-sec', 'lo-sec-1', 'medium', 'Which type of malware encrypts files and demands payment for the key?', ['Spyware', 'Adware', 'Ransomware', 'Worm'], 2, 'Ransomware encrypts files and demands payment for the decryption key.', 'p-sec-1'],
  ['q-s3', 'tp-sec', 'lo-sec-1', 'medium', 'A caller pretending to be IT support asks for your password. This is an example of:', ['Social engineering', 'Malware', 'Patching', 'Encryption'], 0, 'Manipulating people into breaking security procedures is social engineering.', 'p-sec-1'],
  ['q-s4', 'tp-sec', 'lo-sec-2', 'easy', 'Which practice adds a second, independent proof of identity at login?', ['Password manager', 'Multi-factor authentication', 'Backup', 'Patching'], 1, 'Multi-factor authentication requires two or more independent proofs of identity.', 'p-sec-2'],
  ['q-s5', 'tp-sec', 'lo-sec-2', 'medium', 'Why is it important to install software updates promptly?', ['They fix known security vulnerabilities', 'They make passwords longer', 'They back up your files', 'They block all phishing emails'], 0, 'Patches fix known vulnerabilities that attackers may already be exploiting.', 'p-sec-2'],
  ['q-s6', 'tp-sec', 'lo-sec-2', 'hard', 'A new staff member only needs to read reports. Following least privilege, what access should they get?', ['Administrator access, to be safe', 'Read-only access to the reports', 'Edit access to all files', 'The same access as their manager'], 1, 'Least privilege means giving only the access needed for the job: here, read-only.', 'p-sec-2'],
  // Course B (different professor) - used to prove class isolation
  ['q-st1', 'tp-stats', 'lo-stats-1', 'easy', 'What is the median of 3, 7, 9, 12, 20?', ['7', '9', '10.2', '12'], 1, 'Ordered, the middle (3rd of 5) value is 9.', 'p-stats-1'],
  ['q-st2', 'tp-stats', 'lo-stats-1', 'easy', 'What is the mean of 2, 4, 6, 8?', ['4', '5', '6', '20'], 1, '(2 + 4 + 6 + 8) / 4 = 20 / 4 = 5.', 'p-stats-1'],
  ['q-st3', 'tp-stats', 'lo-stats-1', 'medium', 'Which measure of centre is least affected by an extreme outlier?', ['Mean', 'Median', 'Range', 'Sum'], 1, 'The median depends only on the middle position, so one extreme value barely moves it.', 'p-stats-1'],
];

const PASSAGES = [
  ['p-data-1', 'c-comp', 'tp-data', 'lo-data-1', 'Bits, bytes and number systems',
    'A bit is the smallest unit of data and holds either 0 or 1. A byte is a group of eight bits and can represent 256 different values. Binary is a base-2 number system that uses only the digits 0 and 1. Hexadecimal is a base-16 number system that uses the digits 0-9 and the letters A-F. Each hexadecimal digit corresponds to exactly four bits, which is why programmers use it as a compact way to write binary values. For example, the binary value 1111 1111 is FF in hexadecimal and 255 in decimal.'],
  ['p-data-2', 'c-comp', 'tp-data', 'lo-data-2', 'Encoding text and images',
    'ASCII is a character encoding that maps 128 characters to 7-bit numbers. Unicode is a character standard that assigns a unique code point to characters from almost every writing system. UTF-8 is a variable-length encoding of Unicode that uses one to four bytes per character and stays backward compatible with ASCII. A pixel is the smallest addressable element of a digital image. Colour depth is the number of bits used to store the colour of each pixel.'],
  ['p-net-1', 'c-comp', 'tp-net', 'lo-net-1', 'How data moves',
    'A packet is a small unit of data sent across a network together with addressing information. A router is a device that forwards packets between different networks. A switch is a device that connects devices within the same local network and forwards frames using MAC addresses. Latency is the time it takes for data to travel from source to destination. Bandwidth is the maximum amount of data that can be transferred over a connection in a given time.'],
  ['p-net-2', 'c-comp', 'tp-net', 'lo-net-2', 'Common protocols',
    'TCP is a connection-oriented protocol that guarantees ordered and reliable delivery of data. UDP is a connectionless protocol that sends data without guaranteeing delivery, which suits live video and games. DNS is a service that translates human-readable domain names into IP addresses. HTTPS is the secure version of HTTP that encrypts traffic between a browser and a web server using TLS.'],
  ['p-sec-1', 'c-comp', 'tp-sec', 'lo-sec-1', 'Common attacks',
    "Phishing is an attack that uses deceptive messages to trick people into revealing information or clicking malicious links. Malware is software designed to damage, disrupt or gain unauthorised access to a computer system. Ransomware is malicious software that encrypts a victim's files and demands payment for the key. Social engineering is the manipulation of people into breaking normal security procedures."],
  ['p-sec-2', 'c-comp', 'tp-sec', 'lo-sec-2', 'Protective practices',
    'Multi-factor authentication is a login method that requires two or more independent proofs of identity. A password manager is a tool that generates and stores unique passwords for each account. Patching is the process of applying updates that fix known security vulnerabilities. A backup is a copy of data stored separately so it can be restored after loss or attack. The principle of least privilege means giving each user only the access they need to do their job.'],
  ['p-stats-1', 'c-stats', 'tp-stats', 'lo-stats-1', 'Measures of centre',
    'The mean is the sum of values divided by the number of values. The median is the middle value when the data are ordered. The mode is the most frequent value. The range is the difference between the largest and smallest values.'],
];

// How likely each synthetic student is to get each topic right.
// Gives the dashboard and the adaptive picker visible patterns.
const SKILL = {
  's-02': { 'tp-data': 0.85, 'tp-net': 0.35, 'tp-sec': 0.8 },
  's-03': { 'tp-data': 0.4, 'tp-net': 0.7, 'tp-sec': 0.85 },
  's-04': { 'tp-data': 0.75, 'tp-net': 0.5, 'tp-sec': 0.6 },
  's-05': { 'tp-data': 0.9, 'tp-net': 0.6, 'tp-sec': 0.9 },
  's-06': { 'tp-data': 0.6, 'tp-net': 0.45, 'tp-sec': 0.7 },
};

function seed(now = Date.now()) {
  const rand = mulberry32(42);
  const db = {
    schema: SCHEMA,
    users: [
      { id: 't-a', name: 'Prof. Demo A', role: 'teacher' },
      { id: 't-b', name: 'Prof. Demo B', role: 'teacher' },
      ...['01', '02', '03', '04', '05', '06', '07', '08'].map((n) => ({ id: 's-' + n, name: 'Student ' + n, role: 'student' })),
    ],
    courses: [
      { id: 'c-comp', title: 'Intro to Computing (demo)', teacherIds: ['t-a'], coverageTarget: 4, promptConfig: 'Prefer short applied scenarios over pure recall. Use plain British English.' },
      { id: 'c-stats', title: 'Intro to Statistics (demo)', teacherIds: ['t-b'], coverageTarget: 4, promptConfig: 'Show working in explanations.' },
    ],
    topics: [
      { id: 'tp-data', courseId: 'c-comp', name: 'Data representation', outcomes: [
        { id: 'lo-data-1', text: 'Convert between binary, decimal and hexadecimal' },
        { id: 'lo-data-2', text: 'Explain how text and images are encoded' }] },
      { id: 'tp-net', courseId: 'c-comp', name: 'Networking basics', outcomes: [
        { id: 'lo-net-1', text: 'Describe how data moves across a network' },
        { id: 'lo-net-2', text: 'Distinguish common protocols and their purpose' }] },
      { id: 'tp-sec', courseId: 'c-comp', name: 'Cyber hygiene', outcomes: [
        { id: 'lo-sec-1', text: 'Recognise common attacks' },
        { id: 'lo-sec-2', text: 'Apply basic protective practices' }] },
      { id: 'tp-stats', courseId: 'c-stats', name: 'Descriptive statistics', outcomes: [
        { id: 'lo-stats-1', text: 'Compute and compare measures of centre' }] },
    ],
    classes: [
      { id: 'cl-a', courseId: 'c-comp', name: 'Computing - Tutorial Group A', teacherIds: ['t-a'], settings: { tradingEnabled: true, participation: { enabled: false } } },
      { id: 'cl-b', courseId: 'c-stats', name: 'Statistics - Tutorial Group B', teacherIds: ['t-b'], settings: { tradingEnabled: true, participation: { enabled: false } } },
    ],
    enrolments: [
      ...['01', '02', '03', '04', '05', '06'].map((n) => ({ classId: 'cl-a', studentId: 's-' + n })),
      { classId: 'cl-b', studentId: 's-07' },
      { classId: 'cl-b', studentId: 's-08' },
    ],
    passages: PASSAGES.map(([id, courseId, topicId, outcomeId, title, text]) => ({ id, courseId, topicId, outcomeId, title, text, createdBy: courseId === 'c-comp' ? 't-a' : 't-b', createdAt: now - 30 * DAY })),
    questions: [],
    sessions: [],
    attempts: [],
    ledger: [],
    inventory: [],
    generationLog: [],
    kingdoms: [],
    trades: [],
    resourceLog: [],
    participation: [],
  };

  // Hand-written questions: "prep time" is a plausible synthetic baseline
  // for writing a question by hand, so the Evaluation tab has something
  // to compare AI drafts against.
  const published = (id, courseId, topicId, outcomeId, by, version) => ({
    id, courseId, topicId, outcomeId, status: 'published', origin: 'manual', generationId: null,
    createdAt: now - 30 * DAY, createdBy: by, publishedVersion: 1, reports: [],
    editCount: 0, prepSeconds: 240 + Math.floor(rand() * 480), reviewedAt: now - 30 * DAY, reviewedBy: by,
    versions: [{ v: 1, warnings: [], editedAt: now - 30 * DAY, editedBy: by, publishedAt: now - 30 * DAY, ...version }],
  });
  for (const [id, topicId, outcomeId, difficulty, stem, options, answerIndex, explanation, src] of QUESTIONS) {
    const courseId = topicId === 'tp-stats' ? 'c-stats' : 'c-comp';
    const by = courseId === 'c-comp' ? 't-a' : 't-b';
    db.questions.push(published(id, courseId, topicId, outcomeId, by, { type: 'mcq', stem, options, answerIndex, explanation, difficulty, sourceIds: [src] }));
  }
  // One draft waiting for review, and one student report to triage
  db.questions.push({
    id: 'q-draft1', courseId: 'c-comp', topicId: 'tp-net', outcomeId: 'lo-net-2', status: 'draft', origin: 'manual', generationId: null,
    createdAt: now - DAY, createdBy: 't-a', publishedVersion: null, reports: [], editCount: 0, prepSeconds: 0,
    versions: [{ v: 1, type: 'mcq', stem: 'Which protocol guarantees ordered and reliable delivery of data?', options: ['UDP', 'TCP', 'DNS', 'HTTP'], answerIndex: 1, explanation: 'TCP is connection-oriented and guarantees ordered, reliable delivery.', difficulty: 'easy', sourceIds: ['p-net-2'], warnings: [], editedAt: now - DAY, editedBy: 't-a' }],
  });
  db.questions.find((q) => q.id === 'q-n2').reports.push({ id: 'r-seed1', studentId: 's-03', reason: '"Sharp picture" made me think bandwidth was the issue, the wording is confusing.', at: now - 2 * DAY, resolved: false });

  // --- Synthetic practice history for students 02-06 ---------------
  const compQs = db.questions.filter((q) => q.courseId === 'c-comp' && q.status === 'published');
  for (const [studentId, skill] of Object.entries(SKILL)) {
    for (const daysAgo of [9, 5, 2]) {
      const start = now - daysAgo * DAY - Math.floor(rand() * 6) * 3600000;
      const picked = [...compQs].sort(() => rand() - 0.5).slice(0, 8);
      const session = { id: `ses-seed-${studentId}-${daysAgo}`, studentId, classId: 'cl-a', courseId: 'c-comp', createdAt: start, timerSec: 0, mode: 'seed', plan: { weakTopicIds: [], notes: [] }, items: [], cursor: picked.length, npc: { name: 'Fog of Confusion', emoji: '👾', maxHp: 50, hp: 0 }, completedAt: null };
      let t = start;
      for (const q of picked) {
        const v = q.versions[0];
        // q-n2 is deliberately tricky: most wrong answers pick "Low bandwidth"
        const p = q.id === 'q-n2' ? skill[q.topicId] * 0.5 : skill[q.topicId];
        const correct = rand() < p;
        const wrong = v.options.map((_, i) => i).filter((i) => i !== v.answerIndex);
        const choice = correct ? v.answerIndex : q.id === 'q-n2' && rand() < 0.8 ? 0 : wrong[Math.floor(rand() * wrong.length)];
        const ms = 6000 + Math.floor(rand() * (q.topicId === 'tp-data' ? 40000 : 22000));
        t += ms + 2000;
        const first = !db.attempts.some((a) => a.studentId === studentId && a.questionId === q.id);
        db.attempts.push({ id: `at-${session.id}-${q.id}`, sessionId: session.id, studentId, classId: 'cl-a', courseId: 'c-comp', questionId: q.id, version: 1, topicId: q.topicId, type: 'mcq', choice, correct, score: correct ? 1 : 0, ms, timedOut: false, first, context: 'practice', at: t });
        session.items.push({ qid: q.id, v: 1, servedAt: t - ms, result: { correct, choice } });
        if (correct) award(db, studentId, REWARDS.firstCorrect, 'Correct on a new question', `correct:${studentId}:${q.id}`, t);
      }
      session.completedAt = t;
      award(db, studentId, REWARDS.sessionComplete, 'Completed a practice session', `session:${session.id}`, t);
      grantResources(db, studentId, SESSION_RESOURCES, 'Completed a practice session', `sessionres:${session.id}`, t);
      db.sessions.push(session);
    }
  }
  for (const u of db.users) if (u.role === 'student') inventory(db, u.id);

  // Newer formats, added after the synthetic history (so nobody has
  // answered them yet)
  const TYPED = [
    ['q-x1', 'c-comp', 'tp-net', 'lo-net-2', 't-a', { type: 'multi', difficulty: 'medium', stem: 'Select ALL statements that are true about UDP.', options: ['It is connectionless', 'It guarantees delivery of every packet', 'It suits live video and games', 'It translates domain names into IP addresses'], answerIndexes: [0, 2], explanation: 'UDP is connectionless and does not guarantee delivery, which suits live video and games. Translating names is DNS.', sourceIds: ['p-net-2'] }],
    ['q-x2', 'c-comp', 'tp-sec', 'lo-sec-2', 't-a', { type: 'tf', difficulty: 'easy', stem: 'True or false: a backup should be stored separately from the original data so it can be restored after an attack.', options: ['True', 'False'], answerIndex: 0, explanation: 'True. A backup stored in the same place can be lost or encrypted along with the original.', sourceIds: ['p-sec-2'] }],
    ['q-x3', 'c-comp', 'tp-net', 'lo-net-2', 't-a', { type: 'short', difficulty: 'hard', stem: 'In one or two sentences, explain why a live online game might use UDP instead of TCP.', modelAnswer: 'UDP does not wait to guarantee or reorder delivery, so updates arrive with less delay. In a live game, fresh data matters more than a late or lost packet.', keyPoints: ['UDP does not guarantee delivery', 'less delay or lower latency', 'fresh data matters more than late packets'], explanation: 'Guaranteed, ordered delivery (TCP) can hold back new data while old data is resent. Games prefer the newest state, so UDP fits.', sourceIds: ['p-net-2'] }],
    ['q-x4', 'c-comp', 'tp-data', 'lo-data-1', 't-a', { type: 'numeric', difficulty: 'easy', stem: 'Convert the binary number 1101 to decimal.', answer: 13, tolerance: 0, unit: '', explanation: '1101 = 8 + 4 + 0 + 1 = 13.', sourceIds: ['p-data-1'] }],
    ['q-x5', 'c-comp', 'tp-data', 'lo-data-1', 't-a', { type: 'param', difficulty: 'medium', stem: 'How many different values can be represented with {n} bits?', variables: [{ name: 'n', min: 3, max: 12, step: 1 }], answerExpr: '2^n', distractorExprs: ['2*n', '2^n - 1', 'n^2'], constraint: '', decimals: 0, unit: '', explanation: 'Each extra bit doubles the number of combinations, so {n} bits give 2^{n} = {answer} values. (2^{n} - 1 is the largest value, not the count.)', sourceIds: ['p-data-1'] }],
    ['q-x6', 'c-stats', 'tp-stats', 'lo-stats-1', 't-b', { type: 'param', difficulty: 'easy', stem: 'What is the mean of {a}, {b}, {c} and {d}?', variables: ['a', 'b', 'c', 'd'].map((name) => ({ name, min: 1, max: 20, step: 1 })), answerExpr: '(a + b + c + d) / 4', distractorExprs: ['(a + b + c + d) / 3', 'a + b + c + d', '(max(a, b, c, d) + min(a, b, c, d)) / 2'], constraint: '', decimals: 2, unit: '', explanation: 'Add the four values and divide by 4: ({a} + {b} + {c} + {d}) / 4 = {answer}.', sourceIds: ['p-stats-1'] }],
    ['q-x7', 'c-stats', 'tp-stats', 'lo-stats-1', 't-b', { type: 'numeric', difficulty: 'easy', stem: 'What is the range of 4, 9, 15, 2, 11?', answer: 13, tolerance: 0, unit: '', explanation: 'Range = largest - smallest = 15 - 2 = 13.', sourceIds: ['p-stats-1'] }],
  ];
  for (const [id, courseId, topicId, outcomeId, by, version] of TYPED) db.questions.push(published(id, courseId, topicId, outcomeId, by, version));

  // One open trade offer so the class market isn't empty
  createTrade(db, { cls: db.classes[0], studentId: 's-03', give: { wood: 3 }, want: { herb: 2 }, now: now - DAY });
  return db;
}

module.exports = { seed, SCHEMA, SESSION_RESOURCES };
