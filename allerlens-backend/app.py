from flask import Flask, request, jsonify
from ocr import extract_text_from_image
from ingredient_checker import check_ingredients
from db import get_trigger_ingredients, add_custom_ingredient, remove_custom_ingredient, init_db
from flask_cors import CORS
import io
import io
import base64
import os



app = Flask(__name__)
CORS(app, origins=[
    "https://aller-lens-allergy-ingredient-check.vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
])


@app.route('/upload', methods=['POST'])
def upload():
    if 'image' not in request.files:
        return jsonify({'error': 'Missing image'}), 400

    image = request.files['image']
    try:
        extracted_text = extract_text_from_image(image)
    except Exception as e:
        print("OCR ENGINE FAILED:", e)
        return jsonify({'error': 'The text-recognition engine failed to start. Please try again.'}), 503

    print("OCR TEXT:", extracted_text)

    trigger_ingredients = get_trigger_ingredients()
    flagged = check_ingredients(extracted_text, trigger_ingredients)
    unique_flagged = list(set(flagged))

    return jsonify({
        'extracted_text': extracted_text,
        'flagged_ingredients': unique_flagged
    }), 200

@app.route('/upload-frames', methods=['POST'])
def upload_frames():
    """
    Handles multiple frames from live scanning.
    Expects JSON: { "frames": [ "base64img1", "base64img2", ... ] }
    Combines OCR text from all frames before checking ingredients.
    """
    try:
        data = request.get_json()
        frames = data.get("frames", [])
        if not frames:
            return jsonify({'error': 'No frames provided'}), 400

        trigger_ingredients = get_trigger_ingredients()
        all_text = []

        # Extract text from all frames
        try:
            for b64img in frames:
                img_bytes = base64.b64decode(b64img.split(",")[-1])
                img = io.BytesIO(img_bytes)
                extracted_text = extract_text_from_image(img)
                all_text.append(extracted_text)
        except Exception as e:
            print("OCR ENGINE FAILED:", e)
            return jsonify({'error': 'The text-recognition engine failed to start. Please try again.'}), 503

        # Combine all frame text before checking ingredients
        combined_text = " ".join(all_text)
        flagged = check_ingredients(combined_text, trigger_ingredients)

        return jsonify({
            'all_text': all_text,
            'flagged_ingredients': list(set(flagged))  # remove duplicates
        }), 200

    except Exception as e:
        return jsonify({'error': f'Failed to process frames: {str(e)}'}), 500

@app.route('/add-ingredient', methods=['POST'])
def add_ingredient():
    try:
        data = request.get_json()
        ingredient = data.get('ingredient', '').strip().lower()

        if not ingredient:
            return jsonify({'error': 'Missing ingredient'}), 400

        add_custom_ingredient(ingredient)
        return jsonify({'message': f'Ingredient "{ingredient}" added.'}), 200
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/remove-ingredient', methods=['DELETE', 'POST'])
def remove_ingredient():
    try:
        data = request.get_json(silent=True) or {}
        ingredient = data.get('ingredient', '').strip().lower()
        if not ingredient:
            return jsonify({'error': 'Missing ingredient'}), 400
        removed = remove_custom_ingredient(ingredient)
        return jsonify({'message': f'Ingredient "{ingredient}" removed.', 'removed': removed}), 200
    except Exception as e:
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500

@app.route('/list-ingredients', methods=['GET'])
def list_ingredients():
    ingredients = get_trigger_ingredients()
    return jsonify({'ingredients': sorted(set(ingredients))}), 200

# Same-origin deployments (e.g. behind a reverse proxy at /api) alias the routes
# under /api while the original paths keep working (Render deployment).
_API_ALIASES = [
    ("/upload", upload, ["POST"]),
    ("/upload-frames", upload_frames, ["POST"]),
    ("/add-ingredient", add_ingredient, ["POST"]),
    ("/remove-ingredient", remove_ingredient, ["DELETE", "POST"]),
    ("/list-ingredients", list_ingredients, ["GET"]),
]
for _rule, _view, _methods in _API_ALIASES:
    app.add_url_rule(f"/api{_rule}", view_func=_view, methods=_methods)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
