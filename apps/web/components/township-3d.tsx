"use client";

import { SceneCorner } from "./scene-controls";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, result, type Schema } from "../lib/api";

const TownshipMap = dynamic(() => import("./township-map"), { ssr: false });
const Scene = dynamic(() => import("./township-scene"), {
  ssr: false, loading: () => <p className="township-render-status" role="status">Preparing 3D township…</p>,
});
export type TownshipData = {
  blocks: Schema["Summary"][];
  assets: Schema["AssetRecord"][];
  traps: Schema["TrapRecord"][];
  missions: Schema["MissionRecord"][];
  plans: Schema["AllocationRecord"][];
  findings: Schema["FindingRecord"][];
};
const chapters = [
  { title: "Inspect with evidence", text: "Explore registered assets and replay recorded mission outcomes. Dry and uncertain findings stay visible, including skipped actions.", href: "/drone/missions", link: "Open mission approval & evidence" },
  { title: "Keep monitoring visible", text: "Review valid sampling intervals and equipment availability. An offline trap is a monitoring gap, never evidence of low activity.", href: "/ovitraps", link: "Open trap observations" },
  { title: "Explain the next decision", text: "Compare blocks using the saved allocation and its reasons. New observations can change the next plan; recorded action still needs independent follow-up.", href: "/planning", link: "Review or generate allocation" },
  { title: "Close the loop", text: "Step through detect, plan, approve, record and verify. Each stage shows only what is stored; verification is a separate follow-up, never inferred from a recorded action.", href: "/drone/missions", link: "Open mission approval & evidence" },
];
const loopStages = ["Detect", "Plan", "Approve", "Record action", "Verify"];

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
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState<"3d" | "map">("3d");
  const [mapCommand, setMapCommand] = useState({ command: "reset", sequence: 0 });
  const [sceneReady, setSceneReady] = useState(false);
  const [night, setNight] = useState(true);
  const [heat, setHeat] = useState(false);
  const [loopStage, setLoopStage] = useState(0);
  const [loopPlaying, setLoopPlaying] = useState(false);
  const [camera, setCamera] = useState({ command: "reset", sequence: 0 });

  useEffect(() => {
    const controller = new AbortController();
    const options = { signal: controller.signal };
    Promise.all([
      api.GET("/api/v1/blocks", options), api.GET("/api/v1/assets", options),
      api.GET("/api/v1/ovitraps", options), api.GET("/api/v1/drones/missions", options),
      api.GET("/api/v1/planning/runs", options), api.GET("/api/v1/findings", options),
    ]).then(([b, a, t, m, p, f]) => {
      if (controller.signal.aborted) return;
      setData({ blocks: result(b).data, assets: result(a).data, traps: result(t).data,
        missions: result(m).data, plans: result(p).data, findings: result(f).data });
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
    }, 3500 / speed);
    return () => window.clearInterval(timer);
  }, [playing, events.length, eventIndex, speed]);

  useEffect(() => {
    if (!loopPlaying) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setLoopStage(v => { if (v >= loopStages.length - 1) { setLoopPlaying(false); return v; } return v + 1; });
    }, 4500);
    return () => window.clearInterval(timer);
  }, [loopPlaying]);
  const chooseLoopStage = (stage: number) => { setLoopStage(stage); setCamera(v => ({ command: stage === 2 ? "gate" : "reset", sequence: v.sequence + 1 })); };
  const chooseChapter = (index: number) => { setChapter(index); setPlaying(false); setLoopPlaying(false); setHeat(index === 1); if (index === 3) chooseLoopStage(0); };
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
  const assetOf = (e: Schema["MissionEventRecord"]) => (typeof e.payload.asset_id === "string" && data.assets.some(a => a.id === e.payload.asset_id) ? e.payload.asset_id : undefined);
  const route = events.map(assetOf).filter((id): id is string => !!id);
  // Planned stops come from the mission's stored target findings; shown only while no events were recorded.
  const planned = (activeMission?.target_ids ?? []).map(id => data.findings.find(f => f.id === id)?.asset_id).filter((id): id is string => !!id && data.assets.some(a => a.id === id));
  const showPlanned = chapter === 0 && !!activeId && eventState?.missionId === activeId && !eventState.error && !events.length && planned.length > 0;
  const idsOf = (kind?: string) => [...new Set(events.filter(e => !kind || e.kind === kind).map(assetOf).filter((id): id is string => !!id))];
  const visited = events.slice(0, eventIndex + 1).map(assetOf).filter(Boolean).length;
  const loop = { found: idsOf(), review: idsOf("GROUND_REVIEW"), action: idsOf("MOCK_ACTION_RECORDED") };

  return <section className="township-experience" aria-label="3D township walkthrough">
    <div className="township-intro"><div><span className="page-eyebrow">The feedback loop / in three dimensions</span><h2>One township. Every decision connected.</h2></div><span className="badge">SIMULATED · fictional geometry</span></div>
    <div className="township-chapters" aria-label="Presentation chapters">{chapters.map((c, i) => <button key={c.title} aria-pressed={chapter === i} onClick={() => chooseChapter(i)}><span>0{i + 1}</span>{c.title}</button>)}</div>
    <div className="township-stage">
      <div className="township-viewport" data-view={view}>
        {view === "map" ? <TownshipMap data={data} route={chapter === 0 ? (showPlanned ? planned : route) : []} visited={visited} routeOnly={showPlanned} eventAsset={chapter === 0 ? eventAsset : undefined} eventKind={chapter === 0 ? event?.kind : undefined} selected={selected} onSelect={setSelected} mapCommand={mapCommand} /> : <Scene data={data} chapter={chapter} selected={selected} onSelect={setSelected} onReady={setSceneReady} eventAsset={chapter === 0 ? eventAsset : undefined} eventKind={chapter === 0 ? event?.kind : undefined} route={chapter === 0 ? (showPlanned ? planned : route) : []} routeOnly={showPlanned} playing={playing && chapter === 0 && !!event} cameraAction={camera} night={night} heat={heat} loopStage={chapter === 3 ? loopStage : -1} loop={loop} />}
        <div className="township-scene-caption"><strong>AE / 360</strong><span>{view === "map" ? "Fictional township placed on a real basemap for presentation · not a survey or GPS" : "Illustrative buildings & trap placement"}<br/>Drone path is a visual replay, not telemetry</span></div>
        <SceneCorner
          mode={view}
          onMode={m => { setView(m); setSceneReady(false); }}
          commands={["left", "right", "in", "out", "reset"]}
          enabled={c => view === "3d" ? sceneReady : c !== "left" && c !== "right"}
          onCommand={c => view === "3d" ? setCamera(v => ({ command: c, sequence: v.sequence + 1 })) : setMapCommand(v => ({ command: c, sequence: v.sequence + 1 }))}
        />
        <div className="township-nav" role="toolbar" aria-label="Display">
          <div role="group" aria-label="Display"><button disabled={view !== "3d" || !sceneReady} aria-pressed={!night} onClick={() => setNight(v => !v)}>{night ? "Switch to day" : "Switch to night"}</button><button disabled={view !== "3d" || !sceneReady} aria-pressed={heat} onClick={() => setHeat(v => !v)}>Egg-count overlay</button></div>
        </div>
      </div>
      <aside className="township-inspector">
        <span className="page-eyebrow">Chapter 0{chapter + 1} / 0{chapters.length}</span><h3>{chapters[chapter].title}</h3><p>{chapters[chapter].text}</p>
        <label htmlFor="township-object">Inspect a block, asset or trap</label>
        <select id="township-object" value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose evidence…</option><optgroup label="Blocks">{data.blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</optgroup><optgroup label="Registered assets">{data.assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup><optgroup label="Smart ovitraps">{data.traps.map(t => <option key={t.id} value={t.id}>{t.name} · {t.effective_status}</option>)}</optgroup></select>
        {block ? <div className="township-evidence"><strong>{asset?.name ?? trap?.name ?? block.name}</strong><small>{selected} · {asset?.mode ?? trap?.mode ?? block.mode}</small><p>{block.name}: <b>{block.status.replaceAll("_", " ")}</b></p><p>{block.valid_intervals} / {block.expected_intervals} valid intervals<br/>Eggs / interval: {block.eggs_per_interval?.toFixed(1) ?? "Unavailable"}</p>{block.comparability_warning && <p>{block.comparability_warning}</p>}{trap && <p>Equipment: <b>{trap.effective_status}</b><br/>Last heartbeat: <time>{trap.heartbeat_at}</time></p>}{asset && <Link href={`/assets/${encodeURIComponent(asset.id)}`}>Open asset evidence →</Link>}{chapter === 2 && (priority ? <p>Saved priority: {priority.score}<br/>{priority.reasons.join(" · ")}</p> : <p>No saved priority for this block.</p>)}</div> : <p className="muted">Select a marker in the scene or use the list above. Decorative buildings are illustrative.</p>}
        <Link className="button secondary" href={chapters[chapter].href}>{chapters[chapter].link} →</Link>
        <button className="text-button" onClick={() => chooseChapter((chapter + 1) % chapters.length)}>Next presentation chapter →</button>
      </aside>
    </div>
    <div className="township-legend"><span>◇ Blue / registered asset</span><span>● Green / reporting trap</span><span>! Orange / unavailable trap</span><span>Outlined block / selected evidence</span><span>Hatched / no data (not low)</span><span>Column / eggs per valid interval; faint = fewer valid intervals; not adults or risk</span></div>
    {chapter === 0 && <div className="township-replay"><div><h3>Recorded mission replay</h3><p>Playback only. No mission is started and no outcome is generated here.</p><label>Mission<select value={activeId} onChange={e => chooseMission(e.target.value)}>{!data.missions.length && <option value="">No missions recorded</option>}{data.missions.map(m => <option value={m.id} key={m.id}>{m.id} · {m.status} · {m.mode}</option>)}</select></label></div><div>
      {eventState?.missionId === activeId && eventState.error ? <><p role="alert">{eventState.error}</p><button onClick={() => setRetry(v => v + 1)}>Retry recorded events</button></> : activeId && eventState?.missionId !== activeId ? <p role="status">Loading recorded events…</p> : event ? <>
        <p aria-live="polite"><b>{event.kind.replaceAll("_", " ")}</b> · {event.mode}<br/><time>{event.created_at}</time><br/>{typeof event.payload.reason === "string" ? event.payload.reason : typeof event.payload.note === "string" ? event.payload.note : "Recorded event; no outcome inferred."}</p>
        <label>Recorded event<select value={eventIndex} onChange={e => { setCursor(Number(e.target.value)); setPlaying(false); }}>{events.map((e, i) => <option key={e.id} value={i}>{i + 1}. {e.kind.replaceAll("_", " ")}</option>)}</select></label>
        <label>Replay position<input type="range" min={0} max={Math.max(0, events.length - 1)} step={1} value={eventIndex} aria-valuetext={`Event ${eventIndex + 1} of ${events.length}`} onChange={e => { setCursor(Number(e.target.value)); setPlaying(false); }} /></label>
        <label>Playback speed<select value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[0.5, 1, 2, 4].map(s => <option key={s} value={s}>{s}×</option>)}</select></label>
        <button onClick={() => { if (!playing && eventIndex === events.length - 1) setCursor(0); setPlaying(v => !v); }}>{playing ? "Pause replay" : "Play recorded events"}</button>
        {eventAsset && data.assets.some(a => a.id === eventAsset) && <button className="secondary" onClick={() => setSelected(eventAsset)}>Inspect event asset</button>}
      </> : <>{showPlanned && <p>Planned route only: {planned.length} stored target{planned.length === 1 ? "" : "s"} shown as a dashed line. Nothing has been flown and no outcome is implied.</p>}<p>No recorded events. Use Drone missions to review, approve and run a simulation first.</p></>}
    </div></div>}
    {chapter === 1 && <div className="township-block-cards">{data.blocks.map(b => <button key={b.id} className="secondary" onClick={() => setSelected(b.id)}><strong>{b.name}</strong><span>{b.status.replaceAll("_", " ")}</span><small>{b.valid_intervals}/{b.expected_intervals} intervals · {b.unavailable_traps.length} unavailable traps</small></button>)}</div>}
    {chapter === 2 && <div className="township-plan"><h3>Latest saved allocation</h3>{plan ? <><p>{plan.id} · {plan.status} · {plan.mode} · <time>{plan.created_at}</time></p><div className="township-block-cards">{plan.result.block_priorities.map(p => <button key={p.id} className="secondary" onClick={() => setSelected(p.id)}><strong>{p.name} · priority {p.score}</strong><small>{p.reasons.join(" · ")}</small></button>)}</div><p>Saved snapshot; generate a new allocation after changing observations.</p></> : <p>No allocation has been saved. Generate one in Next-round planning to display its actual priorities.</p>}</div>}
    {chapter === 3 && <div className="township-loop"><h3>Feedback loop · stage {loopStage + 1} of {loopStages.length}: {loopStages[loopStage]}</h3>
      <div className="township-loop-steps" role="group" aria-label="Loop stages">{loopStages.map((s, i) => <button key={s} className="secondary" aria-pressed={loopStage === i} onClick={() => { setLoopPlaying(false); chooseLoopStage(i); }}><span>0{i + 1}</span>{s}</button>)}
        <button onClick={() => { if (!loopPlaying && loopStage === loopStages.length - 1) chooseLoopStage(0); setLoopPlaying(v => !v); }}>{loopPlaying ? "Pause loop" : "Play loop"}</button></div>
      <p aria-live="polite">{loopStage === 0 && (loop.found.length ? `${loop.found.length} registered asset${loop.found.length === 1 ? "" : "s"} appear in the recorded events of ${activeId}. Findings are candidate containers, not confirmed larval sites; uncertain ones stay uncertain.` : "No recorded mission events reference a registered asset yet.")}
        {loopStage === 1 && (plan ? `Latest saved allocation ${plan.id} (${plan.status}) ranks ${plan.result.block_priorities.length} blocks by deterministic rules; brighter blocks scored higher.` : "No allocation has been saved, so no priorities are shown.")}
        {loopStage === 2 && `A person must approve any real mission or treatment programme. Mission ${activeId || "(none)"} is ${activeMission?.status ?? "not recorded"} (${activeMission?.mode ?? "n/a"}). The model, a score or this page cannot bypass the gate.`}
        {loopStage === 3 && `${loop.action.length} asset${loop.action.length === 1 ? "" : "s"} with a recorded mock action (blue) and ${loop.review.length} queued for ground review (amber). A recorded action is not a biologically effective one. No dispensing is controlled from here.`}
        {loopStage === 4 && "Effectiveness is established only by a separate follow-up verification by a different person, and by new trap observations in later collection intervals. None is inferred or displayed here; recorded actions are outlined as pending."}</p></div>}
    <p className="township-footnote">Drag to orbit · scroll or pinch to zoom · keyboard controls and evidence list above. Egg observations do not establish dengue risk. Recorded action does not establish biological effectiveness.</p>
  </section>;
}
