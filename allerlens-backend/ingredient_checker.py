import re

def normalize_text(text):
    # Lowercase and normalize whitespace
    return re.sub(r'\s+', ' ', text.lower().strip())

def check_ingredients(ocr_text, trigger_ingredients):
    found = []
    text = normalize_text(ocr_text)

    for ingredient in trigger_ingredients:
        pattern = r'\b' + re.escape(ingredient.lower().strip()) + r'\b'
        if re.search(pattern, text):
            found.append(ingredient)

    return found
