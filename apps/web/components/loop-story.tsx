"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, result, type Schema } from "../lib/api";
import { Badge, Empty, Panel } from "./workspace";

type Props = {
  version: number;
  blocks: Schema["Summary"][];
  surveillance: Schema["BlockSurveillanceAnalytics"][];
  children?: React.ReactNode;
};

const PALETTE = ["#0d9fe8", "#127344", "#f2b53a", "#0a2547", "#ff5a1f"];
const count = <T,>(rows: T[], test: (row: T) => boolean) => rows.filter(test).length;

export function Gauge({ value, label, tone = "var(--green)" }: { value: number | null; label: string; tone?: string }) {
  // Half-circle gauge; value is a 0..1 fraction. A missing value draws no arc.
  const v = value == null ? 0 : Math.min(1, Math.max(0, value));
  const r = 42, c = Math.PI * r;
  return (
    <svg viewBox="0 0 100 58" className="gauge" role="img" aria-label={`${label}: ${value == null ? "not available" : Math.round(v * 100) + "%"}`}>
      <path d="M8 50 A42 42 0 0 1 92 50" fill="none" stroke="var(--surface-alt)" strokeWidth="12" strokeLinecap="round" />
      {value != null && <path d="M8 50 A42 42 0 0 1 92 50" fill="none" stroke={tone} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${v * c} ${c}`} />}
      <text x="50" y="48" textAnchor="middle" className="donut-centre">{value == null ? "n/a" : `${Math.round(v * 100)}%`}</text>
    </svg>
  );
}

export function Ring({ value, tone = "var(--green)" }: { value: number; tone?: string }) {
  const r = 30, c = 2 * Math.PI * r, v = Math.min(1, Math.max(0, value));
  return (
    <svg viewBox="0 0 76 76" className="ring" aria-hidden="true">
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--surface-alt)" strokeWidth="9" />
      <circle cx="38" cy="38" r={r} fill="none" stroke={tone} strokeWidth="9" strokeDasharray={`${v * c} ${c}`} transform="rotate(-90 38 38)" />
    </svg>
  );
}

function TrendChart({ surveillance }: { surveillance: Schema["BlockSurveillanceAnalytics"][] }) {
  const W = 480, H = 170, PAD = 24;
  const all = surveillance.flatMap((b) => b.series.map((p) => p.eggs_per_valid_trap_interval ?? 0));
  const max = Math.max(1, ...all);
  const len = Math.max(1, ...surveillance.map((b) => b.series.length));
  const x = (i: number) => PAD + (len === 1 ? (W - 2 * PAD) / 2 : (i / (len - 1)) * (W - 2 * PAD));
  const y = (v: number) => H - PAD - (v / max) * (H - 2 * PAD);
  if (!all.length) return <Empty>No interval history yet.</Empty>;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} className="trend" role="img" aria-label="Eggs per valid trap interval over time, one line per block">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={PAD} x2={W - PAD} y1={y(max * t)} y2={y(max * t)} stroke="var(--line)" />
            <text x={2} y={y(max * t) + 3} className="axis">{(max * t).toFixed(0)}</text>
          </g>
        ))}
        {surveillance.map((b, bi) => {
          const color = PALETTE[bi % PALETTE.length];
          // A missing reading breaks the line and shows a hollow marker on the axis: no data, not zero.
          const segments: string[][] = [[]];
          b.series.forEach((p, i) => {
            if (p.eggs_per_valid_trap_interval == null) segments.push([]);
            else segments[segments.length - 1].push(`${x(i)},${y(p.eggs_per_valid_trap_interval)}`);
          });
          return (
            <g key={b.block_id}>
              {segments.filter((s) => s.length > 1).map((s, i) => (
                <polyline key={i} points={s.join(" ")} fill="none" stroke={color} strokeWidth="2.5" />
              ))}
              {b.series.map((p, i) =>
                p.eggs_per_valid_trap_interval == null ? (
                  <circle key={i} cx={x(i)} cy={H - PAD} r="4" fill="var(--surface)" stroke={color} strokeWidth="2" />
                ) : (
                  <circle key={i} cx={x(i)} cy={y(p.eggs_per_valid_trap_interval)} r="3" fill={color} />
                ),
              )}
            </g>
          );
        })}
      </svg>
      <ul className="trend-legend">
        {surveillance.map((b, i) => (
          <li key={b.block_id}><i style={{ background: PALETTE[i % PALETTE.length] }} /> {b.block_name}</li>
        ))}
        <li><i className="hollow" /> no reading</li>
      </ul>
    </>
  );
}

export function LoopStory({ version, blocks, surveillance, children }: Props) {
  const [findings, setFindings] = useState<Schema["FindingRecord"][]>([]);
  const [orders, setOrders] = useState<Schema["WorkOrderRecord"][]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    Promise.all([
      api.GET("/api/v1/findings"),
      api.GET("/api/v1/work-orders"),
    ])
      .then(([f, w]) => {
        if (!active) return;
        setFindings(result(f).data);
        setOrders(result(w).data);
        setState("ready");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [version]);

  if (state === "loading") return <p role="status">Loading the loop…</p>;
  if (state === "error") return <p role="alert" className="error">Could not load drone and field data. Refresh to retry.</p>;

  const silent = count(blocks, (b) => b.status === "DATA_UNAVAILABLE");
  const reporting = blocks.length - silent;

  const unreviewed = count(findings, (f) => f.review_status === "PENDING" || f.review_status === "UNREVIEWED");
  const confirmed = count(findings, (f) => f.review_status === "CONFIRMED");
  const rejected = count(findings, (f) => f.review_status === "REJECTED");

  const openOrders = count(orders, (o) => ["OPEN", "ASSIGNED", "IN_PROGRESS"].includes(o.status));
  const pendingVerify = count(orders, (o) => o.status === "ACTION_COMPLETED_PENDING_VERIFICATION");
  const verified = count(orders, (o) => o.status === "VERIFIED_RESOLVED");
  const reopened = count(orders, (o) => o.status === "REOPENED");

  const openSites = blocks.reduce((n, b) => n + b.unresolved_sources, 0);
  const silentNames = blocks.filter((b) => b.status === "DATA_UNAVAILABLE").map((b) => b.name).join(", ");
  const todo = [
    silent > 0 && { text: `${silentNames}: traps are not reporting. No data is not good news.`, action: "Service traps", href: "/ovitraps" },
    unreviewed > 0 && { text: `${unreviewed} drone candidate${unreviewed === 1 ? "" : "s"} waiting for a person to check.`, action: "Review", href: "/drone/missions" },
    pendingVerify > 0 && { text: `${pendingVerify} finished job${pendingVerify === 1 ? "" : "s"} still need verification.`, action: "Verify", href: "/operations" },
    openSites > 0 && openOrders === 0 && { text: `${openSites} open site${openSites === 1 ? "" : "s"} have no job yet.`, action: "Plan next round", href: "/planning" },
  ].filter((x): x is { text: string; action: string; href: string } => Boolean(x));
  const maxOpen = Math.max(1, ...blocks.map((b) => b.unresolved_sources));
  const expected = blocks.reduce((n, b) => n + b.expected_intervals, 0);
  const valid = blocks.reduce((n, b) => n + b.valid_intervals, 0);
  const steps = [
    { n: 1, name: "Count", href: "/ovitraps", big: `${valid}/${expected}`, unit: "trap readings in", sub: silent ? `${silent} block${silent === 1 ? "" : "s"} silent: no data, not low risk` : "every block is reporting", alert: silent > 0 },
    { n: 2, name: "Plan", href: "/planning", big: String(openSites), unit: `open site${openSites === 1 ? "" : "s"} to cover`, sub: openSites > 0 && openOrders === 0 ? "no job assigned yet" : `${openOrders} job${openOrders === 1 ? "" : "s"} in progress`, alert: openSites > 0 && openOrders === 0 },
    { n: 3, name: "Inspect", href: "/drone/missions", big: String(unreviewed), unit: `candidate${unreviewed === 1 ? "" : "s"} to check`, sub: `${confirmed} confirmed · ${rejected} rejected`, alert: unreviewed > 0 },
    { n: 4, name: "Fix & verify", href: "/operations", big: String(verified), unit: "verified fixed", sub: `${openOrders} open · ${pendingVerify} awaiting a second check${reopened ? ` · ${reopened} reopened` : ""}`, alert: pendingVerify > 0 },
  ];
  const hasTrend = surveillance.some((b) => b.series.length > 1);
  const maxEggs = Math.max(1, ...blocks.map((b) => b.eggs_per_interval ?? 0));

  return (
    <section className="loop-story" aria-label="Dashboard charts">
      <aside className="todo-bar" aria-label="What needs attention">
        <h2>Needs your attention</h2>
        {todo.length ? (
          <ul>
            {todo.map((t) => (
              <li key={t.text}>
                <span>{t.text}</span>
                <Link className="button secondary" href={t.href}>{t.action} →</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p>Nothing urgent. Every block is reporting and no reviews or jobs are waiting.</p>
        )}
      </aside>
      <ol className="loop-strip" aria-label="The AedesLoop loop, step by step">
        {steps.map((st) => (
          <li key={st.n} className={st.alert ? "needs" : ""}>
            <Link href={st.href}>
              <span className="loop-strip-head"><b aria-hidden="true">{st.n}</b>{st.name}</span>
              <strong>{st.big}</strong>
              <span className="loop-strip-unit">{st.unit}</span>
              <small>{st.sub}</small>
            </Link>
          </li>
        ))}
      </ol>
      <p className="loop-strip-note">The loop closes when next week&apos;s trap counts show whether the fix held. A job marked done is not proof until someone else verifies it.</p>

      <div className="dash-split">
        {children}
      <div className="block-grid" aria-label="Block health">
        {blocks.map((b) => {
          const none = b.status === "DATA_UNAVAILABLE";
          const cover = b.expected_intervals ? (b.valid_intervals / b.expected_intervals) * 100 : 0;
          return (
            <Link key={b.id} href="/ovitraps" title={`Open ${b.name} in Smart ovitraps`} className={`block-card${none ? " is-silent" : ""}`}>
              <header>
                <h3>{b.name}</h3>
                <Badge>{none ? "NO DATA" : "MONITORING"}</Badge>
              </header>
              <b className="block-eggs">{b.eggs_per_interval?.toFixed(1) ?? "n/a"}</b>
              <small>eggs per trap · latest window</small>
              <div className="meter" role="img" aria-label={`${b.valid_intervals} of ${b.expected_intervals} readings received`}>
                <span style={{ width: `${cover}%` }} />
              </div>
              <dl>
                <div><dt>Traps reporting</dt><dd>{b.valid_intervals}/{b.expected_intervals}</dd></div>
                <div><dt>Traps with eggs</dt><dd>{b.positivity == null ? "n/a" : `${Math.round(b.positivity * 100)}%`}</dd></div>
                <div><dt>Sites to fix</dt><dd>{b.unresolved_sources}</dd></div>
              </dl>
              {b.comparability_warning && <p className="warning-text">{b.comparability_warning}</p>}
            </Link>
          );
        })}
      </div>
      </div>

      <div className="loop-charts">
        {hasTrend ? (
          <Panel title="Eggs per trap over time" aside={<Badge>Per collection window</Badge>}>
            <TrendChart surveillance={surveillance} />
          </Panel>
        ) : (
          <Panel title="Which traps sent data?" aside={<Badge>Coverage</Badge>}>
            <ul className="hbars">
              {blocks.map((b) => {
                const pct = b.expected_intervals ? (b.valid_intervals / b.expected_intervals) * 100 : 0;
                return (
                  <li key={b.id}>
                    <span>{b.name}</span>
                    {pct ? <i className="hbar is-green" style={{ width: `${pct}%` }} /> : <i className="hbar-none">No readings</i>}
                    <b>{b.valid_intervals}/{b.expected_intervals}</b>
                  </li>
                );
              })}
            </ul>
            <p className="chart-help"><b>How to read:</b> a full green bar means every trap in that block reported. A dashed box means nobody has reported, so we know nothing yet. That is not the same as safe. Only one collection window so far, so there is no trend line yet.</p>
          </Panel>
        )}
        <Panel title="How many eggs did each block find?" aside={<Badge>Latest window</Badge>}>
          {blocks.length ? (
            <ul className="hbars">
              {blocks.map((b) => (
                <li key={b.id}>
                  <span>{b.name}</span>
                  {b.eggs_per_interval == null ? (
                    <i className="hbar-none">No data, not zero</i>
                  ) : (
                    <i className="hbar" style={{ width: `${Math.max(3, (b.eggs_per_interval / maxEggs) * 100)}%` }} />
                  )}
                  <b>{b.eggs_per_interval?.toFixed(1) ?? "n/a"}</b>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No blocks yet.</Empty>
          )}
          <p className="chart-help"><b>How to read:</b> a longer bar means more eggs per trap, so more egg-laying nearby. Eggs are not adult mosquitoes and do not predict dengue. They tell us where to look first.</p>
        </Panel>
      </div>

      <ul className="colour-key" aria-label="What the colours mean">
        <li><i style={{ background: "var(--green)" }} /> Reporting normally</li>
        <li><i style={{ background: "var(--signal)" }} /> No data. Not the same as safe</li>
        <li><i style={{ background: "#f2b53a" }} /> Waiting for a person</li>
        <li><i style={{ background: "var(--blue)" }} /> Egg count</li>
      </ul>
    </section>
  );
}
