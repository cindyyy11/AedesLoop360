"use client";
import { useEffect, useState } from "react";
import { api, result, type Schema } from "../lib/api";
import { Badge, Empty, type Shared } from "./workspace";
import { ResultCard } from "./egg-counter";

type Proposal = Schema["EggAnalysisRecord"];
type Skip = Schema["TrapPassSkip"];
const REFRESH_MS = 5000;

export function DroneInbox({ traps, user, act, version, busy }: Shared & { traps: Schema["TrapRecord"][] }) {
  const [items, setItems] = useState<Proposal[]>([]);
  const [skipped, setSkipped] = useState<Skip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [lastPass, setLastPass] = useState("");
  const canFly = ["operator", "coordinator"].includes(user.role);
  const canReview = ["reviewer", "coordinator"].includes(user.role);
  const names = new Map(traps.map(t => [t.id, t.name]));

  useEffect(() => {
    let active = true;
    const load = () => api.GET("/api/v1/egg-analyses/inbox").then(response => {
      const data = result(response).data;
      if (active) { setItems(data); setError(""); }
    }).catch(e => { if (active) setError(String(e)); }).finally(() => { if (active) setLoading(false); });
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => { active = false; clearInterval(timer); };
  }, [version, retry]);

  return <section className="panel" aria-labelledby="inbox-title">
    <div className="section-head"><h2 id="inbox-title">Drone inbox</h2><Badge>SIMULATED · human confirmation required</Badge></div>
    <p className="muted">A simulated pass photographs each reporting trap and queues a proposed count here. No aircraft is flown. Offline traps are skipped, never counted as zero. Nothing becomes surveillance data until a reviewer confirms it.</p>
    {canFly ? <form onSubmit={e => { e.preventDefault(); void act(async () => {
      const ids = traps.map(t => t.id).slice(0, 8);
      const pass = result(await api.POST("/api/v1/drones/trap-passes", { params: { header: { "Idempotency-Key": crypto.randomUUID() } }, body: { trap_ids: ids } })).data;
      setSkipped(pass.skipped);
      setLastPass(`${pass.analyses.length} photographed, ${pass.skipped.length} skipped`);
    }, "Simulated pass complete. Proposals are waiting in the inbox."); }}>
      <button className="cta" disabled={busy || traps.length === 0}>Run simulated trap pass</button>
      {lastPass && <p role="status">Last pass: {lastPass}</p>}
    </form> : <Empty>Only the drone operator or coordinator can start a simulated pass.</Empty>}
    {skipped.length > 0 && <ul className="history" aria-label="Skipped traps">{skipped.map(s => <li key={s.trap_id}><span><strong>{names.get(s.trap_id) ?? s.trap_id} · DATA_UNAVAILABLE</strong><small>{s.reason}</small></span></li>)}</ul>}
    <h3>Waiting for review ({items.length})</h3>
    {loading && <p role="status">Loading the inbox…</p>}
    {error && <div role="alert" className="error">{error} <button type="button" className="secondary" onClick={() => setRetry(v => v + 1)}>Retry inbox</button></div>}
    {!loading && !error && items.length === 0 && <Empty>The inbox is empty. Proposals from simulated passes and uploads appear here, refreshed every few seconds.</Empty>}
    <div className="inbox-list">{items.map(p => <article key={p.id} className="inbox-item" aria-label={`Proposal ${p.id}`}>
      <header><strong>{names.get(p.trap_id) ?? p.trap_id}</strong><Badge>{p.source}</Badge></header>
      <ResultCard proposal={p} canReview={canReview} act={act} busy={busy} />
    </article>)}</div>
    {!canReview && items.length > 0 && <p className="muted">Reviewers and coordinators confirm proposals.</p>}
  </section>;
}
