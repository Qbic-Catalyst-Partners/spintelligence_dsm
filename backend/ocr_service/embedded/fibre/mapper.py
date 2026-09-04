import logging
from typing import Dict, Optional

logger = logging.getLogger("fibre.mapper")

FIELD_MAP: Dict[str, str] = {
    "Inspection Date": "Inspection Date",
    "Lot No": "Lot No",
    "Variety": "Variety",
    "Invoice No": "Invoice No",
    "Invoice Date": "Invoice Date",
    "Cut Length": "Cut Length",
    "Length CV": "Length CV",
    "Mean Denier": "Mean Denier",
    "CV per Denier": "CV per Denier",
    "Tenacity": "Tenacity",
    "CV per Tenacity": "CV per Tenacity",
    "Elongation": "Elongation",
    "CV per Elongation": "CV per Elongation",
    "Crimp (ARC/CM)": "Crimp (ARC/CM)",
    "Whiteness Index": "Whiteness Index",
    "Spin Finish": "Spin Finish",
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

    logger.info("[Fibre Mapper] Mapped %s rows of data.", len(mapped_rows))
    return mapped_rows


def get_ui_field_names() -> list:
    return list(FIELD_MAP.keys())
