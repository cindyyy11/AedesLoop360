"""Pure rules the production planner uses to rank blocks and choose inspection tasks.

Kept free of database access so the planner and the simulated benchmark run the
same code. Input blocks are the dictionaries produced by `surveillance.summaries`.
"""

from typing import Any

Block = dict[str, Any]


def rank_blocks(blocks: list[Block]) -> list[Block]:
    """Score each block with the demo weights and order them, highest first."""
    ranked = []
    for block in blocks:
        factors = [
            {
                "label": "Unresolved verified sources",
                "points": round(3 * block["unresolved_sources"], 2),
            },
            {
                "label": "Eggs per valid interval",
                "points": round((block["eggs_per_interval"] or 0) / 10, 2),
            },
            {
                "label": "Trap data unavailable",
                "points": 4 if block["status"] == "DATA_UNAVAILABLE" else 0,
            },
        ]
        score = sum(f["points"] for f in factors)
        ranked.append(
            {
                **block,
                "score": round(score, 2),
                "factors": factors,
                "reasons": [
                    f"{block['unresolved_sources']} unresolved verified sources",
                    f"{block['valid_intervals']}/{block['expected_intervals']} valid comparable intervals",
                    "NO_DRONE_NEEDED: accessible or occluded sources use ground inspection",
                ],
                "evidence_ids": block["sample_ids"] + block["observation_ids"],
            }
        )
    ranked.sort(key=lambda b: (-b["score"], b["id"]))
    return ranked


def select_tasks(
    blocks: list[Block], ranked: list[Block], staff_hours: float
) -> tuple[list[dict], list[dict], float]:
    """One reserved coverage hour per block, then one two-hour task per ranked block."""
    tasks = [
        {
            "id": f"baseline:{b['id']}",
            "block_id": b["id"],
            "kind": "INSPECT_GROUND",
            "hours": 1,
            "reason": "Minimum routine coverage",
        }
        for b in blocks
    ]
    used = float(len(tasks))
    excluded = []
    for block in ranked:
        kind = (
            "SERVICE_TRAP"
            if block["status"] == "DATA_UNAVAILABLE"
            else "REMOVE_SOURCE"
            if block["unresolved_sources"]
            else "INSPECT_GROUND"
        )
        if used + 2 <= staff_hours:
            tasks.append(
                {
                    "id": f"priority:{block['id']}",
                    "block_id": block["id"],
                    "kind": kind,
                    "hours": 2,
                    "reason": "; ".join(block["reasons"]),
                    "evidence_ids": block["evidence_ids"],
                }
            )
            used += 2
        else:
            excluded.append(
                {
                    "block_id": block["id"],
                    "kind": kind,
                    "reason": "Staff budget exhausted; baseline retained",
                }
            )
    return tasks, excluded, used
