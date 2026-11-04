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
| Professor | `prof.a@quizquest.demo` or `prof.b@quizquest.demo` | `quizquest` |
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

See [`.env.example`](.env.example) for all supported settings and defaults. Gemini quota and reset-day accounting are distinct from the app's `APP_TIMEZONE`; quota tracking is documented in the [codebase guide](docs/CODEBASE_GUIDE.md#16-configuration-gemini-requests-retries-and-quotas). Provider limits and availability can change, so check the provider's current terms for the configured key.

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
docs/                 Architecture, operations, workflows, audits, and UI guides
```

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

## Documentation

- [Codebase guide](docs/CODEBASE_GUIDE.md): architecture, workflows, API routes, persistence, security boundaries, and limitations.
- [Prototype and deployment guide](docs/PROTOTYPE.md): local operation, Supabase, hosting, features, and prototype constraints.
- [Testing guide](docs/TESTING.md): test suites, browser setup, and isolated test data.
- [Class enrollment](docs/CLASS_ENROLMENT.md): class membership and join-code workflow.
- [Student progress and reporting](docs/STUDENT_PROGRESS_REPORTING.md): calculations, report workflow, and implementation map.
- [Economy](docs/ECONOMY.md): coins, Kingdom resources, daily earning caps, summons, and building upgrades.
- [Implementation audit](docs/AUDIT.md): findings and known limitations.
- [UI notes](docs/ui/README.md): design system and screen-specific implementation notes.
- [Circle Tag notes](public/tag/HOW_THIS_WORKS.md): the separate `/tag` experiment.
