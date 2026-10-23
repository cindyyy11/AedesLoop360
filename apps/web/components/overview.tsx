"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { api, result, key, type Schema } from "../lib/api";
import { Badge, Empty, Panel, type Shared } from "./workspace";

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
  const expected = blocks.reduce((sum, b) => sum + b.expected_intervals, 0);
  const valid = blocks.reduce((sum, b) => sum + b.valid_intervals, 0);
  const unresolved = blocks.reduce((sum, b) => sum + b.unresolved_sources, 0);
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
          <aside className="overview-lede" aria-label="How to read this page">
            <p>
              <strong>This is a local demonstration overview.</strong> Numbers come from your SQLite
              database — seeded from the fictional <code>four_block_scenario.json</code> fixture, then
              updated when you run the loop (imports, reviews, missions). They are not live trap
              telemetry, not a public dataset feed, and not dengue risk.
            </p>
            <ul>
              <li>Egg counts ≠ adult mosquitoes ≠ confirmed Aedes ≠ human disease risk.</li>
              <li>
                <code>DATA_UNAVAILABLE</code> means missing observations — never treat it as low risk.
              </li>
              <li>Candidate containers from imagery still need ground review before action.</li>
            </ul>
          </aside>

          <section className="overview-strip" aria-label="Monitoring summary">
            <div>
              <strong>{blocks.length}</strong>
              <span>Registered blocks</span>
            </div>
            <div>
              <strong>
                {valid}
                <em> / {expected}</em>
              </strong>
              <span>Valid trap intervals · persisted</span>
            </div>
            <div>
              <strong>{unresolved}</strong>
              <span>Unresolved verified sources</span>
            </div>
            <div className={unavailableBlocks.length ? "amber" : undefined}>
              <strong>{unavailableBlocks.length}</strong>
              <span>Blocks with unavailable data</span>
            </div>
          </section>

          <Chapter
            index="01"
            title="What we observed"
            blurb="Schematic map and interval coverage from persisted block records. Pins are fictional assets — coordinates have no real-world accuracy."
          >
            <div className="overview-layout">
              <Panel title="Township at a glance" aside={<Badge>Fictional schematic</Badge>}>
                <div className="map">
                  <div className="map-road road-v" />
                  <div className="map-road road-h" />
                  {blocks.map((b) => (
                    <div
                      className={`map-block ${b.status === "DATA_UNAVAILABLE" ? "missing" : ""}`}
                      style={{ left: `${b.x - 10}%`, top: `${b.y - 10}%` }}
                      key={b.id}
                    >
                      <strong>{b.name}</strong>
                      <small>
                        {b.valid_intervals}/{b.expected_intervals} intervals
                      </small>
                      <span>{b.status === "DATA_UNAVAILABLE" ? "DATA UNAVAILABLE" : "MONITORING"}</span>
                    </div>
                  ))}
                  {assets.map((a) => (
                    <button
                      aria-label={`View ${a.name}`}
                      title={a.name}
                      className="asset-pin"
                      style={{ left: `${a.x}%`, top: `${a.y + 7}%` }}
                      key={a.id}
                      onClick={() => setSelected(a.id)}
                    />
                  ))}
                  <div className="map-key">
                    <span className="pin-key" />
                    Registered asset · select to inspect
                  </div>
                </div>
                {current ? (
                  <div className="selected-asset">
                    <strong>{current.name}</strong>
                    <p>
                      {current.id} · {current.accessible ? "Ground accessible" : "Elevated"} · SIMULATED
                    </p>
                    <Link href={`/assets/${current.id}`}>Open asset evidence →</Link>
                  </div>
                ) : (
                  <p className="muted">Select an asset marker to inspect its evidence and history.</p>
                )}
              </Panel>

              <Panel title="Suggested next steps" aside={<Badge>Demo path</Badge>}>
                {unavailableBlocks.length > 0 ? (
                  <div className="decision">
                    <Badge>Equipment workflow</Badge>
                    <h3>Restore {unavailableBlocks.map((b) => b.name).join(", ")} visibility.</h3>
                    <p>
                      Offline or missing trap intervals are labelled DATA_UNAVAILABLE. Service those
                      traps and keep baseline ground coverage — do not treat the blank as a low reading.
                    </p>
                    <Link className="button secondary" href="/planning">
                      Review allocation
                    </Link>
                  </div>
                ) : (
                  <div className="decision">
                    <Badge>Coverage intact</Badge>
                    <h3>All registered blocks report valid intervals.</h3>
                    <p>Continue planning from the latest persisted samples.</p>
                    <Link className="button secondary" href="/planning">
                      Open planning
                    </Link>
                  </div>
                )}
                <div className="decision">
                  <Badge>Human in the loop</Badge>
                  <h3>Three candidates. Three outcomes.</h3>
                  <p>
                    Dry → skip. Occluded → ground review. Eligible fictional target → approved
                    simulation. No real flight or chemical control.
                  </p>
                  <Link className="button secondary" href="/drone/missions">
                    Review drone mission
                  </Link>
                </div>
              </Panel>
            </div>

            <Panel
              title="Surveillance by block"
              aside={<span className="muted">Valid intervals only · source metadata from API</span>}
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Block</th>
                      <th>Monitoring</th>
                      <th>Eggs / valid interval</th>
                      <th>Positive intervals</th>
                      <th>Coverage</th>
                      <th>Verified sources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blocks.map((b) => (
                      <tr key={b.id}>
                        <th>{b.name}</th>
                        <td>
                          <Badge>{b.status.replaceAll("_", " ")}</Badge>
                          {b.comparability_warning && <small>{b.comparability_warning}</small>}
                        </td>
                        <td>{b.eggs_per_interval?.toFixed(1) ?? "Unavailable"}</td>
                        <td>
                          {b.positivity == null
                            ? "Unavailable"
                            : `${Math.round(b.positivity * 100)}% (${b.valid_intervals} samples)`}
                        </td>
                        <td>
                          {b.valid_intervals} / {b.expected_intervals}
                        </td>
                        <td>{b.unresolved_sources}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </Chapter>

          <Chapter
            index="02"
            title="Trap interval trends"
            blurb="Eggs per valid trap interval by collection window. Empty or unavailable bars mean missing effort — not zero mosquitoes."
          >
            <Panel title="Block surveillance quality & trend" aside={<Badge>Persisted sample intervals</Badge>}>
              <div className="analytics-grid">
                {surveillance.map((block) => (
                  <article className="analytics-block" key={block.block_id}>
                    <div>
                      <h3>{block.block_name}</h3>
                      <Badge>{block.status.replaceAll("_", " ")}</Badge>
                    </div>
                    <p>
                      {block.valid_trap_intervals} valid / {block.expected_trap_intervals} expected
                      intervals ·{" "}
                      {block.completeness == null
                        ? "coverage unavailable"
                        : `${Math.round(block.completeness * 100)}% coverage`}
                    </p>
                    {block.series.length ? (
                      <div
                        className="interval-chart"
                        role="img"
                        aria-label={`${block.block_name} eggs per valid trap interval by collection window`}
                      >
                        {block.series.map((point) => (
                          <div
                            className="interval-column"
                            key={`${point.interval_start}-${point.interval_days}`}
                          >
                            <span>
                              {point.eggs_per_valid_trap_interval == null
                                ? "Unavailable"
                                : point.eggs_per_valid_trap_interval.toFixed(1)}
                            </span>
                            <div
                              style={{
                                height: `${
                                  point.eggs_per_valid_trap_interval == null
                                    ? 0
                                    : Math.min(100, point.eggs_per_valid_trap_interval * 2)
                                }%`,
                              }}
                              className={point.status === "DATA_UNAVAILABLE" ? "unavailable" : ""}
                            />
                            <small>
                              {new Date(point.interval_start).toLocaleDateString()} ·{" "}
                              {point.valid_trap_intervals}/{point.expected_trap_intervals}
                            </small>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty>
                        {block.status === "DATA_UNAVAILABLE"
                          ? "No valid intervals. Service missing traps; this is not a low reading."
                          : "No interval history in the selected window."}
                      </Empty>
                    )}
                    <small className="muted">
                      Observed: {block.series.at(-1)?.latest_collected_at ?? "none"} · Uploaded:{" "}
                      {block.series.at(-1)?.latest_uploaded_at ?? "none"} · Source:{" "}
                      {block.source_modes.join(", ") || "none"}
                    </small>
                    {block.comparability_warning && (
                      <p className="warning-text">{block.comparability_warning}</p>
                    )}
                  </article>
                ))}
              </div>
            </Panel>
          </Chapter>

          <Chapter
            index="03"
            title="Model & planning evidence"
            blurb="Secondary panels. Empty states are intentional — this demo does not invent model scores or field impact."
            secondary
          >
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
              <p className="muted">
                Candidate-container detections do not verify water, larvae, Aedes species or treatment
                eligibility. Egg count is not adult abundance or dengue risk.
              </p>
            </Panel>

            <Panel title="Adaptive vs uniform / static allocation" aside={<Badge>SIMULATED EXPERIMENT</Badge>}>
              {strategies.length ? (
                <>
                  <p className="muted">
                    Same scripted four-block truth and resource constraints for all strategies. Results
                    measure task coverage, not field or biological impact.
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Strategy</th>
                          <th>Issues covered / total</th>
                          <th>Recall</th>
                          <th>Sites / inspection hour</th>
                          <th>Staff hours</th>
                          <th>Modelled cost / issue</th>
                          <th>Coverage floor</th>
                          <th>Constraint violations</th>
                          <th>Unsupported treatment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategies.map((run) => (
                          <tr key={run.strategy}>
                            <th>{run.strategy}</th>
                            <td>
                              {run.scripted_actionable_issues_covered} / {run.scripted_actionable_issues}
                            </td>
                            <td>
                              {run.scripted_issue_recall == null
                                ? "Unavailable"
                                : `${(run.scripted_issue_recall * 100).toFixed(0)}%`}
                            </td>
                            <td>{run.actionable_sites_per_inspection_hour?.toFixed(2) ?? "Unavailable"}</td>
                            <td>
                              {run.staff_hours_used} / {run.staff_hours_budget}
                            </td>
                            <td>{run.cost_per_scripted_issue_covered?.toFixed(2) ?? "Unavailable"}</td>
                            <td>{run.minimum_coverage_met ? "Met" : "Not met"}</td>
                            <td>{run.constraint_violations}</td>
                            <td>{run.unsupported_treatment_actions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <Empty>
                  No benchmark run is stored.{" "}
                  {user.role === "coordinator"
                    ? "Run the repeatable local scenario below when you want the comparison table."
                    : "Ask the coordinator to run the local scenario."}
                </Empty>
              )}
              {user.role === "coordinator" && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void api
                      .POST("/api/v1/analytics/allocation-benchmark", { params: { header: key() } })
                      .then(result)
                      .then((run) => setBenchmarkRun(run.data))
                      .catch((err) => setError(String(err)))
                  }
                >
                  Run simulated allocation benchmark
                </button>
              )}
            </Panel>
          </Chapter>
        </>
      )}
    </>
  );
}

function Chapter({
  index,
  title,
  blurb,
  children,
  secondary = false,
}: {
  index: string;
  title: string;
  blurb: string;
  children: React.ReactNode;
  secondary?: boolean;
}) {
  return (
    <section className={`overview-chapter${secondary ? " is-secondary" : ""}`} aria-labelledby={`chapter-${index}`}>
      <header className="chapter-head">
        <span className="chapter-index" aria-hidden="true">
          {index}
        </span>
        <div>
          <h2 id={`chapter-${index}`}>{title}</h2>
          <p>{blurb}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

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
