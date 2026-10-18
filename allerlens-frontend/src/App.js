// src/App.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import "./App.css";

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
  const [barcodeState, setBarcodeState] = useState("idle"); // 'idle' | 'targeting' | 'fetching' | 'not_found'
  const [scannedProduct, setScannedProduct] = useState(null);

  // steady & auto-capture states for OCR mode
  const [isSteady, setIsSteady] = useState(false);
  const [steadyProgress, setSteadyProgress] = useState(0);
  const [capturing, setCapturing] = useState(false);

  const barcodeIntervalRef = useRef(null);
  const barcodeDetectorRef = useRef(null);
  const lastSampleRef = useRef(null);
  const steadyCountRef = useRef(0);

  const imageInputRef = useRef(null);
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
  };

  const waitForVideoReady = (timeoutMs = 1800) => {
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
    // Request crisp high resolution (1080p / 720p) for sharp text readability
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
        const ok = await waitForVideoReady(1800);
        if (ok) {
          console.log("Camera stream ready:", a.label);
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

    if (!("BarcodeDetector" in window)) {
      console.info("BarcodeDetector API not supported in this browser; defaulting to OCR mode.");
      setScanMode("ocr");
      setBarcodeState("idle");
      return false;
    }

    try {
      barcodeDetectorRef.current = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code", "code_128", "code_39"],
      });
    } catch (e) {
      console.warn("BarcodeDetector initialization failed:", e);
      setScanMode("ocr");
      setBarcodeState("idle");
      return false;
    }

    setBarcodeState("targeting");

    // Continuously scan video stream for barcode inside or near the scanning box
    barcodeIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;

      try {
        const barcodes = await barcodeDetectorRef.current.detect(video);
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          if (code) {
            handleBarcodeFound(code);
          }
        }
      } catch (e) {
        // Non-fatal frame read glitch — continue polling
      }
    }, 280);

    return true;
  }, [handleBarcodeFound, stopBarcodeInterval]);

  // ---------- OCR label capture ----------
  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const v = videoRef.current;
    if (v.readyState < 2 || !v.videoWidth) return null;

    // Use up to 1600px width/height for razor-sharp OCR clarity
    const maxDim = 1600;
    let w = v.videoWidth;
    let h = v.videoHeight;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    canvasRef.current.width = w;
    canvasRef.current.height = h;
    const ctx = canvasRef.current.getContext("2d");
    ctx.drawImage(v, 0, 0, w, h);
    return canvasRef.current.toDataURL("image/jpeg", 0.90);
  }, []);

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
            "Couldn't detect clear text in the box. Please ensure the label is well-lit and in focus."
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

    // Frame 2: 250ms later for multi-frame OCR enhancement
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

  // ---------- Real-time stability & text detection (OCR mode) ----------
  useEffect(() => {
    if (!scanning || scanMode !== "ocr" || processing || capturing) {
      setIsSteady(false);
      setSteadyProgress(0);
      steadyCountRef.current = 0;
      lastSampleRef.current = null;
      return;
    }

    const checkCanvas = document.createElement("canvas");
    const checkCtx = checkCanvas.getContext("2d", { willReadFrequently: true });
    const sampleW = 100;
    const sampleH = 70;
    checkCanvas.width = sampleW;
    checkCanvas.height = sampleH;

    const interval = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.readyState < 2 || !v.videoWidth || !checkCtx) return;

      const vw = v.videoWidth;
      const vh = v.videoHeight;
      // Focus on the center scanning box region (75% width, 60% height)
      const cropW = vw * 0.75;
      const cropH = vh * 0.60;
      const cropX = (vw - cropW) / 2;
      const cropY = (vh - cropH) / 2;

      checkCtx.drawImage(v, cropX, cropY, cropW, cropH, 0, 0, sampleW, sampleH);
      const imgData = checkCtx.getImageData(0, 0, sampleW, sampleH);
      const data = imgData.data;

      // 1. Edge gradient calculation (text detection)
      let edgeSum = 0;
      for (let y = 0; y < sampleH; y++) {
        for (let x = 1; x < sampleW; x++) {
          const i1 = (y * sampleW + x) * 4;
          const i0 = (y * sampleW + (x - 1)) * 4;
          const lum1 = 0.299 * data[i1] + 0.587 * data[i1 + 1] + 0.114 * data[i1 + 2];
          const lum0 = 0.299 * data[i0] + 0.587 * data[i0 + 1] + 0.114 * data[i0 + 2];
          edgeSum += Math.abs(lum1 - lum0);
        }
      }
      const avgEdge = edgeSum / (sampleW * sampleH);

      // 2. Motion calculation (frame difference)
      let motion = 999;
      if (lastSampleRef.current) {
        let diffSum = 0;
        const last = lastSampleRef.current;
        for (let i = 0; i < data.length; i += 4) {
          diffSum +=
            Math.abs(data[i] - last[i]) +
            Math.abs(data[i + 1] - last[i + 1]) +
            Math.abs(data[i + 2] - last[i + 2]);
        }
        motion = diffSum / (sampleW * sampleH * 3);
      }
      lastSampleRef.current = new Uint8ClampedArray(data);

      // Criteria: avgEdge > 7.5 (printed text detail) & motion < 8 (steady camera)
      const hasTextInBox = avgEdge > 7.5;
      const cameraSteady = motion < 8;

      if (hasTextInBox && cameraSteady) {
        steadyCountRef.current += 1;
        setIsSteady(true);
        const progress = Math.min(100, (steadyCountRef.current / 4) * 100);
        setSteadyProgress(progress);

        if (steadyCountRef.current >= 4) {
          // Held steady over text for ~1 second -> auto capture!
          triggerCapture();
        }
      } else {
        steadyCountRef.current = Math.max(0, steadyCountRef.current - 1);
        if (steadyCountRef.current === 0) {
          setIsSteady(false);
          setSteadyProgress(0);
        }
      }
    }, 240);

    return () => clearInterval(interval);
  }, [scanning, scanMode, processing, capturing, triggerCapture]);

  // ---------- start / stop scan ----------
  const startLiveScan = useCallback(async () => {
    setResults(null);
    setScannedProduct(null);
    setError("");
    setDebugText("Opening camera…");
    setIsSteady(false);
    setSteadyProgress(0);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot access the camera — requires HTTPS or localhost.");
      setDebugText("");
      return;
    }

    try {
      setScanning(true);
      await getUsableStream();

      // Check if BarcodeDetector is supported; if not, default to OCR mode
      const hasBarcode = "BarcodeDetector" in window;
      if (hasBarcode && scanMode === "barcode") {
        startBarcodeDetection();
        setDebugText("Align the barcode inside the box.");
      } else {
        setScanMode("ocr");
        setDebugText("Align ingredient text inside the box. Tap Capture or hold steady.");
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      setError("Camera access failed. Please grant camera permission and retry.");
      setDebugText("");
      setScanning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanMode, startBarcodeDetection]);

  const stopLiveScan = useCallback(() => {
    stopBarcodeInterval();
    setScanning(false);
    setBarcodeState("idle");
    setIsSteady(false);
    setSteadyProgress(0);
    stopAllTracks();
    setDebugText("");
  }, [stopBarcodeInterval]);

  const switchScanMode = (mode) => {
    setScanMode(mode);
    setBarcodeState("idle");
    setIsSteady(false);
    setSteadyProgress(0);

    if (mode === "barcode") {
      startBarcodeDetection();
      setDebugText("Align barcode inside the box.");
    } else {
      stopBarcodeInterval();
      setDebugText("Align ingredient text inside the box. Tap Capture or hold steady.");
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
    setIsSteady(false);
    setSteadyProgress(0);
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
              Product label &amp; barcode
              <small>Fit the item inside the scanning box</small>
            </div>
            <div className="bd">
              {!scanning && (
                <>
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
                      <div className="t2">JPG or PNG · or click "Start scan" for live camera</div>
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

              {scanning && (
                <div className="live">
                  {/* Mode switcher tabs */}
                  <div className="scan-mode-tabs">
                    <button
                      type="button"
                      className={`mode-tab ${scanMode === "barcode" ? "active" : ""}`}
                      onClick={() => switchScanMode("barcode")}
                    >
                      📦 Barcode
                    </button>
                    <button
                      type="button"
                      className={`mode-tab ${scanMode === "ocr" ? "active" : ""}`}
                      onClick={() => switchScanMode("ocr")}
                    >
                      📄 Ingredients Label
                    </button>
                  </div>

                  {/* Viewport with camera and the cutout Scanning Box */}
                  <div className="viewport">
                    <video ref={videoRef} playsInline autoPlay muted />

                    {/* Mask overlay cutout focusing on the scanning box */}
                    <div
                      className={`scan-box ${isSteady ? "steady" : ""} ${
                        barcodeState === "fetching" ? "found" : ""
                      }`}
                    >
                      <span className="corner-tl" />
                      <span className="corner-tr" />
                      <span className="corner-bl" />
                      <span className="corner-br" />

                      {scanMode === "barcode" && (
                        <>
                          <span className="barcode-line" />
                          <span className="box-hint">
                            {barcodeState === "fetching"
                              ? "BARCODE FOUND!"
                              : "ALIGN BARCODE IN BOX"}
                          </span>
                        </>
                      )}

                      {scanMode === "ocr" && (
                        <>
                          <span className="ocr-scanline" />
                          <span className="box-hint">
                            {isSteady ? "STEADY — HOLD STILL..." : "ALIGN INGREDIENTS IN BOX"}
                          </span>
                          {steadyProgress > 0 && (
                            <div className="steady-bar">
                              <i style={{ width: `${steadyProgress}%` }} />
                            </div>
                          )}
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
                          Barcode not found in Open Food Facts
                        </div>
                        <div className="vp-actions">
                          <button
                            type="button"
                            className="btn primary"
                            onClick={() => switchScanMode("ocr")}
                          >
                            📄 Scan Ingredients Label
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              setBarcodeState("targeting");
                              startBarcodeDetection();
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
                      <div className="ocr-bar">
                        <button
                          type="button"
                          className="btn primary btn-capture"
                          onClick={triggerCapture}
                          disabled={capturing || processing}
                        >
                          📸 Capture Ingredients
                        </button>
                        <div className="status-note">
                          {isSteady ? (
                            <span className="txt-ok">🟢 Steady! Auto-capturing…</span>
                          ) : (
                            <span>Hold steady over the text or tap Capture</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="barcode-bar">
                        <span className="status-note">
                          Point barcode inside the box to scan automatically
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => switchScanMode("ocr")}
                        >
                          Switch to Label OCR →
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} style={{ display: "none" }} />
            </div>
          </div>

          <div className="card">
            <div className="bd">
              <div className="acts">
                {!scanning ? (
                  <button className="btn primary" onClick={startLiveScan} disabled={processing}>
                    📷 Start scan
                  </button>
                ) : (
                  <button className="btn" onClick={stopLiveScan} disabled={processing}>
                    ✕ Stop camera
                  </button>
                )}
                <button
                  className="btn"
                  onClick={handleCheck}
                  disabled={processing || scanning || !image}
                >
                  Check uploaded image
                </button>
                <span className="spacer" />
                <button className="clear" onClick={handleClear}>Clear</button>
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
                      <b>Barcode scan</b> — point camera at the barcode inside the box for an instant product match.
                    </div>
                  </div>
                  <div className="how-row">
                    <span className="how-icon">📄</span>
                    <div>
                      <b>Label scan</b> — align the ingredients inside the box and tap Capture (or hold steady) for OCR.
                    </div>
                  </div>
                  <div className="how-row">
                    <span className="how-icon">🖼️</span>
                    <div>
                      <b>Upload image</b> — choose or drag a photo from your device.
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
