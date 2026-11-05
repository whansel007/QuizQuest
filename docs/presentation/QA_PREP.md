# QuizQuest — Q&A Preparation Pack

> **The two rows in section 4 that describe the unauthenticated demo endpoints — passwordless `{userId}` sign-in and the public `GET /api/demo-users` — are in the shipped copy of this file.** They are the honest answers, and the demo password is already published in `README.md`, so hiding them would only make this pack wrong about what we ship.

Working document for the final presentation. Every answer below is true of the code as it is on **5 Nov 2026**. **Line numbers are against `origin/main` at `1c9feeb` (5 Nov 2026)** — re-run `grep -n` after any merge, because a merge moves the lines out from under your fingers.

**One code state exists, and it is the live one.** The Render service **redeploys from `origin/main` automatically**, so "merged but not deployed yet" is not a state this app can be in.

| State | Where | What it has |
|---|---|---|
| **A — mainline** | `origin/main` (the code we ship) | `web/src/teacher/ClassManagementView.vue` is 1010 lines, **three sub-tabs: "Student Roster (N)", "Join Codes (N)" and "Class Settings"**, a search box on the class grid, and a "Settings" button on every class card. `SettingsView.vue` is 90 lines and keeps only course-wide settings. |
| **B — deployed** | the live Render deployment | The same code. The deployment redeploys from `main` on its own, and the live bundle (checked 4 Nov 2026) carries the class search box and the "Class Settings" tab. |

PR #51 (`feature/class-settings-in-class-management`, tip `022e09f`, includes `2781e75`) **is merged into `origin/main`** as `22fcf74` **and it is live**. If the professor asks where the per-class settings went, the honest answer is: *"they were moved out of Settings into the class's own page — that is merged into main, and the live site is already running it."*

**Ownership (Section 7 "Who do what?"):** William Hansel — gamification and rewards · Xavier Lee — AI question drafting and adaptive quiz sessions · Kai Cong — student progress tracking and question reporting · **Marxel — user accounts, class management, learning content upload** · Ho Zhi Yang — professor analytics dashboard · Jasper Wong — question bank management.

**One rule for the whole team:** the person who owns the feature answers it. Hand over early, hand over with the screen already open.

**Changed after this pack was first written (3 Nov, 8:57 PM):** Xavier removed the
**"Regenerate draft"** button from the question bank — removed entirely, not moved
(`460e5b8`, on `main`). It no longer appears on a question card. If the professor
asks whether AI drafts can be re-rolled, the answer is now **no**: the professor
edits the draft by hand instead.

**Also merged on 4 Nov, and live:** three more PRs went into `main` — **#58** (an archived class can no longer be enrolled into or given a join code; classes are archived, never deleted), **#59** (a class can be renamed and its description cleared, and a duplicate class name is refused), and **#60** (the Material library: archive and restore a passage, edit its title and learning outcome, and tick "Show archived material" — archived material is left out of the knowledge report). All three are on `main` and on the live site.

**The app name is QuizQuest.** "Prince William's Quest" is the **team** name
(Section 7, G7), confirmed by William on 3 Nov at 8:22 PM. Do not mix them up if
the professor says the team name out loud. There is also **no student tab named
"World"** — the tab that used to be called World is now **Campfire Run**
(`web/src/App.vue:31`, `web/src/student/HeroLabView.vue:209`).

---

## 1. The 8 most likely to be aimed at Marxel

### Q1. "You said you use Supabase. But there's no Supabase Auth — what is your authentication actually?"

**Answer:** It is entirely custom, and deliberately so. There is no call to `supabase.auth` or `signInWithPassword` anywhere in `src/`, `web/` or `server.js` — a password is hashed with `scryptSync` and a random 16-byte salt and stored as `scrypt$<saltHex>$<hashHex>`, verification is `scryptSync` plus `crypto.timingSafeEqual`, and a session is a 24-byte random token in an in-memory `Map` with an 8-hour TTL. We wrote it ourselves because auth is plumbing, not a feature, and the rubric says so.

**Proves it:** `src/quiz/passwords.js:20-24` (hash), `:26-33` (verify + timing-safe compare), `src/quiz/api.js:217` (`const tokens = new Map()`), `src/quiz/api.js:59` (`TOKEN_TTL = 8 * 3600 * 1000`).

### Q2. "Is the password reset actually working, or is it a mock?"

**Answer:** It exists and it is real, but it depends on a mail provider. Without `RESEND_API_KEY` and `PASSWORD_RESET_FROM`/`EMAIL_FROM` set, the endpoint refuses outright and says *"Password recovery by email is not available in this build. Ask the project team to reset it for you."* — it does not pretend to have sent a code. With them, a 6-digit OTP goes out via Resend, is stored as a SHA-256 hash with a salt, expires in 10 minutes, and every session for that user is killed after the reset.

**Proves it:** `src/quiz/api.js:710-746` (route, 10 requests per IP per 15 min, 1 per email per 60 s), `:724-728` (the honest refusal), `:773-815` (max 5 code attempts, sessions killed), `src/quiz/passwords.js:18` (demo password constant).

### Q3. "Where did the per-class settings go? I can't find them on the Settings page."

**Answer:** I moved them — the branch is merged into main (PR #51) **and it is live**: the Render service redeploys from `main` on its own, so the live site already runs the new code. The trading switch, the analytics time zone and the trade log now live on the class's own page: Classes & Roster → the class card's "Settings" button → the third sub-tab "Class Settings". The Settings page keeps only course-wide settings and points at the new home. Each write toasts "Saved" and the class card gains a "🤝 Trading on/off" pill.

**Proves it:** `origin/main` (PR #51, branch `feature/class-settings-in-class-management`, tip `022e09f`), `web/src/teacher/ClassManagementView.vue:374-381` (search box), `:441` (Settings button), `:502-507` (third sub-tab), `:685-686` (`role="region" aria-label="Class settings"`), `web/src/teacher/SettingsView.vue:4-6` (the pointer).

### Q4. "How does a student actually get into a class? Walk me through the join code."

**Answer:** The professor generates a code from the "Join Codes" sub-tab; it is 12 characters drawn from a 32-symbol alphabet with `crypto.randomInt` — about 1.15 × 10¹⁸ possibilities — and it is shown exactly once with a "Copy it now — it is shown only once" banner. Only the SHA-256 hash is written to the record, so the readable code is never in the database. The student pastes it on the **Quiz** tab or **My Progress** — both carry the class picker (`web/src/student/PracticeView.vue:135`, `web/src/student/ProgressView.vue:63`) — and the redemption is atomic: unknown, revoked, expired or exhausted codes create no enrolment at all.

**Proves it:** `src/quiz/api.js:840-854` (length, alphabet, `crypto.randomInt`), `:1020-1039` (only `codeHash` stored, raw code returned once in the response), `:1075-1100` (each refusal before the enrolment is written), `web/src/student/ClassPicker.vue:20-36` (the join handler, reached from `web/src/student/PracticeView.vue:135` and `web/src/student/ProgressView.vue:63` — the Campfire Run tab renders no class picker, so it has no join-code UI).

### Q5. "Could someone guess a join code, or brute-force your passwords?"

**Answer:** Guessing a code is not practical — 32¹² with a CSPRNG, and only the hash is stored, so there is nothing to attack but the live redemption endpoint. Passwords are the other story and I will be straight about it: login is locked per email after 5 wrong passwords for 15 minutes, and the reset endpoint is throttled per IP and per email, but **registration and join-code redemption have no rate limit at all**. The real weakness is the classroom channel: a code pasted into a class chat is a bearer credential for that class.

**Proves it:** `src/quiz/api.js:63-64` (`LOGIN_MAX_FAILS = 5`, `LOGIN_LOCK_MS = 15 * 60 * 1000`), `:648-653` (the lock), `:704` (register route, no limiter), `:1075` (join route, no limiter), `:826-839` (the design note on why 12 characters).

### Q6. "How do you stop one professor from reading another professor's classes?"

**Answer:** Two layers. Every route declares the role it requires — the route table stores the role and the dispatcher compares it to the signed-in user's role, returning 401 then 403 — and then ownership is checked per class: a teacher asking for a class they do not own gets a **404, not a 403**, so ids of other classes cannot be probed for existence. Professor accounts are provisioned by the team, not self-signed-up: a sign-up that asks for the teacher role is **refused outright** rather than quietly demoted, so nobody can hand themselves a professor session. A teacher only ever sees their own classes.

**Proves it:** `src/quiz/api.js:612-616` (`route(method, pattern, role, handler)`), `:2698-2699` (401 / 403), `:230-231` (`teacherClass` 404s on a class you do not own), `:690-692` (a sign-up asking for the teacher role is refused), `web/src/App.vue:29-32` and `:42` (the tab bar is built from the same role string).

### Q7. "What happens when a professor deletes a class? Can students still see their history?"

**Answer:** Classes are archived, never deleted. It is a toggle endpoint — archive sets `archivedAt`, restore clears it — and the comment in the code says why: *"Classes are archived, never deleted: quiz attempts and history stay intact."* Archived classes drop out of the grid until "Show archived classes" is ticked, and the counter line switches from "Showing N active classes" to "Showing N total classes".

**Proves it:** `src/quiz/api.js:936-942` (the toggle and the comment), `web/src/teacher/ClassManagementView.vue:427` (Archived badge), `:366` (the counter line), `:257-260` (the archive/restore handler and its toasts).

### Q8. "Where is the data actually stored? Is it a real database?"

**Answer:** Two stores behind one interface. By default the whole database is **one JSON file** — `data/db.json` by default or `QUIZ_DATA_FILE` — held in memory and flushed 250 ms after a change, and the code itself says it is *"fine for a single-process demo; NOT for production (no concurrency, no row-level security — access rules are enforced in api.js instead)"*. Set `SUPABASE_URL` and the same store runs on Supabase Postgres instead, where the migration turns row-level security **on for every table with no policies**, so the browser keys can read nothing.

**Proves it:** `src/quiz/store.js:5-7` (the honesty comment), `:19-31` (read, back up and re-seed on schema change), `server.js:329-341` (the choice), `supabase/migrations/20261007000000_quizquest_init.sql:14-18` (RLS on, no policies).

---

### Two more that can land on you, because Section 7 also gives you learning content upload

**"Where do the slides go when I upload them?"** — The file never leaves the professor's browser until the text does: PPTX/DOCX are unzipped with fflate and parsed with DOMParser, PDFs with pdfjs-dist, and only the extracted text is POSTed to the server as passages. The server refuses an upload without the personal-data confirmation flag, caps each excerpt at 100,000 characters, and is idempotent via a SHA-256 key. Uploaded material can be **archived** from the Material library and **restored** later, and archived material is left out of the knowledge report — the report is built from the live library only. (`web/src/teacher/import-materials.js:1`, `web/src/teacher/pdf.js:1-12`, `src/quiz/api.js:1357-1364`, `src/quiz/authoring.js:288`, `web/src/teacher/MaterialLibrary.vue:308`.)

**"Can a student get into someone else's class?"** — No: redemption requires the student role, the class must exist and not be archived, and the enrolment is checked before it is written. A duplicate enrolment is refused with "You are already enrolled in this class." (`src/quiz/api.js:1075-1100`.)

---

## 2. The 5 aimed at each of the others

### William — gamification, Campfire Run, deploy

| Question | Short answer | Who answers |
|---|---|---|
| "What is the gamification actually made of?" | A Kingdom town with five buildings (Castle, Garden, Tower, Library, Workshop), coins, and a Summon gacha — one pull is 50 coins, a ten-pull 500 — plus the Campfire Run arena. | William |
| "Is there a raid boss?" | Honest answer: there is no raid screen. The tab that used to be called World is now Campfire Run; the co-op quiz raid is exercised only at the socket level, because its UI was never wired up. Do not describe a screen that does not exist. | William |
| "How is it deployed?" | Vite builds `web/` into `dist/`; one Node process serves `dist/`, the API and the sockets on `PORT` (default 3000). Render runs `pnpm install --frozen-lockfile && pnpm run build` then `pnpm start`. Live: `https://quizquest-4phd.onrender.com`. | William |
| "The site took ages to open — why?" | The Render free instance sleeps. The first request returned 503 with `Retry-After: 5` and the warm-up took about 55 seconds, so we wake it before recording. | William |
| "Which external APIs do you call?" | Two, both server-side only: Google Gemini (`generativelanguage.googleapis.com`, key in the `x-goog-api-key` header, two Flash-Lite model IDs allowed) for drafting and image description, and Resend for the password-reset email when it is configured. | William (hand the AI questions to Xavier) |

**Evidence:** `web/src/student/KingdomView.vue:544-553` (the building list: Castle, Garden, Tower, Library, Workshop), `web/src/student/PetsView.vue:315-319` (**Summon ×1** and **×10** with their coin costs) and `:311` (the **History** button), `web/src/App.vue:31` and `web/src/student/HeroLabView.vue:209` (the tab is Campfire Run), `e2e/raid-boss.spec.js:7-12`, `vite.config.mjs:9-12`, `server.js:322`/`:330` (one process listening on `PORT`, default 3000), `docs/PROTOTYPE.md:83`, `src/quiz/gemini.js:4` and `:152`.

### Xavier — AI drafting, adaptive quiz

| Question | Short answer | Who answers |
|---|---|---|
| "Walk me through the AI drafting flow." | Six steps on screen: Upload → Knowledge report → Edit & save → Configure questions → Generate → Review & publish. The professor edits the report, sets the learning outcome, style and per-type quantities, and only then are questions drafted. | Xavier |
| "Does the server parse the PowerPoint?" | No — the browser does. PPTX/DOCX are unzipped with fflate and parsed with DOMParser; PDFs use pdfjs-dist. Only extracted text is POSTed. | Xavier, or Marxel for the upload half |
| "What happens if the API key is missing?" | The server reports `authoringEnabled: false`, the guided workflow is not rendered at all, the professor gets the older one-form screen whose formats are labelled "(needs Gemini)", "Describe images with AI" disappears, and transcription returns HTTP 501. | Xavier |
| "How does the adaptive quiz pick questions?" | About 70% general coverage and 30% focused on weak topics (`weakShare: 0.3`). The student-facing line reads "Focused practice: about 30% of questions from … The rest give broader coverage." | Xavier |
| "How do you know the AI's questions are right?" | Each candidate is verified independently; failures are surfaced as warnings, never silently replaced, and drafts are never auto-published — they sit under "Needs review" until the professor presses "Approve & publish". | Xavier |

**Evidence:** `web/src/teacher/AuthoringWorkflow.vue:74`, `src/quiz/authoring.js:266-295` and `:554`/`:593-594` (the saved report is the only source), `src/quiz/generator.js:543-559` (status `draft`, `publishedVersion: null`), `src/quiz/adaptive.js:19` and `:151`, `src/quiz/vision.js:30`, `web/src/teacher/GenerateView.vue:103-122`.

### Jasper — question bank

| Question | Short answer | Who answers |
|---|---|---|
| "How are questions filed and found?" | Each question carries its course, topic and learning outcome. The bank has five filters: "Needs review", "Reported", "Published", "Withdrawn", "Rejected". | Jasper |
| "Can a professor write one by hand?" | Yes — the question editor in the Question bank writes and publishes a question directly. | Jasper |
| "Do AI questions go live by themselves?" | No. They are stored with status `draft` and `publishedVersion: null`; only "Approve & publish" makes them live for students. | Jasper |
| "What can I do to a question?" | Approve & publish, Reject, Withdraw, Publish again, Edit — toasts "Published", "Rejected", "Withdrawn from practice", "Published again". The "Regenerate draft" button was **removed on 3 Nov** (Xavier's call): manual editing does the same job better, and the button created functionality nobody wanted. | Jasper |
| "What do the badges on a card mean?" | Status, type (MCQ / True/False / Short Answer / Multi-select), difficulty, style (Conceptual / Application), version and origin ("AI draft"). | Jasper |

**Evidence:** `web/src/teacher/ReviewView.vue:76-80` (filters), `web/src/teacher/QuestionCard.vue:49-54` (badges) and `:69-73` (actions), `src/quiz/generator.js:543-559`, `e2e/question-editor.spec.js:8`, `e2e/question-bank.spec.js:7`.

### Zhi Yang — analytics dashboard

| Question | Short answer | Who answers |
|---|---|---|
| "What does the Analytics tab show?" | An overview with tiles, "First-attempt accuracy by topic", "Needs attention", and a "Print report" button. | Zhi Yang |
| "What do the numbers mean?" | Per topic: first-attempt accuracy, retry accuracy, awaiting marking, students, median/p75 time and timeouts. | Zhi Yang |
| "Where does the time zone come from?" | It is a per-class setting, and the dashboard renders days and weeks in that class's zone — the hint line names where to change it ("change in Classes & Roster"). | Zhi Yang, hand the settings half to Marxel |
| "What is 'Needs attention'?" | It links to the answers that are waiting for a mark on the To review tab. | Zhi Yang |
| "Can I compare tutorial groups?" | Yes — "Compare your classes" puts a course's tutorial groups side by side. | Zhi Yang |

**Evidence:** `web/src/teacher/AnalyticsView.vue:688` (accuracy by topic), `:707` (needs attention), `:810` (the column headers), `:943` (compare your classes), `:622` (print report), `:642` (the time-zone hint), `web/src/teacher/ToReviewView.vue:148` and `:169`.

### Kai Cong — progress tracking, question reporting

| Question | Short answer | Who answers |
|---|---|---|
| "What does My Progress show?" | Four sections: "Your practice indicator", "Topics", "Recent sessions" and "My question reports". | Kai Cong |
| "How does the practice indicator decide?" | It stays general until a topic has enough confirmed questions — the page says "Topics need at least N different confirmed questions before we suggest extra practice." | Kai Cong |
| "How does a student report a bad question?" | From the question in the practice session. It appears under "My question reports" for the student and in the professor's To review as "Open student reports (N)", where it is resolved. | Kai Cong |
| "Can the professor reply to the student?" | Yes — the report round trip includes the professor's reply, and it is covered by an end-to-end test. | Kai Cong |
| "How does a professor see one student's activity in a class?" | The roster table has "Questions Attempted" and "Last Active" columns, and a student's name expands to show "Classes with you:" with an "Add to class" control. | Kai Cong, or Marxel for the roster itself |

**Evidence:** `web/src/student/ProgressView.vue:85`, `:95`, `:102`, `:123`, `:136`, `web/src/teacher/ToReviewView.vue:169`, `e2e/progress-reporting.spec.js:5`, `e2e/to-review.spec.js:7`, `web/src/teacher/ClassManagementView.vue:564-565` (roster columns).

---

## 3. General questions the whole team may face

**G1. What problem does QuizQuest solve?**
It helps a lecturer turn one week of lecture material into practice that is aimed at each student: the professor uploads their slides, the app builds a knowledge report from them, drafts questions that the professor reviews before publishing, and every attempt is recorded so the next session can target that student's weak topics. One sentence for the room: *"Our app helps professors run classroom practice without building a question bank by hand, and helps students practise where they are actually weak."*

**G2. Who is the target user?**
Two: the professor who owns the classes, and the student enrolled in one. The professor's job is content and classes; the student's is practice, coins and progression. The role string on the account decides which of the two tab sets the app renders, so a student literally cannot see the Classes & Roster tab. (`web/src/App.vue:29-32`, `:42`.)

**G3. Why this stack?**
Vue 3 single-file components with Vite for the build, plain `axios` for HTTP, and a dependency-free Node HTTP server that serves the API, the sockets and the built SPA from one process — so a student session, a professor session and the real-time arena all come from the same origin with no CORS or proxy in production. Playwright drives the browser tests. (`vite.config.mjs:9-21`, `web/src/api.js:109-113`, `server.js:93`/`:118`/`:322`/`:330`, `playwright.config.js`.)

**G4. Why a real backend instead of localStorage?**
Because the interesting rules are access rules. "Which classes may this teacher read", "may this student enrol in this class", "is this join code still valid" are all decisions that have to be made where the data is, not in the browser. The server enforces every one of them — the store file even says so: *"access rules are enforced in api.js instead"*. A localStorage app could not support two roles on one screen, and it could not support a professor and a student in separate browser tabs, which is how we demo it. (`src/quiz/store.js:5-7`, `src/quiz/api.js:230-231`, `:612-616`, `:2698-2699`.)

**G5. What makes this more than a CRUD app?**
Four things that are logic, not screens: the join-code redemption with its atomic refusal rules and hash-only storage; the adaptive session that mixes general coverage with weak topics (`weakShare: 0.3`); the AI drafting pipeline where a saved knowledge report becomes the sole source and each candidate is independently verified; and the per-class settings endpoint, which refuses an unknown time zone and refunds every open trade when trading is switched off. (`src/quiz/api.js:1075-1100`, `:1180-1196`, `src/quiz/adaptive.js:19`, `src/quiz/authoring.js:554`/`:593-594`.)

**G6. How is the data stored?**
One JSON file by default (`data/db.json` or `QUIZ_DATA_FILE`), held in memory and flushed 250 ms after a change; set `SUPABASE_URL` and the same code path runs against Supabase Postgres, where only id/name/role are promoted to real columns and everything else lives in a `extra` jsonb column. RLS is on for every table with no policies, so the browser keys read nothing. (`src/quiz/store.js:19-31`, `server.js:329-341`, `src/db/schema.js:11-12` and `:22-25`, `supabase/migrations/20261007000000_quizquest_init.sql:14-18`.)

**G7. How did you test it?**
Three layers: Playwright end-to-end specs for user journeys, Node integration tests that drive the API directly (registration, the reset code, class creation, join codes, redemption, the roster, and the rule that a join code is never written to the database file), and browser tests that drive the AI authoring flow and the upload extractor against synthetic fixtures. (`e2e/`, `test/auth-classes-test.js`, `test/auth-test.js`, `test/browser-authoring.test.cjs`, `test/browser-guard-rails.test.cjs`, `test/browser-import.test.cjs`, `test/browser-question-editor.test.cjs`, `test/browser.test.cjs`.)

**G8. How much testing is there?**
Four commands, and the counts are in `package.json`: **44 Node test files** (`pnpm test`, 462 tests), **13 vitest spec files** (`pnpm test:unit`), **46 end-to-end tests across 19 spec files** (`pnpm test:e2e`; 20 files in `e2e/` including `helpers.js`) and **five browser suites** (`pnpm test:browser`, which runs `test/browser*.test.cjs`). The class-settings work was **+3 net** over the 40 across 17 it replaced, and since then the archived-class guard rails and the material library added one more spec and three more tests. `e2e/class-settings.spec.js` covers the search box, the archived-match counter, the trading switch and the time zone plus trade log, but the trading test moved out of `teacher-settings.spec.js` (3 became 2). Add the Node integration suites and the browser suites and it is a few hundred assertions. (`e2e/class-settings.spec.js:89`, `:119`, `:152`, `:185`.)

**G9. How did you handle responsive design?**
The stylesheet has 63 media-query blocks — including width breakpoints at 1199/1100/1023/900/899/820/640/420 px — so the layout reflows from the 575 px (xs) width the professor will check up to wide desktop. Grids (48 uses) and flex (61 uses) do the work, and the page declares `width=device-width` with `viewport-fit=cover`. The professor tests from the iPhone 6 breakpoint to the XL breakpoint, so that range is the range we tuned for. (`web/src/app.css:91-1106`, `web/index.html:5`, Briefing p12 FAQ 17.)

**G10. What about accessibility?**
`aria-label` is used in 55 of the web source files; the moved class panel is a real landmark (`role="region" aria-label="Class settings"`), the search box is labelled "Search classes", the file inputs are labelled "Lecture files" and "Replacement lecture file", collapsible sections carry `aria-expanded`, and page headings take focus (`tabindex="-1"`) so a route change moves the reader to the title. Motion is respected: `prefers-reduced-motion: reduce` is honoured in 10 places, which is also why Playwright runs with `reducedMotion: 'reduce'`. (`web/src/teacher/ClassManagementView.vue:685-686`, `web/src/teacher/ImportMaterials.vue:299-300`, `web/src/App.vue:148`/`:158` and `web/src/teacher/ClassManagementView.vue:576` (the `aria-expanded` on the drawer toggle, the sidebar collapse button and a roster row), `web/src/teacher/ToReviewView.vue:136` (the page heading that takes focus), `web/src/app.css:220`/`:1024`/`:1056`, `playwright.config.js:56`.)

**G11. What did you do about security?**
Passwords are scrypt-hashed and compared in constant time, with a dummy hash used for unknown emails so a wrong email costs the same as a wrong password. Login locks an email after 5 wrong passwords for 15 minutes; the reset endpoint is throttled per IP and per email. Join codes are CSPRNG-generated and only their SHA-256 hash is stored. Every route declares a required role and the dispatcher enforces it, then ownership is checked and returns 404 rather than 403 so ids cannot be probed. There are no cookies at all — the token is a Bearer header read from `sessionStorage` — so there is no CSRF surface. The honest gaps are in section 4. (`src/quiz/passwords.js:26-38`, `src/quiz/api.js:63-64`, `:648-653`, `:840-854`, `:230-231`, `:2698-2699`, `web/src/api.js:16-22`/`:109-113`.)

**G12. What about performance?**
The heavy file work is client-side and lazy: pdfjs-dist is dynamically imported so it stays out of the main bundle, and the browser test asserts that uploading alone uses zero inference. The server is deliberately small — one process, in-memory tokens, a JSON file flushed 250 ms after a change — which is honest for a single-process demo but not for load. I will not claim load numbers we did not measure; `scryptSync` in particular blocks the event loop on every login and every hash. (`web/src/teacher/pdf.js:1-12`, `test/browser-authoring.test.cjs:136-152`, `src/quiz/store.js:17`, `src/quiz/passwords.js:22`.)

**G13. Where does AI fit, and what if it is wrong?**
AI only drafts. The drafter reads the professor's saved knowledge report — the slides are not sent — verifies each candidate independently, and writes the survivors with status `draft`. Nothing is published without a human pressing "Approve & publish". If the report cannot support the requested style, the app says so in plain words instead of quietly substituting easier questions, and the whole app still works without a key on the legacy manual drafting screen. (`src/quiz/authoring.js:554`/`:593-594`/`:565-569`, `src/quiz/generator.js:543-559`, `web/src/teacher/QuestionCard.vue:69`.)

**G14. What would you do next?**
In order: move authentication onto Supabase Auth with email verification and MFA; add real rate limiting to registration and join-code redemption; write an audit trail for enrolment, removal, archive and code revocation; add an admin role-change screen; and run the app on Postgres as the primary store with real RLS policies instead of the JSON stand-in. (`src/quiz/api.js:685-702`, `:1075-1100`, `supabase/migrations/20261007000000_quizquest_init.sql:14-18`.)

**G15. Why should we believe the demo data?**
Because the demo accounts are seeded, not hand-made: `t-a`, `t-b` and `s-01`–`s-12`, all on `@quizquest.demo` addresses. If the live instance looks thin, the fix is to move the seeded material onto the account that still works — the course, its topics, its classes and the student enrolments all exist on the live project already, and reassigning them is a **data** change, not a code change. `pnpm db:reset --confirm` against the Render Supabase project does the same job but heavier: it deletes every row and re-seeds from scratch, and it takes `t-a` back from whoever owns it now, so it needs that person's nod first. (`src/quiz/api.js:69-70`, `src/quiz/seed.js:114`/`:130-140`, `README.md:85`.)

---

## 4. Questions we cannot answer yet

Give the honest one-liner, then stop. Do not improvise a claim.

| Question | Honest answer to give |
|---|---|
| "Do you verify student email addresses?" | Not yet. Registration stores the email exactly as typed and the account is usable immediately, so email verification is on our list. (`src/quiz/api.js:685-702`) |
| "Do you use Supabase Auth / do you have MFA?" | No. Authentication is our own scrypt-plus-token implementation; MFA is not built. We treat auth as plumbing, which is also how the rubric counts it. |
| "How do you change someone's role?" | You cannot. The role is fixed at signup and is immutable — there is no admin screen, no invite and no approval flow. A sign-up can only create a student: a request for the professor role is refused, and professor accounts are provisioned by the team. (`src/quiz/api.js:685-692`) |
| "Is signup rate limited?" | No, and neither is join-code redemption. Login and password reset are limited; those two endpoints are not. That is a known gap, not an oversight we would defend. (`src/quiz/api.js:704`, `:1075`) |
| "Can we reset a password right now?" | Only if a mail provider is configured. Otherwise the endpoint says "Password recovery by email is not available in this build. Ask the project team to reset it for you." — it never fakes sending a code. (`src/quiz/api.js:724-728`) |
| "Does the session survive a server restart?" | No. Tokens live only in the server's memory, so a restart signs everyone out; the token also lives in `sessionStorage`, so closing the tab signs you out. (`src/quiz/api.js:217`, `web/src/api.js:16-22`) |
| "Is the class-settings search live on the deployed app?" | Yes. It is merged into `main`, the deployment redeploys from `main` on its own, and the live bundle (checked 4 Nov 2026) already carries the search box and the "Class Settings" tab. |
| "Is this a production database?" | Not by default. It is one JSON file with no concurrency control; Supabase Postgres is the intended store and is used when `SUPABASE_URL` is set. RLS is on with no policies, so the browser keys read nothing. (`src/quiz/store.js:5-7`, `server.js:329-341`) |
| "Is there an audit log?" | No. Enrolment, removal, archive and code revocation are not recorded anywhere a professor can read. |
| "Can the professor set the participation-points rule?" | Not in the UI. The API writes `participationEnabled` but there is no switch for it on the Settings page or in the Class Settings tab. (`src/quiz/api.js:1193`) |
| "Are the demo accounts a security hole?" | Yes, and we will say so: every seeded account shares the same published demo password (see README.md, Demo sign-in), and a seeded account can also be signed into with no password at all by sending `{userId}` to `POST /api/login`. It is limited to the synthetic ids `t-a`, `t-b`, `s-01`–`s-12`, and a demo session cannot change a password. (`src/quiz/api.js:69-70`, `:673`, `src/quiz/passwords.js:18`) |
| "Who can see the list of demo accounts?" | Anyone — `GET /api/demo-users` is unauthenticated. It only lists seeded synthetic accounts, but it is reachable in production. (`src/quiz/api.js:628`) |
| "Is the file upload covered by end-to-end tests?" | Not by Playwright — there is no upload or authoring spec in `e2e/`. That path is covered by the Node browser tests instead, including one that asserts uploading alone uses zero inference. (`test/browser-authoring.test.cjs:136-152`) |

---

## 5. If you are stuck

Three honest deflections, in order of preference:

1. **"That is [name]'s part of the app — I will hand over to them so you get the exact answer."** Honest, and it shows the team works. Hand over with the screen already open.
2. **"That is not built yet — here is what we would do about it."** Then say the next step in one sentence. Never pretend a gap is a feature.
3. **"Let me show you the code, that is the fastest way for me to be accurate."** Open the tab or the file. It beats a confident wrong answer every time.

**The rule:** the person who owns the feature answers it (Section 7 table at the top). If you own it, answer it — do not defer something that is yours to an empty silence.

---

## 6. Rapid-fire flashcards

- No Supabase Auth — custom scrypt + in-memory token map.
- Password hash format: `scrypt$<saltHex>$<hashHex>`.
- Verification uses `crypto.timingSafeEqual`; unknown email compares against a dummy hash.
- Session token: 24 random bytes, 8-hour TTL, in a `Map` in server memory.
- Token travels as `Authorization: Bearer …`, read from `sessionStorage`.
- No cookies anywhere, so no CSRF surface.
- Login lock: 5 wrong passwords per email, 15 minutes.
- Password reset = 6-digit OTP, 10-min expiry, SHA-256 hashed, needs Resend keys.
- Reset throttles: 10 per IP / 15 min, 1 per email / 60 s.
- Roles: `student`, `teacher` — set at signup and never changed; a sign-up can only create a student.
- Route table carries the required role; dispatcher returns 401 then 403.
- Ownership failures return 404, not 403, so ids cannot be probed.
- Professor accounts are provisioned by the team; a sign-up that asks for the teacher role is refused, so nobody can promote themselves.
- Student tabs: Kingdom, Quiz, My Progress, Campfire Run, Summon.
- Teacher tabs: Analytics, To review, Classes & Roster, Question bank, AI drafting, Evaluation, Settings.
- Join code: 12 chars from a 32-symbol alphabet, `crypto.randomInt`.
- Only the SHA-256 hash of a join code is stored; the raw code is shown once.
- Redemption refusals: invalid/revoked, expired, exhausted, archived class, already enrolled.
- Classes are archived, never deleted — history stays intact.
- Professor can also enrol a student by email, matched on class **name**; ambiguous names are refused.
- Per-class settings: trading switch, participation flag, analytics time zone.
- Turning trading off refunds every open trade in that class.
- Trade log shows the last 40 trades for a class.
- Class grid search: matches class name or course; archived matches are counted.
- Default store: one JSON file; Supabase Postgres when `SUPABASE_URL` is set.
- RLS on, no policies — browser keys read nothing.
- Users table promotes id/name/role; the rest sits in `extra` jsonb.
- 46 e2e tests / 19 specs on main (43 / 18 after PR #51, which was +3 net; +3 more since, incl. the material-library spec).
- e2e engines: chromium, firefox, webkit on 4173-4175; 60 s test timeout.
- Adaptive split: 70% general / 30% weak (`weakShare: 0.3`).
- AI never publishes: drafts are `status: 'draft'`, `publishedVersion: null`.
- AI drafts from the **saved knowledge report only** — not the slides.
- No `GEMINI_API_KEY` → no guided workflow, legacy screen, transcription 501.
- Report saves are immutable versions; a stale revision is rejected with 409.
- Upload extraction happens in the browser (fflate + DOMParser, pdfjs-dist).
- Upload limits: 20 files, 100 MB each, 1,000 slides, 1,000 pages.
- Server requires the "authorised course material" confirmation flag.
- Deploy: `pnpm build` → `dist/`, `pnpm start` → one Node process on `PORT`.
- Live URL: `https://quizquest-4phd.onrender.com` — free instance sleeps, first hit ~503.
- Demo accounts: `t-a`, `t-b`, `s-01`–`s-12`; one published demo password for all of them (README.md, Demo sign-in); `{userId}` signs in with no password.
- `GET /api/demo-users` is public.
- Responsive: 63 media queries, 10 `prefers-reduced-motion` blocks, `width=device-width`.
- Accessibility: aria-labels across 55 web files; `role="region"` panels; focus moved to headings.
- There is no raid screen — the tab that used to be called World is now Campfire Run; the raid is socket-level only, because its UI was never wired up.
- Mandatory demo rules: no login/registration on camera; show DevTools at 575 px (xs) and the console.
- Deliverables: slides (video link on slide 1), README (app URL + Git URL + setup/run/test), app in the root folder with an index page.
- Video: max 12 minutes, at least 720p, YouTube unlisted or public.
- Deadline: Week 12 Friday 9am, no extension; within 1 hour late = 10% of the whole project, beyond 1 hour = 0.
- Rubric split: 20 marks — Presentation 25% (presentation 20%, Q&A 5%), Working app 75% (problem solving 20%, working app 27%, styling 18%, testing 10%).
- Auth is not a feature: "treat them as plumbing, not a feature".
- "Our app helps [who] to [do what] better because [how]" — answer in one sentence.

---

### Reference files

`src/quiz/api.js` (2716 lines, every route — `origin/main` at `c4e1956`) · `src/quiz/passwords.js` · `src/quiz/store.js` · `src/quiz/time.js` · `src/quiz/adaptive.js` · `src/quiz/authoring.js` · `src/quiz/generator.js` · `src/quiz/gemini.js` · `src/db/schema.js` · `server.js` · `web/src/App.vue` · `web/src/api.js` · `web/src/teacher/ClassManagementView.vue` · `web/src/teacher/SettingsView.vue` · `web/src/teacher/AnalyticsView.vue` · `web/src/teacher/ToReviewView.vue` · `web/src/teacher/ReviewView.vue` · `web/src/teacher/QuestionCard.vue` · `web/src/teacher/QuestionEditor.vue` · `web/src/teacher/AuthoringWorkflow.vue` · `web/src/teacher/ImportMaterials.vue` · `web/src/teacher/import-materials.js` · `web/src/student/ProgressView.vue` · `web/src/student/ClassPicker.vue` · `web/src/student/HeroLabView.vue` · `e2e/` (19 specs, 46 tests) · `test/auth-classes-test.js` · `test/auth-test.js` · `test/browser-authoring.test.cjs` · `test/browser-guard-rails.test.cjs` · `test/browser-import.test.cjs` · `test/browser-question-editor.test.cjs` · `test/browser.test.cjs` · `supabase/migrations/20261007000000_quizquest_init.sql` · `knowledge/Project Q and A (dark).pdf` · `knowledge/IS216 - Group Project Briefing (dark).pdf`
