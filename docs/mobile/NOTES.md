# Mobile overhaul notes

Branch: `mobile-overhaul`, one commit per stage. Brief: `RESPONSIVE_DESIGN_PROMPT.md`.

## Stage 0: audit

### 1. Front-end stack and routes

- **Stack:** Vue 3 single-page app (`web/src`, Composition API, `<script setup>`), built by Vite 8 into `dist/` and served by the Node/Express server (`server.js`). No client router: `App.vue` swaps views on `S.tab` (`web/src/api.js` `setTab`). Styling is custom CSS (`web/src/app.css`, about 3,400 lines, plus scoped `<style>` blocks) with Bootstrap 5.3 **utilities only** (no Reboot, no components). The in-run game is a separate plain-JS page, `public/hero-lab/world.html` + `world.js` + `hud.css`, drawn on a `<canvas>` and embedded in an `<iframe>` by `HeroLabView.vue`. It talks to the server over Socket.IO (`/hero-lab` namespace).
- **Signed out:** `LoginView.vue` (sign in, then the "Create your account" screen with the student/teacher role toggle). Another developer owns these pages (see "Files touched on shared pages").
- **Student tabs** (`TABS.student` in `App.vue`): Kingdom (`KingdomView.vue` + `KingdomTown.vue` canvas, building panels, avatar wardrobe, intro tour), Quiz (`PracticeView.vue` → `QuizRunner.vue`, `QuestionForm.vue`, `ResultBlock.vue`, session summary), My Progress (`ProgressView.vue`), Campfire Run (`HeroLabView.vue`: room/upgrades/hero dossier/roster "World" page, then the game iframe), Summon (`PetsView.vue` + `SummonSky.vue` backdrop canvas, History/Details modals, 1x/10x reveals).
- **Teacher tabs** (`TABS.teacher`): Analytics, To review, Classes & Roster, Question bank, AI drafting, Evaluation, Settings. Another developer owns these pages.
- **No-login pages:** `/hero-lab` (hero picker) and `/hero-lab/world.html?heroId=…` (standalone arena sandbox), `/tag` (Circle Tag demo).
- **No trade UI and no profile page exist.** The brief lists them; I found no trade, offer or profile screen in `web/src` or the server. The student's profile actions are the account menu (Log out) and the Kingdom avatar wardrobe. Nothing was built for them (the brief says not to add features).

### 2. Breakpoints, viewport meta, existing mobile handling

- Viewport meta is already `width=device-width, initial-scale=1, viewport-fit=cover` in both `web/index.html` and `public/hero-lab/world.html`.
- `app.css` breakpoints in use: 420, 430, 560, 575.98, 640, 767.98, 820, 899/900, 991.98, 1023, 1100, 1199/1199.98 px, plus `(pointer: coarse)`, `(hover: none)`, `(max-height: 600/700px)`. Bootstrap's sm/md/lg/xl (576/768/992/1200) are used by the newer teacher rules.
- Existing mobile work (branch `mobile`, merged earlier): teacher shell already becomes a top bar + drawer below 992 px; teacher tables scroll in `.table-wrap` or stack as cards below 576 px; 44 px targets and 16 px inputs on touch for teacher pages; the quiz has portrait and landscape layouts; the student nav scrolls sideways below 1024 px and auto-hides on the immersive tabs (Kingdom, Campfire Run, Summon) behind a small "▾" peek tab.
- In the game (`hud.css` `@media (pointer: coarse)`): a fixed (not floating) virtual stick, mobile help text, a follow camera without clamping or smoothing, pinch zoom, and press-drag-release ability buttons. See section 4.

### 3. Canvas sizing

| Canvas | Sizing today |
|---|---|
| Kingdom town (`KingdomTown.vue`) | Canvas fills its frame; backing store = CSS size x full `devicePixelRatio` (uncapped). `scale = max(fit, readable)`; on narrow screens the camera follows the avatar. Tap-to-move (pathfinding), click a building to open its panel. No pinch zoom. |
| In-run arena (`world.js`) | Desktop: canvas is letterboxed 16:9 (`width: min(100vw, 177.78svh)`), backing store = 1920x1080 x `renderScale` (≤1), whole arena always visible, no camera. Touch (`pointer: coarse`): canvas fills the viewport, a camera centres on the local hero at `coverScale x mobileZoom` (default 1.8, max 2.8), no clamping to the arena edge, no smoothing. |
| Hero Lab / World page (`HeroLabView.vue`) | DOM, not canvas (hero art uses `HeroIcon.vue` sprite canvases, DPR ≥ `SPRITE_DPR_MIN`). |
| Summon backdrop (`SummonSky.vue`) | Canvas fills its host, DPR capped at 2, 30 fps cap, pauses when `document.hidden` or scrolled out of view (IntersectionObserver), off under reduced motion. |

### 4. In-run input (client → server messages, unchanged by this work)

| Action | Message |
|---|---|
| Movement | `input` `{ up, down, left, right }` **digital booleans** (WASD/arrows). The stick maps to 8 directions. |
| Aim | `aim` `{ x, y }` = vector from the hero to the pointer (world units, normalised by the server). Sent on pointer move, throttled to `arenaTuning.performance.aimUpdateMs`. |
| Primary | `fire` `'primary'` once on press, then `primary_hold` `true`; `primary_hold` `false` on release. The server repeats shots while held. Ranger: the charge is measured server-side from hold → release; release fires. |
| Skill (E) | `skill` with no payload, except Engineer turret and Ranger meat: `skill` `{ x, y }` world point (the server clamps to the ability range). Both enter a client-side placement mode first; primary fire confirms. |
| Ultimate (Q) | `ultimate`. |
| Bombardier Targeted Bombing | `ultimate` opens a 5 s window on the server (`airstrike.targetTimeoutMs = 5000`, cooldown not spent). Confirm = `fire` `'secondary'` `{ x, y }` world point (desktop right-click, or left-click while targeting). Cancel = `cancel_targeting`. Pattern radius `airstrike.circleRadius = 280`, each bomb `explosionRadius = 135`. **No range limit:** the server only clamps the point to the arena. |
| Emote | `emote` `<id>` (`thumbs-up`, `thumbs-down`, `wave`, `heart`, `laugh`, `question`). |
| HUD | DOM over the canvas (`world.html` + `hud.css`), refreshed at 10 Hz; ability buttons are DOM `<button>`s. Damage numbers, rings, reticles and particles are on the canvas. |

### 5. Emotes

An emote system already exists: Z opens a six-emoji wheel (👍 👎 👋 ❤️ 😄 ❓), the server broadcasts it in the state, and it shows above the hero for 2.4 s. The server rate-limits to one per 500 ms (`PLAYER_EMOTE_COOLDOWN_MS` in `src/hero-lab/room.js`). There is already a 👋 Emote HUD button. Per the brief ("If an emote system already exists, only add the touch button and popup"), I kept the existing six emoji, timing and server limits and did not change server code. The brief's 1-per-2-s limit and 2 s duration would need a server change, which the RULES forbid.

### 6. Test tooling

- `npm test`: node:test suites in `test/*-test.js` (462 tests). Baseline before this work: **455 pass, 6 fail, 1 skipped**. All 6 failures are in `test/design-guidance-test.js` (the design-guidance file they read is missing on `main`). They are not related to this work.
- `npx vitest run`: Vue component and unit tests (`**/__tests__/*.spec.js`). Baseline: **101/101 pass**.
- Playwright 1.62.1 is already a devDependency (`e2e/`, 3 browsers). The mobile suite has its own config, `tests/mobile/playwright.config.mjs` (Chromium only, port 4180, fresh demo data).

## Assumptions

- Graders use Chrome DevTools device mode, which emulates touch for phones and tablets. The harness runs every viewport below 1200 px as a touch device and 1200 px and up as a desktop.
- "Dummy student/teacher account from the seed data": `student01@quizquest.demo` and `prof.a@quizquest.demo` (password `quizquest`), the same accounts the e2e suite uses.
- New client tuning numbers live in `public/hero-lab/game-config.js` (in-run game) and `web/src/mobile-config.js` (Vue app). The Vue app cannot import the game's config without pulling the game bundle into the app.

## Stage 1: global foundation and every non-game page

### Harness

`tests/mobile/responsive.spec.mjs` (run with `npm run test:mobile -- responsive`) walks 20 screens (sign-in, sign-up, 10 student screens and states, 7 professor tabs) at the 11 viewports of the matrix. Phones and tablets under 1200 px run as touch devices. Per screen and viewport it checks:

1. `document.scrollingElement.scrollWidth <= clientWidth + 1` (no sideways scroll);
2. no visible element pokes past the viewport edge outside a scrolling container;
3. no text or control is cut off by a parent that clips without scrolling (catches content hidden by `overflow: hidden`, which check 1 cannot see);
4. it saves a screenshot to `docs/mobile/screenshots/<screen>__<w>x<h>.jpg` and lists interactive elements under 44x44 px in `docs/mobile/HARNESS-REPORT.md` (a report, not a failure).

**Baseline before any fix:** checks 1 and 2 already passed everywhere (earlier mobile work had removed horizontal scrolling). Check 3 (added after the baseline) found the World page hero preview cut off or slid under the roster (375, 412, 768, 820 px), and the tap-target report listed about 30 controls under 44 px on touch (account buttons, the nav peek tab, kingdom HUD buttons, Summon modal tabs, the quiz class picker, professor checkboxes and file inputs). **After:** all 33 harness tests pass (20 screens x 11 viewports), and only two controls remain under 44 px (see below).

### What changed (per page)

| Page / area | Change |
|---|---|
| App shell, student (`App.vue`, `mobile.css`) | At 900 px and below (and landscape phones under 520 px tall) the top bar is the logo, the page name and a 44 px menu button. The tabs, name, Log out, Tools and sound move into a full-height drawer on the right: it closes on a tap outside, Esc, the close button or choosing a tab; focus moves into it and is trapped while it is open, and returns to the menu button afterwards. On the immersive tabs (Kingdom, Campfire Run, Summon) the bar stays tucked away and a 44 px corner button opens the drawer in one tap (it replaces the 46 x 13 px peek tab on phones). While a run is on screen the site nav and its handle are hidden on touch devices (the game has its own menu). Desktop keeps the old nav, peek tab and auto-hide exactly. |
| App shell, professor (`App.vue`) | Opening the drawer now moves focus into it (it already closed on Esc, the scrim and the close button). |
| Foundation (`mobile.css`, `main.js`, `mobile-config.js`) | `--app-vh` from `visualViewport` (iOS toolbar and keyboard); `overflow-wrap: break-word` site-wide and `anywhere` at 768 px and below; media capped at its box; `pre`, formulas and markdown tables scroll inside themselves on phones; on touch screens 44 px minimum for buttons, selects, summaries and tabs, 44 px checkbox labels, 16 px inputs (no iOS zoom on focus). All behind `:where()` (zero specificity) or touch/phone media queries, so desktop is unchanged. |
| Quiz (`QuestionForm.vue`, `mobile.css`) | The countdown pins to the top right while scrolling the question on phones. Written and numeric answers: when the soft keyboard opens, the answer block is scrolled so the Submit button sits above the keyboard (`visualViewport` resize). Submit is full width under the written answer. Answer options were already full-width cards. |
| Kingdom (`KingdomView.vue`) | Building panels (upgrade, wardrobe/avatar colours, library, garden, tower, workshop) become full-screen sheets at 600 px and below and on short landscape phones: fixed header with title, level, upgrade button and a 44 px close; the content scrolls under it with safe-area padding. The coin row moves left of the corner menu button in landscape. The tour's "Getting around" step reads the touch controls on touch screens. |
| World / Campfire Run select (`HeroLabView.vue`) | The hero preview is sized by height instead of a CSS scale (the scaled 512 px box slid under the roster on phones and off-screen on tablets). On tablets (701-1100 px) the ten-hero row scrolls sideways with scroll-snap instead of squeezing ten 70 px chips. On touch screens the intro line reads the touch controls instead of WASD/E/Q. The sides already stacked below 1100 px and the talent panel already wrapped. |
| Summon (`PetsView.vue`) | Room for the corner menu button next to the coins. At 520 px and below the two pull buttons share the bottom row at full width. History and Details become full-screen sheets at 600 px and below (sticky header and pagination, 44 px close, tabs and filters). The 10-pull result grid shows 5 columns in landscape (2 in portrait, as before). |
| Professor pages | CSS only (see "Files touched on shared pages"): 44 px drawer tabs, checkbox labels and file inputs on touch screens. Tables already scroll in `.table-wrap` with a shadow hint or stack as cards below 576 px (earlier work), so nothing else was needed. |

### Remaining small tap targets (justified)

None on the student pages: the last two (`+ Join Class` and the class `select` in the Quiz header, pinned at 40 px by a more specific rule) were fixed to 44 px on touch; a re-run at 375 x 667 lists no control under 44 px. The sign-in page's "Show password" button (54 x 30 px) is left to the developer who owns that page.

### Files touched on shared pages (login and professor pages; for merging)

Another developer is redoing the sign-in and professor pages. On those pages I changed **no markup and no component code**:

- `web/src/App.vue`: the professor shell's drawer now focuses its first tab on open (one `watch`); the rest of the App.vue changes are the student shell.
- `web/src/mobile.css` (new): the `(pointer: coarse)` rules that reach professor pages are `.teacher-app nav#tabs.t-nav button { min-height: 44px }` and the zero-specificity `:where()` rules for 44 px controls, checkbox labels and file inputs, and 16 px inputs.
- `LoginView.vue` and every file under `web/src/teacher/`: not touched. The sign-in page already passed every check; its "Show password" button is 54 x 30 px (left as is: their page).
