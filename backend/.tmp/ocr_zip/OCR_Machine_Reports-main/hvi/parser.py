"""
hvi/parser.py
=============
HVI report table reconstruction and row selection.

Algorithm:
  1. Find the header row — the OCR row containing the most known HVI column tokens.
  2. Compute column centers from header token bounding boxes.
  3. Group all remaining OCR results into rows (by Y-proximity).
  4. Assign each cell to its nearest column center.
  5. Row selection: Pick the first fully numeric row (data row).
  6. Ignore: CV%, Std.Dev, Min, Max, Q99%, n (count), Average, empty rows.
"""

import logging
import re
from typing import Dict, List, Optional, Tuple

from ocr.engine import OCRResult

logger = logging.getLogger("hvi.parser")

# ── Known HVI column headers (in order of importance for header detection) ────
# We allow partial/fuzzy matches for headers because OCR sometimes misreads
# brackets or units. The key is the canonical name; values are OCR variants.
HEADER_TOKENS: Dict[str, List[str]] = {
    "SCI":   ["SCI", "SCI"],
    "Grade": ["Grade", "grade"],
    "Mst":   ["Mst", "MST", "mst"],
    "Mic":   ["Mic", "MIC", "mic"],
    "Mat":   ["Mat", "MAT", "mat", "Mat1"],
    "SL2":   ["SL2", "sl2", "SL 2"],
    "UR":    ["UR", "ur", "UR)"],
    "SF":    ["SF", "sf"],
    "Str":   ["Str", "STR", "str"],
    "Elg":   ["Elg", "ELG", "elg"],
    "Rd":    ["Rd", "RD", "rd"],
    "+b":    ["+b", "+B", "b"],
    "CGrd":  ["CGrd", "cgrd", "Cgrd", "CGrd"],
    "TrCnt": ["TrCnt", "trcnt"],
    "TrAr":  ["TrAr", "trar"],
    "TrID":  ["TrID", "trid"],
    "Amt":   ["Amt", "AMT", "amt"],
}

# Rows to skip (they are statistical, not measurement data)
SKIP_ROW_PATTERNS = re.compile(
    r"^(cv%|cv\s*%|std\.?dev|min|max|q99|n\s*$|average\s*$)", re.IGNORECASE
)

# A cell is "numeric" if it's a number (possibly with decimal point/hyphen dash for grade codes)
NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?$")
GRADE_RE = re.compile(r"^\d{2}-\d$")  # e.g. "31-3"


def _is_numeric_or_grade(text: str) -> bool:
    t = text.strip()
    return bool(NUMERIC_RE.match(t) or GRADE_RE.match(t))


def _cell_x_center(result: OCRResult) -> float:
    return result.x_center


def _group_into_rows(results: List[OCRResult], y_tolerance: int = 15) -> List[List[OCRResult]]:
    """
    Group OCR results into rows using Y proximity.
    Cells whose y_top values differ by <= y_tolerance are in the same row.
    """
    if not results:
        return []

    sorted_results = sorted(results, key=lambda r: r.y_top)
    rows: List[List[OCRResult]] = []
    current_row = [sorted_results[0]]
    current_y = sorted_results[0].y_top

    for r in sorted_results[1:]:
        if abs(r.y_top - current_y) <= y_tolerance:
            current_row.append(r)
        else:
            rows.append(sorted(current_row, key=lambda x: x.x_left))
            current_row = [r]
            current_y = r.y_top

    rows.append(sorted(current_row, key=lambda x: x.x_left))
    return rows


def _normalize(text: str) -> str:
    return text.strip().lower()


def _match_header_token(text: str) -> Optional[str]:
    """Return the canonical header name if the text matches any known token."""
    t = text.strip()
    for canonical, variants in HEADER_TOKENS.items():
        if t in variants or t.lower() == canonical.lower():
            return canonical
    return None


def _find_header_row(rows: List[List[OCRResult]]) -> Tuple[int, Dict[str, float]]:
    """
    Scan rows top-to-bottom; pick the row with the most header token matches.
    Returns (row_index, {canonical_name: x_center}).
    """
    best_idx = -1
    best_score = 0
    best_col_centers: Dict[str, float] = {}

    for i, row in enumerate(rows):
        col_centers: Dict[str, float] = {}
        for cell in row:
            canon = _match_header_token(cell.text)
            if canon:
                col_centers[canon] = cell.x_center
        score = len(col_centers)
        if score > best_score:
            best_score = score
            best_idx = i
            best_col_centers = col_centers

    if best_idx == -1 or best_score < 3:
        logger.warning(
            f"[HVI Parser] Header row not confidently detected (best score={best_score}). "
            "Falling back to row 0."
        )
        best_idx = 0

    logger.info(
        f"[HVI Parser] Header row at index {best_idx} with {best_score} columns: "
        + ", ".join(f"{k}@{v:.0f}" for k, v in best_col_centers.items())
    )
    return best_idx, best_col_centers


def _assign_to_column(x: float, col_centers: Dict[str, float]) -> Optional[str]:
    """Assign an x-coordinate to the nearest column by center distance."""
    if not col_centers:
        return None
    return min(col_centers, key=lambda name: abs(col_centers[name] - x))


def _row_label(cells: List[OCRResult]) -> str:
    """Return the first text cell of a row (usually the row label like 'Average')."""
    return cells[0].text.strip() if cells else ""


def _is_skip_row(cells: List[OCRResult]) -> bool:
    label = _row_label(cells)
    return bool(SKIP_ROW_PATTERNS.match(label))


def _is_average_row(cells: List[OCRResult]) -> bool:
    for cell in cells:
        if cell.text.strip().lower() == "average":
            return True
    return False


def _is_numeric_row(cells: List[OCRResult]) -> bool:
    """True if most cells look like numbers (ignores label cell)."""
    candidates = [c for c in cells if _is_numeric_or_grade(c.text)]
    return len(candidates) >= 3


def reconstruct_table(
    results: List[OCRResult],
    y_tolerance: int = 15,
) -> Dict[str, str]:
    """
    Full HVI table reconstruction pipeline.

    Args:
        results:      Raw OCR results from the engine
        y_tolerance:  Max Y-pixel difference to consider cells in the same row

    Returns:
        Dict mapping canonical header names → extracted value strings
        (from Average row or first numeric row, whichever applies)
    """
    if not results:
        logger.warning("[HVI Parser] No OCR results to reconstruct table from.")
        return {}

    rows = _group_into_rows(results, y_tolerance=y_tolerance)
    logger.info(f"[HVI Parser] Grouped into {len(rows)} rows.")

    header_idx, col_centers = _find_header_row(rows)

    if not col_centers:
        logger.error("[HVI Parser] No column centers found — cannot reconstruct table.")
        return {}

    # Rows after header are data rows
    data_rows = rows[header_idx + 1 :]

    # ── Row selection ──────────────────────────────────────────────────────────
    selected_rows: List[List[OCRResult]] = []

    for row in data_rows:
        if _is_skip_row(row):
            logger.debug(f"[HVI Parser] Skipping row: {[c.text for c in row]}")
            continue

        if _is_numeric_row(row):
            selected_rows.append(row)
            logger.info(f"[HVI Parser] Found data row: {[c.text for c in row]}")

    if not selected_rows:
        logger.warning("[HVI Parser] No usable data row found.")
        return []

    # ── Assign cells to columns ────────────────────────────────────────────────
    extracted_tables: List[Dict[str, str]] = []
    
    for selected_row in selected_rows:
        extracted: Dict[str, str] = {}
        for cell in selected_row:
            # Skip the label cell ("Average", "12/1/1", etc.)
            if not _is_numeric_or_grade(cell.text):
                continue
            col_name = _assign_to_column(cell.x_center, col_centers)
            if col_name:
                # Don't overwrite if already assigned (keep first/leftmost)
                if col_name not in extracted:
                    extracted[col_name] = cell.text.strip()
                    logger.debug(f"[HVI Parser] {col_name} ← '{cell.text}' (x={cell.x_center:.0f})")
        extracted_tables.append(extracted)

    logger.info(f"[HVI Parser] Extracted {len(extracted_tables)} rows of data.")
    return extracted_tables
