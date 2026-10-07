"""Prospective, immutable signal observations; quoted markouts are not fills."""
import json
from copy import deepcopy
from pathlib import Path
from datetime import datetime, timezone
from quality import parse_time, valid_quote, ET

def update(data, path='data/option-observations.json'):
    p=Path(path)
    try: events=json.loads(p.read_text())
    except (OSError, ValueError): events=[]
    now=parse_time(data['generated_at']);today=now.astimezone(ET).date().isoformat()
    quotes={o['contract_id']:o for x in data['candidates'] for o in x.get('options',[]) if o.get('contract_id') and valid_quote(o)}
    for event in events:
        if event['market_date']!=today:continue
        quote=quotes.get(event['contract_id'])
        if not quote:continue
        entry=parse_time(event['observed_at']);elapsed=(now-entry).total_seconds()/60
        source_changed=(quote.get('payload_timestamp') or quote.get('option_timestamp')) != event.get('source_timestamp')
        if not source_changed:continue
        if elapsed <= 40:
            event['best_observed_exit_bid']=max(event.get('best_observed_exit_bid',quote['bid']),quote['bid'])
            event['worst_observed_exit_bid']=min(event.get('worst_observed_exit_bid',quote['bid']),quote['bid'])
            event['observation_note']='Sampled delayed quotes; extremes between scans and executable fills are unknown.'
        for horizon in (5,15,30):
            key=str(horizon)
            if key in event['markouts'] or not horizon<=elapsed<=horizon+10:continue
            verified=bool(parse_time(quote.get('option_timestamp')) and parse_time(event.get('quote_timestamp')))
            event['markouts'][key]={'observed_at':now.isoformat(),'elapsed_minutes':round(elapsed,2),
                'exit_bid':quote['bid'],'exit_ask':quote.get('ask'),
                'quote_timestamp':quote.get('option_timestamp'),'source_timestamp':quote.get('payload_timestamp'),
                'spread':quote.get('spread'),'spread_pct':quote.get('spread_pct'),
                'gross_quote_change_per_contract':round((quote['bid']-event['entry_ask'])*100,2),
                'timing_verified':verified,'interpretation':'QUOTED_MARKOUT_NOT_A_FILL' if verified else 'UNVERIFIED_QUOTE_TIMING',
                'fees_included':False}
    seen={(e['scan_id'],e['contract_id']) for e in events}
    active={e['contract_id'] for e in events if e['market_date']==today and (now-parse_time(e['observed_at'])).total_seconds()<1800}
    for x in data['candidates']:
        if x.get('execution_state') not in ('TRIGGERED','CONFIRMED') and not x.get('second_wave_event'):continue
        for o in x.get('preferred_contracts',[])[:3]:
            cid=o['contract_id']
            if cid in active or (data['scan_id'],cid) in seen:continue
            events.append({'scan_id':data['scan_id'],'market_date':today,'observed_at':now.isoformat(),
                'ticker':x['ticker'],'contract_id':cid,'expiry':o.get('expiry'),'side':o['side'],'strike':o['strike'],
                'entry_ask':o['ask'],'entry_bid':o['bid'],'volume':o.get('volume'),'delta':o.get('delta'),'theta':o.get('theta'),
                'theta_available':o.get('theta_available'),'spread':o.get('spread'),'spread_pct':o.get('spread_pct'),
                'quote_freshness':o.get('quote_freshness'),'minimum_delay_minutes':o.get('minimum_delay_minutes'),
                'quote_timestamp':o.get('option_timestamp'),'source_timestamp':o.get('payload_timestamp') or o.get('option_timestamp'),
                'stock_price':x['price'],'trigger':x.get('trigger_price'),'state':x.get('execution_state'),
                'signal_inputs':{'direction':x.get('direction'),'move_5m':x.get('move_5m'),'volume_acceleration':x.get('volume_acceleration'),
                                 'catalyst':x.get('catalyst_level'),'quote_source':o.get('source'),
                                 'setup_qualified':x.get('setup_qualified'),
                                 'qualification_checks':deepcopy(x.get('qualification_checks')),
                                 'qualification_reasons':deepcopy(x.get('qualification_reasons')),
                                 'bar_end':x.get('bar_end'),
                                 'execution_readiness':x.get('execution_readiness'),
                                 'chase_risk':x.get('chase_risk'),'vwap':x.get('vwap'),
                                 'recent_move':x.get('recent_move'),'volume_ratio':x.get('volume_ratio'),
                                 'invalidation_price':x.get('invalidation_price'),
                                 'second_wave_event':x.get('second_wave_event'),
                                 'trend_context':deepcopy(x.get('trend_context'))},'markouts':{}})
            active.add(cid)
    events=events[-2000:]
    p.write_text(json.dumps(events,separators=(',',':'),allow_nan=False))
    data['option_feedback']={'observation_count':len(events),'today_count':sum(e['market_date']==today for e in events),
                            'recent':events[-10:],'interpretation':'Prospective quoted observations, not executed returns; fees excluded.'}
    return data
