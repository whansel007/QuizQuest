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

## Assumptions

- **A1. Base branch.** `prof-responsive` is cut from `main`, not from the student `mobile-fixes` branch, so the two stay independent. Work happens in a separate git worktree (`.claude/worktrees/prof-responsive`), so the main checkout, where the student work lives, is never switched.
- **A2. Harness location.** The audit harness is `tests/prof-responsive/harness.cjs` + `audit.cjs` (report and screenshots). The assertions are `test/browser-prof-responsive.test.cjs`, so `pnpm test:browser` (glob `test/browser*.test.cjs`) runs them with the other browser tests.
- **A3. "Archive modal".** There is no archive modal: Archive/Restore is a direct toggle with a toast, and remove/revoke use the browser `confirm()`. Adding a modal would be a new feature, so the harness checks the create, rename and code modals, plus the Analytics question dialog.
- **A4. "Reward Pace".** No Reward Pace setting exists on `main`; Class Settings has trading, the analytics time zone and the trade log, and those are what is checked.
- **A5. `overflow-x: clip`.** The existing phone block clipped `.teacher-app` and `main#main` sideways. The brief forbids hiding overflow on the app root, so the harness treats the shell as not a container (it reports what the clip hides) and Stage 2 removes the clip and fixes the causes.
- **A6. Drafting without a network.** The harness server uses an offline stand-in drafter (`offlineDrafter` in the harness) so "Draft questions" runs and shows its retrieved-material details. The Gemini authoring workflow is left to `test/browser-authoring.test.cjs` (not duplicated).
- **A7. Screenshots** are full-page JPEG (quality 60) to keep the repository small.
- **A8. Option reordering.** The question editor has no drag-and-drop reordering, so no up/down buttons were added (that would be a new feature); option rows and remove buttons get touch-sized targets.
