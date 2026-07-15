"""
apct/parser.py
===============
A% report table reconstruction.
"""

import logging
import re
from typing import Dict, List, Optional, Tuple

from ocr.engine import OCRResult

logger = logging.getLogger("apct.parser")

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
NUMERIC_VALUE_RE = re.compile(r"^-?\d+(?:\.\d+)?$")
NUMBER_IN_TEXT_RE = re.compile(r"-?\d+(?:\.\d+)?")


def reconstruct_table(results: List[OCRResult]) -> List[Dict[str, str]]:
    if not results:
        return []

    total_test = _extract_total_test(results)
    standard_apct, apct_n_minus1, apct_n_plus1 = _extract_apct_meta(results)
    rows = _group_into_rows(results)
    if not rows:
        extracted_rows = _extract_rows_from_result_text(results)
        return _prepend_meta_row(extracted_rows, total_test, standard_apct, apct_n_minus1, apct_n_plus1)

    header_idx, col_centers = _find_header_row(rows)
    if header_idx == -1:
        logger.warning("[A% Parser] Header row not found.")
        extracted_rows = _extract_rows_without_headers(rows)
        fallback_rows = _extract_rows_from_result_text(results)
        if _count_data_rows(fallback_rows) > _count_data_rows(extracted_rows):
            extracted_rows = fallback_rows
        logger.info(f"[A% Parser] Fallback extracted {len(extracted_rows)} rows.")
        return _prepend_meta_row(extracted_rows, total_test, standard_apct, apct_n_minus1, apct_n_plus1)

    extracted_rows: List[Dict[str, str]] = []

    in_summary = False
    for row in rows[header_idx + 1:]:
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

    if not _has_sample_rows(extracted_rows):
        fallback_rows = _extract_rows_from_result_text(results)
        if _count_data_rows(fallback_rows) > _count_data_rows(extracted_rows):
            logger.info(f"[A% Parser] Text-stream fallback recovered {len(fallback_rows)} rows.")
            extracted_rows = fallback_rows

    logger.info(f"[A% Parser] Extracted {len(extracted_rows)} rows.")
    return _prepend_meta_row(extracted_rows, total_test, standard_apct, apct_n_minus1, apct_n_plus1)


def _prepend_meta_row(
    extracted_rows: List[Dict[str, str]],
    total_test: Optional[int],
    standard_apct: Optional[str],
    apct_n_minus1: Optional[str],
    apct_n_plus1: Optional[str],
) -> List[Dict[str, str]]:
    if not (total_test or standard_apct or apct_n_minus1 or apct_n_plus1):
        return extracted_rows

    meta_row = {"Row Type": "Meta"}
    if total_test:
        meta_row["Total Test"] = str(total_test)
        meta_row["Number of Entries (N)"] = str(total_test)
    if standard_apct:
        meta_row["Standard A%"] = standard_apct
    if apct_n_minus1:
        meta_row["A% (N-1)"] = apct_n_minus1
    if apct_n_plus1:
        meta_row["A% (N+1)"] = apct_n_plus1
    return [meta_row, *extracted_rows]


def _extract_total_test(results: List[OCRResult]) -> Optional[int]:
    raw = " ".join(r.text for r in results)
    match = re.search(r"total\s*tests?\s*[:\-]?\s*(\d+)", raw, re.IGNORECASE)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def _extract_apct_meta(results: List[OCRResult]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    raw = " ".join(r.text for r in results)
    std_match = re.search(r"standard\s*a\s*%\s*[:=\-]?\s*([\-\d\.]+)", raw, re.IGNORECASE)
    n_minus1_match = re.search(r"a\s*%\s*\(?\s*n\s*[-−]\s*1\s*\)?\s*[:=\-]?\s*([\-\d\.]+)", raw, re.IGNORECASE)
    n_plus1_match = re.search(r"a\s*%\s*\(?\s*n\s*\+\s*1\s*\)?\s*[:=\-]?\s*([\-\d\.]+)", raw, re.IGNORECASE)

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
            compact = _normalize_header_token(text)
            if ("sample" in text and ("no" in text or "number" in text)) or compact in {"sampleno", "sno", "slno"}:
                centers.setdefault("Sample No", cell.x_center)
            if compact in {"n-1", "nminus1"}:
                centers.setdefault("N-1", cell.x_center)
            if compact == "n":
                centers.setdefault("N", cell.x_center)
            if compact in {"n+1", "nplus1"}:
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


def _normalize_header_token(text: str) -> str:
    return (
        text.lower()
        .replace(" ", "")
        .replace(".", "")
        .replace("−", "-")
        .replace("_", "")
    )


def _numbers_from_text(text: str) -> List[str]:
    return NUMBER_IN_TEXT_RE.findall(text.replace(",", ""))


def _first_number(text: str) -> Optional[str]:
    numbers = _numbers_from_text(text)
    return numbers[0] if numbers else None


def _has_sample_rows(rows: List[Dict[str, str]]) -> bool:
    return any(row.get("Row Type") == "Sample" for row in rows)


def _count_data_rows(rows: List[Dict[str, str]]) -> int:
    return sum(1 for row in rows if row.get("Row Type") in {"Sample", "Summary"})


def _extract_rows_from_result_text(results: List[OCRResult]) -> List[Dict[str, str]]:
    token_sequences: List[List[str]] = []
    detected_order = [r.text.strip() for r in results if r.text.strip()]
    if detected_order:
        token_sequences.append(detected_order)

    grouped_rows = _group_into_rows(results)
    row_order = [
        " ".join(cell.text.strip() for cell in sorted(row, key=lambda c: c.x_center) if cell.text.strip())
        for row in grouped_rows
    ]
    row_order = [row for row in row_order if row]
    if row_order and row_order != detected_order:
        token_sequences.append(row_order)

    best_rows: List[Dict[str, str]] = []
    for tokens in token_sequences:
        rows = _extract_rows_from_token_stream(tokens)
        if _count_data_rows(rows) > _count_data_rows(best_rows):
            best_rows = rows

    return best_rows


def _find_table_start(tokens: List[str]) -> int:
    for i, token in enumerate(tokens):
        compact = _normalize_header_token(token)
        if compact in {"sampleno", "sample"} or ("sample" in token.lower() and "no" in token.lower()):
            return i + 1
    return 0


def _extract_rows_from_token_stream(tokens: List[str]) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    i = _find_table_start(tokens)
    in_summary = False

    while i < len(tokens):
        token = tokens[i].strip()
        if not token:
            i += 1
            continue

        label_key = _normalize_key(token)
        if SUMMARY_LABELS.get(label_key):
            in_summary = True

        if in_summary:
            summary_row, next_i = _extract_summary_from_token_stream(tokens, i)
            if summary_row:
                rows.append(summary_row)
                i = next_i
                continue
            i += 1
            continue

        sample_row, next_i = _extract_sample_from_token_stream(tokens, i)
        if sample_row:
            rows.append(sample_row)
            i = next_i
            continue

        i += 1

    return rows


def _extract_sample_from_token_stream(tokens: List[str], index: int) -> Tuple[Optional[Dict[str, str]], int]:
    numbers = _numbers_from_text(tokens[index])
    if len(numbers) >= 4 and numbers[0].isdigit() and "." not in numbers[0]:
        return {
            "Row Type": "Sample",
            "Sample No": numbers[0],
            "N-1": numbers[1],
            "N": numbers[2],
            "N+1": numbers[3],
        }, index + 1

    sample_no = tokens[index].strip()
    if not sample_no.isdigit():
        return None, index + 1

    values: List[str] = []
    next_i = index + 1
    while next_i < len(tokens) and len(values) < 3:
        value = _first_number(tokens[next_i])
        if not value:
            break
        values.append(value)
        next_i += 1

    if len(values) < 3:
        return None, index + 1

    return {
        "Row Type": "Sample",
        "Sample No": sample_no,
        "N-1": values[0],
        "N": values[1],
        "N+1": values[2],
    }, next_i


def _extract_summary_from_token_stream(tokens: List[str], index: int) -> Tuple[Optional[Dict[str, str]], int]:
    token = tokens[index].strip()
    label = SUMMARY_LABELS.get(_normalize_key(token))
    numbers = _numbers_from_text(token)

    if not label:
        for key, candidate_label in SUMMARY_LABELS.items():
            if token.lower().replace(" ", "").startswith(key):
                label = candidate_label
                break

    if not label:
        return None, index + 1

    if len(numbers) >= 3:
        return {
            "Row Type": "Summary",
            "Label": label,
            "N-1": numbers[0],
            "N": numbers[1],
            "N+1": numbers[2],
        }, index + 1

    values: List[str] = []
    next_i = index + 1
    while next_i < len(tokens) and len(values) < 3:
        value = _first_number(tokens[next_i])
        if not value:
            break
        values.append(value)
        next_i += 1

    if len(values) < 3:
        return None, index + 1

    return {
        "Row Type": "Summary",
        "Label": label,
        "N-1": values[0],
        "N": values[1],
        "N+1": values[2],
    }, next_i


def _extract_rows_without_headers(rows: List[List[OCRResult]]) -> List[Dict[str, str]]:
    extracted_rows: List[Dict[str, str]] = []
    in_summary = False

    for row in rows:
        if _is_footer_row(row):
            continue

        cells = [cell.text.strip() for cell in sorted(row, key=lambda c: c.x_center) if cell.text.strip()]
        if not cells:
            continue

        joined = " ".join(cells)
        label_key = _normalize_key(cells[0])
        if label_key == "averageweight":
            in_summary = True

        if in_summary:
            summary_row = _extract_summary_row_from_text(cells)
            if summary_row:
                extracted_rows.append(summary_row)
            continue

        sample_row = _extract_sample_row_from_text(cells, joined)
        if sample_row:
            extracted_rows.append(sample_row)

    return extracted_rows


def _extract_sample_row_from_text(cells: List[str], joined: str) -> Optional[Dict[str, str]]:
    if not cells:
        return None

    row_numbers = _numbers_from_text(joined)
    if len(row_numbers) < 4:
        return None

    sample_no = row_numbers[0]
    if "." in sample_no or not sample_no.isdigit():
        return None

    values: List[str] = []
    for cell_index, cell in enumerate(cells):
        for number in _numbers_from_text(cell):
            if not values and number == sample_no:
                continue
            values.append(number)

    if len(values) < 3:
        values = row_numbers[1:]

    if len(values) < 3:
        return None

    return {
        "Row Type": "Sample",
        "Sample No": sample_no,
        "N-1": values[0],
        "N": values[1],
        "N+1": values[2],
    }


def _extract_summary_row_from_text(cells: List[str]) -> Optional[Dict[str, str]]:
    if not cells:
        return None

    label = SUMMARY_LABELS.get(_normalize_key(cells[0]))
    if not label:
        return None

    numbers: List[str] = []
    for cell in cells[1:]:
        numbers.extend(_numbers_from_text(cell))

    if len(numbers) < 3:
        return None

    return {
        "Row Type": "Summary",
        "Label": label,
        "N-1": numbers[0],
        "N": numbers[1],
        "N+1": numbers[2],
    }


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
