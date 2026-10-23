"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { api, result, type Schema } from "../lib/api";
import { Badge, Empty, Panel, type Shared } from "./workspace";
import { EggLive } from "./egg-live";

type Proposal = Schema["EggAnalysisRecord"];
type Confirmation = Schema["EggConfirmationInput"];
const utc = (value: string) => new Date(value).toISOString();
// Fields labelled "UTC" hold the digits the reviewer typed, not a local time.
const asUtc = (value: string) => new Date(`${value}${value.length === 16 ? ":00" : ""}Z`).toISOString();
const round1 = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;

export function EggCounter({ trapId, trapName, user, act, version, busy }: Shared & { trapId: string; trapName: string }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [rights, setRights] = useState("");
  const [captured, setCaptured] = useState("");
  const [roi, setRoi] = useState([0, 0, 100, 100]);
  const [regionChecked, setRegionChecked] = useState(false);
  const [uploadKey, setUploadKey] = useState("");
  const [retry, setRetry] = useState(0);
  const [liveOpen, setLiveOpen] = useState(false);
  const [mountedAt] = useState(() => new Date().toISOString());
  const drag = useRef<{ x: number; y: number } | null>(null);
  const canReview = ["reviewer", "coordinator"].includes(user.role);
  const validRegion = roi.every(Number.isFinite) && roi[0] >= 0 && roi[1] >= 0 && roi[2] <= 100 && roi[3] <= 100 && roi[2] > roi[0] && roi[3] > roi[1];
  useEffect(() => {
    let active = true;
    api.GET("/api/v1/ovitraps/{trap_id}/egg-analyses", { params: { path: { trap_id: trapId } } }).then(response => {
      const data = result(response).data;
      if (active) { setProposals(data); setError(""); }
    }).catch(e => { if (active) setError(String(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [trapId, version, retry]);
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  const latest = [...proposals].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  // Progress reflects this visit only; earlier results stay visible in the result column.
  const fresh = !!latest && latest.created_at > mountedAt;
  const older = proposals.filter(p => p.id !== latest?.id);
  const steps = [
    { label: "Add photo", hint: "A picture of the egg paddle", done: !!file || fresh },
    { label: "Mark the paddle", hint: "Drag a box around it", done: (!!file && regionChecked) || fresh },
    { label: "Model counts", hint: "A proposed egg count", done: fresh && latest.status === "ESTIMATED" },
    { label: "Reviewer confirms", hint: "Becomes a dated interval", done: fresh && !!latest.confirmed_sample_id },
  ];
  const current = steps.findIndex(s => !s.done);

  function takeLiveFrame(frame: File, region: number[]) {
    setFile(frame); setPreview(URL.createObjectURL(frame)); setRoi(region); setRegionChecked(false);
    setUploadKey(crypto.randomUUID()); setLiveOpen(false);
  }
  function changeRegion(next: number[]) { setRoi(next); setRegionChecked(false); setUploadKey(crypto.randomUUID()); }
  function pointer(e: React.PointerEvent<HTMLDivElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: round1(((e.clientX - box.left) / box.width) * 100), y: round1(((e.clientY - box.top) / box.height) * 100) };
  }

  return <section className="panel counter" aria-labelledby="counter-title">
    <div className="section-head"><h2 id="counter-title">Count eggs from a photo · {trapName}</h2><Badge>IMPORTED · human confirmation required</Badge></div>
    <ol className="stepper" aria-label="Egg counting progress">{steps.map((s, i) => <li key={s.label} className={s.done ? "done" : i === current ? "current" : ""} aria-current={i === current ? "step" : undefined}><b>{s.done ? "✓" : i + 1}</b><span><strong>{s.label}</strong><small>{s.hint}</small></span></li>)}</ol>
    <div className="counter-grid">
      <div className="counter-input">
        <div className="roi-actions"><button type="button" className="secondary" aria-expanded={liveOpen} onClick={() => setLiveOpen(v => !v)}>{liveOpen ? "Close live preview" : "Aim a camera (live preview)"}</button></div>
        {liveOpen && <EggLive trapId={trapId} trapName={trapName} canCapture={canReview} onCapture={takeLiveFrame} />}
        <h3>1 · Photo and paddle area</h3>
        {canReview ? <form onSubmit={e => { e.preventDefault(); void act(async () => {
          if (!file || !validRegion || !regionChecked) throw new Error("Select an image and verify its substrate region.");
          if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose a PNG or JPEG no larger than 5 MB.");
          result(await api.POST("/api/v1/ovitraps/{trap_id}/egg-analyses", {
            params: { path: { trap_id: trapId }, header: { "Idempotency-Key": uploadKey } },
            body: { file: file.name, rights, captured_at: utc(captured), roi: JSON.stringify(roi.map(v => v / 100)) },
            bodySerializer: body => { const form = new FormData(); for (const [name, value] of Object.entries(body)) form.set(name, name === "file" ? file : value); return form; },
          }));
        }, "Image analysis persisted. Review its status before confirming a collection interval."); }}>
          {!preview && <label className="dropzone"><span className="dz-icon" aria-hidden="true">＋</span><strong>Choose an egg photo</strong><small>PNG or JPEG, up to 5 MB</small>
            <input type="file" accept="image/png,image/jpeg" required onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); setPreview(f ? URL.createObjectURL(f) : ""); setRegionChecked(false); setRoi([0, 0, 100, 100]); setUploadKey(crypto.randomUUID()); }} /></label>}
          {preview && <>
            <div className="roi-stage" style={{ touchAction: "none" }}
              onPointerDown={e => { const p = pointer(e); drag.current = p; e.currentTarget.setPointerCapture(e.pointerId); changeRegion([p.x, p.y, Math.min(100, p.x + 0.1), Math.min(100, p.y + 0.1)]); }}
              onPointerMove={e => { if (!drag.current) return; const p = pointer(e); const s = drag.current; changeRegion([Math.min(s.x, p.x), Math.min(s.y, p.y), Math.max(s.x, p.x), Math.max(s.y, p.y)]); }}
              onPointerUp={() => { drag.current = null; }}>
              <img src={preview} alt="Selected egg image. Drag on it to outline the paddle." draggable={false} />
              {validRegion && <div aria-hidden="true" className="roi-box" style={{ left: `${roi[0]}%`, top: `${roi[1]}%`, width: `${roi[2] - roi[0]}%`, height: `${roi[3] - roi[1]}%` }}><span>Counted area</span></div>}
            </div>
            <p className="roi-help"><strong>Drag on the photo</strong> to outline the whole paddle. Leave out handwriting, labels, QR codes and background.</p>
            <div className="roi-actions"><button type="button" className="secondary" onClick={() => changeRegion([0, 0, 100, 100])}>Use whole image</button><button type="button" className="secondary" onClick={() => { setFile(null); setPreview(""); setRegionChecked(false); }}>Choose another photo</button></div>
            <details className="fold"><summary>Fine-tune the area (percent of the photo)</summary>
              <div className="form-grid">{["Left", "Top", "Right", "Bottom"].map((label, index) => <label key={label}>{label} · %<input type="number" min={0} max={100} step="0.1" required value={roi[index]} onChange={e => changeRegion(roi.map((v, i) => i === index ? Number(e.target.value) : v))} /></label>)}</div>
            </details>
            {!validRegion && <p role="alert" className="error">Right and bottom must exceed left and top, within 0–100%.</p>}
            <div className="form-grid">
              <label>Image rights / permission<input required minLength={5} placeholder="e.g. own photo, CC BY 4.0" value={rights} onChange={e => { setRights(e.target.value); setUploadKey(crypto.randomUUID()); }} /></label>
              <label>Photo taken · your local time<input type="datetime-local" required value={captured} onChange={e => { setCaptured(e.target.value); setUploadKey(crypto.randomUUID()); }} /></label>
            </div>
            <label className="check"><input type="checkbox" required checked={regionChecked} onChange={e => setRegionChecked(e.target.checked)} /> The box covers the whole paddle and excludes labels and QR codes.</label>
            <button className="cta" disabled={busy || !file || !validRegion || !regionChecked}>Count eggs in this area</button>
          </>}
        </form> : <Empty>Only reviewers and coordinators can upload photos. You can still read results on the right.</Empty>}
      </div>

      <div className="counter-result" aria-live="polite">
        <h3>2 · Result</h3>
        {loading && <p role="status">Loading persisted egg analyses…</p>}
        {error && <div role="alert" className="error">{error} <button type="button" className="secondary" onClick={() => { setLoading(true); setRetry(v => v + 1); }}>Retry analyses</button></div>}
        {!loading && !error && !latest && <div className="result-empty"><b aria-hidden="true">?</b><p><strong>No photo counted for {trapName} yet.</strong> The count appears here as soon as you analyse one. Missing estimates are not zero eggs.</p></div>}
        {latest && <ResultCard key={latest.id} proposal={latest} canReview={canReview} act={act} busy={busy} />}
        {older.length > 0 && <details className="fold"><summary>Earlier photos for this trap ({older.length})</summary>
          <ul className="history">{older.map(p => <li key={p.id}><img src={`/api/v1/media/${p.media_id}`} alt={`Earlier egg photo ${p.id}`} /><span><strong>{p.proposed_count == null ? "Count unavailable" : `${p.proposed_count} eggs proposed`}</strong><small>{p.status} · {p.confirmed_sample_id ? "confirmed" : "not surveillance"} · {p.created_at.slice(0, 10)}</small></span></li>)}</ul>
        </details>}
      </div>
    </div>
    <p className="muted">A proposed count is not surveillance data until a reviewer confirms it as a unique collection interval. It is not a species, adult-population or dengue-risk assessment.</p>
  </section>;
}

export function ResultCard({ proposal, canReview, act, busy }: { proposal: Proposal; canReview: boolean; act: Shared["act"]; busy: boolean }) {
  const confirmed = !!proposal.confirmed_sample_id;
  const [l, t, r, b] = proposal.roi;
  const ok = proposal.status === "ESTIMATED";
  return <div className={`result-card${confirmed ? " confirmed" : ""}`}>
    <div className="result-photo"><img src={`/api/v1/media/${proposal.media_id}`} alt={`Imported egg substrate for analysis ${proposal.id}`} />
      {proposal.roi.length === 4 && <div aria-hidden="true" className="roi-box" style={{ left: `${l * 100}%`, top: `${t * 100}%`, width: `${(r - l) * 100}%`, height: `${(b - t) * 100}%` }}><span>Counted area</span></div>}</div>
    <div className="result-number"><b>{proposal.proposed_count ?? "—"}</b><span>{proposal.proposed_count == null ? "count unavailable" : "eggs proposed by the model"}</span></div>
    <div className="result-state"><Badge>{proposal.status}</Badge><Badge>{confirmed ? "CONFIRMED" : "NOT SURVEILLANCE YET"}</Badge></div>
    {confirmed && <p>Confirmed by a reviewer as <strong>{proposal.accepted_count}</strong> eggs. It now appears as an interval in the trap chart below.</p>}
    {!confirmed && ok && <p><strong>Next:</strong> check the count against the photo, then confirm it below to add it to this trap&apos;s history.</p>}
    {!ok && <p className="warning">{proposal.reason ?? "The model could not give a trustworthy count. Retake the photo or count by hand."}</p>}
    <details className="fold"><summary>Model details</summary><dl className="facts"><dt>Model</dt><dd>{proposal.model_version ?? "Unavailable"}</dd><dt>Mode</dt><dd>{proposal.mode}</dd><dt>Region</dt><dd>{JSON.stringify(proposal.roi)}</dd><dt>Reason</dt><dd>{proposal.reason ?? "None supplied"}</dd><dt>Sample</dt><dd>{proposal.confirmed_sample_id ?? "None — proposal only"}</dd></dl><pre className="raw">{JSON.stringify(proposal.details, null, 2)}</pre></details>
    {canReview && ok && !confirmed && <ConfirmAnalysis proposal={proposal} act={act} busy={busy} />}
  </div>;
}

function ConfirmAnalysis({ proposal, act, busy }: { proposal: Proposal; act: Shared["act"]; busy: boolean }) {
  const [body, setBody] = useState<Confirmation>({ source_sample_id: "", substrate_id: "", interval_start: "", interval_end: "", collected_at: "", sampling_effort_days: 7, quality: "GOOD", accepted_egg_count: proposal.proposed_count ?? 0, reason: "" });
  const [idempotency, setIdempotency] = useState("");
  function update<K extends keyof Confirmation>(name: K, value: Confirmation[K]) { setBody(old => ({ ...old, [name]: value })); setIdempotency(crypto.randomUUID()); }
  return <form className="confirm-form" onSubmit={e => { e.preventDefault(); void act(async () => result(await api.POST("/api/v1/egg-analyses/{analysis_id}/confirm", { params: { path: { analysis_id: proposal.id }, header: { "Idempotency-Key": idempotency } }, body: { ...body, interval_start: asUtc(body.interval_start), interval_end: asUtc(body.interval_end), collected_at: asUtc(body.collected_at) } })), "Reviewed imported interval saved with count and model provenance."); }}>
    <h3>3 · Confirm the count</h3>
    <label className="big-count">Eggs you accept (edit if the model is wrong)<input type="number" required min={0} max={10000} value={body.accepted_egg_count} onChange={e => update("accepted_egg_count", Number(e.target.value))} /></label>
    <div className="form-grid">
      <label>Collection period starts · UTC<input type="datetime-local" required value={body.interval_start} onChange={e => update("interval_start", e.target.value)} /></label>
      <label>Collection period ends · UTC<input type="datetime-local" required value={body.interval_end} onChange={e => update("interval_end", e.target.value)} /></label>
      <label>Collected at · UTC<input type="datetime-local" required value={body.collected_at} onChange={e => update("collected_at", e.target.value)} /></label>
      <label>Days the paddle was out<input type="number" required min="0.01" step="0.01" value={body.sampling_effort_days} onChange={e => update("sampling_effort_days", Number(e.target.value))} /></label>
      <label>Photo quality<select value={body.quality} onChange={e => update("quality", e.target.value as Confirmation["quality"])}><option>GOOD</option><option>BLURRED</option><option>OCCLUDED</option></select></label>
      <label>Why you accept or changed it<input required minLength={8} value={body.reason} onChange={e => update("reason", e.target.value)} /></label>
    </div>
    <div className="form-grid">
      <label>Sample ID<input required value={body.source_sample_id} onChange={e => update("source_sample_id", e.target.value)} /></label>
      <label>Physical paddle ID (stops double counting)<input required value={body.substrate_id} onChange={e => update("substrate_id", e.target.value)} /></label>
    </div>
    <button className="cta" disabled={busy}>Confirm and add to trap history</button>
  </form>;
}
