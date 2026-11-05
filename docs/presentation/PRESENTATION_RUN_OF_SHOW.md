# IS216 Final Presentation — Run of Show

**QuizQuest (team Prince William's Quest)** · Monday 16 Nov 2026 · Q&A with the team at the front first, then 17:50 of speaking (the pages, the live demo and the closing line) — 20:50 in all.

Presenter reading this script: **Marxel Angelo Ramesh** (`HULKMARXEL`). Wherever a page says **hand to \<name\>**, that teammate takes over from that point to the end of the page. **On the two split pages (5 and 8) that is only the half marked in the tables** — §2 gives each half its own heading and its own owner. Everything else is Marxel's.

**Q&A comes first.** The professor's rule 5 is "Q&A happens at the front, before the demo — not at the end", so the room opens with the team answering and the deck follows. The run of show below is **3:00 of Q&A**, then **17:50 of speaking** — the pages and the transition (9:55), the live demo (7:25) and the closing line (0:30) — so **20:50 in all**. The 17:50 **ends with** the 30-second closing line; do not add the closing on top of it. The closing beat stays at the end of the presentation; the Q&A is before it.

> **20:50 in all is half a minute inside the 21:15 the superseded 15-slide script ran to** — the four slides this deck dropped (class management, upload, per-class settings, testing) moved into the demo, and the demo carries them live instead. Nothing was cut to make the deck fit; the second pass **lengthened the demo beats** so each one is deliverable at a normal speaking pace — D1 alone is a full 60 s, because creating a class, generating a join code and opening the class settings are ten clicks, and a beat budgeted below its own actions is a beat that runs long in the room. If the room wants it shorter, the cut list is in §1: page 7 first (−45 s), then page 4, page 3 and page 12.

> ### 📄 THE DECK THIS IS KEYED TO
>
> **`QuizQuest Project slides.pdf` — 13 pages, exported from PowerPoint by Kai Cong.** That is
> the deck that ships in the submission zip and the deck you will project. Page 1 carries the
> video link and the deployed link; page 2 is the title slide with the team's names; pages 3–12
> are `STAGE 02/11` … `STAGE 11/11`; page 13 is the thank-you with the QR code.
>
> **Every "page N" below means PDF page N of that deck.** The older `PRESENTATION_SLIDES.md`
> (a 12-slide Markdown working script) is **superseded** — do not present from it and do not
> read numbers off it.
>
> **This deck has no live-demo page, no testing page and no class-management page.** The live
> demo therefore runs as one block between page 10 and page 11, and the testing numbers are
> spoken at beat D12 instead of being read off a page. **Page 11 names the third-party
> libraries but does not carry the licence table**, so the spoken line on page 11 has to say
> it — read §2's note on page 11 before you rehearse. That is where the rubric points a
> dedicated slide used to cover.

Date note: **16 Nov 2026 is the presentation date.** Two sources number the weeks differently — `Week1Slides.pptx` slide 18 counts Week 1 from 24 Aug (which puts the deliverables Friday at 13 Nov), while the SMU "Class Make Up" notice counts from the Deepavali break (Mon 9 Nov 2026 is a public holiday, so the Week 13 Monday classes move to *"Week 14 Monday (16 Nov) same time/venue"*). **The date, not the week number, is authoritative: the presentation is Monday 16 Nov 2026** and the make-up slot is **Monday 23 Nov 2026**. The deliverables deadline is **Friday 6 Nov 2026, 9:00 AM** — see `knowledge/DEADLINES.md`. Confirm the slot with the teaching team before the room; the script does not change either way.

---

## 0. Read this before you walk in: which build is on screen

The live site is **supposed to follow `origin/main`, but right now it does not.** As of 5 Nov 2026 the live bundle is `/assets/index-ClFWelFb.js`, but **a fresh build of current `main` is `/assets/index-DDS_r2q_.js` — those are different builds, so the deployed app is BEHIND the repo the professor also receives.** That is William's to fix: **redeploy on Render before Monday.** Every feature in this script is in `main`, so the fix is a redeploy, not a code change. **Do not say the live site is running the latest code** — rule 9 in §5 — and do not say the deployment "automatically tracks main" either: as of today it demonstrably does not.

The live bundle does carry **PR #51, #56, #59 and #60** — the class card's **Rename** button and the Material Library's **Archive passage**, **Restore passage**, **Edit metadata** and **Show archived material** are on the deployed build, so beat D1 still plays the search-and-Settings clicks. Confirm on the day with `curl -s https://quizquest-4phd.onrender.com/ | grep -o '/assets/index-[^"]*\.js'` and then grep that bundle for `Class settings` — 1 hit = the class-settings build is live, 0 = older build. Fallback if 0: use the older-build line in §4.

| Thing | Where it lives | Verified |
|---|---|---|
| Live deployment | `https://quizquest-4phd.onrender.com` | live curl, 4 Nov 2026 |
| Live bundle contains "Class Management", "Classes & Roster", "To review", "Campfire Run" | yes | same curl |
| Live bundle contains "Search classes by name or course" and "Class settings" | **yes — 1 and 2 occurrences** | same curl, 4 Nov 2026 |
| Live bundle contains "Rename Class", "Archive passage", "Show archived material" and "Edit metadata" | **yes — 1 hit each** | live bundle grep, 4 Nov 2026 22:00 |
| **Live bundle vs a fresh build of `main`** | **`index-ClFWelFb.js` (live) vs `index-DDS_r2q_.js` (fresh) — different builds; a redeploy is needed** | both curls, 5 Nov 2026 |
| Per-class settings move + class search bar | commit `2781e75` ("Move the per-class settings to the class management page"), **merged to main as PR #51** (merge commit `22fcf74`) — in the code **and live** | `git log --oneline -1 origin/main -- web/src/teacher/ClassManagementView.vue` |
| Live teacher account | `prof.b@quizquest.demo` only — `prof.a` returns 401 and is absent from `/api/demo-users` | live check, 4 Nov 2026 |
| Live data under that account | 1 course ("Intro to Statistics (demo)"), 1 class ("Statistics - Tutorial Group B"), 2 students, 0 active join codes, **0 drafts and 0 open student reports in the Question bank** | live `GET /api/teacher/courses` + `GET /api/classes`, 4 Nov 2026 |
| Gemini on the live instance | `geminiEnabled: true`, `authoringEnabled: true`, `gemini-3.5-flash-lite` | live `GET /api/teacher/courses`, 4 Nov 2026 |

Do **not** grep for "Trading on" — the template interpolates `'on'`/`'off'`, so that string never appears in a bundle. The valid markers are "Search classes by name or course", "Class settings", "Rename Class", "Archive passage", "Show archived material" and "Edit metadata".

**The bundle name is not a fact — it changes on every redeploy.** Find out which build is live, and whether it carries the class-settings move, with:

```bash
curl -s https://quizquest-4phd.onrender.com/ | grep -o '/assets/index-[^"]*\.js'
```

Then search that bundle for `Class settings`. That one command decides which version of the class-management beat D1 you play (§4).

**Consequence for the run of show:** the class search box and the Class Settings tab are on the live build, so beat D1 plays the search-and-Settings clicks. Everything else in the script is on `main` and is safe to say on the record — but if the redeploy has not landed by Monday, do not claim the live site is running current `main` (rule 9 in §5).

Fix the data **before Friday 6 Nov, not on the day**. There are two ways, and they are
not equally safe:

**Option 1 — move the content (preferred).** The demo material already exists on the
live project, but it sits under `t-a`, and `t-a` is no longer a demo account: it is
**Ho Zhi Yang's own account**, with his real email address and his own password.
Reassigning that course and its two classes to `t-b` (`prof.b@quizquest.demo`, which
still works) is a **data change, not a code change**, it is reversible, and it takes
nobody's login away.

**How to do it — the Supabase SQL editor.** `scripts/fix-demo-teacher.js` **cannot**
do this move: its only write is `.from('users').update({ extra: nextExtra }).eq('id',
't-a')` — it rewrites one field on the `t-a` **user** row (the email, and optionally
the password hash). It never touches `courses.teacher_ids` or `classes.teacher_ids`.
Keep that script for exactly one job — **restoring `prof.a`'s email** if Option 2
puts it back — and only with Ho Zhi Yang's nod.

The move itself is two statements in the **Supabase SQL editor** (`teacher_ids` holds
a JSON array; `src/db/schema.js:28,41` maps it to `teacherIds`):

```sql
UPDATE courses SET teacher_ids = '["t-b"]' WHERE id = 'c-comp';
UPDATE classes SET teacher_ids = '["t-b"]' WHERE id IN ('cl-a', 'cl-c');
```

Check it with `GET /api/teacher/courses` and `GET /api/classes` while signed in as
`prof.b@quizquest.demo`: both courses and all three classes should be listed, and
`prof.a` must still be able to sign in with his own login. **Nothing about Ho Zhi
Yang's account changes.**

**What is missing under `prof.b` until that move lands** (checked against
`src/quiz/seed.js` on 5 Nov):

| What | Under `prof.b` today | After the move |
|---|---|---|
| Courses | 1 — "Intro to Statistics (demo)" | 2 — plus "Intro to Computing (demo)" |
| Classes | 1 — "Statistics - Tutorial Group B" | 3 — plus "Computing - Tutorial Group A" and "… Group C" |
| Students | 2 | 12 across the three classes (6 in Group A, 4 in Group C, 2 in Group B) |
| **Question bank → Needs review** | **empty** — the only seeded draft (`q-draft1`) is in `c-comp` | the draft appears — **beat D3 depends on this** |
| **Question bank → Reported** | **empty** — the only open student report is on `q-n2`, which is in `c-comp` | one open report — the second half of beat D3 |
| To review → Answers to mark | empty | **still empty** — the marking queue only fills when a student answers a free-response question, and no seeded attempt does (`api.js:478` sets `needsReview` only on a provisional grade; `api.js:1647` filters on it). **Beat D3 does not use it.** |
| Analytics | "No answers yet" | the seeded practice history fills it |

**Beat D3 is not safe to play until the move lands.** Without it the professor opens
the Question bank, sees two published questions and no draft, and the beat meant to
prove the approval gate has nothing to point at.

**Option 2 — a full reseed (heavier).** `pnpm db:reset --confirm` is a **local**
script — run it from a machine that has the live project's `SUPABASE_URL` and
`SUPABASE_SECRET_KEY` in `.env`, with the Render service stopped, then redeploy so
the server reloads the reseeded data. Confirm afterwards with
`GET /api/teacher/courses` that "Intro to Computing (demo)" and its three topics are
back. It re-seeds the demo and restores Prof. Demo A with that course and **two
classes** — "Computing - Tutorial Group A" with **six** students (s-01 to s-06) and
"Computing - Tutorial Group C" with **four** (s-09 to s-12) — plus the practice
history that fills the Analytics dashboard (`src/quiz/seed.js:97-140`, and the seeded
sessions/attempts at `src/quiz/seed.js:177-206`). Without one of these the roster is
two students and the Analytics page reads "No answers yet".

**A reseed takes `t-a` back from whoever owns it now** — it reverts any demo
password changed since the seed and overwrites the account's email — so it would
leave Ho Zhi Yang unable to sign in with his own login. It also **deletes every row
in the project** and cannot be undone. If it is going to be used, it needs **Ho Zhi
Yang's explicit nod first**, and the sign-in has to be re-checked afterwards.

---

## 1. How the team splits it

The Q&A is first (professor's rule 5), then the deck. **The live demo is not double counted:** the seconds in the beat table in §4 are apportioned to the member who owns the beat, and the demo block's time is the sum of those beats.

| # | Page | Who presents it | Seconds |
|---|---|---|---|
| — | **Q&A with the team at the front** | all six | 180 |
| 1 | The two links — the video and the live site | Marxel | 20 |
| 2 | Title and the team | Marxel | 25 |
| 3 | The problem | hand to Kai Cong | 45 |
| 4 | One app, four power-ups | hand to Xavier Lee | 50 |
| 5 | For professors — AI drafting, knowledge report, **configure questions** | Xavier Lee 30, then **hand to Jasper Wong** 60 | 90 |
| 6 | For professors — Analytics | hand to Ho Zhi Yang | 60 |
| 7 | For students — the quiz is a boss fight | hand to Kai Cong | 45 |
| 8 | For students — the difficulty engine, then My Progress | Xavier Lee 35, then **hand to Kai Cong** 35 | 70 |
| 9 | The game — the Kingdom | hand to William Hansel | 40 |
| 10 | The game — the Campfire Run | hand to William Hansel | 40 |
| — | *Transition into the live demo* | Marxel | 15 |
| — | **Live demo — beats D1 to D14** | the beat table in §4 — every beat has exactly one owner | 445 |
| 11 | The stack and the third-party credits | hand to William Hansel | 60 |
| 12 | Continue? | Marxel | 20 |
| 13 | Thank you and the QR code | Marxel | 15 |
| — | Closing: what each of us contributed | Marxel | 30 |
| | **Total** | | **1250 s = 20:50** |

**Check the arithmetic:** 595 s of pages and the transition + 445 s of live-demo beats + 30 s of closing = **1070 s = 17:50 of speaking**. Add the 180 s of Q&A at the front and the whole thing is **1250 s = 20:50**.

| Teammate | Pages they own | Page s | Live-demo beats they own | Beat s | Closing s | Total | Slot |
|---|---|---|---|---|---|---|---|
| Marxel Angelo Ramesh | 1, 2, 12, 13 (+ the transition) | 95 | D1, D2, D12, D14 | 155 | 30 | **280** | 4:40 |
| William Hansel | 9, 10, 11 | 140 | D5, D9, D10, D11 | 105 | — | **245** | 4:05 |
| Xavier Lee | 4, 5 (part), 8 (part) | 115 | D6, D8 | 50 | — | **165** | 2:45 |
| Kai Cong | 3, 7, 8 (part) | 125 | D7, D13 | 45 | — | **170** | 2:50 |
| Ho Zhi Yang | 6 | 60 | D4 | 45 | — | **105** | 1:45 |
| Jasper Wong | 5 (part) | 60 | D3 | 45 | — | **105** | 1:45 |
| **Total** | | **595** | | **445** | **30** | **1070** | **17:50** |

Every row is between 1:45 and 4:40. **Jasper's 1:45 and Zhi Yang's 1:45 are the shortest, and that is deliberate on both counts**: their features are a *screen* each — the Question bank and the Analytics dashboard — and the demo beat that proves the screen works is 45 s apiece, D3 and D4. **Marxel's 4:40 is the longest**, because he carries the two title pages, **the two longest beats in the demo** (D1 at 60 s and D2 at 25 s — his own features, class management and upload), **two of the three mandatory beats** (D12 and D14; D13 is Kai's, because it is the student progress screen at 575 px), the testing evidence and the closing. William is next at 4:05, with three pages of his own and four demo beats.

> **If Marxel's slot feels long, the cut list is in the same order for everyone.** Page 7 (−45 s) is Kai's student-overview page and page 12 (−20 s) is Marxel's closer — cutting both brings the whole thing to 20:50 − 65 s = **19:45**. **Cutting another member's page needs that member's nod** — the cut list is a proposal the team agrees in rehearsal, not something the presenter decides alone.

Hand-off discipline: the person being handed to starts their page's narration without a "next, over to you" preamble. The person handing over says one short bridge line, then stops talking. No page is handed back and forth.

Ownership this split follows: `knowledge/IS216 - Section 7 Prince William’s Quest.txt:95-119`.

| Teammate | Section 7 task | Pages |
|---|---|---|
| William Hansel | Gamification and rewards | 9, 10, 11 |
| Lee Zi Yang Xavier | AI question drafting and adaptive quiz sessions | 4, 5 (part), 8 (part) |
| Fang Kaicong | Student progress tracking and question reporting | 3, 7, 8 (part) |
| Marxel Angelo Ramesh | User accounts and class management, learning content upload | 1, 2, 12, 13 (+ the transition, and the closing) |
| Ho Zhi Yang | Professor analytics dashboard | 6 |
| Wong Kang Wei Jasper | Question bank management | 5 (part) |

**Two features have no page of their own, and both are Marxel's:** class management and learning-content upload. That is fine — the rubric's "working app" band is carried by the live demo, and Marxel demonstrates both in beats D1 and D2, the longest beats he owns, plus the testing evidence in D12. **Your two features are the ones the professor sees running**, not the ones you describe.

Running over? Cut in this order: (1) **page 7**, the student overview — 45 s; (2) **page 4**, the general overview — the one-sentence pitch can be said in 15 s instead, which saves 35 s; (3) **page 3**, the problem — also general, and the Q&A has already covered it — 45 s; (4) **page 12**, the closer — page 13 and the closing beat still land — 20 s. Cutting page 7 and page 12 takes the whole thing from 20:50 to **19:45**. **Never cut pages 5, 6, 8, 9, 10 or 11**: each one is a teammate's own feature, and page 11 carries the third-party identification the rubric asks for. **The live demo is not cuttable** — it carries the 27% "working app, correctly implemented and usable solution" criterion *and* the 18% "styling, including responsive design" band, and the two 575 px beats are the evidence for that second one.

**Pages 3, 4 and 7 belong to Kai and Xavier, so the first three cuts are a team decision, not the presenter's** — agree them in the rehearsal. If a member says his page stays, cut from further down the list instead. Pages 5 (Jasper), 6 (Zhi Yang), 8 (Kai and Xavier) and 9 to 11 (William) are not on the list for that reason.

---

## 2. The spoken words

Short, sayable sentences. No code, no file names unless you are pointing at the screen while saying them. Each block below says who says it; the Q&A has already happened by the time page 1 starts.

### Page 1 — the two links (3:00–3:20) — Marxel

**This page carries the video link and the deployed link, both in big text. Point at them.**

> "Before we start — our demo video is on this page: eleven minutes fifty-four seconds long, and public, so you can watch it after this. The app itself is live at quizquest-4phd.onrender.com. Everything we show you today is running at that address."

*(The video link has to be on **page 1** — it is the eLearn submission requirement. The packer verifies it by reading the PDF back, so if the link is missing from page 1 the zip will not build.)*

*(⚠️ **The length above was measured on the 5 Nov upload, before the background music was added.** A re-upload makes that number stale, and the rule is a hard **maximum of 12 minutes** — the old cut was six seconds. Re-measure the re-uploaded video and, if it is over 11:50, trim a few seconds of silence from the end rather than the narration. **Do not say "eleven fifty-four" in the room until you have measured the file you are actually pointing at.**)*

*(The deck's deployed link carries a `#test-accounts` fragment — say it as `quizquest-4phd.onrender.com`. And **do not click that link during the demo**: the fragment lands on the sign-in page with the demo-accounts panel open, and the rules say never show sign-in.)*

### Page 2 — title and the team (3:20–3:45) — Marxel

**This page carries all six names. Name the team.**

> "We're team Prince William's Quest. This is QuizQuest — turn any lecture into a quiz game your students actually want to play. I'm Marxel; with me are Kai, Xavier, Jasper, Zhi Yang and William. We've built one app with four power-ups, and we'll show you each one."

### Page 3 — the problem (3:45–4:30) — hand to Kai Cong

**This page has two columns: PROFESSORS and STUDENTS. Say both halves.**

> "Here's the problem we picked. On the professor's side: every week a lecturer gets a hundred slides and no time. Turning those slides into a quiz by hand takes hours, and what comes out is generic questions that don't match what was actually taught.
>
> On the student's side: they get the quiz, they get some wrong, and there's no reason to practise outside class — nothing pulls them back. Then the professor can't tell which topic went wrong, and the whole loop is slow. We're not replacing the professor's judgement — we're cutting the work around it, and giving the student a reason to come back."

*(Kai takes this one because the loop it describes is the loop his My Progress screen closes — and he shows it live in beat D7.)*

### Page 4 — one app, four power-ups (4:30–5:20) — hand to Xavier Lee

**The pitch line, in the form the rubric asks for ("Our app helps [who] to [do what] better because [how]"):**

> "Our app helps university professors to turn their own lecture material into a ready-to-use quiz faster, because it reads the slides, writes a report the professor edits, and drafts questions that only the professor can publish."

**Shorter variant — use this if the professor says "again, in one line":**

> "Our app helps professors get from slides to a published quiz in one sitting, because the AI only ever drafts from material the professor has already reviewed."

**Shortest, if you are running short:**

> "QuizQuest turns a professor's slides into a quiz their class can actually use."

Then walk the four cards on the page — AI question forge, adaptive practice, a real game, class analytics — one clause each, ten seconds apiece:

> "Those four are the four power-ups on this page: an AI question forge, adaptive practice, a real game, and class analytics. Each of us built one area, and between them they're the whole product."

*(The pitch line is Xavier's because the pipeline it describes — read, report, draft — is the one he built. Xavier keeps the floor for the AI half of page 5; Kai's half of the same page, page 7 and his half of page 8 are his own feature pages.)*

### Page 5 — for professors: AI drafting and the knowledge report (5:20–5:50) — Xavier Lee (continues from page 4)

> "The forge: drop in a lecture file — slides, a PDF, a document — and it writes one knowledge report from exactly the excerpts you attached, with the sources cited, and then drafts questions from that report and nothing else. You approve every question before it exists for a student."

*(If you have the seconds: the professor's own instructions, the subject guidance and the design guidance fill the gaps in the prompt; none of them overrides each other. And "regenerate" asks the model again with your complaint attached rather than re-running the same prompt.)*

### Page 5 — for professors: configure questions (5:50–6:50) — hand to Jasper Wong

**This half of the page is the "Configure questions" step of the authoring flow — Upload, Knowledge report, Edit & save, Configure questions, Generate, Review & publish.**

> "This is the step where the professor decides what the AI is allowed to produce. The topic and the learning outcome come from the material; the format is one of MCQ, True/False, Short Answer or Multi-select; the batch size is one to five; and focus keywords narrow it further. Then it generates, and everything it produces lands in the question bank — where it waits.
>
> That's my part of it. Nothing reaches a student until a professor has read it. I'll show you that gate live in a moment."

*(The **Needs review**, **To review** and **Approve & publish** strings are the live question-bank screen — they are not on this page. Say them at beat **D3**, where they are actually on screen.)*

### Page 6 — for professors: Analytics (6:50–7:50) — hand to Ho Zhi Yang

> "Know what didn't land, before the exam. This is first-attempt accuracy per topic, weakest first — so the top row is the topic that actually failed, not the one that went best. 'Needs attention' lists the few things worth acting on. Click a topic to focus it, and the whole thing prints."

*(Short answers arrive with a **provisional automatic mark** — the objective ones are marked outright, and a free-response answer is graded against the key points with a provisional mark the professor confirms or changes. Say "provisional", not "pre-marked": the slide's own wording is "Short answers arrive pre-marked", but the app's is "Free-response answers get a provisional automatic mark", and the professor is the one who decides.)*

### Page 7 — for students: the quiz is a boss fight (7:50–8:35) — hand to Kai Cong

> "On the student's side, every right answer is an attack on a boss. You see the health go down, you get the feedback and the explanation the moment the answer lands, and every session pays out coins and loot. It's the same quiz a lecturer would recognise — with a game attached to it.
>
> And if a question is marked wrong and you think that's wrong, you report it right there — it goes to the professor as a queue, not into the void."

*(The **Report a problem** button is on this page's screenshot — it belongs to this block, not to page 8.)*

### Page 8 — for students: the difficulty engine (8:35–9:10) — hand to Xavier Lee (from Kai, page 7)

> "The engine watches what you get wrong and shifts the mix. Level one is Explore — broad, across every topic. Level two is Target — about seventy percent general coverage and thirty percent on the topics you are weak in, serving up questions like the ones you missed and skipping the ones you just saw."

> "That's the number to remember: **seventy percent general, thirty percent weak**. It is not seventy percent of the questions you got wrong."

### Page 8 — for students: My Progress (9:10–9:45) — hand to Kai Cong

> "And here's where the student sees it. Per-topic indicators show what to practise next — the ones under the line are the ones worth your time."

### Page 9 — the game: the Kingdom (9:45–10:25) — hand to William Hansel

> "The Kingdom is where the coins go. The Library raises magic attack, the Workshop raises physical attack, the Garden feeds the campfire's health, and the Tower buffs the camp and carries the trade log. Your kingdom is what powers your hero in the co-op run."

### Page 10 — the game: the Campfire Run (10:25–11:05) — hand to William Hansel

> "The Campfire Run is the shared room — real-time, up to four players on one server. You pick your hero, your kingdom comes with you, and you hold the campfire together against the waves. That's the clearing behind this page."

### Transition into the live demo (11:05–11:20) — Marxel

> "Alright — let me show you it running. I'll take you through the class flow first, then each of us will show the screen they built."

### The blocks that used to be slides — they live in the demo now

**This deck has no page for class management, learning-content upload, per-class settings or
testing.** Their words move into the live-demo beats rather than being dropped. The left-hand
column names the **superseded 12-slide script's** real entries (`PRESENTATION_SLIDES.md`), so you
can check each one against that file:

| Used to be (12-slide script) | Now | Say it here |
|---|---|---|
| Slide 4a — class management (0:25) | **beat D1** | The join-code paragraph, at the end of beat D1 |
| Slide 4b — learning content upload (0:20) | **beat D2** | The upload paragraph, at the top of beat D2 |
| Slide 4a's tail — per-class settings and the class search | **beat D1** | The search-and-Settings line in §4 — it was never its own slide |
| Slide 11 — 575 px, the console and the tests (0:35) | **beats D12 and D13** | The 575 px narration in D12 and D13, the test counts at the end of D12 |
| Slide 10 — the stack in one line + the licences (0:50) | **page 11** | The stack line and the licence line, both on page 11 |
| Slide 12 — the repository and the live URL (0:15) | **beat D14** | The GitHub beat |
| Slide 6's "who built what" tail | **the closing** | The closing beat, §6 |

### The testing paragraph — it moves to beat D12

**There is no testing page in this deck, so the numbers are spoken in the live demo, at beat D12**
(absolute time **17:15–18:00**), where the console is already open and empty. Say it there, word for word:

> "On testing: forty-six end-to-end tests across nineteen spec files, forty-four Node test files, five browser suites and thirteen unit spec files — each end-to-end test drives a real browser against a real server. And one rule the code enforces: a join code is never written to the database file, only its hash."

*(Fifty-two words, about twenty seconds. The list of what each end-to-end test drives — create a class, generate a code, redeem it, revoke it, archive it, enrol by email, publish a question — was cut from the spoken line so the paragraph fits its beat; keep it for Q&A instead: "Each one drives a real browser against a real server — create a class, generate a code, redeem it, revoke it, archive it, enrol by email, publish a question.")*

*(46 tests / 19 spec files on `origin/main` @ `7d8cacf`: `git ls-tree -r origin/main --name-only -- e2e | grep -c 'spec\.js$'` counts the files and `grep -cE "^[[:space:]]*test(\.(only|skip|fixme))?\s*\(\s*['\"\`]"` across those specs counts the tests. Eighteen of those specs and forty-three of those tests are the app itself; the nineteenth spec is the sign-up flow, which the rules call plumbing, not a feature. Node: `git ls-tree -r origin/main -- test` — 44 files matching the `test/*-test.js` glob `pnpm test` runs, and the runner reports 462 cases with 461 passing and 1 skipped. Browser: the 5 files `test/browser*.test.cjs` that `pnpm test:browser` runs. Unit: the 13 `*.spec.js` files — 11 under `web/src` and 2 under `src/quiz`. The same figures are in `QA_PREP.md`.)*

### Page 11 — the stack and the third-party credits (18:45–19:45) — hand to William Hansel

> "On the stack, and this page has it: Vue 3 and Vite on the front, pdf.js for reading your lecture files; Node.js on the back with Socket.IO for the live co-op and Supabase as the store; Gemini 3.5 Flash-Lite for the drafting; Playwright and Vitest for the tests.
>
> On third-party code: the README has every library in a table with its licence, and here they are by name. **MIT** for Vue, Vite, Socket.IO, axios, Supabase, Bootstrap, fflate and the test tooling; **Apache 2.0** for pdf.js, Playwright and PGlite; **OFL 1.1** for the fonts — Nunito, Pixelify Sans and Fredoka; and the game icons from game-icons.net are **CC BY 3.0**, with every icon's author named. Gemini and Resend are APIs we call server-side, and Node.js is the runtime — none of those is a package we ship. Our own art is credited too. We haven't presented anyone else's work as ours."

**⚠️ Two rubric points this deck no longer puts on a page — say them out loud:**

**1. The licences are named on page 11, not shown.** The rule is "third-party libraries must be **identified** in the presentation" — the words above have to be said, **including the licence names**: MIT, Apache 2.0, OFL 1.1 and CC BY 3.0. Saying "the README has them all" is **not** enough. Be precise about where each one is credited, because the README splits them: the **libraries table** (`README.md:202-220`) covers Vue, Vite, @vitejs/plugin-vue, Socket.IO, socket.io-client, axios, @supabase/supabase-js, Bootstrap, pdf.js, fflate, Fontsource, Playwright, PGlite, Vitest, jsdom and @vue/test-utils; the **art and icons section** (`README.md:176-200`) covers game-icons.net (CC BY 3.0), the fonts (OFL 1.1) and the team's own art; and **Gemini, Resend and Node.js are not in the third-party section at all** — Gemini and Resend are APIs we call server-side and Node.js is the runtime. Both sections are in the submission zip.

**2. There is no testing page in this deck.** The testing numbers are spoken at beat **D12**, in the block above — see §4. "How do you know it works" is a rubric line; do not leave it out.

*(The library list and every licence are in `README.md:202-220` — the table under "### Libraries" in the README that ships in the zip. The BM25 ranking note sits just below it at `README.md:222-224`. **The zip's README and the repository's `README.md` are the same file**, so these line numbers are right for both. The README in `origin/main` still has the older numbering until this branch merges — do not read the numbers off the deployed site.)*

### Page 12 — Continue? (19:45–20:05) — Marxel

> "Turn revision into a quest worth playing. Students get a game they actually come back to; professors see exactly what to teach next.
>
> And the footer is honest: this is a working prototype with synthetic demo data only."

### Page 13 — thank you and the QR code (20:05–20:20) — Marxel

> "That's us. The QR code is the app — scan it and you're in. Thank you."

*(Leave this page up as the last thing on screen. The formal Q&A round is already over — it happened at the front.)*

### Closing 30 seconds — what each of us contributed (20:20–20:50)

Say this as one breath, no page-reading. **Word-for-word:**

> "William built the game — Kingdom, Summon, the Campfire Run lobby. Xavier built the AI drafting and the adaptive sessions. Kai built progress tracking and the report-a-problem loop. Zhi Yang built the Analytics dashboard. Jasper built the Question bank, where nothing reaches a student until a professor approves it. And I built class management and upload — classes, join codes, the roster.
>
> One thing we all agree on: no question reaches a student until a professor has read it. That's the whole product."

*(**Eighty-three words, thirty seconds — that is a brisk pace and it is the reason the old, longer paragraph was cut.** Do not add to it. If you are running late, say only the second paragraph — "One thing we all agree on: no question reaches a student until a professor has read it. That's the whole product." — and stop; the six clauses are context, that line is the point.)*

*(Ownership per `knowledge/IS216 - Section 7 Prince William’s Quest.txt:95-119`; each item above is a flow that is scripted and green — `e2e/kingdom-build.spec.js`, `e2e/summon.spec.js`, `e2e/team-room.spec.js`, `e2e/progress-reporting.spec.js`, `e2e/to-review.spec.js`, `e2e/teacher-views.spec.js`, `e2e/question-bank.spec.js`, `e2e/class-management.spec.js`, `e2e/join-class.spec.js`, `e2e/professor-enrol.spec.js`.)*

If you are asked "what did you personally write", the answer for Marxel is: **class management, the join codes, the roster and enrolment, the per-class settings API and the move of those settings into the class page, and the browser-side extraction of PPTX, DOCX and PDF into text.**

---

## 3. The whole deck, page by page

"Headline" is the big line on the page. "Narration" is the one line you actually say. Times are cumulative from 0:00, and 0:00 is the **start of the Q&A**.

| # | Headline on the page | One line of narration | Who says it | Time |
|---|---|---|---|---|
| — | **Q&A with the team at the front** | All six stand at the front and answer before anything is shown. | all six | 0:00–3:00 |
| 1 | The video link and the deployed link | The video is on this page, and the app is live at quizquest-4phd.onrender.com. | Marxel | 3:00–3:20 |
| 2 | QuizQuest — turn any lecture into a quiz game | We are team Prince William's Quest, and this is QuizQuest. | Marxel | 3:20–3:45 |
| 3 | The problem — studying is a grind, teaching is guesswork | Kai: a lecturer turns slides into a quiz by hand, and the questions stop matching what was taught. | hand to Kai Cong | 3:45–4:30 |
| 4 | One app, four power-ups | Xavier: our app helps university professors to turn their own lecture material into a ready-to-use quiz faster. | hand to Xavier Lee | 4:30–5:20 |
| 5 | For professors — AI drafting, knowledge report, configure questions | Xavier: it writes one report from exactly your excerpts and drafts from that report only. Jasper: nothing reaches a student until a professor presses Approve & publish. | Xavier Lee 30, then hand to Jasper Wong 60 | 5:20–6:50 |
| 6 | For professors — Analytics | Zhi Yang: first-attempt accuracy per topic, weakest first, so the first row is the topic that actually failed. | hand to Ho Zhi Yang | 6:50–7:50 |
| 7 | For students — every right answer is a hero attack | Kai: the quiz is a boss fight, with the feedback and the explanation the moment the answer lands. | hand to Kai Cong | 7:50–8:35 |
| 8 | For students — the difficulty engine, then My Progress | Xavier: about seventy percent general coverage and thirty percent on the weak topics. Kai: per-topic indicators show the student what to practise next. | Xavier Lee 35, then hand to Kai Cong 35 | 8:35–9:45 |
| 9 | The game — the Kingdom | William: Library, Workshop, Garden and Tower — the buildings the coins go into. | hand to William Hansel | 9:45–10:25 |
| 10 | The game — the Campfire Run | William: real-time co-op for up to four players, and your kingdom powers up your hero. | hand to William Hansel | 10:25–11:05 |
| — | *Transition* | Marxel opens the app: "let me show you it running." | Marxel | 11:05–11:20 |
| — | **Live demo** | Marxel opens the app; the seven student steps run in the agreed order, then the 575 px, testing and GitHub beats — **Kai takes the student-side 575 px beat, D13**, because it is his screen. The testing numbers are spoken at beat D12. | Marxel + team | 11:20–18:45 |
| 11 | The stack — Vue 3, Vite, pdf.js, Node.js, Socket.IO, Supabase, Gemini 3.5 Flash-Lite, Playwright + Vitest | William: MIT for Vue, Vite, Socket.IO, axios, Supabase, Bootstrap, fflate and the test tooling; Apache 2.0 for pdf.js, Playwright and PGlite; OFL 1.1 for the fonts; CC BY 3.0 for the game icons — **and Gemini, Resend and Node.js are not packages we ship.** | hand to William Hansel | 18:45–19:45 |
| 12 | Continue? | Marxel: turn revision into a quest worth playing. | Marxel | 19:45–20:05 |
| 13 | Thank you — the QR code | Marxel: scan it and you're in. | Marxel | 20:05–20:20 |
| — | Closing: what each of us contributed | Marxel: one clause each, then the line that is the point of the whole app. | Marxel | 20:20–20:50 |

The demo's 7:25 is the **sum of the fourteen beats in §4** — the seconds are apportioned to the member who owns each beat, so the demo is not counted twice. Pages 1, 2, 12, 13 and the closing are **Marxel's**. Pages 3, 4, 7 and 8-part are **Kai's and Xavier's**; page 5 is **Xavier's and Jasper's**; page 6 is **Ho Zhi Yang's**; pages 9, 10 and 11 are **William's**.

---

## 4. The live-demo moment (7:25)

Everything below happens with the app already signed in. **The sign-in page must never appear on the projector.** The demo runs as **one block between page 10 and page 11** — this deck has no demo page, so Marxel's transition line at the end of page 10 is what starts it.

### Before you press start (not part of the 7:25)

- Sign the professor in in the tab you will present from — `prof.b@quizquest.demo` (Prof. Demo B). **After the data move (§0) that account owns "Intro to Computing (demo)", the two Computing classes, the question bank and the analytics.** If you reseeded instead, that account is `prof.a@quizquest.demo` — check `GET /api/teacher/courses` before the room, because the seed decides which one works.
- **The password is `quizquest`, and it is published on purpose** — it sits in the README's **Demo sign-in** table (`README.md:50-57`) and in the submission zip, because the professor is meant to be able to sign in and try the app. There is nothing to hide and nothing to read aloud; rule 13 below is about not *reading a credential off the screen*, not about this password.
- Sign a **student** in in a second tab — `student02@quizquest.demo`. That student is on "Computing - Tutorial Group A", carries the seeded practice history, so My progress has real numbers and Networking basics is the weak topic. The seven student steps all happen in that tab.
- If you can, sign a **second student** in a third tab — the Campfire Run lobby needs two players to be worth showing.
- Put **one lecture file** on the Desktop for beat D2 — `week3-networking.txt` with three or four lines of lecture notes is enough, and a `.pptx` is better if you have one. The importer takes `.pdf`, `.pptx`, `.docx`, `.txt`, `.md` and `.csv`.
- Open the GitHub repository `github.com/whansel007/QuizQuest` in a **separate browser tab** (mandatory beat D14). Signing in is per tab, so the app tabs keep their sessions.
- Open DevTools, dock it to the right and leave the **Console** tab selected — but leave the device toolbar **switched off** (desktop width). You engage the 575 px viewport yourself, live, at beat D12.
- Turn the sound off **before you sign in**, in **both** app tabs: in that tab's console run `localStorage.setItem('hero-lab-settings', JSON.stringify({ muted: true }))` and **reload the tab**. The setting is read **once, when the app loads** (`web/src/sound.js:17,28`), so the reload is required or the mute does not take. (The on-screen mute button only exists on the student header — `web/src/App.vue:202` — and the professor's screens have no mute button of their own.)
- Wake the Render instance before you start — the free instance sleeps and the first request can take the best part of a minute.

### Order, length and words

Beats D5 to D11 are the seven steps of the team's agreed running order (William's plan, 3 Nov), in that order, each with exactly one owner. D1 to D4 are the professor's half, D12 to D14 are the proof.

| Beat | Time | Owner | What you do — what the audience sees | What you say |
|---|---|---|---|---|
| **D1** | 0:00–1:00 | Marxel | Land on **Classes & Roster**. DevTools is docked right with the **Console** tab open and empty — no errors, no warnings. One slow scroll of the class grid. Type one class name into **Search classes by name or course**. Press **+ Create Class** → the "Create New Class Group" modal → pick the course, type a real class name → **Create Class**. The app opens the new class. Then **Manage Roster & Codes →** → sub-tab **Join Codes (N)** → **+ Generate Join Code** → **Generate Code** (take the defaults) → the green banner appears with the code. Back on the grid, press **Settings** on the class card → the **Class Settings** sub-tab opens. Point at **Rename**. **Optional, only if you are ahead of the clock:** tick **Show archived classes** on the grid and point at the counter changing. | "This is the professor's home screen. Every class is a card, with the student and join-code counts on it, and you can search by class name or course. Create a class, and it opens straight into that class. Now the join code: twelve random characters after a fixed prefix, shown exactly once, because we only keep a hash. If it leaks I revoke it and generate another — I can't read the old one back out of the database. And Settings is on the class card itself: the trading switch, the analytics time zone and the trade log." |
| **D2** | 1:00–1:25 | Marxel | On the professor side, open the material import for **Intro to Computing (demo)** and drop in the lecture file — use the `.pptx` if you have one, otherwise `week3-networking.txt` works identically (the importer takes `.pdf`, `.pptx`, `.docx`, `.txt`, `.md` and `.csv`; a few paragraphs of lecture text is enough). Tick **This is authorised course material without student personal data.**, press **Upload files**. The text lands in the material library. Point at the passage row's **Edit metadata** and **Archive passage** — do not click them, the upload is the point of this beat. | "Upload: the file is read in my browser, not on our server. Nothing leaves the page until I tick the confirmation and press Upload files — the server only ever receives text. It lands in the material library, where I can retitle it, change the topic, or archive it and bring it back." |
| **D3** | 1:25–2:10 | Jasper Wong | Open **Question bank** for **Intro to Computing (demo)**. The status tabs read **Needs review**, **Reported**, **Published**, **Withdrawn**, **Rejected**. Open the seeded draft under **Networking basics** — read the stem and its source — and point at **Approve & publish**. **Do not press it:** publishing is a one-way door, the draft leaves Needs review for good, and the demo is rehearsed on the live data. Then click the **Reported** tab: one student reported a question they thought was wrong. Open it and read their reason. | "Nothing reaches a student until a professor approves it. Here is a drafted question sitting in Needs review — I read the stem, the answer and the source, and Approve & publish is right here. I don't press it live, because I want to run this demo again tomorrow. And this is the other end of the same loop: a student reported a question they thought was wrong, and it came to me to answer." |
| **D4** | 2:10–2:55 | Ho Zhi Yang | Open **Analytics**. The topic table is weakest first. Show **Needs attention**, click a topic to focus it, then press **Print report**. | "First-attempt accuracy per topic, weakest first — so the first row is the topic that actually failed. Needs attention lists the few things worth acting on, and the whole thing prints." |
| **D5** | 2:55–3:20 | William Hansel | Switch to the student tab. **Kingdom**. The brief cards — **Welcome home!**, **Four buildings**, **Getting around** — and the castle in the middle with a building on each side. | "This is the Kingdom. The castle in the middle is home, and it grows as your town does. Four buildings around it: Garden to the north, Tower to the south, Library to the west, Workshop to the east." |
| **D6** | 3:20–3:45 | Xavier Lee | **Quiz**. Under **TOPICS TO PRACTISE** press **Select all**, then **Start practice**. The first question arrives. | "Select all topics and start. Every topic in the course is in the pool, and the engine decides which ones you need most." |
| **D7** | 3:45–4:10 | Kai Cong | **My Progress**. **Your practice indicator**, and under it **Worth practising next:** the topic names. Then **Topics** with the accuracy per topic, and **Recent sessions**. | "This is the student's own view. The indicator names the topics worth practising next — the ones under the accuracy line — and here is every topic with its accuracy and my recent sessions." |
| **D8** | 4:10–4:35 | Xavier Lee | Back to **Quiz**. Press **Select none**, tick only the weak topic, then **Start practice**. | "Now the same quiz with only the weak topic ticked — you pick the topic and every question comes from it. Left to itself the engine mixes about seventy percent general coverage with thirty percent on what you got wrong, which was the difficulty-engine page." |
| **D9** | 4:35–5:00 | William Hansel | **Summon**. The pull buttons — **Summon ×1** with the coin cost beside it. Press it; the reveal lands on a hero with its rarity stars. | "Summon — one pull for coins. The stars under the name are the rarity, and every pull is logged, so the journal shows the coin history." |
| **D10** | 5:00–5:30 | William Hansel | Back on **Kingdom**. Walk with WASD to a building, press **E** to open it, then **Upgrade** with the resource cost beside it. Press **Z** for the emote wheel and pick one. Walk up to a hero and press **E** to greet. | "Buildings upgrade with the resources you earn — wood, crystal and herbs — and the castle grows with them. Press Z for emotes, and E beside a hero to greet." |
| **D11** | 5:30–5:55 | William Hansel | **Campfire Run**. Choose an adventurer, press **HOST LOBBY**, show the four-character room code, then join from the second student tab. | "Campfire Run is the shared room: pick your hero, host or join with the room code, and two students are in one lobby on one server." |
| **D12** | 5:55–6:40 | Marxel | **MANDATORY BEAT A — DevTools.** On the professor tab, **toggle the device toolbar on and set it to 575 px**, Console tab visible. Show the class grid reflowing to one column and the professor sidebar collapsing into the top bar (below 992 px it opens as a drawer from the menu button). The console stays clean the whole time. **Then the testing paragraph — this deck has no testing page, so the numbers are spoken here.** | "Now the responsive check. At 575 pixels — the extra-small breakpoint — the class grid collapses to a single column and the professor sidebar collapses into the top bar. The console is open the whole time and it is empty: no errors, no warnings." **Then, word for word, the testing paragraph in §2:** "On testing: forty-six end-to-end tests across nineteen spec files, forty-four Node test files, five browser suites and thirteen unit spec files — each end-to-end test drives a real browser against a real server. And one rule the code enforces: a join code is never written to the database file, only its hash." |
| **D13** | 6:40–7:00 | Kai Cong | On the student tab, open that tab's own DevTools, toggle its device toolbar on at **575 px**, the **Console** visible. Show **My Progress** stacking into one column. The console stays empty. | "The student side at the same width. The progress page stacks into a single column, and the console is still empty." |
| **D14** | 7:00–7:25 | Marxel | **MANDATORY BEAT B — GitHub.** Switch to the GitHub tab. Show the repo page: the README on page one with the deployed-app URL, the folders, the recent commit history. **Scroll past the Demo sign-in section — do not linger on it.** | "And this is the repository. The README has the deployed-app URL on page one, the setup and run instructions, the test instructions and the third-party credits. Every commit is there with who wrote it." |

### The class search box — the one thing that depends on the bundle

The search box and the **Class Settings** tab are live (PR #51 merged 3 Nov 2026; the live bundle carries them — §0), so beat D1 plays the search-and-Settings clicks: type a class name in **Search classes by name or course**, press **Settings** on the class card, and land on the **Class Settings** sub-tab. Confirm the bundle hash on the day (§0): if `Class settings` comes back 0, you are on an older build and you use the fallback below.

**The line for it is already inside D1's script** — *"And Settings is on the class card itself: the trading switch, the analytics time zone and the trade log."* Do not add a second sentence on top of it: D1 is a full sixty seconds and it also carries the create-class and join-code clicks.

**Fallback — only if the day-of bundle grep returns 0:** skip the search-and-Settings clicks **and the last sentence of D1's script**, and say this instead. Do not pretend the buttons exist:

> "The newest thing I've done is merged into the main branch and deployed, but what you're seeing here is an older build. I've moved the trading switch, the analytics time zone and the trade log off the Settings page and onto each class's own Class Settings tab, and I've added a search box on the class grid so you can find the class by name. That's PR 51 — it's in main — but what you're seeing here is the before picture. The after picture is in the README, and the change is in main."

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
5. Do not say "70% of your questions were the ones you got wrong". The app is about **70% general coverage and 30% focused on weak topics** (`src/quiz/adaptive.js:19`; the app's own copy says the same, and so does page 8 of the deck). Getting this backwards is an easy catch.
6. Do not take questions at the end. **Q&A is at the front, before the demo** — do not hold questions back to the end of the deck.
7. Do not claim the per-class settings move is still on a branch, or still waiting for a deploy. It is merged into `main` as PR 51 **and it is live** (§0) — the live bundle carries the class search box and the Class Settings tab. **But the deployed instance does not automatically track `main`**: as of 5 Nov the live bundle and a fresh `main` build are different builds (§0), so a redeploy is still pending. Say the feature is live; do not say the site is on the latest code.
8. Do not promise a feature you have not confirmed on the live site. The class search box and the Class Settings tab **are** live (§0) — but **check the bundle hash on the day** (§0) and never assert a build you have not confirmed yourself.
9. Do not claim the deployed site is up to date with `main`. As of 5 Nov 2026 the live bundle and a fresh `main` build are **different builds** (§0). If William has not redeployed, the honest line is: *"the deployed instance is running an earlier build; the code you're seeing is on `main`, and the redeploy is happening before Monday."*

**From what we verified in the code:**

10. Do not show a raid boss. There is no raid screen in the shipped app — the Campfire Run tab is the arena, and the raid is exercised only at the socket level (`e2e/raid-boss.spec.js:7-12`). If asked, the honest line is "the raid is a shared-server mechanic behind the Campfire Run lobby".
11. Do not narrate the old tab names. On screen they are **Kingdom, Quiz, My Progress, Campfire Run, Summon** and, for professors, **Analytics, To review, Classes & Roster, Question bank, AI drafting, Evaluation, Settings** (`web/src/App.vue:29-32`).
12. Do not restart the deployed app. The brief says to leave it running and not restart unless the teaching team contacts you.
13. Do not read a credential aloud from the screen. The professor account is a seeded demo account; the password lives in the group chat.
14. Do not present third-party code as ours. The rubric requires third-party libraries to be identified in the presentation and in code comments (`README.md:171-224` credits them; page 11 names them — say the licence line out loud).

---

## 6. Closing beat — what each of us contributed (30 seconds)

The closing is the **end of the presentation** (20:20–20:50). The Q&A is at the front, not here — this beat is the last thing the room hears. Page 11 is William's — he finishes the stack, and the page ends; you take the closing from there.

The full script is in §2 under "Closing 30 seconds". It is one paragraph, six clauses, one per member, then one line that is the point of the whole app:

> "William built the game — Kingdom, Summon, the Campfire Run lobby. Xavier built the AI drafting and the adaptive sessions. Kai built progress tracking and the report-a-problem loop. Zhi Yang built the Analytics dashboard. Jasper built the Question bank, where nothing reaches a student until a professor approves it. And I built class management and upload — classes, join codes, the roster.
>
> One thing we all agree on: no question reaches a student until a professor has read it. That's the whole product."

*(**Eighty-three words, thirty seconds — that is a brisk pace and it is the reason the old, longer paragraph was cut.** Do not add to it. If you are running late, say only the second paragraph — "One thing we all agree on: no question reaches a student until a professor has read it. That's the whole product." — and stop; the six clauses are context, that line is the point.)*

Honesty rules for this beat: claim only what is in Section 7, and only the flow each person actually built. Every item above is backed by a green scripted test, so a "show me" request is always answerable. If someone asks about the sign-up role selector Jasper added, say: "That's Jasper's, on the sign-up page — and we count that as plumbing, not a feature."

---

## 7. Rehearsal checklist

### Three passes, in this order

| When | Length | What you rehearse | Pass condition |
|---|---|---|---|
| Day before, evening | 25 min | The whole deck out loud, no stopping, no notes except this file. Time it. | **10:00 or under** — the page budget is 595 s = 9:55, and the whole speaking block (pages + demo beats + closing) has to fit **17:50**. If the deck runs over 10:00, cut in the order in §1: page 7 first, then page 4, page 3 and page 12 — and agree those cuts with the member whose page it is. |
| Day before, evening | 20 min | The demo only, **twice** in a row: D1→D11 — class management and upload, then the seven student steps in the agreed order — then the two 575 px beats (D12 carries the testing paragraph), then the GitHub beat. Two runs of a 7:25 demo is 14:50 of the 20:00 slot. Use the real app at the live URL — the class-settings change is merged and deployed. | You can do D3 and D6 without looking at the script. **A third run needs 22:15 — do it only if you have the time, not instead of the two.** |
| Morning of | 10 min | Pages 1, 2 and 3 only, standing up, then the demo once, end to end. | The first three pages come out cold, and you know the demo fits in 7:25. |

Rehearse in the order the room hears it: the **Q&A answers first** — they open the session, because the professor's rule 5 puts Q&A at the front — then the **pages**, then the **live demo beats**, then the **closing line**.

### Pre-flight on the day (do these in order, 20 minutes before)

- [ ] **Confirm the slot and the room.** The presentation is **Monday 16 Nov 2026**; the make-up slot is **Monday 23 Nov 2026**. Check the time and the venue with the teaching team before the room.
- [ ] **Data check — do this before Friday 6 Nov, not on the day.** You need more than one class, a roster with students in it, **and a draft in the Question bank** — beat D3 has nothing to point at without it. **Preferred:** move the "Intro to Computing (demo)" course and its two classes from `t-a` to `t-b` — the material is already on the live project, `t-b` still works, and this is a reversible **data** change that takes nobody's login away. **Do it in the Supabase SQL editor** — the script older drafts of this file named cannot move courses or classes, it only rewrites one field on the `t-a` user row: `UPDATE courses SET teacher_ids = '["t-b"]' WHERE id = 'c-comp';` and `UPDATE classes SET teacher_ids = '["t-b"]' WHERE id IN ('cl-a','cl-c');`. **Heavier alternative:** `pnpm db:reset --confirm` is a **local** script, not a remote one: run it from a machine that has the live project's `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env`, with the Render service stopped, then redeploy so the server reloads the reseeded data. A reseed **deletes every row** and takes `t-a` back from whoever owns it now — that is Ho Zhi Yang's own account — so it needs **his** nod first, and the sign-in has to be re-checked afterwards.
- [ ] **Confirm which professor account you are signed in as**, and open `GET /api/teacher/courses` to see which course it lists. **After the data move, `prof.b@quizquest.demo` is the account that works and it should list both courses** — "Intro to Computing (demo)" with its three topics and the two Computing classes, and "Intro to Statistics (demo)". **After a reseed instead, the account is `prof.a@quizquest.demo`**, which owns the Computing course and the two Computing classes. Check it before the room, not in front of the class.
- [ ] **Check the live app URL on the README's page one** — `https://quizquest-4phd.onrender.com`. Open it in a **fresh tab**, sign in, and confirm you land on **Classes & Roster** — a fresh tab lands on the sign-in page first, that is expected. If it 404s or shows the old build, stop and fix it before the room.
- [ ] **Put one lecture file on the Desktop for beat D2** — `week3-networking.txt` with three or four lines of lecture notes is enough, and a `.pptx` is better if you have one. The importer takes `.pdf`, `.pptx`, `.docx`, `.txt`, `.md` and `.csv`.
- [ ] Wake the instance: open the site several minutes early. The free instance sleeps.
- [ ] Sign the professor in, land on Classes & Roster, then **leave the tab there**.
- [ ] Open the GitHub tab: `github.com/whansel007/QuizQuest`.
- [ ] Open DevTools, dock it to the right and leave the **Console** tab selected — but leave the device toolbar **switched off** (desktop width). You engage the 575 px viewport yourself, live, at beat D12. Confirm the console is empty on the class page.
- [ ] **Confirm the live build before you walk in:** `curl -s https://quizquest-4phd.onrender.com/ | grep -o '/assets/index-[^"]*\.js'`, then grep that bundle for `Class settings`. One or two hits = the class-settings build is live, so D1 plays the search-and-Settings clicks; zero hits = an older build, so you use the fallback line in §4. **The hash changes whenever Render redeploys, so re-run it on the day.** As of 5 Nov the live bundle and a fresh `main` build differ — **ask William whether the redeploy has landed**, and if it has, take the fresh hash with you.
- [ ] **Check the published video before you present.** The rule is **max 12 minutes, at least 720p**. Verified 5 Nov: `https://youtu.be/A6CSirXZbDQ` is **11:54** long (714 s) and the file carries **720p and 1080p** — both rules pass, but **only by six seconds**, so re-check the length if anyone re-uploads it. It is **public**, not unlisted, and the title is "WAD2 Project - QuizQuest". **Say the link on page 1, but do not click the deck's deployed link** — it carries `#test-accounts` and lands on the sign-in screen.
- [ ] **⚠️ The video is being re-uploaded with background music — re-measure it.** The 11:54 above is the **5 Nov, pre-music** measurement. A music bed can push a video over the cap, and the headroom is only **six seconds**. When the new upload lands, check the length and the resolution again: **max 12 minutes, at least 720p**. If it now runs over 12:00, say the new length out loud on page 1 or ask William to trim the music. **Do not say "eleven fifty-four" in the room until you have measured the file you are actually pointing at.**
- [ ] **Put Kai's deck on the projector as the PDF**, at page 1, and check that the video link and the deployed link are both readable on page 1. The file is `knowledge/IS216_G1_T7_QuizQuest/FOR SUBMISSION/QuizQuest Project slides.pdf` and it is in the submission zip.
- [ ] **Turn the sound off before you sign in**, in **both** app tabs: in that tab's console run `localStorage.setItem('hero-lab-settings', JSON.stringify({ muted: true }))` and **reload the tab**. The setting is read **once, when the app loads** (`web/src/sound.js:17,28`), so without the reload the mute does not take. (The on-screen mute button only exists on the student header — `web/src/App.vue:202` — and the professor's screens have no mute button of their own.) Turn off the browser's "offer to save passwords" popup. Close every other tab and app that can steal focus.
- [ ] Zoom 100%, window maximised, 1920×1080.
- [ ] Rehearse the Q&A answers below once each, out loud.

### The six questions you must be able to answer in one sentence each

1. **"Where did the per-class settings go?"** — "They were moved out of the Settings page into the class's own page. That's PR 51, it's merged into main, and I confirmed it on the deployed bundle."
2. **"Why does a join code look like that?"** — "Twelve random characters after a fixed QQ- prefix, drawn from a 32-symbol alphabet by a cryptographically secure random source — about 1.15 × 10¹⁸ combinations — and only a hash is stored, so the code is shown once and can't be read back out of the database."
3. **"Is the AI allowed to publish a question?"** — "No. Drafts sit in the Question bank under Needs review until a professor presses Approve & publish."
4. **"What did you use AI/LLM for?"** — Name the parts: boilerplate and scaffolding, the synthetic demo data, refactoring help, and the report/question prompts written by Xavier against the professor's own material. The disclosure is in the README's **Use of AI tools** section, and that README **is in the submission zip**: AI generated skeleton code and the synthetic demo data; the team reviewed, adapted and tested all of it and owns it; the visual direction, the gameplay design and the character sprites are the team's own, with AI only helping to remove a background colour. **⚠️ Do not promise a per-member table — it does not exist yet.** The draft is `knowledge/README.txt`, which is git-ignored and does not ship. If the professor asks for the per-member breakdown, say: *"The disclosure is in the README today, and the per-member breakdown is being finalised with the team — I'll send it after the session."*
5. **"How do you know it works?"** — "Forty-six end-to-end tests across nineteen spec files drive a real browser against a real server, on top of forty-four Node test files, five browser suites and thirteen unit spec files — including a test that asserts a join code is never written to the database file."
6. **"Which third-party libraries did you use, and are they credited?"** — "Every one we ship is in the README's third-party section with its licence: MIT for Vue, Vite, Socket.IO, axios, Supabase, Bootstrap, fflate and the test tooling, Apache 2.0 for pdf.js, Playwright and PGlite, OFL 1.1 for the fonts, and CC BY 3.0 for the game icons — with every icon's author named."

### Q&A framing

Everyone stands at the front for Q&A ("Q&A with each team at the front"). The rubric gives Q&A 5% on its own, but an unclear answer drags the 20% "The presentation" and the 27% "Working app" components with it — so answer briefly, in one sentence, and say "that's my part" so the owner picks it up.

If you don't know: say "I'd have to check the code, and I'd rather do that than guess." Then check it after and answer in writing. That reads as competence, not as a gap.
