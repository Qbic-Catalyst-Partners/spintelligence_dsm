"""
noils/mapper.py
==============
Maps extracted Noils rows to UI fields.
"""

import logging
from typing import Dict, Optional

logger = logging.getLogger("noils.mapper")

DASH_CHARS = {"-", "—", "–", "−"}
DASH_PLACEHOLDERS = {"â€”", "â€“"}

FIELD_ORDER = [
    "Row Type",
    "Label",
    "Tester",
    "Test ID",
    "Machine ID",
    "Sample No",
    "Sliver Wt",
    "Noils Wt",
    "Noils %",
    "Std. Noils %",
    "Total Test",
    "Number of Entries (N)",
]

FIELD_MAP: Dict[str, str] = {
    "Row Type": "Row Type",
    "Label": "Label",
    "Tester": "Tester",
    "Test ID": "Test ID",
    "Machine ID": "Machine ID",
    "Sample No": "Sample No",
    "Sliver Wt": "Sliver Wt",
    "Noils Wt": "Noils Wt",
    "Noils %": "Noils %",
    "Std. Noils %": "Std. Noils %",
    "Total Test": "Total Test",
    "Number of Entries (N)": "Number of Entries (N)",
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

    logger.info(f"[Noils Mapper] Mapped {len(mapped_rows)} rows of data.")
    return mapped_rows


def get_ui_field_names() -> list:
    return FIELD_ORDER
