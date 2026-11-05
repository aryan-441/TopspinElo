"""Produce a reviewable app-format knockout draft from a PDF or image.

Uses PDF text when available, PaddleOCR for scans, and the trained BYE line
classifier. Names still require roster mapping and organiser review.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(ROOT / ".paddlex-cache"))
os.environ.setdefault("HF_HOME", str(ROOT / ".hf-cache"))
os.environ.setdefault("MODELSCOPE_CACHE", str(ROOT / ".modelscope-cache"))
os.environ.setdefault("FLAGS_use_mkldnn", "0")
os.environ.setdefault("FLAGS_enable_pir_api", "0")

import cv2  # noqa: E402
import fitz  # noqa: E402
import numpy as np  # noqa: E402
import paddle  # noqa: E402
from paddle import nn  # noqa: E402
from paddleocr import PaddleOCR  # noqa: E402

if __package__:
    from .app import recognize  # noqa: E402
    from .train_ocr_bracket_parser import ByeLineClassifier, features, observations_from_lines  # noqa: E402
else:
    from app import recognize  # noqa: E402
    from train_ocr_bracket_parser import ByeLineClassifier, features, observations_from_lines  # noqa: E402


def pdf_lines(path: Path) -> list[dict]:
    lines = []
    engine = None
    with fitz.open(path) as doc:
        for page_number, page in enumerate(doc, 1):
            if len(page.get_text("words")) >= 15:
                for block in page.get_text("dict")["blocks"]:
                    for item in block.get("lines", []):
                        text = "".join(span["text"] for span in item["spans"]).strip()
                        if text:
                            lines.append({"text": text, "confidence": 1.0, "page": page_number,
                                          "x": item["bbox"][0], "y": item["bbox"][1],
                                          "width": page.rect.width, "height": page.rect.height})
            else:
                if engine is None:
                    engine = PaddleOCR(text_detection_model_name="PP-OCRv5_mobile_det",
                                       text_recognition_model_name="PP-OCRv5_mobile_rec",
                                       use_doc_orientation_classify=False, use_doc_unwarping=False,
                                       use_textline_orientation=False, enable_mkldnn=False, device="cpu")
                pix = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
                image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
                lines.extend(recognize(cv2.cvtColor(image[:, :, :3], cv2.COLOR_RGB2BGR), page_number, engine))
    return lines


def draft(lines: list[dict]) -> dict:
    model = ByeLineClassifier()
    model.set_state_dict(paddle.load(str(ROOT / "training_data" / "models" / "bracket_ocr_parser_v1" / "model.pdparams")))
    model.eval()
    found = {}
    duplicates = set()
    for number, name, line in observations_from_lines(lines):
        if number in found:
            duplicates.add(number)
            continue
        with paddle.no_grad():
            probability = float(nn.functional.softmax(model(paddle.to_tensor(features(name, line.get("confidence"))[None, :])), axis=1)[0, 1])
        explicit_bye = name.casefold() in ("bye", "bve")
        clear_name = len(name.split()) >= 2 and len(name) >= 5
        is_bye = explicit_bye or (not clear_name and probability >= 0.5)
        found[number] = {"name": None if is_bye else name, "bye": is_bye, "confidence": line.get("confidence"), "modelByeScore": probability}
    if not found:
        raise ValueError("No numbered bracket slots were recognized")
    slot_count = 1 << (max(found) - 1).bit_length()
    if slot_count > 64:
        raise ValueError("Brackets larger than 64 slots are not supported")
    missing = sorted(set(range(1, slot_count + 1)) - found.keys())
    slots = [found.get(i, {}).get("name") for i in range(1, slot_count + 1)]
    byes = sorted(i for i, value in found.items() if value["bye"])
    return {"format": "Knockout", "bracketSlots": slots, "byeSlotNumbers": byes,
            "entries": [{"name": value["name"], "slot": number, "confidence": value["confidence"]}
                        for number, value in sorted(found.items()) if not value["bye"]],
            "openingMatches": [slots[i:i + 2] for i in range(0, slot_count, 2)],
            "review": {"missingSlots": missing, "duplicateSlots": sorted(duplicates),
                       "requiresReview": True, "notes": ["Map names to registered app entrants and confirm every BYE and match before applying.",
                                                        "Later-round connector paths are not inferred by this model."]}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.source.suffix.lower() == ".pdf":
        lines = pdf_lines(args.source)
    else:
        engine = PaddleOCR(text_detection_model_name="PP-OCRv5_mobile_det",
                           text_recognition_model_name="PP-OCRv5_mobile_rec",
                           use_doc_orientation_classify=False, use_doc_unwarping=False,
                           use_textline_orientation=False, enable_mkldnn=False, device="cpu")
        image = cv2.imread(str(args.source))
        if image is None:
            raise ValueError("Unreadable image")
        lines = recognize(image, 1, engine)
    result = draft(lines)
    output = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output)


if __name__ == "__main__":
    main()
