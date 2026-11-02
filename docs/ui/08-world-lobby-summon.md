# 08 — World, lobby and Summon

## 1. WHAT THE PLAYER SEES

The World tab currently opens a hero selection/workshop page. It shows an arena preview, hero selector, building-related bonuses and controls to create/join a room; entering a room loads the hero-lab game. Summon shows featured heroes, a starry sky, one-pull and ten-pull actions, reveal/result screens, and summon history/details dialogs.

## 2. HOW IT WORKS

### World and lobby

`App.vue` maps `world` to `HeroLabView.vue` (the component is named hero lab). Its desktop layout uses a two-sided grid: room-entry controls and Kingdom camp-upgrade tiles on one side, selected-hero stat/talent card and a forest/campfire hero preview on the other, with a hero selector roster along the bottom. Responsive CSS in `HeroLabView.vue` rearranges those regions on narrow screens. The page loads hero roster and Kingdom building levels, chooses a hero, and creates/joins a room using the four-character code. `HeroIcon.vue` paints/caches hero sprites in canvas; if the visual cannot load it displays the hero emoji. The arena itself is hosted under `public/hero-lab/`; `HeroLabView.vue` handles iframe/game entry and return-to-selection. Hero room state is live through arena Socket.IO, not Vue HTTP polling.

There is also `web/src/student/WorldView.vue`, a different canvas class-world component using `io('/world')` with live state, keyboard movement, interaction, challenge/results and a 960×576 logical canvas. It is not selected by the current App tab mapping; its intended entry is **unverified**. It is listed so it is not mistaken for the World tab.

### Summon and its animation

`PetsView.vue` loads configuration/resources/history and handles pulls through `summon()`/API functions. Single pull shows `gacha/PrizeReveal.vue`; the reveal uses DOM structure and CSS keyframes (crate/egg, falling star, flash, confetti, prize art). A ten-pull stores batch results, reveals cards in order and opens a summary grid; can skip to summary. Result rarity/economy/odds are server/game config data, not created by the visual animation. `gacha/rarity.js` maps rarity to reveal confetti: starter/common 40, rare 80, epic 140.

`SummonSky.vue` is a separate background canvas: it paints gradient and 140 stars into a cached offscreen layer, pulses 12 stars, and draws occasional meteors. It is capped at 30 FPS, pauses while offscreen/document hidden, and respects reduced motion. Sky constants include twinkles 2–4s, meteors every 7–16s, 700ms duration, 120–180px tail, 25% chance of a shower with 3–5 meteors separated by 120ms.

Summon page layout and banner content is DOM/CSS in `PetsView.vue`; title/subtitle constants are `SUMMON_BANNER_TITLE` and `SUMMON_BANNER_SUBTITLE`; banner roster order is `SUMMON_BANNER_ORDER`. History is a dialog with paging/filtering (`SUMMON_HISTORY_PAGE_SIZE=20`), keyboard handling and return focus. The ten-result summary is another dialog, with click/keyboard handling. Details/history flows use server API data.

## 3. WHERE IT LIVES

- Tab mapping: `web/src/App.vue` `TABS.student`.
- World selector/lobby: `web/src/student/HeroLabView.vue` (`selectHero`, `enterRoom`, `reloadIntoRoom`, `returnToSelection`).
- World hero icons: `web/src/student/HeroIcon.vue`, visual loader `avatar.js` plus hero visual assets in `public/hero-lab/`.
- Separate class world: `web/src/student/WorldView.vue` (`connect`, socket handlers, `draw`).
- Summon flow/dialog: `web/src/student/PetsView.vue` (`beginPull`, `beginTenPull`, `openSummary`, `loadHistoryPage`, `openModal`).
- Sky: `web/src/student/SummonSky.vue`.
- Prize reveal: `web/src/student/gacha/PrizeReveal.vue`, rarity mapping `gacha/rarity.js`, CSS in `web/src/app.css`.
- Values: `config/tuning.js`; summon odds/costs/pity in `public/hero-lab/game-config.js` and server summon handlers in `src/quiz/api.js`.

## 4. DATA AND TIMING

World selector data comes from HTTP roster/profile calls; live arena gameplay is Socket.IO in the iframe. `WorldView.vue` connects on mount, joins with current `S.classId`, updates local state on `state` and related events, and disconnects on unmount. Summon request is HTTP; returned results then drive local reveal timers. Single reveal star timing constants are in `PrizeReveal.vue`; ten-pull card reveal state is in `PetsView.vue`. Sky loop has its own 30 FPS cap and stops when hidden/offscreen.

## 5. HOW TO CHANGE IT

1. “Change the featured summon hero ordering via `SUMMON_BANNER_ORDER` in `config/tuning.js`; keep display metadata and summon eligibility aligned.”
2. “Change ambient star count or meteor rate using the `SUMMON_*` values in `config/tuning.js`; preserve reduced-motion and hidden-page pause.”
3. “Change the ten-pull result grid columns via `SUMMON_SUMMARY_COLUMNS`; check narrow viewport CSS in `PetsView.vue`.”
4. “Change summon reveal confetti per rarity in `web/src/student/gacha/rarity.js`; do not change server pull odds.”
5. “Add a World selector hero by updating the authoritative roster/visual data and selector rendering in `HeroLabView.vue`; make sure the iframe arena supports it.”

## 6. GOTCHAS

- “World” is ambiguous in the code: the tab is `HeroLabView`; `WorldView.vue` is separate and currently not wired into `App.vue`.
- Pull animation only presents server results; odds, costs and pity belong to game/server configuration.
- There are three layers of art: CSS/DOM prize effects, Summon sky canvas, and hero icon canvas.
- The arena is a separate page in an iframe; outer app styling does not automatically style its DOM.
- The `debugPreview` ten-pull preview state is a developer-only presentation path, not a real summon.
