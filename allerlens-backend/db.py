# db.py
import os
import sqlite3

# Default allergens seeded if the database is newly initialized
DEFAULT_TRIGGERS = [
    "peanuts",
    "milk",
    "gluten",
    "wheat",
    "eggs",
    "soy",
    "tree nuts",
    "fish",
    "shellfish",
    "sesame",
    "mustard",
]

_firestore_client = None
_use_firestore = True


def _get_firestore_client():
    global _firestore_client, _use_firestore
    if not _use_firestore:
        return None
    if _firestore_client is None:
        try:
            from google.cloud import firestore
            project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "allerlens-510104")
            _firestore_client = firestore.Client(project=project_id)
            print(f"Connected to Google Cloud Firestore (project={project_id})")
        except Exception as e:
            print(f"Firestore not available, falling back to local SQLite: {e}")
            _use_firestore = False
            return None
    return _firestore_client


def _init_sqlite():
    conn = sqlite3.connect("ingredients.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS triggers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ingredient TEXT UNIQUE
        )
    """)
    # Seed default triggers if table is empty
    cursor.execute("SELECT COUNT(*) FROM triggers")
    if cursor.fetchone()[0] == 0:
        for t in DEFAULT_TRIGGERS:
            cursor.execute("INSERT OR IGNORE INTO triggers (ingredient) VALUES (?)", (t,))
        conn.commit()
    conn.close()


def init_db():
    """Initializes Firestore (or local SQLite fallback) and seeds default allergens if empty."""
    db = _get_firestore_client()
    if db:
        try:
            col = db.collection("triggers")
            # Check if any documents exist
            existing = list(col.limit(1).stream())
            if not existing:
                print("Seeding default triggers into Firestore...")
                batch = db.batch()
                for trigger in DEFAULT_TRIGGERS:
                    doc_ref = col.document(trigger)
                    batch.set(doc_ref, {"name": trigger})
                batch.commit()
                print("Firestore seeded successfully.")
            return
        except Exception as e:
            print(f"Firestore init error, falling back to SQLite: {e}")

    _init_sqlite()


def get_trigger_ingredients():
    """Returns a list of all unique trigger ingredients."""
    db = _get_firestore_client()
    if db:
        try:
            docs = db.collection("triggers").stream()
            triggers = [doc.id for doc in docs]
            if triggers:
                return sorted(set(triggers))
        except Exception as e:
            print("Firestore read failed, checking SQLite fallback:", e)

    # SQLite fallback
    try:
        conn = sqlite3.connect("ingredients.db")
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT ingredient FROM triggers")
        rows = cursor.fetchall()
        conn.close()
        return sorted(set([row[0] for row in rows] or DEFAULT_TRIGGERS))
    except Exception:
        return DEFAULT_TRIGGERS


def add_custom_ingredient(ingredient):
    """Adds a custom trigger ingredient."""
    cleaned = ingredient.strip().lower()
    if not cleaned:
        return

    db = _get_firestore_client()
    if db:
        try:
            db.collection("triggers").document(cleaned).set({"name": cleaned})
            return
        except Exception as e:
            print("Firestore write failed, falling back to SQLite:", e)

    # SQLite fallback
    conn = sqlite3.connect("ingredients.db")
    cursor = conn.cursor()
    cursor.execute("INSERT OR IGNORE INTO triggers (ingredient) VALUES (?)", (cleaned,))
    conn.commit()
    conn.close()


def remove_custom_ingredient(ingredient):
    """Removes a trigger ingredient."""
    cleaned = ingredient.strip().lower()
    if not cleaned:
        return 0

    db = _get_firestore_client()
    if db:
        try:
            db.collection("triggers").document(cleaned).delete()
            return 1
        except Exception as e:
            print("Firestore delete failed, falling back to SQLite:", e)

    # SQLite fallback
    conn = sqlite3.connect("ingredients.db")
    cursor = conn.cursor()
    cursor.execute("DELETE FROM triggers WHERE ingredient = ?", (cleaned,))
    removed = cursor.rowcount
    conn.commit()
    conn.close()
    return removed
