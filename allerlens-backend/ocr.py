import pytesseract
from PIL import Image, ImageEnhance, ImageFilter
import io

def extract_text_from_image(image_file):
    """
    image_file: either Flask file (has .stream) or BytesIO object
    Applies advanced preprocessing to improve OCR accuracy.
    """
    try:
        if hasattr(image_file, "stream"):
            image = Image.open(image_file.stream)
        else:
            image = Image.open(image_file)  # BytesIO

        # Step 1: Explicitly convert to RGB to prevent "wrong mode" errors
        image = image.convert('RGB')
        
        # Step 2: Convert to grayscale for consistent light data
        image = image.convert('L')
        
        # Step 3: Use a threshold to convert to pure black and white
        image = image.point(lambda x: 0 if x < 128 else 255, '1')

        # Step 4: Apply a median filter to remove noise (good for grainy images)
        image = image.filter(ImageFilter.MedianFilter())
        
        # Step 5: Sharpen the image
        enhancer = ImageEnhance.Sharpness(image)
        image = enhancer.enhance(2.0)

        # Step 6: Use a higher-quality OCR engine mode
        config = '--psm 6'
        text = pytesseract.image_to_string(image, config=config)
        return text

    except Exception as e:
        print("OCR failed:", e)
        return ""
