"""
main.py
=======
FastAPI backend for the HVI OCR pipeline.

Routes:
  GET  /              → index.html
  POST /api/ocr       → SSE stream: real-time logs + final JSON result
  POST /api/save      → Save final (user-confirmed) form to PostgreSQL
  GET  /api/fields    → Return ordered list of UI field names
"""

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Load .env before anything else
load_dotenv()

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("main")

# ── Lazy imports (OCR engine loads only on first request, not at startup) ──────
import ocr.engine as ocr_engine
import hvi.parser as hvi_parser
import hvi.mapper as hvi_mapper
import afis.parser as afis_parser
import afis.mapper as afis_mapper
import fibre.parser as fibre_parser
import fibre.mapper as fibre_mapper
import apct.parser as apct_parser
import apct.mapper as apct_mapper
import noils.parser as noils_parser
import noils.mapper as noils_mapper
import strech.parser as strech_parser
import strech.mapper as strech_mapper
import db.postgres as db

APP_DIR = Path(__file__).parent
STATIC_DIR = APP_DIR / "static"
UPLOAD_DIR = APP_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = FastAPI(title="HVI OCR System", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    logger.info("=" * 60)
    logger.info("HVI OCR System starting up")
    logger.info("=" * 60)
    # Warm up OCR engine in background (non-blocking — handled lazily)
    db.init_db()
    logger.info("Ready. Navigate to http://localhost:8000")


# ── SSE helpers ───────────────────────────────────────────────────────────────

def _sse(step: int, msg: str, data: Optional[dict] = None) -> str:
    """Format a single SSE event."""
    payload = {"step": step, "msg": msg}
    if data:
        payload["data"] = data
    return f"data: {json.dumps(payload)}\n\n"


def _sse_error(msg: str) -> str:
    return f"data: {json.dumps({'step': -1, 'msg': msg, 'error': True})}\n\n"


def _sse_done(result: dict) -> str:
    return f"data: {json.dumps({'step': 99, 'msg': 'Done', 'result': result})}\n\n"


def _normalize_doc_type(doc_type: str) -> str:
    """Normalize document type aliases to canonical names."""
    if not doc_type:
        return "hvi"
    normalized = doc_type.lower().replace("-", "_").replace(" ", "_")

    if normalized in {"fiber", "fibre"}:
        return "fibre"
    if "fiber" in normalized or "fibre" in normalized:
        return "fibre"
    if normalized in {"stretch", "strech", "stretch%", "strech%"}:
        return "strech"
    if "stretch" in normalized:
        return "strech"
    if "noils" in normalized or "nolis" in normalized:
        return "noils"
    if "comber" in normalized and ("noils" in normalized or "nolis" in normalized):
        return "noils"
    return normalized


def _detect_doc_type(raw_text: str, requested_doc_type: str) -> str:
    normalized_requested = _normalize_doc_type(requested_doc_type or "hvi")
    compact_text = re.sub(r"\s+", " ", raw_text or "").lower()

    if (
        re.search(r"\ba\s*%\s*report\b", compact_text)
        or "standard a%" in compact_text
        or re.search(r"\ba\s*%\s*\(?\s*n\s*[-+\u2212]\s*1\s*\)?", compact_text)
    ):
        return "apct"

    if "noils" in compact_text or "nolis" in compact_text:
        return "noils"

    if "stretch %" in compact_text or "strech %" in compact_text or "std. stretch" in compact_text or "std. strech" in compact_text:
        return "strech"

    if "fibre data entry" in compact_text or "fiber data entry" in compact_text:
        return "fibre"

    return normalized_requested


def _get_parser_and_mapper(doc_type: str):
    normalized = _normalize_doc_type(doc_type)
    if normalized == "fibre":
        return fibre_parser, fibre_mapper
    if normalized == "afis":
        return afis_parser, afis_mapper
    if normalized == "apct":
        return apct_parser, apct_mapper
    if normalized == "noils":
        return noils_parser, noils_mapper
    if normalized == "strech":
        return strech_parser, strech_mapper
    return hvi_parser, hvi_mapper


# ── Routes ────────────────────────────────────────────────────────────────────

def _extract_pdf_word_results(file_bytes: bytes, filename: str, pdf_page: str = "first"):
    if not filename.lower().endswith(".pdf"):
        return []

    try:
        import fitz
    except ImportError:
        return []

    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        try:
            if len(doc) == 0:
                return []
            if pdf_page == "all":
                words = []
                for page in doc:
                    words.extend(page.get_text("words") or [])
            else:
                page_index = len(doc) - 1 if pdf_page == "last" else 0
                page = doc.load_page(page_index)
                words = page.get_text("words") or []
        finally:
            doc.close()
    except Exception:
        return []

    results = []
    for word in words:
        if len(word) < 5:
            continue
        x0, y0, x1, y1, text = word[:5]
        text = str(text).strip()
        if not text:
            continue
        results.append(
            ocr_engine.OCRResult(
                text=text,
                confidence=1.0,
                bbox=[[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
            )
        )
    return results


def _reconstruct_with_pdf_text_if_needed(
    filename: str,
    file_bytes: bytes,
    parser,
    extracted_tables: list,
    doc_type: str = "hvi",
) -> list:
    if extracted_tables:
        return extracted_tables

    pdf_results = _extract_pdf_word_results(
        file_bytes,
        filename,
        pdf_page="last" if _normalize_doc_type(doc_type) == "fibre" else "all" if _normalize_doc_type(doc_type) == "noils" else "first",
    )
    if not pdf_results:
        return extracted_tables

    pdf_tables = parser.reconstruct_table(pdf_results)
    return pdf_tables or extracted_tables


def _maybe_reconstruct_noils_with_pdf_text(
    filename: str,
    file_bytes: bytes,
    parser,
    extracted_tables: list,
    doc_type: str = "hvi",
) -> list:
    if not filename.lower().endswith(".pdf") or _normalize_doc_type(doc_type) != "noils":
        return extracted_tables

    pdf_results = _extract_pdf_word_results(file_bytes, filename, pdf_page="all")
    if not pdf_results:
        return extracted_tables

    pdf_tables = parser.reconstruct_table(pdf_results)
    if not pdf_tables:
        return extracted_tables

    current_meta = extracted_tables[0] if extracted_tables and extracted_tables[0].get("Row Type") == "Meta" else {}
    pdf_meta = pdf_tables[0] if pdf_tables and pdf_tables[0].get("Row Type") == "Meta" else {}
    current_score = sum(1 for key in ("Test ID", "Machine ID") if current_meta.get(key))
    pdf_score = sum(1 for key in ("Test ID", "Machine ID") if pdf_meta.get(key))
    if pdf_score > current_score:
        return pdf_tables

    return extracted_tables


@app.get("/")
def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/api/fields")
def get_fields(doc_type: str = "hvi"):
    """Return ordered UI field names so the frontend can build the form dynamically."""
    normalized = _normalize_doc_type(doc_type)
    if normalized == "fibre":
        return {"fields": fibre_mapper.get_ui_field_names()}
    if normalized == "afis":
        return {"fields": afis_mapper.get_ui_field_names()}
    if normalized == "apct":
        return {"fields": apct_mapper.get_ui_field_names()}
    if normalized == "noils":
        return {"fields": noils_mapper.get_ui_field_names()}
    if normalized == "strech":
        return {"fields": strech_mapper.get_ui_field_names()}
    return {"fields": hvi_mapper.get_ui_field_names()}


@app.post("/api/ocr")
async def run_ocr(
    file: UploadFile = File(...),
    doc_type: str = Form("hvi")
):
    """
    SSE streaming endpoint: processes report and streams step-by-step logs.

    The final SSE event carries the full result:
      { step: 99, msg: "Done", result: { raw_text, extracted_tables, json_output } }
    """
    file_bytes = await file.read()
    filename = file.filename or "upload"

    async def generate():
        try:
            # Step 1: File received
            t0 = time.time()
            size_kb = len(file_bytes) // 1024
            logger.info(f"[Step 1] File received: {filename} ({size_kb} KB), type: {doc_type}")
            yield _sse(1, f"File received: {filename} ({size_kb} KB) - {doc_type.upper()}")

            # Step 2: Load OCR engine (cached after first call)
            yield _sse(2, "Loading OCR engine (cached after first use)...")
            logger.info("[Step 2] Getting OCR engine...")
            ocr_engine.get_engine()
            logger.info("[Step 2] OCR engine ready.")
            yield _sse(2, "OCR engine ready.")

            # Step 3: Run OCR
            yield _sse(3, "Running OCR inference (single pass)...")
            logger.info(f"[Step 3] Starting OCR on {filename}...")
            ocr_start = time.time()
            results = ocr_engine.extract_from_bytes(
                file_bytes,
                filename=filename,
                min_confidence=0.4,
                pdf_page="last" if _normalize_doc_type(doc_type) == "fibre" else "first",
            )
            ocr_elapsed = time.time() - ocr_start
            logger.info(f"[Step 3] OCR complete — {len(results)} regions in {ocr_elapsed:.2f}s")
            yield _sse(3, f"OCR complete — {len(results)} text regions found ({ocr_elapsed:.1f}s)")

            if not results:
                yield _sse_error("No text detected. Check image quality.")
                return

            # Step 4: Build raw text
            yield _sse(4, "Building raw text preview...")
            raw_text = "\n".join(r.text for r in results)
            logger.info(f"[Step 4] Raw text: {len(raw_text)} chars")
            yield _sse(4, f"Raw text assembled — {len(raw_text)} characters")

            effective_doc_type = _detect_doc_type(raw_text, doc_type)
            if effective_doc_type != doc_type:
                logger.info(f"[OCR Pipeline] Auto-detected {effective_doc_type} report from OCR text.")

            parser, mapper = _get_parser_and_mapper(effective_doc_type)

            # Step 5: Detect header row
            yield _sse(5, f"Detecting {effective_doc_type.upper()} header row from bounding boxes...")
            logger.info("[Step 5] Running table reconstruction...")
            extracted_tables = parser.reconstruct_table(results)
            extracted_tables = _maybe_reconstruct_noils_with_pdf_text(
                filename,
                file_bytes,
                parser,
                extracted_tables,
                effective_doc_type,
            )
            extracted_tables = _reconstruct_with_pdf_text_if_needed(
                filename,
                file_bytes,
                parser,
                extracted_tables,
                effective_doc_type,
            )
            if not extracted_tables:
                yield _sse_error(
                    f"Could not detect {effective_doc_type.upper()} table structure. "
                    "Ensure the image contains standard headers."
                )
                return
            col_summary = ", ".join(f"{k}" for k in extracted_tables[0].keys()) if extracted_tables else "None"
            logger.info(f"[Step 5] Table columns found: {col_summary}")
            yield _sse(5, f"Header detected — columns: {col_summary}")

            # Step 6: Row selection
            yield _sse(6, "Selecting data rows...")
            logger.info(f"[Step 6] Extracted {len(extracted_tables)} rows.")
            yield _sse(6, f"Selected {len(extracted_tables)} data rows.")

            # Step 7: Field mapping
            yield _sse(7, "Applying exact field mapping...")
            logger.info("[Step 7] Applying field mapping...")
            mapped_rows = mapper.apply_mapping(extracted_tables)
            total_fields = len(mapper.get_ui_field_names()) * len(mapped_rows)
            mapped_count = sum(len(r) for r in mapped_rows)
            logger.info(f"[Step 7] Mapping done — {mapped_count}/{total_fields} fields found across {len(mapped_rows)} rows.")
            yield _sse(7, f"Field mapping complete — mapped {len(mapped_rows)} rows.")

            # Step 8: Build JSON output
            yield _sse(8, "Building JSON output...")
            json_output = mapped_rows  # list of exact fields dicts
            logger.info(f"[Step 8] JSON output ready.")
            yield _sse(8, "JSON output ready")

            # Step 9: Done
            total_elapsed = time.time() - t0
            logger.info(f"[Step 9] Pipeline complete in {total_elapsed:.2f}s")
            yield _sse(9, f"Pipeline complete in {total_elapsed:.1f}s")

            # Final result event
            yield _sse_done({
                "filename": filename,
                "doc_type": effective_doc_type,
                "raw_text": raw_text,
                "extracted_tables": extracted_tables,
                "json_output": json_output,
                "fields": mapper.get_ui_field_names(),
            })

        except Exception as e:
            logger.exception(f"[OCR Pipeline] Unexpected error: {e}")
            yield _sse_error(f"Error: {str(e)}")

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/ocr-json")
async def run_ocr_json(
    file: UploadFile = File(...),
    doc_type: str = Form("hvi")
):
    """
    Standard JSON endpoint for the Node.js backend to call.
    Receives file, blocks until OCR is finished, and returns the final JSON directly.
    """
    file_bytes = await file.read()
    filename = file.filename or "upload"
    
    logger.info(f"Received JSON block request for: {filename}, type: {doc_type}")
    
    try:
        # Load OCR engine
        ocr_engine.get_engine()
        
        # Run OCR
        results = ocr_engine.extract_from_bytes(
            file_bytes,
            filename=filename,
            min_confidence=0.4,
            pdf_page="last" if _normalize_doc_type(doc_type) == "fibre" else "first",
        )
        
        if not results:
            raise HTTPException(status_code=400, detail="No text detected. Check image quality.")
            
        raw_text = "\n".join(r.text for r in results)
        
        effective_doc_type = _detect_doc_type(raw_text, doc_type)
        parser, mapper = _get_parser_and_mapper(effective_doc_type)
        extracted_tables = parser.reconstruct_table(results)
        extracted_tables = _maybe_reconstruct_noils_with_pdf_text(
            filename,
            file_bytes,
            parser,
            extracted_tables,
            effective_doc_type,
        )
        extracted_tables = _reconstruct_with_pdf_text_if_needed(
            filename,
            file_bytes,
            parser,
            extracted_tables,
            effective_doc_type,
        )
        if not extracted_tables:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Could not detect {effective_doc_type.upper()} table structure. "
                    "Ensure the image contains standard headers."
                ),
            )
        mapped_data = mapper.apply_mapping(extracted_tables)
            
        return {
            "success": True,
            "filename": filename,
            "doc_type": effective_doc_type,
            "data": mapped_data,
            "raw_tables": extracted_tables,
            "extracted_tables": extracted_tables,
            "json_output": mapped_data,
            "fields": mapper.get_ui_field_names(),
            "raw_text": raw_text,
        }
        
    except Exception as e:
        logger.error(f"OCR Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class SavePayload(BaseModel):
    filename: str = ""
    ocr_json: list = []
    manual_json: list = []
    doc_type: str = "hvi"


@app.post("/api/save")
def save_record(payload: SavePayload):
    """Save user-confirmed form data to PostgreSQL."""
    if not payload.manual_json:
        raise HTTPException(status_code=400, detail="No fields to save.")

    try:
        record_id = db.save_record(
            filename=payload.filename,
            ocr_json=payload.ocr_json,
            manual_json=payload.manual_json,
            doc_type=payload.doc_type,
        )
        logger.info(f"[Save] Saved record id={record_id} for '{payload.filename}'")
        return {"id": record_id, "status": "saved"}
    except RuntimeError as e:
        logger.error(f"[Save] DB error: {e}")
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/recent")
def recent_records():
    return {"items": db.get_recent()}
