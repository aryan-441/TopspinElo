# Web readiness audit — 4 November 2026

## Decision

The project can move into web deployment preparation. It is not ready for an unrestricted public, multi-user release, and the complete requirements have not all been implemented.

The production frontend builds and runs locally. The browser application stores data in localStorage; its organiser/referee selector is an interface mode, not an authenticated permission boundary. The separate Python desktop application and browser application do not share tournament storage. The PDF service must be hosted and routed separately for a public website. A static frontend export by itself does not supply accounts, shared data or OCR compute.

No site was published during this audit.

## Hands-on test of the requested Downloads PDF

File: `open_singles_manual_test_draw.pdf`, the fictional GPT draw in Downloads.

1. Read the PDF's original text independently of the import response.
2. Called the live recognition endpoint through the actual frontend proxy. It returned all 27 expected names in 32 slots. BYEs were exactly 2, 7, 14, 23 and 30; no missing or duplicate slots were reported.
3. Used the visible app on the user's PC to create the demo tournament **Downloads GPT draw — 27 players** with two existing entrants.
4. Uploaded that actual PDF through the app. The review identified the other 25 names, staged their profiles and kept playing hand/grip/style unspecified.
5. Swapped Marcus Ellery and Zoe Fenwick between slots 3 and 4; observed the automatic reciprocal swap; restored the original positions.
6. Applied the bracket. It created 11 opening fixtures and retained the five BYE recipients in the bracket.
7. Entered synthetic 3–0 results through the app, completing all 26 played matches. Round counts were 11, 8, 4, 2 and 1. The tournament reached Completed; Isla Norwood was the winner in this intentionally first-side-wins test.
8. Downloaded the tournament package and independently checked 27 entrants, 26 completed matches, the five round counts and the final winner.

These are fictional test results, not actual sporting results. The active normal workspace was not cleared; the visible tests used `?demo`.

## Other executed workflows

| Area | Evidence |
| --- | --- |
| Knockout creation | Created random, seeded and typed-name draws through the actual creation form; each eight-entrant event produced four opening fixtures. |
| Group creation | Created snake seeding with eight entrants across three uneven groups, seeding-band shuffle, and fully random groups. Verified every entrant appears once and all round-robin pairings exist. Tested groups-only configuration. |
| Doubles and team draws | Created four doubles pairs and two-team events in New Swaythling, Corbillon, Olympic, best-of-seven and best-of-nine formats. Verified generated fixture counts of 2, 5, 5, 5, 7 and 9 respectively. |
| Structured imports | Applied fixture CSV, fixture JSON, group CSV and group JSON in fresh browser contexts. Checked the actual saved assignments and fixtures. |
| Group-to-knockout | In the visible app, played the second group fixture before the first. Entered one winner-only result and one `11-3 11-7 11-5` result. Confirmed the group winners advanced, the locked state disappeared only after all group fixtures finished, and a knockout match was created only after reviewing and applying its draw. |
| Qualifier rules | Rule tests cover 1, 2 and 3 qualifiers across 2, 3, 4, 5, 7, 8 and 10 groups, with power-of-two brackets and BYEs. Two-qualifier first-round pairings check opposite finishing positions and different groups. These are the app's configured policy; this audit is not an ITTF rules certification. |
| Scoring and corrections | Browser suite exercises toss/start, service rotation, points, reasoned undo, game/match completion and persistence after reload. Service tests cover doubles service order, team systems, deuce and incomplete-data cases. |
| Optional refereeing | Visible results exercised winner-only, overall game score and individual game scores. Creation checkbox and referee assignment/remove workflows are covered by browser regression. |
| Schedule freedom | Regression opens the eighth ready fixture and keeps an unresolved future final unavailable. |
| Players and groups | Edit optional attributes, archive/restore players, edit group allocation, and preserve stable identities are exercised. |
| Recovery | Downloaded tournament package now includes the full restorable workspace and referee identities. Regression downloads this package, verifies its contents, and restores it through Settings. Malformed backups are rejected without replacing existing records. |
| Latest interface requests | Dedicated checks verify no false notification dot, no referee match-creation buttons, no matches exposed for an empty referee roster, singles before doubles, no group AI upload and locked knockout import before qualification. |
| Responsive rendering | Ten pages tested at 320, 390, 768 and 1440 pixels in Edge and WebKit with no page-level horizontal overflow. This is browser/device emulation, not testing on physical phones or Macs. |
| Compiled build | Served `frontend/dist` through Vite preview at port 5174, independently of the development server. All ten pages loaded at 1440 and 390 pixels without page errors or page-level overflow. The live PDF route returned JSON through the configured preview proxy. This still depends on the local Python recognition service. |

The 27 Python application tests and frontend rule/analytics checks passed. They cover separate application layers and do not establish shared storage or public permission enforcement. Browser evidence is recorded alongside this report. Some browser regressions deliberately use mocked PDF responses to isolate review behaviour; the requested Downloads PDF was additionally tested against the real service and through the visible application.

## Defects corrected in this audit

- A completed tournament's overview said “No fixtures yet / Add a draw”. It now distinguishes completed tournaments, pending prerequisites and genuinely empty draws.
- The tournament export package omitted referee records and did not contain the workspace envelope accepted by Settings restore. It now includes both the tournament subset and a full browser workspace backup. The export tooltip and guide disclose that other local events are included.
- A referee view with no selected referee identity could fall back to every match. It now shows no assigned matches, and inactive or removed referee identities do not qualify for the filter. This is a local UI correction, not server-side access control.
- Updated an old test selector for the renamed knockout review heading. Its loading, reciprocal swap, saved bracket and responsive layout assertions remain in place.

## Requirements that remain incomplete

| Requirement from the earlier plans | Current state / gap |
| --- | --- |
| Optional player characteristics | Implemented; unspecified values remain null and can be edited later. |
| Dedicated statistics and examples in the preliminary brief | Singles pressure/serve/receive metrics, opponent filters, score heatmap, trends, comparison, records and basic doubles partnerships exist. Selected numerical cases are tested. The brief explicitly anticipates a later exact statistical specification; comprehensive achievements, richer doubles analytics and independently verified definitions for every eventual metric are not complete. |
| Flexible group editor | Player placement and group allocation review exist. Arbitrary add/remove/rename groups, a complete plain-text editor and different qualifier counts for individual groups are not fully exposed as friendly controls. The generator requires at least two groups, at least two entrants per group and at most 26 groups. |
| Group match formats | Generated group matches use the current default. There is no straightforward tournament-setup control for selecting a different best-of format per group/category. Advanced record edits are not equivalent to this requested control. |
| Configurable ties / official multi-player rules | Current ranking has a fixed comparator and a head-to-head sub-table at a tied qualification boundary. A fully configurable, documented ITTF multi-player tie procedure has not been implemented or certified. |
| Group spreadsheet seed field | Group rows determine allocation; the optional seed field does not currently update the entrant's seeding. Seeding is set in tournament registration. This should be clarified or implemented before treating that field as functional. |
| Knockout after groups | Generation, BYEs, review, swaps, import and rewind are present. Qualifiers come from group performance; importing extra outsiders is blocked. Group AI import has been removed as requested. |
| Multiple knockout categories | General toolbar PDF import targets the first eligible singles knockout category. There is no general category chooser there; this needs attention before advertising PDF import for arbitrary multi-category events. |
| Organiser control | Broad editing, deletion, result replacement, pause/resume, rewind and journal exports exist. Several controls rely on advanced JSON rather than the friendly dedicated editors described in the brief. |
| Notification feed | The bell is a placeholder which displays “You’re all caught up”. The false unread indicator is removed; a real notification inbox is not implemented. |
| Colour, hierarchy and interaction feedback | Harbour/Coral, press feedback, responsive layouts and reduced-motion styling exist. The full interaction design has not been tested with every assistive technology or physical device. |
| About and guide | Present, with a source-file map for the owner's rewrite. Owner-authored final copy is pending. Open-source claims were removed and the approved proprietary licence is present. |
| Accounts and invitations | Authentication, sessions, password/account recovery, referee invitation codes, ownership and server-enforced organiser/referee permissions are not implemented. Any user can change the local interface role. |
| Shared data and concurrent scoring | No shared browser/backend tournament database, multi-device synchronisation or server-side scoring locks/version checks. Separate browser tabs/devices are not a safe simultaneous scoring system. |
| Developer administration | Protected platform dashboard, moderation, account management, operational diagnostics and admin audit controls are not implemented. |
| Privacy and public legal flows | Local browser records and downloaded backups are readable. No end-to-end encryption or production account storage architecture has been implemented. Privacy policy, terms, retention/deletion and any required consent flows remain release work. The proprietary code licence does not replace those documents. |
| Hosted OCR | PDF-only validation, a 20 MB limit and review exist. Production hosting, request-body limits at the web gateway, rate limits, bounded work queues, request isolation, timeouts, health/error monitoring and representative accuracy testing remain. Users should not install OCR software. |
| Public operation | No staging deployment, HTTPS/domain configuration, production backup/restore drill, load/concurrency test or authenticated security assessment has been completed. |

## Recommended next phase

1. Resolve the remaining core-product choices: group editing limits, configurable match/tie rules, multi-category import targeting and the exact statistics scope.
2. Choose the production architecture for accounts, roles, shared database and live-scoring concurrency. Preserve the current tested tournament logic and backup format.
3. Host the compiled frontend and PDF service in a private staging environment with HTTPS, a configured API route, upload controls and operational monitoring.
4. Implement and test authenticated ownership/referee boundaries, invitations, recovery and data-management flows before exposing multi-user records.
5. Run the same acceptance workflows against staging, including simultaneous scoring attempts, server restart/recovery, production backups and physical phone/Mac checks.
6. Finish owner copy, privacy/terms and a deliberate limited pilot before public release.

## Evidence and repeatability

- `WEB_READINESS_EVIDENCE.json`: consolidated browser-suite, creation, structured import and compiled-build results.
- `frontend/scripts/run-browser-qa.cjs`: complete browser regression runner.
- `frontend/scripts/qa/draw-creation-matrix.cjs`: twelve actual draw-creation configurations.
- `frontend/scripts/qa/structured-imports.cjs`: four applied import paths.
- `frontend/scripts/qa/interface-boundaries.cjs`: local role and latest interface requirements.
- `frontend/scripts/qa/production-smoke.cjs`: compiled preview checks; expects the preview server on 5174 unless `TOPSPINELO_BASE_URL` is supplied.
- The visible completed PDF test remains in the demo browser workspace; its export is in Downloads.

Passing these checks establishes the specific outcomes above. It does not establish every possible score history, arbitrary PDF layout, public-security boundary or requirement that is explicitly listed as incomplete.
