#!/usr/bin/env python3
"""Force-scan the core liquid 0DTE ETF universe.

The main scanner ranks equities for speed. This pass guarantees that the
most liquid index/sector ETFs with same-day options are never excluded just
because their equity momentum score is lower than a single-stock mover.
"""
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import scanner

CORE_0DTE = ("SPY", "QQQ", "IWM", "SMH", "GLD", "XLF")


def main():
    path = Path("data/market.json")
    data = json.loads(path.read_text())
    rows = data.get("candidates", [])
    existing = {x.get("ticker"): x for x in rows}

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(scanner.scan_one, t): t for t in CORE_0DTE}
        core = []
        for fut in as_completed(futures):
            x = fut.result()
            if x:
                core.append(x)

    scanner.add_news(core)

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(scanner.options, x["ticker"]): x for x in core}
        for fut in as_completed(futures):
            x = futures[fut]
            try:
                scanner.enrich_options(x, fut.result())
            except Exception:
                scanner.enrich_options(x, ([], "Core ETF scan error", None))

    for x in core:
        old = existing.get(x["ticker"])
        if old:
            old.clear()
            old.update(x)
        else:
            rows.append(x)

    data["core_0dte_universe"] = list(CORE_0DTE)
    data["core_0dte_scanned"] = [x["ticker"] for x in core]
    data["option_chain_universe"] = max(
        int(data.get("option_chain_universe", 0) or 0),
        len(set(data.get("core_0dte_scanned", [])) | {x.get("ticker") for x in rows}),
    )
    data["candidates"] = rows
    path.write_text(json.dumps(data, separators=(",", ":")))
    print(json.dumps({
        "core_0dte_universe": list(CORE_0DTE),
        "scanned": [x["ticker"] for x in core],
        "with_zero_dte": [x["ticker"] for x in core if x.get("zero_dte")],
    }))


if __name__ == "__main__":
    main()
