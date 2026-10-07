# QuizQuest prototype

A working prototype of the *Adaptive Gamified Learning Platform* proposal,
covering the MVP **and** the later-stage features it lists.
All users and course content are **synthetic** - do not load real student data.

Requires **Node.js 22.13 or newer**, matching the installed PDF.js dependency.
See `AUDIT.md` for the implementation audit, fixes, checks and limitations.

```bash
npm install
npm run dev          # open http://localhost:5173 (Vue app, hot reload); API + World on :3000
npm test             # tag + quiz API (in memory AND on the Supabase schema) + World + store tests
npm run check        # syntax-check Node and browser JS modules
npm run build        # build the Vue app into dist/ (served by the Node server)
npm start            # production mode: http://localhost:3000 serves dist/ (build first)
npm run test:browser # builds, then runs the Playwright browser regressions
npm run reset-data   # wipe data/ and re-seed on next start (file store only)
npm run db:reset -- --confirm   # wipe the Supabase project and re-seed (Supabase only)
```

For browser tests, run `npx playwright install chromium` once (re-run it after
upgrading Playwright). Alternatively, use an installed Edge browser:
`$env:BROWSER_CHANNEL='msedge'` in PowerShell, then `npm run test:browser`.
Tests use synthetic data and do not call a live AI provider or a live
Supabase project; leave `GEMINI_API_KEY` unset when running them.

## Architecture

```
Browser: Vue 3 app (web/src, built by Vite)
   |  axios -> /api/*            socket.io-client -> /world
   v
Node server (server.js): grading, coins, access checks, AI calls, World loop
   |  supabase-js with the SECRET key (server-side only)
   v
Supabase Postgres (supabase/migrations), row level security on, no policies
```

- **Frontend:** Vue 3 single-file components in `web/src` (`teacher/`,
  `student/`, shared `components/`). `web/src/api.js` is the axios client:
  it adds this tab's token, ignores responses meant for a user who has since
  switched, and signs out on 401. Templates escape all text; `v-html` is not
  used anywhere.
- **Backend:** unchanged rules. The browser still never receives answer keys
  and never decides correctness or rewards.
- **Database:** with `SUPABASE_URL` set, `src/db/supabase-store.js` loads
  every table at startup and writes back **only changed rows**, batched
  every 250 ms. Without it, the JSON file store in `data/` is used as before.
  The field-to-column mapping is in `src/db/schema.js`.
- **Stepping stone:** run **one** server instance per Supabase project. The
  long-term design queries Postgres per request, with coin, shop and trade
  updates as database transactions. The schema (unique `ref_key` on both
  ledgers, foreign keys, indexes) is already designed for that. Migrate one
  area at a time: coins, shop and trades first.

## Supabase setup

1. Create a project in the **Southeast Asia (Singapore)** region (PDPA; the
   region can't be changed later).
2. Apply `supabase/migrations/*.sql`, either in the dashboard's SQL editor or
   with the Supabase CLI (`supabase link` then `supabase db push`).
3. Copy `.env.example` to `.env` and set `SUPABASE_URL` and
   `SUPABASE_SECRET_KEY`. The secret key is for the Node server only: never
   put it in `web/`, in a `VITE_*` variable or in git. If it leaks, rotate it.
4. `npm run dev`. On first start against an empty project, the server writes
   the synthetic demo data. It refuses to seed over existing rows.

Row level security is enabled on every table with no policies, so the
browser-facing (publishable/anon) key can read nothing. The server rejects
that key if it is configured by mistake. The free plan pauses inactive
projects and has no backups. See `docs/API_RECOMMENDATIONS.md` for the plan
upgrade and other services.

## Hosting

The server needs a long-running process (World game loop, WebSockets), so
use a platform such as Render, Fly.io, DigitalOcean App Platform, Cloud Run
(min instances 1) or Azure App Service, in a Singapore region. Run
**exactly one instance** while the stepping-stone store is in use. The build
command is `npm ci && npm run build` and the start command is `npm start`.
Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and (optionally) `GEMINI_API_KEY`
as the host's secret environment variables.

Unfinished practice sessions can be resumed from Practice after refreshing or
switching tabs. The original server-side timer is preserved. Published question
tags are fixed to preserve history; create a new question to change their topic
or learning outcome. Unpublished draft tags remain editable.

Short-answer correctness rewards and practice-indicator updates wait for a
professor's confirmation. The confirmed mark updates session summaries and
answer replays. Already-issued rewards (including those from older versions of
the prototype) are not clawed back if a professor later changes a final mark.

If `data/db.json` was written by an older version, it is renamed to
`db.v1.bak.json` and fresh demo data is seeded. `QUIZ_DATA_FILE=...` points the
server at a different data file (handy for running two copies).

Logins are per browser tab. Good demo users:

| User | Why |
|---|---|
| Prof. Demo A | owns the Computing course: every professor tab |
| Student 01 | no history yet, so sessions sample **broadly** |
| Student 02 | weak at Networking, so sessions **focus** there (~70%) |
| Students 02 + 03 in two tabs | meet in the **World** and fight the raid boss together |
| Prof. Demo B / Student 07 | a separate class, used to show isolation |

## Proposal → code

### MVP

| Proposal section | Where | Notes |
|---|---|---|
| 1. Question bank | `src/quiz/api.js`, *Question bank* + *Source material* tabs | Paste text or **upload a text-based PDF** (text extracted in the browser with pdf.js). Passages stored separately from questions. Editing a published question creates a new version. Withdraw / reject / student reports. |
| 2. Controlled generation | `generator.js`, `retrieval.js`, `validate.js`, *AI drafting* tab | Retrieve chunks → draft → structure checks → **drafts only**. Identical inputs are cached; daily cap; retries capped. Shows which chunks were sent and why. |
| 3. Adaptive algorithm | `adaptive.js` | Broad until each topic has 3 attempts, then 70/30 weak/other. Short bank is **disclosed**, never padded. |
| 4. Analytics | `analytics.js`, *Analytics* tab | Denominators everywhere, first attempts vs retries, most-chosen wrong option, World answers counted. |
| 5. Gamification | `rewards.js`, *Pets & shop* | Server-side coins, once per question ever, unique ledger keys, daily cap, disclosed egg odds. |

### Later stages (now built)

| Proposal item | Where | How it's kept safe |
|---|---|---|
| **More question formats** (§6) | `formats.js`, editor in *Question bank* | Single answer, select-all, true/false, numeric (± tolerance, units), short answer, maths variation. Students never get keys, formulas or key points before answering. |
| **Constrained maths validation** (§6) | `mathexpr.js`, `formats.js` | Formulas go through a small whitelist parser (no `eval`). Templates are sampled 80 times; <90% usable instances = rejected. Each student gets fresh numbers; the server computes the answer and "common mistake" distractors. |
| **Free-response grading** (§1, out of MVP) | `grading.js`, *Analytics → Answers to mark* | Gemini (if configured) or keyword coverage of the professor's key points. Always **provisional**; the professor's mark wins, shown without student names. The answer goes to the model as data, with no identity attached. |
| **Scanned documents & diagrams** (§1, out of MVP) | `vision.js`, *Source material* | Scanned PDF pages are detected; page images or uploaded diagrams go to Gemini, which suggests text that the professor edits before saving. The model flags personal data it sees. Needs `GEMINI_API_KEY` (no offline OCR). |
| **Better retrieval** (§6) | `retrieval.js` | Long material is chunked (~700 chars) and ranked with BM25 + tag boost + optional focus keywords. |
| **Subject-specific prompts** (§6) | *Settings* | Per-course "subject guidance" is added to every drafting prompt. |
| **Multiplayer combat** (§5 future) | `src/world/world.js`, *World* tab | Built on Circle Tag's engine. One world per class (Socket.IO room), token-checked handshake, co-op only (no PvP, no chat, emotes only). Correct answers near the boss damage it; every contributor shares the victory reward. |
| **Resource gathering** (§5 future) | *World* + `economy.js` | Answer a question at a node to gather; nodes are reserved while you answer; daily resource cap. |
| **Kingdoms** (§5 future) | *Kingdom* tab | Spend resources on 4 buildings × 3 levels; castle grows with them. Cosmetic only. |
| **Trading** (§5 future) | *Kingdom → Class market*, *Settings → Trade log* | Open offers to the whole class only, escrow, size/open/daily limits, no coin trading, professor kill switch (refunds open offers) and trade log. |
| **Participation points** (§5, team decision) | *Settings*, *Analytics* | **Off by default.** When on: 1 point per completed 5+ question session, max 3/week, never based on score. CSV export (formula-injection safe). |
| **Evaluation** (Technical section) | `evaluation.js`, *Evaluation* tab | Acceptance/edit rates by source, preparation time (editor time, capped), recommendation behaviour (focus share, follow-up accuracy), usability (completion, duration, 3-face survey). Descriptive only. |

### Deliberately not built

- **Vouchers.** They have real-world value, need budget/procurement and
  fraud controls, and the proposal says the prototype has no payment
  functionality. They stay a team decision.
- **Per-request database queries and multiple server instances.** See
  *Architecture* above: Supabase is the database, but the server still keeps
  a working copy in memory (one instance only).
- **Real login.** Still "pick a demo user" (users are stored in Supabase).
  Supabase Auth is the next step. The World uses the same token.

## AI features

Without configuration, an **offline template drafter** writes single-answer
and true/false questions from definition sentences; short answers fall back
to keyword grading; scans/diagrams are unavailable. To use Gemini, put the
key in `.env` (gitignored), never in code:

```
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash   # optional; check the current model name
```

then `npm run dev` (`.env` is loaded automatically). Models only receive course material or an
anonymous answer, wrapped as data with instructions to ignore embedded
instructions; all output goes through code checks and human review.
The Gemini paths are written against the documented REST API but have
**not** been exercised against a live key in this repo's tests.

## Production notes for the team

- World display names are the account names; a real deployment should use
  nicknames so students aren't identifiable to classmates.
- Uploaded PDFs are processed in the professor's browser; only the extracted
  text (and, for scans, page images sent to Gemini) leave it. The retention
  rules the proposal mentions still need defining. Passages can be deleted.
- Supabase is supported, but the store is single-instance (see *Architecture*).
  Move to per-request queries and Supabase Auth before real users.

## Why the grid/tag game is still separate

Circle Tag (`/tag`) is unchanged. The World **reuses its ideas**
(server-authoritative movement, held-keys input, snapshot broadcast, the
grid) in a new module rather than editing the tag game, so the original
experiment and its test keep working.
