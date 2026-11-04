# QuizQuest economy

**Implementation snapshot: 4 November 2026.** This document describes the current server rules for coins, gacha, Kingdom resources, building upgrades, and practice rewards. The server is authoritative: the browser displays balances and requests actions, while the server validates and records them.

## Currencies and limits

- **Coins** pay for Hero Summon pulls, pet eggs, and shop items.
- **Wood, crystal, and herb** are Kingdom resources. They pay for building upgrades, class trades, and selected avatar cosmetics.
- There is no conversion between coins and Kingdom resources.
- Coin earnings are capped at **150 coins per student per local day**. Resource grants are capped at **60 resource units per student per local day**. The app timezone defaults to `Asia/Singapore` and can be changed with `APP_TIMEZONE`.
- The daily caps apply to earned ledger entries. Purchases do not count against the coin cap. Hero Summon common-resource prizes are added directly to inventory rather than through the capped resource-grant function.

## How students earn from practice

### Per-question result

- A correct answer pays **10 coins the first time that student answers that question correctly**. Repeating the question cannot pay those coins again, even in another session or question version.
- Correct, confirmed answers can also trigger a **30-coin topic milestone** once per student, class, and topic. The check uses the latest confirmed answer for each distinct question and considers up to the **10 most recent distinct questions** in that topic. It requires at least **5 questions** and at least **80% accuracy**, and runs after a correct answer.
- Nonblank Short Answer grades are provisional, including numeric Short Answers. They do not award the first-correct coins until a professor confirms them as correct. A confirmed correct mark pays the same first-correct reward. Incorrect marks pay nothing.
- Blank and timed-out answers are recorded as incorrect and do not pay first-correct coins.

The answer result includes correctness, score, explanation, and any coins paid for that answer. A provisional mark is identified in the result so the student knows it may be reviewed.

### Completing a practice session

A completed session with **at least 5 questions** pays:

- **20 coins**, subject to the daily coin cap.
- **3 resource units**, drawn independently at random from wood, crystal, and herb. A session can therefore award one, two, or all three resource types; the total before the daily cap is always three units.
- An optional participation point if the class has enabled participation points, the session has at least 5 questions, and the student is below the weekly limit of **3 points per class**.

The session reward is granted once per session. Shorter sessions receive no completion bonus or practice resources. The session summary shows the number correct, coins earned in the session, updated coin balance, resources granted, and any provisional written answers.

## Gacha and shop

There are two separate coin-funded draws: **Hero Summon** and **pet eggs**.

### Hero Summon

- One pull costs **50 coins**. Ten pulls cost **500 coins** at the current **0% multi-pull discount**.
- Current per-pull odds are **62% common**, **30% rare**, and **8% epic**.
- A common result grants **5 units of one randomly selected Kingdom resource** instead of a hero.
- Hero pity guarantees at least a rare hero on the **5th consecutive pull without a hero**. Epic pity guarantees an epic hero on the **20th consecutive pull without an epic**. Any hero resets the hero counter; an epic also resets the epic counter.
- When a pull awards a hero, an unowned hero of that rarity is preferred while any remain. If the student already owns all heroes in that rarity, the pull is a duplicate.
- Duplicate rare heroes refund **15 coins** (30% of a pull); duplicate epic heroes refund **30 coins** (60%). Duplicate counts are tracked. New heroes have no refund.
- Each student receives a one-time **500-coin welcome gift** for Hero Summon.
- A 10-pull is one request with ten independent rolls and one total charge. Repeating the same request ID returns its recorded results instead of charging or rolling again.

### Pet eggs and direct shop purchases

- A pet egg costs **50 coins**. Its rarity odds are **60% common**, **30% rare**, and **10% epic**. The pet is selected from the pool for the drawn rarity.
- A duplicate pet increments its duplicate count and refunds **20 coins**.
- Directly purchasable pets: **Fox 60 coins**, **Turtle 60 coins**.
- Directly purchasable accessories: **Top hat 40 coins**, **Sunglasses 40 coins**, **Crown 90 coins**.
- Purchases require sufficient balance. A purchase request is idempotent, so retries do not charge twice.

## Kingdom resources and upgrades

All buildings have levels **0–3**. The cost shown for a level is the cost to advance from the previous level to that level.

| Building | Level 1 | Level 2 | Level 3 | Effect per level |
| --- | --- | --- | --- | --- |
| Library | 5 wood | 8 wood, 3 crystal | 12 wood, 6 crystal, 4 herb | +10% attack for magic heroes |
| Workshop | 6 wood | 8 wood, 3 herb | 10 wood, 5 crystal, 5 herb | +10% attack for physical heroes |
| Garden | 5 herb | 8 herb, 3 wood | 12 herb, 4 crystal, 4 wood | +10% Campfire Run campfire HP |
| Tower | 4 crystal | 7 crystal, 4 wood | 10 crystal, 6 wood, 6 herb | +10% strength for team buff cards |

Effects scale linearly to **+30% at level 3**. The Castle has no separate purchase cost or upgrade action: its displayed level is the lowest level among the four buildings, so all four must reach the next level for the Castle to grow.

The server checks that the student can afford the next level, deducts its resources, increments that building once, and records the resource spend. A building at level 3 cannot be upgraded further.

### Trading resources

- Trading must be enabled in the class settings, and both students need a **level 1 Tower**.
- Offers are visible to eligible classmates in that class. Posting an offer puts the offered resources in escrow; cancelling returns them. Accepting an offer exchanges the requested and offered bundles.
- Each offer side must contain **1–20 units**. A student can have up to **3 open offers** and participate in up to **5 completed trades per local day**.

### Resource-cost avatar cosmetics

Town avatar hats and accessories can also spend resources. Current catalog prices include: wood hats at **5, 8, or 10 wood**; crystal hats at **3 or 4 crystal**; herb hats at **5 or 6 herb**; and accessories at **4 wood**, **2–3 crystal**, or **3–4 herb**, depending on the item. The ribbon hat, star-pin accessory, and color options are free. The catalog in [avatar-cosmetics-data.json](../config/avatar-cosmetics-data.json) is the exact source of prices and availability.

## Source of truth

- Quiz rewards, balances, pet eggs, and Hero Summon rolls: [rewards.js](../src/quiz/rewards.js), [game-config.js](../public/hero-lab/game-config.js), [tuning.js](../config/tuning.js), and the student routes in [api.js](../src/quiz/api.js).
- Resource caps, building costs, and trades: [economy.js](../src/quiz/economy.js).
- Practice-session resource bundle: [seed.js](../src/quiz/seed.js); session payout and answer-result contracts: [api.js](../src/quiz/api.js).
- Student-facing answer feedback and session summary: [ResultBlock.vue](../web/src/student/ResultBlock.vue) and [QuizRunner.vue](../web/src/student/QuizRunner.vue).
- Building effect labels: [building-effects.js](../web/src/student/kingdom/building-effects.js).
