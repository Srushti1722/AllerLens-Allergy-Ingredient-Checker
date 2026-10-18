// src/App.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import "./App.css";

const API_URL =
  process.env.REACT_APP_API_URL ||
  "https://allerlens-allergy-ingredient-checker.onrender.com";

const MAX_FRAMES = 2;
const OFF_API = "https://world.openfoodfacts.org/api/v2/product";

// ── Open Food Facts lookup ───────────────────────────────────────────────────
async function fetchProductByBarcode(barcode) {
  const res = await fetch(`${OFF_API}/${barcode}.json?fields=product_name,ingredients_text,allergens_tags,image_url`);
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

  // live scan
  const [scanning, setScanning] = useState(false);
  const [capturedFrames, setCapturedFrames] = useState(0);
  const [framesBuffer, setFramesBuffer] = useState([]);

  // barcode scan state: 'idle' | 'targeting' | 'fetching' | 'not_found'
  const [barcodeState, setBarcodeState] = useState("idle");
  const [scannedProduct, setScannedProduct] = useState(null); // OFF product info
  const barcodeIntervalRef = useRef(null);
  const barcodeDetectorRef = useRef(null);

  const imageInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const framesBufferRef = useRef([]);

  useEffect(() => {
    framesBufferRef.current = framesBuffer;
  }, [framesBuffer]);

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
      setTriggerMsg(`Added "${ing}".`);
      setNewTrigger("");
      loadTriggers();
    } catch (err) {
      console.error(err);
      setError("Failed to add the ingredient.");
    }
  };

  const handleRemoveTrigger = async (ing) => {
    try {
      await axios.delete(`${API_URL}/remove-ingredient`, {
        data: { ingredient: ing },
      });
      setTriggerMsg(`Removed "${ing}".`);
      setTriggers((prev) => prev.filter((t) => t !== ing));
    } catch (err) {
      console.error(err);
      setTriggerMsg(`Failed to remove "${ing}".`);
    }
  };

  // ---------- upload ----------
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    setImage(file || null);
    setPreview(file ? URL.createObjectURL(file) : null);
    setResults(null);
    setError("");
  };

  const clearImage = () => {
    setImage(null);
    setPreview(null);
    setResults(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleCheck = async () => {
    if (!image) {
      setError("Please choose a label image first.");
      return;
    }
    const formData = new FormData();
    formData.append("image", image);
    try {
      setProcessing(true);
      setError("");
      const res = await axios.post(`${API_URL}/upload`, formData, {
        timeout: 120000,
      });
      const uniqueFlagged = [
        ...new Set(res.data?.flagged_ingredients || []),
      ];
      setResults({ ...res.data, flagged_ingredients: uniqueFlagged });
      const text = (res.data?.extracted_text || "").trim();
      if (!text) {
        setError(
          "Couldn't read any text from this image — try a clearer, closer, well-lit photo of the label."
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

  const waitForVideoReady = (timeoutMs = 1500) => {
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
    const attempts = [
      { video: { facingMode: { ideal: "environment" } }, label: "environment-ideal" },
      { video: { facingMode: { exact: "environment" } }, label: "environment-exact" },
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
        const ok = await waitForVideoReady(1500);
        if (ok) {
          console.log("camera OK with", a.label);
          return stream;
        }
        stopAllTracks(stream);
        lastError = `no frames for ${a.label}`;
      } catch (err) {
        lastError = err;
        console.debug("getUserMedia attempt failed for", a.label, err);
      }
    }
    throw lastError || new Error("No usable camera stream");
  };

  // ---------- barcode scan ----------
  const stopBarcodeInterval = useCallback(() => {
    if (barcodeIntervalRef.current) {
      clearInterval(barcodeIntervalRef.current);
      barcodeIntervalRef.current = null;
    }
  }, []);

  const handleBarcodeFound = useCallback(async (barcodeValue) => {
    stopBarcodeInterval();
    setBarcodeState("fetching");
    setDebugText(`Barcode: ${barcodeValue} — looking up product…`);

    try {
      const product = await fetchProductByBarcode(barcodeValue);

      if (!product) {
        // Not in database — fall back to OCR
        setBarcodeState("not_found");
        setDebugText("Product not in Open Food Facts — switching to label OCR…");
        setTimeout(() => {
          setBarcodeState("idle");
          startOCRScan();
        }, 1800);
        return;
      }

      // Haptic feedback on success
      if (navigator.vibrate) navigator.vibrate(60);

      setScannedProduct(product);
      const ingredientsText = product.ingredients_text || "";
      const allergenTags = (product.allergens_tags || [])
        .map((t) => t.replace("en:", ""))
        .join(", ");
      const fullText = `${ingredientsText} ${allergenTags}`.trim();

      const flagged = matchTriggers(fullText, triggers);

      setResults({
        extracted_text: ingredientsText || allergenTags,
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
      console.error("OFF lookup error:", err);
      setBarcodeState("not_found");
      setDebugText("Network error looking up barcode — falling back to OCR…");
      setTimeout(() => {
        setBarcodeState("idle");
        startOCRScan();
      }, 1800);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggers, stopBarcodeInterval]);

  const startBarcodeDetection = useCallback(() => {
    const hasBarcodeDetector = "BarcodeDetector" in window;

    if (!hasBarcodeDetector) {
      // Browser doesn't support BarcodeDetector — go straight to OCR
      console.info("BarcodeDetector not supported, falling back to OCR mode");
      setBarcodeState("idle");
      return false;
    }

    try {
      barcodeDetectorRef.current = new window.BarcodeDetector({
        formats: ["ean_13", "ean_8", "upc_a", "upc_e", "qr_code", "code_128", "code_39"],
      });
    } catch (e) {
      console.warn("BarcodeDetector init failed:", e);
      return false;
    }

    setBarcodeState("targeting");

    // Poll every 400ms looking for a barcode in the video frame
    barcodeIntervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;

      try {
        const barcodes = await barcodeDetectorRef.current.detect(video);
        if (barcodes.length > 0) {
          const code = barcodes[0].rawValue;
          if (code) handleBarcodeFound(code);
        }
      } catch (e) {
        // Detection errors on individual frames are normal — keep polling
      }
    }, 400);

    return true;
  }, [handleBarcodeFound]);

  const startLiveScan = useCallback(async () => {
    setResults(null);
    setScannedProduct(null);
    setCapturedFrames(0);
    setFramesBuffer([]);
    framesBufferRef.current = [];
    setError("");
    setDebugText("Starting camera…");
    setBarcodeState("idle");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't access the camera — requires a secure (https) connection.");
      setDebugText("");
      return;
    }

    try {
      setScanning(true);
      await getUsableStream();
      // Try barcode detection first
      const barcodeReady = startBarcodeDetection();
      if (barcodeReady) {
        setDebugText("Point at barcode or ingredient label");
      } else {
        setDebugText("Camera ready — point at ingredient label");
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      setError("Camera access failed. Please allow camera permission and retry.");
      setDebugText("");
      setScanning(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startBarcodeDetection]);

  // ---------- OCR scan (existing live capture) ----------
  const startOCRScan = useCallback(() => {
    setDebugText("Scanning label text — hold steady…");
    // Reset frame buffer and let the interval capture fresh frames
    framesBufferRef.current = [];
    setFramesBuffer([]);
    setCapturedFrames(0);
  }, []);

  const stopLiveScan = useCallback(
    async (buffer) => {
      stopBarcodeInterval();
      setScanning(false);
      setBarcodeState("idle");
      stopAllTracks();

      const frames = buffer || framesBufferRef.current || [];

      if (frames.length > 0) {
        try {
          setProcessing(true);
          setDebugText(`Uploading ${frames.length} frame(s) for OCR…`);
          const res = await axios.post(
            `${API_URL}/upload-frames`,
            { frames },
            { timeout: 180000 }
          );
          const uniqueFlagged = [...new Set(res.data?.flagged_ingredients || [])];
          setResults({ ...res.data, flagged_ingredients: uniqueFlagged, source: "ocr" });
          const combined = (res.data?.all_text || []).join(" ").trim();
          if (!combined) {
            setError("Couldn't read any text — hold the camera steadier and closer to the label.");
          } else {
            setDebugText("");
          }
        } catch (err) {
          console.error("Live scan upload error:", err);
          setDebugText("");
          if (err.code === "ECONNABORTED") {
            setError("The server took too long to respond — please try again.");
          } else {
            setError("Failed to process the live scan. Please try again.");
          }
        } finally {
          setFramesBuffer([]);
          framesBufferRef.current = [];
          setCapturedFrames(0);
          setProcessing(false);
        }
      } else {
        setDebugText("");
      }
    },
    [stopBarcodeInterval]
  );

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return false;
    if (videoRef.current.readyState < 2 || videoRef.current.videoWidth === 0) return false;

    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;

    // Scale to max 1280px for fast transfer and crisp OCR
    const maxDim = 1280;
    let w = videoWidth;
    let h = videoHeight;
    if (w > maxDim || h > maxDim) {
      if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
      else { w = Math.round((w * maxDim) / h); h = maxDim; }
    }

    canvasRef.current.width = w;
    canvasRef.current.height = h;
    const ctx = canvasRef.current.getContext("2d");
    ctx.drawImage(videoRef.current, 0, 0, w, h);
    const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.82);

    if (!dataUrl || dataUrl.length < 500) return false;

    framesBufferRef.current.push(dataUrl);
    setFramesBuffer([...framesBufferRef.current]);
    return true;
  };

  // OCR frame capture interval (only runs when in OCR mode i.e. scanning and barcode not targeting)
  useEffect(() => {
    let interval;
    if (scanning && barcodeState === "idle") {
      interval = setInterval(() => {
        setCapturedFrames((c) => {
          if (c >= MAX_FRAMES) return c;
          const didCapture = captureFrame();
          if (didCapture) return c + 1;
          return c;
        });
      }, 300);
    }
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning, barcodeState]);

  // Auto-submit once MAX_FRAMES captured
  useEffect(() => {
    if (scanning && barcodeState === "idle" && capturedFrames >= MAX_FRAMES) {
      stopLiveScan();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedFrames, scanning, barcodeState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopBarcodeInterval();
      stopAllTracks();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClear = () => {
    clearImage();
    setResults(null);
    setScannedProduct(null);
    setNewTrigger("");
    setTriggerMsg("");
    setError("");
    setDebugText("");
    setFramesBuffer([]);
    framesBufferRef.current = [];
    setCapturedFrames(0);
    setBarcodeState("idle");
    if (scanning) stopLiveScan();
  };

  const flagged = results?.flagged_ingredients || [];
  const ocrText = results?.extracted_text || "";

  // ── Viewport overlay label based on current scan state ────────────────────
  const viewportHint = (() => {
    if (barcodeState === "targeting") return "📦 Align barcode — or point at ingredient label";
    if (barcodeState === "fetching") return "⏳ Looking up product…";
    if (barcodeState === "not_found") return "🔁 Barcode not found — switching to label scan…";
    if (scanning) return "📷 Hold label steady in frame";
    return null;
  })();

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
        {/* ===== LEFT ===== */}
        <section>
          <div className="card">
            <div className="hd">
              Product label
              <small>Scan barcode, upload image, or use live label scan</small>
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
                      <div className="t2">JPG or PNG · the flatter and sharper the label, the better</div>
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
                <div className={`live${barcodeState === "fetching" ? " live--fetching" : ""}${barcodeState === "not_found" ? " live--notfound" : ""}`}>
                  {viewportHint && (
                    <div className={`hint-banner${barcodeState === "fetching" ? " hint-banner--ok" : ""}${barcodeState === "not_found" ? " hint-banner--warn" : ""}`}>
                      {viewportHint}
                    </div>
                  )}
                  <div className="viewport">
                    <video ref={videoRef} playsInline autoPlay muted />
                    {/* Barcode target: horizontal red line in top half */}
                    {barcodeState === "targeting" && (
                      <div className="barcode-target">
                        <span className="barcode-line" />
                        <span className="barcode-label">BARCODE</span>
                      </div>
                    )}
                    {/* Label target: animated scanline in bottom half */}
                    {(barcodeState === "idle") && (
                      <>
                        <span className="corner c1" />
                        <span className="corner c2" />
                        <span className="corner c3" />
                        <span className="corner c4" />
                        <span className="scanline" />
                      </>
                    )}
                    {barcodeState === "fetching" && (
                      <div className="viewport-overlay">
                        <div className="vp-spinner" />
                        <div className="vp-label">Fetching product…</div>
                      </div>
                    )}
                    {barcodeState === "not_found" && (
                      <div className="viewport-overlay viewport-overlay--warn">
                        <div className="vp-label">Not in database<br />Switching to OCR…</div>
                      </div>
                    )}
                  </div>
                  {barcodeState === "idle" && (
                    <>
                      <div className="bar">
                        <i style={{ width: `${Math.min(100, (capturedFrames / MAX_FRAMES) * 100)}%` }} />
                      </div>
                      <div className="meta">
                        <span>Scanning label text…</span>
                        <b>{capturedFrames} / {MAX_FRAMES} frames</b>
                      </div>
                    </>
                  )}
                  {barcodeState === "targeting" && (
                    <div className="meta">
                      <span>Barcode detected instantly · or keep camera on label</span>
                      <b>Auto-mode</b>
                    </div>
                  )}
                </div>
              )}
              <canvas ref={canvasRef} style={{ display: "none" }} />
            </div>
          </div>

          <div className="card">
            <div className="bd">
              <div className="acts">
                {!scanning ? (
                  <button className="btn" onClick={startLiveScan} disabled={processing}>
                    Start scan
                  </button>
                ) : (
                  <>
                    <button
                      className="btn primary"
                      onClick={() => { captureFrame(); stopLiveScan(framesBufferRef.current); }}
                      disabled={processing || barcodeState !== "idle"}
                      title="Capture label immediately and check"
                    >
                      ⚡ Scan now
                    </button>
                    <button className="btn" onClick={() => stopLiveScan()} disabled={processing}>
                      Stop
                    </button>
                  </>
                )}
                <button
                  className="btn primary"
                  onClick={handleCheck}
                  disabled={processing || scanning || !image}
                >
                  Check ingredients
                </button>
                <span className="spacer" />
                <button className="clear" onClick={handleClear}>Clear</button>
              </div>

              {processing && (
                <div className="job">
                  <span className="sp" />
                  Analyzing — reading text &amp; matching ingredients
                </div>
              )}

              {debugText && (
                <div className="dbg">{debugText}</div>
              )}

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
                    <button className="x" title={`Remove ${t}`} onClick={() => handleRemoveTrigger(t)}>
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="addrow">
                <input
                  className="inp"
                  placeholder="Add an ingredient…"
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

        {/* ===== RIGHT ===== */}
        <section>
          {results ? (
            <div className="card">
              <div className="hd">
                Result
                {results.source === "barcode" && (
                  <small style={{ color: "#059669" }}>via barcode lookup ⚡</small>
                )}
                {results.source === "ocr" && (
                  <small>via label OCR</small>
                )}
              </div>

              {/* Product info card from barcode */}
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
                        {results.source === "barcode" ? "Ingredient list (from database)" : "Text detected on the label"}
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
                      <b>Barcode scan</b> — point camera at the barcode for an instant lookup from the Open Food Facts database.
                    </div>
                  </div>
                  <div className="how-row">
                    <span className="how-icon">📷</span>
                    <div>
                      <b>Label scan</b> — point camera at the ingredient list on the package for OCR text recognition.
                    </div>
                  </div>
                  <div className="how-row">
                    <span className="how-icon">🖼️</span>
                    <div>
                      <b>Upload image</b> — choose or drag a photo of the ingredient label.
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
