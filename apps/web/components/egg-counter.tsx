"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { api, result, type Schema } from "../lib/api";
import { Badge, Empty, Panel, type Shared } from "./workspace";

type Proposal = Schema["EggAnalysisRecord"];
type Confirmation = Schema["EggConfirmationInput"];
const utc = (value: string) => new Date(value).toISOString();

export function EggCounter({ trapId, user, act, version, busy }: Shared & { trapId: string }) {
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
  return <Panel title="Review an egg image" aside={<Badge>IMPORTED · human confirmation required</Badge>}>
    <p>Attach an externally imported image to this fictional demo trap. A proposed count does not enter surveillance until a reviewer confirms a unique collection interval. This is not a local field observation or a species or dengue-risk assessment.</p>
    {canReview && <form onSubmit={e => { e.preventDefault(); void act(async () => {
      if (!file || !validRegion || !regionChecked) throw new Error("Select an image and verify its substrate region.");
      if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error("Choose a PNG or JPEG no larger than 5 MB.");
      result(await api.POST("/api/v1/ovitraps/{trap_id}/egg-analyses", {
        params: { path: { trap_id: trapId }, header: { "Idempotency-Key": uploadKey } },
        body: { file: file.name, rights, captured_at: utc(captured), roi: JSON.stringify(roi.map(v => v / 100)) },
        bodySerializer: body => { const form = new FormData(); for (const [name, value] of Object.entries(body)) form.set(name, name === "file" ? file : value); return form; },
      }));
    }, "Image analysis persisted. Review its status before confirming a collection interval."); }}>
      <div className="form-grid">
        <label>Egg image · PNG / JPEG · maximum 5 MB<input type="file" accept="image/png,image/jpeg" required onChange={e => { const selectedFile = e.target.files?.[0] ?? null; setFile(selectedFile); setPreview(selectedFile ? URL.createObjectURL(selectedFile) : ""); setRegionChecked(false); setUploadKey(crypto.randomUUID()); }} /></label>
        <label>Image rights / permission<input required minLength={5} value={rights} onChange={e => { setRights(e.target.value); setUploadKey(crypto.randomUUID()); }} /></label>
        <label>Image captured · your local time (saved in UTC)<input type="datetime-local" required value={captured} onChange={e => { setCaptured(e.target.value); setUploadKey(crypto.randomUUID()); }} /></label>
      </div>
      <p>Select the complete egg-bearing substrate. Exclude handwritten counts, labels, QR codes and background. The outlined region is the exact area submitted; percentages refer to the original image.</p>
      {preview && <div style={{ position: "relative", width: "fit-content", maxWidth: "100%" }}><img src={preview} alt="Selected egg image with substrate region outlined" style={{ display: "block", maxWidth: "100%", maxHeight: 480 }} />{validRegion && <div aria-hidden="true" style={{ position: "absolute", pointerEvents: "none", border: "3px solid var(--orange, #ff5a1f)", left: `${roi[0]}%`, top: `${roi[1]}%`, width: `${roi[2] - roi[0]}%`, height: `${roi[3] - roi[1]}%` }} />}</div>}
      <div className="form-grid">{["Left", "Top", "Right", "Bottom"].map((label, index) => <label key={label}>Region {label.toLowerCase()} · %<input type="number" min={0} max={100} step="0.1" required value={roi[index]} onChange={e => { setRoi(old => old.map((v, i) => i === index ? Number(e.target.value) : v)); setRegionChecked(false); setUploadKey(crypto.randomUUID()); }} /></label>)}</div>
      {!validRegion && <p role="alert" className="error">Right and bottom must exceed left and top, within 0–100%.</p>}
      <label><input type="checkbox" required checked={regionChecked} onChange={e => setRegionChecked(e.target.checked)} /> I checked that the outlined region includes the complete substrate and excludes answer labels and QR codes.</label>
      <button disabled={busy || !file || !validRegion || !regionChecked}>Analyze egg image</button>
    </form>}
    {loading && <p role="status">Loading persisted egg analyses…</p>}
    {error && <div role="alert" className="error">{error} <button type="button" className="secondary" onClick={() => { setLoading(true); setRetry(v => v + 1); }}>Retry analyses</button></div>}
    {!loading && !error && !proposals.length && <Empty>No egg images analyzed for this trap. Missing estimates are not zero eggs.</Empty>}
    {proposals.map(proposal => <details key={proposal.id} open={!proposal.confirmed_sample_id}><summary>{proposal.status} · {proposal.proposed_count == null ? "Count unavailable" : `${proposal.proposed_count} proposed eggs`} · {proposal.confirmed_sample_id ? "confirmed" : "not surveillance"}</summary>
      <div className="sample-detail"><img src={`/api/v1/media/${proposal.media_id}`} alt={`Imported egg substrate for analysis ${proposal.id}`} /><dl className="facts"><dt>Model</dt><dd>{proposal.model_version ?? "Unavailable"}</dd><dt>Mode</dt><dd>{proposal.mode}</dd><dt>Region · normalized</dt><dd>{JSON.stringify(proposal.roi)}</dd><dt>Analysis reason</dt><dd>{proposal.reason ?? "No reason supplied"}</dd><dt>Analysis details</dt><dd><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(proposal.details, null, 2)}</pre></dd><dt>Confirmed sample</dt><dd>{proposal.confirmed_sample_id ?? "None — proposal only"}</dd></dl></div>
      {canReview && proposal.status === "ESTIMATED" && !proposal.confirmed_sample_id && <ConfirmAnalysis proposal={proposal} act={act} busy={busy} />}
    </details>)}
  </Panel>;
}

function ConfirmAnalysis({ proposal, act, busy }: { proposal: Proposal; act: Shared["act"]; busy: boolean }) {
  const [body, setBody] = useState<Confirmation>({ source_sample_id: "", substrate_id: "", interval_start: "", interval_end: "", collected_at: "", sampling_effort_days: 7, quality: "GOOD", accepted_egg_count: proposal.proposed_count ?? 0, reason: "" });
  const [idempotency, setIdempotency] = useState("");
  function update<K extends keyof Confirmation>(name: K, value: Confirmation[K]) { setBody(old => ({ ...old, [name]: value })); setIdempotency(crypto.randomUUID()); }
  return <form onSubmit={e => { e.preventDefault(); void act(async () => result(await api.POST("/api/v1/egg-analyses/{analysis_id}/confirm", { params: { path: { analysis_id: proposal.id }, header: { "Idempotency-Key": idempotency } }, body: { ...body, interval_start: utc(body.interval_start), interval_end: utc(body.interval_end), collected_at: utc(body.collected_at) } })), "Reviewed imported interval saved with count and model provenance."); }}>
    <p>Check the image and correct the estimate if needed. Use the identity of the actual physical substrate so repeat photographs cannot become new collections.</p>
    <div className="form-grid">
      <label>Reviewed source sample ID<input required value={body.source_sample_id} onChange={e => update("source_sample_id", e.target.value)} /></label>
      <label>Reviewed physical substrate ID<input required value={body.substrate_id} onChange={e => update("substrate_id", e.target.value)} /></label>
      {(["interval_start", "interval_end", "collected_at"] as const).map(name => <label key={name}>{name.replaceAll("_", " ")} · UTC<input type="datetime-local" required value={body[name]} onChange={e => update(name, e.target.value)} /></label>)}
      <label>Sampling effort · days<input type="number" required min="0.01" step="0.01" value={body.sampling_effort_days} onChange={e => update("sampling_effort_days", Number(e.target.value))} /></label>
      <label>Accepted human-reviewed egg count<input type="number" required min={0} max={10000} value={body.accepted_egg_count} onChange={e => update("accepted_egg_count", Number(e.target.value))} /></label>
      <label>Reviewed image quality<select value={body.quality} onChange={e => update("quality", e.target.value as Confirmation["quality"])}><option>GOOD</option><option>BLURRED</option><option>OCCLUDED</option></select></label>
      <label>Review / correction reason<input required minLength={8} value={body.reason} onChange={e => update("reason", e.target.value)} /></label>
    </div><button disabled={busy}>Confirm reviewed imported interval</button>
  </form>;
}
