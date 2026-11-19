"""Separate public post-close evidence; never replaces scanner decisions or history."""
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from market_clock import session_info
from quality import parse_time

FIELDS=('ticker','price','price_source','bar_timestamp','bar_end','session_bar_count',
        'open_move','day_move','move_5m','recent_move','volume_ratio','volume_acceleration',
        'vwap','pattern_research','relative_volume_research')

def closing_window(now):
    info=session_info(now)
    close=parse_time(info['close_at'])
    if close is None:return None
    minutes=(now-close).total_seconds()/60
    return info if 20<=minutes<=65 else None

def collect(data_dir='data', now=None, scan=None):
    now=now or datetime.now(timezone.utc)
    info=closing_window(now)
    if not info:return {'status':'OUTSIDE_CLOSING_CAPTURE_WINDOW'}
    data=Path(data_dir)
    source=json.loads((data/'market-dashboard.json').read_text())
    # A later manual after-hours run may have replaced the displayed dashboard.
    # Recover only a recorded same-session intraday cohort, never its later knowledge.
    choices=[source]
    history=data/'scan-history.json'
    if history.exists():
        retained=json.loads(history.read_text())
        if not isinstance(retained,list):raise ValueError('Invalid retained scan history')
        choices.extend(retained)
    eligible=[row for row in choices if parse_time(row.get('generated_at')) is not None
              and parse_time(info['open_at'])<=parse_time(row['generated_at'])<parse_time(info['close_at'])]
    if not eligible:
        return {'status':'NO_SAME_SESSION_SOURCE'}
    source=max(eligible,key=lambda row:parse_time(row['generated_at']))
    path=data/'closing-evidence'/(info['market_date']+'.json')
    prior=json.loads(path.read_text()) if path.exists() else None
    bucket=int(now.timestamp()//900)
    if prior and (prior.get('status')=='FINAL_BARS_CAPTURED' or prior.get('attempt_bucket')==bucket):
        return {'status':'ALREADY_CAPTURED','market_date':info['market_date']}
    tickers=list(dict.fromkeys(r['ticker'] for r in source.get('candidates',source.get('candidate_state',[])) if r.get('ticker')))
    if not tickers:raise ValueError('Empty closing source universe')
    if scan is None:
        from scanner import scan_one
        scan=scan_one
    def one(ticker):
        row=scan(ticker,now)
        if not row:return {'ticker':ticker,'status':'SOURCE_UNAVAILABLE'}
        complete=parse_time(row.get('bar_end'))==parse_time(info['close_at'])
        return {**{k:row[k] for k in FIELDS if k in row},'status':'FINAL_BAR_CAPTURED' if complete else 'FINAL_BAR_MISSING'}
    with ThreadPoolExecutor(max_workers=8) as pool:rows=list(pool.map(one,tickers))
    complete=sum(r['status']=='FINAL_BAR_CAPTURED' for r in rows)
    result={'format':'closing-research-evidence-v1','market_date':info['market_date'],
            'session_close_at':info['close_at'],'collected_at':now.isoformat(),
            'source_scan_id':source.get('scan_id'),'source_generated_at':source['generated_at'],
            'attempt_bucket':bucket,'status':'FINAL_BARS_CAPTURED' if complete==len(tickers) else 'INCOMPLETE',
            'expected':len(tickers),'final_bars':complete,'rows':rows,
            'ranking_effect':'NONE','execution':False,
            'limitations':'Collected after close from public research sources. No option fills, pre-entry availability or tradable return is inferred. Missing final bars remain missing.'}
    path.parent.mkdir(parents=True,exist_ok=True)
    # Keep earlier attempts with their original availability times.
    if prior:
        attempt=path.parent/(info['market_date']+'-'+str(prior['attempt_bucket'])+'.json')
        if not attempt.exists():attempt.write_text(json.dumps(prior,separators=(',',':'),allow_nan=False))
    temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(result,separators=(',',':'),allow_nan=False));temporary.replace(path)
    return {k:result[k] for k in ('status','market_date','expected','final_bars','collected_at')}

if __name__=='__main__':print(json.dumps(collect()))
