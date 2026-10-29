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
- `e2e/question-bank.spec.js`: a professor sees drafts needing review and publishes one.
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

After a failure, run `pnpm exec playwright show-report` to inspect the failed step. To watch a specific test locally, add `--headed`; to step through it, add `--debug`. A failing assertion should be investigated rather than removed just to make the run pass.

CI keeps first-attempt failure traces and screenshots in the **playwright-test-results** artifact for seven days. Download and unzip it from the GitHub Actions run, then open a trace with `pnpm exec playwright show-trace path/to/trace.zip`. The report journey has named steps for student submission, professor resolution and student refresh; a separate fixture owns the professor browser's cleanup so a teardown error can be distinguished from a journey failure.

These checks cover selected journeys, not every possible game action. They exercise the local Node backend and temporary data store; they do not certify a live Supabase connection, external AI services, or a complete multiplayer battle.

You can also record a new test with the **Playwright Test for VS Code** extension ("Record new"), as in the Week 10c lab. Start a server first with `pnpm build` and then `pnpm start`, record against http://localhost:3000, and replace the last recorded click with an `expect(...)` assertion.

## Writing new tests

- Name test files `*.spec.js`. Vitest only picks up files inside `__tests__` folders; Playwright only looks in `e2e/`.
- Test behaviour, not implementation: check what the user sees (`wrapper.text()`, `getByText`, `getByRole`), not internal function names or exact HTML.
- Component tests stub children only when needed; integration tests mount the real children.
