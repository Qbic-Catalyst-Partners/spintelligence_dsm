import logging
import re
from typing import Dict, List, Optional, Tuple

from ocr.engine import OCRResult

logger = logging.getLogger("carding.parser")

HEADER_TOKENS = {
    "S.No": ["s.no", "sno", "s. no", "sno.", "s. no."],
    "Date": ["date"],
    "ID": ["id"],
    "Mac Name": ["mac name", "macname", "machine"],
    "Shift": ["shift"],
    "Std. Hank": ["std. hank", "std hank", "std.hank"],
    "Avg. Hank": ["avg. hank", "avg hank", "avg.hank"],
    "SD": ["sd"],
    "CV": ["cv"],
    "User": ["user"],
    "Remark": ["remark", "remarks"],
}

SNO_RE = re.compile(r"^\d+$")

COLUMNS = [
    "S.No",
    "Date",
    "ID",
    "Mac Name",
    "Shift",
    "Std. Hank",
    "Avg. Hank",
    "SD",
    "CV",
    "User",
    "Remark",
]


def reconstruct_pdf_tables(file_bytes: bytes) -> List[Dict[str, str]]:
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("PyMuPDF not installed. Run: pip install PyMuPDF") from exc

    doc = fitz.open(stream=file_bytes, filetype="pdf")
    extracted_rows: List[Dict[str, str]] = []

    try:
        for page in doc:
            tables = page.find_tables()
            red_rects = _red_fill_rects(page)

            for table in tables.tables:
                table_rows = table.extract()
                if not table_rows or len(table_rows[0]) < len(COLUMNS):
                    continue

                header = [_clean_cell(cell).replace("\n", " ") for cell in table_rows[0]]
                if not _is_carding_header(header):
                    continue

                for row_idx, row in enumerate(table_rows[1:], start=1):
                    values = [_clean_cell(cell) for cell in row]
                    if not values or not SNO_RE.match(values[0] if values[0] else ""):
                        continue

                    mapped: Dict[str, str] = {
                        column: values[col_idx] if col_idx < len(values) else ""
                        for col_idx, column in enumerate(COLUMNS)
                    }

                    highlighted = []
                    if row_idx < len(table.rows):
                        for col_idx, cell_rect in enumerate(table.rows[row_idx].cells):
                            if col_idx >= len(COLUMNS) or cell_rect is None:
                                continue
                            if _cell_has_red_fill(cell_rect, red_rects):
                                highlighted.append(COLUMNS[col_idx])

                    if highlighted:
                        mapped["_highlighted_cells"] = highlighted

                    extracted_rows.append(mapped)
    finally:
        doc.close()

    logger.info("[Carding PDF Parser] Extracted %s rows.", len(extracted_rows))
    return extracted_rows


def reconstruct_table(results: List[OCRResult]) -> List[Dict[str, str]]:
    if not results:
        return []

    rows = _group_into_rows(results)
    if not rows:
        return []

    header_idx, col_centers = _find_header_row(rows)
    if header_idx == -1:
        logger.warning("[Carding Parser] Header row not found.")
        return []

    col_ranges = _build_column_ranges(rows[header_idx], col_centers)
    data_rows = rows[header_idx + 1 :]

    extracted_rows: List[Dict[str, str]] = []
    current_record: Optional[Dict[str, str]] = None

    for row in data_rows:
        if _is_header_like_row(row) or _is_footer_row(row):
            continue

        row_data = _extract_row(row, col_centers, col_ranges)
        if not row_data:
            continue

        s_no = row_data.get("S.No", "")
        if s_no:
            if current_record:
                extracted_rows.append(current_record)
            current_record = row_data
        elif current_record:
            current_record = _merge_row(current_record, row_data)

    if current_record:
        extracted_rows.append(current_record)

    logger.info("[Carding Parser] Extracted %s rows.", len(extracted_rows))
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


def _clean_cell(value: object) -> str:
    if value is None:
        return ""
    return "\n".join(line.strip() for line in str(value).splitlines()).strip()


def _is_carding_header(header: List[str]) -> bool:
    normalized = [_normalize(cell) for cell in header]
    required = ["s.no", "date", "id", "mac name", "shift", "avg. hank"]
    return all(item in normalized for item in required)


def _red_fill_rects(page) -> List[Tuple[float, float, float, float]]:
    rects = []
    for drawing in page.get_drawings():
        fill = drawing.get("fill")
        rect = drawing.get("rect")
        if not fill or rect is None:
            continue
        red, green, blue = fill[:3]
        if red > 0.8 and green < 0.2 and blue < 0.2:
            rects.append((rect.x0, rect.y0, rect.x1, rect.y1))
    return rects


def _cell_has_red_fill(
    cell_rect: Tuple[float, float, float, float],
    red_rects: List[Tuple[float, float, float, float]],
) -> bool:
    cell_area = max(0.0, cell_rect[2] - cell_rect[0]) * max(0.0, cell_rect[3] - cell_rect[1])
    if cell_area <= 0:
        return False

    for red_rect in red_rects:
        left = max(cell_rect[0], red_rect[0])
        top = max(cell_rect[1], red_rect[1])
        right = min(cell_rect[2], red_rect[2])
        bottom = min(cell_rect[3], red_rect[3])
        overlap = max(0.0, right - left) * max(0.0, bottom - top)
        if overlap / cell_area > 0.6:
            return True
    return False


def _find_header_row(rows: List[List[OCRResult]]) -> Tuple[int, Dict[str, float]]:
    best_idx = -1
    best_score = 0
    best_centers: Dict[str, float] = {}

    for i, row in enumerate(rows):
        centers: Dict[str, float] = {}
        normalized_cells = [(_normalize(c.text), c) for c in row]

        for text, cell in normalized_cells:
            for canon, variants in HEADER_TOKENS.items():
                if any(text.startswith(v) for v in variants) and canon not in centers:
                    centers[canon] = cell.x_center
                    break

        score = len(centers)
        if score > best_score:
            best_score = score
            best_idx = i
            best_centers = centers

    if best_score >= 4:
        return best_idx, best_centers

    return -1, {}


def _assign_to_column(x: float, col_centers: Dict[str, float], col_ranges: Dict[str, Tuple[float, float]]) -> Optional[str]:
    for col_name, (x_left, x_right) in col_ranges.items():
        if x_left <= x <= x_right:
            return col_name

    best_col = None
    min_dist = float("inf")
    for col_name, center_x in col_centers.items():
        dist = abs(x - center_x)
        if dist < min_dist:
            min_dist = dist
            best_col = col_name
    return best_col


def _is_header_like_row(row: List[OCRResult]) -> bool:
    if not row:
        return True
    joined = " ".join(_normalize(c.text) for c in row)
    return "s.no" in joined and "date" in joined and "id" in joined


def _is_footer_row(row: List[OCRResult]) -> bool:
    if not row:
        return True
    return any("page" in _normalize(c.text) for c in row)


def _extract_row(
    row: List[OCRResult],
    col_centers: Dict[str, float],
    col_ranges: Dict[str, Tuple[float, float]],
) -> Optional[Dict[str, str]]:
    assigned: Dict[str, str] = {}
    for cell in row:
        col_name = _assign_to_column(cell.x_center, col_centers, col_ranges)
        if not col_name:
            continue
        existing = assigned.get(col_name)
        value = cell.text.strip()
        assigned[col_name] = f"{existing} {value}".strip() if existing else value

    s_no = assigned.get("S.No", "")
    if s_no and not SNO_RE.match(s_no):
        return None

    return {column: assigned.get(column, "") for column in COLUMNS}


def _build_column_ranges(
    header_row: List[OCRResult],
    col_centers: Dict[str, float],
) -> Dict[str, Tuple[float, float]]:
    sorted_cols = sorted(col_centers.items(), key=lambda item: item[1])
    if not sorted_cols:
        return {}

    ranges: Dict[str, Tuple[float, float]] = {}
    for idx, (name, center_x) in enumerate(sorted_cols):
        left_bound = (sorted_cols[idx - 1][1] + center_x) / 2 if idx > 0 else center_x - 80
        right_bound = (center_x + sorted_cols[idx + 1][1]) / 2 if idx < len(sorted_cols) - 1 else center_x + 80
        ranges[name] = (left_bound, right_bound)

    if header_row:
        max_x = max(max(pt[0] for pt in cell.bbox) for cell in header_row)
        min_x = min(min(pt[0] for pt in cell.bbox) for cell in header_row)
        for name, (left_bound, right_bound) in ranges.items():
            ranges[name] = (max(min_x, left_bound), min(max_x, right_bound))

    return ranges


def _merge_row(base: Dict[str, str], extra: Dict[str, str]) -> Dict[str, str]:
    merged = dict(base)
    for key, value in extra.items():
        if key == "S.No" or not value:
            continue
        if merged.get(key):
            merged[key] = f"{merged[key]} {value}".strip()
        else:
            merged[key] = value
    return merged
