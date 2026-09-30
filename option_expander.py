"""Enrich unattempted candidates, including a rolling revisit allocation."""
import json
from pathlib import Path
import scanner

MAX_OPTIONS=70

def main():
    path=Path('data/market.json');data=json.loads(path.read_text());rows=data['candidates']
    remaining=sorted([x for x in rows if not x.get('chain_attempted')],key=scanner.rank_key,reverse=True)
    budget=max(0,MAX_OPTIONS-sum(bool(x.get('chain_attempted')) for x in rows))
    top=remaining[:max(0,budget-10)]; tail=remaining[len(top):]
    offset=int(__import__('time').time()//300)%len(tail) if tail else 0
    rotation=(tail[offset:]+tail[:offset])[:budget-len(top)]
    extra=top+rotation;scanner.scan_options(extra)
    data['option_expansion']={'additional_attempted':len(extra),'rotating_revisits':len(rotation),'target':MAX_OPTIONS}
    scanner.coverage(data);path.write_text(json.dumps(data,separators=(',',':'),allow_nan=False))

if __name__=='__main__':main()
