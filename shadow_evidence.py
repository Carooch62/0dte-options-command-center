"""Isolated public staging capture. No credentials, scoring changes or invented outcomes."""
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from quality import ET

STOCK=('direction','execution_state','setup_qualified','qualification_reasons','price','price_source','bar_end','news_status','news_checked_at','news_items','pattern_research','relative_volume_research','research_context','trend_context','trigger_price','invalidation_price')
OPTION=('contract_id','expiry','side','strike','ask','bid','delta','theta','volume','oi','dte','quote_valid','delta_ok','near_atm','usable_spread','source','option_timestamp','received_at','minimum_delay_minutes')
def clock(value):
    if not isinstance(value,str): raise ValueError('Timezone-aware clock required')
    result=datetime.fromisoformat(value.replace('Z','+00:00'))
    if result.tzinfo is None: raise ValueError('Timezone-aware clock required')
    return result

def packet(snapshot,captured_at,source_commit=None):
    if not snapshot.get('scan_id') or clock(snapshot['generated_at'])>clock(captured_at):raise ValueError('Ordered original clocks required')
    selected=[];seen=set();counts={};examined=qualifying=0
    coverage=[]
    for stock in snapshot.get('candidates',[]):
        coverage.append({k:stock.get(k) for k in ('ticker','news_status','news_checked_at')})
        options=list(stock.get('options') or [])+[o for g in (stock.get('expiry_groups') or {}).values() for o in g.get('options',[])]
        for option in options:
            ident=option.get('contract_id')
            if not ident or ident in seen:continue
            seen.add(ident);examined+=1
            if not (type(option.get('ask')) in (int,float) and 0<option['ask']<=.30 and all(option.get(k) is True for k in ('quote_valid','delta_ok','near_atm','usable_spread')) and type(option.get('volume')) in (int,float) and option['volume']>=20 and type(option.get('dte')) is int and 0<=option['dte']<=14):continue
            qualifying+=1;ticker=stock.get('ticker')
            if len(selected)>=20 or counts.get(ticker,0)>=2:continue
            counts[ticker]=counts.get(ticker,0)+1
            selected.append({'candidate_id':ident,'ticker':ticker,'stock':{k:stock[k] for k in STOCK if k in stock},'contract':{k:option[k] for k in OPTION if k in option}})
    result={'format':'shadow-evidence-v1','scan_id':snapshot['scan_id'],'generated_at':snapshot['generated_at'],'captured_at':captured_at,'source_commit':source_commit,'market_session':snapshot.get('market_session'),'candidates':selected,'news_coverage':coverage,'news_selection':snapshot.get('news_selection'),'candidate_controls':[{k:r.get(k) for k in ('ticker','direction','score','bar_end','execution_state','setup_qualified','news_status','pattern_research','relative_volume_research','research_context')} for r in snapshot.get('candidates',[])[:500]],'controls_omitted':max(0,len(snapshot.get('candidates',[]))-500),'coverage':{'examined':examined,'qualifying':qualifying,'included':len(selected),'omitted':qualifying-len(selected)},'ranking_effect':'NONE','limitations':['Public research, not executions. Unsearched news is unknown, not no catalyst. Missing reviewed components and quote clocks prevent performance claims. Rotation and scoring changes require prospective multi-session comparison.']}
    raw=json.dumps(result,sort_keys=True,separators=(',',':'),allow_nan=False).encode()
    if len(raw)>1000000:raise ValueError('Evidence packet exceeds bounded size')
    return {**result,'packet_id':hashlib.sha256(raw).hexdigest()}

def capture(data_dir,captured_at=None,source_commit=None):
    data=Path(data_dir)
    marker=json.loads((data/'staging-environment.json').read_text())
    if marker.get('environment')!='staging':raise ValueError('Staging marker required')
    snapshot=json.loads((data/'market-dashboard.json').read_text())
    captured_at=captured_at or datetime.now(timezone.utc).isoformat()
    path=data/'shadow-evidence'/hashlib.sha256(str(snapshot.get('scan_id')).encode()).hexdigest()
    if path.exists():return {'status':'ALREADY_CAPTURED','scan_id':snapshot['scan_id']}
    now=clock(captured_at)
    from market_clock import session_info
    info=session_info(now)
    age=(now-clock(snapshot['generated_at'])).total_seconds()
    if info['session']!='OPEN' or snapshot.get('market_session')!='OPEN' or not 0<=age<=480:
        raise ValueError('Fresh regular-session snapshot required')
    if clock(snapshot['generated_at']).astimezone(ET).date().isoformat()!=info['market_date']:
        raise ValueError('Snapshot session date mismatch')
    result=packet(snapshot,captured_at,source_commit)
    def write(target,value):
        target.parent.mkdir(parents=True,exist_ok=True);temp=target.with_suffix('.tmp');temp.write_text(json.dumps(value,separators=(',',':'),allow_nan=False));temp.replace(target)
    write(path,result);write(data/'shadow-evidence-latest.json',result)
    write(data/'shadow-review-queue.json',{**result,'format':'shadow-review-queue-v1','candidates':[{'candidate_id':c['candidate_id'],'ticker':c['ticker'],'evidence_gaps':['COMPONENT_REVIEWS_REQUIRED','PRIVATE_OPTION_QUOTES_REQUIRED'],'review_status':'AWAITING_REVIEW'} for c in result['candidates']]})
    write(data/'shadow-outcomes.json',{'format':'shadow-outcomes-v1','results':[],'status':'WITHHELD_MISSING_PROSPECTIVE_OBSERVATIONS','packet_id':result['packet_id']})
    return {'status':'CAPTURED','packet_id':result['packet_id'],'coverage':result['coverage']}

def compare_news(snapshot,lookup,now=None):
    """Sidecar-only coverage probe. Later lookups are never backdated into scan inputs."""
    import time
    start=time.monotonic()
    baseline=[r for r in snapshot.get('candidates',[]) if r.get('news_status') in ('SUCCESS','SOURCE_FAILURE')]
    unsearched=[{'ticker':r['ticker']} for r in snapshot.get('candidates',[]) if r.get('news_status')=='NOT_SCANNED']
    seed=str(snapshot.get('scan_id'))
    selected=sorted(unsearched,key=lambda r:hashlib.sha256((seed+r['ticker']).encode()).hexdigest())[:50]
    lookup(selected)
    return {'format':'news-coverage-probe-v1','scan_id':snapshot['scan_id'],'original_generated_at':snapshot['generated_at'],'probe_completed_at':now or datetime.now(timezone.utc).isoformat(),'baseline_searched':len(baseline),'baseline_failures':sum(r.get('news_status')=='SOURCE_FAILURE' for r in baseline),'probe_searched':len(selected),'probe_failures':sum(r.get('news_status')=='SOURCE_FAILURE' for r in selected),'probe_catalysts':sum(r.get('catalyst') is True for r in selected),'duration_seconds':round(time.monotonic()-start,3),'rows':[{k:r[k] for k in ('ticker','news_status','news_checked_at','news_items','catalyst') if k in r} for r in selected],'ranking_effect':'NONE','limitation':'Additional public lookups after scan completion; later news availability cannot prove a missed entry-time catalyst. This is an added-budget coverage probe, not an equal-budget performance comparison.'}

def atomic_json(path,value):
    path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(value,separators=(',',':'),allow_nan=False));temporary.replace(path)
