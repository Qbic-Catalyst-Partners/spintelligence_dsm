"""
apct/parser.py
===============
A% report table reconstruction.

Extracts:
- Sample rows: Sample No, N-1, N, N+1
- Summary rows starting at Average Weight: Average Weight, Weight (Max), Weight (Min), Range, Hank, SD, CV
- Meta: Total Test, Number of Entries (N)
"""

import logging
import re
from typing import Dict, List, Optional, Tuple

from ocr.engine import OCRResult

logger = logging.getLogger("apct.parser")

HEADER_TOKENS = {
    "Sample No": ["sample no", "sample no.", "sample"],
    "N-1": ["n-1", "n -1", "n- 1"],
    "N": ["n"],
    "N+1": ["n+1", "n +1", "n+ 1"],
}

SUMMARY_LABELS = {
    "averageweight": "Average Weight",
    "weight(max)": "Weight (Max)",
    "weight(maximum)": "Weight (Max)",
    "weight(min)": "Weight (Min)",
    "weight(minimum)": "Weight (Min)",
    "range": "Range",
    "hank": "Hank",
    "sd": "SD",
    "s.d": "SD",
    "stddev": "SD",
    "std": "SD",
    "cv": "CV",
    "cv%": "CV",
}

NUMERIC_RE = re.compile(r"^\d+(\.\d+)?$")


def reconstruct_table(results: List[OCRResult]) -> List[Dict[str, str]]:
    if not results:
        return []

    total_test = _extract_total_test(results)
    standard_apct, apct_n_minus1, apct_n_plus1 = _extract_apct_meta(results)
    rows = _group_into_rows(results)
    if not rows:
        return []

    header_idx, col_centers = _find_header_row(rows)
    if header_idx == -1:
        logger.warning("[A% Parser] Header row not found.")
        return []

    extracted_rows: List[Dict[str, str]] = []
    if total_test or standard_apct or apct_n_minus1 or apct_n_plus1:
        meta_row = {
            "Row Type": "Meta",
        }
        if total_test:
            meta_row["Total Test"] = str(total_test)
            meta_row["Number of Entries (N)"] = str(total_test)
        if standard_apct:
            meta_row["Standard A%"] = standard_apct
        if apct_n_minus1:
            meta_row["A% (N-1)"] = apct_n_minus1
        if apct_n_plus1:
            meta_row["A% (N+1)"] = apct_n_plus1
        extracted_rows.append(meta_row)

    data_rows = rows[header_idx + 1 :]

    in_summary = False
    for row in data_rows:
        if _is_footer_row(row):
            continue

        label = _left_label(row)
        if label and _normalize_key(label) == "averageweight":
            in_summary = True

        if in_summary:
            summary_row = _extract_summary_row(row, col_centers)
            if summary_row:
                extracted_rows.append(summary_row)
            continue

        sample_row = _extract_sample_row(row, col_centers)
        if sample_row:
            extracted_rows.append(sample_row)

    logger.info(f"[A% Parser] Extracted {len(extracted_rows)} rows (including meta/summary).")
    return extracted_rows


def _extract_total_test(results: List[OCRResult]) -> Optional[int]:
    raw = " ".join(r.text for r in results)
    match = re.search(r"total\s*test\s*[:\-]?\s*(\d+)", raw, re.IGNORECASE)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            return None
    return None


def _extract_apct_meta(results: List[OCRResult]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    raw = " ".join(r.text for r in results)
    std_match = re.search(r"standard\s*a%\s*[:=\-]?\s*([\-\d\.]+)", raw, re.IGNORECASE)
    n_minus1_match = re.search(r"a%\s*\(n-?1\)\s*[:=\-]?\s*([\-\d\.]+)", raw, re.IGNORECASE)
    n_plus1_match = re.search(r"a%\s*\(n\+1\)\s*[:=\-]?\s*([\-\d\.]+)", raw, re.IGNORECASE)

    std_val = std_match.group(1).strip() if std_match else None
    n_minus1_val = n_minus1_match.group(1).strip() if n_minus1_match else None
    n_plus1_val = n_plus1_match.group(1).strip() if n_plus1_match else None

    return std_val, n_minus1_val, n_plus1_val


def _group_into_rows(results: List[OCRResult], y_tolerance: int = 12) -> List[List[OCRResult]]:
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
            current_y = sum(x.y_center for x in current_row) / len(current_row)
        else:
            current_row.sort(key=lambda x: x.x_center)
            rows.append(current_row)
            current_row = [r]
            current_y = r.y_center

    if current_row:
        current_row.sort(key=lambda x: x.x_center)
        rows.append(current_row)

    return rows


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().lower())


def _normalize_key(text: str) -> str:
    return re.sub(r"[^a-z0-9%()+\-]+", "", text.strip().lower())


def _find_header_row(rows: List[List[OCRResult]]) -> Tuple[int, Dict[str, float]]:
    best_idx = -1
    best_score = 0
    best_centers: Dict[str, float] = {}

    for i, row in enumerate(rows):
        centers: Dict[str, float] = {}
        normalized_cells = [(_normalize(c.text), c) for c in row]

        for text, cell in normalized_cells:
            if "sample" in text and "no" in text:
                centers.setdefault("Sample No", cell.x_center)
            if text.replace(" ", "") in {"n-1", "n-1"}:
                centers.setdefault("N-1", cell.x_center)
            if text.strip() == "n":
                centers.setdefault("N", cell.x_center)
            if text.replace(" ", "") in {"n+1", "n+1"}:
                centers.setdefault("N+1", cell.x_center)

        score = len(centers)
        if score > best_score:
            best_score = score
            best_idx = i
            best_centers = centers

    if best_score >= 2:
        logger.info(f"[A% Parser] Header row at index {best_idx} with {best_score} columns")
        return best_idx, best_centers

    return -1, {}


def _assign_to_column(x: float, col_centers: Dict[str, float], threshold: int = 70) -> Optional[str]:
    best_col = None
    min_dist = float("inf")
    for col_name, center_x in col_centers.items():
        dist = abs(x - center_x)
        if dist < min_dist and dist <= threshold:
            min_dist = dist
            best_col = col_name
    return best_col


def _left_label(row: List[OCRResult]) -> str:
    if not row:
        return ""
    leftmost = min(row, key=lambda c: c.x_center)
    return leftmost.text.strip()


def _is_footer_row(row: List[OCRResult]) -> bool:
    if not row:
        return True
    return any("page" in _normalize(c.text) for c in row)


def _is_numeric(text: str) -> bool:
    t = text.strip().replace(",", "")
    return bool(NUMERIC_RE.match(t))


def _extract_sample_row(row: List[OCRResult], col_centers: Dict[str, float]) -> Optional[Dict[str, str]]:
    assigned = _assign_row_cells(row, col_centers)
    sample_no = assigned.get("Sample No", "")

    if sample_no and not _is_numeric(sample_no):
        return None

    if assigned.get("N-1") or assigned.get("N") or assigned.get("N+1"):
        return {
            "Row Type": "Sample",
            "Sample No": sample_no,
            "N-1": assigned.get("N-1", ""),
            "N": assigned.get("N", ""),
            "N+1": assigned.get("N+1", ""),
        }

    return None


def _extract_summary_row(row: List[OCRResult], col_centers: Dict[str, float]) -> Optional[Dict[str, str]]:
    label = _normalize_key(_left_label(row))
    summary_label = SUMMARY_LABELS.get(label)
    if not summary_label:
        return None

    assigned = _assign_row_cells(row, col_centers)
    return {
        "Row Type": "Summary",
        "Label": summary_label,
        "N-1": assigned.get("N-1", ""),
        "N": assigned.get("N", ""),
        "N+1": assigned.get("N+1", ""),
    }


def _assign_row_cells(row: List[OCRResult], col_centers: Dict[str, float]) -> Dict[str, str]:
    assigned: Dict[str, str] = {}
    for cell in row:
        col_name = _assign_to_column(cell.x_center, col_centers)
        if not col_name:
            continue
        assigned[col_name] = cell.text.strip()
    return assigned
