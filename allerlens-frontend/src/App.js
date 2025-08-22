// src/App.js
import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import Particles from "react-tsparticles";

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
        const res = await axios.post('${API_URL}/upload-frames', {
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
      const res = await axios.post('${API_URL}/upload', formData);
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
        await axios.post('${API_URL}/add-ingredient', {
          ingredient: ing,
        });
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

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100vh",
        overflow: "hidden",
        background: "#e6f0fa",
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
            modes: {
              repulse: { distance: 100, duration: 0.4 },
              push: { quantity: 4 },
            },
          },
          particles: {
            color: { value: ["#a8d0e6", "#f7dada", "#c3f0f2", "#d0e6ff"] },
            links: {
              enable: true,
              color: "#ffffff",
              distance: 120,
              opacity: 0.2,
              width: 1,
            },
            move: {
              enable: true,
              speed: 0.3,
              direction: "none",
              random: true,
              outModes: "bounce",
            },
            number: { value: 50, density: { enable: true, area: 800 } },
            opacity: { value: 0.3 },
            shape: { type: "circle" },
            size: { value: { min: 1, max: 3 } },
          },
          detectRetina: true,
        }}
      />

      <div style={styles.gradientOverlay}></div>

      <div style={styles.pageContainer}>
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
            {preview && (
              <img src={preview} alt="Preview" style={styles.preview} />
            )}

            <label style={styles.label}>
              Custom Ingredients (comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. lavender oil, coconut oil"
              value={customIngredients}
              onChange={(e) => setCustomIngredients(e.target.value)}
              style={styles.input}
            />

            <button
              type="button"
              style={{
                ...styles.button,
                ...(hoveredButton === "add" ? styles.buttonHover : {}),
              }}
              onMouseEnter={() => setHoveredButton("add")}
              onMouseLeave={() => setHoveredButton(null)}
              onClick={handleAddIngredients}
            >
              ➕ Add Ingredients to DB
            </button>

            <button
              type="submit"
              style={{
                ...styles.button,
                ...(hoveredButton === "check" ? styles.buttonHover : {}),
              }}
              onMouseEnter={() => setHoveredButton("check")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              🔍 Check Ingredients
            </button>

            <button
              type="button"
              style={{
                ...styles.clearButton,
                ...(hoveredButton === "clear" ? styles.clearButtonHover : {}),
              }}
              onMouseEnter={() => setHoveredButton("clear")}
              onMouseLeave={() => setHoveredButton(null)}
              onClick={handleClear}
            >
              🔄 Clear
            </button>
          </form>

          {!scanning ? (
            <button
              style={{ ...styles.button, marginTop: "15px" }}
              onClick={startLiveScan}
              onMouseEnter={() => setHoveredButton("live")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              📸 Start Live Scan
            </button>
          ) : (
            <button
              style={{ ...styles.clearButton, marginTop: "15px" }}
              onClick={stopLiveScan}
              onMouseEnter={() => setHoveredButton("live")}
              onMouseLeave={() => setHoveredButton(null)}
            >
              ⏹ Stop Live Scan
            </button>
          )}

          {scanning && (
            <div style={styles.videoContainer}>
              <video
                ref={videoRef}
                width="400"
                height="300"
                style={styles.video}
              />
              <canvas
                ref={canvasRef}
                width="400"
                height="300"
                style={{ display: "none" }}
              />
              <p style={styles.videoText}>
                📷 Captured {capturedFrames}/{maxFrames} frames
              </p>
            </div>
          )}

          {processing && (
            <p style={styles.processingText}>⏳ Processing ingredients...</p>
          )}
          {ingredientMessage && (
            <p style={styles.ingredientMsg}>{ingredientMessage}</p>
          )}

          {results && (
            <div style={styles.resultBox}>
              <h2>🧪 Flagged Ingredients</h2>
              <ul style={styles.resultList}>
                {results.flagged_ingredients &&
                results.flagged_ingredients.length > 0 ? (
                  results.flagged_ingredients.map((item, idx) => (
                    <li key={idx} style={styles.flaggedItem}>
                      {item}
                    </li>
                  ))
                ) : (
                  <li style={{ color: "#000000ff" }}>
                    No harmful ingredients detected 🎉
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background:
      "linear-gradient(135deg, rgba(144, 200, 230, 0.3), rgba(171, 207, 248, 0.3))",
    zIndex: 0,
  },
  pageContainer: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "100vh",
    padding: "40px",
  },
  container: {
    padding: "40px",
    maxWidth: "700px",
    width: "100%",
    borderRadius: "20px",
    background: "rgba(255, 255, 255, 0.2)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.3)",
    boxShadow: "0 10px 40px rgba(0,0,0,0.1)",
    color: "#2b2b2b",
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  title: {
    textAlign: "center",
    fontWeight: "bold",
    fontSize: "28px",
    marginBottom: "30px",
  },
  form: { display: "flex", flexDirection: "column", gap: "18px" },
  label: { fontWeight: "600", color: "#2b2b2b" },
  input: {
    padding: "10px",
    fontSize: "16px",
    borderRadius: "12px",
    border: "1px solid rgba(0,0,0,0.15)",
    background: "rgba(255,255,255,0.25)",
    color: "#2b2b2b",
    transition: "all 0.3s ease",
  },
  button: {
    padding: "12px",
    backgroundColor: "#a8d0e6",
    color: "#2b2b2b",
    border: "none",
    borderRadius: "12px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box",
    backdropFilter: "blur(5px)",
    transition: "all 0.3s ease",
    marginBottom: "10px",
  },
  buttonHover: { transform: "scale(1.05)", boxShadow: "0 6px 20px rgba(0,0,0,0.15)" },
  clearButton: {
    padding: "12px",
    backgroundColor: "#c3f0f2",
    color: "#1b3b5f",
    border: "none",
    borderRadius: "12px",
    fontSize: "16px",
    fontWeight: "bold",
    cursor: "pointer",
    width: "100%",
    boxSizing: "border-box",
    backdropFilter: "blur(5px)",
    transition: "all 0.3s ease",
    marginBottom: "10px",
  },
  clearButtonHover: {
    transform: "scale(1.05)",
    boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
  },
  preview: {
    maxWidth: "100%",
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
  },
  videoContainer: {
    marginTop: "20px",
    textAlign: "center",
    background: "rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "10px",
    backdropFilter: "blur(10px)",
  },
  video: { borderRadius: "12px", boxShadow: "0 4px 15px rgba(0,0,0,0.1)" },
  videoText: { color: "#2b2b2b", marginTop: "8px" },
  processingText: { color: "#2b2b2b", fontWeight: "bold", marginTop: "15px" },
  ingredientMsg: { color: "#2b2b2b", marginTop: "10px" },
  resultBox: {
    marginTop: "30px",
    padding: "20px",
    background: "rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "16px",
    backdropFilter: "blur(10px)",
    color: "#2b2b2b",
  },
  resultList: { listStyleType: "disc", paddingLeft: "20px" },
  flaggedItem: { color: "#000000", fontWeight: "500" },
};

export default App;
