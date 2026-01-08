✨**AllerLens-Allergy-Ingredient-Checker**

AllerLens is a smart project designed to detect allergy-causing ingredients in products by simply uploading an image of the ingredient list. Whether it’s food, cosmetics, or supplements  AllerLens lets you know what to avoid.

🔍***What It Does***

🖼️ Scans Product Labels: Upload images of ingredient lists directly from packaging

🔠 Extracts Text: Uses OCR (Optical Character Recognition) to extract ingredient names

⚠️ Detects Allergens: Flags ingredients that match your personal allergy list

➕ Add Custom Allergens: Add ingredients you're allergic to — once stored, they stay

🔁 Quick Reset: Easily reset inputs, image, and results for new scans


🏗️ ***Project Structure***

            AllerLens/
               ├── allerlens-backend/             ← Python + Flask backend
               │   ├── app.py                     # Handles uploads & allergen checking
               │   ├── db.py                      # SQLite operations for allergen storage
               │   ├── ocr.py                     # Tesseract-based text extraction
               │   ├── ingredient_checker.py      # Regex-based allergen matcher
               │   └── ingredients.db             # Local database of user allergens
               │
               └── allerlens-frontend/  ← React frontend interface
                   ├──public
                        ├──index.html
                   ├──Src
                        ├── App.js                     # Handles UI and API interaction
                        └── index.js                   # Entry point
                    ├──package.json
                    |──package-lock.json


    

🧠***How It Works***
Upload an image of an ingredient label.

Extracted text is compared against stored allergens.

Any matches are flagged and shown clearly.

You can add allergens any time — no image required.

Duplicate entries and results are automatically removed.

🧾***Running the Project Locally***


1. Backend Setup (Python + Flask)
   

        cd allerlens-backend
        python -m venv venv
        venv\Scripts\activate        # Use `source venv/bin/activate` on Linux/macOS
        pip install -r requirements.txt
        python app.py


2. Frontend Setup (React)


        cd ../allerlens-frontend
        npm install
        npm start



📜 License 🔓 MIT License – Feel free to use, modify, and contribute!

🎯 Let's build a world of error-free data transmission! 🚀
