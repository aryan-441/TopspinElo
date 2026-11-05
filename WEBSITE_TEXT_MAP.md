# Website text locations

The current website copy is written directly in the React source files below. Change the words between the HTML-like tags; keep the tags, braces and code intact. You can also send your replacement write-ups as ordinary text and have them inserted.

| Page or area | File | What to find |
| --- | --- | --- |
| About TopspinElo | frontend/src/views/UtilityViews.tsx | AboutView, at the top of the file: introduction, value statements, free/adless description and support |
| Club guide | frontend/src/views/UtilityViews.tsx | ClubGuide: the chapters list contains each section's heading and paragraph |
| Settings | frontend/src/views/UtilityViews.tsx | SettingsView |
| Exports and recovery | frontend/src/views/UtilityViews.tsx | ExportsView |
| Homepage/dashboard | frontend/src/views/Overview.tsx | Overview |
| Players | frontend/src/views/PlayersView.tsx | Directory, profiles and empty states |
| Referees | frontend/src/views/RefereesView.tsx | Roster and assignment descriptions |
| Tournaments | frontend/src/views/TournamentsView.tsx | Setup guidance, draws, imports, groups, standings and errors |
| Matches and scoring | frontend/src/views/MatchCenter.tsx | Schedule, scorecard, logs and match instructions |
| Result entry | frontend/src/components/ResultEntryDialog.tsx | Ways to enter a result and validation messages |
| Statistics overview | frontend/src/views/StatisticsView.tsx | Page introduction, summaries, ratings and recent form |
| Singles statistics | frontend/src/views/PlayerAnalysis.tsx | Metric labels, definitions, filters and training notes |
| Doubles statistics | frontend/src/views/DoublesAnalysis.tsx | Partnership descriptions, definitions and empty states |
| Navigation and creation forms | frontend/src/App.tsx | Navigation labels, notifications, player/match/tournament creation forms |
| PDF upload errors | frontend/src/services/pdfImport.ts | File restrictions and service errors |
| PDF reading messages | cv_service/app.py | Server validation and recognition errors shown by the app |

Use British English. In particular, “practice” is the noun (“a practice session”) and “practise” is the verb (“practise your serve”).

The licence is separate legal text in LICENSE; it is not an About-page write-up.
