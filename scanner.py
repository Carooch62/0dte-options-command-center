#!/usr/bin/env python3
import json
import os
import re
import time
import math
import random
import threading
from pathlib import Path
from datetime import timedelta
from quality import number, parse_time, freshness, contract_checks, valid_quote
from market_clock import session_info, calendar
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone, time as dtime
from zoneinfo import ZoneInfo

import requests

UA = "Mozilla/5.0 (0DTE-Options-Command-Center; GitHub Actions)"
ET = ZoneInfo("America/New_York")

TICKERS = """
HPE CALM NOC AAPL AMD AMZN AVGO BA BABA BAC COIN COST CRM CVNA CVX DIS DKNG GOOGL HOOD INTC IREN JPM
LLY MARA META MSFT MU NFLX NKE NVDA ORCL PANW PLTR QCOM RBLX RKLB SMCI SMR SOFI TSLA TSM
UAL UBER UNH WMT XOM XPEV AAL ABNB ADI ADP ADBE AEP AES AMAT ANET ANF APD ARM ASML AXON
CARR CAT CCL CELH CFLT CMCSA COP CRWD DASH DDOG DE DECK DELL DOCU EA ENPH F FDX
FTNT GE GEV GILD GIS GM GME GS HIMS IBM INOD ISRG JD JNJ KKR KO LULU LVS LYFT MCD
MDLZ MELI MNST MRVL NET NIO NOW OXY PDD PEP PFE PG PINS PLUG PYPL RDDT RIVN ROKU
RTX SBUX SCHW SLB SNOW SNAP SPOT XYZ TGT TMO TTD TWLO TXN U V VEEV VLO
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
        return number(v, 0.0)
    s = str(v).replace(",", "").replace("$", "").strip()
    if s in ("", "-", "--", "N/A", "n/a", "None"):
        return 0.0
    try:
        return number(s, 0.0)
    except Exception:
        return 0.0


def pct(a, b):
    return (a / b - 1) * 100 if b else 0.0


ERRORS = []
ERROR_LOCK = threading.Lock()

def record_error(ticker, stage, error):
    # Record categories/status only; never credentials or response bodies.
    item = {'ticker': ticker, 'stage': stage, 'error': type(error).__name__}
    if isinstance(error, requests.HTTPError) and error.response is not None:
        item['http_status'] = error.response.status_code
    with ERROR_LOCK:
        ERRORS.append(item)
    print(json.dumps({'data_error': item}), flush=True)

def market_session(now=None):
    return session_info(now)['session']

def request_json(url, **kwargs):
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=kwargs.pop('timeout', 8), **kwargs)
            r.raise_for_status()
            return r.json()
        except (requests.RequestException, ValueError) as exc:
            code = getattr(getattr(exc, 'response', None), 'status_code', None)
            if attempt == 2 or (code is not None and code != 429 and code < 500):
                raise
            time.sleep(min(2, .3 * 2 ** attempt + random.uniform(0, .2)))

def alpaca_chart(t):
    key, secret = os.getenv('APCA_API_KEY_ID'), os.getenv('APCA_API_SECRET_KEY')
    if not key or not secret:
        raise RuntimeError('independent provider not configured')
    feed = os.getenv('ALPACA_DATA_FEED', 'iex')
    now = datetime.now(timezone.utc)
    params = {'timeframe':'5Min', 'start':(now-timedelta(days=5)).isoformat(),
              'end':(now-timedelta(minutes=16)).isoformat() if feed == 'sip' else now.isoformat(),
              'feed':feed, 'limit':10000, 'adjustment':'all'}
    d = request_json(f'https://data.alpaca.markets/v2/stocks/{t}/bars', params=params,
                     headers={'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret})
    bars = d.get('bars') or []
    return {'timestamp':[parse_time(b['t']).timestamp() for b in bars],
            'indicators':{'quote':[{name:[b[field] for b in bars] for name,field in
                                   [('open','o'),('high','h'),('low','l'),('close','c'),('volume','v')]}]},
            'meta':{}, '_source':f'Alpaca {feed} bars', '_delay':15 if feed == 'sip' else 0}

def chart(t):
    for host in ('query1.finance.yahoo.com', 'query2.finance.yahoo.com'):
        try:
            d = request_json(f'https://{host}/v8/finance/chart/{t}',
                             params={'interval':'5m','range':'1d','includePrePost':'true'},
                             headers={'User-Agent':UA})['chart']['result'][0]
            d['_source'] = 'Yahoo 5m bars'; d['_delay'] = 0
            return d
        except Exception as exc:
            record_error(t, host, exc)
    return alpaca_chart(t)


def news(t):
    try:
        d=request_json('https://query1.finance.yahoo.com/v1/finance/search',
                       params={'q':t,'newsCount':8,'quotesCount':0},headers={'User-Agent':UA})
        return d.get('news',[])
    except Exception as exc:
        record_error(t,'news',exc)
        return []


def explicit_ticker(ticker, item):
    title = str(item.get("title", ""))
    link = str(item.get("link", ""))
    pat = re.compile(r"(?<![A-Z0-9])" + re.escape(ticker) + r"(?![A-Z0-9])", re.I)
    return bool(pat.search(title) or pat.search(link))


def previous_session_close(data, bars, now):
    # previousClose is the last session close; chartPreviousClose is the start
    # of the requested range and may be several sessions old. A partial prior
    # session in an intraday response must never override the daily baseline.
    value = number(data.get('meta', {}).get('previousClose'))
    if value is not None and value > 0:
        return value, 'PROVIDER_PREVIOUS_CLOSE'
    prior = [b for b in bars if b['time'].astimezone(ET).date() < now.date()
             and dtime(9,30) <= b['time'].astimezone(ET).time() < dtime(16)]
    if prior:
        last = prior[-1]
        cal = calendar()
        expected = cal.date_to_session(now.date().isoformat(), direction='previous')
        if cal.is_session(now.date().isoformat()):
            expected = cal.previous_session(expected)
        close = parse_time(session_info(last['time'])['close_at'])
        if last['time'].astimezone(ET).date() == expected.date() and close and last['time'] + timedelta(minutes=5) == close:
            return last['close'], 'COMPLETED_PRIOR_SESSION'
    return None, 'UNAVAILABLE'


def scan_one(t, now=None, payload=None):
    now = (now or datetime.now(ET)).astimezone(ET)
    try:
        d = payload if payload is not None else chart(t)
        q = d['indicators']['quote'][0]
        bars = []
        for i, stamp in enumerate(d.get('timestamp') or []):
            dt = parse_time(stamp)
            values = {k: number(q.get(k, [])[i]) if i < len(q.get(k, [])) else None
                      for k in ('open','high','low','close','volume')}
            if not dt or any(values[k] is None for k in values): continue
            if min(values[k] for k in ('open','high','low','close')) <= 0 or values['volume'] < 0: continue
            if values['high'] < max(values['open'], values['close'], values['low']) or values['low'] > min(values['open'], values['close']): continue
            if dt + timedelta(minutes=5) > now: continue  # completed bars only
            bars.append({'time':dt, **values})
        bars.sort(key=lambda b:b['time'])
        info = session_info(now)
        op, cl = parse_time(info['open_at']), parse_time(info['close_at'])
        if info['session'] == 'PREMARKET':
            current = [b for b in bars if b['time'].astimezone(ET).date() == now.date() and b['time'] < op]
        else:
            current = [b for b in bars if op and op <= b['time'] < cl]
        if not current:
            if payload is None and os.getenv('APCA_API_KEY_ID') and not d.get('_source','').startswith('Alpaca'):
                return scan_one(t,now,alpaca_chart(t))
            record_error(t, 'no_completed_session_bars', ValueError()); return None
        # A successful HTTP response may contain old bars. Try the independent feed,
        # but only replace the primary result when its completed bar is newer.
        end = current[-1]['time']+timedelta(minutes=5)
        if payload is None and freshness(end.isoformat(),now,max_age=8) == 'STALE' and os.getenv('APCA_API_KEY_ID') and not d.get('_source','').startswith('Alpaca'):
            try:
                alternate=scan_one(t,now,alpaca_chart(t))
                if alternate and parse_time(alternate['bar_end']) > end:
                    return alternate
            except Exception as exc:
                record_error(t,'stale_price_fallback',exc)
        price = current[-1]['close']; first = current[0]['open']
        previous_close, previous_close_source = previous_session_close(d, bars, now)
        def move(minutes):
            target = current[-1]['time'] - timedelta(minutes=minutes)
            before = next((b for b in reversed(current) if b['time'] <= target), None)
            return round(pct(price,before['close']),2) if before else None
        m5,m15,m30,m60 = [move(n) for n in (5,15,30,60)]
        # Intraday volume burst: last up-to-three completed bars vs preceding up-to-20.
        recent = current[-3:]; baseline = current[max(0,len(current)-23):-3]
        prev = current[max(0,len(current)-6):-3]
        mean = lambda xs: sum(b['volume'] for b in xs)/len(xs) if xs else None
        vr = mean(recent)/mean(baseline) if mean(baseline) else None
        accel = mean(recent)/mean(prev) if mean(prev) else None
        total = sum(b['volume'] for b in current)
        vwap = sum((b['high']+b['low']+b['close'])/3*b['volume'] for b in current)/total if total else None
        direction = 'UP' if (m5 or 0) > 0 else 'DOWN' if (m5 or 0) < 0 else 'NEUTRAL'
        structure = current[-4:-1] or current[-1:]
        high,low = max(b['high'] for b in structure),min(b['low'] for b in structure)
        trigger = high if direction == 'UP' else low if direction == 'DOWN' else None
        invalid = (vwap if vwap and ((direction == 'UP' and vwap < price) or (direction == 'DOWN' and vwap > price)) else low if direction == 'UP' else high)
        day = pct(price,previous_close) if previous_close else None
        score = abs(day or 0)*1.2 + abs(m15 or 0)*1.8 + abs(m5 or 0)*2.2 + max(0,(vr or 0)-1)*2.2 + max(0,(accel or 0)-1)*1.5
        end = current[-1]['time']+timedelta(minutes=5)
        return {'ticker':t, 'price':round(price,4), 'day_move':round(day,2) if day is not None else None,
                'open_move':round(pct(price,first),2), 'previous_close':previous_close,
                'previous_close_source':previous_close_source,
                'move_5m':m5, 'recent_move':m15, 'move_30m':m30, 'move_60m':m60,
                'volume_ratio':round(vr,2) if vr is not None else None,
                'volume_acceleration':round(accel,2) if accel is not None else None,
                'vwap':round(vwap,4) if vwap else None,
                'vwap_distance_pct':round(pct(price,vwap),2) if vwap else None,
                'recent_high_15m':high, 'recent_low_15m':low, 'trigger_price':trigger,
                'invalidation_price':invalid, 'direction':direction, 'score':round(score,2),
                'bar_timestamp':current[-1]['time'].isoformat(), 'bar_end':end.isoformat(),
                'bar_complete':True, 'session_bar_count':len(current), 'market_date':now.date().isoformat(),
                'price_source':d.get('_source','Yahoo 5m bars'),
                'price_freshness':freshness(end.isoformat(),now, max_age=8),
                'price_received_at':now.isoformat(), 'baseline_ready':m5 is not None and vr is not None}
    except Exception as exc:
        record_error(t, 'price_scan', exc)
        return None


def add_news(items):
    def one(x):
        fresh = []
        for n in news(x["ticker"]):
            ts = n.get("providerPublishTime", 0)
            if not ts or not 0 <= time.time() - ts < 36 * 3600:
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

    with ThreadPoolExecutor(max_workers=6) as pool:
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
    payload = request_json(f'{CBOE_BASE}/{t}.json', headers=HEADERS)
    rows = (payload.get('data') or {}).get('options')
    if not isinstance(rows, list) or not rows:
        raise ValueError('empty or malformed CBOE chain')
    today = datetime.now(ET).date(); out = []; expiries = set()
    # The public payload clock is not documented as each quote's exchange as-of.
    # Retain it separately; never manufacture an exact quote timestamp from it.
    for row in rows:
        parsed = parse_osi(row.get('option'))
        if not parsed: continue
        exp,side,strike = parsed; expiries.add(exp.isoformat())
        if not 0 <= (exp-today).days <= 31: continue
        delta = number(row.get('delta')); gamma = number(row.get('gamma'))
        out.append({'contract_id':row['option'], 'side':side,'strike':strike,
                    'bid':number(row.get('bid')), 'ask':number(row.get('ask')),
                    'last':number(row.get('last_trade_price')), 'volume':int(num(row.get('volume'))),
                    'oi':int(num(row.get('open_interest'))),'delta':delta,'gamma':gamma,
                    'iv':number(row.get('iv')),'theta':number(row.get('theta')),
                    'delta_verified':delta is not None and -1 <= delta <= 1 and delta != 0,
                    'gamma_verified':gamma is not None and gamma >= 0,
                    'greeks_verified':delta is not None and gamma is not None and delta != 0 and gamma >= 0,
                    'expiry':exp.isoformat(),'dte':(exp-today).days,'source':'CBOE delayed (15m)',
                    'option_timestamp':None, 'payload_timestamp':payload.get('timestamp'),
                    'received_at':datetime.now(timezone.utc).isoformat(), 'minimum_delay_minutes':15,
                    'timestamp_basis':'PAYLOAD_TIME_NOT_QUOTE_TIME'})
    if not expiries: raise ValueError('no parsable expirations')
    return {'contracts':out,'source':'CBOE delayed (15m)', 'timestamp':None,
            'payload_timestamp':payload.get('timestamp'), 'expirations':sorted(expiries),
            'status':'SUCCESS' if any(o['dte']==0 for o in out) else 'NO_EXPIRATION_TODAY'}


def parse_nasdaq_rows(rows, today, max_days=0):
    out = []
    group_expiry = None
    for row in rows or []:
        group = row.get('expirygroup') or row.get('expiryGroup')
        if group:
            for fmt in ('%B %d, %Y','%b %d, %Y','%Y-%m-%d'):
                try: group_expiry = datetime.strptime(str(group).strip(),fmt).date(); break
                except ValueError: pass
        exp_raw = row.get("expiryDate") or row.get("expirationDate") or row.get("expiry")
        if not exp_raw and group_expiry:
            exp_raw = group_expiry.isoformat()
        if not exp_raw:
            continue
        exp = None
        for fmt in ("%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y", "%b %d, %Y"):
            try:
                exp = datetime.strptime(str(exp_raw).strip(), fmt).date(); break
            except Exception:
                pass
        if not exp and group_expiry:
            try:
                short = datetime.strptime(str(exp_raw).strip(),'%b %d')
                if (short.month,short.day)==(group_expiry.month,group_expiry.day): exp=group_expiry
            except ValueError: pass
        if not exp or not 0 <= (exp-today).days <= max_days:
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
                "expiry": exp.isoformat(), "dte": (exp-today).days, "source": "Nasdaq public chain", "contract_id": f"{exp.isoformat()}:{side}:{strike}",
                "option_timestamp": None, "greeks_verified": False,
            })
    return out


def nasdaq_options(t):
    today = datetime.now(ET).date()
    data = request_json(f'https://api.nasdaq.com/api/quote/{t}/option-chain',
                        params={'assetclass':'etf' if t in CORE_TICKERS else 'stocks','limit':'1000'},
                        headers={**HEADERS,'Referer':'https://www.nasdaq.com/'})
    rows = ((data.get('data') or {}).get('table') or {}).get('rows')
    if not isinstance(rows,list) or not rows: raise ValueError('empty Nasdaq chain')
    opts = parse_nasdaq_rows(rows,today,max_days=31)
    for o in opts:
        o['contract_id'] = f"{t}:{o['expiry']}:{o['side']}:{o['strike']}"
    # This fallback may be paginated/incomplete, so empty is not proof of no expiry.
    return {'contracts':opts,'source':'Nasdaq public chain','timestamp':None,
            'status':'SUCCESS' if any(o['dte']==0 for o in opts) else 'EMPTY_UNVERIFIED'}

def options(t):
    failures=[]
    for provider_name,provider in (('fetch_cboe',fetch_cboe),('nasdaq_options',nasdaq_options)):
        try:
            result=provider(t); result['errors']=failures
            return result
        except Exception as exc:
            record_error(t,provider_name,exc); failures.append(provider_name+':'+type(exc).__name__)
    return {'contracts':[],'source':'Options providers unavailable','timestamp':None,
            'status':'SOURCE_FAILURE','errors':failures}


def contract_score(o, stock):
    if not valid_quote(o): return -999.0
    delta=abs(num(o.get('delta'))); spread=o['ask']-o['bid']
    dist=abs(o['strike']-stock['price'])/stock['price']
    liquidity=min(5,max(0,num(o.get('volume')))**.5/15)+min(2,max(0,num(o.get('oi')))**.5/15)
    expected='call' if stock['direction']=='UP' else 'put' if stock['direction']=='DOWN' else None
    return round(liquidity + max(0,5-abs(delta-.45)*10) + max(0,4-dist*100)
                 + max(-6,4-spread*50) + (3 if o['side']==expected else 0)
                 + (5 if .10 <= o['ask'] <= .30 else 1),3)

def enrich_options(x, result):
    if isinstance(result,tuple):
        opts,source,ts=result
        result={'contracts':opts,'source':source,'timestamp':ts,'status':'SUCCESS' if any(o['dte']==0 for o in opts) else 'EMPTY_UNVERIFIED'}
    retained=[dict(o) for o in result['contracts'] if isinstance(o.get('dte'),int) and 0<=o['dte']<=31]
    zero=[o for o in retained if o['dte']==0]
    for o in retained:
        o.update(contract_checks(o,x['price']))
        o['contract_id']=o.get('contract_id') or f"{x['ticker']}:{o.get('expiry')}:{o['side']}:{o['strike']}"
        o['contract_score']=contract_score(o,x)
        ask=num(o.get('ask'))
        o['preferred_price']=.10<=ask<=.30
        o['watch_price']=.30<ask<=.50
        o['usable_price']=.10<=ask<=.75
        o['option_timestamp']=o.get('option_timestamp') or result.get('timestamp')
        o['quote_freshness']=freshness(o.get('option_timestamp'),delay=num(o.get('minimum_delay_minutes')),max_age=20)
    x['expiry_groups']={}
    for key,lo,hi in [('week',1,7),('two_weeks',8,14),('month',15,31)]:
        group=[o for o in retained if lo<=o['dte']<=hi]
        status=('SUCCESS' if group else 'NO_EXPIRATION_IN_WINDOW'
                if result.get('source')=='CBOE delayed (15m)' and result.get('status')!='SOURCE_FAILURE'
                else result.get('status') if result.get('status')=='SOURCE_FAILURE' else 'EMPTY_UNVERIFIED')
        x['expiry_groups'][key]={'options':group,'chain_status':status}
    near=[o for o in zero if o['near_atm']]
    calls=sum(o['volume'] for o in near if o['side']=='call'); puts=sum(o['volume'] for o in near if o['side']=='put')
    ratio=round(calls/puts,2) if puts else (99 if calls else 0)
    balance='CALL' if ratio>=1.25 else 'PUT' if ratio<=.80 and puts else 'NEUTRAL'
    base=lambda o: o['quote_valid'] and o['volume']>=20 and o['near_atm'] and o['delta_ok']
    preferred=[o for o in zero if base(o) and o['preferred_price'] and o['tight_spread']]
    usable=[o for o in zero if base(o) and o['usable_price'] and o['usable_spread']]
    for arr in (preferred,usable,zero): arr.sort(key=lambda o:o['contract_score'],reverse=True)
    x.update(options=zero, preferred_contracts=preferred, cheap_contracts=preferred,
             usable_contracts=usable, zero_dte=bool(zero),option_call_volume=calls,option_put_volume=puts,
             option_call_put_ratio=ratio,option_flow_direction=balance,option_direction=balance,
             volume_balance=balance, option_source=result['source'],option_timestamp=result.get('timestamp'),
             option_payload_timestamp=result.get('payload_timestamp'), chain_status=result['status'],
             chain_attempted=True, chain_errors=result.get('errors',[]), expirations=result.get('expirations',[]),
             options_quality='FULL_GREEKS' if any(o.get('greeks_verified') for o in zero) else 'CHAIN_ONLY' if zero else 'NONE')

CORE_TICKERS=('SPY','QQQ','IWM','SMH','GLD','XLF')

def discover_tickers():
    def one(screen):
        try:
            p=request_json('https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved',
                           params={'scrIds':screen,'count':25},headers=HEADERS)
            quotes=p['finance']['result'][0]['quotes']
            names=[q['symbol'] for q in quotes if re.fullmatch(r'[A-Z][A-Z0-9.-]{0,9}',q.get('symbol',''))]
            return screen,names,{'status':'SUCCESS','count':len(names)}
        except Exception as exc:
            record_error('*',screen,exc)
            return screen,[],{'status':'SOURCE_FAILURE'}
    found=[];status={}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for screen,names,result in pool.map(one,('day_gainers','day_losers','most_actives')):
            found.extend(names);status[screen]=result
    return list(dict.fromkeys(found)),status


def rank_key(x):
    return (bool(x.get('catalyst')), num(x.get('volume_acceleration'))>=1.25,
            abs(num(x.get('move_5m'))),num(x.get('score')))

def coverage(data):
    from collections import Counter
    rows=data['candidates']; attempted=[x for x in rows if x.get('chain_attempted')]
    counts=dict(Counter(x.get('chain_status','UNKNOWN') for x in attempted))
    data['option_chain_universe']=len(attempted)
    data['coverage']={'stocks_configured':data.get('universe_size'), 'stocks_received':len(rows),
                      'chains_attempted':len(attempted),'chain_status_counts':counts,
                      'chains_with_contracts':sum(bool(x.get('zero_dte')) for x in attempted),
                      'chains_not_attempted':len(rows)-len(attempted)}
    return data

def scan_options(rows):
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures={pool.submit(options,x['ticker']):x for x in rows}
        for fut in as_completed(futures): enrich_options(futures[fut],fut.result())


def main():
    ERRORS.clear(); info=session_info(); scan_mode=os.getenv('SCAN_MODE','scheduled')
    discovered,discovery=discover_tickers()
    universe=list(dict.fromkeys(TICKERS+list(CORE_TICKERS)+discovered))
    rows=[]
    with ThreadPoolExecutor(max_workers=10) as pool:
        for x in pool.map(scan_one,universe):
            if x: rows.append(x)
    print(json.dumps({'stage':'prices_complete','rows':len(rows)}),flush=True)
    rows.sort(key=lambda x:num(x['score']),reverse=True)
    add_news(rows[:50])
    print(json.dumps({'stage':'news_complete'}),flush=True)
    for x in rows:
        x.setdefault('news_items',[]);x.setdefault('catalyst',False)
        x.update(chain_attempted=False,chain_status='NOT_SCANNED',options=[],preferred_contracts=[],usable_contracts=[],zero_dte=False)
    out={'generated_at':datetime.now(timezone.utc).isoformat(), 'market_date':info['market_date'],
         'market_session':info['session'],'session_open_at':info['open_at'],'session_close_at':info['close_at'],
         'scan_mode':scan_mode,'scan_id':os.getenv('SCAN_REQUEST_ID') or os.getenv('GITHUB_RUN_ID') or str(time.time_ns()),
         'workflow_run_id':os.getenv('GITHUB_RUN_ID'),'source':'Yahoo 5m bars + CBOE delayed options; Nasdaq fallback',
         'data_quality':'DELAYED_RESEARCH','universe_size':len(universe),'scanned_rows':len(rows),
         'news_universe':min(50,len(rows)),'discovery':discovery,'price_errors':list(ERRORS),
         'candidates':rows,'contract_rules':{'preferred_ask_min':.10,'preferred_ask_max':.30,
         'min_delta':.25,'preferred_delta':.40,'preferred_spread_max':.05,'preferred_spread_pct_max':20}}
    coverage(out);Path('data').mkdir(exist_ok=True)
    Path('data/market.json').write_text(json.dumps(out,separators=(',',':'),allow_nan=False))
    print(json.dumps(out['coverage']))

if __name__=='__main__': main()
