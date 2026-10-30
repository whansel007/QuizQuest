# Testing

QuizQuest has three levels of tests, following Week 10 of IS216:

| Level | Tool | Command | Where the tests live |
|---|---|---|---|
| Unit tests (functions) | Vitest | `pnpm test:unit` | `src/**/__tests__/`, `web/src/**/__tests__/` |
| Component and integration tests (Vue) | Vitest + Vue Test Utils | `pnpm test:unit` | `web/src/**/__tests__/` |
| End-to-end tests | Playwright | `pnpm test:e2e` | `e2e/` |

`pnpm test:unit` keeps watching and re-runs tests when you save; press `q` to quit, or run `pnpm vitest run` to run once. Run one file with `pnpm vitest QuestionCardIntegration.spec.js`.

The older server tests in `test/` still run with `pnpm test` (Node's built-in test runner).

## What is covered

**Unit tests**
- `src/quiz/__tests__/validate.spec.js`: `validateQuestion()`, the checks every question passes before it enters the question bank (text length, explanation, difficulty, 3–5 options, answer key, duplicate options, source citation, near-duplicate questions).
- `src/quiz/__tests__/passwords.spec.js`: email normalising, password hashing and checking.
- `web/src/teacher/__tests__/csv.spec.js`: the dashboard's CSV export, including blocking spreadsheet formulas.

**Component tests** (one component mounted on its own)
- `ResultBlock.spec.js`: the feedback a student sees after answering.
- `Pager.spec.js`: the page controls under long lists.
- `AsyncButton.spec.js`: buttons that call the server (disabled while running, errors shown).

**Integration tests** (real components mounted together)
- `QuestionCardIntegration.spec.js`: a question bank card with its real children (`QuestionDetails`, `RichText`, `AsyncButton`). Only `QuestionEditor` is stubbed.
- `PagerIntegration.spec.js`: `usePaged()` with the real `Pager`.

**End-to-end tests** (whole app in Chromium, Firefox and WebKit)
- `e2e/login.spec.js`: student and professor login, wrong password, invalid email, signing out.
- `e2e/signup.spec.js`: creating a student account, an email that is taken, a short password.
- `e2e/join-class.spec.js`: a professor generates a join code and a new student enrols with it; a wrong join code is refused.
- `e2e/practice.spec.js`: starting a practice session, answering a question, the session summary, and a student who is in no class yet.
- `e2e/question-bank.spec.js`: a professor sees drafts needing review and publishes one.
- `e2e/student-views.spec.js`: the World lobby picks a hero and opens a room; the Kingdom town and its buildings; the Summon banner and its drop rates.
- `e2e/teacher-views.spec.js`: the Analytics, Evaluation, Settings and AI drafting tabs open for a professor.
- `e2e/raid-boss.spec.js`: two students share one raid boss; a correct answer damages it for the class and the reward is split.
- `e2e/progress-reporting.spec.js`: practice changes the topic's correct/count figures; a student report reaches the professor and the student sees the resolution response.
- `e2e/team-room.spec.js`: two students create and join the same Campfire Defense room and see its membership.

## How the end-to-end tests run

`pnpm test:e2e` builds the app and starts one server per browser (ports 4173–4175). Each server gets its own fresh copy of the demo data in a temporary file, so the tests never touch Supabase or your `data/db.json`, and every browser starts from the same data. See the report with `pnpm exec playwright show-report`.

The first time on a new computer, download the browsers with `pnpm exec playwright install`.

To run just these user journeys while developing:

```bash
pnpm test:e2e e2e/progress-reporting.spec.js e2e/team-room.spec.js --project=chromium
```

Omit `--project=chromium` to check all three configured browsers. You do not need to start `pnpm dev` first: the test configuration builds and starts its own servers. Keep ports 4173–4175 free.

Tests follow setup, actions and assertions, as in Week 10c. The comments explain why accounts use separate browser contexts and what each assertion proves. Playwright waits for locators and assertions automatically; fixed sleeps would make these journeys unreliable.

Three timeouts are set in `playwright.config.js`, because WebKit is much slower than Chromium on the same machine: **60 s per test** (Playwright's default is 30 s), **10 s per assertion**, and **30 s per click** — so a click that never finds its element fails in half a minute and names the selector, instead of waiting for the whole test and reporting only "test timed out". The journeys that are genuinely long (a whole five-question session, two browsers at once, a shared socket room) also call `test.slow()`, which triples their budget to 180 s. On CI each test is retried once: a slow redraw can lose a single run on a busy runner, and a test that fails twice still fails the job.

After a failure, run `pnpm exec playwright show-report` to inspect the failed step. To watch a specific test locally, add `--headed`; to step through it, add `--debug`. A failing assertion should be investigated rather than removed just to make the run pass.

## When a test passes locally but fails on CI

CI runs every test with one retry, against the **same** server and the **same** data. The second attempt therefore starts with the first attempt's leftovers: a student who has already practised, a roster that already has the enrolment, a draft question that has already been published. A test that only works on a fresh data file fails there, and not on your machine, where the file is new every time.

To see that for yourself, run every test twice against one server:

```bash
pnpm test:e2e:retry
```

A test that passes the first time and fails the second is not flaky — it depends on the data the run before it left behind. Fix it by making the test own its data (a fresh account, a marker in the question text), not by removing the assertion.

CI keeps first-attempt failure traces and screenshots in the **playwright-test-results** artifact for seven days. Download and unzip it from the GitHub Actions run, then open a trace with `pnpm exec playwright show-trace path/to/trace.zip`. The report journey has named steps for student submission, professor resolution and student refresh; a separate fixture owns the professor browser's cleanup so a teardown error can be distinguished from a journey failure.

These checks cover selected journeys, not every possible game action. They exercise the local Node backend and temporary data store; they do not certify a live Supabase connection, external AI services, or a complete multiplayer battle.

You can also record a new test with the **Playwright Test for VS Code** extension ("Record new"), as in the Week 10c lab. Start a server first with `pnpm build` and then `pnpm start`, record against http://localhost:3000, and replace the last recorded click with an `expect(...)` assertion.

## Writing new tests

- Name test files `*.spec.js`. Vitest only picks up files inside `__tests__` folders; Playwright only looks in `e2e/`.
- The end-to-end specs are syntax-checked along with the rest of the code (`pnpm run check`), so a typo in a spec is caught before the suite runs.
- If a test drives **two pages at once**, bring the page you are working on to the front first (`await page.bringToFront()`). WebKit stops animating a page that is not in front, and a click waits for the page to settle before it fires, so the click waits for ever. The shared `signIn()` helper already does this.
- Test behaviour, not implementation: check what the user sees (`wrapper.text()`, `getByText`, `getByRole`), not internal function names or exact HTML.
- Component tests stub children only when needed; integration tests mount the real children.
