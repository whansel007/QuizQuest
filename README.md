# QuizQuest

QuizQuest is a gamified learning platform prototype for course question authoring, student practice, progress review, and cooperative class gameplay. Professors manage courses and classes, review and publish questions, and inspect reports and analytics. Students practise from published questions, track topic progress, and use earned rewards in the Kingdom and Campfire Run.

**Deployed app:** [quizquest-4phd.onrender.com](https://quizquest-4phd.onrender.com). Sign in with the accounts under [Demo sign-in](#demo-sign-in).

**Repository:** [github.com/whansel007/QuizQuest](https://github.com/whansel007/QuizQuest)

> **Prototype and synthetic data.** The seeded demo users and course content are fictional, and the demo accounts share a public password. Do not use demo accounts with real student data. A locally created student account is a real account in the configured database; only use synthetic data in this prototype.

## What it includes

- **Course and class management:** professor-managed classes, student enrollment and join codes, topics and learning outcomes.
- **Question bank:** professor-written and AI-drafted questions, review and publishing, version history, and student question reports. Supported formats include single answer, multi-select, true/false, numeric, short answer, and parameterized mathematics.
- **AI-assisted authoring:** extract text from lecture materials in the browser, create and edit a saved knowledge report, draft questions from that report, and review candidates before publishing. AI output remains a draft until a professor approves it.
- **Student learning:** adaptive practice, session resume, feedback, topic progress, and reports awaiting professor review. Unconfirmed short-answer grades do not count as confirmed progress.
- **Professor tools:** marking, question and class analytics, evaluation views, and optional participation points.
- **Class game and rewards:** a real-time cooperative Campfire Run, plus pets, a class market, and a buildable Kingdom. The co-op raid boss has no screen of its own; it is exercised at the protocol level in the end-to-end tests.
- **Experiments:** `/hero-lab` is a separate real-time game prototype; `/tag` is the original Circle Tag experiment.

## Architecture

| Area | Implementation |
|---|---|
| Browser app | Vue 3 and Vite (`web/`) |
| Application server | Node.js `http` API (`server.js`, `src/quiz/`) |
| Realtime | Socket.IO World (`src/world/`) |
| Persistence | Local JSON file by default, or Supabase Postgres |
| AI services | Server-side Gemini for authoring, image transcription, and optional short-answer grading |
| Document extraction | PDF.js and browser-side PPTX and DOCX text extraction; source files are not uploaded as files by the standard authoring flow |

The server owns authorization, answer keys, grading decisions, timers, and rewards. The browser receives student-safe question views; it does not determine correctness or award coins. The standard lecture-import flow extracts text in the professor's browser and sends that text to the application server. If AI drafting or transcription is enabled, relevant course content or images are sent to the configured AI provider. Review sensitive material before sending it.

This remains a prototype with a single-process application model. The Supabase adapter loads application data into the server process and synchronizes changes; run **one application server per database**. Live World state is process-local. This is not a horizontally scaled production architecture.

## Quick start

Requirements: **Node.js 22.19+** and **pnpm 12.4.1**. Enable pnpm through Corepack if needed:

```bash
corepack enable
pnpm install
pnpm dev
```

Open the Local URL printed by Vite, usually <http://localhost:5173>. `pnpm dev` starts the API, waits for seeded demo-account readiness, then starts Vite. If the requested API port (default `3000`) is busy, it selects another available port and configures the Vite proxy. Vue changes hot-reload; restart the command after changing server code. Ctrl+C stops both processes.

With no Supabase configuration, application data is stored in `data/db.json`. The first start creates the synthetic demo data. Keep this file private if you later add any non-synthetic data.

### Demo sign-in

| Role | Email | Password |
|---|---|---|
| Professor | `zhiyang.ho.2025@computing.smu.edu.sg` or `prof.b@quizquest.demo` | `Demo1234!` or `quizquest` |
| Student | `student01@quizquest.demo` through `student12@quizquest.demo` | `quizquest` |

The **Test accounts** link on the sign-in page lists seeded demo identities. Sign-in is per browser tab. Try two student accounts in separate tabs and open **Campfire Run** to see cooperative play.

Students can create accounts from the sign-in page. Professor accounts are provisioned by the team; student registration cannot grant a professor role. Passwords are stored as server-side scrypt hashes. Sessions are held in server memory and expire after eight hours, so a server restart signs users out. Optional password-reset email uses Resend; see [`.env.example`](.env.example).

## Optional configuration

Copy `.env.example` to `.env`. The file is gitignored. Never commit or expose server secrets in browser code or `VITE_*` variables.

| Variables | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | Use Supabase instead of the JSON file. `SUPABASE_SERVICE_ROLE_KEY` is supported as a legacy alternative. Use a server-only secret key, never a publishable/anon key. |
| `GEMINI_API_KEY` | Enable Gemini-backed authoring, image transcription, and optional provisional short-answer grading. `GEMINI_MODEL` and `GEMINI_FALLBACK_MODEL` select the allowed Flash-Lite models. |
| `GEMINI_USAGE_FILE` | Location of the persistent shared Gemini usage ledger. Keep it on persistent storage and run one AI application process per ledger. |
| `RESEND_API_KEY`, `PASSWORD_RESET_FROM` | Enable password-reset emails; verify the sender domain in Resend first. `EMAIL_FROM` is a fallback sender variable. |
| `PORT`, `APP_TIMEZONE` | Set the server port and application time zone. The default time zone is `Asia/Singapore`. |

See [`.env.example`](.env.example) for all supported settings and defaults. Provider limits and availability can change, so check the provider's current terms for the configured key.

## Supabase setup

Create a project (the prototype is intended for the Southeast Asia region), then apply **all three migrations in filename order** using the Supabase SQL Editor or Supabase CLI:

1. `supabase/migrations/20261007000000_quizquest_init.sql`
2. `supabase/migrations/20261016000000_auth_classes.sql`
3. `supabase/migrations/20261023000000_class_join_codes_seq.sql`

Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env`, then run `pnpm dev`. On an empty project, the server seeds synthetic demo data. Row-level security is enabled without browser-access policies; the Node server accesses the database using its secret key. Do not run multiple application servers against this prototype's shared database.

`pnpm db:reset --confirm` irreversibly clears and re-seeds the configured Supabase project. Stop the app and verify the target project before running it. For the local JSON store, `pnpm reset-data` removes the local `data/` directory; the next start seeds it again.

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Start API and Vite development server |
| `pnpm build` | Build the Vue app into `dist/` |
| `pnpm start` | Start the server, serving `dist/` (build first) |
| `pnpm test` | Run Node test files in `test/` |
| `pnpm test:unit` | Start Vitest in watch mode; use `pnpm exec vitest run` for a single run |
| `pnpm test:browser` | Build and run browser-level tests |
| `pnpm test:e2e` | Run Playwright end-to-end journeys on Chromium, Firefox, and WebKit |
| `pnpm test:e2e:retry` | Run each end-to-end journey twice, to catch flaky tests |
| `pnpm test:mobile` | Run the mobile harness and the touch smoke test (see Mobile support and testing) |
| `pnpm test:mobile:unit` | Run the touch-control unit tests |
| `pnpm test:prof-responsive` | Build and run the professor-workspace responsive tests (375-1200 px) |
| `pnpm audit:prof-responsive` | Build and run the professor responsive audit (report and screenshots, see below) |
| `pnpm jitter:prof-responsive` | Build and run the professor resize-jitter sweeps |
| `pnpm seed:prof-responsive` | Write the dev-only populated professor fixture to `data/prof-responsive.json` |
| `pnpm check` | Run the JavaScript syntax checks |
| `pnpm reset-data` | Delete local JSON demo data |
| `pnpm db:reset --confirm` | Clear and re-seed the configured Supabase project |
| `pnpm submit` | Build the submission zip and check it against the brief |
| `pnpm submit:check` | Run the submission checks without building the zip |

### Running the tests

Run the full suite once, from the repository root:

```bash
pnpm check
pnpm test
pnpm exec vitest run
pnpm test:browser
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
```

The Playwright install line is only needed the first time.

Playwright browser engines may need installing with `pnpm exec playwright install chromium firefox webkit`. Browser and end-to-end test servers use isolated temporary JSON stores; they do not use your configured Supabase project or `data/db.json`. The GitHub Actions workflow runs syntax, Node, Vitest, browser, and three-engine end-to-end jobs. The tests use synthetic fixtures and do not require live Gemini or Supabase credentials.

End-to-end cases cover login and signup, practice, question authoring/review, class enrollment, reporting, Kingdom building, and Campfire Run play (see `e2e/`). To run one journey, use `pnpm exec playwright test e2e/login.spec.js`. Add new journeys in `e2e/<feature>.spec.js`; shared login and navigation helpers are in `e2e/helpers.js`.

## Mobile support and testing

QuizQuest works from an iPhone 6/SE-sized phone (375 x 667) up to wide desktops (1200 px and above), in portrait and landscape, with touch or with a mouse and keyboard. Campfire Run (the in-run game) plays in landscape on phones with on-screen touch controls. The full write-up, per-page changes and design decisions are in [`docs/mobile/NOTES.md`](docs/mobile/NOTES.md).

**Supported viewports** (all checked automatically): 360 x 740, 375 x 667, 390 x 844, 412 x 915, 667 x 375 and 740 x 360 (landscape phones), 768 x 1024, 820 x 1180, 1024 x 768 (tablets), 1200 x 800 and 1440 x 900 (desktop).

### Testing in Chrome DevTools

1. Open the app, press **F12**, then click the device toolbar icon (or **Ctrl+Shift+M**).
2. Choose a phone (for example *iPhone SE*), reload, and sign in. The student menu collapses into the ☰ button and drawer.
3. Click the **rotate** icon in the device toolbar to switch to landscape. Campfire Run asks you to rotate in portrait.
4. On a normal desktop window, add **`?touch=1`** to the game URL to force the touch controls with a mouse (for example `http://localhost:3000/hero-lab/world.html?heroId=sheriff&touch=1`). Add `&touchdebug=1` to see the active pointers and gesture state. In the game, Settings → Touch controls (Auto / On / Off) changes the default.

### Testing on a real phone

1. Build and start the server: `pnpm build` then `pnpm start`. The Node server listens on every network interface, port 3000 (or `PORT`).
2. Put the phone on the **same Wi-Fi** as the computer and open `http://<computer-IP>:3000` (find the IP with `ipconfig` on Windows or `ipconfig getifaddr en0` on macOS). Allow Node through the computer's firewall if asked.
3. The clipboard API only works over HTTPS or on localhost, so on a phone over plain HTTP the room code's copy button uses its fallback (a hidden text field and the browser's copy command).
4. [`docs/mobile/PHONE-CHECKLIST.md`](docs/mobile/PHONE-CHECKLIST.md) is a 25-step, 10-minute pass through everything.

### Mobile tests

| Command | What it runs |
|---|---|
| `pnpm test:mobile:unit` | `tests/mobile/touch-logic.unit.test.mjs` (Node, no browser): the pure touch logic - stick vector to 8-way movement and the dead zone, tap versus hold at 180 ms / 12 px, drag to aim for direction and point abilities with range limits, auto-aim target choice and fallbacks, the cancel zone, the Bombardier targeting state machine (tap then arena tap, hold-drag-release, cancel, timeout), pinch zoom clamping, camera clamping at the arena edges, and the screen-to-world round trip. |
| `pnpm test:mobile -- responsive` | `tests/mobile/responsive.spec.mjs` (Playwright, Chromium): every page and dialog state at every viewport above. It fails on any horizontal scroll, anything poking past the viewport, or text/controls cut off by a clipping parent; it saves a screenshot per page per viewport to `docs/mobile/screenshots/` and lists tap targets under 44 x 44 px in `docs/mobile/HARNESS-REPORT.md`. `MOBILE_VIEWPORT=375x667` runs one size; `MOBILE_SMALL=1` adds 320 x 568. |
| `pnpm test:mobile -- touch-smoke` | `tests/mobile/touch-smoke.e2e.mjs` (Playwright, Chromium): the arena sandbox as a 667 x 375 phone with real multi-touch through the Chrome DevTools Protocol. Dragging the stick moves the hero; tapping E sends the skill; hold-drag-release on M1 fires in the dragged direction; releasing in the cancel zone sends nothing; Bombardier tap Q then tap the arena confirms, and Cancel backs out; a two-finger pinch zooms and casts nothing; portrait shows the rotate prompt; the stats panel is hidden and opens from the menu. |
| `pnpm test:mobile` | Both Playwright files. Each run starts its own server (port 4180) with fresh demo data. |

Install the Chromium engine once with `pnpm exec playwright install chromium`.

### Mobile controls (Campfire Run)

On mobile:

- **Move:** drag the left virtual stick.
- **Attack or use an ability:** tap its on-screen button to activate. To aim, hold the button, drag toward the target, then release.
- **Bombardier ultimate:** hold Ultimate, drag to choose a target, then release or tap the arena to confirm. Use the on-screen Cancel button to back out.
- **Emote:** tap the 👋 button and choose an emote.
- **Zoom:** pinch the arena.

A tap aims automatically at the nearest enemy in range. Dragging back onto the button before letting go cancels without spending the cooldown. The ☰ menu (top right) holds Settings, Information, Fullscreen and Leave room.

### Responsive design

Every page uses fluid layouts (CSS grid and flex with `minmax(0, 1fr)`), `clamp()` for type and spacing, and a few breakpoints that follow Bootstrap's (576, 768, 992, 1200 px), plus touch-specific rules under `(pointer: coarse)` and orientation queries for short landscape screens. The page itself (`html`/`body`) never hides overflow: the harness measures every page at every size and fails on any horizontal scroll or clipped content, so each overflow was fixed at its cause (fixed widths, a scaled sprite box, a ten-chip row). Wide tables scroll inside their own box with a shadow hint or turn into stacked cards on phones; long selector rows scroll sideways with scroll-snap. Navigation collapses into a drawer, dialogs become full-screen sheets with a fixed header on phones, and every touch target is at least 44 x 44 px with 16 px form fields, so iOS never zooms on focus. Heights use `dvh`/`svh` with a `visualViewport` fallback, and safe-area insets keep controls clear of notches. The game keeps its server rules untouched: touch input sends exactly the messages the keyboard and mouse send, and a follow camera, a compact HUD and on-screen controls make it playable on a phone.

## Professor workspace responsive design and testing

The professor workspace (Analytics, To review, Classes & Roster, Question bank, AI drafting, Evaluation, Settings) is supported from **375 px** (iPhone 6/SE width) to **1200 px** and wider, in portrait and short landscape (667x375, 740x360). It follows Bootstrap's breakpoints:

- **1200 px and up**: sidebar beside the content
- **992-1199 px**: the panels stack
- **below 992 px**: a sticky top bar and an off-canvas navigation drawer
- **below 768 px**: 44 px touch targets, 16 px inputs, single-column forms and bottom-sheet dialogs
- **below 576 px**: one-row-per-item tables become stacked cards; wide number grids scroll inside their own box, with the first column pinned
- **430 px and below**: tighter gutters

The details, the tab-by-tab fixes and the known limits are in [docs/mobile/PROF-NOTES.md](docs/mobile/PROF-NOTES.md).

**Check it in Chrome DevTools.** Open DevTools, turn on the device toolbar (Ctrl+Shift+M), choose *Responsive*, sign in as Prof. Demo A and try these widths: 375, 430, 575/576, 767/768, 991/992, 1199/1200, plus 667x375 and 740x360 for phones on their side. Check both sides of each pair. Open the menu below 992 px, the class dialogs, and the question editor. Drag the width slowly across 992 px with the drawer open: it closes cleanly.

**Populated data.** `pnpm seed:prof-responsive` writes a dev-only demo file, which you then serve with `QUIZ_DATA_FILE=data/prof-responsive.json node server.js`. It contains 2 courses (one with a 61-character title), 4 active classes and 1 archived one, 46 students, 14 topics including a 60-character name and an unbroken string, 80+ questions in every status, answers waiting for marking, a generation log, and survey comments. It refuses to run with `NODE_ENV=production` or `SUPABASE_URL` set, and never touches `data/db.json`.

**Tests.**

- `pnpm test:prof-responsive` (also part of `pnpm test:browser`) checks every tab at every width for:
  - page overflow, elements off screen, overlaps and tap targets
  - modal fit at 375x667 and 667x375
  - sticky bars never covering focus, section jumps or the end of the page
  - the drawer across 992 px
  - layout that keeps moving after a resize, and ResizeObserver errors
  - state kept through a resize sweep
- `pnpm audit:prof-responsive -- --label after --shots` writes the full report (`docs/mobile/prof-audit-after.md`) and screenshots (`docs/mobile/screenshots/prof/after/`).
- `pnpm jitter:prof-responsive -- --label after` writes the resize measurements (`docs/mobile/prof-jitter-after.md`).

A ten-minute manual pass on a real phone is in [docs/mobile/PROF-PHONE-CHECKLIST.md](docs/mobile/PROF-PHONE-CHECKLIST.md).

**Approach (for the presentation).** We measured before changing anything. A browser harness signs in as a professor with realistic, deliberately awkward data (long names, an unbroken string, dozens of rows) and inspects all seven tabs at 13 viewport sizes, checking overflow, clipping, overlaps, sticky-bar cover, focus, tap-target size, console errors and the interactive states. The fixes then went in tab by tab, as layout-only CSS scoped to the professor shell, so the calm blue theme and the student pages stay unchanged. The rules include:

- chart legends wrap
- table headers keep whole words
- wide grids scroll inside their box with a pinned first column
- dialogs are bottom sheets with pinned actions
- 44 px targets throughout

We also measured resize behaviour separately. Nothing kept moving after a resize stopped, but the drawer's slide replayed across 992 px, an open drawer outlived the breakpoint, and the reading position drifted after big reflows. Each of these got a targeted fix, and the harness became the regression test suite. Before/after screenshots are paired in [docs/mobile/PROF-SCREENSHOTS.md](docs/mobile/PROF-SCREENSHOTS.md).

## AI authoring at a glance

1. A professor imports course material; text extraction runs in the browser. Optional image transcription sends selected images or scanned pages to Gemini.
2. Gemini creates a Markdown knowledge report. The professor edits and explicitly saves it.
3. Questions are drafted from the latest saved report, then checked for format, answer, and source support. Candidates remain drafts for professor review.
4. The professor edits or rejects candidates and publishes approved versions to students.

The saved report is the source of truth for report-based question generation. Saving a changed report creates a new source version; existing questions retain their prior provenance. AI checks can miss mistakes, so review the source and every question before publication. If Gemini is not configured, manual authoring still works; short-answer grading uses a provisional keyword fallback.

Prompt instructions are in [`Prompt.txt`](Prompt.txt), and game-voice guidance is in [`prompts/design-guidance.md`](prompts/design-guidance.md). The provider credential stays on the server. The app maintains a shared local usage ledger for Gemini calls; live diagnostic scripts make real provider requests and can consume quota. These are deliberately not part of the routine test suite:

```bash
node --env-file-if-exists=.env scripts/probe-gemini.js
node --env-file-if-exists=.env scripts/verify-gemini-live.js
node --env-file-if-exists=.env scripts/verify-gemini-consumers.js
```

Stop the running app before launching a separate live verifier that uses the same usage ledger. The authoring verifier uses isolated synthetic application data, but sends requests to Gemini and consumes provider quota.

## Repository map

```text
web/src/              Vue application; teacher, student, and shared components
src/quiz/             API, auth, question formats, grading, adaptive practice, AI
src/world/            Authoritative Socket.IO multiplayer World
src/db/               JSON/in-memory store integration and Supabase adapter
server.js             HTTP server, API mounting, and legacy Circle Tag routes
scripts/              Development launcher, checks, reset and live diagnostics
supabase/migrations/  PostgreSQL schema and incremental changes
public/hero-lab/      Separate Hero Lab game experiment
public/tag/           Circle Tag client and notes
test/                 Node and browser-level tests
e2e/                  Playwright user journeys
docs/presentation/    Final presentation slides (PDF)
```

## Use of AI tools

AI tools were used to generate skeleton code and the synthetic demo data
(seeded users, courses and questions). The team reviewed, adapted and tested
the AI-generated work, and is responsible for all submitted work.

## Third-party code and assets

QuizQuest is built on other people's work. Here is all of it, so it can be
credited properly. QuizQuest's own licence is in [`LICENSE`](LICENSE).

### Art and icons

- **Hero Lab and World icons** - from [game-icons.net](https://game-icons.net/),
  licensed **CC BY 3.0**. The authors of every icon the project uses are
  listed per icon in
  [`public/hero-lab/assets/icons/CREDITS.json`](public/hero-lab/assets/icons/CREDITS.json)
  ("Icons made by {author}"), and the app lists them under **Icon credits**
  in the Hero Lab arena settings. The library licence, with the full list of
  contributors, is in
  [`public/hero-lab/game-icons.net.svg/icons/license.txt`](public/hero-lab/game-icons.net.svg/icons/license.txt).
- **Character sprites** - the 32 cat sprites in
  `public/hero-lab/assets/cat/` are the team's own, produced in **Canva** by
  William Hansel and Nadya Elena Wahyudi. Canva's AI was only used to remove the background colour.
- **Backgrounds and textures** - the storybook paper
  (`public/hero-lab/assets/storybook-paper.svg`) and the forest clearing
  (`public/hero-lab/assets/forest-clearing.svg`) are the team's own, drawn as
  SVG.
- **Fonts** - *Nunito* and *Pixelify Sans*, served from Google Fonts, and
  *Fredoka* and *Nunito* bundled through Fontsource. All three families are
  under the **SIL Open Font License 1.1**. The licence text of the two bundled
  families is in [`web/public/fonts/`](web/public/fonts) (`OFL-Fredoka.txt`
  and `OFL-Nunito.txt`); the families served from Google Fonts carry their
  licence from Google Fonts.
- **The Circle Tag game** (`/tag`) is the team's own earlier proof of concept,
  not a third-party game.

### Libraries

| Library | Used for | Licence |
|---|---|---|
| [Vue](https://vuejs.org/) | the whole front end | MIT |
| [Vite](https://vite.dev/) | the build | MIT |
| [@vitejs/plugin-vue](https://github.com/vitejs/vite-plugin-vue) | the Vite plugin that compiles the `.vue` components | MIT |
| [Socket.IO](https://socket.io/) | the multiplayer World | MIT |
| [socket.io-client](https://socket.io/docs/v4/client/) | the World in the browser | MIT |
| [axios](https://axios-http.com/) | API calls from the browser | MIT |
| [@supabase/supabase-js](https://supabase.com/docs/reference/javascript/introduction) | the optional Supabase data store | MIT |
| [Bootstrap](https://getbootstrap.com/) | the utility classes | MIT |
| [pdf.js](https://mozilla.github.io/pdf.js/) | reading the text out of uploaded PDFs | Apache 2.0 |
| [fflate](https://github.com/101arrowz/fflate) | unzipping uploaded PowerPoint and Word files | MIT |
| [Fontsource](https://fontsource.org/) | the bundled Nunito and Fredoka | OFL 1.1 |
| [Playwright](https://playwright.dev/) | the end-to-end tests | Apache 2.0 |
| [PGlite](https://pglite.dev/) | the tests' in-process PostgreSQL | Apache 2.0 |
| [Vitest](https://vitest.dev/), [jsdom](https://github.com/jsdom/jsdom) | the unit tests | MIT / MIT |
| [@vue/test-utils](https://test-utils.vuejs.org/) | the component unit tests | MIT |

The BM25 ranking in [`src/quiz/retrieval.js`](src/quiz/retrieval.js) follows
Robertson & Zaragoza, *The Probabilistic Relevance Framework: BM25 and Beyond*
(2009).

## Presentation and experiment notes

- [Final presentation slides](docs/presentation/QuizQuest%20Project%20slides.pdf).
- [Circle Tag notes](public/tag/HOW_THIS_WORKS.md): the separate `/tag` experiment.
