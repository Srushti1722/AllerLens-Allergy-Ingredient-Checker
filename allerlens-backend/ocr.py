# ocr.py
import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
import io

def extract_text_from_image(image_file):
    """
    image_file: either Flask file (has .stream) or BytesIO object
    Applies preprocessing to the image to improve OCR accuracy.
    """
    try:
        if hasattr(image_file, "stream"):
            image = Image.open(image_file.stream)
        else:
            image = Image.open(image_file)  # BytesIO

        # Preprocessing steps to enhance OCR accuracy
        # 1. Convert to grayscale
        image = image.convert('L')
        
        # 2. Sharpen the image
        image = image.filter(ImageFilter.SHARPEN)

        # 3. Enhance contrast
        enhancer = ImageEnhance.Contrast(image)
        image = enhancer.enhance(1.5)

        # 4. Enhance brightness
        enhancer = ImageEnhance.Brightness(image)
        image = enhancer.enhance(1.2)
        
        # Now, pass the preprocessed image to pytesseract
        text = pytesseract.image_to_string(image)
        return text

    except Exception as e:
        print("OCR failed:", e)
        return ""
