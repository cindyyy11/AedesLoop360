"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import type { Schema } from "../lib/api";
import { buildTimeline } from "./drone-sim-model";
import { PAD } from "./township-geo";
import type { SimTarget, SimTick, SimView } from "./drone-sim-scene";

const TownshipMap = dynamic(() => import("./township-map"), { ssr: false });
const Scene = dynamic(() => import("./drone-sim-scene"), {
  ssr: false, loading: () => <p className="township-render-status" role="status">Preparing 3D flight simulation…</p>,
});

const OUTCOME_LABEL: Record<string, string> = {
  SKIPPED: "Skipped · no action taken",
  GROUND_REVIEW: "Queued for ground review",
  MOCK_ACTION_RECORDED: "Mock action recorded · not verified effective",
};
const STATE_LABEL: Record<string, string> = { DRY: "Dry", VISIBLE_WATER: "Visible water", OCCLUDED: "Occluded / uncertain" };
const VIEWS: [SimView, string][] = [["orbit", "Orbit"], ["follow", "Follow drone"], ["pov", "Drone camera"]];
const SPEEDS = [0.5, 1, 2, 4];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function DroneSim({ mission, findings, assets, events }: {
  mission: Schema["MissionRecord"]; findings: Schema["FindingRecord"][]; assets: Schema["AssetRecord"][]; events: Schema["MissionEventRecord"][];
}) {
  const targets = useMemo<SimTarget[]>(() => mission.target_ids.flatMap(id => {
    const f = findings.find(v => v.id === id), a = f && assets.find(v => v.id === f.asset_id);
    return f && a ? [{ assetId: a.id, name: a.name, findingId: f.id, waterState: f.water_state, objectClass: f.object_class, confidence: f.confidence }] : [];
  }), [mission.target_ids, findings, assets]);
  const outcomes = useMemo(() => {
    const out: Record<string, string> = {};
    for (const e of events) if (typeof e.payload.asset_id === "string" && OUTCOME_LABEL[e.kind]) out[e.payload.asset_id] = e.kind;
    return out;
  }, [events]);
  const timeline = useMemo(() => buildTimeline(targets.length), [targets.length]);
  // Map view: registered assets only; the 3D street layout is illustrative, so the map drone is interpolated between real asset coordinates on the same timeline.
  const mapData = useMemo(() => ({ blocks: [], traps: [], assets: targets.flatMap(tg => assets.find(a => a.id === tg.assetId) ?? []) }), [targets, assets]);
  const mapRoute = useMemo(() => targets.map(tg => tg.assetId), [targets]);
  const frame = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<SimView>("orbit");
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [seek, setSeek] = useState({ value: 0, seq: 0 });
  const [recenter, setRecenter] = useState(0);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<"3d" | "map">("3d");
  const [mapCommand, setMapCommand] = useState({ command: "reset", sequence: 0 });
  const [tick, setTick] = useState<SimTick | null>(null);
  const duration = timeline.duration;
  const t = tick?.t ?? 0;
  const jump = (value: number) => { setSeek(v => ({ value, seq: v.seq + 1 })); };
  const recorded = Object.keys(outcomes).length;
  const idx = tick?.targetIndex ?? -1;
  const dronePoint = useMemo(() => {
    const pts = mapData.assets.map(a => ({ x: a.x, y: a.y }));
    if (!pts.length || pts.length !== targets.length) return PAD;
    const seg = timeline.segs.find(s => t <= s.t1) ?? timeline.segs[timeline.segs.length - 1];
    const k = seg.t1 > seg.t0 ? Math.min(Math.max((t - seg.t0) / (seg.t1 - seg.t0), 0), 1) : 1;
    const lerp = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    if (seg.phase === "Transit") return lerp(seg.idx === 0 ? PAD : pts[seg.idx - 1], pts[seg.idx]);
    if (["Descend to inspect", "Inspect", "Climb"].includes(seg.phase)) return pts[seg.idx];
    if (seg.phase === "Return to pad") return lerp(pts[pts.length - 1], PAD);
    return PAD;
  }, [mapData, targets.length, timeline, t]);
  const current = idx >= 0 ? targets[idx] : undefined;
  const shown = (i: number) => !!outcomes[targets[i].assetId] && tick !== null && t >= timeline.arrive[i] + 1.5;
  const det = tick?.detection;
  const detTarget = current && det ? current : undefined;
  const announced = tick && tick.arrivedIndex >= 0 ? targets[tick.arrivedIndex] : undefined;

  if (!targets.length) return <p className="empty">This mission has no resolvable targets, so there is nothing to simulate.</p>;
  return <div className="dronesim">
    <div className="dronesim-stage">
      <div className="dronesim-viewport" data-mode={mode}>
        <Scene targets={targets} outcomes={outcomes} playing={playing} speed={speed} seek={seek} view={view} recenter={recenter} frame={frame}
          onTick={setTick} onEnd={() => setPlaying(false)} onReady={setReady} />
        {mode === "map" && <TownshipMap data={mapData} dronePoint={dronePoint} route={mapRoute} visited={Math.max(0, (tick?.arrivedIndex ?? -1) + 1)} routeOnly={false} selected="" onSelect={() => {}} mapCommand={mapCommand} />}
        <div ref={frame} className="dronesim-pov" data-view={view} aria-label="Simulated drone camera">
          <span className="dronesim-pov-tag">DRONE CAM · simulated render</span>
          {det && detTarget && <div className="dronesim-bbox" data-state={detTarget.waterState} style={{ left: `${det.x * 100}%`, top: `${det.y * 100}%`, width: `${det.w * 100}%`, height: `${det.h * 100}%` }}>
            <span>candidate container · {STATE_LABEL[detTarget.waterState] ?? detTarget.waterState}{detTarget.confidence != null ? ` · ${Math.round(detTarget.confidence * 100)}%` : ""}</span>
          </div>}
        </div>
        {ready && <div className="dronesim-hud" aria-hidden="true">
          <div><small>Phase</small><b>{tick?.phase ?? "Pre-flight checks"}</b></div>
          <div><small>Altitude</small><b>{(tick?.altitude ?? 0).toFixed(1)} m</b></div>
          <div><small>Speed</small><b>{(tick?.speed ?? 0).toFixed(1)} m/s</b></div>
          <div><small>Battery · simulated</small><b>{Math.round(tick?.battery ?? 100)}%</b></div>
        </div>}
        {ready && !playing && t === 0 && <button className="dronesim-play-big" onClick={() => setPlaying(true)}>▶ Play flight replay</button>}
        <div className="dronesim-badges">{mode === "map" && <span>FICTIONAL TOWNSHIP ON REAL BASEMAP · NOT A SURVEY</span>}<span>SIMULATED</span><span>ACTUATOR DISARMED</span></div>
      </div>
      <div className="dronesim-controls">
        <div className="dronesim-transport">
          <button disabled={!ready} onClick={() => { if (!playing && t >= duration - 0.05) jump(0); setPlaying(v => !v); }}>{playing ? "Pause" : t >= duration - 0.05 ? "Replay" : "Play flight replay"}</button>
          <button className="secondary" disabled={!ready} onClick={() => { setPlaying(false); jump(0); }}>Restart</button>
          <label className="dronesim-speed">Playback speed<select value={speed} onChange={e => setSpeed(Number(e.target.value))}>{SPEEDS.map(s => <option key={s} value={s}>{s}×</option>)}</select></label>
        </div>
        <div className="dronesim-scrub">
          <time>{clock(t)}</time>
          <input type="range" min={0} max={duration} step={0.1} value={t} disabled={!ready} aria-label="Flight timeline position" aria-valuetext={`${clock(t)} of ${clock(duration)}`} onChange={e => { setPlaying(false); jump(Number(e.target.value)); }} />
          <time>{clock(duration)}</time>
        </div>
        <div className="dronesim-views" role="toolbar" aria-label="Scene navigator">
          <div role="group" aria-label="Scene view">{([["3d", "3D view"], ["map", "Map view"]] as const).map(([m, label]) => <button key={m} className="secondary" aria-pressed={mode === m} disabled={!ready} onClick={() => setMode(m)}>{label}</button>)}</div>
          <div role="group" aria-label="Camera view">
            {VIEWS.map(([v, label]) => <button key={v} className="secondary" aria-pressed={view === v} disabled={!ready || mode !== "3d"} onClick={() => setView(v)}>{label}</button>)}
            {mode === "map" && ["in", "out"].map(c => <button key={c} className="secondary" onClick={() => setMapCommand(v => ({ command: c, sequence: v.sequence + 1 }))}>{c === "in" ? "Zoom in" : "Zoom out"}</button>)}
            <button className="secondary" disabled={!ready || (mode === "3d" && view !== "orbit")} onClick={() => mode === "map" ? setMapCommand(v => ({ command: "reset", sequence: v.sequence + 1 })) : setRecenter(v => v + 1)}>Reset view</button>
          </div>
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announced ? `Inspecting target ${tick!.arrivedIndex + 1}, ${announced.name}.` : ""}</p>
    </div>
    <aside className="dronesim-side">
      <h3>Flight plan · {targets.length} target{targets.length === 1 ? "" : "s"}</h3>
      <p className="muted">{recorded ? `Outcomes shown are the ${recorded} persisted worker event${recorded === 1 ? "" : "s"}; the replay never creates or changes one.` : "No execution events exist yet. This is the planned route only; no outcome is shown or implied."}</p>
      <ol className="dronesim-targets">
        {targets.map((tg, i) => {
          const kind = outcomes[tg.assetId];
          return <li key={tg.findingId} aria-current={idx === i ? "step" : undefined} className={idx === i ? "current" : ""}>
            <button className="secondary" disabled={!ready} onClick={() => { setPlaying(false); jump(timeline.arrive[i]); }}>
              <span className="dronesim-n">{i + 1}</span>
              <span><strong>{tg.name}</strong><small>Stored finding: {STATE_LABEL[tg.waterState] ?? tg.waterState} · {tg.objectClass}</small>
                <small className="dronesim-outcome" data-kind={kind ?? "NONE"}>{kind ? (shown(i) || !ready ? OUTCOME_LABEL[kind] : `Recorded: ${OUTCOME_LABEL[kind]}`) : "No event recorded yet"}</small></span>
            </button>
          </li>;
        })}
      </ol>
      <div className="dronesim-safety">
        <b>Safety gates (not controllable here)</b>
        <ul>
          <li>Mock actuator: <b>DISARMED</b> · bench only, harmless water. Replay cannot arm it.</li>
          <li>Real missions need human approval; this view starts, aborts and approves nothing.</li>
          <li>Candidate containers are not confirmed larval sites. A recorded action is not a biologically effective one.</li>
        </ul>
      </div>
      <details><summary>How to read this</summary>
        <p className="muted">Street, houses and planter positions are illustrative, not a survey. Planter appearance (dry, water, covered) comes from each stored finding. Altitude, speed and battery are authored kinematics, not telemetry. The drone-camera box is a projection of the stored finding, not a live model inference.</p>
      </details>
    </aside>
  </div>;
}
