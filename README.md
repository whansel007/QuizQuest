# QuizQuest

An adaptive, gamified learning platform prototype. Professors build and review a
question bank (with optional AI drafting from their course material). Students
practise in adaptive sessions that focus on their weaker topics, and earn coins,
pets, kingdom buildings and loot in a co-op multiplayer World.

> **Prototype with synthetic data only.** Demo users and course content are
> made up. Login is a passwordless "pick a demo user" screen. Do not enter real
> student data.

## Features

- **Question bank:** single answer, select-all, true/false, numeric, short answer
  and maths templates (fresh numbers per student), with versioning and review.
- **Source material:** paste text or import multiple PDFs, PPTX decks (with
  speaker notes), TXT, Markdown or CSV files. Text is extracted in the
  browser, so the PDF itself never leaves the professor's machine.
- **AI drafting:** questions drafted from retrieved course material, always saved
  as drafts for professor review. An offline drafter works without an AI key.
- **Adaptive practice:** broad at first, then ~70% weaker topics. Timers, extra
  time and resume after refresh.
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

Requires **Node.js 22.13 or newer**.

```bash
npm install
npm run dev
```

Open **http://localhost:5173**. This runs the Vue app (with hot reload) and the
Node server on port 3000 together. Stop both with Ctrl + C.

Try it: pick **Prof. Demo A** in one tab, **Student 02** in another and
**Student 03** in a third. Then open **World** in both student tabs to play
together.

Without any configuration, data is stored in `data/db.json`.

## Using Supabase (optional)

1. Create a Supabase project in the **Southeast Asia (Singapore)** region.
2. In the SQL Editor, run `supabase/migrations/20261007000000_quizquest_init.sql`.
3. Copy `.env.example` to `.env` and set `SUPABASE_URL` (the project URL, e.g.
   `https://your-project-ref.supabase.co`) and `SUPABASE_SECRET_KEY`.
4. Run `npm run dev`. On first start against an empty project, the server writes
   the demo data.

**Keep the secret key private.** It belongs in `.env` only, which is gitignored.
Never put it in the code, in `web/`, or in a chat. If it leaks, rotate it in the
Supabase dashboard.

Run **one server at a time** per Supabase project. See
[PROTOTYPE.md](PROTOTYPE.md#supabase-setup) for details and troubleshooting.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development: Vue app on :5173 and server on :3000, with auto-reload |
| `npm run build` | Build the Vue app into `dist/` |
| `npm start` | Production: server on :3000 serving `dist/` (build first) |
| `npm test` | API, database, World and store tests |
| `npm run test:browser` | Builds, then runs the Playwright browser tests |
| `npm run check` | Syntax-check the JavaScript files |
| `npm run reset-data` | Wipe local demo data (file store) |
| `npm run db:reset -- --confirm` | Wipe and re-seed the Supabase project |

For browser tests, run `npx playwright install chromium` once, or use Edge with
`$env:BROWSER_CHANNEL='msedge'` (PowerShell).

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
server.js           HTTP server, static files, Circle Tag game
src/quiz/           API routes, grading, adaptive engine, rewards, AI
src/world/          multiplayer World (Socket.IO)
src/db/             Supabase store and table mapping
supabase/           database migration (SQL)
test/               automated tests
docs/               API research
```

## Documentation

- [PROTOTYPE.md](PROTOTYPE.md): full guide (architecture, Supabase, hosting, features)
- [AUDIT.md](AUDIT.md): implementation audit and known limitations
- [docs/API_RECOMMENDATIONS.md](docs/API_RECOMMENDATIONS.md): useful APIs for later phases
- [HOW_THIS_WORKS.md](HOW_THIS_WORKS.md): how the original Circle Tag game works (at `/tag`)
