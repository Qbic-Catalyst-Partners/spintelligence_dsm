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
import bwc.parser as bwc_parser
import bwc.mapper as bwc_mapper
import apct.parser as apct_parser
import apct.mapper as apct_mapper
import noils.parser as noils_parser
import noils.mapper as noils_mapper
import strech.parser as strech_parser
import strech.mapper as strech_mapper
import carding.parser as carding_parser
import carding.mapper as carding_mapper
import drawing.parser as drawing_parser
import drawing.mapper as drawing_mapper
import simplex.parser as simplex_parser
import simplex.mapper as simplex_mapper
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


def _carding_pdf_tables(file_bytes: bytes, filename: str) -> list:
    if not filename.lower().endswith(".pdf"):
        return []
    return carding_parser.reconstruct_pdf_tables(file_bytes)


def _drawing_pdf_tables(file_bytes: bytes, filename: str) -> list:
    if not filename.lower().endswith(".pdf"):
        return []
    return drawing_parser.reconstruct_pdf_tables(file_bytes)


def _simplex_pdf_tables(file_bytes: bytes, filename: str) -> list:
    if not filename.lower().endswith(".pdf"):
        return []
    return simplex_parser.reconstruct_pdf_tables(file_bytes)


def _rows_to_raw_text(rows: list, field_names: list) -> str:
    return "\n".join(
        " | ".join(str(row.get(field, "")) for field in field_names)
        for row in rows
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def index():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/card")
def card_entry():
    return FileResponse(str(STATIC_DIR / "card.html"))


@app.get("/apct")
def apct_entry():
    return FileResponse(str(STATIC_DIR / "apct.html"))


@app.get("/noils")
def noils_entry():
    return FileResponse(str(STATIC_DIR / "noils.html"))


@app.get("/strech")
def strech_entry():
    return FileResponse(str(STATIC_DIR / "strech.html"))


@app.get("/carding")
def carding_entry():
    return FileResponse(str(STATIC_DIR / "carding.html"))


@app.get("/drawing")
def drawing_entry():
    return FileResponse(str(STATIC_DIR / "drawing.html"))


@app.get("/simplex")
def simplex_entry():
    return FileResponse(str(STATIC_DIR / "simplex.html"))


@app.get("/api/fields")
def get_fields(doc_type: str = "hvi"):
    """Return ordered UI field names so the frontend can build the form dynamically."""
    if doc_type == "afis":
        return {"fields": afis_mapper.get_ui_field_names()}
    if doc_type == "bwc":
        return {"fields": bwc_mapper.get_ui_field_names()}
    if doc_type == "apct":
        return {"fields": apct_mapper.get_ui_field_names()}
    if doc_type == "noils":
        return {"fields": noils_mapper.get_ui_field_names()}
    if doc_type == "strech":
        return {"fields": strech_mapper.get_ui_field_names()}
    if doc_type == "carding":
        return {"fields": carding_mapper.get_ui_field_names()}
    if doc_type == "drawing":
        return {"fields": drawing_mapper.get_ui_field_names()}
    if doc_type == "simplex":
        return {"fields": simplex_mapper.get_ui_field_names()}
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

            if doc_type == "carding":
                pdf_tables = _carding_pdf_tables(file_bytes, filename)
                if pdf_tables:
                    yield _sse(2, "Reading searchable Carding PDF table directly...")
                    mapped_rows = carding_mapper.apply_mapping(pdf_tables)
                    yield _sse_done({
                        "filename": filename,
                        "raw_text": _rows_to_raw_text(mapped_rows, carding_mapper.get_ui_field_names()),
                        "extracted_tables": pdf_tables,
                        "json_output": mapped_rows,
                    })
                    logger.info(f"[Carding PDF] Pipeline complete in {time.time() - t0:.2f}s")
                    return

            if doc_type == "drawing":
                pdf_tables = _drawing_pdf_tables(file_bytes, filename)
                if pdf_tables:
                    yield _sse(2, "Reading searchable Drawing PDF table directly...")
                    mapped_rows = drawing_mapper.apply_mapping(pdf_tables)
                    yield _sse_done({
                        "filename": filename,
                        "raw_text": _rows_to_raw_text(mapped_rows, drawing_mapper.get_ui_field_names()),
                        "extracted_tables": pdf_tables,
                        "json_output": mapped_rows,
                    })
                    logger.info(f"[Drawing PDF] Pipeline complete in {time.time() - t0:.2f}s")
                    return

            if doc_type == "simplex":
                pdf_tables = _simplex_pdf_tables(file_bytes, filename)
                if pdf_tables:
                    yield _sse(2, "Reading searchable Simplex Wrapping PDF table directly...")
                    mapped_rows = simplex_mapper.apply_mapping(pdf_tables)
                    yield _sse_done({
                        "filename": filename,
                        "raw_text": _rows_to_raw_text(mapped_rows, simplex_mapper.get_ui_field_names()),
                        "extracted_tables": pdf_tables,
                        "json_output": mapped_rows,
                    })
                    logger.info(f"[Simplex PDF] Pipeline complete in {time.time() - t0:.2f}s")
                    return

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
                file_bytes, filename=filename, min_confidence=0.4
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

            # Choose parser/mapper based on doc_type
            if doc_type == "afis":
                parser = afis_parser
                mapper = afis_mapper
            elif doc_type == "bwc":
                parser = bwc_parser
                mapper = bwc_mapper
            elif doc_type == "apct":
                parser = apct_parser
                mapper = apct_mapper
            elif doc_type == "noils":
                parser = noils_parser
                mapper = noils_mapper
            elif doc_type == "strech":
                parser = strech_parser
                mapper = strech_mapper
            elif doc_type == "carding":
                parser = carding_parser
                mapper = carding_mapper
            elif doc_type == "drawing":
                parser = drawing_parser
                mapper = drawing_mapper
            elif doc_type == "simplex":
                parser = simplex_parser
                mapper = simplex_mapper
            else:
                parser = hvi_parser
                mapper = hvi_mapper

            # Step 5: Detect header row
            yield _sse(5, f"Detecting {doc_type.upper()} header row from bounding boxes...")
            logger.info("[Step 5] Running table reconstruction...")
            extracted_tables = parser.reconstruct_table(results)
            if not extracted_tables:
                yield _sse_error(
                    f"Could not detect {doc_type.upper()} table structure. "
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
                "raw_text": raw_text,
                "extracted_tables": extracted_tables,
                "json_output": json_output,
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
    import asyncio
    
    file_bytes = await file.read()
    filename = file.filename or "upload"
    
    logger.info(f"Received JSON block request for: {filename}, type: {doc_type}")
    
    try:
        if doc_type == "carding":
            tables = _carding_pdf_tables(file_bytes, filename)
            if tables:
                mapped_data = carding_mapper.apply_mapping(tables)
                return {
                    "success": True,
                    "filename": filename,
                    "doc_type": doc_type,
                    "data": mapped_data,
                    "raw_tables": tables,
                    "source": "pdf-text"
                }

        if doc_type == "drawing":
            tables = _drawing_pdf_tables(file_bytes, filename)
            if tables:
                mapped_data = drawing_mapper.apply_mapping(tables)
                return {
                    "success": True,
                    "filename": filename,
                    "doc_type": doc_type,
                    "data": mapped_data,
                    "raw_tables": tables,
                    "source": "pdf-text"
                }

        if doc_type == "simplex":
            tables = _simplex_pdf_tables(file_bytes, filename)
            if tables:
                mapped_data = simplex_mapper.apply_mapping(tables)
                return {
                    "success": True,
                    "filename": filename,
                    "doc_type": doc_type,
                    "data": mapped_data,
                    "raw_tables": tables,
                    "source": "pdf-text"
                }

        # Load OCR engine
        ocr_engine.get_engine()
        
        # Run OCR
        results = ocr_engine.extract_from_bytes(
            file_bytes, filename=filename, min_confidence=0.4
        )
        
        if not results:
            raise HTTPException(status_code=400, detail="No text detected. Check image quality.")
            
        raw_text = "\n".join(r.text for r in results)
        
        # Parse and Map based on doc_type
        if doc_type == "afis":
            tables = afis_parser.reconstruct_table(results)
            mapped_data = afis_mapper.apply_mapping(tables)
        elif doc_type == "bwc":
            tables = bwc_parser.reconstruct_table(results)
            mapped_data = bwc_mapper.apply_mapping(tables)
        elif doc_type == "apct":
            tables = apct_parser.reconstruct_table(results)
            mapped_data = apct_mapper.apply_mapping(tables)
        elif doc_type == "noils":
            tables = noils_parser.reconstruct_table(results)
            mapped_data = noils_mapper.apply_mapping(tables)
        elif doc_type == "strech":
            tables = strech_parser.reconstruct_table(results)
            mapped_data = strech_mapper.apply_mapping(tables)
        elif doc_type == "carding":
            tables = carding_parser.reconstruct_table(results)
            mapped_data = carding_mapper.apply_mapping(tables)
        elif doc_type == "drawing":
            tables = drawing_parser.reconstruct_table(results)
            mapped_data = drawing_mapper.apply_mapping(tables)
        elif doc_type == "simplex":
            tables = simplex_parser.reconstruct_table(results)
            mapped_data = simplex_mapper.apply_mapping(tables)
        else:
            tables = hvi_parser.reconstruct_table(results)
            mapped_data = hvi_mapper.apply_mapping(tables)
            
        return {
            "success": True,
            "filename": filename,
            "doc_type": doc_type,
            "data": mapped_data,
            "raw_tables": tables
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
