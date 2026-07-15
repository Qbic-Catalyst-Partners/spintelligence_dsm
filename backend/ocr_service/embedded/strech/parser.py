"""
strech/parser.py
================
Strech % report table reconstruction.

Extracts every repeated table block on the page:
- Meta rows: Test ID, Total Test, Number of Entries, Std. Stretch %, Stretch %, Remark
- Length is captured as metadata even when OCR places it near the table body
- Sample rows: Sample No, Initial Bobbin, Full Bobbin
- Summary rows: Hank, SD, CV
"""

import logging
import re
from typing import Dict, List, Optional, Tuple

from ocr.engine import OCRResult

logger = logging.getLogger("strech.parser")

SUMMARY_LABELS = {
    "hank": "Hank",
    "sd": "SD",
    "s.d": "SD",
    "stddev": "SD",
    "std": "SD",
    "cv": "CV",
    "cv%": "CV",
}

NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?$")
NUMBER_IN_TEXT_RE = re.compile(r"-?\d+(?:\.\d+)?")


def reconstruct_table(results: List[OCRResult]) -> List[Dict[str, str]]:
    if not results:
        return []

    rows = _group_into_rows(results)
    if not rows:
        return _extract_rows_from_result_text(results)

    headers = _find_header_rows(rows)
    if not headers:
        logger.warning("[Strech Parser] Header rows not found.")
        extracted_rows = _extract_rows_without_headers(rows)
        fallback_rows = _extract_rows_from_result_text(results)
        if _count_data_rows(fallback_rows) > _count_data_rows(extracted_rows):
            extracted_rows = fallback_rows
        logger.info(f"[Strech Parser] Fallback extracted {len(extracted_rows)} rows.")
        return extracted_rows

    extracted_rows: List[Dict[str, str]] = []

    for table_idx, (header_idx, col_centers) in enumerate(headers, start=1):
        next_header_idx = headers[table_idx][0] if table_idx < len(headers) else len(rows)
        next_header_idx = headers[table_idx][0] if table_idx < len(headers) else len(rows)
        meta = _extract_meta_for_block(rows, header_idx, next_header_idx)
        table_no = str(table_idx)

        if meta:
            meta_row = {"Row Type": "Meta", "Table No": table_no}
            meta_row.update(meta)
            extracted_rows.append(meta_row)

        for row in rows[header_idx + 1 : next_header_idx]:
            if _is_footer_row(row):
                continue
            if _is_meta_row(row):
                continue

            if _summary_label_from_text(_left_label(row)):
                summary_row = _extract_summary_row(row, col_centers, table_no)
                if summary_row:
                    extracted_rows.append(summary_row)
                continue

            sample_row = _extract_sample_row(row, col_centers, table_no)
            if sample_row:
                extracted_rows.append(sample_row)

    logger.info(f"[Strech Parser] Extracted {len(extracted_rows)} rows across {len(headers)} tables.")
    if not _has_sample_rows(extracted_rows):
        fallback_rows = _extract_rows_from_result_text(results)
        if _count_data_rows(fallback_rows) > _count_data_rows(extracted_rows):
            logger.info(f"[Strech Parser] Text-stream fallback recovered {len(fallback_rows)} rows.")
            extracted_rows = fallback_rows

    return extracted_rows


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
    return re.sub(r"[^a-z0-9%()+.\-]+", "", text.strip().lower())


def _normalize_header_token(text: str) -> str:
    return (
        text.lower()
        .replace(" ", "")
        .replace(".", "")
        .replace("_", "")
        .replace("bobin", "bobbin")
        .replace("b0bbin", "bobbin")
    )


def _row_text(row: List[OCRResult]) -> str:
    return " ".join(c.text.strip() for c in sorted(row, key=lambda c: c.x_center) if c.text.strip())


def _find_header_rows(rows: List[List[OCRResult]]) -> List[Tuple[int, Dict[str, float]]]:
    headers: List[Tuple[int, Dict[str, float]]] = []

    for i, row in enumerate(rows):
        centers: Dict[str, float] = {}
        normalized_cells = [(_normalize(c.text), c) for c in row]

        for text, cell in normalized_cells:
            compact = _normalize_header_token(text)
            if ("sample" in text and "no" in text) or compact in {"sample", "sampleno", "sno", "slno"}:
                centers.setdefault("Sample No", cell.x_center)
            if "initial" in text and ("bobbin" in text or "bob" in text):
                centers.setdefault("Initial Bobbin", cell.x_center)
            if "full" in text and ("bobbin" in text or "bob" in text):
                centers.setdefault("Full Bobbin", cell.x_center)
            if compact in {"initialbobbin", "initialbobin", "initialbob"}:
                centers.setdefault("Initial Bobbin", cell.x_center)
            if compact in {"fullbobbin", "fullbobin", "fullbob"}:
                centers.setdefault("Full Bobbin", cell.x_center)

        if len(centers) >= 2 and "Sample No" in centers:
            headers.append((i, centers))

    return headers


def _extract_meta_for_block(rows: List[List[OCRResult]], header_idx: int, next_header_idx: int) -> Dict[str, str]:
    start = _nearest_test_id_row(rows, header_idx)
    raw_before_header = " ".join(_row_text(row) for row in rows[start:header_idx])
    raw_body_until_next_test = " ".join(
        _row_text(row) for row in _rows_until_next_test_id(rows[header_idx + 1 : next_header_idx])
    )
    raw_length_scope = f"{raw_before_header} {raw_body_until_next_test}"
    raw = raw_before_header
    meta: Dict[str, str] = {}

    tester = _extract_tester(raw)
    test_ids = re.findall(r"test\s*id\s*[:=\-]?\s*(\d+)", raw, re.IGNORECASE)
    total_tests = re.findall(r"total\s*test\s*[:=\-]?\s*(\d+)", raw, re.IGNORECASE)
    lengths = re.findall(r"\blength\s*[:=\-]?\s*(\d+(?:\.\d+)?)", raw_length_scope, re.IGNORECASE)
    std_values = re.findall(
        r"std\.?\s*stret?ch\s*%?\s*[:=\-]?\s*([\-]?\d+(?:\.\d+)?\s*(?:±|\+/-)?\s*[\-]?\d*(?:\.\d+)?)",
        raw,
        re.IGNORECASE,
    )
    raw_without_std = re.sub(
        r"std\.?\s*stret?ch\s*%?\s*[:=\-]?\s*[\-]?\d+(?:\.\d+)?\s*(?:±|\+/-)?\s*[\-]?\d*(?:\.\d+)?",
        "",
        raw,
        flags=re.IGNORECASE,
    )
    stretch_values = re.findall(
        r"\bstret?ch\s*%\s*[:=\-]?\s*([\-]?\d+(?:\.\d+)?)",
        raw_without_std,
        re.IGNORECASE,
    )
    remarks = re.findall(r"remark\s*[:=\-]?\s*(.*?)(?=\s+test\s*id\s*:|\s*$)", raw, re.IGNORECASE)

    if tester:
        meta["Tester"] = tester
    if test_ids:
        meta["Test ID"] = test_ids[-1].strip()
    if total_tests:
        meta["Total Test"] = total_tests[-1].strip()
        meta["Number of Entries (N)"] = total_tests[-1].strip()
    if lengths:
        meta["Length"] = lengths[-1].strip()
    if std_values:
        meta["Std. Stretch %"] = _clean_meta_value(std_values[-1])
    if stretch_values:
        meta["Stretch %"] = stretch_values[-1].strip()
    if remarks:
        meta["Remark"] = remarks[-1].strip()

    return meta


def _nearest_test_id_row(rows: List[List[OCRResult]], header_idx: int) -> int:
    search_start = max(0, header_idx - 12)
    for i in range(header_idx - 1, search_start - 1, -1):
        if "test id" in _normalize(_row_text(rows[i])):
            return i
    return search_start


def _rows_until_next_test_id(rows: List[List[OCRResult]]) -> List[List[OCRResult]]:
    scoped_rows: List[List[OCRResult]] = []
    for row in rows:
        text = _normalize(_row_text(row))
        if "test id" in text:
            break
        scoped_rows.append(row)
    return scoped_rows


def _clean_meta_value(value: str) -> str:
    return re.sub(r"\s+", "", value.strip())


def _extract_tester(raw: str) -> Optional[str]:
    lines = [
        re.sub(r"\s+", " ", line).strip()
        for line in re.split(r"\r?\n|\s{3,}", raw or "")
        if line and line.strip()
    ]
    stop_words = [
        "test id",
        "total test",
        "number of entries",
        "std. stretch",
        "std stretch",
        "stretch %",
        "sample no",
        "remark",
        "length",
        "date",
        "page",
        "shift",
        "process",
    ]

    def clean(value: str) -> str:
        text = re.sub(r"\s+", " ", value or "").strip(" :=-")
        label_pattern = re.compile(
            r"\b(?:"
            r"test\s*id|total\s*test|number\s*of\s*entries|std\.?\s*stretch|std\s*stretch|stretch\s*%|"
            r"sample\s*no|remark|length|date|page|shift|process"
            r")\b",
            re.IGNORECASE,
        )
        match = label_pattern.search(text)
        if match and match.start() > 0:
            text = text[:match.start()].strip(" :=-")
        lower = text.lower()
        for stop_word in stop_words:
            index = lower.find(stop_word)
            if index > 0:
                text = text[:index].strip(" :=-")
                lower = text.lower()
        return text

    for idx, line in enumerate(lines):
        match = re.search(r"\btester(?:\s*name)?\s*[:=\-]?\s*(.+)$", line, re.IGNORECASE)
        if match:
            value = clean(match.group(1))
            if value:
                return value
        if re.match(r"^tester(?:\s*name)?$", line, re.IGNORECASE) and idx + 1 < len(lines):
            value = clean(lines[idx + 1])
            if value:
                return value

    match = re.search(r"\btester(?:\s*name)?\s*[:=\-]?\s*([A-Za-z][A-Za-z0-9 ._/'-]{1,80})", raw or "", re.IGNORECASE)
    if match:
        value = clean(match.group(1))
        if value:
            return value
    return None


def _assign_to_column(x: float, col_centers: Dict[str, float], threshold: int = 90) -> Optional[str]:
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
    return min(row, key=lambda c: c.x_center).text.strip()


def _is_footer_row(row: List[OCRResult]) -> bool:
    if not row:
        return True
    return any("page" in _normalize(c.text) for c in row)


def _is_meta_row(row: List[OCRResult]) -> bool:
    text = _normalize(_row_text(row))
    return any(
        token in text
        for token in ("test id", "std.", "std ", "stretch %", "strech %", "remark", "machine:", "date:", "length")
    )


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
    table_no = "1"
    meta = _extract_meta_from_tokens(tokens, table_no)
    if meta:
        rows.append(meta)

    i = _find_table_start(tokens)
    while i < len(tokens):
        token = tokens[i].strip()
        if not token:
            i += 1
            continue

        if "test id" in _normalize(token) and rows:
            table_no = str(int(table_no) + 1)
            meta = _extract_meta_from_tokens(tokens[i:], table_no)
            if meta:
                rows.append(meta)
            i += 1
            continue

        if _summary_label_from_text(token):
            summary_row, next_i = _extract_summary_from_token_stream(tokens, i, table_no)
            if summary_row:
                rows.append(summary_row)
                i = next_i
                continue
            i += 1
            continue

        sample_row, next_i = _extract_sample_from_token_stream(tokens, i, table_no)
        if sample_row:
            rows.append(sample_row)
            i = next_i
            continue

        i += 1

    return rows


def _extract_meta_from_tokens(tokens: List[str], table_no: str) -> Dict[str, str]:
    raw = " ".join(tokens)
    meta = {"Row Type": "Meta", "Table No": table_no}

    tester = _extract_tester(raw)
    test_ids = re.findall(r"test\s*id\s*[:=\-]?\s*(\d+)", raw, re.IGNORECASE)
    total_tests = re.findall(r"total\s*test\s*[:=\-]?\s*(\d+)", raw, re.IGNORECASE)
    lengths = re.findall(r"\blength\s*[:=\-]?\s*(\d+(?:\.\d+)?)", raw, re.IGNORECASE)
    std_values = re.findall(
        r"std\.?\s*stret?ch\s*%?\s*[:=\-]?\s*([\-]?\d+(?:\.\d+)?\s*(?:Â±|\+/-)?\s*[\-]?\d*(?:\.\d+)?)",
        raw,
        re.IGNORECASE,
    )
    raw_without_std = re.sub(
        r"std\.?\s*stret?ch\s*%?\s*[:=\-]?\s*[\-]?\d+(?:\.\d+)?\s*(?:Â±|\+/-)?\s*[\-]?\d*(?:\.\d+)?",
        "",
        raw,
        flags=re.IGNORECASE,
    )
    stretch_values = re.findall(
        r"\bstret?ch\s*%\s*[:=\-]?\s*([\-]?\d+(?:\.\d+)?)",
        raw_without_std,
        re.IGNORECASE,
    )
    remarks = re.findall(r"remark\s*[:=\-]?\s*(.*?)(?=\s+test\s*id\s*:|\s*$)", raw, re.IGNORECASE)

    if tester:
        meta["Tester"] = tester
    if test_ids:
        meta["Test ID"] = test_ids[0].strip()
    if total_tests:
        meta["Total Test"] = total_tests[0].strip()
        meta["Number of Entries (N)"] = total_tests[0].strip()
    if lengths:
        meta["Length"] = lengths[0].strip()
    if std_values:
        meta["Std. Stretch %"] = _clean_meta_value(std_values[0])
    if stretch_values:
        meta["Stretch %"] = stretch_values[0].strip()
    if remarks:
        meta["Remark"] = remarks[0].strip()

    return meta if len(meta) > 2 else {}


def _extract_sample_from_token_stream(tokens: List[str], index: int, table_no: str) -> Tuple[Optional[Dict[str, str]], int]:
    numbers = _numbers_from_text(tokens[index])
    if len(numbers) >= 3 and numbers[0].isdigit() and "." not in numbers[0]:
        return {
            "Row Type": "Sample",
            "Table No": table_no,
            "Sample No": numbers[0],
            "Initial Bobbin": numbers[1],
            "Full Bobbin": numbers[2],
        }, index + 1

    sample_no = tokens[index].strip()
    if not sample_no.isdigit():
        return None, index + 1

    values: List[str] = []
    next_i = index + 1
    while next_i < len(tokens) and len(values) < 2:
        value = _first_number(tokens[next_i])
        if not value:
            break
        values.append(value)
        next_i += 1

    if len(values) < 2:
        return None, index + 1

    return {
        "Row Type": "Sample",
        "Table No": table_no,
        "Sample No": sample_no,
        "Initial Bobbin": values[0],
        "Full Bobbin": values[1],
    }, next_i


def _extract_summary_from_token_stream(tokens: List[str], index: int, table_no: str) -> Tuple[Optional[Dict[str, str]], int]:
    token = tokens[index].strip()
    label = _summary_label_from_text(token)
    numbers = _numbers_from_text(token)

    if not label:
        return None, index + 1

    if len(numbers) >= 2:
        return {
            "Row Type": "Summary",
            "Table No": table_no,
            "Label": label,
            "Initial Bobbin": numbers[0],
            "Full Bobbin": numbers[1],
        }, index + 1

    values: List[str] = []
    next_i = index + 1
    while next_i < len(tokens) and len(values) < 2:
        value = _first_number(tokens[next_i])
        if not value:
            break
        values.append(value)
        next_i += 1

    if len(values) < 2:
        return None, index + 1

    return {
        "Row Type": "Summary",
        "Table No": table_no,
        "Label": label,
        "Initial Bobbin": values[0],
        "Full Bobbin": values[1],
    }, next_i


def _extract_rows_without_headers(rows: List[List[OCRResult]]) -> List[Dict[str, str]]:
    extracted_rows: List[Dict[str, str]] = []
    table_no = "1"

    meta = _extract_meta_for_block(rows, 0, len(rows))
    if meta:
        meta_row = {"Row Type": "Meta", "Table No": table_no}
        meta_row.update(meta)
        extracted_rows.append(meta_row)

    for row in rows:
        if _is_footer_row(row) or _is_meta_row(row):
            continue

        cells = [cell.text.strip() for cell in sorted(row, key=lambda c: c.x_center) if cell.text.strip()]
        if not cells:
            continue

        if _summary_label_from_text(cells[0]):
            summary_row = _extract_summary_row_from_text(cells, table_no)
            if summary_row:
                extracted_rows.append(summary_row)
            continue

        sample_row = _extract_sample_row_from_text(cells, " ".join(cells), table_no)
        if sample_row:
            extracted_rows.append(sample_row)

    return extracted_rows


def _extract_sample_row_from_text(cells: List[str], joined: str, table_no: str) -> Optional[Dict[str, str]]:
    row_numbers = _numbers_from_text(joined)
    if len(row_numbers) < 3:
        return None

    sample_no = row_numbers[0]
    if "." in sample_no or not sample_no.isdigit():
        return None

    return {
        "Row Type": "Sample",
        "Table No": table_no,
        "Sample No": sample_no,
        "Initial Bobbin": row_numbers[1],
        "Full Bobbin": row_numbers[2],
    }


def _extract_summary_row_from_text(cells: List[str], table_no: str) -> Optional[Dict[str, str]]:
    if not cells:
        return None

    label = _summary_label_from_text(cells[0])
    if not label:
        return None

    numbers: List[str] = []
    for cell in cells:
        numbers.extend(_numbers_from_text(cell))

    if len(numbers) < 2:
        return None

    return {
        "Row Type": "Summary",
        "Table No": table_no,
        "Label": label,
        "Initial Bobbin": numbers[0],
        "Full Bobbin": numbers[1],
    }


def _extract_sample_row(row: List[OCRResult], col_centers: Dict[str, float], table_no: str) -> Optional[Dict[str, str]]:
    text_row = " ".join(cell.text.strip() for cell in sorted(row, key=lambda c: c.x_center) if cell.text.strip())
    if _summary_label_from_text(text_row):
        return None
    text_fallback = _extract_sample_row_from_text([text_row], text_row, table_no)

    assigned = _assign_row_cells(row, col_centers)
    sample_no = assigned.get("Sample No", "")

    if sample_no and not _is_numeric(sample_no):
        return text_fallback

    if assigned.get("Initial Bobbin") or assigned.get("Full Bobbin"):
        if text_fallback and (not sample_no or not assigned.get("Full Bobbin")):
            return text_fallback
        return {
            "Row Type": "Sample",
            "Table No": table_no,
            "Sample No": sample_no,
            "Initial Bobbin": assigned.get("Initial Bobbin", ""),
            "Full Bobbin": assigned.get("Full Bobbin", ""),
        }

    return None


def _extract_summary_row(row: List[OCRResult], col_centers: Dict[str, float], table_no: str) -> Optional[Dict[str, str]]:
    label = _summary_label_from_text(_left_label(row))
    if not label:
        return None

    cells = [cell.text.strip() for cell in sorted(row, key=lambda c: c.x_center) if cell.text.strip()]
    text_fallback = _extract_summary_row_from_text(cells, table_no)
    assigned = _assign_row_cells(row, col_centers)
    if text_fallback and not assigned.get("Full Bobbin"):
        return text_fallback

    return {
        "Row Type": "Summary",
        "Table No": table_no,
        "Label": label,
        "Initial Bobbin": assigned.get("Initial Bobbin", ""),
        "Full Bobbin": assigned.get("Full Bobbin", ""),
    }


def _assign_row_cells(row: List[OCRResult], col_centers: Dict[str, float]) -> Dict[str, str]:
    assigned: Dict[str, str] = {}
    for cell in row:
        col_name = _assign_to_column(cell.x_center, col_centers)
        if not col_name:
            continue
        assigned[col_name] = cell.text.strip()
    return assigned
