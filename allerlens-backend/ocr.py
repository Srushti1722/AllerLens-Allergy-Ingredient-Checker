# ocr.py
import io
import numpy as np
import easyocr
from PIL import Image

# One shared reader instance — loading it per-request is slow.
_reader = None


def _get_reader():
    global _reader
    if _reader is None:
        # initialize an English reader; set gpu=True if running with CUDA
        _reader = easyocr.Reader(["en"], gpu=False)
    return _reader


def warmup_ocr():
    """Initializes EasyOCR and runs a tiny dummy image so weights are in RAM before requests arrive."""
    try:
        reader = _get_reader()
        dummy = np.zeros((32, 32, 3), dtype=np.uint8)
        reader.readtext(dummy)
        print("EasyOCR pre-warmed successfully!")
    except Exception as e:
        print("EasyOCR warmup notice:", e)


def extract_text_from_image(image_file):
    """
    Detects text in an image using the EasyOCR library.

    Accepts Flask FileStorage, a BytesIO, or raw bytes. Converts the bytes
    into a PIL Image then to a numpy array (the format EasyOCR expects)
    and returns the joined detected text. Raises on engine failure so the
    caller (app.py) can surface a 5xx error instead of silently returning
    empty text.
    """
    reader = _get_reader()

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
        # Any failure reading the image should be treated as an OCR engine failure
        raise RuntimeError(f"Failed to decode image for OCR: {e}")

    try:
        results = reader.readtext(img_np)
    except Exception as e:
        # Bubble up OCR engine startup/runtime failures so callers can return 5xx
        raise RuntimeError(f"EasyOCR failed: {e}")

    # Join all detected text into a single string
    return " ".join([text[1] for text in results])
