# Rallydesk / Table Tennis Manager — Comprehensive QA Report

Historical report. See [4 November 2026 verification](docs/QA_2026-11-04.md) for the current executed checks, fixes, and readiness gaps. Earlier missing-dependency and unimplemented-OCR statements below describe the earlier run.

**Run date:** 1 November 2026  
**Workspace tested:** `table_tennis_app-full-project`  
**Scope:** Python tournament engine, documented React local preview, and project acceptance/feature brief.

## Executive summary

The Python backend is in good shape for the exercised workflows: **all 27 backend unit tests passed**, and five additional synthetic tournament scenarios passed for round robin, random knockout, custom bracket import, interrupted-round manual recovery, and fault correction/export/persistence.

This is **not a complete current browser end-to-end sign-off**. The in-app browser had no open tabs in this session, and a local static preview could not be reached from the browser. The installed frontend dependency tree is incomplete: `esbuild` is missing, and package registry access failed, so the frontend rule test and build could not start. The repository does include a detailed acceptance record dated 29 October 2026; I list those as previously documented checks, not as checks I reran today.

The brief's photo/CV bracket recognition and production features (Firebase authentication/database, legal/consent flows, deployment hardening) are explicitly not implemented in this local-preview phase.

## Results from this run

### Backend unit suite

- **27 tests passed, 0 failed** after setting `TEMP` and `TMP` to a workspace-local temp folder.
- The first attempt using the host's sandbox temp folder produced six `PermissionError` errors at atomic file replacement. Re-running with a writable temp directory passed. This is an execution sandbox path restriction, not a reproduced application defect.
- Coverage in the suite includes scoring/service rotation, fault correction and undo, draw preview/import validation, seeded and imported knockout progression, manual advancement, audit records, result correction/Elo, statistics, export packages, backup/restore, and persistence.

### Five synthetic tournament scenarios

All player names were clearly marked as test records. These scenarios ran directly against the Python engine; winners were deterministic test stubs, not simulated point-by-point matches.

| # | Scenario | Result and checks |
|---|---|---|
| 1 | Four-player round robin | **PASS** — generated six fixtures and recalculated standings. |
| 2 | Five-player random knockout | **PASS** — played through byes and rounds to a champion. The draw's random pairing/bye choice varies between runs. |
| 3 | Custom imported knockout | **PASS** — schema-v1 draw validated in preview, applied, and progressed to a champion. |
| 4 | Interrupted match and manual control | **PASS** — simulated a cancelled fixture, verified automatic progression halted, paused progression, explicitly selected a winner, recorded the organiser decision, resumed, and completed the event. |
| 5 | Referee-style correction, export, persistence | **PASS** — recorded a fault, corrected it with a reason, exported a tournament package, saved and reloaded the state, and verified the event history survived. |

The export scenario created JSON, matches CSV, events CSV, standings CSV, statistics CSV, and a manifest in a temporary directory. The temporary package was removed automatically after verification; no test tournament data was left in the app workspace.

## Frontend and product acceptance evidence

The project includes `frontend/QA_RESULTS.md`, a dated 29 October 2026 browser acceptance record. It reports passing checks for:

- Empty workspace, player creation, tournament creation, and scoring.
- 11-point and 21-point service rotation/deuce behavior; lets, faults, undo, and correction.
- Two-player round robin completion and statistics; five-entrant knockout byes and advancement.
- Valid/invalid JSON and CSV draw imports, preview and confirmation, ambiguous names, and duplicate entrants.
- Paused knockout resume behavior, pending schedule/entrant edits, audit events, and reason capture.
- Workspace/tournament JSON downloads; backup preview, restore, malformed backup rejection, and reset confirmation.
- Browser storage failure feedback, responsive sizes, keyboard-scrolling tables, dialog/drawer focus handling, document titles, semantic control names, and contrast checks.
- No page errors during that recorded feature-flow pass.

Those are prior recorded browser checks. They are useful evidence, but I did not independently repeat them in this run.

## Blocked checks today

- `node frontend/scripts/test-tournament-rules.mjs` could not start: **Cannot find package 'esbuild'**.
- `pnpm test` / `pnpm run build` triggered dependency resolution, but package registry DNS/network access failed. The build therefore remains unverified today.
- The browser inventory showed no tabs. A local static-server URL timed out in the in-app browser, so I could not repeat real UI flows, check the current Referee/Organiser screens, manipulate browser localStorage, or download and inspect a browser workspace export.
- The repository notes that Python backend persistence/export and the React preview are separate: the frontend is localStorage-backed and is not connected to the Python backend. A Python export test does not verify the browser's download buttons.

## Feature-by-feature status

| Capability | Status |
|---|---|
| Player data validation and stable IDs | Backend unit-tested; prior frontend acceptance record covers profile creation/edit/removal/restore. |
| Match scoring, service rules, faults/lets, undo/correction | Backend unit-tested; prior browser acceptance record reports interactive checks. |
| Round robin fixtures and standings | Passed in this run and covered by prior browser acceptance. |
| Random knockout, byes, progression | Passed in this run; seeding/bye rules also covered by backend and frontend rule tests in repository, while today's frontend rule test could not launch. |
| Custom JSON draw preview/import | Passed in this run; backend tests also cover invalid/ambiguous mappings. |
| CSV draw import | Backend tests and prior browser acceptance record report coverage; not rerun today. |
| Manual overrides, interrupted round recovery, audit history | Manual knockout recovery passed in this run; backend tests and prior browser record cover additional audited edits/resume cases. |
| Referee roster, assignment, referee desk | Documented as implemented in the frontend contract and prior QA record, but **not exercised today**. There is no separate backend referee subsystem. |
| Tournament package export and persistence round-trip | Passed in this run for the Python backend. Browser workspace export was not rechecked. |
| Doubles/team categories, ITTF tie systems | Existing frontend rule test source asserts five team orders, majorities, doubles service order, seeded byes, and category/table assignment; execution blocked today by missing esbuild. Prior QA record does not claim every such case was browser-tested. |
| OCR/CV import from bracket photo | **Not implemented**, as explicitly stated in UX contract. Structured JSON/CSV imports are available. |
| Cloud accounts/database, terms/privacy/consent, deployment security | **Not implemented in this local-preview phase**, per README and UX contract. |

## Overall assessment and next verification steps

The backend tournament core and recovery/export flows passed meaningful checks. Current evidence does **not** justify saying every feature is fully verified: frontend execution and referee interaction were not observable today, and some team/doubles rules rely on a frontend rule test that could not run.

To close the remaining verification gap, restore the frontend dependencies (including esbuild) in an environment with package registry access, run `pnpm test` and `pnpm run build`, then perform the browser acceptance pass against a reachable preview—especially Referee/Organiser role views, referee assignment, doubles/team scoring, category draws, and browser export/restore. Keep CV/OCR and production services listed as planned scope until implemented.

