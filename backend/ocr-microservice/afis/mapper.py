import logging
from typing import Dict, Optional

logger = logging.getLogger("afis.mapper")

# ── Exact field mapping ────────────────────────────────────────────────────────
# Keys   = field labels on the existing AFIS website form
# Values = column headers in the AFIS PDF table
FIELD_MAP: Dict[str, str] = {
    "UQL": "UQL(w)",
    "L5%": "L(n)5%",
    "SFC(N)": "SFC(n)",
    "IFC %": "IFC%",
    "SFC(W)": "SFC(w)",
    "Maturity": "Mat",
    "Fineness": "Fine",
}


def apply_mapping(extracted_rows: list) -> list:
    """
    Map raw extracted table data to UI field names for multiple rows.

    Args:
        extracted_rows: List of dicts from afis/parser.py — [{canonical_col_name: value}, ...]

    Returns:
        List of dicts with ONLY exact-confidence fields:
        [{ui_field_name: value_string}, ...]
    """
    mapped_rows = []

    for extracted in extracted_rows:
        result: Dict[str, Optional[str]] = {}
        for ui_name, source_col in FIELD_MAP.items():
            value = extracted.get(source_col)
            if value is not None and value.strip():
                result[ui_name] = value.strip()
        mapped_rows.append(result)

    logger.info(f"[AFIS Mapper] Mapped {len(mapped_rows)} rows of data.")
    return mapped_rows


def get_ui_field_names() -> list:
    """Return the list of UI fields in the order they should appear."""
    return list(FIELD_MAP.keys())
