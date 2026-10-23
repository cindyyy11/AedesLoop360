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

type NavItem = { url: string; label: string; verb?: string; icon: React.ReactNode };
const ICON = {
  dashboard: <><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></>,
  township: <><path d="M12 21s-6.5-5.4-6.5-10.4A6.5 6.5 0 0 1 12 4a6.5 6.5 0 0 1 6.5 6.6C18.5 15.6 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.2"/></>,
  drone: <><circle cx="5" cy="5" r="2.4"/><circle cx="19" cy="5" r="2.4"/><circle cx="5" cy="19" r="2.4"/><circle cx="19" cy="19" r="2.4"/><path d="M7 7l3.5 3.5M17 7l-3.5 3.5M7 17l3.5-3.5M17 17l-3.5-3.5"/><circle cx="12" cy="12" r="1.6"/></>,
  trap: <><ellipse cx="12" cy="13" rx="5.5" ry="7"/><path d="M9 9.5h.01M12 8h.01M15 9.5h.01M10 13h.01M14 13h.01M12 16.5h.01"/></>,
  plan: <><circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8 19h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16"/></>,
  ops: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h4"/></>,
  system: <><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.6M12 18.6v2.6M2.8 12h2.6M18.6 12h2.6M5.5 5.5l1.8 1.8M16.7 16.7l1.8 1.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8"/></>,
};
// The four loop pages are numbered in the order a team uses them.
const loopPages: NavItem[] = [
  { url: "/ovitraps", label: "Smart ovitraps", verb: "Count eggs", icon: ICON.trap },
  { url: "/planning", label: "Next-round planning", verb: "Decide where to go", icon: ICON.plan },
  { url: "/drone/missions", label: "Drone missions", verb: "Inspect from the air", icon: ICON.drone },
  { url: "/operations", label: "Field operations", verb: "Fix and verify", icon: ICON.ops },
];
const navGroups: { label?: string; items: NavItem[] }[] = [
  { items: [{ url: "/dashboard", label: "Dashboard", verb: "What needs attention", icon: ICON.dashboard }] },
  { label: "The loop", items: loopPages },
  { label: "More", items: [{ url: "/township", label: "Township", verb: "3D walkthrough", icon: ICON.township }, { url: "/settings", label: "Evidence & system", verb: "Audit and jobs", icon: ICON.system }] },
];
const navigation = navGroups.flatMap(g => g.items);
function LoopMark() { return <span className="brand-mark" aria-hidden="true"><Image src="/brand/aedesloop-emblem-transparent.png" alt="" width={84} height={86} priority /></span>; }
function Splash() {
  return <main className="splash"><div className="splash-panel"><div className="splash-logo"><Image src="/brand/aedesloop-emblem-transparent.png" alt="AedesLoop 360 logo: drone circling a smart ovitrap" width={687} height={702} priority /></div><h1>AedesLoop <span>360</span></h1><p className="splash-tag">Smart Mosquito Control</p><div className="splash-track" aria-hidden="true"><span /></div><p role="status" className="splash-status">Getting things ready…</p></div></main>;
}
const blurbs: Record<string, string> = {
  Dashboard: "What needs attention today.",
  Township: "Walk through the fictional town in 3D and replay what happened.",
  "Drone missions": "Run a simulated drone pass. A person then checks every candidate it finds.",
  "Smart ovitraps": "Pick a trap, add this week's egg count from a photo, and watch each trap's history.",
  "Next-round planning": "Turn the counts into a ranked list of blocks to visit. A coordinator approves it.",
  "Field operations": "Assign jobs, record the fix, then have a second person verify it worked.",
  "Evidence & system": "Background jobs and the audit trail of who did what.",
  "Asset evidence": "History of one site.",
};
const loopSteps = [
  { url: "/ovitraps", name: "Count", note: "Eggs per trap" },
  { url: "/planning", name: "Plan", note: "Where to go" },
  { url: "/drone/missions", name: "Inspect", note: "Drone and review" },
  { url: "/operations", name: "Fix & verify", note: "Jobs and checks" },
] as const;

const demoRoles = [["coordinator", "Coordinator", "/dashboard", "Plans rounds, approves missions, reviews counts and checks results."], ["operator", "Field operator", "/drone/missions", "Runs simulated drone missions, uploads photos and does site visits."]] as const;
const landingFor = (role: string) => demoRoles.find(([r]) => r === role)?.[2] ?? "/dashboard";
export type RunAction = (fn: () => Promise<unknown>, message: string) => Promise<void>;

export function Badge({children}: {children: React.ReactNode}) { return <span className="badge">{children}</span>; }
export function Empty({children}: {children: React.ReactNode}) { return <p className="empty">{children}</p>; }
export function Panel({title, children, aside}: {title: string; children: React.ReactNode; aside?: React.ReactNode}) { return <section className="panel"><div className="section-head"><h2>{title}</h2>{aside}</div>{children}</section>; }

export type TabSpec = { id: string; label: string; hint?: string; badge?: React.ReactNode; content: React.ReactNode };
/** One job per tab. Only the open tab is mounted, so a camera or timer in a closed tab stops. */
export function Tabs({ label, tabs, initial, variant = "page" }: { label: string; tabs: TabSpec[]; initial?: string; variant?: "page" | "sub" }) {
  const [open, setOpen] = useState(initial ?? tabs[0].id);
  const current = tabs.find(t => t.id === open) ?? tabs[0];
  const move = (e: React.KeyboardEvent, i: number) => {
    const next = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : -1;
    if (next < 0) return;
    e.preventDefault(); setOpen(tabs[next].id);
    requestAnimationFrame(() => document.getElementById(`tab-${tabs[next].id}`)?.focus());
  };
  return <div className={`tabs tabs-${variant}`}>
    <div className="tab-list" role="tablist" aria-label={label}>{tabs.map((t, i) => <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" aria-selected={t.id === current.id} aria-controls={`panel-${t.id}`} tabIndex={t.id === current.id ? 0 : -1} className={t.id === current.id ? "on" : ""} onClick={() => setOpen(t.id)} onKeyDown={e => move(e, i)}><strong>{t.label}{t.badge}</strong>{t.hint && <small>{t.hint}</small>}</button>)}</div>
    <div className="tab-panel" role="tabpanel" id={`panel-${current.id}`} aria-labelledby={`tab-${current.id}`}>{current.content}</div>
  </div>;
}
function LoopCrumb({ path }: { path: string }) {
  const at = loopSteps.findIndex(s => path.startsWith(s.url));
  if (at < 0) return null;
  return <nav className="loop-crumb" aria-label="Where this page sits in the loop"><span className="loop-crumb-title">Step {at + 1} of 4</span><ol>{loopSteps.map((s, i) => <li key={s.url} className={i === at ? "now" : i < at ? "past" : ""}><Link href={s.url} aria-current={i === at ? "step" : undefined}><b aria-hidden="true">{i + 1}</b><span>{s.name}<small>{s.note}</small></span></Link></li>)}</ol></nav>;
}

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
  // On phones the nav scrolls sideways; keep the current page in view.
  useEffect(() => { document.querySelector('.sidebar nav a[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" }); }, [path, loading, user]);
  if (loading) return <Splash />;
  if (!user) return <main className="login-page">
    <section className="login-hero" aria-label="About AedesLoop 360">
      <figure className="login-figure"><Image className="login-logo-big" src="/brand/aedesloop-360-logo.jpg" alt="AedesLoop 360: a drone circling a smart ovitrap in a loop" width={1024} height={1024} priority /><figcaption>Fig. 1 · The AedesLoop loop</figcaption></figure>
      <div className="login-copy">
        <h1>See the problem. Fix it together.</h1>
        <span className="login-rule" aria-hidden="true" />
        <p>Drone photos, ovitrap egg counts and the planning board, kept in one place.</p>
      </div>
      <ol className="login-steps" aria-label="How the loop works">
        <li><b>1</b><span><strong>Drone</strong> finds containers that may hold water</span></li>
        <li><b>2</b><span><strong>Ovitrap</strong> counts eggs for each collection interval</span></li>
        <li><b>3</b><span><strong>Dashboard</strong> plans the next round</span></li>
      </ol>
    </section>
    <section className="login-panel" aria-labelledby="login-title">
      <form className="login-card" onSubmit={e => { e.preventDefault(); void act(async () => { setUser(result(await api.POST("/api/v1/auth/login", {body: {username: role, password: `demo-${role}-360`}}))); if (role !== "coordinator") router.push(landingFor(role)); }, "Entered local demo"); }}>
        <div className="login-card-top"><span>Access</span><span className="login-live"><i aria-hidden="true" />Demo mode</span></div>
        <h2 id="login-title">Enter the demo as</h2>
        <div className="role-cards" role="radiogroup" aria-label="Demo role">
          {demoRoles.map(([r, label, , blurb]) => <label key={r} className="role-card" data-selected={role === r}>
            <input type="radio" name="demo-role" value={r} checked={role === r} onChange={() => setRole(r)} />
            <span className="role-card-dot" aria-hidden="true" />
            <span className="role-card-text"><span className="role-card-title">{label}</span><span className="role-card-blurb">{blurb}</span></span>
            <span className="role-card-no" aria-hidden="true">0{demoRoles.findIndex(d => d[0] === r) + 1}</span>
          </label>)}
        </div>
        <button type="submit" disabled={busy}>{busy ? "Entering…" : "Enter demo"}</button>
        {error && <p role="alert" className="error">{error}</p>}
        <small>Demo only. Fictional data, no real drones or chemicals.</small>
      </form>
      <p className="login-foot">Fictional township · Simulated drone · Human-approved actions</p>
    </section>
  </main>;
  const title = path.startsWith("/assets/") ? "Asset evidence" : navigation.find(item => item.url === path)?.label ?? "Dashboard";
  const shared = {user, act, version, busy};
  const canSwitchDemoRole = ["coordinator", "operator"].includes(user.role);
  const nextDemoRole = user.role === "coordinator" ? "operator" : "coordinator";
  return <div className="shell"><a className="skip" href="#content">Skip to content</a><aside className="sidebar"><Link className="brand" href="/dashboard"><LoopMark/><span>AedesLoop <strong>360</strong></span></Link><p className="workspace-label">Smart Mosquito Control</p><nav aria-label="Main navigation">{navGroups.map((g, gi) => <div className="nav-group" key={gi}>{g.label && <p className="nav-label">{g.label}</p>}{g.items.map(item => { const step = loopPages.indexOf(item); return <Link aria-current={path === item.url || (item.url === "/dashboard" && path === "/") ? "page" : undefined} key={item.url} href={item.url}><svg viewBox="0 0 24 24" aria-hidden="true">{item.icon}</svg><span className="nav-text">{item.label}{item.verb && <small aria-hidden="true">{item.verb}</small>}</span>{step >= 0 && <i className="nav-step" aria-hidden="true">{step + 1}</i>}</Link>; })}</div>)}</nav><div className="sidebar-footer"><span className="live-dot"/>Demo mode<p>Fictional town</p></div></aside><div className="main"><header className="topbar"><span>Operations workspace <span className="muted">/ {title}</span></span><div><Badge>{user.role}</Badge>{canSwitchDemoRole&&<button className="text-button" disabled={busy} onClick={() => void act(async () => { await api.POST("/api/v1/auth/logout"); setUser(result(await api.POST("/api/v1/auth/login", {body: {username: nextDemoRole, password: `demo-${nextDemoRole}-360`}}))); }, `Switched to ${nextDemoRole}`)}>Switch to {nextDemoRole}</button>}<button className="text-button" disabled={busy} onClick={() => void act(async () => { await api.POST("/api/v1/auth/logout"); setUser(null); }, "Signed out")}>Sign out</button></div></header><div className="mode-banner"><b>SIMULATED</b><span>Demo data. Not a dengue risk forecast.</span></div><main id="content" className="content"><div className="page-heading"><div><h1>{title}</h1><p>{blurbs[title] ?? ""}</p></div><div className="refresh-group"><time dateTime={updatedAt.toISOString()}>Updated {updatedAt.toLocaleTimeString("en-GB")}</time><button className="secondary" disabled={busy} onClick={bump}>Refresh data</button></div></div><LoopCrumb path={path} />{error && <div role="alert" className="error">{error}</div>}{notice && <div role="status" className="notice">{notice}</div>}<fieldset disabled={busy} className="workspace-fieldset">{(path === "/" || path === "/dashboard" || path === "/township") && <Overview {...shared} mapOnly={path === "/township"} />}{path.startsWith("/drone") && <Missions {...shared} />}{path === "/ovitraps" && <Ovitraps {...shared} />}{path === "/planning" && <Planning {...shared} />}{(path === "/operations" || path.startsWith("/assets/")) && <Operations {...shared} assetId={path.startsWith("/assets/") ? path.split("/")[2] : undefined} />}{path === "/settings" && <System {...shared} />}</fieldset><details className="disclaimer"><summary>How to read these numbers</summary><p>Egg counts are not adult mosquitoes, confirmed Aedes species, or dengue risk.<br/>A recorded action is not proof it worked. A reviewer verifies separately.</p></details></main></div></div>;
}

export type Shared = {user: Schema["LoginResponse"]; act: RunAction; version: number; busy: boolean};

function System({user, version}: Shared) {
  const [jobs, setJobs] = useState<Schema["JobRecord"][]>([]);
  const [audits, setAudits] = useState<Schema["AuditRecord"][]>([]);
  const [error, setError] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  useEffect(() => { let active = true; (async () => { try { const j = result(await api.GET("/api/v1/jobs")); const a = ["coordinator"].includes(user.role) ? result(await api.GET("/api/v1/audit")).data : []; if (active) {setJobs(j.data); setAudits(a);} } catch(e) { if(active) setError(String(e)); } })(); return () => {active=false;}; }, [version, user.role]);
  return <>{error && <p role="alert" className="error">{error}</p>}<Tabs label="Evidence and system" tabs={[
    { id: "audit", label: "Audit trail", hint: "Who did what, and when", content: <><Panel title="Append-only audit trail">{audits.length > 0 && <label className="audit-filter">Filter by action, entity or actor<input type="search" value={auditQuery} onChange={e => setAuditQuery(e.target.value)} placeholder="e.g. MISSION or user-operator"/></label>}{audits.length ? audits.filter(a => `${a.action} ${a.entity_id} ${a.actor_id}`.toLowerCase().includes(auditQuery.trim().toLowerCase())).map(a => <div className="list-row" key={a.id}><div><strong>{a.action.replaceAll("_", " ")}</strong><small>{a.entity_id} · {a.actor_id}</small></div><time>{new Date(a.created_at).toISOString()}</time></div>) : <Empty>{["coordinator"].includes(user.role) ? "No recorded actions yet." : "Audit viewing requires the coordinator role."}</Empty>}</Panel></> },
    { id: "jobs", label: "Worker jobs", hint: "Background simulation runs", badge: jobs.length ? <em className="tab-count">{jobs.length}</em> : undefined, content: <><Panel title="Durable worker jobs">{jobs.length ? jobs.map(j => <div className="list-row" key={j.id}><span>{j.mission_id}</span><Badge>{j.status} · step {j.cursor}</Badge>{j.error && <span>{j.error}</span>}</div>) : <Empty>No simulation jobs queued.</Empty>}</Panel></> },
    { id: "about", label: "What is real", hint: "Adapters and demo reset", content: <><Panel title="Adapters & deployment"><dl className="facts"><dt>Drone</dt><dd>Simulation only · hardware not connected</dd><dt>Vision</dt><dd>Pre-annotated demo data</dd><dt>Egg counting</dt><dd>Human-labelled demo images</dd><dt>Location</dt><dd>Fictional map</dd></dl><details className="fold"><summary>Reset the demo</summary><p>Stop services, set a fresh AEDES_DATABASE_URL, then migrate and seed. Old audit history stays in the previous database.</p></details></Panel></> },
  ]} /></>;
}
