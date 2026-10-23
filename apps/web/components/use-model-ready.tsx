"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";

export type ModelState = "LOADING" | "READY" | "UNAVAILABLE" | "UNKNOWN";

/** Polls /health every 2 s while the named detector is still loading, then stops. */
export function useModelReady(model: "drone" | "egg"): ModelState {
  const [state, setState] = useState<ModelState>("UNKNOWN");
  useEffect(() => {
    let cancelled = false, timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      let next: ModelState = "UNKNOWN";
      try {
        const { data } = await api.GET("/api/v1/health");
        const reported = data?.models?.[model];
        if (reported === "LOADING" || reported === "READY" || reported === "UNAVAILABLE") next = reported;
      } catch { /* API unreachable: leave the state unknown, the feed shows its own error */ }
      if (cancelled) return;
      setState(next);
      if (next === "LOADING") timer = setTimeout(() => void poll(), 2000);
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [model]);
  return state;
}

export function ModelStatus({ state, name }: { state: ModelState; name: string }) {
  if (state === "LOADING") return <p role="status" className="muted">{name} is loading. The first frames may be slow or show nothing for a few seconds.</p>;
  if (state === "UNAVAILABLE") return <p role="alert" className="error">{name} is not available on this server. Results will show no value, which is not zero.</p>;
  return null;
}
