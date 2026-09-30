#!/usr/bin/env python3
"""Add execution-state, key-level and feedback intelligence after schema normalization."""
import json
from pathlib import Path
from execution_engine import enrich, update_history
from outcomes import update as update_outcomes
from status_memory import attach_last_status

DASHBOARD = Path("data/market-dashboard.json")
HISTORY = Path("data/scan-history.json")
FEEDBACK = Path("data/feedback.json")


def load_previous():
    if not HISTORY.exists():
        return {}
    try:
        rows = json.loads(HISTORY.read_text())
        if not isinstance(rows, list) or not rows:
            return {}
        last = rows[-1]
        return {
            "generated_at": last.get("generated_at"),
            "candidates": last.get("candidate_state") or [],
        }
    except Exception:
        return {}


def main():
    data = json.loads(DASHBOARD.read_text())
    previous = load_previous()
    data = enrich(data, previous)
    try:
        history = json.loads(HISTORY.read_text())
    except (OSError, ValueError):
        history = []
    data = attach_last_status(data, history if isinstance(history, list) else [])
    data = update_outcomes(data)

    priority = {"CONFIRMED": 6, "TRIGGERED": 5, "DECAYING": 4, "SECOND-WAVE": 3, "WATCH": 2, "PASS": 1}
    data["candidates"] = sorted(
        data.get("candidates", []),
        key=lambda x: (
            priority.get(x.get("execution_state"), 0),
            1 if x.get("catalyst_level") == "DIRECT" else 0,
            1 if x.get("market_alignment") == "ALIGNED" else 0,
            1 if x.get("momentum_state") == "ACCELERATING" else 0,
            float(x.get("score", 0) or 0),
        ),
        reverse=True,
    )

    counts = {}
    for x in data.get("candidates", []):
        state = x.get("execution_state", "PASS")
        counts[state] = counts.get(state, 0) + 1
    data["execution_counts"] = counts
    data["execution_layer"]["candidate_count"] = len(data.get("candidates", []))
    data["execution_layer"]["priority_order"] = list(priority.keys())

    DASHBOARD.write_text(json.dumps(data, separators=(",", ":")))
    update_history(data, HISTORY)
    FEEDBACK.write_text(json.dumps({
        "latest": data.get("session_feedback", {}),
        "market_regime": data.get("market_regime", {}),
        "execution_counts": counts,
        "recent_transitions": data.get("execution_layer", {}).get("state_transitions", []),
        "new_triggers": data.get("execution_layer", {}).get("new_triggers", []),
        "momentum_decay": data.get("execution_layer", {}).get("momentum_decay", []),
        "high_chase": data.get("execution_layer", {}).get("high_chase", []),
    }, separators=(",", ":")))
    print(json.dumps({
        "schema_version": data.get("schema_version"),
        "market_regime": data.get("market_regime"),
        "execution_counts": counts,
        "new_triggers": data.get("execution_layer", {}).get("new_triggers", []),
        "decay": data.get("execution_layer", {}).get("momentum_decay", []),
    }))


if __name__ == "__main__":
    main()
