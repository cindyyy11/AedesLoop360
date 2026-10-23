"use client";
import { useRef, useState } from "react";
import { api, result, type Schema } from "../lib/api";
import { Badge, Empty } from "./workspace";
import { summarise } from "./egg-preview-stats";
import { useFrameFeed } from "./use-frame-feed";
import { ModelStatus, useModelReady } from "./use-model-ready";

type Preview = Schema["EggPreview"];
// Fixed guide the paddle is lined up inside; the same box is used as the counted area, then the reviewer can adjust it.
// It matches the area the paddle model was labelled and scored on (see data manifest ROI): a looser box under-reads.
export const GUIDE = [0.36, 0.04, 0.66, 0.97];
const PREVIEW_FPS = 1;
const PREVIEW_WIDTH = 1024; // the count model reads fine texture, so send more pixels than the detector does
const CAPTURE_WIDTH = 1600;

export function EggLive({ trapId, trapName, canCapture, onCapture }: { trapId: string; trapName: string; canCapture: boolean; onCapture: (file: File, roiPercent: number[]) => void }) {
  const modelState = useModelReady("egg");
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const history = useRef<number[]>([]);
  const [last, setLast] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<ReturnType<typeof summarise>>(null);

  const drawGuide = () => {
    const canvas = overlayRef.current, video = feed.videoRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !video) return;
    canvas.width = video.clientWidth; canvas.height = video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const [l, t, r, b] = GUIDE;
    ctx.lineWidth = 2; ctx.setLineDash([8, 5]); ctx.strokeStyle = "#2fd27a";
    ctx.strokeRect(l * canvas.width, t * canvas.height, (r - l) * canvas.width, (b - t) * canvas.height);
    ctx.setLineDash([]); ctx.font = "12px sans-serif"; ctx.fillStyle = "#0b2239";
    ctx.fillRect(l * canvas.width, t * canvas.height, 150, 16); ctx.fillStyle = "#fff";
    ctx.fillText("Paddle fills this box", l * canvas.width + 4, t * canvas.height + 12);
  };

  const feed = useFrameFeed({
    fps: PREVIEW_FPS,
    frameWidth: PREVIEW_WIDTH,
    send: async blob => {
      const form = new FormData(); form.set("file", blob, "frame.jpg"); form.set("roi", JSON.stringify(GUIDE));
      const response = await api.POST("/api/v1/ovitraps/{trap_id}/egg-live-preview", { params: { path: { trap_id: trapId } }, body: { file: "", roi: "" }, bodySerializer: () => form });
      const data = result(response).data;
      // An unavailable model is not zero eggs: drop earlier numbers rather than averaging across a gap.
      if (data.estimate == null) history.current = []; else history.current.push(data.estimate);
      history.current = history.current.slice(-20);
      setLast(data); setSummary(summarise(history.current)); drawGuide();
    },
    onStop: () => { const c = overlayRef.current; c?.getContext("2d")?.clearRect(0, 0, c.width, c.height); },
  });
  const { source, rate, error, retrying, maxFailures, videoRef, stop, grab } = feed;
  const begin = (kind: "camera" | "file", file?: File) => { history.current = []; setLast(null); setSummary(null); return feed.begin(kind, file); };
  const takeFrame = async () => {
    const blob = await grab(CAPTURE_WIDTH);
    if (!blob) return;
    stop();
    onCapture(new File([blob], `live-${trapId}.jpg`, { type: "image/jpeg" }), GUIDE.map(v => v * 100));
  };

  const unavailable = last && last.estimate == null;
  return <div className="egg-live" aria-label={`Live egg preview for ${trapName}`}>
    <div className="section-head"><h3>Live preview</h3><Badge>IMPORTED · preview only, not stored</Badge></div>
    <p className="muted">Hold a camera over the egg paddle. The model re-reads about {PREVIEW_FPS} frame a second so you can steady the shot. This is a preview, not a count: nothing is saved, it is not surveillance data, and the model has not been validated on live camera frames.</p>
    <div className="actions">
      <button type="button" disabled={!!source} onClick={() => void begin("camera")}>Start camera</button>
      <label className="secondary file-button">Play video file<input type="file" accept="video/*" hidden disabled={!!source} onChange={e => { const f = e.target.files?.[0]; if (f) void begin("file", f); e.target.value = ""; }} /></label>
      <button type="button" className="secondary" disabled={!source} onClick={stop}>Stop</button>
    </div>
    <ModelStatus state={modelState} name="The egg-count model" />
    {error && <p role="alert" className="error">{error}</p>}
    <div className="live-stage" style={{ position: "relative", maxWidth: 560 }}>
      <video ref={videoRef} muted playsInline aria-label="Live feed of the egg paddle" style={{ width: "100%", background: "#0b2239", display: source ? "block" : "none" }} />
      <canvas ref={overlayRef} aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
    </div>
    {!source && <Empty>No feed running. Start the camera or choose a video file.</Empty>}
    {source && <div role="status" aria-live="polite" className="egg-live-readout">
      {retrying > 0 ? <p>Model loading or unreachable, retrying ({retrying}/{maxFailures})…</p>
        : unavailable ? <p>No estimate ({last.status}): {last.note} This is not zero eggs.</p>
        : summary ? <p><strong>About {summary.median} eggs</strong> · range {summary.min}–{summary.max} over the last {summary.n} frame(s) · {summary.settled ? "steady" : "still moving, hold the camera still"} · {last?.latency_ms} ms · {rate} frames/s</p>
        : <p>Waiting for the first estimate…</p>}
    </div>}
    {source && summary && <p className="muted">A steady number means the camera is steady, not that the count is right. Take the frame, mark the paddle and let a reviewer confirm it.</p>}
    {source && (canCapture
      ? <button type="button" className="cta" disabled={!summary} onClick={() => void takeFrame()}>Use this frame for the full count</button>
      : <Empty>Only reviewers and coordinators can take a frame forward for confirmation.</Empty>)}
  </div>;
}
