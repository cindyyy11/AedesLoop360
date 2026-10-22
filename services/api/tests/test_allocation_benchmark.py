import json
from pathlib import Path

from app.allocation_benchmark import (
    MODE,
    BlockEvidence,
    Scenario,
    ScenarioTruth,
    benchmark,
    default_scenario,
    sensitivity_scenarios,
)
from scripts.benchmark_allocation import write_report


def by_strategy(run):
    return {result["strategy"]: result for result in run["results"]}


def test_comparison_is_repeatable_and_uses_common_equal_constraints():
    first = benchmark()
    second = benchmark()
    assert first == second
    assert first["mode"] == MODE == "SIMULATED EXPERIMENT"
    assert len(first["results"]) == 3
    assert {result["staff_hours_used"] for result in first["results"]} == {8}
    assert {result["staff_hours_budget"] for result in first["results"]} == {8}
    assert {result["drone_hours_budget"] for result in first["results"]} == {2}
    assert first["constraints"]["independent_truth"] == {
        "actionable_issues": (
            ("block-1", "VERIFIED_SOURCE", 3),
            ("block-1", "LATENT_GROUND_SITE", 2),
            ("block-1", "RECURRENCE", 1),
            ("block-2", "LATENT_GROUND_SITE", 1),
            ("block-4", "OFFLINE_TRAP", 1),
        )
    }


def test_all_strategies_meet_minimum_coverage_and_report_budget_and_limits():
    results = benchmark()["results"]
    for result in results:
        assert result["minimum_coverage_met"]
        assert result["blocks_covered"] == ["block-1", "block-2", "block-3", "block-4"]
        assert result["staff_hours_used"] <= result["staff_hours_budget"]
        assert result["drone_hours_used"] <= result["drone_hours_budget"]
        assert result["unsupported_treatment_actions"] == 0
        assert result["unauthorized_drone_actions"] == 0
        assert "not biological efficacy" in result["interpretation"]


def test_adaptive_services_offline_block_without_low_risk_claim():
    adaptive = by_strategy(benchmark())["adaptive"]
    block4_actions = [task["kind"] for task in adaptive["tasks"] if task["block_id"] == "block-4"]
    assert "SERVICE_TRAP" in block4_actions
    assert adaptive["drone_hours_used"] == 0


def test_rising_egg_signal_without_verified_source_only_requests_ground_inspection():
    scenario = next(s for s in sensitivity_scenarios() if s.scenario_id == "rising-eggs-no-source")
    adaptive = by_strategy(benchmark(scenario))["adaptive"]
    block1_actions = [task["kind"] for task in adaptive["tasks"] if task["block_id"] == "block-1"]
    assert block1_actions
    assert set(block1_actions) == {"INSPECT_GROUND"}
    assert adaptive["unsupported_treatment_actions"] == 0


def test_recurrence_routes_to_engineering_review():
    scenario = next(s for s in sensitivity_scenarios() if s.scenario_id == "recurrence")
    adaptive = by_strategy(benchmark(scenario))["adaptive"]
    assert any(
        task["block_id"] == "block-1" and task["kind"] == "ENGINEERING_REVIEW"
        for task in adaptive["tasks"]
    )


def test_no_drone_permission_keeps_every_strategy_ground_only():
    scenario = next(s for s in sensitivity_scenarios() if s.scenario_id == "no-drone-permission")
    for result in benchmark(scenario)["results"]:
        assert result["drone_hours_used"] == 0
        assert not any("DRONE" in task["kind"] for task in result["tasks"])
        assert result["unauthorized_drone_actions"] == 0


def test_dry_occluded_and_uncertain_candidates_never_create_treatment_tasks():
    scenario = next(
        s for s in sensitivity_scenarios() if s.scenario_id == "dry-occluded-candidates"
    )
    for result in benchmark(scenario)["results"]:
        assert all(task["kind"] != "TREAT" for task in result["tasks"])
        assert result["unsupported_treatment_actions"] == 0


def test_budget_must_preserve_one_hour_per_block_coverage():
    scenario = Scenario(
        "undersized-budget",
        (BlockEvidence("block-1"), BlockEvidence("block-2")),
        ScenarioTruth(()),
        staff_budget_hours=1,
    )
    try:
        benchmark(scenario)
    except ValueError as error:
        assert "coverage guardrail" in str(error)
    else:
        raise AssertionError("An impossible coverage budget must fail closed")


def test_same_declared_truth_and_costs_are_shared_by_all_strategies():
    result = benchmark(default_scenario())
    assert result["constraints"]["staff_hour_cost"] == 1.0
    assert result["constraints"]["drone_hour_cost"] == 2.0
    assert len({row["scripted_actionable_issues"] for row in result["results"]}) == 1
    assert len({row["scenario_id"] for row in result["results"]}) == 1
    assert len({row["scripted_actionable_issues"] for row in result["results"]}) == 1
    # The frozen stale schedule, uniform patrol, and adaptive tasks produce
    # different discovery/coverage outputs from the same labels and budget.
    assert len({row["scripted_issues_discovered"] for row in result["results"]}) > 1
    assert len({row["scripted_issue_recall"] for row in result["results"]}) > 1
    for row in result["results"]:
        assert row["scripted_actionable_issues_covered"] == (
            row["scripted_issues_discovered"]
            + sum(row["scripted_issues_addressed_by_category"].values())
        )


def test_export_writes_machine_and_human_readable_simulation_evidence(tmp_path):
    outputs = write_report(tmp_path / "allocation.json")
    assert all(Path(path).is_file() for path in outputs.values())
    report = json.loads(Path(outputs["json"]).read_text())
    assert report["mode"] == "SIMULATED EXPERIMENT"
    assert "SIMULATED EXPERIMENT" in Path(outputs["markdown"]).read_text()
    assert "adaptive" in Path(outputs["csv"]).read_text()
