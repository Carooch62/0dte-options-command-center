"""Versioned intraday pattern hypotheses. Never used to score or confirm entries."""
from quality import number


def pattern_snapshot(bars, direction):
    result={'version':1,'mode':'SHADOW','status':'INSUFFICIENT_HISTORY',
            'range_compression':None,'volume_dry_up':None,'directional_structure':None,
            'near_trigger':None,'trigger':None,'distance_pct':None,
            'range_ratio':None,'volume_ratio':None,'observed_bars':len(bars)}
    if len(bars)<12 or direction not in ('UP','DOWN'):
        return result
    window=bars[-12:]
    for b in window:
        values=[number(b.get(k)) for k in ('high','low','close','volume')]
        h,l,c,v=values
        if b.get('interpolated') or any(x is None for x in values) or l<=0 or h<l or not l<=c<=h or v<=0:
            result['status']='INVALID_HISTORY'
            return result
    before,recent=window[:6],window[6:]
    average=lambda xs,k:sum(b[k] for b in xs)/len(xs)
    old_range=sum(b['high']-b['low'] for b in before)/6
    new_range=sum(b['high']-b['low'] for b in recent)/6
    if old_range<=0:
        result['status']='INVALID_HISTORY'
        return result
    range_ratio=new_range/old_range
    volume_ratio=average(recent,'volume')/average(before,'volume')
    last=recent[-3:]
    structure=(all(a['low']<b['low'] for a,b in zip(last,last[1:])) if direction=='UP'
               else all(a['high']>b['high'] for a,b in zip(last,last[1:])))
    trigger=max(b['high'] for b in recent[:-1]) if direction=='UP' else min(b['low'] for b in recent[:-1])
    price=recent[-1]['close']
    distance=(trigger-price)/price*100 if direction=='UP' else (price-trigger)/price*100
    result.update(status='READY',range_compression=range_ratio<=.65,
                  volume_dry_up=volume_ratio<=.75,directional_structure=structure,
                  near_trigger=0<=distance<=.5,trigger=trigger,distance_pct=round(distance,4),
                  range_ratio=round(range_ratio,4),volume_ratio=round(volume_ratio,4))
    return result


def attach_early_watch(row, current):
    pattern=row.get('pattern_research') or {}
    row['early_watch']=bool(current and row.get('catalyst') is True
        and row.get('setup_qualified') is not True and pattern.get('status')=='READY'
        and all(pattern.get(k) is True for k in
                ('range_compression','volume_dry_up','directional_structure','near_trigger')))
    row['early_watch_note']='Shadow hypothesis only: catalyst + compression + quiet volume + directional structure near a level. Await fresh breakout and contract checks; not an entry signal.'
