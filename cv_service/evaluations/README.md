# Held-out bracket importer evaluation

## Batch 05

Evaluated on 2026-11-03 using the 10 PDFs and matching labels supplied in
`heldout_batch_05/`. The batch contains fictional, ChatGPT-generated brackets
with 6–59 entrants, 8–64 slots, vector and scanned pages, and LTR, RTL, and
split layouts. These files were kept in `evaluations/`, outside all training
data and manifests.

The evaluator follows the importer inference path: render each PDF page, run
PP-OCRv5 mobile detection/recognition, then run the trained BYE line classifier
and bracket draft parser. Ground-truth JSON is loaded only after inference to
score predictions. Reproduce with:

```powershell
python cv_service/evaluations/evaluate_heldout_batch05.py `
  cv_service/evaluations/heldout_batch_05
```

## Results

- 10/10 PDFs produced a draft; no file raised an inference error.
- BYE detection: 82/82 correct (no misses or false BYEs).
- Entrant names: 247/254 exact including letter case (97.2%); 250/254
  case-insensitive (98.4%).
- Two entrants were missed: slot 28 in the 19-player draw and slot 9 in the
  29-player draw.
- Two names had OCR character errors: `Max Tilling` → `Max Tiling` and
  `Clara Ives` → `Clara lves` in the 50-player draw.
- Three remaining case-sensitive name differences were capitalization only.
- Missing slots and OCR name differences appear in the saved drafts for review.

The per-file metrics and errors are in `heldout_batch_05/evaluation_report.json`;
raw OCR lines and app-shaped predictions are in `heldout_batch_05/predictions/`.

After inspecting this batch, the numbered-slot parser was adjusted to pair
separate OCR number and name lines within the same row. Replaying the saved OCR
lines with the revised parser recovered slots 28 and 9, giving complete slot
coverage on all 10 PDFs. The original report remains the baseline from before
this change. Because this batch informed the parser change, future accuracy
claims need a fresh, unseen batch. The two OCR spelling errors still require
organiser review or a separate recognizer improvement.

## Limits

This is a useful synthetic hold-out check, not a representative real-world
benchmark. It does not prove accuracy on arbitrary club scans. The importer
does not infer later-round connector paths; users must review names, slots,
BYEs, and the completed draw before applying it.
