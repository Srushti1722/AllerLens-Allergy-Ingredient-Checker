# ocr.py
import io
import easyocr
from PIL import Image

# One shared reader instance — loading it per-request is slow, and on a
# cold instance the model must be readable from EASYOCR_MODULE_PATH
# (baked into the Docker image at /models so it survives restarts).
_reader = None

def _get_reader():
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(["en"], gpu=False)
    return _reader

def extract_text_from_image(image_file):
    """
    Detects text in an image using the EasyOCR library.
    Raises on engine failure instead of silently returning empty text —
    an unreadable OCR engine must not look like 'no text found'.
    """
    reader = _get_reader()

    # Check if the image is from a file stream or a BytesIO object
    if hasattr(image_file, "stream"):
        img_data = image_file.stream.read()
    else:
        img_data = image_file.read()

    # Use EasyOCR to read text from the image data
    results = reader.readtext(img_data)

    # Join all detected text into a single string
    return " ".join([text[1] for text in results])
