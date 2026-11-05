# Professor workspace: 10-minute phone checklist

For a real phone (or Chrome DevTools at 375x667), signed in as **Prof. Demo A**. For populated data, serve the fixture first: `pnpm seed:prof-responsive`, then `QUIZ_DATA_FILE=data/prof-responsive.json node server.js`. Tick each step; if one fails, note the phone, browser and orientation.

| # | Step | Expected |
|---|---|---|
| 1 | Open the app in portrait and tap the menu button (top left). | The drawer slides in over a dimmed page, with all seven tabs and your name at the bottom. Nothing behind it scrolls sideways. |
| 2 | Close it three ways: the X, a tap on the dimmed area, and choosing a tab. | It closes each time, and focus returns to the menu button (or to the new page). |
| 3 | Visit each of the seven tabs through the drawer. | No page scrolls sideways. Headings, pickers and buttons are fully visible and easy to tap. |
| 4 | **Analytics**: tap each button in the section bar (Overview, Weekly, Trends...). | Each section's heading lands just below the top bar and the section bar, never under them. |
| 5 | **Analytics**: scroll through the charts, the "By topic" cards, Compare classes, and the chart-data tables (Show as a table). | Axis labels are readable and legends wrap. Wide grids scroll inside their own box, with the row names pinned on the left. |
| 6 | **To review**: mark one short answer **Mark correct**. | The card leaves the list, the page stays where it was, and the To review count in the menu goes down. |
| 7 | **Classes & Roster**: tap **+ Create Class**, fill in a name, and create it. | The dialog is a bottom sheet with Cancel / Create always visible at its bottom edge. The new class appears. |
| 8 | On the new class, tap **Archive**, then tick **Show archived classes** and **Restore** it. | Each action shows a toast; the archived card is greyed out. |
| 9 | **Manage Roster & Codes**: open **Class Settings**, toggle trading, change the time zone, and open the trade log. | Everything fits the width, and the switch and picker are easy to hit. |
| 10 | **Question bank**: open a question, tap **Edit**, change an option, tick a different correct answer, and **Save**. | Each option row is pick / text / remove on one line, the pick circle is easy to hit, and the save succeeds. |
| 11 | **AI drafting**: run **Draft questions** (or **Generate report** with Gemini) and open **Material sent to the drafter**. | The retrieved chunks read as short stacked cards. The generation log scrolls sideways inside its box. |
| 12 | Rotate the phone to landscape on Analytics, then back. | Only the top bar stays pinned in landscape. The same section is still on screen after each rotation, and the open tab, the chosen class and any typed text are kept. |
