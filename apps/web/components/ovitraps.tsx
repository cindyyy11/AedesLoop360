"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { api, result, type Schema } from "../lib/api";
import { Badge, Empty, Panel, type Shared } from "./workspace";
import { EggCounter } from "./egg-counter";

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
  const [quality,setQuality]=useState<"GOOD"|"BLURRED"|"OCCLUDED">("GOOD");
  useEffect(()=>{let active=true;Promise.all([api.GET("/api/v1/ovitraps"),api.GET("/api/v1/ovitraps/{entity_id}/samples",{params:{path:{entity_id:selected}}})]).then(([t,s])=>{if(active){setTraps(result(t).data);setSamples(result(s).data);setError("");}}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[version,selected]);
  const current=traps.find(t=>t.id===selected);
  const [now]=useState(()=>Date.now());
  const pick=(id:string)=>{setSelected(id);setRevisionSample("");setRevisionCount(null);setRevisions([]);};
  const cadence=current?.sampling_cadence_days??7;
  const ordered=[...samples].sort((a,b)=>a.interval_start.localeCompare(b.interval_start));
  const gapBefore=new Map<string,string>();
  ordered.forEach((s,i)=>{if(i===0)return;const prev=ordered[i-1];const days=(Date.parse(s.interval_start)-Date.parse(prev.interval_end))/DAY;if(days>cadence*0.5)gapBefore.set(s.id,`${prev.interval_end.slice(0,10)} → ${s.interval_start.slice(0,10)} · ${Math.round(days)} days without a sample`);});
  const latest=ordered[ordered.length-1];
  const overdueDays=latest?Math.floor((now-Date.parse(latest.interval_end))/DAY):null;
  useEffect(()=>{const target=revisionSample||samples[0]?.id;if(!target)return;let active=true;void api.GET("/api/v1/samples/{entity_id}/revisions",{params:{path:{entity_id:target}}}).then(r=>{if(active)setRevisions(result(r).data);});return()=>{active=false;};},[revisionSample,samples]);
  return <>{error&&<p role="alert" className="error">{error}</p>}<TrapHealthBoard traps={traps} now={now} onSelect={pick}/><Panel title="Trap registry" aside={<Badge>8 fictional devices</Badge>}><div className="table-wrap"><table><thead><tr><th>Device</th><th>Block</th><th>Health</th><th>Safety / service</th><th>Evidence</th></tr></thead><tbody>{traps.map(t=><tr key={t.id}><th>{t.name}</th><td>{t.block_id}</td><td><Badge>{t.effective_status}</Badge></td><td>{t.safe_design_verified?"Fixture safety verified":"UNSAFE"}<small>{new Date(t.serviced_at).toISOString()}</small></td><td><button className="text-button" onClick={()=>pick(t.id)}>View {t.name} samples</button></td></tr>)}</tbody></table></div></Panel><Panel title={`${current?.name??selected} · collection intervals`} aside={<Badge>REVIEWED INTERVAL EVIDENCE</Badge>}>{current?.effective_status!=="ACTIVE"&&<p className="warning">DATA_UNAVAILABLE · New claims from this trap cannot enter valid surveillance. Service requires field evidence.</p>}{samples.length?<><div className="sample-chart" aria-label="Egg count by distinct collection interval">{ordered.flatMap(s=>[...(gapBefore.has(s.id)?[<div className="chart-row gap" key={`gap-${s.id}`}><span>{gapBefore.get(s.id)}</span><em>Missing evidence, not zero eggs</em></div>]:[]),<div className="chart-row" key={s.id}><span>{s.interval_start.slice(0,10)} → {s.interval_end.slice(0,10)}</span><div className="chart-track"><div className={s.validity==="VALID"?"chart-bar":"chart-bar invalid"} style={{width:`${Math.min(100,s.egg_count/Math.max(...samples.map(v=>v.egg_count),1)*100)}%`}}/></div><strong>{s.egg_count}</strong><Badge>{s.validity}</Badge></div>])}</div>{overdueDays!==null&&overdueDays>cadence*1.5&&<p className="warning">No sample for {overdueDays} days (expected every {cadence}). Treat this trap as unavailable until a new interval is recorded.</p>}{samples.map(s=><details key={s.id}><summary>{s.source_sample_id} · {s.egg_count} {s.mode === "IMPORTED" ? "reviewed eggs" : "labelled fixture dots"} · {s.validity}</summary><div className="sample-detail"><img src={`/api/v1/media/${s.media_id}`} alt={s.mode === "IMPORTED" ? `Reviewed imported egg sample ${s.source_sample_id}` : `Synthetic sample ${s.source_sample_id}, labelled ${s.egg_count} dots`}/><dl className="facts"><dt>Substrate</dt><dd>{s.substrate_id}</dd><dt>Collection</dt><dd>{s.collected_at}</dd><dt>Effort</dt><dd>{s.sampling_effort_days} days</dd><dt>Quality / review</dt><dd>{s.quality} / {s.review_status}</dd><dt>Source</dt><dd>{s.source} · {s.mode}</dd></dl></div></details>)}</>:<Empty>No intervals recorded. This is missing evidence, not zero egg activity.</Empty>}</Panel>{["coordinator","reviewer"].includes(user.role)&&samples.length>0&&<Panel title="Correct a labelled count"><form onSubmit={e=>{e.preventDefault();const target=revisionSample||samples[0].id;void act(async()=>{const revision=result(await api.POST("/api/v1/samples/{entity_id}/revisions",{params:{path:{entity_id:target},header:{"Idempotency-Key":crypto.randomUUID()}},body:{corrected_egg_count:revisionCount??samples.find(s=>s.id===target)!.egg_count,media_id:media,reason:revisionReason,quality:"GOOD"}}));const history=result(await api.GET("/api/v1/samples/{entity_id}/revisions",{params:{path:{entity_id:target}}}));setRevisions(history.data);setRevisionCount(revision.data.corrected_egg_count);},"Count correction saved with reviewer, evidence and previous count");}}><div className="form-grid"><label>Sample to correct<select aria-label="Sample to correct" value={revisionSample||samples[0].id} onChange={e=>{setRevisionSample(e.target.value);setRevisionCount(samples.find(s=>s.id===e.target.value)?.egg_count??0);void api.GET("/api/v1/samples/{entity_id}/revisions",{params:{path:{entity_id:e.target.value}}}).then(r=>setRevisions(result(r).data));}}>{samples.map(s=><option key={s.id} value={s.id}>{s.source_sample_id} · {s.egg_count}</option>)}</select></label><label>Corrected human count<input type="number" min="0" max="10000" value={revisionCount??samples.find(s=>s.id===(revisionSample||samples[0].id))?.egg_count??0} onChange={e=>setRevisionCount(Number(e.target.value))} required/></label><label>Evidence image ID<input value={media} onChange={e=>setMedia(e.target.value)} required/></label><label>Reason<input value={revisionReason} onChange={e=>setRevisionReason(e.target.value)} minLength={8} required/></label></div><button>Save count correction</button></form>{revisions.map(r=><p className="muted" key={r.id}>Count revised {r.previous_egg_count} to {r.corrected_egg_count} · {r.reason} · {r.mode}</p>)}</Panel>}<EggCounter key={selected} trapId={selected} user={user} act={act} version={version} busy={busy}/>{["coordinator","reviewer"].includes(user.role)&&<Panel title="Import a unique collection interval"><p>Use a new physical substrate and image. The example imports a previously unrecorded historical interval; choose 9–16 October in planning to compare it.</p><form onSubmit={e=>{e.preventDefault();void act(async()=>result(await api.POST("/api/v1/ovitraps/{entity_id}/samples",{params:{path:{entity_id:selected},header:{"Idempotency-Key":`sample-${selected}-${sampleId}`}},body:{source_sample_id:sampleId,substrate_id:substrate,interval_start:`${start}T00:00:00Z`,interval_end:`${end}T00:00:00Z`,collected_at:`${end}T00:00:00Z`,sampling_effort_days:(Date.parse(end)-Date.parse(start))/86400000,egg_count:count,media_id:media,quality,source:"HUMAN_LABELLED_FIXTURE",mode:"SIMULATED"}})),"Interval saved. Identical retries return the original record without increasing counts.");}}><div className="form-grid"><label>Source sample ID<input value={sampleId} onChange={e=>setSampleId(e.target.value)} required/></label><label>Physical substrate ID<input value={substrate} onChange={e=>setSubstrate(e.target.value)} required/></label><label>Interval start · UTC<input type="date" value={start} onChange={e=>setStart(e.target.value)} required/></label><label>Interval end / collected · UTC<input type="date" value={end} onChange={e=>setEnd(e.target.value)} required/></label><label>Private image ID<input value={media} onChange={e=>setMedia(e.target.value)} required/></label><label>Human-labelled synthetic count<input type="number" min="0" max="10000" value={count} onChange={e=>setCount(Number(e.target.value))} required/></label><label>Image quality<select value={quality} onChange={e=>setQuality(e.target.value as typeof quality)}><option>GOOD</option><option>BLURRED</option><option>OCCLUDED</option></select></label></div><button>Import interval</button></form><p className="muted">No species or adult population inference. Invalid samples remain visible but are excluded from comparable summaries.</p></Panel>}</>;
}

const DAY=864e5;
const attention: Record<string,string> = {
  STALE: "No recent signal. Check power and connectivity before trusting new counts.",
  SERVICING_DUE: "Service is overdue. Record a field service visit.",
  UNSAFE: "Safety design not verified. Keep out of surveillance until checked.",
  OFFLINE: "Offline. Block data is unavailable, not low risk.",
};
const rank=(status:string)=>status==="ACTIVE"?1:0;
function ago(now:number,iso:string){const d=Math.floor((now-Date.parse(iso))/DAY);return d<=0?"today":d===1?"1 day ago":`${d} days ago`;}
function TrapHealthBoard({traps,now,onSelect}:{traps:Schema["TrapRecord"][];now:number;onSelect:(id:string)=>void}){
  if(!traps.length)return null;
  const blocks=[...new Set(traps.map(t=>t.block_id))].sort();
  const reporting=traps.filter(t=>t.effective_status==="ACTIVE").length;
  return <Panel title="Trap health" aside={<Badge>{reporting} of {traps.length} reporting</Badge>}>
    <div className="health-board">{blocks.map(block=>{
      const inBlock=traps.filter(t=>t.block_id===block).sort((a,b)=>rank(a.effective_status)-rank(b.effective_status)||a.name.localeCompare(b.name));
      const ok=inBlock.filter(t=>t.effective_status==="ACTIVE").length;
      return <section key={block} className={ok===0?"health-block unavailable":"health-block"} aria-label={`${block} trap health`}>
        <h3>{block}<small>{ok===0?"DATA_UNAVAILABLE":`${ok} / ${inBlock.length} reporting`}</small></h3>
        <ul>{inBlock.map(t=><li key={t.id} className={t.effective_status==="ACTIVE"?"":"needs-action"}>
          <span className="health-row"><button className="text-button" onClick={()=>onSelect(t.id)}>{t.name}</button><Badge>{t.effective_status}</Badge></span>
          <small>Signal {ago(now,t.heartbeat_at)} · serviced {ago(now,t.serviced_at)}</small>
          {attention[t.effective_status]&&<small className="action">{attention[t.effective_status]}</small>}
        </li>)}</ul>
      </section>;})}</div>
    <p className="muted">A block with no reporting trap is DATA_UNAVAILABLE, never low risk.</p>
  </Panel>;
}
