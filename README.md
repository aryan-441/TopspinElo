# Table Tennis Manager

**Project date: 27 December 2025. Updated: 29 October 2026.**

A Python application for managing player profiles, table-tennis matches, and tournaments.

## Credits

- **Backend:** Fully developed by Aryan Arora.
- **Frontend:** Assisted by Codex.

## Backend status

The backend is implemented and covered by the test suite. It includes:

- Validated player profiles with stable IDs.
- Configurable 11-point and 21-point games, win-by-two and golden-point rules, service rotation, and point-level event history.
- Fault and let recording, audited fault correction, and point undo with a required reason.
- Best-of match scoring, walkovers, retirements, result correction, Elo updates, and player statistics.
- Round-robin fixtures, configurable tie-breaks, knockout brackets and byes, imported bracket progression, and manual advancement for interrupted rounds.
- Audited tournament roster, seed, schedule, and status changes.
- Versioned JSON persistence, validation, atomic saves, recoverable backups, and restore.
- Tournament draw import preview for JSON and CSV, player mapping, and tournament exports in JSON and CSV.

Run the backend and CLI from the project directory:

`python table_tennis_app.py`

Run the backend test suite:

`python -m unittest -v`

## Frontend preview

The React, TypeScript, and Vite frontend lives in `frontend/`. It provides organiser and referee views, player profiles, match scoring, category draws for singles/doubles/teams, seeded brackets, referee assignment, statistics, imports/exports, settings, and About/support pages. New workspaces are empty; organisers add their own names and club details. Organiser edits are recorded in an exportable activity journal with before/after snapshots. Player profiles can be edited, removed from the active roster, and restored while their old match IDs remain valid.

Run the browser preview from the frontend directory:

```powershell
pnpm install
pnpm run dev
```

Create a production build with `pnpm run build` and run rule checks with `pnpm test`. The current frontend is a local browser preview stored in `localStorage`; it is not connected to the Python app or a shared backend. Organisers can edit or remove fixture records and edit/remove tournament records; advanced event edits use the full JSON model and are journaled. Firebase Authentication, Firestore, legal/consent flows, and production hardening are not connected. See `frontend/UX-CONTRACT.md` for interaction rules and `frontend/QA_RESULTS.md` for browser acceptance limits.

### CV draw import beta

The optional local CV service recognizes a numbered entrant list and printed BYE labels in PDF/image scans. It does not yet reconstruct bracket connector lines; treat its output as a draft and review names, seed order, and byes before creating a draw. PaddleOCR downloads its Marathi/Devanagari recognition models at first use.

Install the service dependencies once:

```powershell
python -m pip install -r cv_service/requirements.txt
```

Run the local CV service in one terminal and the frontend in another:

```powershell
python -m uvicorn cv_service.app:app --host 127.0.0.1 --port 8765
```

```powershell
cd frontend
pnpm run dev
```
