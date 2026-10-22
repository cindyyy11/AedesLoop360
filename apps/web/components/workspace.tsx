"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, result, type Schema } from "../lib/api";
import { Overview } from "./overview";
import { Missions } from "./missions";
import { Ovitraps } from "./ovitraps";
import { Planning } from "./planning";
import { Operations } from "./operations";

const navigation = [["/dashboard", "Overview"], ["/township", "Township"], ["/drone/missions", "Drone missions"], ["/ovitraps", "Smart ovitraps"], ["/planning", "Next-round planning"], ["/operations", "Field operations"], ["/settings", "Evidence & system"]];
export type RunAction = (fn: () => Promise<unknown>, message: string) => Promise<void>;

export function Badge({children}: {children: React.ReactNode}) { return <span className="badge">{children}</span>; }
export function Empty({children}: {children: React.ReactNode}) { return <p className="empty">{children}</p>; }
export function Panel({title, children, aside}: {title: string; children: React.ReactNode; aside?: React.ReactNode}) { return <section className="panel"><div className="section-head"><h2>{title}</h2>{aside}</div>{children}</section>; }

export default function Workspace() {
  const path = usePathname();
  const [user, setUser] = useState<Schema["LoginResponse"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [role, setRole] = useState("coordinator");
  const [password, setPassword] = useState("demo-coordinator-360");
  useEffect(() => { let active = true; api.GET("/api/v1/auth/me").then(v => { if (active) { if (v.data) setUser(v.data); setLoading(false); } }).catch(() => { if (active) { setError("API unavailable. Start the API, then retry sign-in."); setLoading(false); } }); return () => { active = false; }; }, []);
  const act: RunAction = useCallback(async (fn, message) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); setNotice(message); setVersion(v => v + 1); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed. Refresh and retry."); }
    finally { setBusy(false); }
  }, []);
  if (loading) return <main className="login"><h1>AedesLoop 360</h1><p role="status">Connecting to your workspace…</p></main>;
  if (!user) return <main className="login"><div className="login-mark">AedesLoop <b>360</b></div><h1>A clearer view.<br/>A coordinated response.</h1><p>Sign in to the fictional four-block command workspace.</p><form onSubmit={e => { e.preventDefault(); void act(async () => setUser(result(await api.POST("/api/v1/auth/login", {body: {username: role, password}}))), "Signed in"); }}><label>Local demonstration account<select value={role} onChange={e => { setRole(e.target.value); setPassword(`demo-${e.target.value}-360`); }}>{["coordinator", "operator", "inspector", "reviewer", "admin"].map(r => <option key={r}>{r}</option>)}</select></label><label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></label><button disabled={busy}>Sign in</button></form>{error && <p role="alert" className="error">{error}</p>}<small>Local demo accounts only. All evidence is SIMULATED. No aircraft or chemical controls.</small></main>;
  const title = path.startsWith("/assets/") ? "Asset evidence" : navigation.find(([url]) => url === path)?.[1] ?? "Overview";
  const shared = {user, act, version, busy};
  return <div className="shell"><a className="skip" href="#content">Skip to content</a><aside className="sidebar"><Link className="brand" href="/dashboard">AedesLoop <strong>360</strong></Link><p className="workspace-label">Township command</p><nav aria-label="Main navigation">{navigation.map(([url, label], i) => <Link aria-current={path === url ? "page" : undefined} key={url} href={url}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x={4 + i % 2} y="4" width="15" height="15" rx={i % 2 ? 7 : 2}/><path d="M8 12h8M12 8v8"/></svg>{label}</Link>)}</nav><div className="sidebar-footer"><span className="live-dot"/>Local demonstration<p>Fictional township<br/>No real-world deployment</p></div></aside><div className="main"><header className="topbar"><span>Operations workspace <span className="muted">/ {title}</span></span><div><Badge>{user.role}</Badge><button className="text-button" onClick={() => void act(async () => { await api.POST("/api/v1/auth/logout"); setUser(null); }, "Signed out")}>Sign out</button></div></header><div className="mode-banner"><b>SIMULATED</b><span>Fictional evidence. Inspection priorities are not dengue risk predictions. No real flight or dispensing.</span></div><main id="content" className="content"><div className="page-heading"><div><h1>{title === "Overview" ? "Every observation. One loop." : title}</h1><p>{title === "Overview" ? "Coordinate surveillance, inspect with evidence, and close the loop." : "Persisted evidence and human decisions across the fictional township."}</p></div><button className="secondary" disabled={busy} onClick={() => setVersion(v => v + 1)}>Refresh data</button></div>{error && <div role="alert" className="error">{error}</div>}{notice && <div role="status" className="notice">{notice}</div>}<fieldset disabled={busy} className="workspace-fieldset">{(path === "/" || path === "/dashboard" || path === "/township") && <Overview {...shared} mapOnly={path === "/township"} />}{path.startsWith("/drone") && <Missions {...shared} />}{path === "/ovitraps" && <Ovitraps {...shared} />}{path === "/planning" && <Planning {...shared} />}{(path === "/operations" || path.startsWith("/assets/")) && <Operations {...shared} assetId={path.startsWith("/assets/") ? path.split("/")[2] : undefined} />}{path === "/settings" && <System {...shared} />}</fieldset><footer className="disclaimer">Egg observations ≠ adult abundance ≠ confirmed Aedes species ≠ human dengue risk.<br/>Action recorded ≠ biologically effective. Independent physical verification remains separate.</footer></main></div></div>;
}

export type Shared = {user: Schema["LoginResponse"]; act: RunAction; version: number; busy: boolean};

function System({user, version}: Shared) {
  const [jobs, setJobs] = useState<Schema["JobRecord"][]>([]);
  const [audits, setAudits] = useState<Schema["AuditRecord"][]>([]);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; (async () => { try { const j = result(await api.GET("/api/v1/jobs")); const a = ["coordinator", "admin"].includes(user.role) ? result(await api.GET("/api/v1/audit")).data : []; if (active) {setJobs(j.data); setAudits(a);} } catch(e) { if(active) setError(String(e)); } })(); return () => {active=false;}; }, [version, user.role]);
  return <><Panel title="Adapters & deployment"><dl className="facts"><dt>Drone</dt><dd>Persisted simulation only · hardware DISARMED / not connected</dd><dt>Vision</dt><dd>DEMO_PREANNOTATED_V1 · no learned model or accuracy claim</dd><dt>Egg counting</dt><dd>Human-labelled synthetic fixtures · no species inference</dd><dt>Location</dt><dd>Fictional schematic · no geographic accuracy claim</dd></dl><p>Reset safely by stopping services and selecting a fresh AEDES_DATABASE_URL, then migrating and seeding. Existing audit history stays in the previous database.</p></Panel>{error && <p role="alert" className="error">{error}</p>}<Panel title="Durable worker jobs">{jobs.length ? jobs.map(j => <div className="list-row" key={j.id}><span>{j.mission_id}</span><Badge>{j.status} · step {j.cursor}</Badge>{j.error && <span>{j.error}</span>}</div>) : <Empty>No simulation jobs queued.</Empty>}</Panel><Panel title="Append-only audit trail">{audits.length ? audits.map(a => <div className="list-row" key={a.id}><div><strong>{a.action.replaceAll("_", " ")}</strong><small>{a.entity_id} · {a.actor_id}</small></div><time>{new Date(a.created_at).toISOString()}</time></div>) : <Empty>{["admin", "coordinator"].includes(user.role) ? "No recorded actions yet." : "Audit viewing requires coordinator or admin."}</Empty>}</Panel></>;
}
