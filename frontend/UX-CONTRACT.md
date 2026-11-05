# TopspinElo UX Contract

## Product scope

TopspinElo helps a club organiser manage players, matches, tournament draws, results, statistics, and exports. The current React/Vite frontend is a local browser preview backed by localStorage. Firebase Auth and Firestore are planned but not connected; screens must describe the storage state truthfully.

## Navigation

- The persistent desktop sidebar and mobile drawer own product navigation.
- Current page is indicated with `aria-current="page"` and the same label is used in the page heading and breadcrumb.
- The document title identifies the active page and TopspinElo; live scoring has its own title.
- Overview is the first page and identifies the product as TopspinElo.
- About TopspinElo and support information are available through Manage navigation and the shared footer.
- The local preview offers Organiser and Referee workspace views. Organiser navigation includes club, tournament, player, referee roster/assignment, statistics, export, and settings workflows; Referee navigation focuses on assigned matches and statistics.
- This view switch is a navigation preference only. It is not authentication or an authorization boundary. Production sign-in and server-enforced role permissions are required before using it to protect organiser data or actions.
- The selected view is saved locally when browser storage is available.
- Footer on every app screen includes support email `GitHub` and `© Aryan Arora 2026`.

## Empty and create flows

- New workspaces begin with no club name, players, matches, or tournaments.
- Club name is optional and entered by the organiser in Settings.
- A match requires two distinct registered players. A tournament requires a name, format, date, and at least two entrants.
- If fewer than two players exist, match/tournament actions route the organiser to add players and explain the prerequisite.
- Create dialogs close on success; the next useful screen is opened and a concise toast confirms the result.

## Scoring and tournament behavior

- Match setup allows one game or best-of formats and 11/21-point games, using win-by-two at deuce.
- Live scoring confirms toss and first server, records points, faults, lets, and corrections in event order, and presents undo/correction distinctly.
- Confirmed match results update player summaries and relevant tournament standings.
- Round-robin fixtures are generated at tournament creation. Knockout creates its opening round and advances winners after a round is complete unless progression is paused.
- Tournament setup allows optional, unique whole-number seeds. Seeded players receive seeded knockout positions and byes where applicable; unseeded entrants are shuffled for each new draw.
- Tournament setup records venue tables and independently configured singles, doubles, or team categories. Each category has its own entrant pool, draw format, and optional seeds. Doubles entrants register as pairs; team entrants have a roster and use a selected team championship system. Generated matches are distributed over the configured tables.
- Knockout draws place seeded entries in standard bracket positions and award byes to the highest seeds. Team ties use the selected ITTF order and stop when a team reaches the required majority; remaining rubbers are marked Not played.
- Doubles scoring tracks the four-player service order, rotation at deuce, first server/receiver selection, and the next-game order. In Corbillon and best-of-seven team ties, the doubles pair can be nominated from each roster after the preceding singles.
- Organisers maintain referee names and optional email addresses in the Referees tab, assign upcoming/live matches there, and see assignments in the referee desk. Assignment changes are added to the tournament audit log.
- Organisers retain authority over imported and generated draws. Imports require preview, validation, and confirmation. Unknown or ambiguous names need explicit mapping; importing must not silently overwrite workspace data.
- The frontend imports structured CSV and JSON draws with category mapping, preview, validation, and confirmation. The CV draw importer is a beta: it uses the optional local PaddleOCR service to extract numbered entrant names and printed BYE labels from PDFs/images. It does not reconstruct bracket connector lines, and its results must remain editable and require organiser confirmation before creating a draw. If the service is unavailable, organisers can use the manual entrant name fields.
- Organisers can print a tournament draw/schedule or use the browser print dialog's Save as PDF action to send a readable fixture list to players. The print layout includes known bye entries.
- Before play begins, an organiser can change tournament entrants. TopspinElo rebuilds only that tournament's pending fixtures, requires a reason, and records the change in the audit log. Once any match is in progress, postponed, or completed, entrant/draw rebuilding is locked.
- Pending match time/table changes require a reason and are recorded in the same tournament audit log. Completed match schedules cannot be edited.
- Backup restore validates the file and previews its player, match, and tournament counts. It replaces browser data only after an explicit confirmation.
- Workspace exports from Settings and Exports use the same versioned backup envelope accepted by Restore. Browser storage failures are caught and explained while the local preview remains usable.
- Every organiser workspace change is recorded in a workspace activity journal with before/after record snapshots; match scoring changes also record score state and point-event deltas. The full workspace JSON and a separate journal JSON are downloadable from Exports & recovery. Player profiles can be edited, removed from the active roster, and restored without breaking historical match IDs.
- Organisers can edit a match’s full JSON record or remove any fixture from the active schedule, regardless of match status. They can edit the full tournament record, including categories, entrants, seeds and bracket slots, or remove the tournament and its active fixtures. Simple single-singles draws also have a roster editor; other category changes use the full event editor. Each override keeps the prior object in the workspace journal/export. JSON editors validate stable record IDs and participant IDs so organisers must add a player to the workspace before referencing that player.
- Schedule, entrant, pause/resume and other organiser changes accept an optional reason. Leaving it blank records that no reason was supplied; it does not prevent the override.

## Feedback and recovery

- Use shared toast feedback for successful low-risk local actions, with errors kept actionable and specific.
- Keep dialog context and user input when validation fails. Disable invalid submissions and show the reason inline where practical.
- Destructive reset requires an explicit confirmation and clearly states that local workspace data will be removed.
- Exports are explicit user initiated downloads. Preserve local data unless the user resets it.
- Local preview / saved-in-this-browser labels remain visible until cloud persistence is implemented and verified. If browser storage rejects a save, show an explicit status that changes may not persist after reload.

## Accessibility and responsive behavior

- Use native links for navigation and email, buttons for actions, visible labels for fields, and visible focus styles.
- Maintain keyboard access, focus-visible indication, semantic headings, live announcements for toasts, and useful accessible names for icon buttons.
- The mobile drawer has a close action and backdrop; opening moves focus inside, Tab stays in the drawer, Escape closes it, and focus returns to the menu button.
- Modal dialogs move initial focus to Close, make the surrounding app inert, lock document scrolling, keep Tab navigation inside, close on Escape, and restore prior inert/scroll state and focus to the opener.
- Keep all content reachable at narrow widths; no important table information or controls may disappear without an explicit alternate path.
- Honor `prefers-reduced-motion`.

## Canonical UI ownership

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native `<select>` controls | `src/App.tsx`, `src/views/TournamentsView.tsx` | Native | Keyboard selection and labels in each setup flow |
| Date | Native date input | Tournament setup in `src/App.tsx` | Native | Keyboard/date entry and invalid-date handling |
| Form | Dialog form markup and `.field` styles | `src/App.tsx`, `src/views/MatchCenter.tsx`, `src/views/TournamentsView.tsx`, `src/views/UtilityViews.tsx` | Create / correction / settings | Required-field and disabled-submit behavior; keyboard checks and remaining cases in `QA_RESULTS.md` |
| Scrollbar | Browser-native scrolling | Global layout in `src/styles.css` | Native | 360–1440px page-width checks; focusable, labeled table regions and keyboard scroll tested |
| Toast | Shared `.toast` in `src/App.tsx` | Local preview status state | Success / info | Visible live-region status after action |
| CRUD | App state transitions and view callbacks | `src/App.tsx` plus feature views | Create / review / correction | Create, safe field rebuild, audited schedule change, import, restore and reset flows; see `QA_RESULTS.md` |
| Navigation | Sidebar in `src/App.tsx` | App-owned responsive drawer | Desktop sidebar / mobile drawer | Route selection; drawer focus, Tab containment, Escape, focus restoration and narrow viewport checks |
| Footer/support | `.app-footer` shared across app routes | `src/App.tsx` and live scoring view | Main app / scoring | Email target and copyright on each route |
| Storage status | Sidebar/topbar local-preview indicators | Browser localStorage only | Local preview | Reload persistence; clear and restore flow |
| Tables and charts | Feature view owners under `src/views/` | Feature view markup and styles | Table / chart | Labels, empty state and narrow-screen comparison |

## Production boundary

Firebase integration must add authenticated tenant ownership and server-enforced Firestore rules before the local-only indicator is removed. Privacy notice, terms, consent controls, account deletion, retention, backups, support/grievance ownership, and security incident procedures require product decisions and legal review before public launch.
