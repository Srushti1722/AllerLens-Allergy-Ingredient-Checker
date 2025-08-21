// src/App.js
import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import Particles from "react-tsparticles";

const API_URL = "https://allerlens-allergy-ingredient-checker.onrender.com";

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
        await axios.post(`${API_URL}/add-ingredient`, {
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

  // (UI code stays the same …)
  // ...
}

export default App;
