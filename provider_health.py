"""Sanitized operational measurements; provider calls are not trade outcomes."""
from collections import Counter, defaultdict
import math


def percentile(values, fraction):
    values=sorted(values)
    if not values:return None
    position=(len(values)-1)*fraction
    lo=int(position);hi=min(lo+1,len(values)-1)
    return round(values[lo]+(values[hi]-values[lo])*(position-lo),2)


def provider_health(rows):
    providers=defaultdict(list)
    for row in rows:
        for item in row.get('chain_provider_diagnostics',[]):
            name=item.get('provider')
            if name not in ('fetch_cboe','nasdaq_options'):continue
            if item.get('status')=='AUTOMATED_ACCESS_UNSUPPORTED':continue
            providers[name].append(item)
    result={}
    for name,items in sorted(providers.items()):
        durations=[x['duration_ms'] for x in items if type(x.get('duration_ms')) in (int,float) and math.isfinite(x['duration_ms']) and x['duration_ms']>=0]
        result[name]={'calls':len(items),'status_counts':dict(Counter(x.get('status','UNKNOWN') for x in items)),
                      'timed_calls':len(durations),'duration_p50_ms':percentile(durations,.5),
                      'duration_p95_ms':percentile(durations,.95),'duration_max_ms':max(durations,default=None),
                      'http_status_counts':dict(Counter(str(x['http_status']) for x in items if type(x.get('http_status')) is int and 100<=x['http_status']<=599))}
    return {'providers':result,'measurement':'PER_CHAIN_PROVIDER_CALL_INCLUDING_RETRIES',
            'limitation':'One snapshot; overlapping calls do not sum to wall time. No quote freshness, eligibility or speed improvement inferred.'}
