#!/usr/bin/env python3
"""Expand the options pass beyond the scanner's fast first wave.

The base scanner keeps its first options pass small for speed. This second pass
uses the same ranking rules to add the next 25 names without changing the
underlying price/news scan.
"""
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import scanner

SRC = Path("data/market.json")
MAX_OPTIONS = 60
FIRST_WAVE = 35


def rank_key(x):
    return (
        1 if x.get("catalyst") else 0,
        1 if x.get("volume_acceleration", 0) >= 1.25 else 0,
        abs(x.get("move_5m", 0)),
        x.get("score", 0),
    )


def main():
    data = json.loads(SRC.read_text())
    rows = data.get("candidates", [])
    ranked = sorted(rows, key=rank_key, reverse=True)
    extra = ranked[FIRST_WAVE:MAX_OPTIONS]

    if not extra:
        data["option_chain_universe"] = min(len(ranked), MAX_OPTIONS)
        SRC.write_text(json.dumps(data, separators=(",", ":")))
        print("No additional option pass required")
        return

    scanned = 0
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(scanner.options, x["ticker"]): x for x in extra}
        for future in as_completed(futures):
            x = futures[future]
            try:
                scanner.enrich_options(x, future.result())
                scanned += 1
            except Exception as exc:
                x.setdefault("options", [])
                x.setdefault("preferred_contracts", [])
                x.setdefault("usable_contracts", [])
                x.setdefault("cheap_contracts", [])
                x["option_source"] = f"Expansion error: {type(exc).__name__}"

    data["option_chain_universe"] = min(len(ranked), MAX_OPTIONS)
    data["option_expansion"] = {
        "enabled": True,
        "first_wave": FIRST_WAVE,
        "max_universe": MAX_OPTIONS,
        "additional_attempted": len(extra),
        "additional_completed": scanned,
    }
    SRC.write_text(json.dumps(data, separators=(",", ":")))
    print(json.dumps(data["option_expansion"]))


if __name__ == "__main__":
    main()
