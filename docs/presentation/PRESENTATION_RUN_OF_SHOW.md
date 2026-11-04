# IS216 Final Presentation — Run of Show

**QuizQuest (team Prince William's Quest)** · Monday 16 Nov 2026 · Q&A with the team at the front first, then ~18 min of speaking and the live demo — 21 min in all.

Presenter reading this script: **Marxel Angelo Ramesh** (`HULKMARXEL`). Wherever a slide says **hand to \<name\>**, that teammate takes over from that slide's first word to its last. Everything else is Marxel's.

**Q&A comes first.** The professor's rule 5 is "Q&A happens at the front, before the demo — not at the end", so the room opens with the team answering and the deck follows. The run of show below is 3:00 of Q&A, then 18:15 of speaking, then the closing line. The closing beat stays at the end — that is the end of the *presentation*, and Q&A is before it.

Date note: **16 Nov 2026 is the normal Week 13 presentation.** Week 1 Monday = 24 Aug 2026, so Week 12 Friday = 13 Nov, Week 13 Monday = 16 Nov and Week 14 Monday = 23 Nov. The make-up slot, if Week 13 is affected, is **Week 14 Monday 23 Nov 2026**. `knowledge/DEADLINES.md` had its make-up row as "Week 14 Monday 16 Nov" — that row was off by one week and **was corrected on 4 Nov 2026**; 16 Nov is Week 13, the normal presentation date. Confirm the slot with the teaching team before the room; the script does not change either way.

---

## 0. Read this before you walk in: which build is on screen

The live site **auto-redeploys from `origin/main`**. As of 4 Nov 2026, 09:22 the live bundle carries PR #51 and PR #56 (`origin/main` = `051fdbe`); it was re-checked at 10:45 and the bundle was unchanged (`/assets/index-CZtQRtdb.js`). Confirm on the day with `curl -s https://quizquest-4phd.onrender.com/ | grep -o '/assets/index-[^"]*\.js'` and then grep that bundle for `Class settings` — 1 hit = new build, 0 = old build. Fallback if 0: use the older-build line in §4.

| Thing | Where it lives | Verified |
|---|---|---|
| Live deployment | `https://quizquest-4phd.onrender.com` | live curl, 4 Nov 2026 |
| Live bundle contains "Class Management", "Classes & Roster", "To review", "Campfire Run" | yes | same curl |
| Live bundle contains "Search classes by name or course" and "Class settings" | **yes — 1 and 2 occurrences** | same curl, 4 Nov 2026 |
| Per-class settings move + class search bar | commit `2781e75` ("Move the per-class settings to the class management page"), **merged to main as PR #51** (merge commit `22fcf74`) — in the code **and live** | `git log --oneline -1 origin/main -- web/src/teacher/ClassManagementView.vue` |
| Live teacher account | `prof.b@quizquest.demo` only — `prof.a` returns 401 and is absent from `/api/demo-users` | live check, 4 Nov 2026 |
| Live data under that account | 1 course ("Intro to Statistics (demo)"), 1 class ("Statistics - Tutorial Group B"), 2 students, 0 active join codes | live `GET /api/teacher/courses` + `GET /api/classes`, 4 Nov 2026 |
| Gemini on the live instance | `geminiEnabled: true`, `authoringEnabled: true`, `gemini-3.5-flash-lite` | live `GET /api/teacher/courses`, 4 Nov 2026 |

Do **not** grep for "Trading on" — the template interpolates `'on'`/`'off'`, so that string never appears in a bundle. The only two valid markers are "Search classes by name or course" and "Class settings".

**The bundle name is not a fact — it changes on every redeploy.** Find out which build is live, and whether it carries the class-settings move, with:

```bash
curl -s https://quizquest-4phd.onrender.com/ | grep -o '/assets/index-[^"]*\.js'
```

Then search that bundle for `Class settings`. That one command decides which version of the class-management beat D1 you play (§4).

**Consequence for the run of show:** the class search box and the Class Settings tab are on the live build, so beat D1 plays the search-and-Settings clicks. Everything else in the script is on `main` and is safe to say on the record.

Fix the data **before Friday 6 Nov, not on the day**. There are two ways, and they are
not equally safe:

**Option 1 — move the content (preferred).** The demo material already exists on the
live project, but it sits under `t-a`, and `t-a` is no longer a demo account: it is
**Ho Zhi Yang's own account**, with his real email address and his own password.
Reassigning that course and its two classes to `t-b` (`prof.b@quizquest.demo`, which
still works) is a **data change, not a code change**, it is reversible, and it takes
nobody's login away. `scripts/fix-demo-teacher.js` reports the current state of the
row and, with `--confirm`, can change one field on one row. Move the course and the
classes the same way and the roster and the Analytics slide both have something to
show.

**Option 2 — a full reseed (heavier).** `pnpm db:reset --confirm` is a **local**
script — run it from a machine that has the live project's `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` in `.env`, with the Render service stopped, then redeploy so
the server reloads the reseeded data. Confirm afterwards with
`GET /api/teacher/courses` that "Intro to Computing (demo)" and its three topics are
back. It re-seeds the demo and restores Prof. Demo A with that course and **two
classes** — "Computing - Tutorial Group A" with **six** students (s-01 to s-06) and
"Computing - Tutorial Group C" with **four** (s-09 to s-12) — plus the practice
history that fills the Analytics dashboard (`src/quiz/seed.js:97-135`, and the seeded
sessions/attempts at `src/quiz/seed.js:177-192`). Without one of these the roster is
two students and the Analytics slide reads "No answers yet".

**A reseed takes `t-a` back from whoever owns it now** — it reverts any demo
password changed since the seed and overwrites the account's email — so it would
leave Ho Zhi Yang unable to sign in with his own login. It also **deletes every row
in the project** and cannot be undone. If it is going to be used, it needs **Ho Zhi
Yang's explicit nod first**, and the sign-in has to be re-checked afterwards.

---

## 1. How the team splits it

The Q&A is first (professor's rule 5), then the deck. **Slide 13 is not double counted:** the seconds in the beat table in §4 are apportioned to the member who owns the beat, and slide 13's time is the sum of those beats.

| # | Slide | Who presents it | Seconds |
|---|---|---|---|
| — | **Q&A with the team at the front** | all six | 180 |
| 1 | Title, video link and the live URL | Marxel | 20 |
| 2 | The problem | hand to Kai Cong | 55 |
| 3 | The solution, in one sentence | hand to Xavier Lee | 45 |
| 4 | Learning content upload | Marxel | 20 |
| 5 | AI question drafting | hand to Xavier Lee | 55 |
| 6 | Adaptive quiz sessions | hand to Xavier Lee | 35 |
| 7 | Question bank management | hand to Jasper Wong | 95 |
| 8 | Student progress tracking and question reporting | hand to Kai Cong | 70 |
| 9 | Professor analytics dashboard | hand to Ho Zhi Yang | 95 |
| 10 | Gamification and rewards | hand to William Hansel | 55 |
| 11 | Class management | Marxel | 25 |
| 12 | Per-class settings and the class search | Marxel | 15 |
| 13 | Live demo | the beat table in §4 — every beat has exactly one owner | 410 |
| 14 | How we tested | Marxel | 20 |
| 15 | The stack, the third-party credits and who built what | hand to William Hansel | 50 |
| — | Closing: what each of us contributed | Marxel | 30 |
| | **Total** | | **1275 s = 21:15** |

**Check the arithmetic:** 655 s of slides + 410 s of live-demo beats + 30 s of closing = **1095 s = 18:15 of speaking**. Add the 180 s of Q&A at the front and the whole thing is **1275 s = 21:15**.

| Teammate | Slides they own | Slide s | Live-demo beats they own | Beat s | Closing s | Total | Slot |
|---|---|---|---|---|---|---|---|
| Marxel Angelo Ramesh | 1, 4, 11, 12, 14 | 100 | D1, D2, D12, D13, D14 | 110 | 30 | **240** | 4:00 |
| William Hansel | 10, 15 | 105 | D5, D9, D10, D11 | 105 | — | **210** | 3:30 |
| Xavier Lee | 3, 5, 6 | 135 | D6, D8 | 50 | — | **185** | 3:05 |
| Kai Cong | 2, 8 | 125 | D7 | 25 | — | **150** | 2:30 |
| Jasper Wong | 7 | 95 | D3 | 60 | — | **155** | 2:35 |
| Ho Zhi Yang | 9 | 95 | D4 | 60 | — | **155** | 2:35 |
| **Total** | | **655** | | **410** | **30** | **1095** | **18:15** |

Every row is between 2:30 and 4:00. Marxel has the longest slot because he owns the class-management and upload beats and both 575 px beats; everyone else spends their slot on their own feature.

Hand-off discipline: the person being handed to starts their slide's narration without a "next, over to you" preamble. The person handing over says one short bridge line, then stops talking. No slide is handed back and forth.

Ownership this split follows: `knowledge/IS216 - Section 7 Prince William’s Quest.txt:95-119`.

| Teammate | Section 7 task | Slide |
|---|---|---|
| William Hansel | Gamification and rewards | 10, 15 |
| Lee Zi Yang Xavier | AI question drafting and adaptive quiz sessions | 3, 5, 6 |
| Fang Kaicong | Student progress tracking and question reporting | 2, 8 |
| Marxel Angelo Ramesh | User accounts and class management, learning content upload | 4, 11, 12 (+ 1, 13, 14, and the closing) |
| Ho Zhi Yang | Professor analytics dashboard | 9 |
| Wong Kang Wei Jasper | Question bank management | 7 |

Slides 2 and 3 are the two general overview slides. They sit with Kai and Xavier rather than with Marxel so that every member narrates their own feature instead of Marxel narrating everything.

Running over? Cut in this order, and never touch a teammate's feature slide: (1) **slide 12**, the per-class settings — 15 s; (2) **slide 2**, the problem — a general overview slide; (3) **slide 3**, the one-sentence solution — also general; (4) **slide 14**, the testing slide — the numbers are in §7 if you need to say them instead of reading the slide. Never cut slides 5–10 or 15: each one is a teammate's own feature. **Slide 13 is not cuttable** — the live demo carries the 27% "working app, correctly implemented and usable solution" criterion *and* the 18% "styling, including responsive design" band, and the two 575 px beats are the evidence for that second one.

---

## 2. The spoken words

Short, sayable sentences. No code, no file names unless you are pointing at the screen while saying them. Each block below says who says it; the Q&A has already happened by the time slide 1 starts.

### Slide 1 — title and video link (3:00–3:20) — Marxel

**Put the live URL on the slide itself, in big text: `https://quizquest-4phd.onrender.com`.** The link to the demo video goes on this slide too — that is the eLearn requirement.

> "Hi, we're team Prince William's Quest, and this is QuizQuest. It's a quiz platform for university classes. The link to our video presentation is on this slide, and the app is live at quizquest-4phd.onrender.com."

### Slide 2 — the problem (3:20–4:15) — hand to Kai Cong

> "Here's the problem we picked. Every week a lecturer gets a hundred slides and no time. Turning those slides into a quiz by hand takes hours, and what comes out is generic questions that don't match what was actually taught.
>
> Then students get them wrong, the professor can't tell which topic went wrong, and the whole loop is slow. We're not trying to replace the professor's judgement. We're trying to cut the work that surrounds it."

*(Kai takes this one because the loop it describes is the loop his My progress screen closes — and he shows it live in beat D7.)*

### Slide 3 — the solution, in one sentence (4:15–5:00) — hand to Xavier Lee

**The pitch line, in the form the rubric asks for ("Our app helps [who] to [do what] better because [how]"):**

> "Our app helps university professors to turn their own lecture material into a ready-to-use quiz faster, because it reads the slides, writes a report the professor edits, and drafts questions that only the professor can publish."

**Shorter variant — use this if the professor says "again, in one line":**

> "Our app helps professors get from slides to a published quiz in one sitting, because the AI only ever drafts from material the professor has already reviewed."

**Shortest, for the title slide:**

> "QuizQuest turns a professor's slides into a quiz their class can actually use."

Then:

> "Here's the shape of it. The professor uploads their lecture material. The system reads it, writes one knowledge report, and drafts questions from that report only. The professor edits and approves. Students practise, and the practice changes what they get next."

*(The pitch line is Xavier's because the pipeline it describes — read, report, draft — is the one he built. The closing sentence about what students get next is Kai's, and he shows it in beat D7.)*

### Slide 4 — learning content upload (5:00–5:20) — Marxel

> "Upload is my part, and here's the bit that matters: the file is read in the professor's browser, not on our server. When you drop in a PowerPoint, the page unzips it and pulls the text out of every slide, tables included. When you drop in a PDF, we read the pages in the browser too.
>
> Nothing is sent anywhere until you tick the box that says "This is authorised course material without student personal data" and press Upload files. The server only ever receives text."

*(If you have the seconds: PDF, PowerPoint, Word, text, Markdown and CSV, up to twenty files at a time and a hundred megabytes each — and if a slide is only a picture, the app says so rather than inventing text. That last part is the honest bit: an unreadable page is uploaded as a marked placeholder, and a file with no readable text at all is refused with "No readable text found." — `web/src/teacher/ImportMaterials.vue:202,205`.)*

### Slide 11 — class management (12:05–12:30) — Marxel

> "Now my other area: class management. You pick the course, name the class, and it appears on the grid as a card. Then you press Manage Roster and Codes and generate a join code — and here's the security bit, the part I'd defend in Q&A: a fixed QQ- prefix plus twelve random characters drawn from a 32-symbol alphabet with a cryptographically secure random source — about 1.15 × 10¹⁸ combinations — and we only store a hash of it, so the readable code is shown exactly once and can never be read back out of the database. You'll see all of that live in a moment."

*(The rest of the class story — the student redeeming the code in their Quiz tab, the roster columns, enrolling by email, and archiving a class rather than deleting it — is said out loud in the live beat D1, not twice. Strings as they appear on screen: toast `Class "NAME" created successfully!`; banner `New Join Code Generated:` with `Copy it now — it is shown only once.`; table row `QQ-••••••••••••`; roster heading `Enrolled Students`; card stats `👥 N Students` and `🔑 N Active Codes` (the count is 1 → "Student"/"Code", otherwise plural) — `web/src/teacher/ClassManagementView.vue:205,471,477,608,490,389-390`.)*

### Slide 12 — per-class settings and the class search (12:30–12:45) — Marxel

> "The last thing I changed: each class used to keep its settings in one long list on the Settings page, so a professor with eight classes had to hunt for the right one. I moved them. The trading switch, the analytics time zone and the trade log now live in the class's own Class Settings tab, and I added a search box on the class grid so you can find a class by name or course. In that same change, the card also shows a trading on or off pill, so you can see the state without opening anything.
>
> And to be straight about where it is: that change is merged into main and live, so the live Settings page no longer has the per-class panels — what you are looking at now is the new version."

*(The move is commit `2781e75`, merged to `main` as PR #51 (merge commit `22fcf74`), and it is live — see §0.)*

### Slide 13 — opening the live demo (12:45)

> "Alright, let me show you it running. I'll take you through the class flow first, then each of us will show the screen we built."

### Slide 14 — how we tested (19:35–19:55) — Marxel

> "On testing: forty-six end-to-end tests across nineteen spec files, forty-four Node test files, five browser suites and thirteen unit spec files. Each end-to-end test drives a real browser against a real server — create a class, generate a code, redeem it, revoke it, archive it, enrol by email, publish a question. There's one rule the code enforces that we're happy to be asked about: a join code is never written to the database file. Only its hash is."

*(46 tests / 19 spec files on `origin/main` @ `7d8cacf`: `git ls-tree -r origin/main --name-only -- e2e | grep -c 'spec\.js$'` counts the files and `grep -cE "^[[:space:]]*test(\.(only|skip|fixme))?\s*\(\s*['\"\`]"` across those specs counts the tests. Eighteen of those specs and forty-three of those tests are the app itself; the nineteenth spec is the sign-up flow, which the rules call plumbing, not a feature. Node: `git ls-tree -r origin/main -- test` — 44 files matching the `test/*-test.js` glob `pnpm test` runs, and the runner reports 462 cases with 461 passing and 1 skipped. Browser: the 5 files `test/browser*.test.cjs` that `pnpm test:browser` runs. Unit: the 13 `*.spec.js` files — 11 under `web/src` and 2 under `src/quiz`. The same figures are in `PRESENTATION_SLIDES.md` and `QA_PREP.md`.)*

### Slide 15 — the stack, the third-party credits and who built what (19:55–20:45) — hand to William Hansel

> "On the stack: the app is Vue and Vite on the front, Bootstrap for the utility classes, Socket.IO for the live Campfire Run, pdf.js and fflate for reading your lecture files, and Playwright for the end-to-end tests. The game icons come from game-icons.net. On third-party code: every one of those — Vue, Vite, Bootstrap, Socket.IO, pdf.js, fflate and Playwright — has a row in the README's library table with its licence, and our own art is credited too. We haven't presented anyone else's library as our work.
>
> Here's who built what."

*(The library list and every licence are in `README.md:173-191` — the table under "### Libraries" in the README that ships in the zip. William hands to you for the closing paragraph below.)*

### Closing 30 seconds — what each of us contributed (20:45–21:15)

Say this as one breath, no slide-reading. **Word-for-word:**

> "William built the game side — the Kingdom, the Summon pulls, the Campfire Run lobby and the coin economy that makes students want to come back. Xavier built the AI drafting pipeline and the adaptive session logic. Kai built student progress tracking and the report-a-problem loop that puts a student's complaint in front of the right professor. Zhi Yang built the professor's Analytics dashboard. Jasper built the Question bank, where nothing reaches a student until a professor approves it. And I built class management and learning content upload — creating classes, the join-code design, the roster, archiving instead of deleting, and the upload that reads your slides in your own browser.
>
> The one thing we all agree on is that no question reaches a student until a professor has read it. That's the whole product."

*(Ownership per `knowledge/IS216 - Section 7 Prince William’s Quest.txt:95-119`; each item above is a flow that is scripted and green — `e2e/kingdom-build.spec.js`, `e2e/summon.spec.js`, `e2e/team-room.spec.js`, `e2e/progress-reporting.spec.js`, `e2e/to-review.spec.js`, `e2e/teacher-views.spec.js`, `e2e/question-bank.spec.js`, `e2e/class-management.spec.js`, `e2e/join-class.spec.js`, `e2e/professor-enrol.spec.js`.)*

If you are asked "what did you personally write", the answer for Marxel is: **class management, the join codes, the roster and enrolment, the per-class settings API and the move of those settings into the class page, and the browser-side extraction of PPTX, DOCX and PDF into text.**

---

## 3. The whole deck, slide by slide

"Headline" is the big line on the slide. "Narration" is the one line you actually say. Times are cumulative from 0:00, and 0:00 is the **start of the Q&A**.

| # | Headline on the slide | One line of narration | Who says it | Time |
|---|---|---|---|---|
| — | **Q&A with the team at the front** | All six stand at the front and answer before anything is shown. | all six | 0:00–3:00 |
| 1 | QuizQuest — Prince William's Quest | Here is QuizQuest, the link to our video presentation is on this slide, and the app is live at quizquest-4phd.onrender.com. | Marxel | 3:00–3:20 |
| 2 | The problem: a hundred slides, no time | Kai: a lecturer turns slides into a quiz by hand, and the questions stop matching what was taught. | hand to Kai Cong | 3:20–4:15 |
| 3 | Our app helps professors to… | Xavier: our app helps university professors to turn their own lecture material into a ready-to-use quiz faster. | hand to Xavier Lee | 4:15–5:00 |
| 4 | Reading your lecture files in your browser | Marxel: the file is read in the browser and nothing is uploaded until the professor ticks the confirmation. | Marxel | 5:00–5:20 |
| 5 | Slides → knowledge report → drafted questions | Xavier: the report is written from exactly the attached excerpts, and the drafter uses that report only. | hand to Xavier Lee | 5:20–6:15 |
| 6 | 70% general, 30% focused on what you got wrong | Xavier: a practice session is about seventy percent general coverage and thirty percent on the student's weak topics. | hand to Xavier Lee | 6:15–6:50 |
| 7 | Question bank: nothing goes live unreviewed | Jasper: every drafted question waits in "Needs review" until the professor presses Approve & publish. | hand to Jasper Wong | 6:50–8:25 |
| 8 | Progress, and a way to fight a question | Kai: the student sees their topic breakdown and can report a question they believe is wrong. | hand to Kai Cong | 8:25–9:35 |
| 9 | Which topic actually failed | Zhi Yang: first-attempt accuracy per topic, what needs attention, and a printable report. | hand to Ho Zhi Yang | 9:35–11:10 |
| 10 | Kingdom, Summon, Campfire Run | William: coins for correct answers, a kingdom to spend them in, and a shared lobby two students join by room code. | hand to William Hansel | 11:10–12:05 |
| 11 | One class, one roster, one code | Marxel: create the class, generate a code, watch it be redeemed, archive without losing history. | Marxel | 12:05–12:30 |
| 12 | Each class carries its own settings | Marxel: the trading switch, time zone and trade log now live in the class's own Class Settings tab, with a search box to find it. | Marxel | 12:30–12:45 |
| 13 | Live demo | Marxel opens the app; the seven student steps run in the agreed order, then the 575 px and GitHub beats. | Marxel + team | 12:45–19:35 |
| 14 | How we tested | Marxel: forty-six end-to-end tests across nineteen spec files, forty-four Node test files, five browser suites, thirteen unit specs. | Marxel | 19:35–19:55 |
| 15 | The stack, the credits and who built what | William: Vue, Vite, Bootstrap, Socket.IO, pdf.js, fflate, Playwright, and the licences behind them. | hand to William Hansel | 19:55–20:45 |
| — | Closing: what each of us contributed | Marxel: one clause each, then the line that is the point of the whole app. | Marxel | 20:45–21:15 |

Slide 13's 6:50 is the **sum of the fourteen beats in §4** — the seconds are apportioned to the member who owns each beat, so the demo is not counted twice. Slides 1, 4, 11, 12, 14 and the closing are **Marxel's**. Slides 2, 3, 5, 6, 7, 8, 9, 10 and 15 are the five teammates'.

---

## 4. The live-demo moment (6:50)

Everything below happens with the app already signed in. **The sign-in page must never appear on the projector.**

### Before you press start (not part of the 6:50)

- Sign the professor in in the tab you will present from — after a reseed that is `prof.a@quizquest.demo` (Prof. Demo A), who owns the two Computing classes, the question bank and the analytics. The password is in the group chat — do not write it into this file, into a slide, or into any tracked file. `README.md` still lists the demo accounts.
- Sign a **student** in in a second tab — `student02@quizquest.demo`. That student is on "Computing - Tutorial Group A", carries the seeded practice history, so My progress has real numbers and Networking basics is the weak topic. The seven student steps all happen in that tab.
- If you can, sign a **second student** in a third tab — the Campfire Run lobby needs two players to be worth showing.
- Open the GitHub repository `github.com/whansel007/QuizQuest` in a **separate browser tab** (mandatory beat D14). Signing in is per tab, so the app tabs keep their sessions.
- Open DevTools, dock it to the right and leave the **Console** tab selected — but leave the device toolbar **switched off** (desktop width). You engage the 575 px viewport yourself, live, at beat D12.
- Turn the sound off **before you sign in**: in the demo tab's console run `localStorage.setItem('hero-lab-settings', JSON.stringify({ muted: true }))` and reload. (The on-screen mute button only exists on the student header — `web/src/App.vue:202` — and the live demo is the professor's screens.)
- Wake the Render instance before you start — the free instance sleeps and the first request can take the best part of a minute.

### Order, length and words

Beats D5 to D11 are the seven steps of the team's agreed running order (William's plan, 3 Nov), in that order, each with exactly one owner. D1 to D4 are the professor's half, D12 to D14 are the proof.

| Beat | Time | Owner | What you do — what the audience sees | What you say |
|---|---|---|---|---|
| **D1** | 0:00–0:40 | Marxel | Land on **Classes & Roster**. DevTools is docked right with the **Console** tab open and empty — no errors, no warnings. One slow scroll of the class grid. Type one class name into **Search classes by name or course**. Press **+ Create Class** → the "Create New Class Group" modal (Course, Class Name, Description) → type a real class name → **Create Class**. The app opens the new class. Then **Manage Roster & Codes →** → sub-tab **Join Codes (N)** → **+ Generate Join Code** → set a usage limit and an expiry → **Generate Code**. The green banner appears with the code. Then sub-tab **Student Roster (N)** → heading **Enrolled Students**. Back on the grid, point at the card's other two actions — **Settings** and **Rename** — but do not open the Rename modal; the beat is already forty seconds. | "This is the professor's home screen. Every class is a card, with the student count and the live join-code count on it — and there is a search box, so you can find a class by name or course. Each card carries three actions: Manage Roster and Codes, Settings, and Rename. Create a class: pick the course, name the class, and it opens straight into that class. Now the join code — twelve random characters after a fixed prefix, and it is shown exactly once, because we only keep a hash of it. If this leaks I revoke it and generate another; I can't read the old one back out of the database even if I wanted to." |
| **D2** | 0:40–1:00 | Marxel | On the professor side, open the material import for the course, drop in the lecture file, tick **This is authorised course material without student personal data.**, press **Upload files**. The text lands in the material library and the course's knowledge report has it. The passage row carries **Edit metadata**, **Archive passage** and a **Show archived material** checkbox — point at them; do not click them, the upload is the point of this beat. | "Upload: the file is read in my browser, not on our server. Nothing leaves the page until I tick the confirmation and press Upload files — the server only ever receives text. It lands in the material library, where I can edit the title, the weekly topic and the learning outcome, or archive a passage and bring it back later." |
| **D3** | 1:00–2:00 | Jasper Wong | Open **Question bank**. The status filter reads **Needs review**. Open the seeded draft, read the stem and its source, then press **Approve & publish** — the card turns published and leaves Needs review. Then open **To review** and mark one short answer waiting for you. | "Nothing reaches a student until a professor approves it. Here is a drafted question sitting in Needs review. I read it — the answer and the source both hold up — and I press Approve & publish. And here are the short answers waiting for my mark." |
| **D4** | 2:00–3:00 | Ho Zhi Yang | Open **Analytics**. The topic table is weakest first. Show **Needs attention**, click a topic to focus it, then press **Print report**. | "First-attempt accuracy per topic, weakest first — so the first row is the topic that actually failed. Needs attention lists the few things worth acting on, and the whole thing prints." |
| **D5** | 3:00–3:25 | William Hansel | Switch to the student tab. **Kingdom**. The brief cards — **Welcome home!**, **Four buildings**, **Getting around** — and the castle in the middle with a building on each side. | "This is the Kingdom. The castle in the middle is home, and it grows as your town does. Four buildings around it: Garden to the north, Tower to the south, Library to the west, Workshop to the east." |
| **D6** | 3:25–3:50 | Xavier Lee | **Quiz**. Under **TOPICS TO PRACTISE** press **Select all**, then **Start practice**. The first question arrives. | "Select all topics and start. Every topic in the course is in the pool, and the engine decides which ones you need most." |
| **D7** | 3:50–4:15 | Kai Cong | **My Progress**. **Your practice indicator**, and under it **Worth practising next:** the topic names. Then **Topics** with the accuracy per topic, and **Recent sessions**. | "This is the student's own view. The indicator names the topics worth practising next — the ones under the accuracy line — and here is every topic with its accuracy and my recent sessions." |
| **D8** | 4:15–4:40 | Xavier Lee | Back to **Quiz**. Press **Select none**, tick only the weak topic, then **Start practice**. | "Now the same quiz with only the weak topic ticked — you pick the topic and every question comes from it. Left to itself the engine mixes about seventy percent general coverage with thirty percent on what you got wrong, which was the last slide." |
| **D9** | 4:40–5:05 | William Hansel | **Summon**. The pull buttons — **Summon ×1** with the coin cost beside it. Press it; the reveal lands on a hero with its rarity stars. | "Summon — one pull for coins. The stars under the name are the rarity, and every pull is logged, so the journal shows the coin history." |
| **D10** | 5:05–5:35 | William Hansel | Back on **Kingdom**. Walk with WASD to a building, press **E** to open it, then **Upgrade** with the resource cost beside it. Press **Z** for the emote wheel and pick one. Walk up to a hero and press **E** to greet. | "Buildings upgrade with the resources you earn — wood, crystal and herbs — and the castle grows with them. Press Z for emotes, and E beside a hero to greet." |
| **D11** | 5:35–6:00 | William Hansel | **Campfire Run**. Choose an adventurer, press **HOST LOBBY**, show the four-character room code, then join from the second student tab. | "Campfire Run is the shared room: pick your hero, host or join with the room code, and two students are in one lobby on one server." |
| **D12** | 6:00–6:15 | Marxel | **MANDATORY BEAT A — DevTools.** On the professor tab, **toggle the device toolbar on and set it to 575 px**, Console tab visible. Show the class grid reflowing to one column and the professor sidebar collapsing into the top bar (below 992 px it opens as a drawer from the menu button). Tick **Show archived classes** and show the counter change. The console stays clean the whole time. | "Now the responsive check. At 575 pixels — the extra-small breakpoint — the class grid collapses to a single column and the professor sidebar collapses into the top bar. The console is open the whole time and it is empty: no errors, no warnings." |
| **D13** | 6:15–6:30 | Marxel | On the student tab, open that tab's own DevTools, toggle its device toolbar on at **575 px**, the **Console** visible. Show **My Progress** stacking into one column. The console stays empty. | "The student side at the same width. The progress page stacks into a single column, and the console is still empty." |
| **D14** | 6:30–6:50 | Marxel | **MANDATORY BEAT B — GitHub.** Switch to the GitHub tab. Show the repo page: the README on page one with the deployed-app URL, the folders, the recent commit history. | "And this is the repository. The README has the deployed-app URL on page one, the setup and run instructions, the test instructions and the demo accounts. Every commit is there with who wrote it." |

### The class search box — the one thing that depends on the bundle

The search box and the **Class Settings** tab are live (PR #51 merged 3 Nov 2026; the live bundle carries them — §0), so beat D1 plays the search-and-Settings clicks. Confirm the bundle hash on the day (§0): if `Class settings` comes back 0, you are on an older build and you use the fallback below.

**Normal case — the live build (this is what you should expect):**

> Type a class name in the **Search classes** box on the grid, press **Settings** on the class card, and land on the **Class Settings** sub-tab. Say:
> "Search for the class by name or course, press Settings on the card, and the trading switch, the analytics time zone and the trade log are right here on the class itself. This used to be one long list on the Settings page."

**Fallback — only if the day-of bundle grep returns 0:** skip the search-and-Settings clicks and say this instead. Do not pretend the buttons exist:

> "The newest thing I've done is merged into the main branch and deployed, but what you're seeing here is an older build. I've moved the trading switch, the analytics time zone and the trade log off the Settings page and onto each class's own Class Settings tab, and I've added a search box on the class grid so you can find the class by name. That's PR 51 — it's in main — but what you're seeing here is the before picture. The screenshots of the after picture are on the slide."

### If the demo breaks

Have the recorded video open in another tab as the fallback, and say: "Let me show you the recorded version of this flow, and I'll talk over it." Do not spend more than 20 seconds diagnosing anything on screen.

---

## 5. Do NOT do this

**Straight from the official rules (Project Q&A p11, "Final Presentation"):**

1. **Do not demo log-in or log-out.** The rule is printed as "DO NOT demo about log-in/out, user registration functions". Sign in before you present and never show the sign-in screen.
2. **Do not demo user registration.** Same rule. The sign-up page, the role cards and the "Create an account" form stay off the projector.
3. **Do not spend the demo on plumbing.** Q&A p05: login/logout and registration "are near plug-and-play, so treat them as plumbing, not a feature". Nothing in your demo may be about signing in or signing up.

**From the same rules, applied to what you would otherwise be tempted to say:**

4. Do not call the accounts work a feature. Section 7 task 1 gets described as **class management and role control** — creating classes, join codes, rosters, archiving — not as authentication.
5. Do not say "70% of your questions were the ones you got wrong". The app is about **70% general coverage and 30% focused on weak topics** (`src/quiz/adaptive.js:19`; the app's own copy says the same). Getting this backwards is an easy catch.
6. Do not take questions at the end. **Q&A is at the front, before the demo** — do not hold questions back to the end of the deck.
7. Do not claim the per-class settings move is still on a branch, or still waiting for a deploy. It is merged into `main` as PR 51 **and it is live** (§0) — the site redeploys from `main` automatically, so nothing is pending on your side.
8. Do not promise a feature you have not confirmed on the live site. The class search box and the Class Settings tab **are** live (§0) — but **check the bundle hash on the day** (§0) and never assert a build you have not confirmed yourself.

**From what we verified in the code:**

9. Do not show a raid boss. There is no raid screen in the shipped app — the Campfire Run tab is the arena, and the raid is exercised only at the socket level (`e2e/raid-boss.spec.js:7-12`). If asked, the honest line is "the raid is a shared-server mechanic behind the Campfire Run lobby".
10. Do not narrate the old tab names. On screen they are **Kingdom, Quiz, My Progress, Campfire Run, Summon** and, for professors, **Analytics, To review, Classes & Roster, Question bank, AI drafting, Evaluation, Settings** (`web/src/App.vue:29-32`).
11. Do not restart the deployed app. The brief says to leave it running and not restart unless the teaching team contacts you.
12. Do not read a credential aloud from the screen. The professor account is a seeded demo account; the password lives in the group chat.
13. Do not present third-party code as ours. The rubric requires third-party libraries to be identified in the presentation and in code comments (`README.md:140-186` credits them on the slide-15 list).

---

## 6. Closing beat — what each of us contributed (30 seconds)

The closing is the **end of the presentation** (20:45–21:15). The Q&A is at the front, not here — this beat is the last thing the room hears. Slide 15 is William's; he says "Here's who built what" and hands to you.

The full script is in §2 under "Closing 30 seconds". It is one paragraph, six clauses, one per member, then one line that is the point of the whole app:

> "William built the game side — the Kingdom, the Summon pulls, the Campfire Run lobby and the coin economy that makes students want to come back. Xavier built the AI drafting pipeline and the adaptive session logic. Kai built student progress tracking and the report-a-problem loop that puts a student's complaint in front of the right professor. Zhi Yang built the professor's Analytics dashboard. Jasper built the Question bank, where nothing reaches a student until a professor approves it. And I built class management and learning content upload — creating classes, the join-code design, the roster, archiving instead of deleting, and the upload that reads your slides in your own browser.
>
> The one thing we all agree on is that no question reaches a student until a professor has read it. That's the whole product."

Honesty rules for this beat: claim only what is in Section 7, and only the flow each person actually built. Every item above is backed by a green scripted test, so a "show me" request is always answerable. If someone asks about the sign-up role selector Jasper added, say: "That's Jasper's, on the sign-up page — and we count that as plumbing, not a feature."

---

## 7. Rehearsal checklist

### Three passes, in this order

| When | Length | What you rehearse | Pass condition |
|---|---|---|---|
| Day before, evening | 25 min | The whole deck out loud, no stopping, no notes except this file. Time it. | **11:00 or under** — the slide budget is 655 s = 10:55, and the whole speaking block (slides + demo beats + closing) has to fit **18:15**. If the deck runs over 11:00, cut in the order in §1: slide 12 first, then slide 2, slide 3 and slide 14 — never a teammate's feature slide. |
| Day before, evening | 15 min | The demo only, three times in a row: D1→D11 — class management and upload, then the seven student steps in the agreed order — then the two 575 px beats, then the GitHub beat. Use the real app at the live URL — the class-settings change is merged and deployed, and the site redeploys from `main` on its own. | You can do D3 and D6 without looking at the script. |
| Morning of | 10 min | Slides 1, 2 and 3 only, standing up, then the demo D1→D11 once. | The first three slides come out cold. |

Rehearse in the order the room hears it: the **Q&A answers first** — they open the session, because the professor's rule 5 puts Q&A at the front — then the **slides**, then the **live demo beats**, then the **closing line**.

### Pre-flight on the day (do these in order, 20 minutes before)

- [ ] **Confirm the slot and the room.** 16 Nov 2026 is the normal **Week 13** presentation; the make-up slot is **Week 14, Monday 23 Nov 2026**. Check the time and the venue with the teaching team before the room.
- [ ] **Data check — do this before Friday 6 Nov, not on the day.** You need more than one class and a roster with students in it. **Preferred:** move the "Intro to Computing (demo)" course and its two classes from `t-a` to `t-b` — the material is already on the live project, `t-b` still works, and this is a reversible **data** change that takes nobody's login away. `scripts/fix-demo-teacher.js` reports the row and can change one field on one row. **Heavier alternative:** `pnpm db:reset --confirm` is a **local** script, not a remote one: run it from a machine that has the live project's `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env`, with the Render service stopped, then redeploy so the server reloads the reseeded data. A reseed **deletes every row** and takes `t-a` back from whoever owns it now — that is Ho Zhi Yang's own account — so it needs **his** nod first, and the sign-in has to be re-checked afterwards.
- [ ] **Confirm which professor account you are signed in as**, and open `GET /api/teacher/courses` to see which course it lists. **After a reseed, sign in as Prof. Demo A (`prof.a@quizquest.demo`)** — that account owns "Intro to Computing (demo)" with its three topics and the two Computing classes. **Without a reseed, `prof.b@quizquest.demo` is the account that works**, and it lists "Intro to Statistics (demo)" with one topic. A reseed puts `t-a` back, so the account that signs in can change after it — read the course in the response before the room, not in front of the class.
- [ ] **Check the live app URL on the README's page one** — `https://quizquest-4phd.onrender.com`. It has to open and land on the professor's class grid. If it 404s or shows the old build, stop and fix it before the room.
- [ ] Wake the instance: open the site several minutes early. The free instance sleeps.
- [ ] Sign the professor in, land on Classes & Roster, then **leave the tab there**.
- [ ] Open the GitHub tab: `github.com/whansel007/QuizQuest`.
- [ ] Open DevTools, dock it to the right and leave the **Console** tab selected — but leave the device toolbar **switched off** (desktop width). You engage the 575 px viewport yourself, live, at beat D12. Confirm the console is empty on the class page.
- [ ] **Confirm the live build before you walk in:** `curl -s https://quizquest-4phd.onrender.com/ | grep -o '/assets/index-[^"]*\.js'`, then grep that bundle for `Class settings`. One or two hits = the current build, so D1 plays the search-and-Settings clicks; zero hits = an older build, so you use the fallback line in §4. The site redeploys from `main` on its own, so the hash can change between now and the day.
- [ ] **Turn the sound off before you sign in**: in the demo tab's console run `localStorage.setItem('hero-lab-settings', JSON.stringify({ muted: true }))` and reload. (The on-screen mute button only exists on the student header — `web/src/App.vue:202` — and the live demo is the professor's screens.) Turn off the browser's "offer to save passwords" popup. Close every other tab and app that can steal focus.
- [ ] Zoom 100%, window maximised, 1920×1080.
- [ ] Rehearse the Q&A answers below once each, out loud.

### The five questions you must be able to answer in one sentence each

1. **"Where did the per-class settings go?"** — "They were moved out of the Settings page into the class's own page. That's PR 51, it's merged into main and it's live — the site redeploys from main on its own, so the live site is already running the new build."
2. **"Why does a join code look like that?"** — "Twelve random characters after a fixed QQ- prefix, drawn from a 32-symbol alphabet by a cryptographically secure random source — about 1.15 × 10¹⁸ combinations — and only a hash is stored, so the code is shown once and can't be read back out of the database."
3. **"Is the AI allowed to publish a question?"** — "No. Drafts sit in the Question bank under Needs review until a professor presses Approve & publish."
4. **"What did you use AI/LLM for?"** — Name the parts: boilerplate, test scaffolding, refactoring help, and the report/question prompts written by Xavier against the professor's own material. The full disclosure is in the README's **AI use** section — one row per team member, with every AI-assisted piece of work listed — and it is in the submission zip. **Do not say "the README has it" unless the team has pasted it there:** the draft is `knowledge/README.txt`, which is gitignored and does not ship, so the section has to be added to the README before the zip is built.
5. **"How do you know it works?"** — "Forty-six end-to-end tests across nineteen spec files drive a real browser against a real server, on top of forty-four Node test files, five browser suites and thirteen unit spec files — including a test that asserts a join code is never written to the database file."

### Q&A framing

Everyone stands at the front for Q&A ("Q&A with each team at the front"). The rubric gives Q&A 5% on its own, but an unclear answer drags the 20% "The presentation" and the 27% "Working app" components with it — so answer briefly, in one sentence, and say "that's my part" so the owner picks it up.

If you don't know: say "I'd have to check the code, and I'd rather do that than guess." Then check it after and answer in writing. That reads as competence, not as a gap.
