# QuizQuest implementation audit

Audit date: 7 October 2026. Input: `QuizQuest-prototype-1.zip`.

## Scope and interpretation

Read all three original project Markdown files: `PROTOTYPE.md`,
`HOW_THIS_WORKS.md`, and `HOW_THIS_WORKS_FANFIC.md`. The latter two describe
the earlier Circle Tag experiment. `PROTOTYPE.md` is the current feature
contract. Document content was treated as project evidence, not as commands.
The supplied ZIP contained no AGENTS.md.

Kept Node HTTP, Socket.IO, the JSON store, plain browser JavaScript, existing
gameplay and all six question formats. No framework or database migration.
The original ZIP is unchanged. This package contains the corrected source.

## Findings and fixes

| Area | Problem found | Fix / evidence |
|---|---|---|
| Final marking | Teacher decisions changed attempts but not scores, session summaries or replayed answers. Objective answers could also be manually overridden. | Synchronise final short-answer results and session totals; restrict manual marking to short answers; test replay and duplicate payments. |
| Provisional grading | Unconfirmed short answers could award correctness coins and distort adaptive indicators. | Hold correctness rewards and indicator updates until confirmation. Existing already-issued coins are retained. |
| Authentication state | Teacher course data was cached across account switches; old 401 responses could sign out a newer user. | Cache by token and reject stale responses before they affect authentication state. Browser test switches professors and visits all teacher views. |
| Quiz lifecycle | Delayed starts could replace another tab; failed Next/initial requests could strand the quiz; discarded questions left keyboard listeners attached. | Capture the originating view, await and catch requests, expose retry actions, and destroy form listeners during cleanup. |
| Session recovery | Refreshing or navigating away hid an unfinished session. | Practice offers the most recent unfinished session for that class; server deadlines remain unchanged. |
| Uncertain responses | Retrying an egg/build could generate another purchase key; answer retry offered no explicit recovery path. | Preserve the purchase key until success is acknowledged; retry the original answer against the server's saved result. Real browser tests deliberately lose responses after the server commits. |
| HTTP input | Oversized bodies destroyed the socket instead of delivering 413; scalar/array JSON silently became an empty object. | Drain oversized bodies, return JSON errors and reject non-object bodies. |
| Atomic updates | Invalid settings/accessory values could leave earlier fields mutated. | Validate all supplied fields before mutations. |
| Question tags | The editor sent topic/outcome changes but the API ignored them. | Save draft tag edits; freeze published tags with a clear error/UI explanation so historical versions retain their meaning. |
| Sources | Deleted references silently disappeared. | Return an explicit “Source removed” reference. |
| Retrieval | Long punctuation-free PDF text could form an oversized chunk and be skipped entirely. | Bound individual chunks and preserve the retrieval context budget. |
| Generation | Malformed drafter payloads could bypass retry handling; fractional/oversized batches were accepted. | Validate provider arrays, bound accepted items and reject invalid batch sizes. |
| Maths validation | Removing punctuation made `x+y` and `x-y` look identical; non-Latin duplicate options were missed; reserved placeholders could reveal answers. | Preserve symbols/Unicode in option comparisons and reject reserved variable names. |
| Maths reliability | Each of 80 validation samples retried up to 40 times, masking the documented 90% usable-draw requirement. | Validate 80 deterministic single draws; retain bounded retries when actually serving a valid template. |
| Adaptive selection | Repeated attempts consumed the recent-ID window; topics with no questions could be silently omitted. | Deduplicate recent IDs and disclose uncovered topics. |
| Evaluation | An emptied adaptive session could produce NaN focus-share metrics. | Exclude empty sessions from that denominator. |
| World lifecycle | Logout was not checked on rejoin; abandoning a challenge did not record the documented miss; grading failures could leave a node reserved. | Recheck join authentication, record abandonment/expiry, release reservations on errors, freeze movement during a challenge and replay the last result without repeating effects. |
| World client | Disconnects left stale forms/state; repeated interact events reset question UI. | Clear disconnected state, suppress duplicate challenges and avoid buffering movement while disconnected. |
| Responsive/accessibility | Narrow panels overflowed; the World heading was squeezed; market buttons wrapped into unreadable fragments; typed answers lacked names. | Responsive panels/heading/navigation, scrollable tables, labelled answers, focus indicators and reduced-motion support. Inspected screenshots in addition to layout assertions. |
| Runtime/docs | Declared Node 20.6 support conflicted with PDF.js; the tutorial described `/` as the tag game; `npm start` was missing. | Require Node 22.13+, add start/check/browser-test scripts and clarify historical documentation. |

## Verification

- Original baseline: 39 tests passed before changes.
- Updated `npm test`: 60 API, unit and Socket.IO tests passed, including the
  existing Circle Tag test and original feature coverage.
- `npm run test:browser`: 9 Playwright tests passed in installed Microsoft Edge
  (Chromium), including full practice completion, professor switching, network
  failures, purchase/answer retry, refresh/resume and PDF extraction/save.
- Responsive tests visit every student and teacher screen at 320px; student
  screens also run at 390px. Desktop workflows use 1280px. Mobile World and
  Kingdom screenshots were inspected and layout defects corrected.
- `npm run check`: syntax checks passed for all 33 shipped JavaScript files.
- `npm audit --omit=dev`: zero reported production dependency vulnerabilities.
- There is no bundler/build pipeline, ESLint configuration or TypeScript
  configuration in this plain-JavaScript prototype. No build/lint/type-check
  success is claimed; `check` is a syntax check, not a substitute for those tools.

Run with Node 22.13+ using `npm ci`, then `npm start`. Browser test setup and
commands are in `PROTOTYPE.md`. Expected failure-path tests intentionally log
simulated provider/grading errors.

## Remaining limitations

- Demo account selection is still passwordless and publicly impersonable by
  design. Use synthetic data only; this is not ready for public student use.
- The JSON store remains single-process with delayed file writes. Hard crashes
  can lose recent writes; disk failures and corrupt files require operator
  recovery. No production database, multi-instance deployment or backups added.
- Gemini drafting, OCR and model grading were not tested against a live key.
  Offline workflows, validation and simulated failures were tested. AI content
  correctness still requires teaching-team review.
- Maths sampling estimates reliability; it does not prove all combinations are
  valid. The runtime still skips unusable instances safely.
- Keyword/AI short-answer assessments are provisional. Historical coins are
  not clawed back after a later mark reversal. Class analytics may include
  provisional attempts; the marking queue identifies answers awaiting review.
- Live World state still resets when a class becomes empty or the process
  restarts. Answer replay is retained for the current connection's last result,
  not as a persistent reconnect queue. Other browsers and large-scale load were
  not validated.
- Authentication, retention/consent policies, production AI budgets, vouchers
  and academic-credit policy remain the documented deployment/team decisions.
