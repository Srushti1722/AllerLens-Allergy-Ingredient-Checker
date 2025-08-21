import pytesseract
from PIL import Image
import io

def extract_text_from_image(image_file):

    """
    image_file: either Flask file (has .stream) or BytesIO object
    Works for both single image upload and live scan frames.
    """
    try:
        if hasattr(image_file, "stream"):
            image = Image.open(image_file.stream)
        else:
            image = Image.open(image_file)  # BytesIO
        return pytesseract.image_to_string(image)
    except Exception as e:
        print("OCR failed:", e)
        return ""

    image = Image.open(image_file.stream)
    return pytesseract.image_to_string(image)

