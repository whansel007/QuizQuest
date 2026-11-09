# QuizQuest — Q&A Preparation Supplement

**Companion to `docs/presentation/QA_PREP.md`** (Marxel's pack, on `docs/submission-hygiene` / PR #64).
This file does not replace it: read that pack first, then this. Nothing here contradicts it on
purpose; where this file corrects or sharpens a line in the pack, it says so.

Written by Kai Cong. Every claim below was checked against **`origin/main` at `5699466` (6 Nov 2026)**.
Line numbers move after any merge, so re-run `grep -n` before quoting one in the room.

### Status of each section

| Section | Owner | Status |
|---|---|---|
| §1 Kai Cong — progress tracking, question reporting, E2E journeys | Kai | **Final candidate (v1)** — checked line by line |
| §2 Xavier Lee — AI drafting, adaptive sessions | Xavier | **Draft for the owner to verify** |
| §3 Jasper Wong — question bank | Jasper | **Draft for the owner to verify** |
| §4 Ho Zhi Yang — analytics | Zhi Yang | **Draft for the owner to verify** |
| §5 William Hansel — gamification, Campfire Run, deploy | William | **Draft for the owner to verify** |
| §6 Marxel — accounts, classes, upload | Marxel | Small additions only; his pack already covers this well |
| §7 Questions for everyone | all | Draft — each member writes their own answer to 7.1 |
| §8 Routing sheet | all | Draft — agree it in rehearsal |
| §9 A prompt for your own Claude to review your section | §2–§5 owners | Use it |

**Why the four teammate sections are drafts:** each owner knows what they meant to build better
than anyone reading the code from outside. Paste §9 into your own assistant along with your section,
and correct anything it or you find. Mark each answer ✅ once you have checked it.

---

## 1. Kai Cong — student progress tracking and question reporting

### 1.0 The 30-second versions (say these first, then go deeper only if asked)

**My Progress:**
> "My Progress answers one question for a student: where should I practise next? For each topic it
> takes the latest confirmed answer to each of the ten most recent different questions, so retrying an
> easy question can't inflate it, and written answers still waiting for the professor's mark don't
> count. With fewer than three it says it's still building a history; at three or more and under 75%
> it suggests that topic. It's a practice guide, not a grade — and it uses the same calculation the
> adaptive quiz uses to pick the next questions, so the screen and the engine always agree."

**Question reporting:**
> "After answering a question, a student can report a problem — pick a category, give a reason up to
> 300 characters. The server only accepts a report on a question that student actually answered,
> keeps the exact version and wording they saw, and allows one open report per question version. The
> professor sees it on To review or in the Question bank's Reported filter, without the student's
> identity, replies, and resolves it. The student sees the reply on My Progress. Resolving never
> changes a mark or the question by itself — a human decides what to fix."

### 1.1 Worked example (use this if the professor asks "show me how it calculates")

Topic **Networking**, one student, one class, oldest first:

| # | Question | Result |
|---|---|---|
| 1 | Q1 | wrong |
| 2 | Q1 (retry) | right |
| 3 | Q2 | right |
| 4 | Q3 (written answer) | provisional mark, waiting for the professor |
| 5 | Q4 | wrong |

1. Drop answers still waiting for a mark → Q3 is set aside.
2. Keep only the **latest** answer per question → Q1 right (the retry replaced the miss), Q2 right, Q4 wrong.
3. Count: **2 of 3 = 67%**. Three counted questions is enough to judge, and 67% < 75% → **"Worth practising next."**
4. The topic card also says "1 answer(s) awaiting marking."

Later the professor marks Q3 correct. Nothing in my feature has to run: the figures are recomputed from
the answers on every load, so the next refresh shows **3 of 4 = 75%** → "Keep practising".

### 1.2 What the professor is most likely to ask — My Progress

**Q1. "What does My Progress show?"**
Four parts, all for one student in the class they picked: **Your practice indicator** (the overall
counted figure and the topics worth practising next), **Topics** (each topic's status, percentage,
*correct / counted*, how many published questions exist, and answers awaiting marking), **Recent
sessions** (the five most recently completed practice sessions), and **My question reports** (with
All / Awaiting review / Resolved filter).
*Evidence:* `web/src/student/ProgressView.vue:73-153`.

**Q2. "How exactly is a topic's percentage calculated?"**
In four steps, in `topicStats` (`src/quiz/adaptive.js:28-56`):
1. leave out answers whose mark is still provisional (`!a.needsReview`);
2. sort newest first — ties on the same second go to the one stored later;
3. keep the first answer seen per question in a `Map` — that is the latest one, so a retry *replaces*
   the earlier result instead of adding to the count;
4. per topic, take the 10 most recent distinct questions (`recentWindow: 10`) and divide correct by count.
*Evidence:* `src/quiz/adaptive.js:20-22` (the constants), `:28-56` (the steps).

**Q3. "Why only the last ten questions? Why not everything?"**
Because it should describe how the student is doing *now*. A student who struggled in week 2 and has
since got it right repeatedly shouldn't carry week 2 forever. Ten is a window big enough to mean
something and small enough to move when the student improves.
*Honest add-on:* the numbers (10, 3, 75%) are a starting point, not a validated recipe — the code says
so itself (`src/quiz/adaptive.js:12-13`). With real classes we would tune them.

**Q4. "Why does a retry replace the earlier answer instead of counting both?"**
Otherwise a student could raise their percentage by re-answering one question they already know, and
lower the share of everything else. One question, one vote — the latest one. It also means the
denominator is "how many different questions you've shown you can do", which is the honest one.

**Q5. "Why wait for three questions before suggesting a topic?"**
One wrong answer out of one is 0%, and calling that topic weak would be noise. Below three counted
questions the topic says **"Building a practice history"**, and the page explains why: *"Topics need at
least 3 different confirmed questions before we suggest extra practice."*
*Evidence:* `src/quiz/progress.js:13`, `web/src/student/ProgressView.vue:95`.

**Q6. "Why 75%?"**
Below it, roughly one in four recent questions is going wrong — worth extra practice. It is the same
threshold the adaptive engine uses to call a topic weaker (`weakBelow: 0.75`), so the two never
disagree. As in Q3: a team default, not a researched cut-off.

**Q7. "Why are written answers left out?"**
A written answer gets a **provisional** automatic mark (from Gemini, or a keyword check without it), and
only the professor's mark is final (`src/quiz/grading.js` header). If a provisional mark counted, a
student could see "75%" today and "60%" tomorrow without doing anything. So they wait, and the page
says how many are waiting. If the student had an **earlier confirmed** answer to the same question,
that one still counts — the filter runs *before* "latest per question" is chosen.
*Evidence:* `src/quiz/adaptive.js:35` (filter first), `:40` (then latest), `web/src/student/ProgressView.vue:89`.

**Q8. "When the professor marks a written answer, how does My Progress find out?"**
It doesn't need to be told. My Progress stores no figures of its own: every load recomputes them from
the answers. Marking sets `needsReview = false` on that answer (`src/quiz/api.js:1689`), so the next
refresh includes it. The same is true of Recent sessions — scores are read from the answers, not a
stored score (`src/quiz/progress.js:17`).

**Q9. "Is this a grade?"**
No, and the page says so: *"This is a practice guide, not a grade or a measure of mastery."*
(`ProgressView.vue:88`). It also shows the raw *correct / counted* next to every percentage, so 2/3
can't be mistaken for a solid 67%.

**Q10. "How is this different from the professor's Analytics?"**
Different audience, different question. Analytics (Zhi Yang's) is the professor's view of the whole
class — first attempts kept separate from retries, no individual student named or ranked. My Progress
is one student's private view of themselves — latest answer per question, so improvement shows. They
share the principles (provisional marks excluded, small samples not judged) but not the screen.

**Q11. "How does this connect to the adaptive quiz?"**
Directly: My Progress calls the **same function**, `topicStats`, that Xavier's adaptive engine uses to
choose about 30% of a session from weaker topics (`src/quiz/progress.js:3`). So if My Progress says
Networking is worth practising, that is the same calculation steering the next session toward
Networking. One difference: the engine waits until **every** topic has three counted answers before it
personalises at all (`adaptive.js:21`); My Progress judges each topic on its own, so a student can see a
suggestion while sessions are still in broad mode.

**Q12. "Why does 'Worth practising next' sometimes not list a weak topic?"**
It only lists weak topics that **have published questions** (`ProgressView.vue:25`, `&& t.bank`) —
there is no point telling a student to practise something they can't. That topic's card instead says
*"0 published question(s) available — ask your professor about more practice material."*

**Q13. "What is the overall indicator — all-time accuracy?"**
No. It is the sum of the topic windows: the same counted answers the topic cards use
(`src/quiz/progress.js:31-36`). The page says "across the topic windows below".

**Q14. "Can a student see another student's progress, or another class's?"**
No. The route checks the student is enrolled in that class, and answers 404 if not — the same 404 a
class that doesn't exist gets, so ids can't be probed (`src/quiz/api.js:238-241`, `:2016-2019`). The
answers are filtered to *this student and this class* before anything is calculated
(`src/quiz/progress.js:7`). Each class has its own progress.

**Q15. "What happens with a student in two classes of the same course?"**
Two separate progress views. Answers are recorded with the class they were given in, and the class
picker on My Progress switches between them. Tested: `test/progress-reporting-test.js:9`
("isolates classes").

### 1.3 What the professor is most likely to ask — question reporting

**Q16. "Walk me through reporting."**
Student answers a question on the Quiz tab → **Report a problem** appears next to *Next question*
(only after a result) → picks a category and writes a reason → **Send report** → "Report sent. You can
follow its status in My Progress." The professor sees it in **To review → Open student reports (N)**, or
**Question bank → Reported**, writes an optional reply and presses **Mark resolved**. The student
presses **Refresh progress** and sees *Resolved* and *Professor response: …*.
*Evidence:* `web/src/student/QuizRunner.vue:321-325`, `web/src/student/ReportForm.vue`,
`web/src/teacher/ToReviewView.vue:169`, `web/src/teacher/ReviewView.vue:77`,
`web/src/student/ProgressView.vue:135-151`.

**Q17. "What checks does the server do when a report comes in?"**
In order (`src/quiz/api.js:2233-2256`):
1. the question exists;
2. the attempt id, if sent, is well-formed;
3. **this student has an answer to this question on record** — the server looks the attempt up itself,
   filtered to the signed-in student, instead of trusting the browser;
4. the student is still enrolled in that answer's class;
5. **no open report already exists** from this student for this question, class and version — if one
   does, it replies `{ ok: true, already: true }` and the form says *"You already have an open report
   for this question version"* instead of showing an error;
6. the category is one of five allowed values;
7. the reason is present, not just spaces, and at most 300 characters (`str()`, `api.js:130-134`).

**Q18. "Why must the student have answered the question?"**
So a report is always about something the student was actually shown, and nobody can flood a course's
questions with reports through the API. It also lets the report record exactly which version and
wording that student saw.

**Q19. "Why record the version and wording?"**
Questions get edited — each edit is a new version. If the report only pointed at the question, the
student's report history would silently change wording after an edit, and the professor couldn't tell
which wording was complained about. So the report stores `version` and the `stem` as shown — for
maths questions with randomised values, the student's actual numbers (`api.js:2249-2250`,
`src/quiz/reporting.js:1-2`).

**Q20. "Why one open report per question version?"**
To stop duplicates without stopping legitimate follow-ups. Once the professor resolves it, or the
question is edited into a new version, the student can report again.

**Q21. "Is the report anonymous?"** *(Say this precisely.)*
**Anonymous to the professor, not anonymous in the database.** The server keeps the student's id on the
report — it needs it for the duplicate check and so the student can follow their own report. But
every professor-facing response leaves it out: the Question bank view (`api.js:341-349`, commented
"shown without the reporter's identity") and the To review list (`src/quiz/reporting.js:47-63`). The
student's own list also picks its fields explicitly — "no answer keys, other reporters or staff IDs"
(`reporting.js:21`).
*Do not say "fully anonymous".*

**Q22. "Why hide the identity at all?"**
So a student isn't put off reporting a question by worrying how the professor will see them, and so
the professor judges the question, not the student. The form tells the student so: *"Your professor
sees the problem without your identity."*

**Q23. "What does resolving do? Does it fix the mark?"**
It marks the report resolved, records when and by whom, and stores the optional reply (≤ 500
characters) — nothing else (`api.js:1621-1632`). No mark changes, no question edit, no coins. If the
professor agrees, they fix the question in the Question bank (a new version), and that is a separate,
deliberate act. The student page says so: *"Resolving a report does not automatically change your
marks."* Same principle as the rest of the app: a human makes the decision.

**Q24. "What if the professor double-clicks Mark resolved, or the request is retried?"**
The second request finds the report already resolved and returns it unchanged — *"a retried request must
not replace the response"* (`api.js:1624`). The first reply stands.

**Q25. "Which professor sees which report?"**
To review is per class: reports sent from that class, plus old reports whose class can't be worked out,
so none is lost; it also says how many wait in the professor's other classes of the course
(`reporting.js:31-77`). The Question bank's Reported filter shows every open report on a question. And a
professor can only resolve reports on questions in courses they teach — otherwise 404
(`api.js:232-236`).

**Q26. "What if sending the report fails — network drop, server error?"**
The student keeps what they typed. The form only shows the error and re-enables the button; it never
clears the reason (`ReportForm.vue:29-31`). While sending, the controls are disabled, so it can't be
sent twice.

**Q27. "Why five fixed categories and not free text only?"**
So the professor can triage at a glance — "answer seems incorrect" is more urgent than "typo". The five
live in one file, `src/quiz/report-categories.json`, which **both** the server and the Vue form import,
so the dropdown and the server's check can never disagree.

**Q28. "The browser already limits the reason to 300 characters — why check again on the server?"**
Because anything the browser enforces can be bypassed by calling the API directly. The `maxlength` is
for the student's convenience; the server's `str()` check is the real rule.

### 1.4 "Show me the code" — what to open for each question

| If asked about… | Open | Lines |
|---|---|---|
| the calculation | `src/quiz/adaptive.js` | 18-24 (constants), 28-56 (`topicStats`) |
| the status (building / focus / steady) | `src/quiz/progress.js` | 13 |
| recent sessions | `src/quiz/progress.js` | 16-29 |
| the progress route + enrolment check | `src/quiz/api.js` | 2016-2019, 238-241 |
| the progress screen | `web/src/student/ProgressView.vue` | 33-56 (`refresh`), 85-95 (indicator), 104-116 (topics) |
| the report button and form | `web/src/student/QuizRunner.vue` / `ReportForm.vue` | 321-325 / 18-34 |
| the report checks | `src/quiz/api.js` | 2233-2256 |
| resolving | `src/quiz/api.js` | 1621-1632 |
| identity left out | `src/quiz/api.js` / `src/quiz/reporting.js` | 341-349 / 21, 47-63 |
| unit and integration tests | `test/progress-reporting-test.js` | 9, 47 |
| end-to-end test | `e2e/progress-reporting.spec.js` | whole file |

### 1.5 Vue questions on my screens

**Q29. "How does My Progress load its data?"**
`refresh()` runs on `onMounted`. It fetches progress and reports **in parallel** with `Promise.all`
(`ProgressView.vue:41-44`), stores them in `ref`s, and the template re-renders because refs are reactive.
The *Refresh progress* button calls the same function.

**Q30. "What's a `computed` here and why not a method?"**
`focus` (`ProgressView.vue:25`) is the list of topics worth practising that have questions. As a
`computed`, Vue recalculates it only when `progress` changes and caches it otherwise; a method would
rerun on every render.

**Q31. "What is the `alive` flag for?"**
A race guard. If the student switches class or leaves the tab while a request is still in flight, the
late reply must not overwrite the new view. `onUnmounted` sets `alive = false`, and every update after
an `await` checks it first (`ProgressView.vue:22`, `:39`, `:45`, `:58`). `ReportForm.vue` does the same.

**Q32. "What if loading fails?"**
The error appears in a `role="alert"` box, and if earlier data exists it stays on screen with
*"Showing the last loaded data."* (`ProgressView.vue:66`). A `busy` flag stops double requests.

**Q33. "How do the parent and the report form talk?"**
Props down, events up. `QuizRunner` passes `questionId` and `attemptId` as props; `ReportForm` emits
`sent` (with the message to show) or `cancel` (`ReportForm.vue:8-9`). The form gets `:key="qKey"`, so a
new question mounts a fresh form and one question's text never leaks into the next.

**Q34. "Accessibility?"**
Each section has a heading linked with `aria-labelledby`; the sessions table has a `<caption>` and
`scope="col"` headers; errors use `role="alert"`; the status of each topic is written in words as well
as colour (`ProgressView.vue:27-29`); scrollable panels are focusable with a visible focus ring; form
labels are tied to their inputs with `useId()`.

### 1.6 Testing my features

**Q35. "How do you know it works?"**
Three layers:
- **Node tests** — `test/progress-reporting-test.js`: distinct questions are counted once, classes are
  kept apart, a later professor mark updates progress (`:9`); and ownership, versions, resolution and
  persistence of reports, run against storage (`:47`).
- **End-to-end** — `e2e/progress-reporting.spec.js` drives a real browser: a student with no history
  practises, the test works out the expected *correct / count* from the actual answer outcomes and
  checks My Progress shows exactly that; then a separate student and professor session complete
  report → resolve → the student sees the reply. It runs in Chromium, Firefox and WebKit.
- **CI** — `.github/workflows/test.yml` runs the suites on every push; on failure it keeps a trace and
  screenshot (`playwright.config.js`) and uploads them as `playwright-test-results` for 7 days.

**Q36. "Did anything go wrong while testing?"** *(A good story — tell it briefly.)*
The report journey once timed out in WebKit on CI. The error alone didn't say why, so we first added
named steps and kept traces on failure rather than guessing. A later run showed the real cause: the
test helper checked which answer box was on screen *before* the question had finished loading, saw
none, assumed multiple choice, and waited forever for buttons a written question never has. We fixed
the helper to wait for a visible answer control before deciding (`e2e/helpers.js:132-151`) — no fixed
sleeps and no weakened assertions.

**Q37. "What isn't tested?"**
A full Campfire Run battle. `e2e/team-room.spec.js` checks two students can pick heroes, one hosts,
the other joins by code and both see the same room — and claims no more than that.

### 1.7 Limitations — say them before you're caught on them

| Asked | Honest answer |
|---|---|
| "Are 10 / 3 / 75% validated?" | No — a team default, and the code says so (`adaptive.js:12-13`). We'd tune them with real class data. |
| "Does it notify the student when the professor replies?" | No push notification — the student presses Refresh on My Progress. A notification would be the next step. |
| "Can a student withdraw or edit a report?" | No. They can send a new one once it's resolved or the question changes version. |
| "Is there a rate limit on reports?" | No separate limit; the duplicate rule (one open report per question version, only on answered questions) caps it in practice. |
| "The page says 'World' — where's that?" | That wording predates the tab rename to Campfire Run (`ProgressView.vue:88`, `:137`). Reporting is from the Quiz tab, which is the path we test. *(Small copy fix worth doing — ask the team first.)* |

### 1.8 Words to avoid

- "Mastery", "grade", "score" for the indicator → say **practice indicator**.
- "Fully anonymous" → say **anonymous to the professor**.
- "The AI fixes reported questions" → no; **a professor decides**.
- "70% of your questions are ones you got wrong" → the mix is **about 70% general, 30% weaker topics**.

### 1.9 What I personally built *(Kai to write in his own words — keep it to ~20 seconds)*

> _Structure: the problem I owned → the two features in one line each → one decision I'm proud of and
> why → what I tested._
>
> _(Kai: fill this in yourself. The professor will hear the difference.)_

---

## 2. Xavier Lee — AI drafting and adaptive sessions *(DRAFT — Xavier to verify)*

Adds to `QA_PREP.md` §2 "Xavier".

**X1. "Explain broad versus adaptive mode."**
Until **every** topic that has questions has at least 3 counted answers, sessions are **broad**: deal one
question per topic in turn, least-practised topics first. After that, **adaptive**: about 30% of slots
(`weakShare: 0.3`) go to weaker topics (accuracy below 75%), the rest to everything.
*Evidence:* `src/quiz/adaptive.js:108-121` (broad), `:122-151` (adaptive).

**X2. "What if no topic is weak? What if all are?"**
None weak → it focuses on the single lowest topic. All weak → it focuses on the lowest half, so "focus"
still means something (`adaptive.js:127-130`).

**X3. "What does 'similar to questions you got wrong' mean?"**
Inside the weak-topic slots, questions that share a **learning outcome** with one the student recently
got wrong come first — but never the missed question itself; the aim is a similar question
(`adaptive.js:80-87`, `similarToMissed`).

**X4. "Do students keep getting the same questions?"**
It avoids the last 15 questions seen when alternatives exist (`avoidRecent: 15`), and if it has to
repeat, it says so: *"N question(s) repeat from your recent practice because the bank is small."*

**X5. "What if the bank is too small?"**
The session gets shorter and says so — *"No unreviewed questions were substituted."* It never generates
questions on the fly for a student (`adaptive.js:96-99`, header `:14-15`).

**X6. "What is the knowledge report and why have one?"**
One document per topic, written from the uploaded material and **edited and saved by the professor**.
The drafter sees **only** the saved report, never the slides, so the professor controls the source of
every question (`src/quiz/authoring.js` header). Saved reports are immutable versions; saving over a
stale one is refused with 409.

**X7. "How do you check the AI's questions?"**
Structure is validated in code (`validate.js`, `formats.js`), and each candidate is checked by a separate
verification request for correctness, answerability, an unambiguous key, grounding in the source, and
duplication (`authoring.js:645-647`). Failures surface as warnings; survivors are stored as `draft`.
*Xavier: confirm which checks block a question and which only warn.*

**X8. "What if Gemini is down or the key is missing?"**
Missing key → no guided workflow; the older form shows formats as "(needs Gemini)". Failure mid-job →
the job panel names the cause, says progress is saved, and offers **Resume saved work**
(`authoring.js:245-248`, `:836-852`). Never a fake report.

**X9. "Is student data sent to Gemini?"**
For drafting, no — only the professor's saved report. For marking written answers, the answer text is
sent **as data, with no name or id**, and the model is told to ignore instructions inside it
(`src/quiz/grading.js` header). *Xavier: confirm this is your area or Jasper's.*

**X10. "Prompt injection — what if the slides say 'ignore your instructions'?"**
*Xavier to answer from the prompt code — check `prompts.js` / `authoring.js` for the guard wording.*

---

## 3. Jasper Wong — question bank *(DRAFT — Jasper to verify)*

Adds to `QA_PREP.md` §2 "Jasper".

**J1. "What happens when you edit a published question?"**
A new **version** is added (`v: latest.v + 1`) and becomes the published one; older versions are kept
(`src/quiz/api.js:1577-1579`). Old answers keep pointing at the version the student saw, and so do
reports — which is why a student's report history never changes wording.

**J2. "Why keep old versions?"**
So past answers and analytics stay honest: an answer is judged against the question as it was asked.
The card shows how many attempts each version had (`api.js:335-338`).

**J3. "What's the difference between Reject and Withdraw?"**
*Jasper: Reject = a draft that never goes live; Withdraw = a published question taken out of practice
("Withdrawn from practice"), which can be "Published again". Confirm and add where answers go.*

**J4. "How does a professor handle a reported question?"**
Filter **Reported** → open the question → read each report (category, reason, version, wording, no
identity) → optional reply → **Mark resolved** (`web/src/teacher/ReportReview.vue`). If the question is
wrong, edit it — a new version — separately.

**J5. "Can one professor edit another professor's questions?"**
No — every question route checks the professor teaches that question's course, 404 otherwise
(`api.js:232-236`).

**J6. "Bulk rewrite — doesn't that throw away work?"**
"Rewrite selected" keeps the originals (`QA_PREP.md` intro; `ReviewView.vue:211-231`). *Jasper: confirm
whether the rewrites arrive as new drafts.*

---

## 4. Ho Zhi Yang — Analytics *(DRAFT — Zhi Yang to verify)*

Adds to `QA_PREP.md` §2 "Zhi Yang".

**Z1. "Why separate first attempts from retries?"**
A retry straight after seeing the explanation says little about understanding, so accuracy by topic
uses **first attempts**; retry accuracy is shown separately (`src/quiz/analytics.js:4-6`, `:329`).

**Z2. "What makes a question 'commonly missed'?"**
At least **3 first attempts** (`MIN_N = 3`), sorted by lowest first-attempt accuracy, ties broken by more
evidence (`analytics.js:30`, `:389-391`). Fewer than that → "Not enough data yet". *Zhi Yang: the
original pack says the panel lists questions "under 60%" — I could not find that filter in
`analytics.js` (60% appears as `CONFUSING.maxAccuracy` for the "confusing" flag, `:38`). Please check the
panel code and correct whichever is wrong.*

**Z3. "What is a 'confusing' question?"**
Slow (time at or above the class's 75th percentile) **and** under 60% accuracy, with at least 5 answers
(`analytics.js:38`, `:212`).

**Z4. "Why does a figure say 'low data'?"**
Figures from fewer than 5 answers are flagged (`LOW_N = 5`, `:31`), so a 100% from one answer doesn't
look like a result.

**Z5. "Does the dashboard rank or name students?"**
No — it never names or ranks individual students, except the opt-in participation points a professor
turns on for a class (`analytics.js:7-9`).

**Z6. "Why does Analytics show a different number from the student's My Progress?"**
Different questions: Analytics uses the class's **first attempts** in a period; My Progress uses each
student's **latest** answer to their 10 most recent questions per topic. Both leave provisional marks
out. *(Kai can take the My Progress half.)*

**Z7. "How are reports shown on the dashboard?"**
The dashboard counts open reports under Needs attention and links to To review
(`web/src/teacher/dashboard/ReportsPanel.vue`). *(Kai owns reporting; hand over if it goes deeper.)*

---

## 5. William Hansel — gamification, Campfire Run, deploy *(DRAFT — William to verify)*

Adds to `QA_PREP.md` §2 "William".

**W1. "How do students earn coins?"**
10 for the **first time** a question is answered right, 20 for completing a session of 5+ questions,
30 once per topic when the practice indicator reaches 80% over at least 5 questions; at most **150
coins earned per local day** (`src/quiz/rewards.js:11-18`).

**W2. "Can a student farm coins?"**
No: a correct answer pays **once per question, ever**; every payment has a unique key so a double-submit
can't pay twice; and the daily cap. The browser never asks for coins — it submits an answer and the
server decides (`rewards.js:1-12`).

**W3. "Do written answers earn coins straight away?"**
Only when confirmed. A provisional mark pays nothing; when the professor marks it correct, it pays
then, once (`api.js:1690-1700`).

**W4. "What are resources and trading?"**
Resources are earned per day up to 60 units (`economy.js:23`); trading between classmates has limits —
3 open offers each, 1–20 units a side, 5 completed per day (`economy.js:33`) — and is off unless the
class allows it. Resources and buildings are cosmetic: no cash or academic value (`economy.js:6-8`).

**W5. "How does Campfire Run work in real time?"**
Socket.IO rooms on the same Node process. A room code is 4 letters from a 20-consonant alphabet, up to
4 players (`config/tuning.js:371-373`). The server owns the game state; rooms are created on demand and
removed once empty (`src/hero-lab/rooms.js:1-3`). *William: add how the Kingdom feeds hero stats.*

**W6. "What happens if a player disconnects?"**
*William: describe `RECONNECT_GRACE_S` and late joining (`src/hero-lab/room.js:7`).*

**W7. "Does the game affect marks?"**
No — nothing in the game changes an answer's mark or the professor's analytics.

---

## 6. Marxel — accounts, classes, upload *(CHECKED 9 Nov 2026 — Marxel)*

Marxel's section in `QA_PREP.md` is already thorough. These are the linking answers, each one verified
against the code. The file paths are given in full because `api.js` exists twice in the repo — the
server's is `src/quiz/api.js`, the browser's is `web/src/api.js`. Kai's line numbers were re-checked on
9 Nov: `src/quiz/api.js`, `reporting.js`, `analytics.js` and `playwright.config.js` have not moved
since his 6 Nov pass, so his citations still hold.

- ✅ **"How does enrolment protect the other features?"** Every student route for a class first checks
  enrolment and answers 404 if not (`src/quiz/api.js:238-241`, `studentClass`) — progress, reports and
  practice all sit behind it. A session id is not a second key: `studentSession`
  (`src/quiz/api.js:242-250`) re-checks the enrolment too, so a removed student cannot keep answering
  through a session they still hold.
- ✅ **"A removed student — what happens to their progress and reports?"** Their answers stay in the
  data, but they lose access to the class's routes immediately (`src/quiz/api.js:242-250`).
- ✅ **"Professor deletes a class?"** Classes are archived, not deleted, so progress and report history
  stay intact (already in the pack, Q7). There is no delete route for a class at all — only
  `POST /api/classes/:classId/archive` (`src/quiz/api.js:936-942`), which toggles `archivedAt` and
  leaves the attempts alone.

**The professor-side view of a removed student** — the part Kai asked Marxel to confirm, and the
honest answer is not just "the data stays":

Removal deletes the enrolment row and nothing else (`src/quiz/api.js:964-971`). The student's answers
and attempts stay in the data, so re-enrolling them brings that history back into the class view. But
the professor's live views are computed from the enrolment list, not from the attempt history — so the
removed student disappears from them:

- **The class roster** (`GET /api/classes/:classId/members`, `src/quiz/api.js:944-962`) is built from
  `db.enrolments`, so the student is gone from Classes & Roster, along with their attempts count and
  last-active date for that class.
- **Class analytics** filter the class's attempts through the enrolled set
  (`src/quiz/analytics.js:96`, `:125`, `:396`, `:405`), so their answers drop out of the class charts,
  the participation list and the "Needs attention" list.
- **The marking queue** skips them too (`src/quiz/api.js:1637-1649`, `isEnrolled`): "someone who left
  keeps their old attempts, but the professor should not mark answers for a class they are no longer
  enrolled in."
- **Their question reports still need answering.** The To-review queue is filtered by question and
  class context, not by enrolment (`src/quiz/reporting.js:34-40`, `:47-75`), and a report never names
  who sent it — so an open report from a removed student still shows and still has to be resolved.

*If a professor asks "can I still see what a removed student did?" — the honest line is: "their
answers are still in the data, but our roster, our class analytics and our marking queue all read the
enrolment list, so they drop out of the class view. Enrol them again and the history comes back."*

---

## 7. Questions for everyone

### 7.1 "What did you personally build?" — each member writes their own

20 seconds, own words: **the problem you owned → what you built → one decision and why → how you
tested it.** Don't read it from here — the professor will hear it.

### 7.2 Vue fundamentals — any of us may be asked about our own screens

| Question | Short answer | Example in our code |
|---|---|---|
| `ref` vs `reactive`? | `ref` wraps one value (read `.value` in script); `reactive` makes a whole object reactive | `ProgressView.vue:15-21` (refs); `ReportsPanel.vue:28` (`reactive` replies) |
| `computed` vs `watch`? | `computed` derives a value and caches it; `watch` runs a side effect when something changes | `ProgressView.vue:25` (`focus`), `:24` (`watch(filter)` resets the page) |
| Props and emits? | Data down as props, events up as emits | `ReportForm.vue:8-9` |
| `v-if` vs `v-show`? | `v-if` adds/removes the element; `v-show` only hides it | `ProgressView.vue:66-69` |
| Why `:key`? | Tells Vue which element is which; a new key forces a fresh component | `QuizRunner.vue:325` |
| Lifecycle hooks? | `onMounted` to load, `onUnmounted` to clean up | `ProgressView.vue:57-58` |
| `<script setup>`? | Composition API shorthand: top-level variables are available to the template | every `.vue` file |
| Why no Vue Router? | Single-page shell with tabs switched by state (`setTab`); *owner of `App.vue` to expand* | `web/src/App.vue` |

### 7.3 Product and problem

- **"How do you know students want this?"** *Team to agree an honest answer — if there was no user
  testing, say so, and say what you'd measure (practice sessions per week, report volume, topic
  accuracy before an exam).*
- **"How is this different from Kahoot or Quizlet?"** Questions come from **the professor's own
  material**, every AI draft passes a human before students see it, and practice adapts to each
  student's weaker topics; the game rewards practice without touching marks.
- **"Does gamification actually help learning?"** *Team: careful — don't claim research we haven't
  cited. Safe line: "it gives a reason to come back; the marks and analytics stay separate from it."*

### 7.4 AI, ethics and privacy

- **"What if the AI writes a wrong question?"** It can't reach students unpublished; if one slips through,
  a student can report it and the professor fixes it as a new version. *(Xavier → Jasper → Kai.)*
- **"What student data do you hold, and who sees it?"** Accounts, enrolments, answers, coins, reports.
  Professors see class-level figures and anonymous reports; students see only their own data. Written
  answers sent for provisional marking go without name or id. *(Marxel leads, others add their part.)*
- **"PDPA?"** *Team: don't overclaim compliance. Safe line: "we collect only what the features need, hide
  reporter identity, and ask professors to confirm uploads contain no student personal data — a real
  deployment would need a proper review."*
- **"Academic integrity — can students use this to cheat?"** It's practice, not assessment: nothing here
  is a graded exam.

### 7.5 Testing as a whole — Kai can lead, owners add their part

46 end-to-end tests across 19 spec files (Playwright, three browser engines, each with its own seeded
server on ports 4173–4175, one worker per engine because tests in an engine share data), 44 Node test
files (`pnpm test`), Vitest component tests (`pnpm test:unit`), browser suites (`pnpm test:browser`),
and mobile checks (`pnpm test:mobile`). CI retries once and keeps traces on failure.
*Evidence:* `package.json` scripts, `playwright.config.js:14-16`, `:22`, `:65`.

---

## 8. Routing sheet — who answers what

| If the question is about… | First | Backup |
|---|---|---|
| login, accounts, classes, join codes, upload, data storage | Marxel | — |
| AI drafting, knowledge report, adaptive mix | Xavier | Kai (adaptive maths shared with My Progress) |
| question bank, versions, publishing | Jasper | Kai (reports in the bank) |
| analytics, Needs attention, time zones | Zhi Yang | Kai (My Progress vs Analytics) |
| coins, Kingdom, Summon, Campfire Run, deployment | William | — |
| My Progress, reporting, testing | Kai | owner of the feature under test |
| Vue concepts | whoever built that screen | — |
| product, ethics, privacy | whoever is asked, then hand over | Marxel for data, Xavier for AI |

**Hand-over line:** *"That's [name]'s part — [name]?"* Then stop talking.

---

## 9. A prompt for your own Claude to review your section

Copy this, paste your section (§2, §3, §4 or §5) underneath it, and run it in your own coding assistant
with the QuizQuest repository open on current `main`:

```text
I'm preparing for a Q&A on my part of our group project, QuizQuest. Below is a draft Q&A section a
teammate wrote about my feature from reading the code. Check it against the repository on main:
1. Mark each answer correct, wrong, or incomplete, citing file:line for anything you change.
2. List the questions a professor is likely to ask about my feature that the draft misses, with
   answers and evidence.
3. Flag anything that overclaims (says more than the code does) or names a file, endpoint or
   number that has changed.
Keep my own words for "what I built" — don't write that part for me.

[paste your section here]
```

When you're done, edit your section here, mark checked answers ✅, and delete the *DRAFT* tag.
