# Student mobile fixes (F1 to F11)

Branch `mobile-fixes`, made from `mobile-overhaul` with `main` merged in, so
the fixes start from the teammates' latest work on `main` (login margins and quiz chip
sizing, 2026-11-05). There is one commit per issue (`fix(F#): ...`), so any single fix can be
reverted. Brief: `STUDENT_FIX_UI.md` (from the tester). Before and after screenshots are in
`docs/mobile/screenshots/fixes/`.

Each issue was first checked against the code to see whether it was already fixed.
The "Status before" line records that check.

How to run the new tests: `npm run test:mobile` (Playwright, Chromium, its own server
on port 4180 with fresh demo data) and `npm run test:mobile:unit`.

---

## F1: close buttons hidden by the menu button

**Status before:** not fixed. Reproduced at 375x667 and 412x915. In Summon History, the
centre of the × button hit the corner menu button's SVG, so a tap opened the menu instead.

**Root cause:** `web/src/app.css:193` makes `main#main.main-summon` a fixed layer with
`z-index: 0`, and `web/src/student/PetsView.vue:435` makes `.summon-page` `position: fixed; z-index: 1`.
Both create stacking contexts, so the History and Details modals (z-index 15/20) and the
10-pull summary (30) are ranked inside the page. They can never paint above the app's corner
menu button (`.nav-peek`, z-index 99, `app.css:137`) or the immersive top bar (100,
`app.css:111`). Their own z-index cannot help.

**Fix (the smaller of the two options in the brief):**
- `web/src/overlays.js` (new) is a tiny registry. `useOverlay(() => isOpen)` counts open
  overlays and stops counting when the component unmounts.
- `App.vue` (student shell only) adds `inert` and `.under-overlay` to the top bar and both
  menu buttons while any overlay is open. `mobile.css` puts `.under-overlay` beneath the page
  (`--z-under-overlay: -1`) with `pointer-events: none`. They come back when the overlay closes.
- The z-index scale is now CSS variables in `mobile.css` (`--z-base`, `--z-hud`,
  `--z-topbar`, `--z-drawer`, `--z-popover`, `--z-modal`, `--z-toast`). The top bar, menu
  button, drawer and scrim use them.
- Registered overlays: Summon History and Details, the 10-pull summary, the summon
  reveal (`PetsView.vue`), every Kingdom building panel, including the Castle (avatar
  wardrobe) and Tower (trades) panels (`KingdomView.vue`), and the Join Class dialog
  (`ClassPicker.vue`). The F3 Resources panel registers too.
- On screens of 600 px and below, sheet headers use `padding-top: max(12px, env(safe-area-inset-top))`
  (Summon modals and the building panel). The 44x44 close buttons were already there.
- Backdrop tap and Esc: these already worked for the Summon modals and building panels. The
  10-pull summary now also closes on a backdrop tap, and Join Class on Esc.

**Sweep of the brief's overlay list:**
- Opened and checked automatically on the student pages: Summon History, Summon Details, the
  summon reveal (single pull), every building panel (Castle with wardrobe, Garden, Tower with
  trades, Library, Workshop), the nav drawer and Join Class.
- In-run (arena sandbox): Settings, hero information (I) and the game menu.
- Not opened automatically, and why:
  - **10-pull summary:** a 10-pull costs the whole 500-coin balance, so one test run could do
    it at most once. It uses the same `.modal-close` and the same registry as History.
  - **Vote cards and dawn screen:** these are choices with no close button, and need a real
    wave milestone.
  - **Defeat and end-of-run screens:** need a finished run.
  - **How to play:** this is the join briefing, which closes on a tap.
- The in-run overlays live in the game's own page (an iframe). While a run is on screen on a
  touch device, the app's top bar and menu button are already removed (`gameActive`). Inside
  the game, the panels (z-index 25) sit above the game's own menu button (6). This was
  verified, not changed.
- **Portrait:** phones and portrait tablets show the in-run "Rotate your phone" prompt, so
  the in-run overlays are checked at 667x375 and with the tablets turned sideways (1024x768,
  1180x820).
- **Trade UI:** this is the Tower panel's trade confirm, inside the building panel, so it is
  covered by the panel check.

**Test:** `tests/mobile/overlays.spec.mjs`. For each overlay, at 360x640, 375x667, 412x915,
667x375, 768x1024 and 820x1180, the test checks three things:
- the close control's whole box is inside the viewport;
- `document.elementFromPoint` at its centre is the control or one of its children;
- tapping it closes the overlay.

It also checks Esc and the backdrop. The test fails without the fix: at 375x667 the hit
lands on the menu button's `path`.

**Screenshots:** `screenshots/fixes/F1-before.png` and `F1-after.png` (Summon History at 375x667).

---

## F3: Kingdom header overlap and floating resource chips

**Status before:** not fixed. At 768x1024 the "Your Kingdom" card (left 18, about 403 px wide)
ran under the Castle chip and the balance chips (right 18). On phones the chips floated in a
second row at `top: 130px`.

**Root cause:** `web/src/student/KingdomView.vue:660` and `:681` (before this fix). The title
card and the economy row are two separate `position: absolute` boxes, pinned to opposite
corners with fixed offsets. Neither knows the other's width. Once the title (about 400 px)
plus the chips (about 350 px) are wider than the viewport, they overlap. The phone rules
(`@media (max-width: 600px)` and the coarse-portrait block) moved the chips down to
`top: 130px`, which is the "floating" look.

**Fix:**
- **Config:** `web/src/mobile-config.js` has `RESOURCES_COLLAPSE_BELOW_PX = 1024`,
  `RESOURCES_SHEET_BELOW_PX = 600`, `WIDTH_TOGGLE_HYSTERESIS_PX = 24`,
  `TOWN_TITLE_COMPACT_BELOW_PX = 190`, `belowWithHysteresis()` and `abbreviateCount()`.
- **Collapse:** below 1024 px, the Castle chip and the four balance chips become one
  resources chip. It shows the coin icon, the coin count ("9,999", then "10.4k" from 10,000,
  rounded down) and a chevron. It is 44 px tall, on the menu button's row, 8 px to its left.
  - The width toggles have 24 px hysteresis: once collapsed, the chips come back only at
    1048 px or wider. The sheet/popover switch works the same way.
  - Where there is no phone menu button (901 to 1023 px with a mouse), the chip takes the
    corner the chips used.
- **No overlap at any width:** a `ResizeObserver` on the right-hand group (the chip, or the
  chips at 1024 and up) sets the title card's `max-width` to the room left of that group,
  minus 12 px.
  - The right group never depends on the title, so this cannot loop.
  - The title truncates with an ellipsis, and the Buildings and "?" buttons stay on one row.
  - When the card has less than 190 px (320 px phones), the Buildings label is visually
    hidden but keeps its accessible name and icon.
  - On desktop, nothing changes unless the title card would otherwise overlap.
- **Panel:** "Your resources" (`role="dialog"`, labelled by its title, `aria-expanded` on
  the chip).
  - From 600 px up it is a 300 px popover under the chip, aligned to its right edge, with a
    pointer.
  - Below 600 px it is a bottom sheet with rounded top corners, safe-area padding and a
    backdrop.
  - Rows are 44 px or taller: Coins ("Spend on Summon pulls"), then Wood, Crystal and Herb,
    with amounts right-aligned in tabular figures with thousands separators. Below them is
    "Castle level N / 3" with a thin bar.
  - Values are reactive, so they update while the panel is open.
  - It closes on the × (44x44), Esc, an outside tap and a route change, and focus returns to
    the chip.
  - It scrolls inside itself when short (667x375).
  - The sheet registers with the F1 overlay registry.
- **Assumption:** the brief's "Herb (subline 'Used for building upgrades')" is read as the
  subline for all three building resources (Wood, Crystal, Herb).
- **Assumption:** the chip's accessible name is "Resources: N coins".

**Tests:** `tests/mobile/kingdom-resources.spec.mjs`.
- **Width sweep:** from 320 to 1440 px in 8 px steps (touch and mouse), then shrinking back.
  At every width it checks:
  - no box overlaps between the title card, the right-hand group, each chip and the menu
    button;
  - every chip is inside the viewport;
  - collapsed below 1024 (plus the 24 px band when growing);
  - the chip is the menu button's height, on its row, with an 8 px gap.
- **Fresh loads:** at 667x375, 740x360, 1024x768 and 768x1024.
- **Panel test:** at 375x667 and 320x568 (sheet) and 768x1024 and 667x375 (popover):
  - role and label, 4 rows, whole amounts, the panel inside the viewport;
  - the close button topmost;
  - a live update (Wood shows 12,345 with the panel open);
  - closing by ×, Esc, outside tap and route change, with focus back on the chip.
- The suite and F1 passed 3 times in a row (57/57).

**Screenshots:** `F3-before.png` (768x1024), `F3-after.png`, `F3-after-panel-popover.png`
(768x1024) and `F3-after-panel-sheet.png` (375x667).

---

## F2: town hitbox (the avatar could not walk up beside the BATTLES sign)

The fix was done in a separate worktree and cherry-picked. The full write-up is in
[`fixes/F2.md`](fixes/F2.md).

**Status before:** not fixed. Reproduced at 412x915 with touch: the avatar stopped at about
(438..441, 40.7).

**Root cause:** `web/src/student/kingdom/town-scene.js:42` (before the fix) had
`TOWN_GAP = { x: 386, w: 48 }`. The walkable gap in the north tree line was x 386..434, but
the drawn opening is x 374..474. That left an invisible 40 px wall on open grass above the
sign. A second blocker was the sign-post collider, a circle of radius 7 centred above the
post's foot (`KingdomTown.vue:72`), which was wider than the drawn post.

**Fix:**
- The gap is now measured from the trees on either side.
- Collision code moved unchanged into `web/src/student/kingdom/town-collision.js`, the one
  shared grid for keys, stick and tap-to-move.
- `TOWN_PROP_COLLIDER_RATIOS` lives in `config/tuning.js`, the town's own config, because it
  applies on desktop too. Trees block 40% x 20% at the base.
- Rocks, houses, the well and the sign post were also bigger than their drawings, and now
  match them.
- `?debug=colliders` shows a debug overlay of the colliders.
- **Arena audit:** the server's campfire circle is slightly bigger than its drawing. It was
  left alone because it is gameplay geometry.

**Tests:**
- `web/src/student/kingdom/__tests__/town-collision.spec.js` (vitest): a BFS from the spawn
  to every door and every open or path tile.
- `tests/mobile/town-walk.e2e.mjs`: stick and key walks, failing on any stall over 0.5 s,
  including the camera clamp at the top edge.

**Screenshots:** `F2-before.png` and `F2-after.png`.

---

## F4: Summon page showed green instead of the blue sky

**Status before:** not fixed. At 412x968 the area round History, Details and the Summon
buttons was dark green.

**Root cause:** `web/src/student/PetsView.vue:540` (before the fix). Below 900 px, the sticky
bottom bar's background was `linear-gradient(0deg, #254937 80%, transparent)`, and `#254937`
is the Kingdom's forest green. Two more things could show through around it:
- The sky (`SummonSky.vue`) was `position: absolute` inside the page, so on phones (where
  the page scrolls) it only covered the page box.
- `html` and `body` kept the app's light `--bg`, which shows on overscroll and on tall
  screens.

**Fix:**
- The bottom bar uses the sky's indigo, `rgb(27 49 84 / 96%)`, fading to transparent.
- On the Summon page the sky is a fixed layer: `top/left/right: 0`, `height: 100vh` with a
  `100dvh` override. The Garden panel's sky inside the Kingdom is not affected.
- While Summon is mounted, `PetsView` adds `html.qq-summon-route`. That paints `html` and
  `body` `#1b3154` and gives `main.main-summon` the sky gradient. The class is removed when
  the student leaves, which restores the previous background.

**Test:** `tests/mobile/summon-theme.spec.mjs`. At 360x640, 375x667, 412x915, 412x968,
667x375, 768x1024, 960x1440 and 1280x800 it checks:
- the computed html and body backgrounds are set and not green, and the page root has the
  gradient;
- screenshot pixels at the four corners and the bottom bar's centre, at the top and when
  scrolled to the bottom, are not green (hue 70 to 170 degrees, saturation above 25%);
- the class is gone after leaving.

The test fails on the old code.

**Screenshots:** `F4-before.png` and `F4-after.png` (full page, 412x968).

---

## F5: Campfire Run divider drawn behind the code input and JOIN button

**Status before:** not fixed. At 1280x800 the dashed line ran through the code row, and the
top of the card ("← Back to Kingdom") was cut off.

**Root cause:** `web/src/student/HeroLabView.vue:451` (before the fix). The divider was
`.room-join-block`'s `border-bottom`, and three rules squeezed that block:
- `HeroLabView.vue:450`: the block had `min-height: 0` and centred its content.
- `HeroLabView.vue:448`: `.room-entry` was `height: 100%; overflow: hidden` inside...
- `HeroLabView.vue:406`: ...the fixed percentage rows `16.2% 14.9%`.

When the card's content was taller than those rows, the join block shrank below its content.
The input and JOIN overflowed past the block's bottom border, so the dashed line was drawn
across them, and the clipped card lost its top line.

**Fix:**
- The border is gone. An in-flow separator, `.room-or` (`role="separator"`), sits between
  the two groups: a centred "or" between two dashed rules (flex items, not absolutely
  positioned), with 16 px margins and no z-index.
- The join and host blocks keep their natural height.
- On wide screens the rows are `minmax(16.2%, auto) minmax(14.9%, auto)`, so they grow to
  fit the card instead of clipping it. `.room-entry` no longer clips.
- Under 380 px, the code input and JOIN stack as two full-width rows.
- The disabled JOIN already had a plain (solid-border) disabled style. The "dashed border"
  was the divider running through it.

**Test:** `tests/mobile/campfire-run.spec.mjs`, sweeping 320 to 1440 px in 8 px steps with
touch and with a mouse. At every width it checks:
- the separator intersects none of the code input, JOIN and HOST LOBBY;
- it sits below the join row and above HOST LOBBY;
- JOIN is beside the code at 380 px and up, and below it under 380 px.

**Screenshots:** `F5-before.png` and `F5-after.png` (1280x800). The before shot shows the
mouse-revealed top bar because the probe's pointer sits at the top edge.

---

## F6: Campfire Run scene composition

**Status before:** not fixed. At 1280x800 the campfire sat in the left half. At 960x1440 the
hero's sprite ran below the campfire's base and under the hero selector.

**Root cause:** in `web/src/student/HeroLabView.vue` (before the fix) the scene is a
two-column grid (`.forest-scene`, line 545). The two halves are aligned independently:
- The campfire sits at the *bottom* of the left column (`align-content: end`), so its
  centre is at 25% of the width, not the middle.
- The hero (`.hero-preview-art`, line 584) is an absolutely positioned 512 px box,
  `bottom: 12px`, in the right column. Breakpoints then shrink it with
  `transform: scale(.72/.5/.32)`. A scaled box keeps its full layout size, so its feet do not
  line up with the fire.
- Nothing knows where the hero selector starts, so on tall screens the sprite runs into it.

**Fix: a measured composition.** `layoutScene()` in `HeroLabView.vue`, with the constants in
`web/src/mobile-config.js`:
- **The scene area S:** the scene box, starting 12 px below any panel that overlaps it (on
  wide screens the room, Camp Buffs and dossier panels sit over its top). It ends
  `SCENE_SELECTOR_GAP_PX = 12` above the hero selector.
- **Ground line:** the bottom of S.
- **Campfire:** centred in S, its log base (`CAMPFIRE_BASE_RATIO = 193/220` of the
  drawing) on the ground line. Its width is min(300 px, 30% of S's width,
  0.6 x S's height / base ratio), and at least 110 px.
- **Hero:** stands on the same ground line, with height at most
  `SCENE_HERO_MAX_HEIGHT_RATIO = 0.6` of S and at most 520 px. The sprite canvas is sized
  by height, with no scale transforms or offsets.

**Composition chosen:**
- When S is 480 px or wider (`SCENE_FRONT_BELOW_PX`), the hero stands to the campfire's
  right, 16 px from it. It shrinks if needed so its whole body stays inside S.
- Under 480 px the hero stands in front of the fire, centred, with the fire still centred
  behind it.
- **Why:** beside the fire reads best and keeps both visible, but under 480 px two figures
  side by side would each be too small to read.
- The toggle has 24 px hysteresis.

**Layout mechanics:**
- A `ResizeObserver` watches the scene box, the selector and the panels. None of these is
  sized by the absolutely placed art, so there is no feedback loop.
- The layout also reruns on window resize, and while a newly chosen hero's sprite first
  draws (to pick up its aspect ratio).
- The campfire's position depends only on S, so changing the hero never moves it.
- Until the first measurement, the original grid shows.

**Test:** `tests/mobile/campfire-scene.spec.mjs`, at 360x640, 412x915, 960x1440, 768x1024,
667x375, 1024x768, 1280x800 and 1440x900. It measures S from the page's own boxes and the
hero from its sprite's opaque pixels, then checks:
- the campfire's centre is within 2% of S's centre;
- the hero's feet are within 4 px of the campfire's log base;
- the whole hero is inside S, at least 12 px above the selector;
- the campfire is inside S, and nothing passes the viewport's sides;
- the hero is beside the fire when S is wide, and centred in front when narrow;
- choosing another hero leaves the campfire exactly where it was.

**Screenshots:** `F6-before.png` and `F6-after.png` (960x1440).

---

## F7: login page spacing on tablets

**Status before:** partly fixed. On `main`, a teammate's commit `4e3414e` narrowed the forest
to 36% below 980 px, which left about 70 px at 768x1024. But the sweep from 700 to 1100 px
still found a cramped band from 981 to about 1010 px: at 988x1000 the curved edge came within
about 17 px of the login card. The tablet layout was still a full-bleed scene pinned to the
page edge.

**Root cause:** `web/src/LoginView.vue:441` (before this fix). `.qq-preview-side` is
`position: absolute; right: 0; width: 46%`, and its curved edge (`clip-path: ellipse(...)`)
bulges left at mid-height, which is exactly where the vertically centred card sits. The form
column's width is a separate `60%` with `padding-inline: clamp(24px, 6vw, 96px)`. Nothing
relates the two widths, so the gap depends on where the percentages happen to land. The
`max-width: 980px` override (line 461) only covers part of the tablet range.

**Fix:** for side-by-side tablets (761 to 1100 px) the page is now a two-column grid:
- outer padding `clamp(24px, 5vw, 64px)`;
- column gap `clamp(24px, 4vw, 48px)`;
- the panel at most 420 px wide.

The forest becomes a box of its own, with the same outline as the other cards (3 px ink
border, storybook radius, 6 px drop shadow) and no curved clip or torn edge. The preview
canvas already fills its box at any size, and with equal columns the library and the
strolling heroes stay in view (at 768 px the box is about 330 px wide instead of 240 px).
Phones (760 px and down, stacked) and 1101 px and up keep the curved design unchanged.

**Hysteresis:** the 761/1100 thresholds are CSS media queries. Nothing measures or
resizes in response to them, so they cannot loop. The 24 px hysteresis applies to the
JS-driven toggles (F3 and F6).

**Test:** `tests/mobile/login-tablet.spec.mjs`. At 768x1024, 820x1180, 912x1368, 1024x768
and 1180x820, and sweeping 700 to 1100 px in 8 px steps, it checks:
- when side by side, the panel and scene boxes do not intersect and the gap is at least 24 px;
- the page never scrolls sideways;
- the layout is side by side above 760 px and stacked below.

On the old code the sweep fails at 988 px.

**Screenshots:** `F7-before.png` and `F7-after.png` (988x1000).

---

## F8: quiz topic chips are one size, with counts as "N Q(s)"

**Status before:** partly fixed. On `main`, a teammate's commit `71f9383` had already given
every chip the same 56 px height in a fixed two-column grid, with the name and "N questions"
truncated on two lines. Three things were still missing:
- the auto-fill grid, the 64 px config constant and the "N Q(s)" count at the right;
- a 2-line clamp for long names (they were cut to one line);
- **on touch devices, the chip grid was not applied at all.** The checkbox and texts were
  laid out by a generic flex rule, so the count ran on right after the name instead of
  sitting in its right-aligned column.

**Root cause:**
- The words "N questions" on a second line (`web/src/student/PracticeView.vue:187`, before
  the fix) made chips wrap and stretch before the teammate's fix. They still truncated the
  name to one line.
- On touch, `web/src/mobile.css:52` (before this fix):
  `#app :where(label:has(> input[type="checkbox"])) { display: inline-flex }`. The `#app`
  sits outside `:where()`, so this "zero-specificity" default carries ID specificity
  (1,0,0) and beats every component's own label layout, including `.practice-topic`.

**Fix:**
- `TOPIC_CHIP_HEIGHT_PX = 64` in `web/src/mobile-config.js`, applied as `--topic-chip-h`.
- The list is `grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr))`.
- Each chip is a grid: `22px | minmax(0, 1fr) | minmax(56px, auto)`, made up of:
  - a 22 px checkbox;
  - the name, clamped to 2 lines with an ellipsis;
  - the count "N Q(s)" (nowrap, right-aligned, tabular figures) at every width.
- The chip has `title` = the full topic name for desktop hover. Screen readers get the full
  "N questions" from visually hidden text, and the abbreviation is `aria-hidden`.
  - **Assumption:** an `aria-label` on a plain `<span>` is not announced by screen
    readers (ARIA does not allow naming generic elements), so hidden text carries the
    brief's "N questions" label instead.
- Topics with no questions show "0 Q(s)" (spoken as "No questions yet").
- The selected state still changes only colours. The border stays 2 px, and the "empty"
  dashed border is the same width.
- **mobile.css:** on student pages the checkbox-label default now has specificity (0,1,2).
  That is above a bare `label {}` rule and below any component class. The professor pages
  keep the old rule untouched.

**Test:** `tests/mobile/quiz-topics.spec.mjs`:
- **Sweep:** 320 to 1440 px in 8 px steps, with touch and with a mouse. At every width it
  checks:
  - all chips are the same width (within 0.5 px of sub-pixel grid rounding);
  - all are exactly 64 px tall;
  - nothing overflows a chip;
  - the count reads `N Q(s)`, is uncut and sits at the right edge.
- **Toggle check:** at 360x740, 768x1024 and 1280x800, clearing and re-choosing a topic
  leaves every chip's size unchanged.
- **Accessibility:** the `title` and the spoken "N questions" are present.
- All passed 3 times in a row.

**Screenshots:** `F8-before.png` and `F8-after.png` (topic list at 375 px, touch).

---

## F9: town hint shares the row with the Emote and sound buttons

**Status before:** not fixed. On touch screens the hint was a separate full-width bar,
floating about 74 px above the Emote and sound buttons.

**Root cause:** in `web/src/student/KingdomView.vue` (before the fix), the touch hint was a
`<span>` inside the desktop keyboard-hints panel (`.town-controls-hud`, line 707). On touch,
`@media (pointer: coarse)` (line 1174) re-showed that panel as its own absolutely positioned
bar at `bottom: calc(74px + safe-area)`, separate from the `.town-actions` row of buttons.

**Fix:**
- On touch screens the hint is a third item inside `.town-actions`: [Emote][Sound][hint].
- The hint takes the room left over (`flex: 1 1 0; min-width: 0`), left-aligned, at
  12.5 px. It is clamped to two lines, vertically centred with the buttons, in the same
  translucent pill colour.
- The row spans the safe-area insets and is `pointer-events: none` except on its two
  buttons, so taps on the hint reach the town.
- The separate floating hint (and its CSS) is gone. On touch screens the keyboard-hints
  panel is hidden; desktop keeps it unchanged.
- `TOWN_HINT_TEXT`, `TOWN_HINT_TEXT_SHORT` and `TOWN_HINT_SHORT_BELOW_PX = 140` live in
  `web/src/mobile-config.js`.
- A `ResizeObserver` on the hint picks the short text below 140 px, with 24 px hysteresis.
  The hint's width comes from the row (flex-basis 0), not from its text, so the swap
  cannot loop.
- Building bubbles are drawn on the town canvas, so they cannot overlap a DOM row, and the
  row lets taps through anyway.

**Test:** `tests/mobile/town-hint.spec.mjs`. At 360x640, 375x667, 412x915, 667x375, 740x360,
768x1024 and 320x568 it checks:
- the hint lies to the right of both buttons, vertically centred with them, overlapping
  neither;
- it is inside the viewport and at most two lines;
- the separate hint is gone;
- `pointer-events: none`, and `elementFromPoint` at its centre reaches the town;
- it is clear of the virtual stick and its toggle;
- it uses the short text exactly when it is narrower than 140 px.

On desktop, the keyboard hints stay and the touch hint is hidden. Passed 3 times in a row.

**Screenshots:** `F9-before.png` and `F9-after.png` (375x667).

---

## F10: touch aim line under the hero sprite

The fix was done in a separate worktree and cherry-picked. The full write-up is in
[`fixes/F10.md`](fixes/F10.md).

**Status before:** not fixed. The dashed touch-aim line crossed the hero's face.

**Root cause:** `public/hero-lab/world.js` (before the fix). `drawScene` (line 5102) painted
everything in one hand-ordered function. `drawTouchAim()` was the last world-space call
(line 5971), after the hero sprites (line 5654). It drew the line from the hero's centre and
the end reticle in one pass, so the line lay over the sprite. The Ranger's bow and Dead Aim
guide was already under the sprite.

**Fix:**
- `ARENA_DRAW_ORDER` in `public/hero-lab/game-config.js`, from bottom to top: `ground`,
  `campfireRings`, `campfire`, `aimLines`, `shadows`, `enemies`, `worldMarkers`, `heroes`,
  `effects`, `aimReticle`, `screenEffects`, `hud`.
- `drawScene` loops over that list, with one painter per layer.
- The touch aim is split: the line draws in `aimLines`, and the reticle draws in
  `aimReticle` (above enemies).
- No change to aim logic, to the messages sent or to their geometry.
- The Engineer laser and the area telegraphs keep their depth. The brief also says "do not
  move area markers", so only the permanent campfire rings sit under the aim lines.

**Tests:**
- `tests/mobile/arena-draw-order.unit.test.mjs`: layer order, and that each pass runs once
  from the right layer.
- `tests/mobile/aim-line-layer.e2e.mjs`: a Guardian aiming at 667x375. No aim-coloured pixel
  inside the sprite's box, and the line is still visible beyond it. Before the fix it found
  54 such pixels; after, 0.

**Screenshots:** `F10-before.png` and `F10-after.png`.

---

## F11: sweep for sibling bugs

**Method:** one scan (kept as `tests/mobile/sibling-sweep.spec.mjs`) runs on every student
page (Kingdom, Quiz, My Progress, Campfire Run, Summon) and the Summon History sheet, at
360x640, 375x667, 412x915, 667x375, 740x360, 768x1024, 820x1180 and 960x1440. During the
sweep it also ran at 1024x768 and 1280x800. It lists:
- every visible control whose centre is covered by another element (`elementFromPoint`);
- every pair of controls or text boxes that intersect (not nested);
- every row of same-class siblings with uneven heights;
- the computed html, body and page backgrounds.

### Found and fixed

1. **Summon History: the NEW and Duplicate tags overlapped the next row's name** (phones,
   600 px and below).
   - **Root cause:** `web/src/student/PetsView.vue:576` (before the fix). In the full-screen
     sheet (a flex column), the history list keeps `overflow: auto`. That makes its
     automatic minimum height 0, so the flex column shrank it. Its grid rows were squashed
     to 61 px, but a row with a tag needs about 93 px (the tag wraps to a second line), so
     each tag spilled over the row below.
   - **Fix:** the list is `flex: none; overflow: visible` in the sheet. The sheet itself
     already scrolls.
   - **Screenshots:** `F11-before.png` and `F11-after.png` (375x667).
2. **Campfire Run: "← Back to Kingdom" ran under the corner menu button** (phones, 360 to
   667 px).
   - **Root cause:** the button was stretched to the full grid width
     (`HeroLabView.vue:458`, `.kingdom-return`), so its box ran under the fixed menu
     button.
   - **Fix:** `justify-self: start`, so it is only as wide as its text.
3. **Kingdom and Campfire Run: the app's light grey (`#f6f5f1`) behind the scene.** Same
   class as F4.
   - **Root cause:** both pages fill `100svh` but leave html and body on the app default.
     So the grey shows on overscroll, below the scene once a phone's toolbar collapses
     (100svh is less than the visible height), and mid-resize.
   - **Fix:** `web/src/route-theme.js` (`useRouteTheme`) adds a class to `<html>` while the
     page is mounted. `mobile.css` paints html and body in the page's own colour: the
     town's green `#2f5e3e` and the clearing's `#32533e`. Leaving the page restores the
     default. Practice and Progress already theme their body.
4. **Checkbox labels on touch overrode component layouts.** This was found while fixing F8,
   and fixed there: `mobile.css`'s `#app :where(label:has(> input[type=checkbox]))`
   carried ID specificity.

### Checked, nothing to fix

- **Other overlays under a fixed element:** none. All registered overlays now step the top
  bar aside (F1).
  - The 960 px tablet's top bar shows for 1.6 s on arrival and then tucks away. That is
    the existing design, and the test waits for it.
- **Town colliders:** fixed in F2. That audit also covered rocks, houses, the well and the
  sign post.
- **Arena obstacles:** the only solid one is the server's campfire circle, slightly bigger
  than its stone ring. It is gameplay geometry, so it was left alone (see `fixes/F2.md`).
- **Chips, cards and tiles of uneven size:** none after F8. The only flag was the Campfire
  Run panels at 1280 px, which differ in height on purpose (different grid rows).
- **Decorative dividers or pseudo-elements behind controls:** none besides F5. The
  absolutely positioned pseudo-elements in the student app are speech-bubble tails, the
  resources popover pointer, the emote wheel disc and planet rings, none of which sits
  under a control.
- **Overlaps at 768x1024, 820x1180 and 960x1440:** none, by bounding-box intersection.

**Test:** `tests/mobile/sibling-sweep.spec.mjs`. At each viewport above, on every page and
the History sheet, it requires:
- no covered control;
- no overlapping boxes;
- no uneven siblings in a row;
- the themed html and body behind Kingdom, Campfire Run and Summon.

It fails on the old History sheet (the "Duplicate (+15 coins)" tag over "Wood"). It passed 3
times in a row.
