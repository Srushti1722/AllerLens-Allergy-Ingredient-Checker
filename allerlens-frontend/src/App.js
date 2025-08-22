// src/App.js
import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import Particles from "react-tsparticles";

// ✅ use environment variable, fallback to Render backend
const API_URL =
  process.env.REACT_APP_API_URL ||
  "https://allerlens-allergy-ingredient-checker.onrender.com";

function App() {
  const [image, setImage] = useState(null);
  const [customIngredients, setCustomIngredients] = useState("");
  const [results, setResults] = useState(null);
  const [preview, setPreview] = useState(null);
  const [ingredientMessage, setIngredientMessage] = useState("");

  const [scanning, setScanning] = useState(false);
  const [capturedFrames, setCapturedFrames] = useState(0);
  const [framesBuffer, setFramesBuffer] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);

  const imageInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const maxFrames = 15;

  // ---- CAMERA FUNCTIONS ----
  const startLiveScan = async () => {
    setScanning(true);
    setCapturedFrames(0);
    setFramesBuffer([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error(err);
      alert("Could not access camera. Please allow permissions.");
      setScanning(false);
    }
  };

  const stopLiveScan = async () => {
    setScanning(false);
    const tracks = videoRef.current?.srcObject?.getTracks?.();
    if (tracks && tracks.length) tracks.forEach((t) => t.stop());

    if (framesBuffer.length > 0) {
      try {
        setProcessing(true);
        const res = await axios.post(`${API_URL}/upload-frames`, {
          frames: framesBuffer,
        });
        setResults({
          flagged_ingredients: res.data.flagged_ingredients || [],
          all_text: res.data.all_text,
        });
      } catch (err) {
        console.error("Live scan upload error:", err);
        alert("Failed to process live scan frames.");
      } finally {
        setFramesBuffer([]);
        setCapturedFrames(0);
        setProcessing(false);
      }
    }
  };

  useEffect(() => {
    let interval;
    if (scanning) {
      interval = setInterval(() => {
        setCapturedFrames((c) => {
          if (c >= maxFrames) {
            stopLiveScan();
            return c;
          }
          captureFrame();
          return c + 1;
        });
      }, 300);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    ctx.drawImage(
      videoRef.current,
      0,
      0,
      canvasRef.current.width,
      canvasRef.current.height
    );
    const dataUrl = canvasRef.current.toDataURL("image/jpeg");
    setFramesBuffer((prev) => [...prev, dataUrl]);
  };

  // ---- IMAGE UPLOAD ----
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!image) {
      alert("Please upload an image.");
      return;
    }
    const formData = new FormData();
    formData.append("image", image);

    try {
      setProcessing(true);
      const res = await axios.post(`${API_URL}/upload`, formData);
      const uniqueFlagged = [
        ...new Set((res.data?.flagged_ingredients || []).map((i) => i)),
      ];
      setResults({ ...res.data, flagged_ingredients: uniqueFlagged });
    } catch (err) {
      console.error("Upload Error:", err);
      alert("Something went wrong while uploading.");
    } finally {
      setProcessing(false);
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    setImage(file || null);
    if (file) setPreview(URL.createObjectURL(file));
    else setPreview(null);
  };

  // ---- ADD CUSTOM INGREDIENT ----
  const handleAddIngredients = async () => {
    if (!customIngredients.trim()) return;

    const ingredients = customIngredients
      .split(",")
      .map((i) => i.trim().toLowerCase())
      .filter((i) => i.length > 0);

    if (ingredients.length === 0) return;

    const added = [];
    try {
      for (let ing of ingredients) {
        await axios.post(`${API_URL}/add-ingredient`, { ingredient: ing });
        added.push(ing);
      }
      setIngredientMessage(`✅ Added: ${added.join(", ")}`);
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
    setFramesBuffer([]);
    setCapturedFrames(0);
    if (imageInputRef.current) imageInputRef.current.value = "";
    stopLiveScan();
  };

  // ---- UI ----
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
        background: "#e6f0fa",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <Particles
        style={{ position: "absolute", top: 0, left: 0, zIndex: 0 }}
        options={{
          background: { color: { value: "#e6f0fa" } },
          fpsLimit: 60,
          interactivity: {
            events: {
              onHover: { enable: true, mode: "repulse" },
              onClick: { enable: true, mode: "push" },
              resize: true,
            },
            modes: { repulse: { distance: 100, duration: 0.4 }, push: { quantity: 4 } },
          },
          particles: {
            color: { value: ["#a8d0e6", "#f7dada", "#c3f0f2", "#d0e6ff"] },
            links: { enable: true, color: "#ffffff", distance: 120, opacity: 0.2, width: 1 },
            move: { enable: true, speed: 0.3, random: true, outModes: "bounce" },
            number: { value: 50, density: { enable: true, area: 800 } },
            opacity: { value: 0.3 },
            shape: { type: "circle" },
            size: { value: { min: 1, max: 3 } },
          },
          detectRetina: true,
        }}
      />

      <div style={{ position: "relative", zIndex: 1, padding: "2rem", textAlign: "center" }}>
        <h1 style={{ color: "#1a3d6d", fontSize: "2.5rem", marginBottom: "1rem" }}>
          AllerLens – Allergy Ingredient Checker
        </h1>

        {/* Upload Section */}
        <form
          onSubmit={handleSubmit}
          style={{
            background: "#ffffffaa",
            padding: "1.5rem",
            borderRadius: "15px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            display: "inline-block",
            marginBottom: "1.5rem",
          }}
        >
          <input
            type="file"
            accept="image/*"
            onChange={handleImageChange}
            ref={imageInputRef}
            style={{ marginBottom: "1rem" }}
          />
          <br />
          {preview && (
            <img
              src={preview}
              alt="Preview"
              style={{ maxWidth: "250px", borderRadius: "10px", marginBottom: "1rem" }}
            />
          )}
          <br />
          <button
            type="submit"
            disabled={processing}
            onMouseEnter={() => setHoveredButton("upload")}
            onMouseLeave={() => setHoveredButton(null)}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              background: hoveredButton === "upload" ? "#1a3d6d" : "#3d7ecb",
              color: "white",
              cursor: "pointer",
              marginRight: "10px",
            }}
          >
            {processing ? "Processing..." : "Upload & Check"}
          </button>
          <button
            type="button"
            onClick={handleClear}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              background: "#f57c7c",
              color: "white",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </form>

        {/* Live Scan */}
        <div style={{ marginTop: "1.5rem" }}>
          {!scanning ? (
            <button
              onClick={startLiveScan}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: "none",
                background: "#2ecc71",
                color: "white",
                cursor: "pointer",
              }}
            >
              Start Live Scan
            </button>
          ) : (
            <button
              onClick={stopLiveScan}
              style={{
                padding: "10px 20px",
                borderRadius: "8px",
                border: "none",
                background: "#e67e22",
                color: "white",
                cursor: "pointer",
              }}
            >
              Stop Scan ({capturedFrames}/{maxFrames})
            </button>
          )}
        </div>
        <video ref={videoRef} style={{ marginTop: "1rem", maxWidth: "300px", borderRadius: "10px" }} />
        <canvas ref={canvasRef} width="300" height="200" style={{ display: "none" }} />

        {/* Add Ingredients */}
        <div style={{ marginTop: "2rem" }}>
          <input
            type="text"
            placeholder="Add ingredients (comma separated)"
            value={customIngredients}
            onChange={(e) => setCustomIngredients(e.target.value)}
            style={{
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #ccc",
              width: "60%",
              marginRight: "10px",
            }}
          />
          <button
            onClick={handleAddIngredients}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              background: "#8e44ad",
              color: "white",
              cursor: "pointer",
            }}
          >
            Add
          </button>
          {ingredientMessage && (
            <p style={{ color: "green", marginTop: "0.5rem" }}>{ingredientMessage}</p>
          )}
        </div>

        {/* Results */}
        {results && (
          <div
            style={{
              marginTop: "2rem",
              background: "#ffffffcc",
              padding: "1.5rem",
              borderRadius: "15px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              display: "inline-block",
              textAlign: "left",
              maxWidth: "600px",
            }}
          >
            <h2 style={{ color: "#1a3d6d", marginBottom: "1rem" }}>Results</h2>
            <p>
              <strong>All Text:</strong> {results.all_text}
            </p>
            <p>
              <strong>Flagged Ingredients:</strong>{" "}
              {results.flagged_ingredients.length > 0 ? (
                <ul>
                  {results.flagged_ingredients.map((ing, idx) => (
                    <li key={idx} style={{ color: "red", fontWeight: "bold" }}>
                      {ing}
                    </li>
                  ))}
                </ul>
              ) : (
                <span style={{ color: "green" }}>None Found 🎉</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
