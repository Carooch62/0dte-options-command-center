"""Enrich unattempted candidates, including a rolling revisit allocation."""
import json
import os
from pathlib import Path
import scanner

MAX_OPTIONS=70

def select_candidates(rows, budget, offset=0):
    priority = set(os.getenv('OPTION_PRIORITY_TICKERS', 'DKNG,JD,SOFI').upper().replace(',', ' ').split())
    remaining=sorted([x for x in rows if not x.get('chain_attempted')],key=scanner.rank_key,reverse=True)
    pinned=[x for x in remaining if x.get('ticker') in priority][:budget]
    remaining=[x for x in remaining if x not in pinned]
    slots=max(0,budget-len(pinned))
    top=remaining[:max(0,slots-10)];tail=remaining[len(top):]
    offset=offset % len(tail) if tail else 0
    rotation=(tail[offset:]+tail[:offset])[:slots-len(top)]
    return pinned+top+rotation, len(pinned), len(rotation)

def main():
    path=Path('data/market.json');data=json.loads(path.read_text());rows=data['candidates']
    budget=max(0,MAX_OPTIONS-sum(bool(x.get('chain_attempted')) for x in rows))
    extra,pinned,rotation=select_candidates(rows,budget,int(__import__('time').time()//300))
    scanner.scan_options(extra)
    data['option_expansion']={'additional_attempted':len(extra),'priority_attempted':pinned,'rotating_revisits':rotation,'target':MAX_OPTIONS}
    scanner.coverage(data);path.write_text(json.dumps(data,separators=(',',':'),allow_nan=False))

if __name__=='__main__':main()
