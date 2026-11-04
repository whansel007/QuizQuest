# Economy simulation: 15-week retune v2

Generated with seed `240517`, 2,000 students per type, and 105 local calendar days.

## SIM_ASSUMPTIONS

```json
{
  "studentsPerType": 2000,
  "weeks": 15,
  "days": 105,
  "appTimezone": "Asia/Singapore",
  "questionsPerSession": 10,
  "accuracy": 0.7,
  "frequencySchedules": {
    "typeA": "1 session per week",
    "typeB": "2 sessions per week",
    "typeC": "3 sessions per week",
    "typeD": "exactly 8 of 15 weeks, with one random local practice day in each selected week"
  },
  "correctAnswersFirstTimePct": 80,
  "topicMilestoneCoins": 30,
  "topicMilestoneRule": "Real server rule via topicStats: once per student/class/topic after a correct answer when latest distinct-topic accuracy is at least 80% with at least 5 distinct questions, using at most 10 recent confirmed answers.",
  "topicsPerSeedClass": {
    "cl-a": 3,
    "cl-b": 1,
    "cl-c": 3
  },
  "classSize": 30,
  "welcomeGiftCoins": 500,
  "resourcesPerSession": 3,
  "startHeroes": [
    "sheriff",
    "electromancer"
  ],
  "heroPoolSize": 10,
  "heroRarities": {
    "epic": 4,
    "rare": 6
  },
  "pullPolicy": "Spend on x1 pulls whenever balance is at least one pull; skip heroes already owned.",
  "buildingPolicy": "Buy an affordable next level immediately; prioritize lowest building level, then lower next-level total cost, then library, workshop, garden, tower.",
  "tradingPolicy": "Classes have 30 students (final cohort can be smaller); each blocked student gets one 50% chance per week to find a compatible classmate and trade up to 20 units 1-for-1.",
  "tuningOverrides": {}
}
```

## Before: current rules

## Trading OFF

Completion percentiles are among students who complete by week 15; the finish share uses all students. Week 15 progress and blocked-week percentiles use all students.

| Type | Roster completion (P10 / median / P90; finish share) | Kingdom completion (P10 / median / P90; finish share) | Both complete | Week 15 progress (P10 / median / P90) | Ever hit daily coin cap | Coins earned / week | Resources earned / week | Blocked-by-type weeks (P10 / median / P90) | Resource units: session / weekly / gacha shares | Nothing left to buy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Type A: Once a week | week 5 / week 11 / week 15 (45.7% finish) | week 14 / week 15 / week 15 (2.2% finish) | week 14 / week 15 / week 15 (0.6% finish) | 77.5% / 86.7% / 95.8% | 1.70% | 80.7 | 10.0 | 9 / 14 / 15 | 30.0% / 0.0% / 70.0% | week 14 / week 15 / week 15 (0.6% finish) |
| Type B: Twice a week | week 4 / week 8 / week 13 (95.3% finish) | week 9 / week 11 / week 14 (95.6% finish) | week 9 / week 12 / week 14 (91.2% finish) | 100.0% / 100.0% / 100.0% | 1.00% | 156.5 | 18.1 | 5 / 10 / 13 | 33.2% / 0.0% / 66.8% | week 9 / week 12 / week 14 (91.2% finish) |
| Type C: Three a week | week 3 / week 6 / week 9 (100.0% finish) | week 6 / week 8 / week 10 (100.0% finish) | week 6 / week 8 / week 10 (100.0% finish) | 100.0% / 100.0% / 100.0% | 0.90% | 232.7 | 26.3 | 4 / 6 / 9 | 34.3% / 0.0% / 65.7% | week 6 / week 8 / week 10 (100.0% finish) |
| Type D: Irregular | week 6 / week 11 / week 15 (12.9% finish) | not by week 15 (0%) | not by week 15 (0%) | 64.2% / 72.5% / 79.2% | 1.05% | 44.6 | 6.3 | 8 / 15 / 15 | 25.5% / 0.0% / 74.5% | not by week 15 (0%) |

## Trading ON

Completion percentiles are among students who complete by week 15; the finish share uses all students. Week 15 progress and blocked-week percentiles use all students.

| Type | Roster completion (P10 / median / P90; finish share) | Kingdom completion (P10 / median / P90; finish share) | Both complete | Week 15 progress (P10 / median / P90) | Ever hit daily coin cap | Coins earned / week | Resources earned / week | Blocked-by-type weeks (P10 / median / P90) | Resource units: session / weekly / gacha shares | Nothing left to buy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Type A: Once a week | week 5 / week 11 / week 15 (45.3% finish) | week 14 / week 15 / week 15 (4.5% finish) | week 14 / week 15 / week 15 (1.1% finish) | 78.3% / 87.5% / 95.8% | 1.25% | 80.5 | 10.0 | 7 / 14 / 15 | 30.0% / 0.0% / 70.0% | week 14 / week 15 / week 15 (1.1% finish) |
| Type B: Twice a week | week 4 / week 8 / week 13 (95.7% finish) | week 8 / week 11 / week 14 (95.3% finish) | week 9 / week 11 / week 14 (91.3% finish) | 100.0% / 100.0% / 100.0% | 1.45% | 156.6 | 18.0 | 4 / 9 / 13 | 33.3% / 0.0% / 66.7% | week 9 / week 11 / week 14 (91.3% finish) |
| Type C: Three a week | week 3 / week 6 / week 9 (100.0% finish) | week 6 / week 7 / week 10 (100.0% finish) | week 6 / week 8 / week 10 (100.0% finish) | 100.0% / 100.0% / 100.0% | 0.70% | 232.7 | 26.3 | 3 / 6 / 9 | 34.3% / 0.0% / 65.7% | week 6 / week 8 / week 10 (100.0% finish) |
| Type D: Irregular | week 6 / week 11 / week 15 (13.7% finish) | not by week 15 (0%) | not by week 15 (0%) | 64.2% / 72.5% / 79.2% | 1.20% | 44.5 | 6.3 | 6 / 14 / 15 | 25.6% / 0.0% / 74.4% | not by week 15 (0%) |

## After: retune v2

## Trading OFF

Completion percentiles are among students who complete by week 15; the finish share uses all students. Week 15 progress and blocked-week percentiles use all students.

| Type | Roster completion (P10 / median / P90; finish share) | Kingdom completion (P10 / median / P90; finish share) | Both complete | Week 15 progress (P10 / median / P90) | Ever hit daily coin cap | Coins earned / week | Resources earned / week | Blocked-by-type weeks (P10 / median / P90) | Resource units: session / weekly / gacha shares | Nothing left to buy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Type A: Once a week | week 5 / week 11 / week 15 (44.8% finish) | not by week 15 (0%) | not by week 15 (0%) | 69.2% / 77.5% / 83.3% | 0.00% | 80.6 | 5.8 | 9 / 13 / 15 | 51.7% / 0.0% / 48.3% | not by week 15 (0%) |
| Type B: Twice a week | week 4 / week 8 / week 12 (97.9% finish) | week 13 / week 14 / week 15 (49.7% finish) | week 13 / week 14 / week 15 (48.6% finish) | 91.7% / 95.8% / 100.0% | 0.00% | 171.5 | 13.2 | 8 / 13 / 15 | 45.3% / 15.1% / 39.6% | week 13 / week 14 / week 15 (48.6% finish) |
| Type C: Three a week | week 3 / week 5 / week 8 (100.0% finish) | week 8 / week 10 / week 12 (100.0% finish) | week 8 / week 10 / week 12 (100.0% finish) | 100.0% / 100.0% / 100.0% | 0.00% | 262.7 | 20.7 | 5 / 8 / 11 | 43.5% / 19.3% / 37.2% | week 8 / week 10 / week 12 (100.0% finish) |
| Type D: Irregular | week 6 / week 11 / week 15 (12.6% finish) | not by week 15 (0%) | not by week 15 (0%) | 55.8% / 60.8% / 70.0% | 0.00% | 44.5 | 3.5 | 7 / 13 / 15 | 46.2% / 0.0% / 53.8% | not by week 15 (0%) |

## Trading ON

Completion percentiles are among students who complete by week 15; the finish share uses all students. Week 15 progress and blocked-week percentiles use all students.

| Type | Roster completion (P10 / median / P90; finish share) | Kingdom completion (P10 / median / P90; finish share) | Both complete | Week 15 progress (P10 / median / P90) | Ever hit daily coin cap | Coins earned / week | Resources earned / week | Blocked-by-type weeks (P10 / median / P90) | Resource units: session / weekly / gacha shares | Nothing left to buy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Type A: Once a week | week 5 / week 10 / week 15 (45.9% finish) | not by week 15 (0%) | not by week 15 (0%) | 69.2% / 78.3% / 83.3% | 0.00% | 80.6 | 5.8 | 8 / 13 / 15 | 51.6% / 0.0% / 48.4% | not by week 15 (0%) |
| Type B: Twice a week | week 4 / week 8 / week 12 (98.8% finish) | week 12 / week 14 / week 15 (53.0% finish) | week 12 / week 14 / week 15 (52.3% finish) | 91.7% / 100.0% / 100.0% | 0.00% | 171.4 | 13.2 | 7 / 13 / 15 | 45.4% / 15.1% / 39.5% | week 12 / week 14 / week 15 (52.3% finish) |
| Type C: Three a week | week 2 / week 5 / week 8 (100.0% finish) | week 8 / week 10 / week 12 (99.8% finish) | week 8 / week 10 / week 12 (99.8% finish) | 100.0% / 100.0% / 100.0% | 0.00% | 262.8 | 20.7 | 5 / 8 / 11 | 43.4% / 19.3% / 37.3% | week 8 / week 10 / week 12 (99.8% finish) |
| Type D: Irregular | week 6 / week 11 / week 15 (13.3% finish) | not by week 15 (0%) | not by week 15 (0%) | 55.8% / 60.8% / 70.8% | 0.00% | 44.6 | 3.5 | 5 / 11 / 15 | 46.1% / 0.0% / 53.9% | not by week 15 (0%) |

## Before target check

SIM_TARGETS from `config/tuning.js` are report-only.

```json
{
  "typeA": {
    "progressMin": 60,
    "progressMax": 80,
    "earliestCompletionWeek": 14
  },
  "typeB": {
    "completionWeekMin": 11,
    "completionWeekMax": 14
  },
  "typeC": {
    "completionWeekMin": 8,
    "completionWeekMax": 11
  },
  "typeD": {
    "progressMin": 40,
    "progressMax": 65,
    "pointsBelowTypeAMin": 12
  },
  "typeADailyCoinCapHitMaxPct": 5,
  "tradingBlockedTypeWeekReductionPct": 40
}
```

| Target | Baseline result |
| --- | --- |
| Type A week 15 progress 60–80% | 86.7% median; 77.5% / 86.7% / 95.8% P10 / median / P90 |
| Type A does not complete before week 14 | Earliest joint completion: week 14 |
| Type B joint completion weeks 11–14 | week 12; roster week 4 / week 8 / week 13 (95.3% finish); kingdom week 9 / week 11 / week 14 (95.6% finish) |
| Type C joint completion weeks 8–11 | week 8; roster week 3 / week 6 / week 9 (100.0% finish); kingdom week 6 / week 8 / week 10 (100.0% finish) |
| Type D progress 40–65%, at least 12 points below A | 72.5% median; 64.2% / 72.5% / 79.2% P10 / median / P90; A-D gap 14.2 points |
| Type A students ever hit daily coin cap under 5% | 1.70% |
| Trading ON cuts median blocked-by-type weeks at least 40% for A/B/C | A 0% (14→14); B 10% (10→9); C 0% (6→6) |

## Reading the baseline

- Type A median progress is 86.7% against a 60–80% range; earliest full completion is week 14. The daily-cap target is met at 1.70%.
- Type B joint median completion is week 12; Type C is week 8. Type D median progress is 72.5%, and the A-D difference is 14.2 points.
- Median blocked-by-type weeks fall by A 0%, B 10%, and C 0% with the trade model.

## After target check

| Target | Retune v2 result |
| --- | --- |
| Type A progress 60–80% | 77.5% median; 69.2% / 77.5% / 83.3% P10 / median / P90 |
| Type A never completes before week 14 | Earliest joint completion: not by week 15 |
| Type B joint completion weeks 11–14 | week 14 |
| Type C joint completion weeks 8–11 | week 10 |
| Type D progress 40–65%, at least 12 points below A | 60.8% median; A-D gap 16.7 points |
| Type A daily coin cap hit under 5% | 0.00% |
| Trading cuts blocked weeks at least 40% for A/B/C | A 0%; B 0%; C 0% |

## Final constants

```json
{
  "COMMON_PRIZE_UNITS_ENABLED": true,
  "COMMON_PRIZE_UNITS": 2,
  "SESSION_RESOURCES_SINGLE_TYPE": true,
  "SESSION_SCALING_ENABLED": true,
  "SESSION_BASE_COINS": 10,
  "SESSION_BASE_RESOURCES": 2,
  "SESSION_BONUS_COINS_PER_BLOCK": 10,
  "SESSION_BONUS_RESOURCES_PER_BLOCK": 1,
  "DAILY_COIN_CAP_ENABLED": true,
  "DAILY_COIN_CAP": 200,
  "SESSION_DAILY_LIMIT_ENABLED": true,
  "MAX_REWARDED_SESSIONS_PER_DAY": 3,
  "WEEKLY_RHYTHM_ENABLED": true,
  "WEEKLY_TIER1_COINS": 15,
  "WEEKLY_TIER1_RESOURCES": 2,
  "WEEKLY_TIER2_COINS": 15,
  "WEEKLY_TIER2_RESOURCES": 2,
  "TRADE_ACCEPT_WITHOUT_TOWER": true,
  "MAX_TRADES_PER_DAY": 8
}
```

## Sessions per week versus completion

| Sessions/week | Both complete (P10 / median / P90; finish share) | Roster completion | Kingdom completion |
| --- | --- | --- | --- |
| 1 | not by week 15 (0%) | week 5 / week 11 / week 15 (44.0% finish) | not by week 15 (0%) |
| 2 | week 13 / week 14 / week 15 (51.3% finish) | week 4 / week 8 / week 12 (98.5% finish) | week 12 / week 14 / week 15 (52.0% finish) |
| 3 | week 8 / week 10 / week 12 (99.8% finish) | week 3 / week 5 / week 8 (100.0% finish) | week 8 / week 10 / week 12 (99.8% finish) |
| 4 | week 7 / week 8 / week 10 (100.0% finish) | week 2 / week 4 / week 7 (100.0% finish) | week 7 / week 8 / week 10 (100.0% finish) |

## Welcome-gift what-if (not applied)

The 300-coin gift is shown as a diagnostic only; live balances and the configured 500-coin gift stay unchanged.

| Type | Week 15 progress (mean) | Joint completion | Daily coin cap hit | Blocked-by-type weeks median |
| --- | --- | --- | --- | --- |
| Type A | 73.5% | not by week 15 (0%) | 0.00% | 13 |
| Type D | 58.6% | not by week 15 (0%) | 0.00% | 12 |

## Retuned reading

- Type A median progress is 77.5%, Type D is 60.8% (16.7 points lower).
- Type B joint median completion is week 14 and Type C is week 10.
- Median blocked weeks OFF→ON are A 13→13, B 13→13, C 8→8.

## Stage 3 decision

The progress, completion, and daily-cap targets meet at the final constants above. The trade target does not: the specified 50% matching-classmate trade model produces no median reduction for A, B, or C. A 200-student tuning pilot found at most a 14% Type A reduction with `SESSION_BASE_RESOURCES=1`, which moved Type B's median completion to week 15; higher common prizes also pushed Type A progress above its target. Type A practices on only one day each week, so the weekly rhythm bonus cannot change its trade result. Stage 4 remains unstarted.

