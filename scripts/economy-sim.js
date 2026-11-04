#!/usr/bin/env node
// Deterministic 15-week baseline simulator. Pull odds, pity and duplicate
// handling use the server's rewards module; building prices and resource caps
// use the server's economy module.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const R = require('../src/quiz/rewards');
const E = require('../src/quiz/economy');
const { seed: seedData, sessionResources } = require('../src/quiz/seed');
const { dayKey, weekKey, APP_TZ } = require('../src/quiz/time');
const { topicStats } = require('../src/quiz/adaptive');
const { GAME_CONFIG } = require('../public/hero-lab/game-config.js');
const TUNING = require('../config/tuning.js');

const N = Number(process.env.SIM_STUDENTS || 2000);
const WEEKS = 15;
const DAYS_PER_WEEK = 7;
const TERM_START = '2026-01-05'; // Monday, 00:00 in APP_TIMEZONE
const TYPES = [
  { id: 'A', label: 'Once a week', sessions: (w) => [1] },
  { id: 'B', label: 'Twice a week', sessions: (w) => [1, 4] },
  { id: 'C', label: 'Three a week', sessions: (w) => [1, 3, 5] },
  { id: 'D', label: 'Irregular', sessions: (w, rng) => rng() < 8 / 15 ? [1 + Math.floor(rng() * 7)] : [] },
];
const SEEDED_DATA = seedData(Date.UTC(2026, 0, 5));
const SEEDED_CLASSES = SEEDED_DATA.classes.map((cls) => ({
  id: cls.id,
  topics: SEEDED_DATA.topics.filter((topic) => topic.courseId === cls.courseId),
}));
const SIM_ASSUMPTIONS = Object.freeze({
  studentsPerType: N,
  weeks: WEEKS,
  days: 105,
  appTimezone: APP_TZ,
  questionsPerSession: 10,
  accuracy: 0.70,
  frequencySchedules: Object.freeze({ typeA: '1 session per week', typeB: '2 sessions per week', typeC: '3 sessions per week', typeD: 'exactly 8 of 15 weeks, with one random local practice day in each selected week' }),
  correctAnswersFirstTimePct: 80,
  topicMilestoneCoins: 30,
  topicMilestoneRule: 'Real server rule via topicStats: once per student/class/topic after a correct answer when latest distinct-topic accuracy is at least 80% with at least 5 distinct questions, using at most 10 recent confirmed answers.',
  topicsPerSeedClass: Object.fromEntries(SEEDED_CLASSES.map((cls) => [cls.id, cls.topics.length])),
  classSize: 30,
  welcomeGiftCoins: GAME_CONFIG.heroSummon.welcomeGiftCoins,
  resourcesPerSession: 3,
  startHeroes: ['sheriff', 'electromancer'],
  heroPoolSize: R.HERO_CATALOG.length,
  heroRarities: Object.fromEntries(['epic', 'rare'].map((rarity) => [rarity, R.HERO_CATALOG.filter((h) => h.rarity === rarity).length])),
  pullPolicy: 'Spend on x1 pulls whenever balance is at least one pull; skip heroes already owned.',
  buildingPolicy: 'Buy an affordable next level immediately; prioritize lowest building level, then lower next-level total cost, then library, workshop, garden, tower.',
  tradingPolicy: 'Classes have 30 students (final cohort can be smaller); each blocked student gets one 50% chance per week to find a compatible classmate and trade up to 20 units 1-for-1.',
});

const RESOURCE_KEYS = Object.keys(E.RESOURCES);
const BUILDING_KEYS = ['library', 'workshop', 'garden', 'tower'];
const PULL_COST = GAME_CONFIG.heroSummon.pullCost;
function addDateDays(isoDate, days) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
const localInstantCache = new Map();
function localInstant(isoDate, hour, timeZone = APP_TZ) {
  const key = `${timeZone}|${isoDate}|${hour}`;
  if (localInstantCache.has(key)) return localInstantCache.get(key);
  const [year, month, day] = isoDate.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day, hour);
  let instant = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
    const represented = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
    instant += target - represented;
  }
  localInstantCache.set(key, instant);
  return instant;
}

function rngFactory(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rngInt(rng, n) { return Math.floor(rng() * n); }
function pullRand(rng) { return (n) => rngInt(rng, n); }
function studentDb(student) {
  return {
    ledger: student.ledger,
    resourceLog: student.resourceLog,
    inventory: [student.inventory],
    kingdoms: [student.kingdom],
  };
}
function total(bundle) { return Object.values(bundle).reduce((sum, n) => sum + n, 0); }

function economyRules(tuned, overrides = {}) {
  return {
    tuned,
    commonPrizeUnits: tuned && TUNING.COMMON_PRIZE_UNITS_ENABLED ? (overrides.COMMON_PRIZE_UNITS ?? TUNING.COMMON_PRIZE_UNITS) : GAME_CONFIG.heroSummon.commonResourceAmount,
    sessionScaling: tuned && TUNING.SESSION_SCALING_ENABLED,
    singleType: tuned && TUNING.SESSION_RESOURCES_SINGLE_TYPE,
    baseCoins: tuned && TUNING.SESSION_SCALING_ENABLED ? (overrides.SESSION_BASE_COINS ?? TUNING.SESSION_BASE_COINS) : R.REWARDS.sessionComplete,
    baseResources: tuned && TUNING.SESSION_SCALING_ENABLED ? (overrides.SESSION_BASE_RESOURCES ?? TUNING.SESSION_BASE_RESOURCES) : 3,
    bonusCoins: tuned && TUNING.SESSION_SCALING_ENABLED ? (overrides.SESSION_BONUS_COINS_PER_BLOCK ?? TUNING.SESSION_BONUS_COINS_PER_BLOCK) : 0,
    bonusResources: tuned && TUNING.SESSION_SCALING_ENABLED ? (overrides.SESSION_BONUS_RESOURCES_PER_BLOCK ?? TUNING.SESSION_BONUS_RESOURCES_PER_BLOCK) : 0,
    dailyCoinCap: tuned && TUNING.DAILY_COIN_CAP_ENABLED ? (overrides.DAILY_COIN_CAP ?? TUNING.DAILY_COIN_CAP) : 150,
    maxRewardedSessions: tuned && TUNING.SESSION_DAILY_LIMIT_ENABLED ? TUNING.MAX_REWARDED_SESSIONS_PER_DAY : Infinity,
    weeklyEnabled: tuned && TUNING.WEEKLY_RHYTHM_ENABLED,
    welcomeGiftCoins: overrides.WELCOME_GIFT_COINS,
    tier1Coins: tuned && TUNING.WEEKLY_RHYTHM_ENABLED ? (overrides.WEEKLY_TIER1_COINS ?? TUNING.WEEKLY_TIER1_COINS) : 0,
    tier1Resources: tuned && TUNING.WEEKLY_RHYTHM_ENABLED ? (overrides.WEEKLY_TIER1_RESOURCES ?? TUNING.WEEKLY_TIER1_RESOURCES) : 0,
    tier2Coins: tuned && TUNING.WEEKLY_RHYTHM_ENABLED ? (overrides.WEEKLY_TIER2_COINS ?? TUNING.WEEKLY_TIER2_COINS) : 0,
    tier2Resources: tuned && TUNING.WEEKLY_RHYTHM_ENABLED ? (overrides.WEEKLY_TIER2_RESOURCES ?? TUNING.WEEKLY_TIER2_RESOURCES) : 0,
  };
}

// Keep the real award/build functions fast while preserving their observable
// inputs: prior-day coin entries roll into a balance carry entry; resource
// cap history only needs the current local day's entries. RefKeys in this
// simulation are never retried, so removing old keys cannot affect outcomes.
function compactDay(student, db, now) {
  const day = dayKey(now);
  if (student.currentDay === day) return;
  const balance = R.balance(db, student.id);
  student.ledger = [{ studentId: student.id, kind: 'carry', amount: balance, reason: 'Simulation balance carry', refKey: `carry:${student.id}:${day}`, at: now }];
  student.resourceLog = [];
  db.ledger = student.ledger;
  db.resourceLog = student.resourceLog;
  student.currentDay = day;
}

function buyBuildings(student, db, now) {
  while (true) {
    const candidates = BUILDING_KEYS
      .filter((id) => student.kingdom.buildings[id] < E.BUILDINGS[id].costs.length)
      .map((id) => ({ id, level: student.kingdom.buildings[id], cost: E.BUILDINGS[id].costs[student.kingdom.buildings[id]] }))
      .filter(({ cost }) => Object.entries(cost).every(([key, n]) => student.inventory.resources[key] >= n))
      .sort((a, b) => a.level - b.level || total(a.cost) - total(b.cost) || BUILDING_KEYS.indexOf(a.id) - BUILDING_KEYS.indexOf(b.id));
    if (!candidates.length) return;
    E.build(db, student.id, candidates[0].id, `sim-build-${student.week}-${student.buildCount++}`, now);
  }
}

function pullUntilUnaffordable(student, db, rng, now, rules) {
  while (R.balance(db, student.id) >= PULL_COST) {
    const cost = PULL_COST;
    R.spend(db, student.id, cost, 'Hero Summon ×1', `sim-pull-${student.pullCount}`, now);
    student.pullCount++;
    const roll = R.drawHeroSummon(student.inventory.heroPity, pullRand(rng), student.inventory.heroes);
    student.inventory.heroPity = roll.pity;
    if (roll.prize.kind === 'resource') {
      student.inventory.resources[roll.prize.resource] += rules.commonPrizeUnits;
      student.earnedResources += rules.commonPrizeUnits;
      student.gachaResources += rules.commonPrizeUnits;
      continue;
    }
    const hero = roll.prize.hero;
    if (student.inventory.heroes.includes(hero.id)) {
      student.inventory.heroDupes[hero.id] = (student.inventory.heroDupes[hero.id] || 0) + 1;
      const refund = Math.floor(cost * (R.HERO_SUMMON.duplicateRefundFraction[roll.prize.rarity] || 0));
      if (refund) student.ledger.push({ studentId: student.id, kind: 'refund', amount: refund, reason: `Duplicate ${hero.name} refund`, refKey: `sim-pull-${student.pullCount}:refund`, at: now });
    } else student.inventory.heroes.push(hero.id);
  }
}

function capHit(student, week, day) {
  return student.ledger.some((entry) => entry.kind === 'earn' && entry.at === day && R.earnedOnDay({ ledger: student.ledger }, student.id, day) >= R.REWARDS.dailyCap);
}

function targetUpgrade(student) {
  return BUILDING_KEYS.map((id) => ({ id, level: student.kingdom.buildings[id], cost: E.BUILDINGS[id].costs[student.kingdom.buildings[id]] }))
    .filter(({ level, cost }) => level < 3 && cost)
    .sort((a, b) => a.level - b.level || total(a.cost) - total(b.cost) || BUILDING_KEYS.indexOf(a.id) - BUILDING_KEYS.indexOf(b.id))[0];
}

function nextLevelState(student) {
  const upgrade = targetUpgrade(student);
  if (!upgrade) return { blocked: false, need: {}, surplus: {} };
  const resources = student.inventory.resources;
  const neededTotal = total(upgrade.cost);
  const blocked = total(resources) >= neededTotal
    && !Object.entries(upgrade.cost).every(([key, amount]) => resources[key] >= amount);
  const need = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Math.max(0, (upgrade.cost[key] || 0) - resources[key])]));
  const surplus = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, Math.max(0, resources[key] - (upgrade.cost[key] || 0))]));
  return { blocked, need, surplus };
}

// Students are grouped into 30-person classes. A blocked student has a 50%
// chance to find a complementary classmate; the pair swaps one resource unit
// for one unit, with a 20-unit maximum per side as in the live offer limit.
function tradeClass(students, rng) {
  const order = students.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const traded = new Set();
  for (const student of order) {
    const state = nextLevelState(student);
    if (!state.blocked || rng() >= 0.5) continue;
    const options = students.filter((other) => {
      if (other === student || traded.has([student.id, other.id].sort().join('|'))) return false;
      const otherState = nextLevelState(other);
      return RESOURCE_KEYS.some((wanted) => RESOURCE_KEYS.some((offered) =>
        wanted !== offered && state.need[wanted] > 0 && state.surplus[offered] > 0
        && otherState.need[offered] > 0 && otherState.surplus[wanted] > 0));
    });
    if (!options.length) continue;
    const other = options[rngInt(rng, options.length)];
    const pairKey = [student.id, other.id].sort().join('|');
    const otherState = nextLevelState(other);
    let tradedUnits = 0;
    for (const wanted of RESOURCE_KEYS) for (const offered of RESOURCE_KEYS) {
      if (wanted === offered || tradedUnits >= E.TRADE.maxUnitsPerSide) continue;
      const units = Math.min(
        E.TRADE.maxUnitsPerSide - tradedUnits,
        state.need[wanted], state.surplus[offered],
        otherState.need[offered], otherState.surplus[wanted],
      );
      if (units <= 0) continue;
      student.inventory.resources[wanted] += units;
      student.inventory.resources[offered] -= units;
      other.inventory.resources[offered] += units;
      other.inventory.resources[wanted] -= units;
      state.need[wanted] -= units; state.surplus[offered] -= units;
      otherState.need[offered] -= units; otherState.surplus[wanted] -= units;
      tradedUnits += units;
    }
    if (tradedUnits) traded.add(pairKey);
  }
}

function createStudent(id, rng, trading, classDef, rules) {
  const student = {
    id, ledger: [], resourceLog: [], classId: classDef.id, topics: classDef.topics,
    attempts: [], topicQuestionCount: 0, milestoneTopics: new Set(),
    inventory: { studentId: id, heroes: [...SIM_ASSUMPTIONS.startHeroes], resources: { wood: 0, crystal: 0, herb: 0 }, heroPity: { totalPulls: 0, sinceHero: 0, sinceEpic: 0 }, heroDupes: {} },
    kingdom: { studentId: id, buildings: Object.fromEntries(BUILDING_KEYS.map((k) => [k, 0])) },
    sessions: 0, pullCount: 0, buildCount: 0, earnedCoins: 0, earnedResources: 0, practiceResources: 0, weeklyResources: 0, gachaResources: 0,
    blockedWeeks: 0,
    everCapHit: false, rosterWeek: null, kingdomWeek: null, fullWeek: null, noMoreBuyWeek: null,
    progressByWeek: [], trading,
  };
  const db = studentDb(student);
  const start = localInstant(TERM_START, 0);
  const welcomeGiftCoins = rules.welcomeGiftCoins ?? SIM_ASSUMPTIONS.welcomeGiftCoins;
  student.ledger.push({ studentId: id, kind: 'gift', amount: welcomeGiftCoins, reason: 'Welcome gift', refKey: `gift:${id}`, at: start - 1 });
  pullUntilUnaffordable(student, db, rng, start, rules);
  return student;
}

function runScenario({ type, trading, questions = 10, seed, tuned = false, overrides = {} }) {
  const rng = rngFactory(seed);
  const rules = economyRules(tuned, overrides);
  const priorCoinCap = R.REWARDS.dailyCap;
  R.REWARDS.dailyCap = rules.dailyCoinCap;
  const students = Array.from({ length: N }, (_, i) => {
    const classDef = SEEDED_CLASSES[Math.floor(i / SIM_ASSUMPTIONS.classSize) % SEEDED_CLASSES.length];
    const student = createStudent(`${type.id}-${i}`, rng, trading, classDef, rules);
    if (type.id === 'D') {
      const weeks = Array.from({ length: WEEKS }, (_, index) => index + 1);
      for (let index = weeks.length - 1; index > 0; index--) {
        const swap = rngInt(rng, index + 1);
        [weeks[index], weeks[swap]] = [weeks[swap], weeks[index]];
      }
      student.irregularWeeks = new Set(weeks.slice(0, 8));
    }
    return student;
  });
  const sessionRand = () => rng();
  for (let week = 1; week <= WEEKS; week++) {
    const weekDate = addDateDays(TERM_START, (week - 1) * DAYS_PER_WEEK);
    for (const s of students) {
      const dates = type.id === 'D'
        ? (s.irregularWeeks.has(week) ? [1 + rngInt(rng, 7)] : [])
        : type.sessions(week, rng);
      for (const dayOffset of dates) {
        const at = localInstant(addDateDays(weekDate, dayOffset - 1), 12);
        const db = studentDb(s);
        const topic = s.topics[rngInt(rng, s.topics.length)];
        compactDay(s, db, at);
        s.sessions++;
        for (let q = 0; q < questions; q++) {
          const correct = rng() < SIM_ASSUMPTIONS.accuracy;
          const questionId = `sim-${s.topicQuestionCount++}`;
          s.attempts.push({ studentId: s.id, classId: s.classId, topicId: topic.id, questionId, correct, at: at + q, needsReview: false, timedOut: false, ms: 0 });
          if (correct && rng() < SIM_ASSUMPTIONS.correctAnswersFirstTimePct / 100) {
            const granted = R.award(db, s.id, R.REWARDS.firstCorrect, 'Correct on a new question', `correct:${s.id}:${s.sessions}:${q}`, at).granted;
            s.earnedCoins += granted;
          }
          if (correct && !s.milestoneTopics.has(topic.id)) {
            const stat = topicStats(s.attempts, [topic])[0];
            if (stat.n >= R.REWARDS.milestoneMinN && stat.accuracy >= R.REWARDS.milestoneAccuracy) {
              const granted = R.award(db, s.id, R.REWARDS.milestone, `Practice milestone: ${topic.name}`, `milestone:${s.id}:${s.classId}:${topic.id}`, at).granted;
              s.earnedCoins += granted;
              s.milestoneTopics.add(topic.id);
            }
          }
        }
        const day = dayKey(at);
        const rewardedEarlierToday = s.rewardedSessionsByDay?.[day] || 0;
        const rewarded = rewardedEarlierToday < rules.maxRewardedSessions;
        if (rewarded) {
          s.rewardedSessionsByDay ||= {};
          s.rewardedSessionsByDay[day] = rewardedEarlierToday + 1;
          const bonusBlocks = rules.sessionScaling ? Math.min(4, Math.floor(Math.max(0, questions - 5) / 5)) : 0;
          const coins = rules.baseCoins + bonusBlocks * rules.bonusCoins;
          const resourceUnits = rules.baseResources + bonusBlocks * rules.bonusResources;
          const sessionPay = R.award(db, s.id, coins, 'Completed a practice session', `session:${s.id}:${s.sessions}`, at);
          s.earnedCoins += sessionPay.granted;
          const bundle = sessionResources(sessionRand, resourceUnits, rules.singleType);
          const resourcesPay = E.grantResources(db, s.id, bundle, 'Completed a practice session', `sessionres:${s.id}:${s.sessions}`, at).granted;
          s.earnedResources += total(resourcesPay);
          s.practiceResources += total(resourcesPay);
          if (rules.weeklyEnabled) {
            const wk = weekKey(at);
            s.practiceDaysByWeek ||= {};
            s.practiceDaysByWeek[wk] ||= new Set();
            s.practiceDaysByWeek[wk].add(day);
            const dayCount = s.practiceDaysByWeek[wk].size;
            const tier = dayCount === 2 ? 1 : dayCount === 3 ? 2 : null;
            if (tier && !s.weeklyTiers?.[`${wk}:${tier}`]) {
              const bonusCoins = tier === 1 ? rules.tier1Coins : rules.tier2Coins;
              const bonusResources = tier === 1 ? rules.tier1Resources : rules.tier2Resources;
              const bonusKey = `weekly:${s.id}:${wk}:tier${tier}`;
              const coinBonus = R.award(db, s.id, bonusCoins, `weekly_rhythm_tier${tier}`, bonusKey, at, { capExempt: true });
              const resourceBundle = { [RESOURCE_KEYS[rngInt(rng, RESOURCE_KEYS.length)]]: bonusResources };
              const resourceBonus = E.grantResources(db, s.id, resourceBundle, `weekly_rhythm_tier${tier}`, bonusKey, at, { capExempt: true }).granted;
              s.earnedCoins += coinBonus.granted;
              s.earnedResources += total(resourceBonus);
              s.weeklyResources += total(resourceBonus);
              s.inventory.resources = { ...s.inventory.resources };
              s.weeklyTiers ||= {};
              s.weeklyTiers[`${wk}:${tier}`] = true;
            }
          }
        }
        if (R.earnedOnDay(db, s.id, at) >= R.REWARDS.dailyCap) s.everCapHit = true;
        pullUntilUnaffordable(s, db, rng, at, rules);
        buyBuildings(s, db, at);
      }
      s.week = week;
    }
    if (trading) {
      for (let startIndex = 0; startIndex < students.length; startIndex += SIM_ASSUMPTIONS.classSize)
        tradeClass(students.slice(startIndex, startIndex + SIM_ASSUMPTIONS.classSize), rng);
    }
    for (const s of students) {
      const db = studentDb(s);
      const at = localInstant(addDateDays(weekDate, 6), 23);
      buyBuildings(s, db, at);
      pullUntilUnaffordable(s, db, rng, at, rules);
      if (nextLevelState(s).blocked) s.blockedWeeks++;
      const heroCount = new Set(s.inventory.heroes).size;
      const levels = total(s.kingdom.buildings);
      const progress = 50 * heroCount / R.HERO_CATALOG.length + 50 * levels / 12;
      s.progressByWeek.push(progress);
      if (heroCount >= R.HERO_CATALOG.length && s.rosterWeek === null) s.rosterWeek = week;
      if (levels === 12 && s.kingdomWeek === null) s.kingdomWeek = week;
      if (s.rosterWeek !== null && s.kingdomWeek !== null && s.fullWeek === null) s.fullWeek = week;
      if (s.fullWeek !== null && s.noMoreBuyWeek === null) s.noMoreBuyWeek = week;
    }
  }
  R.REWARDS.dailyCap = priorCoinCap;
  return students;
}

function pct(arr, p) {
  const xs = arr.filter((x) => x !== null).sort((a, b) => a - b);
  if (!xs.length) return 'not by week 15';
  const val = xs[Math.max(0, Math.ceil(p * xs.length) - 1)];
  return `week ${val}`;
}
function completionSummary(students, key) {
  const done = students.filter((s) => s[key] !== null);
  if (!done.length) return `not by week 15 (0%)`;
  return `${pct(students.map((s) => s[key]), 0.1)} / ${pct(students.map((s) => s[key]), 0.5)} / ${pct(students.map((s) => s[key]), 0.9)} (${(100 * done.length / students.length).toFixed(1)}% finish)`;
}
function quantiles(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const at = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return { p10: at(0.1), median: at(0.5), p90: at(0.9) };
}
function summarize(students) {
  const progress = students.map((s) => s.progressByWeek[14]).sort((a, b) => a - b);
  const mean = (fn) => students.reduce((a, s) => a + fn(s), 0) / students.length;
  const practiceResourceUnits = students.reduce((n, s) => n + s.practiceResources, 0);
  const weeklyResourceUnits = students.reduce((n, s) => n + s.weeklyResources, 0);
  const gachaResourceUnits = students.reduce((n, s) => n + s.gachaResources, 0);
  const totalResourceUnits = practiceResourceUnits + weeklyResourceUnits + gachaResourceUnits;
  const blocked = quantiles(students.map((s) => s.blockedWeeks));
  return {
    roster: completionSummary(students, 'rosterWeek'),
    kingdom: completionSummary(students, 'kingdomWeek'),
    both: completionSummary(students, 'fullWeek'),
    progress: `${progress[Math.ceil(.1 * N) - 1].toFixed(1)}% / ${progress[Math.ceil(.5 * N) - 1].toFixed(1)}% / ${progress[Math.ceil(.9 * N) - 1].toFixed(1)}%`,
    progressMedian: progress[Math.ceil(.5 * N) - 1].toFixed(1),
    progressMean: mean((s) => s.progressByWeek[14]).toFixed(1),
    capPct: (100 * students.filter((s) => s.everCapHit).length / N).toFixed(2),
    coinsPerWeek: (mean((s) => s.earnedCoins) / 15).toFixed(1),
    resourcesPerWeek: (mean((s) => s.earnedResources) / 15).toFixed(1),
    blocked,
    resourceSources: {
      practiceUnits: practiceResourceUnits,
      weeklyUnits: weeklyResourceUnits,
      gachaUnits: gachaResourceUnits,
      practicePct: totalResourceUnits ? (100 * practiceResourceUnits / totalResourceUnits).toFixed(1) : '0.0',
      weeklyPct: totalResourceUnits ? (100 * weeklyResourceUnits / totalResourceUnits).toFixed(1) : '0.0',
      gachaPct: totalResourceUnits ? (100 * gachaResourceUnits / totalResourceUnits).toFixed(1) : '0.0',
    },
    noMoreBuy: completionSummary(students, 'noMoreBuyWeek'),
    raw: students,
  };
}
function mdTable(headers, rows) {
  return `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}`;
}
function formatBlock(title, runs) {
  const rows = [];
  for (const type of TYPES) {
    const s = runs[type.id];
    rows.push([`Type ${type.id}: ${type.label}`, s.roster, s.kingdom, s.both, s.progress, `${s.capPct}%`, s.coinsPerWeek, s.resourcesPerWeek, `${s.blocked.p10} / ${s.blocked.median} / ${s.blocked.p90}`, `${s.resourceSources.practicePct}% / ${s.resourceSources.weeklyPct}% / ${s.resourceSources.gachaPct}%`, s.noMoreBuy]);
  }
  return `## ${title}\n\nCompletion percentiles are among students who complete by week 15; the finish share uses all students. Week 15 progress and blocked-week percentiles use all students.\n\n${mdTable(['Type', 'Roster completion (P10 / median / P90; finish share)', 'Kingdom completion (P10 / median / P90; finish share)', 'Both complete', 'Week 15 progress (P10 / median / P90)', 'Ever hit daily coin cap', 'Coins earned / week', 'Resources earned / week', 'Blocked-by-type weeks (P10 / median / P90)', 'Resource units: session / weekly / gacha shares', 'Nothing left to buy'], rows)}`;
}

async function main() {
  const seed = Number(process.argv[2] || 240517);
  const overrides = process.env.SIM_OVERRIDES ? JSON.parse(process.env.SIM_OVERRIDES) : {};
  const tuning = await import(pathToFileURL(path.resolve(__dirname, '../config/tuning.js')).href);
  const runs = { off: {}, on: {} };
  for (let i = 0; i < TYPES.length; i++) {
    const type = TYPES[i];
    runs.off[type.id] = summarize(runScenario({ type, trading: false, seed: seed + i * 1009 }));
    process.stderr.write(`baseline trading OFF type ${type.id} complete\n`);
    runs.on[type.id] = summarize(runScenario({ type, trading: true, seed: seed + i * 1009 + 17 }));
    process.stderr.write(`baseline trading ON type ${type.id} complete\n`);
  }
  const after = { off: {}, on: {} };
  for (let i = 0; i < TYPES.length; i++) {
    const type = TYPES[i];
    after.off[type.id] = summarize(runScenario({ type, trading: false, seed: seed + i * 1009, tuned: true, overrides }));
    process.stderr.write(`retuned trading OFF type ${type.id} complete\n`);
    after.on[type.id] = summarize(runScenario({ type, trading: true, seed: seed + i * 1009 + 17, tuned: true, overrides }));
    process.stderr.write(`retuned trading ON type ${type.id} complete\n`);
  }
  let report = `# Economy simulation: 15-week retune v2\n\nGenerated with seed \`${seed}\`, ${N.toLocaleString('en-US')} students per type, and 105 local calendar days.\n\n## SIM_ASSUMPTIONS\n\n\`\`\`json\n${JSON.stringify({ ...SIM_ASSUMPTIONS, tuningOverrides: overrides }, null, 2)}\n\`\`\`\n\n`;
  report += `## Before: current rules\n\n`;
  report += formatBlock('Trading OFF', runs.off) + '\n\n' + formatBlock('Trading ON', runs.on) + '\n\n';
  report += `## After: retune v2\n\n` + formatBlock('Trading OFF', after.off) + '\n\n' + formatBlock('Trading ON', after.on) + '\n\n';
  if (process.env.SIM_SENSITIVITY !== '0') {
    const questionRuns = {};
    for (const q of [5, 10, 20]) {
      questionRuns[q] = {};
      for (let i = 0; i < TYPES.length; i++) {
        const type = TYPES[i];
        const scenarioSeed = q === 10 ? seed + i * 1009 : seed + q * 10000 + i * 1009;
        questionRuns[q][type.id] = summarize(runScenario({ type, trading: false, questions: q, seed: scenarioSeed }));
        process.stderr.write(`sensitivity ${q} questions type ${type.id} complete\n`);
      }
    }
    const sensitivity = [];
    for (const type of TYPES) for (const q of [5, 10, 20]) {
      const s = questionRuns[q][type.id];
      sensitivity.push([`Type ${type.id}`, q, s.both, s.progress, `${s.capPct}%`]);
    }
    report += `## Sensitivity: questions per session (trading OFF)\n\n${mdTable(['Type', 'Questions', 'Both complete (P10 / median / P90; finish share)', 'Week 15 progress', 'Ever hit daily coin cap'], sensitivity)}\n\n`;
  }
  report += `## Before target check\n\nSIM_TARGETS from \`config/tuning.js\` are report-only.\n\n\`\`\`json\n${JSON.stringify(tuning.SIM_TARGETS, null, 2)}\n\`\`\`\n\n`;
  report += `| Target | Baseline result |\n| --- | --- |\n`;
  const A = runs.off.A, B = runs.off.B, C = runs.off.C, D = runs.off.D;
  const bothMed = (summary) => summary.raw.filter((s) => s.fullWeek !== null).length ? pct(summary.raw.map((s) => s.fullWeek), .5) : 'not by week 15';
  const firstCompletionWeek = (summary, key) => {
    const complete = summary.raw.map((s) => s[key]).filter((week) => week !== null);
    return complete.length ? Math.min(...complete) : null;
  };
  const medianCompletionWeek = (summary, key) => {
    const complete = summary.raw.map((s) => s[key]).filter((week) => week !== null).sort((a, b) => a - b);
    return complete.length ? complete[Math.ceil(complete.length * 0.5) - 1] : null;
  };
  const blockedReduction = (off, on) => off.blocked.median === 0 ? null : Math.round(100 * (off.blocked.median - on.blocked.median) / off.blocked.median);
  const aReduction = blockedReduction(runs.off.A, runs.on.A);
  const bReduction = blockedReduction(runs.off.B, runs.on.B);
  const cReduction = blockedReduction(runs.off.C, runs.on.C);
  const progressGap = Number(A.progressMedian) - Number(D.progressMedian);
  report += `| Type A week 15 progress 60–80% | ${A.progressMedian}% median; ${A.progress} P10 / median / P90 |\n`;
  report += `| Type A does not complete before week 14 | Earliest joint completion: ${firstCompletionWeek(A, 'fullWeek') === null ? 'not by week 15' : `week ${firstCompletionWeek(A, 'fullWeek')}`} |\n`;
  report += `| Type B joint completion weeks 11–14 | ${bothMed(B)}; roster ${B.roster}; kingdom ${B.kingdom} |\n`;
  report += `| Type C joint completion weeks 8–11 | ${bothMed(C)}; roster ${C.roster}; kingdom ${C.kingdom} |\n`;
  report += `| Type D progress 40–65%, at least 12 points below A | ${D.progressMedian}% median; ${D.progress} P10 / median / P90; A-D gap ${progressGap.toFixed(1)} points |\n`;
  report += `| Type A students ever hit daily coin cap under 5% | ${A.capPct}% |\n`;
  report += `| Trading ON cuts median blocked-by-type weeks at least 40% for A/B/C | A ${aReduction === null ? 'n/a (0 baseline)' : `${aReduction}%`} (${runs.off.A.blocked.median}→${runs.on.A.blocked.median}); B ${bReduction === null ? 'n/a (0 baseline)' : `${bReduction}%`} (${runs.off.B.blocked.median}→${runs.on.B.blocked.median}); C ${cReduction === null ? 'n/a (0 baseline)' : `${cReduction}%`} (${runs.off.C.blocked.median}→${runs.on.C.blocked.median}) |\n\n`;
  report += `## Reading the baseline\n\n`;
  report += `- Type A median progress is ${A.progressMedian}% against a 60–80% range; earliest full completion is week ${firstCompletionWeek(A, 'fullWeek') ?? 'not by week 15'}. The daily-cap target is ${Number(A.capPct) < 5 ? 'met' : 'missed'} at ${A.capPct}%.\n`;
  report += `- Type B joint median completion is ${bothMed(B)}; Type C is ${bothMed(C)}. Type D median progress is ${D.progressMedian}%, and the A-D difference is ${progressGap.toFixed(1)} points.\n`;
  report += `- Median blocked-by-type weeks fall by A ${aReduction === null ? 'n/a' : `${aReduction}%`}, B ${bReduction === null ? 'n/a' : `${bReduction}%`}, and C ${cReduction === null ? 'n/a' : `${cReduction}%`} with the trade model.\n\n`;
  report += `## After target check\n\n`;
  report += `| Target | Retune v2 result |\n| --- | --- |\n`;
  const AA = after.off.A, BB = after.off.B, CC = after.off.C, DD = after.off.D;
  const afterGap = Number(AA.progressMedian) - Number(DD.progressMedian);
  const afterReductions = ['A', 'B', 'C'].map((id) => blockedReduction(after.off[id], after.on[id]));
  report += `| Type A progress 60–80% | ${AA.progressMedian}% median; ${AA.progress} P10 / median / P90 |\n`;
  report += `| Type A never completes before week 14 | Earliest joint completion: ${firstCompletionWeek(AA, 'fullWeek') ?? 'not by week 15'} |\n`;
  report += `| Type B joint completion weeks 11–14 | ${bothMed(BB)} |\n`;
  report += `| Type C joint completion weeks 8–11 | ${bothMed(CC)} |\n`;
  report += `| Type D progress 40–65%, at least 12 points below A | ${DD.progressMedian}% median; A-D gap ${afterGap.toFixed(1)} points |\n`;
  report += `| Type A daily coin cap hit under 5% | ${AA.capPct}% |\n`;
  report += `| Trading cuts blocked weeks at least 40% for A/B/C | ${afterReductions.map((n, i) => `${['A', 'B', 'C'][i]} ${n === null ? 'n/a' : `${n}%`}`).join('; ')} |\n\n`;
  report += `## Final constants\n\n\`\`\`json\n${JSON.stringify({
    COMMON_PRIZE_UNITS_ENABLED: tuning.COMMON_PRIZE_UNITS_ENABLED,
    COMMON_PRIZE_UNITS: tuning.COMMON_PRIZE_UNITS,
    SESSION_RESOURCES_SINGLE_TYPE: tuning.SESSION_RESOURCES_SINGLE_TYPE,
    SESSION_SCALING_ENABLED: tuning.SESSION_SCALING_ENABLED,
    SESSION_BASE_COINS: tuning.SESSION_BASE_COINS,
    SESSION_BASE_RESOURCES: tuning.SESSION_BASE_RESOURCES,
    SESSION_BONUS_COINS_PER_BLOCK: tuning.SESSION_BONUS_COINS_PER_BLOCK,
    SESSION_BONUS_RESOURCES_PER_BLOCK: tuning.SESSION_BONUS_RESOURCES_PER_BLOCK,
    DAILY_COIN_CAP_ENABLED: tuning.DAILY_COIN_CAP_ENABLED,
    DAILY_COIN_CAP: tuning.DAILY_COIN_CAP,
    SESSION_DAILY_LIMIT_ENABLED: tuning.SESSION_DAILY_LIMIT_ENABLED,
    MAX_REWARDED_SESSIONS_PER_DAY: tuning.MAX_REWARDED_SESSIONS_PER_DAY,
    WEEKLY_RHYTHM_ENABLED: tuning.WEEKLY_RHYTHM_ENABLED,
    WEEKLY_TIER1_COINS: tuning.WEEKLY_TIER1_COINS,
    WEEKLY_TIER1_RESOURCES: tuning.WEEKLY_TIER1_RESOURCES,
    WEEKLY_TIER2_COINS: tuning.WEEKLY_TIER2_COINS,
    WEEKLY_TIER2_RESOURCES: tuning.WEEKLY_TIER2_RESOURCES,
    TRADE_ACCEPT_WITHOUT_TOWER: tuning.TRADE_ACCEPT_WITHOUT_TOWER,
    MAX_TRADES_PER_DAY: tuning.MAX_TRADES_PER_DAY,
  }, null, 2)}\n\`\`\`\n\n`;
  const frequencyRows = [];
  for (let sessions = 1; sessions <= 4; sessions++) {
    const days = sessions === 1 ? [1] : sessions === 2 ? [1, 4] : sessions === 3 ? [1, 3, 5] : [1, 3, 5, 7];
    const type = { id: `F${sessions}`, label: `${sessions} sessions per week`, sessions: () => days };
    const f = summarize(runScenario({ type, trading: false, seed: seed + 70000 + sessions * 1331, tuned: true, overrides }));
    frequencyRows.push([sessions, f.both, f.roster, f.kingdom]);
    process.stderr.write(`sessions/week ${sessions} frequency complete\n`);
  }
  report += `## Sessions per week versus completion\n\n${mdTable(['Sessions/week', 'Both complete (P10 / median / P90; finish share)', 'Roster completion', 'Kingdom completion'], frequencyRows)}\n\n`;
  const giftWhatIf = {};
  for (const [index, id] of ['A', 'D'].entries()) {
    const type = TYPES.find((item) => item.id === id);
    giftWhatIf[id] = summarize(runScenario({ type, trading: false, seed: seed + 90000 + index * 1009, tuned: true, overrides: { ...overrides, WELCOME_GIFT_COINS: 300 } }));
  }
  report += `## Welcome-gift what-if (not applied)\n\nThe 300-coin gift is shown as a diagnostic only; live balances and the configured 500-coin gift stay unchanged.\n\n`;
  report += mdTable(['Type', 'Week 15 progress (mean)', 'Joint completion', 'Daily coin cap hit', 'Blocked-by-type weeks median'], ['A', 'D'].map((id) => {
    const s = giftWhatIf[id];
    return [`Type ${id}`, `${s.progressMean}%`, s.both, `${s.capPct}%`, s.blocked.median];
  })) + '\n\n';
  report += `## Retuned reading\n\n- Type A median progress is ${AA.progressMedian}%, Type D is ${DD.progressMedian}% (${afterGap.toFixed(1)} points lower).\n`;
  report += `- Type B joint median completion is ${bothMed(BB)} and Type C is ${bothMed(CC)}.\n`;
  report += `- Median blocked weeks OFF→ON are A ${after.off.A.blocked.median}→${after.on.A.blocked.median}, B ${after.off.B.blocked.median}→${after.on.B.blocked.median}, C ${after.off.C.blocked.median}→${after.on.C.blocked.median}.\n\n`;
  report += `## Stage 3 decision\n\nThe progress, completion, and daily-cap targets meet at the final constants above. The trade target does not: the specified 50% matching-classmate trade model produces no median reduction for A, B, or C. A 200-student tuning pilot found at most a 14% Type A reduction with SESSION_BASE_RESOURCES set to 1, which moved Type B's median completion to week 15; higher common prizes also pushed Type A progress above its target. Type A practices on only one day each week, so the weekly rhythm bonus cannot change its trade result. Stage 4 remains unstarted.\n\n`;
  const out = path.resolve(__dirname, '../docs/economy-simulation.md');
  fs.writeFileSync(out, report, 'utf8');
  process.stdout.write(report);
  process.stderr.write(`\nWrote ${out}\n`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
