import logging
from typing import Dict, Optional

logger = logging.getLogger("carding.mapper")

FIELD_ORDER = [
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

FIELD_MAP: Dict[str, str] = {name: name for name in FIELD_ORDER}


def apply_mapping(extracted_rows: list) -> list:
    mapped_rows = []

    for extracted in extracted_rows:
        result: Dict[str, Optional[str]] = {}
        for ui_name, source_col in FIELD_MAP.items():
            value = extracted.get(source_col)
            result[ui_name] = str(value).strip() if value is not None else ""
        if extracted.get("_highlighted_cells"):
            result["_highlighted_cells"] = extracted["_highlighted_cells"]
        mapped_rows.append(result)

    logger.info("[Carding Mapper] Mapped %s rows of data.", len(mapped_rows))
    return mapped_rows


def get_ui_field_names() -> list:
    return FIELD_ORDER
