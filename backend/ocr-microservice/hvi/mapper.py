"""
hvi/mapper.py
=============
Maps raw extracted HVI table columns → exact UI field names.

Only fields with confidence="exact" are included.
No guessing, no approximation, no null filling.
"""

import logging
from typing import Dict, Optional

logger = logging.getLogger("hvi.mapper")

# ── Exact field mapping ────────────────────────────────────────────────────────
# Keys   = field labels on the existing website form (must match exactly)
# Values = column headers in the HVI PDF table
FIELD_MAP: Dict[str, str] = {
    "SCI":               "SCI",
    "Span Length (2.5%)": "SL2",
    "Mic":               "Mic",
    "Maturity":          "Mat",
    "UR":                "UR",
    "Elongation":        "Elg",
    "Yellow + B":        "+b",
    "RD":                "Rd",
    "Colour Grade":      "CGrd",
    "SFI":               "SF",
    "TrCnt":             "TrCnt",
    "TrAr":              "TrAr",
    "TrID":              "TrID",
    "Trash Content %": "",
    "Invisible Loss%": "",
}


def apply_mapping(extracted_rows: list) -> list:
    """
    Map raw extracted table data to UI field names for multiple rows.

    Args:
        extracted_rows:  List of dicts from hvi/parser.py — [{canonical_col_name: value}, ...]

    Returns:
        List of dicts with ONLY exact-confidence fields:
        [{ui_field_name: value_string}, ...]
        Missing fields are simply omitted (not set to null).
    """
    mapped_rows = []

    for extracted in extracted_rows:
        result: Dict[str, Optional[str]] = {}
        for ui_name, source_col in FIELD_MAP.items():
            value = extracted.get(source_col)
            if value is not None and value.strip():
                result[ui_name] = value.strip()
            else:
                pass
        mapped_rows.append(result)

    logger.info(f"[Mapper] Mapped {len(mapped_rows)} rows of data.")
    return mapped_rows


def get_ui_field_names() -> list:
    """Return the ordered list of UI field names (for form generation)."""
    return list(FIELD_MAP.keys())
