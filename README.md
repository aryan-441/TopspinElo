# Table Tennis Manager

**Project date: 27 December 2025. Updated: 3 November 2026.**

A Python application for managing player profiles, table-tennis matches, and tournaments.

## Credits

- **Backend:** Fully developed by Aryan Arora.
- **Frontend:** Assisted by Codex.

## Group-stage tournament objective

The frontend implementation now supports configurable seeded groups for singles round-robin categories, group standings, and automatic knockout generation for the selected top entrants from each group. Standings rank by match wins, game difference, games won, and point difference; head-to-head among tied entrants is used at an advancement cutoff, and unresolved ties stop automatic advancement. Organisers can import group allocations using CSV/JSON or submit a sectioned group scan to the beta OCR draft flow; every suggested name must be mapped to a roster entrant and the full allocation reviewed before applying. The scan review can add missed players, remove false detections, edit group labels, and remap OCR suggestions. Group match imports are checked against each entrant’s group, reject repeated pairings, and normalize rounds with the group name so standings and knockout progression can identify them. Replacing a group allocation regenerates only untouched scheduled fixtures; imports are blocked after play starts or an entrant has a recorded schedule override. The scan parser currently expects explicit headings such as “Group A” or “Pool 1” and has not been qualified on representative group-table scans. OCR output remains a reviewable draft until validation demonstrates it is suitable.

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

The optional local CV service uses PaddleOCR to read numbered bracket rows and
a trained Paddle classifier to help classify player and BYE slots. It returns
a reviewable knockout draft with the original slot order and opening matches.
This is a computer-vision pipeline, not a large language model (LLM). It does
not infer later-round connector lines. Check every name, slot, and BYE in the
AI (beta) review flow before creating a draw.

The CV importer currently runs a pre-trained PaddleOCR recognition model. A
separate one-epoch experimental fine-tuning run completed on 2 November 2026
and saved `latest` and `iter_epoch_1` checkpoints under
`D:\PaddleOCRTraining\output`. The training log reports 30 dataloader
iterations, but `drop_last` omits the incomplete final batch, leaving
`global_step: 29`. The held-out set has
119 searchable-PDF name crops. Evaluating both checkpoints on that same set
gave the original pre-trained model 98.21% exact accuracy and 99.86% normalized
edit distance; the fine-tuned checkpoint scored 91.07% and 99.13%. Fine-tuning
reduced performance on this benchmark, so the checkpoint is not integrated
into the app. These mostly typed name crops are not representative of scanned
group tables or handwritten draws. The group-scan draft route uses a strict
explicit-heading parser and can load a separate exported group recognizer using
`GROUP_OCR_REC_MODEL_DIR`; no qualified group model is configured yet, so the
current endpoint falls back to the Marathi base OCR. The knockout scan route
uses the mobile PP-OCRv5 detector and recognizer plus the trained bracket
parser. Its development sample result was 5/5 exact slot/BYE structures on
validation and 5/5 on the available test drawings. Those drawings were
inspected during development and are largely fictional, so this is not an
independent result on real brackets. A group-table OCR model and representative scan
evaluation are still required. Treat the CV importer as a beta and its output
as a draft requiring human review.

Group-table source and annotation requirements are documented in
`cv_service/training_data/group_tables/README.md`. After adding human-verified
annotations and a source-level `labels/splits.json`, prepare OCR crops with
`python -m cv_service.prepare_group_table_data`. The preparation report stays
unqualified until a candidate is scored on locked, held-out real sheets with
`python -m cv_service.evaluate_group_table_import`; that report includes exact
rosters, name metrics, and missed/extra assignments.

Install the service dependencies:

```powershell
python -m pip install -r cv_service/requirements.txt
python -m pip install paddlepaddle==3.3.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/
```

Run the local CV service in one terminal and the frontend in another:

```powershell
python -m uvicorn cv_service.app:app --host 127.0.0.1 --port 8765
```

```powershell
cd frontend
pnpm run dev
```


## Additional feature requirements

The approved product context and phased requirements for optional player attributes, group-stage tournaments, account roles, developer administration, tournament recovery, and future web deployment are recorded in [docs/ADDITIONAL_FEATURE_REQUIREMENTS.md](docs/ADDITIONAL_FEATURE_REQUIREMENTS.md). Treat this as the source of truth for future planning. Implement in manageable phases, preserve existing functionality, and inspect the current architecture before proposing changes. The immediate isolated feature is optional player attributes; do not attempt the full roadmap as one change.
