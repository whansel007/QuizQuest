# QuizQuest prototype

A working prototype of the *Adaptive Gamified Learning Platform* proposal,
covering the MVP **and** the later-stage features it lists.
All users and course content are **synthetic** - do not load real student data.

Requires **Node.js 22.13 or newer**, matching the installed PDF.js dependency.
See `AUDIT.md` for the implementation audit, fixes, checks and limitations.

```bash
npm install
npm run dev          # http://localhost:3000, restarts when you edit code (Circle Tag at /tag)
npm test             # tag + quiz API + multiplayer World tests
npm run check        # syntax-check Node and browser modules
npm run test:browser # Playwright browser regressions (install Chromium first)
npm start            # run without watch mode
npm run reset-data   # wipe data/ and re-seed on next start
```

For browser tests, run `npx playwright install chromium` once. Alternatively,
use an installed Edge browser: `$env:BROWSER_CHANNEL='msedge'` in PowerShell,
then `npm run test:browser`. Tests use synthetic, in-memory data and do not
call a live AI provider; leave `GEMINI_API_KEY` unset when running them.

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
- **Supabase / Cloudflare / React migration.** It needs your accounts and keys,
  and it's a rewrite, not a feature. The prototype keeps a JSON file store
  and plain JS so it runs anywhere with `npm run dev`. `api.js` is organised
  so each route maps onto a Supabase table + row-level-security policy later.
- **Real login.** Still "pick a demo user". The World uses the same token.

## AI features

Without configuration, an **offline template drafter** writes single-answer
and true/false questions from definition sentences; short answers fall back
to keyword grading; scans/diagrams are unavailable. To use Gemini, put the
key in `.env` (gitignored), never in code:

```
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash   # optional; check the current model name
```

then `npm run dev:ai`. Models only receive course material or an
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
- The JSON store is single-process. Move to Postgres before more than a demo.

## Why the grid/tag game is still separate

Circle Tag (`/tag`) is unchanged. The World **reuses its ideas**
(server-authoritative movement, held-keys input, snapshot broadcast, the
grid) in a new module rather than editing the tag game, so the original
experiment and its test keep working.
