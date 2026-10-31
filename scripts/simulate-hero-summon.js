#!/usr/bin/env node
// Monte Carlo check for the configured summon rates and fresh-hero behavior.
// Run with: node scripts/simulate-hero-summon.js

const { GAME_CONFIG } = require('../public/hero-lab/game-config.js');
const { HERO_CATALOG, drawHeroSummon } = require('../src/quiz/rewards.js');

const PLAYER_COUNT = 100_000;
const STARTERS = GAME_CONFIG.arenaTuning.progression.newPlayerHeroes;
const targetCount = HERO_CATALOG.length;
let seed = 0x516ac;
let firstFiveStarPulls = 0;
let fullRosterPulls = 0;
let totalPulls = 0;
let heroPityPulls = 0;
let fiveStarPityPulls = 0;
let playersWithHeroPity = 0;
let playersWithFiveStarPity = 0;

function randomInt(max) {
  // Deterministic xorshift32 keeps runs reproducible and avoids crypto overhead.
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) % max;
}

for (let player = 0; player < PLAYER_COUNT; player++) {
  const owned = new Set(STARTERS);
  let pity = { totalPulls: 0, sinceHero: 0, sinceEpic: 0 };
  let firstFiveStar = 0;
  let heroPityHit = false;
  let fiveStarPityHit = false;

  while (owned.size < targetCount) {
    const epicDue = pity.sinceEpic + 1 >= GAME_CONFIG.heroSummon.epicPityPulls;
    const heroDue = pity.sinceHero + 1 >= GAME_CONFIG.heroSummon.heroPityPulls;
    if (epicDue) {
      fiveStarPityPulls++;
      fiveStarPityHit = true;
    } else if (heroDue) {
      heroPityPulls++;
      heroPityHit = true;
    }

    const roll = drawHeroSummon(pity, randomInt, [...owned]);
    pity = roll.pity;
    totalPulls++;
    if (roll.prize.rarity === 'epic' && !firstFiveStar) firstFiveStar = pity.totalPulls;
    if (roll.prize.kind === 'hero') owned.add(roll.prize.hero.id);
    if (pity.totalPulls > 10_000) throw new Error('Simulation exceeded the pull safety limit.');
  }

  firstFiveStarPulls += firstFiveStar;
  fullRosterPulls += pity.totalPulls;
  if (heroPityHit) playersWithHeroPity++;
  if (fiveStarPityHit) playersWithFiveStarPity++;
}

const totalPityPulls = heroPityPulls + fiveStarPityPulls;
const report = {
  virtualPlayers: PLAYER_COUNT,
  starters: STARTERS,
  missingHeroes: targetCount - STARTERS.length,
  averagePullsToFirst5Star: Number((firstFiveStarPulls / PLAYER_COUNT).toFixed(2)),
  fiveStarPityTriggered: `${playersWithFiveStarPity} players (${(playersWithFiveStarPity * 100 / PLAYER_COUNT).toFixed(2)}%); ${fiveStarPityPulls} pulls`,
  heroPityTriggered: `${playersWithHeroPity} players (${(playersWithHeroPity * 100 / PLAYER_COUNT).toFixed(2)}%); ${heroPityPulls} pulls`,
  pityShareOfAllPulls: `${(totalPityPulls * 100 / totalPulls).toFixed(2)}%`,
  averagePullsToFullRoster: Number((fullRosterPulls / PLAYER_COUNT).toFixed(2)),
};

console.log(JSON.stringify(report, null, 2));
