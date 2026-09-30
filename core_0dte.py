"""Always attempt core ETFs without duplicating price/chain requests."""
import json
from pathlib import Path
import scanner
CORE_0DTE=scanner.CORE_TICKERS

def main():
    path=Path('data/market.json');data=json.loads(path.read_text());rows=data['candidates']
    core=[x for x in rows if x['ticker'] in CORE_0DTE]
    scanner.scan_options([x for x in core if not x.get('chain_attempted')])
    data['core_0dte_universe']=list(CORE_0DTE)
    data['core_0dte_scanned']=[x['ticker'] for x in core]
    data['core_missing']=sorted(set(CORE_0DTE)-set(data['core_0dte_scanned']))
    scanner.coverage(data);path.write_text(json.dumps(data,separators=(',',':'),allow_nan=False))

if __name__=='__main__':main()
