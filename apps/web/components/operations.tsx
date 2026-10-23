"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, result, type Schema } from "../lib/api";
import { Badge, Empty, Panel, type Shared } from "./workspace";

export function Operations({user,act,version,assetId}:Shared & {assetId?:string}){
  const [work,setWork]=useState<Schema["WorkOrderRecord"][]>([]);
  const [observations,setObservations]=useState<Schema["ObservationRecord"][]>([]);
  const [error,setError]=useState("");
  const [evidence,setEvidence]=useState("media-aerial-001");
  const [reason,setReason]=useState("Independent review of fictional physical-condition evidence");
  const [date,setDate]=useState("2026-10-22T02:00");
  useEffect(()=>{let active=true;Promise.all([api.GET("/api/v1/work-orders"),api.GET("/api/v1/inspections")]).then(([w,o])=>{if(active){setWork(result(w).data);setObservations(result(o).data);setError("");}}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[version]);
  const [view,setView]=useState<"board"|"list">("board");
  const [blockFilter,setBlockFilter]=useState("all");
  const [kindFilter,setKindFilter]=useState("all");
  const [query,setQuery]=useState("");
  const [now]=useState(()=>Date.now());
  const scoped=work.filter(w=>!assetId||w.asset_id===assetId);
  const q=query.trim().toLowerCase();
  const visible=scoped.filter(w=>(blockFilter==="all"||w.block_id===blockFilter)&&(kindFilter==="all"||w.kind===kindFilter)&&(!q||`${w.id} ${w.block_id} ${w.reason} ${w.asset_id??""} ${w.kind}`.toLowerCase().includes(q)));
  return <>{error&&<p role="alert" className="error">{error}</p>}<Panel title={assetId?`${assetId} · source history`:"Evidence and independent review"} aside={<Link href="/assets/asset-p03">Open P-03 history →</Link>}><div className="form-row"><label>Private evidence ID<input value={evidence} onChange={e=>setEvidence(e.target.value)}/></label><label>Review / verification rationale<input value={reason} onChange={e=>setReason(e.target.value)} minLength={8}/></label></div>{observations.filter(o=>!assetId||o.asset_id===assetId).map(o=><div className="list-row" key={o.id}><div><strong>{o.asset_id} · {o.water_state}</strong><small>{o.observed_at} · {o.id} · {o.resolved?"Resolved after independent follow-up":"Unresolved"}</small></div><Badge>{o.review_status}</Badge>{o.review_status==="NEEDS_REVIEW"&&user.role==="coordinator"&&<div className="actions"><button onClick={()=>void act(async()=>result(await api.POST("/api/v1/inspections/{entity_id}/review",{params:{path:{entity_id:o.id}},body:{confirmed:true,reason}})),"Observation confirmed; recurrence evaluated")}>Confirm evidence</button><button className="secondary" onClick={()=>void act(async()=>result(await api.POST("/api/v1/inspections/{entity_id}/review",{params:{path:{entity_id:o.id}},body:{confirmed:false,reason}})),"Observation rejected")}>Reject evidence</button></div>}</div>)}{user.role==="operator"&&<form onSubmit={e=>{e.preventDefault();void act(async()=>result(await api.POST("/api/v1/inspections",{params:{header:{"Idempotency-Key":`observation-${assetId??"asset-p03"}-${date}`}},body:{asset_id:assetId??"asset-p03",observed_at:`${date}:00Z`,water_state:"VISIBLE_WATER",media_id:evidence}})),"Simulated water observation submitted for independent review");}}><div className="form-row"><label>Observation timestamp · UTC<input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)} required/></label><button>Record P-03 water observation</button></div></form>}{["coordinator"].includes(user.role)&&<button className="secondary" onClick={()=>void act(async()=>result(await api.POST("/api/v1/assets/{entity_id}/recurrence",{params:{path:{entity_id:assetId??"asset-p03"}}})),"Recurrence evaluated; only verified distinct observations qualify")}>Evaluate recurrence</button>}<p className="muted">Two confirmed sightings within 90 days trigger an engineering review.</p></Panel><Panel title="Operational work queue" aside={<Badge>{visible.length} of {scoped.length} persisted tasks</Badge>}>{scoped.length>0&&<div className="work-controls"><label>Search<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Task, asset or reason"/></label><label>Block<select value={blockFilter} onChange={e=>setBlockFilter(e.target.value)}><option value="all">All blocks</option>{[...new Set(scoped.map(w=>w.block_id))].sort().map(b=><option key={b} value={b}>{b}</option>)}</select></label><label>Task type<select value={kindFilter} onChange={e=>setKindFilter(e.target.value)}><option value="all">All types</option>{[...new Set(scoped.map(w=>w.kind))].sort().map(k=><option key={k} value={k}>{k.replaceAll("_"," ")}</option>)}</select></label><div className="view-toggle" role="group" aria-label="Work queue view"><button className={view==="board"?"":"secondary"} aria-pressed={view==="board"} onClick={()=>setView("board")}>Board</button><button className={view==="list"?"":"secondary"} aria-pressed={view==="list"} onClick={()=>setView("list")}>List</button></div></div>}{scoped.length>0&&visible.length===0&&<Empty>No tasks match these filters.</Empty>}{view==="board"&&visible.length>0&&<WorkBoard work={visible} now={now} user={user} act={act} evidence={evidence} reason={reason}/>}{view==="list"&&visible.length>0?visible.map(w=><article className="work-row" key={w.id}><div><h3>{w.kind.replaceAll("_"," ")}</h3><p>{w.block_id} {w.asset_id&&`· ${w.asset_id}`} · <Badge>{w.status.replaceAll("_"," ")}</Badge></p><p>{w.reason}</p><small>Assigned: {w.assigned_to??"unassigned"} · {w.id}</small></div><WorkActions w={w} user={user} act={act} evidence={evidence} reason={reason}/></article>):scoped.length>0?null:<Empty>No jobs yet. Approve a plan or confirm a sighting to create one.</Empty>}</Panel></>;
}

type Work=Schema["WorkOrderRecord"];
type WorkProps={w:Work;user:Shared["user"];act:Shared["act"];evidence:string;reason:string};
function WorkActions({w,user,act,evidence,reason}:WorkProps){
  return <div className="actions">{["OPEN","REOPENED"].includes(w.status)&&user.role==="coordinator"&&<button onClick={()=>void act(async()=>result(await api.PATCH("/api/v1/work-orders/{entity_id}",{params:{path:{entity_id:w.id}},body:{action:"ASSIGN",assignee_id:"user-inspector"}})),"Assigned to local inspector")}>Assign field operator</button>}{w.status==="ASSIGNED"&&user.role==="operator"&&<button onClick={()=>void act(async()=>result(await api.PATCH("/api/v1/work-orders/{entity_id}",{params:{path:{entity_id:w.id}},body:{action:"START"}})),"Field work started")}>Start work</button>}{w.status==="IN_PROGRESS"&&user.role==="operator"&&<button onClick={()=>void act(async()=>result(await api.PATCH("/api/v1/work-orders/{entity_id}",{params:{path:{entity_id:w.id}},body:{action:"COMPLETE",evidence_id:evidence}})),"Action recorded; independent verification still required")}>Record action complete</button>}{w.status==="ACTION_COMPLETED_PENDING_VERIFICATION"&&user.role==="coordinator"&&<><button onClick={()=>void act(async()=>result(await api.POST("/api/v1/work-orders/{entity_id}/verify",{params:{path:{entity_id:w.id}},body:{result:"VERIFIED_RESOLVED",evidence_id:evidence,reason}})),"Independent physical-condition verification saved")}>Verify resolved</button><button className="secondary" onClick={()=>void act(async()=>result(await api.POST("/api/v1/work-orders/{entity_id}/verify",{params:{path:{entity_id:w.id}},body:{result:"REOPENED",evidence_id:evidence,reason}})),"Work reopened for correction")}>Reopen work</button></>}</div>;
}

const columns:[string,string[],string][]=[
  ["To assign",["OPEN","REOPENED"],"Waiting for a coordinator"],
  ["Assigned",["ASSIGNED"],"Waiting to start"],
  ["In progress",["IN_PROGRESS"],"Field work under way"],
  ["Action recorded",["ACTION_COMPLETED_PENDING_VERIFICATION"],"Done, not yet checked"],
  ["Verified resolved",["VERIFIED_RESOLVED"],"Checked by a reviewer"],
];
function openDays(now:number,iso:string){return Math.max(0,Math.floor((now-Date.parse(iso))/864e5));}
function WorkBoard({work,now,user,act,evidence,reason}:{work:Work[];now:number;user:Shared["user"];act:Shared["act"];evidence:string;reason:string}){
  const known=new Set(columns.flatMap(c=>c[1]));
  const other=work.filter(w=>!known.has(w.status));
  const all:[string,string[],string][]=other.length?[...columns,["Other",[...new Set(other.map(w=>w.status))],"Other"]]:columns;
  return <div className="work-board">{all.map(([title,statuses,hint])=>{
    const cards=work.filter(w=>statuses.includes(w.status));
    return <section key={title} className={`work-column${title==="Action recorded"?" unverified":""}`} aria-label={`${title}, ${cards.length} tasks`}>
      <h3>{title}<b>{cards.length}</b></h3><p className="muted">{hint}</p>
      {cards.length?cards.map(w=><article key={w.id} className="work-card">
        <strong>{w.kind.replaceAll("_"," ")}</strong>
        <small>{w.block_id}{w.asset_id?` · ${w.asset_id}`:""}</small>
        <p>{w.reason}</p>
        <small>{w.status==="REOPENED"&&<Badge>REOPENED</Badge>}{w.kind==="ENGINEERING_REVIEW"&&<Badge>RECURRENCE</Badge>}Opened {openDays(now,w.created_at)} days ago · {w.assigned_to??"unassigned"}</small>
        <WorkActions w={w} user={user} act={act} evidence={evidence} reason={reason}/>
      </article>):<p className="muted empty-column">None</p>}
    </section>;})}</div>;
}
