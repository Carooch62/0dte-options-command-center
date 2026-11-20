"""Export original public scan evidence; never reconstruct entry clocks or fills."""
import argparse
import gzip
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))


def freeze(data_dir, days, tickers=('IWM','RIOT')):
    data=Path(data_dir);rows=[]
    for day in sorted(set(days)):
        datetime.strptime(day,'%Y-%m-%d')
        for path in sorted((data/'archive'/day/'scans').glob('*.json.gz')):
            raw=gzip.decompress(path.read_bytes());snapshot=json.loads(raw)
            for row in snapshot.get('candidate_state',snapshot.get('candidates',[])):
                if row.get('ticker') not in tickers:continue
                rows.append({'source_file':str(path.relative_to(data)), 'source_sha256':hashlib.sha256(raw).hexdigest(),
                             'scan_id':snapshot.get('scan_id'),'generated_at':snapshot.get('generated_at'),
                             'market_session':snapshot.get('market_session'),
                             'stock':{k:row[k] for k in ('ticker','price','bar_end','score','direction','execution_state','news_status') if k in row},
                             'contract_evidence_in_source':bool(row.get('contract_evidence')),
                             'entry_link_status':'UNLINKED_NO_VERIFIED_FILL_CLOCK'})
    return {'format':'retrospective-session-review-v1','assembled_at':datetime.now(timezone.utc).isoformat(),
            'sessions':sorted(set(days)),'tickers':list(tickers),'rows':rows,'ranking_effect':'NONE',
            'limitations':['Selected retrospectively after outcomes; not a prospective test.',
                           'Original scan and bar clocks retained. No broker fills, fees or entry times supplied.',
                           'Delayed or unclocked option observations cannot establish executable entry prices.',
                           'Missing evidence remains missing; no option return inferred from stock moves.']}

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('days',nargs='+');parser.add_argument('--data-dir',default='data');parser.add_argument('--output',required=True)
    args=parser.parse_args();result=freeze(args.data_dir,args.days)
    path=Path(args.output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(result,separators=(',',':'),allow_nan=False))
    print(json.dumps({'rows':len(result['rows']),'sessions':result['sessions'],'output':str(path)}))
