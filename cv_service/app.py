"""Local beta OCR service for extracting entrants and bye labels from draw scans."""
from __future__ import annotations

import re
from io import BytesIO
from typing import Any

import cv2
import fitz
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR

MAX_UPLOAD_BYTES = 20 * 1024 * 1024
MAX_PAGES = 12
ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/webp", "image/tiff"}

app = FastAPI(title="Rallydesk CV beta", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

_ocr: PaddleOCR | None = None


def ocr_engine() -> PaddleOCR:
    global _ocr
    if _ocr is None:
        # Marathi uses Devanagari. PaddleOCR's mr pipeline selects its Devanagari model.
        _ocr = PaddleOCR(lang="mr", use_doc_orientation_classify=True, use_doc_unwarping=True,
                         use_textline_orientation=True, device="cpu")
    return _ocr


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


def recognize(image: np.ndarray, page_number: int) -> list[dict[str, Any]]:
    height, width = image.shape[:2]
    scale = max(1.0, 1800 / max(height, width))
    if scale > 1:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    output: list[dict[str, Any]] = []
    for result in ocr_engine().predict(image):
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


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ready", "engine": "PaddleOCR", "beta": True}


@app.post("/api/draw/recognize")
async def recognize_draw(file: UploadFile = File(...)) -> dict[str, Any]:
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(415, "Upload a PDF or a JPG, PNG, WEBP, or TIFF image.")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "The beta importer accepts files up to 20 MB.")
    pages = document_pages(data, file.content_type)
    lines: list[dict[str, Any]] = []
    for page_number, image in enumerate(pages, start=1):
        lines.extend(recognize(image, page_number))
    entries = extract_entries(lines)
    if not entries:
        raise HTTPException(422, "No numbered entrant list was recognized. Use the manual entrant form or try a clearer scan.")
    return {"beta": True, "languageModel": "Devanagari/Marathi", "sourceName": file.filename,
            "pages": len(pages), "entries": entries, "warnings": [
                "Names and bye labels are OCR suggestions. Confirm every row before using this draw.",
                "Bracket connector lines are not imported yet; entrant order and bye detection are the beta scope.",
            ]}
