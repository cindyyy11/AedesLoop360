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
    silent > 0 && { text: `${silentNames}: no trap data`, action: "Service traps", href: "/ovitraps" },
    unreviewed > 0 && { text: `${unreviewed} drone candidate${unreviewed === 1 ? "" : "s"} to check`, action: "Review", href: "/drone/missions" },
    pendingVerify > 0 && { text: `${pendingVerify} job${pendingVerify === 1 ? "" : "s"} to verify`, action: "Verify", href: "/operations" },
    openSites > 0 && openOrders === 0 && { text: `${openSites} open site${openSites === 1 ? "" : "s"}, no job yet`, action: "Plan", href: "/planning" },
  ].filter((x): x is { text: string; action: string; href: string } => Boolean(x));
  const maxOpen = Math.max(1, ...blocks.map((b) => b.unresolved_sources));
  const expected = blocks.reduce((n, b) => n + b.expected_intervals, 0);
  const valid = blocks.reduce((n, b) => n + b.valid_intervals, 0);
  const steps = [
    { n: 1, name: "Count", href: "/ovitraps", big: `${valid}/${expected}`, unit: "traps reporting", alert: silent > 0 },
    { n: 2, name: "Plan", href: "/planning", big: String(openSites), unit: `open site${openSites === 1 ? "" : "s"} to cover`, alert: openSites > 0 && openOrders === 0 },
    { n: 3, name: "Inspect", href: "/drone/missions", big: String(unreviewed), unit: `candidate${unreviewed === 1 ? "" : "s"} to check`, alert: unreviewed > 0 },
    { n: 4, name: "Fix & verify", href: "/operations", big: String(verified), unit: "verified fixed", alert: pendingVerify > 0 },
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
          <p>Nothing urgent.</p>
        )}
      </aside>
      <ol className="loop-strip" aria-label="The AedesLoop loop, step by step">
        {steps.map((st) => (
          <li key={st.n} className={st.alert ? "needs" : ""}>
            <Link href={st.href}>
              <span className="loop-strip-head"><b aria-hidden="true">{st.n}</b>{st.name}</span>
              <strong>{st.big}</strong>
              <span className="loop-strip-unit">{st.unit}</span>
            </Link>
          </li>
        ))}
      </ol>

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
              <small>eggs per trap</small>
              <div className="meter" role="img" aria-label={`${b.valid_intervals} of ${b.expected_intervals} readings received`}>
                <span style={{ width: `${cover}%` }} />
              </div>
              <dl>
                <div><dt>Reporting</dt><dd>{b.valid_intervals}/{b.expected_intervals}</dd></div>
                <div><dt>With eggs</dt><dd>{b.positivity == null ? "n/a" : `${Math.round(b.positivity * 100)}%`}</dd></div>
                <div><dt>To fix</dt><dd>{b.unresolved_sources}</dd></div>
              </dl>
              {b.comparability_warning && <p className="warning-text">{b.comparability_warning}</p>}
            </Link>
          );
        })}
      </div>
      </div>

      <div className="loop-charts">
        {hasTrend ? (
          <Panel title="Eggs per trap over time">
            <TrendChart surveillance={surveillance} />
          </Panel>
        ) : (
          <Panel title="Traps reporting">
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
          </Panel>
        )}
        <Panel title="Eggs per trap">
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
        </Panel>
      </div>
    </section>
  );
}
