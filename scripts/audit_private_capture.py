"""Offline, aggregate-only audit of private quote exports.

Never send input or output to the public repo. This is a prospective research
coverage audit, NOT a trading/ML readiness certificate or brokerage P&L audit.
"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")
HORIZONS = (5, 10, 15)


def timestamp(value):
    if not isinstance(value, str) or "T" not in value:
        return None
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result.astimezone(timezone.utc) if result.tzinfo else None
    except ValueError:
        return None


def number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float, str)) or value == "":
        return None
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except ValueError:
        return None


def extract(payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected JSON object")
    kind = payload.get("format")
    if kind == "robinhood-review-export-v1":
        payload = payload.get("source_pack")
        if not isinstance(payload, dict):
            raise ValueError("Missing private source pack")
        kind = payload.get("format")
    records = []
    if kind == "robinhood-research-v1":
        for o in payload.get("observations", []):
            if not isinstance(o, dict):
                raise ValueError("Invalid Robinhood quote observation")
            inst, quote = o.get("instrument") or {}, o.get("quote") or {}
            if not isinstance(inst, dict) or not isinstance(quote, dict):
                raise ValueError("Invalid Robinhood metadata")
            if not inst.get("id") or quote.get("instrument_id") != inst["id"]:
                raise ValueError("Quote instrument identity mismatch")
            records.append({
                "key": "robinhood:" + str(inst["id"]),
                "observed": quote.get("updated_at"), "received": o.get("received_at"),
                "bid": quote.get("bid_price"), "ask": quote.get("ask_price"),
                "multiplier": number(inst.get("trade_value_multiplier")),
                "reported_status": o.get("session_status", "unverified"),
                "eligible": True,
            })
    elif kind == "shadow-outcome-input-v1":
        for q in payload.get("observations", []):
            if not isinstance(q, dict) or not isinstance(q.get("contract_id"), str):
                raise ValueError("Invalid shadow quote observation")
            records.append({
                "key": "shadow:" + q["contract_id"],
                "observed": q.get("observed_at"), "received": q.get("received_at"),
                "bid": q.get("bid"), "ask": q.get("ask"),
                "multiplier": number(q.get("metadata_multiplier")),
                "reported_status": "unverified",
                "eligible": q.get("quote_check") == "QUOTE_CHECK_PASSED"
                            and q.get("multiplier") == 100,
            })
    else:
        raise ValueError("Unsupported quote export format")
    return kind, records


def audit(payloads):
    counts = Counter()
    observations = {}
    conflicts = set()
    for payload in payloads:
        kind, records = extract(payload)
        counts["files"] += 1
        counts["source_" + kind] += 1
        counts["raw_quotes"] += len(records)
        for q in records:
            key = (q["key"], q["observed"], q["received"])
            if key in observations and observations[key] != q:
                conflicts.add(key)
            else:
                observations[key] = q
    for key in conflicts:
        observations.pop(key, None)
    counts["conflicting_quote_copies_withheld"] = len(conflicts)
    groups = defaultdict(list)
    dates = set()
    for q in observations.values():
        counts["deduplicated_quotes"] += 1
        received, observed = timestamp(q["received"]), timestamp(q["observed"])
        if received:
            dates.add(received.astimezone(EASTERN).date().isoformat())
        if not observed or not received or observed > received:
            counts["invalid_provider_or_receipt_clocks"] += 1
            continue
        age = (received - observed).total_seconds()
        if age > 60:
            counts["quotes_over_60_seconds_at_receipt"] += 1
            continue
        counts["fresh_quote_clocks"] += 1
        bid, ask = number(q["bid"]), number(q["ask"])
        if not (bid is not None and ask is not None and 0 < bid <= ask):
            counts["invalid_two_sided_books"] += 1
            continue
        spread = ask - bid
        if spread > 0.10 + 1e-9 or spread / ((bid + ask) / 2) > 0.30 + 1e-9:
            counts["unusable_spread_books"] += 1
            continue
        if q["multiplier"] != 100 or not q["eligible"]:
            counts["unverified_contract_or_quote_checks"] += 1
            continue
        counts["usable_research_quotes"] += 1
        if q["reported_status"] == "open":
            # Claim from source only; no independent calendar/provider audit here.
            counts["quotes_claimed_open"] += 1
        else:
            counts["quotes_without_verified_open_session"] += 1
        groups[(q["key"], received.astimezone(EASTERN).date().isoformat())].append((received, observed))
    matches = Counter()
    for samples in groups.values():
        samples.sort()
        first_receipt = samples[0][0]
        counts["prospective_entry_candidates"] += 1
        for minutes in HORIZONS:
            start = first_receipt + timedelta(minutes=minutes)
            end = start + timedelta(seconds=60)
            # Original provider clock must land in the window; quote must
            # also be received no later than its close, to avoid hindsight.
            if any(start <= observed <= end and received <= end
                   for received, observed in samples[1:]):
                matches[str(minutes)] += 1
    return {
        "format": "private-capture-coverage-audit-v1",
        "source_files": counts["files"],
        "source_formats": {k[len("source_"):]: v for k, v in sorted(counts.items()) if k.startswith("source_")},
        "session_dates_seen": len(dates),
        "raw_quotes": counts["raw_quotes"],
        "deduplicated_quotes": counts["deduplicated_quotes"],
        "conflicting_quote_copies_withheld": counts["conflicting_quote_copies_withheld"],
        "invalid_provider_or_receipt_clocks": counts["invalid_provider_or_receipt_clocks"],
        "quotes_over_60_seconds_at_receipt": counts["quotes_over_60_seconds_at_receipt"],
        "fresh_quote_clocks": counts["fresh_quote_clocks"],
        "invalid_two_sided_books": counts["invalid_two_sided_books"],
        "unusable_spread_books": counts["unusable_spread_books"],
        "unverified_contract_or_quote_checks": counts["unverified_contract_or_quote_checks"],
        "usable_research_quotes": counts["usable_research_quotes"],
        "quotes_claimed_open": counts["quotes_claimed_open"],
        "quotes_without_verified_open_session": counts["quotes_without_verified_open_session"],
        "prospective_entry_candidates": counts["prospective_entry_candidates"],
        "candidate_followup_windows": {str(m): matches[str(m)] for m in HORIZONS},
        "independent_open_session_verification": False,
        "executed_returns_verified": False,
        "production_feed_approved": False,
        "ml_ready": False,
        "limitations": [
            "Private export data are not ingested by the public ml-readiness.json audit.",
            "Source-reported open status is NOT independent market-session verification.",
            "A fresh quote-refresh clock is not a verified exchange bid/ask or Greek event clock.",
            "A quoted ask-to-bid change is not a fill or realizable P/L.",
            "Candidate follow-ups count only timestamp-valid quotes received within the explicit window.",
            "No chronological holdout, representative WATCH/PASS controls, provider permission, or feed latency certification."
        ]
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("exports", nargs="+", type=Path, help="Private export JSON paths outside public checkout")
    args = parser.parse_args()
    results = audit([json.loads(path.read_text(encoding="utf-8")) for path in args.exports])
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
