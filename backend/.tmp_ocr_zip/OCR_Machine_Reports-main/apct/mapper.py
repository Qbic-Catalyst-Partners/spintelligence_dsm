"""
apct/mapper.py
=============
Maps extracted A% rows to UI fields.
"""

import logging
from typing import Dict, Optional

logger = logging.getLogger("apct.mapper")

FIELD_ORDER = [
    "Row Type",
    "Label",
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


def apply_mapping(extracted_rows: list) -> list:
    mapped_rows = []

    for extracted in extracted_rows:
        result: Dict[str, Optional[str]] = {}
        for ui_name, source_col in FIELD_MAP.items():
            value = extracted.get(source_col)
            if value is not None and str(value).strip():
                result[ui_name] = str(value).strip()
        mapped_rows.append(result)

    logger.info(f"[A% Mapper] Mapped {len(mapped_rows)} rows of data.")
    return mapped_rows


def get_ui_field_names() -> list:
    return FIELD_ORDER
