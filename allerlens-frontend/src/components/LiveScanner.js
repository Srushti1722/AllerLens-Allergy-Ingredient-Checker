import React, { useRef, useEffect, useState } from "react";
import Webcam from "react-webcam";

const LiveScanner = () => {
  const webcamRef = useRef(null);
  const [result, setResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);

  // Capture a frame and send to backend
  const captureFrame = async () => {
    if (!webcamRef.current) return;
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) return;

    // Convert base64 → Blob
    const byteString = atob(imageSrc.split(",")[1]);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([ab], { type: "image/jpeg" });

    // Send to backend
    const formData = new FormData();
    formData.append("file", blob, "capture.jpg");

    try {
      const res = await fetch("http://127.0.0.1:5000/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error("Upload failed:", err);
    }
  };

  // Auto-capture every 3 seconds
  useEffect(() => {
    let interval;
    if (isScanning) {
      interval = setInterval(() => {
        captureFrame();
      }, 3000); // 🔄 every 3 seconds
    }
    return () => clearInterval(interval);
  }, [isScanning]);

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-2">Live Scanner</h2>

      <Webcam
        ref={webcamRef}
        screenshotFormat="image/jpeg"
        className="rounded-lg shadow"
        videoConstraints={{
          facingMode: "environment", // 👀 use back camera on mobile
        }}
      />

      <div className="mt-4 flex gap-4">
        <button
          onClick={() => setIsScanning(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg"
        >
          Start Scanning
        </button>
        <button
          onClick={() => setIsScanning(false)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg"
        >
          Stop Scanning
        </button>
      </div>

      {result && (
        <div className="mt-4 p-3 border rounded bg-gray-100">
          <h3 className="font-semibold">Detected Ingredients:</h3>
          <pre className="text-sm whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default LiveScanner;
