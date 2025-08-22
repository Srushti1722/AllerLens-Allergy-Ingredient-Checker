# ocr.py
import io
import easyocr
from PIL import Image

def extract_text_from_image(image_file):
    """
    Detects text in an image using the EasyOCR library.
    """
    try:
        # Initialize EasyOCR reader with the desired language(s)
        reader = easyocr.Reader(['en'])

        # Check if the image is from a file stream or a BytesIO object
        if hasattr(image_file, "stream"):
            img_data = image_file.stream.read()
        else:
            img_data = image_file.read()

        # Use EasyOCR to read text from the image data
        results = reader.readtext(img_data)

        # Join all detected text into a single string
        extracted_text = " ".join([text[1] for text in results])

        return extracted_text

    except Exception as e:
        print("EasyOCR failed:", e)
        return ""
