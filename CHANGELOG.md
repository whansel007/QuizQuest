# Changelog

All notable changes to QuizQuest. Newest first.

Format follows [Keep a Changelog](https://keepachangelog.com/) where it fits;
this file is informal and human-edited.

---

## [Unreleased]

### Security
- **A demo session cannot change a password.** `POST /api/login` with a
  `userId` signs in one of the seeded demo accounts with no credential at
  all, and `GET /api/demo-users` lists those accounts in the open - so a
  session earned that way proves nothing about who is holding it. Sessions
  now record how they were earned, and a demo session is refused with 403
  when it tries to change a password. Sign in with the account's own email
  and password to change it. No UI change: the app has no password screen.
- **`POST /api/auth/reset-password` no longer takes over an account.** It
  accepted `{email, newPassword}` with no proof of ownership, set that
  account's password and signed the caller in - so anyone who knew an
  address could take that account over, and the README lists the professor
  addresses. There is no mail service in this build, so there is no way to
  prove someone controls a mailbox, and a reset that only takes an address
  cannot be made safe. `/api/auth/reset-password` and
  `/api/auth/update-password` now change the password of the **caller** and
  of nobody else, proved by the session token; the address in the body is
  ignored on purpose. `/api/auth/forgot-password` no longer claims an email
  has been sent - it says plainly that recovery by email is not available in
  this build, and still answers the same way for every address, so it cannot
  be used to find out who has an account.

  > **Corrected on 2026-11-03.** The paragraph above was written when this
  > build had no mail service at all. A password reset by 6-digit email code
  > has since been added, so "there is no way to prove someone controls a
  > mailbox" is no longer true **when a mail service is configured**. The
  > takeover hole is shut either way: a reset now needs either a session
  > token or the code from the reset email, and an address on its own is
  > never enough. `/api/auth/forgot-password` still answers the same way
  > for every address, and where no mail service is configured it says
  > recovery by email is unavailable rather than claiming a code was sent.
- **The two password routes work again.** `POST /api/auth/reset-password`
  and `POST /api/auth/update-password` were registered against a handler
  name that no longer existed, so the server threw `ReferenceError:
  handlePasswordChange is not defined` on start-up and every browser and
  end-to-end test failed. The handler now accepts either a session token
  (change your own password) or the 6-digit code from the reset email
  (prove you control the mailbox), refuses a demo session with 403, and
  refuses a request with neither with 401. `/api/auth/forgot-password`
  only says a code "has been sent" when a mail service really sent one;
  without one it says recovery by email is unavailable and asks the user to
  contact the project team. A new test covers the code flow end to end: the
  code is delivered, a wrong code changes nothing, the right code resets
  the password, and the code cannot be replayed.
- **A join code is no longer kept in the database.** The record stored the
  readable code next to its hash, so the JSON database file held working
  enrolment codes in the clear; and redemption also accepted the record's
  own id, which is stored in the clear as the primary key, so the id was a
  second way in - removing the plaintext on its own would have changed
  nothing. Only the hash is kept now: the readable code is returned once,
  when it is generated, the list returns the code's id instead of the code,
  redemption takes the code and not the id, and a data file written before
  this change has its stored codes dropped the first time the server
  starts. A teacher who loses a code generates another one - the page says
  so where the code is shown.

### Added
- **CI workflow** — `.github/workflows/test.yml` runs all four suites on every push
  and PR to `main`: `pnpm run check && pnpm test` (node), `pnpm exec vitest run`
  (unit), `pnpm run test:browser` (browser) and `pnpm test:e2e` (Playwright, three
  browsers). No deployment configured.
- **EditorConfig** — `.editorconfig` for consistent whitespace and line endings across editors.
- **Prettier config** — `.prettierrc` (no formatter installed by default; install with
  `pnpm add -D prettier` when ready).
- **API route index** — [knowledge/API.md](knowledge/API.md) documents every
  `/api/...` route extracted from `src/quiz/api.js`.
- **`GEMINI_TIMEOUT_MS` env override** — Gemini AI drafting timeout is now
  configurable. Default 60000 ms, capped at 120000 ms. See [.env.example](.env.example).
- **`studentXX@quizquest.edu` login alias** — students can log in via
  `student01@quizquest.edu` / `Password123!` (matches test guide), not just
  `s-01@quizquest.edu`.

### Changed
- **Package manager is pnpm.** `packageManager: "pnpm@12.4.1"` set in
  [package.json](package.json); [README.md](README.md) Quick Start + Commands
  table now use `pnpm`; [PROTOTYPE.md](PROTOTYPE.md) updated for pnpm.
  `pnpm-lock.yaml` is now the canonical lockfile. `package-lock.json` is kept
  for backward compat — safe to delete once the team confirms.

### Removed
- **`public/hero-lab/main.js`** — the earlier single-page version of the hero
  field, from before the picker and the arena were split apart. No page loaded
  it, the elements it reached for are not on either page, and it imports
  `./hero.js`, which no longer exists, so it threw if it was loaded. The one
  thing in it that was not already in the arena — the "Test AI" handler — is
  now `public/hero-lab/test-ai.js`, which stays inert until the page has a
  `#test-ai-btn` element.

---

## [2026-10-17] — Marxel's Tasks 1 & 2 (merged to main)

Commit: `a19d1f7 feat: Implement Task 1 (Auth & Class Management) and Task 2 (Content Archival & Metadata)`

### Task 1A — Real Authentication

> **Corrected on 2026-11-02.** This entry originally said "via Supabase Auth"
> and described a password-reset email flow. Neither was ever connected: there
> is no Supabase Auth in this codebase — the Supabase adapter is a data
> store, not an auth provider — and no mail service sends anything. The
> bullets below say what actually shipped.

> **Corrected again on 2026-11-03.** "No mail service sends anything" is now
> wrong in one respect: a mail service can be configured
> (`RESEND_API_KEY` + `PASSWORD_RESET_FROM`), and when it is, a 6-digit
> password reset code really is sent. What was never true, and still is not,
> is that a reset could be done with an address alone.

- `POST /api/auth/register` — student self-registration, stored locally.
- `POST /api/login` — replaced demo login with email + password; backward compatible
  with `{userId}` for 1-click demo.
- `POST /api/auth/forgot-password` — answers for an address. With a mail
  service configured it sends a 6-digit reset code; without one it says
  recovery by email is unavailable. Either way the answer is the same for
  every address, so it cannot be used to find out who has an account.
- `POST /api/auth/reset-password`, `POST /api/auth/update-password` — change the
  caller's own password, proved by their session token, or prove control of
  the mailbox with the reset code. They used to change the password of
  whichever account the address named — see [Unreleased] / Security.
- `web/src/LoginView.vue` — three tabs: Sign In / Create Account / Demo Accounts.

### Task 1B — Class Management
- `GET /api/classes` — list authorised classes (teacher & student).
- `POST /api/classes` — professor creates class.
- `PATCH /api/classes/:classId` — edit class name/description.
- `POST /api/classes/:classId/archive` — soft archive / restore.
- `GET /api/classes/:classId/members` — roster.
- `DELETE /api/classes/:classId/members/:userId` — remove student.
- `POST /api/classes/:id/join-codes` — generate `QQ-XXXXX` code with usage limit + expiry.
- `GET /api/classes/:id/join-codes` — list active/expired/revoked codes.
- `DELETE /api/classes/:id/join-codes/:codeId` — revoke a code.
- `POST /api/classes/join` — student redeems join code atomically.
- `web/src/teacher/ClassManagementView.vue` — professor "Classes & Roster" tab.
- `web/src/student/ClassPicker.vue` — student "+ Join Class" modal.

### Task 2 — Learning Content Enhancements
- `POST /api/teacher/passages/:pid/archive` — soft archive / restore.
- `PATCH /api/teacher/passages/:pid` — edit title, topic, outcome (text immutable).
- `GET /api/teacher/courses/:cid/passages` — default excludes archived; `?includeArchived=true` shows them.
- `web/src/teacher/ContentView.vue` — Edit-metadata modal + Archive/Restore + Show-archived toggle.

### Database
- New migration: `supabase/migrations/20261016000000_auth_classes.sql`.
  Adds `users.email`, `users.auth_id`, `users.created_at`; adds
  `classes.archived_at`, `description`, `created_by`, `created_at`;
  adds `passages.archived_at`; creates `class_join_codes` table.

### Tests
- New `test/auth-classes-test.js` — 3 integration tests covering
  registration + login, class + join-code + roster, and passage archive + metadata.
- Full suite: **128/128 passing** (1 skipped — Supabase/pglite, expected).

---

## Earlier (pre-this-summary)

For commits before 2026-10-17, see `git log`. The notable shipped items:

- Quiz bank + manual authoring (Task 3, Jasper)
- AI drafting + adaptive sessions (Tasks 4 + 5, Xavier / Zhi Yang)
- Analytics dashboard with custom ranges, CSV export, activity grid, class comparison (Task 8, Zhi Yang)
- Gamification: pets, gacha eggs, kingdom, raid boss, hero-lab, multiplayer World (Task 9, William)
- Supabase integration + JSON file fallback
- Demo seed: 2 courses, 3 classes, 14 users, 24 AI drafts