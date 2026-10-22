"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, result, type Schema } from "../lib/api";

const Scene = dynamic(() => import("./township-scene"), {
  ssr: false, loading: () => <p className="township-render-status" role="status">Preparing 3D township…</p>,
});
export type TownshipData = {
  blocks: Schema["Summary"][];
  assets: Schema["AssetRecord"][];
  traps: Schema["TrapRecord"][];
  missions: Schema["MissionRecord"][];
  plans: Schema["AllocationRecord"][];
};
const chapters = [
  { title: "Inspect with evidence", text: "Explore registered assets and replay recorded mission outcomes. Dry and uncertain findings stay visible, including skipped actions.", href: "/drone/missions", link: "Open mission approval & evidence" },
  { title: "Keep monitoring visible", text: "Review valid sampling intervals and equipment availability. An offline trap is a monitoring gap, never evidence of low activity.", href: "/ovitraps", link: "Open trap observations" },
  { title: "Explain the next decision", text: "Compare blocks using the saved allocation and its reasons. New observations can change the next plan; recorded action still needs independent follow-up.", href: "/planning", link: "Review or generate allocation" },
];

export default function Township3D({ version }: { version: number }) {
  const [data, setData] = useState<TownshipData | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [chapter, setChapter] = useState(0);
  const [selected, setSelected] = useState("");
  const [missionId, setMissionId] = useState("");
  const [eventState, setEventState] = useState<{ missionId: string; events: Schema["MissionEventRecord"][]; error: string } | null>(null);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [camera, setCamera] = useState({ command: "reset", sequence: 0 });

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      api.GET("/api/v1/blocks", options), api.GET("/api/v1/assets", options),
      api.GET("/api/v1/ovitraps", options), api.GET("/api/v1/drones/missions", options),
      api.GET("/api/v1/planning/runs", options),
    ]).then(([b, a, t, m, p]) => {
      if (controller.signal.aborted) return;
      setData({ blocks: result(b).data, assets: result(a).data, traps: result(t).data,
        missions: result(m).data, plans: result(p).data });
      setError("");
    }).catch(e => { if (!controller.signal.aborted) setError(String(e)); });
    return () => controller.abort();
  }, [version, retry]);

  const activeMission = data?.missions.find(m => m.id === missionId) ?? data?.missions[0];
  const activeId = activeMission?.id ?? "";
  useEffect(() => {
    if (!activeId) return;
    const controller = new AbortController();
    api.GET("/api/v1/drones/missions/{entity_id}/events", {
      params: { path: { entity_id: activeId } }, signal: controller.signal,
    }).then(response => {
      const events = result(response).data;
      if (!controller.signal.aborted) setEventState({ missionId: activeId, events: [...events].sort((a, b) => a.created_at.localeCompare(b.created_at)), error: "" });
    }).catch(e => { if (!controller.signal.aborted) setEventState({ missionId: activeId, events: [], error: String(e) }); });
    return () => controller.abort();
  }, [activeId, version, retry]);
  const events = eventState?.missionId === activeId ? eventState.events : [];
  const eventIndex = Math.min(cursor, Math.max(0, events.length - 1));
  const event = events[eventIndex];
  useEffect(() => {
    if (!playing || !events.length) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (eventIndex >= events.length - 1) setPlaying(false);
      else setCursor(eventIndex + 1);
    }, 3500);
    return () => window.clearInterval(timer);
  }, [playing, events.length, eventIndex]);

  const chooseChapter = (index: number) => { setChapter(index); setPlaying(false); };
  const chooseMission = (id: string) => { setMissionId(id); setCursor(0); setPlaying(false); };
  if (error) return <section className="panel"><h2>3D township</h2><p role="alert">{error}</p><button onClick={() => setRetry(v => v + 1)}>Retry 3D data</button></section>;
  if (!data) return <section className="panel" role="status">Loading township evidence…</section>;
  if (!data.blocks.length) return <section className="panel"><h2>3D township</h2><p>No registered blocks. Import or seed the fictional township to explore it.</p></section>;
  const asset = data.assets.find(a => a.id === selected);
  const trap = data.traps.find(t => t.id === selected);
  const block = data.blocks.find(b => b.id === (asset?.block_id ?? trap?.block_id ?? selected));
  const plan = [...data.plans].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const priority = plan?.result.block_priorities.find(p => p.id === block?.id);
  const eventAsset = typeof event?.payload.asset_id === "string" ? event.payload.asset_id : undefined;

  return <section className="township-experience" aria-label="3D township walkthrough">
    <div className="township-intro"><div><span className="page-eyebrow">The feedback loop / in three dimensions</span><h2>One township. Every decision connected.</h2></div><span className="badge">SIMULATED · fictional geometry</span></div>
    <div className="township-chapters" aria-label="Presentation chapters">{chapters.map((c, i) => <button key={c.title} aria-pressed={chapter === i} onClick={() => chooseChapter(i)}><span>0{i + 1}</span>{c.title}</button>)}</div>
    <div className="township-stage">
      <div className="township-viewport">
        <Scene data={data} chapter={chapter} selected={selected} onSelect={setSelected} onReady={setSceneReady} eventAsset={chapter === 0 ? eventAsset : undefined} playing={playing && chapter === 0 && !!event} cameraAction={camera} />
        <div className="township-scene-caption"><strong>AE / 360</strong><span>Illustrative buildings & trap placement<br/>Drone path is a visual replay, not telemetry</span></div>
        <div className="township-camera" aria-label="3D camera controls">{[["left", "Rotate left"], ["right", "Rotate right"], ["in", "Zoom in"], ["out", "Zoom out"], ["reset", "Reset view"]].map(([command, label]) => <button key={command} disabled={!sceneReady} onClick={() => setCamera(v => ({ command, sequence: v.sequence + 1 }))}>{label}</button>)}</div>
      </div>
      <aside className="township-inspector">
        <span className="page-eyebrow">Chapter 0{chapter + 1} / 03</span><h3>{chapters[chapter].title}</h3><p>{chapters[chapter].text}</p>
        <label htmlFor="township-object">Inspect a block, asset or trap</label>
        <select id="township-object" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose evidence…</option><optgroup label="Blocks">{data.blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup><optgroup label="Registered assets">{data.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup><optgroup label="Smart ovitraps">{data.traps.map(t => <option key={t.id} value={t.id}>{t.name} · {t.effective_status}</option>)}</optgroup></select>
        {block ? <div className="township-evidence"><strong>{asset?.name ?? trap?.name ?? block.name}</strong><small>{selected} · {asset?.mode ?? trap?.mode ?? block.mode}</small><p>{block.name}: <b>{block.status.replaceAll("_", " ")}</b></p><p>{block.valid_intervals} / {block.expected_intervals} valid intervals<br/>Eggs / interval: {block.eggs_per_interval?.toFixed(1) ?? "Unavailable"}</p>{block.comparability_warning && <p>{block.comparability_warning}</p>}{trap && <p>Equipment: <b>{trap.effective_status}</b><br/>Last heartbeat: <time>{trap.heartbeat_at}</time></p>}{asset && <Link href={`/assets/${encodeURIComponent(asset.id)}`}>Open asset evidence →</Link>}{chapter === 2 && (priority ? <p>Saved priority: {priority.score}<br/>{priority.reasons.join(" · ")}</p> : <p>No saved priority for this block.</p>)}</div> : <p className="muted">Select a marker in the scene or use the list above. Decorative buildings are illustrative.</p>}
        <Link className="button secondary" href={chapters[chapter].href}>{chapters[chapter].link} →</Link>
        <button className="text-button" onClick={() => chooseChapter((chapter + 1) % chapters.length)}>Next presentation chapter →</button>
      </aside>
    </div>
    <div className="township-legend"><span>◇ Blue / registered asset</span><span>● Green / reporting trap</span><span>! Orange / unavailable trap</span><span>Outlined block / selected evidence</span></div>
    {chapter === 0 && <div className="township-replay"><div><h3>Recorded mission replay</h3><p>Playback only. No mission is started and no outcome is generated here.</p><label>Mission<select value={activeId} onChange={e => chooseMission(e.target.value)}>{!data.missions.length && <option value="">No missions recorded</option>}{data.missions.map(m => <option value={m.id} key={m.id}>{m.id} · {m.status} · {m.mode}</option>)}</select></label></div><div>
      {eventState?.missionId === activeId && eventState.error ? <><p role="alert">{eventState.error}</p><button onClick={() => setRetry(v => v + 1)}>Retry recorded events</button></> : activeId && eventState?.missionId !== activeId ? <p role="status">Loading recorded events…</p> : event ? <>
        <p aria-live="polite"><b>{event.kind.replaceAll("_", " ")}</b> · {event.mode}<br/><time>{event.created_at}</time><br/>{typeof event.payload.reason === "string" ? event.payload.reason : typeof event.payload.note === "string" ? event.payload.note : "Recorded event; no outcome inferred."}</p>
        <label>Recorded event<select value={eventIndex} onChange={e => { setCursor(Number(e.target.value)); setPlaying(false); }}>{events.map((e, i) => <option key={e.id} value={i}>{i + 1}. {e.kind.replaceAll("_", " ")}</option>)}</select></label>
        <button onClick={() => { if (!playing && eventIndex === events.length - 1) setCursor(0); setPlaying(v => !v); }}>{playing ? "Pause replay" : "Play recorded events"}</button>
        {eventAsset && data.assets.some(a => a.id === eventAsset) && <button className="secondary" onClick={() => setSelected(eventAsset)}>Inspect event asset</button>}
      </> : <p>No recorded events. Use Drone missions to review, approve and run a simulation first.</p>}
    </div></div>}
    {chapter === 1 && <div className="township-block-cards">{data.blocks.map(b => <button key={b.id} className="secondary" onClick={() => setSelected(b.id)}><strong>{b.name}</strong><span>{b.status.replaceAll("_", " ")}</span><small>{b.valid_intervals}/{b.expected_intervals} intervals · {b.unavailable_traps.length} unavailable traps</small></button>)}</div>}
    {chapter === 2 && <div className="township-plan"><h3>Latest saved allocation</h3>{plan ? <><p>{plan.id} · {plan.status} · {plan.mode} · <time>{plan.created_at}</time></p><div className="township-block-cards">{plan.result.block_priorities.map(p => <button key={p.id} className="secondary" onClick={() => setSelected(p.id)}><strong>{p.name} · priority {p.score}</strong><small>{p.reasons.join(" · ")}</small></button>)}</div><p>Saved snapshot; generate a new allocation after changing observations.</p></> : <p>No allocation has been saved. Generate one in Next-round planning to display its actual priorities.</p>}</div>}
    <p className="township-footnote">Drag to orbit · scroll or pinch to zoom · keyboard controls and evidence list above. Egg observations do not establish dengue risk. Recorded action does not establish biological effectiveness.</p>
  </section>;
}
