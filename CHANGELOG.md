# Changelog

All notable changes to QuizQuest. Newest first.

Format follows [Keep a Changelog](https://keepachangelog.com/) where it fits;
this file is informal and human-edited.

---

## [Unreleased]

### Security
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

- `POST /api/auth/register` — student self-registration, stored locally.
- `POST /api/login` — replaced demo login with email + password; backward compatible
  with `{userId}` for 1-click demo.
- `POST /api/auth/forgot-password` — answers for an address. No mail service is
  connected, so nothing was ever sent; it now says so instead of claiming
  otherwise.
- `POST /api/auth/reset-password`, `POST /api/auth/update-password` — change the
  caller's own password. They used to change the password of whichever account
  the address named — see [Unreleased] / Security.
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