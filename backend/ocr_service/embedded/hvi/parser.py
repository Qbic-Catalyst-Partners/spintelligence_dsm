"""
hvi/parser.py
=============
HVI report table reconstruction and row selection.
"""

import logging
import re
from typing import Dict, List, Optional, Tuple

from ocr.engine import OCRResult

logger = logging.getLogger("hvi.parser")

HEADER_TOKENS: Dict[str, List[str]] = {
    "SCI": ["SCI", "SCI"],
    "Grade": ["Grade", "grade"],
    "Mst": ["Mst", "MST", "mst"],
    "Mic": ["Mic", "MIC", "mic"],
    "Mat": ["Mat", "MAT", "mat", "Mat1"],
    "SL2": ["SL2", "sl2", "SL 2"],
    "UR": ["UR", "ur", "UR)"],
    "SF": ["SF", "sf"],
    "Str": ["Str", "STR", "str"],
    "Elg": ["Elg", "ELG", "elg"],
    "Rd": ["Rd", "RD", "rd"],
    "+b": ["+b", "+B", "b"],
    "CGrd": ["CGrd", "cgrd", "Cgrd", "CGrd"],
    "TrCnt": ["TrCnt", "trcnt"],
    "TrAr": ["TrAr", "trar"],
    "TrID": ["TrID", "trid"],
    "Amt": ["Amt", "AMT", "amt"],
}

SKIP_ROW_PATTERNS = re.compile(r"^(cv%|cv\s*%|std\.?dev|min|max|q99|n\s*$|average\s*$)", re.IGNORECASE)
NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?$")
GRADE_RE = re.compile(r"^\d{2}-\d$")


def _is_numeric_or_grade(text: str) -> bool:
    t = text.strip()
    return bool(NUMERIC_RE.match(t) or GRADE_RE.match(t))


def _group_into_rows(results: List[OCRResult], y_tolerance: int = 15) -> List[List[OCRResult]]:
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


def _match_header_token(text: str) -> Optional[str]:
    t = text.strip()
    for canonical, variants in HEADER_TOKENS.items():
        if t in variants or t.lower() == canonical.lower():
            return canonical
    return None


def _find_header_row(rows: List[List[OCRResult]]) -> Tuple[int, Dict[str, float]]:
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
        best_idx = 0
    return best_idx, best_col_centers


def _assign_to_column(x: float, col_centers: Dict[str, float]) -> Optional[str]:
    if not col_centers:
        return None
    return min(col_centers, key=lambda name: abs(col_centers[name] - x))


def _row_label(cells: List[OCRResult]) -> str:
    return cells[0].text.strip() if cells else ""


def _is_skip_row(cells: List[OCRResult]) -> bool:
    return bool(SKIP_ROW_PATTERNS.match(_row_label(cells)))


def _is_average_row(cells: List[OCRResult]) -> bool:
    return any(cell.text.strip().lower() == "average" for cell in cells)


def _is_numeric_row(cells: List[OCRResult]) -> bool:
    return len([c for c in cells if _is_numeric_or_grade(c.text)]) >= 3


def _extract_row_to_columns(row: List[OCRResult], col_centers: Dict[str, float]) -> Dict[str, str]:
    extracted: Dict[str, str] = {}
    for cell in row:
        if not _is_numeric_or_grade(cell.text):
            continue
        col_name = _assign_to_column(cell.x_center, col_centers)
        if col_name and col_name not in extracted:
            extracted[col_name] = cell.text.strip()
    return extracted


def _compute_column_means(extracted_rows: List[Dict[str, str]]) -> Dict[str, str]:
    sums: Dict[str, float] = {}
    counts: Dict[str, int] = {}
    for row in extracted_rows:
        for col, raw in row.items():
            txt = raw.strip()
            if not NUMERIC_RE.match(txt):
                continue
            value = float(txt)
            sums[col] = sums.get(col, 0.0) + value
            counts[col] = counts.get(col, 0) + 1
    result: Dict[str, str] = {}
    for col, total in sums.items():
        avg = total / counts[col]
        result[col] = f"{avg:.3f}".rstrip("0").rstrip(".")
    return result


def reconstruct_table(results: List[OCRResult], y_tolerance: int = 15) -> List[Dict[str, str]]:
    if not results:
        return []

    rows = _group_into_rows(results, y_tolerance=y_tolerance)
    header_idx, col_centers = _find_header_row(rows)
    if not col_centers:
        return []

    data_rows = rows[header_idx + 1 :]
    selected_rows: List[List[OCRResult]] = []
    average_row: Optional[List[OCRResult]] = None

    for row in data_rows:
        if _is_average_row(row):
            average_row = row
            continue
        if _is_skip_row(row):
            continue
        if _is_numeric_row(row):
            selected_rows.append(row)

    if not selected_rows and average_row is None:
        return []

    if average_row is not None:
        return [_extract_row_to_columns(average_row, col_centers)]

    extracted_rows = [_extract_row_to_columns(row, col_centers) for row in selected_rows]
    consolidated = _compute_column_means(extracted_rows)
    return [consolidated] if consolidated else []
