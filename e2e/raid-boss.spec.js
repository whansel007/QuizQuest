// raid-boss.spec.js
// E2E for the co-op raid: two students of the same class share ONE boss
// (the "Fog of Confusion"). A correct answer next to the boss damages it
// for everybody in the class, and when it falls everyone who landed a hit
// shares the reward.
//
// The raid has no screen of its own any more - the World tab now opens the
// Campfire Defense arena - so this test drives the multiplayer protocol the
// way the game did: a real browser opens a real socket with the student's
// real session token, walks to the boss and answers the question it is
// given. Sign-in, the token, the class check, the shared world, the shared
// boss and the shared reward are all covered end to end.
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { signIn, TEACHER } from './helpers.js';

// The seeded demo questions live in the app's own CommonJS modules.
const require = createRequire(path.resolve('package.json'));
const { seed } = require('./src/quiz/seed.js');
const { instantiate } = require('./src/quiz/formats.js');

const CLASS_ID = 'cl-a';
const COURSE_ID = 'c-comp';
const STUDENT_A = { email: 'student01@quizquest.demo' };
const STUDENT_B = { email: 'student02@quizquest.demo' };

// The server never sends the answer key to the browser, so the test knows
// the answers the way a professor does: from the question bank. The seeded
// bank is the starting point, and the live bank below is what the server
// will actually serve from - another spec in the same run publishes a
// draft question, and that question has to be answerable too.
const bank = new Map();
for (const q of seed(1750000000000).questions) {
  if (q.status !== 'published' || q.courseId !== COURSE_ID) continue;
  const v = q.versions.find((x) => x.v === q.publishedVersion);
  if (v) bank.set(q.id, v);
}

// Read the professor's own question bank: the published questions, with the
// answer key the professor is allowed to see.
async function readLiveBank(context) {
  const page = await context.newPage();
  await signIn(page, TEACHER);
  const questions = await page.evaluate(async (courseId) => {
    const res = await fetch(`/api/teacher/courses/${courseId}/questions`, {
      headers: { Authorization: 'Bearer ' + sessionStorage.getItem('qq-token') },
    });
    if (!res.ok) throw new Error('the question bank said ' + res.status);
    return res.json();
  }, COURSE_ID);
  await page.close();
  return questions;
}

// A maths template is drawn with fresh numbers every time it is served, so
// its answer is not in the bank. Rebuild the draw that was served: try every
// possible set of values and keep the one whose wording matches.
function paramChoice(v, stem, options) {
  const vars = v.variables || [];
  const steps = vars.map((x) => Math.floor((x.max - x.min) / x.step + 1e-9));
  const total = steps.reduce((n, s) => n * (s + 1), 1);
  for (let n = 0; n < total; n++) {
    let rest = n;
    const fractions = vars.map((x, i) => {
      const idx = rest % (steps[i] + 1);
      rest = Math.floor(rest / (steps[i] + 1));
      return (idx + 0.5) / (steps[i] + 1);
    });
    let i = 0;
    const rand = () => (i < fractions.length ? fractions[i++] : 0.5);
    const inst = instantiate(v, rand);
    if (!inst || inst.stem !== stem) continue;
    const at = options.indexOf(inst.options[inst.answerIndex]);
    if (at >= 0) return at;
  }
  return -1;
}

// The answer, in the shape the server expects for that question type.
function submissionFor(challenge) {
  const q = challenge.question;
  const v = bank.get(q.questionId);
  if (!v) return null;
  if (v.type === 'multi') return { choices: v.answerIndexes };
  if (v.type === 'numeric') return { value: v.answer };
  if (v.type === 'param') {
    const at = paramChoice(v, q.stem, q.options);
    return at < 0 ? null : { choice: at };
  }
  if (v.type === 'mcq' || v.type === 'tf') return { choice: v.answerIndex };
  return null;
}

// Open a /world socket inside the page, with the student's own token, and
// leave a small controller behind for the test to drive it.
async function openWorldSocket(page, classId) {
  await page.addScriptTag({ url: '/socket.io/socket.io.js' });
  await page.evaluate((classId) => {
    const socket = io('/world', { auth: { token: sessionStorage.getItem('qq-token') }, transports: ['websocket'] });
    const R = {
      socket,
      you: null,
      state: null,
      events: [],
      waiters: [],
      // The next event of one of these kinds, whether it has just arrived or
      // is still on its way.
      next(evs, ms) {
        return new Promise((resolve, reject) => {
          const at = R.events.findIndex((e) => evs.includes(e.ev) && !e.used);
          if (at >= 0) {
            const e = R.events[at];
            e.used = true;
            return resolve(e);
          }
          const w = { evs, resolve };
          R.waiters.push(w);
          setTimeout(() => {
            const i = R.waiters.indexOf(w);
            if (i >= 0) {
              R.waiters.splice(i, 1);
              reject(new Error('timed out waiting for ' + evs.join(', ')));
            }
          }, ms);
        });
      },
      emit(ev, data) {
        socket.emit(ev, data);
      },
    };
    socket.onAny((ev, data) => {
      if (ev === 'state') {
        R.state = data; // far too frequent to keep
        return;
      }
      if (ev === 'challenge') {
        // The server repeats a question it is already holding; keep only the newest.
        for (const old of R.events) if (old.ev === 'challenge' && !old.used && old.data.id === data.id) old.used = true;
      }
      const e = { ev, data };
      R.events.push(e);
      if (ev === 'welcome') R.you = data.you;
      for (const w of R.waiters.slice()) {
        if (w.evs.includes(ev)) {
          R.waiters.splice(R.waiters.indexOf(w), 1);
          e.used = true; // this waiter has taken it
          w.resolve(e);
        }
      }
    });
    socket.on('connect', () => socket.emit('join', { classId }));
    window.__raid = R;
  }, classId);
}

// Walk to the boss. It always stands in the middle of the arena, so the
// way there is known; the server owns the position, we only hold the keys.
async function walkToBoss(page) {
  const reached = await page.evaluate(async () => {
    const R = window.__raid;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const idle = { up: false, down: false, left: false, right: false };
    let dead = false;
    let distance = Infinity;
    for (let i = 0; i < 400; i++) {
      const s = R.state;
      const me = s && s.players.find((p) => p.id === R.you);
      const boss = s && s.boss;
      if (!me || !boss) {
        await sleep(50);
        continue;
      }
      if (!boss.alive) {
        dead = true;
        break;
      }
      const dx = boss.x - me.x;
      const dy = boss.y - me.y;
      distance = Math.hypot(dx, dy);
      if (distance <= 90) break; // inside the boss's reach (125)
      R.emit('input', { up: dy < -5, down: dy > 5, left: dx < -5, right: dx > 5 });
      await sleep(70);
    }
    R.emit('input', idle);
    return { dead, distance };
  });
  if (!reached.dead && reached.distance > 125) {
    throw new Error(`never reached the boss: still ${Math.round(reached.distance)}px away`);
  }
  return reached;
}

// Press E next to the boss and wait for the question (or for the server to
// say why there is none). The server ignores an "interact" that comes too
// soon after the last one, so keep asking until it answers.
async function askForChallenge(page) {
  return page.evaluate(async () => {
    const R = window.__raid;
    const p = R.next(['challenge', 'notice'], 25000);
    const again = setInterval(() => R.emit('interact'), 700);
    try {
      return await p;
    } finally {
      clearInterval(again);
    }
  });
}

async function sendAnswer(page, id, submission) {
  return page.evaluate(async ({ id, submission }) => {
    const R = window.__raid;
    const p = R.next(['result', 'expired'], 20000);
    R.emit('answer', { id, submission });
    return p;
  }, { id, submission });
}

// Every event of a kind this student's browser has seen so far.
async function seenEvents(page, ev) {
  return page.evaluate((ev) => window.__raid.events.filter((e) => e.ev === ev).map((e) => e.data), ev);
}

// Everything this student's browser has seen, in order.
async function allEvents(page) {
  return page.evaluate(() => window.__raid.events.map((e) => e.ev + ':' + JSON.stringify(e.data).slice(0, 120)));
}

test('two students share one raid boss: a correct answer damages it for the class and the reward is split', async ({ browser, baseURL }) => {
  test.setTimeout(180 * 1000); // a raid takes a few questions and a walk or two
  const contextA = await browser.newContext({ baseURL });
  const contextB = await browser.newContext({ baseURL });
  const contextT = await browser.newContext({ baseURL }); // the professor, for the answer key
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  await signIn(pageA, STUDENT_A);
  await signIn(pageB, STUDENT_B);

  // Take the answer key from the live question bank, so the test can answer
  // every question the server is willing to serve - including one another
  // spec published in this same run.
  for (const q of await readLiveBank(contextT)) {
    if (q.status !== 'published' || !q.publishedVersion || !q.latest) continue;
    if (q.latest.v !== q.publishedVersion) continue; // an edit that was never published
    bank.set(q.id, q.latest);
  }
  await contextT.close();

  await openWorldSocket(pageA, CLASS_ID);
  await openWorldSocket(pageB, CLASS_ID);

  // Both students are in the same class world, and the world knows both.
  await pageA.evaluate(() => window.__raid.next(['welcome'], 20000));
  await pageB.evaluate(() => window.__raid.next(['welcome'], 20000));
  await expect
    .poll(async () => {
      const players = await pageA.evaluate(() => (window.__raid.state?.players || []).map((p) => p.name));
      return players.length;
    }, { timeout: 20000 })
    .toBe(2);

  // The boss is shared: one boss, 60 health, for both of them.
  const bossAtStart = await pageA.evaluate(() => window.__raid.state.boss);
  expect(bossAtStart.alive).toBe(true);
  expect(bossAtStart.maxHp).toBe(60);

  // Answer until it falls. The students take turns, so both of them land a
  // hit and both of them are owed a share of the reward. A resource node
  // can be in reach as well: that gathers supplies instead, and the boss
  // waits.
  const players = [pageA, pageB];
  const hits = [];

  // The boss has sixty health and every hit takes ten off it, so six hits
  // finish it. Count the hits instead of watching the health bar: the state
  // snapshot can lag a frame behind the kill, and the boss comes back after
  // thirty seconds, so a flag that is read too late sees the next boss.
  for (let round = 0; round < 16 && hits.length < 6; round++) {
    for (const page of players) {
      if (hits.length >= 6) break;
      await walkToBoss(page);
      const asked = await askForChallenge(page);
      if (asked.ev === 'notice') {
        // Too soon after a wrong answer, or nothing in reach: wait it out.
        const why = String(asked.data || '');
        await page.waitForTimeout(/breath/i.test(why) ? 4200 : 500);
        continue;
      }
      const challenge = asked.data;
      const submission = submissionFor(challenge);
      expect(submission, `no answer known for ${challenge.question.questionId}`).not.toBeNull();

      const answered = await sendAnswer(page, challenge.id, submission);
      expect(answered.ev, `the question was not graded: ${JSON.stringify(answered.data)}`).toBe('result');
      expect(answered.data.id, 'the server graded a different question').toBe(challenge.id);
      expect(answered.data.correct, 'the seeded answer was rejected').toBe(true);
      if (challenge.kind !== 'attack') continue; // a gather, not a hit

      hits.push({ damage: answered.data.effect?.damage });

      // The hit is broadcast to the whole class: the other student sees it.
      const others = players.filter((p) => p !== page);
      for (const other of others) {
        try {
          await expect.poll(async () => (await seenEvents(other, 'hit')).length, { timeout: 10000 }).toBe(hits.length);
        } catch (err) {
          console.log('RAID attacker events', JSON.stringify(await allEvents(page), null, 1));
          console.log('RAID other events', JSON.stringify(await allEvents(other), null, 1));
          throw err;
        }
      }
    }
  }

  // Six hits of ten damage each brought the sixty health boss down.
  expect(hits.length).toBe(6);
  expect(hits.every((h) => h.damage === 10)).toBe(true);

  // When the last health goes, the whole class is told who won it.
  for (const p of players) {
    await expect.poll(async () => (await seenEvents(p, 'raidWon')).length, { timeout: 15000 }).toBeGreaterThan(0);
  }
  const victory = (await seenEvents(pageA, 'raidWon'))[0];
  expect(victory).not.toBeNull();
  expect(victory.heroes.sort()).toEqual(['Student 01', 'Student 02']);
  expect(victory.coins).toBe(25);

  // Both of them were paid, and both were told their new totals.
  for (const page of players) {
    await expect.poll(async () => (await seenEvents(page, 'balances')).length, { timeout: 10000 }).toBeGreaterThan(0);
  }

  await contextA.close();
  await contextB.close();
});
