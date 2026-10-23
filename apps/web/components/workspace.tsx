"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, result, type Schema } from "../lib/api";
import { Overview } from "./overview";
import { Missions } from "./missions";
import { Ovitraps } from "./ovitraps";
import { Planning } from "./planning";
import { Operations } from "./operations";

const navigation = [["/dashboard", "Overview"], ["/township", "Township"], ["/drone/missions", "Drone missions"], ["/ovitraps", "Smart ovitraps"], ["/planning", "Next-round planning"], ["/operations", "Field operations"], ["/settings", "Evidence & system"]];
const navIcons = [
  <><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></>,
  <><path d="M12 21s-6.5-5.4-6.5-10.4A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.6C18.5 15.6 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.2"/></>,
  <><circle cx="5" cy="5" r="2.4"/><circle cx="19" cy="5" r="2.4"/><circle cx="5" cy="19" r="2.4"/><circle cx="19" cy="19" r="2.4"/><path d="M7 7l3.5 3.5M17 7l-3.5 3.5M7 17l3.5-3.5M17 17l-3.5-3.5"/><circle cx="12" cy="12" r="1.6"/></>,
  <><ellipse cx="12" cy="13" rx="5.5" ry="7"/><path d="M9 9.5h.01M12 8h.01M15 9.5h.01M10 13h.01M14 13h.01M12 16.5h.01"/></>,
  <><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8 19h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16"/></>,
  <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h4"/></>,
  <><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/></>,
];
function LoopMark() { return <span className="brand-mark" aria-hidden="true"><Image src="/brand/aedesloop-emblem-transparent.png" alt="" width={84} height={86} priority /></span>; }
function Splash() {
  return <main className="splash"><div className="splash-panel"><div className="splash-logo"><Image src="/brand/aedesloop-emblem-transparent.png" alt="AedesLoop 360 logo: drone circling a smart ovitrap" width={687} height={702} priority /></div><h1>AedesLoop <span>360</span></h1><p className="splash-tag">Smart Mosquito Control</p><div className="splash-track" aria-hidden="true"><span /></div><p role="status" className="splash-status">Connecting to your workspace…</p><small>Simulated demonstration · Drone · Smart ovitrap · Command</small></div></main>;
}
const demoRoles = [["coordinator", "Coordinator", "/dashboard"], ["operator", "Drone operator", "/drone/missions"], ["inspector", "Field inspector", "/operations"], ["reviewer", "Quality reviewer", "/ovitraps"], ["admin", "Administrator", "/settings"]] as const;
const landingFor = (role: string) => demoRoles.find(([r]) => r === role)?.[2] ?? "/dashboard";
export type RunAction = (fn: () => Promise<unknown>, message: string) => Promise<void>;

export function Badge({children}: {children: React.ReactNode}) { return <span className="badge">{children}</span>; }
export function Empty({children}: {children: React.ReactNode}) { return <p className="empty">{children}</p>; }
export function Panel({title, children, aside}: {title: string; children: React.ReactNode; aside?: React.ReactNode}) { return <section className="panel"><div className="section-head"><h2>{title}</h2>{aside}</div>{children}</section>; }

export default function Workspace() {
  const path = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<string>("coordinator");
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [user, setUser] = useState<Schema["LoginResponse"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => { setVersion(v => v + 1); setUpdatedAt(new Date()); }, []);
  useEffect(() => { let active = true; const started = Date.now(); const finish = () => { const wait = Math.max(0, 700 - (Date.now() - started)); window.setTimeout(() => { if (active) setLoading(false); }, wait); }; api.GET("/api/v1/auth/me").then(v => { if (active) { if (v.data) setUser(v.data); finish(); } }).catch(() => { if (active) { setError("API unavailable. Start the API, then retry sign-in."); finish(); } }); return () => { active = false; }; }, []);
  const act: RunAction = useCallback(async (fn, message) => {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); setNotice(message); bump(); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed. Refresh and retry."); }
    finally { setBusy(false); }
  }, [bump]);
  if (loading) return <Splash />;
  if (!user) return <main className="login"><div className="login-logo"><Image src="/brand/aedesloop-360-logo.jpg" alt="AedesLoop 360 - Smart Mosquito Control" width={1024} height={1024} priority /></div><h1>A clearer view.<br/>A coordinated response.</h1><p>Explore the fictional four-block command workspace.</p><label className="role-picker">Enter as<select value={role} onChange={e => setRole(e.target.value)}>{demoRoles.map(([r, label]) => <option key={r} value={r}>{label}</option>)}</select></label><button disabled={busy} onClick={() => void act(async () => { setUser(result(await api.POST("/api/v1/auth/login", {body: {username: role, password: `demo-${role}-360`}}))); if (role !== "coordinator") router.push(landingFor(role)); }, "Entered local demo")}>Enter demo</button>{error && <p role="alert" className="error">{error}</p>}<small>Local demo access · SIMULATED evidence · no aircraft or chemical controls.</small></main>;
  const title = path.startsWith("/assets/") ? "Asset evidence" : navigation.find(([url]) => url === path)?.[1] ?? "Overview";
  const shared = {user, act, version, busy};
  const canSwitchDemoRole = ["coordinator", "operator"].includes(user.role);
  const nextDemoRole = user.role === "coordinator" ? "operator" : "coordinator";
  return <div className="shell"><a className="skip" href="#content">Skip to content</a><aside className="sidebar"><Link className="brand" href="/dashboard"><LoopMark/><span>AedesLoop <strong>360</strong></span></Link><p className="workspace-label">Smart Mosquito Control</p><p className="nav-label">Workspace</p><nav aria-label="Main navigation">{navigation.map(([url, label], i) => <Link aria-current={path === url ? "page" : undefined} key={url} href={url}><svg viewBox="0 0 24 24" aria-hidden="true">{navIcons[i]}</svg>{label}</Link>)}</nav><div className="sidebar-footer"><span className="live-dot"/>Local demonstration<p>Fictional township<br/>No real-world deployment</p></div></aside><div className="main"><header className="topbar"><span>Operations workspace <span className="muted">/ {title}</span></span><div><Badge>{user.role}</Badge>{canSwitchDemoRole&&<button className="text-button" disabled={busy} onClick={() => void act(async () => { await api.POST("/api/v1/auth/logout"); setUser(result(await api.POST("/api/v1/auth/login", {body: {username: nextDemoRole, password: `demo-${nextDemoRole}-360`}}))); }, `Switched to ${nextDemoRole}`)}>Switch to {nextDemoRole}</button>}<button className="text-button" disabled={busy} onClick={() => void act(async () => { await api.POST("/api/v1/auth/logout"); setUser(null); }, "Signed out")}>Sign out</button></div></header><div className="mode-banner"><b>SIMULATED</b><span>Fictional evidence. Inspection priorities are not dengue risk predictions. No real flight or dispensing.</span></div><main id="content" className="content"><div className="page-heading"><div><span className="page-eyebrow">Observe / Plan / Inspect / Verify</span><h1>{title === "Overview" ? "Command overview" : title}</h1><p>{title === "Overview" ? "Four fictional blocks. Counts come from your local database — seeded fixtures, updated by demo actions." : "Persisted evidence and human decisions across the fictional township."}</p></div><div className="refresh-group"><time dateTime={updatedAt.toISOString()}>Updated {updatedAt.toLocaleTimeString("en-GB")}</time><button className="secondary" disabled={busy} onClick={bump}>Refresh data</button></div></div>{error && <div role="alert" className="error">{error}</div>}{notice && <div role="status" className="notice">{notice}</div>}<fieldset disabled={busy} className="workspace-fieldset">{(path === "/" || path === "/dashboard" || path === "/township") && <Overview {...shared} mapOnly={path === "/township"} />}{path.startsWith("/drone") && <Missions {...shared} />}{path === "/ovitraps" && <Ovitraps {...shared} />}{path === "/planning" && <Planning {...shared} />}{(path === "/operations" || path.startsWith("/assets/")) && <Operations {...shared} assetId={path.startsWith("/assets/") ? path.split("/")[2] : undefined} />}{path === "/settings" && <System {...shared} />}</fieldset><footer className="disclaimer">Egg observations ≠ adult abundance ≠ confirmed Aedes species ≠ human dengue risk.<br/>Action recorded ≠ biologically effective. Independent physical verification remains separate.</footer></main></div></div>;
}

export type Shared = {user: Schema["LoginResponse"]; act: RunAction; version: number; busy: boolean};

function System({user, version}: Shared) {
  const [jobs, setJobs] = useState<Schema["JobRecord"][]>([]);
  const [audits, setAudits] = useState<Schema["AuditRecord"][]>([]);
  const [error, setError] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  useEffect(() => { let active = true; (async () => { try { const j = result(await api.GET("/api/v1/jobs")); const a = ["coordinator", "admin"].includes(user.role) ? result(await api.GET("/api/v1/audit")).data : []; if (active) {setJobs(j.data); setAudits(a);} } catch(e) { if(active) setError(String(e)); } })(); return () => {active=false;}; }, [version, user.role]);
  return <><Panel title="Adapters & deployment"><dl className="facts"><dt>Drone</dt><dd>Persisted simulation only · hardware DISARMED / not connected</dd><dt>Vision</dt><dd>DEMO_PREANNOTATED_V1 · no learned model or accuracy claim</dd><dt>Egg counting</dt><dd>Human-labelled synthetic fixtures · no species inference</dd><dt>Location</dt><dd>Fictional schematic · no geographic accuracy claim</dd></dl><p>Reset safely by stopping services and selecting a fresh AEDES_DATABASE_URL, then migrating and seeding. Existing audit history stays in the previous database.</p></Panel>{error && <p role="alert" className="error">{error}</p>}<Panel title="Durable worker jobs">{jobs.length ? jobs.map(j => <div className="list-row" key={j.id}><span>{j.mission_id}</span><Badge>{j.status} · step {j.cursor}</Badge>{j.error && <span>{j.error}</span>}</div>) : <Empty>No simulation jobs queued.</Empty>}</Panel><Panel title="Append-only audit trail">{audits.length > 0 && <label className="audit-filter">Filter by action, entity or actor<input type="search" value={auditQuery} onChange={e => setAuditQuery(e.target.value)} placeholder="e.g. MISSION or user-operator"/></label>}{audits.length ? audits.filter(a => `${a.action} ${a.entity_id} ${a.actor_id}`.toLowerCase().includes(auditQuery.trim().toLowerCase())).map(a => <div className="list-row" key={a.id}><div><strong>{a.action.replaceAll("_", " ")}</strong><small>{a.entity_id} · {a.actor_id}</small></div><time>{new Date(a.created_at).toISOString()}</time></div>) : <Empty>{["admin", "coordinator"].includes(user.role) ? "No recorded actions yet." : "Audit viewing requires coordinator or admin."}</Empty>}</Panel></>;
}
