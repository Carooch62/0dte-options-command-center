"""Enrich unattempted candidates, including a rolling revisit allocation."""
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
import scanner
from execution_engine import comparable, crossing, load_previous
from quality import directional_momentum, freshness, number

MAX_OPTIONS=70

def triggered_tickers(data, previous, now):
    if data.get('market_session') != 'OPEN' or not comparable(data, previous):
        return set()
    prior = {x.get('ticker'): x for x in previous['candidates']}
    return {
        x['ticker'] for x in data['candidates']
        if freshness(x.get('bar_end'), now, max_age=8) == 'RECENT'
        and directional_momentum(x.get('direction'), number(x.get('move_5m')), number(x.get('recent_move')))
        and crossing(x, prior.get(x['ticker']))
    }


def select_candidates(rows, budget, offset=0, triggered=()):
    priority = set(os.getenv('OPTION_PRIORITY_TICKERS', 'DKNG,JD,SOFI').upper().replace(',', ' ').split())
    remaining=sorted([x for x in rows if not x.get('chain_attempted')],key=scanner.rank_key,reverse=True)
    crossed=[x for x in remaining if x['ticker'] in triggered][:budget]
    remaining=[x for x in remaining if x not in crossed]
    pinned=[x for x in remaining if x.get('ticker') in priority][:budget-len(crossed)]
    remaining=[x for x in remaining if x not in pinned]
    slots=max(0,budget-len(crossed)-len(pinned))
    top=remaining[:max(0,slots-10)];tail=remaining[len(top):]
    offset=offset % len(tail) if tail else 0
    rotation=(tail[offset:]+tail[:offset])[:slots-len(top)]
    return crossed+pinned+top+rotation, len(pinned), len(rotation)

def main():
    path=Path('data/market.json');data=json.loads(path.read_text());rows=data['candidates']
    budget=max(0,MAX_OPTIONS-sum(bool(x.get('chain_attempted')) for x in rows))
    triggered=triggered_tickers(data,load_previous(Path('data/scan-history.json')),datetime.now(timezone.utc))
    extra,pinned,rotation=select_candidates(rows,budget,int(time.time()//300),triggered)
    selected={x['ticker'] for x in extra}
    # Core ETFs were previously fetched in the next subprocess. Queue them first
    # in this same bounded pool, keeping the exact expansion cohort and budget.
    core_extra=[x for x in rows if x['ticker'] in scanner.CORE_TICKERS and not x.get('chain_attempted') and x['ticker'] not in selected]
    scanner.scan_options(core_extra+extra)
    data['option_expansion']={'additional_attempted':len(extra),'core_prefetch_attempted':len(core_extra),'trigger_attempted':sum(x['ticker'] in triggered for x in core_extra+extra),'priority_attempted':pinned,'rotating_revisits':rotation,'target':MAX_OPTIONS}
    scanner.coverage(data);path.write_text(json.dumps(data,separators=(',',':'),allow_nan=False))

if __name__=='__main__':main()
