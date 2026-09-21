#!/usr/bin/env python3
import json, os, re, time
from datetime import datetime, timezone, date
from zoneinfo import ZoneInfo
import requests

UA = "Mozilla/5.0 (0DTE-Options-Command-Center; GitHub Actions)"
S = requests.Session()
S.headers.update({
    "User-Agent": UA,
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nasdaq.com/"
})

TICKERS = """
AAPL AMD AMZN AVGO BA BABA BAC COIN COST CRM CVNA CVX DIS DKNG GOOGL HOOD INTC IREN JPM
LLY MARA META MSFT MU NFLX NKE NVDA ORCL PANW PLTR QCOM RBLX RKLB SMCI SMR SOFI TSLA TSM
UAL UBER UNH WMT XOM XPEV AAL ABNB ADI ADP ADBE AEP AES AMAT ANET ANF APD ARM ASML AXON
CARR CAT CCL CELH CFLT CMCSA COP CRWD CVX DASH DDOG DE DECK DELL DOCU EA ENPH F FDX
FTNT GE GEV GILD GIS GM GME GS HIMS IBM INOD ISRG JD JNJ KKR KO LULU LVS LYFT MCD
MDLZ MELI MNST MRVL NET NIO NOW OXY PDD PEP PFE PG PINS PLUG PYPL RDDT RIVN ROKU
RTX SBUX SCHW SLB SNOW SNAP SOFI SPOT SQ TGT TMO TTD TWLO TXN U V VEEV VLO
WBD WDC WDAY XLF XLK XLU XLY ZM ZS
""".split()

ET = ZoneInfo("America/New_York")

def chart(t, interval="5m", rng="1d"):
    u=f"https://query1.finance.yahoo.com/v8/finance/chart/{t}?interval={interval}&range={rng}&events=div%2Csplits"
    r=S.get(u,timeout=12); r.raise_for_status()
    return r.json()["chart"]["result"][0]

def news(t):
    try:
        r=S.get("https://query1.finance.yahoo.com/v1/finance/search",
                params={"q":t,"newsCount":8,"quotesCount":0},timeout=10)
        r.raise_for_status(); return r.json().get("news",[])
    except Exception: return []

def pct(a,b): return (a/b-1)*100 if b else 0

def scan_one(t):
    try:
        d=chart(t)
        q=d["indicators"]["quote"][0]
        c=[x for x in q.get("close",[]) if x is not None]
        v=[x for x in q.get("volume",[]) if x is not None]
        if len(c)<10: return None
        price=c[-1]; day_move=pct(price,c[0])
        look=max(0,len(c)-13)
        short_move=pct(price,c[look]) if c[look] else 0
        avgv=sum(v[:-5][-20:])/max(1,len(v[:-5][-20:]))
        recentv=sum(v[-5:])/max(1,len(v[-5:]))
        vol_ratio=recentv/avgv if avgv else 0
        score=abs(day_move)*1.5 + abs(short_move)*2 + max(0,vol_ratio-1)*2
        return {"ticker":t,"price":round(price,2),"day_move":round(day_move,2),
                "recent_move":round(short_move,2),"volume_ratio":round(vol_ratio,2),
                "score":round(score,2)}
    except Exception: return None

def add_news(items):
    for x in items:
        ns=news(x["ticker"]); now=time.time(); fresh=[]
        for n in ns:
            ts=n.get("providerPublishTime",0)
            if ts and now-ts < 36*3600:
                fresh.append({"title":n.get("title",""),"publisher":n.get("publisher",""),
                              "url":n.get("link",""),"age_hours":round((now-ts)/3600,1)})
        x["news"]=fresh[:4]; x["catalyst"]=len(fresh)>0

def num(v):
    if v is None: return 0.0
    if isinstance(v,(int,float)): return float(v)
    s=str(v).replace(",","").replace("$","").strip()
    if s in ("","-","--","N/A","n/a"): return 0.0
    try: return float(s)
    except Exception: return 0.0

def norm_expiry(v):
    if not v: return None
    s=str(v).strip()
    for fmt in ("%m/%d/%Y","%Y-%m-%d","%m/%d/%y","%b %d, %Y"):
        try: return datetime.strptime(s,fmt).date()
        except Exception: pass
    return None

def parse_nasdaq_rows(rows, today):
    contracts=[]
    for row in rows or []:
        exp=norm_expiry(row.get("expiryDate") or row.get("expirationDate") or row.get("expiry"))
        strike=num(row.get("strike") or row.get("strikePrice"))
        if not exp or not strike: continue
        for side,prefix in (("call","c_"),("put","p_")):
            bid=num(row.get(prefix+"Bid") or row.get(prefix+"bid"))
            ask=num(row.get(prefix+"Ask") or row.get(prefix+"ask"))
            last=num(row.get(prefix+"Last") or row.get(prefix+"last"))
            vol=int(num(row.get(prefix+"Volume") or row.get(prefix+"volume")))
            oi=int(num(row.get(prefix+"Openinterest") or row.get(prefix+"OpenInterest") or row.get(prefix+"openInterest")))
            mid=(bid+ask)/2 if bid>0 and ask>0 else last
            if mid<=0: continue
            contracts.append({
                "side":side,"strike":strike,"bid":round(bid,2),"ask":round(ask,2),
                "mid":round(mid,2),"volume":vol,"oi":oi,
                "expiry":exp.isoformat(),"dte":(exp-today).days,"source":"Nasdaq public chain"
            })
    return contracts

def nasdaq_options(t):
    try:
        today=datetime.now(ET).date()
        u=f"https://api.nasdaq.com/api/quote/{t}/option-chain"
        params={"assetclass":"stocks","fromdate":today.isoformat(),
                "todate":today.isoformat(),"limit":"1000"}
        r=S.get(u,params=params,timeout=15); r.raise_for_status()
        payload=r.json()
        rows=((payload.get("data") or {}).get("table") or {}).get("rows") or []
        contracts=parse_nasdaq_rows(rows,today)
        if contracts: return contracts
        r=S.get(u,params={"assetclass":"stocks","limit":"1000"},timeout=15)
        r.raise_for_status(); payload=r.json()
        rows=((payload.get("data") or {}).get("table") or {}).get("rows") or []
        return parse_nasdaq_rows(rows,today)
    except Exception: return []

def yahoo_crumb_options(t):
    try:
        crumb=S.get("https://query2.finance.yahoo.com/v1/test/getcrumb",timeout=10).text.strip()
        r=S.get(f"https://query2.finance.yahoo.com/v7/finance/options/{t}",
                params={"crumb":crumb},timeout=12)
        r.raise_for_status(); res=r.json()["optionChain"]["result"][0]
        exps=res.get("expirationDates",[])
        if not exps: return []
        today=datetime.now(ET).date(); target=None
        for e in exps:
            d=datetime.fromtimestamp(e,timezone.utc).date()
            if d>=today: target=e; break
        if target is None: target=exps[0]
        rr=S.get(f"https://query2.finance.yahoo.com/v7/finance/options/{t}",
                 params={"date":target,"crumb":crumb},timeout=12)
        rr.raise_for_status()
        opt=rr.json()["optionChain"]["result"][0].get("options",[{}])[0]
        expiry=datetime.fromtimestamp(target,timezone.utc).date(); out=[]
        for side in ("calls","puts"):
            for c in opt.get(side,[]):
                bid=num(c.get("bid")); ask=num(c.get("ask")); last=num(c.get("lastPrice"))
                mid=(bid+ask)/2 if bid and ask else last
                if mid>0:
                    out.append({"side":side[:-1],"strike":num(c.get("strike")),
                                "bid":round(bid,2),"ask":round(ask,2),"mid":round(mid,2),
                                "volume":int(num(c.get("volume"))),"oi":int(num(c.get("openInterest"))),
                                "expiry":expiry.isoformat(),"dte":(expiry-today).days,
                                "source":"Yahoo public options"})
        return out
    except Exception: return []

def options(t):
    data=nasdaq_options(t)
    return data if data else yahoo_crumb_options(t)

def enrich_options(x):
    opts=options(x["ticker"]); today=datetime.now(ET).date()
    zero=[o for o in opts if o.get("expiry")==today.isoformat() or o.get("dte")==0]
    zero.sort(key=lambda o:(o["volume"],o["oi"]),reverse=True)
    cheap=[]
    for o in zero:
        spread=o["ask"]-o["bid"] if o["ask"] and o["bid"] else 99
        if .10 <= o["mid"] <= .30 and o["volume"]>=5 and spread <= max(.10,o["mid"]*.60):
            o["spread"]=round(spread,2); cheap.append(o)
    calls=sum(o["volume"] for o in zero if o["side"]=="call")
    puts=sum(o["volume"] for o in zero if o["side"]=="put")
    x["options"]=zero[:30]; x["cheap_contracts"]=cheap[:8]
    x["zero_dte"]=bool(zero)
    x["option_call_volume"]=calls; x["option_put_volume"]=puts
    x["option_call_put_ratio"]=round(calls/puts,2) if puts else (99 if calls else 0)
    x["option_source"]=zero[0]["source"] if zero else ("No same-day chain returned" if not opts else "Chain returned, no 0DTE")
    if cheap: x["status"]="0DTE CANDIDATE"
    elif zero and abs(x["day_move"])>=3 and x["volume_ratio"]>=1.5: x["status"]="0DTE WATCH"
    elif abs(x["day_move"])>=3 and x["volume_ratio"]>=1.5: x["status"]="RE-SCAN"
    else: x["status"]="WATCH / WAIT"

def main():
    rows=[x for t in TICKERS if (x:=scan_one(t))]
    rows.sort(key=lambda x:x["score"],reverse=True)
    top=rows[:20]; add_news(top)
    for x in top: enrich_options(x)
    out={"generated_at":datetime.now(timezone.utc).isoformat(),
         "market_date":datetime.now(ET).date().isoformat(),
         "source":"Yahoo public price/news endpoints + Nasdaq public option-chain endpoint; best-effort/free data; not tick-by-tick",
         "universe_size":len(TICKERS),"candidates":top}
    os.makedirs("data",exist_ok=True)
    with open("data/market.json","w") as f: json.dump(out,f,separators=(",",":"))
    print(json.dumps({"generated_at":out["generated_at"],
                      "candidates":[(x["ticker"],x["day_move"],x["volume_ratio"],len(x["cheap_contracts"])) for x in top[:10]]}))

if __name__=="__main__":
    main()
