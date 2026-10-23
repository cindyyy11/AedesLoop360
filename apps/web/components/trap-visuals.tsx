"use client";
import type { Schema } from "../lib/api";
import { Badge, Panel } from "./workspace";

type Trap = Schema["TrapRecord"];
type Sample = Schema["SampleRecord"];

export const DAY = 864e5;
const attention: Record<string, string> = {
  STALE: "No recent signal. Check power and connectivity.",
  SERVICING_DUE: "Service overdue. Record a field visit.",
  UNSAFE: "Safety design not verified.",
  OFFLINE: "Offline. Block data is unavailable, not low risk.",
};
const rank = (status: string) => (status === "ACTIVE" ? 1 : 0);
export const ago = (now: number, iso: string) => {
  const d = Math.floor((now - Date.parse(iso)) / DAY);
  return d <= 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
};
const short = (iso: string) => iso.slice(5, 10);

export function FlowStrip() {
  return <p className="flow-lede" role="note"><strong>Photo in, checked egg count out.</strong> Pick a trap, then add a count.</p>;
}

export function SummaryStrip({ traps, current, ordered, cadence, overdueDays }: { traps: Trap[]; current?: Trap; ordered: Sample[]; cadence: number; overdueDays: number | null }) {
  const reporting = traps.filter(t => t.effective_status === "ACTIVE").length;
  const valid = ordered.filter(s => s.validity === "VALID");
  const latest = valid[valid.length - 1];
  const prev = valid[valid.length - 2];
  const gapDays = latest && prev ? (Date.parse(latest.interval_start) - Date.parse(prev.interval_end)) / DAY : Infinity;
  const consecutive = gapDays <= cadence * 0.5;
  const delta = latest && prev && consecutive ? latest.egg_count - prev.egg_count : null;
  const stale = overdueDays !== null && overdueDays > cadence * 1.5;
  return <div className="trap-strip">
    <div><small>Devices reporting</small><b>{reporting}<i> / {traps.length}</i></b><em>{traps.length - reporting ? `${traps.length - reporting} need attention` : "all reporting"}</em></div>
    <div><small>Selected trap</small><b className="strip-name">{current?.name ?? "—"}</b><em>{current?.effective_status ?? "no data"}</em></div>
    <div><small>Latest valid count</small><b>{latest ? latest.egg_count : "—"}<i> eggs</i></b><em>{latest ? `${latest.sampling_effort_days} day interval` : "no valid interval"}</em></div>
    <div><small>Change vs previous</small><b>{delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}</b><em>{delta === null ? (prev ? "gap since previous interval" : "needs two valid intervals") : "eggs only, not risk"}</em></div>
    <div className={stale ? "strip-warn" : ""}><small>Last sample ended</small><b>{overdueDays === null ? "—" : overdueDays}<i> days ago</i></b><em>{stale ? `overdue · expected every ${cadence}` : `expected every ${cadence} days`}</em></div>
  </div>;
}

export function TrapTiles({ traps, now, selected, onSelect }: { traps: Trap[]; now: number; selected: string; onSelect: (id: string) => void }) {
  if (!traps.length) return null;
  const blocks = [...new Set(traps.map(t => t.block_id))].sort();
  const reporting = traps.filter(t => t.effective_status === "ACTIVE").length;
  return <Panel title="Trap health · pick a trap" aside={<Badge>{reporting} of {traps.length} reporting</Badge>}>
    <div className="tile-legend" aria-hidden="true"><span className="ok">Reporting</span><span className="bad">Needs action</span><span className="sel">Selected</span></div>
    <div className="health-board">{blocks.map(block => {
      const inBlock = traps.filter(t => t.block_id === block).sort((a, b) => rank(a.effective_status) - rank(b.effective_status) || a.name.localeCompare(b.name));
      const ok = inBlock.filter(t => t.effective_status === "ACTIVE").length;
      return <section key={block} className={ok === 0 ? "health-block unavailable" : "health-block"} aria-label={`${block} trap health`}>
        <h3>{block}<small>{ok === 0 ? "DATA_UNAVAILABLE" : `${ok} / ${inBlock.length} reporting`}</small></h3>
        <div className="trap-tiles">{inBlock.map(t => {
          const good = t.effective_status === "ACTIVE";
          return <button key={t.id} type="button" aria-pressed={t.id === selected} className={`trap-tile ${good ? "ok" : "bad"}${t.id === selected ? " sel" : ""}`} onClick={() => onSelect(t.id)}>
            <span className="tile-top"><i aria-hidden="true" className="dot" /><strong>{t.name}</strong></span>
            <span className="tile-status">{t.effective_status}</span>
            <small>Signal {ago(now, t.heartbeat_at)}</small>
            <small>Serviced {ago(now, t.serviced_at)}</small>
            {attention[t.effective_status] && <small className="action">{attention[t.effective_status]}</small>}
          </button>;
        })}</div>
      </section>;
    })}</div>
    <p className="muted">A block with no reporting trap is DATA_UNAVAILABLE, never low risk.</p>
  </Panel>;
}

const niceMax = (v: number) => { if (v <= 5) return 5; const p = 10 ** Math.floor(Math.log10(v)); const m = v / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };

export function IntervalTimeline({ ordered, cadence, now, activeId, onSelect }: { ordered: Sample[]; cadence: number; now: number; activeId: string; onSelect: (id: string) => void }) {
  const W = 760, H = 280, L = 44, R = 14, T = 22, B = 40;
  const starts = ordered.map(s => Date.parse(s.interval_start));
  const ends = ordered.map(s => Date.parse(s.interval_end));
  const lastEnd = Math.max(...ends);
  const overdue = (now - lastEnd) / DAY > cadence * 1.5;
  const t1 = Math.max(lastEnd + cadence * DAY * 0.5, now);
  const t0 = Math.min(Math.min(...starts) - cadence * DAY * 0.5, t1 - cadence * DAY * 5);
  const span = t1 - t0;
  const x = (t: number) => L + ((t - t0) / span) * (W - L - R);
  const top = niceMax(Math.max(...ordered.map(s => s.egg_count), 1));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(top * f));
  const labelled = new Set<string>();
  let lastLabel = -99;
  for (const s of ordered) { const c = (x(Date.parse(s.interval_start)) + x(Date.parse(s.interval_end))) / 2; if (c - lastLabel > 46) { labelled.add(s.id); lastLabel = c; } }
  return <figure className="timeline">
    <div className="timeline-scroll"><svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Eggs per collection interval, plotted on a real time axis. Blank stretches are missing evidence, not zero eggs.">
      <defs><pattern id="hatch-invalid" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#d9d4bd" /><rect width="4" height="8" fill="#a09c86" /></pattern>
        <pattern id="hatch-gap" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#fff4ee" /><rect width="1.5" height="8" fill="#ff5a1f" opacity="0.55" /></pattern></defs>
      {ticks.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="tl-grid" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="tl-axis">{v}</text></g>)}
      <text x={L} y={12} className="tl-axis">eggs per interval</text>
      {ordered.map((s, i) => {
        if (i === 0) return null;
        const a = Date.parse(ordered[i - 1].interval_end), b = Date.parse(s.interval_start);
        if ((b - a) / DAY <= cadence * 0.5) return null;
        const w = x(b) - x(a);
        return <g key={`gap-${s.id}`}><rect x={x(a)} y={T} width={w} height={H - T - B} fill="url(#hatch-gap)" stroke="#ff5a1f" strokeDasharray="4 3" />
          {w > 70 && <text x={x(a) + w / 2} y={T + 16} textAnchor="middle" className="tl-gap">NO SAMPLE</text>}
          {w > 70 && <text x={x(a) + w / 2} y={T + 30} textAnchor="middle" className="tl-gap-sub">not zero</text>}</g>;
      })}
      {overdue && <g><rect x={x(lastEnd)} y={T} width={x(now) - x(lastEnd)} height={H - T - B} fill="url(#hatch-gap)" stroke="#ff5a1f" strokeDasharray="4 3" />
        {x(now) - x(lastEnd) > 60 && <text x={(x(lastEnd) + x(now)) / 2} y={T + 16} textAnchor="middle" className="tl-gap">OVERDUE</text>}
        <text x={x(now)} y={H - B + 28} textAnchor="end" className="tl-axis">today</text></g>}
      {ordered.map(s => {
        const x0 = x(Date.parse(s.interval_start)), x1 = x(Date.parse(s.interval_end));
        const w = Math.max(x1 - x0 - 3, 8), cx = x0 + (x1 - x0) / 2;
        const active = s.id === activeId, valid = s.validity === "VALID";
        const label = `${s.interval_start.slice(0, 10)} to ${s.interval_end.slice(0, 10)}: ${s.egg_count} eggs, ${s.validity}, ${s.sampling_effort_days} day effort. Select for evidence.`;
        const showLabel = labelled.has(s.id);
        return <g key={s.id} role="button" tabIndex={0} aria-pressed={active} aria-label={label} className={`tl-bar${active ? " active" : ""}`} onClick={() => onSelect(s.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(s.id); } }}>
          <title>{label}</title>
          <rect x={x0 + 1.5} y={Math.min(y(s.egg_count), H - B - 1)} width={w} height={Math.max(H - B - y(s.egg_count), 1)} fill={valid ? "var(--blue-deep)" : "url(#hatch-invalid)"} stroke={active ? "var(--ink)" : valid ? "none" : "#7d7a68"} strokeWidth={active ? 3 : 1} />
          <text x={cx} y={y(s.egg_count) - 6} textAnchor="middle" className="tl-value">{s.egg_count}</text>
          {showLabel && <text x={cx} y={H - B + 16} textAnchor="middle" className="tl-axis">{short(s.interval_end)}</text>}
        </g>;
      })}
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="tl-base" />
      <text x={W - R} y={H - 4} textAnchor="end" className="tl-axis">interval end date (UTC) · bar width = days sampled</text>
    </svg></div>
    <figcaption className="tl-legend"><span><i className="sw valid" />Valid interval</span><span><i className="sw invalid" />Invalid, excluded from comparisons</span><span><i className="sw gap" />Missing evidence, not zero eggs</span></figcaption>
  </figure>;
}

const WEEKS = 6;
export function NetworkMatrix({ traps, samples, now, selected, onSelect }: { traps: Trap[]; samples: Record<string, Sample[]>; now: number; selected: string; onSelect: (trapId: string, sampleId?: string) => void }) {
  if (!traps.length) return null;
  const week = (iso: string) => Math.floor((now - Date.parse(iso)) / (7 * DAY));
  const cols = Array.from({ length: WEEKS }, (_, i) => WEEKS - 1 - i);
  const cell = (trapId: string, w: number) => (samples[trapId] ?? []).filter(s => week(s.interval_end) === w).sort((a, b) => b.interval_end.localeCompare(a.interval_end))[0];
  const max = Math.max(1, ...traps.flatMap(t => cols.map(w => { const s = cell(t.id, w); return s && s.validity === "VALID" ? s.egg_count : 0; })));
  const label = (w: number) => (w === 0 ? "this week" : w === 1 ? "last week" : `${w} wks ago`);
  return <Panel title="Network at a glance · eggs per trap per week" aside={<Badge>last {WEEKS} weeks</Badge>}>
    <p className="muted">Each row is a trap, each column a week. Darker blue means more eggs counted. Click any cell to open that trap.</p>
    <div className="matrix-scroll"><div className="matrix" role="table" aria-label="Eggs per trap per week" style={{ gridTemplateColumns: `minmax(120px, 1.2fr) repeat(${WEEKS}, minmax(64px, 1fr))` }}>
      <div role="row" className="mx-row mx-head"><span role="columnheader">Trap</span>{cols.map(w => <span role="columnheader" key={w}>{label(w)}</span>)}</div>
      {traps.map(t => {
        const down = t.effective_status !== "ACTIVE";
        return <div role="row" className={`mx-row${t.id === selected ? " sel" : ""}`} key={t.id}>
          <span role="rowheader" className={down ? "mx-name bad" : "mx-name"}><strong>{t.name}</strong><small>{down ? t.effective_status : t.block_id}</small></span>
          {cols.map(w => {
            const s = cell(t.id, w);
            if (!s) return <span role="cell" key={w} className={down ? "mx-cell off" : "mx-cell none"} title={down ? `${t.name} is ${t.effective_status}: data unavailable` : `${t.name}: no sample ${label(w)}. Missing, not zero.`}>{down ? "offline" : "—"}</span>;
            const valid = s.validity === "VALID";
            const a = valid ? 0.14 + 0.86 * (s.egg_count / max) : 0;
            return <button type="button" role="cell" key={w} className={`mx-cell val${valid ? "" : " inv"}`} style={valid ? { background: `rgba(8, 120, 184, ${a})`, color: a > 0.5 ? "#fff" : "var(--ink)" } : undefined} aria-label={`${t.name}, ${label(w)}: ${s.egg_count} eggs, ${s.validity}`} title={`${s.interval_start.slice(0, 10)} to ${s.interval_end.slice(0, 10)} · ${s.validity}`} onClick={() => onSelect(t.id, s.id)}>{s.egg_count}</button>;
          })}
        </div>;
      })}
    </div></div>
    <div className="tl-legend"><span className="mx-ramp" aria-hidden="true"><i />fewer eggs<b />more eggs</span><span><i className="sw invalid" />Invalid, not compared</span><span><i className="sw gap" />— No sample: missing, not zero</span><span><i className="sw off" />Offline: data unavailable, not low risk</span></div>
  </Panel>;
}
