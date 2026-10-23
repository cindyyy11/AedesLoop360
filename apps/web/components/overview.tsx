"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api, result, key, type Schema } from "../lib/api";
import { Badge, Empty, Panel, type Shared } from "./workspace";
import { Gauge, LoopStory } from "./loop-story";
import { TownshipGlance } from "./township-glance";

const Township3D = dynamic(() => import("./township-3d"), { loading: () => <p role="status">Loading township walkthrough…</p> });

type BenchmarkResult = {
  strategy: string;
  scripted_actionable_issues_covered: number;
  scripted_actionable_issues: number;
  scripted_issue_recall: number | null;
  staff_hours_used: number;
  staff_hours_budget: number;
  cost_units: number;
  minimum_coverage_met: boolean;
  unsupported_treatment_actions: number;
  actionable_sites_per_inspection_hour: number | null;
  cost_per_scripted_issue_covered: number | null;
  constraint_violations: number;
};

export function Overview({ version, mapOnly, user, busy }: Shared & { mapOnly: boolean }) {
  const [blocks, setBlocks] = useState<Schema["Summary"][]>([]);
  const [assets, setAssets] = useState<Schema["AssetRecord"][]>([]);
  const [surveillance, setSurveillance] = useState<Schema["BlockSurveillanceAnalytics"][]>([]);
  const [evaluations, setEvaluations] = useState<Schema["ModelEvaluations"] | null>(null);
  const [benchmarkRun, setBenchmarkRun] = useState<Schema["AnalyticsRunRecord"] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.GET("/api/v1/blocks"),
      api.GET("/api/v1/assets"),
      api.GET("/api/v1/analytics/surveillance"),
      api.GET("/api/v1/analytics/evaluations"),
      api.GET("/api/v1/analytics/allocation-benchmark"),
    ])
      .then(([b, a, s, e, m]) => {
        if (!active) return;
        setBlocks(result(b).data);
        setAssets(result(a).data);
        setSurveillance(result(s).data);
        setEvaluations(result(e));
        setBenchmarkRun(result(m).data);
        setLoading(false);
      })
      .catch((err) => {
        if (active) {
          setError(String(err));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [version]);

  if (loading) return <p role="status">Loading persisted block observations…</p>;
  if (error) return <p role="alert" className="error">{error}</p>;

  const current = assets.find((a) => a.id === selected);
  const unavailableBlocks = blocks.filter((b) => b.status === "DATA_UNAVAILABLE");
  const strategies =
    ((benchmarkRun?.metrics as { results?: BenchmarkResult[] } | null)?.results) ?? [];
  const cards = evaluations ? [evaluations.drone_detection, evaluations.ovitrap_count] : [];
  const evaluatedCount = cards.filter((c) => c.status !== "NOT_EVALUATED" && c.latest_completed_run).length;

  return (
    <>
      {mapOnly && <Township3D version={version} />}
      {!mapOnly && (
        <>
          <LoopStory version={version} blocks={blocks} surveillance={surveillance}>
            <Panel title="Township at a glance" aside={<Badge>Fictional map</Badge>}>
                <TownshipGlance blocks={blocks} assets={assets} selected={selected} onSelect={setSelected} />
                {current && (
                  <div className="selected-asset">
                    <strong>{current.name}</strong>
                    <p>
                      {current.accessible ? "Reachable on foot" : "Elevated"}
                    </p>
                    <Link href={`/assets/${current.id}`}>Open site history →</Link>
                  </div>
                )}
              </Panel>
          </LoopStory>

          <details className="trust-fold">
            <summary><h2>How far can you trust this?</h2><small>Model accuracy and limits</small></summary>
            <section className="trust-tiles" aria-label="How far to trust the models">
                        <div>
              <article>
                <small>Drone detector recall</small>
                <Gauge label="Drone detector recall" value={pick(cards[0]?.latest_completed_run?.metrics, "recall")} tone="var(--blue)" />
                <p>Held-out images. Detections stay candidates until a person checks.</p>
              </article>
              <article>
                <small>Egg count error</small>
                <b>±{num(pick(cards[1]?.latest_completed_run?.metrics, "image_mae", "mae"))}<em> eggs / image</em></b>
                <p>Average miss on held-out paddle photos. Counts are proposals for review.</p>
              </article>
              <article>
                <small>Adaptive vs fixed plan · issue recall</small>
                <ul className="hbars compact">
                  {strategies.map((r) => (
                    <li key={r.strategy}>
                      <span>{r.strategy}</span>
                      <i className="hbar" style={{ width: `${Math.max(3, (r.scripted_issue_recall ?? 0) * 100)}%` }} />
                      <b>{pct(r.scripted_issue_recall)}</b>
                    </li>
                  ))}
                </ul>
                {!strategies.length && <p>Not run yet.</p>}
                <p>Simulated task coverage only.</p>
              </article>
              <article>
                <small>Evaluated models</small>
                <Gauge label="Models with a held-out evaluation" value={evaluatedCount / 2} />
                <p>{evaluatedCount} of 2. No independent field validation yet.</p>
              </article>
            </div>
          </section>

          <details className="fold detail-fold">
            <summary>Full model evaluation report</summary>
            <Panel
              title="Drone detection & ovitrap count evaluation"
              aside={
                <Badge>
                  {evaluatedCount ? `${evaluatedCount} held-out run${evaluatedCount === 1 ? "" : "s"}` : "Not evaluated yet"}
                </Badge>
              }
            >
              <div className="evaluation-grid">
                {cards.map((card) => (
                  <article className="evaluation-card" key={card.run_type}>
                    <div>
                      <h3>
                        {card.run_type.toLowerCase().includes("drone")
                          ? "Candidate object detection"
                          : "Egg count per image"}
                      </h3>
                      <Badge>{card.status.replaceAll("_", " ")}</Badge>
                    </div>
                    {card.status === "NOT_EVALUATED" || !card.latest_completed_run ? (
                      <Empty>{card.reason ?? "No completed held-out run."}</Empty>
                    ) : (
                      <>
                        <p>
                          Test split ·{" "}
                          {String(
                            card.latest_completed_run.run_metadata.test_count ??
                              card.latest_completed_run.run_metadata.image_count ??
                              card.latest_completed_run.run_metadata.sample_count ??
                              "unknown",
                          )}{" "}
                          labelled examples · {card.latest_completed_run.source_mode}
                        </p>
                        <p className="muted">
                          Dataset {String(card.latest_completed_run.run_metadata.dataset_id ?? "unknown")} ·
                          dataset hash{" "}
                          {String(card.latest_completed_run.run_metadata.dataset_sha256 ?? "unknown").slice(
                            0,
                            12,
                          )}{" "}
                          · checkpoint hash{" "}
                          {String(
                            card.latest_completed_run.run_metadata.checkpoint_sha256 ??
                              card.latest_completed_run.run_metadata.model_sha256 ??
                              "unknown",
                          ).slice(0, 12)}
                        </p>
                        <MetricList metrics={card.latest_completed_run.metrics ?? {}} />
                        {card.latest_completed_run.limitations.length > 0 && (
                          <ul className="evaluation-limitations">
                            {card.latest_completed_run.limitations.map((limitation) => (
                              <li key={limitation}>{limitation}</li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </article>
                ))}
              </div>
              <p className="muted">Detections are candidates only. They do not confirm water, larvae or species.</p>
            </Panel>
          </details>
                    <p className="muted loop-note">Demo data, not live traps. Egg counts are not adult mosquitoes or disease risk. DATA_UNAVAILABLE means no data, never low risk.</p>
          </details>



        </>
      )}
    </>
  );
}

function pick(metrics: unknown, ...names: string[]): number | null {
  // Breadth-first so an overall metric wins over the same name nested under a class.
  const queue: unknown[] = [metrics];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const entries = Object.entries(node as Record<string, unknown>);
    for (const name of names) {
      const hit = entries.find(([k, v]) => k === name && typeof v === "number");
      if (hit) return hit[1] as number;
    }
    queue.push(...entries.map(([, v]) => v));
  }
  return null;
}
const pct = (v: number | null | undefined) => (v == null ? "n/a" : `${Math.round(v * 100)}%`);
const num = (v: number | null | undefined) => (v == null ? "n/a" : v.toFixed(1));

function MetricList({ metrics }: { metrics: Record<string, unknown> }) {
  const shown = new Set([
    "precision",
    "recall",
    "f1",
    "map_50",
    "map_50_95",
    "mae",
    "rmse",
    "signed_bias",
    "median_absolute_error",
    "within_tolerance_rate",
  ]);
  const values: Array<[string, number]> = [];
  const visit = (value: unknown, path: string[]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [name, child] of Object.entries(value)) {
      if (typeof child === "number" && shown.has(name)) values.push([[...path, name].join(" / "), child]);
      else if (child && typeof child === "object") visit(child, [...path, name]);
    }
  };
  visit(metrics, []);
  return values.length ? (
    <dl className="metric-list">
      {values.map(([name, value]) => (
        <div key={name}>
          <dt>{name.replaceAll("_", " ")}</dt>
          <dd>{value.toFixed(3)}</dd>
        </div>
      ))}
    </dl>
  ) : (
    <Empty>Completed run has no standard metric values.</Empty>
  );
}
