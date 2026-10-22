"""Deterministic, explicitly simulated resource-allocation experiment.

Policies share one scenario, independently declared issue labels, costs, and
budgets. The result measures scripted task coverage, never biological impact.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass

MODE = "SIMULATED EXPERIMENT"


@dataclass(frozen=True)
class BlockEvidence:
    block_id: str
    egg_counts: tuple[int, ...] = ()
    unresolved_verified_sources: int = 0
    recurring_verified_assets: int = 0
    offline_traps: int = 0
    expected_traps: int = 2
    drone_permission: bool = False
    initial_priority: int = 0  # immutable, stale schedule input
    candidate_states: tuple[str, ...] = ()

    @property
    def egg_signal(self) -> float | None:
        return sum(self.egg_counts) / len(self.egg_counts) if self.egg_counts else None


@dataclass(frozen=True)
class ScenarioTruth:
    """Common experiment labels, never passed to a strategy."""

    # (block, issue category, count); categories avoid double counting.
    actionable_issues: tuple[tuple[str, str, int], ...]

    def by_category(self) -> dict[tuple[str, str], int]:
        return {(block, category): count for block, category, count in self.actionable_issues}


@dataclass(frozen=True)
class Scenario:
    scenario_id: str
    evidence: tuple[BlockEvidence, ...]
    truth: ScenarioTruth
    staff_budget_hours: int = 8
    drone_budget_hours: int = 2
    staff_hour_cost: float = 1.0
    drone_hour_cost: float = 2.0


def default_scenario() -> Scenario:
    """Fictional four-block case with a frozen stale schedule and current evidence."""
    return Scenario(
        scenario_id="four-block-allocation-v1",
        evidence=(
            BlockEvidence(
                "block-1",
                (35, 28),
                3,
                1,
                initial_priority=0,
                candidate_states=("DRY", "VISIBLE_WATER", "OCCLUDED"),
            ),
            BlockEvidence("block-2", (19, 17), initial_priority=2),
            BlockEvidence("block-3", (8, 10), initial_priority=3),
            BlockEvidence("block-4", (), 1, offline_traps=2, initial_priority=1),
        ),
        # Labels are separately authored. Latent sites, known sources,
        # recurrence, and unavailable traps are distinct counted categories.
        truth=ScenarioTruth(
            (
                ("block-1", "VERIFIED_SOURCE", 3),
                ("block-1", "LATENT_GROUND_SITE", 2),
                ("block-1", "RECURRENCE", 1),
                ("block-2", "LATENT_GROUND_SITE", 1),
                ("block-4", "OFFLINE_TRAP", 1),
            )
        ),
    )


def _ordered_blocks(evidence: tuple[BlockEvidence, ...], strategy: str) -> list[BlockEvidence]:
    blocks = list(evidence)
    if strategy == "uniform":
        return sorted(blocks, key=lambda b: b.block_id)
    if strategy == "static":
        # Frozen schedule from the old inspection snapshot, deliberately not
        # recomputed from current egg/source/offline observations.
        return sorted(blocks, key=lambda b: (-b.initial_priority, b.block_id))
    if strategy == "adaptive":

        def score(b: BlockEvidence) -> float:
            return (
                5 * b.unresolved_verified_sources
                + 4 * b.recurring_verified_assets
                + 4 * (b.offline_traps > 0)
                + (b.egg_signal or 0) / 10
            )

        return sorted(blocks, key=lambda b: (-score(b), b.block_id))
    raise ValueError(f"Unknown strategy: {strategy}")


def _task_kind(block: BlockEvidence, strategy: str) -> str:
    # Current hard data-availability constraint applies to every policy.
    if block.offline_traps:
        return "SERVICE_TRAP"
    if strategy != "adaptive":
        return "INSPECT_GROUND"
    if block.recurring_verified_assets:
        return "ENGINEERING_REVIEW"
    if block.unresolved_verified_sources:
        return "REMOVE_SOURCE"
    # Rising eggs alone request ground inspection and never treatment.
    return "INSPECT_GROUND"


def _plan_tasks(
    evidence: tuple[BlockEvidence, ...], staff_budget_hours: int, strategy: str
) -> list[dict]:
    """Policy boundary: accepts evidence and constraints, never scenario truth."""
    blocks = {b.block_id: b for b in evidence}
    if len(blocks) != len(evidence):
        raise ValueError("Block identifiers must be unique")
    if any(b.expected_traps < 0 or b.offline_traps > b.expected_traps for b in blocks.values()):
        raise ValueError("Trap counts are inconsistent")
    if any(count < 0 for b in blocks.values() for count in b.egg_counts):
        raise ValueError("Egg counts cannot be negative")
    if staff_budget_hours < len(blocks):
        raise ValueError("Staff budget must cover the one-hour-per-block coverage guardrail")

    # Equal minimum coverage is reserved first; offline blocks receive service,
    # never an empty-data inspection presented as surveillance.
    tasks = [
        {
            "block_id": bid,
            "kind": "SERVICE_TRAP" if blocks[bid].offline_traps else "INSPECT_GROUND",
            "hours": 1,
        }
        for bid in sorted(blocks)
    ]
    used = len(tasks)
    for block in _ordered_blocks(evidence, strategy):
        if used + 2 > staff_budget_hours:
            break
        kind = _task_kind(block, strategy)
        # Avoid duplicate servicing/referral tasks already covered by the
        # reserved minimum. Continue to lower-ranked blocks for the next slot.
        if kind in {"SERVICE_TRAP", "ENGINEERING_REVIEW"} and any(
            t["block_id"] == block.block_id and t["kind"] == kind for t in tasks
        ):
            continue
        tasks.append({"block_id": block.block_id, "kind": kind, "hours": 2})
        used += 2
    return tasks


def _allocate(scenario: Scenario, strategy: str) -> dict:
    # Plan first at an explicit policy boundary. The scorer sees truth only
    # after every strategy has emitted its tasks.
    tasks = _plan_tasks(scenario.evidence, scenario.staff_budget_hours, strategy)
    blocks = {b.block_id: b for b in scenario.evidence}
    used = sum(task["hours"] for task in tasks)

    truth = scenario.truth.by_category()
    if {block for block, _category in truth} - set(blocks):
        raise ValueError("Scenario truth references an unknown block")
    inspections: dict[str, int] = {}
    handled: dict[tuple[str, str], int] = {}
    for task in tasks:
        if task["kind"] == "INSPECT_GROUND":
            inspections[task["block_id"]] = inspections.get(task["block_id"], 0) + 1
        category = {
            "REMOVE_SOURCE": "VERIFIED_SOURCE",
            "ENGINEERING_REVIEW": "RECURRENCE",
            "SERVICE_TRAP": "OFFLINE_TRAP",
        }.get(task["kind"])
        if category:
            key = (task["block_id"], category)
            handled[key] = handled.get(key, 0) + 1

    # Each ground-inspection task discovers at most one independently labelled
    # latent site. Specialty actions address their separate truth categories.
    discoveries = {
        (block_id, "LATENT_GROUND_SITE"): min(count, truth.get((block_id, "LATENT_GROUND_SITE"), 0))
        for block_id, count in inspections.items()
    }
    addressed = {key: min(count, truth.get(key, 0)) for key, count in handled.items()}
    discovered = sum(discoveries.values())
    covered = discovered + sum(addressed.values())
    total = sum(truth.values())
    drone_used = 0  # no task in this experiment requires a drone/flight command
    cost = used * scenario.staff_hour_cost + drone_used * scenario.drone_hour_cost
    inspection_hours = sum(task["hours"] for task in tasks if task["kind"] == "INSPECT_GROUND")
    violations = int(used > scenario.staff_budget_hours) + int(
        drone_used > scenario.drone_budget_hours
    )
    return {
        "strategy": strategy,
        "mode": MODE,
        "scenario_id": scenario.scenario_id,
        "tasks": tasks,
        "staff_hours_used": used,
        "staff_hours_budget": scenario.staff_budget_hours,
        "drone_hours_used": drone_used,
        "drone_hours_budget": scenario.drone_budget_hours,
        "cost_units": cost,
        "blocks_covered": sorted({task["block_id"] for task in tasks}),
        "minimum_coverage_met": set(blocks) <= {task["block_id"] for task in tasks},
        "scripted_actionable_issues": total,
        "scripted_issues_discovered": discovered,
        "actionable_sites_per_inspection_hour": (
            discovered / inspection_hours if inspection_hours else None
        ),
        "inspection_hours": inspection_hours,
        "inspections_completed": sum(task["kind"] == "INSPECT_GROUND" for task in tasks),
        "scripted_issues_addressed_by_category": {
            f"{block}:{category}": count for (block, category), count in sorted(addressed.items())
        },
        "scripted_actionable_issues_covered": covered,
        "missed_scripted_issues": total - covered,
        "scripted_issue_recall": covered / total if total else None,
        "cost_per_scripted_issue_covered": cost / covered if covered else None,
        "staff_hours_per_scripted_issue_covered": used / covered if covered else None,
        "resource_use": {
            "staff_hours": used,
            "staff_budget_hours": scenario.staff_budget_hours,
            "drone_hours": drone_used,
            "drone_budget_hours": scenario.drone_budget_hours,
        },
        "constraint_violations": violations,
        "unsupported_treatment_actions": sum(task["kind"] == "TREAT" for task in tasks),
        "unauthorized_drone_actions": sum(
            task["kind"] == "DRONE_SURVEY" and not blocks[task["block_id"]].drone_permission
            for task in tasks
        ),
        "interpretation": "Scripted scenario task coverage only; not biological efficacy or field evidence.",
    }


def benchmark(scenario: Scenario | None = None) -> dict:
    """Compare uniform, frozen static, and adaptive policies under equal limits."""
    scenario = scenario or default_scenario()
    results = [_allocate(scenario, name) for name in ("uniform", "static", "adaptive")]
    return {
        "mode": MODE,
        "constraints": {
            "staff_budget_hours": scenario.staff_budget_hours,
            "drone_budget_hours": scenario.drone_budget_hours,
            "staff_hour_cost": scenario.staff_hour_cost,
            "drone_hour_cost": scenario.drone_hour_cost,
            "independent_truth": asdict(scenario.truth),
            "seed": 0,
        },
        "results": results,
    }


def sensitivity_scenarios() -> tuple[Scenario, ...]:
    """Deterministic software edge cases in the analytics specification."""
    base = default_scenario()
    return (
        Scenario(
            "rising-eggs-no-source",
            (
                BlockEvidence("block-1", (5, 90), initial_priority=1),
                BlockEvidence("block-2", (), initial_priority=0),
            ),
            ScenarioTruth((("block-1", "LATENT_GROUND_SITE", 2),)),
            staff_budget_hours=6,
        ),
        Scenario("offline-block-4", base.evidence, base.truth),
        Scenario(
            "recurrence",
            (
                BlockEvidence(
                    "block-1", unresolved_verified_sources=1, recurring_verified_assets=2
                ),
                BlockEvidence("block-2"),
            ),
            ScenarioTruth((("block-1", "RECURRENCE", 2),)),
            staff_budget_hours=6,
        ),
        Scenario(
            "no-drone-permission",
            (BlockEvidence("block-1", unresolved_verified_sources=1), BlockEvidence("block-2")),
            ScenarioTruth((("block-1", "VERIFIED_SOURCE", 1),)),
            staff_budget_hours=4,
            drone_budget_hours=0,
        ),
        Scenario(
            "dry-occluded-candidates",
            (
                BlockEvidence("block-1", candidate_states=("DRY", "OCCLUDED", "UNCERTAIN")),
                BlockEvidence("block-2", candidate_states=("VISIBLE_WATER",)),
            ),
            ScenarioTruth((("block-2", "LATENT_GROUND_SITE", 1),)),
            staff_budget_hours=4,
        ),
    )
