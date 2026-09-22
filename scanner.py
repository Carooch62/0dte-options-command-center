#!/usr/bin/env python3
import json, os, re, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
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


def pct(a, b):
    return (a / b - 1) * 100 if b else 0


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


def scan_one(t):
    try:
        d = chart(t)
        q = d["indicators"]["quote"][0]
        c = [x for x in q.get("close", []) if x is not None]
        v = [x for x in q.get("volume", []) if x is not None]
        if len(c) < 10:
            return None
        price = c[-1]
        day_move = pct(price, c[0])
        look = max(0, len(c) - 13)
        short_move = pct(price, c[look]) if c[look] else 0
        hist = v[:-5][-20:]
        avgv = sum(hist) / max(1, len(hist))
        recentv = sum(v[-5:]) / max(1, len(v[-5:]))
        vol_ratio = recentv / avgv if avgv else 0
        score = abs(day_move) * 1.5 + abs(short_move) * 2 + max(0, vol_ratio - 1) * 2
        return {
            "ticker": t,
            "price": round(price, 2),
            "day_move": round(day_move, 2),
            "recent_move": round(short_move, 2),
            "volume_ratio": round(vol_ratio, 2),
            "score": round(score, 2),
        }
    except Exception:
        return None


def add_news(items):
    now = time.time()
    for x in items:
        fresh = []
        for n in news(x["ticker"]):
            ts = n.get("providerPublishTime", 0)
            if ts and now - ts < 36 * 3600:
                fresh.append({
                    "title": n.get("title", ""),
                    "publisher": n.get("publisher", ""),
                    "url": n.get("link", ""),
                    "age_hours": round((now - ts) / 3600, 1),
                })
        x["news"] = fresh[:4]
        x["catalyst"] = bool(fresh)


def parse_osi(symbol):
    if not symbol:
        return None
    m = re.search(r"(\d{6})([CP])(\d{8})$", str(symbol).strip())
    if not m:
        return None
    yymmdd, side, strike_raw = m.groups()
    try:
        exp = datetime.strptime(yymmdd, "%y%m%d").date()
        strike = int(strike_raw) / 1000.0
        return exp, ("call" if side == "C" else "put"), strike
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
        if not exp:
            continue
        strike = num(row.get("strike") or row.get("strikePrice"))
        if not strike:
            continue
        for side, prefix in (("call", "c_"), ("put", "p_")):
            bid = num(row.get(prefix+"Bid") or row.get(prefix+"bid"))
            ask = num(row.get(prefix+"Ask") or row.get(prefix+"ask"))
            last = num(row.get(prefix+"Last") or row.get(prefix+"last"))
            mid = (bid+ask)/2 if bid > 0 and ask > 0 else last
            if mid <= 0:
                continue
            out.append({"side":side,"strike":strike,"bid":round(bid,2),"ask":round(ask,2),
                        "mid":round(mid,2),"last":round(last,2),
                        "volume":int(num(row.get(prefix+"Volume") or row.get(prefix+"volume"))),
                        "oi":int(num(row.get(prefix+"Openinterest") or row.get(prefix+"OpenInterest") or row.get(prefix+"openInterest"))),
                        "iv":0,"delta":0,"gamma":0,"theta":0,"vega":0,
                        "expiry":exp.isoformat(),"dte":(exp-today).days,"source":"Nasdaq public chain",
                        "option_timestamp":None})
    return out


def nasdaq_options(t):
    try:
        today = datetime.now(ET).date()
        u = f"https://api.nasdaq.com/api/quote/{t}/option-chain"
        h = {**HEADERS, "Referer":"https://www.nasdaq.com/"}
        r = requests.get(u, params={"assetclass":"stocks","limit":"1000"}, headers=h, timeout=12)
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
    """Rank contracts for the user's low-premium, momentum-focused strategy."""
    price = stock["price"]
    day = stock["day_move"]
    preferred_side = "call" if day >= 0 else "put"
    side_bonus = 2.5 if o["side"] == preferred_side else 0
    spread = max(0.0, o["ask"] - o["bid"]) if o["bid"] > 0 and o["ask"] > 0 else 9.99
    spread_pct = spread / max(o["mid"], 0.01)
    volume = o["volume"]
    oi = o["oi"]
    delta = abs(o.get("delta", 0))
    gamma = o.get("gamma", 0)
    dist = abs(o["strike"] - price) / max(price, 0.01)

    # Preferred $0.10-$0.30, but allow usable contracts up to $0.75.
    if 0.10 <= o["mid"] <= 0.30:
        price_score = 5.0
    elif 0.30 < o["mid"] <= 0.50:
        price_score = 4.0
    elif 0.50 < o["mid"] <= 0.75:
        price_score = 2.5
    elif 0.75 < o["mid"] <= 1.25:
        price_score = 1.0
    else:
        price_score = -3.0

    liquidity = min(5.0, (volume ** 0.5) / 20) + min(2.0, (oi ** 0.5) / 20)
    delta_score = max(0.0, 4.0 - abs(delta - 0.50) * 8) if delta else 0
    gamma_score = min(3.0, gamma * 20) if gamma else 0
    spread_score = max(-5.0, 3.0 - spread_pct * 5)
    atm_score = max(0.0, 3.0 - dist * 30)

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
        o["preferred_price"] = 0.10 <= o["mid"] <= 0.30
        o["usable_price"] = 0.10 <= o["mid"] <= 0.75

    calls = sum(o["volume"] for o in zero if o["side"] == "call")
    puts = sum(o["volume"] for o in zero if o["side"] == "put")
    ratio = round(calls / puts, 2) if puts else (99 if calls else 0)

    direction = "CALL" if x["day_move"] > 0.5 else "PUT" if x["day_move"] < -0.5 else "NEUTRAL"
    preferred = [o for o in zero if o["preferred_price"] and o["volume"] >= 20 and o["spread_pct"] <= 60]
    usable = [o for o in zero if o["usable_price"] and o["volume"] >= 20 and o["spread_pct"] <= 75]
    preferred.sort(key=lambda o:o["contract_score"], reverse=True)
    usable.sort(key=lambda o:o["contract_score"], reverse=True)

    x["options"] = sorted(zero, key=lambda o:o["contract_score"], reverse=True)[:40]
    x["preferred_contracts"] = preferred[:5]
    x["cheap_contracts"] = preferred[:5]  # backward compatible with current dashboard
    x["usable_contracts"] = usable[:8]
    x["zero_dte"] = bool(zero)
    x["option_call_volume"] = calls
    x["option_put_volume"] = puts
    x["option_call_put_ratio"] = ratio
    x["option_direction"] = direction
    x["option_source"] = source
    x["option_timestamp"] = timestamp

    # Scanner status is intentionally not ENTER-READY. That requires live confirmation.
    momentum = abs(x["day_move"]) >= 3 and x["volume_ratio"] >= 1.5
    flow_aligned = (direction == "CALL" and ratio >= 1.25) or (direction == "PUT" and ratio <= 0.80)
    if preferred:
        x["status"] = "0DTE CANDIDATE"
    elif usable and momentum and (flow_aligned or ratio == 0):
        x["status"] = "0DTE WATCH"
    elif zero and momentum:
        x["status"] = "0DTE WATCH"
    elif momentum:
        x["status"] = "RE-SCAN"
    else:
        x["status"] = "WATCH / WAIT"


def main():
    rows = [x for t in TICKERS if (x := scan_one(t))]
    rows.sort(key=lambda x:x["score"], reverse=True)
    top = rows[:30]
    add_news(top)

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(options, x["ticker"]): x for x in top}
        for fut in as_completed(futures):
            x = futures[fut]
            try:
                result = fut.result()
            except Exception:
                result = ([], "No same-day chain returned", None)
            enrich_options(x, result)

    # Bring actionable option setups toward the top without hiding broad momentum candidates.
    top.sort(key=lambda x:(1 if x.get("preferred_contracts") else 0,
                           1 if x.get("usable_contracts") else 0,
                           x.get("score",0)), reverse=True)

    out = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "market_date": datetime.now(ET).date().isoformat(),
        "source": "Yahoo public price/news + CBOE public delayed options chain (15-minute delayed); Nasdaq fallback; not tick-by-tick",
        "universe_size": len(TICKERS),
        "option_chain_universe": len(top),
        "preferred_contract_range": "$0.10-$0.30",
        "usable_contract_range": "$0.10-$0.75",
        "candidates": top,
    }
    os.makedirs("data", exist_ok=True)
    with open("data/market.json", "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(json.dumps({
        "generated_at": out["generated_at"],
        "option_chain_universe": len(top),
        "actionable": [
            (x["ticker"], x["day_move"], x["volume_ratio"],
             len(x.get("preferred_contracts", [])), x["status"])
            for x in top[:12]
        ],
    }))


if __name__ == "__main__":
    main()
