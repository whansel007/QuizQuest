# QuizQuest

An adaptive, gamified learning platform prototype. Professors build and review a
question bank (with optional AI drafting from their course material). Students
practise in adaptive sessions that focus on their weaker topics, and earn coins,
pets, kingdom buildings and loot in a co-op multiplayer World.

> **Prototype with synthetic data only.** Demo users and course content are
> made up, and every demo account shares a public password. Do not enter real
> student data.

## Features

- **Question bank:** single answer, select-all, true/false, numeric, short answer
  and maths templates (fresh numbers per student), with versioning and review.
- **AI drafting:** weekly topics, lecture-file upload (PDF, PPTX decks with
  speaker notes, TXT, Markdown or CSV), a knowledge report, and questions
  drafted from that material, always saved as drafts for professor review. Text
  is extracted in the browser, so the PDF itself never leaves the professor's
  machine. Every drafted question comes from Gemini; without a key, AI drafting
  is unavailable and questions can still be written by hand.
- **Adaptive practice:** broad at first, then ~70% general / ~30% weaker topics,
  favouring questions similar to ones the student got wrong. Timers, extra
  time and resume after refresh.
- **My Progress and reports:** per-class topic indicators with question counts, confirmed session scores, and question report history with professor responses.
- **Marking and analytics:** short answers get a provisional grade and the
  professor's mark wins. Class analytics and evaluation dashboards.
- **Gamification:** server-side coins, pets and eggs, kingdom buildings, a class
  trading market and an optional participation-points system.
- **Multiplayer World:** real-time co-op map where answering questions gathers
  resources and damages a shared raid boss.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3, built with Vite; axios for API calls |
| Backend | Node.js 22.13+ (`http` module), Socket.IO for the World |
| Database | Supabase (PostgreSQL), or a local JSON file when Supabase isn't set up |
| AI (optional) | Gemini 3.5 Flash-Lite; configurable Gemini 3.1 Flash-Lite fallback |
| Other | pdf.js (PDF text extraction), Playwright and PGlite (tests) |

The browser never decides whether an answer is right or what it earns. Grading,
coins and access checks all happen on the server.

## Quick start

Requires **Node.js 22.13 or newer** and **pnpm** (run `corepack enable` once to get the
version pinned in `package.json`). Use pnpm only: `pnpm-lock.yaml` is the single lockfile.

```bash
pnpm install
pnpm dev
```

Open the **Local** URL printed by Vite (usually **http://localhost:5173**).
The launcher starts the API first, waits until demo accounts respond, then
starts Vite. If port 3000 is occupied, it picks another free API port and
passes it to Vite's proxy. Vue changes hot-reload; restart `pnpm dev` after
changing server code. Ctrl + C stops both processes.

Try it: sign in as `prof.a@quizquest.demo` in one tab, `student02@quizquest.demo`
in another and `student03@quizquest.demo` in a third (password `quizquest` for
all three). Then open **World** in both student tabs to play together. Each tab
keeps its own login.

Without any configuration, data is stored in `data/db.json`.

## Signing in

Users sign in with **email and password**. Passwords are hashed with scrypt
(Node's built-in `crypto`, see `src/quiz/passwords.js`) and the hash never
leaves the server.

| Account | Email | Password |
|---|---|---|
| Prof. Demo A | `prof.a@quizquest.demo` | `quizquest` |
| Prof. Demo B | `prof.b@quizquest.demo` | `quizquest` |
| Student 01 to 12 | `student01@quizquest.demo` … `student12@quizquest.demo` | `quizquest` |

- Data created before passwords were added (an old `data/db.json`, or an existing
  Supabase project) gets these demo emails and the demo password automatically
  when the server starts. No migration or reset is needed.
- A wrong email and a wrong password get the same error message. After 5 wrong
  passwords, that email is locked for 15 minutes.
- Login sessions are kept in server memory for 8 hours, so restarting the server
  signs everyone out.
- **Test accounts page:** the small **Test accounts** button under the form (or
  `/#test-accounts`) lists seeded synthetic users. Click one to sign in without
  a password, or use **Fill form** and enter `quizquest`. The page never lists
  registered accounts. Passwordless test login is limited to those seeded
  synthetic users even when the server runs with `NODE_ENV=production`.

New users can sign up from **Create a student account** on the login page.
Students only — teacher accounts are created by the team, so nobody can
promote themselves by signing up.

## Using Supabase (optional)

1. Create a Supabase project in the **Southeast Asia (Singapore)** region.
2. In the SQL Editor, run `supabase/migrations/20261007000000_quizquest_init.sql`.
3. Copy `.env.example` to `.env` and set `SUPABASE_URL` (the project URL, e.g.
   `https://your-project-ref.supabase.co`) and `SUPABASE_SECRET_KEY`.
4. Run `pnpm dev`. On first start against an empty project, the server writes
   the demo data.

**Keep the secret key private.** It belongs in `.env` only, which is gitignored.
Never put it in the code, in `web/`, or in a chat. If it leaks, rotate it in the
Supabase dashboard.

Run **one server at a time** per Supabase project. See
[PROTOTYPE.md](docs/PROTOTYPE.md#supabase-setup) for details and troubleshooting.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development: starts the API, checks demo-account readiness, then starts Vite on an available port |
| `pnpm build` | Build the Vue app into `dist/` |
| `pnpm start` | Production: server on :3000 serving `dist/` (build first) |
| `pnpm test` | API, database, World and store tests |
| `pnpm test:unit` | Runs the Vitest unit tests (watch mode; use `pnpm exec vitest run` for one pass) |
| `pnpm test:browser` | Builds, then runs the Playwright browser tests |
| `pnpm test:e2e` | Runs the end-to-end tests in `e2e/` on Chromium, Firefox and WebKit |
| `pnpm check` | Syntax-check the JavaScript files |
| `pnpm reset-data` | Wipe local demo data (file store) |
| `pnpm db:reset --confirm` | Wipe and re-seed the Supabase project |

For browser tests, run `npx playwright install chromium` once, or use Edge with
`$env:BROWSER_CHANNEL='msedge'` (PowerShell). To check Safari's and Firefox's
engines too, install them (`npx playwright install webkit firefox`) and set
`$env:BROWSER='webkit'` or `'firefox'` before `npm run test:browser`.

The end-to-end tests need all three engines (`npx playwright install chromium
firefox webkit`). Each browser gets its own server and its own copy of the demo
data, so a run never touches Supabase or your `data/db.json`. All four suites
also run on every pull request.

### Writing an end-to-end test

Put it in `e2e/` as `<feature>.spec.js` and it runs on all three browsers and
in CI. `e2e/helpers.js` has the shared parts:

```js
import { test, expect } from '@playwright/test';
import { signIn, openTab, STUDENT } from './helpers.js';

test('a student sees their own progress', async ({ page }) => {
  await signIn(page, STUDENT);
  await openTab(page, 'My Progress');
  await expect(page.getByRole('heading', { name: 'My Progress' })).toBeVisible();
});
```

Run one spec while you work on it: `pnpm exec playwright test e2e/your.spec.js`.

## Professor authoring workflow

Set `GEMINI_API_KEY` and `GEMINI_MODEL` in the backend `.env` to enable the guided
workflow under **AI drafting**: upload → Markdown knowledge report → professor edits
and saves report → question types and quantities → generation and validation →
Question Bank review → approve and publish. Only published versions
reach students or the Game. Manual authoring, other formats, OCR and grading remain available.

The preferred model is `gemini-3.5-flash-lite`; `GEMINI_FALLBACK_MODEL` defaults to
`gemini-3.1-flash-lite` and can be blank to disable fallback. Both stable IDs and
live JSON inference were verified using Google's model catalogue and API.
The client uses `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
with `x-goog-api-key`, JSON response schemas and backend-only credentials.
No NVIDIA path, remote file upload, grounding, paid cache, Vertex or other provider
is used. See [Google's model reference](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).

Uploads are extracted locally, including PowerPoint slide order and speaker notes.
Limits are 20 files per selection, 100 MB per file, 1,000 pages/slides per file, and
3 million source characters per report. All uploaded course materials are included
automatically, without slide selection or raw-excerpt screens. Review embedded images, charts,
equations and reading order manually or use the existing image transcription tool.
The Markdown editor supports a safe text preview and `.md` download. Unsaved edits
recover in this browser, and saves persist on the server. Concurrent saves use a
revision check; another professor's saved version never silently replaces the editor.
The preview renders headings, emphasis, lists and code; advanced Markdown and LaTeX
remain literal text. Saved reports may contain up to 50,000 characters.

**`Prompt.txt` is the authoritative wording for Gemini.** `PROMPT 1 — LECTURE ANALYSIS`
is sent with every knowledge-report request and `PROMPT 2 — QUESTION GENERATION` with
every drafting request (`src/quiz/prompts.js`). Edit the file to change what the
professor asks Gemini; the server re-reads it when it changes, and an edited Prompt 1
produces a fresh report instead of a cached one. QuizQuest appends its own rules after
each prompt (response schemas, citations, injection defences, plain-text maths) and
states explicitly where they win. For example, the professor's chosen question types
and quantities replace Prompt 2's "10 multiple-choice questions", and coding questions
are only written when the material contains code. Precedence for drafting, highest
first: QuizQuest rules and schemas; the professor's settings for the batch; the
course's Subject guidance; then Prompt.txt. A missing or malformed `Prompt.txt` stops
AI authoring with a clear error before any Gemini request.

Normal-sized material is understood holistically in one request (up to about 70,000
characters per group); larger inputs use cached groups and bounded synthesis. The
result explains concepts, relationships, assumptions, examples, misconceptions,
learning objectives and gaps rather than summarizing each slide.

The latest **saved report**, including professor additions, is the sole source for
new questions. Each save creates an immutable report passage version, keeping older
questions and attempts grounded in the version they used. Slides are not sent during
question generation. Multiple assessments reuse the report with no further analysis.
Choose quantities for single-answer, true/false, select-all, numeric, short-answer
and maths-variation questions (1–10 total), learning goals and preferred styles.
Mixed types share one drafting request and one independent verification request when
valid on the first attempt. Type-specific schemas require answer keys; local checks
reuse the existing format contracts and maths sampling. Checks cover four distinct MCQ
options, answers, explanations, report citations,
duplicate stems, number-only variants and closely paraphrased explanations.
The reviewer solves without the proposed answer key, checks unsupported claims and
configuration fit, and selects supporting quotations from literal report text.
The server verifies each selected quotation against the saved report. Missing/invalid slots are refilled by type while
valid drafts are preserved. These checks are fallible; professors must still
review wording, correctness, difficulty and source material before approving publication.

One shared project budget covers **all models, courses, authoring, OCR, grading and
diagnostics**: at most **15 RPM, 250,000 input TPM and 500 RPD**. Environment limits
may lower those ceilings. Requests are paced and conservatively reserved before
inference; actual usage metadata then reconciles token reservations.
Daily reset follows midnight in America/Los_Angeles, including daylight saving time.
Fallback never obtains a separate quota and is not used to escape a 429.
The persistent ledger is `data/gemini-usage.json` (override with `GEMINI_USAGE_FILE`).
Keep it on persistent disk and never delete/reset it to bypass limits.

Run one AI application process for a ledger, including diagnostic commands; stop
the dev server before launching an independent live verifier. Usage outside this
app still shares Google's project limits, so provider 429 responses remain authoritative.
The API does not expose a reliable free-only billing switch or account-tier check:
keep the key's project on the free tier in AI Studio. This app never enables billing
or switches to another service, and rejects models outside the two allowed Flash-Lite IDs.

Inference has a 60-second configurable deadline and at most three transport attempts
with bounded backoff. Retry-After/RetryInfo cooldowns are respected; daily quota
exhaustion stops work until reset. Short-answer grading uses one attempt, a 15-second
deadline and no quota queue wait; the existing provisional fallback and professor
marking remain authoritative. Image OCR counts image tokens before generation.

Jobs, results and pending validation batches persist through the existing course
extras in the JSON/Supabase store, without a migration. Two jobs may run concurrently,
with one active job per course. Interrupted jobs require explicit Resume; a job has
at most five runs. Valid questions are saved individually, while failed/missing slots
are refilled without recreating survivors. If validation is interrupted, candidates
are retained so resume does not pay to draft them again. Exact repeated requests
reuse the same job. A recovery snapshot repairs interrupted multi-table writes
without overwriting later professor decisions. Keep one server per database as
required by the existing store.

Unsaved uploads/configuration recover through IndexedDB; editor changes recover
within the same tab/version. Upload retries do not duplicate passages. Regeneration
creates a replacement and keeps the original. Storage failures stop further AI work;
transient Windows ledger rename failures retry the write rather than repeat inference.

Explicit live checks (consume quota):

- `node --env-file-if-exists=.env scripts/probe-gemini.js`: catalogue and tiny live inference for both models.
- `node --env-file-if-exists=.env scripts/verify-gemini-live.js`: real PDF/PPTX browser uploads, Markdown report, professor edits, mixed questions, report reuse, selective regeneration, publishing, Game grading and restart recovery.
- Add `--resume tmp/gemini-report-<timestamp>` to reuse a saved verification database.
- `node --env-file-if-exists=.env scripts/verify-gemini-consumers.js`: actual image OCR and provisional short-answer grading.

The workflow verifier uses the authored 12-slide networking lecture fixture, including
worked calculations, misconceptions and scope boundaries. It writes evidence and
screenshots under `tmp/gemini-report-*`, publishes only in its isolated synthetic
database, and never connects to the configured Supabase project. The old
`verify-authoring-live.js` command forwards to this verifier.
Mock-based regression tests establish recovery/access behavior; live evidence is
recorded separately and must not be inferred from mock results.

## Project structure

```
web/                Vue app (built by Vite)
  src/teacher/      professor screens
  src/student/      student screens and the World
  src/api.js        axios client
public/             static assets (hero-lab, tag game)
server.js           HTTP server, static files, Circle Tag game
src/quiz/           API routes, sign-in, grading, adaptive engine, rewards, AI
src/world/          multiplayer World (Socket.IO)
src/db/             Supabase store and table mapping
supabase/           database migration (SQL)
prompts/            prompt files the server reads at request time
test/               automated tests
docs/               API research
```

## The AI's voice

The questions Gemini drafts are given the app's design and voice guidance from
[prompts/design-guidance.md](prompts/design-guidance.md), so what it writes
sounds like the game rather than like a worksheet. The file is read on every
prompt, so you can edit the wording and the next draft uses it - no rebuild, no
restart, no code change. Emptying the file turns the guidance off.

This is the app's own direction. The per-course **Subject guidance** box on the
Settings page is still sent first, so a professor can add to it. The
teacher-facing knowledge report deliberately keeps the calm, conventional voice
instead - the brand book keeps teacher pages data-focused.

Three sets of instructions reach Gemini when a question is drafted, and they
settle their own order:

1. the **QuizQuest rules** in the prompt itself - format, grounding, difficulty,
   response schema;
2. the **professor's settings** for the batch and the course's **Subject
   guidance**;
3. the professor instructions in **`Prompt.txt`** (PROMPT 2).

The design and voice guidance is style only. It never overrides any of those -
it fills the gaps they leave on voice and framing.

## Documentation

- [PROTOTYPE.md](docs/PROTOTYPE.md): full guide (architecture, Supabase, hosting, features)
- [Student progress and reporting](docs/STUDENT_PROGRESS_REPORTING.md): calculations, report workflow, code map and testing
- [docs/AUDIT.md](docs/AUDIT.md): implementation audit and known limitations
- [docs/API_RECOMMENDATIONS.md](docs/API_RECOMMENDATIONS.md): useful APIs for later phases
- [public/tag/HOW_THIS_WORKS.md](public/tag/HOW_THIS_WORKS.md): how the original Circle Tag game works (at `/tag`)
