# ocr.py
import io
import numpy as np
from PIL import Image
from paddleocr import PaddleOCR

# One shared OCR instance — loading it per-request is slow.
_ocr = None


def _get_ocr():
    global _ocr
    if _ocr is None:
        # use_angle_cls=True handles rotated text; use_gpu=False for CPU-only Cloud Run
        _ocr = PaddleOCR(use_angle_cls=True, lang="en", use_gpu=False, show_log=False)
    return _ocr


def warmup_ocr():
    """Initializes PaddleOCR and runs a tiny dummy image so weights are in RAM before requests arrive."""
    try:
        ocr = _get_ocr()
        dummy = np.zeros((32, 32, 3), dtype=np.uint8)
        ocr.ocr(dummy, cls=True)
        print("PaddleOCR pre-warmed successfully!")
    except Exception as e:
        print("PaddleOCR warmup notice:", e)


def extract_text_from_image(image_file):
    """
    Detects text in an image using the PaddleOCR library.

    Accepts Flask FileStorage, a BytesIO, or raw bytes. Converts the bytes
    into a PIL Image then to a numpy array (the format PaddleOCR expects)
    and returns the joined detected text. Raises on engine failure so the
    caller (app.py) can surface a 5xx error instead of silently returning
    empty text.
    """
    ocr = _get_ocr()

    # Read raw bytes from the incoming object
    try:
        if hasattr(image_file, "stream"):
            img_data = image_file.stream.read()
        else:
            # image_file may be a BytesIO or raw bytes
            img_data = image_file.read()
    except Exception:
        # Fallback: maybe image_file is already bytes
        img_data = image_file if isinstance(image_file, (bytes, bytearray)) else None

    if not img_data:
        raise ValueError("No image data provided to OCR")

    try:
        # Open with PIL and convert to RGB to avoid mode issues
        pil_img = Image.open(io.BytesIO(img_data)).convert("RGB")
        img_np = np.array(pil_img)
    except Exception as e:
        raise RuntimeError(f"Failed to decode image for OCR: {e}")

    try:
        results = ocr.ocr(img_np, cls=True)
    except Exception as e:
        raise RuntimeError(f"PaddleOCR failed: {e}")

    # PaddleOCR returns a list of pages; each page is a list of [box, (text, confidence)]
    texts = []
    if results and results[0]:
        for line in results[0]:
            texts.append(line[1][0])
    return " ".join(texts)
