// src/App.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { BarcodeDetector as BarcodeDetectorPolyfill } from "barcode-detector";
import "./App.css";

if (typeof window !== "undefined" && !("BarcodeDetector" in window)) {
  window.BarcodeDetector = BarcodeDetectorPolyfill;
}

const API_URL =
  process.env.REACT_APP_API_URL ||
  "https://allerlens-allergy-ingredient-checker.onrender.com";

const OFF_API = "https://world.openfoodfacts.org/api/v2/product";

// ── Open Food Facts lookup ───────────────────────────────────────────────────
async function fetchProductByBarcode(barcode) {
  const res = await fetch(
    `${OFF_API}/${barcode}.json?fields=product_name,ingredients_text,allergens_tags,image_url`
  );
  if (!res.ok) throw new Error("OFF network error");
  const data = await res.json();
  if (data.status !== 1) return null; // product not found
  return data.product;
}

// ── Client-side ingredient matching (mirrors backend logic) ──────────────────
function matchTriggers(text, triggers) {
  const lower = text.toLowerCase();
  return triggers.filter((t) => lower.includes(t.toLowerCase()));
}

function App() {
  // upload
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [results, setResults] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [debugText, setDebugText] = useState("");

  // triggers
  const [triggers, setTriggers] = useState([]);
  const [newTrigger, setNewTrigger] = useState("");
  const [triggerMsg, setTriggerMsg] = useState("");

  // live scan modes: 'barcode' | 'ocr'
  const [scanMode, setScanMode] = useState("barcode");
  const [scanning, setScanning] = useState(false);
  const [detectingBarcode, setDetectingBarcode] = useState(false);
  const [barcodeState, setBarcodeState] = useState("idle"); // 'idle' | 'targeting' | 'fetching' | 'not_found'
  const [scannedProduct, setScannedProduct] = useState(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // steady & capture states
  const [capturing, setCapturing] = useState(false);

  const barcodeIntervalRef = useRef(null);
  const barcodeDetectorRef = useRef(null);
  const isDetectingFrameRef = useRef(false);
  const scanCanvasRef = useRef(null);

  const imageInputRef = useRef(null);
  const nativeCameraInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // ---------- triggers ----------
  const loadTriggers = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/list-ingredients`);
      setTriggers(res.data?.ingredients || []);
    } catch (err) {
      console.error("Failed to load ingredients:", err);
    }
  }, []);

  useEffect(() => {
    loadTriggers();
  }, [loadTriggers]);

  const handleAddTrigger = async () => {
    const ing = newTrigger.trim().toLowerCase();
    if (!ing) return;
    try {
      await axios.post(`${API_URL}/add-ingredient`, { ingredient: ing });
      setNewTrigger("");
      setTriggerMsg(`Added "${ing}"`);
      setTimeout(() => setTriggerMsg(""), 2200);
      loadTriggers();
    } catch (err) {
      console.error("Failed to add trigger:", err);
      setError("Couldn't add trigger. Please try again.");
    }
  };

  const handleRemoveTrigger = async (ing) => {
    try {
      await axios.delete(`${API_URL}/remove-ingredient`, {
        data: { ingredient: ing },
      });
      loadTriggers();
    } catch (err) {
      console.error("Failed to remove trigger:", err);
    }
  };

  // ---------- upload image ----------
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose a valid image file (JPG or PNG).");
      return;
    }
    setImage(file);
    setPreview(URL.createObjectURL(file));
    setResults(null);
    setScannedProduct(null);
    setError("");
  };

  const clearImage = () => {
    setImage(null);
    setPreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleCheck = async () => {
    if (!image) {
      setError("Please choose or capture an image first.");
      return;
    }
    setProcessing(true);
    setError("");
    setResults(null);
    setScannedProduct(null);

    const formData = new FormData();
    formData.append("image", image);

    try {
      const res = await axios.post(`${API_URL}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180000,
      });
      const uniqueFlagged = [...new Set(res.data?.flagged_ingredients || [])];
      setResults({ ...res.data, flagged_ingredients: uniqueFlagged, source: "upload" });
      if (!res.data?.extracted_text || !res.data.extracted_text.trim()) {
        setError(
          "No text could be read from this image. Please try a clearer or closer photo."
        );
      }
    } catch (err) {
      console.error("Upload error:", err);
      if (err.code === "ECONNABORTED") {
        setError("The server took too long to respond — please try again.");
      } else {
        setError("Couldn't reach the analysis server. Please check your connection and try again.");
      }
    } finally {
      setProcessing(false);
    }
  };

  // ---------- camera utilities ----------
  const stopAllTracks = (stream) => {
    try {
      const s = stream || videoRef.current?.srcObject;
      if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      console.warn("stopAllTracks failed:", e);
    }
    setTorchOn(false);
    setHasTorch(false);
  };

  const toggleTorch = async () => {
    try {
      const s = videoRef.current?.srcObject;
      const track = s?.getVideoTracks?.()[0];
      if (track && track.applyConstraints) {
        const next = !torchOn;
        await track.applyConstraints({
          advanced: [{ torch: next }],
        });
        setTorchOn(next);
      }
    } catch (e) {
      console.warn("Toggle torch failed:", e);
    }
  };

  const waitForVideoReady = (timeoutMs = 2000) => {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const v = videoRef.current;
        if (!v) return resolve(false);
        if (v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) return resolve(true);
        if (Date.now() - start > timeoutMs) return resolve(false);
        requestAnimationFrame(check);
      };
      check();
    });
  };

  const getUsableStream = async () => {
    // Request crisp high resolution (1080p / 720p) with autofocus
    const attempts = [
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        label: "env-1080p",
      },
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        label: "env-720p",
      },
      { video: { facingMode: { ideal: "environment" } }, label: "env-ideal" },
      { video: { facingMode: { exact: "environment" } }, label: "env-exact" },
      { video: true, label: "default" },
      { video: { facingMode: "user" }, label: "user" },
    ];

    let lastError = null;
    for (const a of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: a.video, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try { await videoRef.current.play(); } catch (e) { /* ignore */ }
        }
        const ok = await waitForVideoReady(2000);
        if (ok) {
          console.log("Camera stream ready:", a.label);
          try {
            const track = stream.getVideoTracks()[0];
            if (track) {
              if (track.applyConstraints) {
                await track.applyConstraints({
                  advanced: [{ focusMode: "continuous" }],
                });
              }
              if (track.getCapabilities) {
                const caps = track.getCapabilities();
                if (caps && caps.torch) {
                  setHasTorch(true);
                }
              }
            }
          } catch (e) {
            // ignore if unsupported
          }
          return stream;
        }
        stopAllTracks(stream);
        lastError = `No frames ready for ${a.label}`;
      } catch (err) {
        lastError = err;
        console.debug("getUserMedia attempt failed for", a.label, err);
      }
    }
    throw lastError || new Error("No usable camera stream");
  };

  // ---------- barcode scanning ----------
  const stopBarcodeInterval = useCallback(() => {
    if (barcodeIntervalRef.current) {
      clearInterval(barcodeIntervalRef.current);
      barcodeIntervalRef.current = null;
    }
    setDetectingBarcode(false);
  }, []);

  const handleBarcodeFound = useCallback(
    async (barcodeValue) => {
      stopBarcodeInterval();
      setBarcodeState("fetching");
      setDebugText(`Barcode detected: ${barcodeValue} — searching database…`);

      try {
        const product = await fetchProductByBarcode(barcodeValue);

        if (!product) {
          // Barcode valid, but product is not in Open Food Facts
          setBarcodeState("not_found");
          setDebugText("Product not found in Open Food Facts database.");
          return;
        }

        if (navigator.vibrate) navigator.vibrate([60, 50, 60]);

        setScannedProduct(product);
        const ingredientsText = product.ingredients_text || "";
        const allergenTags = (product.allergens_tags || [])
          .map((t) => t.replace("en:", ""))
          .join(", ");
        const fullText = `${ingredientsText} ${allergenTags}`.trim();

        const flagged = matchTriggers(fullText, triggers);

        setResults({
          extracted_text: ingredientsText || allergenTags || "No ingredients listed for this product.",
          flagged_ingredients: [...new Set(flagged)],
          source: "barcode",
          product_name: product.product_name || "Unknown product",
          product_image: product.image_url || null,
        });

        setBarcodeState("idle");
        setScanning(false);
        stopAllTracks();
        setDebugText("");
      } catch (err) {
        console.error("Barcode lookup error:", err);
        setBarcodeState("not_found");
        setDebugText("Lookup error — try scanning ingredients label instead.");
      }
    },
    [triggers, stopBarcodeInterval]
  );

  const startBarcodeDetection = useCallback(() => {
    stopBarcodeInterval();

    try {
      const Detector = BarcodeDetectorPolyfill || window.BarcodeDetector;
      barcodeDetectorRef.current = new Detector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code", "code_128", "code_39"],
      });
    } catch (e) {
      console.warn("BarcodeDetector initialization failed:", e);
      setError("Barcode scanner could not initialise. Try entering the barcode number directly below.");
      return false;
    }

    setBarcodeState("targeting");
    setDetectingBarcode(true);
    setDebugText("Scanning for barcode in the box…");

    // Scan video stream every 220ms with queue lock and reticle crop
    barcodeIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      if (isDetectingFrameRef.current) return;

      isDetectingFrameRef.current = true;
      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;

        // Crop to the central scan-box reticle (approx 75% width x 55% height)
        const cropW = Math.floor(vw * 0.75);
        const cropH = Math.floor(vh * 0.55);
        const cropX = Math.floor((vw - cropW) / 2);
        const cropY = Math.floor((vh - cropH) / 2);

        if (!scanCanvasRef.current) {
          scanCanvasRef.current = document.createElement("canvas");
        }
        const canvas = scanCanvasRef.current;
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        // 1. Try focused detection on the cropped scan-box area
        let barcodes = await barcodeDetectorRef.current.detect(canvas);

        // 2. Fall back to full frame if not detected in the cropped box
        if (!barcodes || barcodes.length === 0) {
          barcodes = await barcodeDetectorRef.current.detect(video);
        }

        if (barcodes && barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          if (code) {
            handleBarcodeFound(code);
          }
        }
      } catch (e) {
        // Continue polling
      } finally {
        isDetectingFrameRef.current = false;
      }
    }, 220);

    return true;
  }, [handleBarcodeFound, stopBarcodeInterval]);

  // ---------- OCR label capture ----------
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const v = videoRef.current;
    if (v.readyState < 2 || !v.videoWidth) return null;

    const vw = v.videoWidth;
    const vh = v.videoHeight;

    // Crop directly to the targeted scan-box reticle area (84% width x 64% height centered)
    // This removes hands, background, and clutter, focusing all OCR pixel density on the actual text!
    const cropW = Math.floor(vw * 0.84);
    const cropH = Math.floor(vh * 0.64);
    const cropX = Math.floor((vw - cropW) / 2);
    const cropY = Math.floor((vh - cropH) / 2);

    const maxDim = 1600;
    let outW = cropW;
    let outH = cropH;
    if (outW > maxDim || outH > maxDim) {
      if (outW > outH) {
        outH = Math.round((outH * maxDim) / outW);
        outW = maxDim;
      } else {
        outW = Math.round((outW * maxDim) / outH);
        outH = maxDim;
      }
    }

    const canvas = canvasRef.current;
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(v, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

    // Mild contrast stretch to enhance fine printed text against colored/glossy packages
    try {
      const imgData = ctx.getImageData(0, 0, outW, outH);
      const d = imgData.data;
      const contrast = 1.15;
      const intercept = 128 * (1 - contrast);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, Math.max(0, d[i] * contrast + intercept));
        d[i + 1] = Math.min(255, Math.max(0, d[i + 1] * contrast + intercept));
        d[i + 2] = Math.min(255, Math.max(0, d[i + 2] * contrast + intercept));
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (e) {
      // Continue if canvas tainted
    }

    return canvas.toDataURL("image/jpeg", 0.95);
  }, []);

  const handleNativeCameraPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setResults(null);
    setScannedProduct(null);
    setImage(file);
    setPreview(URL.createObjectURL(file));

    if (scanning) {
      stopLiveScan();
    }

    const formData = new FormData();
    formData.append("image", file);

    try {
      setProcessing(true);
      setDebugText("Analyzing high-resolution photo with OCR…");
      const res = await axios.post(`${API_URL}/check-ingredients`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180000,
      });
      const uniqueFlagged = [...new Set(res.data?.flagged_ingredients || [])];
      const allText = (res.data?.all_text || []).join(" ").trim();

      setResults({
        ...res.data,
        extracted_text: allText || res.data?.extracted_text || "",
        flagged_ingredients: uniqueFlagged,
        source: "upload",
      });

      if (!allText && !res.data?.extracted_text) {
        setError("No readable text found in the photo. Please ensure clear lighting and retry.");
      } else {
        setDebugText("");
      }
    } catch (err) {
      console.error("Native photo OCR error:", err);
      setError("Failed to analyze image. Please try again.");
      setDebugText("");
    } finally {
      setProcessing(false);
    }
  };

  const uploadCapturedFrames = useCallback(
    async (frames) => {
      try {
        setProcessing(true);
        setDebugText("Analyzing label text & checking for allergens…");
        const res = await axios.post(
          `${API_URL}/upload-frames`,
          { frames },
          { timeout: 180000 }
        );
        const uniqueFlagged = [...new Set(res.data?.flagged_ingredients || [])];
        const allText = (res.data?.all_text || []).join(" ").trim();

        setResults({
          ...res.data,
          extracted_text: allText || res.data?.extracted_text || "",
          flagged_ingredients: uniqueFlagged,
          source: "ocr",
        });

        if (!allText) {
          setError(
            "Couldn't detect clear text in the box. Please hold closer, ensure good lighting, and retry."
          );
        } else {
          setDebugText("");
        }
      } catch (err) {
        console.error("Live scan upload error:", err);
        setDebugText("");
        if (err.code === "ECONNABORTED") {
          setError("The server took too long to respond — please try again.");
        } else {
          setError("Failed to analyze the label image. Please check your connection and try again.");
        }
      } finally {
        setProcessing(false);
      }
    },
    []
  );

  const triggerCapture = useCallback(async () => {
    if (capturing || processing) return;
    setCapturing(true);

    if (navigator.vibrate) navigator.vibrate(60);

    // Frame 1: immediate sharp frame
    const frame1 = captureFrame();

    // Frame 2: 250ms delay for enhanced multi-frame OCR
    await new Promise((r) => setTimeout(r, 250));
    const frame2 = captureFrame();

    const frames = [frame1, frame2].filter(Boolean);

    // Stop camera and intervals
    stopBarcodeInterval();
    setScanning(false);
    setBarcodeState("idle");
    stopAllTracks();
    setCapturing(false);

    if (frames.length > 0) {
      await uploadCapturedFrames(frames);
    }
  }, [capturing, processing, captureFrame, stopBarcodeInterval, uploadCapturedFrames]);

  // ---------- start / stop scan ----------
  const startLiveScan = async (chosenMode = "barcode") => {
    setResults(null);
    setScannedProduct(null);
    setError("");
    setDetectingBarcode(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot access the camera — requires HTTPS or localhost.");
      return;
    }

    setScanMode(chosenMode);
    setBarcodeState("idle");

    try {
      setScanning(true);
      if (chosenMode === "barcode") {
        setDebugText("Camera open. Position barcode inside the box, then tap 'Scan Barcode'.");
      } else {
        setDebugText("Camera open. Hold phone steady over ingredient text, then tap 'Capture Ingredients'.");
      }
      await getUsableStream();
    } catch (err) {
      console.error("Camera access failed:", err);
      setError("Camera access failed. Please grant camera permission and retry.");
      setScanning(false);
    }
  };

  const stopLiveScan = useCallback(() => {
    stopBarcodeInterval();
    setScanning(false);
    setBarcodeState("idle");
    setDetectingBarcode(false);
    stopAllTracks();
    setDebugText("");
  }, [stopBarcodeInterval]);

  const switchScanMode = (mode) => {
    setScanMode(mode);
    setBarcodeState("idle");
    setDetectingBarcode(false);
    stopBarcodeInterval();

    if (mode === "barcode") {
      setDebugText("Position barcode inside the box, then tap 'Scan Barcode'.");
    } else {
      setDebugText("Hold phone steady over ingredient text, then tap 'Capture Ingredients'.");
    }
  };

  const handleClear = () => {
    clearImage();
    setResults(null);
    setScannedProduct(null);
    setNewTrigger("");
    setTriggerMsg("");
    setError("");
    setDebugText("");
    if (scanning) stopLiveScan();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBarcodeInterval();
      stopAllTracks();
    };
  }, [stopBarcodeInterval]);

  const flagged = results?.flagged_ingredients || [];
  const ocrText = results?.extracted_text || "";

  return (
    <div className="wrap">
      <div className="masthead">
        <span className="mark">A</span>
        <div>
          <div className="name">AllerLens</div>
          <div className="tag">Check product labels against your trigger ingredients</div>
        </div>
      </div>

      <div className="grid">
        {/* ===== LEFT: SCANNER / UPLOADER ===== */}
        <section>
          <div className="card">
            <div className="hd">
              Scan or upload
              <small>Choose how you want to check your item</small>
            </div>
            <div className="bd">
              {/* If camera is NOT open, show the scan mode choices & upload */}
              {!scanning && (
                <>
                  <div className="scan-choices">
                    <button
                      type="button"
                      className="choice-card choice-barcode"
                      onClick={() => startLiveScan("barcode")}
                      disabled={processing}
                    >
                      <span className="choice-icon">📦</span>
                      <div className="choice-info">
                        <b>Scan Barcode</b>
                        <span>Instant lookup via Open Food Facts</span>
                      </div>
                      <span className="choice-action">Start →</span>
                    </button>

                    <button
                      type="button"
                      className="choice-card choice-photo"
                      onClick={() => nativeCameraInputRef.current?.click()}
                      disabled={processing}
                    >
                      <span className="choice-icon">📸</span>
                      <div className="choice-info">
                        <b>High-Res Photo (Phone Camera)</b>
                        <span>Uses phone camera for crystal-clear small text</span>
                      </div>
                      <span className="choice-action">Snap ↗</span>
                    </button>

                    <button
                      type="button"
                      className="choice-card choice-ocr"
                      onClick={() => startLiveScan("ocr")}
                      disabled={processing}
                    >
                      <span className="choice-icon">🎥</span>
                      <div className="choice-info">
                        <b>Live Viewfinder OCR</b>
                        <span>Real-time reticle preview with on-screen crop</span>
                      </div>
                      <span className="choice-action">Start →</span>
                    </button>
                  </div>

                  <div className="barcode-manual-box" style={{ marginTop: "12px", background: "#f8fafc", padding: "10px 14px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "#64748b", marginBottom: "6px" }}>
                      ⌨️ Or enter barcode digits printed on package:
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        type="text"
                        className="inp"
                        style={{ fontSize: "13px", padding: "7px 10px", flex: 1 }}
                        placeholder="e.g. 8901058900194"
                        value={manualBarcode}
                        onChange={(e) => setManualBarcode(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && manualBarcode.trim()) {
                            handleBarcodeFound(manualBarcode.trim());
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn primary"
                        style={{ fontSize: "13px", padding: "7px 14px" }}
                        disabled={!manualBarcode.trim() || barcodeState === "fetching"}
                        onClick={() => {
                          if (manualBarcode.trim()) handleBarcodeFound(manualBarcode.trim());
                        }}
                      >
                        Check
                      </button>
                    </div>
                  </div>

                  <div className="or-divider">
                    <span>or upload a photo</span>
                  </div>

                  {preview ? (
                    <div className="up hasfile">
                      <img className="upimg" src={preview} alt="Label preview" />
                      <div className="fn">
                        <span className="ok" />
                        {image?.name || "Selected image"}
                        <span className="rm" onClick={clearImage}>✕</span>
                      </div>
                    </div>
                  ) : (
                    <div className="up" onClick={() => imageInputRef.current?.click()}>
                      <div className="t1"><b>Choose an image</b> or drag it here</div>
                      <div className="t2">JPG or PNG from your computer or phone library</div>
                    </div>
                  )}
                </>
              )}

              <input
                type="file"
                accept="image/*"
                ref={imageInputRef}
                onChange={handleImageChange}
                style={{ display: "none" }}
              />

              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={nativeCameraInputRef}
                onChange={handleNativeCameraPhoto}
                style={{ display: "none" }}
              />

              {/* Camera viewfinder */}
              {scanning && (
                <div className="live">
                  {/* Mode switcher tabs in viewfinder */}
                  <div className="scan-mode-tabs">
                    <button
                      type="button"
                      className={`mode-tab ${scanMode === "barcode" ? "active" : ""}`}
                      onClick={() => switchScanMode("barcode")}
                    >
                      📦 Barcode Scan
                    </button>
                    <button
                      type="button"
                      className={`mode-tab ${scanMode === "ocr" ? "active" : ""}`}
                      onClick={() => switchScanMode("ocr")}
                    >
                      📄 Ingredients Scan
                    </button>
                  </div>

                  {/* Viewport with camera and the cutout Scanning Box */}
                  <div className="viewport">
                    <video ref={videoRef} playsInline autoPlay muted />

                    {/* Mask overlay cutout focusing on the scanning box */}
                    <div
                      className={`scan-box ${
                        detectingBarcode ? "detecting" : ""
                      } ${barcodeState === "fetching" ? "found" : ""}`}
                    >
                      <span className="corner-tl" />
                      <span className="corner-tr" />
                      <span className="corner-bl" />
                      <span className="corner-br" />

                      {scanMode === "barcode" && (
                        <>
                          {detectingBarcode && <span className="barcode-line" />}
                          <span className="box-hint">
                            {barcodeState === "fetching"
                              ? "BARCODE FOUND!"
                              : detectingBarcode
                              ? "SEARCHING FOR BARCODE..."
                              : "FIT BARCODE IN BOX"}
                          </span>
                        </>
                      )}

                      {scanMode === "ocr" && (
                        <>
                          <span className="ocr-scanline" />
                          <span className="box-hint">FIT INGREDIENTS IN BOX</span>
                        </>
                      )}
                    </div>

                    {/* Camera shutter flash effect */}
                    {capturing && <div className="scan-flash" />}

                    {/* Barcode fetch state */}
                    {barcodeState === "fetching" && (
                      <div className="viewport-overlay">
                        <div className="vp-spinner" />
                        <div className="vp-label">Barcode detected! Looking up product…</div>
                      </div>
                    )}

                    {/* Barcode not found fallback overlay */}
                    {barcodeState === "not_found" && (
                      <div className="viewport-overlay viewport-overlay--warn">
                        <div className="vp-label">
                          Barcode not found in database
                        </div>
                        <div className="vp-actions">
                          <button
                            type="button"
                            className="btn primary"
                            onClick={() => switchScanMode("ocr")}
                          >
                            📄 Scan Ingredients Label Instead
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setBarcodeState("idle");
                              setDetectingBarcode(false);
                            }}
                          >
                            🔄 Try Barcode Again
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Viewport footer & controls */}
                  <div className="live-footer">
                    {scanMode === "ocr" ? (
                      <div className="live-action-row" style={{ flexWrap: "wrap", gap: "8px" }}>
                        <button
                          type="button"
                          className="btn primary btn-capture"
                          onClick={triggerCapture}
                          disabled={capturing || processing}
                        >
                          📸 Capture Reticle
                        </button>
                        <button
                          type="button"
                          className="btn"
                          style={{ background: "#2563eb", borderColor: "#2563eb", color: "#fff", fontWeight: "600" }}
                          onClick={() => nativeCameraInputRef.current?.click()}
                          disabled={capturing || processing}
                          title="Snap a crystal-clear photo with your phone's native camera"
                        >
                          📷 High-Res Photo
                        </button>
                        {hasTorch && (
                          <button
                            type="button"
                            className={`btn ${torchOn ? "btn-warning" : ""}`}
                            onClick={toggleTorch}
                            title="Turn flashlight on/off"
                          >
                            {torchOn ? "🔦 Flash ON" : "💡 Flash"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-stop"
                          onClick={stopLiveScan}
                        >
                          ✕ Close Camera
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="live-action-row" style={{ flexWrap: "wrap", gap: "8px" }}>
                          {!detectingBarcode ? (
                            <button
                              type="button"
                              className="btn primary btn-capture"
                              onClick={startBarcodeDetection}
                              disabled={processing || barcodeState === "fetching"}
                            >
                              🔍 Scan Barcode
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-warning"
                              onClick={stopBarcodeInterval}
                            >
                              ⏸️ Pause Scanner
                            </button>
                          )}
                          {hasTorch && (
                            <button
                              type="button"
                              className={`btn ${torchOn ? "btn-warning" : ""}`}
                              onClick={toggleTorch}
                              title="Turn flashlight on/off"
                            >
                              {torchOn ? "🔦 Flash ON" : "💡 Flash"}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-stop"
                            onClick={stopLiveScan}
                          >
                            ✕ Close Camera
                          </button>
                        </div>

                        <div style={{ marginTop: "8px", display: "flex", gap: "6px" }}>
                          <input
                            type="text"
                            className="inp"
                            style={{ fontSize: "12px", padding: "6px 8px", flex: 1, background: "rgba(255,255,255,0.92)" }}
                            placeholder="Or type barcode digits (e.g. 8901058900194)…"
                            value={manualBarcode}
                            onChange={(e) => setManualBarcode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && manualBarcode.trim()) {
                                handleBarcodeFound(manualBarcode.trim());
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="btn primary"
                            style={{ fontSize: "12px", padding: "6px 12px" }}
                            disabled={!manualBarcode.trim() || barcodeState === "fetching"}
                            onClick={() => {
                              if (manualBarcode.trim()) handleBarcodeFound(manualBarcode.trim());
                            }}
                          >
                            Check
                          </button>
                        </div>
                      </>
                    )}

                    <div className="live-guidance">
                      {scanMode === "ocr"
                        ? "Hold your phone steady over the ingredients and tap 'Capture Ingredients'."
                        : !detectingBarcode
                        ? "Position the barcode inside the box, then tap 'Scan Barcode'."
                        : "Looking for barcode... Hold steady."}
                    </div>
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} style={{ display: "none" }} />
            </div>
          </div>

          <div className="card">
            <div className="bd">
              <div className="acts">
                {image && (
                  <button
                    className="btn primary"
                    onClick={handleCheck}
                    disabled={processing || scanning}
                  >
                    Check uploaded image
                  </button>
                )}
                <span className="spacer" />
                <button className="clear" onClick={handleClear}>Clear / Reset</button>
              </div>

              {processing && (
                <div className="job">
                  <span className="sp" />
                  Analyzing — reading text &amp; matching ingredients…
                </div>
              )}

              {debugText && <div className="dbg">{debugText}</div>}
              {error && <div className="err">{error}</div>}
            </div>
          </div>

          <div className="card">
            <div className="hd">
              Trigger ingredients
              <small>Every scan is checked against this list</small>
            </div>
            <div className="bd">
              <div className="trig">
                {triggers.length === 0 && (
                  <span className="empty">No triggers saved yet.</span>
                )}
                {triggers.map((t) => (
                  <span
                    key={t}
                    className={
                      flagged.some((f) => f.toLowerCase().includes(t.toLowerCase()))
                        ? "tag hit"
                        : "tag"
                    }
                  >
                    {t}
                    <button
                      className="x"
                      title={`Remove ${t}`}
                      onClick={() => handleRemoveTrigger(t)}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="addrow">
                <input
                  className="inp"
                  placeholder="Add an ingredient (e.g. peanuts, milk)…"
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTrigger()}
                />
                <button className="btn" onClick={handleAddTrigger}>Add</button>
              </div>
              {triggerMsg && <div className="msg">{triggerMsg}</div>}
            </div>
          </div>
        </section>

        {/* ===== RIGHT: RESULTS & HOW-TO ===== */}
        <section>
          {results ? (
            <div className="card">
              <div className="hd">
                Result
                {results.source === "barcode" && (
                  <small style={{ color: "#059669" }}>via barcode lookup ⚡</small>
                )}
                {results.source === "ocr" && <small>via label OCR</small>}
                {results.source === "upload" && <small>via image upload</small>}
              </div>

              {/* Product card if from Open Food Facts */}
              {scannedProduct && (
                <div className="prod-card">
                  {scannedProduct.image_url && (
                    <img
                      className="prod-img"
                      src={scannedProduct.image_url}
                      alt={scannedProduct.product_name || "Product"}
                    />
                  )}
                  <div className="prod-info">
                    <div className="prod-name">{results.product_name}</div>
                    <div className="prod-source">Open Food Facts database</div>
                  </div>
                </div>
              )}

              <div className="result">
                {flagged.length > 0 ? (
                  <>
                    <div className="rline r">
                      <span className="rdot bad" />
                      <b>{flagged.length} trigger{flagged.length > 1 ? "s" : ""} found</b>
                    </div>
                    <div className="rsub">
                      Matched against your {triggers.length} trigger{triggers.length === 1 ? "" : "s"}
                    </div>
                    <div className="sep" />
                    <div className="flags">
                      {flagged.map((f, i) => (
                        <div className="match" key={i}>
                          <span className="mdot" />
                          <div><b>{f}</b></div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rline g">
                      <span className="rdot good" />
                      <b>No triggers found</b>
                    </div>
                    <div className="rsub">
                      None of your trigger ingredients appear on this label
                    </div>
                  </>
                )}

                {ocrText && (
                  <>
                    <div className="sep" />
                    <div className="ocr">
                      <div className="lbl">
                        {results.source === "barcode"
                          ? "Ingredient list (from database)"
                          : "Detected text from the label"}
                      </div>
                      {ocrText}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="hd">Result</div>
              <div className="result">
                <div className="rsub" style={{ paddingLeft: 0 }}>
                  Scan a barcode or label to see results here.
                </div>
                <div className="how">
                  <div className="how-row">
                    <span className="how-icon">📦</span>
                    <div>
                      <b>Scan Barcode</b> — position barcode in the box and tap Scan for an instant lookup.
                    </div>
                  </div>
                  <div className="how-row">
                    <span className="how-icon">📄</span>
                    <div>
                      <b>Scan Ingredients</b> — hold steady over the package ingredient list and tap Capture.
                    </div>
                  </div>
                  <div className="how-row">
                    <span className="how-icon">🖼️</span>
                    <div>
                      <b>Upload Photo</b> — choose an existing photo from your library.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default App;
