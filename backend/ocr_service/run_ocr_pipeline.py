import json
import re
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE / 'embedded'))

import ocr.engine as ocr_engine
import hvi.parser as hvi_parser
import hvi.mapper as hvi_mapper
import afis.parser as afis_parser
import afis.mapper as afis_mapper
import fibre.parser as fibre_parser
import fibre.mapper as fibre_mapper
import bwc.parser as bwc_parser
import bwc.mapper as bwc_mapper
import carding.parser as carding_parser
import carding.mapper as carding_mapper
import drawing.parser as drawing_parser
import drawing.mapper as drawing_mapper
import simplex.parser as simplex_parser
import simplex.mapper as simplex_mapper
import apct.parser as apct_parser
import apct.mapper as apct_mapper
import noils.parser as noils_parser
import noils.mapper as noils_mapper
import strech.parser as strech_parser
import strech.mapper as strech_mapper
from ocr.engine import OCRResult


def _normalize_doc_type(doc_type):
    normalized = (doc_type or 'hvi').lower().replace('-', '_').replace(' ', '_')
    if normalized in {'fiber', 'fibre'}:
        return 'fibre'
    if 'fiber' in normalized or 'fibre' in normalized:
        return 'fibre'
    if normalized in {'stretch', 'strech', 'stretch%', 'strech%'}:
        return 'strech'
    if 'stretch' in normalized:
        return 'strech'
    if 'noils' in normalized or 'nolis' in normalized:
        return 'noils'
    if 'comber' in normalized and ('noils' in normalized or 'nolis' in normalized):
        return 'noils'
    return normalized


MACHINE_DOC_TYPES = {
    'carding': (carding_parser, carding_mapper),
    'drawing': (drawing_parser, drawing_mapper),
    'simplex': (simplex_parser, simplex_mapper),
}


def detect_doc_type(raw_text, requested_doc_type):
    normalized_requested = _normalize_doc_type(requested_doc_type)
    compact_text = re.sub(r"\s+", " ", raw_text or "").lower()

    if (
        re.search(r"\ba\s*%\s*report\b", compact_text)
        or "standard a%" in compact_text
        or re.search(r"\ba\s*%\s*\(?\s*n\s*[-+\u2212]\s*1\s*\)?", compact_text)
    ):
        return 'apct'

    if 'noils' in compact_text or 'nolis' in compact_text:
        return 'noils'

    if 'stretch %' in compact_text or 'strech %' in compact_text or 'std. stretch' in compact_text or 'std. strech' in compact_text:
        return 'strech'

    if 'fibre data entry' in compact_text or 'fiber data entry' in compact_text:
        return 'fibre'

    return normalized_requested


def get_parser_and_mapper(doc_type):
    if doc_type in MACHINE_DOC_TYPES:
        return MACHINE_DOC_TYPES[doc_type]
    if doc_type == 'fibre':
        return fibre_parser, fibre_mapper
    if doc_type == 'afis':
        return afis_parser, afis_mapper
    if doc_type == 'bwc':
        return bwc_parser, bwc_mapper
    if doc_type == 'apct':
        return apct_parser, apct_mapper
    if doc_type == 'noils':
        return noils_parser, noils_mapper
    if doc_type in {'strech', 'stretch'}:
        return strech_parser, strech_mapper
    return hvi_parser, hvi_mapper


def extract_pdf_word_results(file_bytes, pdf_page='first'):
    try:
        import fitz
    except ImportError:
        return []

    try:
        doc = fitz.open(stream=file_bytes, filetype='pdf')
        try:
            if len(doc) == 0:
                return []
            page_index = len(doc) - 1 if pdf_page == 'last' else 0
            page = doc.load_page(page_index)
            words = page.get_text('words') or []
        finally:
            doc.close()
    except Exception:
        return []

    results = []
    for word in words:
        if len(word) < 5:
            continue
        x0, y0, x1, y1, text = word[:5]
        text = str(text).strip()
        if not text:
            continue
        results.append(
            OCRResult(
                text=text,
                confidence=1.0,
                bbox=[[x0, y0], [x1, y0], [x1, y1], [x0, y1]],
            )
        )
    return results


def reconstruct_with_pdf_text_if_needed(file_path, file_bytes, parser, extracted_tables, doc_type='hvi'):
    if extracted_tables or file_path.suffix.lower() != '.pdf':
        return extracted_tables

    pdf_results = extract_pdf_word_results(file_bytes, pdf_page='last' if doc_type == 'fibre' else 'first')
    if not pdf_results:
        return extracted_tables

    pdf_tables = parser.reconstruct_table(pdf_results)
    return pdf_tables or extracted_tables


def run_machine_pipeline(file_path, file_bytes, doc_type):
    parser, mapper = MACHINE_DOC_TYPES[doc_type]
    extracted_tables = []

    if file_path.suffix.lower() == '.pdf' and hasattr(parser, 'reconstruct_pdf_tables'):
        try:
            extracted_tables = parser.reconstruct_pdf_tables(file_bytes)
        except Exception:
            extracted_tables = []

    if extracted_tables:
        raw_text = "\n".join(
            " | ".join(str(row.get(field, "")) for field in mapper.get_ui_field_names())
            for row in extracted_tables
        )
    else:
        results = ocr_engine.extract_from_bytes(file_bytes, filename=file_path.name, min_confidence=0.4)
        raw_text = "\n".join(r.text for r in results)
        extracted_tables = parser.reconstruct_table(results)

    mapped_rows = mapper.apply_mapping(extracted_tables) if extracted_tables else []
    return raw_text, extracted_tables, mapped_rows, mapper


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: run_ocr_pipeline.py <file_path> <doc_type>"}))
        sys.exit(1)

    file_path = Path(sys.argv[1])
    requested_doc_type = _normalize_doc_type(sys.argv[2] if len(sys.argv) > 2 else 'hvi')

    file_bytes = file_path.read_bytes()

    if requested_doc_type in MACHINE_DOC_TYPES:
        effective_doc_type = requested_doc_type
        raw_text, extracted_tables, mapped_rows, mapper = run_machine_pipeline(
            file_path,
            file_bytes,
            effective_doc_type,
        )
    else:
        results = ocr_engine.extract_from_bytes(
            file_bytes,
            filename=file_path.name,
            min_confidence=0.4,
            pdf_page='last' if requested_doc_type == 'fibre' else 'first',
        )
        raw_text = "\n".join(r.text for r in results)
        effective_doc_type = detect_doc_type(raw_text, requested_doc_type)
        parser, mapper = get_parser_and_mapper(effective_doc_type)
        extracted_tables = parser.reconstruct_table(results)
        extracted_tables = reconstruct_with_pdf_text_if_needed(
            file_path,
            file_bytes,
            parser,
            extracted_tables,
            effective_doc_type,
        )
        mapped_rows = mapper.apply_mapping(extracted_tables) if extracted_tables else []

        # Some report exporters embed a landscape table as a sideways raster
        # image inside an otherwise portrait page (no PDF /Rotate flag to
        # signal it), so the unrotated pass finds no coherent header row.
        # Retry against a rotated render before giving up.
        if not any(mapped_rows):
            for rotation in (90, 270):
                rotated_results = ocr_engine.extract_from_bytes(
                    file_bytes,
                    filename=file_path.name,
                    min_confidence=0.4,
                    pdf_page='last' if requested_doc_type == 'fibre' else 'first',
                    rotate=rotation,
                )
                rotated_tables = parser.reconstruct_table(rotated_results)
                rotated_mapped = mapper.apply_mapping(rotated_tables) if rotated_tables else []
                if any(rotated_mapped):
                    raw_text = "\n".join(r.text for r in rotated_results)
                    extracted_tables = rotated_tables
                    mapped_rows = rotated_mapped
                    break

    output = {
        "filename": file_path.name,
        "doc_type": effective_doc_type,
        "raw_text": raw_text,
        "extracted_tables": extracted_tables,
        "json_output": mapped_rows,
        "fields": mapper.get_ui_field_names(),
    }

    print(json.dumps(output))


if __name__ == '__main__':
    main()
