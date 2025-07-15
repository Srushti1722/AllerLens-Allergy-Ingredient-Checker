import React, { useState, useRef } from 'react';
import axios from 'axios';

function App() {
  const [image, setImage] = useState(null);
  const [customIngredients, setCustomIngredients] = useState("");
  const [results, setResults] = useState(null);
  const [preview, setPreview] = useState(null);
  const [ingredientMessage, setIngredientMessage] = useState("");

  const imageInputRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!image) {
      alert("Please upload an image.");
      return;
    }

    const formData = new FormData();
    formData.append("image", image);

    try {
      const res = await axios.post("http://localhost:5000/upload", formData);
      const uniqueFlagged = [...new Set(res.data.flagged_ingredients)];
      setResults({ ...res.data, flagged_ingredients: uniqueFlagged });
    } catch (err) {
      console.error("Upload Error:", err);
      alert("Something went wrong while uploading.");
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setImage(file);
    if (file) setPreview(URL.createObjectURL(file));
  };

  const handleAddIngredients = async () => {
    if (!customIngredients.trim()) return;

    const ingredients = customIngredients
      .split(',')
      .map(i => i.trim().toLowerCase())
      .filter(i => i.length > 0);
    
    const added = [];

    try {
      for (let ing of ingredients) {
        await axios.post("http://localhost:5000/add-ingredient", {
        ingredient: ing
      });
        added.push(ing);
      }
      setIngredientMessage(`✅ Added: ${added.join(', ')}`);
      setCustomIngredients("");
    } catch (err) {
      console.error(err);
      alert("Failed to add ingredient(s).");
    }
  };

  const handleClear = () => {
    setResults(null);
    setImage(null);
    setPreview(null);
    setCustomIngredients("");
    setIngredientMessage("");
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>✨ AllerLens – Ingredient Checker</h1>

      <form onSubmit={handleSubmit} style={styles.form}>
        <label style={styles.label}>Upload Product Image</label>
        <input
          type="file"
          onChange={handleImageChange}
          accept="image/*"
          style={styles.input}
          ref={imageInputRef}
        />

        {preview && <img src={preview} alt="Preview" style={styles.preview} />}

        <label style={styles.label}>Custom Ingredients (comma-separated)</label>
        <input
          type="text"
          placeholder="e.g. lavender oil, coconut oil"
          value={customIngredients}
          onChange={(e) => setCustomIngredients(e.target.value)}
          style={styles.input}
        />

        <button
          type="button"
          style={{ ...styles.button, backgroundColor: "#2196F3" }}
          onClick={handleAddIngredients}
        >
          ➕ Add Ingredients to DB
        </button>

        <button type="submit" style={styles.button}>🔍 Check Ingredients</button>
        <button type="button" style={styles.clearButton} onClick={handleClear}>🔄 Clear</button>
      </form>

      {ingredientMessage && (
        <p style={{ color: "green", marginTop: "10px" }}>{ingredientMessage}</p>
      )}

      {results && (
        <div style={styles.resultBox}>
          <h2>🧪 Flagged Ingredients</h2>
          <ul style={styles.resultList}>
            {results.flagged_ingredients.length > 0 ? (
              results.flagged_ingredients.map((item, idx) => (
                <li key={idx} style={styles.flaggedItem}>{item}</li>
              ))
            ) : (
              <li style={{ color: "green" }}>No harmful ingredients detected 🎉</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: "40px",
    maxWidth: "700px",
    margin: "auto",
    fontFamily: "'Segoe UI', sans-serif",
    background: "#fdfdfd",
    borderRadius: "14px",
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)"
  },
  title: {
    textAlign: "center",
    color: "#2b2b2b",
    marginBottom: "30px",
    fontWeight: "bold",
    fontSize: "28px"
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "15px"
  },
  label: {
    fontWeight: "600",
    color: "#444"
  },
  input: {
    padding: "10px",
    fontSize: "16px",
    border: "1px solid #ddd",
    borderRadius: "8px"
  },
  button: {
    padding: "12px",
    backgroundColor: "#4CAF50",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer"
  },
  clearButton: {
    padding: "10px",
    backgroundColor: "#f44336",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: "bold",
    cursor: "pointer"
  },
  preview: {
    maxWidth: "100%",
    borderRadius: "10px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.1)"
  },
  resultBox: {
    marginTop: "30px",
    padding: "20px",
    backgroundColor: "#f9f9f9",
    border: "1px solid #eee",
    borderRadius: "12px"
  },
  resultList: {
    listStyleType: "disc",
    paddingLeft: "20px"
  },
  flaggedItem: {
    color: "#d32f2f",
    fontWeight: "500"
  }
};

export default App;
