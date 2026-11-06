# Professor workspace: responsive audit and fixes (375 px to 1200 px)

Branch `prof-responsive`, cut from `main` (4e3414e). It is separate from the student-side `mobile-fixes` branch, and every stage is its own commit, so any stage can be reverted. This file is the working log: the audit, the baseline, the fixes per tab, the jitter investigation and every assumption made.

## Stage 0: audit

### Where the layout lives

| Concern | File | Notes |
|---|---|---|
| Professor shell (sidebar, top bar, drawer, scrim) | `web/src/App.vue` (teacher branch of the template, `teacherActive`) | `drawerOpen` and `navCollapsed` are refs; collapse is remembered in `localStorage` (`qq-teacher-nav-collapsed`). The sidebar/drawer switch is **CSS only** (no JS media query), so `drawerOpen` is never reset when the width crosses 992 px. |
| Shell + page styles | `web/src/app.css` lines ~2850-3394, all under `.teacher-app` | Tokens (calm blue), sidebar, `t-toolbar`, `t-section`, the 12-column `t-grid`, dashboard parts, phone block, wide tables, stacked-card tables. |
| Analytics | `web/src/teacher/AnalyticsView.vue`, `dashboard/*.vue`, `charts/*.vue` | See "Analytics measuring code" below. |
| To review | `ToReviewView.vue`, `dashboard/ReportsPanel.vue`, `components/Pager.vue` | Marking cards, reports, pagination. |
| Classes & Roster | `ClassManagementView.vue` (scoped styles for modals, sub-tabs, class cards) | Modals are `.modal-overlay > .modal-card` (create, rename, generate code). **Archive is a direct toggle, not a modal** (assumption A3). Remove-member and revoke-code use `confirm()`. |
| Question bank | `ReviewView.vue`, `QuestionCard.vue`, `QuestionEditor.vue`, `CardReview.vue` | `.bank-layout` is 270 px filters + results, one column below 992 px. |
| AI drafting | `GenerateView.vue`, `TopicManager.vue`, `ImportMaterials.vue`, `MaterialLibrary.vue`, `AuthoringWorkflow.vue` | Without Gemini (the test setup), the page shows ImportMaterials + the Draft form + the Generation log; with Gemini it shows AuthoringWorkflow (covered by `test/browser-authoring.test.cjs`). |
| Evaluation | `EvaluationView.vue` | Two wide metrics tables in `.table-wrap`, two tile rows, comments list. |
| Settings | `SettingsView.vue` | Guidance textarea, coverage target, semester dates. |

### Breakpoint map (as found)

| Width | What changes | Where |
|---|---|---|
| >= 1200 | Sidebar 244 px (72 px when collapsed), content beside it; `t-grid` spans 4/5/7/8 sit side by side | app.css `.teacher-app`, `.t-grid` |
| <= 1199.98 | Every `span-*` panel takes the full row | app.css `@media (max-width: 1199.98px)` |
| 992-1199.98 | Overview tiles 2 x 2 | app.css "dashboard breakpoints" |
| <= 991.98 | Sticky top bar with menu button; sidebar becomes an off-canvas drawer (`transform: translateX(-102%)` + `visibility`, 0.2 s transition) with a scrim; Analytics `.dash-toolbar` becomes `display: contents`, so only the section bar sticks (under the top bar); bank filters stack above results | app.css "below lg", ReviewView scoped |
| <= 767.98 | Phone block: 44 px buttons, 16 px inputs, toolbars wrap and stack, `.row > .field` full width, `.table-wrap` scrolls with `min-width` 520/660 px tables, modals become bottom sheets (`max-height: calc(100dvh - 16px)`), charts one column, tiles 2-up. **Also `overflow-x: clip` on `.teacher-app` and on `main#main`**, which hides overflow instead of fixing it (removed in Stage 2, see A5). | app.css "professor workspace: phone and small tablet layouts" |
| <= 575.98 | Analytics pickers one per line; topic bars on two lines; `.dash-table.stack` tables become stacked cards (`data-label`); question dialog near full screen | app.css "below sm", "Phones (below Bootstrap's sm)" |
| <= 430 | Tighter gutters, tiles and top bar; dialog actions stack | app.css `@media (max-width: 430px)` |
| `pointer: coarse` | 44 px buttons and 16 px inputs at any width | app.css "Touch screens of any size" |
| Container queries | Needs-attention grid one column under 420 px; heatmap hour labels shorten under 400 px | app.css `.attention`, `.heat-viz` |

### Analytics measuring code

- **Sticky offsets** (`AnalyticsView.vue` ~148-195): `barHeight` = the top bar's `offsetHeight`, kept by a `ResizeObserver` on `header#top`; it is written into the toolbar's and section bar's inline `top`. `topOffset()` = bar height + the sticky toolbar (or, when the toolbar is `display: contents`, the section bar). `spy()` (scroll + resize, rAF-coalesced) marks the current section and scrolls the section bar sideways to keep its button in view. `goTo()` scrolls with `window.scrollTo(... - topOffset() - 8)` and focuses the heading with `preventScroll`.
- **Trend chart height** (~289-320): a `ResizeObserver` on BOTH the trend panel and the "When students practise" panel; it sets the answers chart's height so the two panels end level. The observed left panel contains the chart it resizes, so this is a potential feedback loop; it is guarded by a 2 px threshold, a stacked check and rAF.
- **Section bar labels** (~362-389): `fitNav()` removes `.compact`, measures `scrollWidth > clientWidth`, re-adds it, in one rAF. Called from a `ResizeObserver` on the nav itself, when the section list changes, and after `document.fonts.ready`. No hysteresis.
- **Chart widths** (`charts/useWidth.js`): each chart observes its own wrapper, reads `contentRect.width` and applies it on the next frame (no threshold). Line, column and sparkline charts draw at that pixel width.

### Drawer and sidebar

- `>= 992`: `.t-sidebar` is `position: sticky; height: 100vh`; the collapse button toggles `.nav-collapsed` (`--t-side: 72px`).
- `< 992`: `.t-sidebar` is `position: fixed`, off-screen until `.drawer-open`; Escape, the scrim, the close button and choosing a tab close it; closing returns focus to the menu button. Body scroll is not locked while the drawer is open, and nothing closes the drawer when the window grows past 992 px.

### Populated data (Stage 0.2)

The demo seed (`src/quiz/seed.js`) gives Prof. Demo A 1 course, 2 classes, 10 students, 3 topics and about 25 questions: not enough to stress layouts. So there is a **dev-only fixture**, `scripts/seed-prof-responsive.js`:

- `enrichForProfResponsive(db)` is called by the harness on its own in-memory server (never `data/db.json`, never Supabase).
- Run by hand, `node scripts/seed-prof-responsive.js` writes `data/prof-responsive.json` (gitignored), served with `QUIZ_DATA_FILE=data/prof-responsive.json node server.js`. It refuses to run with `NODE_ENV=production` or `SUPABASE_URL` set, and refuses to write over `db.json`.
- It adds a second course (`Foundations of Applied Data Science and Responsible Computing`, 61 characters), 10 more topics (14 in total; including `Encryption, hashing and digital signatures in everyday systems` and the unbroken `Supercalifragilistic_unbroken_identifier_string_for_wrapping_checks_2026`), 3 more classes (4 active for Prof. Demo A, plus 1 archived, one named `Computing - Evening Cohort for Working Adults (Part-time) 2026`), 34 more students (46 in total, a few with long names or emails), 60 more questions across published/draft/rejected/withdrawn with open reports, practice history in every class (analytics, trends, class comparison), 15 short answers waiting for marking in three classes, materials, 10 generation-log entries, and 45 sessions with usability ratings and comments.
- All of it is made-up dummy data.

## Stage 1: harness and baseline

The harness (`tests/prof-responsive/harness.cjs`) signs in as Prof. Demo A on an in-memory server filled by the fixture. It opens each tab through the sidebar (or the drawer below 992 px) and waits for that tab's data; stable `data-testid` hooks were added for To review, AI drafting, Evaluation and Settings. It then checks:

- page-level overflow (`scrollingElement.scrollWidth - clientWidth`), plus the outermost elements outside the viewport that are not inside a scrolling or clipping container (the page shell's own clip does not count, see A5)
- text clipped by `overflow: hidden/clip` (an ellipsis with a `title` is accepted)
- overlapping controls and headings (bounding boxes, same scroll container, same sticky layer)
- the combined height of the sticky bars (must stay under 30% of the height)
- the end of the page reachable and not under a bar; every Analytics section-bar jump landing below the bars; keyboard focus (20 to 40 Tab presses) never under a sticky bar
- tap targets under 44 x 44 px below 768 px (checkboxes measured through their label; inline links in running text reported as exceptions)
- console errors and warnings, and failed requests

It also exercises the drawer, the Analytics question dialog, the create/rename/code modals, the roster, codes and class-settings sub-tabs, the Question bank card mode and editor, a draft run with its retrieved-material details, and the material library. These states run at 375x667, 430x932, 667x375, 768, 991 and 992.

Run it with `pnpm build && node tests/prof-responsive/audit.cjs --label before --shots`. The BEFORE screenshots are in `docs/mobile/screenshots/prof/before/`. The full issue list is `docs/mobile/prof-audit-before.md` (raw data: `prof-audit-before.json`).

### Baseline (before any fix): 78 of 156 checks pass

| Tab / state | 375x667 | 430x932 | 431x900 | 575x900 | 576x900 | 767x900 | 768x900 | 991x900 | 992x900 | 1199x900 | 1200x900 | 667x375 | 740x360 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Analytics | FAIL (5) | FAIL (4) | FAIL (4) | FAIL (2) | FAIL (1) | FAIL (2) | FAIL (1) | FAIL (3) | pass | FAIL (2) | FAIL (2) | FAIL (2) | FAIL (2) |
| To review | FAIL (1) | FAIL (1) | FAIL (1) | pass | pass | pass | FAIL (1) | FAIL (1) | pass | pass | pass | pass | pass |
| Classes & Roster | FAIL (2) | FAIL (1) | FAIL (1) | FAIL (1) | FAIL (1) | FAIL (2) | FAIL (1) | FAIL (1) | pass | pass | pass | FAIL (2) | FAIL (2) |
| Question bank | FAIL (2) | FAIL (2) | FAIL (2) | FAIL (1) | FAIL (1) | FAIL (1) | FAIL (1) | FAIL (3) | pass | pass | pass | FAIL (1) | FAIL (1) |
| AI drafting | FAIL (2) | FAIL (1) | FAIL (1) | FAIL (1) | FAIL (1) | FAIL (2) | FAIL (1) | FAIL (1) | pass | pass | pass | FAIL (2) | FAIL (2) |
| Evaluation | FAIL (4) | pass | pass | pass | pass | FAIL (7) | FAIL (7) | FAIL (7) | pass | pass | pass | FAIL (7) | FAIL (7) |
| Settings | FAIL (2) | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | FAIL (1) | FAIL (1) |
| state: drawer open | FAIL (1) | FAIL (1) |  |  |  |  | pass | pass |  |  |  | FAIL (1) |  |
| state: analytics question dialog | FAIL (1) | FAIL (1) |  |  |  |  | pass | pass | pass |  |  | FAIL (1) |  |
| state: classes create modal | FAIL (1) | FAIL (1) |  |  |  |  | pass | pass | pass |  |  | FAIL (1) |  |
| state: classes rename modal | FAIL (1) | FAIL (1) |  |  |  |  | pass | pass | pass |  |  | FAIL (1) |  |
| state: classes roster | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: classes code modal | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: classes class settings | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: question bank cards | pass | pass |  |  |  |  | pass | pass | pass |  |  | FAIL (1) |  |
| state: question bank editor | FAIL (1) | FAIL (1) |  |  |  |  | pass | pass | pass |  |  | FAIL (1) |  |
| state: ai drafting retrieved material | FAIL (1) | FAIL (1) |  |  |  |  | pass | pass | pass |  |  | FAIL (1) |  |
| state: ai drafting material library | FAIL (1) | FAIL (1) |  |  |  |  | pass | pass | pass |  |  | FAIL (1) |  |

### What the baseline shows

1. **Analytics overflows** at 991-1200 px by 86-90 px. On phones the same overflow is hidden by `overflow-x: clip` on the shell (65 px clipped at 375 px). The cause is the chart legend: `.viz-legend li { white-space: nowrap }` holds a long topic name (the unbroken fixture string) on one line, so one legend item is 357-419 px wide.
2. **Focus and scroll-into-view land under the sticky top bar** below 992 px on every tab. Nothing tells the browser about the sticky bars (there is no `scroll-padding-top`), so a focused picker can sit 0-44 px down, under a 57 px bar.
3. **Short landscape (740x360)**: the top bar plus the Analytics section bar cover 31% of the height.
4. **Tap targets under 44 px** below 768 px:
   - checkbox labels (Auto-refresh, Show archived classes, Show archived material, import options) are 21-30 px high
   - every `<summary>` (Sources & history, Material library, Show as a table, How this is measured, Material sent to the drafter) is 20-23 px high
   - the tile info buttons are 24 px wide and the by-topic expand buttons 28 px
   - the drawer close button is 34 px, and Log out in the account menu 36 px
   - the editor's correct-option radios are 20 px with no label, and its remove buttons 32 px
5. There are no overlapping controls, no clipped labels, no console errors and no failed requests at any width, and every section-bar jump lands below the bars.

## Stage 2: fixes, tab by tab

All new rules are in **`web/src/teacher/teacher-responsive.css`**, every selector under `.teacher-app` (or `html:has(.teacher-app)`, or `html.is-resizing .teacher-app`). It is imported in `web/src/main.js` right after `app.css`, so its rules win ties with the shell rules they refine (see A9). The only edits to `app.css` remove `overflow-x: clip` from two professor-only rules (A5); no global selector that student pages use was changed. No colour, font or branding was changed.

| Commit | Tab | What changed | Files |
|---|---|---|---|
| `8ea9ff3` | **Analytics** (+ shell) | Chart legend items wrap: a long topic name had made one item 357-419 px wide, so the page overflowed 86-90 px at 991-1200 px and was clipped on phones. `overflow-x: clip` removed from the shell. Scroll padding under the sticky bars: the shell measures the top bar into `--t-topbar-h`, Analytics adds its sticky section bar as `--t-sticky-extra`, and `html { scroll-padding-top }` uses both, so focus, anchors and `scrollIntoView` stop below the bars. Below 992 px and 480 px high, the section bar scrolls with the page (bars were 31% of a 360 px screen); `stickyHeight()` reads the real position. The pinned first column of wide grids is about 38vw on phones, and scroll-region tables keep whole words. Stacked cards wrap long names. 44 px targets below 768 px: checkbox labels, summaries, info and expand buttons, drawer close, Log out, pager. | `App.vue`, `AnalyticsView.vue`, `main.js`, `app.css`, `teacher-responsive.css` |
| (shared) | **To review** | No tab-specific change was needed: after the shell fixes it passes every check at every width, with marking cards, reports and pager included. | |
| `c1ba927` | **Classes & Roster** | Below 768 px, and on screens under 480 px high, the create, rename and join-code dialogs are bottom sheets that scroll inside (`max-height` in svh, then dvh; contained overscroll), with the Cancel / primary row pinned to the sheet's bottom edge. The "Show archived classes" label is a 44 px target (shared rule). | `teacher-responsive.css` |
| `f8c33dc` | **Question bank** | The editor's correct-option radio/checkbox sits in a 44 px `<label class="opt-pick">` (it had no label and was 20 px). Small buttons (remove option, dialog Close, page numbers) are 44 px wide. Option rows stay on one line (pick, text, remove). The card-review Deny/Approve bar is slimmer below 480 px high (bars were 33% of 375 px). | `QuestionEditor.vue`, `teacher-responsive.css` |
| `75e1df2` | **AI drafting** | "Material sent to the drafter" becomes stacked cards below 576 px (its four squeezed columns split words: "numb er syste ms", "1. 5"). Generation log: the date stays on one line, the outcome column wraps from 15em, and the first column is pinned. File pickers are 44 px. | `GenerateView.vue`, `teacher-responsive.css` |
| `04f1c42` | **Settings** | Semester date fields one per line and full width below 768 px. No sticky save bar: the page is three short panels, and each Save sits beside its field (A10). | `SettingsView.vue`, `teacher-responsive.css` |
| `74aab92` | **Evaluation** | Both metrics tables are contained scroll regions with the Source column pinned and a 6.5em minimum per number column (headers had split mid-word: "SOURC E", "TO TA L"). An odd last tile takes the whole row on phones. | `EvaluationView.vue`, `teacher-responsive.css` |

Stable `data-testid`s added: `marking-item`, `todo-empty`, `generate-page`, `evaluation-page`, `settings-page`, `retrieved-table`, `generation-log`, `eval-drafting`, `eval-prep`.

## Stage 3: resize jitter

**Instrumentation** (`tests/prof-responsive/jitter.cjs`, test-only, injected with `addInitScript`). It snapshots the following every animation frame:

- document scroll width and height
- the top bar, the Analytics toolbar and the section bar
- every chart's drawn width (its SVG `viewBox`, i.e. what `useWidth()` measured)
- the section bar's label mode
- the sidebar/drawer class, transform and visibility, the collapsed state, and `is-resizing`

It also captures `ResizeObserver loop ...` errors from `window` error events and the console. `settle()` watches for 1.5 s after the last resize and reports every change after 300 ms; the per-step sweep also flags a step that is still changing 120-250 ms after it.

**Sweeps** (`tests/prof-responsive/jitter-sweep.cjs`, reports `docs/mobile/prof-jitter-before.md` / `prof-jitter-after.md`):

- (a) 1 px steps within 12 px of 1200, 992, 768, 576 and 430, down then up, 50 resizes each
- (b) across 992 with the drawer open, the sidebar collapsed and the sidebar expanded
- (c) height only, 667 to 600 and back
- (d) web fonts held back 4 s
- (e) ten rapid back-and-forth resizes across 992 and 768
- (f) state across 1200 to 375 to 1200

**Code read first (Analytics).**

- `useWidth` observes the chart's own wrapper, whose width comes from its parent; the SVG is `width: 100%`, so its redraw cannot resize what is observed (no loop).
- `fitTrendChart` observes the panel holding the chart it resizes, but it skips changes of 2 px or less, returns 220 px when stacked, and runs in rAF (no loop measured).
- `fitNav` has no hysteresis, but measuring takes `.compact` off and on within one frame against a width set by the parent, so the labels cannot toggle the width they are measured against (0 toggles measured).
- Fonts: `fitNav` runs again after `document.fonts.ready`.

**Measurements and root causes.**

| Finding | Before | After | Root cause and fix |
|---|---|---|---|
| Layout still changing more than 300 ms after a resize | 0 in every sweep | 0 | Nothing bounces. |
| ResizeObserver loop errors | 0 | 0 | None. |
| Steps still animating 120-250 ms after a 1 px step | 2 (991 px and 780 px: the drawer) | 0 | `app.css` `.t-sidebar { transition: transform 0.2s, visibility 0.2s }` (below 992) replayed the slide whenever a breakpoint moved the sidebar between in-page and off-canvas. **Fix**: `App.vue` adds `html.is-resizing` on `resize` and clears it 150 ms after the last event; `teacher-responsive.css` suspends professor-shell transitions meanwhile. The drawer still slides on tap. |
| Drawer open at 991, resized to 1100, then back to 991 | `drawer-open` kept, scrim kept, drawer reappears **open** | closed and shut both ways | `drawerOpen` was only reset by a tap, Escape or a tab choice. **Fix**: a `(max-width: 991.98px)` `matchMedia` listener closes it when the width crosses 992 (focus inside the sidebar stays put; there is no body scroll lock to clear). |
| Reading position, 1200 to 375 to 1200 (Analytics, at Commonly missed) | drifted to Compare classes (the heading ended 2085 px above the view) | heading at 158-167 px throughout; round trip back to the same scroll offset | Browser scroll anchoring drifts across reflows of thousands of pixels. **Fix**: the shell remembers the first heading or card at the top of the view (below the bars) while the professor scrolls, and when a resize ends it scrolls by the drift. |
| Late web font (4 s) | 2 changes in the frames after the fonts land (page height +44 px, then -2 px 47 ms later), no label-mode toggle | same | Acceptable: one reflow when the font arrives plus one follow-up remeasure, then stable. No repeated remeasure. |
| Height-only change (mobile browser bar) | 0 late changes | 0 | |

All other state (selected tab, class, Question bank topic and status filters, class search text, an open Create dialog and the name typed in it) was already kept through the sweep. It is now covered by a test.

**Accepted reflow.** The reflow at the breakpoints themselves is expected and settles within the first frames: the sidebar becomes the drawer at 992, tiles go 4 to 2 columns, and tables become cards at 576. A scrollbar width flip was not observed (the professor pages are long), so no `scrollbar-gutter` was added.

## Stage 4: tests

`test/browser-prof-responsive.test.cjs`: 7 tests on the fixture data, reusing the harness. They run with `pnpm test:prof-responsive`, and with the rest of `pnpm test:browser`, which globs `test/browser*.test.cjs`.

1. Classes & Roster and To review at 320 and 375 px: no page-level overflow. The existing 320 px test covers the other five tabs.
2. All seven tabs at all 13 required viewports: no page overflow, no element outside the viewport, no overlapping controls, sticky bars at most 30% of the height, and no tap target under 44 px below 768 px.
3. The create, rename and join-code dialogs and the Analytics question dialog at 375x667 and 667x375: they fit, scroll inside and keep the primary action reachable.
4. Sticky cover on Analytics and To review at 375x667, 740x360, 991 and 1200: section jumps, 30 Tab presses, the end of the page.
5. The drawer: Escape returns focus, the scrim closes it, and an open drawer is cleanly shut after 991 to 1100 to 991.
6. Settle stability: steps around 1200/992/768, rapid back-and-forth across 992, a height-only change, and the open drawer across 992. No change after 300 ms and no ResizeObserver errors.
7. State through a resize sweep: tab, class, filters, search, open dialog and input, reading position.

`test/browser-authoring.test.cjs` (AI drafting authoring layouts) is unchanged and not duplicated. Commands: `pnpm test:prof-responsive`, `pnpm audit:prof-responsive -- --label after --shots`, `pnpm jitter:prof-responsive -- --label after`, `pnpm seed:prof-responsive`.

## Stage 5: evidence

### After the fixes: 156 of 156 checks pass (baseline 78 of 156)

| Tab / state | 375x667 | 430x932 | 431x900 | 575x900 | 576x900 | 767x900 | 768x900 | 991x900 | 992x900 | 1199x900 | 1200x900 | 667x375 | 740x360 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Analytics | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| To review | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| Classes & Roster | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| Question bank | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| AI drafting | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| Evaluation | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| Settings | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass | pass |
| state: drawer open | pass | pass |  |  |  |  | pass | pass |  |  |  | pass |  |
| state: analytics question dialog | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: classes create modal | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: classes rename modal | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: classes roster | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: classes code modal | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: classes class settings | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: question bank cards | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: question bank editor | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: ai drafting retrieved material | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |
| state: ai drafting material library | pass | pass |  |  |  |  | pass | pass | pass |  |  | pass |  |

Full report: `docs/mobile/prof-audit-after.md`. Screenshots: `docs/mobile/screenshots/prof/after/`, paired with the BEFORE ones in [PROF-SCREENSHOTS.md](PROF-SCREENSHOTS.md).

### Final breakpoint map

| Width / height | Professor layout |
|---|---|
| >= 1200 | Sidebar (244 px, or a 72 px rail) beside the content; 12-column grid panels side by side; the whole Analytics toolbar sticks. |
| 992-1199.98 | Sidebar beside the content; panels full width; overview tiles 2 x 2. |
| <= 991.98 | Sticky top bar + off-canvas drawer (closed whenever the width crosses 992); the Analytics section bar sticks under the top bar; `scroll-padding-top` = top bar + section bar + 8 px. |
| <= 991.98 and <= 480 high | Only the (slimmer) top bar sticks; the section bar scrolls with the page. |
| <= 767.98 | 44 px targets (buttons, small buttons, checkbox labels, summaries, file pickers, editor option picks); 16 px inputs; toolbars and forms one column (semester dates full width); wide grids scroll in their box with the first column at about 38vw; dialogs are bottom sheets with pinned actions; charts one column; odd last tile full row. |
| <= 767.98 and <= 480 high | The card-review action bar is slimmer. |
| <= 480 high (any width) | Dialogs are bottom sheets with pinned actions. |
| <= 575.98 | Stacked-card tables (Weekly topics, By topic, Time and accuracy, quality checks) and stacked "Material sent to the drafter"; Analytics pickers one per line. |
| <= 430 | Tighter gutters, tiles and top bar. |
| While resizing | `html.is-resizing` suspends shell transitions; when the resize ends, the reading position is restored. |

### Intentionally contained table scrolls

Each is inside a `.table-wrap` (`overflow-x: auto`, contained overscroll). A shadow on the side with more to see, and a pinned first column where marked, show that the box scrolls. Measured with the fixture data (4 classes, 14 topics, long names):

| Tab | Table | Scrolls at | Why it is a scroll region |
|---|---|---|---|
| Analytics | Compare classes (pinned) | every width | One column per class; the topic names must stay beside the numbers. |
| Analytics | Trends "Show the chart data as a table" (pinned) | every width | One column per topic (14), weeks down the side. |
| Analytics | When students practise "Show as a table" (pinned) | 375-576, 1200 (narrow column) | Days x 8 time blocks. |
| Analytics | Weekly topics, By topic, Time and accuracy, Difficulty check, Rarely chosen options | 576-1200 | 8-9 columns of numbers; below 576 px they become stacked cards instead. |
| Classes & Roster | Student roster, Join codes (and the trade log on phones) | below 768 (roster and codes have a 660 px minimum table width) | 5 columns (name, email, attempts, last active, actions); the long fixture emails stay whole. |
| AI drafting | Manage topics table | 375 | 6 columns; the topic name is a link that opens its material. |
| AI drafting | Generation log (pinned) | 375-992 | 7 columns; outcomes wrap at 15em. |
| Evaluation | Question drafting, Preparation time (pinned) | 375-992 | 9 and 5 metric columns; the brief asks for these to scroll. |

### Remaining known issues

- From 576 px up to 1200 px, the 9-column Analytics tables (By topic, Time and accuracy, Weekly topics) still scroll a little beside the sidebar when topic names are long. This is the same as before the fixes: they are contained, with a shadow hint, and they become stacked cards below 576 px.
- The section-bar highlight uses its own line (bars + 24 px), so after a resize it can name the previous section while the restored heading sits just below the bars. This is cosmetic, and it corrects on the next scroll.
- A late web font causes one reflow plus one follow-up remeasure within about 50 ms. This is expected; nothing repeats.
- Class dialogs have no X button: they close with Cancel (pinned) and a tap outside (A11).
- Archive, remove-member and revoke-code use the browser's own confirm dialogs, whose layout the app cannot change (A3).

### Test results (2026-11-05)

Final run on the last commit of the branch:

| Suite | Command | Result |
|---|---|---|
| Syntax | `pnpm check` | passed (202 files) |
| Node | `pnpm test` | 461 pass, 0 fail, 1 skipped (462) |
| Vitest | `pnpm exec vitest run` | 101 / 101 (13 files) |
| Browser (includes the 7 new tests) | `pnpm test:browser` | 58 / 58 |
| New professor tests, 3 runs in a row | `node --test test/browser-prof-responsive.test.cjs` x3 | 7 / 7, 7 / 7, 7 / 7 |
| End-to-end, Chromium + Firefox + WebKit | `pnpm test:e2e` | 138 / 138 |
| Responsive audit | `node tests/prof-responsive/audit.cjs --label after` | 156 / 156 (baseline 78 / 156) |
| Resize sweeps | `node tests/prof-responsive/jitter-sweep.cjs --label after` | 0 late changes, 0 ResizeObserver errors, all state kept |
| Student pages unchanged | `node tests/prof-responsive/student-unchanged.cjs <main checkout>` | 18 / 18 identical layout fingerprints (sign-in, Quiz, My Progress, Campfire Run, Summon, Kingdom at 375x667, 768x900, 1200x900), compared with a clean `main` build |

**Note on one transient failure.** In one run during Stage 3 (around 22:40 local time), four tests in `test/browser-authoring.test.cjs` failed, and they failed identically on a clean checkout of `main`. So the cause is outside this branch (likely time-dependent). They pass in the final run above. The student responsive harness (`tests/mobile/`) exists only on the `mobile-fixes` branch, so it was not run; the layout-fingerprint comparison stands in for it on this branch.

## Assumptions

- **A1. Base branch.** `prof-responsive` is cut from `main`, not from the student `mobile-fixes` branch, so the two stay independent. Work happens in a separate git worktree (`.claude/worktrees/prof-responsive`), so the main checkout, where the student work lives, is never switched.
- **A2. Harness location.** The audit harness is `tests/prof-responsive/harness.cjs` + `audit.cjs` (report and screenshots). The assertions are `test/browser-prof-responsive.test.cjs`, so `pnpm test:browser` (glob `test/browser*.test.cjs`) runs them with the other browser tests.
- **A3. "Archive modal".** There is no archive modal: Archive/Restore is a direct toggle with a toast, and remove/revoke use the browser `confirm()`. Adding a modal would be a new feature, so the harness checks the create, rename and code modals, plus the Analytics question dialog.
- **A4. "Reward Pace".** No Reward Pace setting exists on `main`; Class Settings has trading, the analytics time zone and the trade log, and those are what is checked.
- **A5. `overflow-x: clip`.** The existing phone block clipped `.teacher-app` and `main#main` sideways. The brief forbids hiding overflow on the app root, so the harness treats the shell as not a container (it reports what the clip hides) and Stage 2 removes the clip and fixes the causes.
- **A6. Drafting without a network.** The harness server uses an offline stand-in drafter (`offlineDrafter` in the harness) so "Draft questions" runs and shows its retrieved-material details. The Gemini authoring workflow is left to `test/browser-authoring.test.cjs` (not duplicated).
- **A7. Screenshots** are full-page JPEG (quality 60) to keep the repository small.
- **A8. Option reordering.** The question editor has no drag-and-drop reordering, so no up/down buttons were added (that would be a new feature); option rows and remove buttons get touch-sized targets.
- **A9. Stylesheet import.** The brief suggests importing `teacher-responsive.css` from the professor shell. Vite orders CSS by import order, and `App.vue` is imported before `app.css` in `main.js`, so an import in `App.vue` would lose every tie to `app.css`. It is therefore imported in `main.js` right after `app.css`. Every rule is still scoped to `.teacher-app`.
- **A10. Sticky save bars.** The brief asks for a sticky Save/Cancel bar on long forms (Settings, editor), but only where the baseline shows a problem. Settings is three short panels, each with its Save next to its field, and the editor's actions are reachable at the end of the card. Neither failed a check, so no sticky bar was added. The class dialogs do pin their actions (Classes & Roster).
- **A11. Dialog close buttons.** The brief suggests a sticky header with a close button. The class dialogs already close with Cancel (now pinned at the bottom of the sheet) and a tap outside, and the question dialog has its own Close. Adding a second close control would change the dialogs' design, so none was added.
- **A12. Touch targets and inline links.** Text links inside running text (e.g. "Set when the semester starts in Settings", "see To review") are reported as exceptions (WCAG 2.5.8 inline exception), not failures.
- **A13. Student pages.** No student file or shared global selector was changed. The new CSS only matches inside `.teacher-app`, and the App.vue additions only act while a professor is signed in (`teacherActive`). The student-side tests in `test/browser.test.cjs` still pass; the student responsive harness (`tests/mobile/`) lives on the `mobile-fixes` branch, not on `main`, so it cannot be run here (see "Test results").
