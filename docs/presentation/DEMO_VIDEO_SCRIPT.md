# QuizQuest — Demo Video Recording Script

**Deliverable:** the demo video linked on slide 1 of the slides and uploaded inside the "Final Project Deliverables" zip.
**Format the brief requires:** maximum 12 minutes, at least 720p (ideally 1080p), uploaded to YouTube as **unlisted or public** (Briefing p03). This script lands at **4:24**, so there is room to breathe.
**Never in frame:** login, sign-up, registration, password entry, the "Test accounts" page, or any credential. Sign in before you press record (Q&A p11 rule 2 and rule 3: *"DO NOT demo about log-in/out, user registration functions"*).
**Narration rule:** describe the app and the user's journey. No file names, no code, no API names.

Everything below was checked against the code and against the live deployment on **3 Nov 2026**. Where a claim could be checked, the source is cited inline.

---

## ⚠️ First: the six-segment arithmetic

The plan in the group chat on 3–4 Nov 2026 was for **each of the six to film their
own segment** — Xavier's is cut to 4:40, Ho Zhi Yang's professor walkthrough is
4:40, William is aiming for about 4:00 — and for those to be edited into **one**
video. That is the right shape: the brief asks for *a* video, and slide 1 has to
carry that one link. But the arithmetic has to be settled **before** everyone
finishes recording:

| | |
|---|---|
| Six segments at 4:40 | **28:00** |
| The brief's cap (Briefing p03) | **12:00** |
| So each segment has to average | **2:00** |

There are only two ways this lands:

1. **Get the extension in writing.** Xavier is already asking the professor for
   two more minutes. If the professor grants it, six segments at 4:40 fit a
   ~30-minute video and **nothing has to be re-cut**. Ask now, and get the
   answer in writing — an oral "yeah it's fine" is not worth much on 13 Nov.
2. **Cut each segment to about 1:50.** Six × 1:50 = 11:40, which leaves room for
   the end card and stays inside 12:00. **This is the plan this file's shot list
   is already built for**: the 18 shots below are sized to land a single 4:24
   video, and every shot is tagged with the member who owns it, so each person
   films their two or three shots and the editor stitches them.

**What must not happen:** six separate 4-minute videos with six links and no
single video to put on slide 1. The brief asks for one video, and
`pnpm submit --video-link "<url>"` checks that slide 1 carries exactly that link.

If option 2 is chosen, the practical instruction to the group is: **film your
own shots from the table in section 4, and do not narrate the joins.** The
running order is already fixed by the table, so the editor needs no extra
narration between segments.

---

## 0. Facts of record (check these the day you film, not from memory)

| Thing | State on 3 Nov 2026 | How to re-check |
|---|---|---|
| Live URL | `https://quizquest-4phd.onrender.com` — answers 200 | `curl -s -o /dev/null -w "%{http_code}" https://quizquest-4phd.onrender.com/` |
| Live bundle | the hash changes on every redeploy, so it is not a fact of record — read it on the day | `curl -s https://quizquest-4phd.onrender.com/ \| grep -o '/assets/index-[^"]*\.js'` |
| Build on the live site | `origin/main` — the tab names are **Kingdom, Quiz, My Progress, Campfire Run, Summon** and **Analytics, To review, Classes & Roster, Question bank, AI drafting, Evaluation, Settings** (`web/src/App.vue:29-32`); a local `main` says the same | the live bundle contains "Campfire Run" and "To review". **"Practice" and "World" are the old names** — never narrate them |
| Per-class settings move (PR #51) | **Merged into `main` (`22fcf74`) and live.** The live bundle has one occurrence of "Search classes by name or course", one of "Class Settings" and one of "View trade log" — the class page owns those settings now | same bundle grep |
| Live professor account | `prof.b@quizquest.demo` ("Prof. Demo B") signs in. `prof.a@quizquest.demo` is **absent** from `/api/demo-users` and returns 401 | `curl -s https://quizquest-4phd.onrender.com/api/demo-users` |
| Live data under that account | 1 course "Intro to Statistics (demo)", 1 topic, 1 class "Statistics - Tutorial Group B", **2 students (Student 07, Student 08), 0 active join codes, 0 attempts** | `GET /api/classes` → `memberCount`, `activeCodesCount`; `GET /api/classes/<id>/members` |
| AI on the live instance | **On.** `geminiEnabled: true`, `authoringEnabled: true` — the guided workflow renders and the report/generate steps are real | `GET /api/teacher/courses` as the professor |
| Free instance sleeps | Yes. A cold request returned 503 with `Retry-After: 5`; the retry took ~55 s | warm it before filming (below) |

### Blockers, in the order they bite

**B1 — the live data is too thin for the Analytics and roster shots.** With one class of two students and zero attempts, the dashboard reads "No answers yet" (`web/src/teacher/analyticsView.vue:656`) and the roster table has two rows.

**What is actually on the live project (checked on 4 Nov 2026, not guessed):**

| Account | State | Owns |
|---|---|---|
| `t-b` → `prof.b@quizquest.demo` | a working demo account, shared password | "Intro to Statistics (demo)" — 1 topic, 1 class, 2 students, **0 attempts** |
| `t-a` → `prof.a@quizquest.demo` | **absent from the demo picker, returns 401** | "Intro to Computing (demo)" (3 topics), "Computing - Tutorial Group A" (6 students), "Computing - Tutorial Group C" (4 students), the seeded practice history, one draft question, one open student report |

`t-a` is in `SEEDED_DEMO_USER_IDS` (`src/quiz/api.js:69`), and `isSeededDemoUser`
(`src/quiz/api.js:70`) also requires the email to end with `@quizquest.demo` — so
the only thing that can have changed is the email. It has: **`t-a` is now Ho Zhi
Yang's own account**, with his real SMU address and his own password. That is
why his own screenshots show the Computing course and its analytics, and why
`prof.a` is not in the picker.

**The options, and what each one costs:**

1. **Move the content, do not reseed.** Reassign the Computing course and its two
   classes from `t-a` to `t-b`. This is a **data change, not a code change**; it
   leaves Ho Zhi Yang's login untouched, it does not touch the students, and it
   is reversible. It is the option that breaks the least. Do this first.
2. **Do not reseed.** `pnpm db:reset --confirm` would restore
   `prof.a@quizquest.demo` and the shared demo password — which **takes away Ho
   Zhi Yang's login** — and it is irreversible. Any other password a teammate
   changed since the seed is reverted too.
3. **Reseed anyway**, if the team decides the demo data matters more than one
   person's login. It needs Ho Zhi Yang's nod as well as Marxel's, because the
   account being reset is his.

**And note:** whoever presents can use their own account. The video and the live
demo on 16 Nov are filmed and presented by the people who own each area, and they
already have working logins. The shared `prof.b` account only matters if
somebody presents an area they do not own.

**B1b — the "Commonly missed questions" panel can read "Not enough data yet."** That is not a bug and not a bug in the demo — it is a threshold. A question only reaches the panel once it has **at least 3 confirmed first attempts** (`MIN_N = 3`, `src/quiz/analytics.js:30`, applied at `:389`); the panel then lists the questions under 60% correct. So if the topic on screen has no question with three or more attempts, the panel is empty and says so. **If this shows up on camera, the fix is more practice history on that topic — data, not code.** Pick the topic that already has the history, and check it on the day by opening the same tab before you press record.

**B2 — PR #51 (per-class settings + class search) is merged, and the app has been rebuilt on top of it.** The merge is `22fcf74` (PR #51), so the class card's "Settings" button and the "Class Settings" sub-tab are in `main` (`web/src/teacher/ClassManagementView.vue:399`, `:462`, `:641`), and the live bundle now carries "Search classes by name or course" and "View trade log" — the per-class panel has left the Settings tab. Shot 9 can be filmed as written. Still run the bundle grep in 1.1 on the day: **0** means you are on an older build, and on that older build the same three controls are still on the **Settings** tab.

**B3 — the README's cloud URL is fixed.** Page 1 of `README.md` now reads **"Deployed app:** https://quizquest-4phd.onrender.com", which is what the brief requires in the submitted README (Briefing p02). Nothing left to do here — just keep that line in the README you submit, because the video's end card shows the same URL.

---

## 1. Before you press record

### 1.1 Deploy and verify

- [ ] **Latest `main` is live.** William owns the push and the Render deploy. After it lands, confirm the live bundle hash changed and still contains the current tab names — `curl -s https://quizquest-4phd.onrender.com/ | grep -o '/assets/index-[^"]*\.js'`, then grep that file for `Campfire Run` and `To review`. If the bundle still says "Practice" or "World", you are filming an old build.
- [ ] **PR #51 merged and redeployed?** It is merged (`22fcf74`); this checks the deploy, so Shot 9 can be filmed the new way. `curl -s <live bundle> | grep -c "Search classes by name or course"` — **0 means the old way, 1+ means the new way**. Do not narrate a feature the audience cannot see.
- [ ] **The instance is awake.** Free Render instances sleep. Open the live URL and `/api/demo-users` several minutes before you record, then click through every tab you will film once so the assets are cached.
- [ ] **The app must not be restarted during filming.** Sessions live in server memory (`src/quiz/api.js:213`, TTL 8 h at `:55`) — a restart signs everyone out mid-take. The brief also says the deployed app must be left running and not restarted (`Briefing p03`).

### 1.2 The demo account and the data

- [ ] **You can sign in as the demo professor.** Use the account and password from the group chat. Do not type them in front of the camera, and do not paste the password into this file, a slide, or any tracked file. The seeded accounts' shared default is in `README.md` § "Demo sign-in" on `origin/main`.
- [ ] **Reseeded (B1)?** If yes, sign in as the seeded "Prof. Demo A" and confirm you see "Intro to Computing (demo)", both Computing classes, and six students in Group A. If no, you are on "Intro to Statistics (demo)" with one class and two students — then follow the **minimum path** in section 5.3.
- [ ] **The class and the roster are seeded.** The roster shot needs students with attempts and a last-active date; the join-code shot needs a class you can open.
- [ ] **A draft question is waiting in the Question bank.** The seed puts one there (`src/quiz/seed.js:161-165`), and Shot 6's Generate step adds more. Filter "Needs review" (`web/src/teacher/ReviewView.vue:76`).
- [ ] **One student report is open for the professor** (seeded on q-n2, `src/quiz/seed.js:163`), or a student will create one on camera for Shot 17.
- [ ] **A student account is signed in too**, in a **separate browser window** — sign-in is per browser tab (`README.md`, "Demo sign-in" section: *"Sign-in is per browser tab"*).
- [ ] **The student has coins for a Summon pull.** A single pull costs 50 and a ten-pull 500 (`e2e/summon.spec.js:83`, `:116`). Top them up from the student's own debug chip: the **🔧 "Tools and version"** button → **"Coin balance"** (`web/src/components/DebugMenu.vue:145`, `:160`). The endpoint only answers for the synthetic `@quizquest.demo` accounts (`src/quiz/api.js:1851`).

### 1.3 Browser and screen

- [ ] **Close notifications.** The app makes **no** Notification API calls (grep for `Notification` / `requestPermission` across `web/src` and `src` returns nothing), so this is the browser and the OS: dismiss Chrome's "Allow notifications?" prompt, turn off "Offer to save passwords", close the tab-strip preview and every other app that can steal focus, and put the phone on Do Not Disturb. Keep the app's own toasts — they are part of the proof ("Published", "Saved", "Copied ...").
- [ ] **Mute the app's sound.** Sounds are **on by default** (`web/src/sound.js:34`); click the sound toggle in the student header, or set `localStorage['hero-lab-settings'] = { muted: true }`. `prefers-reduced-motion` makes the endless CSS animations stop, which steadies the pointer and the focus ring — turn it on if takes keep wobbling.
- [ ] **Browser zoom 100%**, window maximised, one screen. The app is a single-page shell with no router, so the URL never changes and the recording will read as one long page.
- [ ] **Professor sidebar expanded.** Its collapsed state is remembered in `localStorage['qq-teacher-nav-collapsed']` (`web/src/App.vue:111`) — set it expanded before you record.
- [ ] **Know the student nav.** On Kingdom, Campfire Run and Summon the tab bar slides away 1.6 s after your pointer leaves the top 18 px of the window (`web/src/App.vue:64`, `:67`). Move the mouse to the very top edge before every tab click, or the tab you want is not there.
- [ ] **Console visible and clean.** The professor's mandatory rule is *"Open your web pages in inspector mode at 575px (xs) and show JavaScript console"* (Q&A p11). Before filming: DevTools → Console → walk every tab you will show and confirm **no red errors**. Then close DevTools for the video. Keep it open in a second window for the live Q&A.
- [ ] **B-roll for insurance (separate file, not in the 4:24 cut):** record 10 s of the class grid at **575 px** in DevTools with the Console panel open and empty. It is your responsive-design evidence for the 18% styling band and your answer to the inspector rule.
- [ ] **The GitHub tab is open in its own window** (Q&A p11 rule 5: *"Prepare to show your github page in browser"*). Do not film it in the video.

### 1.4 Recording gear

- [ ] **1920 x 1080, 30 fps** (60 only if the machine holds it while the app animates), exported as MP4/H.264. Confirm the exported file really is 1080p before uploading — the brief's floor is 720p.
- [ ] **Microphone tested** on the narration lines in section 2 — read Shot 1 and Shot 18 out loud at final volume.
- [ ] **A phone as backup.** Keep it charged and on Do Not Disturb, ready to record the screen (or a wide shot of the desk) if a take dies. A phone recording is the backup for *content*, not the master for quality.
- [ ] **Seven recordings, planned.** Filming one take per person and then joining them is far cheaper than re-shooting the whole thing:
  - **R1 — Ho Zhi Yang**, professor window: Analytics (Shots 1–2).
  - **R2 — Marxel**, professor window: the Upload Materials panel (Shot 4) then Classes & Roster (Shots 8–11). One continuous take.
  - **R3 — Xavier Lee**, professor window: the AI drafting tab opens (Shot 3), then the knowledge report and the assessment setup (Shots 5–6).
  - **R4 — Jasper Wong**, professor window: the Question bank and Approve & publish (Shot 7).
  - **R5 — Team**, student window: Shots 12–16. Then a short **R6** in the professor window for Shot 17, and the closing frame Shot 18 as **R7**.
- [ ] **Dead air at head and tail of every take** (about 3 s each side) so the cut points are free.
- [ ] **Same account, same class, same state in R1, R2, R3 and R4.** The professor's course and weekly topic must match across takes or the join will not read as one session.
- [ ] **Read the narration once before each take**, not while recording.

---

## 2. Shot table

Planned runtime **4:24** (264 s) inside the brief's 12-minute cap. Timecodes are the final edit, not the raw takes.

| # | Timecode | On screen (window / URL / page) | Action (click / scroll / type) | Narration — say this | Segment |
|---|---|---|---|---|---|
| 1 | 0:00–0:16 (16 s) | Chrome, `https://quizquest-4phd.onrender.com` · professor tab **Analytics** | Land on the dashboard; let the tiles settle; one short scroll to the section bar | "This is the professor's Analytics dashboard. It opens on the class the professor picked, with a period filter at the top, so you can look at this week, this term, or any date range you choose." | [HO ZHI YANG] |
| 2 | 0:16–0:34 (18 s) | Analytics · **Overview** section | Scroll down past **First-attempt accuracy by topic** to **Needs attention**; hover the **Print report** button | "Scroll down and you get first-attempt accuracy for every topic, plus a 'Needs attention' section listing what the class is struggling with. And there's a print report button, so the professor can bring the summary to a tutorial." | [HO ZHI YANG] |
| 3 | 0:34–0:48 (14 s) | professor tab **AI drafting** | Pick the course and a weekly topic; let the six step chips come into view | "This is AI drafting. The professor picks a course and a weekly topic, and the workflow is six steps: Upload, Knowledge report, Edit and save, Configure questions, Generate, Review and publish." | [XAVIER LEE] |
| 4 | 0:48–1:12 (24 s) | AI drafting · **Upload Materials** panel | **Choose files** → the file is read; tick **"This is authorised course material without student personal data."** → **Upload files** → open **Successfully Uploaded Files** | "Step one is the material. You choose your lecture slides or PDF here — the file is read on your own machine, then you confirm it's authorised course material with no student personal data, and upload it. The file stays attached to this topic, and this is what the report is built from." | [MARXEL] |
| 5 | 1:12–1:30 (18 s) | AI drafting · **Knowledge report** panel | **Generate report** → wait for it → point at the "Made from:" line → **Save report** | "Now Generate report. QuizQuest writes one knowledge report from exactly the files attached to this topic. The panel says which file it came from, the professor edits it in the editor, and saves it. Questions will use only the latest saved report." | [XAVIER LEE] |
| 6 | 1:30–1:48 (18 s) | AI drafting · **Assessment configuration** | Pick a **Learning outcome**, set **Assessment Style**, type the four quantities, watch the total count | "Next the assessment: the learning outcome, whether you want conceptual, application or both, and how many of each question type — up to ten questions in total. The counter tells you the total as you type. Then Generate questions." | [XAVIER LEE] |
| 7 | 1:48–2:02 (14 s) | professor tab **Question bank** | Filter **Needs review** → open a draft card → **Approve & publish** → let the **Published** toast land | "The drafts land in the Question bank under Needs review. Nothing goes live automatically. The professor reads the answer and the explanation, and presses Approve and publish to release it to the students." | [JASPER WONG] |
| 8 | 2:02–2:14 (12 s) | professor tab **Classes & Roster** | Let the class grid settle; point at **Manage Roster & Codes →** | "This is Classes and Roster. Every card is one class group: how many students are enrolled, and how many active join codes it has right now." | [MARXEL] |
| 9 | 2:14–2:30 (16 s) | Classes & Roster · **search box** and **Class Settings** sub-tab — **see note** | Type a class name into **Search classes by name or course**; click the card's **Settings**; toggle trading; open **View trade log (N)** | "Type in the search box and the grid narrows to matching classes. Open a class's Settings and you get its settings right there: resource trading between classmates, the time zone for analytics, and the last forty trades." | [MARXEL] |
| 10 | 2:30–2:44 (14 s) | Class detail · **Student Roster (N)** | Open **Manage Roster & Codes →**; scroll the roster table; tap a student name to expand **Classes with you:** | "Manage Roster and Codes opens the class. The roster lists every student, how many questions they have attempted, and when they were last active — and you can add a student by email, or move one into another class." | [MARXEL] |
| 11 | 2:44–2:58 (14 s) | Class detail · **Join Codes (N)** | **+ Generate Join Code** → set a limit and expiry → **Generate Code** → the green **New Join Code Generated:** banner → **Copy Code** | "Join Codes is the self-enrolment side. The professor sets a usage limit and an expiry, generates a code — and the code is shown exactly once. After that the list shows only a masked version, with usage, expiry and status." | [MARXEL] |
| 12 | 2:58–3:16 (18 s) | Student tab **Quiz** | **Length** 5 · **Timer** Untimed · tick a topic → **Start practice** → answer one question → let the verdict and explanation show → **Report a problem** on it | "This is the student's Quiz tab. The student sets the length, the timer, and any extra time, picks the topics, and starts. Each question is answered in a running session with feedback straight away. A student can flag a question they think is wrong." | [XAVIER LEE] |
| 13 | 3:16–3:30 (14 s) | Student tab **My Progress** | **See results** → the **Session complete** summary → **View my progress** → scroll the four sections | "The summary shows what was right and the coins earned. My Progress carries it forward: your practice indicator, how you're doing by topic, your recent sessions, and any question reports you've sent." | [KAI CONG] |
| 14 | 3:30–3:40 (10 s) | Student tab **Kingdom** | Open **Your buildings**; open one building panel | "Practice pays out in the Kingdom: the town grows as you earn, and the building list opens the castle, garden, tower, library and workshop." | [WILLIAM HANSEL] |
| 15 | 3:40–3:50 (10 s) | Student tab **Campfire Run** | Pick a hero → **HOST LOBBY** → show the four-letter room code | "Campfire Run is the shared one. Pick a hero, host a lobby, and you get a four-letter room code — a classmate joins with that code and you're in the same run." | [WILLIAM HANSEL] |
| 16 | 3:50–3:58 (8 s) | Student tab **Summon** | One pull → the prize → open **History** | "Summon spends coins on heroes and resources — fifty a pull — and every pull is written into the Summoner's Journal." | [WILLIAM HANSEL] |
| 17 | 3:58–4:14 (16 s) | Professor tab **To review** | **Open student reports (N)** → open the report → read the reason → type the reply → resolve it | "A student can flag a question they think is wrong, straight from the practice screen. The professor sees it on To review — the reason, and no student identity — and answers it. The student sees the reply on My Progress." | [KAI CONG] |
| 18 | 4:14–4:24 (10 s) | Professor tab **Analytics**, static | Scroll to the top of the dashboard and hold; the end card sits in the lower third | "That's QuizQuest: professors turn lecture material into review-ready questions in minutes, and students get practice that focuses on their weaker topics. It's live now. Thank you." | [TEAM] |

**Shot 9 note.** PR #51 is merged into `main` (`22fcf74`) and the live app has been rebuilt on top of it, so film Shot 9 as written. Run the bundle grep in 1.1 again on the day: **0** means you are on an older build with no search box and no **Class Settings** tab. Substitute the **Settings** tab instead: on that older build the per-class panel carries the same three controls — **"Allow resource trading between classmates"**, **"Time zone for analytics"** and **"Trade log (N)"** (they sat at `web/src/teacher/SettingsView.vue:65`, `:119`, `:126` before the merge, at `22fcf74^`; on today's `main` that panel only points at **Classes & Roster → Class Settings**, `web/src/teacher/SettingsView.vue:82-85`). Narrate it as *"the settings for each class live on the Settings tab"* and **do not** describe the move — the honest version of that answer, if it comes up in Q&A, is *"they were moved out of Settings into the class's own page, and that is merged into main"* (commit `2781e75`, PR #51).

### Words to keep out of the narration

- **Never** "70% of your questions were the ones you got wrong". The live mix is about **70% general coverage / 30% focused on weak topics** (`src/quiz/adaptive.js`, `weakShare: 0.3`); the student-facing copy says so in plain words. Shot 18's phrasing ("focuses on their weaker topics") is safe.
- **Never** mention login, sign-up, registration, password, role, token or session.
- **Never** name a file, a table, an endpoint, a model or an environment variable on camera.
- **Never** say "Supabase Auth" — there is no Supabase Auth; the honest line if asked is on file in `docs/presentation/QA_PREP.md`.
- **Never** promise a raid-boss screen. There is no raid screen in the shipped app — the World tab is Campfire Run (`e2e/raid-boss.spec.js:7-12`).

---

## 3. Cut points

The seven recordings are joined here. Each cut is a hard splice between two takes with dead air on both sides.

| Cut | At | From → to | What has to be true at the splice |
|---|---|---|---|
| **CUT 1** | 0:34 | **R1** (Ho Zhi Yang: Analytics) → **R3** (Xavier Lee: the AI drafting tab opens) | The professor is on the same course in both takes, so the drafting tab in R3 opens on the course R1 was showing. |
| **CUT 2** | 0:48 | **R3** (Xavier Lee: AI drafting tab) → **R2** (Marxel: Upload Materials) | Same course and same weekly topic selected in both takes, so the upload panel in R2 is the one R3 left. The upload panel must be scrolled to the top of the section when R2 starts. |
| **CUT 3** | 1:12 | **R2** (Marxel: upload) → **R3 continued** (Xavier Lee: report → assessment) | The file Marxel uploaded must already be attached, so **Successfully Uploaded Files** is populated in R3 and the **Generate report** button is enabled. Film R2 before R3. |
| **CUT 4** | 1:48 | **R3 continued** (Xavier Lee: assessment) → **R4** (Jasper Wong: Question bank) | The same draft is the one on screen — R3 leaves the workflow on the topic whose draft R4 opens. |
| **CUT 5** | 2:02 | **R4** (Jasper Wong: Question bank) → **R2 continued** (Marxel: Classes & Roster) | R2 continues on the same professor session, so the class grid in R2 is the same class as in R1. Land on the grid with no class open. |
| **CUT 6** | 2:58 | **R2 continued** → **R5** (Team: student window) | A different browser window. The student is already signed in and already enrolled in the class the professor is looking at. |
| **CUT 7** | 3:58 | **R5** (student window) → **R6** (Kai Cong: professor window, To review) | The report from Shot 12 has been sent and appears under **Open student reports (N)**. |
| **END** | 4:14 | **R6** → **R7** closing frame | The closing frame is a separate short take: a static Analytics dashboard with the end card composited on top. |

**Cut discipline.** Every splice is on a change of screen, never mid-action. Leave the shot's last frame still for a beat before you stop recording. If a take has a stumble, cut around it — do not retake a whole block for one word.

**Also record, but do not use in the cut:** the 575 px responsive clip with the console open (section 1.3), and a clean, still frame of each professor screen for the slide deck.

---

## 4. Why this shot

| # | Why this shot |
|---|---|
| 1 | Opens on the professor's job, not on a splash screen — this is the "working app, correctly implemented and usable" mark (27%) in its plainest form. The dashboard is Ho Zhi Yang's task 8. |
| 2 | Proves the dashboard reads real answers and turns them into teaching actions — part of the "working app, correctly implemented and usable solution" criterion (27% of the app block), and the same dashboard Ho Zhi Yang owns. |
| 3 | Shows the whole authoring pipeline in one frame, so the next three shots are obviously steps of one journey rather than four unrelated screens. The pipeline is Xavier Lee's task 4. |
| 4 | Learning content upload is Marxel's task 2, and it is the input to everything Xavier Lee then shows. It also shows the privacy confirmation, which is a differentiator. |
| 5 | The knowledge report is the pivot of the product: one saved document that becomes the only source for the questions. |
| 6 | Shows the professor setting the learning outcome and the mix by hand — this is where the AI is steered, not where it runs free. |
| 7 | The single most important governance shot: drafts are never live until a human publishes them. The bank and the Approve & publish button are Jasper Wong's task 3. |
| 8 | Class management is Marxel's task 1 and the entry point to everything a teacher does with a class. |
| 9 | The per-class settings now belong to the class, with a search bar to find it — the exact request that came down to Marxel. |
| 10 | The roster is the artefact a professor actually uses on day one: who is in the class, how active they are. |
| 11 | Shows the self-enrolment path end to end, including the one-time code, which is the honest security story. |
| 12 | The student journey, and the adaptive loop starting. One answered question with its verdict is enough; the session summary follows. The adaptive session is Xavier Lee's task 5. |
| 13 | Student progress tracking (Kai Cong's task 6): the indicator, the per-topic status, the session history and the report list. |
| 14 | Gamification is William Hansel's task 9 — practice has to pay out somewhere, or there is no reason to practise. |
| 15 | The multiplayer screen. It shows a real-time shared feature, which is where the "dynamic site" criterion is easiest to see. |
| 16 | The coin sink that funds the Kingdom and the heroes; eight seconds is enough because Shot 14 already made the point. |
| 17 | Closes the loop the professor started: a student flags a question, the professor answers, and the identity of the student is not shown. Question reporting is Kai Cong's task 7. |
| 18 | The last frame is what stays on screen when the video ends in the slide deck. Hold it long enough to read. |

---

## 5. Fallback list

### 5.1 If the video is running long — cut in this order

| Order | Cut | Saves | Cost |
|---|---|---|---|
| 1 | Shot 16 (Summon) | 8 s | The Kingdom shot already made the coin point. |
| 2 | Shot 14 (Kingdom) | 10 s | Gamification is on screen in Shot 12's coin balance. |
| 3 | Shot 2 (Analytics scroll) | 18 s | Keep Shot 1 so the dashboard still appears. |
| 4 | Shot 15 (Campfire Run) | 10 s | The weakest of the student shots if the lobby is slow to open. |
| 5 | The edit-and-save beat inside Shot 5 | ~6 s | Keep the report on screen; stop narrating the editing. |
| 6 | Shot 13 (My Progress) | 14 s | Cut only if the runtime is still over 5 minutes. |
| 7 | Shot 17 (To review) | 16 s | The weakest cut of all: end on the closing frame instead. |

Never cut: **Shot 1** (the opening), **Shot 4** (the upload), **Shot 6** (the assessment), **Shot 7** (the publish — it is the governance proof), **Shot 12** (the student journey), **Shot 18** (the closing frame).
Cuts 1+2+3+4 bring 4:24 down to **3:38**, still inside the target band and far inside the 12-minute cap.

### 5.2 If the AI draft fails live

The report and question steps are real calls to Gemini, and the live instance is configured for them today (`geminiEnabled: true`). A failure is still possible on the day. The app does not hide it: the job panel names the cause and says your progress is saved (`src/quiz/authoring.js:836-852`), and an interrupted job has to be resumed explicitly with **Resume saved work** (`src/quiz/authoring.js:245-248`).

**Say this, on camera, if the step fails:**

> "That's the AI step talking to the live service, and it just failed. We built it to tell us the real reason rather than show a blank report — the message names the cause, it says our progress is saved, and there's a resume button. We're not going to fake a report on camera."

Then **cut to the fallback shot**, do not spend more than 15 s on the failure:

1. **Fallback shot:** stay in **Question bank → Needs review** and **Approve & publish** a draft that was generated earlier in the session (Shot 7 already covers this path). The publish story lands intact.
2. **If there is no draft at all:** use the manual editor — **+ New question**, fill it, save it as a draft, then approve it from the bank (`e2e/question-editor.spec.js:8` drives exactly this). Narrate: *"the professor can always write the question by hand and put it through the same review."*
3. **If the guided workflow is not on screen at all** (the key is missing, so the whole six-step panel is absent and the older single-form drafting screen shows instead): say *"drafting is configured on the server, so on the live instance the guided workflow is what you see"* only if it is actually on screen; otherwise say *"let's show the hand-written path"* and go to the fallback in (2).

**Never** claim a report or a question was AI-generated unless it visibly was. **Never** read a stored report's contents out as if the AI had just written them.

### 5.3 Minimum path — no reseed was possible

If the live data is still one class with two students and no attempts, the following shots have nothing to show. Fix them this way, in this order, **before** filming, not in the edit:

1. **Shot 1 and 2 (Analytics):** film the student's practice session **first** as a warm-up take (it is Shot 12 anyway), then film the professor's Analytics. The dashboard then has one real answer instead of "No answers yet".
2. **Shot 10 (roster):** enrol two more students into the class by email from the **Add a student by email** box (`web/src/teacher/ClassManagementView.vue:501`), using the seeded student addresses that are not yet in the class. The roster fills out.
3. **Shot 17 (To review):** the student sends the report during Shot 12, and you film the professor's To review straight after, in the same sitting.
4. **Shot 4 (upload) and Shot 5 (report):** both need the guided workflow, which needs the key. Confirm `authoringEnabled: true` on the live course before you promise these two shots.

---

## 6. Caption / subtitle pass

One short caption per shot, burned in or delivered as a sidecar `.srt`. These are written so the video works **muted** — each line states what the screen is and what just happened.

| # | Caption |
|---|---|
| 1 | The professor's Analytics dashboard for one class |
| 2 | Accuracy by topic, plus what needs attention |
| 3 | AI drafting: six steps from slides to questions |
| 4 | Lecture files are uploaded to the weekly topic |
| 5 | One knowledge report is written from that material |
| 6 | Outcome, style and question counts are set by hand |
| 7 | Drafts wait in the bank until the professor publishes |
| 8 | Classes and Roster: one card per class group |
| 9 | Search a class, then open its settings |
| 10 | The roster: attempts, last active, and who is in it |
| 11 | Join codes are shown once, then masked |
| 12 | The student picks length, timer and topics, then starts |
| 13 | The session summary, then My Progress |
| 14 | Practice pays out in the Kingdom |
| 15 | Campfire Run: host a lobby and share the code |
| 16 | Coins are spent in the Summoner's Journal |
| 17 | The professor answers a student's question report |
| 18 | QuizQuest — live at quizquest-4phd.onrender.com |

Caption rules: one line per shot, no more than about nine words, centred low, high-contrast, never over a toast that is already carrying the same information. The end card in Shot 18 reads:

> **QuizQuest — Prince William's Quest**
> Live at `https://quizquest-4phd.onrender.com` · Source on GitHub: `whansel007/QuizQuest`

---

## 7. The closing 10 seconds

**Shot 18, 4:14–4:24.** A single static frame: the professor's **Analytics** dashboard at the top of the page, the Overview tiles visible, the browser's address bar showing `quizquest-4phd.onrender.com`, and the end card in the lower third (team name, live URL, repo). No scrolling, no clicking, no toast.

**Why this frame and not another:** the dashboard is the most "this is a finished product" screen in the app, the address bar makes the URL readable rather than spoken, and a still frame survives being paused, screenshotted or embedded in a slide. Nothing is moving, so nothing can look broken in the last second of the file.

**The last spoken line is "It's live now. Thank you."** — then hold the frame to the end of the file. Do not fade to black while the URL is still on screen; the URL is the point of the final ten seconds.

---

## 8. After the recording

- [ ] Watch the cut once end to end, muted, with the captions on. If it does not make sense muted, the narration is carrying something the screen is not.
- [ ] Watch it once with the sound. Check the level on the quiet lines (Shot 12, Shot 16).
- [ ] Confirm nothing forbidden is in frame: no sign-in page, no registration, no credential, no account list.
- [ ] Confirm no console error is visible in any frame (the professor's rule is a clean console).
- [ ] Confirm the export is 1920 x 1080 and under the YouTube limit.
- [ ] Upload to YouTube as **unlisted or public**, put the link on **slide 1**, and keep the file in the deliverables zip next to the slides and the README.
- [ ] Re-check `knowledge/GROUP_STATUS.md` and note the date the video was recorded and which build it shows (`origin/main`, plus the bundle hash you read on the day with the command in section 0).
