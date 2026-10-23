"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { api, result, type Schema } from "../lib/api";
import { Badge, Empty, Panel, Tabs, type Shared } from "./workspace";
import { EggCounter } from "./egg-counter";
import { DroneInbox } from "./drone-inbox";
import { DAY, FlowStrip, IntervalTimeline, NetworkMatrix, SummaryStrip, TrapTiles } from "./trap-visuals";

export function Ovitraps({user, act, version, busy}: Shared) {
  const [traps,setTraps]=useState<Schema["TrapRecord"][]>([]);
  const [samples,setSamples]=useState<Schema["SampleRecord"][]>([]);
  const [selected,setSelected]=useState("trap-b1-1");
  const [error,setError]=useState("");
  const [sampleId,setSampleId]=useState("B1-T1-2026W42-NEW");
  const [substrate,setSubstrate]=useState("B1-paddle-W42-NEW");
  const [media,setMedia]=useState("media-egg-new-001");
  const [start,setStart]=useState("2026-10-09");
  const [end,setEnd]=useState("2026-10-16");
  const [count,setCount]=useState(100);
  const [revisionSample,setRevisionSample]=useState("");
  const [revisionCount,setRevisionCount]=useState<number|null>(null);
  const [revisionReason,setRevisionReason]=useState("Recounted the synthetic fixture image");
  const [revisions,setRevisions]=useState<Schema["SampleRevisionRecord"][]>([]);
  const [sampleSel,setSampleSel]=useState("");
  const [addMode,setAddMode]=useState<"photo"|"manual"|"inbox">("photo");
  const [allSamples,setAllSamples]=useState<Record<string,Schema["SampleRecord"][]>>({});
  const [quality,setQuality]=useState<"GOOD"|"BLURRED"|"OCCLUDED">("GOOD");
  useEffect(()=>{let active=true;Promise.all([api.GET("/api/v1/ovitraps"),api.GET("/api/v1/ovitraps/{entity_id}/samples",{params:{path:{entity_id:selected}}})]).then(([t,s])=>{if(active){setTraps(result(t).data);setSamples(result(s).data);setError("");}}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[version,selected]);
  useEffect(()=>{if(!traps.length)return;let active=true;void Promise.all(traps.map(t=>api.GET("/api/v1/ovitraps/{entity_id}/samples",{params:{path:{entity_id:t.id}}}).then(r=>[t.id,result(r).data] as const))).then(rows=>{if(active)setAllSamples(Object.fromEntries(rows));}).catch(()=>{});return()=>{active=false;};},[traps,version]);
  const current=traps.find(t=>t.id===selected);
  const [now]=useState(()=>Date.now());
  const pick=(id:string)=>{setSelected(id);setSampleSel("");setRevisionSample("");setRevisionCount(null);setRevisions([]);};
  const cadence=current?.sampling_cadence_days??7;
  const ordered=[...samples].sort((a,b)=>a.interval_start.localeCompare(b.interval_start));
  const gapBefore=new Map<string,string>();
  ordered.forEach((s,i)=>{if(i===0)return;const prev=ordered[i-1];const days=(Date.parse(s.interval_start)-Date.parse(prev.interval_end))/DAY;if(days>cadence*0.5)gapBefore.set(s.id,`${prev.interval_end.slice(0,10)} → ${s.interval_start.slice(0,10)} · ${Math.round(days)} days without a sample`);});
  const latest=ordered[ordered.length-1];
  const active=ordered.find(x=>x.id===sampleSel)??latest;
  const overdueDays=latest?Math.floor((now-Date.parse(latest.interval_end))/DAY):null;
  useEffect(()=>{const target=revisionSample||samples[0]?.id;if(!target)return;let active=true;void api.GET("/api/v1/samples/{entity_id}/revisions",{params:{path:{entity_id:target}}}).then(r=>{if(active)setRevisions(result(r).data);});return()=>{active=false;};},[revisionSample,samples]);
  return <>
    {error&&<p role="alert" className="error">{error}</p>}
    <FlowStrip/>
    <div className="trap-picker"><label>Counting eggs for trap<select value={selected} onChange={e=>pick(e.target.value)}>{traps.map(t=><option key={t.id} value={t.id}>{t.name} · {t.effective_status}</option>)}</select></label>{current&&current.effective_status!=="ACTIVE"&&<p className="warning">This trap is {current.effective_status}. Counts from it cannot enter valid surveillance until it is serviced.</p>}</div>
    <Tabs label="Smart ovitraps" tabs={[
      {id:"add",label:"Add a count",hint:"From a photo, by hand or from the drone inbox",content:<>
    <div className="add-tabs three" role="tablist" aria-label="How to add a count">
      <button type="button" role="tab" aria-selected={addMode==="photo"} className={addMode==="photo"?"on":""} onClick={()=>setAddMode("photo")}><strong>Photo of a paddle</strong><small>The model counts, you confirm</small></button>
      <button type="button" role="tab" aria-selected={addMode==="manual"} className={addMode==="manual"?"on":""} onClick={()=>setAddMode("manual")}><strong>Type a count by hand</strong><small>For a paddle you counted yourself</small></button>
      <button type="button" role="tab" aria-selected={addMode==="inbox"} className={addMode==="inbox"?"on":""} onClick={()=>setAddMode("inbox")}><strong>Drone inbox</strong><small>Simulated pass, you confirm</small></button>
    </div>
    {addMode==="inbox"?<DroneInbox traps={traps} user={user} act={act} version={version} busy={busy}/>:addMode==="photo"?<EggCounter key={selected} trapId={selected} trapName={current?.name??selected} user={user} act={act} version={version} busy={busy}/>:(["coordinator"].includes(user.role)?<Panel title="Import a unique collection interval"><p className="muted">Enter one new paddle and week. Counts already saved are never added twice.</p><form onSubmit={e=>{e.preventDefault();void act(async()=>result(await api.POST("/api/v1/ovitraps/{entity_id}/samples",{params:{path:{entity_id:selected},header:{"Idempotency-Key":`sample-${selected}-${sampleId}`}},body:{source_sample_id:sampleId,substrate_id:substrate,interval_start:`${start}T00:00:00Z`,interval_end:`${end}T00:00:00Z`,collected_at:`${end}T00:00:00Z`,sampling_effort_days:(Date.parse(end)-Date.parse(start))/86400000,egg_count:count,media_id:media,quality,source:"HUMAN_LABELLED_FIXTURE",mode:"SIMULATED"}})),"Interval saved. Identical retries return the original record without increasing counts.");}}><div className="form-grid"><label>Source sample ID<input value={sampleId} onChange={e=>setSampleId(e.target.value)} required/></label><label>Physical substrate ID<input value={substrate} onChange={e=>setSubstrate(e.target.value)} required/></label><label>Interval start · UTC<input type="date" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>Interval end / collected · UTC<input type="date" value={end} onChange={e=>setEnd(e.target.value)} required/></label><label>Private image ID<input value={media} onChange={e=>setMedia(e.target.value)} required/></label><label>Human-labelled synthetic count<input type="number" min="0" max="10000" value={count} onChange={e=>setCount(Number(e.target.value))} required/></label><label>Image quality<select value={quality} onChange={e=>setQuality(e.target.value as typeof quality)}><option>GOOD</option><option>BLURRED</option><option>OCCLUDED</option></select></label></div><button>Import interval</button></form><p className="muted">Poor-quality samples stay visible but are left out of totals.</p></Panel>:<Empty>Only reviewers and coordinators can add counts.</Empty>)}
      </>},
      {id:"monitor",label:"Trap monitoring",hint:"What every trap has reported so far",badge:traps.filter(t=>t.effective_status!=="ACTIVE").length?<em className="tab-count is-alert" title="Traps needing attention">{traps.filter(t=>t.effective_status!=="ACTIVE").length}</em>:undefined,content:<>

    <NetworkMatrix traps={traps} samples={allSamples} now={now} selected={selected} onSelect={(id,sid)=>{pick(id);if(sid)setSampleSel(sid);}}/>
    <SummaryStrip traps={traps} current={current} ordered={ordered} cadence={cadence} overdueDays={overdueDays}/>
    <TrapTiles traps={traps} now={now} selected={selected} onSelect={pick}/>
    <Panel title={`${current?.name??selected} · eggs per collection interval`} aside={<Badge>Reviewed</Badge>}>
      {current&&current.effective_status!=="ACTIVE"&&<p className="warning">DATA_UNAVAILABLE · New claims from this trap cannot enter valid surveillance. Service requires field evidence.</p>}
      {overdueDays!==null&&overdueDays>cadence*1.5&&<p className="warning">No sample for {overdueDays} days (expected every {cadence}). Treat this trap as unavailable until a new interval is recorded.</p>}
      {ordered.length?<>
        <p className="muted">Eggs on the trap paddle. Not adult mosquitoes or dengue risk.</p>
        <IntervalTimeline ordered={ordered} cadence={cadence} now={now} activeId={active?.id??""} onSelect={setSampleSel}/>
        {active&&<div className="sample-focus"><div className="sample-detail"><img src={`/api/v1/media/${active.media_id}`} alt={active.mode==="IMPORTED"?`Reviewed imported egg sample ${active.source_sample_id}`:`Synthetic sample ${active.source_sample_id}, labelled ${active.egg_count} dots`}/><div><h3>{active.source_sample_id} · {active.egg_count} {active.mode==="IMPORTED"?"reviewed eggs":"labelled fixture dots"}</h3><p className="muted">Selected interval · <Badge>{active.validity}</Badge></p><dl className="facts"><dt>Interval</dt><dd>{active.interval_start.slice(0,10)} → {active.interval_end.slice(0,10)}</dd><dt>Substrate</dt><dd>{active.substrate_id}</dd><dt>Collection</dt><dd>{active.collected_at}</dd><dt>Effort</dt><dd>{active.sampling_effort_days} days</dd><dt>Quality / review</dt><dd>{active.quality} / {active.review_status}</dd><dt>Source</dt><dd>{active.source} · {active.mode}</dd></dl></div></div></div>}
      </>:<Empty>No intervals recorded. This is missing evidence, not zero egg activity.</Empty>}
    </Panel>
      </>},
      {id:"fix",label:"Corrections & devices",hint:"Fix a count, browse the trap list",content:<>

    {["coordinator"].includes(user.role)&&samples.length>0&&<Panel title="Reviewer tools · correct a labelled count"><form onSubmit={e=>{e.preventDefault();const target=revisionSample||samples[0].id;void act(async()=>{const revision=result(await api.POST("/api/v1/samples/{entity_id}/revisions",{params:{path:{entity_id:target},header:{"Idempotency-Key":crypto.randomUUID()}},body:{corrected_egg_count:revisionCount??samples.find(s=>s.id===target)!.egg_count,media_id:media,reason:revisionReason,quality:"GOOD"}}));const history=result(await api.GET("/api/v1/samples/{entity_id}/revisions",{params:{path:{entity_id:target}}}));setRevisions(history.data);setRevisionCount(revision.data.corrected_egg_count);},"Count correction saved with reviewer, evidence and previous count");}}><div className="form-grid"><label>Sample to correct<select aria-label="Sample to correct" value={revisionSample||samples[0].id} onChange={e=>{setRevisionSample(e.target.value);setRevisionCount(samples.find(s=>s.id===e.target.value)?.egg_count??0);void api.GET("/api/v1/samples/{entity_id}/revisions",{params:{path:{entity_id:e.target.value}}}).then(r=>setRevisions(result(r).data));}}>{samples.map(s=><option key={s.id} value={s.id}>{s.source_sample_id} · {s.egg_count}</option>)}</select></label><label>Corrected human count<input type="number" min="0" max="10000" value={revisionCount??samples.find(s=>s.id===(revisionSample||samples[0].id))?.egg_count??0} onChange={e=>setRevisionCount(Number(e.target.value))} required/></label><label>Evidence image ID<input value={media} onChange={e=>setMedia(e.target.value)} required/></label><label>Reason<input value={revisionReason} onChange={e=>setRevisionReason(e.target.value)} minLength={8} required/></label></div><button>Save count correction</button></form>{revisions.map(r=><p className="muted" key={r.id}>Count revised {r.previous_egg_count} to {r.corrected_egg_count} · {r.reason} · {r.mode}</p>)}</Panel>}
    <Panel title="All devices" aside={<Badge>{traps.length} devices</Badge>}><details className="fold"><summary>Show device registry table</summary><div className="table-wrap"><table><thead><tr><th>Device</th><th>Block</th><th>Health</th><th>Safety / service</th><th>Evidence</th></tr></thead><tbody>{traps.map(t=><tr key={t.id}><th>{t.name}</th><td>{t.block_id}</td><td><Badge>{t.effective_status}</Badge></td><td>{t.safe_design_verified?"Fixture safety verified":"UNSAFE"}<small>{new Date(t.serviced_at).toISOString()}</small></td><td><button className="text-button" onClick={()=>pick(t.id)}>View {t.name} samples</button></td></tr>)}</tbody></table></div></details></Panel>
      </>},
    ]}/>
    </>;
}
