# ingredient_checker.py
import difflib
import re

def normalize_text(text):
    """
    Lowercase, remove extra spaces, punctuation, and normalize special characters.
    """
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)  # remove punctuation
    text = re.sub(r"\s+", " ", text).strip()  # remove extra spaces
    return text

def check_ingredients(extracted_text, trigger_ingredients):
    """
    Check extracted text against all trigger ingredients.
    Uses:
      - Direct substring match
      - Fuzzy match for OCR errors
      - Multi-word ingredient matching
    """
    text = normalize_text(extracted_text)
    flagged = []

    for ingredient in trigger_ingredients:
        ing = normalize_text(ingredient)

        # Direct substring match
        if ing in text:
            flagged.append(ingredient)
            continue

        # Multi-word ingredient match
        words = text.split()
        ing_words = ing.split()
        for i in range(len(words) - len(ing_words) + 1):
            window = " ".join(words[i:i + len(ing_words)])
            ratio = difflib.SequenceMatcher(None, ing, window).ratio()
            if ratio > 0.8:
                flagged.append(ingredient)
                break

        # Single word fuzzy match (only if not already found)
        if ingredient not in flagged:
            for word in words:
                ratio = difflib.SequenceMatcher(None, ing, word).ratio()
                if ratio > 0.85:
                    flagged.append(ingredient)
                    break

    return flagged
