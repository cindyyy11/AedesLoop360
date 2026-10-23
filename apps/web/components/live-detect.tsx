"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, result, type Schema } from "../lib/api";
import { Badge, Empty, type RunAction } from "./workspace";

type Frame = Schema["LiveFrameResult"];
const FRAME_WIDTH = 640;
const TARGET_FPS = 2;

/* Frames are sent one at a time: the next is captured only after the last answer returns, so a slow model lowers the rate instead of queueing work. */
export function LiveDetect({ assets, act, busy }: { assets: Schema["AssetRecord"][]; act: RunAction; busy: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const grabRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileUrlRef = useRef("");
  const runningRef = useRef(false);
  const [source, setSource] = useState<"" | "camera" | "file">("");
  const [frame, setFrame] = useState<Frame | null>(null);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState("");
  const [assetId, setAssetId] = useState("");
  const [rights, setRights] = useState("Own live capture, authorised test zone");
  const [saved, setSaved] = useState("");
  const asset = assetId || assets[0]?.id || "";

  const stop = useCallback(() => {
    runningRef.current = false;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = ""; }
    if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current.removeAttribute("src"); }
    const canvas = overlayRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setSource(""); setFps(0);
  }, []);
  useEffect(() => stop, [stop]);

  const grab = (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return Promise.resolve(null);
    const canvas = grabRef.current ??= document.createElement("canvas");
    canvas.width = Math.min(FRAME_WIDTH, video.videoWidth);
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
  };

  const draw = (data: Frame) => {
    const canvas = overlayRef.current, video = videoRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !video) return;
    canvas.width = video.clientWidth; canvas.height = video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2; ctx.font = "12px sans-serif";
    for (const d of data.detections) {
      const [x1, y1, x2, y2] = d.bbox;
      const x = x1 * canvas.width, y = y1 * canvas.height, w = (x2 - x1) * canvas.width, h = (y2 - y1) * canvas.height;
      ctx.strokeStyle = "#ff9d2e"; ctx.setLineDash([6, 4]); ctx.strokeRect(x, y, w, h);
      const label = `${d.object_class} ${Math.round(d.confidence * 100)}% · UNCERTAIN`;
      ctx.setLineDash([]); ctx.fillStyle = "#0b2239"; ctx.fillRect(x, Math.max(0, y - 16), ctx.measureText(label).width + 8, 16);
      ctx.fillStyle = "#fff"; ctx.fillText(label, x + 4, Math.max(12, y - 4));
    }
  };

  const loop = async () => {
    runningRef.current = true;
    let last = performance.now();
    while (runningRef.current) {
      const started = performance.now();
      try {
        const blob = await grab();
        if (blob && !videoRef.current?.paused) {
          const form = new FormData(); form.set("file", blob, "frame.jpg");
          const response = await api.POST("/api/v1/drones/live-detect", { body: { file: "" }, bodySerializer: () => form });
          const data = result(response).data;
          if (!runningRef.current) break;
          setFrame(data); setError(""); draw(data);
          const at = performance.now(); setFps(Math.round(10000 / (at - last)) / 10); last = at;
        }
      } catch (e) { if (runningRef.current) { setError(String(e)); stop(); return; } }
      const wait = 1000 / TARGET_FPS - (performance.now() - started);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
    }
  };

  const begin = async (kind: "camera" | "file", file?: File) => {
    stop(); setError(""); setFrame(null); setSaved("");
    const video = videoRef.current; if (!video) return;
    try {
      if (kind === "camera") {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        video.srcObject = streamRef.current;
      } else if (file) {
        fileUrlRef.current = URL.createObjectURL(file); video.src = fileUrlRef.current; video.loop = true;
      }
      await video.play(); setSource(kind); void loop();
    } catch (e) {
      stop();
      setError(e instanceof Error && e.name === "NotAllowedError" ? "Camera permission was denied. Choose a video file instead." : `Could not start the ${kind}: ${String(e)}`);
    }
  };

  const save = () => act(async () => {
    const blob = await grab(); if (!blob) throw new Error("No frame available to save");
    const form = new FormData(); form.set("file", blob, "frame.jpg"); form.set("rights", rights);
    form.set("captured_at", new Date().toISOString()); form.set("asset_id", asset);
    const response = await fetch("/api/v1/media", { method: "POST", body: form });
    const data = await response.json(); if (!response.ok) throw new Error(data.message ?? "Save failed");
    setSaved(`${data.data.id} · ${data.data.adapter}`);
  }, "Frame saved as an UNCERTAIN candidate for ground review");

  const status = frame?.status;
  return <section className="panel" aria-labelledby="live-title">
    <div className="section-head"><h2 id="live-title">Live detection</h2><Badge>IMPORTED · analysed, not stored</Badge></div>
    <p className="muted">Point a camera or play a drone video clip. About {TARGET_FPS} frames a second go to the local model; boxes are candidate containers, never confirmed water or larval sites. Nothing is saved unless you press Save frame.</p>
    <div className="actions">
      <button type="button" disabled={!!source || busy} onClick={() => void begin("camera")}>Start camera</button>
      <label className="secondary file-button">Play video file<input type="file" accept="video/*" hidden disabled={!!source} onChange={e => { const f = e.target.files?.[0]; if (f) void begin("file", f); e.target.value = ""; }} /></label>
      <button type="button" className="secondary" disabled={!source} onClick={stop}>Stop</button>
    </div>
    {error && <p role="alert" className="error">{error}</p>}
    <div className="live-stage" style={{ position: "relative", maxWidth: 720 }}>
      <video ref={videoRef} muted playsInline aria-label="Live feed under analysis" style={{ width: "100%", background: "#0b2239", display: source ? "block" : "none" }} />
      <canvas ref={overlayRef} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
    </div>
    {!source && <Empty>No feed running. Start the camera or choose a video file.</Empty>}
    {source && <p role="status" aria-live="polite">{frame ? `${frame.detections.length} candidate(s) · ${frame.latency_ms} ms model time · ${fps} frames/s · ${frame.model_version ?? "no model"}` : "Waiting for the first result…"}</p>}
    {status && status !== "DETECTED" && status !== "NO_DETECTIONS" && <p role="alert" className="error">Detector unavailable ({status}): {frame?.note}</p>}
    {status === "NO_DETECTIONS" && <p className="muted">No candidates in this frame. That does not show the area is clear.</p>}
    {source && <div className="form-row">
      <label>Linked asset<select value={asset} onChange={e => setAssetId(e.target.value)}>{assets.map(a => <option key={a.id} value={a.id}>{a.id}</option>)}</select></label>
      <label>Rights / provenance<input value={rights} onChange={e => setRights(e.target.value)} minLength={5} /></label>
      <button type="button" disabled={busy || !asset || rights.length < 5 || !frame} onClick={() => void save()}>Save frame for ground review</button>
    </div>}
    {saved && <p role="status">Saved {saved}. It appears under candidates as UNCERTAIN.</p>}
  </section>;
}
