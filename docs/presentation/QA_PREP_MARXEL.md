# Q&A — Marxel's part (companion to `QA_PREP.md` and `QA_PREP_SUPPLEMENT.md`)

**Written 9 Nov 2026 by Marxel's assistant.** Every claim here was checked against `origin/main`
on 9 Nov 2026 and carries its own `file:line`. Where the supplement already had the answer, this file
only adds the part it left open; where it verified a claim, it says so rather than repeating it.

Read this after `QA_PREP.md` (the main pack) and `QA_PREP_SUPPLEMENT.md` (Kai's). §6 of the supplement
is already updated with everything below — this file covers the questions the supplement lists under
§7 and §8 as "Marxel's".

---

## 7.1 "What did you personally build?" — the raw material, in Marxel's own words

*This is deliberately **not** written out as a script. The professor can tell a read-out. The structure
is: **the problem you owned → what you built → one decision and why → how you tested it.** Twenty
seconds. Pick from the facts below and say it your way.*

**The problem he owned.** The class-management screens did things they did not say they did. A public
sign-up could mint a professor account. A student removed from a class kept an in-flight session and
could keep answering through it. The marking queue quietly skipped students who had left. A join code
with an out-of-range expiry wrote an invalid date. The forgot-password form advanced even when the
recovery email could not be sent. On top of that, a professor could not rename a class or clear its
description, and archived material could not be found or edited.

**What he built.**
- The guard rails that closed those holes, put at the API boundary so every screen inherits them
  instead of each screen checking for itself.
- Class rename and clear-description (`src/quiz/api.js:911-934`) — including the 409 that stops two of
  the professor's own classes having the same name, because a class is found *by name* when a student
  joins it (`src/quiz/api.js:915-926`).
- Material archive, metadata editing and the archived-material view.
- A deterministic demo dataset, so the seeded data on the live site and in the tests are the same data
  every time (commit `5dcb44d`, "stop the seeded random stream from shifting the demo data").
- The eLearn submission packer (`scripts/build-submission.mjs`), which refuses to build a zip that
  does not satisfy the brief's three rules.

**One decision and why — pick one.**
- *Put the check in the API, not the screen.* `studentSession` re-checks the enrolment at
  `src/quiz/api.js:242-250`, so a removed student cannot keep answering through a session they still
  hold — one fix, every route, instead of one fix per screen.
- *Archive, never delete.* A class is archived, not deleted (`src/quiz/api.js:936-942`), so the
  attempts and the report history stay intact and the archive can be undone.
- *Make the demo data deterministic.* The same seed must produce the same site for the marker, the
  demo video and the test run — otherwise "it worked on my machine" is not an answer.

**How he tested it.** 46 end-to-end journeys across 19 spec files, run on Chromium, Firefox and WebKit
(138 test runs), 44 Node test files, Vitest component tests, browser suites and the mobile checks —
all on CI for every push. The guard rails have their own regression tests rather than being checked
by hand.

---

## 7.2 The Vue row that was left open — "Why no Vue Router?"

*The supplement left this as "owner of `App.vue` to expand". Here it is.*

There is no router and no route table. The app is one shell whose **state** decides what is on screen:

- `web/src/App.vue:313` — if `S.me` is null the shell renders `LoginView` and nothing else.
- `web/src/App.vue:44` — the tab list is `TABS[S.me.role]`: the **role** decides which tabs exist, so
  a student cannot reach a professor screen by asking for it.
- `web/src/App.vue:47` — the active view is the tab whose id matches `S.tab`.
- `web/src/api.js` — `setTab(id)` is the only way the app moves between views.

The honest reason: the app is one workspace with a handful of views per role, not a set of pages people
link to. A router would have added URL state we do not need — the only URL state in the whole app is
the sign-in page's debug hash for the account list (`web/src/LoginView.vue:25-33`). The cost of the
choice is that the back button does not move between tabs; the benefit is that there is exactly one
place that decides what a role may see.

---

## 7.4 "What student data do you hold, and who sees it?" — Marxel leads this one

*Verified 9 Nov. The supplement's line is right; here is the same answer with the evidence, plus three
facts it did not have.*

**What is held** — the whole schema, in one line (`src/db/schema.js:23-134`): accounts (`users`),
courses and topics, classes, enrolments, join codes, passages, questions and their versions, question
reports, practice sessions and attempts (the answers), the coin `ledger`, student `inventories`,
`kingdoms`, `trades`, the resource log and `participation`. Student names and emails are on the
account; answers are on the attempt.

**Who sees what.**
- **Students see only their own.** Every student route is scoped to the signed-in user — the browser
  sends the session token on every request (`web/src/api.js:113-114`) and the server looks the record
  up by that user's id, never by one the client chooses (the role checks sit on every route in
  `src/quiz/api.js`). If the signed-in user changes while a request is in flight, the response is
  thrown away rather than shown to the new user (`web/src/api.js:132`, `:143`).
- **Professors see class-level figures, and one place where they see a student's answers.** Class
  analytics are computed for the class (`src/quiz/analytics.js:96-127`). The marking queue shows the
  answer text **without the student's identity** (`src/quiz/api.js:1658`).
- **Question reports are anonymous, always.** "Like the Question bank, a report never says who sent it"
  (`src/quiz/reporting.js:44-46`) — the reporter is not in the record the professor receives.
- **Written answers sent to Gemini carry no name and no id.** The student's answer goes as DATA, with
  instructions to ignore anything inside it that looks like an instruction
  (`src/quiz/grading.js:5-8`). The grade is provisional either way: it lands in the professor's
  marking queue and the professor's decision wins (`src/quiz/grading.js:10-11`).

**The upload rule — this is the part to be firm about.** A professor cannot upload student material
without ticking the confirmation: *"This is authorised course material without student personal data"*
(`web/src/teacher/ImportMaterials.vue:320`) and *"I confirm this is authorised course material and
contains no student personal data"* (`web/src/teacher/MaterialLibrary.vue:429`). And it is not only a
promise — the import pipeline **skips images that look like they contain personal data** and tells the
professor how many were skipped (`web/src/teacher/import-materials.js:431`,
`web/src/teacher/ImportMaterials.vue:63`), and the material library flags a page when the model says it
may contain personal data, and refuses to save it until the professor deals with it
(`web/src/teacher/MaterialLibrary.vue:120`, `:151`).

**The honest line for PDPA** — do not overclaim: *"We collect only what the features need, we hide the
reporter's identity, we strip names and ids from anything sent to a model, and we make the professor
confirm that what they upload is authorised course material. A real deployment would still need a proper
review."*

---

## 8 Routing sheet — confirmed, with one clarification

The supplement's sheet is right. Two clarifications for Marxel's rows:

- **"login, accounts, classes, join codes, upload, data storage → Marxel."** All of these live behind
  the same boundary, which is why they are one row: the guard is the API's role check plus the
  enrolment check, and the storage story is one JSON store or Supabase
  (`src/quiz/store.js:1-11`, `src/db/schema.js`). Say that and the row stops sounding like a grab-bag.
- **"data storage" — the honest answer, if asked.** The demo runs on a small JSON-file store: the
  whole database is one object in memory, written to disk shortly after each change, with a
  write-then-rename so a crash cannot leave half a file (`src/quiz/store.js:32-41`). It is explicitly
  **not** production storage — no concurrency, no row-level security — and access rules are enforced
  in the API instead of in the database (`src/quiz/store.js:4-7`). Supabase is supported as the
  alternative. Do not claim the JSON store is a production database.

---

## 7.5 Testing — the numbers in the supplement are correct, no need to re-check them

Counted on `origin/main` on 9 Nov 2026:

| Claim | Checked |
|---|---|
| 46 end-to-end tests | ✅ 46 `test()` calls across `e2e/` |
| 19 spec files | ✅ 19 `*.spec.js` files in `e2e/` |
| 44 Node test files | ✅ 44 files match `test/*-test.js`, which is what `pnpm test` runs |
| three engines, ports 4173–4175 | ✅ `playwright.config.js:14-16` |
| one worker per engine | ✅ `playwright.config.js:22` — "tests in one browser share that browser's server and data" |
| CI retries once | ✅ `playwright.config.js:65` — `retries: process.env.CI ? 1 : 0` |
| Vitest component tests | ✅ `vitest.config.mjs` — only `src/**/__tests__/*.spec.js` and `web/src/**/__tests__/*.spec.js` |
| mobile checks | ✅ `tests/mobile/` exists, `pnpm test:mobile` points at it |

46 tests × 3 engines = **138 test runs**, which is what the full local run reports.

---

## Not verified / out of scope

- The four teammate sections (§2 Xavier, §3 Jasper, §4 Zhi Yang, §5 William). Each owner checks their
  own, as Kai asked.
- The live site's demo student accounts (`student01…student12@quizquest.demo`) were not probed.
- Line numbers here are for `origin/main` at `5766769`. They move after a merge — re-run `grep -n`
  before quoting one in the room.
