"""
strech/mapper.py
================
Maps extracted Strech % rows to UI fields.
"""

import logging
from typing import Dict, Optional

logger = logging.getLogger("strech.mapper")

DASH_CHARS = {"-", "—", "–", "−"}
DASH_PLACEHOLDERS = {"â€”", "â€“"}

FIELD_ORDER = [
    "Table No",
    "Row Type",
    "Label",
    "Test ID",
    "Total Test",
    "Number of Entries (N)",
    "Length",
    "Std. Stretch %",
    "Stretch %",
    "Remark",
    "Sample No",
    "Initial Bobbin",
    "Full Bobbin",
]

FIELD_MAP: Dict[str, str] = {
    "Table No": "Table No",
    "Row Type": "Row Type",
    "Label": "Label",
    "Test ID": "Test ID",
    "Total Test": "Total Test",
    "Number of Entries (N)": "Number of Entries (N)",
    "Length": "Length",
    "Std. Stretch %": "Std. Stretch %",
    "Stretch %": "Stretch %",
    "Remark": "Remark",
    "Sample No": "Sample No",
    "Initial Bobbin": "Initial Bobbin",
    "Full Bobbin": "Full Bobbin",
}


def clean_mapped_value(value) -> Optional[str]:
    if value is None:
        return None

    text = str(value).strip()
    if not text or text in DASH_PLACEHOLDERS or all(char in DASH_CHARS for char in text):
        return None
    return text


def apply_mapping(extracted_rows: list) -> list:
    mapped_rows = []

    for extracted in extracted_rows:
        result: Dict[str, Optional[str]] = {}
        for ui_name, source_col in FIELD_MAP.items():
            value = clean_mapped_value(extracted.get(source_col))
            if value is not None:
                result[ui_name] = value
        mapped_rows.append(result)

    logger.info(f"[Strech Mapper] Mapped {len(mapped_rows)} rows of data.")
    return mapped_rows


def get_ui_field_names() -> list:
    return FIELD_ORDER
