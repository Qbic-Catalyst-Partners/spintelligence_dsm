"""
noils/parser.py
===============
Noils report table reconstruction.

Extracts:
- Sample rows: Sample No, Sliver Wt, Noils Wt, Noils %
- Summary rows starting at Average Weight: Average Weight, Weight (Max), Weight (Min), Range, SD, CV
- Meta: Total Test, Number of Entries (N)
"""

import logging
import re
from typing import Dict, List, Optional, Tuple

from ocr.engine import OCRResult

logger = logging.getLogger("noils.parser")

HEADER_TOKENS = {
    "Sample No": ["sample no", "sample no.", "sample"],
    "Sliver Wt": ["sliver wt", "sliver", "sliver weight"],
    "Noils Wt": ["noils wt", "noils weight", "noils"],
    "Noils %": ["noils %", "noils%", "noils %"],
}

SUMMARY_LABELS = {
    "averageweight": "Average Weight",
    "weight(max)": "Weight (Max)",
    "weight(maximum)": "Weight (Max)",
    "weight(min)": "Weight (Min)",
    "weight(minimum)": "Weight (Min)",
    "range": "Range",
    "sd": "SD",
    "s.d": "SD",
    "stddev": "SD",
    "std": "SD",
    "cv": "CV",
    "cv%": "CV",
}

NUMERIC_RE = re.compile(r"^\d+(\.\d+)?$")
NUMBER_IN_TEXT_RE = re.compile(r"-?\d+(?:\.\d+)?")


def reconstruct_table(results: List[OCRResult]) -> List[Dict[str, str]]:
    if not results:
        return []

    total_test = _extract_total_test(results)
    std_noils, noils_pct = _extract_noils_meta(results)
    rows = _group_into_rows(results)
    if not rows:
        extracted_rows = _extract_rows_from_result_text(results)
        return _prepend_meta_row(extracted_rows, total_test, std_noils, noils_pct)

    header_idx, col_centers = _find_header_row(rows)
    if header_idx == -1:
        logger.warning("[Noils Parser] Header row not found.")
        extracted_rows = _extract_rows_without_headers(rows)
        fallback_rows = _extract_rows_from_result_text(results)
        if _count_data_rows(fallback_rows) > _count_data_rows(extracted_rows):
            extracted_rows = fallback_rows
        logger.info(f"[Noils Parser] Fallback extracted {len(extracted_rows)} rows.")
        return _prepend_meta_row(extracted_rows, total_test, std_noils, noils_pct)

    extracted_rows: List[Dict[str, str]] = []

    data_rows = rows[header_idx + 1 :]
    in_summary = False

    for row in data_rows:
        if _is_footer_row(row):
            continue

        label = _left_label(row)
        if label and _summary_label_from_text(label) == "Average Weight":
            in_summary = True

        if in_summary:
            summary_row = _extract_summary_row(row, col_centers)
            if summary_row:
                extracted_rows.append(summary_row)
            continue

        sample_row = _extract_sample_row(row, col_centers)
        if sample_row:
            extracted_rows.append(sample_row)

    logger.info(f"[Noils Parser] Extracted {len(extracted_rows)} rows (including meta/summary).")
    if not _has_sample_rows(extracted_rows):
        fallback_rows = _extract_rows_from_result_text(results)
        if _count_data_rows(fallback_rows) > _count_data_rows(extracted_rows):
            logger.info(f"[Noils Parser] Text-stream fallback recovered {len(fallback_rows)} rows.")
            extracted_rows = fallback_rows

    return _prepend_meta_row(extracted_rows, total_test, std_noils, noils_pct)


def _prepend_meta_row(
    extracted_rows: List[Dict[str, str]],
    total_test: Optional[int],
    std_noils: Optional[str],
    noils_pct: Optional[str],
) -> List[Dict[str, str]]:
    if not (total_test or std_noils or noils_pct):
        return extracted_rows

    meta_row = {"Row Type": "Meta"}
    if total_test:
        meta_row["Total Test"] = str(total_test)
        meta_row["Number of Entries (N)"] = str(total_test)
    if std_noils:
        meta_row["Std. Noils %"] = std_noils
    if noils_pct:
        meta_row["Noils %"] = noils_pct
    return [meta_row, *extracted_rows]


def _extract_total_test(results: List[OCRResult]) -> Optional[int]:
    raw = " ".join(r.text for r in results)
    match = re.search(r"total\s*test\s*[:\-]?\s*(\d+)", raw, re.IGNORECASE)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            return None
    return None


def _extract_noils_meta(results: List[OCRResult]) -> Tuple[Optional[str], Optional[str]]:
    raw = " ".join(r.text for r in results)
    std_match = re.search(
        r"std\.?\s*noils\s*%?\s*[:=\-]\s*([\d\.]+\s*±\s*[\d\.]+|[\d\.]+)",
        raw,
        re.IGNORECASE,
    )
    raw_no_std = re.sub(
        r"std\.?\s*noils\s*%?\s*[:=\-]\s*([\d\.]+\s*±\s*[\d\.]+|[\d\.]+)",
        "",
        raw,
        flags=re.IGNORECASE,
    )
    noils_match = re.search(
        r"\bnoils\s*%\s*[:=\-]?\s*([\d\.]+)",
        raw_no_std,
        re.IGNORECASE,
    )

    std_val = std_match.group(1).strip() if std_match else None
    noils_val = noils_match.group(1).strip() if noils_match else None

    return std_val, noils_val


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


def _normalize_header_token(text: str) -> str:
    return (
        text.lower()
        .replace(" ", "")
        .replace(".", "")
        .replace("_", "")
        .replace("nolis", "noils")
        .replace("nolus", "noils")
    )


def _find_header_row(rows: List[List[OCRResult]]) -> Tuple[int, Dict[str, float]]:
    best_idx = -1
    best_score = 0
    best_centers: Dict[str, float] = {}

    for i, row in enumerate(rows):
        centers: Dict[str, float] = {}
        normalized_cells = [(_normalize(c.text), c) for c in row]

        for text, cell in normalized_cells:
            compact = _normalize_header_token(text)
            if ("sample" in text and "no" in text) or compact in {"sample", "sampleno", "sno", "slno"}:
                centers.setdefault("Sample No", cell.x_center)
            if "sliver" in text or "silver" in text:
                centers.setdefault("Sliver Wt", cell.x_center)
            if ("noils" in compact and ("wt" in compact or "weight" in compact)) or compact in {"noilswt", "noilsweight"}:
                centers.setdefault("Noils Wt", cell.x_center)
            if "noils" in compact and "%" in text:
                centers.setdefault("Noils %", cell.x_center)

        score = len(centers)
        if score > best_score:
            best_score = score
            best_idx = i
            best_centers = centers

    if best_score >= 2:
        logger.info(f"[Noils Parser] Header row at index {best_idx} with {best_score} columns")
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


def _summary_label_from_text(text: str) -> Optional[str]:
    key = _normalize_key(text)
    label = SUMMARY_LABELS.get(key)
    if label:
        return label
    compact = text.lower().replace(" ", "")
    for candidate_key, candidate_label in SUMMARY_LABELS.items():
        if compact.startswith(candidate_key):
            return candidate_label
    return None


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
            "Sliver Wt": numbers[1],
            "Noils Wt": numbers[2],
            "Noils %": numbers[3],
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
        "Sliver Wt": values[0],
        "Noils Wt": values[1],
        "Noils %": values[2],
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
            "Sliver Wt": numbers[0],
            "Noils Wt": numbers[1],
            "Noils %": numbers[2],
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
        "Sliver Wt": values[0],
        "Noils Wt": values[1],
        "Noils %": values[2],
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
        if _summary_label_from_text(cells[0]) == "Average Weight":
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
    row_numbers = _numbers_from_text(joined)
    if len(row_numbers) < 4:
        return None

    sample_no = row_numbers[0]
    if "." in sample_no or not sample_no.isdigit():
        return None

    return {
        "Row Type": "Sample",
        "Sample No": sample_no,
        "Sliver Wt": row_numbers[1],
        "Noils Wt": row_numbers[2],
        "Noils %": row_numbers[3],
    }


def _extract_summary_row_from_text(cells: List[str]) -> Optional[Dict[str, str]]:
    if not cells:
        return None

    label = _summary_label_from_text(cells[0])
    if not label:
        return None

    numbers: List[str] = []
    for cell in cells:
        numbers.extend(_numbers_from_text(cell))

    if len(numbers) < 3:
        return None

    return {
        "Row Type": "Summary",
        "Label": label,
        "Sliver Wt": numbers[0],
        "Noils Wt": numbers[1],
        "Noils %": numbers[2],
    }


def _extract_sample_row(row: List[OCRResult], col_centers: Dict[str, float]) -> Optional[Dict[str, str]]:
    text_row = " ".join(cell.text.strip() for cell in sorted(row, key=lambda c: c.x_center) if cell.text.strip())
    if _summary_label_from_text(text_row):
        return None
    text_fallback = _extract_sample_row_from_text([text_row], text_row)

    assigned = _assign_row_cells(row, col_centers)
    sample_no = assigned.get("Sample No", "")

    if sample_no and not _is_numeric(sample_no):
        return text_fallback

    if assigned.get("Sliver Wt") or assigned.get("Noils Wt") or assigned.get("Noils %"):
        if (
            text_fallback
            and (not sample_no or not assigned.get("Noils Wt") or not assigned.get("Noils %"))
        ):
            return text_fallback
        return {
            "Row Type": "Sample",
            "Sample No": sample_no,
            "Sliver Wt": assigned.get("Sliver Wt", ""),
            "Noils Wt": assigned.get("Noils Wt", ""),
            "Noils %": assigned.get("Noils %", ""),
        }

    return None


def _extract_summary_row(row: List[OCRResult], col_centers: Dict[str, float]) -> Optional[Dict[str, str]]:
    summary_label = _summary_label_from_text(_left_label(row))
    if not summary_label:
        return None

    cells = [cell.text.strip() for cell in sorted(row, key=lambda c: c.x_center) if cell.text.strip()]
    text_fallback = _extract_summary_row_from_text(cells)
    assigned = _assign_row_cells(row, col_centers)
    if (
        text_fallback
        and (not assigned.get("Noils Wt") or not assigned.get("Noils %"))
    ):
        return text_fallback

    return {
        "Row Type": "Summary",
        "Label": summary_label,
        "Sliver Wt": assigned.get("Sliver Wt", ""),
        "Noils Wt": assigned.get("Noils Wt", ""),
        "Noils %": assigned.get("Noils %", ""),
    }


def _assign_row_cells(row: List[OCRResult], col_centers: Dict[str, float]) -> Dict[str, str]:
    assigned: Dict[str, str] = {}
    for cell in row:
        col_name = _assign_to_column(cell.x_center, col_centers)
        if not col_name:
            continue
        assigned[col_name] = cell.text.strip()
    return assigned
