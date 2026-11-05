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
| Foundation (`mobile.css`, `main.js`, `mobile-config.js`) | `--app-vh` from `visualViewport` (iOS toolbar and keyboard); `overflow-wrap: break-word` site-wide and `anywhere` on student pages at 768 px and below (see Stage 6); media capped at its box; `pre`, formulas and markdown tables scroll inside themselves on phones; on touch screens 44 px minimum for buttons, selects, summaries and tabs, 44 px checkbox labels, 16 px inputs (no iOS zoom on focus). All behind `:where()` (zero specificity) or touch/phone media queries, so desktop is unchanged. |
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

## Stages 3 and 4: the in-run game on phones, and touch controls

Committed together: the camera, HUD and touch input share one pointer router in `world.js`, and the HUD layout only makes sense with the controls in place.

### Where things live

- **Pure gesture logic** (no DOM, unit tested): `public/hero-lab/touch-controls.js`. Stick vector and 8-way mapping, tap/hold classification, cancel zone, drag to aim (direction and point), auto-aim, densest-cluster reticle, the Bombardier targeting state machine, camera base scale, zoom limits, pinch, camera clamping and follow, screen/world conversion, HUD scale, short names.
- **Thin DOM/canvas layer**: the "Touch input layer" section near the end of `public/hero-lab/world.js`, plus the "Touch camera" section near the top.
- **Tuning**: every new number is a named `MOBILE_*` / `HUD_SCALE_*` constant in `public/hero-lab/game-config.js`, with `ABILITY_AIM` and `ABILITY_AIM_MECH`.
- **Layout**: the `html.touch-mode` block in `public/hero-lab/hud.css` (it replaces the old `@media (pointer: coarse)` block). New markup in `public/hero-lab/world.html`: game menu button and sheet, Cancel button, rotate overlay, touch settings, the mobile help text, `data-testid` hooks.

### When touch controls are on

`html.touch-mode` is set when `(pointer: coarse)` matches (Settings → Touch controls: **Auto**, the default), when the player picks **On**, or with **`?touch=1`** in the URL (mouse pointer events count, for testing on a desktop). **Off** keeps the desktop controls on a touch device. The choice is saved in `localStorage` and applies the next time the arena opens (switching mid-run would move every control). `?touchdebug=1` shows a strip with the active pointers, gesture state, zoom and Bombardier phase.

### Stage 3: layout, camera, orientation, HUD

- **Game surface**: the canvas fills the viewport (`100dvh`). In touch mode the page sets `touch-action: none`, `user-select: none`, `-webkit-touch-callout: none` and `overscroll-behavior: none`, and blocks the context menu, page pinch-zoom (`gesturestart`, multi-finger `touchmove`) and pull-to-refresh. Panels that scroll (settings, information, votes, results) keep `pan-y`. The game is its own document inside the app's iframe, so leaving the run discards these rules. The audio context also warms up on the first `touchend` (iOS only starts audio inside a touch gesture).
- **Resolution**: on touch the canvas backing store is CSS size x device pixel ratio, capped at `MOBILE_MAX_DPR = 2` (1.5 with fewer than 4 CPU cores). Before this it was CSS size x 0.4 on phones (blurry). The forest floor stays at 1 px per world px, and the particle budget follows the drawn area and is halved (`MOBILE_PARTICLE_FACTOR`), so the higher resolution does not multiply the particle work.
- **Orientation**: portrait shows a full-screen "Rotate your phone to play" overlay that takes all input and releases held controls. Nothing is sent to the server; the connection and the hero stay as they are. The game menu has **Fullscreen** where the Fullscreen API exists (not on iPhone); after entering it the page tries `screen.orientation.lock('landscape')`. The app's iframe now has `allow="… fullscreen"` and `allowfullscreen` (`HeroLabView.vue`), which fullscreen inside the frame needs.
- **Camera (touch only; desktop keeps the whole-arena view)**: follow camera on the local hero with lerp 0.15 (frame-rate independent), clamped so nothing outside the arena shows. Zoom 1 (`MOBILE_DEFAULT_ZOOM`) shows about `MOBILE_VIEW_BASE_W x MOBILE_VIEW_BASE_H` = 640 x 360 world px (exactly that on a 667 x 375 phone; tablets are capped at `MOBILE_VIEW_MAX_BASE_SCALE`). Pinch zooms from "whole arena fits" to `MOBILE_ZOOM_MAX = 2.5`. The zoom persists for the session (`sessionStorage`); Settings has **Reset zoom**. **Bug fixed on the way:** the old touch camera translated before scaling, so what was drawn and where a tap landed disagreed whenever the zoom was not 1. Drawing and `getPointerCoordinates` now use the same transform (`screen = (world - camera) x scale + view centre`), checked by a round-trip unit test. Damage numbers, rings, reticles, particles, health bars and the placement ghosts are drawn in world space, so they follow it. The HUD, banners, vignette, confetti and the shake origin stay in screen space (confetti now bursts from the corners of the visible screen).
- **HUD** (`HUD_SCALE = clamp(0.75, viewportHeight / 600, 1)`, applied with `transform: scale` so touch targets keep their size):
  - top left: compact party list (names cut to 8 characters, thinner bars, smaller portraits);
  - top centre: wave counter, campfire bar and boss bar (smaller; wave details hidden);
  - top right: room code (tap to copy, as before) and a 44 px **menu button** that opens a sheet with Settings, Information (the I panel), Fullscreen and Leave room;
  - removed from the touch HUD: the gear, Back to Kingdom and Information buttons (all three are in the menu); run buffs and the kill streak sit under the room code;
  - bottom left: the move stick; the stats panel is hidden and opens from the menu as a sheet;
  - bottom right: the ability cluster;
  - bottom centre: the lobby hero choice and START, between the stick and the cluster (above them on screens under 640 px wide);
  - vote cards: a bottom-anchored row of three compact cards with the live tally (above the controls for the short vote window, as the desktop vote overlay covers the desktop HUD); dawn, defeat, end-of-run and session summary are full-screen sheets that scroll inside themselves on short screens;
  - banners, toasts, the waiting banner and the targeting hint sit under the top bar, never over the controls.
- **Effects defaults on touch** (only when the player never chose otherwise; all still adjustable): Effects quality **Medium**, screen shake intensity **40%** of the desktop default (20 instead of 50), particle budget halved, performance overlay off.
- **Backgrounding**: on `visibilitychange` (hidden) every touch input and movement key is released and firing stops. On return, Socket.IO's own reconnect takes over and a "Reconnecting…" toast shows if the link dropped (also shown on a disconnect while visible).
- **Help text**: the join briefing and the How to play card show the mobile controls text (below) instead of the keyboard line when touch controls are on; the World page intro and the Kingdom tour's "Getting around" step do the same on touch screens. The standing-still nudge ("Move to deal +20% damage") names no keys, so it is unchanged.

### Stage 4: touch controls

- **Movement output**: the server takes **digital movement booleans** (`input { up, down, left, right }`, as WASD). The stick maps its vector to **8 directions** (45 degree sectors) after a 0.18 dead zone. Speed rules stay the server's.
- **Left stick**: floating by default. A touch on the left 45% of the arena places the base under the thumb (`MOBILE_STICK_RADIUS = 56`, knob 24, dead zone 0.18); a faint outline marks its home at the bottom left, above the safe area. Settings → Move stick: **Floating / Fixed**. Translucent fill, dark ink outline, no blur or filters.
- **Ability buttons**: the existing HUD buttons, layout, colours, icons, key labels, cooldown fills and ready pulses. Sizes are the previous touch sizes (48/54/62 px) x `MOBILE_BUTTON_SCALE = 1.15` = 55/62/71 px (never below 48), with an 8 px larger hit area. (Scaling the desktop sizes 56/70/88 instead would make the cluster 250 px tall on a 375 px screen.)
  - **Tap** (at most 180 ms and under 12 px): cast now with **auto-aim**: the nearest enemy within the ability's range (lobby dummies included), else the hero's last aim, else the direction the hero last moved (`MOBILE_AUTO_AIM = true`).
  - **Hold and drag**: aim mode with a thin dashed aim line and reticle from the hero in the hero's FX colour. The drag from the button centre (up to `MOBILE_AIM_DRAG_RADIUS = 90` px) gives the direction; for point abilities the drag length maps linearly onto the real range. Release fires. Dragging back to within 18 px of the button centre turns the button red, and releasing there **cancels**: nothing is sent and no cooldown is spent.
  - **M1**: press fires at once with auto-aim and holds (`primary_hold true`; the server repeats); dragging re-aims while firing; release sends `primary_hold false`. Ranger's Charge Bow uses the same messages, so the press starts the charge, dragging aims and the release fires; Dead Aim fires one arrow per tap. **M1 has no cancel zone**: the first shot goes out on press (as a mouse click does), and the server fires Ranger's arrow on release whatever the client does, so a cancel could not be honoured without a server change.
  - Placement abilities (Engineer turret, Ranger meat) send the same `skill {x, y}` world point the desktop placement click sends. A placement started from the keyboard is confirmed by M1 or a tap on the arena.
- **Bombardier Targeted Bombing**: pressing Q sends `ultimate` (the server's 5 s window opens; no cooldown yet) and shows a large **Cancel** button just above the cluster (clear of the right thumb and of the lobby bar), with a ring that drains over the 5 s. Hold and drag: the reticle (the existing canvas airstrike pattern: 280 px pattern, 135 px blasts) follows the hero position plus the drag scaled to `MOBILE_BOMBARDIER_DRAG_RANGE`; release outside the cancel zone **confirms** with `fire 'secondary' {x, y}` (the desktop right-click message). Tap only: the window stays open with a default reticle on the densest group of enemies; a tap on the arena (converted through the camera) confirms there. Cancel (or Esc, also with `?touch=1`) sends `cancel_targeting`; on a timeout the server closes the window. No cooldown is spent either way. The desktop has **no range limit** (the server only clamps the point to the arena), so the drag range only sets how far a full thumb drag reaches.
- **Emote**: the emote system already existed (Z wheel, 6 emoji, server broadcast, shown above the hero). Per the brief, only the touch button and popup were added: the 👋 button becomes a 44 px translucent circle in the free top-left corner of the ability cluster, and the wheel opens as a compact row of 44 px emoji above the cluster. The existing emoji (👍 👎 👋 ❤️ 😄 ❓), the 2.4 s display and the server's 500 ms limit are unchanged: the brief's 2 s / one-per-2-s numbers would need a server change, which the RULES forbid.
- **Pinch**: two fingers that both started on the arena (not on the stick, a button or the HUD) zoom by their distance ratio, clamped to the limits. The stick and the buttons keep working with other fingers; a pinch never casts or confirms anything.
- **Multi-touch**: every pointer is tracked by `pointerId` with `setPointerCapture` (stick + held ability + two-finger pinch = 4 at once). `pointercancel`, window `blur`, backgrounding, a disconnect and the rotate prompt release everything safely (a held M1 sends `primary_hold false`; an aimed ability is cancelled, never fired).
- **Haptics**: Settings → "Vibrate when casting" (default off) calls `navigator.vibrate(10)` on a cast where supported.
- **Latency**: aim lines, the reticle and the muzzle flash draw immediately from the local touch state; nothing waits for the server.

### `ABILITY_AIM` (derived from `public/hero-lab/heroes/*.js` and `src/hero-lab/room.js`)

| Hero | M1 (primary) | E (skill) | Q (ultimate) |
|---|---|---|---|
| Sheriff | dir 1100 | Dynamite: dir 1575 | Deadeye: **self** |
| Guardian | dir 173 | Shield Rush: dir 300 | Unbreakable Charge: **steer** (aimed at cast; the stick steers it by sending `aim`, since the server moves the charge along the aim) |
| Pilot | dir 390 | Dash: dir 250 | Mech Suit: **self** (mech M1 and E stay dir) |
| Bombardier | dir 349 | Proximity Trap: **self** | Targeted Bombing: **special** |
| Bubbles | dir 315 | Bubble Trap: dir 390 | Bubble Rush: **self** |
| Electromancer | dir 1100 | Stun Field: dir 1012 | Chain Lightning: **self** |
| Fairy | dir 380 | Gale Burst: dir 360 | Vortex Orb: dir 420 |
| Engineer | dir 300 | Deploy Turret: **point 220** | Overclock Laser: dir 900 |
| Ranger | dir 560 (charge bow) | Meat: **point 300** | Dead Aim: **self** |
| Samurai | dir 320 | Cutting Dash: dir 260 | Afterimage Cut: dir 480 |

This matches the brief's expected table with one difference: the Engineer's turret placement range in the code is **220** (`engineer.turretSkill.placeRange`), not 140. The touch control uses 220 so it can place exactly where the desktop can.

### Mobile controls text (shown in the game when touch controls are on)

> On mobile:
> - Move: drag the left virtual stick.
> - Attack or use an ability: tap its on-screen button to activate. To aim, hold the button, drag toward the target, then release.
> - Bombardier ultimate: hold Ultimate, drag to choose a target, then release or tap the arena to confirm. Use the on-screen Cancel button to back out.
> - Emote: tap the 👋 button and choose an emote.
> - Zoom: pinch the arena.

### Files changed (Stages 3 and 4)

`public/hero-lab/world.js`, `public/hero-lab/world.html`, `public/hero-lab/hud.css`, `public/hero-lab/game-config.js`, `public/hero-lab/touch-controls.js` (new), `web/src/student/HeroLabView.vue` (iframe fullscreen permission), `tests/mobile/touch-logic.unit.test.mjs` and `tests/mobile/touch-smoke.e2e.mjs` (new). No server file changed.

## Stage 2: canvas pages on phones (Kingdom town, Summon backdrop)

- **Kingdom town on touch devices** (`KingdomTown.vue`; numbers in `web/src/mobile-config.js`):
  - follow camera on the avatar (it already followed on narrow screens; it is still clamped to the town/north zone, so no area outside the map shows once zoomed in);
  - default zoom `MOBILE_TOWN_ZOOM = 1.4` x the "whole map fits" scale. In landscape that is exactly the brief. In **portrait**, 1.4x fit would show the town smaller than the readable view phones already had (the fit scale is width-bound there), so portrait starts at whichever is closer: 1.4x fit or the old readable scale;
  - **pinch** zooms between `MOBILE_TOWN_ZOOM_MIN = 1.0` (whole map) and `MOBILE_TOWN_ZOOM_MAX = 2.2` x fit (never closer than the portrait default); the chosen zoom survives rotation and resizes;
  - **tap-to-move stays the main control**: on touch, the tap is decided on release (under 12 px of movement and not part of a pinch), so a pinch never sends the avatar walking. Door bubbles are tapped as before and open the building panel, which is now a sheet (Stage 1);
  - the game's **virtual stick** (the same `stickVector` / `vectorToDirections` from `touch-controls.js`) is an optional alternative: the 🕹️ button (bottom left, 44 px) shows or hides it, remembered in `localStorage`. It drives the same movement keys as WASD;
  - works in portrait and landscape; desktop (mouse) is unchanged: mouse clicks still walk on press, the scale is the old `max(fit, readable)`.
- **Canvas resolution**: the town's backing store now uses `canvasDpr()`: full DPR on desktop, capped at `MOBILE_MAX_DPR = 2` on touch devices (1.5 with fewer than 4 CPU cores). The in-run arena uses the same caps (`game-config.js`).
- **Summon backdrop** (`SummonSky.vue`): already paused when hidden or scrolled away and capped at 30 fps; on touch devices it now runs at `MOBILE_BACKDROP_FPS = 20` and uses the capped DPR.
- **Other animated canvases**: the in-run arena pauses with the page (`requestAnimationFrame` stops when hidden) and is covered in Stages 3 and 6. The sign-in page's animated preview (`LoginPreview.vue`) already caps DPR at 2; it belongs to the sign-in page another developer is redoing, so it was left alone.

Files: `web/src/student/KingdomTown.vue`, `web/src/student/KingdomView.vue` (tour text), `web/src/student/SummonSky.vue`, `web/src/mobile-config.js`.

## Frame time (Stage 3, item 5)

Measured with `Emulation.setCPUThrottlingRate` = 4 in headless Chromium, on the arena sandbox: 4 players in one room (the measured one a 667 x 375 touch phone), a running wave topped up to about 50 enemies with the debug spawner, sampled for 6-9 s. The game draws at its `FRAME_CAP_FPS = 24` cap (41.7 ms budget). "Draw" is the JavaScript time of one `drawScene`; headless Chromium rasterises the canvas in software, so resolution costs more here than on a phone GPU.

| Setup (4x CPU throttle, 4 players, ~50 enemies) | Drawn frames per second | Draw JS per frame | Touch-control layer per frame |
|---|---|---|---|
| Touch, DPR 1 (canvas 667 x 375) | **24.0** (the cap) | 8.3-10.1 ms | **0.20 ms** |
| Touch, DPR 2 (canvas 1334 x 750), before adaptive resolution | 19.2 | 9.4 ms | - |
| Touch, DPR 2 with adaptive resolution (Stage 6) | 22.1 over the window (19 at first, then 24 once it stepped down to 1x after about 5 s) | 10.2 ms | - |
| Desktop 1440 x 810, for comparison | about 20 (rAF rate) | - | - |

So the control layer adds about 0.2 ms per frame at 4x throttle (about 0.05 ms unthrottled): constant work, no allocations in the gesture path (DOM transforms for the stick, one dashed line while aiming). The frame time is acceptable: the cap holds at DPR 1, and on a slow device at DPR 2 the adaptive step brings it back to the cap. `?touchdebug=1` exposes these counters as `window.__heroLabFrameStats`.

## Stage 6 (P2, done because time remained)

- **Web app manifest** (`web/public/manifest.webmanifest`): name, `display: standalone`, theme and background colour `#1f3b2b`, icons made from the existing QuizQuest shield logo (`web/public/icons/`: SVG, 192, 512 and maskable PNG, 180 px Apple touch icon). **No orientation is forced.** `web/index.html` links it and adds `theme-color`, `mobile-web-app-capable`, `apple-mobile-web-app-capable`, `-title` and `-status-bar-style`. Chromium reports the app installable with no manifest errors. (The Node server serves the manifest as `application/octet-stream`; browsers accept that, and serving it as `application/manifest+json` would need a server change, which the RULES forbid.)
- **Very small screens (320 px)**: the harness runs at 320 x 568 with `MOBILE_SMALL=1`: all 20 screens pass. It showed the Summon title and two hero names breaking mid-word ("Summo/n", "Bombard/ier"); they now fit whole at 420 px and below (`PetsView.vue`). The site-wide `overflow-wrap: anywhere` for phones is now limited to student pages and never applies to table cells, so a professor table column cannot collapse to one letter.
- **Automatic effects and resolution on slow touch devices** (`world.js`, reusing the adaptive quality sampler): the canvas is rastered off the main thread, so the draw time alone misses a slow GPU. Touch mode also watches the interval between drawn frames; when 60 frames in a row average more than 1.15 x the frame-cap budget, the resolution drops one step (100% → 75% → 50% of the capped DPR, never below 1 canvas px per CSS px), and at the lowest step the effects drop to Low even if the player chose Medium. Twice `ADAPTIVE_RESTORE_MS` of good frames brings one step back.

## Stage 5: tests and docs

- `tests/mobile/touch-logic.unit.test.mjs` (19 tests), `tests/mobile/touch-smoke.e2e.mjs` (9 tests, CDP multi-touch on the no-login arena sandbox, `data-testid` selectors on every new control, no fixed sleeps: every wait is on a condition), `tests/mobile/responsive.spec.mjs` (one test per viewport and group). How to run them, and what each covers, is in the README's "Mobile support and testing" section.
- `docs/mobile/PHONE-CHECKLIST.md`: 25 steps for a real phone.
- `docs/mobile/screenshots/`: the final harness run (20 screens x 12 viewports, 320 x 568 included) plus five in-game shots from the touch smoke test (`game-*.jpg`: lobby, aiming, Bombardier targeting, menu, rotate prompt).
- `docs/mobile/HARNESS-REPORT.md` / `harness-results.json`: the final measurements.

### Final results

| Suite | Command | Result |
|---|---|---|
| Node tests | `npm test` | 455 pass, **6 fail** (all pre-existing, `test/design-guidance-test.js`; identical to the baseline before this work), 1 skipped |
| Vitest | `npx vitest run` | **101 / 101** pass |
| Existing end-to-end | `npx playwright test` (Chromium, Firefox, WebKit) | **138 / 138** pass |
| Touch logic unit tests | `npm run test:mobile:unit` | **19 / 19** pass |
| Responsive harness | `npm run test:mobile -- responsive` (`MOBILE_SMALL=1` adds 320 x 568) | **36 / 36** pass: 225 screen-viewport measurements, 0 failures, 0 interactive elements under 44 x 44 px on touch viewports |
| Touch smoke (CDP multi-touch) | `npm run test:mobile -- touch-smoke` | **9 / 9** pass |

### Known issues and limits

- **Not tried on a physical phone.** Everything was checked in Chromium's device emulation (touch events, `isMobile`, DPR 2) through Playwright; `PHONE-CHECKLIST.md` is for the real-device pass.
- **Emote rate and duration** stay at the existing 500 ms / 2.4 s (the brief's 2 s / 1-per-2-s needs a server change, which the RULES forbid).
- **M1 has no cancel zone** (the first shot goes out on press, and the server fires Ranger's arrow on release whatever the client sends).
- **Touch controls On/Off** applies the next time the arena opens.
- **Fullscreen and orientation lock** exist on Android Chrome only; iPhone Safari has no Fullscreen API for pages, so the menu item is hidden there.
- **Trade UI and profile page** in the brief do not exist in this app, so there was nothing to make responsive.
- **The frame-time figures** come from headless Chromium, which rasterises the canvas in software; a phone GPU rasterises faster, so the DPR-2 numbers are pessimistic.
- **The manifest** is served as `application/octet-stream` by the Node server (browsers accept it; fixing the MIME type is a server change).
- **The sign-in page's animated preview** and its 54 x 30 px "Show password" button were left to the developer who owns that page.
- **Pre-existing failures**: 6 tests in `test/design-guidance-test.js` fail on `main` before and after this work (the design-guidance file they read is missing).
