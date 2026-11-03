"""Fine-tune a line classifier on OCR observations for knockout slot/BYE import.

The recognizer reads text. This supervised stage learns whether a numbered
line is a player or BYE; slot numbers and opening pairs are then assembled.
Unrecognized or duplicate slot numbers remain review-required.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import paddle
from paddle import nn

ROOT = Path(__file__).resolve().parent / "training_data" / "prepared" / "brackets"
CACHE = ROOT / "ocr"
OUT = Path(__file__).resolve().parent / "training_data" / "models" / "bracket_ocr_parser_v1"
NUMBERED = re.compile(r"^\s*(\d{1,3})\s*[.)\-:]?\s*(.*)$")
ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


def features(text: str, confidence: float | None) -> np.ndarray:
    text = text.casefold().strip()
    vector = np.zeros(16 * len(ALPHABET) + 3, dtype="float32")
    for position, char in enumerate(text[:16]):
        index = ALPHABET.find(char)
        if index >= 0:
            vector[position * len(ALPHABET) + index] = 1
    vector[-3] = min(len(text), 40) / 40
    vector[-2] = float(confidence or 0)
    vector[-1] = float("bye" in text)
    return vector


def observations(row: dict):
    path = CACHE / (Path(row["source"]).stem + ".json")
    lines = json.loads(path.read_text(encoding="utf-8"))
    yield from observations_from_lines(lines)


def observations_from_lines(lines: list[dict]):
    numbered_lines = [item for item in lines if NUMBERED.match(item["text"])]
    for line in lines:
        match = NUMBERED.match(line["text"])
        if not match:
            continue
        number = int(match.group(1))
        value = match.group(2).strip(" .:-")
        if not value:
            nearby = [other for other in lines if other is not line
                      and other["page"] == line["page"]
                      and 5 <= abs(other["x"] - line["x"]) <= 350
                      and abs(other["y"] - line["y"]) <= min(24, max(16, line["height"] * 0.01))
                      and all(abs(other["y"] - line["y"]) <= abs(other["y"] - numbered["y"])
                              for numbered in numbered_lines if numbered is not line and numbered["page"] == line["page"])
                      and not NUMBERED.match(other["text"])]
            if nearby:
                nearest = min(nearby, key=lambda other: abs(other["x"] - line["x"]))
                value = nearest["text"].strip(" .:-")
        if 1 <= number <= 64 and value and not re.search(r"\b(?:players?|slots?|sample|round)\b", value, re.I):
            yield number, value, line


def read_split(split: str):
    rows = [json.loads(line) for line in (ROOT / f"{split}.jsonl").read_text(encoding="utf-8").splitlines()]
    vectors, targets = [], []
    for row in rows:
        slots = row["target"]["bracket_slots"]
        for number, text, line in observations(row):
            if number > len(slots):
                continue
            vectors.append(features(text, line.get("confidence")))
            targets.append(int(number in row["target"]["bye_slot_numbers"]))
    return np.stack(vectors), np.array(targets, dtype="int64"), rows


class ByeLineClassifier(nn.Layer):
    def __init__(self):
        super().__init__()
        self.layers = nn.Sequential(nn.Linear(16 * len(ALPHABET) + 3, 64), nn.ReLU(), nn.Linear(64, 2))

    def forward(self, x):
        return self.layers(x)


def evaluate(model, rows):
    model.eval()
    cases = []
    for row in rows:
        expected = row["target"]
        n = len(expected["bracket_slots"])
        slots = {}
        duplicate = set()
        for number, text, line in observations(row):
            if number > n:
                continue
            if number in slots:
                duplicate.add(number)
                continue
            with paddle.no_grad():
                probability = float(nn.functional.softmax(model(paddle.to_tensor(features(text, line.get("confidence"))[None, :])), axis=1)[0, 1])
            # Clear OCR text has priority; the learned classifier covers uncertain text.
            explicit_bye = bool(re.fullmatch(r"b[yv]e", text, re.I))
            clear_name = bool(re.fullmatch(r"[\w' .-]{5,}", text) and len(text.split()) >= 2)
            is_bye = explicit_bye or (not clear_name and probability >= 0.5)
            slots[number] = {"name": text, "bye": is_bye, "confidence": probability}
        actual_byes = set(expected["bye_slot_numbers"])
        predicted_byes = {number for number, item in slots.items() if item["bye"]}
        missing = sorted(set(range(1, n + 1)) - slots.keys())
        wrong_byes = sorted(number for number in slots if (number in predicted_byes) != (number in actual_byes))
        # A usable conversion requires every slot and BYE to be correct; OCR names
        # remain separate suggestions subject to roster mapping in the app.
        exact_structure = not missing and not duplicate and not wrong_byes
        cases.append({"source": row["source"], "slots": n, "observed": len(slots), "missing": missing,
                      "duplicates": sorted(duplicate), "wrong_byes": wrong_byes, "exact_structure": exact_structure})
    return {"documents": len(cases), "exact_structure": sum(x["exact_structure"] for x in cases), "cases": cases}


def main():
    paddle.seed(19)
    np.random.seed(19)
    x_train, y_train, train_rows = read_split("train")
    _, _, val_rows = read_split("val")
    _, _, test_rows = read_split("test")
    model = ByeLineClassifier()
    optimizer = paddle.optimizer.Adam(learning_rate=0.001, parameters=model.parameters())
    loss_fn = nn.CrossEntropyLoss()
    OUT.mkdir(parents=True, exist_ok=True)
    best = -1
    for epoch in range(1, 31):
        model.train()
        order = np.random.permutation(len(x_train))
        for start in range(0, len(order), 64):
            idx = order[start:start + 64]
            loss = loss_fn(model(paddle.to_tensor(x_train[idx])), paddle.to_tensor(y_train[idx]))
            loss.backward()
            optimizer.step()
            optimizer.clear_grad()
        val = evaluate(model, val_rows)
        print(json.dumps({"epoch": epoch, "validation_exact": val["exact_structure"]}), flush=True)
        if val["exact_structure"] > best:
            best = val["exact_structure"]
            best_epoch = epoch
            paddle.save(model.state_dict(), str(OUT / "model.pdparams"))
    model.set_state_dict(paddle.load(str(OUT / "model.pdparams")))
    report = {"scope": "OCR numbered slot and BYE classification; names remain OCR suggestions; connector topology unmodeled",
              "train_lines": len(x_train), "best_epoch": best_epoch,
              "validation": evaluate(model, val_rows), "test": evaluate(model, test_rows)}
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("REPORT " + str(OUT / "report.json"), flush=True)


if __name__ == "__main__":
    main()
