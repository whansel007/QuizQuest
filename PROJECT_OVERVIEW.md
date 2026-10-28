# QuizQuest: Project Overview

*An adaptive, gamified practice platform for university courses.*
IS216 group project, Section 7, team "Prince William's Quest". This overview describes `main` as of 28 October 2026 (commit `093ac9b`).

---

## 1. What it does

QuizQuest links three things that are usually separate: **course material**, **personalised practice**, and **feedback for the teaching team**.

1. A professor uploads their course material (slides, PDFs, notes).
2. Google Gemini drafts practice questions from that material. A second, independent Gemini pass and automatic checks screen the drafts. Every draft waits for the professor to approve it; nothing reaches students unreviewed.
3. Students practise with quizzes that adapt to the topics they are weakest in.
4. Practising earns coins and resources that students spend in a game layer: heroes to summon, a kingdom to build, a co-op survival arena to play with classmates.
5. The professor's dashboard shows which topics and questions the class is struggling with, so they can reteach a concept or fix an unclear question.

## 2. Who it's for

| User | Their problem | What QuizQuest gives them |
|---|---|---|
| **Professors and teaching teams** | Writing good practice questions is slow and repetitive; they can't see which concepts students are struggling with until the exam | AI-drafted questions they only need to review, and a dashboard of weak topics and commonly missed questions |
| **Students** | They practise without knowing what they're weak at, and revision is a chore | Practice that targets their weak topics, a progress view per topic, and game rewards for practising regularly |

The prototype is built around one course at a time, with synthetic demo data (no real student data).

## 3. Key features

### For professors (6 tabs)
- **Analytics**: what needs attention, accuracy by topic and by week, trends, commonly missed questions, time and accuracy per question (flags "possibly confusing" questions), question quality, when students practise, a comparison between classes, and a marking queue for short answers. Filter by period (7 days, 30 days, semester, all, custom), export to CSV, print, auto-refresh. Every rate shows how many answers it is based on, and first attempts are counted separately from retries.
- **Classes & Roster**: create, rename and archive classes; manage the roster; issue `QQ-XXXXX` join codes with optional expiry and usage limits.
- **Question bank**: review drafts, approve, reject, withdraw and republish questions; respond to student reports. Editing a published question creates a new version, so earlier attempts keep the version they answered.
- **AI drafting**: upload PDF, PowerPoint (with speaker notes), Word, text, Markdown or CSV files. Text is extracted in the browser. Gemini writes a knowledge report the professor can edit, then drafts 1–10 questions of the chosen formats and style. A second, blinded Gemini request checks each draft before it reaches the review queue.
- **Evaluation**: how often AI drafts are accepted or edited, how much preparation time is saved, and how students use the app.
- **Settings**: semester dates, subject guidance for the AI, trading on/off per class, participation points, class time zone.

### For students (5 tabs)
- **Practice**: sessions of 5, 8, 10 or 15 questions; optional timer (30/60/90 s) with 1.5× or 2× extra time for accommodation; sessions resume after a refresh; questions can be reported to the professor.
- **My Progress**: a practice indicator per topic, recent sessions, and replies to their question reports.
- **World**: *Campfire Defense*, a real-time co-op survival game for up to 4 players per room. Six heroes; the student's kingdom upgrades boost attack and campfire health.
- **Kingdom**: an isometric 3D kingdom with 4 buildings × 3 levels, built with resources earned by practising, plus a class market for trading resources.
- **Pets & shop**: *Hero Summon*, with published odds (60% common / 30% rare / 10% epic) and guaranteed heroes within 10 pulls.

### Question formats
Multiple choice, multi-select, true/false and short answer (text or numeric) for new questions. Numeric and parameterised maths questions, which give each student different numbers, remain supported for existing content.

### Fair and safe by design
- **AI is a drafting aid, not an author.** Every AI question stays a draft until a professor approves it.
- **Short answers graded by AI are provisional.** The professor's mark wins, and coins for them wait until it's confirmed.
- **Rewards can't be farmed.** Coins are paid once per question, capped at 150 a day, and every grant has a unique key so nothing pays twice.
- **The server decides everything.** All grading, rewards and access checks run on the server, and students never receive answer keys before answering.
- **Participation points reward practising, never scores,** and are off by default.

## 4. How it works

```
 Browser (Vue 3 app)                     Node.js server (server.js)                Data
 ─────────────────────                   ─────────────────────────                 ────
 Professor & student screens ── axios ──▶ JSON API  (src/quiz/api.js)  ──────────▶ Supabase Postgres
                                          · 86 routes, role + ownership checks      (21 tables, RLS on)
 Hero Lab arena / Circle Tag ─ Socket.IO ▶ Real-time game loops                       or data/db.json
                                          (src/world, public/hero-lab)               (offline fallback)
                                          · Gemini calls (server only) ───────────▶ Google Gemini API
```

**Main components**

| Part | Where | What it does |
|---|---|---|
| Web server | `server.js` | Plain Node.js HTTP server. Serves the built Vue app, the JSON API and three Socket.IO channels (Hero Lab, the class raid, Circle Tag). |
| API | `src/quiz/api.js` | 86 routes. Each declares who may call it (public, any user, teacher, student), and each handler re-checks that the user belongs to the course or class. |
| Quiz logic | `src/quiz/` | Question formats and validation, grading, adaptive selection (`adaptive.js`), analytics, rewards and the in-game economy, Gemini prompts and quota tracking. |
| Data layer | `src/db/` | Loads the database into memory at start-up and writes changed rows back to Supabase in small batches. Falls back to a local JSON file when Supabase isn't configured. |
| Real-time games | `src/world/`, `public/hero-lab/` | Server-authoritative game loops over Socket.IO. |
| Frontend | `web/src/` | Vue 3 single-file components, split into `teacher/`, `student/` and shared `components/`; built with Vite. |
| Database schema | `supabase/migrations/` | 21 tables. Row-level security is on with no public policies, so only the server (using the secret key) can read data. |

**How adaptive practice chooses questions** (`src/quiz/adaptive.js`):
- **Broad mode, at first:** questions rotate through every topic until each has at least 3 answers.
- **Adaptive mode, after that:**
  - About 30% of questions come from topics where the student is under 75% accuracy, preferring the learning outcomes they recently missed.
  - The other 70% keep broad coverage.
  - The last 15 questions are avoided.
- **Gaps are disclosed:** if the bank is thin, the student is told; the app never pads with unreviewed questions.

## 5. Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3, Vite 8, axios, pdf.js (in-browser PDF text extraction) |
| Backend | Node.js 22+, plain `http` server, Socket.IO 4 |
| Database | Supabase (PostgreSQL), with a JSON-file fallback for offline demos |
| AI | Google Gemini (`gemini-3.5-flash-lite`, falling back to `gemini-3.1-flash-lite`): drafting, verification, image/OCR description, provisional short-answer grading |
| Auth | Email + password with scrypt hashing; 5 wrong attempts lock an email for 15 minutes |
| Testing | Node's test runner, Vitest + Vue Test Utils, Playwright (Chromium, Firefox, WebKit), PGlite for testing the Postgres schema without a Supabase account |
| CI | GitHub Actions on every push and pull request to `main` |
| Package manager | pnpm |

## 6. Current status

**Built and working**
- All six professor tabs and all five student tabs listed above.
- Live Supabase project in the Singapore region, set up and connected.
- About 19,000 lines of application code, plus about 4,300 lines for the Hero Lab game.
- About 420 automated tests across unit, component, integration, server and end-to-end suites, run by CI on every push.
- 179 commits on `main` from 7 September to 28 October 2026.

**Demo data**: 2 courses, 3 classes, 2 professors, 12 students, 29 questions in 6 formats, and about 190 synthetic practice attempts. All demo accounts use the password `quizquest`.

**Must fix before deployment**
- **Password reset doesn't check ownership.** It must require a one-time reset link or code sent to the account's email. Until then, treat any instance with real accounts as unsafe.
- **Join codes are stored in plain text** next to their hash. Only the hash should be stored.
- **The Supabase secret key and database password were shared in chat** and should be rotated.

**Not done yet**
- **Deployment**: no hosting is set up. The plan is a single long-running instance in Singapore, such as Render (`pnpm build`, then `pnpm start`).
- **Forgot password**: there's no button for it on the login page, and no email is ever sent.
- **Live Gemini testing**: the AI features have only been tested with simulated responses.
- **Leftover features without screens**: the class raid boss (server only, since the World tab became Campfire Defense) and the pet shop and eggs (server only, since the tab became Hero Summon).

**Known limitations of the prototype**
- **Single server process:** the whole database is held in memory, so it runs as one instance only.
- **Logins and live game state reset on restart.**
- **No rate limiting** on public endpoints such as sign-up.
- **No backups** on the Supabase free tier.

**Roadmap** (from `docs/API_RECOMMENDATIONS.md` and `docs/PROTOTYPE.md`)
- **Next:** deploy to a long-running host; move the database to per-request Postgres queries with transactions, starting with coins, the shop and trades.
- **Next:** Supabase Auth with password reset by email; Supabase Storage for uploaded files.
- **Later:** LMS integration (LTI 1.3, Google Classroom, Microsoft education tools); error tracking and analytics (Sentry, PostHog); bot protection on sign-up (Turnstile).

**Out-of-date documents**
These conflict with the code; trust this overview or the code instead:
- `docs/PROTOTYPE.md` and `docs/CODEBASE_GUIDE.md` describe passwordless demo login.
- `CHANGELOG.md` claims Supabase Auth and a password-reset email flow, neither of which exists.

## 7. Team

| Member | Area |
|---|---|
| Ho Zhi Yang | Analytics dashboard, Supabase schema and setup |
| Lee Zi Yang Xavier | AI question drafting, adaptive quiz sessions |
| Fang Kaicong | Student progress tracking, question reporting |
| Marxel Angelo Ramesh | User accounts, class management, content upload |
| William Hansel | Gamification, multiplayer World and Hero Lab |
| Wong Kang Wei Jasper | Question bank management, login and sign-up, test suite |

## 8. Try it

```
pnpm install
pnpm dev          # open http://localhost:5173
```

- **Professor:** `prof.a@quizquest.demo`; **student:** `student01@quizquest.demo`. The password for both is `quizquest`.
- **Data:** without a `.env`, data is kept in `data/db.json`. With `SUPABASE_URL` and `SUPABASE_SECRET_KEY` set, it uses Supabase.
- **Tests:** `pnpm test` (server), `pnpm test:unit` (Vitest) and `pnpm test:e2e` (Playwright).
