# ingredient_checker.py (full content)
import difflib
import re

def normalize_text(text):
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def check_ingredients(extracted_text, trigger_ingredients):
    text = normalize_text(extracted_text)
    flagged = []

    for ingredient in trigger_ingredients:
        ing = normalize_text(ingredient)

        # First, try a direct substring match
        if ing in text:
            flagged.append(ingredient)
            continue
        
        # If no direct match, check with fuzzy matching
        words = text.split()
        
        # Fuzzy match for single words (e.g., 'sodiom' vs 'sodium')
        if " " not in ing:
            for word in words:
                ratio = difflib.SequenceMatcher(None, ing, word).ratio()
                if ratio > 0.8:  # Lower the threshold slightly to catch more errors
                    flagged.append(ingredient)
                    break
        else: # Fuzzy match for multi-word phrases
            ing_words = ing.split()
            for i in range(len(words) - len(ing_words) + 1):
                window = " ".join(words[i:i + len(ing_words)])
                ratio = difflib.SequenceMatcher(None, ing, window).ratio()
                if ratio > 0.8: # Use a similar threshold for phrases
                    flagged.append(ingredient)
                    break
    return flagged
