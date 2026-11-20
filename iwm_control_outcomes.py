"""Observe exact stock-bar horizons from frozen staging inputs. No option P/L."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import math
from market_clock import session_info
from quality import parse_time

HORIZONS=(15,30,60)

def stamp(value):
    if not isinstance(value,str) or not (value.endswith('Z') or '+' in value[10:] or '-' in value[10:]):return None
    return parse_time(value)

def observations(packets):
    rows=[];gaps=0;seen=set()
    for packet in packets:
        control=packet.get('iwm_control') or {}
        if control.get('spec_version')!='iwm-control-v1' or packet.get('market_session')!='OPEN':continue
        generated=stamp(packet.get('generated_at'));captured=stamp(packet.get('captured_at'))
        if not generated or not captured or not 0<=(captured-generated).total_seconds()<=480:
            gaps+=1;continue
        info=session_info(generated)
        if info['session']!='OPEN' or captured>=parse_time(info['close_at']):gaps+=1;continue
        matches=[r for r in control.get('rows',[]) if r.get('ticker')=='IWM']
        if len(matches)!=1:gaps+=1;continue
        row=matches[0];bar=stamp(row.get('bar_end'));price=row.get('price')
        if not bar or not parse_time(info['open_at'])<bar<=generated or not 0<=(generated-bar).total_seconds()<=480 or type(price) not in (float,int) or not math.isfinite(price) or price<=0 or not row.get('price_source'):
            gaps+=1;continue
        key=(packet.get('packet_id'),packet.get('scan_id'))
        if key in seen:continue
        seen.add(key)
        rows.append({'packet_id':packet.get('packet_id'),'scan_id':packet.get('scan_id'),
                     'generated_at':packet['generated_at'],'captured_at':packet['captured_at'],
                     'market_date':info['market_date'],'open_at':info['open_at'],'close_at':info['close_at'],
                     'bar_end':bar.isoformat(),'price':price,'price_source':row['price_source'],
                     'execution_state':row.get('execution_state'),'setup_qualified':row.get('setup_qualified'),
                     'direction':row.get('direction'),'news_status':row.get('news_status'),
                     'pattern_research':row.get('pattern_research'),'trend_context':row.get('trend_context'),
                     'qualification_reasons':row.get('qualification_reasons')})
    return sorted(rows,key=lambda r:(stamp(r['captured_at']),stamp(r['generated_at']))),gaps

def compare(packets,now=None):
    now=now or datetime.now(timezone.utc)
    rows,gaps=observations(packets)
    rows=[r for r in rows if stamp(r['captured_at'])<=now]
    indexed={};sessions=defaultdict(list)
    for row in rows:
        # First recorded observation of a bar wins. Later revisions are not backfilled.
        indexed.setdefault((row['market_date'],row['bar_end'],row['price_source']),row)
    baselines=list(indexed.values());results=[]
    for row in baselines:
        outcomes=[]
        for minutes in HORIZONS:
            target=stamp(row['bar_end'])+timedelta(minutes=minutes)
            later=indexed.get((row['market_date'],target.isoformat(),row['price_source']))
            status='OBSERVED' if later and stamp(later['generated_at'])>stamp(row['generated_at']) and stamp(later['captured_at'])>stamp(row['captured_at']) else 'MISSING_EXACT_BAR'
            if target>stamp(row['close_at']):status='OUTSIDE_SESSION'
            elif target>now:status='PENDING'
            outcome={'minutes':minutes,'target_bar_end':target.isoformat(),'status':status}
            if status=='OBSERVED':
                outcome.update({'later_packet_id':later['packet_id'],'later_bar_end':later['bar_end'],
                                'later_generated_at':later['generated_at'],'later_captured_at':later['captured_at'],
                                'stock_change_pct':round((later['price']/row['price']-1)*100,6)})
            outcomes.append(outcome)
        result={**row,'outcomes':outcomes}
        results.append(result);sessions[row['market_date']].append(result)
    summaries=[]
    for day,group in sorted(sessions.items()):
        first=min(stamp(r['bar_end']) for r in group);last=max(stamp(r['bar_end']) for r in group)
        complete=sum(all(o['status']=='OBSERVED' for o in r['outcomes']) for r in group)
        closed=now>=stamp(group[0]['close_at'])
        covered=closed and len(group)>=5 and complete>0 and first<=stamp(group[0]['open_at'])+timedelta(minutes=45) and last>=stamp(group[0]['close_at'])-timedelta(minutes=30)
        arms=[]
        for state in ('QUALIFIED','UNQUALIFIED','UNKNOWN'):
            selected=[r for r in group if ('QUALIFIED' if r['setup_qualified'] is True else 'UNQUALIFIED' if r['setup_qualified'] is False else 'UNKNOWN')==state]
            arms.append({'arm':state,'baselines':len(selected),'horizons':[{'minutes':m,'observed':len(values:=[o['stock_change_pct'] for r in selected for o in r['outcomes'] if o['minutes']==m and o['status']=='OBSERVED']), 'mean_stock_change_pct':round(sum(values)/len(values),6) if values else None} for m in HORIZONS]})
        summaries.append({'market_date':day,'closed':closed,'baselines':len(group),'first_bar_end':first.isoformat(),'last_bar_end':last.isoformat(),'complete_horizons':complete,'coverage_eligible':covered,'arms':arms})
    count=sum(s['coverage_eligible'] for s in summaries)
    return {'format':'iwm-control-outcomes-v1','spec_version':'iwm-control-v1','checked_at':now.isoformat(),
            'status':'READY_FOR_EXPLORATORY_REVIEW' if count>=5 else 'WAITING_FOR_FIVE_COVERED_SESSIONS',
            'coverage_eligible_sessions':count,'invalid_or_missing_packets':gaps,'sessions':summaries,'results':results,
            'ranking_effect':'NONE','execution':False,'limitations':['Prospective frozen stock-only inputs. No option P/L or causal signal edge inferred.',
              'Exact same-session, same-source bar ends only; missing horizons remain missing. Later revisions do not replace first observations.',
              'Arm averages are descriptive and may differ in direction/time of day; not matched trading performance. Sessions, not scans, are independent units.',
              'Five covered sessions is a review checkpoint, not proof of profitability; no automatic promotion.']}

def collect(data_dir='data',now=None):
    data=Path(data_dir)
    if json.loads((data/'staging-environment.json').read_text()).get('environment')!='staging':raise ValueError('Staging marker required')
    packets=[json.loads(path.read_text()) for path in sorted((data/'shadow-evidence').glob('*')) if path.is_file() and path.suffix!='.tmp']
    result=compare(packets,now)
    from shadow_evidence import atomic_json
    atomic_json(data/'iwm-control-outcomes.json',result)
    return {k:result[k] for k in ('status','coverage_eligible_sessions','invalid_or_missing_packets','checked_at')}

if __name__=='__main__':print(json.dumps(collect()))
