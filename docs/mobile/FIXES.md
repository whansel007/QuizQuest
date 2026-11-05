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
