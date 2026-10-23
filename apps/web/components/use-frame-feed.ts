"use client";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_FRAME_WIDTH = 640;
const MAX_FAILURES = 5;

type Options = {
  fps: number;
  /** Longest edge sent for analysis; detectors that need fine texture want more than the default 640. */
  frameWidth?: number;
  /** Analyse one JPEG frame. Throw to count a failure. Called again only after the previous call settles. */
  send: (frame: Blob) => Promise<void>;
  /** Called whenever the feed stops, so the owner can clear its overlay. */
  onStop?: () => void;
};

/* Camera or video-file feed that hands one downscaled frame at a time to `send`.
   The next frame is captured only after the last answer returns, so a slow model lowers the rate instead of queueing work. */
export function useFrameFeed({ fps, frameWidth = DEFAULT_FRAME_WIDTH, send, onStop }: Options) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const grabRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileUrlRef = useRef("");
  const runningRef = useRef(false);
  const sendRef = useRef(send);
  const onStopRef = useRef(onStop);
  useEffect(() => { sendRef.current = send; onStopRef.current = onStop; });
  const [source, setSource] = useState<"" | "camera" | "file">("");
  const [rate, setRate] = useState(0);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(0);

  const stop = useCallback(() => {
    runningRef.current = false;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (fileUrlRef.current) { URL.revokeObjectURL(fileUrlRef.current); fileUrlRef.current = ""; }
    if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current.removeAttribute("src"); }
    onStopRef.current?.();
    setSource(""); setRate(0);
  }, []);
  useEffect(() => stop, [stop]);

  const grab = useCallback((maxWidth: number = frameWidth): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return Promise.resolve(null);
    const canvas = grabRef.current ??= document.createElement("canvas");
    canvas.width = Math.min(maxWidth, video.videoWidth);
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
  }, [frameWidth]);

  const loop = useCallback(async () => {
    runningRef.current = true;
    let last = performance.now();
    let failures = 0;
    while (runningRef.current) {
      const started = performance.now();
      try {
        const blob = await grab();
        if (blob && !videoRef.current?.paused) {
          await sendRef.current(blob);
          if (!runningRef.current) break;
          failures = 0; setRetrying(0); setError("");
          const at = performance.now(); setRate(Math.round(10000 / (at - last)) / 10); last = at;
        }
      } catch (e) {
        if (!runningRef.current) break;
        // The first frame can wait on a cold model load and be dropped by the proxy; keep trying a few times before giving up.
        failures += 1; setRetrying(failures);
        if (failures >= MAX_FAILURES) { setError(`Live feed stopped after ${failures} failed frames: ${String(e)}`); setRetrying(0); stop(); return; }
      }
      const wait = 1000 / fps - (performance.now() - started);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
    }
  }, [fps, grab, stop]);

  const begin = useCallback(async (kind: "camera" | "file", file?: File) => {
    stop(); setError(""); setRetrying(0);
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
  }, [loop, stop]);

  return { videoRef, source, rate, error, retrying, maxFailures: MAX_FAILURES, begin, stop, grab };
}
