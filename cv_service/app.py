"""Local beta OCR service for reviewable draw and sectioned group-roster scans."""
from __future__ import annotations

import re
import os
from io import BytesIO
from pathlib import Path
from threading import Lock
from typing import Any

import cv2
import fitz
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(Path(__file__).resolve().parent / ".paddlex-cache"))
os.environ.setdefault("HF_HOME", str(Path(__file__).resolve().parent / ".hf-cache"))
os.environ.setdefault("FLAGS_use_mkldnn", "0")
from paddleocr import PaddleOCR

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_PAGES = 12

app = FastAPI(title="Rallydesk CV beta", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_ocr: PaddleOCR | None = None
_group_ocr: PaddleOCR | None = None
_bracket_ocr: PaddleOCR | None = None
_recognition_lock = Lock()


def bracket_ocr_engine() -> PaddleOCR:
    global _bracket_ocr
    if _bracket_ocr is None:
        _bracket_ocr = PaddleOCR(text_detection_model_name="PP-OCRv5_mobile_det",
                                 text_recognition_model_name="PP-OCRv5_mobile_rec",
                                 use_doc_orientation_classify=False, use_doc_unwarping=False,
                                 use_textline_orientation=False, enable_mkldnn=False, device="cpu")
    return _bracket_ocr


def ocr_engine() -> PaddleOCR:
    global _ocr
    if _ocr is None:
        # Marathi uses Devanagari. PaddleOCR's mr pipeline selects its Devanagari model.
        _ocr = PaddleOCR(lang="mr", use_doc_orientation_classify=True, use_doc_unwarping=True,
                         use_textline_orientation=True, device="cpu")
    return _ocr


def group_ocr_engine() -> PaddleOCR:
    """Load a separately trained group-name recognizer when one is configured."""
    global _group_ocr
    model_dir = os.environ.get("GROUP_OCR_REC_MODEL_DIR", "").strip()
    if not model_dir:
        return bracket_ocr_engine()
    if _group_ocr is None:
        if not Path(model_dir).is_dir():
            raise RuntimeError(f"GROUP_OCR_REC_MODEL_DIR is not a directory: {model_dir}")
        _group_ocr = PaddleOCR(
            text_recognition_model_dir=model_dir,
            use_doc_orientation_classify=True,
            use_doc_unwarping=True,
            use_textline_orientation=True,
            device="cpu",
        )
    return _group_ocr


def document_pages(data: bytes, content_type: str) -> list[np.ndarray]:
    if content_type == "application/pdf" or data.startswith(b"%PDF"):
        try:
            doc = fitz.open(stream=data, filetype="pdf")
        except Exception as exc:
            raise HTTPException(422, "Could not open this PDF. Try a clear scan or image export.") from exc
        if len(doc) > MAX_PAGES:
            raise HTTPException(413, f"PDFs are limited to {MAX_PAGES} pages in the beta importer.")
        pages = []
        for page in doc:
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            rgb = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
            pages.append(cv2.cvtColor(rgb[:, :, :3], cv2.COLOR_RGB2BGR))
        return pages
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(422, "The file is not a readable image.")
    return [image]


def draw_document_lines(data: bytes, content_type: str, min_words: int = 15) -> tuple[list[dict[str, Any]], list[tuple[int, np.ndarray]], int]:
    """Read selectable PDF text directly and reserve OCR for scanned pages."""
    if content_type != "application/pdf" and not data.startswith(b"%PDF"):
        return [], [(1, image) for image in document_pages(data, content_type)], 1
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise HTTPException(422, "Could not open this PDF. Try a clear scan or image export.") from exc
    with doc:
        if len(doc) > MAX_PAGES:
            raise HTTPException(413, f"PDFs are limited to {MAX_PAGES} pages in the beta importer.")
        lines: list[dict[str, Any]] = []
        scans: list[tuple[int, np.ndarray]] = []
        for page_number, page in enumerate(doc, start=1):
            if len(page.get_text("words")) >= min_words:
                for block in page.get_text("dict")["blocks"]:
                    for item in block.get("lines", []):
                        text = "".join(span["text"] for span in item["spans"]).strip()
                        if text:
                            lines.append({"text": text, "confidence": 1.0, "page": page_number,
                                          "x": item["bbox"][0], "y": item["bbox"][1],
                                          "width": page.rect.width, "height": page.rect.height})
                continue
            pixmap = page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False)
            rgb = np.frombuffer(pixmap.samples, dtype=np.uint8).reshape(pixmap.height, pixmap.width, pixmap.n)
            scans.append((page_number, cv2.cvtColor(rgb[:, :, :3], cv2.COLOR_RGB2BGR)))
        return lines, scans, len(doc)


def _result_dict(result: Any) -> dict[str, Any]:
    value = getattr(result, "json", {})
    if callable(value):
        value = value()
    if isinstance(value, str):
        import json
        value = json.loads(value)
    if not isinstance(value, dict):
        return {}
    return value.get("res", value)


def recognize(image: np.ndarray, page_number: int, engine: PaddleOCR | None = None) -> list[dict[str, Any]]:
    height, width = image.shape[:2]
    scale = max(1.0, 1800 / max(height, width))
    if scale > 1:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    output: list[dict[str, Any]] = []
    for result in (engine or ocr_engine()).predict(image):
        payload = _result_dict(result)
        texts = payload.get("rec_texts", [])
        scores = payload.get("rec_scores", [])
        polygons = payload.get("rec_polys", payload.get("dt_polys", []))
        for index, raw in enumerate(texts):
            text = str(raw).strip()
            if not text:
                continue
            polygon = polygons[index] if index < len(polygons) else []
            xs = [float(point[0]) for point in polygon] if len(polygon) else [0]
            ys = [float(point[1]) for point in polygon] if len(polygon) else [index * 25]
            output.append({"text": text, "confidence": round(float(scores[index]), 3) if index < len(scores) else None,
                           "page": page_number, "x": min(xs), "y": min(ys), "width": width, "height": height})
    return sorted(output, key=lambda row: (row["y"], row["x"]))


def extract_entries(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    # OCR gives us names and printed slot numbers. BYE is matched by vertical proximity;
    # matches are never finalized here because line-art connectors still need human review.
    numbered: list[dict[str, Any]] = []
    bye_labels = [line for line in lines if re.search(r"\bBYE\b", line["text"], re.I)]
    for line in lines:
        match = re.match(r"^\s*(\d{1,3})\s*[.)]?\s+(.+?)\s*$", line["text"])
        if not match:
            continue
        number, name = int(match.group(1)), match.group(2).strip(" -–—:")
        if not name or re.fullmatch(r"BYE", name, re.I):
            continue
        nearby = [bye for bye in bye_labels if bye["page"] == line["page"] and
                  abs(bye["y"] - line["y"]) < max(22, line["height"] * 0.65)]
        confidence = line["confidence"]
        numbered.append({"slot": number, "name": name, "bye": bool(nearby), "confidence": confidence,
                         "page": line["page"], "status": "review" if confidence is None or confidence < 0.8 else "recognized"})
    unique: dict[int, dict[str, Any]] = {}
    for entry in numbered:
        unique.setdefault(entry["slot"], entry)
    return [unique[key] for key in sorted(unique)]


def extract_group_assignments(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Read a conservative, sectioned group roster and leave every row reviewable."""
    heading = re.compile(r"^\s*(?:group|grp\.?|pool)\s*[:#-]?\s*([a-z]|\d{1,2})\s*$", re.I)
    ignored = re.compile(r"^(?:#|no\.?|seed|rank|pos(?:ition)?|player|name|played|matches|wins?|losses?|draws?|games?|points?|pts?)$", re.I)
    groups: dict[str, dict[str, Any]] = {}
    current: dict[str, Any] | None = None
    current_page: int | None = None
    for line in lines:
        page = int(line.get("page", 1))
        if current_page is not None and page != current_page:
            current = None
        current_page = page
        text = re.sub(r"\s+", " ", str(line.get("text", ""))).strip()
        if not text:
            continue
        match = heading.match(text)
        if match:
            label = match.group(1).upper()
            current = groups.setdefault(label, {"name": f"Group {label}", "entries": []})
            continue
        if current is None or ignored.fullmatch(text.strip(" :.-")):
            continue
        # Ignore table statistics when OCR returns a separate numeric cell.
        if re.fullmatch(r"[\d\s./:-]+", text):
            continue
        numbered = re.match(r"^\s*(?:\d{1,2}[.)]?|[-•])\s+(.+?)\s*$", text)
        name = (numbered.group(1) if numbered else text).strip(" -–—:|")
        if not name or len(name) > 80 or ignored.fullmatch(name):
            continue
        entry = {"name": name, "confidence": line.get("confidence"), "page": page,
                 "status": "review" if line.get("confidence") is None or line["confidence"] < 0.8 else "recognized"}
        if not any(existing["name"].casefold() == name.casefold() for existing in current["entries"]):
            current["entries"].append(entry)
    return [group for group in groups.values() if group["entries"]]


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ready", "engine": "PaddleOCR", "beta": True}


@app.post("/api/draw/recognize")
def recognize_draw(file: UploadFile = File(...)) -> dict[str, Any]:
    if file.content_type != "application/pdf" or not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(415, "AI import accepts PDF files only, up to 20 MB.")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "The beta importer accepts files up to 20 MB.")
    if not data.startswith(b"%PDF-"):
        raise HTTPException(415, "This file is not a valid PDF.")
    lines, scans, page_count = draw_document_lines(data, file.content_type)
    if scans:
        with _recognition_lock:
            engine = bracket_ocr_engine()
            for page_number, image in scans:
                lines.extend(recognize(image, page_number, engine))
    if __package__:
        from .predict_bracket import draft
    else:
        from predict_bracket import draft
    try:
        structure = draft(lines)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(422, f"Bracket structure could not be read: {exc}") from exc
    entries = [{"slot": entry["slot"], "name": entry["name"], "bye": False,
                "confidence": entry["confidence"], "page": 1, "status": "review"}
               for entry in structure["entries"]]
    if not entries:
        raise HTTPException(422, "No numbered entrant list was recognized. Use the manual entrant form or try a clearer scan.")
    return {"beta": True, "sourceName": file.filename, "pages": page_count, "entries": entries,
            "structureDraft": structure, "warnings": structure["review"]["notes"]}
