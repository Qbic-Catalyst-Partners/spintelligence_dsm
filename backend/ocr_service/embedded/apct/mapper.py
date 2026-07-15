"""
apct/mapper.py
=============
Maps extracted A% rows to UI fields.
"""

import logging
from typing import Dict, Optional

logger = logging.getLogger("apct.mapper")

DASH_CHARS = {"-", "—", "–", "−"}
DASH_PLACEHOLDERS = {"â€”", "â€“"}

FIELD_ORDER = [
    "Row Type",
    "Label",
    "Tester",
    "Sample No",
    "N-1",
    "N",
    "N+1",
    "Standard A%",
    "A% (N-1)",
    "A% (N+1)",
    "Total Test",
    "Number of Entries (N)",
]

FIELD_MAP: Dict[str, str] = {
    "Row Type": "Row Type",
    "Label": "Label",
    "Tester": "Tester",
    "Sample No": "Sample No",
    "N-1": "N-1",
    "N": "N",
    "N+1": "N+1",
    "Standard A%": "Standard A%",
    "A% (N-1)": "A% (N-1)",
    "A% (N+1)": "A% (N+1)",
    "Total Test": "Total Test",
    "Number of Entries (N)": "Number of Entries (N)",
}


def clean_mapped_value(value) -> Optional[str]:
    if value is None:
        return None

    text = str(value)
    if not text.strip() or text.strip() in DASH_PLACEHOLDERS or all(char in DASH_CHARS for char in text.strip()):
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

    logger.info(f"[A% Mapper] Mapped {len(mapped_rows)} rows of data.")
    return mapped_rows


def get_ui_field_names() -> list:
    return FIELD_ORDER
