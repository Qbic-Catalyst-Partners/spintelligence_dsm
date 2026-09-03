import logging
import re
from typing import Dict, List, Optional

from ocr.engine import OCRResult

logger = logging.getLogger("fibre.parser")

DATE_RE = re.compile(r"\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b")
PLACEHOLDER_RE = re.compile(r"select\s+variety|^[-\s]+$", re.IGNORECASE)

FIELD_ALIASES = [
    ("Invoice Date", ("invoicedate",)),
    ("Inspection Date", ("dateddmmyyyy", "inspectiondate")),
    ("Lot No", ("lotno",)),
    ("Variety", ("variety",)),
    ("Invoice No", ("invoiceno",)),
    ("Length CV", ("lengthcv", "cvoflength", "cvlength")),
    ("CV per Denier", ("cvperdenier", "cvdenier", "cvpermeandenier", "cvofdenier", "cvofdenicr")),
    ("Mean Denier", ("meandenier", "meandenicr")),
    ("CV per Tenacity", ("cvpertenacity", "cvtenacity", "cvoftenacity")),
    ("Tenacity", ("tenacity",)),
    ("CV per Elongation", ("cvperelongation", "cvelongation", "cvofelongation")),
    ("Elongation", ("elongation",)),
    ("Crimp (ARC/CM)", ("crimp", "arccm")),
    ("Whiteness Index", ("whitenessindex", "whitenessindexcie")),
    ("Spin Finish", ("spinfinish",)),
    ("Cut Length", ("cutlength", "eutlength", "meanlength", "meanlengthmm")),
]

TEST_PARAMETER_FIELDS = {
    "Mean Denier",
    "CV per Denier",
    "Tenacity",
    "CV per Tenacity",
    "Elongation",
    "CV per Elongation",
}

NUMBER_RE = re.compile(r"[-+]?\d+(?:\.\d+)?")


def reconstruct_table(results: List[OCRResult]) -> List[Dict[str, str]]:
    if not results:
        return []

    rows = _group_into_rows(results)

    test_parameter_values = _extract_test_parameter_values(rows)
    if test_parameter_values:
        logger.info(
            "[Fibre Parser] Extracted Fibre test parameters: %s",
            ", ".join(test_parameter_values.keys()),
        )
        return [test_parameter_values]

    extracted: Dict[str, str] = {}

    dates = _extract_dates(results)
    if dates:
        extracted["Inspection Date"] = dates[0]
    if len(dates) > 1:
        extracted["Invoice Date"] = dates[1]

    for index, row in enumerate(rows):
        field = _detect_field(row)
        if not field:
            continue

        value = _extract_input_value(row, field)
        if not value:
            value = _extract_following_value(rows, index)
        if value:
            extracted[field] = value

    if not extracted:
        logger.warning("[Fibre Parser] No Fibre Data Entry fields found.")
        return []

    logger.info("[Fibre Parser] Extracted fields: %s", ", ".join(extracted.keys()))
    return [extracted]


def _extract_test_parameter_values(rows: List[List[OCRResult]]) -> Dict[str, str]:
    extracted: Dict[str, str] = {}

    for index, row in enumerate(rows):
        field = _detect_field(row)
        if field not in TEST_PARAMETER_FIELDS:
            continue

        value = _extract_numeric_table_value(row, field)
        if not value:
            value = _extract_adjacent_numeric_value(rows, index)
        if value:
            extracted[field] = value

    return extracted if len(extracted) >= 2 else {}


def _extract_numeric_table_value(row: List[OCRResult], field: str) -> str:
    row_width = max((point[0] for cell in row for point in cell.bbox), default=0)
    value_left = max(0.0, row_width * 0.36)
    candidates = []

    for cell in row:
        text = cell.text.strip()
        if not text or _is_label_text(text, field):
            continue
        if cell.x_center < value_left:
            continue
        candidates.extend(NUMBER_RE.findall(text))

    if candidates:
        return candidates[-1]

    fallback = []
    for cell in row:
        text = cell.text.strip()
        if text and not _is_label_text(text, field):
            fallback.extend(NUMBER_RE.findall(text))
    return fallback[-1] if fallback else ""


def _extract_adjacent_numeric_value(rows: List[List[OCRResult]], field_index: int) -> str:
    for offset in (-1, 1):
        neighbor_index = field_index + offset
        if neighbor_index < 0 or neighbor_index >= len(rows):
            continue

        row = rows[neighbor_index]
        if _detect_field(row):
            continue

        values = NUMBER_RE.findall(_row_text(row))
        if values:
            return values[-1]

    return ""


def _extract_dates(results: List[OCRResult]) -> List[str]:
    dates: List[str] = []
    form_dates: List[str] = []
    for result in sorted(results, key=lambda r: (r.y_center, r.x_center)):
        for match in DATE_RE.findall(result.text):
            normalized = _normalize_date(match)
            dates.append(normalized)
            if "-" in match:
                form_dates.append(normalized)
    return form_dates or dates


def _normalize_date(value: str) -> str:
    parts = re.split(r"[-/]", value.strip())
    if len(parts) != 3:
        return value.strip()
    day, month, year = parts
    if len(year) == 2:
        year = f"20{year}"
    return f"{day.zfill(2)}-{month.zfill(2)}-{year}"


def _group_into_rows(results: List[OCRResult], y_tolerance: int = 14) -> List[List[OCRResult]]:
    sorted_results = sorted(results, key=lambda r: r.y_center)
    rows: List[List[OCRResult]] = []
    current: List[OCRResult] = []
    current_y: Optional[float] = None

    for result in sorted_results:
        if current_y is None or abs(result.y_center - current_y) <= y_tolerance:
            current.append(result)
            current_y = sum(item.y_center for item in current) / len(current)
            continue

        current.sort(key=lambda r: r.x_center)
        rows.append(current)
        current = [result]
        current_y = result.y_center

    if current:
        current.sort(key=lambda r: r.x_center)
        rows.append(current)

    return rows


def _row_text(row: List[OCRResult]) -> str:
    return " ".join(cell.text for cell in row)


def _compact(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _detect_field(row: List[OCRResult]) -> Optional[str]:
    text = _compact(_row_text(row))

    for field, aliases in FIELD_ALIASES:
        if any(alias in text for alias in aliases):
            return field

    if "date" in text and "invoice" not in text:
        return "Inspection Date"
    if "length" in text and "cv" not in text:
        return "Cut Length"

    return None


def _extract_input_value(row: List[OCRResult], field: str) -> str:
    row_width = max((point[0] for cell in row for point in cell.bbox), default=0)
    input_left = max(0.0, row_width * 0.36)

    candidates = []
    for cell in row:
        text = cell.text.strip()
        if not text or _is_label_text(text, field):
            continue
        if cell.x_center < input_left:
            continue
        if PLACEHOLDER_RE.search(text):
            continue
        candidates.append(text)

    value = " ".join(candidates).strip(" :-")
    if PLACEHOLDER_RE.search(value):
        return ""
    return value


def _extract_following_value(rows: List[List[OCRResult]], field_index: int, max_rows: int = 3) -> str:
    candidates = []

    for row in rows[field_index + 1:field_index + 1 + max_rows]:
        if _is_form_label_row(row) and _detect_field(row):
            break

        row_values = []
        for cell in row:
            text = cell.text.strip()
            if not text or PLACEHOLDER_RE.search(text):
                continue
            if _is_form_label_text(text):
                continue
            row_values.append(text)

        if row_values:
            candidates.extend(row_values)

    return " ".join(candidates).strip(" :-")


def _is_form_label_row(row: List[OCRResult]) -> bool:
    return ":" in _row_text(row)


def _is_form_label_text(text: str) -> bool:
    return ":" in text


def _is_label_text(text: str, field: str) -> bool:
    compact_text = _compact(text)
    compact_field = _compact(field)
    if not compact_text:
        return True
    if compact_field and (compact_text in compact_field or compact_field in compact_text):
        return True
    label_tokens = {
        "date", "ddmmyyyy", "lotno", "variety", "invoiceno", "invoicedate",
        "cutlength", "eutlength", "lengthcv", "meandenier", "cvperdenier",
        "tenacity", "cvpertenacity", "elongation", "cvperelongation",
        "crimparccm", "whitenessindex", "spinfinish", "yyyy", "meanlength",
        "meanlengthmm", "cvoflength", "cvofdenier", "cvoftenacity",
        "cvofelongation", "arccm",
    }
    return compact_text in label_tokens or any(token in compact_text for token in label_tokens)
