# IS216 Final Presentation — Slide Deck (TEXT DRAFT) — SUPERSEDED

**QuizQuest (team Prince William's Quest)** · Monday 16 Nov 2026 · a text deck, not a design file.

> # ⛔ SUPERSEDED — DO NOT PRESENT FROM THIS FILE
>
> **The deck that ships is Kai Cong's `QuizQuest Project slides.pdf` — 13 pages**, exported from
> PowerPoint. It is in the submission zip. (One PDF, three names: `knowledge/IS216_G1_T7_QuizQuest/FOR SUBMISSION/QuizQuest Project slides.pdf` on your machine, `docs/presentation/QuizQuest-Presentation-Slides.pdf` in the repo, `01-presentation/QuizQuest-Presentation-Slides.pdf` in the zip.) **Its page numbers are not the slide numbers below.**
>
> **Use these instead:**
> - `docs/presentation/PRESENTATION_RUN_OF_SHOW.md` — the timed run sheet, **re-keyed to the
>   13-page PDF** (every "page N" there is a PDF page).
> - `docs/presentation/QA_PREP.md` — the Q&A pack.
>
> This file is kept only as the working draft the deck grew out of, and as the source of the
> facts (tab names, button labels, test counts, demo steps) that the PDF and the run sheet both
> quote. **Do not read a number off it in the room.**
>
> **Its timings are stale as well.** The per-slide and per-member tables below are the old
> 12-slide script's and they no longer match the run of show's 13-page split — use the run
> of show's §1 tables, not these.
>
> The one thing the PDF no longer carries is a **testing page** and a **live-demo page** — the
> demo runs as one block between PDF pages 10 and 11, and the test counts are spoken at beat D12.

> **DRAFT — for the team to adapt.** Every line below is a suggestion, not a law. Reword it, cut a bullet, change the order. What is *not* a suggestion is the set of facts: the tab names, the button labels, the test counts and the demo steps are all quoted from the code and must stay accurate.
>
> **Kai Cong may have a separate deck.** If he has built his own slides, treat this file as the *script* for his slides and the *backup* deck for anyone who has to present without him. Do not present both.
>
> **What this file is:** slide-by-slide text that a team member can paste into Google Slides or PowerPoint, plus the speaker script, the demo run sheet and the time budget. Kai Cong is helping make the actual slides — the wording here is for him to adapt, not to be presented as-is.

---

## How to use this file

1. **Slide 1 carries the demo video link.** The professor requires the link on the *first* slide, so the placeholder there is not optional.
2. **Every `<...>` in caps is a hole someone has to fill.** See "Placeholders to fill before the room" at the bottom.
3. **Every quoted string is verbatim from the code.** If you retype a button label, copy it from the app, not from memory — "Approve & publish" has an ampersand, "Copy it now — it is shown only once." has an em dash.
4. **The demo is not on the slides.** It is the live app: it plays after slide 9 and before slide 10, and the run sheet in this file is what you rehearse against.
5. **Never put the sign-in screen, sign-up screen, logging in, logging out or registration on the projector.** The professor's rule is explicit, and login and registration do not count as a feature. Every demo account and its password is in `README.md` → *Demo sign-in*; the password is never spoken, typed on camera or written on a slide.

**Deck shape:** 12 slides in the order the professor asked for — title and video link → the problem → what the app does → the stack → the responsive check → testing → the repository and the live URL → the closing. Slides 4 and 5 each carry **two half-slides** (two features side by side). Split them into 4a/4b and 5a/5b if Kai prefers 14 slides; the timings below do not change.

---

## The deck

### Slide 1 — QuizQuest

- **QuizQuest** — a gamified learning platform for university classes: professors author and publish questions, students practise where they are weak, and both sides get a game on top.
- Team **Prince William's Quest** — Section 7, group G7.
- **Demo video: https://youtu.be/A6CSirXZbDQ** — YouTube, public, 12 minutes maximum, at least 720p. **Measured 5 Nov: 11:54 (714 s), 720p and 1080p — but that was the pre-music upload, and a re-upload with background music is expected, so re-measure it before the room.**
- Live app: **https://quizquest-4phd.onrender.com** (big text on the slide).

**Speaker note (Marxel, 0:20)** — "Hi, we're team Prince William's Quest, and this is QuizQuest — a quiz platform for university classes. The link to our demo video is on this slide, and the app is live at quizquest-4phd.onrender.com."

> A free Render instance sleeps when it is idle, so the first hit can come back **503 with a `Retry-After` header** while it wakes. Wake it several minutes before the room; do not claim it is always instantly up.

---

### Slide 2 — The problem: a hundred slides, no time

- A lecturer gets a hundred slides and no time; turning them into a quiz by hand takes hours.
- What comes out is generic questions that don't match what was actually taught.
- Students get them wrong, the professor can't tell which topic went wrong, and the whole loop is slow.
- We are not replacing the professor's judgement — we are cutting the work that surrounds it.

**Speaker note (Kai Cong, 0:55)** — "Here's the problem we picked. Every week a lecturer gets a hundred slides and no time. Turning those slides into a quiz by hand takes hours, and what comes out is generic questions that don't match what was actually taught. Then students get them wrong, the professor can't tell which topic went wrong, and the whole loop is slow. We're not trying to replace the professor's judgement. We're trying to cut the work that surrounds it."

**Question we will be asked** — *"What problem does QuizQuest solve?"* — "It helps a professor turn one week of lecture material into practice that is aimed at each student, and it helps students practise where they are actually weak."

---

### Slide 3 — What QuizQuest does

- Our app helps university professors to turn their own lecture material into a ready-to-use quiz faster, because it reads the slides, writes a report the professor edits, and drafts questions that only the professor can publish.
- The shape of it: the professor uploads material → the system writes **one** knowledge report → questions are drafted from that report only → the professor edits and approves → students practise → the practice changes what they get next.
- Class management and learning content upload — **Marxel** · AI question drafting and adaptive practice — **Xavier Lee** · Question bank — **Jasper Wong**.
- Professor analytics — **Ho Zhi Yang** · My Progress and question reporting — **Kai Cong** · Kingdom, Summon and Campfire Run — **William Hansel**.
- Six people, one area each: every question in the Q&A has a person in this room who built the answer.

**Speaker note (Xavier Lee, 1:00)** — "Our app helps university professors to turn their own lecture material into a ready-to-use quiz faster, because it reads the slides, writes a report the professor edits, and drafts questions that only the professor can publish. Here's the shape of it. The professor uploads their lecture material. The system reads it and writes one knowledge report. Questions are drafted from that report only. The professor edits and approves. Students practise — and the practice changes what they get next. That's the whole product, and each of us owns one piece of it."

**Question we will be asked** — *"Who is the target user?"* — "Two: the professor who owns the classes, and the student enrolled in one. The role on the account decides which set of tabs the app renders, so a student cannot see Classes & Roster at all."

---

### Slide 4 — Marxel's two features

> **Two half-slides — split into 4a and 4b if you would rather have 14 slides.**

#### 4a · Class management

- Create a class from a course; it appears on the grid as a card with the student count and the live join-code count on it.
- **Manage Roster & Codes** → **Join Codes (N)** → **+ Generate Join Code** → a 12-character code from a cryptographically secure random source; the server stores only a hash, so the readable code is shown exactly once — *"Copy it now — it is shown only once."*
- **Student Roster (N)** lists the **Enrolled Students** with their **Questions Attempted** and **Last Active** columns; a professor can also enrol a student by email, and a class is archived rather than deleted so the history stays intact.
- Each class now carries its own **Class Settings** tab — the trading switch, the analytics time zone and the trade log. *(Merged into `main` as PR #51, and **live on the deployed build**.)*
- The class card carries three actions: **Manage Roster & Codes →**, **Settings** and **Rename**. **Rename** opens a *Rename Class* modal where the name is capped at 80 characters and the description at 300, and the description can be cleared outright. *(PR #59 — **live on the deployed build**.)*

**Speaker note (Marxel, 0:25)** — "Class management is mine. You pick the course, name the class, and it appears on the grid as a card with the student count and the live join-code count on it. Then Manage Roster and Codes gives you Generate Join Code — twelve characters from a cryptographically secure random source — and the readable code is shown exactly once, because the server only keeps a hash of it. The Student Roster tab lists the enrolled students with their questions attempted and last active, and a class is archived rather than deleted, so the history stays intact. Each card also has Settings and Rename on it."

#### 4b · Learning content upload

- PDF, PowerPoint, Word, TXT, Markdown or CSV — up to 20 files at once, 100 MB each.
- The file is read **in the professor's browser**: PPTX/DOCX are unzipped and parsed there, PDFs are read with PDF.js there. Only the extracted text is sent to the server.
- Nothing leaves the page until the professor ticks **"This is authorised course material without student personal data."** and presses **Upload files**.
- A slide that is only a picture is uploaded as a marked placeholder rather than invented text.
- The extracted text lands in the **Material Library**, where each passage can be **archived** — the row stays, because published questions still cite it, but it leaves the active list and the knowledge report — **restored**, and given new **metadata**: title, weekly topic and learning outcome. The passage text itself is deliberately not editable; only the metadata around it is. A **Show archived material** checkbox brings the archived rows back. *(PR #60 — **live on the deployed build**.)*

**Speaker note (Marxel, 0:20)** — "Upload is my other half. The file is read in the professor's browser, not on our server. A PowerPoint is unzipped and the text is pulled out of every slide; a PDF is read in the browser too. Nothing leaves the page until you tick the box that says this is authorised course material without student personal data and press Upload files — the server only ever receives text. The text lands in the material library, where each passage can be archived and restored, and where I can edit its title, topic and learning outcome."

**Question we will be asked** — *"Where did the per-class settings go?"* — "I moved them out of the Settings page onto the class's own Class Settings tab. That's PR #51 and it is merged into `main` and live on the deployed build."

---

### Slide 5 — Xavier's two features

> **Two half-slides — split into 5a and 5b if you would rather have 14 slides.**

#### 5a · AI question drafting

- Six steps on screen: **Upload → Knowledge report → Edit & save → Configure questions → Generate → Review & publish**.
- The drafter reads the professor's **saved knowledge report only** — the slides are not sent — and verifies each candidate independently; a candidate that does not hold up is surfaced as a warning, never quietly swapped out.
- Every draft is written with status `draft`; nothing reaches a student until a professor presses **Approve & publish**.
- The whole app still works without an API key: the guided workflow is not rendered and the older one-form screen is used instead.

**Speaker note (Xavier Lee, 0:55)** — "AI question drafting. Six steps on screen: upload, knowledge report, edit and save, configure questions, generate, review and publish. The important part is what the drafter is allowed to read — only the knowledge report the professor saved, never the slides themselves. Every candidate is verified on its own, and a draft that doesn't hold up is surfaced as a warning rather than quietly replaced. And every one of them is written as a draft. Nothing reaches a student until a professor presses Approve and publish."

#### 5b · Adaptive and weak-topic practice

- A practice session is about **70% general coverage and 30% focused on the student's weak topics** (`weakShare: 0.3` — that split was decided on 16 Oct and it is deliberate).
- The app's own copy says it: *"Focused practice: about 30% of questions from … The rest give broader coverage."*
- Or the professor can tick one topic by hand and every question in the session comes from that topic.

**Speaker note (Xavier Lee, 0:40)** — "Adaptive practice. A practice session is about seventy percent general coverage and thirty percent focused on the topics you got wrong. The app says so itself — 'Focused practice: about 30% of questions from … The rest give broader coverage.' And if you don't want the engine deciding, you can tick one topic by hand and every question comes from it."

**Question we will be asked** — *"How does the adaptive quiz pick questions?"* — "About 70% general coverage and 30% focused on weak topics — the split is a deliberate decision, not a bug. And the student can override it entirely by ticking one topic."

---

### Slide 6 — Question bank: nothing goes live unreviewed

- Five status filters — **Needs review**, **Reported**, **Published**, **Withdrawn**, **Rejected** — plus a topic filter, with live counts on each.
- Every card carries its status, type (MCQ / True/False / Short Answer / Multi-select), difficulty, style (Conceptual / Application), version and origin (**AI draft**).
- Four actions on a card: **Approve & publish**, **Reject**, **Withdraw**, **Publish again** — plus **Edit**, so a professor can write and publish a question by hand.
- The toasts confirm it: *"Published"*, *"Rejected"*, *"Withdrawn from practice"*, *"Published again"*.
- The per-question **Regenerate draft** button was removed on 3 Nov — one question is edited by hand — but the **bulk "Rewrite AI drafts" bar still ships**: tick the AI drafts, choose Application or Conceptual, "Rewrite selected", and your originals are kept. **Do not say AI drafts cannot be re-rolled** — that is wrong, and the bar is one click away.

**Speaker note (Jasper Wong, 1:40)** — "The question bank is mine. Five filters — Needs review, Reported, Published, Withdrawn, Rejected — and a topic filter on top. Every card shows its status, type, difficulty, style, version and whether it came from the AI. Four actions: Approve and publish, Reject, Withdraw, Publish again — plus Edit, for a question written by hand. Nothing a student ever sees is anything other than published. One change worth mentioning: the per-question 'Regenerate draft' button is gone — the professor edits one draft by hand instead — though the bulk rewrite is still there for a set of AI drafts."

**Question we will be asked** — *"Do AI questions go live by themselves?"* — "No. They are stored with status `draft` and no published version; only **Approve & publish** makes them live for students."

---

### Slide 7 — My Progress, and a way to fight a question

- **Your practice indicator**, and under it **"Worth practising next:"** — the topics under the accuracy line.
- **Topics** — accuracy per topic; **Recent sessions** — every session and its score.
- **Report a problem** is on every question in a practice session; the reason reaches the professor *without your identity*.
- The student sees it under **My question reports**; the professor sees it as **Open student reports (N)** on **To review**, and can reply.

**Speaker note (Kai Cong, 1:20)** — "My Progress is mine. Four things on the page: your practice indicator, the topics, your recent sessions and your question reports. The indicator names the topics worth practising next — the ones under the accuracy line — and every topic is listed with its own accuracy. And if you think a question is wrong, you press Report a problem on it while you are answering it. The reason reaches the professor without your name attached, it shows up for them as Open student reports, and they can reply to you."

**Question we will be asked** — *"How does a student report a bad question?"* — "From the question in the practice session. It appears under **My question reports** for the student and as **Open student reports (N)** for the professor, who resolves it — and the professor's reply is part of the same round trip."

---

### Slide 8 — Which topic actually failed

- **First-attempt accuracy by topic**, weakest first — so the first row is the topic that actually failed, not the one that went best.
- **Needs attention** lists the few things worth acting on and links to the answers still waiting for a mark on **To review**.
- **Print report** puts the whole dashboard on paper.
- **Compare your classes** puts a course's tutorial groups side by side — that is how you tell a weak topic from a weak group.
- Days and weeks are rendered in that class's own time zone (the hint line points at **Classes & Roster**).

**Speaker note (Ho Zhi Yang, 1:40)** — "The professor's Analytics tab is mine. First-attempt accuracy by topic, weakest topic first — so the first row is the topic that actually failed, not the one that went best. Needs attention lists the few things worth acting on and links to the answers still waiting for a mark. Print report puts the whole thing on paper. And Compare your classes puts a course's tutorial groups side by side, which is how you tell a weak topic from a weak group."

**Question we will be asked** — *"What do the numbers mean?"* — "Per topic: first-attempt accuracy, retry accuracy, answers awaiting marking, student count, median and p75 time, and timeouts."

---

### Slide 9 — Kingdom, Summon, Campfire Run

- **Kingdom**: a castle in the middle with four buildings around it — Garden north, Tower south, Library west, Workshop east — upgraded with the wood, crystal and herbs you earn.
- **WASD** to walk, **E** to open a door or greet a hero, **Z** for the emote wheel.
- **Summon**: the gacha — **Summon ×1** costs 50 coins, **Summon ×10** costs 500; the stars under the name are the rarity, and every pull is logged.
- **Campfire Run**: the shared lobby — pick an adventurer, press **HOST LOBBY**, a four-character room code, and two students in one lobby on one server.

**Speaker note (William Hansel, 1:05)** — "The game side is mine. The Kingdom is a castle in the middle with four buildings around it — Garden north, Tower south, Library west, Workshop east — and you upgrade them with the wood, crystal and herbs you earn from answering. WASD to walk, E to open a door or greet a hero, Z for emotes. Summon is the gacha: one pull costs fifty coins, ten costs five hundred, and the stars under the name are the rarity. And Campfire Run is the shared lobby — host a lobby, a four-character room code, and two students in one room on one server."

**Question we will be asked** — *"Is there a raid boss?"* — "There is no raid screen. The tab that used to be called World is now Campfire Run, and the co-op raid is exercised at the socket level in the end-to-end tests, because its UI was never wired up."

---

### Slide 10 — The stack, in one line

- **Vue 3 + Vite** in the browser · a dependency-free **Node HTTP server** that serves the API, the sockets and the built SPA from one process · **Socket.IO** for the live Campfire Run · **Bootstrap** for the utility classes · **PDF.js + fflate** to read lecture files in the browser · **Playwright** for the end-to-end tests.
- One process, one origin: a student session, a professor session and the real-time arena all come from the same address, so there is no CORS or proxy in production.
- Third-party code is credited **by name and licence** in `README.md` — Vue, Vite, Socket.IO, Bootstrap and fflate (MIT), PDF.js, Playwright and PGlite (Apache 2.0), Fontsource fonts (OFL 1.1), game-icons.net icons (CC BY 3.0). **Playwright is Apache 2.0, not MIT.**
- Data is **one JSON file** by default, or **Supabase Postgres** when `SUPABASE_URL` is set — one store behind one interface, with row-level security on for every table and no policies.

**Speaker note (William Hansel, 0:50)** — "The stack in one line: Vue and Vite in the browser, a dependency-free Node server that serves the API, the sockets and the built app from one process, Socket.IO for the live Campfire Run, Bootstrap for the utility classes, PDF.js and fflate to read lecture files in the browser, and Playwright for the end-to-end tests. One process, one origin — a student session, a professor session and the real-time arena all come from the same address, so there is no CORS or proxy in production. And all of it is credited by name and licence in the README. We haven't presented anyone else's library as our work."

**Question we will be asked** — *"Why this stack?"* — "Vue 3 and Vite for the browser app, a dependency-free Node server that serves the API, the sockets and the SPA from one process, and Playwright for the end-to-end tests."

---

### Slide 11 — How it holds up: 575 px, the console, the tests

- At **575 px** — the extra-small breakpoint — the class grid collapses to one column and the student progress page stacks into a single column.
- The browser **Console** stays open and **empty** through the whole demo: no errors, no warnings.
- 63 media-query blocks in one stylesheet, with width breakpoints from 1199 px down to 420 px, and `width=device-width` with `viewport-fit=cover`.
- **The test suite:** `pnpm test` — **44** Node test files · `pnpm test:browser` — **5** browser suites · `pnpm test:unit` — **13** vitest spec files (11 Vue component specs under `web/src`, 2 module specs under `src/quiz`) · `pnpm test:e2e` — **46** end-to-end tests across **19** Playwright spec files.
- One rule the code enforces and we are happy to be asked about: **a join code is never written to the database file — only its hash is.**

> **Counted on `origin/main` @ `7d8cacf`, not from memory.** `git ls-tree -r origin/main --name-only -- test | grep -cE '^test/[^/]+-test\.js$'` → 44; `git ls-tree -r origin/main --name-only -- e2e | grep -cE 'spec\.js$'` → 19, and `grep -cE "^[[:space:]]*test(\.(only|skip|fixme))?\s*\(\s*['\"\`]"` across those specs → 46. The unit count is 13 because `vitest.config.mjs` includes both `src/**/__tests__/*.spec.js` and `web/src/**/__tests__/*.spec.js`. The browser count is 5 — the `test/browser*.test.cjs` files `pnpm test:browser` runs. **All three documents now carry these figures:** this deck, `PRESENTATION_RUN_OF_SHOW.md` and `QA_PREP.md`.

**Speaker note (Marxel, 0:35)** — "Responsiveness and testing. At 575 pixels — the extra-small breakpoint — the class grid collapses to one column and the progress page stacks into a single column, and the console stays open and empty through the whole demo: no errors, no warnings. The stylesheet has sixty-three media-query blocks. On testing: forty-four Node test files, five browser suites, thirteen unit spec files, and forty-six end-to-end tests across nineteen Playwright spec files — each one driving a real browser against a real server. And there's one rule the code enforces that we're happy to be asked about: a join code is never written to the database file. Only its hash is."

**Question we will be asked** — *"How do you know it works?"* — "Four layers, all runnable from the `package.json` scripts: Node integration tests, browser suites, unit specs and Playwright end-to-end tests — including one that asserts a join code is never written to the database file."

---

### Slide 12 — The repository and the live URL

- **Repository:** `github.com/whansel007/QuizQuest` — the README has the deployed-app URL on page one, the setup and run instructions, the test commands and the demo accounts.
- **Live app:** `https://quizquest-4phd.onrender.com` — a free Render instance. It sleeps when it is idle, so the first request can come back **503 with a `Retry-After` header** while it wakes.
- **William** built the game side — the Kingdom, the Summon pulls, the Campfire Run lobby and the coin economy. **Xavier** built the AI drafting pipeline and the adaptive session logic. **Kai** built student progress tracking and the report-a-problem loop. **Zhi Yang** built the professor's Analytics dashboard. **Jasper** built the Question bank.
- **Marxel** built class management and learning content upload — creating classes, the join-code design, the roster, archiving instead of deleting, and the upload that reads your slides in your own browser.
- The one thing we all agree on: **no question reaches a student until a professor has read it.** That's the whole product.

**Speaker note (Marxel, 0:15)** — "The repository is on screen behind this. The README has the deployed-app URL on page one, the setup and run instructions, the test commands and the demo accounts."

---

## The live demo run sheet

The app is **already signed in** when you walk in. The sign-in page, the sign-up page, logging in, logging out and registration never appear on the projector — the professor's rule, and login does not count as a feature.

### The seven agreed student steps

In this order, each with exactly one owner.

| # | Step | Owner | Time | What the audience should SEE |
|---|---|---|---|---|
| 1 | **Kingdom brief** | William Hansel | 0:25 | The **Kingdom** tab: the brief cards — **"Welcome home!"**, **"Four buildings"**, **"Getting around"** — and the castle in the middle with a building on each side. |
| 2 | **Quiz — select all** | Xavier Lee | 0:15 | The **Quiz** tab: under **TOPICS TO PRACTISE**, press **Select all**, then **Start practice**. The first question arrives. |
| 3 | **My progress** | Kai Cong | 0:15 | **My Progress**: **Your practice indicator**, under it **"Worth practising next:"** with the topic names, then **Topics** with the accuracy per topic, then **Recent sessions**. |
| 4 | **Quiz — select weak topics** | Xavier Lee | 0:15 | Back on **Quiz**: press **Select none**, tick only the weak topic, then **Start practice**. The session's own line reads *"Focused practice: about 30% of questions from …"*. |
| 5 | **Gacha** | William Hansel | 0:20 | **Summon**: the pull buttons — **Summon ×1** with the coin cost beside it. Press it; the reveal lands on a hero with its rarity stars. |
| 6 | **Kingdom upgrade and functions + greet and emotes** | William Hansel | 0:25 | Back on **Kingdom**: walk to a building with WASD, press **E** to open it, then **Upgrade** with the resource cost beside it. Press **Z** for the emote wheel and pick one. Walk up to a hero and press **E** to greet. |
| 7 | **Campfire run** | William Hansel | 0:25 | **Campfire Run**: choose an adventurer, press **HOST LOBBY**, show the four-character room code, then join from the second student tab. |

**Total for the seven student steps: 2:20.**

### The professor's half, and the two mandatory beats

⛔ **This run sheet is the OLD draft's — the shipping beats are `PRESENTATION_RUN_OF_SHOW.md` §4 (D1–D14).** Two things changed and both matter: **D13, the student-tab 575 px beat, belongs to Kai Cong** (it is his My Progress screen), and **the question-bank beat points at "Approve & publish" but does not press it** — publishing is a one-way door on live data, and **the To review marking queue is empty** on the seeded data, so that beat ends on the **Reported** tab instead.

| Beat | Owner | Time | What the audience should SEE |
|---|---|---|---|
| **Classes & Roster** — create a class, generate a join code | Marxel | 0:35 | Land on **Classes & Roster** with the **Console** tab open and empty. Press **+ Create Class** → the "Create New Class Group" modal → **Create Class**. Then **Manage Roster & Codes →** → **Join Codes (N)** → **+ Generate Join Code** → **Generate Code**. The banner appears with the code; then **Student Roster (N)** → **Enrolled Students**. |
| **Upload** | Marxel | 0:15 | Open the material import, drop in the lecture file, tick **"This is authorised course material without student personal data."**, press **Upload files**. The text lands in the material library. |
| **Question bank** — approve and publish | Jasper Wong | 0:55 | **Question bank**: the status filter reads **Needs review**. Open the seeded draft, read the stem and its source, and **point at "Approve & publish" — do not press it live**. Then the **Reported** tab: one open student report. (**To review** is empty on the seeded data.) |
| **Analytics** | Ho Zhi Yang | 0:55 | **Analytics**: the topic table, weakest first. Show **Needs attention**, click a topic to focus it, then press **Print report**. |
| **575 px + Console** — professor tab (**MANDATORY**) | Marxel | 0:15 | Resize to **575 px**, Console visible. Scroll the class grid so it reflows to one column while the console stays clean. |
| **575 px + Console** — student tab (**MANDATORY**) | **Kai Cong** | 0:20 | On the student tab at **575 px**, **Console** still visible. **My Progress** stacks into one column. The console stays empty. **This is Kai's screen — he takes this beat.** |
| **GitHub repository** (**MANDATORY**) | Marxel | 0:20 | Switch to the GitHub tab. The repo page: the README on page one with the deployed-app URL, the folders, the recent commit history. |

**Total for the whole demo: 5:45.**

### If you are short on time — cut in this order

Xavier's flag is right: seven student steps cannot carry four minutes each. The seven steps above take **2:20**, and that is the number to rehearse.

1. **Cut step 7, Campfire Run (0:25).** **William absorbs it** — he keeps talking and says: *"Campfire Run is the shared lobby: pick your hero, host or join with the room code, and two students are in one lobby on one server."* Nobody else takes it; it is not handed over.
2. **Cut step 6, Kingdom upgrade and emotes (0:25).** **William absorbs it** — one sentence: *"Buildings upgrade with the wood, crystal and herbs you earn, the castle grows with them, Z is emotes and E beside a hero is a greet."*
3. **Cut step 5, Gacha (0:20).** **William absorbs it** — show the **Summon ×1** button and the coin cost without pulling.
4. **Cut the upload beat (0:15).** **Marxel absorbs it** — slide 4b already carries the story.

**Never cut:** the two **575 px + Console** beats and the **GitHub** beat (the professor's rules), the **Question bank** beat (it is the core claim — nothing reaches a student unreviewed), or another member's own feature beat. If you are still over, cut slide 2 (the problem) and slide 12's repository bullets — they are general slides, not anybody's feature.

### If the demo breaks

Have the recorded video open in another tab and say: *"Let me show you the recorded version of this flow, and I'll talk over it."* Do not spend more than 20 seconds diagnosing anything on screen.

---

## Speaker script, slide by slide

⛔ **These are the OLD 12-slide script's words and budgets. They are not the numbers we present with.** The shipping deck is Kai's exported 13-page PDF and the authoritative script is `PRESENTATION_RUN_OF_SHOW.md`; its budget is **20:50 in all** — **3:00 of Q&A, then 17:50 of speaking** (9:55 of pages and the transition, 7:25 of live-demo beats, 0:30 of closing). The totals in this file are the old draft's: 18:15 of speaking, a 5:45 demo and a 720-second slide block. **Do not read a time off this file.** Every owner should time their own blocks out loud against the run of show and write `<OWNER: confirm the time>` next to anything they have not yet run.

**Where the live demo sits (this is the OLD 12-slide script's order — it is not the order we present in):** slides 1–9, then the **live demo** (the run sheet below, 5:45), then slides 10–12, then the closing. **The shipping order is different, and it is the one in `PRESENTATION_RUN_OF_SHOW.md`:** Kai's exported 13-page deck has no demo page, so the demo now runs as **one block between page 10 and page 11**. This file is a historical draft — do not take its order, its timings or its slide numbers from it.

| Slide | Who speaks | Budgeted |
|---|---|---|
| 1 · Title, team, video link, live URL | Marxel | 0:20 |
| 2 · The problem | Kai Cong | 0:55 |
| 3 · What QuizQuest does | Xavier Lee | 1:00 |
| 4a · Class management | Marxel | 0:25 |
| 4b · Learning content upload | Marxel | 0:20 |
| 5a · AI question drafting | Xavier Lee | 0:55 |
| 5b · Adaptive and weak-topic practice | Xavier Lee | 0:40 |
| 6 · Question bank | Jasper Wong | 1:40 |
| 7 · My Progress and question reporting | Kai Cong | 1:20 |
| 8 · Professor analytics | Ho Zhi Yang | 1:40 |
| 9 · Kingdom, Summon, Campfire Run | William Hansel | 1:05 |
| 10 · The stack | William Hansel | 0:50 |
| 11 · 575 px, the console, the tests | Marxel | 0:35 |
| 12 · Repository and live URL | Marxel | 0:15 |
| — · Closing: what each of us contributed | Marxel | 0:30 |

**Closing (Marxel, 0:30) — say it as one breath, do not read it off the slide:**

> "William built the game side — the Kingdom, the Summon pulls, the Campfire Run lobby and the coin economy that makes students want to come back. Xavier built the AI drafting pipeline and the adaptive session logic. Kai built student progress tracking and the report-a-problem loop that puts a student's complaint in front of the right professor. Zhi Yang built the professor's Analytics dashboard. Jasper built the Question bank, where nothing reaches a student until a professor approves it. And I built class management and learning content upload — creating classes, the join-code design, the roster, archiving instead of deleting, and the upload that reads your slides in your own browser.
>
> The one thing we all agree on is that no question reaches a student until a professor has read it. That's the whole product."

---

## The time budget

### Per member

| Teammate | Slides | Slide s | Demo beats | Beat s | Closing s | Total | Slot |
|---|---|---|---|---|---|---|---|
| Marxel Angelo Ramesh | 1, 4a, 4b, 11, 12 | 115 | class mgmt + join code, upload, 575 px (prof), GitHub | 95 | 30 | **240** | 4:00 |
| William Hansel | 9, 10 | 115 | Kingdom brief, Summon, Kingdom upgrade, Campfire Run | 95 | — | **210** | 3:30 |
| Xavier Lee | 3, 5a, 5b | 155 | Quiz select all, Quiz weak topic | 30 | — | **185** | 3:05 |
| Kai Cong | 2, 7 | 135 | My Progress | 15 | — | **150** | 2:30 |
| Jasper Wong | 6 | 100 | Question bank approve & publish | 55 | — | **155** | 2:35 |
| Ho Zhi Yang | 8 | 100 | Analytics | 55 | — | **155** | 2:35 |
| **Total** | | **720** | | **345** | **30** | **1095** | **18:15** |

**Check the arithmetic (this is the old draft's own arithmetic — the shipping budget is in the run of show):** 720 s of slides + 345 s of live-demo beats + 30 s of closing = **1095 s = 18:15 of speaking**. Add the **3:00 of Q&A at the front** (the professor's rule — Q&A is before the demo, not after) and the whole thing is **1275 s = 21:15**.

Every row sits between **2:30 and 4:00**. Marxel has the longest slot because he is the repository owner and carries the title slide, both of his own feature slides and all three mandatory beats. **Four minutes of demo per member for six members is not achievable** — the demo is **5:45 in total**, and the seven student steps inside it are **2:20**.

⛔ **This is NOT the same table as `PRESENTATION_RUN_OF_SHOW.md`, and the numbers differ.** These are the old draft's per-member slots (Marxel 4:00, William 3:30, Xavier 3:05, Kai 2:30, Jasper 2:35, Zhi Yang 2:35) against a 5:45 demo. The authoritative table is in `PRESENTATION_RUN_OF_SHOW.md` §1: **20:50 in all — 3:00 of Q&A, then 17:50 of speaking (9:55 of pages and the transition, 7:25 of demo, 0:30 of closing)** — with per-member slots from Marxel 4:40 down to Zhi Yang and Jasper 1:45. **If you need your slot, read it from the run of show, never from here.**

| | Seconds | |
|---|---|---|
| Q&A with the team at the front | 180 | 3:00 |
| Slides 1–12 | 720 | 12:00 |
| Live demo (14 beats) | 345 | 5:45 |
| Closing | 30 | 0:30 |
| **Total** | **1275** | **21:15** |

⛔ **Superseded figures.** The shipping budget is in `PRESENTATION_RUN_OF_SHOW.md` §1: **Q&A 180 s + pages and transition 595 s + live demo 445 s + closing 30 s = 1250 s = 20:50** — 17:50 of speaking, a 7:25 demo and a 13-page deck, not a 5:45 demo and 12 slides.

### If you are running over

Cut in this order, and never touch a teammate's feature slide: (1) slide 12's repository bullets, (2) slide 2, the problem, (3) slide 3, the tour map, (4) slide 11's testing half — the numbers are in `QA_PREP.md` if you need to say them instead of reading them. Never cut slides 4a, 4b, 5a, 5b, 6, 7, 8 or 9: each one is a teammate's own feature, and the professor wants about one meaningful feature per person.

---

## Placeholders to fill before the room

- [ ] **Slide 1 — demo video link:** the deck carries the real link — `https://youtu.be/A6CSirXZbDQ` — on slide 1 of `QuizQuest Project slides.pdf`. `pnpm submit --video-link "<url>"` **verifies** it: the packer reads slide 1 of the PDF back with PDF.js and **fails the build** if the link is not on the slide. It does **not** write the link into the deck, so the deck has to carry it by hand. **If the video is re-uploaded with the music, the new URL must replace it on the slide before you build.**
- [ ] **Slide 1 — confirm the live URL still resolves** and that the instance wakes; check for a 503 with a `Retry-After` header before you walk in.
- [ ] **Slide 4a — screenshot:** paste the **Classes & Roster** grid, at least two class cards visible, so the card shows the student count, the join-code count and the three actions — **Manage Roster & Codes →**, **Settings**, **Rename**. The *Rename Class* modal open on top of it is the better shot: it is the newest button on that card.
- [ ] **Slide 4b — screenshot:** paste the **upload panel** with the **"This is authorised course material without student personal data."** checkbox ticked. If there is room, a second shot of the **Material Library** row with **Edit metadata**, **Archive passage** and the **Show archived material** checkbox visible is worth more than the upload panel alone.
- [ ] **Slide 5a — screenshot:** paste the **AI drafting workflow** — the six steps with **Knowledge report** and **Configure questions** on screen.
- [ ] **Slide 6 — screenshot:** paste one **question card** with **Approve & publish**, **Reject** and **Withdraw** visible, and the status **Needs review** readable.
- [ ] **Slide 8 — screenshot:** paste the **Analytics topic table**, weakest topic first, with **Needs attention** and **Print report** visible.
- [ ] **Slide 9 — screenshot:** three shots — the **Kingdom**, the **Summon** banner with its rarity stars, and the **Campfire Run** lobby with the four-character room code.
- [ ] **Slide 10 — screenshot:** paste the **third-party credits table** from `README.md`.
- [ ] **Slide 11 — screenshot:** paste the **class grid at 575 px** — one column, DevTools on the right with the **Console** tab open and empty.
- [ ] **Slide 12 — screenshot:** paste the **GitHub repository page** — README on page one, the folder list, the recent commit history.
- [ ] **Demo run sheet — each owner:** `<OWNER: confirm the time>` on the beat you own.
- [x] **Test counts:** reconciled across all three documents on 4 Nov 2026 and re-verified against `origin/main` @ `7d8cacf` — **44** Node test files (462 cases, 461 pass, 1 skipped, 0 fail), **13** vitest spec files, **46** end-to-end tests across **19** Playwright spec files, **5** browser suites. All three documents now say the same thing.
- [x] **Slide 4a — the Class Settings tab is on the live build.** PR #51 is merged into `main` and the deployed bundle carries **Class Settings** and **Search classes by name or course**. Play the search-and-Settings clicks as normal. Keep the fallback line in `PRESENTATION_RUN_OF_SHOW.md` in your pocket, and confirm the bundle hash on the day (§0 of the run of show) before you walk in.
- [ ] **Nothing that looks like a credential goes on any slide.** Demo accounts and their shared password are in `README.md` → *Demo sign-in*. Never write the password on a slide, never read it aloud from the screen.

---

## Do not say

Straight from the professor's rules, applied to these slides:

1. **Do not demo or describe logging in, signing up, logging out or registration.** None of it goes on the projector, and none of it is claimed as a feature — the rules call it plumbing. The app is signed in before you present.
2. **Do not promise a raid boss screen.** There is no raid screen in the shipped app. The tab that used to be called World is now **Campfire Run**; the co-op raid is exercised at the socket level in `e2e/raid-boss.spec.js`, because its UI was never wired up.
3. **Do not use the old tab names.** The student tabs are **Kingdom, Quiz, My Progress, Campfire Run, Summon**. The professor tabs are **Analytics, To review, Classes & Roster, Question bank, AI drafting, Evaluation, Settings**. There is no "Practice" tab and no "World" tab, and there is no screen called Campfire Defense.
4. **Do not say "70% of your questions were the ones you got wrong".** It is **70% general coverage and 30% focused on weak topics** — the other way round is an easy catch.
5. **Do not claim the deployed site is always instantly up.** It is a free Render instance that sleeps; the first request can be a 503.
6. **Do not claim the per-class settings move is still on a branch.** It is merged into `main` as PR #51 and it is **live on the deployed build** — the bundle carries the *Class Settings* tab and the *Search classes by name or course* box.
7. **Do not present third-party code as ours.** Slide 10 names the libraries and the licences, and `README.md` carries the full list.

---

### Reference files

`README.md` (demo accounts, third-party credits, architecture) · `docs/presentation/PRESENTATION_RUN_OF_SHOW.md` (the beat-by-beat script and the per-member table) · `docs/presentation/QA_PREP.md` (the answers behind every "Question we will be asked") · `docs/presentation/DEMO_VIDEO_SCRIPT.md` (the recording script for the video link on slide 1) · `knowledge/IS216 - Section 7 Prince William's Quest.txt` (the ownership table this deck follows).
