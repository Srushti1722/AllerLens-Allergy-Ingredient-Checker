# db.py
import sqlite3

def init_db():
    conn = sqlite3.connect("ingredients.db")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS triggers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ingredient TEXT UNIQUE
        )
    """)
    conn.commit()
    conn.close()

def get_trigger_ingredients():
    conn = sqlite3.connect("ingredients.db")
    cursor = conn.cursor()
    cursor.execute("SELECT DISTINCT ingredient FROM triggers")
    rows = cursor.fetchall()
    conn.close()
    return [row[0] for row in rows]

def add_custom_ingredient(ingredient):
    conn = sqlite3.connect("ingredients.db")
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM triggers WHERE ingredient = ?", (ingredient,))
    exists = cursor.fetchone()[0]
    if not exists:
        cursor.execute("INSERT INTO triggers (ingredient) VALUES (?)", (ingredient,))
        conn.commit()
    conn.close()
