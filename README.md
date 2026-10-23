# 🌿 AllerLens — Smart Allergy & Ingredient Checker

AllerLens is an AI-powered allergen detection web application. Simply point your smartphone camera at any product's ingredient list (or upload a photo), and AllerLens extracts the text using deep-learning OCR to instantly cross-check it against your personal allergy triggers.

---

## ⚡ Features

* **📸 Live High-Resolution Camera Scanner:** Point your phone camera directly at package ingredient labels with real-time reticle targeting, continuous autofocus, and flashlight toggle.
* **🔤 Deep Learning OCR (PaddleOCR):** High-speed, accurate text recognition optimized for mobile capture and curved package labels.
* **⚠️ Instant Allergen Matching:** Fuzzy and substring matching catches trigger ingredients even with minor label typos or OCR variations.
* **☁️ Cloud Persistence (Google Cloud Firestore):** Allergy triggers are saved permanently in Firestore and never wiped across restarts.
* **🌱 Default Allergen Baseline:** Pre-seeded with common allergens (*peanuts, gluten, wheat, milk, eggs, soy, tree nuts, fish, shellfish, sesame, mustard*). Add or remove custom triggers anytime.
* **🖼️ Photo Upload Fallback:** Upload any clear image from your camera roll or desktop.

---

## 🏗️ Architecture & Tech Stack

```
AllerLens/
├── allerlens-backend/             ← Flask REST API (Google Cloud Run)
│   ├── app.py                     # API routes (/upload, /upload-frames, trigger management)
│   ├── ocr.py                     # PaddleOCR deep learning text recognition
│   ├── ingredient_checker.py      # Fuzzy & keyword allergen matching (RapidFuzz)
│   ├── db.py                      # Google Cloud Firestore (with SQLite offline fallback)
│   ├── Dockerfile                 # Container definition for Cloud Run
│   └── requirements.txt           # Lean Python dependencies
│
├── allerlens-frontend/            ← React SPA (Vercel)
│   ├── public/
│   ├── src/
│   │   ├── App.js                 # Camera viewfinder, reticle, image capture, state management
│   │   ├── App.css                # Responsive UI styling & camera overlay
│   │   └── index.js
│   └── package.json
│
└── cloudbuild.yaml                ← Automated CI/CD deployment pipeline to GCP
```

| Layer | Technologies |
|---|---|
| **Frontend** | React, HTML5 Camera (`getUserMedia` + `ImageCapture`), Axios |
| **Backend** | Python 3.11, Flask, Gunicorn |
| **OCR Engine** | PaddleOCR (PaddlePaddle) |
| **Database** | Google Cloud Firestore (serverless NoSQL) |
| **Deployment** | Vercel (Frontend) & Google Cloud Run (Backend Docker container) |

---

## 🚀 Running the Project Locally

### 1. Backend Setup (Python + Flask)

```bash
cd allerlens-backend
python -m venv venv

# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
python app.py
```
*The backend runs on `http://127.0.0.1:5000` (uses local SQLite fallback when GCP credentials are not present).*

### 2. Frontend Setup (React)

```bash
cd allerlens-frontend
npm install
npm start
```
*The frontend opens at `http://localhost:3000`.*

---

## 🧠 How It Works

1. **Target:** Position the ingredient text inside the viewfinder reticle.
2. **Capture:** The app captures a high-resolution still frame and enhances contrast for sharp readability.
3. **Recognize:** PaddleOCR extracts all printed text into clean strings.
4. **Flag:** The text is checked against your saved triggers in Firestore using exact and fuzzy matching.
5. **Protect:** Detected allergens are flagged in red alerts so you instantly know what to avoid.

---

## 📜 License

MIT License — Feel free to use, modify, and contribute!
