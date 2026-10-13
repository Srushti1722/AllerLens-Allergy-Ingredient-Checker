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
  const stopAllTracks = (stream) => {
    try {
      const s = stream || videoRef.current?.srcObject;
      if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      console.warn("stopAllTracks failed:", e);
    }
  };

  const stopLiveScan = useCallback(
    async (buffer) => {
      setScanning(false);
      stopAllTracks();

      const frames = buffer || framesBufferRef.current || [];
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
          framesBufferRef.current = [];
          setCapturedFrames(0);
          setProcessing(false);
        }
      }
    },
    []
  );

  // helper: wait until the video element has real pixels or timeout
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

  // Improved captureFrame: synchronously update the ref and state so the caller
  // knows immediately whether a frame was captured. Also set the canvas size to
  // the video's actual dimensions to avoid black/stretched frames.
  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return false;
    // Skip capture until the camera is actually delivering frames —
    // grabbing earlier yields black images (seen on mobile/desktop when using wrong constraints).
    if (
      videoRef.current.readyState < 2 || // HAVE_CURRENT_DATA or better
      videoRef.current.videoWidth === 0
    ) {
      return false;
    }

    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;

    // size the canvas to match the incoming video for best results
    canvasRef.current.width = videoWidth;
    canvasRef.current.height = videoHeight;

    const ctx = canvasRef.current.getContext("2d");
    ctx.drawImage(
      videoRef.current,
      0,
      0,
      canvasRef.current.width,
      canvasRef.current.height
    );
    const dataUrl = canvasRef.current.toDataURL("image/jpeg");

    // quick sanity: ignore very small captures
    if (!dataUrl || dataUrl.length < 500) return false;

    // Update both the ref (immediate) and React state (causes re-render).
    framesBufferRef.current.push(dataUrl);
    setFramesBuffer([...framesBufferRef.current]);

    return true;
  };

  // attempt to get a usable stream with fallbacks
  const getUsableStream = async () => {
    // candidates: prefer environment, then default, then user-facing
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
        // attach temporarily to video element to test if it produces frames
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            // try to play; some browsers require a user gesture but we are inside a click handler
            await videoRef.current.play();
          } catch (e) {
            // ignore play() errors here
          }
        }

        const ok = await waitForVideoReady(1500);
        if (ok) {
          console.log("camera OK with", a.label);
          return stream;
        }

        // not usable -> stop and try next
        stopAllTracks(stream);
        lastError = `no frames for ${a.label}`;
      } catch (err) {
        lastError = err;
        console.debug("getUserMedia attempt failed for", a.label, err);
      }
    }
    throw lastError || new Error("No usable camera stream");
  };

  const startLiveScan = async () => {
    setResults(null);
    setCapturedFrames(0);
    setFramesBuffer([]);
    framesBufferRef.current = [];
    setError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "This browser can't access the camera — or the page isn't on a secure (https) connection. Try Chrome or Safari on https."
      );
      return;
    }
    try {
      setScanning(true);
      const stream = await getUsableStream();
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch (e) {
          // ignore
        }
      }
    } catch (err) {
      console.error("Camera access failed:", err);
      setError("Camera access failed. Please allow camera permission and retry.");
      setScanning(false);
    }
  };

  useEffect(() => {
    let interval;
    if (scanning) {
      interval = setInterval(() => {
        setCapturedFrames((c) => {
          if (c >= MAX_FRAMES) return c;
          // captureFrame now returns immediately whether it succeeded
          const didCapture = captureFrame();
          if (didCapture) return c + 1;
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
    framesBufferRef.current = [];
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
                        {flagged.length} trigger{flagged.length > 1 ? "s" : ""} {" "}
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
