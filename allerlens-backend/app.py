# app.py
from flask import Flask, request, jsonify
from ocr import extract_text_from_image
from ingredient_checker import check_ingredients
from db import get_trigger_ingredients, add_custom_ingredient, init_db
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
init_db()

@app.route('/upload', methods=['POST'])
def upload():
    if 'image' not in request.files:
        return jsonify({'error': 'Missing image'}), 400

    image = request.files['image']

    extracted_text = extract_text_from_image(image)
    print("OCR TEXT:", extracted_text)

    trigger_ingredients = get_trigger_ingredients()
    flagged = check_ingredients(extracted_text, trigger_ingredients)
    unique_flagged = list(set(flagged))

    return jsonify({
        'extracted_text': extracted_text,
        'flagged_ingredients': unique_flagged
    }), 200

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


@app.route('/list-ingredients', methods=['GET'])
def list_ingredients():
    ingredients = get_trigger_ingredients()
    return jsonify({'ingredients': sorted(set(ingredients))}), 200

if __name__ == '__main__':
    app.run(debug=True)
