# Class enrolment

A student sees a class's questions, World, Kingdom market and progress only
while they are enrolled in it. An enrolment is one `{ classId, studentId }`
record. A student can be in several classes and switches between them with
the class picker at the top of their pages.

Professors manage enrolment from **Classes & Roster**. Students can also
redeem a join code that a professor has issued.

## Adding a student (professors)

There are three ways in, all on **Classes & Roster**. Each adds one existing
student account to one of the professor's own active classes.

| Where | What to enter |
|---|---|
| **Enrol a student**, above the class cards | The student's email and the class name. The class-name field suggests your class names as you type. |
| A class's roster (**Manage Roster & Codes →**), **Add a student by email** | The student's email. The class is the one you are viewing. |
| A class's roster: click a student's name | A profile row opens with their classes with you and an **Add to class…** dropdown of your other active classes. |

- The student must already have an account. A new student signs up first with
  **Create a student account** on the login page. There are no email invites.
- Adding never removes the student from their other classes. To move a
  student, add them to the new class, then **Remove** them from the old one.
- The class name is matched ignoring capitals and surrounding spaces, against
  your active classes only.

### When adding is refused

| Message | Cause |
|---|---|
| Enter a valid email address. | The email is missing or malformed. |
| Enter the class name. | The class name is empty. |
| None of your active classes is named "…". | No active class of yours has that name. This includes archived classes and other professors' classes. |
| More than one of your classes is named "…". Rename one first. | Two of your active classes share the name, so it is ambiguous. |
| No account uses this email. The student needs to sign up first. | No account has that email. |
| Only student accounts can be enrolled in a class. | The email belongs to a professor. |
| … is already in …. | The student is already enrolled in that class. |

## Removing a student

**Remove** on a roster row deletes only that enrolment. The account, the
student's answers, rewards and history stay in the database, so adding them
back later restores their access with their history intact. Archiving a class
keeps all its enrolments but stops new ones.

## Join codes (students)

A professor can also open **Join Codes** in a class, generate a code such as
`QQ-9X4K2` (optionally with an expiry and a usage limit) and share it. The
student clicks **+ Join Class** and enters it. The `QQ-` prefix and letter case
are optional. Revoked, expired, used-up and archived-class codes are refused.

## Code map

| Piece | Location |
|---|---|
| Enrol by email and class name | `POST /api/classes/enrol` in `src/quiz/api.js` |
| Roster, with each student's `classIds` (only the professor's own classes) | `GET /api/classes/:classId/members` |
| Remove from a class | `DELETE /api/classes/:classId/members/:userId` |
| Join codes: create, list, revoke | `POST`, `GET` and `DELETE /api/classes/:classId/join-codes` |
| Redeem a join code | `POST /api/classes/join` |
| Professor UI | `web/src/teacher/ClassManagementView.vue` |
| Student join button and class picker | `web/src/student/ClassPicker.vue` |
| Seeded classes and enrolments | `src/quiz/seed.js` |

All enrolment routes except redeeming a code are professor-only, and a
professor can only act on classes listed in their `teacherIds`.

## Persistence and compatibility

- Enrolments are stored in the `enrolments` table (Supabase) or the
  `enrolments` array (`data/db.json`). The key is the class and student pair.
- The server holds the whole database in memory and writes changes back about
  250 ms later. A running server does not see edits made directly in the
  Supabase dashboard: a row deleted there still counts as enrolled until the
  server restarts, and if the server later changes that row it writes its own
  version back. Make roster changes in the app instead.
- `pnpm dev` hot-reloads the browser code but not the API server. After
  pulling or switching to a branch with new routes, restart `pnpm dev`.
  Otherwise the new buttons call routes the old server does not have, and
  show **Not found.**

## Demo data

The seed (and the shared Supabase project) has these classes. Every demo
password is `quizquest`.

| Class | Professor | Students |
|---|---|---|
| Computing - Tutorial Group A | `prof.a@quizquest.demo` | `student01` … `student06@quizquest.demo` |
| Computing - Tutorial Group C | `prof.a@quizquest.demo` | `student09` … `student12@quizquest.demo` |
| Statistics - Tutorial Group B | `prof.b@quizquest.demo` | `student07`, `student08@quizquest.demo` |

To try it: sign in as Prof. Demo A, open Group A's roster, click
**Student 01** and add them to Group C. Then sign in as Student 01 in another
tab; the class picker now lists both classes.

## Known limitations

- One student at a time; there is no bulk add or CSV import.
- No invitations for people without an account.
- Join codes are saved in plain text next to their hash, so professors can see
  them again. A code's internal ID is also accepted in place of the code.
- Students can still join by code. Whether enrolment should be
  professor-only is an open decision.

## Verification

- `node --test test/auth-classes-test.js`: adding by email and class name,
  each refusal above, join codes, roster and removal.
- `pnpm exec playwright test e2e/professor-enrol.spec.js e2e/join-class.spec.js`:
  enrolling from the overview, the roster's email field, the student-name
  dropdown, and redeeming a join code in the browser.
