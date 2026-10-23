# Changelog

All notable changes to QuizQuest. Newest first.

Format follows [Keep a Changelog](https://keepachangelog.com/) where it fits;
this file is informal and human-edited.

---

## [Unreleased]

### Added
- **CI workflow** — `.github/workflows/test.yml` runs `pnpm run check && pnpm test`
  on every push and PR to `main`. No deployment configured.
- **EditorConfig** — `.editorconfig` for consistent whitespace and line endings across editors.
- **Prettier config** — `.prettierrc` (no formatter installed by default; install with
  `pnpm add -D prettier` when ready).
- **API route index** — [knowledge/API.md](knowledge/API.md) documents every
  `/api/...` route extracted from `src/quiz/api.js`.
- **`GEMINI_TIMEOUT_MS` env override** — Gemini AI drafting timeout is now
  configurable. Default 45000 ms. See [.env.example](.env.example).
- **`studentXX@quizquest.edu` login alias** — students can log in via
  `student01@quizquest.edu` / `Password123!` (matches test guide), not just
  `s-01@quizquest.edu`.

### Changed
- **Package manager is pnpm.** `packageManager: "pnpm@12.4.1"` set in
  [package.json](package.json); [README.md](README.md) Quick Start + Commands
  table now use `pnpm`; [PROTOTYPE.md](PROTOTYPE.md) updated for pnpm.
  `pnpm-lock.yaml` is now the canonical lockfile. `package-lock.json` is kept
  for backward compat — safe to delete once the team confirms.

---

## [2026-10-17] — Marxel's Tasks 1 & 2 (merged to main)

Commit: `a19d1f7 feat: Implement Task 1 (Auth & Class Management) and Task 2 (Content Archival & Metadata)`

### Task 1A — Real Authentication
- `POST /api/auth/register` — student self-registration via Supabase Auth + local fallback.
- `POST /api/login` — replaced demo login with email + password; backward compatible
  with `{userId}` for 1-click demo.
- `POST /api/auth/forgot-password` — Supabase password-reset email flow.
- `POST /api/auth/reset-password`, `POST /api/auth/update-password` — recovery flows.
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