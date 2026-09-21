#!/usr/bin/env python3
import json, math, os, re, time
from datetime import datetime, timezone, timedelta
import requests

UA = "Mozilla/5.0 (0DTE-Options-Command-Center; GitHub Actions)"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept": "application/json,text/plain,*/*"})

# Broad, liquid universe. The engine is designed to re-scan names that accelerate later.
TICKERS = """
AAPL AMD AMZN AVGO BA BABA BAC COIN COST CRM CVNA CVX DIS DKNG GOOGL HOOD INTC IREN JPM
LLY MARA META MSFT MU NFLX NKE NVDA ORCL PANW PLTR QCOM RBLX RKLB SMCI SMR SOFI TSLA TSM
UAL UBER UNH WMT XOM XPEV AAL ABNB ADI ADP ADBE AEP AES AMAT ANET ANF APD ARM ASML AXON
CARR CAT CCL CELH CFLT CMCSA COP CRWD CVX DASH DDOG DE DECK DELL DOCU EA ENPH F FDX
FTNT GE GEV GILD GIS GM GME GS HIMS IBM INOD ISRG JD JNJ KKR KO LULU LVS LYFT MCD
MDLZ MELI MNST MRVL NET NIO NOW OXY PDD PEP PFE PG PINS PLUG PYPL RDDT RIVN ROKU
RTX SBUX SCHW SLB SNOW SNAP SOFI SPOT SQ TGT TGT TMO TTD TTD TWLO TXN U V VEEV VLO
WBD WDC WDAY XLF XLK XLU XLY ZM ZS
""".split()

def chart(t, interval="5m", rng="1d"):
    u=f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?interval={interval}&range={rng}&events=div%2Csplits"
    r=S.get(u,timeout=12); r.raise_for_status()
    return r.json()["chart"]["result"][0]

def news(t):
    try:
        r=S.get("https://query1.finance.yahoo.com/v1/finance/search",
                params={"q":t,"newsCount":8,"quotesCount":0},timeout=10)
        r.raise_for_status()
        return r.json().get("news",[])
    except Exception:
        return []

def pct(a,b): return (a/b-1)*100 if b else 0

def scan_one(t):
    try:
        d=chart(t)
        q=d["indicators"]["quote"][0]
        c=[x for x in q.get("close",[]) if x is not None]
        v=[x for x in q.get("volume",[]) if x is not None]
        if len(c)<10: return None
        price=c[-1]
        day_move=pct(price,c[0])
        look=max(0,len(c)-13)
        short_move=pct(price,c[look]) if c[look] else 0
        avgv=sum(v[:-5][-20:])/max(1,len(v[:-5][-20:]))
        recentv=sum(v[-5:])/max(1,len(v[-5:]))
        vol_ratio=recentv/avgv if avgv else 0
        score=abs(day_move)*1.5 + abs(short_move)*2 + max(0,vol_ratio-1)*2
        return {"ticker":t,"price":round(price,2),"day_move":round(day_move,2),
                "recent_move":round(short_move,2),"volume_ratio":round(vol_ratio,2),
                "score":round(score,2)}
    except Exception:
        return None

def add_news(items):
    for x in items:
        ns=news(x["ticker"])
        now=time.time()
        fresh=[]
        for n in ns:
            ts=n.get("providerPublishTime",0)
            if ts and now-ts < 36*3600:
                fresh.append({"title":n.get("title",""),"publisher":n.get("publisher",""),
                              "url":n.get("link",""),"age_hours":round((now-ts)/3600,1)})
        x["news"]=fresh[:4]
        x["catalyst"] = len(fresh)>0

def options(t):
    # Yahoo's public options endpoint is best-effort; no credentials are used.
    try:
        r=S.get(f"https://query2.finance.yahoo.com/v7/finance/options/{t}",timeout=12)
        r.raise_for_status()
        res=r.json()["optionChain"]["result"][0]
        exps=res.get("expirationDates",[])
        if not exps: return []
        # Prefer the nearest expiration that is today in ET/US trading context.
        today=datetime.now(timezone.utc).date()
        target=None
        for e in exps:
            dt=datetime.fromtimestamp(e,timezone.utc).date()
            if dt>=today:
                target=e; break
        if target is None: target=exps[0]
        rr=S.get(f"https://query2.finance.yahoo.com/v7/finance/options/{t}?date={target}",timeout=12)
        rr.raise_for_status()
        opt=rr.json()["optionChain"]["result"][0].get("options",[{}])[0]
        out=[]
        for side in ("calls","puts"):
            for c in opt.get(side,[]):
                bid=c.get("bid") or 0; ask=c.get("ask") or 0
                last=c.get("lastPrice") or 0
                vol=c.get("volume") or 0; oi=c.get("openInterest") or 0
                mid=(bid+ask)/2 if bid and ask else last
                if vol>0 and mid>0:
                    out.append({"side":side[:-1],"strike":c.get("strike"),"bid":bid,"ask":ask,
                                "mid":round(mid,2),"volume":vol,"oi":oi,
                                "expiry":datetime.fromtimestamp(target,timezone.utc).strftime("%Y-%m-%d")})
        out.sort(key=lambda z:z["volume"],reverse=True)
        return out[:20]
    except Exception:
        return []

def main():
    rows=[x for t in TICKERS if (x:=scan_one(t))]
    rows.sort(key=lambda x:x["score"],reverse=True)
    top=rows[:15]
    add_news(top)
    for x in top:
        x["options"]=options(x["ticker"])
        # Flag contracts near $0.10-$0.30, with volume and a relatively tight spread.
        cheap=[]
        for o in x["options"]:
            spread=o["ask"]-o["bid"] if o["ask"] and o["bid"] else 99
            if .10 <= o["mid"] <= .30 and o["volume"]>=5 and spread <= max(.10,o["mid"]*.60):
                cheap.append(o)
        x["cheap_contracts"]=cheap[:6]
        x["status"]="RE-SCAN" if abs(x["day_move"])>=3 and x["volume_ratio"]>=1.5 else "WATCH / WAIT"
    out={"generated_at":datetime.now(timezone.utc).isoformat(),
         "source":"Yahoo Finance public endpoints; best-effort/free data; not tick-by-tick",
         "universe_size":len(TICKERS),"candidates":top}
    os.makedirs("data",exist_ok=True)
    with open("data/market.json","w") as f: json.dump(out,f,separators=(",",":"))
    print(json.dumps({"generated_at":out["generated_at"],"candidates":[(x["ticker"],x["day_move"],x["volume_ratio"]) for x in top[:10]]}))

if __name__=="__main__":
    main()
