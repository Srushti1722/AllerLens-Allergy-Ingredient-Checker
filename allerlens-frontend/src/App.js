// src/App.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import "./App.css";

const API_URL =
  process.env.REACT_APP_API_URL ||
  "https://allerlens-allergy-ingredient-checker.onrender.com";

const MAX_FRAMES = 15;

function App() {
  // upload
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [results, setResults] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  // triggers
  const [triggers, setTriggers] = useState([]);
  const [newTrigger, setNewTrigger] = useState("");
  const [triggerMsg, setTriggerMsg] = useState("");

  // live scan
  const [scanning, setScanning] = useState(false);
  const [capturedFrames, setCapturedFrames] = useState(0);
  const [framesBuffer, setFramesBuffer] = useState([]);

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
        timeout: 120000, // Render free tier can take ~60s to wake
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
        setError(
          "The server took too long to respond (it may be waking up on the free tier) — wait a moment and try again."
        );
      } else {
        setError(
          "Couldn't reach the analysis server — it may be waking up. Try again in a few seconds."
        );
      }
    } finally {
      setProcessing(false);
    }
  };

  // ---------- live scan ----------
  const stopLiveScan = useCallback(
    async (buffer) => {
      setScanning(false);
      const tracks = videoRef.current?.srcObject?.getTracks?.();
      if (tracks && tracks.length) tracks.forEach((t) => t.stop());

      const frames = buffer || framesBuffer;
      if (frames.length > 0) {
        try {
          setProcessing(true);
          const res = await axios.post(
            `${API_URL}/upload-frames`,
            { frames },
            { timeout: 180000 }
          );
          const uniqueFlagged = [
            ...new Set(res.data?.flagged_ingredients || []),
          ];
          setResults({ ...res.data, flagged_ingredients: uniqueFlagged });
          const combined = (res.data?.all_text || []).join(" ").trim();
          if (!combined) {
            setError(
              "Couldn't read any text from the frames — hold the camera steadier and closer to the label."
            );
          }
        } catch (err) {
          console.error("Live scan upload error:", err);
          if (err.code === "ECONNABORTED") {
            setError(
              "The server took too long (it may be waking up on the free tier) — try again in a few seconds."
            );
          } else {
            setError("Failed to process the live scan — the server may be waking up. Try again.");
          }
        } finally {
          setFramesBuffer([]);
          setCapturedFrames(0);
          setProcessing(false);
        }
      }
    },
    [framesBuffer]
  );

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    // Skip capture until the camera is actually delivering frames —
    // grabbing earlier yields black images (seen on mobile).
    if (
      videoRef.current.readyState < 2 || // HAVE_CURRENT_DATA or better
      videoRef.current.videoWidth === 0
    ) {
      return;
    }
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

  const startLiveScan = async () => {
    setResults(null);
    setCapturedFrames(0);
    setFramesBuffer([]);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setScanning(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error(err);
      setError("Could not access the camera. Please allow permission.");
      setScanning(false);
    }
  };

  useEffect(() => {
    let interval;
    if (scanning) {
      interval = setInterval(() => {
        setCapturedFrames((c) => {
          if (c >= MAX_FRAMES) return c;
          const before = framesBufferRef.current.length;
          captureFrame();
          // Only advance the counter when a frame was actually captured —
          // keeps the progress honest if the camera is still warming up.
          if (framesBufferRef.current.length > before) return c + 1;
          return c;
        });
      }, 300);
    }
    return () => clearInterval(interval);
  }, [scanning]);

  // auto-send once MAX_FRAMES captured
  useEffect(() => {
    if (scanning && capturedFrames >= MAX_FRAMES) {
      stopLiveScan();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedFrames, scanning]);

  const handleClear = () => {
    clearImage();
    setResults(null);
    setNewTrigger("");
    setTriggerMsg("");
    setError("");
    setFramesBuffer([]);
    setCapturedFrames(0);
    if (scanning) stopLiveScan();
  };

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
        {/* ===== LEFT ===== */}
        <section>
          <div className="card">
            <div className="hd">
              Product label
              <small>Upload an image or use live scan</small>
            </div>
            <div className="bd">
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
                <div
                  className="up"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <div className="t1">
                    <b>Choose an image</b> or drag it here
                  </div>
                  <div className="t2">
                    JPG or PNG · the flatter and sharper the label, the better
                  </div>
                </div>
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
                  <div className="viewport">
                    <video ref={videoRef} playsInline autoPlay muted />
                    <span className="corner c1" />
                    <span className="corner c2" />
                    <span className="corner c3" />
                    <span className="corner c4" />
                    <span className="scanline" />
                  </div>
                  <div className="bar">
                    <i
                      style={{
                        width: `${Math.min(
                          100,
                          (capturedFrames / MAX_FRAMES) * 100
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="meta">
                    <span>Live scan running</span>
                    <b>
                      frame {capturedFrames} / {MAX_FRAMES}
                    </b>
                  </div>
                </div>
              )}
              <canvas
                ref={canvasRef}
                width="400"
                height="300"
                style={{ display: "none" }}
              />
            </div>
          </div>


          <div className="card">
            <div className="bd">
              <div className="acts">
                {!scanning ? (
                  <button className="btn" onClick={startLiveScan}>
                    Start live scan
                  </button>
                ) : (
                  <button className="btn" onClick={() => stopLiveScan()}>
                    Stop live scan
                  </button>
                )}
                <button
                  className="btn primary"
                  onClick={handleCheck}
                  disabled={processing || scanning}
                >
                  Check ingredients
                </button>
                <span className="spacer" />
                <button className="clear" onClick={handleClear}>
                  Clear
                </button>
              </div>

              {processing && (
                <div className="job">
                  <span className="sp" />
                  Analyzing label — reading text, then matching
                </div>
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
                      flagged.some((f) =>
                        f.toLowerCase().includes(t.toLowerCase())
                      )
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
                  placeholder="Add an ingredient…"
                  value={newTrigger}
                  onChange={(e) => setNewTrigger(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTrigger()}
                />
                <button className="btn" onClick={handleAddTrigger}>
                  Add
                </button>
              </div>
              {triggerMsg && <div className="msg">{triggerMsg}</div>}
            </div>
          </div>
        </section>

        {/* ===== RIGHT ===== */}
        <section>
          {results ? (
            <div className="card">
              <div className="hd">Result</div>
              <div className="result">
                {flagged.length > 0 ? (
                  <>
                    <div className="rline r">
                      <span className="rdot bad" />
                      <b>
                        {flagged.length} trigger{flagged.length > 1 ? "s" : ""}{" "}
                        found
                      </b>
                    </div>
                    <div className="rsub">
                      Matched against your {triggers.length} trigger
                      {triggers.length === 1 ? "" : "s"}
                    </div>
                    <div className="sep" />
                    <div className="flags">
                      {flagged.map((f, i) => (
                        <div className="match" key={i}>
                          <span className="mdot" />
                          <div>
                            <b>{f}</b>
                          </div>
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
                      <div className="lbl">Text detected on the label</div>
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
                  Scan a label to see results here.
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
