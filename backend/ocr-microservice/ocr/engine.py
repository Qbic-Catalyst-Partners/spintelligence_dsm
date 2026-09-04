"""
ocr/engine.py
=============
RapidOCR (onnxruntime) wrapper — offline, single-pass, returns bounding boxes.

- Engine is a module-level singleton: loaded once, reused forever.
- OCRResult carries text, confidence, and the 4-point quadrilateral bbox.
- Results are NOT sorted here — the HVI parser needs raw bbox positions.
"""

import logging
import os
from pathlib import Path
from typing import List, NamedTuple, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger("ocr.engine")


# ── Data model ────────────────────────────────────────────────────────────────

class OCRResult(NamedTuple):
    text: str
    confidence: float
    bbox: list  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]

    @property
    def x_center(self) -> float:
        xs = [pt[0] for pt in self.bbox]
        return (min(xs) + max(xs)) / 2

    @property
    def y_center(self) -> float:
        ys = [pt[1] for pt in self.bbox]
        return (min(ys) + max(ys)) / 2

    @property
    def y_top(self) -> float:
        return min(pt[1] for pt in self.bbox)

    @property
    def x_left(self) -> float:
        return min(pt[0] for pt in self.bbox)


# ── Singleton engine ──────────────────────────────────────────────────────────

_engine = None

def _find_model_paths() -> Tuple[str, str, str]:
    """Look for ONNX model files in RAPIDOCR_MODEL_DIR or ./models."""
    model_dir = os.environ.get("RAPIDOCR_MODEL_DIR") or str(
        Path(__file__).parent.parent / "models"
    )
    det = Path(model_dir) / "ch_PP-OCRv4_det_infer.onnx"
    rec = Path(model_dir) / "ch_PP-OCRv4_rec_infer.onnx"
    cls = Path(model_dir) / "ch_ppocr_mobile_v2.0_cls_infer.onnx"
    if det.exists() and rec.exists() and cls.exists():
        logger.info(f"[OCR] Using local ONNX models from: {model_dir}")
        return str(det), str(rec), str(cls)
    return "", "", ""


def get_engine():
    """Lazy-init RapidOCR engine (loads once, cached for all requests)."""
    global _engine
    if _engine is None:
        logger.info("[OCR] Loading RapidOCR engine...")
        try:
            from rapidocr_onnxruntime import RapidOCR
            det, rec, cls = _find_model_paths()
            if det:
                _engine = RapidOCR(
                    det_model_path=det,
                    rec_model_path=rec,
                    cls_model_path=cls,
                )
            else:
                _engine = RapidOCR()
            logger.info("[OCR] RapidOCR engine ready.")
        except Exception as e:
            logger.error(f"[OCR] Failed to load engine: {e}")
            raise
    return _engine


# ── Image preprocessing (fast, single-pass) ───────────────────────────────────

def preprocess(image_np: np.ndarray, min_width: int = 1500) -> np.ndarray:
    """
    Fast preprocessing: grayscale → mild denoise → CLAHE → resize.
    No deskew (slow). No thresholding (RapidOCR handles it internally).
    """
    # Ensure BGR
    if len(image_np.shape) == 2:
        img = cv2.cvtColor(image_np, cv2.COLOR_GRAY2BGR)
    else:
        img = image_np.copy()

    # Grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Mild denoise
    denoised = cv2.GaussianBlur(gray, (3, 3), 0)

    # CLAHE contrast
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)

    # Upscale if too small (OCR accuracy drops below ~1200px wide)
    h, w = enhanced.shape[:2]
    if w < min_width:
        scale = min_width / w
        enhanced = cv2.resize(
            enhanced,
            (int(w * scale), int(h * scale)),
            interpolation=cv2.INTER_CUBIC,
        )
        logger.info(f"[OCR] Resized {w}x{h} → {int(w*scale)}x{int(h*scale)}")

    # Convert back to BGR (RapidOCR expects BGR/RGB)
    return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)


# ── Main extract function ──────────────────────────────────────────────────────

def extract(
    image_np: np.ndarray,
    min_confidence: float = 0.4,
    preprocess_image: bool = True,
) -> List[OCRResult]:
    """
    Run OCR on a numpy image array.

    Args:
        image_np:         BGR/RGB numpy array
        min_confidence:   Drop results below this threshold
        preprocess_image: Apply fast preprocessing pipeline

    Returns:
        List[OCRResult] in raw (unsorted) detection order
    """
    if image_np is None or image_np.size == 0:
        raise ValueError("Cannot run OCR on empty image.")

    if preprocess_image:
        image_np = preprocess(image_np)
    elif len(image_np.shape) == 2:
        image_np = cv2.cvtColor(image_np, cv2.COLOR_GRAY2BGR)

    engine = get_engine()

    try:
        raw, _ = engine(image_np)
    except Exception as e:
        raise RuntimeError(f"RapidOCR inference failed: {e}") from e

    if not raw:
        logger.warning("[OCR] No text detected.")
        return []

    results: List[OCRResult] = []
    for item in raw:
        if not item or len(item) < 3:
            continue
        bbox, text, conf = item[0], item[1], item[2]
        text = str(text).strip()
        if not text or conf < min_confidence:
            continue
        if hasattr(bbox, "tolist"):
            bbox = bbox.tolist()
        results.append(OCRResult(text=text, confidence=float(conf), bbox=bbox))

    logger.info(f"[OCR] Extraction complete — {len(results)} regions found.")
    return results


def extract_from_bytes(
    file_bytes: bytes,
    filename: str = "",
    min_confidence: float = 0.4,
    pdf_page: str = "first",
) -> List[OCRResult]:
    """
    Convenience: decode image bytes (or PDF first page) → extract OCR.
    """
    if filename.lower().endswith(".pdf"):
        try:
            import fitz  # PyMuPDF
            
            # Open PDF from bytes
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            if len(doc) == 0:
                raise ValueError("PDF has no pages.")
            
            page_index = len(doc) - 1 if pdf_page == "last" else 0
            page = doc.load_page(page_index)
            pix = page.get_pixmap(dpi=200)
            
            # Convert PyMuPDF pixmap to numpy array
            img_array = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.h, pix.w, pix.n)
            
            # Convert RGB (or RGBA) to BGR for OpenCV
            if pix.n == 1: # Grayscale
                image_np = cv2.cvtColor(img_array, cv2.COLOR_GRAY2BGR)
            elif pix.n == 4: # RGBA
                image_np = cv2.cvtColor(img_array, cv2.COLOR_RGBA2BGR)
            else: # RGB
                image_np = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
                
            doc.close()
        except ImportError:
            raise RuntimeError("PyMuPDF not installed. Run: pip install PyMuPDF")
    else:
        nparr = np.frombuffer(file_bytes, np.uint8)
        image_np = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image_np is None:
            raise ValueError("Cannot decode image bytes.")

    return extract(image_np, min_confidence=min_confidence)
