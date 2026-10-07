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
- **Source material:** paste text or upload PDFs. Text is extracted in the
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
| AI (optional) | Google Gemini API |
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
