#!/usr/bin/env python3
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, time as dtime
from zoneinfo import ZoneInfo

import requests

UA = "Mozilla/5.0 (0DTE-Options-Command-Center; GitHub Actions)"
ET = ZoneInfo("America/New_York")

TICKERS = """
AAPL AMD AMZN AVGO BA BABA BAC COIN COST CRM CVNA CVX DIS DKNG GOOGL HOOD INTC IREN JPM
LLY MARA META MSFT MU NFLX NKE NVDA ORCL PANW PLTR QCOM RBLX RKLB SMCI SMR SOFI TSLA TSM
UAL UBER UNH WMT XOM XPEV AAL ABNB ADI ADP ADBE AEP AES AMAT ANET ANF APD ARM ASML AXON
CARR CAT CCL CELH CFLT CMCSA COP CRWD DASH DDOG DE DECK DELL DOCU EA ENPH F FDX
FTNT GE GEV GILD GIS GM GME GS HIMS IBM INOD ISRG JD JNJ KKR KO LULU LVS LYFT MCD
MDLZ MELI MNST MRVL NET NIO NOW OXY PDD PEP PFE PG PINS PLUG PYPL RDDT RIVN ROKU
RTX SBUX SCHW SLB SNOW SNAP SPOT SQ TGT TMO TTD TWLO TXN U V VEEV VLO
WBD WDC WDAY XLF XLK XLU XLY ZM ZS
""".split()

CBOE_BASE = "https://cdn.cboe.com/api/global/delayed_quotes/options"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
}


def num(v):
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(",", "").replace("$", "").strip()
    if s in ("", "-", "--", "N/A", "n/a", "None"):
        return 0.0
    try:
        return float(s)
    except Exception:
        return 0.0


def pct(a, b):
    return (a / b - 1) * 100 if b else 0.0


def market_session(now=None):
    now = now or datetime.now(ET)
    if now.weekday() >= 5:
        return "CLOSED"
    t = now.time()
    if dtime(4, 0) <= t < dtime(9, 30):
        return "PREMARKET"
    if dtime(9, 30) <= t < dtime(16, 0):
        return "OPEN"
    if dtime(16, 0) <= t < dtime(20, 0):
        return "AFTER HOURS"
    return "CLOSED"


def chart(t):
    u = f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?interval=5m&range=1d&events=div%2Csplits"
    r = requests.get(u, headers={"User-Agent": UA}, timeout=12)
    r.raise_for_status()
    return r.json()["chart"]["result"][0]


def news(t):
    try:
        r = requests.get(
            "https://query1.finance.yahoo.com/v1/finance/search",
            params={"q": t, "newsCount": 8, "quotesCount": 0},
            headers={"User-Agent": UA}, timeout=10,
        )
        r.raise_for_status()
        return r.json().get("news", [])
    except Exception:
        return []


def explicit_ticker(ticker, item):
    title = str(item.get("title", ""))
    link = str(item.get("link", ""))
    pat = re.compile(r"(?<![A-Z0-9])" + re.escape(ticker) + r"(?![A-Z0-9])", re.I)
    return bool(pat.search(title) or pat.search(link))


def scan_one(t):
    try:
        d = chart(t)
        q = d["indicators"]["quote"][0]
        close = [x for x in q.get("close", []) if x is not None]
        high = [x for x in q.get("high", []) if x is not None]
        low = [x for x in q.get("low", []) if x is not None]
        volume = [x for x in q.get("volume", []) if x is not None]
        if len(close) < 14 or len(high) != len(close) or len(low) != len(close):
            return None

        price = close[-1]
        day_move = pct(price, close[0])
        move_5m = pct(price, close[-2])
        move_15m = pct(price, close[-4])
        move_30m = pct(price, close[-7])
        move_60m = pct(price, close[-13])

        hist = volume[:-5][-20:]
        recent = volume[-5:]
        prior5 = volume[-10:-5]
        avg_hist = sum(hist) / max(1, len(hist))
        avg_recent = sum(recent) / max(1, len(recent))
        avg_prior5 = sum(prior5) / max(1, len(prior5))
        vol_burst = avg_recent / avg_hist if avg_hist else 0
        volume_acceleration = avg_recent / avg_prior5 if avg_prior5 else 0

        typical = [(h + l + c) / 3 for h, l, c in zip(high, low, close)]
        total_vol = sum(volume)
        vwap = sum(tp * v for tp, v in zip(typical, volume)) / total_vol if total_vol else price
        recent_high = max(high[-3:])
        recent_low = min(low[-3:])
        direction = "UP" if day_move >= 0 else "DOWN"
        trigger = recent_high if direction == "UP" else recent_low
        invalidation = vwap if (direction == "UP" and vwap < price) or (direction == "DOWN" and vwap > price) else (recent_low if direction == "UP" else recent_high)

        score = (
            abs(day_move) * 1.2
            + abs(move_15m) * 1.8
            + abs(move_5m) * 2.2
            + max(0, vol_burst - 1) * 2.2
            + max(0, volume_acceleration - 1) * 1.5
            + (1.5 if abs(price - vwap) / max(price, 0.01) >= 0.005 else 0)
        )

        return {
            "ticker": t,
            "price": round(price, 2),
            "day_move": round(day_move, 2),
            "move_5m": round(move_5m, 2),
            "recent_move": round(move_15m, 2),
            "move_30m": round(move_30m, 2),
            "move_60m": round(move_60m, 2),
            "volume_ratio": round(vol_burst, 2),
            "volume_acceleration": round(volume_acceleration, 2),
            "vwap": round(vwap, 2),
            "vwap_distance_pct": round((price / vwap - 1) * 100 if vwap else 0, 2),
            "recent_high_15m": round(recent_high, 2),
            "recent_low_15m": round(recent_low, 2),
            "trigger_price": round(trigger, 2),
            "invalidation_price": round(invalidation, 2),
            "direction": direction,
            "score": round(score, 2),
        }
    except Exception:
        return None


def add_news(items):
    def one(x):
        fresh = []
        for n in news(x["ticker"]):
            ts = n.get("providerPublishTime", 0)
            if not ts or time.time() - ts >= 36 * 3600:
                continue
            related = [str(v).upper() for v in (n.get("relatedTickers") or [])]
            relevant = explicit_ticker(x["ticker"], n) or x["ticker"].upper() in related
            fresh.append({
                "title": n.get("title", ""),
                "publisher": n.get("publisher", ""),
                "url": n.get("link", ""),
                "age_hours": round((time.time() - ts) / 3600, 1),
                "explicit_ticker": relevant,
                "related_tickers": related[:8],
            })
        fresh.sort(key=lambda n: (1 if n["explicit_ticker"] else 0, -n["age_hours"]), reverse=True)
        return x["ticker"], fresh[:6]

    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(one, x) for x in items]
        for fut in as_completed(futures):
            ticker, fresh = fut.result()
            x = next((z for z in items if z["ticker"] == ticker), None)
            if x is None:
                continue
            x["news_items"] = fresh
            x["news"] = " | ".join(f"{n['title']} ({n['publisher']})" for n in fresh if n.get("title"))
            x["catalyst"] = any(n.get("explicit_ticker") for n in fresh)


def parse_osi(symbol):
    if not symbol:
        return None
    m = re.search(r"(\d{6})([CP])(\d{8})$", str(symbol).strip())
    if not m:
        return None
    yymmdd, side, strike_raw = m.groups()
    try:
        exp = datetime.strptime(yymmdd, "%y%m%d").date()
        return exp, ("call" if side == "C" else "put"), int(strike_raw) / 1000.0
    except Exception:
        return None


def fetch_cboe(t):
    try:
        r = requests.get(f"{CBOE_BASE}/{t}.json", headers=HEADERS, timeout=18)
        r.raise_for_status()
        payload = r.json()
        rows = (payload.get("data") or {}).get("options") or []
        timestamp = payload.get("timestamp")
        today = datetime.now(ET).date()
        out = []
        for row in rows:
            parsed = parse_osi(row.get("option"))
            if not parsed:
                continue
            exp, side, strike = parsed
            if exp != today:
                continue
            bid = num(row.get("bid")); ask = num(row.get("ask")); last = num(row.get("last_trade_price"))
            mid = (bid + ask) / 2 if bid > 0 and ask > 0 else last
            if mid <= 0:
                continue
            out.append({
                "side": side, "strike": round(strike, 3), "bid": round(bid, 2),
                "ask": round(ask, 2), "mid": round(mid, 2), "last": round(last, 2),
                "volume": int(num(row.get("volume"))), "oi": int(num(row.get("open_interest"))),
                "iv": round(num(row.get("iv")), 4), "delta": round(num(row.get("delta")), 4),
                "gamma": round(num(row.get("gamma")), 6), "theta": round(num(row.get("theta")), 4),
                "vega": round(num(row.get("vega")), 4), "expiry": exp.isoformat(), "dte": 0,
                "source": "CBOE delayed (15m)", "option_timestamp": timestamp,
                "greeks_verified": bool(num(row.get("delta")) or num(row.get("gamma"))),
            })
        return out, timestamp
    except Exception:
        return [], None


def parse_nasdaq_rows(rows, today):
    out = []
    for row in rows or []:
        exp_raw = row.get("expiryDate") or row.get("expirationDate") or row.get("expiry")
        if not exp_raw:
            continue
        exp = None
        for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y", "%b %d, %Y"):
            try:
                exp = datetime.strptime(str(exp_raw).strip(), fmt).date(); break
            except Exception:
                pass
        if not exp or exp != today:
            continue
        strike = num(row.get("strike") or row.get("strikePrice"))
        if not strike:
            continue
        for side, prefix in (("call", "c_"), ("put", "p_")):
            bid = num(row.get(prefix+"Bid") or row.get(prefix+"bid"))
            ask = num(row.get(prefix+"Ask") or row.get(prefix+"ask"))
            last = num(row.get(prefix+"Last") or row.get(prefix+"last"))
            mid = (bid + ask) / 2 if bid > 0 and ask > 0 else last
            if mid <= 0:
                continue
            out.append({
                "side": side, "strike": strike, "bid": round(bid, 2), "ask": round(ask, 2),
                "mid": round(mid, 2), "last": round(last, 2),
                "volume": int(num(row.get(prefix+"Volume") or row.get(prefix+"volume"))),
                "oi": int(num(row.get(prefix+"Openinterest") or row.get(prefix+"OpenInterest") or row.get(prefix+"openInterest"))),
                "iv": 0, "delta": 0, "gamma": 0, "theta": 0, "vega": 0,
                "expiry": exp.isoformat(), "dte": 0, "source": "Nasdaq public chain",
                "option_timestamp": None, "greeks_verified": False,
            })
    return out


def nasdaq_options(t):
    try:
        today = datetime.now(ET).date()
        r = requests.get(
            f"https://api.nasdaq.com/api/quote/{t}/option-chain",
            params={"assetclass": "stocks", "limit": "1000"},
            headers={**HEADERS, "Referer": "https://www.nasdaq.com/"}, timeout=12,
        )
        r.raise_for_status()
        rows = ((r.json().get("data") or {}).get("table") or {}).get("rows") or []
        return parse_nasdaq_rows(rows, today)
    except Exception:
        return []


def options(t):
    data, ts = fetch_cboe(t)
    if data:
        return data, "CBOE delayed (15m)", ts
    data = nasdaq_options(t)
    return data, ("Nasdaq public chain" if data else "No same-day chain returned"), None


def contract_score(o, stock):
    price = stock["price"]
    spread = max(0.0, o["ask"] - o["bid"]) if o["bid"] > 0 and o["ask"] > 0 else 9.99
    delta = abs(o.get("delta", 0))
    dist = abs(o["strike"] - price) / max(price, 0.01)
    liquidity = min(5.0, (o["volume"] ** 0.5) / 15) + min(2.0, (o["oi"] ** 0.5) / 15)
    delta_score = max(0.0, 5.0 - abs(delta - 0.45) * 10) if delta else 0
    gamma_score = min(3.0, o.get("gamma", 0) * 25) if o.get("gamma") else 0
    spread_score = max(-6.0, 4.0 - spread * 50)
    atm_score = max(0.0, 4.0 - dist * 100)
    side = "call" if stock["direction"] == "UP" else "put"
    side_bonus = 3.0 if o["side"] == side else 0
    ask = o["ask"]
    price_score = 5.0 if 0.10 <= ask <= 0.30 else 3.0 if 0.30 < ask <= 0.50 else 1.0 if 0.50 < ask <= 0.75 else -4.0
    return round(price_score + liquidity + delta_score + gamma_score + spread_score + atm_score + side_bonus, 3)


def enrich_options(x, result):
    opts, source, timestamp = result
    zero = [o for o in opts if o.get("dte") == 0]
    for o in zero:
        spread = o["ask"] - o["bid"] if o["ask"] > 0 and o["bid"] > 0 else 99
        o["spread"] = round(spread, 2)
        o["spread_pct"] = round(spread / max(o["mid"], 0.01) * 100, 1) if spread < 99 else 999
        o["distance_pct"] = round(abs(o["strike"] - x["price"]) / max(x["price"], 0.01) * 100, 2)
        o["contract_score"] = contract_score(o, x)
        o["preferred_price"] = 0.10 <= o["ask"] <= 0.30
        o["watch_price"] = 0.30 < o["ask"] <= 0.50
        o["usable_price"] = 0.10 <= o["ask"] <= 0.75
        o["near_atm"] = o["distance_pct"] <= 3.0
        o["delta_ok"] = (not o.get("greeks_verified")) or abs(o.get("delta", 0)) >= 0.25
        o["preferred_delta"] = (not o.get("greeks_verified")) or abs(o.get("delta", 0)) >= 0.40
        o["tight_spread"] = spread <= 0.05
        o["usable_spread"] = spread <= 0.10

    near = [o for o in zero if o["near_atm"]]
    calls = sum(o["volume"] for o in near if o["side"] == "call")
    puts = sum(o["volume"] for o in near if o["side"] == "put")
    ratio = round(calls / puts, 2) if puts else (99 if calls else 0)
    if ratio >= 1.25:
        flow = "CALL"
    elif ratio <= 0.80 and puts:
        flow = "PUT"
    else:
        flow = "NEUTRAL"

    preferred = [o for o in zero if o["preferred_price"] and o["volume"] >= 20 and o["near_atm"] and o["delta_ok"] and o["tight_spread"]]
    usable = [o for o in zero if o["usable_price"] and o["volume"] >= 20 and o["near_atm"] and o["delta_ok"] and o["usable_spread"]]
    preferred.sort(key=lambda o: (o["preferred_delta"], o["contract_score"]), reverse=True)
    usable.sort(key=lambda o: o["contract_score"], reverse=True)

    x["options"] = sorted(zero, key=lambda o: o["contract_score"], reverse=True)[:40]
    x["preferred_contracts"] = preferred[:5]
    x["cheap_contracts"] = preferred[:5]
    x["usable_contracts"] = usable[:8]
    x["zero_dte"] = bool(zero)
    x["option_call_volume"] = calls
    x["option_put_volume"] = puts
    x["option_call_put_ratio"] = ratio
    x["option_flow_direction"] = flow
    x["option_direction"] = flow
    x["option_source"] = source
    x["option_timestamp"] = timestamp
    x["options_quality"] = "FULL_GREEKS" if any(o.get("greeks_verified") for o in zero) else ("CHAIN_ONLY" if zero else "NONE")

    momentum = abs(x["day_move"]) >= 3 and x["volume_ratio"] >= 1.5
    acceleration = x["volume_acceleration"] >= 1.25 and abs(x["move_5m"]) >= 0.25
    aligned = (flow == "CALL" and x["direction"] == "UP") or (flow == "PUT" and x["direction"] == "DOWN")
    catalyst = any(n.get("explicit_ticker") for n in x.get("news_items", []))
    if preferred and catalyst and (momentum or acceleration):
        x["status"] = "0DTE CANDIDATE"
    elif preferred or (usable and aligned and (momentum or acceleration)):
        x["status"] = "0DTE WATCH"
    elif momentum or acceleration:
        x["status"] = "RE-SCAN"
    else:
        x["status"] = "WATCH / WAIT"


def main():
    scan_mode = os.getenv("SCAN_MODE") or "scheduled"
    session = market_session()

    rows = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(scan_one, t): t for t in TICKERS}
        for fut in as_completed(futures):
            try:
                x = fut.result()
            except Exception:
                x = None
            if x:
                rows.append(x)

    rows.sort(key=lambda x: x["score"], reverse=True)
    news_pool = rows[:60]
    add_news(news_pool)
    for x in rows:
        x.setdefault("news_items", [])
        x.setdefault("news", "")
        x.setdefault("catalyst", False)

    option_pool = sorted(
        rows,
        key=lambda x: (
            1 if x.get("catalyst") else 0,
            1 if x.get("volume_acceleration", 0) >= 1.25 else 0,
            abs(x.get("move_5m", 0)),
            x.get("score", 0),
        ),
        reverse=True,
    )[:35]

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(options, x["ticker"]): x for x in option_pool}
        for fut in as_completed(futures):
            x = futures[fut]
            try:
                result = fut.result()
            except Exception:
                result = ([], "No same-day chain returned", None)
            enrich_options(x, result)

    scanned = {x["ticker"] for x in option_pool}
    for x in rows:
        if x["ticker"] not in scanned:
            catalyst = x.get("catalyst", False)
            momentum = abs(x["day_move"]) >= 3 and x["volume_ratio"] >= 1.5
            x["status"] = "RE-SCAN" if momentum or catalyst else "WATCH / WAIT"
            x["option_flow_direction"] = "NEUTRAL"
            x["option_direction"] = "NEUTRAL"
            x["option_source"] = "Not scanned in this wave"
            x["option_timestamp"] = None
            x["options_quality"] = "NONE"
            x["zero_dte"] = False
            x["preferred_contracts"] = []
            x["usable_contracts"] = []
            x["options"] = []

    rows.sort(key=lambda x: (
        1 if x.get("preferred_contracts") else 0,
        1 if x.get("catalyst") else 0,
        1 if x.get("volume_acceleration", 0) >= 1.25 else 0,
        x.get("score", 0),
    ), reverse=True)
    top = rows[:60]

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "market_date": datetime.now(ET).date().isoformat(),
        "market_session": session,
        "scan_mode": scan_mode,
        "source": "Yahoo public 5m price/news + CBOE public delayed options chain (15m) with Nasdaq fallback; not tick-by-tick",
        "data_quality": "DELAYED_BEST_EFFORT",
        "universe_size": len(TICKERS),
        "scanned_rows": len(rows),
        "news_universe": len(news_pool),
        "option_chain_universe": len(option_pool),
        "preferred_contract_range": "$0.10-$0.30 ask",
        "watch_contract_range": "$0.31-$0.50 ask",
        "usable_contract_range": "$0.10-$0.75 ask",
        "contract_rules": {
            "preferred_ask_max": 0.30,
            "watch_ask_max": 0.50,
            "min_delta": 0.25,
            "preferred_delta": 0.40,
            "near_atm_pct": 3.0,
            "preferred_spread_max": 0.05,
            "usable_spread_max": 0.10,
            "min_volume": 20,
        },
        "candidates": top,
    }
    os.makedirs("data", exist_ok=True)
    with open("data/market.json", "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(json.dumps({
        "generated_at": out["generated_at"],
        "session": session,
        "scanned": len(rows),
        "news_universe": len(news_pool),
        "option_chain_universe": len(option_pool),
        "actionable": [
            (x["ticker"], x["day_move"], x["volume_ratio"], len(x.get("preferred_contracts", [])), x["status"])
            for x in top[:12]
        ],
    }))


if __name__ == "__main__":
    main()
