"""Fail-closed public-data preflight for MANUAL Robinhood quote pilot.

Uses only published scanner batch + health, and the existing XNYS calendar.
No private authorization, quote, trading permission or price is verified.
Outputs no contract IDs, account fields, candidate tickers or transactions.
"""
import argparse
from datetime import date, datetime, time, timezone, timedelta
import json
import math
from pathlib import Path
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from market_clock import session_info

ET = ZoneInfo("America/New_York")
MAX_BATCH_AGE = timedelta(minutes=10)
MAX_HEALTH_AGE = timedelta(minutes=15)
MIN_PILOT_TIME = time(9, 40)


def parse_clock(value):
    if not isinstance(value, str) or "T" not in value:
        return None
    try:
        d = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return d.astimezone(timezone.utc) if d.tzinfo is not None else None
    except ValueError:
        return None


def number(value):
    if isinstance(value, bool) or value is None or value == "":
        return None
    try:
        x = float(value)
        return x if math.isfinite(x) else None
    except (ValueError, TypeError):
        return None


def preflight(batch, health, now):
    if not isinstance(batch, dict) or not isinstance(health, dict) or not isinstance(now, datetime) or now.tzinfo is None:
        raise ValueError("Require scanner batch, health and timezone-aware current time")
    now = now.astimezone(timezone.utc)
    ny = now.astimezone(ET)
    market = session_info(now)
    reasons = []
    def flag(condition, code):
        if condition:
            reasons.append(code)

    flag(market["session"] != "OPEN", "XNYS_NOT_OPEN")
    flag(market["session"] == "OPEN" and ny.time() < MIN_PILOT_TIME, "BEFORE_MANUAL_PILOT_WINDOW")

    generated, updated = parse_clock(batch.get("generated_at")), parse_clock(health.get("updated_at"))
    batch_age = (now - generated).total_seconds() if generated else None
    health_age = (now - updated).total_seconds() if updated else None
    flag(batch_age is None or batch_age < 0 or batch_age > MAX_BATCH_AGE.total_seconds(), "BATCH_STALE_OR_INVALID_CLOCK")
    flag(health_age is None or health_age < 0 or health_age > MAX_HEALTH_AGE.total_seconds(), "HEALTH_STALE_OR_INVALID_CLOCK")
    flag(generated is None or generated.astimezone(ET).date() != ny.date(), "BATCH_NOT_FROM_CURRENT_ET_DATE")
    flag(batch.get("market_session") != "OPEN", "BATCH_NOT_OPEN_SESSION")
    flag(batch.get("format") != "candidate-identities-v1" or batch.get("selection_policy") != "published-research-screens-v1" or batch.get("environment") != "production", "INVALID_PRODUCTION_BATCH_METADATA")
    flag(health.get("status") != "SUCCESS" or health.get("stage") != "VALIDATED", "SCANNER_PIPELINE_NOT_VALIDATED")
    flag(not batch.get("scan_id") or str(batch.get("scan_id")) != str(health.get("scan_id")), "HEALTH_BATCH_SCAN_ID_MISMATCH")
    flag(bool(health.get("core_missing")), "CORE_UNIVERSE_MISSING")

    candidates = batch.get("candidates")
    count = 0
    invalid = False
    identities = set()
    tickers = {}
    if not isinstance(candidates, list) or len(candidates) > 20:
        invalid = True
    else:
        for row in candidates:
            if not isinstance(row, dict) or not isinstance(row.get("ticker"), str) or not isinstance(row.get("options"), list):
                invalid = True
                continue
            ticker = row["ticker"]
            tickers[ticker] = tickers.get(ticker, 0) + len(row["options"])
            for option in row["options"]:
                count += 1
                if not isinstance(option, dict):
                    invalid = True
                    continue
                try:
                    expiry = date.fromisoformat(option.get("expiry", ""))
                except (ValueError, TypeError):
                    invalid = True
                    continue
                strike, ask = number(option.get("strike")), number(option.get("scanner_ask"))
                identity = (ticker, expiry, option.get("side"), strike)
                if (identity in identities or option.get("side") not in ("call", "put")
                    or strike is None or strike <= 0 or ask is None or not 0 < ask <= .30
                    or expiry < ny.date() or expiry > ny.date() + timedelta(days=14)):
                    invalid = True
                identities.add(identity)
    flag(invalid or any(v > 2 for v in tickers.values()) or batch.get("max_per_ticker") != 2
         or batch.get("included_contracts") != count or not isinstance(batch.get("total_contracts"), int)
         or batch.get("total_contracts") < count or batch.get("qualifying_contracts") != batch.get("total_contracts")
         or batch.get("omitted_contracts") != batch.get("total_contracts") - count, "BATCH_CONTRACT_IDENTITY_OR_COVERAGE_INVALID")
    flag(count == 0, "NO_ELIGIBLE_CONTRACTS_FOR_PILOT")

    return {
        "format": "public-quote-preflight-v1",
        "checked_et_date": ny.date().isoformat(),
        "session_from_xnys_calendar": market["session"],
        "batch_age_seconds": round(batch_age, 1) if batch_age is not None else None,
        "health_age_seconds": round(health_age, 1) if health_age is not None else None,
        "selected_contract_count": count,
        "result": "READY_FOR_MANUAL_PRIVATE_CHECK" if not reasons else "NOT_READY",
        "blockers": sorted(set(reasons)),
        "private_robinhood_authorization_verified": False,
        "provider_bid_ask_freshness_verified": False,
        "executability_verified": False,
        "live_trading_ready": False,
        "next_step": "If public checks pass, independently verify Cloudflare Access, Robinhood authorization, exact option metadata and fresh bid/ask using signed-in private Quotes page. Never use this public audit as trade admission.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, default=Path("data/candidate-quote-batch.json"))
    parser.add_argument("--health", type=Path, default=Path("data/scan-health.json"))
    parser.add_argument("--now", help="Optional timezone-aware ISO 8601 clock for reproducible testing")
    args = parser.parse_args()
    now = parse_clock(args.now) if args.now else datetime.now(timezone.utc)
    if now is None:
        parser.error("--now must be timezone-aware ISO 8601")
    report = preflight(json.loads(args.batch.read_text()), json.loads(args.health.read_text()), now)
    print(json.dumps(report, indent=2))
    return 0 if report["result"] == "READY_FOR_MANUAL_PRIVATE_CHECK" else 2


if __name__ == "__main__":
    sys.exit(main())
