# 00 — Student UI inventory

## Screens and entry points

This is a single-page Vue application: the address bar does not have separate student routes in the inspected shell. `web/src/App.vue` chooses a tab from the shared `S.tab` state and mounts the matching component. The login screen appears when `S.me` is empty. Screen-level details and dialogs are often sub-states inside a view rather than separate routes.

| Student-facing screen / overlay | Entry point | Main implementation | Rendering |
|---|---|---|---|
| Sign-in, sign-up, demo-account picker and hidden version/debug dialog | Signed-out state in `App.vue` | `web/src/LoginView.vue`; `web/src/components/LoginPreview.vue`; `LoginCampfire.vue` | DOM/CSS plus a canvas town preview and SVG campfire |
| Kingdom home/town | Student tab `kingdom` | `web/src/student/KingdomView.vue`, `KingdomTown.vue`, `kingdom/town-scene.js`, `kingdom/town-art.js` | Both: DOM header/menus/dialogs, canvas town |
| Kingdom tour, avatar color panel, castle info, building panels, trade board, archive/hero book, wardrobe | States within Kingdom | `KingdomView.vue`, `kingdom/panels/*.vue`, `AvatarPreview.vue`, `CosmeticIcon.vue` | DOM/CSS, some canvas previews/icons |
| Quiz selection, resume/start, in-run quiz, results/summary, report-question form, leave confirmation | Student tab label **Quiz** (`practice`) | `PracticeView.vue`, `QuizRunner.vue`, `QuestionForm.vue`, `ReportForm.vue`, `ResultBlock.vue` | DOM/CSS; battle art includes CSS/DOM sprites; no canvas in the inspected runner component |
| My Progress | Student tab `progress` | `ProgressView.vue`, `ResultBlock.vue` | DOM/CSS |
| Campfire Run hero selector / co-op room lobby / embedded arena | Student tab label **Campfire Run** (`world`) maps to `HeroLabView.vue` | `HeroLabView.vue`, `HeroIcon.vue`; arena source in `public/hero-lab/` | DOM/CSS, hero icon canvases, arena runs in an iframe |
| Separate class world | No tab mapping found in `App.vue`; `WorldView.vue` exists | `web/src/student/WorldView.vue`, server namespace `/world` | DOM/CSS plus a 960×576 canvas and Socket.IO |
| Summon banner, single pull reveal, ten-pull summary, history/details dialogs | Student tab `pets` (label “Summon”) | `PetsView.vue`, `SummonSky.vue`, `gacha/PrizeReveal.vue`, `HeroIcon.vue` | DOM/CSS plus ambient sky canvas and hero icon canvases |
| Student account menu, debug menu, sound toggle, global toast, screen wipe | Shared shell | `AccountMenu.vue`, `DebugMenu.vue`, `SoundToggle.vue`, `ScreenWipe.vue`, `ui.js` | DOM/CSS; wipe is a CSS animated DOM overlay |

### Not found or not wired as an ordinary tab

- No standalone student “settings” page is in `TABS` in `App.vue`. Student preferences appear in controls (sound, shake setting in the arena, avatar wardrobe); exact completeness of settings is **unverified** outside those components.
- No separate “upgrade modal” component exists by that name. Building upgrades/panels are inside the Kingdom `townTarget` dialog state and each building panel.
- `WorldView.vue` implements a separate real-time shared world, but the app shell maps the Campfire Run tab to `HeroLabView.vue`. How a student is meant to enter `WorldView.vue` is **unverified**; no shell entry was found.
- No standalone results route was found. Practice results are states inside `QuizRunner.vue`; co-op arena results are rendered by the iframe game.
- Hidden debug surfaces include the login version-tap/debug-code route, `DebugMenu.vue`, and the hero-lab local debug roster (`hero-lab-debug-unlocked-heroes`). They are not normal student navigation destinations.

## Stack and communication

The browser app uses Vue 3 with Vite; `web/src/main.js` imports app CSS, locally bundled Fredoka/Nunito fonts and Bootstrap utility CSS, then mounts `App` at `#app`. The server entry is `server.js` (Node/Express); `package.json` lists Vue, Vite, Axios, Socket.IO and Socket.IO client. `web/src/api.js` wraps HTTP requests with Axios and bearer session tokens. The arena and separate `WorldView.vue` use Socket.IO for live events. Server-side answer checking/rewards are authoritative, as described in `api.js`'s header; precise endpoint ownership is in `src/quiz/api.js` and `server.js`.

## What the feature brief asks about

The town, avatar color, screen wipe, login showcase pan, Summon sky/reveal, DOM dialogs, game HUD/effects, and hero selection/lobby are present. The app-wide exact canvas count is not a fixed number: canvases are created by components and some are offscreen caches. The brief's single canonical browser game loop is not present; separate loops/timers belong to particular components. The class-world route wiring, and any planned-but-not-implemented hats beyond the actual wardrobe catalog, are **unverified**; see [04-avatar-and-cosmetics.md](04-avatar-and-cosmetics.md) and [08-world-lobby-summon.md](08-world-lobby-summon.md).
