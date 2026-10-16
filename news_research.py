"""Evidence-reviewed news importance. Shadow outputs never authorize a trade."""
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit
import json
from pathlib import Path

REFERENCE = {'news':40.0,'patterns':38.0,'volume':10.0,'options':7.0,'risk_reward':5.0}
DIMENSIONS = {'materiality':.45,'surprise':.25,'credibility':.15,'novelty':.15}
HORIZONS = {'INTRADAY':(6,24),'MULTIDAY':(48,120)}


def clock(value):
    try:
        dt=datetime.fromisoformat(value.replace('Z','+00:00'))
        return dt.astimezone(timezone.utc) if dt.tzinfo else None
    except (ValueError,TypeError,AttributeError):
        return None


def url_key(value):
    try:
        u=urlsplit(value)
        if u.scheme not in ('http','https') or not u.hostname or u.username or u.password:return None
        return urlunsplit((u.scheme,u.netloc.lower(),u.path.rstrip('/'),u.query,''))
    except (ValueError,TypeError,AttributeError):return None


def assess(event,ticker,now,horizon):
    result={'event_id':event.get('event_id'), 'status':'NEEDS_REVIEW','missing':[]}
    missing=result['missing'];scores=event.get('scores');evidence=event.get('evidence')
    blockers=event.get('review_blockers',[])
    if not isinstance(blockers,list) or blockers:
        missing.append('unresolved_review_blockers')
    if not isinstance(scores,dict):scores={}
    if not isinstance(evidence,dict):evidence={}
    for key in DIMENSIONS:
        if type(scores.get(key)) is not int or not 0<=scores[key]<=4:missing.append(key)
        if not isinstance(evidence.get(key),str) or not evidence[key].strip():missing.append(key+'_evidence')
    for key in ('relevance','horizon'):
        if not isinstance(evidence.get(key),str) or not evidence[key].strip():missing.append(key+'_evidence')
    if event.get('ticker')!=ticker:missing.append('ticker_match')
    if not isinstance(event.get('event_id'),str) or not event['event_id'].strip():missing.append('event_id')
    if not url_key(event.get('source_url')):missing.append('source_url')
    if event.get('relevance') not in ('DIRECT','SECTOR','MACRO','UNRELATED'):missing.append('relevance')
    if event.get('horizon')!=horizon:missing.append('horizon_match')
    direction=event.get('direction')
    if direction not in ('BULLISH','BEARISH','MIXED','UNKNOWN'):missing.append('direction')
    if direction!='UNKNOWN' and (not isinstance(evidence.get('direction'),str) or not evidence['direction'].strip()):missing.append('direction_evidence')
    stamps=[clock(event.get(k)) for k in ('event_at','published_at','reviewed_at')]
    if any(t is None for t in stamps) or not all(t<=now for t in stamps if t):missing.append('valid_as_of_timestamps')
    elif not stamps[0]<=stamps[1]<=stamps[2]:missing.append('timestamp_order')
    if missing:return result
    result.update(source_url=event['source_url'],scores=scores,evidence=evidence,direction=direction,
                  event_at=event['event_at'],published_at=event['published_at'],reviewed_at=event['reviewed_at'])
    age=(now-stamps[0]).total_seconds()/3600
    half_life,max_age=HORIZONS[horizon]
    result['event_age_hours']=round(age,3)
    if age>=max_age:return {**result,'status':'STALE'}
    if event['relevance']=='UNRELATED' or scores['materiality']==0:return {**result,'status':'BACKGROUND','importance':0.0}
    if scores['credibility']<3:return {**result,'status':'LOW_CONFIDENCE'}
    if scores['novelty']==0:return {**result,'status':'RECYCLED','importance':0.0}
    # Credible, novel coverage cannot make a small economic event a major one.
    strength=min(scores['materiality']/4,sum(scores[k]/4*w for k,w in DIMENSIONS.items()))
    importance=round(strength*2**(-age/half_life),6)
    return {**result,'status':'ASSESSED','importance':importance,
            'degree':('ROUTINE','MINOR','MODERATE','MAJOR','STRUCTURAL')[scores['materiality']]}


def evaluate(row,now=None,horizon='INTRADAY'):
    now=now or datetime.now(timezone.utc)
    result={'version':2,'allocation_policy':'GRADUAL_2_5','mode':'SHADOW','status':'UNKNOWN','as_of':now.isoformat(),'horizon':horizon,
            'reference_weights':dict(REFERENCE),'proposed_weights':None,'importance':None,
            'direction':'UNKNOWN','directional_support':None,'events':[],
            'duplicates_removed':0,'ranking_effect':'NONE','eligibility_effect':'NONE',
            'note':'Experimental allocation, not win probability. Reviews cover only the documented events; no missing weight is redistributed.'}
    if horizon not in HORIZONS:result['status']='UNSUPPORTED_HORIZON';return result
    if row.get('news_status')!='SUCCESS':result['status']='COVERAGE_UNKNOWN';return result
    events=row.get('news_event_evidence')
    if not isinstance(events,list) or not events:
        result['status']='NEEDS_REVIEW' if row.get('news_items') else 'NO_REPORTED_NEWS'
        return result
    seen={};unique=[];conflict=False
    for event in events:
        if not isinstance(event,dict):unique.append({});continue
        # Explicit event IDs group syndication. URL/title catch simple duplicate submissions.
        keys=[('id',event.get('event_id')),('url',url_key(event.get('source_url')))]
        title=' '.join(str(event.get('title','')).lower().split())
        if title:keys.append(('title',title))
        keys=[k for k in keys if isinstance(k[1],str) and k[1]]
        signature=json.dumps({k:event.get(k) for k in ('ticker','scores','direction','relevance','horizon','event_at')},sort_keys=True)
        overlap=[seen[k] for k in keys if k in seen]
        if overlap:
            result['duplicates_removed']+=1
            if any(s!=signature for s in overlap):conflict=True
        else:unique.append(event)
        for k in keys:seen[k]=signature
    result['events']=[assess(e,row.get('ticker'),now,horizon) for e in unique]
    if conflict:result['status']='CONFLICTING_REVIEWS';return result
    if any(e['status'] in ('NEEDS_REVIEW','LOW_CONFIDENCE') for e in result['events']):result['status']='NEEDS_REVIEW';return result
    active=[e for e in result['events'] if e['status']=='ASSESSED']
    if not active:result['status']='NO_CURRENT_MATERIAL_EVENT';return result
    # Do not let many articles inflate weight. Use the strongest assessed event only.
    dominant=max(active,key=lambda e:(e['importance'],e['event_id']))
    importance=dominant['importance'];news=round(40+2.5*importance,2)
    result.update(status='ASSESSED',importance=importance,dominant_event_id=dominant['event_id'],
                  proposed_weights={**REFERENCE,'news':news,'patterns':round(78-news,2)})
    directions={e['direction'] for e in active}
    direction=next(iter(directions)) if len(directions)==1 else 'MIXED'
    result['direction']=direction
    if direction in ('BULLISH','BEARISH') and row.get('direction') in ('UP','DOWN'):
        result['directional_support']='ALIGNED' if (direction=='BULLISH')==(row['direction']=='UP') else 'OPPOSED'
    return result


def load_reviews():
    """Version-controlled public evidence only; an empty file means no human reviews."""
    path=Path(__file__).with_name('news_event_reviews.json')
    if not path.exists():return {}
    data=json.loads(path.read_text())
    if not isinstance(data,dict):raise ValueError('News reviews must map tickers to event lists')
    return data
