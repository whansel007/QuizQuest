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
