#!/usr/bin/env python3
"""Publish isolated rotating 1–7 DTE research without changing production decisions."""
import copy
import json
import os
from datetime import datetime, timezone
from pathlib import Path

OUTPUT = Path("data/later-expiry-shadow.json")
DEFAULT_BUDGET = 12
MAX_BUDGET = 20


def rotation_candidates(rows, scan_id, budget=DEFAULT_BUDGET):
    """Choose qualified rows whose production chain was not attempted, deterministically."""
    eligible = [copy.deepcopy(row) for row in rows
                if row.get("setup_qualified") is True and row.get("chain_attempted") is False]
    eligible.sort(key=lambda row: str(row.get("ticker", "")))
    if not eligible:
        return []
    budget = max(0, min(int(budget), MAX_BUDGET))
    offset = sum(ord(char) for char in str(scan_id)) % len(eligible)
    rotated = eligible[offset:] + eligible[:offset]
    return rotated[:budget]


def public_contract(option):
    keys = ("contract_id", "side", "strike", "expiry", "dte", "bid", "ask", "delta",
            "volume", "oi", "spread_pct", "source", "option_timestamp", "collected_at",
            "minimum_delay_minutes", "timestamp_basis", "quote_freshness")
    return {key: option.get(key) for key in keys}


def build_artifact(source, rows, generated_at=None):
    candidates = []
    for row in rows:
        group = (row.get("expiry_groups") or {}).get("week") or {}
        contracts = [public_contract(option) for option in (group.get("eligible_contracts") or [])[:8]]
        candidates.append({"ticker": row.get("ticker"), "direction": row.get("direction"),
                           "setup_qualified_at_selection": True,
                           "chain_status": group.get("chain_status", row.get("chain_status", "UNKNOWN")),
                           "contracts": contracts})
    return {"schema_version": 1, "mode": "SHADOW_RESEARCH_ONLY",
            "generated_at": generated_at or datetime.now(timezone.utc).isoformat(),
            "source_scan_id": source.get("scan_id"), "source_generated_at": source.get("generated_at"),
            "expiration_window": "1-7_DTE", "ranking_effect": "NONE", "eligibility_effect": "NONE",
            "scoring_effect": "NONE", "alert_effect": "NONE", "candidates": candidates}


def main():
    from scanner import scan_options
    from schema_normalizer import normalize

    dashboard = json.loads(Path("data/market-dashboard.json").read_text())
    budget = os.getenv("LATER_EXPIRY_SHADOW_BUDGET", str(DEFAULT_BUDGET))
    selected = rotation_candidates(dashboard.get("candidates", []), dashboard.get("scan_id"), budget)
    if selected:
        scan_options(selected)
        selected = normalize({"market_session": dashboard.get("market_session"), "candidates": selected})["candidates"]
    artifact = build_artifact(dashboard, selected)
    OUTPUT.write_text(json.dumps(artifact, separators=(",", ":"), allow_nan=False))
    print(json.dumps({"shadow_candidates": len(selected), "mode": artifact["mode"]}))


if __name__ == "__main__":
    main()
