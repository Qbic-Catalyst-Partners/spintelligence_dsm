"""
afis/parser.py
==============
AFIS report table reconstruction and row selection.
"""

import logging
import re
from typing import Dict, List, Optional, Tuple

from ocr.engine import OCRResult

logger = logging.getLogger("afis.parser")

# ── Known AFIS column headers ──────────────────────────────────────────────────
HEADER_TOKENS: Dict[str, List[str]] = {
    "Rep": ["Rep", "rep"],
    "L(w)": ["L(w)", "l(w)"],
    "UQL(w)": ["UQL(w)", "uql(w)", "UQL"],
    "L(n)": ["L(n)", "l(n)"],
    "L(n)5%": ["L(n)5%", "l(n)5%", "L(n)5"],
    "SFC(w)": ["SFC(w)", "sfc(w)", "SFC"],
    "SFC(n)": ["SFC(n)", "sfc(n)"],
    "Fine": ["Fine", "fine"],
    "IFC%": ["IFC%", "ifc%", "IFC"],
    "Mat": ["Mat", "mat"],
    "TotNepCnt": ["TotNepCnt", "totnepcnt", "TotNep"],
    "FibNepCnt": ["FibNepCnt", "fibnepcnt", "FibNep"],
    "SCNepCnt": ["SCNepCnt", "scnepcnt", "SCNep"],
}

# Rows to skip (statistical data at bottom of AFIS report)
SKIP_ROW_PATTERNS = re.compile(
    r"^(mean|std\.?\s*dev|cv\s*%|q99|min|max|usp|n\s*$|\[.*?\]|[\u2014\u2013\-]+$)",
    re.IGNORECASE,
)

# Footer/metadata keywords that appear in the last row of the AFIS printout
# e.g. "Test Date+Time Range", "Page 1 of 1"
FOOTER_KEYWORDS = re.compile(
    r"test\s*date|page\s*\d+\s*of|date\+time|time\s*range", re.IGNORECASE
)

# Measurement values are plain integers or decimals like 25.4, 0.89, 152
# Dates (10-04-2026), times (11:56:00) and page labels must NOT match.
SIMPLE_NUMBER_RE = re.compile(r"^\d+(\.\d+)?$")


def reconstruct_table(results: List[OCRResult]) -> List[Dict[str, str]]:
    """
    Identifies the AFIS table, computes columns, and assigns cell values.
    Returns a list of dictionaries (one per data row).
    """
    if not results:
        return []

    # 1. Group into rows by Y-coordinate
    rows = _group_into_rows(results)
    if not rows:
        return []

    # 2. Find header row
    header_idx, col_centers = _detect_headers(rows)
    if header_idx == -1:
        logger.warning("[AFIS Parser] Header row not found!")
        return []

    data_rows = rows[header_idx + 1 :]

    # 3. Select valid numeric data rows (ignore summary rows)
    selected_rows: List[List[OCRResult]] = []
    for row in data_rows:
        if _is_skip_row(row):
            logger.debug(f"[AFIS Parser] Skipping row: {[c.text for c in row]}")
            continue

        if _is_numeric_row(row):
            selected_rows.append(row)
            logger.info(f"[AFIS Parser] Found data row: {[c.text for c in row]}")

    if not selected_rows:
        logger.warning("[AFIS Parser] No usable data row found.")
        return []

    # 4. Assign cells to columns
    extracted_tables: List[Dict[str, str]] = []
    
    for selected_row in selected_rows:
        extracted: Dict[str, str] = {}
        for cell in selected_row:
            col_name = _assign_to_column(cell.x_center, col_centers)
            if col_name:
                if col_name not in extracted:
                    extracted[col_name] = cell.text.strip()
        extracted_tables.append(extracted)

    logger.info(f"[AFIS Parser] Extracted {len(extracted_tables)} rows of data.")
    return extracted_tables


def _group_into_rows(results: List[OCRResult], y_tolerance: int = 10) -> List[List[OCRResult]]:
    """Group bounding boxes that share roughly the same Y-center."""
    results_sorted = sorted(results, key=lambda r: r.y_center)
    rows: List[List[OCRResult]] = []
    current_row: List[OCRResult] = []
    current_y = None

    for r in results_sorted:
        if current_y is None:
            current_y = r.y_center
            current_row.append(r)
        elif abs(r.y_center - current_y) <= y_tolerance:
            current_row.append(r)
            # Update running average Y
            current_y = sum(x.y_center for x in current_row) / len(current_row)
        else:
            # Sort row left-to-right
            current_row.sort(key=lambda x: x.x_center)
            rows.append(current_row)
            current_row = [r]
            current_y = r.y_center

    if current_row:
        current_row.sort(key=lambda x: x.x_center)
        rows.append(current_row)

    return rows


def _detect_headers(rows: List[List[OCRResult]]) -> Tuple[int, Dict[str, float]]:
    best_idx = -1
    best_matches = 0
    best_centers = {}

    for i, row in enumerate(rows):
        matches = 0
        centers = {}

        # Look for our known headers in this row
        for cell in row:
            txt = cell.text.strip().lower()
            for canon, variants in HEADER_TOKENS.items():
                if any(txt.startswith(v.lower()) for v in variants) and canon not in centers:
                    centers[canon] = cell.x_center
                    matches += 1
                    break

        # If this row has the most AFIS headers, assume it's the header row
        if matches > best_matches:
            best_matches = matches
            best_idx = i
            best_centers = centers

    if best_matches >= 3:  # Need at least 3 recognizable headers
        logger.info(f"[AFIS Parser] Found header row at index {best_idx} with {best_matches} cols")
        return best_idx, best_centers

    return -1, {}


def _assign_to_column(x: float, col_centers: Dict[str, float], threshold: int = 40) -> Optional[str]:
    best_col = None
    min_dist = float("inf")
    for col_name, center_x in col_centers.items():
        dist = abs(x - center_x)
        if dist < min_dist and dist <= threshold:
            min_dist = dist
            best_col = col_name
    return best_col


def _is_skip_row(row: List[OCRResult]) -> bool:
    if not row:
        return True

    first_cell_txt = row[0].text.strip()

    # Statistical summary labels: Mean, CV%, Std.Dev, Min, Max, n, [mm], — etc.
    if SKIP_ROW_PATTERNS.match(first_cell_txt):
        return True

    # Unit rows e.g. '[mm]'
    if first_cell_txt.startswith('['):
        return True

    # Footer rows: any cell contains "Test Date+Time Range", "Page 1 of 1", etc.
    all_text = " ".join(c.text for c in row)
    if FOOTER_KEYWORDS.search(all_text):
        return True

    # Rows whose cells are mostly em-dashes / hyphens (— — — — footer separator)
    dash_cells = sum(
        1 for c in row if re.match(r"^[\u2014\u2013\-\s]+$", c.text.strip())
    )
    if len(row) > 0 and dash_cells / len(row) >= 0.4:
        return True

    return False


def _is_numeric_row(row: List[OCRResult]) -> bool:
    """
    True only when most cells are plain integers or decimals (e.g. 25.4, 0.89, 152).
    Dates (10-04-2026), times (11:56:00), and page labels do NOT qualify,
    so footer rows are correctly rejected.
    """
    numeric_count = sum(1 for c in row if SIMPLE_NUMBER_RE.match(c.text.strip()))
    return numeric_count >= max(3, len(row) * 0.4)
