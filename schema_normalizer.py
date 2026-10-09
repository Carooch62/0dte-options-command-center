"""Normalize source fields without converting unknown values into confirmation."""
import json
import re
from pathlib import Path
from datetime import datetime, timezone, date
from quality import number, freshness, contract_checks, verified_delta, ET
from pattern_research import attach_early_watch

direct_terms = (
    'reports earnings','reports results','earnings beat','earnings miss','raises guidance',
    'cuts guidance','withdraws guidance','acquisition','merger','buyout','to acquire',
    'acquires','contract win','wins contract','partnership','strategic agreement',
    'announces agreement','signs agreement','convertible notes','convertible offering',
    'secondary offering','public offering','stock offering','files 8-k','files 10-q',
    'files 10-k','lawsuit','settlement','fda approval','regulatory approval','receives approval',
    'product approval','recall','appoints ceo','appoints cfo','ceo resigns','cfo resigns',
    'ceo leaves','cfo leaves','price target','upgraded','downgraded','initiates coverage',
    'initiated coverage','raises price target','cuts price target','raises target','cuts target',
)
background_terms = (
    'should you buy','should you sell','could derail','could be','could become','better buy',
    'better value','what needs to be true','what needs to happen','is it time to','here\'s why',
    'here is why','market today','sector update','forecast','price prediction','what investors need to know',
    'fully priced','earnings story','ahead of earnings',' vs ','betting on','stocks to own',
    'growth come from','may be missing','what to expect','what you need to know',
    'why .* stock is','why .* shares','gains as market','trade up, what you need',
)


def ticker_explicit(ticker,item):
    pattern=re.compile(r'(?<![A-Z0-9])'+re.escape(ticker)+r'(?![A-Z0-9])',re.I)
    return bool(pattern.search(str(item.get('title',''))) or pattern.search(str(item.get('url',''))))

def normalize(data,now=None):
    now=now or datetime.now(timezone.utc)
    for x in data.get('candidates',[]):
        move=number(x.get('day_move'));m5=number(x.get('move_5m'));m15=number(x.get('recent_move'))
        direction=x.get('direction','NEUTRAL');sgn=1 if direction=='UP' else -1 if direction=='DOWN' else 0
        x['change_pct']=move;x['rvol']=number(x.get('volume_ratio'));x['cp_ratio']=number(x.get('option_call_put_ratio'))
        x['price_freshness']=freshness(x.get('bar_end'),now,max_age=8)
        current=x['price_freshness']=='RECENT' and data.get('market_session')=='OPEN'
        directional=bool(sgn and m5 is not None and m5*sgn>0 and (m15 is None or m15*sgn>0))
        x['momentum_confirmed']=bool(current and directional and abs(m5)>=.25 and number(x.get('volume_ratio'),0)>=1.5)
        x['acceleration_confirmed']=bool(current and directional and abs(m5)>=.25 and number(x.get('volume_acceleration'),0)>=1.25)
        x['direction_confirmed']=current and directional
        side='call' if sgn==1 else 'put' if sgn==-1 else None
        contracts=x.get('options') or []
        for o in contracts:
            o.update(contract_checks(o,number(x.get('price'),0)))
            o['direction_aligned']=o.get('side')==side
            o['expiry_verified']=o.get('expiry')==now.astimezone(ET).date().isoformat() and o.get('dte')==0
            o['quote_freshness']=freshness(o.get('option_timestamp'),now,delay=number(o.get('minimum_delay_minutes'),0),max_age=20)
        eligible=[o for o in contracts if o['quote_valid'] and o['delta_ok'] and o['near_atm'] and o['expiry_verified']
                  and o.get('direction_aligned') and number(o.get('volume'),0)>=20 and o['usable_spread']]
        x['eligible_contracts']=eligible  # retain whole chain for display-budget changes
        x['preferred_contracts']=[o for o in eligible if .10<=o['ask']<=.30 and o['tight_spread']]
        x['cheap_contracts']=x['preferred_contracts']
        x['usable_contracts']=[o for o in eligible if .10<=o['ask']<=.75]
        x['revisit_contracts']=[o for o in eligible if o['ask']>.30]
        x['option_data_freshness']='DELAYED_UNKNOWN_QUOTE_TIME' if x.get('zero_dte') else x.get('chain_status','NONE')
        # Later-expiry research is isolated from 0DTE eligibility and state scoring.
        for key,lo,hi in [('week',1,7),('two_weeks',8,14),('month',15,31)]:
            group=x.get('expiry_groups',{}).get(key)
            if group is None: continue
            future=group.get('options',[])
            for o in future:
                o.update(contract_checks(o,number(x.get('price'),0)))
                try: days=(date.fromisoformat(o.get('expiry',''))-now.astimezone(ET).date()).days
                except (TypeError,ValueError): days=-1
                o['expiry_verified']=lo<=days<=hi and o.get('dte')==days
                o['direction_aligned']=o.get('side')==side
                o['quote_freshness']=freshness(o.get('option_timestamp'),now,delay=number(o.get('minimum_delay_minutes'),0),max_age=20)
            group['eligible_contracts']=[o for o in future if o['quote_valid'] and o['delta_ok'] and o['near_atm']
                and o['expiry_verified'] and o['direction_aligned'] and number(o.get('volume'),0)>=20 and o['usable_spread']]
        strong=any(o['quote_freshness'] in ('RECENT','DELAYED') for o in x['preferred_contracts'])
        news_status=x.get('news_status')
        items=x.get('news_items',[]) if news_status in (None,'SUCCESS') else []
        for n in items:
            title=str(n.get('title','')).lower(); age=number(n.get('age_hours'))
            explicit=ticker_explicit(x['ticker'],n)
            background=any(re.search(k,title) for k in background_terms)
            direct=explicit and any(k in title for k in direct_terms)
            n['level']='BACKGROUND' if background or age is None or not 0<=age<36 else 'DIRECT' if direct else 'LIKELY' if explicit else 'BACKGROUND'
        x['catalyst_level']='DIRECT' if any(n['level']=='DIRECT' for n in items) else 'LIKELY' if any(n['level']=='LIKELY' for n in items) else 'NONE'
        x['catalyst_type']='Company-specific event' if x['catalyst_level']=='DIRECT' else 'Company-specific news' if x['catalyst_level']=='LIKELY' else 'None confirmed'
        x['catalyst']=x['catalyst_level']!='NONE'
        news_unknown=not x['catalyst'] and news_status!='SUCCESS'
        if news_unknown:
            x['catalyst_level']='UNKNOWN'
            x['catalyst_type']={'NOT_SCANNED':'News not checked this scan',
                               'SOURCE_FAILURE':'News source failed'}.get(news_status,'News coverage unknown')
        confirmation=x['momentum_confirmed'] or x['acceleration_confirmed']
        x['setup_qualified']=bool(x['catalyst'] and confirmation)
        x['qualification_checks']={'current_session_data':bool(current),'direction_confirmed':bool(x['direction_confirmed']),
                                   'momentum_confirmed':x['momentum_confirmed'],'acceleration_confirmed':x['acceleration_confirmed'],
                                   'catalyst_confirmed':None if news_unknown else x['catalyst']}
        x['qualification_reasons']=([ 'Current session data unavailable' ] if not current else []) + \
            ([ 'Directional momentum not confirmed' ] if not directional else []) + \
            ([ 'Momentum and acceleration confirmation missing' ] if not confirmation else []) + \
            ([ x['catalyst_type'] if news_unknown else 'Company-specific catalyst not confirmed' ] if not x['catalyst'] else [])
        attach_early_watch(x,current)
        x['flow_aligned']=False  # cumulative call/put volume is not verified buying flow
        x['volume_balance_aligned']=(x.get('volume_balance')=='CALL' and side=='call') or (x.get('volume_balance')=='PUT' and side=='put')
        # Quote evidence cannot upgrade a stock that failed setup qualification.
        x['execution_readiness']='VERIFIED_DELAYED' if strong and x['setup_qualified'] else 'WATCH_ONLY' if current else 'INSUFFICIENT_DATA'
        x['setup_bucket']='CONFIRMED WATCH' if strong and x['setup_qualified'] else 'WATCH' if x['setup_qualified'] or (current and eligible) else 'PASS'
    data.update(schema_version=7,data_quality='DELAYED_RESEARCH',dashboard_generated_at=now.isoformat())
    return data

def main():
    data=normalize(json.loads(Path('data/market.json').read_text()))
    Path('data/market-dashboard.json').write_text(json.dumps(data,separators=(',',':'),allow_nan=False))

if __name__=='__main__':main()
