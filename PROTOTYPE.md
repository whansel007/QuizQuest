# QuizQuest prototype

A working prototype of the *Adaptive Gamified Learning Platform* proposal.
All users and course content are **synthetic** - do not load real student data.

```bash
npm install
npm start            # http://localhost:3000   (Circle Tag still at /tag)
npm test             # API security/integrity tests + the original tag test
npm run reset-data   # wipe data/ and re-seed on next start
```

Open two browser tabs to be a professor and a student at the same time (login
is per tab). Good demo users:

| User | Why |
|---|---|
| Prof. Demo A | owns the Computing course: review queue, drafting, analytics |
| Student 01 | no history yet, so sessions sample **broadly** |
| Student 02 | weak at Networking, so sessions **focus** there (~70%) |
| Prof. Demo B / Student 07 | a separate class, used to show isolation |

## Proposal → code

| Proposal section | Where | Notes |
|---|---|---|
| 1. Question bank | `src/quiz/api.js` (teacher routes), *Question bank* + *Source material* tabs | Passages stored separately from questions. Edits to a published question create a new version; attempts record which version they answered. Withdraw / reject / student reports. |
| 2. Controlled generation | `src/quiz/generator.js`, `src/quiz/validate.js`, *AI drafting* tab | Retrieve ≤3 passages → draft → structure checks → **drafts only**. Identical inputs are cached; daily cap; retries capped. Coverage table shows gaps. |
| 3. Adaptive algorithm | `src/quiz/adaptive.js` | Broad until every topic has 3 attempts, then 70/30 weak/other. Avoids recent repeats. Short bank is **disclosed**, never padded. Weights live in `ADAPTIVE`. |
| 4. Analytics | `src/quiz/analytics.js`, *Analytics* tab | Every rate has its denominator. First attempts vs retries. Most-chosen wrong option. No per-student labels. |
| 5. Gamification | `src/quiz/rewards.js`, *Pets & shop* tab | Coins computed server-side, once per question ever, unique ledger keys, daily cap. Egg odds shown before purchase. Pet attacks NPC on correct answers. |
| Security | `src/quiz/api.js` | Role + class checks on every route (404 for other classes). Students never get answer keys before answering, or drafts. Response time and timer are measured on the server. CSP + body-size limits. |

## AI drafting

Without configuration, an **offline template drafter** turns definition
sentences ("X is ...") into simple questions so the review workflow can be
demoed. To use Gemini, put the key in a `.env` file (already gitignored),
never in code:

```
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash   # optional; check the current model name
```

then `npm run start:ai`. The model only receives course passages, wrapped as
reference data with an instruction to ignore embedded instructions.

## Deliberately not production-ready

- **Demo login** (pick a user, no password). The real build would use Supabase
  Auth with admin-assigned teacher roles.
- **JSON file store** (`data/db.json`) instead of Supabase/Postgres; access
  rules are enforced in `api.js`, not by row-level security.
- **Vanilla JS front end** (no build step) rather than React/Vue.
- Paste-text only; no PDF upload yet.
- Open team decisions are left as constants: adaptive weights (`ADAPTIVE`),
  reward amounts and caps (`REWARDS`), coverage target per outcome (seed).

## Why the grid/tag game isn't the quiz's foundation

The Circle Tag experiment (`public/index.html`, `public/client.js`) is kept
as-is at `/tag`. The proposal puts multiplayer and free movement in *future
enhancements*, so the quiz doesn't depend on it. What *was* reused is its
architecture: a single dependency-light Node server, and the
**server-authoritative** rule. Tag trusts keys, not positions; the quiz trusts
choices, not scores. If the team later wants a shared world (e.g. pets
roaming a lobby), the Socket.IO server is already wired into the same port.
