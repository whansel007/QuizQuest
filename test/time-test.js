// ============================================================
// Daily and weekly limits follow local time (Singapore by default)
// ------------------------------------------------------------
// Before this, "today" was the UTC day, so in Singapore the coin and
// resource caps reset at 8am. These tests sit on both sides of local
// midnight (16:00 UTC) and of UTC midnight (08:00 in Singapore).
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/quiz/time');
const R = require('../src/quiz/rewards');
const E = require('../src/quiz/economy');
const { seed } = require('../src/quiz/seed');

// Singapore wall-clock time -> instant (Singapore is UTC+8 all year)
const sg = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h - 8, min);

test('the app time zone defaults to Singapore', () => {
  assert.equal(T.APP_TZ, 'Asia/Singapore');
  assert.equal(T.dayKey(sg(2026, 10, 9, 0, 30)), '2026-10-09', '00:30 Friday is Friday');
  assert.equal(T.dayKey(sg(2026, 10, 8, 23, 59)), '2026-10-08');
  assert.equal(T.weekKey(sg(2026, 10, 11, 23, 59)), '2026-10-05', 'Sunday night is still the week of Monday 5th');
  assert.equal(T.weekKey(sg(2026, 10, 12, 0, 0)), '2026-10-12', 'Monday 00:00 starts a new week');
  assert.equal(T.dayKey(sg(2026, 10, 9, 0, 30), 'UTC'), '2026-10-08', 'the same instant is still Thursday in UTC');
});

test('the daily coin cap resets at local midnight, not at 8am', () => {
  const db = seed(sg(2026, 10, 1, 12));
  const id = 's-01';
  // fill the cap late on Thursday evening
  const thu = sg(2026, 10, 8, 23, 0);
  for (let i = 0; R.earnedOnDay(db, id, thu) < R.REWARDS.dailyCap; i++) R.award(db, id, 10, 'test', `t:${i}`, thu);
  assert.equal(R.award(db, id, 10, 'test', 'thu-more', thu + 60000).granted, 0, 'capped on Thursday');
  // 00:30 Friday in Singapore: a new day (in UTC it would still be Thursday until 8am)
  assert.equal(R.award(db, id, 10, 'test', 'fri', sg(2026, 10, 9, 0, 30)).granted, 10);
});

test('the daily resource cap and trade limit reset at local midnight', () => {
  const db = seed(sg(2026, 10, 1, 12));
  const id = 's-01';
  const thu = sg(2026, 10, 8, 22, 0);
  E.grantResources(db, id, { wood: E.RESOURCE_DAILY_CAP }, 'test', 'r:thu', thu);
  assert.deepEqual(E.grantResources(db, id, { wood: 5 }, 'test', 'r:thu2', thu + 60000).granted, {}, 'capped on Thursday');
  assert.deepEqual(E.grantResources(db, id, { wood: 5 }, 'test', 'r:fri', sg(2026, 10, 9, 0, 30)).granted, { wood: 5 });
  assert.equal(E.earnedToday(db, id, sg(2026, 10, 9, 7, 59)), 5, 'only Friday counts at 07:59 Friday');
});

test('participation weeks start on Monday at local midnight', () => {
  const db = seed(sg(2026, 10, 1, 12));
  const cls = { ...db.classes.find((c) => c.id === 'cl-a'), settings: { participation: { enabled: true } } };
  const session = (id) => ({ id, items: Array.from({ length: 5 }, () => ({})) });
  // three points on Sunday night fill the week's cap...
  for (const n of [1, 2, 3]) assert.deepEqual(E.awardParticipation(db, { cls, studentId: 's-01', session: session(`sun${n}`), now: sg(2026, 10, 11, 23, n) }), { point: 1 });
  assert.deepEqual(E.awardParticipation(db, { cls, studentId: 's-01', session: session('sun4'), now: sg(2026, 10, 11, 23, 30) }), { capped: true });
  // ...and Monday 00:30 in Singapore is a new week (still Sunday in UTC)
  assert.deepEqual(E.awardParticipation(db, { cls, studentId: 's-01', session: session('mon'), now: sg(2026, 10, 12, 0, 30) }), { point: 1 });
});

test('the fast local clock matches Intl exactly, across DST and odd offsets', () => {
  // zones with DST, a 30-minute DST shift, 30/45-minute offsets, and a date-line jump
  const zones = ['Asia/Singapore', 'Europe/London', 'America/New_York', 'Australia/Lord_Howe', 'Asia/Kathmandu', 'Asia/Kolkata', 'Pacific/Chatham', 'Pacific/Apia'];
  const start = Date.UTC(2025, 0, 1);
  let seedN = 7;
  const random = () => ((seedN = (seedN * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const tz of zones) {
    // random instants over two years (with milliseconds)...
    for (let i = 0; i < 400; i++) {
      const t = start + Math.floor(random() * 730 * T.DAY);
      assert.equal(T.wallClock(t, tz), T.exactWallClock(t, tz), `${tz} at ${new Date(t).toISOString()}`);
    }
    // ...and every minute around each change of offset
    for (let t = start; t < start + 730 * T.DAY; t += 3600000) {
      if (T.exactWallClock(t, tz) - t === T.exactWallClock(t + 3600000, tz) - (t + 3600000)) continue;
      for (let m = 0; m <= 60; m++) assert.equal(T.wallClock(t + m * 60000 + 999, tz), T.exactWallClock(t + m * 60000 + 999, tz), `${tz} near a change`);
    }
  }
});
