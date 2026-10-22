# Student progress and question reporting

Students use **My Progress** in the web app navigation to see their own data
for the selected class. The tab loads fresh data when opened; **Refresh
progress** checks for later answers, confirmed marks and professor responses.

## What the practice indicator means

- Each topic uses the latest confirmed answer to each of its ten most recently
  answered distinct questions. Repeating a question replaces its older result.
- Practice and World answers both count. A timed-out answer counts as incorrect.
- Provisional written answers are excluded until the professor confirms a mark.
  An earlier confirmed answer to the same question may still count meanwhile.
- Fewer than three counted questions means the student is still building a
  history. With at least three, accuracy below 75% suggests extra practice.
- The combined figure adds the displayed topic windows. It is not an all-time
  score, academic grade or claim of mastery.
- Recent completed sessions show correct / confirmed answers and a separate
  pending-mark count. Later professor corrections are reflected on refresh.

The adaptive settings are in `src/quiz/adaptive.js`: `recentWindow`,
`minPerTopic`, `weakBelow` and `weakShare`. The agreed `weakShare` is now `0.3`
(about 30% focus-topic slots, 70% other-topic slots once there is enough
history). Small banks and rounding can change the actual mix. Changing that
number also needs a matching update to documentation and the mix test.
The separate World picker uses it as a probability of choosing the weak-topic
pool; its remaining choices can include any eligible topic.

## Reporting workflow

1. After answering a question in Practice or the World, choose **Report a
   problem with this question**. Select a category and explain the issue.
2. The server verifies the attempt belongs to the student and records its
   class, question version and wording. The client cannot supply an answer key
   or choose another student's attempt. New maths reports retain the sampled
   values from the student's attempt.
3. One unresolved report is allowed per student, class, question and version.
   Retrying a submission returns the existing open report. Typed text stays in
   the form when a request fails.
4. In **Question bank → Reported**, a professor reads the report and optionally
   writes a student-visible response before choosing **Mark resolved**. The
   reporter's identity is omitted from the professor's report response.
5. The student sees pending/resolved reports and the response in **My Progress**.
   Resolving a report does not automatically edit a question, change a mark or
   award coins. Those actions remain separate professor decisions.

## Code map

| File | Responsibility |
| --- | --- |
| `src/quiz/progress.js` | Class-scoped student indicators and session scores |
| `src/quiz/reporting.js` | Safe student report history and legacy report context |
| `src/quiz/report-categories.json` | Category values shared by the server and Vue forms |
| `src/quiz/api.js` | Authentication, ownership checks, report submission and resolution |
| `web/src/student/ProgressView.vue` | Progress, report filters, paging and refresh |
| `web/src/student/ReportForm.vue` | Report form and recoverable submission errors |
| `web/src/teacher/ReportReview.vue` | Professor response and resolved-report display |
| `test/progress-reporting-test.js` | Progress rules, access boundaries and database round trip |

New routes: `GET /api/student/classes/:classId/reports`. The existing progress,
report-submission and report-resolution routes are extended. `attemptId` and
`category` are optional for older clients. A missing category defaults to
`other`; a missing attempt ID uses the student's latest attempt on the question.
The resolution endpoint accepts an optional `resolutionNote` of up to 500
characters. Report reasons remain limited to 300 characters.

## Persistence and compatibility

Progress is calculated from stored attempts rather than maintaining another
copy of the score. Reports remain nested under questions in the app's working
data, and map to the existing `question_reports` table in Supabase.

New report fields (`category`, `classId`, `version`, `attemptId`, `stem`,
`resolutionNote`, `resolvedBy`) use the adapter's existing `extra` JSON column.
No SQL migration or database reset is required for this feature. The JSON-file
fallback saves these fields too. Older reports infer class/version from the
student's latest attempt before the report; if no such attempt exists, they
cannot be assigned to a student class history, but remain in professor review.

The existing single-server limitation of the Supabase adapter still applies.
Live Supabase connectivity and deployment are separate follow-up work.

## Verification

Run `pnpm run check`, `pnpm test`, `pnpm run build` and
`pnpm run test:browser`. The API tests run the report workflow against both
memory and the real migration schema in PGlite, including a reload from the
database. Browser tests cover report submission retry, professor resolution,
student status refresh, empty history, a failed load and a narrow viewport.

For a manual demo, sign in as a student, answer a practice question, submit a
report, and open My Progress. In a second tab, sign in as the corresponding
professor, open Question bank → Reported, reply and resolve it. Refresh the
student's progress and filter to Resolved.
