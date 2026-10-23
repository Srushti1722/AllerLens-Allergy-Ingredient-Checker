// src/App.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import "./App.css";

const API_URL =
  process.env.REACT_APP_API_URL ||
  "https://allerlens-allergy-ingredient-checker.onrender.com";

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

  // live camera scanner
  const [scanning, setScanning] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [capturing, setCapturing] = useState(false);

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
    // Request maximum resolution supported by the phone camera
    const attempts = [
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 9999 },
          height: { ideal: 9999 },
          frameRate: { ideal: 30, max: 60 },
          focusMode: "continuous",
          exposureMode: "continuous",
          whiteBalanceMode: "continuous",
        },
        label: "env-max",
      },
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840, min: 1280 },
          height: { ideal: 2160, min: 720 },
        },
        label: "env-4k",
      },
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
                  advanced: [
                    { focusMode: "continuous" },
                    { exposureMode: "continuous" },
                    { whiteBalanceMode: "continuous" },
                  ],
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

  // ---------- OCR label capture ----------
  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return null;
    const v = videoRef.current;
    if (v.readyState < 2 || !v.videoWidth) return null;

    // 1. Direct hardware sensor still photo via ImageCapture (full clarity)
    const stream = v.srcObject;
    const track = stream?.getVideoTracks?.()[0];
    if (track && window.ImageCapture) {
      try {
        const imageCapture = new window.ImageCapture(track);
        const blob = await imageCapture.takePhoto();
        if (blob) {
          const bitmap = await createImageBitmap(blob);
          const bw = bitmap.width;
          const bh = bitmap.height;
          // Crop directly to the targeted scan-box reticle
          const cropW = Math.floor(bw * 0.84);
          const cropH = Math.floor(bh * 0.64);
          const cropX = Math.floor((bw - cropW) / 2);
          const cropY = Math.floor((bh - cropH) / 2);

          const maxDim = 1800;
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
          ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

          // Contrast enhancement for sharp text
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
          } catch (e) {}

          return canvas.toDataURL("image/jpeg", 0.95);
        }
      } catch (err) {
        console.debug("ImageCapture.takePhoto fallback to video frame:", err);
      }
    }

    // 2. High-resolution stream crop fallback
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const cropW = Math.floor(vw * 0.84);
    const cropH = Math.floor(vh * 0.64);
    const cropX = Math.floor((vw - cropW) / 2);
    const cropY = Math.floor((vh - cropH) / 2);

    const maxDim = 1800;
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
    } catch (e) {}

    return canvas.toDataURL("image/jpeg", 0.95);
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
          source: "camera",
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
    const frame1 = await captureFrame();

    // Frame 2: 250ms delay for multi-frame OCR enhancement
    await new Promise((r) => setTimeout(r, 250));
    const frame2 = await captureFrame();

    const frames = [frame1, frame2].filter(Boolean);

    // Stop camera
    setScanning(false);
    stopAllTracks();
    setCapturing(false);

    if (frames.length > 0) {
      await uploadCapturedFrames(frames);
    }
  }, [capturing, processing, captureFrame, uploadCapturedFrames]);

  // ---------- start / stop scan ----------
  const startLiveScan = async () => {
    setResults(null);
    setError("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser cannot access the camera — requires HTTPS or localhost.");
      return;
    }

    try {
      setScanning(true);
      setDebugText("Hold phone steady over ingredient text, then tap 'Capture Ingredients'.");
      await getUsableStream();
    } catch (err) {
      console.error("Camera access failed:", err);
      setError("Camera access failed. Please grant camera permission and retry.");
      setScanning(false);
    }
  };

  const stopLiveScan = useCallback(() => {
    setScanning(false);
    stopAllTracks();
    setDebugText("");
  }, []);

  const handleClear = () => {
    clearImage();
    setResults(null);
    setNewTrigger("");
    setTriggerMsg("");
    setError("");
    setDebugText("");
    if (scanning) stopLiveScan();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllTracks();
    };
  }, []);

  const flagged = results?.flagged_ingredients || [];
  const ocrText = results?.extracted_text || "";

  return (
    <div className="wrap">
      <div className="masthead">
        <span className="mark">A</span>
        <div>
          <div className="name">AllerLens</div>
          <div className="tag">Check product labels directly against your trigger ingredients</div>
        </div>
      </div>

      <div className="grid">
        {/* ===== LEFT: SCANNER / UPLOADER ===== */}
        <section>
          <div className="card">
            <div className="hd">
              Scan product ingredients
              <small>Capture directly from the package label or upload a photo</small>
            </div>
            <div className="bd">
              {/* If camera is NOT open, show the scan button & upload */}
              {!scanning && (
                <>
                  <div className="scan-choices">
                    <button
                      type="button"
                      className="choice-card choice-ocr"
                      onClick={startLiveScan}
                      disabled={processing}
                    >
                      <span className="choice-icon">📸</span>
                      <div className="choice-info">
                        <b>Scan Ingredients with Camera</b>
                        <span>Point camera at any package ingredient list to read &amp; check allergens</span>
                      </div>
                      <span className="choice-action">Open Camera →</span>
                    </button>
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
                      <div className="t2">JPG or PNG of an ingredient label from your device</div>
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

              {/* Camera viewfinder */}
              {scanning && (
                <div className="live">
                  <div className="scan-header-bar">
                    <span>📄 Align ingredient list inside box</span>
                  </div>

                  {/* Viewport with camera and the cutout Scanning Box */}
                  <div className="viewport">
                    <video
                      ref={videoRef}
                      playsInline
                      autoPlay
                      muted
                      disablePictureInPicture
                      style={{ willChange: "transform", transform: "translateZ(0)" }}
                    />

                    {/* Mask overlay cutout focusing on the scanning box */}
                    <div className="scan-box">
                      <span className="corner-tl" />
                      <span className="corner-tr" />
                      <span className="corner-bl" />
                      <span className="corner-br" />
                      <span className="ocr-scanline" />
                      <span className="box-hint">FIT INGREDIENTS IN BOX</span>
                    </div>

                    {/* Camera shutter flash effect */}
                    {capturing && <div className="scan-flash" />}
                  </div>

                  {/* Viewport footer & controls */}
                  <div className="live-footer">
                    <div className="live-action-row">
                      <button
                        type="button"
                        className="btn primary btn-capture"
                        onClick={triggerCapture}
                        disabled={capturing || processing}
                      >
                        📸 Capture Ingredients
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

                    <div className="live-guidance">
                      Hold your phone steady over the ingredients list and tap "Capture Ingredients".
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
                  Analyzing — reading text &amp; matching allergens with PaddleOCR…
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
                  placeholder="Add an ingredient (e.g. peanuts, milk, maida, gluten)…"
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
                {results.source === "camera" && <small style={{ color: "#059669" }}>via camera scan ⚡</small>}
                {results.source === "upload" && <small>via photo upload</small>}
              </div>

              <div className="result">
                {flagged.length > 0 ? (
                  <>
                    <div className="rline r">
                      <span className="rdot bad" />
                      <b>{flagged.length} trigger{flagged.length > 1 ? "s" : ""} found!</b>
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
                      None of your trigger ingredients were detected on this label
                    </div>
                  </>
                )}

                {ocrText && (
                  <>
                    <div className="sep" />
                    <div className="ocr">
                      <div className="lbl">
                        Detected text from the label
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
                  Scan a label with your camera or upload a photo to see results here.
                </div>
                <div className="how">
                  <div className="how-row">
                    <span className="how-icon">📸</span>
                    <div>
                      <b>Scan Ingredients Label</b> — point your camera at the ingredients printed on any food package and tap Capture.
                    </div>
                  </div>
                  <div className="how-row">
                    <span className="how-icon">🖼️</span>
                    <div>
                      <b>Upload Photo</b> — select any clear photo of an ingredients list from your phone or computer.
                    </div>
                  </div>
                  <div className="how-row">
                    <span className="how-icon">🛡️</span>
                    <div>
                      <b>Instant Allergen Detection</b> — every word is cross-checked against your trigger list in seconds.
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
